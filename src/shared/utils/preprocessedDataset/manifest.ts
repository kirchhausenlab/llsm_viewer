import type {
  PreprocessedChannelSummary,
  PreprocessedLayerManifestEntry,
  PreprocessedLayerSummary,
  PreprocessedManifest,
  PreprocessedTrackSetSummary
} from './types';

function buildLayerSummaryFromManifest(layer: PreprocessedLayerManifestEntry): PreprocessedLayerSummary {
  return {
    key: layer.key,
    label: layer.label,
    isSegmentation: layer.isSegmentation,
    volumeCount: layer.volumeCount,
    width: layer.width,
    height: layer.height,
    depth: layer.depth,
    channels: layer.channels,
    dataType: layer.dataType,
    min: layer.normalization?.min ?? 0,
    max: layer.normalization?.max ?? 255
  };
}

export function buildChannelSummariesFromManifest(
  manifest: PreprocessedManifest,
): PreprocessedChannelSummary[] {
  return manifest.dataset.channels.map((channel) => ({
    id: channel.id,
    name: channel.name,
    layers: channel.layers.map(buildLayerSummaryFromManifest)
  }));
}

export function buildTrackSummariesFromManifest(
  manifest: PreprocessedManifest,
  trackEntriesByTrackSetId: Map<string, string[][]>
): PreprocessedTrackSetSummary[] {
  return manifest.dataset.trackSets.map((trackSet) => ({
    id: trackSet.id,
    name: trackSet.name,
    fileName: trackSet.fileName,
    boundChannelId: trackSet.boundChannelId,
    entries: trackEntriesByTrackSetId.get(trackSet.id) ?? []
  }));
}
