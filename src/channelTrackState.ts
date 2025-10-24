import type { TrackColorMode } from './types/tracks';

export const DEFAULT_TRACK_OPACITY = 0.9;
export const DEFAULT_TRACK_LINE_WIDTH = 1;

export type ChannelTrackState = {
  opacity: number;
  lineWidth: number;
  visibility: Record<string, boolean>;
  colorMode: TrackColorMode;
};

export const createDefaultChannelTrackState = (): ChannelTrackState => ({
  opacity: DEFAULT_TRACK_OPACITY,
  lineWidth: DEFAULT_TRACK_LINE_WIDTH,
  visibility: {},
  colorMode: { type: 'random' }
});
