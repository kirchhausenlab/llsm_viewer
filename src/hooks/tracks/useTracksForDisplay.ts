import { useMemo } from 'react';
import { getTrackColorHex } from '../../shared/colorMaps/trackColors';
import type { NumericRange, TrackDefinition, TrackPoint } from '../../types/tracks';
import { applyGaussianAmplitudeSmoothing } from '../../shared/utils/trackSmoothing';

export type TrackSeriesEntry = {
  id: string;
  channelId: string;
  channelName: string;
  trackNumber: number;
  displayTrackNumber?: string;
  color: string;
  rawPoints: TrackPoint[];
  points: TrackPoint[];
};

export type TrackExtents = {
  amplitude: NumericRange;
  time: NumericRange;
};

export type SelectedTrackExtents = {
  amplitude: NumericRange | null;
  time: NumericRange | null;
};

type UseTracksForDisplayParams = {
  rawTracksByChannel: Map<string, TrackDefinition[]>;
  channels: Array<{ id: string }>;
  selectedTrackOrder: string[];
  minimumTrackLength: number;
  trackSmoothing: number;
  volumeTimepointCount: number;
};

type UseTracksForDisplayResult = {
  parsedTracksByChannel: Map<string, TrackDefinition[]>;
  plotTracksByChannel: Map<string, TrackDefinition[]>;
  parsedTracks: TrackDefinition[];
  trackLookup: Map<string, TrackDefinition>;
  filteredTracksByChannel: Map<string, TrackDefinition[]>;
  filteredTracks: TrackDefinition[];
  filteredTrackLookup: Map<string, TrackDefinition>;
  plotFilteredTracksByChannel: Map<string, TrackDefinition[]>;
  plotFilteredTracks: TrackDefinition[];
  plotFilteredTrackLookup: Map<string, TrackDefinition>;
  selectedTrackSeries: TrackSeriesEntry[];
  trackExtents: TrackExtents;
  selectedTrackExtents: SelectedTrackExtents;
};

const computeOrderedTracks = (
  tracksByChannel: Map<string, TrackDefinition[]>,
  channels: Array<{ id: string }>
): TrackDefinition[] => {
  const ordered: TrackDefinition[] = [];
  for (const channel of channels) {
    const channelTracks = tracksByChannel.get(channel.id) ?? [];
    ordered.push(...channelTracks);
  }
  return ordered;
};

