import type { VolumeDataType } from '../../../types/volume';
import type {
  AnisotropyScaleFactors,
  TemporalResolutionMetadata,
  VoxelResolutionValues
} from '../../../types/voxelResolution';
import type { CompiledTrackSet, CompiledTrackSetHeader } from '../../../types/tracks';

export const PREPROCESSED_DATASET_FORMAT = 'llsm-viewer-preprocessed-isotropic-v1' as const;
export const SPARSE_SEGMENTATION_PREPROCESSED_DATASET_FORMAT =
  'llsm-viewer-preprocessed-isotropic-sparse-v1' as const;
export type PreprocessedDatasetFormat =
  | typeof PREPROCESSED_DATASET_FORMAT
  | typeof SPARSE_SEGMENTATION_PREPROCESSED_DATASET_FORMAT;
export type StoredIntensityDataType = 'uint8' | 'uint16';

export type IsotropicResamplingMetadata = {
  enabled: boolean;
  scale: AnisotropyScaleFactors;
  intensityInterpolation: 'linear';
  segmentationInterpolation: 'nearest';
};

export type TrackSetExportMetadata = {
  id: string;
  name: string;
  fileName: string;
  boundChannelId: string | null;
  compiled: CompiledTrackSet;
};

export type ChannelExportMetadata = {
  id: string;
  name: string;
};

export type PreprocessedMovieMode = '3d';

export type NormalizationMetadata = {
  min: number;
  max: number;
};

export type ZarrArrayDescriptor = {
  path: string;
  shape: number[];
  chunkShape: number[];
  dataType: VolumeDataType;
  sharding?: ZarrArrayShardingPlan | null;
};

export type ZarrArrayShardingPlanArrayKind =
  | 'volumeData'
  | 'skipHierarchy'
  | 'histogram'
  | 'subcell'
  | 'backgroundMask'
  | 'playbackAtlasIndices'
  | 'playbackAtlasData';

export type ZarrArrayShardingPlan = {
  enabled: boolean;
  targetShardBytes: number;
  shardShape: number[];
  estimatedShardBytes: number;
  arrayKind?: ZarrArrayShardingPlanArrayKind;
  allowTemporalAxis?: boolean;
  fullReadFallbackMaxBytes?: number;
  reason?: string;
};

export type PreprocessedScaleSkipHierarchyLevelZarrDescriptor = {
  level: number;
  gridShape: [number, number, number];
  occupancy: ZarrArrayDescriptor;
  min: ZarrArrayDescriptor;
  max: ZarrArrayDescriptor;
};

export type PreprocessedScaleSkipHierarchyZarrDescriptor = {
  levels: PreprocessedScaleSkipHierarchyLevelZarrDescriptor[];
};

export type PreprocessedScaleSubcellZarrDescriptor = {
  gridShape: [number, number, number];
  data: ZarrArrayDescriptor;
};

export type PreprocessedBrickAtlasTextureFormat = 'red' | 'rg' | 'rgba';

export type PreprocessedShardedBlobDescriptor = {
  path: string;
  entryCount: number;
  sharding?: ZarrArrayShardingPlan | null;
};

export type PreprocessedScalePlaybackAtlasZarrDescriptor = {
  textureFormat: PreprocessedBrickAtlasTextureFormat;
  textureChannels: number;
  dataType: 'uint8' | 'uint16';
  brickAtlasIndices: ZarrArrayDescriptor;
  data: PreprocessedShardedBlobDescriptor;
};

export type PreprocessedLayerScaleManifestEntry = {
  level: number;
  downsampleFactor: [number, number, number];
  width: number;
  height: number;
  depth: number;
  channels: number;
  zarr: {
    data: ZarrArrayDescriptor;
    skipHierarchy: PreprocessedScaleSkipHierarchyZarrDescriptor;
    subcell?: PreprocessedScaleSubcellZarrDescriptor;
    playbackAtlas?: PreprocessedScalePlaybackAtlasZarrDescriptor;
    histogram?: ZarrArrayDescriptor;
  };
};

