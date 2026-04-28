import type { VolumeBrickPageTable } from '../../../core/volumeProvider';
import {
  resolvePackedBrickSlotGridLayout,
  type PackedBrickSlotGridLayout,
} from '../../../shared/utils/sparseSegmentationAtlasLayout';

export type SparseSegmentationRenderStrategy =
  | {
      kind: 'full-resident-packed';
      slotGrid: { x: number; y: number; z: number };
      atlasSize: { width: number; height: number; depth: number };
      allocatedSlots: number;
      occupiedSlots: number;
      atlasBytes: number;
    }
  | {
      kind: 'exact-batched';
      reason: 'texture-limit' | 'memory-budget' | 'page-table-limit' | 'allocation-limit';
      batchSlotGrid: { x: number; y: number; z: number };
      batchAtlasSize: { width: number; height: number; depth: number };
      batchSlotCapacity: number;
      batchCount: number;
      estimatedBytesPerBatch: number;
    };

export type SparseSegmentationRenderBudget = {
  max3DTextureSize: number;
  maxTextureSize: number;
  maxAtlasBytes: number;
  maxSingleAllocationBytes: number;
  safetyMarginBytes: number;
};

export type SparseSegmentationRenderPlanInput = {
  pageTable: Pick<VolumeBrickPageTable, 'gridShape' | 'chunkShape' | 'occupiedBrickCount'>;
  labelBytesPerVoxel?: number;
  budget: SparseSegmentationRenderBudget;
};

function normalizeLimit(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 1;
  }
  return Math.max(1, Math.floor(value));
}

function computeAtlasBytes(layout: PackedBrickSlotGridLayout, bytesPerBrick: number): number {
  return layout.allocatedSlotCapacity * bytesPerBrick;
}

function fitsPageTableTexture({
  pageTable,
  maxTextureSize,
}: {
  pageTable: Pick<VolumeBrickPageTable, 'gridShape'>;
  maxTextureSize: number;
}): boolean {
  const [gridZ, gridY, gridX] = pageTable.gridShape;
  const totalBricks = Math.max(0, gridZ * gridY * gridX);
  const width = Math.max(1, Math.min(maxTextureSize, 4096));
  const height = Math.max(1, Math.ceil(totalBricks / width));
  return height <= maxTextureSize;
}

function resolveBatchLayout({
  occupiedSlots,
  brickWidth,
  brickHeight,
  brickDepth,
  bytesPerBrick,
  budgetBytes,
  max3DTextureSize,
}: {
  occupiedSlots: number;
  brickWidth: number;
  brickHeight: number;
  brickDepth: number;
  bytesPerBrick: number;
  budgetBytes: number;
  max3DTextureSize: number;
}): PackedBrickSlotGridLayout | null {
  const maxBudgetSlots = Math.max(1, Math.floor(budgetBytes / Math.max(1, bytesPerBrick)));
  let candidateSlots = Math.max(1, Math.min(occupiedSlots, maxBudgetSlots));
  while (candidateSlots > 0) {
    const layout = resolvePackedBrickSlotGridLayout({
      slotCount: candidateSlots,
      brickWidth,
      brickHeight,
      brickDepth,
      max3DTextureSize,
    });
    if (layout && computeAtlasBytes(layout, bytesPerBrick) <= budgetBytes) {
      return layout;
    }
    candidateSlots -= 1;
  }
  return null;
}

export function planSparseSegmentationRender({
  pageTable,
  labelBytesPerVoxel = 4,
  budget,
}: SparseSegmentationRenderPlanInput): SparseSegmentationRenderStrategy {
  const max3DTextureSize = normalizeLimit(budget.max3DTextureSize);
  const maxTextureSize = normalizeLimit(budget.maxTextureSize);
  const maxAtlasBytes = normalizeLimit(budget.maxAtlasBytes);
  const maxSingleAllocationBytes = normalizeLimit(budget.maxSingleAllocationBytes);
  const safetyMarginBytes = Math.max(0, Math.floor(Number.isFinite(budget.safetyMarginBytes) ? budget.safetyMarginBytes : 0));
  const [brickDepth, brickHeight, brickWidth] = pageTable.chunkShape;
  const safeBrickDepth = normalizeLimit(brickDepth);
  const safeBrickHeight = normalizeLimit(brickHeight);
  const safeBrickWidth = normalizeLimit(brickWidth);
  const occupiedSlots = Math.max(0, Math.floor(pageTable.occupiedBrickCount));
  const bytesPerVoxel = normalizeLimit(labelBytesPerVoxel);
  const bytesPerBrick = safeBrickDepth * safeBrickHeight * safeBrickWidth * bytesPerVoxel;
  const effectiveAtlasBudget = Math.max(1, maxAtlasBytes - safetyMarginBytes);
  const effectiveSingleAllocationBudget = Math.max(1, maxSingleAllocationBytes - safetyMarginBytes);
  const effectiveBatchBudget = Math.max(1, Math.min(effectiveAtlasBudget, effectiveSingleAllocationBudget));

  const batchFallback = (
    reason: Extract<SparseSegmentationRenderStrategy, { kind: 'exact-batched' }>['reason']
  ): SparseSegmentationRenderStrategy => {
    const batchLayout = resolveBatchLayout({
      occupiedSlots: Math.max(1, occupiedSlots),
      brickWidth: safeBrickWidth,
      brickHeight: safeBrickHeight,
      brickDepth: safeBrickDepth,
      bytesPerBrick,
      budgetBytes: effectiveBatchBudget,
      max3DTextureSize,
    });
    if (!batchLayout) {
      throw new Error(
        `Sparse segmentation cannot fit even one brick in the configured WebGL2 batch budget (${effectiveBatchBudget} bytes).`
      );
    }
    const batchSlotCapacity = Math.max(1, Math.min(occupiedSlots || 1, batchLayout.allocatedSlotCapacity));
    return {
      kind: 'exact-batched',
      reason,
      batchSlotGrid: batchLayout.slotGrid,
      batchAtlasSize: batchLayout.atlasSize,
      batchSlotCapacity,
      batchCount: occupiedSlots > 0 ? Math.ceil(occupiedSlots / batchSlotCapacity) : 0,
      estimatedBytesPerBatch: computeAtlasBytes(batchLayout, bytesPerBrick),
    };
  };

  if (!fitsPageTableTexture({ pageTable, maxTextureSize })) {
    return batchFallback('page-table-limit');
  }

  const fullLayout = resolvePackedBrickSlotGridLayout({
    slotCount: Math.max(1, occupiedSlots),
    brickWidth: safeBrickWidth,
    brickHeight: safeBrickHeight,
    brickDepth: safeBrickDepth,
    max3DTextureSize,
  });
  if (!fullLayout) {
    return batchFallback('texture-limit');
  }

  const atlasBytes = occupiedSlots > 0 ? computeAtlasBytes(fullLayout, bytesPerBrick) : bytesPerBrick;
  if (atlasBytes > effectiveSingleAllocationBudget) {
    return batchFallback('allocation-limit');
  }
  if (atlasBytes > effectiveAtlasBudget) {
    return batchFallback('memory-budget');
  }

  return {
    kind: 'full-resident-packed',
    slotGrid: fullLayout.slotGrid,
    atlasSize: fullLayout.atlasSize,
    allocatedSlots: fullLayout.allocatedSlotCapacity,
    occupiedSlots,
    atlasBytes,
  };
}
