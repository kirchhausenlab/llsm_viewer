import type { TrackDefinition } from '../../../types/tracks';

type PlanarTrackScale = {
  x: number;
  y: number;
};

type PlanarTrackOffset = {
  x: number;
  y: number;
};

export type PlanarTrackCentroid = {
  x: number;
  y: number;
  z: number;
};

type ComputePlanarTrackCentroidParams = {
  track: TrackDefinition | null | undefined;
  maxVisibleTime: number;
  channelTrackOffsets: Record<string, PlanarTrackOffset>;
  trackScale: PlanarTrackScale;
  isFullTrackTrailEnabled: boolean;
  trackTrailLength: number;
};

export function computePlanarTrackCentroid({
  track,
  maxVisibleTime,
  channelTrackOffsets,
  trackScale,
  isFullTrackTrailEnabled,
  trackTrailLength,
}: ComputePlanarTrackCentroidParams): PlanarTrackCentroid | null {
  if (!track) {
    return null;
  }

  const offset = channelTrackOffsets[track.channelId] ?? { x: 0, y: 0 };
  const scaledOffsetX = offset.x * trackScale.x;
  const scaledOffsetY = offset.y * trackScale.y;
  const minVisibleTime = isFullTrackTrailEnabled ? -Infinity : maxVisibleTime - trackTrailLength;

  let count = 0;
  let latestTime = -Infinity;
  let sumX = 0;
  let sumY = 0;
  let sumZ = 0;

  for (const point of track.points) {
    if (point.time - maxVisibleTime > 1e-3) {
      break;
    }

    if (point.time + 1e-3 < minVisibleTime) {
      continue;
    }

    if (point.time > latestTime + 1e-3) {
      latestTime = point.time;
      count = 1;
      sumX = point.x * trackScale.x + scaledOffsetX;
      sumY = point.y * trackScale.y + scaledOffsetY;
      sumZ = Number.isFinite(point.z) ? point.z : 0;
    } else if (Math.abs(point.time - latestTime) <= 1e-3) {
      count += 1;
      sumX += point.x * trackScale.x + scaledOffsetX;
      sumY += point.y * trackScale.y + scaledOffsetY;
      sumZ += Number.isFinite(point.z) ? point.z : 0;
    }
  }

  if (count === 0) {
    return null;
  }

  return {
    x: sumX / count,
    y: sumY / count,
    z: sumZ / count,
  };
}
