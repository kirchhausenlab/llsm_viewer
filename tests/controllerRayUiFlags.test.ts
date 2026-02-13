import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  applyControllerUiFlags,
  createEmptyControllerUiFlags
} from '../src/components/viewers/volume-viewer/vr/controllerRayUiFlags.ts';

test('controller UI flags mark play hover and suppress track hover', () => {
  const result = applyControllerUiFlags({
    hoverUiType: 'playback-play-toggle',
    activeUiType: null,
    hoverTrackId: 'track-1',
    flags: createEmptyControllerUiFlags()
  });

  assert.equal(result.flags.playHoveredAny, true);
  assert.equal(result.hoverTrackId, null);
});

test('controller UI flags mark active playback slider and suppress track hover', () => {
  const result = applyControllerUiFlags({
    hoverUiType: 'playback-slider',
    activeUiType: 'playback-slider',
    hoverTrackId: 'track-2',
    flags: createEmptyControllerUiFlags()
  });

  assert.equal(result.flags.playbackSliderHoveredAny, true);
  assert.equal(result.flags.playbackSliderActiveAny, true);
  assert.equal(result.hoverTrackId, null);
});

test('controller UI flags preserve hover for fps slider hover only', () => {
  const result = applyControllerUiFlags({
    hoverUiType: 'playback-fps-slider',
    activeUiType: null,
    hoverTrackId: 'track-3',
    flags: createEmptyControllerUiFlags()
  });

  assert.equal(result.flags.fpsSliderHoveredAny, true);
  assert.equal(result.flags.fpsSliderActiveAny, false);
  assert.equal(result.hoverTrackId, 'track-3');
});

test('controller UI flags suppress track hover for tracks UI targets', () => {
  const result = applyControllerUiFlags({
    hoverUiType: 'tracks-toggle',
    activeUiType: null,
    hoverTrackId: 'track-4',
    flags: createEmptyControllerUiFlags()
  });

  assert.equal(result.hoverTrackId, null);
});

test('controller UI flags suppress track hover while dragging a HUD panel', () => {
  const result = applyControllerUiFlags({
    hoverUiType: null,
    activeUiType: 'channels-panel-yaw',
    hoverTrackId: 'track-5',
    flags: createEmptyControllerUiFlags()
  });

  assert.equal(result.hoverTrackId, null);
});

test('controller UI flags preserve prior flags and add reset-volume state', () => {
  const result = applyControllerUiFlags({
    hoverUiType: null,
    activeUiType: 'playback-reset-volume',
    hoverTrackId: 'track-6',
    flags: {
      ...createEmptyControllerUiFlags(),
      playHoveredAny: true
    }
  });

  assert.equal(result.flags.playHoveredAny, true);
  assert.equal(result.flags.resetVolumeHoveredAny, true);
  assert.equal(result.hoverTrackId, null);
});
