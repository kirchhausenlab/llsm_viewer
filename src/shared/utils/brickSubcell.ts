export type BrickSubcellGrid = {
  x: number;
  y: number;
  z: number;
};

export type BrickSubcellChunkBuildResult = {
  data: Uint8Array;
  subcellGrid: BrickSubcellGrid;
};

export const BRICK_SUBCELL_MAX_AXIS = 4;

export function resolveBrickSubcellAxisCount(chunkAxis: number): number {
  if (!Number.isFinite(chunkAxis) || chunkAxis <= 1) {
    return 1;
  }
  return Math.min(BRICK_SUBCELL_MAX_AXIS, Math.max(1, Math.floor(chunkAxis)));
}

export function resolveBrickSubcellGrid(chunkShape: [number, number, number]): BrickSubcellGrid | null {
  const subcellGrid = {
    x: resolveBrickSubcellAxisCount(chunkShape[2]),
    y: resolveBrickSubcellAxisCount(chunkShape[1]),
    z: resolveBrickSubcellAxisCount(chunkShape[0]),
  };
  if (subcellGrid.x <= 1 && subcellGrid.y <= 1 && subcellGrid.z <= 1) {
    return null;
  }
  return subcellGrid;
}

export function buildBrickSubcellTextureSize({
  gridShape,
  subcellGrid,
}: {
  gridShape: [number, number, number];
  subcellGrid: BrickSubcellGrid;
}): { width: number; height: number; depth: number } {
  const gridX = Math.max(1, Math.floor(gridShape[2] ?? 1));
  const gridY = Math.max(1, Math.floor(gridShape[1] ?? 1));
  const gridZ = Math.max(1, Math.floor(gridShape[0] ?? 1));
  return {
    width: gridX * subcellGrid.x,
    height: gridY * subcellGrid.y,
    depth: gridZ * subcellGrid.z,
  };
}

