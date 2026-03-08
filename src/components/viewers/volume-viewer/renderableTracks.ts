import { DEFAULT_TRACK_OPACITY } from './constants';
import type { TrackDefinition } from '../../../types/tracks';

type RenderableTrackOptions = {
  trackVisibility: Record<string, boolean>;
  trackOpacityByTrackSet: Record<string, number>;
  selectedTrackIds: ReadonlySet<string>;
  followedTrackId: string | null;
};

export function isTrackRenderable(
  track: TrackDefinition,
  { trackVisibility, trackOpacityByTrackSet, selectedTrackIds, followedTrackId }: RenderableTrackOptions,
): boolean {
  const isExplicitlyVisible = trackVisibility[track.id] ?? true;
  const isFollowed = followedTrackId === track.id;
  const isSelected = selectedTrackIds.has(track.id);
  const channelOpacity = trackOpacityByTrackSet[track.trackSetId] ?? DEFAULT_TRACK_OPACITY;
  const sanitizedOpacity = Math.min(1, Math.max(0, channelOpacity));
  const isChannelHidden = sanitizedOpacity <= 0;
  const isOpacityExempt = isFollowed || isSelected;

  return (isFollowed || isExplicitlyVisible || isSelected) && (!isChannelHidden || isOpacityExempt);
}

export function resolveRenderableTracks(
  tracks: TrackDefinition[],
  options: RenderableTrackOptions,
): TrackDefinition[] {
  if (tracks.length === 0) {
    return tracks;
  }

  const renderable: TrackDefinition[] = [];
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
