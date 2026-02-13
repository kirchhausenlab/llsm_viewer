import type { VrChannelsInteractiveRegion, VrTracksInteractiveRegion } from './types';

export type ControllerRaySummary = {
  presenting: boolean;
  visibleLines: number;
  hoverTrackIds: Array<string | null>;
};

export function isSameChannelsRegion(
  a: VrChannelsInteractiveRegion | null,
  b: VrChannelsInteractiveRegion | null
): boolean {
  if (a === b) {
    return true;
  }
  if (!a || !b) {
    return false;
  }
  return (
    a.targetType === b.targetType &&
    a.channelId === b.channelId &&
    a.layerKey === b.layerKey &&
    a.sliderKey === b.sliderKey &&
    a.color === b.color
  );
}

export function isSameTracksRegion(
  a: VrTracksInteractiveRegion | null,
  b: VrTracksInteractiveRegion | null
): boolean {
  if (a === b) {
    return true;
  }
  if (!a || !b) {
    return false;
  }
  return (
    a.targetType === b.targetType &&
    a.channelId === b.channelId &&
    a.trackId === b.trackId &&
    a.sliderKey === b.sliderKey &&
    a.color === b.color
  );
}

export function shouldLogControllerRaySummary(
  previous: ControllerRaySummary | null,
  next: ControllerRaySummary
): boolean {
  if (!previous) {
    return true;
  }
  if (next.visibleLines !== previous.visibleLines) {
    return true;
  }
  if (next.hoverTrackIds.length !== previous.hoverTrackIds.length) {
    return true;
  }
  for (let index = 0; index < next.hoverTrackIds.length; index += 1) {
    if (next.hoverTrackIds[index] !== previous.hoverTrackIds[index]) {
      return true;
    }
  }
  return false;
}