export function buildBrickSubcellChunkData({
  chunkShape,
  components,
  readVoxelComponent,
}: {
  chunkShape: [number, number, number];
  components: number;
  readVoxelComponent: (
    localZ: number,
    localY: number,
    localX: number,
    component: number,
  ) => number;
}): BrickSubcellChunkBuildResult | null {
  if (components <= 0) {
    return null;
  }

  const chunkDepth = Math.max(1, Math.floor(chunkShape[0] ?? 1));
  const chunkHeight = Math.max(1, Math.floor(chunkShape[1] ?? 1));
  const chunkWidth = Math.max(1, Math.floor(chunkShape[2] ?? 1));
  const subcellGrid = resolveBrickSubcellGrid([chunkDepth, chunkHeight, chunkWidth]);
  if (!subcellGrid) {
    return null;
  }

  const xToSubcell = new Int16Array(chunkWidth);
  const yToSubcell = new Int16Array(chunkHeight);
  const zToSubcell = new Int16Array(chunkDepth);
  for (let localX = 0; localX < chunkWidth; localX += 1) {
    xToSubcell[localX] = Math.min(
      subcellGrid.x - 1,
      Math.floor((localX * subcellGrid.x) / chunkWidth),
    );
  }
  for (let localY = 0; localY < chunkHeight; localY += 1) {
    yToSubcell[localY] = Math.min(
      subcellGrid.y - 1,
      Math.floor((localY * subcellGrid.y) / chunkHeight),
    );
  }
  for (let localZ = 0; localZ < chunkDepth; localZ += 1) {
    zToSubcell[localZ] = Math.min(
      subcellGrid.z - 1,
      Math.floor((localZ * subcellGrid.z) / chunkDepth),
    );
  }

  const subcellCount = subcellGrid.x * subcellGrid.y * subcellGrid.z;
  const subcellMin = new Uint8Array(subcellCount);
  const subcellMax = new Uint8Array(subcellCount);
  const subcellOccupancy = new Uint8Array(subcellCount);
  const subcellSeen = new Uint8Array(subcellCount);
  const data = new Uint8Array(subcellCount * 4);

  subcellMin.fill(255);

  for (let localZ = 0; localZ < chunkDepth; localZ += 1) {
    const subcellZ = zToSubcell[localZ] ?? 0;
    for (let localY = 0; localY < chunkHeight; localY += 1) {
      const subcellY = yToSubcell[localY] ?? 0;
      for (let localX = 0; localX < chunkWidth; localX += 1) {
        const subcellX = xToSubcell[localX] ?? 0;
        const subcellIndex = (subcellZ * subcellGrid.y + subcellY) * subcellGrid.x + subcellX;
        let voxelMin = 255;
        let voxelMax = 0;
        let voxelOccupied = false;
        for (let component = 0; component < components; component += 1) {
          const rawValue = readVoxelComponent(localZ, localY, localX, component);
          const value = rawValue < 0 ? 0 : rawValue > 255 ? 255 : rawValue;
          if (value < voxelMin) {
            voxelMin = value;
          }
          if (value > voxelMax) {
            voxelMax = value;
          }
          if (!voxelOccupied && value > 0) {
            voxelOccupied = true;
          }
        }
        if ((subcellSeen[subcellIndex] ?? 0) === 0) {
          subcellMin[subcellIndex] = voxelMin;
          subcellMax[subcellIndex] = voxelMax;
          subcellSeen[subcellIndex] = 1;
        } else {
          if (voxelMin < (subcellMin[subcellIndex] ?? 255)) {
            subcellMin[subcellIndex] = voxelMin;
          }
          if (voxelMax > (subcellMax[subcellIndex] ?? 0)) {
            subcellMax[subcellIndex] = voxelMax;
          }
        }
        if (voxelOccupied) {
          subcellOccupancy[subcellIndex] = 255;
        }
      }
    }
  }

  for (let subcellIndex = 0; subcellIndex < subcellCount; subcellIndex += 1) {
    const targetIndex = subcellIndex * 4;
    if ((subcellSeen[subcellIndex] ?? 0) <= 0) {
      data[targetIndex + 3] = 255;
      continue;
    }
    data[targetIndex] = subcellOccupancy[subcellIndex] ?? 0;
    data[targetIndex + 1] = subcellMin[subcellIndex] ?? 0;
    data[targetIndex + 2] = subcellMax[subcellIndex] ?? 0;
    data[targetIndex + 3] = 255;
  }

  return {
    data,
    subcellGrid,
  };
}

export function writeBrickSubcellChunkData({
  targetData,
  targetSize,
  brickCoords,
  chunkData,
  subcellGrid,
}: {
  targetData: Uint8Array;
  targetSize: { width: number; height: number; depth: number };
  brickCoords: { x: number; y: number; z: number };
  chunkData: Uint8Array;
  subcellGrid: BrickSubcellGrid;
}): void {
  const { width, height } = targetSize;
  for (let subcellZ = 0; subcellZ < subcellGrid.z; subcellZ += 1) {
    for (let subcellY = 0; subcellY < subcellGrid.y; subcellY += 1) {
      for (let subcellX = 0; subcellX < subcellGrid.x; subcellX += 1) {
        const sourceIndex = ((subcellZ * subcellGrid.y + subcellY) * subcellGrid.x + subcellX) * 4;
        const targetIndex =
          ((((brickCoords.z * subcellGrid.z + subcellZ) * height) +
            (brickCoords.y * subcellGrid.y + subcellY)) * width +
            (brickCoords.x * subcellGrid.x + subcellX)) * 4;
        targetData[targetIndex] = chunkData[sourceIndex] ?? 0;
        targetData[targetIndex + 1] = chunkData[sourceIndex + 1] ?? 0;
        targetData[targetIndex + 2] = chunkData[sourceIndex + 2] ?? 0;
        targetData[targetIndex + 3] = chunkData[sourceIndex + 3] ?? 0;
      }
    }
  }
}
