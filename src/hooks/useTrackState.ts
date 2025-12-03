import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { ChannelTrackState, FollowedTrackState } from '../types/channelTracks';
import type { NumericRange, TrackColorMode, TrackDefinition, TrackPoint } from '../types/tracks';
import type { ExperimentDimension } from './useVoxelResolution';
import type { ChannelSource } from './useChannelSources';
import { useTracksForDisplay } from './useTracksForDisplay';
import { TRACK_COLOR_SWATCHES, normalizeTrackColor } from '../trackColors';
import { collectFilesFromDataTransfer, parseTrackCsvFile } from '../utils/appHelpers';
import type { TrackColorOption } from '../trackColors';

export const DEFAULT_TRACK_OPACITY = 0.9;
export const DEFAULT_TRACK_LINE_WIDTH = 1;
export const TRACK_SMOOTHING_RANGE: NumericRange = { min: 0, max: 5 };

const createDefaultChannelTrackState = (): ChannelTrackState => ({
  opacity: DEFAULT_TRACK_OPACITY,
  lineWidth: DEFAULT_TRACK_LINE_WIDTH,
  visibility: {},
  colorMode: { type: 'random' }
});

const clampRangeToBounds = (range: NumericRange, bounds: NumericRange): NumericRange => {
  const min = Math.min(Math.max(range.min, bounds.min), bounds.max);
  const max = Math.max(Math.min(range.max, bounds.max), min);
  return { min, max };
};

export type UseTrackStateOptions = {
  channels: ChannelSource[];
  setChannels: Dispatch<SetStateAction<ChannelSource[]>>;
  experimentDimension: ExperimentDimension;
  volumeTimepointCount: number;
};

