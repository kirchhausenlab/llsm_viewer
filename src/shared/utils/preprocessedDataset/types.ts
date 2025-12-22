import type { VolumeDataType } from '../../../types/volume';
import type { AnisotropyScaleFactors, VoxelResolutionValues } from '../../../types/voxelResolution';

export type AnisotropyCorrectionMetadata = {
  scale: AnisotropyScaleFactors;
};

export type TrackSetExportMetadata = {
  id: string;
  name: string;
  fileName: string;
  entries: string[][];
};

export type ChannelExportMetadata = {
  id: string;
  name: string;
  trackSets: TrackSetExportMetadata[];
};

export type PreprocessedMovieMode = '2d' | '3d';

export type NormalizationMetadata = {
  min: number;
  max: number;
};

export type ZarrArrayDescriptor = {
  path: string;
  shape: number[];
  chunkShape: number[];
  dataType: VolumeDataType;
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
    data: ZarrArrayDescriptor;
    labels?: ZarrArrayDescriptor;
    histogram: ZarrArrayDescriptor;
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
  tracks: PreprocessedTracksDescriptor;
};

export type PreprocessedChannelManifestV5 = PreprocessedChannelManifest & {
  trackSets: PreprocessedTrackSetManifestEntry[];
};

export type PreprocessedManifestV5 = {
  format: 'llsm-viewer-preprocessed';
  generatedAt: string;
  dataset: {
    movieMode: PreprocessedMovieMode;
    totalVolumeCount: number;
    channels: PreprocessedChannelManifestV5[];
    voxelResolution?: VoxelResolutionValues | null;
    anisotropyCorrection?: AnisotropyCorrectionMetadata | null;
  };
};

export type PreprocessedManifest = PreprocessedManifestV5;

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
  trackSets: Array<{
    id: string;
    name: string;
    fileName: string;
    entries: string[][];
  }>;
  layers: PreprocessedLayerSummary[];
};

export type OpenPreprocessedDatasetResult = {
  manifest: PreprocessedManifest;
  channelSummaries: PreprocessedChannelSummary[];
  totalVolumeCount: number;
};
