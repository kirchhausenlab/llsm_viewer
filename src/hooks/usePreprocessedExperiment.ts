import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ChangeEvent,
  Dispatch,
  DragEvent,
  FormEvent,
  MutableRefObject,
  SetStateAction
} from 'react';
import { collectFilesFromDataTransfer } from '../utils/appHelpers';
import {
  chooseDropboxFiles,
  DropboxConfigurationError,
  getDropboxAppKeyInfo,
  setDropboxAppKey,
  type DropboxAppKeySource
} from '../integrations/dropbox';
import {
  importPreprocessedDataset,
  type ChannelExportMetadata
} from '../utils/preprocessedDataset';
import {
  exportPreprocessedDatasetInWorker,
  canUseFileSystemSavePicker,
  requestFileSystemSaveHandle,
  type FileSystemFileHandleLike
} from '../workers/exportPreprocessedDatasetClient';
import { downloadStream, sanitizeExportFileName } from '../utils/downloads';
import type { LoadedLayer } from '../types/layers';
import type {
  ChannelSource,
  ChannelTrackState,
  FollowedTrackState,
  StagedPreprocessedExperiment
} from '../App';

type UsePreprocessedExperimentOptions = {
  channels: ChannelSource[];
  setChannels: Dispatch<SetStateAction<ChannelSource[]>>;
  setActiveChannelId: Dispatch<SetStateAction<string | null>>;
  setEditingChannelId: Dispatch<SetStateAction<string | null>>;
  setChannelTrackStates: Dispatch<SetStateAction<Record<string, ChannelTrackState>>>;
  setTrackOrderModeByChannel: Dispatch<SetStateAction<Record<string, 'id' | 'length'>>>;
  setSelectedTrackIds: Dispatch<SetStateAction<ReadonlySet<string>>>;
  setFollowedTrack: Dispatch<SetStateAction<FollowedTrackState>>;
  setIsExperimentSetupStarted: Dispatch<SetStateAction<boolean>>;
  clearDatasetError: () => void;
  updateChannelIdCounter: (sources: ChannelSource[]) => void;
  loadSelectedDataset: () => Promise<LoadedLayer[] | null>;
  showInteractionWarning: (message: string) => void;
  isLaunchingViewer: boolean;
};

type UsePreprocessedExperimentResult = {
  preprocessedExperiment: StagedPreprocessedExperiment | null;
  isPreprocessedLoaderOpen: boolean;
  isPreprocessedImporting: boolean;
  isPreprocessedDragActive: boolean;
  isExportingPreprocessed: boolean;
  preprocessedDropboxImporting: boolean;
  preprocessedImportError: string | null;
  preprocessedDropboxError: string | null;
  preprocessedDropboxInfo: string | null;
  isPreprocessedDropboxConfigOpen: boolean;
  preprocessedDropboxAppKeyInput: string;
  preprocessedDropboxAppKeySource: DropboxAppKeySource | null;
  preprocessedFileInputRef: MutableRefObject<HTMLInputElement | null>;
  handlePreprocessedLoaderOpen: () => void;
  handlePreprocessedLoaderClose: () => void;
  handlePreprocessedFileInputChange: (event: ChangeEvent<HTMLInputElement>) => void;
  handlePreprocessedBrowse: () => void;
  handlePreprocessedDragEnter: (event: DragEvent<HTMLDivElement>) => void;
  handlePreprocessedDragLeave: (event: DragEvent<HTMLDivElement>) => void;
  handlePreprocessedDragOver: (event: DragEvent<HTMLDivElement>) => void;
  handlePreprocessedDrop: (event: DragEvent<HTMLDivElement>) => Promise<void>;
  handlePreprocessedDropboxImport: () => Promise<void>;
  handlePreprocessedDropboxConfigSubmit: (event: FormEvent<HTMLFormElement>) => void;
  handlePreprocessedDropboxConfigInputChange: (event: ChangeEvent<HTMLInputElement>) => void;
  handlePreprocessedDropboxConfigClear: () => void;
  handlePreprocessedDropboxConfigCancel: () => void;
  handleExportPreprocessedExperiment: () => Promise<void>;
  resetPreprocessedState: () => void;
};