export const useTrackState = ({
  channels,
  setChannels,
  experimentDimension,
  volumeTimepointCount
}: UseTrackStateOptions) => {
  const [channelTrackStates, setChannelTrackStates] = useState<Record<string, ChannelTrackState>>({});
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
  const hasInitializedTrackColorsRef = useRef(false);

  useEffect(() => {
    if (channels.length === 0) {
      hasInitializedTrackColorsRef.current = false;
    }
  }, [channels.length]);

  const rawTracksByChannel = useMemo(() => {
    const map = new Map<string, TrackDefinition[]>();
    const is2dExperiment = experimentDimension === '2d';
    const minimumColumns = is2dExperiment ? 6 : 7;

    for (const channel of channels) {
      const entries = channel.trackEntries;
      if (entries.length === 0) {
        map.set(channel.id, []);
        continue;
      }

      const trackMap = new Map<number, TrackPoint[]>();

      for (const row of entries) {
        if (row.length < minimumColumns) {
          continue;
        }

        const rawId = Number(row[0]);
        const initialTime = Number(row[1]);
        const deltaTime = Number(row[2]);
        const x = Number(row[3]);
        const y = Number(row[4]);
        const amplitudeIndex = is2dExperiment && row.length < 7 ? 5 : 6;
        const rawZ = is2dExperiment ? (row.length >= 7 ? Number(row[5]) : 0) : Number(row[5]);
        const amplitudeRaw = Number(row[amplitudeIndex]);
        const hasValidZ = Number.isFinite(rawZ);
        const z = is2dExperiment ? (hasValidZ ? rawZ : 0) : rawZ;

        if (
          !Number.isFinite(rawId) ||
          !Number.isFinite(initialTime) ||
          !Number.isFinite(deltaTime) ||
          !Number.isFinite(x) ||
          !Number.isFinite(y) ||
          !Number.isFinite(amplitudeRaw) ||
          (!is2dExperiment && !hasValidZ)
        ) {
          continue;
        }

        const id = Math.trunc(rawId);
        const time = initialTime + deltaTime;
        const normalizedTime = Math.max(0, time - 1);
        const amplitude = Math.max(0, amplitudeRaw);
        const point: TrackPoint = { time: normalizedTime, x, y, z, amplitude };
        const existing = trackMap.get(id);
        if (existing) {
          existing.push(point);
        } else {
          trackMap.set(id, [point]);
        }
      }

      const parsed: TrackDefinition[] = [];

      const sortedEntries = Array.from(trackMap.entries()).sort((a, b) => a[0] - b[0]);
      sortedEntries.forEach(([sourceTrackId, points]) => {
        if (points.length === 0) {
          return;
        }

        const sortedPoints = [...points].sort((a, b) => a.time - b.time);
        const adjustedPoints = sortedPoints.map<TrackPoint>((point) => ({
          time: point.time,
          x: point.x,
          y: point.y,
          z: point.z,
          amplitude: point.amplitude
        }));

        parsed.push({
          id: `${channel.id}:${sourceTrackId}`,
          channelId: channel.id,
          channelName: channel.name.trim() || 'Untitled channel',
          trackNumber: sourceTrackId,
          sourceTrackId,
          points: adjustedPoints
        });
      });

      map.set(channel.id, parsed);
    }

    return map;
  }, [channels, experimentDimension]);

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
  const previousAmplitudeExtentRef = useRef<NumericRange | null>(null);
  const previousTimeExtentRef = useRef<NumericRange | null>(null);

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
    if (hasInitializedTrackColorsRef.current) {
      return;
    }

    const channelsWithTracks = channels.filter(
      (channel) => (parsedTracksByChannel.get(channel.id)?.length ?? 0) > 0
    );

    if (channelsWithTracks.length === 0) {
      return;
    }

    setChannelTrackStates((current) => {
      const next: Record<string, ChannelTrackState> = { ...current };
      let changed = false;

      const ensureState = (channelId: string) => {
        const existing = next[channelId];
        if (existing) {
          return existing;
        }
        const fallback = createDefaultChannelTrackState();
        next[channelId] = fallback;
        changed = true;
        return fallback;
      };

      if (channelsWithTracks.length === 1) {
        const channelId = channelsWithTracks[0].id;
        const state = ensureState(channelId);
        if (state.colorMode.type !== 'random') {
          next[channelId] = { ...state, colorMode: { type: 'random' } };
          changed = true;
        }
      } else {
        channelsWithTracks.forEach((channel, index) => {
          const state = ensureState(channel.id);
          if (index < TRACK_COLOR_SWATCHES.length) {
            const color = normalizeTrackColor(TRACK_COLOR_SWATCHES[index].value);
            if (state.colorMode.type !== 'uniform' || state.colorMode.color !== color) {
              next[channel.id] = { ...state, colorMode: { type: 'uniform', color } };
              changed = true;
            }
          } else if (state.colorMode.type !== 'random') {
            next[channel.id] = { ...state, colorMode: { type: 'random' } };
            changed = true;
          }
        });
      }

      return changed ? next : current;
    });

    hasInitializedTrackColorsRef.current = true;
  }, [channels, parsedTracksByChannel]);

  useEffect(() => {
    setChannelTrackStates((current) => {
      const next: Record<string, ChannelTrackState> = {};
      let changed = false;

      for (const channel of channels) {
        const channelId = channel.id;
        const existing = current[channelId] ?? createDefaultChannelTrackState();
        const tracks = parsedTracksByChannel.get(channelId) ?? [];

        const visibility: Record<string, boolean> = {};
        let visibilityChanged = false;
        for (const track of tracks) {
          const previous = existing.visibility[track.id];
          if (previous === undefined) {
            visibilityChanged = true;
          }
          visibility[track.id] = previous ?? true;
        }

        for (const key of Object.keys(existing.visibility)) {
          if (!(key in visibility)) {
            visibilityChanged = true;
            break;
          }
        }

        let nextState = existing;
        if (visibilityChanged) {
          nextState = { ...nextState, visibility };
        }

        next[channelId] = nextState;
        if (!current[channelId] || nextState !== existing) {
          changed = true;
        }
      }

      if (Object.keys(current).length !== channels.length) {
        changed = true;
      }

      return changed ? next : current;
    });
  }, [channels, parsedTracksByChannel]);

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

  const trackOpacityByChannel = useMemo(() => {
    const map: Record<string, number> = {};
    for (const channel of channels) {
      const state = channelTrackStates[channel.id] ?? createDefaultChannelTrackState();
      map[channel.id] = state.opacity;
    }
    return map;
  }, [channelTrackStates, channels]);

  const trackLineWidthByChannel = useMemo(() => {
    const map: Record<string, number> = {};
    for (const channel of channels) {
      const state = channelTrackStates[channel.id] ?? createDefaultChannelTrackState();
      map[channel.id] = state.lineWidth;
    }
    return map;
  }, [channelTrackStates, channels]);

  const channelTrackColorModes = useMemo(() => {
    const map: Record<string, TrackColorMode> = {};
    for (const channel of channels) {
      const state = channelTrackStates[channel.id] ?? createDefaultChannelTrackState();
      map[channel.id] = state.colorMode;
    }
    return map;
  }, [channelTrackStates, channels]);

  const followedTrackId = followedTrack?.id ?? null;
  const followedTrackChannelId = followedTrack?.channelId ?? null;

  const handleChannelTrackFileSelected = useCallback(
    (channelId: string, file: File | null) => {
      if (!file) {
        setChannels((current) =>
          current.map((channel) =>
            channel.id === channelId
              ? { ...channel, trackFile: null, trackStatus: 'idle', trackError: null, trackEntries: [] }
              : channel
          )
        );
        return;
      }

      if (!file.name.toLowerCase().endsWith('.csv')) {
        setChannels((current) =>
          current.map((channel) =>
            channel.id === channelId
              ? {
                  ...channel,
                  trackFile: null,
                  trackStatus: 'error',
                  trackError: 'Please drop a CSV file.',
                  trackEntries: []
                }
              : channel
          )
        );
        return;
      }

      setChannels((current) =>
        current.map((channel) =>
          channel.id === channelId
            ? { ...channel, trackFile: file, trackStatus: 'loading', trackError: null, trackEntries: [] }
            : channel
        )
      );

      parseTrackCsvFile(file)
        .then((rows) => {
          setChannels((current) =>
            current.map((channel) =>
              channel.id === channelId
                ? { ...channel, trackFile: file, trackStatus: 'loaded', trackError: null, trackEntries: rows }
                : channel
            )
          );
        })
        .catch((err) => {
          console.error('Failed to load tracks CSV', err);
          const message = err instanceof Error ? err.message : 'Failed to load tracks.';
          setChannels((current) =>
            current.map((channel) =>
              channel.id === channelId
                ? {
                    ...channel,
                    trackFile: null,
                    trackStatus: 'error',
                    trackError: message,
                    trackEntries: []
                  }
                : channel
            )
          );
        });
    },
    [setChannels]
  );

  const handleChannelTrackDrop = useCallback(
    async (channelId: string, dataTransfer: DataTransfer) => {
      const files = await collectFilesFromDataTransfer(dataTransfer);
      const csvFile = files.find((file) => file.name.toLowerCase().endsWith('.csv')) ?? null;
      if (!csvFile) {
        setChannels((current) =>
          current.map((channel) =>
            channel.id === channelId
              ? {
                  ...channel,
                  trackFile: null,
                  trackStatus: 'error',
                  trackError: 'Please drop a CSV file.',
                  trackEntries: []
                }
              : channel
          )
        );
        return;
      }
      handleChannelTrackFileSelected(channelId, csvFile);
    },
    [handleChannelTrackFileSelected, setChannels]
  );

  const handleChannelTrackClear = useCallback(
    (channelId: string) => handleChannelTrackFileSelected(channelId, null),
    [handleChannelTrackFileSelected]
  );

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
    [trackLookup]
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
    [parsedTracksByChannel]
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

  const handleTrackOpacityChange = useCallback((channelId: string, value: number) => {
    setChannelTrackStates((current) => {
      const existing = current[channelId] ?? createDefaultChannelTrackState();
      if (existing.opacity === value) {
        return current;
      }
      return {
        ...current,
        [channelId]: {
          ...existing,
          opacity: value
        }
      };
    });
  }, []);

  const handleTrackLineWidthChange = useCallback((channelId: string, value: number) => {
    setChannelTrackStates((current) => {
      const existing = current[channelId] ?? createDefaultChannelTrackState();
      if (existing.lineWidth === value) {
        return current;
      }
      return {
        ...current,
        [channelId]: {
          ...existing,
          lineWidth: value
        }
      };
    });
  }, []);

  const handleTrackColorSelect = useCallback((channelId: string, color: string | TrackColorOption) => {
    const normalized = typeof color === 'string' ? normalizeTrackColor(color) : normalizeTrackColor(color.value);
    setChannelTrackStates((current) => {
      const existing = current[channelId] ?? createDefaultChannelTrackState();
      if (existing.colorMode.type === 'uniform' && existing.colorMode.color === normalized) {
        return current;
      }
      return {
        ...current,
        [channelId]: {
          ...existing,
          colorMode: { type: 'uniform', color: normalized }
        }
      };
    });
  }, []);

  const handleTrackColorReset = useCallback((channelId: string) => {
    setChannelTrackStates((current) => {
      const existing = current[channelId] ?? createDefaultChannelTrackState();
      if (existing.colorMode.type === 'random') {
        return current;
      }
      return {
        ...current,
        [channelId]: {
          ...existing,
          colorMode: { type: 'random' }
        }
      };
    });
  }, []);

  const ensureTrackIsVisible = useCallback(
    (trackId: string) => {
      const track = trackLookup.get(trackId);
      if (!track) {
        return;
      }

      setChannelTrackStates((current) => {
        const existing = current[track.channelId] ?? createDefaultChannelTrackState();
        if (existing.visibility[trackId] ?? true) {
          return current;
        }
        return {
          ...current,
          [track.channelId]: {
            ...existing,
            visibility: {
              ...existing.visibility,
              [trackId]: true
            }
          }
        };
      });
    },
    [trackLookup]
  );

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
        ensureTrackIsVisible(trackId);
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
      ensureTrackIsVisible(trackId);
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
      ensureTrackIsVisible(trackId);
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

  const resetTrackState = useCallback(() => {
    setChannelTrackStates({});
    setTrackOrderModeByChannel({});
    setSelectedTrackOrder([]);
    setFollowedTrack(null);
    setSelectedTracksAmplitudeLimits(null);
    setSelectedTracksTimeLimits(null);
    setTrackSmoothing(0);
    setPendingMinimumTrackLength(1);
    setMinimumTrackLength(1);
    setActiveTrackChannelId(null);
    hasInitializedTrackColorsRef.current = false;
  }, []);

  const hasParsedTrackData = parsedTracks.length > 0;

  return {
    channelTrackStates,
    setChannelTrackStates,
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
    rawTracksByChannel,
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
    trackOpacityByChannel,
    trackLineWidthByChannel,
    channelTrackColorModes,
    followedTrackId,
    followedTrackChannelId,
    handleChannelTrackFileSelected,
    handleChannelTrackDrop,
    handleChannelTrackClear,
    handleTrackVisibilityToggle,
    handleTrackVisibilityAllChange,
    handleMinimumTrackLengthChange,
    handleMinimumTrackLengthApply,
    handleTrackOrderToggle,
    handleTrackOpacityChange,
    handleTrackLineWidthChange,
    handleTrackColorSelect,
    handleTrackColorReset,
    handleTrackSelectionToggle,
    handleTrackFollow,
    handleTrackFollowFromViewer,
    handleTrackChannelSelect,
    handleStopTrackFollow,
    handleSelectedTracksAmplitudeLimitsChange,
    handleSelectedTracksTimeLimitsChange,
    handleSelectedTracksAutoRange,
    handleTrackSmoothingChange,
    handleClearSelectedTracks,
    resetTrackState,
    hasParsedTrackData
  };
};

export default useTrackState;
