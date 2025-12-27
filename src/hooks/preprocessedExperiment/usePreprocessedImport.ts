import { useCallback, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { FollowedTrackState, TrackSetState } from '../../types/channelTracks';
import { unzip } from 'fflate';
import { openPreprocessedDatasetFromZarrStorage } from '../../shared/utils/preprocessedDataset/open';
import {
  createDirectoryHandlePreprocessedStorage,
  createInMemoryPreprocessedStorage,
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
  resetPreprocessedState: () => void;
};

type FileSystemDirectoryHandleLike = {
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FileSystemDirectoryHandleLike>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<any>;
};

type ArchiveEntries = Record<string, Uint8Array>;

type ArchiveExtractionResult = {
  rootPrefix: string;
  files: Array<{ path: string; data: Uint8Array }>;
};

function canUseDirectoryPicker(): boolean {
  return typeof window !== 'undefined' && typeof (window as any).showDirectoryPicker === 'function';
}

async function requestArchiveFile(): Promise<File | null> {
  if (typeof document === 'undefined') {
    return null;
  }
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.zip';
    const cleanup = () => {
      input.remove();
    };
    input.addEventListener('change', () => {
      const file = input.files && input.files.length > 0 ? input.files[0] : null;
      cleanup();
      resolve(file);
    });
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
  const fileEntries = Object.entries(entries).filter(([name]) => !name.endsWith('/'));
  if (fileEntries.length === 0) {
    throw new Error('Archive is empty.');
  }
  const zarrCandidates = fileEntries
    .map(([name]) => name)
    .filter((name) => name.endsWith('zarr.json'))
    .sort((a, b) => a.length - b.length);
  const zarrPath = zarrCandidates[0];
  if (!zarrPath) {
    throw new Error('Archive does not contain zarr.json.');
  }
  const rootPrefix = zarrPath.slice(0, zarrPath.length - 'zarr.json'.length);
  const manifestPath = `${rootPrefix}manifest.json`;
  const hasManifest = fileEntries.some(([name]) => name === manifestPath);
  if (!hasManifest) {
    throw new Error('Archive is missing manifest.json.');
  }
  const files = fileEntries
    .filter(([name]) => name.startsWith(rootPrefix))
    .map(([name, data]) => ({ path: name.slice(rootPrefix.length), data }))
    .filter((entry) => entry.path.length > 0);
  if (files.length === 0) {
    throw new Error('Archive does not contain dataset files.');
  }
  return { rootPrefix, files };
}

function deriveArchiveDatasetId(file: File, rootPrefix: string): string {
  const baseName = file.name.replace(/\.(zip|tar)$/i, '').trim();
  if (baseName) {
    return baseName;
  }
  const trimmedRoot = rootPrefix.replace(/\/+$/, '');
  if (trimmedRoot) {
    const parts = trimmedRoot.split('/').filter(Boolean);
    return parts[parts.length - 1];
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
      const directoryHandle = (await (window as any).showDirectoryPicker({
        mode: 'read'
      })) as any;

      const storageHandle = await createDirectoryHandlePreprocessedStorage(directoryHandle as any);
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

  const handlePreprocessedArchiveBrowse = useCallback(async () => {
    if (isPreprocessedImporting) {
      return;
    }

    setIsPreprocessedImporting(true);
    setPreprocessedImportError(null);
    try {
      const file = await requestArchiveFile();
      if (!file) {
        return;
      }

      const bytes = new Uint8Array(await file.arrayBuffer());
      const entries = await unzipArchive(bytes);
      const { rootPrefix, files } = resolveArchiveEntries(entries);
      const datasetId = deriveArchiveDatasetId(file, rootPrefix);

      let storageHandle;
      try {
        storageHandle = await createOpfsPreprocessedStorage({ datasetId });
      } catch (error) {
        console.warn('Falling back to in-memory storage for archive import', error);
        storageHandle = createInMemoryPreprocessedStorage({ datasetId });
      }

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
  }, [
    isPreprocessedImporting,
    setChannels,
    setIsExperimentSetupStarted,
    setPreprocessedExperiment,
    stagePreprocessedDataset
  ]);

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
    resetPreprocessedState
  };
}
