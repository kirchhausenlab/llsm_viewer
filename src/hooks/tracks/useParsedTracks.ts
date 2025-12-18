import { useCallback, useMemo, type Dispatch, type SetStateAction } from 'react';
import type { TrackDefinition } from '../../types/tracks';
import type { ExperimentDimension } from '../useVoxelResolution';
import type { ChannelSource } from '../dataset';
import { collectFilesFromDataTransfer, parseTrackCsvFile } from '../../shared/utils/appHelpers';
import { buildTracksFromCsvEntries } from '../../shared/utils/trackCsvParsing';

export type UseParsedTracksOptions = {
  channels: ChannelSource[];
  setChannels: Dispatch<SetStateAction<ChannelSource[]>>;
  experimentDimension: ExperimentDimension;
};

export const useParsedTracks = ({ channels, setChannels, experimentDimension }: UseParsedTracksOptions) => {
  const rawTracksByChannel = useMemo(() => {
    const map = new Map<string, TrackDefinition[]>();

    for (const channel of channels) {
      const entries = channel.trackEntries;
      if (entries.length === 0) {
        map.set(channel.id, []);
        continue;
      }
      map.set(
        channel.id,
        buildTracksFromCsvEntries({
          channelId: channel.id,
          channelName: channel.name,
          entries,
          experimentDimension
        })
      );
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
