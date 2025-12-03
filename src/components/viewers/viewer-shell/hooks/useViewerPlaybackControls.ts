import type { PlaybackControlsProps, ViewerMode } from '../types';

export type PlaybackControlState = PlaybackControlsProps & {
  isSliceSliderVisible: boolean;
  clampedSliceIndex: number;
  maxSliceDepth: number;
};

export function useViewerPlaybackControls({
  viewerMode,
  playbackControls
}: {
  viewerMode: ViewerMode;
  playbackControls: PlaybackControlsProps;
}): PlaybackControlState {
  const maxSliceDepth = Math.max(0, playbackControls.maxSliceDepth - 1);
  const clampedSliceIndex = Math.min(playbackControls.sliceIndex, maxSliceDepth);

  return {
    ...playbackControls,
    maxSliceDepth,
    clampedSliceIndex,
    isSliceSliderVisible: viewerMode === '2d' && playbackControls.maxSliceDepth > 0
  };
}
