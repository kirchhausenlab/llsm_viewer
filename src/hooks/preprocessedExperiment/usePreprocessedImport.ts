import { useCallback, useState } from 'react';
import type {
  ChangeEvent,
  Dispatch,
  DragEvent,
  MutableRefObject,
  SetStateAction
} from 'react';
import { collectFilesFromDataTransfer } from '../../shared/utils/appHelpers';
import { openPreprocessedDatasetFromZip } from '../../shared/utils/preprocessedDataset';
import type { ChannelTrackState, FollowedTrackState } from '../../types/channelTracks';
import type { ChannelSource, StagedPreprocessedExperiment } from '../dataset';
import type { ExperimentDimension } from '../useVoxelResolution';
import type { PreprocessedDropboxCallbacksRef } from './shared';

export type UsePreprocessedImportOptions = {
  setChannels: Dispatch<SetStateAction<ChannelSource[]>>;
  setActiveChannelId: Dispatch<SetStateAction<string | null>>;
  setEditingChannelId: Dispatch<SetStateAction<string | null>>;
  setChannelTrackStates: Dispatch<SetStateAction<Record<string, ChannelTrackState>>>;
  setTrackOrderModeByChannel: Dispatch<SetStateAction<Record<string, 'id' | 'length'>>>;
  setSelectedTrackOrder: Dispatch<SetStateAction<string[]>>;
  setFollowedTrack: Dispatch<SetStateAction<FollowedTrackState>>;
  setIsExperimentSetupStarted: Dispatch<SetStateAction<boolean>>;
  setExperimentDimension: Dispatch<SetStateAction<ExperimentDimension>>;
  setViewerMode: Dispatch<SetStateAction<'3d' | '2d'>>;
  clearDatasetError: () => void;
  updateChannelIdCounter: (sources: ChannelSource[]) => void;
  dropboxImportingRef: MutableRefObject<boolean>;
  dropboxCallbacksRef: PreprocessedDropboxCallbacksRef;
  preprocessedFileInputRef: MutableRefObject<HTMLInputElement | null>;
  preprocessedDropCounterRef: MutableRefObject<number>;
};

export type UsePreprocessedImportResult = {
  preprocessedExperiment: StagedPreprocessedExperiment | null;
  setPreprocessedExperiment: Dispatch<SetStateAction<StagedPreprocessedExperiment | null>>;
  isPreprocessedLoaderOpen: boolean;
  isPreprocessedImporting: boolean;
  isPreprocessedDragActive: boolean;
  preprocessedImportError: string | null;
  preprocessedImportBytesProcessed: number;
  preprocessedImportTotalBytes: number | null;
  preprocessedImportVolumesDecoded: number;
  preprocessedImportTotalVolumeCount: number | null;
  preprocessedFileInputRef: MutableRefObject<HTMLInputElement | null>;
  handlePreprocessedLoaderOpen: () => void;
  handlePreprocessedLoaderClose: () => void;
  handlePreprocessedFileInputChange: (event: ChangeEvent<HTMLInputElement>) => void;
  handlePreprocessedBrowse: () => void;
  handlePreprocessedDragEnter: (event: DragEvent<HTMLDivElement>) => void;
  handlePreprocessedDragLeave: (event: DragEvent<HTMLDivElement>) => void;
  handlePreprocessedDragOver: (event: DragEvent<HTMLDivElement>) => void;
  handlePreprocessedDrop: (event: DragEvent<HTMLDivElement>) => Promise<void>;
  importPreprocessedFile: (file: File) => Promise<void>;
  resetPreprocessedState: () => void;
};

