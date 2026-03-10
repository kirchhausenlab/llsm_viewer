import assert from 'node:assert/strict';

import { resolveRenderableTracks } from '../src/components/viewers/volume-viewer/renderableTracks.ts';
import { createDefaultTrackSetState } from '../src/hooks/tracks/useTrackStyling.ts';

console.log('Starting renderableTracks tests');

const tracks = [
  {
    id: 'track-0',
    trackSetId: 'track-set-0',
    trackSetName: 'Track set 0',
    channelId: 'channel-0',
    channelName: 'Channel 0',
    trackNumber: 1,
    sourceTrackId: 1,
    points: [{ x: 0, y: 0, z: 0, time: 0, amplitude: 0 }],
  },
  {
    id: 'track-1',
    trackSetId: 'track-set-0',
    trackSetName: 'Track set 0',
    channelId: 'channel-0',
    channelName: 'Channel 0',
    trackNumber: 2,
    sourceTrackId: 2,
    points: [{ x: 1, y: 1, z: 0, time: 0, amplitude: 0 }],
  },
];

(() => {
  const renderable = resolveRenderableTracks(tracks, {
    trackSetStates: {},
    trackOpacityByTrackSet: { 'track-set-0': 1 },
    selectedTrackIds: new Set(),
    followedTrackId: null,
  });

  assert.strictEqual(renderable, tracks, 'fully renderable track lists should preserve identity');
})();

(() => {
  const renderable = resolveRenderableTracks(tracks, {
    trackSetStates: {
      'track-set-0': {
        ...createDefaultTrackSetState(),
        defaultVisibility: false,
        visibilityOverrides: {},
      },
    },
    trackOpacityByTrackSet: { 'track-set-0': 1 },
    selectedTrackIds: new Set(),
    followedTrackId: null,
  });

  assert.deepStrictEqual(renderable, []);
})();

(() => {
  const renderable = resolveRenderableTracks(tracks, {
    trackSetStates: {
      'track-set-0': {
        ...createDefaultTrackSetState(),
        defaultVisibility: false,
        visibilityOverrides: {},
      },
    },
    trackOpacityByTrackSet: { 'track-set-0': 0 },
    selectedTrackIds: new Set(['track-1']),
    followedTrackId: 'track-0',
  });

  assert.deepStrictEqual(
    renderable.map((track) => track.id),
    ['track-0', 'track-1'],
    'followed and selected tracks stay renderable even when explicitly hidden or opacity-clamped',
  );
})();

console.log('renderableTracks tests passed');
