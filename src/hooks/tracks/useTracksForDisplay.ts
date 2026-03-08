import { useMemo } from 'react';
import { getTrackColorHex } from '../../shared/colorMaps/trackColors';
import { materializeTrackPoints } from '../../shared/utils/compiledTracks';
import { resolveTrackVisibilityForState } from '../../shared/utils/trackVisibilityState';
import { applyGaussianAmplitudeSmoothing } from '../../shared/utils/trackSmoothing';
import type { TrackSetState } from '../../types/channelTracks';
import type {
  CompiledTrackSetPayload,
  CompiledTrackSummary,
  NumericRange,
  TrackDefinition,
  TrackPoint,
  TrackSummary
} from '../../types/tracks';
import { createDefaultTrackSetState } from './useTrackStyling';

export type TrackSeriesEntry = {
  id: string;
  channelId: string | null;
  channelName: string | null;
  trackSetId: string;
  trackSetName: string;
  trackNumber: number;
  displayTrackNumber?: string;
  color: string;
  rawPoints: TrackPoint[];
  points: TrackPoint[];
};

export type SelectedTrackExtents = {
  amplitude: NumericRange | null;
  time: NumericRange | null;
};

type UseTracksForDisplayParams = {
  parsedTracksByTrackSet: Map<string, CompiledTrackSummary[]>;
  compiledPayloadByTrackSet: Map<string, CompiledTrackSetPayload>;
  trackSets: Array<{ id: string }>;
  trackSetStates: Record<string, TrackSetState>;
  trackOpacityByTrackSet: Record<string, number>;
  selectedTrackOrder: string[];
  selectedTrackIds: ReadonlySet<string>;
  followedTrackId: string | null;
  minimumTrackLength: number;
  trackSmoothing: number;
};

type UseTracksForDisplayResult = {
  parsedTracksByTrackSet: Map<string, CompiledTrackSummary[]>;
  trackLookup: Map<string, CompiledTrackSummary>;
  filteredTracksByTrackSet: Map<string, CompiledTrackSummary[]>;
  renderTracks: CompiledTrackSummary[];
  selectedTrackSeries: TrackSeriesEntry[];
  selectedTrackExtents: SelectedTrackExtents;
  hasParsedTrackData: boolean;
};

const sanitizeOpacity = (value: number | undefined): number => {
  if (!Number.isFinite(value)) {
    return 1;
  }
  const resolved = value ?? 1;
  return Math.min(Math.max(resolved, 0), 1);
};

function buildTrackLookup(
  tracksByTrackSet: Map<string, CompiledTrackSummary[]>,
  trackSets: Array<{ id: string }>
): Map<string, CompiledTrackSummary> {
  const map = new Map<string, CompiledTrackSummary>();
  for (const set of trackSets) {
    const tracks = tracksByTrackSet.get(set.id) ?? [];
    for (const track of tracks) {
      map.set(track.id, track);
    }
  }
  return map;
}

function resolveSelectedTrackExtents(entries: TrackSeriesEntry[], trackSmoothing: number): SelectedTrackExtents {
  let amplitudeMin = Number.POSITIVE_INFINITY;
  let amplitudeMax = Number.NEGATIVE_INFINITY;
  let timeMin = Number.POSITIVE_INFINITY;
  let timeMax = Number.NEGATIVE_INFINITY;

  for (const entry of entries) {
    const pointSources =
      Number.isFinite(trackSmoothing) && trackSmoothing > 0 ? [entry.points, entry.rawPoints] : [entry.points];
    for (const source of pointSources) {
      for (const point of source) {
        if (Number.isFinite(point.amplitude)) {
          amplitudeMin = Math.min(amplitudeMin, point.amplitude);
          amplitudeMax = Math.max(amplitudeMax, point.amplitude);
        }
        if (Number.isFinite(point.time)) {
          timeMin = Math.min(timeMin, point.time);
          timeMax = Math.max(timeMax, point.time);
        }
      }
    }
  }

  return {
    amplitude:
      Number.isFinite(amplitudeMin) && Number.isFinite(amplitudeMax)
        ? { min: amplitudeMin, max: amplitudeMax }
        : null,
    time:
      Number.isFinite(timeMin) && Number.isFinite(timeMax)
        ? { min: timeMin, max: timeMax }
        : null
  };
}

