import assert from 'node:assert/strict';

import { usePlaybackControls } from '../src/components/volume-viewer/usePlaybackControls.ts';
import { VR_PLAYBACK_MAX_FPS, VR_PLAYBACK_MIN_FPS } from '../src/components/volume-viewer/vr/constants.ts';
import type { PlaybackLoopState, PlaybackState, VrHoverState } from '../src/components/volume-viewer/vr';
import { renderHook } from './hooks/renderHook.ts';

console.log('Starting usePlaybackControls tests');

(() => {
  const hook = renderHook(() =>
    usePlaybackControls({
      isPlaying: false,
      playbackDisabled: false,
      playbackLabel: '1 / 3',
      fps: 24,
      timeIndex: 5,
      totalTimepoints: 3,
      onTogglePlayback: () => {},
      onTimeIndexChange: () => {},
      onFpsChange: () => {},
    }),
  );

  assert.strictEqual(hook.result.clampedTimeIndex, 2);
})();

(() => {
  const onTimeIndexChangeCalls: number[] = [];
  const playbackState: PlaybackState = {
    isPlaying: true,
    playbackDisabled: false,
    playbackLabel: '1 / 3',
    fps: 0,
    timeIndex: 0,
    totalTimepoints: 3,
    onTogglePlayback: () => {},
    onTimeIndexChange: (index) => onTimeIndexChangeCalls.push(index),
    onFpsChange: () => {},
  };

  const playbackLoopState: PlaybackLoopState = {
    lastTimestamp: null,
    accumulator: 0,
  };

  const vrHoverState: VrHoverState = {
    playbackSliderActive: false,
    hoverTrackIds: [],
    hoverUiTarget: null,
  };

  const hook = renderHook(() =>
    usePlaybackControls({
      isPlaying: playbackState.isPlaying,
      playbackDisabled: playbackState.playbackDisabled,
      playbackLabel: playbackState.playbackLabel,
      fps: playbackState.fps,
      timeIndex: playbackState.timeIndex,
      totalTimepoints: playbackState.totalTimepoints,
      onTogglePlayback: playbackState.onTogglePlayback,
      onTimeIndexChange: playbackState.onTimeIndexChange,
      onFpsChange: playbackState.onFpsChange,
    }),
  );

  hook.result.registerPlaybackRefs({
    playbackStateRef: { current: playbackState },
    playbackLoopRef: { current: playbackLoopState },
    vrHoverStateRef: { current: vrHoverState },
  });

  hook.result.advancePlaybackFrame(0);
  hook.result.advancePlaybackFrame(1500);

  assert.strictEqual(onTimeIndexChangeCalls.length, 1);
  assert.strictEqual(onTimeIndexChangeCalls[0], 1);
  assert.strictEqual(playbackState.timeIndex, 1);
  assert.strictEqual(playbackState.playbackLabel, '2 / 3');
})();

(() => {
  const playbackState: PlaybackState = {
    isPlaying: true,
    playbackDisabled: false,
    playbackLabel: '1 / 3',
    fps: VR_PLAYBACK_MAX_FPS * 2,
    timeIndex: 0,
    totalTimepoints: 2,
    onTogglePlayback: () => {},
    onTimeIndexChange: () => {},
    onFpsChange: () => {},
  };

  const playbackLoopState: PlaybackLoopState = {
    lastTimestamp: null,
    accumulator: 0,
  };

  const vrHoverState: VrHoverState = {
    playbackSliderActive: false,
    hoverTrackIds: [],
    hoverUiTarget: null,
  };

  const hook = renderHook(() =>
    usePlaybackControls({
      isPlaying: playbackState.isPlaying,
      playbackDisabled: playbackState.playbackDisabled,
      playbackLabel: playbackState.playbackLabel,
      fps: playbackState.fps,
      timeIndex: playbackState.timeIndex,
      totalTimepoints: playbackState.totalTimepoints,
      onTogglePlayback: playbackState.onTogglePlayback,
      onTimeIndexChange: playbackState.onTimeIndexChange,
      onFpsChange: playbackState.onFpsChange,
    }),
  );

  hook.result.registerPlaybackRefs({
    playbackStateRef: { current: playbackState },
    playbackLoopRef: { current: playbackLoopState },
    vrHoverStateRef: { current: vrHoverState },
  });

  hook.result.advancePlaybackFrame(0);
  hook.result.advancePlaybackFrame(Math.ceil(1000 / VR_PLAYBACK_MAX_FPS));

  assert.strictEqual(playbackState.timeIndex, 1);
  hook.result.advancePlaybackFrame(Math.floor(1000 / VR_PLAYBACK_MIN_FPS));
  assert.strictEqual(playbackState.timeIndex, 0);
})();

console.log('usePlaybackControls tests passed');
