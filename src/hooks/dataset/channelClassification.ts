import type { ChannelSource } from './useChannelSources';

export function isSegmentationChannelSource(
  channel: Pick<ChannelSource, 'channelType' | 'volume'>
): boolean {
  if (channel.channelType === 'segmentation') {
    return true;
  }
  if (channel.channelType === 'channel') {
    return false;
  }
  if (!channel.volume) {
    return false;
  }
  return channel.volume.isSegmentation;
}
