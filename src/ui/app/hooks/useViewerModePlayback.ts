import { useCallback, useEffect, useMemo, useRef } from 'react';

import { useViewerControls, useViewerPlayback, type ViewerMode, type ViewerPlaybackHook } from '../../../hooks/viewer';
import type { ExperimentDimension } from '../../../hooks/useVoxelResolution';
import type { PlaybackIndexWindow } from '../../../shared/utils';
import { computeLoopedNextTimeIndex, snapTimeIndexToWindow } from '../../../shared/utils';

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
  canAdvancePlayback?: (nextIndex: number) => boolean;
  playbackWindow?: PlaybackIndexWindow | null;
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
  playback: providedPlayback,
  canAdvancePlayback,
  playbackWindow
}: UseViewerModePlaybackParams) {
  const playback = providedPlayback ?? useViewerPlayback();
  const selectedIndexRef = useRef(playback.selectedIndex);

  useEffect(() => {
    selectedIndexRef.current = playback.selectedIndex;
  }, [playback.selectedIndex]);

  useEffect(() => {
    if (volumeTimepointCount <= 0) {
      return;
    }
    if (!playbackWindow) {
      return;
    }

    playback.setSelectedIndex((prev) => snapTimeIndexToWindow(prev, volumeTimepointCount, playbackWindow));
  }, [playback, playbackWindow, volumeTimepointCount]);

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
        return snapTimeIndexToWindow(nextIndex, volumeTimepointCount, playbackWindow);
      });
    },
    [playback, playbackWindow, volumeTimepointCount]
  );

  const handleJumpToStart = useCallback(() => {
    if (volumeTimepointCount === 0) {
      return;
    }
    if (playbackWindow) {
      handleTimeIndexChange(playbackWindow.minIndex);
    } else {
      handleTimeIndexChange(0);
    }
  }, [handleTimeIndexChange, playbackWindow, volumeTimepointCount]);

  const handleJumpToEnd = useCallback(() => {
    if (volumeTimepointCount === 0) {
      return;
    }
    if (playbackWindow) {
      handleTimeIndexChange(playbackWindow.maxIndex);
    } else {
      handleTimeIndexChange(volumeTimepointCount - 1);
    }
  }, [handleTimeIndexChange, playbackWindow, volumeTimepointCount]);

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
        if (volumeTimepointCount <= 1) {
          accumulator = 0;
          break;
        }
        const nextIndex = computeLoopedNextTimeIndex(selectedIndexRef.current, volumeTimepointCount, playbackWindow);
        if (nextIndex === selectedIndexRef.current) {
          accumulator = 0;
          break;
        }

        if (canAdvancePlayback && !canAdvancePlayback(nextIndex)) {
          accumulator = 0;
          break;
        }

        accumulator -= frameDuration;
        selectedIndexRef.current = nextIndex;
        playback.setSelectedIndex(nextIndex);
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
    canAdvancePlayback,
    playbackDisabled,
    playback.fps,
    playback.isPlaying,
    viewerControls.viewerMode,
    volumeTimepointCount,
    playbackWindow
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
