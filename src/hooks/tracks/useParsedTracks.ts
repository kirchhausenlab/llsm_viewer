import { useCallback, useEffect, useMemo, useRef, type Dispatch, type SetStateAction } from 'react';
import type { TrackDefinition } from '../../types/tracks';
import type { ExperimentDimension } from '../useVoxelResolution';
import type { ChannelSource, TrackSetSource } from '../dataset';
import { collectFilesFromDataTransfer, parseTrackCsvFile } from '../../shared/utils/appHelpers';
import { buildTracksFromCsvEntries } from '../../shared/utils/trackCsvParsing';

export type TrackSetDescriptor = {
  id: string;
  channelId: string;
  channelName: string;
  name: string;
  fileName: string;
};

export type UseParsedTracksOptions = {
  channels: ChannelSource[];
  setChannels: Dispatch<SetStateAction<ChannelSource[]>>;
  experimentDimension: ExperimentDimension;
};

const DEFAULT_TRACK_SET_NAME = 'Tracks';

function normalizeTrackSetName(name: string): string {
  const trimmed = name.trim();
  return trimmed || DEFAULT_TRACK_SET_NAME;
}

export const useParsedTracks = ({ channels, setChannels, experimentDimension }: UseParsedTracksOptions) => {
  const trackSetIdRef = useRef(0);

  useEffect(() => {
    if (channels.length === 0) {
      trackSetIdRef.current = 0;
      return;
    }
    let maxId = trackSetIdRef.current;
    for (const channel of channels) {
      for (const set of channel.trackSets) {
        const match = /^track-set-(\d+)$/.exec(set.id);
        if (!match) {
          continue;
        }
        const value = Number.parseInt(match[1] ?? '', 10);
        if (Number.isFinite(value) && value > maxId) {
          maxId = value;
        }
      }
    }
    trackSetIdRef.current = maxId;
  }, [channels]);

  const trackSets = useMemo(() => {
    const list: TrackSetDescriptor[] = [];
    for (const channel of channels) {
      const channelName = channel.name.trim() || 'Untitled channel';
      for (const set of channel.trackSets) {
        list.push({
          id: set.id,
          channelId: channel.id,
          channelName,
          name: normalizeTrackSetName(set.name),
          fileName: set.fileName
        });
      }
    }
    return list;
  }, [channels]);

  const rawTracksByTrackSet = useMemo(() => {
    const map = new Map<string, TrackDefinition[]>();

    for (const channel of channels) {
      for (const set of channel.trackSets) {
        const entries = set.entries;
        if (entries.length === 0) {
          map.set(set.id, []);
          continue;
        }
        map.set(
          set.id,
          buildTracksFromCsvEntries({
            trackSetId: set.id,
            trackSetName: normalizeTrackSetName(set.name),
            channelId: channel.id,
            channelName: channel.name,
            entries,
            experimentDimension
          })
        );
      }
    }

    return map;
  }, [channels, experimentDimension]);

  const createTrackSetSource = useCallback((file: File): TrackSetSource => {
    const nextId = trackSetIdRef.current + 1;
    trackSetIdRef.current = nextId;
    return {
      id: `track-set-${nextId}`,
      name: file.name.replace(/\.csv$/i, ''),
      file,
      fileName: file.name,
      status: 'loading',
      error: null,
      entries: []
    };
  }, []);

  const updateTrackSet = useCallback(
    (channelId: string, trackSetId: string, updater: (set: TrackSetSource) => TrackSetSource) => {
      setChannels((current) =>
        current.map((channel) => {
          if (channel.id !== channelId) {
            return channel;
          }
          const nextSets = channel.trackSets.map((set) => (set.id === trackSetId ? updater(set) : set));
          return nextSets === channel.trackSets ? channel : { ...channel, trackSets: nextSets };
        })
      );
    },
    [setChannels]
  );

  const handleChannelTrackFilesAdded = useCallback(
    async (channelId: string, files: File[]) => {
      const csvFiles = files.filter((file) => file.name.toLowerCase().endsWith('.csv'));
      if (csvFiles.length === 0) {
        return;
      }

      const created: Array<{ channelId: string; trackSetId: string; file: File }> = [];
      setChannels((current) =>
        current.map((channel) => {
          if (channel.id !== channelId) {
            return channel;
          }
          const nextSets = [...channel.trackSets];
          for (const file of csvFiles) {
            const source = createTrackSetSource(file);
            nextSets.push(source);
            created.push({ channelId, trackSetId: source.id, file });
          }
          return { ...channel, trackSets: nextSets };
        })
      );

      await Promise.all(
        created.map(async ({ channelId: resolvedChannelId, trackSetId, file }) => {
          try {
            const rows = await parseTrackCsvFile(file);
            updateTrackSet(resolvedChannelId, trackSetId, (set) => ({
              ...set,
              file,
              status: 'loaded',
              error: null,
              entries: rows
            }));
          } catch (err) {
            console.error('Failed to load tracks CSV', err);
            const message = err instanceof Error ? err.message : 'Failed to load tracks.';
            updateTrackSet(resolvedChannelId, trackSetId, (set) => ({
              ...set,
              file: null,
              status: 'error',
              error: message,
              entries: []
            }));
          }
        })
      );
    },
    [createTrackSetSource, setChannels, updateTrackSet]
  );

  const handleChannelTrackDrop = useCallback(
    async (channelId: string, dataTransfer: DataTransfer) => {
      let files: File[];
      try {
        files = await collectFilesFromDataTransfer(dataTransfer);
      } catch (error) {
        console.error('Failed to read dropped track files', error);
        return;
      }
      const csvFiles = files.filter((file) => file.name.toLowerCase().endsWith('.csv'));
      if (csvFiles.length === 0) {
        return;
      }
      await handleChannelTrackFilesAdded(channelId, csvFiles);
    },
    [handleChannelTrackFilesAdded]
  );

  const handleTrackSetNameChange = useCallback(
    (channelId: string, trackSetId: string, name: string) => {
      updateTrackSet(channelId, trackSetId, (set) => ({ ...set, name }));
    },
    [updateTrackSet]
  );

  const handleTrackSetRemove = useCallback(
    (channelId: string, trackSetId: string) => {
      setChannels((current) =>
        current.map((channel) => {
          if (channel.id !== channelId) {
            return channel;
          }
          const nextSets = channel.trackSets.filter((set) => set.id !== trackSetId);
          return nextSets.length === channel.trackSets.length ? channel : { ...channel, trackSets: nextSets };
        })
      );
    },
    [setChannels]
  );

  return {
    trackSets,
    rawTracksByTrackSet,
    handleChannelTrackFilesAdded,
    handleChannelTrackDrop,
    handleTrackSetNameChange,
    handleTrackSetRemove
  };
};

export default useParsedTracks;
