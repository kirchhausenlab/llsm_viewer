import assert from 'node:assert/strict';

import { applyGaussianAmplitudeSmoothing, smoothTrackPoints } from '../src/utils/trackSmoothing.ts';
import type { TrackDefinition, TrackPoint } from '../src/types/tracks.ts';

console.log('Starting track smoothing tests');

(() => {
  const emptyPoints: TrackPoint[] = [];
  const result = smoothTrackPoints(emptyPoints, 1.5);
  assert.strictEqual(result, emptyPoints, 'Empty inputs should short-circuit without allocation');
})();

(() => {
  const points: TrackPoint[] = [
    { time: 0, x: 1, y: 2, z: 3, amplitude: 4 }
  ];

  assert.strictEqual(smoothTrackPoints(points, 0), points, 'Zero sigma should not smooth');
  assert.strictEqual(smoothTrackPoints(points, -1), points, 'Negative sigma should not smooth');
  assert.strictEqual(smoothTrackPoints(points, Number.NaN), points, 'NaN sigma should not smooth');
})();

(() => {
  const tracks: TrackDefinition[] = [
    {
      id: 'track-1',
      name: 'test',
      color: '#fff',
      points: [{ time: 0, x: 0, y: 0, z: 0, amplitude: 1 }]
    }
  ];

  assert.strictEqual(
    applyGaussianAmplitudeSmoothing(tracks, 0),
    tracks,
    'Amplitude smoothing should no-op for invalid sigma'
  );
})();

(() => {
  const points: TrackPoint[] = [
    { time: 0, x: 0, y: 0, z: 0, amplitude: 1 },
    { time: 1, x: 1, y: 1, z: 1, amplitude: Number.NaN },
    { time: 2, x: 2, y: 2, z: 2, amplitude: 3 }
  ];

  const smoothed = smoothTrackPoints(points, 1);
  assert.ok(Number.isFinite(smoothed[0].amplitude));
  assert.ok(Number.isFinite(smoothed[1].amplitude));
  assert.ok(Number.isFinite(smoothed[2].amplitude));
  assert.ok(Math.abs(smoothed[1].amplitude - 2) < 1e-6, 'NaN neighbors should be ignored');
})();

(() => {
  const tracks: TrackDefinition[] = [
    {
      id: 'track-1',
      name: 'original',
      color: '#fff',
      points: [
        { time: 0, x: 0, y: 0, z: 0, amplitude: 1 },
        { time: 1, x: 1, y: 1, z: 1, amplitude: 2 },
        { time: 2, x: 2, y: 2, z: 2, amplitude: 3 }
      ]
    }
  ];

  const smoothedTracks = applyGaussianAmplitudeSmoothing(tracks, 1);
  assert.notStrictEqual(smoothedTracks, tracks, 'Smoothing should return a new track array');
  assert.strictEqual(smoothedTracks[0].points.length, tracks[0].points.length);
  smoothedTracks[0].points.forEach((point, index) => {
    assert.strictEqual(point.time, tracks[0].points[index].time, 'Time should be preserved');
    assert.strictEqual(point.x, tracks[0].points[index].x, 'X should be preserved');
    assert.strictEqual(point.y, tracks[0].points[index].y, 'Y should be preserved');
    assert.strictEqual(point.z, tracks[0].points[index].z, 'Z should be preserved');
  });
  assert.notStrictEqual(
    smoothedTracks[0].points[0].amplitude,
    tracks[0].points[0].amplitude,
    'Amplitude at the edges should change when neighbors are available'
  );
})();

console.log('track smoothing tests passed');
