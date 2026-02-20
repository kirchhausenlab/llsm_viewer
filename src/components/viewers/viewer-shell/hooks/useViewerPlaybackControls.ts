import type { PlaybackControlsProps } from '../types';

export type PlaybackControlState = PlaybackControlsProps;

export function useViewerPlaybackControls({
  playbackControls
}: {
  playbackControls: PlaybackControlsProps;
}): PlaybackControlState {
  return playbackControls;
}