export type PreprocessedBackgroundMaskScaleManifestEntry = {
  level: number;
  downsampleFactor: [number, number, number];
  width: number;
  height: number;
  depth: number;
  zarr: {
    data: ZarrArrayDescriptor;
  };
};

export type PreprocessedBackgroundMaskManifest = {
  sourceLayerKey: string;
  sourceDataType: VolumeDataType;
  values: number[];
  zarr: {
    scales: PreprocessedBackgroundMaskScaleManifestEntry[];
  };
};

export type SparseSegmentationRepresentation = 'sparse-label-bricks-v1';
export type SparseSegmentationLabelDataType = 'uint32';
export type SparseSegmentationBrickCodec =
  | 'coord-list-v1'
  | 'x-run-v1'
  | 'bitmask-labels-v1'
  | 'dense-local-v1';

export type SparseSegmentationBinaryDescriptor = {
  path: string;
  byteLength: number;
  checksum?: {
    algorithm: 'crc32';
    value: number;
  } | null;
};

export type SparseSegmentationBrickDirectoryDescriptor = SparseSegmentationBinaryDescriptor & {
  format: 'sparse-brick-directory-v1';
  recordCount: number;
  recordByteLength: 80;
};

export type SparseSegmentationPayloadShardSetDescriptor = {
  format: 'sparse-brick-payload-shards-v1';
  shardCount: number;
  shardPathPrefix: string;
  shardFileExtension: '.ssbp';
  targetShardBytes: number;
  totalPayloadBytes: number;
};

export type SparseSegmentationOccupancyHierarchyLevelDescriptor = SparseSegmentationBinaryDescriptor & {
  level: number;
  gridShape: [number, number, number];
  dataType: 'uint8';
  occupiedNodeCount: number;
};

export type SparseSegmentationOccupancyHierarchyDescriptor = {
  format: 'sparse-occupancy-hierarchy-v1';
  levels: SparseSegmentationOccupancyHierarchyLevelDescriptor[];
};

export type SparseSegmentationLabelMetadataDescriptor = SparseSegmentationBinaryDescriptor & {
  format: 'sparse-label-metadata-v1';
  recordCount: number;
  recordByteLength: 96;
};

export type SparseSegmentationScaleManifestEntry = {
  level: number;
  downsampleFactor: [number, number, number];
  width: number;
  height: number;
  depth: number;
  brickSize: [number, number, number];
  brickGridShape: [number, number, number];
  occupiedBrickCount: number;
  nonzeroVoxelCount: number;
  directory: SparseSegmentationBrickDirectoryDescriptor;
  payload: SparseSegmentationPayloadShardSetDescriptor;
  occupancyHierarchy: SparseSegmentationOccupancyHierarchyDescriptor;
};

export type PreprocessedAnyLayerScaleManifestEntry =
  | PreprocessedLayerScaleManifestEntry
  | SparseSegmentationScaleManifestEntry;

export type SparseSegmentationManifest = {
  version: 1;
  labels: SparseSegmentationLabelMetadataDescriptor;
  scales: SparseSegmentationScaleManifestEntry[];
};

export type EditableSegmentationMetadata = {
  version: 1;
  labelNames: string[];
};

export type PreprocessedLayerKind = 'intensity' | 'segmentation';

export type PreprocessedIntensityLayerManifestEntry = {
  kind?: 'intensity';
  key: string;
  label: string;
  channelId: string;
  isSegmentation: false;
  isBinaryLike?: boolean;
  volumeCount: number;
  width: number;
  height: number;
  depth: number;
  channels: number;
  dataType: VolumeDataType;
  storedDataType?: StoredIntensityDataType;
  normalization: NormalizationMetadata | null;
  zarr: {
    scales: PreprocessedLayerScaleManifestEntry[];
  };
};

