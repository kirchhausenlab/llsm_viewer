import { useCallback, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { FollowedTrackState, TrackSetState } from '../../types/channelTracks';
import { openPreprocessedDatasetFromZarrStorage } from '../../shared/utils/preprocessedDataset/open';
import { createDirectoryHandlePreprocessedStorage } from '../../shared/storage/preprocessedStorage';
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
  resetPreprocessedState: () => void;
};

type FileSystemDirectoryHandleLike = {
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FileSystemDirectoryHandleLike>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<any>;
};

function canUseDirectoryPicker(): boolean {
  return typeof window !== 'undefined' && typeof (window as any).showDirectoryPicker === 'function';
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

      const staged: StagedPreprocessedExperiment = {
        manifest: result.manifest,
        channelSummaries: result.channelSummaries,
        totalVolumeCount: result.totalVolumeCount,
        storageHandle,
        sourceName: null,
        sourceSize: null
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
    clearDatasetError,
    isPreprocessedImporting,
    setActiveChannelId,
    setChannels,
    setTrackSetStates,
    setEditingChannelId,
    setExperimentDimension,
    setFollowedTrack,
    setIsExperimentSetupStarted,
    setSelectedTrackOrder,
    setTrackOrderModeByTrackSet,
    setViewerMode,
    updateChannelIdCounter
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
    resetPreprocessedState
  };
}
