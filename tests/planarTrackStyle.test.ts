import assert from 'node:assert/strict';

import { resolvePlanarTrackStyle } from '../src/components/viewers/planar-viewer/planarSliceCanvas.ts';
import type { TrackRenderEntry } from '../src/components/viewers/planar-viewer/types.ts';

console.log('Starting planar track style helper tests');

const sampleTrack: TrackRenderEntry = {
  id: 'track-0',
  trackSetId: 'set-0',
  trackSetName: 'Set 0',
  channelId: 'channel-0',
  channelName: 'Channel 0',
  trackNumber: 1,
  xyPoints: [],
  baseColor: { r: 0, g: 0.5, b: 1 },
  highlightColor: { r: 1, g: 1, b: 1 },
};

(() => {
  const style = resolvePlanarTrackStyle({
    track: sampleTrack,
    isSelected: false,
    isFollowed: false,
    isExplicitlyVisible: false,
    channelOpacity: 1,
    channelLineWidth: 1,
    blinkFactor: 1,
  });

  assert.strictEqual(style, null);
})();

(() => {
  const style = resolvePlanarTrackStyle({
    track: sampleTrack,
    isSelected: true,
    isFollowed: false,
    isExplicitlyVisible: true,
    channelOpacity: 0,
    channelLineWidth: 2,
    blinkFactor: 1,
  });

  assert.ok(style);
  assert.strictEqual(style.lineWidth, 3);
  assert.strictEqual(style.strokeAlpha, 0.9);
  assert.ok(Math.abs(style.fillAlpha - 0.81) < 1e-9);
  assert.deepStrictEqual(style.strokeColor, { r: 0.4, g: 0.7, b: 1 });
})();

(() => {
  const style = resolvePlanarTrackStyle({
    track: sampleTrack,
    isSelected: false,
    isFollowed: true,
    isExplicitlyVisible: false,
    channelOpacity: 0,
    channelLineWidth: 2,
    blinkFactor: 1.5,
  });

  assert.ok(style);
  assert.ok(Math.abs(style.lineWidth - 2.7) < 1e-9);
  assert.strictEqual(style.strokeAlpha, 0.9);
  assert.ok(Math.abs(style.fillAlpha - 0.81) < 1e-9);
  assert.deepStrictEqual(style.strokeColor, sampleTrack.baseColor);
})();

console.log('planar track style helper tests passed');
