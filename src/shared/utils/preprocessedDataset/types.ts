import type { VolumeDataType } from '../../../types/volume';
import type { AnisotropyScaleFactors, VoxelResolutionValues } from '../../../types/voxelResolution';

export type AnisotropyCorrectionMetadata = {
  scale: AnisotropyScaleFactors;
};

export type ChannelExportMetadata = {
  id: string;
  name: string;
  trackEntries: string[][];
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
  };
};

export type PreprocessedChannelManifest = {
  id: string;
  name: string;
  layers: PreprocessedLayerManifestEntry[];
  trackEntries: string[][];
};

export type PreprocessedManifest = {
  format: 'llsm-viewer-preprocessed';
  version: 2;
  generatedAt: string;
  dataset: {
    movieMode: PreprocessedMovieMode;
    totalVolumeCount: number;
    channels: PreprocessedChannelManifest[];
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
  trackEntries: string[][];
  layers: PreprocessedLayerSummary[];
};

export type OpenPreprocessedDatasetResult = {
  manifest: PreprocessedManifest;
  channelSummaries: PreprocessedChannelSummary[];
  totalVolumeCount: number;
};
