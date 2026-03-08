import { useCallback, useEffect, useMemo, useRef, type Dispatch, type SetStateAction } from 'react';
import type { CompiledTrackSetPayload, CompiledTrackSummary } from '../../types/tracks';
import type { ChannelSource, TrackSetSource } from '../dataset';
import { collectFilesFromDataTransfer, parseTrackCsvFile } from '../../shared/utils/appHelpers';
import { normalizeEntityName } from '../../constants/naming';
import { compileTrackEntries } from '../../shared/utils/compiledTracks';

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
  const inFlightCompiledPayloadLoadsRef = useRef<Map<string, Promise<CompiledTrackSetPayload | null>>>(new Map());

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

  const parsedTracksByTrackSet = useMemo(() => {
    const map = new Map<string, CompiledTrackSummary[]>();

    for (const set of tracks) {
      const compiledSummary = set.compiledSummary;
      if (!compiledSummary) {
        map.set(set.id, []);
        continue;
      }

      const boundChannelId = set.boundChannelId;
      const normalizedTrackSetName = normalizeEntityName(set.name);
      map.set(set.id, compiledSummary.tracks.map((track) => ({
        ...track,
        trackSetName: normalizedTrackSetName,
        channelId: boundChannelId,
        channelName: boundChannelId ? (channelNameById.get(boundChannelId) ?? null) : null
      })));
    }

    return map;
  }, [channelNameById, tracks]);

  const compiledPayloadByTrackSet = useMemo(() => {
    const map = new Map<string, CompiledTrackSetPayload>();
    for (const set of tracks) {
      if (set.compiledPayload) {
        map.set(set.id, set.compiledPayload);
      }
    }
    return map;
  }, [tracks]);

  const trackSetById = useMemo(() => {
    const map = new Map<string, TrackSetSource>();
    for (const set of tracks) {
      map.set(set.id, set);
    }
    return map;
  }, [tracks]);

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
        compiledSummary: null,
        compiledPayload: null,
        loadCompiledPayload: null
      }));

      try {
        const rows = await parseTrackCsvFile(file);
        const normalizedTrackSetName = normalizeEntityName(file.name.replace(/\.csv$/i, '').trim()) || 'Tracks';
        const compiled = compileTrackEntries({
          trackSetId,
          trackSetName: normalizedTrackSetName,
          channelId: null,
          channelName: null,
          entries: rows
        });
        updateTrackSet(trackSetId, (set) => ({
          ...set,
          file,
          fileName: file.name,
          status: 'loaded',
          error: null,
          compiledSummary: compiled.summary,
          compiledPayload: compiled.payload,
          loadCompiledPayload: async () => compiled.payload
        }));
      } catch (err) {
        console.error('Failed to load tracks CSV', err);
        const message = err instanceof Error ? err.message : 'Failed to load tracks.';
        updateTrackSet(trackSetId, (set) => ({
          ...set,
          file: null,
          status: 'error',
          error: message,
          compiledSummary: null,
          compiledPayload: null,
          loadCompiledPayload: null
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
        compiledSummary: null,
        compiledPayload: null,
        loadCompiledPayload: null
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

  const ensureCompiledPayloadsLoaded = useCallback(
    (trackSetIds: Iterable<string>) => {
      for (const trackSetId of trackSetIds) {
        const trackSet = trackSetById.get(trackSetId);
        if (!trackSet || trackSet.compiledPayload || !trackSet.loadCompiledPayload) {
          continue;
        }
        if (inFlightCompiledPayloadLoadsRef.current.has(trackSetId)) {
          continue;
        }

        const loadPromise = trackSet.loadCompiledPayload()
          .then((payload) => {
            setTracks((current) =>
              current.map((set) =>
                set.id === trackSetId
                  ? {
                      ...set,
                      compiledPayload: set.compiledPayload ?? payload,
                      status: set.status === 'error' ? 'loaded' : set.status,
                      error: null
                    }
                  : set
              )
            );
            return payload;
          })
          .catch((error) => {
            console.error(`Failed to load compiled payload for track set ${trackSetId}`, error);
            const message = error instanceof Error ? error.message : 'Failed to load compiled track payload.';
            setTracks((current) =>
              current.map((set) =>
                set.id === trackSetId
                  ? {
                      ...set,
                      status: 'error',
                      error: message
                    }
                  : set
              )
            );
            return null;
          })
          .finally(() => {
            inFlightCompiledPayloadLoadsRef.current.delete(trackSetId);
          });

        inFlightCompiledPayloadLoadsRef.current.set(trackSetId, loadPromise);
      }
    },
    [setTracks, trackSetById]
  );

  return {
    trackSets,
    parsedTracksByTrackSet,
    compiledPayloadByTrackSet,
    ensureCompiledPayloadsLoaded,
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
