import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';

import type { PlaybackIndexWindow } from '../../../shared/utils';
import { computeLoopedNextTimeIndex, snapTimeIndexToWindow } from '../../../shared/utils';
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
  canAdvancePlayback?: (nextIndex: number) => boolean;
  playbackWindow?: PlaybackIndexWindow | null;
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
  canAdvancePlayback,
  playbackWindow,
  onFpsChange,
}: UsePlaybackControlsParams) {
  const timeIndexRef = useRef(0);
  const canAdvancePlaybackRef = useRef<((nextIndex: number) => boolean) | null>(null);
  const playbackWindowRef = useRef<PlaybackIndexWindow | null>(null);
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
    () => snapTimeIndexToWindow(timeIndex, totalTimepoints, playbackWindow),
    [playbackWindow, timeIndex, totalTimepoints],
  );

  useEffect(() => {
    timeIndexRef.current = clampedTimeIndex;
  }, [clampedTimeIndex]);

  useEffect(() => {
    canAdvancePlaybackRef.current = canAdvancePlayback ?? null;
  }, [canAdvancePlayback]);

  useEffect(() => {
    playbackWindowRef.current = playbackWindow ?? null;
  }, [playbackWindow]);

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

            let didAdvance = false;

            while (playbackLoopState.accumulator >= frameDuration) {
              const nextIndex = computeLoopedNextTimeIndex(
                playbackStateValue.timeIndex,
                playbackStateValue.totalTimepoints,
                playbackWindowRef.current,
              );
              if (nextIndex === playbackStateValue.timeIndex) {
                playbackLoopState.accumulator = 0;
                break;
              }

              const canAdvance = canAdvancePlaybackRef.current;
              if (canAdvance && !canAdvance(nextIndex)) {
                playbackLoopState.accumulator = 0;
                break;
              }

              playbackLoopState.accumulator -= frameDuration;
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