export type PreprocessedSparseSegmentationLayerManifestEntry = {
  kind: 'segmentation';
  key: string;
  label: string;
  channelId: string;
  isSegmentation: true;
  volumeCount: number;
  width: number;
  height: number;
  depth: number;
  channels: 1;
  dataType: 'uint32';
  labelDataType: SparseSegmentationLabelDataType;
  emptyLabel: 0;
  normalization: null;
  representation: SparseSegmentationRepresentation;
  brickSize: [number, number, number];
  colorSeed: number;
  sparse: SparseSegmentationManifest;
  editableSegmentation?: EditableSegmentationMetadata;
  storedDataType?: never;
  isBinaryLike?: never;
  zarr?: never;
};

export type PreprocessedLayerManifestEntry =
  | PreprocessedIntensityLayerManifestEntry
  | PreprocessedSparseSegmentationLayerManifestEntry;

export function isSparseSegmentationLayerManifest(
  layer: PreprocessedLayerManifestEntry
): layer is PreprocessedSparseSegmentationLayerManifestEntry {
  const candidate = layer as { kind?: PreprocessedLayerKind; isSegmentation?: boolean };
  return candidate.kind === 'segmentation' || candidate.isSegmentation === true;
}

export function isIntensityLayerManifest(
  layer: PreprocessedLayerManifestEntry
): layer is PreprocessedIntensityLayerManifestEntry {
  return !isSparseSegmentationLayerManifest(layer);
}

export type PreprocessedChannelManifest = {
  id: string;
  name: string;
  layers: PreprocessedLayerManifestEntry[];
};

export type PreprocessedTrackCatalogDescriptor = {
  path: string;
  format: 'binary';
  version: 1;
  strideBytes: 52;
  count: number;
};

export type PreprocessedTrackBinaryDescriptor = {
  path: string;
  format: 'float32' | 'uint32';
  stride: number;
  count: number;
};

export type PreprocessedTracksDescriptor = {
  format: 'compiled-v3';
  header: CompiledTrackSetHeader;
  catalog: PreprocessedTrackCatalogDescriptor;
  pointData: PreprocessedTrackBinaryDescriptor;
  segmentPositions: PreprocessedTrackBinaryDescriptor;
  segmentTimes: PreprocessedTrackBinaryDescriptor;
  segmentTrackIndices: PreprocessedTrackBinaryDescriptor;
  centroidData: PreprocessedTrackBinaryDescriptor;
};

export type PreprocessedTrackSetManifestEntry = {
  id: string;
  name: string;
  fileName: string;
  boundChannelId: string | null;
  tracks: PreprocessedTracksDescriptor;
};

export type PreprocessedManifest = {
  format: PreprocessedDatasetFormat;
  generatedAt: string;
  dataset: {
    movieMode: PreprocessedMovieMode;
    totalVolumeCount: number;
    channels: PreprocessedChannelManifest[];
    trackSets: PreprocessedTrackSetManifestEntry[];
    sourceVoxelResolution: VoxelResolutionValues;
    storedVoxelResolution: VoxelResolutionValues;
    voxelResolution: VoxelResolutionValues;
    temporalResolution: TemporalResolutionMetadata;
    isotropicResampling: IsotropicResamplingMetadata;
    backgroundMask?: PreprocessedBackgroundMaskManifest | null;
  };
};

export type PreprocessedLayerSummary = {
  key: string;
  label: string;
  isSegmentation: boolean;
  isBinaryLike?: boolean;
  volumeCount: number;
  width: number;
  height: number;
  depth: number;
  channels: number;
  dataType: VolumeDataType;
  storedDataType?: StoredIntensityDataType;
  min: number;
  max: number;
};

export type PreprocessedChannelSummary = {
  id: string;
  name: string;
  layers: PreprocessedLayerSummary[];
};

export type PreprocessedTrackSetSummary = {
  id: string;
  name: string;
  fileName: string;
  boundChannelId: string | null;
  header: CompiledTrackSetHeader;
  tracks: PreprocessedTracksDescriptor;
};

export type OpenPreprocessedDatasetResult = {
  manifest: PreprocessedManifest;
  channelSummaries: PreprocessedChannelSummary[];
  trackSummaries: PreprocessedTrackSetSummary[];
  totalVolumeCount: number;
};
