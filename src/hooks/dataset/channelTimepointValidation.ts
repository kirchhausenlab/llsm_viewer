type LayerLike = {
  id: string;
  files: File[];
};

type ChannelLike = {
  layers: LayerLike[];
};

export function getKnownLayerTimepointCount(
  layer: LayerLike | null | undefined,
  layerTimepointCounts: Record<string, number>,
): number | null {
  if (!layer) {
    return null;
  }
  const count = layerTimepointCounts[layer.id];
  return typeof count === 'number' ? count : null;
}

export function hasPendingLayerTimepointCount(
  layer: LayerLike | null | undefined,
  layerTimepointCounts: Record<string, number>,
): boolean {
  if (!layer || layer.files.length === 0) {
    return false;
  }
  return getKnownLayerTimepointCount(layer, layerTimepointCounts) === null;
}

export function computeGlobalTimepointMismatch(
  channels: ChannelLike[],
  layerTimepointCounts: Record<string, number>,
): boolean {
  const timepointCounts = new Set<number>();
  for (const channel of channels) {
    for (const layer of channel.layers) {
      if (layer.files.length === 0) {
        continue;
      }
      const count = getKnownLayerTimepointCount(layer, layerTimepointCounts);
      if (count === null || count <= 0) {
        continue;
      }
      timepointCounts.add(count);
    }
  }
  return timepointCounts.size > 1;
}
