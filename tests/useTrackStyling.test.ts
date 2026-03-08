import assert from 'node:assert/strict';

import { useTrackStyling } from '../src/hooks/tracks/useTrackStyling.ts';
import { createDefaultTrackSetState } from '../src/hooks/tracks/useTrackStyling.ts';
import type { TrackSummary } from '../src/types/tracks';
import { renderHook } from './hooks/renderHook.ts';

console.log('Starting useTrackStyling tests');

function createTrack(id: string): TrackSummary {
  return {
    id,
    trackSetId: 'set-1',
    trackSetName: 'Tracks',
    channelId: null,
    channelName: null,
    trackNumber: Number(id.replace(/\D+/g, '')) || 1,
    sourceTrackId: Number(id.replace(/\D+/g, '')) || 1,
    pointCount: 3,
    timeStart: 0,
    timeEnd: 2,
    amplitudeMin: 1,
    amplitudeMax: 3,
  };
}

(() => {
  const trackA = createTrack('track-1');
  const trackB = createTrack('track-2');
  const parsedTracksByTrackSet = new Map<string, TrackSummary[]>([['set-1', [trackA, trackB]]]);

  const hook = renderHook(() =>
    useTrackStyling({
      trackSets: [{ id: 'set-1', name: 'Tracks' }],
      trackHeadersByTrackSet: new Map([['set-1', { trackSetId: 'set-1', trackSetName: 'Tracks', boundChannelId: null, totalTracks: 2, totalPoints: 6, totalSegments: 4, totalCentroids: 0, time: { min: 0, max: 2 }, amplitude: { min: 1, max: 3 } }]]),
      parsedTracksByTrackSet,
    }),
  );

  assert.equal(hook.result.trackSetStates['set-1']?.defaultVisibility ?? true, true);
  assert.deepStrictEqual(hook.result.trackSetStates['set-1']?.visibilityOverrides ?? {}, {});

  hook.act(() => {
    hook.result.setTrackSetStates((current) => ({
      ...current,
      'set-1': {
        ...(current['set-1'] ?? createDefaultTrackSetState()),
        visibilityOverrides: { 'track-1': false, 'track-2': true },
      },
    }));
  });

  assert.deepStrictEqual(hook.result.trackSetStates['set-1']?.visibilityOverrides ?? {}, { 'track-1': false });

  hook.act(() => {
    hook.result.ensureTrackIsVisible(trackA);
  });

  assert.deepStrictEqual(hook.result.trackSetStates['set-1']?.visibilityOverrides ?? {}, {});
})();

console.log('useTrackStyling tests passed');
