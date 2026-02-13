import assert from 'node:assert/strict';

import { computePlanarTrackCentroid } from '../src/components/viewers/planar-viewer/planarTrackCentroid.ts';
import type { TrackDefinition } from '../src/types/tracks.ts';

console.log('Starting planar track centroid helper tests');

const baseTrack: TrackDefinition = {
  id: 'track-0',
  trackSetId: 'set-0',
  trackSetName: 'Set 0',
  channelId: 'channel-0',
  channelName: 'Channel 0',
  trackNumber: 1,
  sourceTrackId: 1,
  points: [
    { time: 0, x: 1, y: 2, z: 1, amplitude: 0 },
    { time: 5, x: 2, y: 3, z: 2, amplitude: 0 },
    { time: 5, x: 4, y: 7, z: Number.NaN, amplitude: 0 },
    { time: 8, x: 10, y: 10, z: 10, amplitude: 0 },
  ],
};

(() => {
  assert.strictEqual(
    computePlanarTrackCentroid({
      track: null,
      maxVisibleTime: 5,
      channelTrackOffsets: {},
      trackScale: { x: 1, y: 1 },
      isFullTrackTrailEnabled: true,
      trackTrailLength: 10,
    }),
    null,
  );
})();

(() => {
  const centroid = computePlanarTrackCentroid({
    track: baseTrack,
    maxVisibleTime: 5,
    channelTrackOffsets: { 'channel-0': { x: 1, y: -1 } },
    trackScale: { x: 2, y: 3 },
    isFullTrackTrailEnabled: true,
    trackTrailLength: 10,
  });

  assert.deepStrictEqual(centroid, {
    x: 8,
    y: 12,
    z: 1,
  });
})();

(() => {
  const centroid = computePlanarTrackCentroid({
    track: baseTrack,
    maxVisibleTime: 5,
    channelTrackOffsets: {},
    trackScale: { x: 1, y: 1 },
    isFullTrackTrailEnabled: false,
    trackTrailLength: 0.25,
  });

  assert.deepStrictEqual(centroid, {
    x: 3,
    y: 5,
    z: 1,
  });
})();

(() => {
  const centroid = computePlanarTrackCentroid({
    track: baseTrack,
    maxVisibleTime: -10,
    channelTrackOffsets: {},
    trackScale: { x: 1, y: 1 },
    isFullTrackTrailEnabled: true,
    trackTrailLength: 10,
  });

  assert.strictEqual(centroid, null);
})();

console.log('planar track centroid helper tests passed');
