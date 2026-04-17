type LayerLike = {
  id: string;
  files: File[];
};

type ChannelLike = {
  volume: LayerLike | null;
};

export function getKnownLayerTimepointCount(
  layer: LayerLike | null | undefined,
  layerTimepointCounts: Record<string, number>,
  layerTimepointCountErrors: Record<string, string> = {},
): number | null {
  if (!layer) {
    return null;
  }
  if (layer.id in layerTimepointCountErrors) {
    return null;
  }
  const count = layerTimepointCounts[layer.id];
  return typeof count === 'number' ? count : null;
}

export function getLayerTimepointCountError(
  layer: LayerLike | null | undefined,
  layerTimepointCountErrors: Record<string, string>,
): string | null {
  if (!layer) {
    return null;
  }
  return layerTimepointCountErrors[layer.id] ?? null;
}

export function hasPendingLayerTimepointCount(
  layer: LayerLike | null | undefined,
  layerTimepointCounts: Record<string, number>,
  layerTimepointCountErrors: Record<string, string> = {},
): boolean {
  if (!layer || layer.files.length === 0) {
    return false;
  }
  if (getLayerTimepointCountError(layer, layerTimepointCountErrors)) {
    return false;
  }
  return getKnownLayerTimepointCount(layer, layerTimepointCounts, layerTimepointCountErrors) === null;
}

export function computeGlobalTimepointMismatch(
  channels: ChannelLike[],
  layerTimepointCounts: Record<string, number>,
  layerTimepointCountErrors: Record<string, string> = {},
): boolean {
  const timepointCounts = new Set<number>();
  for (const channel of channels) {
    const layer = channel.volume;
    if (!layer || layer.files.length === 0) {
      continue;
    }
    if (getLayerTimepointCountError(layer, layerTimepointCountErrors)) {
      continue;
    }
    const count = getKnownLayerTimepointCount(layer, layerTimepointCounts, layerTimepointCountErrors);
    if (count === null || count <= 0) {
      continue;
    }
    timepointCounts.add(count);
  }
  return timepointCounts.size > 1;
}
