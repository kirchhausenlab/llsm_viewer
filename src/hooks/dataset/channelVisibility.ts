type LayerChannelId = {
  channelId: string;
};

export function collectOrderedChannelIds(layers: ReadonlyArray<LayerChannelId>): string[] {
  const seen = new Set<string>();
  const orderedChannelIds: string[] = [];

  for (const layer of layers) {
    if (seen.has(layer.channelId)) {
      continue;
    }
    seen.add(layer.channelId);
    orderedChannelIds.push(layer.channelId);
  }

  return orderedChannelIds;
}

export function createInitialChannelVisibility(layers: ReadonlyArray<LayerChannelId>): Record<string, boolean> {
  const orderedChannelIds = collectOrderedChannelIds(layers);

  return orderedChannelIds.reduce<Record<string, boolean>>((acc, channelId, index) => {
    acc[channelId] = index === 0;
    return acc;
  }, {});
}

export function createAllVisibleChannelVisibility(layers: ReadonlyArray<LayerChannelId>): Record<string, boolean> {
  const orderedChannelIds = collectOrderedChannelIds(layers);

  return orderedChannelIds.reduce<Record<string, boolean>>((acc, channelId) => {
    acc[channelId] = true;
    return acc;
  }, {});
}
