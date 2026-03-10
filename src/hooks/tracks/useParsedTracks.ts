import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { CompiledTrackSetHeader, CompiledTrackSetPayload, CompiledTrackSummary } from '../../types/tracks';
import type { ChannelSource, TrackSetSource } from '../dataset';
import { collectFilesFromDataTransfer, parseTrackCsvFile } from '../../shared/utils/appHelpers';
import { normalizeEntityName } from '../../constants/naming';
import { buildCompiledTrackSetHeader, compileTrackEntries } from '../../shared/utils/compiledTracks';

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
  const compiledCatalogCacheRef = useRef<Map<string, CompiledTrackSummary[]>>(new Map());
  const compiledPayloadCacheRef = useRef<Map<string, CompiledTrackSetPayload>>(new Map());
  const inFlightCompiledCatalogLoadsRef = useRef<Map<string, Promise<CompiledTrackSummary[] | null>>>(new Map());
  const inFlightCompiledPayloadLoadsRef = useRef<Map<string, Promise<CompiledTrackSetPayload | null>>>(new Map());
  const [catalogCacheVersion, setCatalogCacheVersion] = useState(0);
  const [payloadCacheVersion, setPayloadCacheVersion] = useState(0);

  useEffect(() => {
    updateTrackSetIdCounter(tracks);
  }, [tracks, updateTrackSetIdCounter]);

  useEffect(() => {
    const knownTrackSetIds = new Set(tracks.map((trackSet) => trackSet.id));
    let removedCatalog = false;
    let removedPayload = false;

    for (const trackSetId of compiledCatalogCacheRef.current.keys()) {
      const trackSet = tracks.find((entry) => entry.id === trackSetId) ?? null;
      if (!knownTrackSetIds.has(trackSetId) || !trackSet?.compiledHeader) {
        compiledCatalogCacheRef.current.delete(trackSetId);
        inFlightCompiledCatalogLoadsRef.current.delete(trackSetId);
        removedCatalog = true;
      }
    }

    for (const trackSetId of compiledPayloadCacheRef.current.keys()) {
      const trackSet = tracks.find((entry) => entry.id === trackSetId) ?? null;
      if (!knownTrackSetIds.has(trackSetId) || !trackSet?.compiledHeader) {
        compiledPayloadCacheRef.current.delete(trackSetId);
        inFlightCompiledPayloadLoadsRef.current.delete(trackSetId);
        removedPayload = true;
      }
    }

    if (removedCatalog) {
      setCatalogCacheVersion((current) => current + 1);
    }
    if (removedPayload) {
      setPayloadCacheVersion((current) => current + 1);
    }
  }, [tracks]);

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

  const trackHeadersByTrackSet = useMemo(() => {
    const map = new Map<string, CompiledTrackSetHeader>();
    for (const set of tracks) {
      if (set.compiledHeader) {
        map.set(set.id, set.compiledHeader);
      }
    }
    return map;
  }, [tracks]);

  const loadedCompiledCatalogTrackSetIds = useMemo(() => {
    const ids = new Set<string>();
    void catalogCacheVersion;
    for (const set of tracks) {
      if (compiledCatalogCacheRef.current.has(set.id)) {
        ids.add(set.id);
      }
    }
    return ids;
  }, [catalogCacheVersion, tracks]);

  const loadedCompiledPayloadTrackSetIds = useMemo(() => {
    const ids = new Set<string>();
    void payloadCacheVersion;
    for (const set of tracks) {
      if (compiledPayloadCacheRef.current.has(set.id)) {
        ids.add(set.id);
      }
    }
    return ids;
  }, [payloadCacheVersion, tracks]);

  const parsedTracksByTrackSet = useMemo(() => {
    const map = new Map<string, CompiledTrackSummary[]>();

    for (const set of tracks) {
      const loadedCatalog = compiledCatalogCacheRef.current.get(set.id);
      if (!loadedCatalog || loadedCatalog.length === 0) {
        map.set(set.id, []);
        continue;
      }

      const boundChannelId = set.boundChannelId;
      const normalizedTrackSetName = normalizeEntityName(set.name);
      map.set(
        set.id,
        loadedCatalog.map((track) => ({
          ...track,
          trackSetName: normalizedTrackSetName,
          channelId: boundChannelId,
          channelName: boundChannelId ? (channelNameById.get(boundChannelId) ?? null) : null
        }))
      );
    }

    return map;
  }, [catalogCacheVersion, channelNameById, tracks]);

  const compiledPayloadByTrackSet = useMemo(() => {
    const map = new Map<string, CompiledTrackSetPayload>();
    void payloadCacheVersion;
    for (const set of tracks) {
      const payload = compiledPayloadCacheRef.current.get(set.id);
      if (payload) {
        map.set(set.id, payload);
      }
    }
    return map;
  }, [payloadCacheVersion, tracks]);

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

  const clearTrackSetCaches = useCallback((trackSetId: string) => {
    let removedCatalog = false;
    let removedPayload = false;

    if (compiledCatalogCacheRef.current.delete(trackSetId)) {
      removedCatalog = true;
    }
    if (compiledPayloadCacheRef.current.delete(trackSetId)) {
      removedPayload = true;
    }
    inFlightCompiledCatalogLoadsRef.current.delete(trackSetId);
    inFlightCompiledPayloadLoadsRef.current.delete(trackSetId);

    if (removedCatalog) {
      setCatalogCacheVersion((current) => current + 1);
    }
    if (removedPayload) {
      setPayloadCacheVersion((current) => current + 1);
    }
  }, []);

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
      clearTrackSetCaches(trackSetId);
      updateTrackSet(trackSetId, (set) => ({
        ...set,
        file,
        fileName: file.name,
        status: 'loading',
        error: null,
        compiledHeader: null,
        loadCompiledCatalog: null,
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
        const compiledHeader = buildCompiledTrackSetHeader(compiled.summary);
        updateTrackSet(trackSetId, (set) => ({
          ...set,
          file,
          fileName: file.name,
          status: 'loaded',
          error: null,
          compiledHeader,
          loadCompiledCatalog: async () => compiled.summary.tracks,
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
          compiledHeader: null,
          loadCompiledCatalog: null,
          loadCompiledPayload: null
        }));
      }
    },
    [clearTrackSetCaches, updateTrackSet]
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
      clearTrackSetCaches(trackSetId);
      updateTrackSet(trackSetId, (set) => ({
        ...set,
        file: null,
        fileName: '',
        status: 'idle',
        error: null,
        compiledHeader: null,
        loadCompiledCatalog: null,
        loadCompiledPayload: null
      }));
    },
    [clearTrackSetCaches, updateTrackSet]
  );

  const handleTrackSetRemove = useCallback(
    (trackSetId: string) => {
      clearTrackSetCaches(trackSetId);
      setTracks((current) => current.filter((set) => set.id !== trackSetId));
    },
    [clearTrackSetCaches, setTracks]
  );

  const ensureCompiledCatalogsLoaded = useCallback(
    (trackSetIds: Iterable<string>) => {
      for (const trackSetId of trackSetIds) {
        const trackSet = trackSetById.get(trackSetId);
        if (!trackSet || !trackSet.compiledHeader || !trackSet.loadCompiledCatalog || compiledCatalogCacheRef.current.has(trackSetId)) {
          continue;
        }
        if (inFlightCompiledCatalogLoadsRef.current.has(trackSetId)) {
          continue;
        }

        const loadPromise = trackSet.loadCompiledCatalog()
          .then((catalog) => {
            if (!compiledCatalogCacheRef.current.has(trackSetId)) {
              compiledCatalogCacheRef.current.set(trackSetId, catalog);
              setCatalogCacheVersion((current) => current + 1);
            }
            setTracks((current) =>
              current.map((set) =>
                set.id === trackSetId
                  ? {
                      ...set,
                      status: set.status === 'error' ? 'loaded' : set.status,
                      error: null
                    }
                  : set
              )
            );
            return catalog;
          })
          .catch((error) => {
            console.error(`Failed to load compiled catalog for track set ${trackSetId}`, error);
            const message = error instanceof Error ? error.message : 'Failed to load compiled track catalog.';
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
            inFlightCompiledCatalogLoadsRef.current.delete(trackSetId);
          });

        inFlightCompiledCatalogLoadsRef.current.set(trackSetId, loadPromise);
      }
    },
    [setTracks, trackSetById]
  );

  const ensureCompiledPayloadsLoaded = useCallback(
    (trackSetIds: Iterable<string>) => {
      for (const trackSetId of trackSetIds) {
        const trackSet = trackSetById.get(trackSetId);
        if (!trackSet || !trackSet.compiledHeader || !trackSet.loadCompiledPayload || compiledPayloadCacheRef.current.has(trackSetId)) {
          continue;
        }
        if (inFlightCompiledPayloadLoadsRef.current.has(trackSetId)) {
          continue;
        }

        const loadPromise = trackSet.loadCompiledPayload()
          .then((payload) => {
            if (!compiledPayloadCacheRef.current.has(trackSetId)) {
              compiledPayloadCacheRef.current.set(trackSetId, payload);
              setPayloadCacheVersion((current) => current + 1);
            }
            setTracks((current) =>
              current.map((set) =>
                set.id === trackSetId
                  ? {
                      ...set,
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
    trackHeadersByTrackSet,
    loadedCompiledCatalogTrackSetIds,
    loadedCompiledPayloadTrackSetIds,
    parsedTracksByTrackSet,
    compiledPayloadByTrackSet,
    ensureCompiledCatalogsLoaded,
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
