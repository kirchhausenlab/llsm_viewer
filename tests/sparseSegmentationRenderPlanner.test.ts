import assert from 'node:assert/strict';
import { test } from 'node:test';

import { planSparseSegmentationRender } from '../src/components/viewers/volume-viewer/sparseSegmentationRenderPlanner.ts';
import { resolvePackedBrickSlotGridLayout } from '../src/shared/utils/sparseSegmentationAtlasLayout.ts';
import type { VolumeBrickPageTable } from '../src/core/volumeProvider.ts';

const createPageTable = ({
  occupiedBrickCount,
  gridShape = [9, 9, 10],
  chunkShape = [32, 32, 32],
}: {
  occupiedBrickCount: number;
  gridShape?: [number, number, number];
  chunkShape?: [number, number, number];
}): Pick<VolumeBrickPageTable, 'gridShape' | 'chunkShape' | 'occupiedBrickCount'> => ({
  gridShape,
  chunkShape,
  occupiedBrickCount,
});

const defaultBudget = {
  max3DTextureSize: 16_384,
  maxTextureSize: 16_384,
  maxAtlasBytes: 512 * 1024 * 1024,
  maxSingleAllocationBytes: 512 * 1024 * 1024,
  safetyMarginBytes: 0,
};

test('packed sparse segmentation layout fixes the ap2_iso scale-0 texture shape', () => {
  const layout = resolvePackedBrickSlotGridLayout({
    slotCount: 765,
    brickWidth: 32,
    brickHeight: 32,
    brickDepth: 32,
    max3DTextureSize: 16_384,
  });
  assert.ok(layout);
  assert.ok(layout.allocatedSlotCapacity >= 765);
  assert.ok(layout.atlasSize.width <= 16_384);
  assert.ok(layout.atlasSize.height <= 16_384);
  assert.ok(layout.atlasSize.depth <= 16_384);
  assert.notDeepEqual(layout.atlasSize, { width: 32, height: 32, depth: 24_480 });
  assert.ok(layout.slotGrid.x > 1 || layout.slotGrid.y > 1);
});

test('sparse segmentation planner selects full-resident-packed when the packed atlas fits', () => {
  const plan = planSparseSegmentationRender({
    pageTable: createPageTable({ occupiedBrickCount: 765 }),
    budget: defaultBudget,
  });
  assert.equal(plan.kind, 'full-resident-packed');
  if (plan.kind !== 'full-resident-packed') {
    return;
  }
  assert.equal(plan.occupiedSlots, 765);
  assert.ok(plan.allocatedSlots >= 765);
  assert.ok(plan.atlasSize.depth < 24_480);
  assert.ok(plan.slotGrid.x > 1 || plan.slotGrid.y > 1);
});

test('sparse segmentation planner falls back to exact batches for texture limits and memory budgets', () => {
  const texturePlan = planSparseSegmentationRender({
    pageTable: createPageTable({ occupiedBrickCount: 765 }),
    budget: {
      ...defaultBudget,
      max3DTextureSize: 128,
    },
  });
  assert.equal(texturePlan.kind, 'exact-batched');
  if (texturePlan.kind === 'exact-batched') {
    assert.equal(texturePlan.reason, 'texture-limit');
    assert.ok(texturePlan.batchCount > 1);
    assert.ok(texturePlan.batchAtlasSize.width <= 128);
    assert.ok(texturePlan.batchAtlasSize.height <= 128);
    assert.ok(texturePlan.batchAtlasSize.depth <= 128);
  }

  const memoryPlan = planSparseSegmentationRender({
    pageTable: createPageTable({ occupiedBrickCount: 765 }),
    budget: {
      ...defaultBudget,
      maxAtlasBytes: 8 * 1024 * 1024,
      maxSingleAllocationBytes: 8 * 1024 * 1024,
    },
  });
  assert.equal(memoryPlan.kind, 'exact-batched');
  if (memoryPlan.kind === 'exact-batched') {
    assert.equal(memoryPlan.reason, 'allocation-limit');
    assert.ok(memoryPlan.batchCount > 1);
    assert.ok(memoryPlan.estimatedBytesPerBatch <= 8 * 1024 * 1024);
  }
});

test('packed sparse segmentation layout is deterministic and avoids prime-count line atlases', () => {
  const left = resolvePackedBrickSlotGridLayout({
    slotCount: 127,
    brickWidth: 8,
    brickHeight: 8,
    brickDepth: 8,
    max3DTextureSize: 128,
  });
  const right = resolvePackedBrickSlotGridLayout({
    slotCount: 127,
    brickWidth: 8,
    brickHeight: 8,
    brickDepth: 8,
    max3DTextureSize: 128,
  });
  assert.deepEqual(left, right);
  assert.ok(left);
  assert.ok(left.allocatedSlotCapacity >= 127);
  assert.ok(left.slotGrid.x > 1);
  assert.ok(left.slotGrid.y > 1);
  assert.ok(left.slotGrid.z > 1);
  assert.ok(left.atlasSize.depth < 127 * 8);
});
