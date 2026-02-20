import { useCallback, useEffect, useMemo } from 'react';

import { useViewerControls, useViewerPlayback, type ViewerMode, type ViewerPlaybackHook } from '../../../hooks/viewer';
import type { PlaybackIndexWindow } from '../../../shared/utils';
import { snapTimeIndexToWindow } from '../../../shared/utils';

type UseViewerModePlaybackParams = {
  is3dViewerAvailable: boolean;
  onBeforeEnterVr: () => void;
  onViewerModeChange?: (viewerMode: ViewerMode) => void;
  volumeTimepointCount: number;
  isLoading: boolean;
  playback?: ViewerPlaybackHook;
  playbackWindow?: PlaybackIndexWindow | null;
};

export function useViewerModePlayback({
  is3dViewerAvailable,
  onBeforeEnterVr,
  onViewerModeChange,
  volumeTimepointCount,
  isLoading,
  playback: providedPlayback,
  playbackWindow
}: UseViewerModePlaybackParams) {
  const playback = providedPlayback ?? useViewerPlayback();

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
    is3dViewerAvailable,
    onBeforeEnterVr
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
