import type { PreprocessedChannelSummary, PreprocessedLayerManifestEntry, PreprocessedLayerSummary, PreprocessedManifest } from './types';

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
  trackEntriesByChannelId?: Map<string, string[][]>
): PreprocessedChannelSummary[] {
  return manifest.dataset.channels.map((channel) => ({
    id: channel.id,
    name: channel.name,
    trackEntries:
      'trackEntries' in channel
        ? channel.trackEntries
        : (trackEntriesByChannelId?.get(channel.id) ?? []),
    layers: channel.layers.map(buildLayerSummaryFromManifest)
  }));
}
