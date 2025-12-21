import type { TrackColorMode } from './tracks';

export type TrackSetState = {
  opacity: number;
  lineWidth: number;
  visibility: Record<string, boolean>;
  colorMode: TrackColorMode;
};

export type FollowedTrackState = {
  id: string;
  trackSetId: string;
} | null;
