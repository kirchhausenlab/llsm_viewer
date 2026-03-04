import type { LayerSettings } from './layerSettings';

export type ChannelDescriptor = { id: string };
export type ChannelLayersLookup = {
  get(key: string): Array<{ key: string }> | undefined;
};

export type ChannelTrackOffsets = Record<string, { x: number; y: number }>;

export const deriveChannelTrackOffsets = ({
  channels,
  channelLayersMap,
  layerSettings
}: {
  channels: ChannelDescriptor[];
  channelLayersMap: ChannelLayersLookup;
  layerSettings: Record<string, LayerSettings | undefined>;
}): ChannelTrackOffsets => {
  const offsets: ChannelTrackOffsets = {};
  for (const channel of channels) {
    const channelLayers = channelLayersMap.get(channel.id) ?? [];
    const activeLayerKey = channelLayers[0]?.key ?? null;
    if (!activeLayerKey) {
      offsets[channel.id] = { x: 0, y: 0 };
      continue;
    }
    const settings = layerSettings[activeLayerKey];
    if (!settings) {
      offsets[channel.id] = { x: 0, y: 0 };
      continue;
    }
    offsets[channel.id] = {
      x: settings.xOffset,
      y: settings.yOffset
    };
  }
  return offsets;
};
