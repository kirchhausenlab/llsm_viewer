import type { LoadedLayer } from '../../../types/layers';
import type { NormalizedVolume } from '../../../core/volumeProcessing';
import { computeAnisotropyScale } from '../anisotropyCorrection';

import type {
  ChannelExportMetadata,
  ImportPreprocessedDatasetResult,
  PreprocessedChannelManifest,
  PreprocessedChannelSummary,
  PreprocessedLayerManifestEntry,
  PreprocessedLayerSummary,
  PreprocessedManifest,
  PreprocessedVolumeManifestEntry
} from './types';

const STAGED_DIGEST = 'staged';
const STAGED_LABEL_DIGEST = 'staged-labels';

function createVolumePath(layer: LoadedLayer, timepoint: number): string {
  return `volumes/${layer.channelId}/${layer.key}/timepoint-${timepoint.toString().padStart(4, '0')}.bin`;
}

function createSegmentationLabelPath(layer: LoadedLayer, timepoint: number): string {
  return `volumes/${layer.channelId}/${layer.key}/timepoint-${timepoint.toString().padStart(4, '0')}.labels`;
}

function buildLayerSummary(layer: LoadedLayer): PreprocessedLayerSummary {
  const firstVolume = layer.volumes[0];
  return {
    key: layer.key,
    label: layer.label,
    isSegmentation: layer.isSegmentation,
    volumeCount: layer.volumes.length,
    width: firstVolume?.width ?? 0,
    height: firstVolume?.height ?? 0,
    depth: firstVolume?.depth ?? 0,
    channels: firstVolume?.channels ?? 0,
    dataType: firstVolume?.dataType ?? 'uint8',
    min: firstVolume?.min ?? 0,
    max: firstVolume?.max ?? 0
  };
}

function buildVolumeManifestEntry(
  layer: LoadedLayer,
  volume: NormalizedVolume,
  timepoint: number
): PreprocessedVolumeManifestEntry {
  const path = createVolumePath(layer, timepoint);
  const segmentationLabelsManifest: PreprocessedVolumeManifestEntry['segmentationLabels'] =
    layer.isSegmentation && volume.segmentationLabels
      ? {
          path: createSegmentationLabelPath(layer, timepoint),
          byteLength: volume.segmentationLabels.byteLength,
          digest: STAGED_LABEL_DIGEST,
          dataType: volume.segmentationLabelDataType ?? 'uint32'
        }
      : undefined;

  return {
    path,
    timepoint,
    width: volume.width,
    height: volume.height,
    depth: volume.depth,
    channels: volume.channels,
    dataType: volume.dataType,
    min: volume.min,
    max: volume.max,
    byteLength: volume.normalized.byteLength,
    digest: STAGED_DIGEST,
    ...(segmentationLabelsManifest ? { segmentationLabels: segmentationLabelsManifest } : {})
  };
}

function buildLayerManifestEntry(layer: LoadedLayer): PreprocessedLayerManifestEntry {
  return {
    key: layer.key,
    label: layer.label,
    channelId: layer.channelId,
    isSegmentation: layer.isSegmentation,
    volumes: layer.volumes.map((volume, index) => buildVolumeManifestEntry(layer, volume, index))
  };
}

function groupLayersByChannel(layers: LoadedLayer[]): Map<string, LoadedLayer[]> {
  const grouped = new Map<string, LoadedLayer[]>();
  for (const layer of layers) {
    const bucket = grouped.get(layer.channelId);
    if (bucket) {
      bucket.push(layer);
    } else {
      grouped.set(layer.channelId, [layer]);
    }
  }
  return grouped;
}

export function stagePreprocessedDataset({
  layers,
  channels,
  voxelResolution,
  movieMode
}: {
  layers: LoadedLayer[];
  channels: ChannelExportMetadata[];
  voxelResolution: NonNullable<PreprocessedManifest['dataset']['voxelResolution']>;
  movieMode: PreprocessedManifest['dataset']['movieMode'];
}): ImportPreprocessedDatasetResult {
  const totalVolumeCount = layers.reduce((count, layer) => count + layer.volumes.length, 0);
  const groupedLayers = groupLayersByChannel(layers);

  const manifestChannels: PreprocessedChannelManifest[] = channels.map((channel) => ({
    id: channel.id,
    name: channel.name,
    trackEntries: channel.trackEntries,
    layers: (groupedLayers.get(channel.id) ?? []).map(buildLayerManifestEntry)
  }));

  const channelSummaries: PreprocessedChannelSummary[] = channels.map((channel) => ({
    id: channel.id,
    name: channel.name,
    trackEntries: channel.trackEntries,
    layers: (groupedLayers.get(channel.id) ?? []).map(buildLayerSummary)
  }));

  const anisotropyScale = computeAnisotropyScale(voxelResolution);
  const anisotropyCorrection = anisotropyScale ? { scale: anisotropyScale } : null;

  const manifest: PreprocessedManifest = {
    format: 'llsm-viewer-preprocessed',
    version: 1,
    generatedAt: new Date().toISOString(),
    dataset: {
      movieMode,
      totalVolumeCount,
      channels: manifestChannels,
      voxelResolution,
      anisotropyCorrection
    }
  };

  return {
    manifest,
    layers,
    channelSummaries,
    totalVolumeCount
  };
}

