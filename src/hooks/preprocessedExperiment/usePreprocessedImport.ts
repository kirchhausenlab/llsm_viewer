import { useCallback, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { FollowedTrackState, TrackSetState } from '../../types/channelTracks';
import { unzip } from 'fflate';
import { openPreprocessedDatasetFromZarrStorage } from '../../shared/utils/preprocessedDataset/open';
import {
  createDirectoryHandlePreprocessedStorage,
  createOpfsPreprocessedStorage
} from '../../shared/storage/preprocessedStorage';
import type { PreprocessedStorageHandle } from '../../shared/storage/preprocessedStorage';
import type { ChannelSource, StagedPreprocessedExperiment } from '../dataset';
import type { ExperimentDimension } from '../useVoxelResolution';

export type UsePreprocessedImportOptions = {
  setChannels: Dispatch<SetStateAction<ChannelSource[]>>;
  setActiveChannelId: Dispatch<SetStateAction<string | null>>;
  setEditingChannelId: Dispatch<SetStateAction<string | null>>;
  setTrackSetStates: Dispatch<SetStateAction<Record<string, TrackSetState>>>;
  setTrackOrderModeByTrackSet: Dispatch<SetStateAction<Record<string, 'id' | 'length'>>>;
  setSelectedTrackOrder: Dispatch<SetStateAction<string[]>>;
  setFollowedTrack: Dispatch<SetStateAction<FollowedTrackState>>;
  setIsExperimentSetupStarted: Dispatch<SetStateAction<boolean>>;
  setExperimentDimension: Dispatch<SetStateAction<ExperimentDimension>>;
  setViewerMode: Dispatch<SetStateAction<'3d' | '2d'>>;
  clearDatasetError: () => void;
  updateChannelIdCounter: (sources: ChannelSource[]) => void;
};

export type UsePreprocessedImportResult = {
  preprocessedExperiment: StagedPreprocessedExperiment | null;
  setPreprocessedExperiment: Dispatch<SetStateAction<StagedPreprocessedExperiment | null>>;
  isPreprocessedLoaderOpen: boolean;
  isPreprocessedImporting: boolean;
  preprocessedImportError: string | null;
  handlePreprocessedLoaderOpen: () => void;
  handlePreprocessedLoaderClose: () => void;
  handlePreprocessedBrowse: () => Promise<void>;
  handlePreprocessedArchiveBrowse: () => Promise<void>;
  handlePreprocessedArchiveDrop: (file: File) => Promise<void>;
  resetPreprocessedState: () => void;
};

type ArchiveEntries = Record<string, Uint8Array>;

type ArchiveExtractionResult = {
  files: Array<{ path: string; data: Uint8Array }>;
};

const PREPROCESSED_STORAGE_ROOT_DIR = 'llsm-viewer-preprocessed-vnext';

function canUseDirectoryPicker(): boolean {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
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
  setActiveChannelId,
  setEditingChannelId,
  setTrackSetStates,
  setTrackOrderModeByTrackSet,
  setSelectedTrackOrder,
  setFollowedTrack,
  setIsExperimentSetupStarted,
  setExperimentDimension,
  setViewerMode,
  clearDatasetError,
  updateChannelIdCounter
}: UsePreprocessedImportOptions): UsePreprocessedImportResult {
  const [preprocessedExperiment, setPreprocessedExperiment] =
    useState<StagedPreprocessedExperiment | null>(null);
  const [isPreprocessedLoaderOpen, setIsPreprocessedLoaderOpen] = useState(false);
  const [isPreprocessedImporting, setIsPreprocessedImporting] = useState(false);
  const [preprocessedImportError, setPreprocessedImportError] = useState<string | null>(null);

  const resetPreprocessedState = useCallback(() => {
    setPreprocessedExperiment(null);
    setPreprocessedImportError(null);
    setIsPreprocessedLoaderOpen(false);
  }, []);

  const handlePreprocessedLoaderOpen = useCallback(() => {
    if (isPreprocessedImporting) {
      return;
    }
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
        totalVolumeCount: result.totalVolumeCount,
        storageHandle,
        sourceName,
        sourceSize
      };

      const movieMode = result.manifest.dataset.movieMode;
      setExperimentDimension(movieMode);
      setViewerMode(movieMode);

      const nextChannels = result.channelSummaries.map<ChannelSource>((summary) => ({
        id: summary.id,
        name: summary.name,
        layers: summary.layers.map((layer) => ({
          id: layer.key,
          files: [],
          isSegmentation: layer.isSegmentation
        })),
        trackSets: summary.trackSets.map((set) => ({
          id: set.id,
          name: set.name,
          file: null,
          fileName: set.fileName,
          status: 'loaded',
          error: null,
          entries: set.entries
        }))
      }));

      setChannels(nextChannels);
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
      clearDatasetError();
    },
    [
      clearDatasetError,
      setActiveChannelId,
      setChannels,
      setEditingChannelId,
      setExperimentDimension,
      setFollowedTrack,
      setIsExperimentSetupStarted,
      setSelectedTrackOrder,
      setTrackOrderModeByTrackSet,
      setTrackSetStates,
      setViewerMode,
      updateChannelIdCounter
    ]
  );

  const handlePreprocessedBrowse = useCallback(async () => {
    if (isPreprocessedImporting) {
      return;
    }

    if (!canUseDirectoryPicker()) {
      setPreprocessedImportError('Folder selection is not supported in this browser.');
      return;
    }

    setIsPreprocessedImporting(true);
    setPreprocessedImportError(null);
    try {
      const directoryHandle = await window.showDirectoryPicker?.({
        mode: 'read'
      });
      if (!directoryHandle) {
        throw new Error('Folder selection is not supported in this browser.');
      }

      const storageHandle = await createDirectoryHandlePreprocessedStorage(directoryHandle, {
        id: directoryHandle.name
      });
      const result = await openPreprocessedDatasetFromZarrStorage(storageHandle.storage);
      stagePreprocessedDataset(result, storageHandle, null, null);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }
      console.error('Failed to load preprocessed dataset', error);
      const message = error instanceof Error ? error.message : 'Failed to load preprocessed dataset.';
      setPreprocessedImportError(message);
      setPreprocessedExperiment(null);
      setChannels([]);
      setIsExperimentSetupStarted(false);
    } finally {
      setIsPreprocessedImporting(false);
    }
  }, [
    isPreprocessedImporting,
    stagePreprocessedDataset,
    setIsExperimentSetupStarted,
    setChannels,
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
        setIsExperimentSetupStarted(false);
      } finally {
        setIsPreprocessedImporting(false);
      }
    },
    [
      setChannels,
      setIsExperimentSetupStarted,
      setPreprocessedExperiment,
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
    isPreprocessedImporting,
    preprocessedImportError,
    handlePreprocessedLoaderOpen,
    handlePreprocessedLoaderClose,
    handlePreprocessedBrowse,
    handlePreprocessedArchiveBrowse,
    handlePreprocessedArchiveDrop,
    resetPreprocessedState
  };
}
