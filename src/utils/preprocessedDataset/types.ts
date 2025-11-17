import type { LoadedLayer } from '../../types/layers';
import type { VolumeDataType } from '../../types/volume';
import type { VoxelResolutionValues } from '../../types/voxelResolution';

export type ChannelExportMetadata = {
  id: string;
  name: string;
  trackEntries: string[][];
};

export type PreprocessedVolumeManifestEntry = {
  path: string;
  timepoint: number;
  width: number;
  height: number;
  depth: number;
  channels: number;
  dataType: VolumeDataType;
  min: number;
  max: number;
  byteLength: number;
  digest: string;
};

export type PreprocessedLayerManifestEntry = {
  key: string;
  label: string;
  channelId: string;
  isSegmentation: boolean;
  volumes: PreprocessedVolumeManifestEntry[];
};

export type PreprocessedChannelManifest = {
  id: string;
  name: string;
  layers: PreprocessedLayerManifestEntry[];
  trackEntries: string[][];
};

export type PreprocessedManifest = {
  format: 'llsm-viewer-preprocessed';
  version: 1;
  generatedAt: string;
  dataset: {
    totalVolumeCount: number;
    channels: PreprocessedChannelManifest[];
    voxelResolution?: VoxelResolutionValues | null;
  };
};

export type ExportPreprocessedDatasetOptions = {
  layers: LoadedLayer[];
  channels: ChannelExportMetadata[];
  voxelResolution: VoxelResolutionValues;
};

export type ExportPreprocessedDatasetChunkHandler = (
  chunk: Uint8Array,
  final: boolean
) => void;

export type ExportPreprocessedDatasetResult = {
  blob?: Blob;
  manifest: PreprocessedManifest;
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

export type ImportPreprocessedDatasetResult = {
  manifest: PreprocessedManifest;
  layers: LoadedLayer[];
  channelSummaries: PreprocessedChannelSummary[];
  totalVolumeCount: number;
};

export const MANIFEST_FILE_NAME = 'manifest.json';