export function usePreprocessedImport({
  setChannels,
  setActiveChannelId,
  setEditingChannelId,
  setChannelTrackStates,
  setTrackOrderModeByChannel,
  setSelectedTrackOrder,
  setFollowedTrack,
  setIsExperimentSetupStarted,
  setExperimentDimension,
  setViewerMode,
  clearDatasetError,
  updateChannelIdCounter,
  dropboxImportingRef,
  dropboxCallbacksRef,
  preprocessedFileInputRef,
  preprocessedDropCounterRef
}: UsePreprocessedImportOptions): UsePreprocessedImportResult {
  const [preprocessedExperiment, setPreprocessedExperiment] =
    useState<StagedPreprocessedExperiment | null>(null);
  const [isPreprocessedLoaderOpen, setIsPreprocessedLoaderOpen] = useState(false);
  const [isPreprocessedImporting, setIsPreprocessedImporting] = useState(false);
  const [preprocessedImportError, setPreprocessedImportError] = useState<string | null>(null);
  const [isPreprocessedDragActive, setIsPreprocessedDragActive] = useState(false);
  const [preprocessedImportBytesProcessed, setPreprocessedImportBytesProcessed] = useState(0);
  const [preprocessedImportTotalBytes, setPreprocessedImportTotalBytes] = useState<number | null>(null);
  const [preprocessedImportVolumesDecoded, setPreprocessedImportVolumesDecoded] = useState(0);
  const [preprocessedImportTotalVolumeCount, setPreprocessedImportTotalVolumeCount] =
    useState<number | null>(null);

  const resetPreprocessedLoader = useCallback(() => {
    setPreprocessedImportError(null);
    setPreprocessedImportBytesProcessed(0);
    setPreprocessedImportTotalBytes(null);
    setPreprocessedImportVolumesDecoded(0);
    setPreprocessedImportTotalVolumeCount(null);
    dropboxCallbacksRef.current.onResetLoader();
    setIsPreprocessedDragActive(false);
    preprocessedDropCounterRef.current = 0;
  }, [dropboxCallbacksRef, preprocessedDropCounterRef]);

  const importPreprocessedFile = useCallback(
    async (file: File) => {
      if (isPreprocessedImporting) {
        return;
      }
      setIsPreprocessedImporting(true);
      setPreprocessedImportError(null);
      dropboxCallbacksRef.current.onImportStart();
      try {
        const totalBytes = Number.isFinite(file.size) ? file.size : null;
        setPreprocessedImportBytesProcessed(0);
        setPreprocessedImportTotalBytes(totalBytes);
        setPreprocessedImportVolumesDecoded(0);
        setPreprocessedImportTotalVolumeCount(null);
        const result = await openPreprocessedDatasetFromZip(file, { sourceId: file.name ?? undefined });
        const staged: StagedPreprocessedExperiment = {
          manifest: result.manifest,
          channelSummaries: result.channelSummaries,
          totalVolumeCount: result.totalVolumeCount,
          storageHandle: result.storageHandle,
          sourceName: file.name ?? null,
          sourceSize: Number.isFinite(file.size) ? file.size : null
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
          trackFile: null,
          trackStatus: 'loaded',
          trackError: null,
          trackEntries: summary.trackEntries
        }));
        setChannels(nextChannels);
        updateChannelIdCounter(nextChannels);
        setActiveChannelId(null);
        setEditingChannelId(null);
        setChannelTrackStates({});
        setTrackOrderModeByChannel({});
        setSelectedTrackOrder([]);
        setFollowedTrack(null);
        setPreprocessedExperiment(staged);
        setIsExperimentSetupStarted(false);
        setIsPreprocessedLoaderOpen(false);
        resetPreprocessedLoader();
        clearDatasetError();
        setPreprocessedImportBytesProcessed(totalBytes ?? 0);
        setPreprocessedImportVolumesDecoded(0);
        setPreprocessedImportTotalVolumeCount(result.totalVolumeCount);
      } catch (error) {
        console.error('Failed to import preprocessed dataset', error);
        const message = error instanceof Error ? error.message : 'Failed to import preprocessed dataset.';
        setPreprocessedImportError(message);
        setPreprocessedExperiment(null);
        setChannels([]);
        setIsExperimentSetupStarted(false);
        setPreprocessedImportBytesProcessed(0);
        setPreprocessedImportTotalBytes(null);
        setPreprocessedImportVolumesDecoded(0);
        setPreprocessedImportTotalVolumeCount(null);
      } finally {
        setIsPreprocessedImporting(false);
      }
    },
    [
      clearDatasetError,
      isPreprocessedImporting,
      resetPreprocessedLoader,
      setActiveChannelId,
      setChannels,
      setEditingChannelId,
      setFollowedTrack,
      setIsExperimentSetupStarted,
      setSelectedTrackOrder,
      setTrackOrderModeByChannel,
      setChannelTrackStates,
      updateChannelIdCounter,
      dropboxCallbacksRef,
      setExperimentDimension,
      setViewerMode
    ]
  );

  const handlePreprocessedLoaderOpen = useCallback(() => {
    if (isPreprocessedImporting || dropboxImportingRef.current) {
      return;
    }
    setIsPreprocessedLoaderOpen(true);
    resetPreprocessedLoader();
  }, [dropboxImportingRef, isPreprocessedImporting, resetPreprocessedLoader]);

  const handlePreprocessedLoaderClose = useCallback(() => {
    if (isPreprocessedImporting) {
      return;
    }
    setIsPreprocessedLoaderOpen(false);
    resetPreprocessedLoader();
  }, [isPreprocessedImporting, resetPreprocessedLoader]);

  const handlePreprocessedFileInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      if (isPreprocessedImporting || dropboxImportingRef.current) {
        event.target.value = '';
        return;
      }
      const fileList = event.target.files;
      if (fileList && fileList.length > 0) {
        void importPreprocessedFile(fileList[0]);
      }
      event.target.value = '';
    },
    [importPreprocessedFile, isPreprocessedImporting, dropboxImportingRef]
  );

  const handlePreprocessedBrowse = useCallback(() => {
    if (isPreprocessedImporting || dropboxImportingRef.current) {
      return;
    }
    preprocessedFileInputRef.current?.click();
  }, [dropboxImportingRef, isPreprocessedImporting, preprocessedFileInputRef]);

  const handlePreprocessedDragEnter = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (isPreprocessedImporting || dropboxImportingRef.current) {
        return;
      }
      preprocessedDropCounterRef.current += 1;
      setIsPreprocessedDragActive(true);
    },
    [dropboxImportingRef, isPreprocessedImporting, preprocessedDropCounterRef]
  );

  const handlePreprocessedDragLeave = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (isPreprocessedImporting || dropboxImportingRef.current) {
        return;
      }
      preprocessedDropCounterRef.current = Math.max(0, preprocessedDropCounterRef.current - 1);
      if (preprocessedDropCounterRef.current === 0) {
        setIsPreprocessedDragActive(false);
      }
    },
    [dropboxImportingRef, isPreprocessedImporting, preprocessedDropCounterRef]
  );

  const handlePreprocessedDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  }, []);

  const handlePreprocessedDrop = useCallback(
    async (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      preprocessedDropCounterRef.current = 0;
      setIsPreprocessedDragActive(false);
      if (isPreprocessedImporting || dropboxImportingRef.current) {
        return;
      }
      const { dataTransfer } = event;
      if (!dataTransfer) {
        return;
      }
      const files = await collectFilesFromDataTransfer(dataTransfer);
      const [first] = files;
      if (first) {
        await importPreprocessedFile(first);
      } else {
        setPreprocessedImportError('Drop a file to import the preprocessed experiment.');
      }
    },
    [dropboxImportingRef, importPreprocessedFile, isPreprocessedImporting, preprocessedDropCounterRef]
  );

  const resetPreprocessedState = useCallback(() => {
    setPreprocessedExperiment(null);
    setIsPreprocessedLoaderOpen(false);
    resetPreprocessedLoader();
  }, [resetPreprocessedLoader]);

  return {
    preprocessedExperiment,
    setPreprocessedExperiment,
    isPreprocessedLoaderOpen,
    isPreprocessedImporting,
    isPreprocessedDragActive,
    preprocessedImportError,
    preprocessedImportBytesProcessed,
    preprocessedImportTotalBytes,
    preprocessedImportVolumesDecoded,
    preprocessedImportTotalVolumeCount,
    preprocessedFileInputRef,
    handlePreprocessedLoaderOpen,
    handlePreprocessedLoaderClose,
    handlePreprocessedFileInputChange,
    handlePreprocessedBrowse,
    handlePreprocessedDragEnter,
    handlePreprocessedDragLeave,
    handlePreprocessedDragOver,
    handlePreprocessedDrop,
    importPreprocessedFile,
    resetPreprocessedState
  };
}
