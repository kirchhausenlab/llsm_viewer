export type PackedBrickSlotGridLayout = {
  slotGrid: { x: number; y: number; z: number };
  atlasSize: { width: number; height: number; depth: number };
  allocatedSlotCapacity: number;
};

export type PackedBrickSlotGridLayoutInput = {
  slotCount: number;
  brickWidth: number;
  brickHeight: number;
  brickDepth: number;
  max3DTextureSize?: number | null;
  preferBalanced?: boolean;
};

type CandidateLayout = PackedBrickSlotGridLayout & {
  paddingSlots: number;
  maxAtlasDimension: number;
  aspectRatio: number;
  surfaceArea: number;
};

function normalizePositiveInteger(value: number): number | null {
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }
  return Math.max(1, Math.floor(value));
}

function normalizeTextureLimit(value: number | null | undefined): number | null {
  if (!Number.isFinite(value ?? Number.NaN) || (value ?? 0) <= 0) {
    return null;
  }
  return Math.max(1, Math.floor(value as number));
}

function compareCandidateLayouts(left: CandidateLayout, right: CandidateLayout): number {
  if (left.maxAtlasDimension !== right.maxAtlasDimension) {
    return left.maxAtlasDimension - right.maxAtlasDimension;
  }
  if (Math.abs(left.aspectRatio - right.aspectRatio) > 1e-9) {
    return left.aspectRatio - right.aspectRatio;
  }
  if (left.paddingSlots !== right.paddingSlots) {
    return left.paddingSlots - right.paddingSlots;
  }
  if (left.surfaceArea !== right.surfaceArea) {
    return left.surfaceArea - right.surfaceArea;
  }
  if (left.slotGrid.z !== right.slotGrid.z) {
    return left.slotGrid.z - right.slotGrid.z;
  }
  if (left.slotGrid.y !== right.slotGrid.y) {
    return left.slotGrid.y - right.slotGrid.y;
  }
  return left.slotGrid.x - right.slotGrid.x;
}

function buildCandidate({
  slotCount,
  brickWidth,
  brickHeight,
  brickDepth,
  slotGridX,
  slotGridY,
  slotGridZ,
}: {
  slotCount: number;
  brickWidth: number;
  brickHeight: number;
  brickDepth: number;
  slotGridX: number;
  slotGridY: number;
  slotGridZ: number;
}): CandidateLayout {
  const width = slotGridX * brickWidth;
  const height = slotGridY * brickHeight;
  const depth = slotGridZ * brickDepth;
  const allocatedSlotCapacity = slotGridX * slotGridY * slotGridZ;
  const maxAtlasDimension = Math.max(width, height, depth);
  const minAtlasDimension = Math.max(1, Math.min(width, height, depth));
  return {
    slotGrid: { x: slotGridX, y: slotGridY, z: slotGridZ },
    atlasSize: { width, height, depth },
    allocatedSlotCapacity,
    paddingSlots: allocatedSlotCapacity - slotCount,
    maxAtlasDimension,
    aspectRatio: maxAtlasDimension / minAtlasDimension,
    surfaceArea: width * height + width * depth + height * depth,
  };
}

