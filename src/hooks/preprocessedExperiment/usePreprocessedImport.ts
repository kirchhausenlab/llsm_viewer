import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { FollowedTrackState, TrackSetState } from '../../types/channelTracks';
import { unzip } from 'fflate';
import { PUBLIC_EXPERIMENTS_CATALOG_URL } from '../../config/publicExperiments';
import {
  loadCompiledTrackSetCatalogFromStorage,
  loadCompiledTrackSetPayloadFromStorage,
  openPreprocessedDatasetFromZarrStorage
} from '../../shared/utils/preprocessedDataset/open';
import {
  createDirectoryHandlePreprocessedStorage,
  createHttpPreprocessedStorage,
  createOpfsPreprocessedStorage,
  PREPROCESSED_STORAGE_ROOT_DIR
} from '../../shared/storage/preprocessedStorage';
import type { PreprocessedStorageHandle } from '../../shared/storage/preprocessedStorage';
import {
  loadPublicExperimentCatalog,
  type PublicExperimentCatalogEntry
} from '../../shared/utils/publicExperimentCatalog';
import {
  getDirectoryPickerUnavailableMessage,
  inspectDirectoryPickerSupport
} from '../../shared/utils/directoryPickerSupport';
import type { ChannelSource, StagedPreprocessedExperiment, TrackSetSource } from '../dataset';

export type UsePreprocessedImportOptions = {
  setChannels: Dispatch<SetStateAction<ChannelSource[]>>;
  setTracks: Dispatch<SetStateAction<TrackSetSource[]>>;
  setActiveChannelId: Dispatch<SetStateAction<string | null>>;
  setEditingChannelId: Dispatch<SetStateAction<string | null>>;
  setTrackSetStates: Dispatch<SetStateAction<Record<string, TrackSetState>>>;
  setTrackOrderModeByTrackSet: Dispatch<SetStateAction<Record<string, 'id' | 'length'>>>;
  setSelectedTrackOrder: Dispatch<SetStateAction<string[]>>;
  setFollowedTrack: Dispatch<SetStateAction<FollowedTrackState>>;
  setIsExperimentSetupStarted: Dispatch<SetStateAction<boolean>>;
  setViewerMode: Dispatch<SetStateAction<'3d'>>;
  clearDatasetError: () => void;
  updateChannelIdCounter: (sources: ChannelSource[]) => void;
};

export type UsePreprocessedImportResult = {
  preprocessedExperiment: StagedPreprocessedExperiment | null;
  setPreprocessedExperiment: Dispatch<SetStateAction<StagedPreprocessedExperiment | null>>;
  isPreprocessedLoaderOpen: boolean;
  isPublicExperimentLoaderOpen: boolean;
  isPublicExperimentCatalogLoading: boolean;
  publicExperimentCatalog: PublicExperimentCatalogEntry[];
  publicExperimentCatalogError: string | null;
  activePublicExperimentId: string | null;
  publicExperimentCatalogUrl: string;
  isPreprocessedImporting: boolean;
  preprocessedImportError: string | null;
  handlePreprocessedLoaderOpen: () => void;
  handlePreprocessedLoaderClose: () => void;
  handlePublicExperimentLoaderOpen: () => void;
  handlePublicExperimentLoaderClose: () => void;
  handlePublicExperimentCatalogRefresh: () => Promise<void>;
  handlePublicExperimentLoad: (experimentId: string) => Promise<void>;
  handlePreprocessedBrowse: () => Promise<void>;
  handlePreprocessedArchiveBrowse: () => Promise<void>;
  handlePreprocessedArchiveDrop: (file: File) => Promise<void>;
  resetPreprocessedState: () => void;
};

type ArchiveEntries = Record<string, Uint8Array>;

type ArchiveExtractionResult = {
  files: Array<{ path: string; data: Uint8Array }>;
};

function isAbortLikeError(error: unknown): boolean {
  if (error instanceof DOMException) {
    return error.name === 'AbortError';
  }
  if (error instanceof Error) {
    return error.name === 'AbortError' || /aborted/i.test(error.message);
  }
  return false;
}

