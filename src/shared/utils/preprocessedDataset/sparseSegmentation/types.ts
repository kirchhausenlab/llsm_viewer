export type SparseSegmentationBrickCodec =
  | 'coord-list-v1'
  | 'x-run-v1'
  | 'bitmask-labels-v1'
  | 'dense-local-v1';

export type SparseSegmentationBrickCoord = {
  z: number;
  y: number;
  x: number;
};

export type SparseSegmentationVoxelCoord = {
  z: number;
  y: number;
  x: number;
};

export type SparseSegmentationBrickSize = [number, number, number];

export type SparseSegmentationBrickDirectoryRecord = {
  timepoint: number;
  scaleLevel: number;
  brickCoord: SparseSegmentationBrickCoord;
  localBounds: {
    min: SparseSegmentationVoxelCoord;
    max: SparseSegmentationVoxelCoord;
  };
  nonzeroVoxelCount: number;
  labelMin: number;
  labelMax: number;
  codec: SparseSegmentationBrickCodec;
  shardId: number;
  payloadByteLength: number;
  payloadByteOffset: number;
  decodedVoxelCount: number;
  payloadCrc32: number;
};

export type SparseSegmentationBrickDirectory = {
  scaleLevel: number;
  timepointCount: number;
  brickGridShape: SparseSegmentationBrickSize;
  brickSize: SparseSegmentationBrickSize;
  records: SparseSegmentationBrickDirectoryRecord[];
  lookup(
    timepoint: number,
    brickCoord: SparseSegmentationBrickCoord
  ): SparseSegmentationBrickDirectoryRecord | null;
  recordsForTimepoint(timepoint: number): SparseSegmentationBrickDirectoryRecord[];
  recordsIntersectingSlice(
    timepoint: number,
    axis: 'x' | 'y' | 'z',
    index: number
  ): SparseSegmentationBrickDirectoryRecord[];
};

export type SparseSegmentationLabelMetadata = {
  labelId: number;
  voxelCount: number;
  bounds: {
    min: SparseSegmentationVoxelCoord;
    max: SparseSegmentationVoxelCoord;
  };
  sums: SparseSegmentationVoxelCoord;
  centroid: { z: number; y: number; x: number };
  firstTimepoint: number;
  lastTimepoint: number;
};

export type SparseSegmentationOccupancyHierarchyLevel = {
  level: number;
  gridShape: SparseSegmentationBrickSize;
  data: Uint8Array;
  occupiedNodeCount: number;
};

export type SparseSegmentationOccupancyHierarchy = {
  levels: SparseSegmentationOccupancyHierarchyLevel[];
};

export type DecodedSparseSegmentationBrick = {
  kind: 'decoded-sparse-segmentation-brick';
  layerKey: string;
  timepoint: number;
  scaleLevel: number;
  brickCoord: SparseSegmentationBrickCoord;
  brickSize: SparseSegmentationBrickSize;
  codec: SparseSegmentationBrickCodec;
  nonzeroVoxelCount: number;
  localBounds: {
    min: SparseSegmentationVoxelCoord;
    max: SparseSegmentationVoxelCoord;
  };
  labelAtOffset(offset: number): number;
  forEachNonzero(callback: (offset: number, label: number) => void): void;
};

export type SparseSegmentationField = {
  kind: 'sparse-segmentation';
  layerKey: string;
  timepoint: number;
  scaleLevel: number;
  width: number;
  height: number;
  depth: number;
  brickSize: SparseSegmentationBrickSize;
  brickGridShape: SparseSegmentationBrickSize;
  occupiedBrickCount: number;
  nonzeroVoxelCount: number;
  colorSeed: number;
  labels: SparseSegmentationLabelMetadata[];
  directory: SparseSegmentationBrickDirectory;
  occupancyHierarchy: SparseSegmentationOccupancyHierarchy;
};

export type SparseSegmentationSliceRequest = {
  axis: 'x' | 'y' | 'z';
  index: number;
};

export type SparseSegmentationSlice = {
  kind: 'sparse-segmentation-slice';
  axis: 'x' | 'y' | 'z';
  index: number;
  width: number;
  height: number;
  rgba: Uint8Array;
};

export type SparseSegmentationGlobalVoxel = SparseSegmentationVoxelCoord & {
  label: number;
};

export type SparseSegmentationLocalVoxel = {
  offset: number;
  label: number;
};
