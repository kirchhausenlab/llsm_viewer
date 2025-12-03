import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction
} from 'react';
import type { ChannelTrackState, FollowedTrackState } from '../../types/channelTracks';
import type { NumericRange, TrackDefinition } from '../../types/tracks';
import { useTracksForDisplay } from '../useTracksForDisplay';
import type { ChannelSource } from '../useChannelSources';
import { createDefaultChannelTrackState } from './useTrackStyling';

const clampRangeToBounds = (range: NumericRange, bounds: NumericRange): NumericRange => {
  const min = Math.min(Math.max(range.min, bounds.min), bounds.max);
  const max = Math.max(Math.min(range.max, bounds.max), min);
  return { min, max };
};

export const TRACK_SMOOTHING_RANGE: NumericRange = { min: 0, max: 5 };

export type UseTrackSelectionResult = ReturnType<typeof useTrackSelection>;

export type UseTrackSelectionOptions = {
  channels: ChannelSource[];
  rawTracksByChannel: Map<string, TrackDefinition[]>;
  volumeTimepointCount: number;
  channelTrackStates: Record<string, ChannelTrackState>;
  setChannelTrackStates: Dispatch<SetStateAction<Record<string, ChannelTrackState>>>;
  ensureTrackIsVisible: (track: TrackDefinition) => void;
};