async function requestArchiveFile(): Promise<File | null> {
  if (typeof document === 'undefined') {
    return null;
  }
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.zip';
    let settled = false;
    let focusTimeoutHandle: number | null = null;
    const settle = (file: File | null) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve(file);
    };
    const handleChange = () => {
      const file = input.files && input.files.length > 0 ? input.files[0] : null;
      settle(file);
    };
    const handleCancel = () => {
      settle(null);
    };
    const handleWindowFocus = () => {
      if (focusTimeoutHandle !== null) {
        window.clearTimeout(focusTimeoutHandle);
      }
      focusTimeoutHandle = window.setTimeout(() => {
        const file = input.files && input.files.length > 0 ? input.files[0] : null;
        settle(file);
      }, 0);
    };
    const cleanup = () => {
      if (focusTimeoutHandle !== null) {
        window.clearTimeout(focusTimeoutHandle);
      }
      window.removeEventListener('focus', handleWindowFocus);
      input.removeEventListener('change', handleChange);
      input.removeEventListener('cancel', handleCancel);
      input.remove();
    };
    input.addEventListener('change', handleChange);
    input.addEventListener('cancel', handleCancel);
    window.addEventListener('focus', handleWindowFocus, { once: true });
    input.click();
  });
}

async function unzipArchive(bytes: Uint8Array): Promise<ArchiveEntries> {
  return new Promise((resolve, reject) => {
    unzip(bytes, (error, data) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(data);
    });
  });
}

function resolveArchiveEntries(entries: ArchiveEntries): ArchiveExtractionResult {
  const fileEntries = Object.entries(entries)
    .map(([name, data]) => ({
      path: name.replace(/\\/g, '/').replace(/^\.\/+/, '').replace(/^\/+/, ''),
      data
    }))
    .filter((entry) => entry.path.length > 0 && !entry.path.endsWith('/'));
  if (fileEntries.length === 0) {
    throw new Error('Archive is empty.');
  }

  for (const entry of fileEntries) {
    const parts = entry.path.split('/');
    if (parts.some((part) => part === '.' || part === '..')) {
      throw new Error(`Archive contains an unsafe path: ${entry.path}`);
    }
  }

  const hasRootZarr = fileEntries.some((entry) => entry.path === 'zarr.json');
  if (!hasRootZarr) {
    const nestedZarrPath = fileEntries.find((entry) => entry.path.endsWith('/zarr.json'))?.path ?? null;
    if (nestedZarrPath) {
      throw new Error('Archive must contain zarr.json at the archive root.');
    }
    throw new Error('Archive does not contain zarr.json.');
  }

  return { files: fileEntries };
}

function deriveArchiveDatasetId(file: File): string {
  const baseName = file.name.replace(/\.(zip|tar)$/i, '').trim();
  if (baseName) {
    return baseName;
  }
  return 'preprocessed-archive';
}

