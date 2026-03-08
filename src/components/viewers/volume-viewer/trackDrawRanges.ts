import type { TrackLineResource } from '../VolumeViewer.types';

type UpdateTrackDrawRangesOptions = {
  lines: Iterable<TrackLineResource>;
  targetTimeIndex: number;
  isFullTrackTrailEnabled: boolean;
  trackTrailLength: number;
};

function findFirstIndexAtOrAfter(values: ArrayLike<number>, target: number): number {
  let low = 0;
  let high = values.length;

  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if ((values[mid] ?? Number.POSITIVE_INFINITY) < target) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  return low;
}

function findLastIndexAtOrBefore(values: ArrayLike<number>, target: number): number {
  let low = 0;
  let high = values.length;

  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if ((values[mid] ?? Number.NEGATIVE_INFINITY) <= target) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  return low - 1;
}

export function updateTrackDrawRanges({
  lines,
  targetTimeIndex,
  isFullTrackTrailEnabled,
  trackTrailLength,
}: UpdateTrackDrawRangesOptions): void {
  const epsilon = 1e-3;
  const maxVisibleTime = targetTimeIndex + epsilon;
  const minVisibleTime = isFullTrackTrailEnabled ? Number.NEGATIVE_INFINITY : targetTimeIndex - trackTrailLength - epsilon;

  for (const resource of lines) {
    const { geometry, times, positions, endCap } = resource;
    if (times.length === 0) {
      resource.hasVisiblePoints = false;
      resource.geometryPointStartIndex = null;
      resource.geometryPointEndIndex = null;
      geometry.instanceCount = 0;
      endCap.visible = false;
      continue;
    }

    const firstVisibleIndex = isFullTrackTrailEnabled ? 0 : findFirstIndexAtOrAfter(times, minVisibleTime);
    const lastVisibleIndex = findLastIndexAtOrBefore(times, maxVisibleTime);
    const hasVisiblePoints =
      firstVisibleIndex >= 0 &&
      firstVisibleIndex < times.length &&
      lastVisibleIndex >= 0 &&
      lastVisibleIndex >= firstVisibleIndex;
    resource.hasVisiblePoints = hasVisiblePoints;

    if (hasVisiblePoints) {
      const baseIndex = lastVisibleIndex * 3;
      endCap.position.set(
        positions[baseIndex] ?? 0,
        positions[baseIndex + 1] ?? 0,
        positions[baseIndex + 2] ?? 0,
      );
    }

    endCap.visible = resource.shouldShow && hasVisiblePoints;

    if (isFullTrackTrailEnabled) {
      if (resource.geometryPointStartIndex !== 0 || resource.geometryPointEndIndex !== times.length - 1) {
        geometry.setPositions(positions);
        resource.geometryPointStartIndex = 0;
        resource.geometryPointEndIndex = times.length - 1;
      }

      geometry.instanceCount = hasVisiblePoints ? Math.max(lastVisibleIndex, 0) : 0;
      continue;
    }

    if (!hasVisiblePoints) {
      geometry.instanceCount = 0;
      resource.geometryPointStartIndex = null;
      resource.geometryPointEndIndex = null;
      continue;
    }

    if (
      resource.geometryPointStartIndex !== firstVisibleIndex ||
      resource.geometryPointEndIndex !== lastVisibleIndex
    ) {
      geometry.setPositions(positions.subarray(firstVisibleIndex * 3, (lastVisibleIndex + 1) * 3));
      resource.geometryPointStartIndex = firstVisibleIndex;
      resource.geometryPointEndIndex = lastVisibleIndex;
    }

    geometry.instanceCount = Math.max(lastVisibleIndex - firstVisibleIndex, 0);
  }
}
