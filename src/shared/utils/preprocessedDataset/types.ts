import type { VolumeDataType } from '../../../types/volume';
import type {
  AnisotropyScaleFactors,
  TemporalResolutionMetadata,
  VoxelResolutionValues
} from '../../../types/voxelResolution';
import type { CompiledTrackSet, CompiledTrackSetHeader } from '../../../types/tracks';

export const LEGACY_PREPROCESSED_DATASET_FORMAT = 'llsm-viewer-preprocessed-vnext-hes1' as const;
export const PREPROCESSED_DATASET_FORMAT = 'llsm-viewer-preprocessed-vnext-hes2' as const;
export type PreprocessedDatasetFormat =
  | typeof LEGACY_PREPROCESSED_DATASET_FORMAT
  | typeof PREPROCESSED_DATASET_FORMAT;
export type StoredIntensityDataType = 'uint8' | 'uint16';

export type AnisotropyCorrectionMetadata = {
  scale: AnisotropyScaleFactors;
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

export type PreprocessedLayerManifestEntry = {
  key: string;
  label: string;
  channelId: string;
  isSegmentation: boolean;
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
    voxelResolution: VoxelResolutionValues;
    temporalResolution: TemporalResolutionMetadata;
    anisotropyCorrection?: AnisotropyCorrectionMetadata | null;
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
