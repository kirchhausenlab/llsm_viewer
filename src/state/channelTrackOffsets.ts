import type { LayerSettings } from './layerSettings';

export type ChannelDescriptor = { id: string };
export type ChannelLayersLookup = {
  get(key: string): Array<{ key: string }> | undefined;
};
export type ChannelActiveLayerMap = Record<string, string | undefined>;

export type ChannelTrackOffsets = Record<string, { x: number; y: number }>;

export const deriveChannelTrackOffsets = ({
  channels,
  channelLayersMap,
  channelActiveLayer,
  layerSettings
}: {
  channels: ChannelDescriptor[];
  channelLayersMap: ChannelLayersLookup;
  channelActiveLayer: ChannelActiveLayerMap;
  layerSettings: Record<string, LayerSettings | undefined>;
}): ChannelTrackOffsets => {
  const offsets: ChannelTrackOffsets = {};
  for (const channel of channels) {
    const activeLayerKey = channelActiveLayer[channel.id] ?? null;
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
