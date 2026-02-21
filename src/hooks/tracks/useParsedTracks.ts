import { useCallback, useEffect, useMemo, type Dispatch, type SetStateAction } from 'react';
import type { TrackDefinition } from '../../types/tracks';
import type { ChannelSource, TrackSetSource } from '../dataset';
import { collectFilesFromDataTransfer, parseTrackCsvFile } from '../../shared/utils/appHelpers';
import { buildTracksFromCsvEntries } from '../../shared/utils/trackCsvParsing';
import { normalizeEntityName } from '../../constants/naming';

export type TrackSetDescriptor = {
  id: string;
  name: string;
  boundChannelId: string | null;
  boundChannelName: string | null;
  fileName: string;
};

export type UseParsedTracksOptions = {
  tracks: TrackSetSource[];
  setTracks: Dispatch<SetStateAction<TrackSetSource[]>>;
  channels: ChannelSource[];
  createTrackSetSource: (name: string, boundChannelId: string | null) => TrackSetSource;
  updateTrackSetIdCounter: (sources: TrackSetSource[]) => void;
};

export const useParsedTracks = ({
  tracks,
  setTracks,
  channels,
  createTrackSetSource,
  updateTrackSetIdCounter
}: UseParsedTracksOptions) => {
  useEffect(() => {
    updateTrackSetIdCounter(tracks);
  }, [tracks, updateTrackSetIdCounter]);

  const channelNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const channel of channels) {
      map.set(channel.id, channel.name.trim() || 'Unnamed channel');
    }
    return map;
  }, [channels]);

  const trackSets = useMemo(() => {
    return tracks.map<TrackSetDescriptor>((set) => {
      const boundChannelId = set.boundChannelId;
      const normalizedTrackSetName = normalizeEntityName(set.name);
      return {
        id: set.id,
        name: normalizedTrackSetName,
        boundChannelId,
        boundChannelName: boundChannelId ? (channelNameById.get(boundChannelId) ?? null) : null,
        fileName: set.fileName
      };
    });
  }, [channelNameById, tracks]);

  const rawTracksByTrackSet = useMemo(() => {
    const map = new Map<string, TrackDefinition[]>();

    for (const set of tracks) {
      const entries = set.entries;
      if (entries.length === 0) {
        map.set(set.id, []);
        continue;
      }

      const boundChannelId = set.boundChannelId;
      const normalizedTrackSetName = normalizeEntityName(set.name);
      map.set(
        set.id,
        buildTracksFromCsvEntries({
          trackSetId: set.id,
          trackSetName: normalizedTrackSetName,
          channelId: boundChannelId,
          channelName: boundChannelId ? (channelNameById.get(boundChannelId) ?? null) : null,
          entries
        })
      );
    }

    return map;
  }, [channelNameById, tracks]);

  const updateTrackSet = useCallback(
    (trackSetId: string, updater: (set: TrackSetSource) => TrackSetSource) => {
      setTracks((current) => current.map((set) => (set.id === trackSetId ? updater(set) : set)));
    },
    [setTracks]
  );

  const handleAddTrackSet = useCallback(() => {
    setTracks((current) => [...current, createTrackSetSource('', null)]);
  }, [createTrackSetSource, setTracks]);

  const handleTrackFilesAdded = useCallback(
    async (trackSetId: string, files: File[]) => {
      const csvFiles = files.filter((file) => file.name.toLowerCase().endsWith('.csv'));
      if (csvFiles.length === 0) {
        return;
      }

      const file = csvFiles[0];
      updateTrackSet(trackSetId, (set) => ({
        ...set,
        file,
        fileName: file.name,
        status: 'loading',
        error: null,
        entries: []
      }));

      try {
        const rows = await parseTrackCsvFile(file);
        updateTrackSet(trackSetId, (set) => ({
          ...set,
          file,
          fileName: file.name,
          status: 'loaded',
          error: null,
          entries: rows
        }));
      } catch (err) {
        console.error('Failed to load tracks CSV', err);
        const message = err instanceof Error ? err.message : 'Failed to load tracks.';
        updateTrackSet(trackSetId, (set) => ({
          ...set,
          file: null,
          status: 'error',
          error: message,
          entries: []
        }));
      }
    },
    [updateTrackSet]
  );

  const handleTrackDrop = useCallback(
    async (trackSetId: string, dataTransfer: DataTransfer) => {
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
      await handleTrackFilesAdded(trackSetId, [csvFiles[0]]);
    },
    [handleTrackFilesAdded]
  );

  const handleTrackSetNameChange = useCallback(
    (trackSetId: string, name: string) => {
      updateTrackSet(trackSetId, (set) => ({ ...set, name }));
    },
    [updateTrackSet]
  );

  const handleTrackSetBoundChannelChange = useCallback(
    (trackSetId: string, boundChannelId: string | null) => {
      updateTrackSet(trackSetId, (set) => ({ ...set, boundChannelId }));
    },
    [updateTrackSet]
  );

  const handleTrackSetClearFile = useCallback(
    (trackSetId: string) => {
      updateTrackSet(trackSetId, (set) => ({
        ...set,
        file: null,
        fileName: '',
        status: 'idle',
        error: null,
        entries: []
      }));
    },
    [updateTrackSet]
  );

  const handleTrackSetRemove = useCallback(
    (trackSetId: string) => {
      setTracks((current) => current.filter((set) => set.id !== trackSetId));
    },
    [setTracks]
  );

  return {
    trackSets,
    rawTracksByTrackSet,
    handleAddTrackSet,
    handleTrackFilesAdded,
    handleTrackDrop,
    handleTrackSetNameChange,
    handleTrackSetBoundChannelChange,
    handleTrackSetClearFile,
    handleTrackSetRemove
  };
};

export default useParsedTracks;