export function usePreprocessedImport({
  setChannels,
  setTracks,
  setActiveChannelId,
  setEditingChannelId,
  setTrackSetStates,
  setTrackOrderModeByTrackSet,
  setSelectedTrackOrder,
  setFollowedTrack,
  setIsExperimentSetupStarted,
  setViewerMode,
  clearDatasetError,
  updateChannelIdCounter
}: UsePreprocessedImportOptions): UsePreprocessedImportResult {
  const [preprocessedExperiment, setPreprocessedExperiment] =
    useState<StagedPreprocessedExperiment | null>(null);
  const [isPreprocessedLoaderOpen, setIsPreprocessedLoaderOpen] = useState(false);
  const [isPublicExperimentLoaderOpen, setIsPublicExperimentLoaderOpen] = useState(false);
  const [isPublicExperimentCatalogLoading, setIsPublicExperimentCatalogLoading] = useState(false);
  const [publicExperimentCatalog, setPublicExperimentCatalog] = useState<PublicExperimentCatalogEntry[]>([]);
  const [publicExperimentCatalogError, setPublicExperimentCatalogError] = useState<string | null>(null);
  const [activePublicExperimentId, setActivePublicExperimentId] = useState<string | null>(null);
  const [isPreprocessedImporting, setIsPreprocessedImporting] = useState(false);
  const [preprocessedImportError, setPreprocessedImportError] = useState<string | null>(null);
  const publicCatalogAbortRef = useRef<AbortController | null>(null);
  const publicCatalogRequestIdRef = useRef(0);

  useEffect(() => {
    return () => {
      publicCatalogAbortRef.current?.abort();
    };
  }, []);

  const resetPreprocessedState = useCallback(() => {
    publicCatalogAbortRef.current?.abort();
    publicCatalogAbortRef.current = null;
    setPreprocessedExperiment(null);
    setPreprocessedImportError(null);
    setPublicExperimentCatalogError(null);
    setIsPreprocessedLoaderOpen(false);
    setIsPublicExperimentLoaderOpen(false);
    setIsPublicExperimentCatalogLoading(false);
    setActivePublicExperimentId(null);
  }, []);

  const stagePreprocessedDataset = useCallback(
    (
      result: Awaited<ReturnType<typeof openPreprocessedDatasetFromZarrStorage>>,
      storageHandle: PreprocessedStorageHandle,
      sourceName: string | null,
      sourceSize: number | null
    ) => {
      const staged: StagedPreprocessedExperiment = {
        manifest: result.manifest,
        channelSummaries: result.channelSummaries,
        trackSummaries: result.trackSummaries,
        totalVolumeCount: result.totalVolumeCount,
        storageHandle,
        sourceName,
        sourceSize
      };

      setViewerMode('3d');

      const nextChannels = result.channelSummaries.map<ChannelSource>((summary) => {
        if (summary.layers.length !== 1) {
          throw new Error(
            `Channel "${summary.name}" contains ${summary.layers.length} volumes. This build requires exactly one volume per channel.`,
          );
        }
        const layer = summary.layers[0]!;
        return {
          id: summary.id,
          name: summary.name,
          channelType: layer.isSegmentation ? 'segmentation' : 'channel',
          volume: {
            id: layer.key,
            files: [],
            isSegmentation: layer.isSegmentation
          }
        };
      });
      const nextTracks = result.trackSummaries.map<TrackSetSource>((set) => ({
        id: set.id,
        name: set.name,
        boundChannelId: set.boundChannelId,
        timepointConvention: 'zero-based',
        file: null,
        fileName: set.fileName,
        status: 'loaded',
        error: null,
        compiledHeader: set.header,
        loadCompiledCatalog: () =>
          loadCompiledTrackSetCatalogFromStorage(storageHandle.storage, set.tracks, set.header, {
            trackSetName: set.name
          }),
        loadCompiledPayload: () => loadCompiledTrackSetPayloadFromStorage(storageHandle.storage, set.tracks, set.header)
      }));

      setChannels(nextChannels);
      setTracks(nextTracks);
      updateChannelIdCounter(nextChannels);
      setActiveChannelId(null);
      setEditingChannelId(null);
      setTrackSetStates({});
      setTrackOrderModeByTrackSet({});
      setSelectedTrackOrder([]);
      setFollowedTrack(null);
      setPreprocessedExperiment(staged);
      setIsExperimentSetupStarted(false);
      setIsPreprocessedLoaderOpen(false);
      setIsPublicExperimentLoaderOpen(false);
      setPublicExperimentCatalogError(null);
      setActivePublicExperimentId(null);
      clearDatasetError();
    },
    [
      clearDatasetError,
      setActiveChannelId,
      setChannels,
      setEditingChannelId,
      setFollowedTrack,
      setIsExperimentSetupStarted,
      setSelectedTrackOrder,
      setTrackOrderModeByTrackSet,
      setTrackSetStates,
      setTracks,
      setViewerMode,
      updateChannelIdCounter
    ]
  );

  const loadPublicExperimentCatalogEntries = useCallback(
    async ({ force }: { force: boolean }) => {
      if (!force && publicExperimentCatalog.length > 0) {
        setPublicExperimentCatalogError(null);
        return;
      }

      if (typeof fetch !== 'function') {
        setPublicExperimentCatalogError('Fetching public experiments is not supported in this browser.');
        return;
      }

      publicCatalogAbortRef.current?.abort();
      const abortController = new AbortController();
      publicCatalogAbortRef.current = abortController;
      const requestId = publicCatalogRequestIdRef.current + 1;
      publicCatalogRequestIdRef.current = requestId;
      setIsPublicExperimentCatalogLoading(true);
      setPublicExperimentCatalogError(null);

      try {
        const catalog = await loadPublicExperimentCatalog({
          catalogUrl: PUBLIC_EXPERIMENTS_CATALOG_URL,
          signal: abortController.signal
        });

        if (publicCatalogRequestIdRef.current !== requestId) {
          return;
        }

        setPublicExperimentCatalog(catalog.examples);
      } catch (error) {
        if (publicCatalogRequestIdRef.current !== requestId || isAbortLikeError(error)) {
          return;
        }
        console.error('Failed to load public experiment catalog', error);
        const message = error instanceof Error ? error.message : 'Failed to load public experiment catalog.';
        setPublicExperimentCatalogError(message);
      } finally {
        if (publicCatalogRequestIdRef.current === requestId) {
          setIsPublicExperimentCatalogLoading(false);
          if (publicCatalogAbortRef.current === abortController) {
            publicCatalogAbortRef.current = null;
          }
        }
      }
    },
    [publicExperimentCatalog.length]
  );

  const handlePreprocessedLoaderOpen = useCallback(() => {
    if (isPreprocessedImporting) {
      return;
    }
    setIsPublicExperimentLoaderOpen(false);
    setIsPreprocessedLoaderOpen(true);
    setPreprocessedImportError(null);
  }, [isPreprocessedImporting]);

  const handlePreprocessedLoaderClose = useCallback(() => {
    if (isPreprocessedImporting) {
      return;
    }
    setIsPreprocessedLoaderOpen(false);
    setPreprocessedImportError(null);
  }, [isPreprocessedImporting]);

  const handlePublicExperimentLoaderOpen = useCallback(() => {
    if (isPreprocessedImporting) {
      return;
    }
    setIsPreprocessedLoaderOpen(false);
    setIsPublicExperimentLoaderOpen(true);
    setPublicExperimentCatalogError(null);
    void loadPublicExperimentCatalogEntries({ force: false });
  }, [isPreprocessedImporting, loadPublicExperimentCatalogEntries]);

  const handlePublicExperimentLoaderClose = useCallback(() => {
    if (isPreprocessedImporting) {
      return;
    }
    publicCatalogAbortRef.current?.abort();
    publicCatalogAbortRef.current = null;
    setIsPublicExperimentCatalogLoading(false);
    setIsPublicExperimentLoaderOpen(false);
    setPublicExperimentCatalogError(null);
    setActivePublicExperimentId(null);
  }, [isPreprocessedImporting]);

  const handlePublicExperimentCatalogRefresh = useCallback(async () => {
    await loadPublicExperimentCatalogEntries({ force: true });
  }, [loadPublicExperimentCatalogEntries]);

  const handlePublicExperimentLoad = useCallback(
    async (experimentId: string) => {
      if (isPreprocessedImporting) {
        return;
      }

      const experiment = publicExperimentCatalog.find((entry) => entry.id === experimentId);
      if (!experiment) {
        setPublicExperimentCatalogError(`Public experiment "${experimentId}" is not available in the catalog.`);
        return;
      }

      setIsPreprocessedImporting(true);
      setPreprocessedImportError(null);
      setPublicExperimentCatalogError(null);
      setActivePublicExperimentId(experiment.id);

      try {
        const storageHandle = createHttpPreprocessedStorage({
          id: experiment.id,
          baseUrl: experiment.baseUrl
        });
        const result = await openPreprocessedDatasetFromZarrStorage(storageHandle.storage);
        stagePreprocessedDataset(result, storageHandle, `Public example: ${experiment.label}`, null);
      } catch (error) {
        console.error('Failed to load public experiment', error);
        const message = error instanceof Error ? error.message : 'Failed to load public experiment.';
        setPublicExperimentCatalogError(message);
        setPreprocessedExperiment(null);
        setChannels([]);
        setTracks([]);
        setIsExperimentSetupStarted(false);
      } finally {
        setIsPreprocessedImporting(false);
        setActivePublicExperimentId(null);
      }
    },
    [
      isPreprocessedImporting,
      publicExperimentCatalog,
      setChannels,
      setIsExperimentSetupStarted,
      setTracks,
      setPreprocessedExperiment,
      stagePreprocessedDataset
    ]
  );

  const handlePreprocessedBrowse = useCallback(async () => {
    if (isPreprocessedImporting) {
      return;
    }

    const directoryPickerSupport = inspectDirectoryPickerSupport();
    if (!directoryPickerSupport.supported) {
      setPreprocessedImportError(getDirectoryPickerUnavailableMessage(directoryPickerSupport));
      return;
    }

    setIsPreprocessedImporting(true);
    setPreprocessedImportError(null);
    try {
      const showDirectoryPicker = window.showDirectoryPicker;
      if (typeof showDirectoryPicker !== 'function') {
        throw new Error(getDirectoryPickerUnavailableMessage(inspectDirectoryPickerSupport()));
      }

      const directoryHandle = await showDirectoryPicker({
        mode: 'read'
      });

      const storageHandle = await createDirectoryHandlePreprocessedStorage(directoryHandle, {
        id: directoryHandle.name
      });
      const result = await openPreprocessedDatasetFromZarrStorage(storageHandle.storage);
      stagePreprocessedDataset(result, storageHandle, null, null);
    } catch (error) {
      if (isAbortLikeError(error)) {
        return;
      }
      console.error('Failed to load preprocessed dataset', error);
      const message = error instanceof Error ? error.message : 'Failed to load preprocessed dataset.';
      setPreprocessedImportError(message);
      setPreprocessedExperiment(null);
      setChannels([]);
      setTracks([]);
      setIsExperimentSetupStarted(false);
    } finally {
      setIsPreprocessedImporting(false);
    }
  }, [
    isPreprocessedImporting,
    stagePreprocessedDataset,
    setIsExperimentSetupStarted,
    setChannels,
    setTracks,
    setPreprocessedExperiment
  ]);

  const importPreprocessedArchive = useCallback(
    async (file: File) => {
      setIsPreprocessedImporting(true);
      setPreprocessedImportError(null);
      try {
        if (!file.name.toLowerCase().endsWith('.zip')) {
          throw new Error('Please drop a .zip archive.');
        }

        const bytes = new Uint8Array(await file.arrayBuffer());
        const entries = await unzipArchive(bytes);
        const { files } = resolveArchiveEntries(entries);
        const datasetId = deriveArchiveDatasetId(file);

        const storageHandle = await createOpfsPreprocessedStorage({
          datasetId,
          rootDir: PREPROCESSED_STORAGE_ROOT_DIR
        });

        for (const entry of files) {
          await storageHandle.storage.writeFile(entry.path, entry.data);
        }

        const result = await openPreprocessedDatasetFromZarrStorage(storageHandle.storage);
        stagePreprocessedDataset(result, storageHandle, file.name, file.size);
      } catch (error) {
        console.error('Failed to load preprocessed dataset archive', error);
        const message = error instanceof Error ? error.message : 'Failed to load preprocessed dataset archive.';
        setPreprocessedImportError(message);
        setPreprocessedExperiment(null);
        setChannels([]);
        setTracks([]);
        setIsExperimentSetupStarted(false);
      } finally {
        setIsPreprocessedImporting(false);
      }
    },
    [
      setChannels,
      setIsExperimentSetupStarted,
      setPreprocessedExperiment,
      setTracks,
      stagePreprocessedDataset
    ]
  );

  const handlePreprocessedArchiveBrowse = useCallback(async () => {
    if (isPreprocessedImporting) {
      return;
    }

    const file = await requestArchiveFile();
    if (!file) {
      return;
    }

    await importPreprocessedArchive(file);
  }, [isPreprocessedImporting, importPreprocessedArchive]);

  const handlePreprocessedArchiveDrop = useCallback(
    async (file: File) => {
      if (isPreprocessedImporting) {
        return;
      }
      await importPreprocessedArchive(file);
    },
    [isPreprocessedImporting, importPreprocessedArchive]
  );

  return {
    preprocessedExperiment,
    setPreprocessedExperiment,
    isPreprocessedLoaderOpen,
    isPublicExperimentLoaderOpen,
    isPublicExperimentCatalogLoading,
    publicExperimentCatalog,
    publicExperimentCatalogError,
    activePublicExperimentId,
    publicExperimentCatalogUrl: PUBLIC_EXPERIMENTS_CATALOG_URL,
    isPreprocessedImporting,
    preprocessedImportError,
    handlePreprocessedLoaderOpen,
    handlePreprocessedLoaderClose,
    handlePublicExperimentLoaderOpen,
    handlePublicExperimentLoaderClose,
    handlePublicExperimentCatalogRefresh,
    handlePublicExperimentLoad,
    handlePreprocessedBrowse,
    handlePreprocessedArchiveBrowse,
    handlePreprocessedArchiveDrop,
    resetPreprocessedState
  };
}
