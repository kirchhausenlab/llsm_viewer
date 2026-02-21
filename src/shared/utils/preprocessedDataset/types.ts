import type { VolumeDataType } from '../../../types/volume';
import type { AnisotropyScaleFactors, VoxelResolutionValues } from '../../../types/voxelResolution';

export const PREPROCESSED_DATASET_FORMAT = 'llsm-viewer-preprocessed-vnext' as const;

export type AnisotropyCorrectionMetadata = {
  scale: AnisotropyScaleFactors;
};

export type TrackSetExportMetadata = {
  id: string;
  name: string;
  fileName: string;
  boundChannelId: string | null;
  entries: string[][];
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

export type ZarrArrayShardingPlan = {
  enabled: boolean;
  targetShardBytes: number;
  shardShape: number[];
  estimatedShardBytes: number;
  reason?: string;
};

export type PreprocessedScaleChunkStatsZarrDescriptor = {
  min: ZarrArrayDescriptor;
  max: ZarrArrayDescriptor;
  occupancy: ZarrArrayDescriptor;
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
    labels?: ZarrArrayDescriptor;
    chunkStats: PreprocessedScaleChunkStatsZarrDescriptor;
    histogram: ZarrArrayDescriptor;
  };
};

export type PreprocessedLayerManifestEntry = {
  key: string;
  label: string;
  channelId: string;
  isSegmentation: boolean;
  volumeCount: number;
  width: number;
  height: number;
  depth: number;
  channels: number;
  dataType: VolumeDataType;
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

export type PreprocessedTracksDescriptor = {
  path: string;
  format: 'csv';
  columns: 8;
  decimalPlaces: 3;
};

export type PreprocessedTrackSetManifestEntry = {
  id: string;
  name: string;
  fileName: string;
  boundChannelId: string | null;
  tracks: PreprocessedTracksDescriptor;
};

export type PreprocessedManifest = {
  format: typeof PREPROCESSED_DATASET_FORMAT;
  generatedAt: string;
  dataset: {
    movieMode: PreprocessedMovieMode;
    totalVolumeCount: number;
    channels: PreprocessedChannelManifest[];
    trackSets: PreprocessedTrackSetManifestEntry[];
    voxelResolution?: VoxelResolutionValues | null;
    anisotropyCorrection?: AnisotropyCorrectionMetadata | null;
  };
};

export type PreprocessedLayerSummary = {
  key: string;
  label: string;
  isSegmentation: boolean;
  volumeCount: number;
  width: number;
  height: number;
  depth: number;
  channels: number;
  dataType: VolumeDataType;
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
  entries: string[][];
};

export type OpenPreprocessedDatasetResult = {
  manifest: PreprocessedManifest;
  channelSummaries: PreprocessedChannelSummary[];
  trackSummaries: PreprocessedTrackSetSummary[];
  totalVolumeCount: number;
};