export function resolvePackedBrickSlotGridLayout({
  slotCount,
  brickWidth,
  brickHeight,
  brickDepth,
  max3DTextureSize = null,
  preferBalanced = true,
}: PackedBrickSlotGridLayoutInput): PackedBrickSlotGridLayout | null {
  const safeSlotCount = normalizePositiveInteger(slotCount);
  const safeBrickWidth = normalizePositiveInteger(brickWidth);
  const safeBrickHeight = normalizePositiveInteger(brickHeight);
  const safeBrickDepth = normalizePositiveInteger(brickDepth);
  if (!safeSlotCount || !safeBrickWidth || !safeBrickHeight || !safeBrickDepth) {
    return null;
  }

  const safeMax3D = normalizeTextureLimit(max3DTextureSize);
  if (!preferBalanced && !safeMax3D) {
    return {
      slotGrid: { x: 1, y: 1, z: safeSlotCount },
      atlasSize: {
        width: safeBrickWidth,
        height: safeBrickHeight,
        depth: safeBrickDepth * safeSlotCount,
      },
      allocatedSlotCapacity: safeSlotCount,
    };
  }

  const maxSlotsX = safeMax3D ? Math.floor(safeMax3D / safeBrickWidth) : safeSlotCount;
  const maxSlotsY = safeMax3D ? Math.floor(safeMax3D / safeBrickHeight) : safeSlotCount;
  const maxSlotsZ = safeMax3D ? Math.floor(safeMax3D / safeBrickDepth) : safeSlotCount;
  if (maxSlotsX <= 0 || maxSlotsY <= 0 || maxSlotsZ <= 0) {
    return null;
  }
  if (maxSlotsX * maxSlotsY * maxSlotsZ < safeSlotCount) {
    return null;
  }

  let best: CandidateLayout | null = null;
  const maxZSearch = maxSlotsZ;
  for (let slotGridZ = 1; slotGridZ <= maxZSearch; slotGridZ += 1) {
    const requiredPlaneSlots = Math.ceil(safeSlotCount / slotGridZ);
    if (requiredPlaneSlots > maxSlotsX * maxSlotsY) {
      continue;
    }

    const balancedX = Math.sqrt(requiredPlaneSlots * (safeBrickHeight / safeBrickWidth));
    const xSeeds = new Set<number>();
    for (const seed of [
      Math.floor(balancedX) - 2,
      Math.floor(balancedX) - 1,
      Math.floor(balancedX),
      Math.ceil(balancedX),
      Math.ceil(balancedX) + 1,
      Math.ceil(balancedX) + 2,
      requiredPlaneSlots,
      maxSlotsX,
    ]) {
      if (Number.isFinite(seed)) {
        xSeeds.add(Math.max(1, Math.min(maxSlotsX, Math.floor(seed))));
      }
    }

    for (const slotGridX of xSeeds) {
      const slotGridY = Math.ceil(requiredPlaneSlots / slotGridX);
      if (slotGridY <= 0 || slotGridY > maxSlotsY) {
        continue;
      }
      const candidate = buildCandidate({
        slotCount: safeSlotCount,
        brickWidth: safeBrickWidth,
        brickHeight: safeBrickHeight,
        brickDepth: safeBrickDepth,
        slotGridX,
        slotGridY,
        slotGridZ,
      });
      if (
        safeMax3D &&
        (candidate.atlasSize.width > safeMax3D ||
          candidate.atlasSize.height > safeMax3D ||
          candidate.atlasSize.depth > safeMax3D)
      ) {
        continue;
      }
      if (!best || compareCandidateLayouts(candidate, best) < 0) {
        best = candidate;
      }
    }
  }

  if (!best) {
    return null;
  }
  return {
    slotGrid: best.slotGrid,
    atlasSize: best.atlasSize,
    allocatedSlotCapacity: best.allocatedSlotCapacity,
  };
}

export function resolvePackedBrickSlotCoordinates(
  slotIndex: number,
  slotGrid: { x: number; y: number; z?: number }
): { x: number; y: number; z: number } {
  const safeSlotIndex = Math.max(0, Math.floor(slotIndex));
  const safeSlotGridX = Math.max(1, Math.floor(slotGrid.x));
  const safeSlotGridY = Math.max(1, Math.floor(slotGrid.y));
  const slotsPerLayer = safeSlotGridX * safeSlotGridY;
  const z = Math.floor(safeSlotIndex / slotsPerLayer);
  const withinLayer = safeSlotIndex - z * slotsPerLayer;
  const y = Math.floor(withinLayer / safeSlotGridX);
  const x = withinLayer - y * safeSlotGridX;
  return { x, y, z };
}