export const useTrackSelection = ({
  channels,
  rawTracksByChannel,
  volumeTimepointCount,
  channelTrackStates,
  setChannelTrackStates,
  ensureTrackIsVisible
}: UseTrackSelectionOptions) => {
  const [trackOrderModeByChannel, setTrackOrderModeByChannel] = useState<Record<string, 'id' | 'length'>>({});
  const [selectedTrackOrder, setSelectedTrackOrder] = useState<string[]>([]);
  const selectedTrackIds = useMemo(() => new Set(selectedTrackOrder), [selectedTrackOrder]);
  const [selectedTracksAmplitudeLimits, setSelectedTracksAmplitudeLimits] = useState<NumericRange | null>(null);
  const [selectedTracksTimeLimits, setSelectedTracksTimeLimits] = useState<NumericRange | null>(null);
  const [trackSmoothing, setTrackSmoothing] = useState(0);
  const [pendingMinimumTrackLength, setPendingMinimumTrackLength] = useState(1);
  const [minimumTrackLength, setMinimumTrackLength] = useState(1);
  const [followedTrack, setFollowedTrack] = useState<FollowedTrackState>(null);
  const [activeTrackChannelId, setActiveTrackChannelId] = useState<string | null>(null);
  const previousAmplitudeExtentRef = useRef<NumericRange | null>(null);
  const previousTimeExtentRef = useRef<NumericRange | null>(null);

  const {
    parsedTracksByChannel,
    plotTracksByChannel,
    parsedTracks,
    trackLookup,
    filteredTracksByChannel,
    filteredTracks,
    filteredTrackLookup,
    plotFilteredTracksByChannel,
    plotFilteredTracks,
    plotFilteredTrackLookup,
    selectedTrackSeries,
    trackExtents,
    selectedTrackExtents
  } = useTracksForDisplay({
    rawTracksByChannel,
    channels,
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

  const trackSummaryByChannel = useMemo(() => {
    const summary = new Map<string, { total: number; visible: number }>();
    for (const channel of channels) {
      const tracksForChannel = filteredTracksByChannel.get(channel.id) ?? [];
      const state = channelTrackStates[channel.id] ?? createDefaultChannelTrackState();
      let visible = 0;
      for (const track of tracksForChannel) {
        const explicitVisible = state.visibility[track.id] ?? true;
        const isFollowedTrack = followedTrack?.id === track.id;
        const isSelectedTrack = selectedTrackIds.has(track.id);
        if (explicitVisible || isFollowedTrack || isSelectedTrack) {
          visible += 1;
        }
      }
      summary.set(channel.id, { total: tracksForChannel.length, visible });
    }
    return summary;
  }, [channels, channelTrackStates, filteredTracksByChannel, followedTrack, selectedTrackIds]);

  const trackVisibility = useMemo(() => {
    const visibility: Record<string, boolean> = {};
    for (const channel of channels) {
      const tracksForChannel = filteredTracksByChannel.get(channel.id) ?? [];
      const state = channelTrackStates[channel.id] ?? createDefaultChannelTrackState();
      for (const track of tracksForChannel) {
        visibility[track.id] = state.visibility[track.id] ?? true;
      }
    }
    return visibility;
  }, [channelTrackStates, channels, filteredTracksByChannel]);

  const followedTrackId = followedTrack?.id ?? null;
  const followedTrackChannelId = followedTrack?.channelId ?? null;

  const handleTrackOrderToggle = useCallback((channelId: string) => {
    setTrackOrderModeByChannel((current) => {
      const previous = current[channelId] ?? 'id';
      const nextMode = previous === 'id' ? 'length' : 'id';
      if (current[channelId] === nextMode) {
        return current;
      }
      return {
        ...current,
        [channelId]: nextMode
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
        if (current.includes(trackId)) {
          return current.filter((id) => id !== trackId);
        }
        didSelect = true;
        return [...current, trackId];
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
        setSelectedTrackOrder((current) =>
          current.includes(trackId) ? current : [...current, trackId]
        );
      }

      setFollowedTrack((current) => (current && current.id === trackId ? null : { id: trackId, channelId: track.channelId }));
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

      setSelectedTrackOrder((current) =>
        current.includes(trackId) ? current : [...current, trackId]
      );

      setFollowedTrack((current) => (current && current.id === trackId ? current : { id: trackId, channelId: track.channelId }));
      ensureTrackIsVisible(track);
      setActiveTrackChannelId(track.channelId);
    },
    [ensureTrackIsVisible, trackLookup]
  );

  const handleTrackChannelSelect = useCallback((channelId: string) => {
    setActiveTrackChannelId(channelId);
  }, []);

  const handleStopTrackFollow = useCallback((channelId?: string) => {
    if (!channelId) {
      setFollowedTrack(null);
      return;
    }
    setFollowedTrack((current) => (current && current.channelId === channelId ? null : current));
  }, []);

  const handleTrackVisibilityToggle = useCallback(
    (trackId: string) => {
      const track = trackLookup.get(trackId);
      if (!track) {
        return;
      }

      let nextVisible = true;
      setChannelTrackStates((current) => {
        const existing = current[track.channelId] ?? createDefaultChannelTrackState();
        const previous = existing.visibility[trackId] ?? true;
        nextVisible = !previous;
        return {
          ...current,
          [track.channelId]: {
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
        setSelectedTrackOrder((current) =>
          current.includes(trackId) ? current.filter((id) => id !== trackId) : current
        );
      }
    },
    [setChannelTrackStates, trackLookup]
  );

  const handleTrackVisibilityAllChange = useCallback(
    (channelId: string, isChecked: boolean) => {
      const tracksForChannel = parsedTracksByChannel.get(channelId) ?? [];
      setChannelTrackStates((current) => {
        const existing = current[channelId] ?? createDefaultChannelTrackState();
        const visibility: Record<string, boolean> = {};
        for (const track of tracksForChannel) {
          visibility[track.id] = isChecked;
        }
        return {
          ...current,
          [channelId]: {
            ...existing,
            visibility
          }
        };
      });

      if (!isChecked) {
        setFollowedTrack((current) => (current && current.channelId === channelId ? null : current));
        const trackIdsForChannel = new Set(tracksForChannel.map((track) => track.id));
        setSelectedTrackOrder((current) => {
          if (current.length === 0) {
            return current;
          }
          const filtered = current.filter((id) => !trackIdsForChannel.has(id));
          return filtered.length === current.length ? current : filtered;
        });
      }
    },
    [parsedTracksByChannel, setChannelTrackStates]
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

  const handleClearSelectedTracks = useCallback(() => {
    setSelectedTrackOrder([]);
    setFollowedTrack(null);
  }, []);

  const resetTrackSelection = useCallback(() => {
    setTrackOrderModeByChannel({});
    setSelectedTrackOrder([]);
    setFollowedTrack(null);
    setSelectedTracksAmplitudeLimits(null);
    setSelectedTracksTimeLimits(null);
    setTrackSmoothing(0);
    setPendingMinimumTrackLength(1);
    setMinimumTrackLength(1);
    setActiveTrackChannelId(null);
  }, []);

  const hasParsedTrackData = parsedTracks.length > 0;

  return {
    trackOrderModeByChannel,
    setTrackOrderModeByChannel,
    selectedTrackOrder,
    setSelectedTrackOrder,
    selectedTrackIds,
    selectedTracksAmplitudeLimits,
    selectedTracksTimeLimits,
    trackSmoothing,
    pendingMinimumTrackLength,
    minimumTrackLength,
    followedTrack,
    setFollowedTrack,
    activeTrackChannelId,
    setActiveTrackChannelId,
    parsedTracksByChannel,
    plotTracksByChannel,
    parsedTracks,
    trackLookup,
    filteredTracksByChannel,
    filteredTracks,
    filteredTrackLookup,
    plotFilteredTracksByChannel,
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
    trackSummaryByChannel,
    trackVisibility,
    followedTrackId,
    followedTrackChannelId,
    handleTrackOrderToggle,
    handleTrackSelectionToggle,
    handleTrackFollow,
    handleTrackFollowFromViewer,
    handleTrackChannelSelect,
    handleStopTrackFollow,
    handleTrackVisibilityToggle,
    handleTrackVisibilityAllChange,
    handleMinimumTrackLengthChange,
    handleMinimumTrackLengthApply,
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
