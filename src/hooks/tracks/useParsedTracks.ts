import { useCallback, useMemo, type Dispatch, type SetStateAction } from 'react';
import type { TrackDefinition, TrackPoint } from '../../types/tracks';
import type { ExperimentDimension } from '../useVoxelResolution';
import type { ChannelSource } from '../dataset';
import { collectFilesFromDataTransfer, parseTrackCsvFile } from '../../shared/utils/appHelpers';

export type UseParsedTracksOptions = {
  channels: ChannelSource[];
  setChannels: Dispatch<SetStateAction<ChannelSource[]>>;
  experimentDimension: ExperimentDimension;
};

export const useParsedTracks = ({ channels, setChannels, experimentDimension }: UseParsedTracksOptions) => {
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

  return {
    rawTracksByChannel,
    handleChannelTrackFileSelected,
    handleChannelTrackDrop,
    handleChannelTrackClear
  };
};

export default useParsedTracks;
