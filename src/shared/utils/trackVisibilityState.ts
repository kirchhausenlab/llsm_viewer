import type { TrackSetState } from '../../types/channelTracks';
import type { TrackSummary } from '../../types/tracks';

export function resolveTrackVisibilityForState(state: TrackSetState, trackId: string): boolean {
  return state.visibilityOverrides[trackId] ?? state.defaultVisibility;
}

export function resolveTrackVisibility(
  track: Pick<TrackSummary, 'id' | 'trackSetId'>,
  trackSetStates: Record<string, TrackSetState>,
  fallbackState: TrackSetState,
): boolean {
  const state = trackSetStates[track.trackSetId] ?? fallbackState;
  return resolveTrackVisibilityForState(state, track.id);
}
