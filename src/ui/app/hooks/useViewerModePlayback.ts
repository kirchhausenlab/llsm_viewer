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
  isPlaybackStartPending?: boolean;
  bufferBeforePlayDefault?: boolean;
  onPlaybackStartRequest?: () => void;
  onPlaybackStartCancel?: () => void;
  playback?: ViewerPlaybackHook;
  playbackWindow?: PlaybackIndexWindow | null;
};

export function useViewerModePlayback({
  is3dViewerAvailable,
  onBeforeEnterVr,
  onViewerModeChange,
  volumeTimepointCount,
  isLoading,
  isPlaybackStartPending = false,
  bufferBeforePlayDefault = false,
  onPlaybackStartRequest,
  onPlaybackStartCancel,
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

    playback.setSelectedIndex((prev) => {
      const next = snapTimeIndexToWindow(prev, volumeTimepointCount, playbackWindow);
      return next === prev ? prev : next;
    });
  }, [playback.setSelectedIndex, playbackWindow, volumeTimepointCount]);

  const viewerControls = useViewerControls({
    playback,
    is3dViewerAvailable,
    onBeforeEnterVr
  });

  const playbackDisabled = isLoading || volumeTimepointCount <= 1;

  const handleTogglePlayback = useCallback(() => {
    if (playback.isPlaying) {
      onPlaybackStartCancel?.();
      playback.setIsPlaying(false);
      return;
    }
    if (isPlaybackStartPending) {
      onPlaybackStartCancel?.();
      return;
    }
    if (playbackDisabled) {
      return;
    }
    if (bufferBeforePlayDefault) {
      onPlaybackStartRequest?.();
      return;
    }
    playback.setIsPlaying(true);
  }, [
    bufferBeforePlayDefault,
    isPlaybackStartPending,
    onPlaybackStartCancel,
    onPlaybackStartRequest,
    playback.isPlaying,
    playback.setIsPlaying,
    playbackDisabled
  ]);

  const handleTimeIndexChange = useCallback(
    (nextIndex: number) => {
      playback.setSelectedIndex((prev) => {
        if (volumeTimepointCount === 0) {
          return prev;
        }
        const resolved = snapTimeIndexToWindow(nextIndex, volumeTimepointCount, playbackWindow);
        return resolved === prev ? prev : resolved;
      });
    },
    [playback.setSelectedIndex, playbackWindow, volumeTimepointCount]
  );

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
    handleTimeIndexChange
  };
}

export type UseViewerModePlaybackResult = ReturnType<typeof useViewerModePlayback>;
