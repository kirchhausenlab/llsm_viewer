import { DEFAULT_TRACK_OPACITY } from './constants';
import type { TrackSetState } from '../../../types/channelTracks';
import type { TrackSummary } from '../../../types/tracks';
import { resolveTrackVisibilityForState } from '../../../shared/utils/trackVisibilityState';
import { createDefaultTrackSetState } from '../../../hooks/tracks/useTrackStyling';

type RenderableTrackOptions = {
  trackSetStates: Record<string, TrackSetState>;
  trackOpacityByTrackSet: Record<string, number>;
  selectedTrackIds: ReadonlySet<string>;
  followedTrackId: string | null;
};

export function isTrackRenderable(
  track: TrackSummary,
  { trackSetStates, trackOpacityByTrackSet, selectedTrackIds, followedTrackId }: RenderableTrackOptions,
): boolean {
  const trackSetState = trackSetStates[track.trackSetId] ?? createDefaultTrackSetState();
  const isExplicitlyVisible = resolveTrackVisibilityForState(trackSetState, track.id);
  const isFollowed = followedTrackId === track.id;
  const isSelected = selectedTrackIds.has(track.id);
  const channelOpacity = trackOpacityByTrackSet[track.trackSetId] ?? DEFAULT_TRACK_OPACITY;
  const sanitizedOpacity = Math.min(1, Math.max(0, channelOpacity));
  const isChannelHidden = sanitizedOpacity <= 0;
  const isOpacityExempt = isFollowed || isSelected;

  return (isFollowed || isExplicitlyVisible || isSelected) && (!isChannelHidden || isOpacityExempt);
}

export function resolveRenderableTracks(
  tracks: TrackSummary[],
  options: RenderableTrackOptions,
): TrackSummary[] {
  if (tracks.length === 0) {
    return tracks;
  }

  const renderable: TrackSummary[] = [];
  let allRenderable = true;

  for (const track of tracks) {
    const isRenderable = isTrackRenderable(track, options);
    if (isRenderable) {
      renderable.push(track);
      continue;
    }
    allRenderable = false;
  }

  return allRenderable ? tracks : renderable;
}