export function useTracksForDisplay({
  parsedTracksByTrackSet,
  compiledPayloadByTrackSet,
  trackSets,
  trackSetStates,
  trackOpacityByTrackSet,
  selectedTrackOrder,
  selectedTrackIds,
  followedTrackId,
  minimumTrackLength,
  trackSmoothing
}: UseTracksForDisplayParams): UseTracksForDisplayResult {
  const trackLookup = useMemo(() => buildTrackLookup(parsedTracksByTrackSet, trackSets), [parsedTracksByTrackSet, trackSets]);

  const filteredTracksByTrackSet = useMemo(() => {
    const map = new Map<string, CompiledTrackSummary[]>();
    for (const set of trackSets) {
      const tracksForSet = parsedTracksByTrackSet.get(set.id) ?? [];
      map.set(set.id, tracksForSet.filter((track) => track.pointCount >= minimumTrackLength));
    }
    return map;
  }, [minimumTrackLength, parsedTracksByTrackSet, trackSets]);

  const renderTracks = useMemo(() => {
    const ordered: CompiledTrackSummary[] = [];
    const addedTrackIds = new Set<string>();

    const addTrack = (track: CompiledTrackSummary | undefined) => {
      if (!track || track.pointCount < minimumTrackLength || addedTrackIds.has(track.id)) {
        return;
      }
      ordered.push(track);
      addedTrackIds.add(track.id);
    };

    for (const set of trackSets) {
      const state = trackSetStates[set.id] ?? createDefaultTrackSetState();
      const opacity = sanitizeOpacity(trackOpacityByTrackSet[set.id]);
      const tracksForSet = filteredTracksByTrackSet.get(set.id) ?? [];

      if (state.defaultVisibility && opacity > 0) {
        if (Object.keys(state.visibilityOverrides).length === 0) {
          for (const track of tracksForSet) {
            addTrack(track);
          }
          continue;
        }

        for (const track of tracksForSet) {
          if (resolveTrackVisibilityForState(state, track.id)) {
            addTrack(track);
          }
        }
        continue;
      }

      if (opacity <= 0) {
        continue;
      }

      for (const [trackId, isVisible] of Object.entries(state.visibilityOverrides)) {
        if (isVisible) {
          addTrack(trackLookup.get(trackId));
        }
      }
    }

    if (followedTrackId) {
      addTrack(trackLookup.get(followedTrackId));
    }
    for (const trackId of selectedTrackIds) {
      addTrack(trackLookup.get(trackId));
    }

    return ordered;
  }, [
    filteredTracksByTrackSet,
    followedTrackId,
    minimumTrackLength,
    selectedTrackIds,
    trackLookup,
    trackOpacityByTrackSet,
    trackSetStates,
    trackSets
  ]);

  const selectedTrackSeries = useMemo(() => {
    const series: TrackSeriesEntry[] = [];
    for (const trackId of selectedTrackOrder) {
      const track = trackLookup.get(trackId);
      if (!track || track.pointCount < minimumTrackLength) {
        continue;
      }
      const payload = compiledPayloadByTrackSet.get(track.trackSetId);
      if (!payload) {
        continue;
      }
      const rawPoints = materializeTrackPoints(track, payload);
      const smoothedTracks =
        Number.isFinite(trackSmoothing) && trackSmoothing > 0
          ? applyGaussianAmplitudeSmoothing([{ ...track, points: rawPoints } as TrackDefinition], trackSmoothing)
          : null;
      const points = smoothedTracks?.[0]?.points ?? rawPoints;
      series.push({
        id: track.id,
        channelId: track.channelId,
        channelName: track.channelName,
        trackSetId: track.trackSetId,
        trackSetName: track.trackSetName,
        trackNumber: track.trackNumber,
        displayTrackNumber: track.displayTrackNumber,
        color: getTrackColorHex(track.trackNumber),
        rawPoints,
        points
      });
    }
    return series;
  }, [compiledPayloadByTrackSet, minimumTrackLength, selectedTrackOrder, trackLookup, trackSmoothing]);

  const selectedTrackExtents = useMemo(
    () => resolveSelectedTrackExtents(selectedTrackSeries, trackSmoothing),
    [selectedTrackSeries, trackSmoothing]
  );

  const hasParsedTrackData = useMemo(() => {
    for (const set of trackSets) {
      if ((parsedTracksByTrackSet.get(set.id)?.length ?? 0) > 0) {
        return true;
      }
    }
    return false;
  }, [parsedTracksByTrackSet, trackSets]);

  return {
    parsedTracksByTrackSet,
    trackLookup,
    filteredTracksByTrackSet,
    renderTracks,
    selectedTrackSeries,
    selectedTrackExtents,
    hasParsedTrackData
  };
}

export default useTracksForDisplay;
