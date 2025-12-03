import { useCallback, useEffect, useMemo } from 'react';

import { useViewerControls, type ViewerMode } from '../../hooks/useViewerControls';
import { useViewerPlayback, type ViewerPlaybackHook } from '../../hooks/useViewerPlayback';
import type { ExperimentDimension } from '../../hooks/useVoxelResolution';

type UseViewerModePlaybackParams = {
  experimentDimension: ExperimentDimension;
  is3dViewerAvailable: boolean;
  maxSliceDepth: number;
  onBeforeEnterVr: () => void;
  onViewerModeToggle: () => void;
  onViewerModeChange?: (viewerMode: ViewerMode) => void;
  volumeTimepointCount: number;
  isLoading: boolean;
  playback?: ViewerPlaybackHook;
};

export function useViewerModePlayback({
  experimentDimension,
  is3dViewerAvailable,
  maxSliceDepth,
  onBeforeEnterVr,
  onViewerModeToggle,
  onViewerModeChange,
  volumeTimepointCount,
  isLoading,
  playback: providedPlayback
}: UseViewerModePlaybackParams) {
  const playback = providedPlayback ?? useViewerPlayback();

  const viewerControls = useViewerControls({
    playback,
    initialViewerMode: experimentDimension,
    is3dViewerAvailable,
    maxSliceDepth,
    onBeforeEnterVr,
    onViewerModeToggle
  });

  const playbackDisabled = isLoading || volumeTimepointCount <= 1;

  const handleTogglePlayback = useCallback(() => {
    playback.setIsPlaying((current) => {
      if (!current && playbackDisabled) {
        return current;
      }
      return !current;
    });
  }, [playback, playbackDisabled]);

  const handleTimeIndexChange = useCallback(
    (nextIndex: number) => {
      playback.setSelectedIndex((prev) => {
        if (volumeTimepointCount === 0) {
          return prev;
        }
        const clamped = Math.max(0, Math.min(volumeTimepointCount - 1, nextIndex));
        return clamped;
      });
    },
    [playback, volumeTimepointCount]
  );

  const handleJumpToStart = useCallback(() => {
    if (volumeTimepointCount === 0) {
      return;
    }
    handleTimeIndexChange(0);
  }, [handleTimeIndexChange, volumeTimepointCount]);

  const handleJumpToEnd = useCallback(() => {
    if (volumeTimepointCount === 0) {
      return;
    }
    handleTimeIndexChange(volumeTimepointCount - 1);
  }, [handleTimeIndexChange, volumeTimepointCount]);

  useEffect(() => {
    onViewerModeChange?.(viewerControls.viewerMode);
  }, [onViewerModeChange, viewerControls.viewerMode]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    if (viewerControls.viewerMode !== '2d') {
      return;
    }
    if (!playback.isPlaying || playbackDisabled) {
      return;
    }

    const minFps = 1;
    const maxFps = 60;
    const clampedFps = Math.min(Math.max(playback.fps, minFps), maxFps);
    const frameDuration = clampedFps > 0 ? 1000 / clampedFps : Infinity;

    let animationFrame: number | null = null;
    let lastTimestamp: number | null = null;
    let accumulator = 0;
    let cancelled = false;

    const step = (timestamp: number) => {
      if (cancelled) {
        return;
      }

      if (lastTimestamp === null) {
        lastTimestamp = timestamp;
      }

      accumulator += timestamp - lastTimestamp;
      lastTimestamp = timestamp;

      while (accumulator >= frameDuration) {
        accumulator -= frameDuration;
        playback.setSelectedIndex((previous) => {
          if (volumeTimepointCount <= 1) {
            const maxIndex = Math.max(0, volumeTimepointCount - 1);
            const clamped = Math.min(Math.max(previous, 0), maxIndex);
            return clamped;
          }

          const maxIndex = Math.max(0, volumeTimepointCount - 1);
          const nextIndex = previous >= maxIndex ? 0 : previous + 1;
          return nextIndex;
        });
      }

      animationFrame = window.requestAnimationFrame(step);
    };

    animationFrame = window.requestAnimationFrame(step);

    return () => {
      cancelled = true;
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame);
      }
    };
  }, [
    playback,
    playbackDisabled,
    playback.fps,
    playback.isPlaying,
    viewerControls.viewerMode,
    volumeTimepointCount
  ]);

  const playbackLabel = useMemo(() => {
    if (volumeTimepointCount === 0) {
      return '0 / 0';
    }
    const currentFrame = Math.min(playback.selectedIndex + 1, volumeTimepointCount);
    return `${currentFrame} / ${volumeTimepointCount}`;
  }, [playback.selectedIndex, volumeTimepointCount]);

  return {
    viewerControls,
    playback,
    playbackDisabled,
    playbackLabel,
    handleTogglePlayback,
    handleTimeIndexChange,
    handleJumpToStart,
    handleJumpToEnd
  };
}

export type UseViewerModePlaybackResult = ReturnType<typeof useViewerModePlayback>;