export default function usePreprocessedExperiment({
  channels,
  setChannels,
  setActiveChannelId,
  setEditingChannelId,
  setChannelTrackStates,
  setTrackOrderModeByChannel,
  setSelectedTrackIds,
  setFollowedTrack,
  setIsExperimentSetupStarted,
  clearDatasetError,
  updateChannelIdCounter,
  loadSelectedDataset,
  showInteractionWarning,
  isLaunchingViewer
}: UsePreprocessedExperimentOptions): UsePreprocessedExperimentResult {
  const [preprocessedExperiment, setPreprocessedExperiment] =
    useState<StagedPreprocessedExperiment | null>(null);
  const [isPreprocessedLoaderOpen, setIsPreprocessedLoaderOpen] = useState(false);
  const [isPreprocessedImporting, setIsPreprocessedImporting] = useState(false);
  const [preprocessedImportError, setPreprocessedImportError] = useState<string | null>(null);
  const [isPreprocessedDragActive, setIsPreprocessedDragActive] = useState(false);
  const [isExportingPreprocessed, setIsExportingPreprocessed] = useState(false);
  const [preprocessedDropboxImporting, setPreprocessedDropboxImporting] = useState(false);
  const [preprocessedDropboxError, setPreprocessedDropboxError] = useState<string | null>(null);
  const [preprocessedDropboxInfo, setPreprocessedDropboxInfo] = useState<string | null>(null);
  const [isPreprocessedDropboxConfigOpen, setIsPreprocessedDropboxConfigOpen] = useState(false);
  const [preprocessedDropboxAppKeyInput, setPreprocessedDropboxAppKeyInput] = useState('');
  const [preprocessedDropboxAppKeySource, setPreprocessedDropboxAppKeySource] =
    useState<DropboxAppKeySource | null>(null);

  const preprocessedFileInputRef = useRef<HTMLInputElement | null>(null);
  const preprocessedDropCounterRef = useRef(0);

  const resetPreprocessedLoader = useCallback(() => {
    setPreprocessedImportError(null);
    setPreprocessedDropboxError(null);
    setPreprocessedDropboxInfo(null);
    setIsPreprocessedDropboxConfigOpen(false);
    setIsPreprocessedDragActive(false);
    preprocessedDropCounterRef.current = 0;
  }, []);

  const syncPreprocessedDropboxConfig = useCallback(() => {
    const info = getDropboxAppKeyInfo();
    setPreprocessedDropboxAppKeyInput(info.appKey ?? '');
    setPreprocessedDropboxAppKeySource(info.source);
  }, []);

  useEffect(() => {
    if (isPreprocessedLoaderOpen) {
      syncPreprocessedDropboxConfig();
      resetPreprocessedLoader();
    }
  }, [isPreprocessedLoaderOpen, resetPreprocessedLoader, syncPreprocessedDropboxConfig]);

  const handlePreprocessedLoaderOpen = useCallback(() => {
    if (isPreprocessedImporting || preprocessedDropboxImporting) {
      return;
    }
    setIsPreprocessedLoaderOpen(true);
    resetPreprocessedLoader();
  }, [isPreprocessedImporting, preprocessedDropboxImporting, resetPreprocessedLoader]);

  const handlePreprocessedLoaderClose = useCallback(() => {
    if (isPreprocessedImporting) {
      return;
    }
    setIsPreprocessedLoaderOpen(false);
    resetPreprocessedLoader();
  }, [isPreprocessedImporting, resetPreprocessedLoader]);

  const importPreprocessedFile = useCallback(
    async (file: File) => {
      if (isPreprocessedImporting) {
        return;
      }
      setIsPreprocessedImporting(true);
      setPreprocessedImportError(null);
      setPreprocessedDropboxError(null);
      setPreprocessedDropboxInfo(null);
      try {
        const buffer = await file.arrayBuffer();
        const result = await importPreprocessedDataset(buffer);
        const staged: StagedPreprocessedExperiment = {
          ...result,
          sourceName: file.name ?? null,
          sourceSize: Number.isFinite(file.size) ? file.size : null
        };
        const nextChannels = result.channelSummaries.map<ChannelSource>((summary) => ({
          id: summary.id,
          name: summary.name,
          layers: [],
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
        setSelectedTrackIds(new Set<string>());
        setFollowedTrack(null);
        setPreprocessedExperiment(staged);
        setIsExperimentSetupStarted(false);
        setIsPreprocessedLoaderOpen(false);
        resetPreprocessedLoader();
        clearDatasetError();
      } catch (error) {
        console.error('Failed to import preprocessed dataset', error);
        const message =
          error instanceof Error ? error.message : 'Failed to import preprocessed dataset.';
        setPreprocessedImportError(message);
        setPreprocessedExperiment(null);
        setChannels([]);
        setIsExperimentSetupStarted(false);
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
      setSelectedTrackIds,
      setTrackOrderModeByChannel,
      setChannelTrackStates,
      updateChannelIdCounter
    ]
  );

  const handlePreprocessedFileInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      if (isPreprocessedImporting || preprocessedDropboxImporting) {
        event.target.value = '';
        return;
      }
      const fileList = event.target.files;
      if (fileList && fileList.length > 0) {
        void importPreprocessedFile(fileList[0]);
      }
      event.target.value = '';
    },
    [importPreprocessedFile, isPreprocessedImporting, preprocessedDropboxImporting]
  );

  const handlePreprocessedBrowse = useCallback(() => {
    if (isPreprocessedImporting || preprocessedDropboxImporting) {
      return;
    }
    preprocessedFileInputRef.current?.click();
  }, [isPreprocessedImporting, preprocessedDropboxImporting]);

  const handlePreprocessedDragEnter = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (isPreprocessedImporting || preprocessedDropboxImporting) {
        return;
      }
      preprocessedDropCounterRef.current += 1;
      setIsPreprocessedDragActive(true);
    },
    [isPreprocessedImporting, preprocessedDropboxImporting]
  );

  const handlePreprocessedDragLeave = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (isPreprocessedImporting || preprocessedDropboxImporting) {
        return;
      }
      preprocessedDropCounterRef.current = Math.max(0, preprocessedDropCounterRef.current - 1);
      if (preprocessedDropCounterRef.current === 0) {
        setIsPreprocessedDragActive(false);
      }
    },
    [isPreprocessedImporting, preprocessedDropboxImporting]
  );

  const handlePreprocessedDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  }, []);

  const handlePreprocessedDrop = useCallback(
    async (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      preprocessedDropCounterRef.current = 0;
      setIsPreprocessedDragActive(false);
      if (isPreprocessedImporting || preprocessedDropboxImporting) {
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
    [importPreprocessedFile, isPreprocessedImporting, preprocessedDropboxImporting]
  );

  const handlePreprocessedDropboxConfigInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setPreprocessedDropboxAppKeyInput(event.target.value);
      if (preprocessedDropboxInfo) {
        setPreprocessedDropboxInfo(null);
      }
    },
    [preprocessedDropboxInfo]
  );

  const handlePreprocessedDropboxConfigSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (preprocessedDropboxAppKeySource === 'env') {
        setIsPreprocessedDropboxConfigOpen(false);
        return;
      }
      const trimmed = preprocessedDropboxAppKeyInput.trim();
      setDropboxAppKey(trimmed ? trimmed : null);
      syncPreprocessedDropboxConfig();
      setIsPreprocessedDropboxConfigOpen(false);
      setPreprocessedDropboxError(null);
      setPreprocessedDropboxInfo(
        trimmed
          ? 'Dropbox app key saved. Try importing from Dropbox again.'
          : 'Saved Dropbox app key cleared.'
      );
    },
    [preprocessedDropboxAppKeyInput, preprocessedDropboxAppKeySource, syncPreprocessedDropboxConfig]
  );

  const handlePreprocessedDropboxConfigClear = useCallback(() => {
    setDropboxAppKey(null);
    syncPreprocessedDropboxConfig();
    setPreprocessedDropboxInfo('Saved Dropbox app key cleared.');
    setPreprocessedDropboxError(null);
  }, [syncPreprocessedDropboxConfig]);

  const handlePreprocessedDropboxConfigCancel = useCallback(() => {
    setIsPreprocessedDropboxConfigOpen(false);
  }, []);

  const handlePreprocessedDropboxImport = useCallback(async () => {
    if (isPreprocessedImporting || preprocessedDropboxImporting) {
      return;
    }
    setPreprocessedDropboxError(null);
    setPreprocessedDropboxInfo(null);
    setPreprocessedDropboxImporting(true);
    try {
      const files = await chooseDropboxFiles({
        extensions: ['.zip', '.llsm', '.llsmz', '.json'],
        multiselect: false
      });
      const [file] = files;
      if (file) {
        await importPreprocessedFile(file);
      }
    } catch (error) {
      console.error('Failed to import preprocessed experiment from Dropbox', error);
      if (error instanceof DropboxConfigurationError) {
        syncPreprocessedDropboxConfig();
        setIsPreprocessedDropboxConfigOpen(true);
        setPreprocessedDropboxError(
          'Dropbox is not configured yet. Add your Dropbox app key below to connect your account.'
        );
      } else {
        const message = error instanceof Error ? error.message : 'Failed to import from Dropbox.';
        setPreprocessedDropboxError(message);
      }
    } finally {
      setPreprocessedDropboxImporting(false);
    }
  }, [
    importPreprocessedFile,
    isPreprocessedImporting,
    preprocessedDropboxImporting,
    syncPreprocessedDropboxConfig
  ]);

  const handleExportPreprocessedExperiment = useCallback(async () => {
    if (isExportingPreprocessed || isLaunchingViewer) {
      return;
    }

    const hasAnyLayers = preprocessedExperiment
      ? preprocessedExperiment.layers.length > 0
      : channels.some((channel) => channel.layers.length > 0);

    if (!hasAnyLayers) {
      showInteractionWarning('There are no volumes available to export.');
      return;
    }

    setIsExportingPreprocessed(true);
    try {
      const suggestionSource =
        preprocessedExperiment?.sourceName ?? channels[0]?.name ?? 'preprocessed-experiment';
      const suggestionTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const suggestionBase = sanitizeExportFileName(suggestionSource);
      const suggestedFileName = `${suggestionBase}-${suggestionTimestamp}.zip`;

      let fileHandle: FileSystemFileHandleLike | null = null;
      if (canUseFileSystemSavePicker()) {
        try {
          fileHandle = await requestFileSystemSaveHandle(suggestedFileName);
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') {
            console.info('Preprocessed dataset export cancelled by user');
            return;
          }
          throw error;
        }
      }

      let layersToExport: LoadedLayer[];
      let channelsMetadata: ChannelExportMetadata[];

      if (preprocessedExperiment) {
        layersToExport = preprocessedExperiment.layers;
        channelsMetadata = preprocessedExperiment.channelSummaries.map((summary) => ({
          id: summary.id,
          name: summary.name.trim() || 'Untitled channel',
          trackEntries: summary.trackEntries
        }));
      } else {
        const normalizedLayers = await loadSelectedDataset();
        if (!normalizedLayers) {
          return;
        }
        layersToExport = normalizedLayers;
        channelsMetadata = channels.map<ChannelExportMetadata>((channel) => ({
          id: channel.id,
          name: channel.name.trim() || 'Untitled channel',
          trackEntries: channel.trackEntries
        }));
      }

      if (layersToExport.length === 0) {
        showInteractionWarning('There are no volumes available to export.');
        return;
      }

      const { manifest, stream } = await exportPreprocessedDatasetInWorker({
        layers: layersToExport,
        channels: channelsMetadata
      });

      const baseNameSource =
        preprocessedExperiment?.sourceName ?? channelsMetadata[0]?.name ?? 'preprocessed-experiment';
      const fileBase = sanitizeExportFileName(baseNameSource);
      const timestamp = manifest.generatedAt.replace(/[:.]/g, '-');
      const fileName = `${fileBase}-${timestamp}.zip`;

      await downloadStream(stream, fileName, fileHandle);
      clearDatasetError();
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        console.info('Preprocessed dataset export cancelled by user');
      } else {
        console.error('Failed to export preprocessed dataset', error);
        const message = error instanceof Error ? error.message : 'Failed to export preprocessed dataset.';
        showInteractionWarning(message);
      }
    } finally {
      setIsExportingPreprocessed(false);
    }
  }, [
    channels,
    clearDatasetError,
    isExportingPreprocessed,
    isLaunchingViewer,
    loadSelectedDataset,
    preprocessedExperiment,
    showInteractionWarning
  ]);

  const resetPreprocessedState = useCallback(() => {
    setPreprocessedExperiment(null);
    setIsPreprocessedLoaderOpen(false);
    resetPreprocessedLoader();
  }, [resetPreprocessedLoader]);

  return {
    preprocessedExperiment,
    isPreprocessedLoaderOpen,
    isPreprocessedImporting,
    isPreprocessedDragActive,
    isExportingPreprocessed,
    preprocessedDropboxImporting,
    preprocessedImportError,
    preprocessedDropboxError,
    preprocessedDropboxInfo,
    isPreprocessedDropboxConfigOpen,
    preprocessedDropboxAppKeyInput,
    preprocessedDropboxAppKeySource,
    preprocessedFileInputRef,
    handlePreprocessedLoaderOpen,
    handlePreprocessedLoaderClose,
    handlePreprocessedFileInputChange,
    handlePreprocessedBrowse,
    handlePreprocessedDragEnter,
    handlePreprocessedDragLeave,
    handlePreprocessedDragOver,
    handlePreprocessedDrop,
    handlePreprocessedDropboxImport,
    handlePreprocessedDropboxConfigSubmit,
    handlePreprocessedDropboxConfigInputChange,
    handlePreprocessedDropboxConfigClear,
    handlePreprocessedDropboxConfigCancel,
    handleExportPreprocessedExperiment,
    resetPreprocessedState
  };
}
