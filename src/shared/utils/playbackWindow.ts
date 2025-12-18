import type { TrackDefinition } from '../../types/tracks';

export type PlaybackIndexWindow = {
  minIndex: number;
  maxIndex: number;
};

export function normalizePlaybackIndexWindow(
  window: PlaybackIndexWindow | null | undefined,
  totalTimepoints: number,
): PlaybackIndexWindow | null {
  if (!window || totalTimepoints <= 0) {
    return null;
  }

  const min = Math.trunc(window.minIndex);
  const max = Math.trunc(window.maxIndex);
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return null;
  }

  const clampedMin = Math.max(0, Math.min(totalTimepoints - 1, Math.min(min, max)));
  const clampedMax = Math.max(0, Math.min(totalTimepoints - 1, Math.max(min, max)));
  return { minIndex: clampedMin, maxIndex: clampedMax };
}

export function snapTimeIndexToWindow(
  index: number,
  totalTimepoints: number,
  window?: PlaybackIndexWindow | null,
): number {
  if (totalTimepoints <= 0) {
    return 0;
  }

  const clamped = Math.max(0, Math.min(totalTimepoints - 1, Math.trunc(index)));
  const normalizedWindow = normalizePlaybackIndexWindow(window, totalTimepoints);
  if (!normalizedWindow) {
    return clamped;
  }

  return Math.max(normalizedWindow.minIndex, Math.min(normalizedWindow.maxIndex, clamped));
}

export function computeLoopedNextTimeIndex(
  currentIndex: number,
  totalTimepoints: number,
  window?: PlaybackIndexWindow | null,
): number {
  if (totalTimepoints <= 1) {
    return snapTimeIndexToWindow(currentIndex, totalTimepoints, window);
  }

  const normalizedWindow = normalizePlaybackIndexWindow(window, totalTimepoints);
  const minIndex = normalizedWindow?.minIndex ?? 0;
  const maxIndex = normalizedWindow?.maxIndex ?? Math.max(0, totalTimepoints - 1);

  const snappedCurrent = snapTimeIndexToWindow(currentIndex, totalTimepoints, { minIndex, maxIndex });
  if (maxIndex <= minIndex) {
    return snappedCurrent;
  }

  return snappedCurrent >= maxIndex ? minIndex : snappedCurrent + 1;
}

export function getTrackPlaybackIndexWindow(
  track: TrackDefinition | null | undefined,
  totalTimepoints: number,
): PlaybackIndexWindow | null {
  if (!track || totalTimepoints <= 0 || track.points.length === 0) {
    return null;
  }

  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const point of track.points) {
    if (!Number.isFinite(point.time)) {
      continue;
    }
    min = Math.min(min, point.time);
    max = Math.max(max, point.time);
  }

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return null;
  }

  return normalizePlaybackIndexWindow({ minIndex: min, maxIndex: max }, totalTimepoints);
}

