import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction
} from 'react';
import type { FollowedTrackState, TrackSetState } from '../../types/channelTracks';
import type { NumericRange, TrackDefinition } from '../../types/tracks';
import { useTracksForDisplay } from './useTracksForDisplay';
import { createDefaultTrackSetState } from './useTrackStyling';

const clampRangeToBounds = (range: NumericRange, bounds: NumericRange): NumericRange => {
  const min = Math.min(Math.max(range.min, bounds.min), bounds.max);
  const max = Math.max(Math.min(range.max, bounds.max), min);
  return { min, max };
};

export const TRACK_SMOOTHING_RANGE: NumericRange = { min: 0, max: 5 };
export const TRACK_TRAIL_LENGTH_RANGE: NumericRange = { min: 1, max: 20 };
export const DEFAULT_TRACK_TRAIL_LENGTH = 10;

export type TrackSetDescriptor = { id: string };

export type UseTrackSelectionResult = ReturnType<typeof useTrackSelection>;

export type UseTrackSelectionOptions = {
  trackSets: TrackSetDescriptor[];
  rawTracksByTrackSet: Map<string, TrackDefinition[]>;
  volumeTimepointCount: number;
  trackSetStates: Record<string, TrackSetState>;
  setTrackSetStates: Dispatch<SetStateAction<Record<string, TrackSetState>>>;
  ensureTrackIsVisible: (track: TrackDefinition) => void;
};

