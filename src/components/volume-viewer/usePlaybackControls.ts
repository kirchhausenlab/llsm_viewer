import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';

import { VR_PLAYBACK_MAX_FPS, VR_PLAYBACK_MIN_FPS } from './vr';
import type { PlaybackLoopState, PlaybackState, VrHoverState } from './vr';

type UsePlaybackControlsParams = {
  isPlaying: boolean;
  playbackDisabled: boolean;
  playbackLabel: string;
  fps: number;
  timeIndex: number;
  totalTimepoints: number;
  onTogglePlayback: () => void;
  onTimeIndexChange: (nextIndex: number) => void;
  onFpsChange: (value: number) => void;
};

type PlaybackRefs = {
  playbackStateRef: MutableRefObject<PlaybackState>;
  playbackLoopRef: MutableRefObject<PlaybackLoopState>;
  vrHoverStateRef: MutableRefObject<VrHoverState>;
  updateVrPlaybackHud?: () => void;
  vrIntegration?: unknown;
};

export function usePlaybackControls({
  isPlaying,
  playbackDisabled,
  playbackLabel,
  fps,
  timeIndex,
  totalTimepoints,
  onTogglePlayback,
  onTimeIndexChange,
  onFpsChange,
}: UsePlaybackControlsParams) {
  const timeIndexRef = useRef(0);
  const playbackState = useMemo(
    () => ({
      isPlaying,
      playbackDisabled,
      playbackLabel,
      fps,
      timeIndex,
      totalTimepoints,
      onTogglePlayback,
      onTimeIndexChange,
      onFpsChange,
    }),
    [
      fps,
      isPlaying,
      onFpsChange,
      onTimeIndexChange,
      onTogglePlayback,
      playbackDisabled,
      playbackLabel,
      timeIndex,
      totalTimepoints,
    ],
  );

  const clampedTimeIndex = useMemo(
    () => (totalTimepoints === 0 ? 0 : Math.min(timeIndex, totalTimepoints - 1)),
    [timeIndex, totalTimepoints],
  );

  useEffect(() => {
    timeIndexRef.current = clampedTimeIndex;
  }, [clampedTimeIndex]);

  const playbackStateRefRef = useRef<MutableRefObject<PlaybackState> | null>(null);
  const playbackLoopRefRef = useRef<MutableRefObject<PlaybackLoopState> | null>(null);
  const vrHoverStateRefRef = useRef<MutableRefObject<VrHoverState> | null>(null);
  const updateVrPlaybackHudRef = useRef<(() => void) | null>(null);
  const vrIntegrationRef = useRef<unknown>(null);
  const [playbackRefsVersion, setPlaybackRefsVersion] = useState(0);

  const registerPlaybackRefs = useCallback(
    ({ playbackStateRef, playbackLoopRef, vrHoverStateRef, updateVrPlaybackHud, vrIntegration }: PlaybackRefs) => {
      playbackStateRefRef.current = playbackStateRef;
      playbackLoopRefRef.current = playbackLoopRef;
      vrHoverStateRefRef.current = vrHoverStateRef;
      updateVrPlaybackHudRef.current = updateVrPlaybackHud ?? null;
      vrIntegrationRef.current = vrIntegration ?? null;
      setPlaybackRefsVersion((value) => value + 1);
    },
    [],
  );

  useEffect(() => {
    const playbackStateRef = playbackStateRefRef.current;
    if (!playbackStateRef) {
      return;
    }
    if (vrIntegrationRef.current) {
      return;
    }

    const state = playbackStateRef.current;
    state.isPlaying = isPlaying;
    state.playbackDisabled = playbackDisabled;
    state.playbackLabel = playbackLabel;
    state.fps = fps;
    state.timeIndex = clampedTimeIndex;
    state.totalTimepoints = totalTimepoints;
    state.onTogglePlayback = onTogglePlayback;
    state.onTimeIndexChange = onTimeIndexChange;
    state.onFpsChange = onFpsChange;
  }, [
    clampedTimeIndex,
    fps,
    isPlaying,
    onFpsChange,
    onTimeIndexChange,
    onTogglePlayback,
    playbackDisabled,
    playbackLabel,
    totalTimepoints,
    playbackRefsVersion,
  ]);

  const advancePlaybackFrame = useCallback(
    (timestamp: number) => {
      const playbackLoopRef = playbackLoopRefRef.current;
      const playbackStateRef = playbackStateRefRef.current;
      const vrHoverStateRef = vrHoverStateRefRef.current;
      if (!playbackLoopRef || !playbackStateRef || !vrHoverStateRef) {
        return;
      }

      const playbackLoopState = playbackLoopRef.current;
      const playbackStateValue = playbackStateRef.current;
      const playbackSliderActive = vrHoverStateRef.current.playbackSliderActive;

      const shouldAdvancePlayback =
        playbackStateValue.isPlaying &&
        !playbackStateValue.playbackDisabled &&
        playbackStateValue.totalTimepoints > 1 &&
        !playbackSliderActive &&
        typeof playbackStateValue.onTimeIndexChange === 'function';

      if (shouldAdvancePlayback) {
        const minFps = VR_PLAYBACK_MIN_FPS;
        const maxFps = VR_PLAYBACK_MAX_FPS;
        const requestedFps = playbackStateValue.fps ?? minFps;
        const clampedFps = Math.min(Math.max(requestedFps, minFps), maxFps);
        const frameDuration = clampedFps > 0 ? 1000 / clampedFps : 0;

        if (frameDuration > 0) {
          if (playbackLoopState.lastTimestamp === null) {
            playbackLoopState.lastTimestamp = timestamp;
            playbackLoopState.accumulator = 0;
          } else {
            const delta = Math.max(0, Math.min(timestamp - playbackLoopState.lastTimestamp, 1000));
            playbackLoopState.accumulator += delta;
            playbackLoopState.lastTimestamp = timestamp;

            const maxIndex = Math.max(0, playbackStateValue.totalTimepoints - 1);
            let didAdvance = false;

            while (playbackLoopState.accumulator >= frameDuration) {
              playbackLoopState.accumulator -= frameDuration;
              let nextIndex = playbackStateValue.timeIndex + 1;
              if (nextIndex > maxIndex) {
                nextIndex = 0;
              }
              if (nextIndex === playbackStateValue.timeIndex) {
                break;
              }

              playbackStateValue.timeIndex = nextIndex;
              timeIndexRef.current = nextIndex;

              const total = Math.max(0, playbackStateValue.totalTimepoints);
              const labelCurrent = total > 0 ? Math.min(nextIndex + 1, total) : 0;
              playbackStateValue.playbackLabel = `${labelCurrent} / ${total}`;
              playbackStateValue.onTimeIndexChange?.(nextIndex);
              didAdvance = true;
            }

            if (didAdvance) {
              updateVrPlaybackHudRef.current?.();
            }
          }
        }
      } else {
        playbackLoopState.lastTimestamp = null;
        playbackLoopState.accumulator = 0;
      }
    },
    [],
  );

  return {
    playbackState,
    clampedTimeIndex,
    timeIndexRef,
    registerPlaybackRefs,
    advancePlaybackFrame,
  };
}
