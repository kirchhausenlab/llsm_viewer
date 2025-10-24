import { createDefaultChannelTrackState, type ChannelTrackState } from './channelTrackState';
import type { TrackDefinition } from './types/tracks';

export type MinimalChannel = { id: string };

export function deriveTrackChannelIds(
  channels: readonly MinimalChannel[],
  loadedChannelIds: readonly string[],
  channelTrackStates: Record<string, ChannelTrackState>
): string[] {
  if (channels.length > 0) {
    return channels.map((channel) => channel.id);
  }
  if (loadedChannelIds.length > 0) {
    return [...loadedChannelIds];
  }
  return Object.keys(channelTrackStates);
}

const getTrackState = (
  channelTrackStates: Record<string, ChannelTrackState>,
  channelId: string
): ChannelTrackState => channelTrackStates[channelId] ?? createDefaultChannelTrackState();

export function computeTrackSummaryByChannel(
  channelIds: readonly string[],
  parsedTracksByChannel: Map<string, TrackDefinition[]>,
  channelTrackStates: Record<string, ChannelTrackState>
): Map<string, { total: number; visible: number }> {
  const summary = new Map<string, { total: number; visible: number }>();
  for (const channelId of channelIds) {
    const tracksForChannel = parsedTracksByChannel.get(channelId) ?? [];
    const state = getTrackState(channelTrackStates, channelId);
    let visible = 0;
    for (const track of tracksForChannel) {
      if (state.visibility[track.id] ?? true) {
        visible += 1;
      }
    }
    summary.set(channelId, { total: tracksForChannel.length, visible });
  }
  return summary;
}

export function computeTrackVisibility(
  channelIds: readonly string[],
  parsedTracksByChannel: Map<string, TrackDefinition[]>,
  channelTrackStates: Record<string, ChannelTrackState>
): Record<string, boolean> {
  const visibility: Record<string, boolean> = {};
  for (const channelId of channelIds) {
    const tracksForChannel = parsedTracksByChannel.get(channelId) ?? [];
    const state = getTrackState(channelTrackStates, channelId);
    for (const track of tracksForChannel) {
      visibility[track.id] = state.visibility[track.id] ?? true;
    }
  }
  return visibility;
}

export function computeTrackOpacityByChannel(
  channelIds: readonly string[],
  channelTrackStates: Record<string, ChannelTrackState>
): Record<string, number> {
  const map: Record<string, number> = {};
  for (const channelId of channelIds) {
    const state = getTrackState(channelTrackStates, channelId);
    map[channelId] = state.opacity;
  }
  return map;
}

export function computeTrackLineWidthByChannel(
  channelIds: readonly string[],
  channelTrackStates: Record<string, ChannelTrackState>
): Record<string, number> {
  const map: Record<string, number> = {};
  for (const channelId of channelIds) {
    const state = getTrackState(channelTrackStates, channelId);
    map[channelId] = state.lineWidth;
  }
  return map;
}