export function useTracksForDisplay({
  rawTracksByChannel,
  channels,
  selectedTrackOrder,
  minimumTrackLength,
  trackSmoothing,
  volumeTimepointCount
}: UseTracksForDisplayParams): UseTracksForDisplayResult {
  const parsedTracksByChannel = useMemo(
    () => rawTracksByChannel,
    [rawTracksByChannel]
  );

  const plotTracksByChannel = useMemo(() => {
    if (!Number.isFinite(trackSmoothing) || trackSmoothing <= 0) {
      return parsedTracksByChannel;
    }

    const map = new Map<string, TrackDefinition[]>();
    for (const [channelId, tracks] of parsedTracksByChannel.entries()) {
      map.set(channelId, applyGaussianAmplitudeSmoothing(tracks, trackSmoothing));
    }
    return map;
  }, [parsedTracksByChannel, trackSmoothing]);

  const parsedTracks = useMemo(
    () => computeOrderedTracks(parsedTracksByChannel, channels),
    [channels, parsedTracksByChannel]
  );

  const trackLookup = useMemo(() => {
    const map = new Map<string, TrackDefinition>();
    for (const track of parsedTracks) {
      map.set(track.id, track);
    }
    return map;
  }, [parsedTracks]);

  const filteredTracksByChannel = useMemo(() => {
    const map = new Map<string, TrackDefinition[]>();

    for (const channel of channels) {
      const tracksForChannel = parsedTracksByChannel.get(channel.id) ?? [];
      const filtered = tracksForChannel.filter((track) => track.points.length >= minimumTrackLength);
      map.set(channel.id, filtered);
    }

    return map;
  }, [channels, minimumTrackLength, parsedTracksByChannel]);

  const filteredTracks = useMemo(
    () => computeOrderedTracks(filteredTracksByChannel, channels),
    [channels, filteredTracksByChannel]
  );

  const filteredTrackLookup = useMemo(() => {
    const map = new Map<string, TrackDefinition>();
    for (const track of filteredTracks) {
      map.set(track.id, track);
    }
    return map;
  }, [filteredTracks]);

  const plotFilteredTracksByChannel = useMemo(() => {
    const map = new Map<string, TrackDefinition[]>();

    for (const channel of channels) {
      const tracksForChannel = plotTracksByChannel.get(channel.id) ?? [];
      const filtered = tracksForChannel.filter((track) => track.points.length >= minimumTrackLength);
      map.set(channel.id, filtered);
    }

    return map;
  }, [channels, minimumTrackLength, plotTracksByChannel]);

  const plotFilteredTracks = useMemo(
    () => computeOrderedTracks(plotFilteredTracksByChannel, channels),
    [channels, plotFilteredTracksByChannel]
  );

  const plotFilteredTrackLookup = useMemo(() => {
    const map = new Map<string, TrackDefinition>();
    for (const track of plotFilteredTracks) {
      map.set(track.id, track);
    }
    return map;
  }, [plotFilteredTracks]);

  const selectedTrackSeries = useMemo(() => {
    const series: TrackSeriesEntry[] = [];
    for (const trackId of selectedTrackOrder) {
      const rawTrack = filteredTrackLookup.get(trackId);
      const plotTrack = plotFilteredTrackLookup.get(trackId) ?? rawTrack;
      if (!rawTrack || !plotTrack) {
        continue;
      }
      series.push({
        id: plotTrack.id,
        channelId: plotTrack.channelId,
        channelName: plotTrack.channelName,
        trackNumber: plotTrack.trackNumber,
        displayTrackNumber: plotTrack.displayTrackNumber,
        color: getTrackColorHex(plotTrack.id),
        rawPoints: rawTrack.points,
        points: plotTrack.points
      });
    }
    return series;
  }, [filteredTrackLookup, plotFilteredTrackLookup, selectedTrackOrder]);

  const trackExtents = useMemo(() => {
    let amplitudeMin = Number.POSITIVE_INFINITY;
    let amplitudeMax = Number.NEGATIVE_INFINITY;
    let timeMin = Number.POSITIVE_INFINITY;
    let timeMax = Number.NEGATIVE_INFINITY;

    const extentTracks =
      Number.isFinite(trackSmoothing) && trackSmoothing > 0
        ? [...plotFilteredTracks, ...filteredTracks]
        : plotFilteredTracks;

    for (const track of extentTracks) {
      for (const point of track.points) {
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

    const hasAmplitude = Number.isFinite(amplitudeMin) && Number.isFinite(amplitudeMax);
    const hasTime = Number.isFinite(timeMin) && Number.isFinite(timeMax);
    const fallbackTimeMax = Math.max(volumeTimepointCount - 1, 0);

    return {
      amplitude: hasAmplitude ? { min: amplitudeMin, max: amplitudeMax } : { min: 0, max: 1 },
      time: hasTime ? { min: timeMin, max: timeMax } : { min: 0, max: fallbackTimeMax }
    };
  }, [filteredTracks, plotFilteredTracks, trackSmoothing, volumeTimepointCount]);

  const selectedTrackExtents = useMemo(() => {
    let amplitudeMin = Number.POSITIVE_INFINITY;
    let amplitudeMax = Number.NEGATIVE_INFINITY;
    let timeMin = Number.POSITIVE_INFINITY;
    let timeMax = Number.NEGATIVE_INFINITY;

    for (const entry of selectedTrackSeries) {
      const pointSources =
        Number.isFinite(trackSmoothing) && trackSmoothing > 0
          ? [entry.points, entry.rawPoints]
          : [entry.points];
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

    const hasAmplitude = Number.isFinite(amplitudeMin) && Number.isFinite(amplitudeMax);
    const hasTime = Number.isFinite(timeMin) && Number.isFinite(timeMax);

    return {
      amplitude: hasAmplitude ? { min: amplitudeMin, max: amplitudeMax } : null,
      time: hasTime ? { min: timeMin, max: timeMax } : null
    } as const;
  }, [selectedTrackSeries, trackSmoothing]);

  return {
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
  };
}
