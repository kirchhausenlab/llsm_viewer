import type { TrackLineResource } from '../VolumeViewer.types';

type UpdateTrackDrawRangesOptions = {
  lines: Iterable<TrackLineResource>;
  targetTimeIndex: number;
  isFullTrackTrailEnabled: boolean;
  trackTrailLength: number;
};

export function updateTrackDrawRanges({
  lines,
  targetTimeIndex,
  isFullTrackTrailEnabled,
  trackTrailLength
}: UpdateTrackDrawRangesOptions): void {
  const maxVisibleTime = targetTimeIndex;
  const minVisibleTime = isFullTrackTrailEnabled ? -Infinity : targetTimeIndex - trackTrailLength;

  for (const resource of lines) {
    const { geometry, times, positions, endCap } = resource;
    let firstVisibleIndex = -1;
    let lastVisibleIndex = -1;

    for (let index = 0; index < times.length; index++) {
      const time = times[index];
      if (time > maxVisibleTime) {
        break;
      }
      if (time >= minVisibleTime) {
        if (firstVisibleIndex === -1) {
          firstVisibleIndex = index;
        }
        lastVisibleIndex = index;
      }
    }

    const hasVisiblePoints = firstVisibleIndex !== -1 && lastVisibleIndex !== -1;
    resource.hasVisiblePoints = hasVisiblePoints;

    if (hasVisiblePoints) {
      const baseIndex = lastVisibleIndex * 3;
      endCap.position.set(
        positions[baseIndex] ?? 0,
        positions[baseIndex + 1] ?? 0,
        positions[baseIndex + 2] ?? 0
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