export const useTrackSelection = ({
  trackSets,
  rawTracksByTrackSet,
  volumeTimepointCount,
  trackSetStates,
  setTrackSetStates,
  ensureTrackIsVisible
}: UseTrackSelectionOptions) => {
  const [trackOrderModeByTrackSet, setTrackOrderModeByTrackSet] = useState<Record<string, 'id' | 'length'>>({});
  const [selectedTrackOrder, setSelectedTrackOrder] = useState<string[]>([]);
  const selectedTrackIds = useMemo(() => new Set(selectedTrackOrder), [selectedTrackOrder]);
  const [selectedTracksAmplitudeLimits, setSelectedTracksAmplitudeLimits] = useState<NumericRange | null>(null);
  const [selectedTracksTimeLimits, setSelectedTracksTimeLimits] = useState<NumericRange | null>(null);
  const [trackSmoothing, setTrackSmoothing] = useState(0);
  const [isFullTrackTrailEnabled, setIsFullTrackTrailEnabled] = useState(true);
  const [trackTrailLength, setTrackTrailLength] = useState(DEFAULT_TRACK_TRAIL_LENGTH);
  const [pendingMinimumTrackLength, setPendingMinimumTrackLength] = useState(1);
  const [minimumTrackLength, setMinimumTrackLength] = useState(1);
  const [followedTrack, setFollowedTrack] = useState<FollowedTrackState>(null);
  const [activeTrackSetId, setActiveTrackSetId] = useState<string | null>(null);
  const previousAmplitudeExtentRef = useRef<NumericRange | null>(null);
  const previousTimeExtentRef = useRef<NumericRange | null>(null);

  const {
    parsedTracksByTrackSet,
    plotTracksByTrackSet,
    parsedTracks,
    trackLookup,
    filteredTracksByTrackSet,
    filteredTracks,
    filteredTrackLookup,
    plotFilteredTracksByTrackSet,
    plotFilteredTracks,
    plotFilteredTrackLookup,
    selectedTrackSeries,
    trackExtents,
    selectedTrackExtents
  } = useTracksForDisplay({
    rawTracksByTrackSet,
    trackSets,
    selectedTrackOrder,
    minimumTrackLength,
    trackSmoothing,
    volumeTimepointCount
  });

  const amplitudeExtent = trackExtents.amplitude;
  const timeExtent = trackExtents.time;

  useEffect(() => {
    setSelectedTracksAmplitudeLimits((current) => {
      const previousBounds = previousAmplitudeExtentRef.current;
      previousAmplitudeExtentRef.current = amplitudeExtent;

      if (!current) {
        return amplitudeExtent;
      }

      const clamped = clampRangeToBounds(current, amplitudeExtent);
      const boundsChanged =
        !!previousBounds &&
        (previousBounds.min !== amplitudeExtent.min || previousBounds.max !== amplitudeExtent.max);

      if (boundsChanged && current.min === previousBounds.min && current.max === previousBounds.max) {
        return amplitudeExtent;
      }

      return clamped;
    });
  }, [amplitudeExtent.max, amplitudeExtent.min]);

  useEffect(() => {
    setSelectedTracksTimeLimits((current) => {
      const previousBounds = previousTimeExtentRef.current;
      previousTimeExtentRef.current = timeExtent;

      if (!current) {
        return timeExtent;
      }

      const clamped = clampRangeToBounds(current, timeExtent);
      const boundsChanged =
        !!previousBounds && (previousBounds.min !== timeExtent.min || previousBounds.max !== timeExtent.max);

      if (boundsChanged && current.min === previousBounds.min && current.max === previousBounds.max) {
        return timeExtent;
      }

      return clamped;
    });
  }, [timeExtent.max, timeExtent.min]);

  const resolvedAmplitudeLimits = selectedTracksAmplitudeLimits ?? amplitudeExtent;
  const resolvedTimeLimits = selectedTracksTimeLimits ?? timeExtent;

  const trackLengthBounds = useMemo(() => {
    const min = Math.max(0, Math.floor(timeExtent.min));
    const max = Math.max(Math.ceil(timeExtent.max), min + 1);
    return { min, max } as const;
  }, [timeExtent.max, timeExtent.min]);

  const clampTrackLength = useCallback(
    (value: number) => Math.min(Math.max(value, trackLengthBounds.min), trackLengthBounds.max),
    [trackLengthBounds.max, trackLengthBounds.min]
  );

  useEffect(() => {
    setPendingMinimumTrackLength((current) => clampTrackLength(current));
    setMinimumTrackLength((current) => clampTrackLength(current));
  }, [clampTrackLength]);

  useEffect(() => {
    const available = new Set(filteredTracks.map((track) => track.id));
    if (selectedTrackOrder.length > 0) {
      setSelectedTrackOrder((current) => {
        const filtered = current.filter((id) => available.has(id));
        return filtered.length === current.length ? current : filtered;
      });
    }
    setFollowedTrack((current) => (current && !available.has(current.id) ? null : current));
  }, [filteredTracks, selectedTrackOrder.length]);

  useEffect(() => {
    setFollowedTrack((current) => {
      if (!current) {
        return current;
      }
      if (trackLookup.has(current.id)) {
        return current;
      }
      return null;
    });
  }, [trackLookup]);

  const trackSummaryByTrackSet = useMemo(() => {
    const summary = new Map<string, { total: number; visible: number }>();
    for (const set of trackSets) {
      const tracksForSet = filteredTracksByTrackSet.get(set.id) ?? [];
      const state = trackSetStates[set.id] ?? createDefaultTrackSetState();
      let visible = 0;
      for (const track of tracksForSet) {
        const explicitVisible = state.visibility[track.id] ?? true;
        const isFollowedTrack = followedTrack?.id === track.id;
        const isSelectedTrack = selectedTrackIds.has(track.id);
        if (explicitVisible || isFollowedTrack || isSelectedTrack) {
          visible += 1;
        }
      }
      summary.set(set.id, { total: tracksForSet.length, visible });
    }
    return summary;
  }, [filteredTracksByTrackSet, followedTrack, selectedTrackIds, trackSetStates, trackSets]);

  const trackVisibility = useMemo(() => {
    const visibility: Record<string, boolean> = {};
    for (const set of trackSets) {
      const tracksForSet = filteredTracksByTrackSet.get(set.id) ?? [];
      const state = trackSetStates[set.id] ?? createDefaultTrackSetState();
      for (const track of tracksForSet) {
        visibility[track.id] = state.visibility[track.id] ?? true;
      }
    }
    return visibility;
  }, [filteredTracksByTrackSet, trackSetStates, trackSets]);

  const followedTrackId = followedTrack?.id ?? null;
  const followedTrackSetId = followedTrack?.trackSetId ?? null;

  const handleTrackOrderToggle = useCallback((trackSetId: string) => {
    setTrackOrderModeByTrackSet((current) => {
      const previous = current[trackSetId] ?? 'id';
      const nextMode = previous === 'id' ? 'length' : 'id';
      if (current[trackSetId] === nextMode) {
        return current;
      }
      return {
        ...current,
        [trackSetId]: nextMode
      };
    });
  }, []);

  const handleTrackSelectionToggle = useCallback(
    (trackId: string) => {
      const track = trackLookup.get(trackId);
      if (!track) {
        return;
      }

      let didSelect = false;
      setSelectedTrackOrder((current) => {
        const withoutTrack = current.filter((id) => id !== trackId);
        if (withoutTrack.length !== current.length) {
          return withoutTrack;
        }

        didSelect = true;
        return [trackId, ...withoutTrack];
      });

      if (didSelect) {
        ensureTrackIsVisible(track);
      }
    },
    [ensureTrackIsVisible, trackLookup]
  );

  const handleTrackFollow = useCallback(
    (trackId: string) => {
      const track = trackLookup.get(trackId);
      if (!track) {
        return;
      }

      if (followedTrack?.id !== trackId) {
        setSelectedTrackOrder((current) => (current.includes(trackId) ? current : [...current, trackId]));
      }

      setFollowedTrack((current) => (current && current.id === trackId ? null : { id: trackId, trackSetId: track.trackSetId }));
      ensureTrackIsVisible(track);
    },
    [ensureTrackIsVisible, followedTrack, trackLookup]
  );

  const handleTrackFollowFromViewer = useCallback(
    (trackId: string) => {
      const track = trackLookup.get(trackId);
      if (!track) {
        return;
      }

      setSelectedTrackOrder((current) => (current.includes(trackId) ? current : [...current, trackId]));
      setFollowedTrack((current) => (current && current.id === trackId ? current : { id: trackId, trackSetId: track.trackSetId }));
      ensureTrackIsVisible(track);
      setActiveTrackSetId(track.trackSetId);
    },
    [ensureTrackIsVisible, trackLookup]
  );

  const handleTrackSetSelect = useCallback((trackSetId: string) => {
    setActiveTrackSetId(trackSetId);
  }, []);

  const handleStopTrackFollow = useCallback((trackSetId?: string) => {
    if (!trackSetId) {
      setFollowedTrack(null);
      return;
    }
    setFollowedTrack((current) => (current && current.trackSetId === trackSetId ? null : current));
  }, []);

  const handleTrackVisibilityToggle = useCallback(
    (trackId: string) => {
      const track = trackLookup.get(trackId);
      if (!track) {
        return;
      }

      let nextVisible = true;
      setTrackSetStates((current) => {
        const existing = current[track.trackSetId] ?? createDefaultTrackSetState();
        const previous = existing.visibility[trackId] ?? true;
        nextVisible = !previous;
        return {
          ...current,
          [track.trackSetId]: {
            ...existing,
            visibility: {
              ...existing.visibility,
              [trackId]: nextVisible
            }
          }
        };
      });

      if (!nextVisible) {
        setFollowedTrack((current) => (current && current.id === trackId ? null : current));
        setSelectedTrackOrder((current) => (current.includes(trackId) ? current.filter((id) => id !== trackId) : current));
      }
    },
    [setTrackSetStates, trackLookup]
  );

  const handleTrackVisibilityAllChange = useCallback(
    (trackSetId: string, isChecked: boolean) => {
      const tracksForSet = parsedTracksByTrackSet.get(trackSetId) ?? [];
      setTrackSetStates((current) => {
        const existing = current[trackSetId] ?? createDefaultTrackSetState();
        const visibility: Record<string, boolean> = {};
        for (const track of tracksForSet) {
          visibility[track.id] = isChecked;
        }
        return {
          ...current,
          [trackSetId]: {
            ...existing,
            visibility
          }
        };
      });

      if (!isChecked) {
        setFollowedTrack((current) => (current && current.trackSetId === trackSetId ? null : current));
        const trackIdsForSet = new Set(tracksForSet.map((track) => track.id));
        setSelectedTrackOrder((current) => {
          if (current.length === 0) {
            return current;
          }
          const filtered = current.filter((id) => !trackIdsForSet.has(id));
          return filtered.length === current.length ? current : filtered;
        });
      }
    },
    [parsedTracksByTrackSet, setTrackSetStates]
  );

  const handleMinimumTrackLengthChange = useCallback(
    (value: number) => {
      setPendingMinimumTrackLength((current) => {
        const clamped = clampTrackLength(value);
        return clamped === current ? current : clamped;
      });
    },
    [clampTrackLength]
  );

  const handleMinimumTrackLengthApply = useCallback(() => {
    setMinimumTrackLength(clampTrackLength(pendingMinimumTrackLength));
  }, [clampTrackLength, pendingMinimumTrackLength]);

  const handleSelectedTracksAmplitudeLimitsChange = useCallback(
    (next: NumericRange) => {
      setSelectedTracksAmplitudeLimits(clampRangeToBounds(next, amplitudeExtent));
    },
    [amplitudeExtent]
  );

  const handleSelectedTracksTimeLimitsChange = useCallback(
    (next: NumericRange) => {
      setSelectedTracksTimeLimits(clampRangeToBounds(next, timeExtent));
    },
    [timeExtent]
  );

  const handleSelectedTracksAutoRange = useCallback(() => {
    const nextAmplitude = selectedTrackExtents.amplitude ?? amplitudeExtent;
    const nextTime = selectedTrackExtents.time ?? timeExtent;

    setSelectedTracksAmplitudeLimits(clampRangeToBounds(nextAmplitude, amplitudeExtent));
    setSelectedTracksTimeLimits(clampRangeToBounds(nextTime, timeExtent));
  }, [amplitudeExtent, selectedTrackExtents, timeExtent]);

  const handleTrackSmoothingChange = useCallback((value: number) => {
    const clamped = Math.min(Math.max(value, TRACK_SMOOTHING_RANGE.min), TRACK_SMOOTHING_RANGE.max);
    setTrackSmoothing(clamped);
  }, []);

  const handleTrackTrailModeChange = useCallback((isFull: boolean) => {
    setIsFullTrackTrailEnabled(isFull);
  }, []);

  const clampTrailLength = useCallback(
    (value: number) =>
      Math.min(Math.max(Math.round(value), TRACK_TRAIL_LENGTH_RANGE.min), TRACK_TRAIL_LENGTH_RANGE.max),
    []
  );

  const handleTrackTrailLengthChange = useCallback(
    (value: number) => {
      setTrackTrailLength((current) => {
        const clamped = clampTrailLength(value);
        return clamped === current ? current : clamped;
      });
    },
    [clampTrailLength]
  );

  const handleClearSelectedTracks = useCallback(() => {
    setSelectedTrackOrder([]);
    setFollowedTrack(null);
  }, []);

  const resetTrackSelection = useCallback(() => {
    setTrackOrderModeByTrackSet({});
    setSelectedTrackOrder([]);
    setFollowedTrack(null);
    setSelectedTracksAmplitudeLimits(null);
    setSelectedTracksTimeLimits(null);
    setTrackSmoothing(0);
    setIsFullTrackTrailEnabled(true);
    setTrackTrailLength(DEFAULT_TRACK_TRAIL_LENGTH);
    setPendingMinimumTrackLength(1);
    setMinimumTrackLength(1);
    setActiveTrackSetId(null);
  }, []);

  const hasParsedTrackData = parsedTracks.length > 0;

  return {
    trackOrderModeByTrackSet,
    setTrackOrderModeByTrackSet,
    selectedTrackOrder,
    setSelectedTrackOrder,
    selectedTrackIds,
    selectedTracksAmplitudeLimits,
    selectedTracksTimeLimits,
    trackSmoothing,
    isFullTrackTrailEnabled,
    trackTrailLength,
    pendingMinimumTrackLength,
    minimumTrackLength,
    followedTrack,
    setFollowedTrack,
    activeTrackSetId,
    setActiveTrackSetId,
    parsedTracksByTrackSet,
    plotTracksByTrackSet,
    parsedTracks,
    trackLookup,
    filteredTracksByTrackSet,
    filteredTracks,
    filteredTrackLookup,
    plotFilteredTracksByTrackSet,
    plotFilteredTracks,
    plotFilteredTrackLookup,
    selectedTrackSeries,
    trackExtents,
    selectedTrackExtents,
    amplitudeExtent,
    timeExtent,
    resolvedAmplitudeLimits,
    resolvedTimeLimits,
    trackLengthBounds,
    trackSummaryByTrackSet,
    trackVisibility,
    followedTrackId,
    followedTrackSetId,
    handleTrackOrderToggle,
    handleTrackSelectionToggle,
    handleTrackFollow,
    handleTrackFollowFromViewer,
    handleTrackSetSelect,
    handleStopTrackFollow,
    handleTrackVisibilityToggle,
    handleTrackVisibilityAllChange,
    handleMinimumTrackLengthChange,
    handleMinimumTrackLengthApply,
    handleTrackTrailModeChange,
    handleTrackTrailLengthChange,
    handleSelectedTracksAmplitudeLimitsChange,
    handleSelectedTracksTimeLimitsChange,
    handleSelectedTracksAutoRange,
    handleTrackSmoothingChange,
    handleClearSelectedTracks,
    resetTrackSelection,
    hasParsedTrackData
  };
};

export default useTrackSelection;

