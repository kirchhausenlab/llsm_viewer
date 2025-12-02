import type { TrackColorMode } from './tracks';

export type ChannelTrackState = {
  opacity: number;
  lineWidth: number;
  visibility: Record<string, boolean>;
  colorMode: TrackColorMode;
};

export type FollowedTrackState = {
  id: string;
  channelId: string;
} | null;
