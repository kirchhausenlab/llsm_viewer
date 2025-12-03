import { useEffect } from 'react';

import type { MutableRefObject } from 'react';

import type { PlaybackState } from '../vr';

type UseVrPlaybackBindingsParams = {
  playbackStateRef: MutableRefObject<PlaybackState>;
  xrPassthroughSupportedRef: MutableRefObject<boolean>;
  isPlaying: boolean;
  playbackDisabled: boolean;
  playbackLabel: string;
  fps: number;
  timeIndex: number;
  totalTimepoints: number;
  onTogglePlayback: () => void;
  onTimeIndexChange: (value: number) => void;
  onFpsChange: (value: number) => void;
  isVrPassthroughSupported: boolean;
  setPreferredXrSessionMode: (mode: 'immersive-vr' | 'immersive-ar') => void;
  updateVrPlaybackHud: () => void;
};

export function useVrPlaybackBindings({
  playbackStateRef,
  xrPassthroughSupportedRef,
  isPlaying,
  playbackDisabled,
  playbackLabel,
  fps,
  timeIndex,
  totalTimepoints,
  onTogglePlayback,
  onTimeIndexChange,
  onFpsChange,
  isVrPassthroughSupported,
  setPreferredXrSessionMode,
  updateVrPlaybackHud,
}: UseVrPlaybackBindingsParams) {
  useEffect(() => {
    xrPassthroughSupportedRef.current = isVrPassthroughSupported;
    const state = playbackStateRef.current;
    state.isPlaying = isPlaying;
    state.playbackDisabled = playbackDisabled;
    state.playbackLabel = playbackLabel;
    state.fps = fps;
    state.timeIndex = timeIndex;
    state.totalTimepoints = totalTimepoints;
    state.onTogglePlayback = onTogglePlayback;
    state.onTimeIndexChange = onTimeIndexChange;
    state.onFpsChange = onFpsChange;
    state.passthroughSupported = isVrPassthroughSupported;
    updateVrPlaybackHud();
  }, [
    isPlaying,
    playbackDisabled,
    playbackLabel,
    fps,
    timeIndex,
    totalTimepoints,
    onTogglePlayback,
    onTimeIndexChange,
    onFpsChange,
    isVrPassthroughSupported,
    xrPassthroughSupportedRef,
    playbackStateRef,
    updateVrPlaybackHud,
  ]);

  useEffect(() => {
    playbackStateRef.current.passthroughSupported = isVrPassthroughSupported;
    if (!isVrPassthroughSupported) {
      setPreferredXrSessionMode('immersive-vr');
    } else {
      updateVrPlaybackHud();
    }
  }, [isVrPassthroughSupported, playbackStateRef, setPreferredXrSessionMode, updateVrPlaybackHud]);
}
