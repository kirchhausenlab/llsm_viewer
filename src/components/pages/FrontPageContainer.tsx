import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import FrontPage, { type ExperimentType } from './FrontPage';
import usePreprocessedExperiment from '../../hooks/dataset/usePreprocessedExperiment';
import type { VoxelResolutionHook } from '../../hooks/useVoxelResolution';
import type { DatasetErrorHook } from '../../hooks/useDatasetErrors';
import type { FollowedTrackState, TrackSetState } from '../../types/channelTracks';
import type { ChannelSource, ChannelValidation, StagedPreprocessedExperiment } from '../../hooks/dataset';
import { preprocessDatasetToStorage } from '../../shared/utils/preprocessedDataset';
import { createDirectoryHandlePreprocessedStorage, createOpfsPreprocessedStorage } from '../../shared/storage/preprocessedStorage';
import type { PreprocessedStorageHandle } from '../../shared/storage/preprocessedStorage';

type TrackSummary = { totalRows: number; uniqueTracks: number };
const PREPROCESSED_STORAGE_ROOT_DIR = 'llsm-viewer-preprocessed-vnext';
const FRONTPAGE_OPFS_DATASET_ID = 'preprocessed-experiment';
const PREPROCESS_STORAGE_STRATEGY = {
  maxInFlightChunkWrites: 4,
  sharding: {
    enabled: true
  }
} as const;

export type FrontPageContainerProps = {
  isExperimentSetupStarted: boolean;
  channels: ChannelSource[];
  setChannels: Dispatch<SetStateAction<ChannelSource[]>>;
  activeChannelId: string | null;
  activeChannel: ChannelSource | null;
  channelValidationMap: Map<string, ChannelValidation>;
  editingChannelId: string | null;
  editingChannelInputRef: MutableRefObject<HTMLInputElement | null>;
  editingChannelOriginalNameRef: MutableRefObject<string>;
  setActiveChannelId: Dispatch<SetStateAction<string | null>>;
  setEditingChannelId: Dispatch<SetStateAction<string | null>>;
  onStartExperimentSetup: () => void;
  onAddChannel: () => void;
  onReturnToStart: () => void;
  onChannelNameChange: (channelId: string, name: string) => void;
  onRemoveChannel: (channelId: string) => void;
  onChannelLayerFilesAdded: (channelId: string, files: File[]) => void | Promise<void>;
  onChannelLayerDrop: (channelId: string, dataTransfer: DataTransfer) => void;
  onChannelLayerSegmentationToggle: (channelId: string, layerId: string, value: boolean) => void;
  onChannelLayerRemove: (channelId: string, layerId: string) => void;
  onChannelTrackFilesAdded: (channelId: string, files: File[]) => void | Promise<void>;
  onChannelTrackDrop: (channelId: string, dataTransfer: DataTransfer) => void;
  onChannelTrackSetNameChange: (channelId: string, trackSetId: string, name: string) => void;
  onChannelTrackSetRemove: (channelId: string, trackSetId: string) => void;
  setIsExperimentSetupStarted: Dispatch<SetStateAction<boolean>>;
  setViewerMode: Dispatch<SetStateAction<'3d'>>;
  updateChannelIdCounter: (sources: ChannelSource[]) => void;
  showInteractionWarning: (message: string) => void;
  isLaunchingViewer: boolean;
  setTrackSetStates: Dispatch<SetStateAction<Record<string, TrackSetState>>>;
  setTrackOrderModeByTrackSet: Dispatch<SetStateAction<Record<string, 'id' | 'length'>>>;
  setSelectedTrackOrder: Dispatch<SetStateAction<string[]>>;
  setFollowedTrack: Dispatch<SetStateAction<FollowedTrackState>>;
  computeTrackSummary: (entries: string[][]) => TrackSummary;
  hasGlobalTimepointMismatch: boolean;
  interactionErrorMessage: string | null;
  launchErrorMessage: string | null;
  onLaunchViewer: () => void;
  canLaunch: boolean;
  warningWindowInitialPosition: { x: number; y: number };
  warningWindowWidth: number;
  onPreprocessedStateChange?: (state: {
    preprocessedExperiment: StagedPreprocessedExperiment | null;
    resetPreprocessedState: () => void;
  }) => void;
  datasetErrors: DatasetErrorHook;
  voxelResolution: VoxelResolutionHook;
};

export default function FrontPageContainer({
  isExperimentSetupStarted,
  channels,
  setChannels,
  activeChannelId,
  activeChannel,
  channelValidationMap,
  editingChannelId,
  editingChannelInputRef,
  editingChannelOriginalNameRef,
  setActiveChannelId,
  setEditingChannelId,
  onStartExperimentSetup,
  onAddChannel,
  onReturnToStart,
  onChannelNameChange,
  onRemoveChannel,
  onChannelLayerFilesAdded,
  onChannelLayerDrop,
  onChannelLayerSegmentationToggle,
  onChannelLayerRemove,
  onChannelTrackFilesAdded,
  onChannelTrackDrop,
  onChannelTrackSetNameChange,
  onChannelTrackSetRemove,
  setIsExperimentSetupStarted,
  setViewerMode,
  updateChannelIdCounter,
  showInteractionWarning,
  isLaunchingViewer,
  setTrackSetStates,
  setTrackOrderModeByTrackSet,
  setSelectedTrackOrder,
  setFollowedTrack,
  computeTrackSummary,
  hasGlobalTimepointMismatch,
  interactionErrorMessage,
  launchErrorMessage,
  onLaunchViewer,
  canLaunch,
  warningWindowInitialPosition,
  warningWindowWidth,
  onPreprocessedStateChange,
  datasetErrors,
  voxelResolution
}: FrontPageContainerProps) {
  const {
    datasetErrorResetSignal,
    clearDatasetError
  } = datasetErrors;
  const {
    voxelResolutionInput,
    voxelResolution: voxelResolutionValue,
    handleVoxelResolutionAxisChange,
    handleVoxelResolutionUnitChange,
    handleVoxelResolutionTimeUnitChange,
    handleVoxelResolutionAnisotropyToggle
  } = voxelResolution;

  const preprocessedState = usePreprocessedExperiment({
    channels,
    setChannels,
    setActiveChannelId,
    setEditingChannelId,
    setTrackSetStates,
    setTrackOrderModeByTrackSet,
    setSelectedTrackOrder,
    setFollowedTrack,
    setIsExperimentSetupStarted,
    setViewerMode,
    clearDatasetError,
    updateChannelIdCounter,
    showInteractionWarning,
    isLaunchingViewer
  });

  const {
    preprocessedExperiment,
    setPreprocessedExperiment,
    resetPreprocessedState,
    isPreprocessedImporting,
    isPreprocessedLoaderOpen
  } = preprocessedState;

  const [isPreprocessingExperiment, setIsPreprocessingExperiment] = useState(false);
  const [preprocessSuccessMessage, setPreprocessSuccessMessage] = useState<string | null>(null);
  const [exportWhilePreprocessing, setExportWhilePreprocessing] = useState(false);
  const [exportName, setExportName] = useState('');
  const [exportDestinationLabel, setExportDestinationLabel] = useState<string | null>(null);
  const [isExperimentTypeSelectionOpen, setIsExperimentTypeSelectionOpen] = useState(false);
  const [selectedExperimentType, setSelectedExperimentType] = useState<ExperimentType>('single-3d-volume');

  const createDefaultExportName = useCallback((): string => {
    const now = new Date();
    const stamp = now.toISOString().replace(/[:.]/g, '-');
    const random = Math.random().toString(16).slice(2, 6);
    return `llsm-viewer-preprocessed-vnext-${stamp}-${random}`;
  }, []);

  const ensureZarrDirectoryName = useCallback((name: string): string => {
    const trimmed = name.trim();
    if (!trimmed) {
      return ensureZarrDirectoryName(createDefaultExportName());
    }
    return trimmed.toLowerCase().endsWith('.zarr') ? trimmed : `${trimmed}.zarr`;
  }, [createDefaultExportName]);

  const handleExportWhilePreprocessingChange = useCallback(
    (enabled: boolean) => {
      setExportWhilePreprocessing(enabled);
      setExportDestinationLabel(null);
      if (enabled && !exportName.trim()) {
        setExportName(createDefaultExportName());
      }
    },
    [createDefaultExportName, exportName]
  );

  const handleExportNameChange = useCallback((value: string) => {
    setExportName(value);
    setExportDestinationLabel(null);
  }, []);

  const handleOpenExperimentTypeSelection = useCallback(() => {
    resetPreprocessedState();
    setIsExperimentTypeSelectionOpen(true);
    clearDatasetError();
  }, [clearDatasetError, resetPreprocessedState]);

  const handleExperimentTypeSelected = useCallback((experimentType: ExperimentType) => {
    setSelectedExperimentType(experimentType);
    if (experimentType === '2d-movie') {
      handleVoxelResolutionAxisChange('z', '1.0');
    }
    setIsExperimentTypeSelectionOpen(false);
    onStartExperimentSetup();
  }, [handleVoxelResolutionAxisChange, onStartExperimentSetup]);

  useLayoutEffect(() => {
    onPreprocessedStateChange?.({
      preprocessedExperiment,
      resetPreprocessedState
    });
  }, [onPreprocessedStateChange, preprocessedExperiment, resetPreprocessedState]);

  useEffect(() => {
    if (!preprocessedExperiment) {
      setPreprocessSuccessMessage(null);
    }
  }, [preprocessedExperiment]);

  const frontPageMode = useMemo<'initial' | 'experimentTypeSelection' | 'configuring' | 'preprocessed'>(() => {
    if (preprocessedExperiment) {
      return 'preprocessed';
    }
    if (isExperimentTypeSelectionOpen) {
      return 'experimentTypeSelection';
    }
    if (channels.length > 0 || isExperimentSetupStarted) {
      return 'configuring';
    }
    return 'initial';
  }, [
    channels.length,
    isExperimentSetupStarted,
    isExperimentTypeSelectionOpen,
    preprocessedExperiment
  ]);

  const handleReturnFromFrontPage = useCallback(() => {
    if (frontPageMode === 'configuring') {
      setIsExperimentTypeSelectionOpen(true);
      return;
    }
    setIsExperimentTypeSelectionOpen(false);
    setSelectedExperimentType('single-3d-volume');
    onReturnToStart();
  }, [frontPageMode, onReturnToStart]);

  const handlePreprocessExperiment = useCallback(async () => {
    if (
      isPreprocessingExperiment ||
      isLaunchingViewer ||
      isPreprocessedImporting
    ) {
      return;
    }

    if (!voxelResolutionValue) {
      showInteractionWarning('Fill in all voxel resolution fields before preprocessing.');
      return;
    }

    if (!canLaunch) {
      showInteractionWarning('Resolve all dataset issues before preprocessing.');
      return;
    }

      setPreprocessSuccessMessage(null);
      setIsPreprocessingExperiment(true);
    try {
      setIsExperimentSetupStarted(true);
      const channelsMetadata = channels.map((channel) => ({
        id: channel.id,
        name: channel.name.trim() || 'Untitled channel',
        trackSets: channel.trackSets.map((set) => ({
          id: set.id,
          name: set.name.trim() || 'Tracks',
          fileName: set.fileName,
          entries: set.entries
        }))
      }));
      const layersToProcess = channels
        .flatMap((channel) =>
          channel.layers.map((layer) => ({
            channelId: channel.id,
            channelLabel: channel.name.trim() || 'Untitled channel',
            key: layer.id,
            label: 'Volume',
            files: layer.files,
            isSegmentation: layer.isSegmentation
          }))
        )
        .filter((layer) => layer.files.length > 0);

      let selectedStorageHandle: PreprocessedStorageHandle | null = null;

      if (exportWhilePreprocessing) {
        if (typeof window === 'undefined' || typeof window.showDirectoryPicker !== 'function') {
          showInteractionWarning('Folder export is not supported in this browser.');
          return;
        }

        let directoryHandle: FileSystemDirectoryHandle;
        try {
          directoryHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') {
            return;
          }
          throw error;
        }

        const exportDirectoryName = ensureZarrDirectoryName(exportName);
        if (/[\\/]/.test(exportDirectoryName)) {
          showInteractionWarning('Export name must not contain path separators.');
          return;
        }

        let exportDirectoryHandle: FileSystemDirectoryHandle;
        try {
          await directoryHandle.getDirectoryHandle(exportDirectoryName);
          showInteractionWarning(`A folder named "${exportDirectoryName}" already exists in the selected location.`);
          return;
        } catch (error) {
          if (error instanceof DOMException && error.name === 'NotFoundError') {
            // expected
          } else if (error instanceof Error && /not found/i.test(error.message)) {
            // expected in some environments
          } else {
            throw error;
          }
        }

        exportDirectoryHandle = await directoryHandle.getDirectoryHandle(exportDirectoryName, { create: true });
        setExportDestinationLabel(`${directoryHandle.name}/${exportDirectoryName}/`);

        selectedStorageHandle = await createDirectoryHandlePreprocessedStorage(exportDirectoryHandle, {
          id: exportDirectoryName
        });
      } else {
        selectedStorageHandle = await createOpfsPreprocessedStorage({
          datasetId: FRONTPAGE_OPFS_DATASET_ID,
          rootDir: PREPROCESSED_STORAGE_ROOT_DIR
        });
      }

      if (!selectedStorageHandle) {
        throw new Error('Preprocessed storage handle was not initialized.');
      }

      const { manifest, channelSummaries, totalVolumeCount } = await preprocessDatasetToStorage({
        layers: layersToProcess,
        channels: channelsMetadata,
        voxelResolution: voxelResolutionValue,
        movieMode: '3d',
        storage: selectedStorageHandle.storage,
        storageStrategy: PREPROCESS_STORAGE_STRATEGY
      });

      setPreprocessedExperiment({
        manifest,
        channelSummaries,
        totalVolumeCount,
        storageHandle: selectedStorageHandle,
        sourceName: 'experiment',
        sourceSize: null
      });
      clearDatasetError();
      setPreprocessSuccessMessage('Experiment successfully preprocessed.');
    } catch (error) {
      console.error('Failed to preprocess experiment', error);
      const message = error instanceof Error ? error.message : 'Failed to preprocess experiment.';
      showInteractionWarning(message);
      setPreprocessedExperiment(null);
    } finally {
      setIsPreprocessingExperiment(false);
    }
  }, [
    canLaunch,
    channels,
    clearDatasetError,
    ensureZarrDirectoryName,
    exportName,
    exportWhilePreprocessing,
    isLaunchingViewer,
    isPreprocessingExperiment,
    isPreprocessedImporting,
    setIsExperimentSetupStarted,
    setPreprocessedExperiment,
    showInteractionWarning,
    voxelResolutionValue
  ]);

  const isFrontPageLocked =
    isLaunchingViewer ||
    isPreprocessingExperiment ||
    isPreprocessedImporting;

  const launchButtonEnabled =
    frontPageMode === 'preprocessed' ? preprocessedState.preprocessedExperiment !== null : canLaunch;
  const launchButtonLaunchable: 'true' | 'false' = launchButtonEnabled ? 'true' : 'false';

  const headerProps = {
    onReturnToStart: handleReturnFromFrontPage,
    isFrontPageLocked
  };

  const initialActions = {
    isFrontPageLocked,
    onStartExperimentSetup: handleOpenExperimentTypeSelection,
    onOpenPreprocessedLoader: preprocessedState.handlePreprocessedLoaderOpen,
    isPreprocessedImporting: preprocessedState.isPreprocessedImporting
  };

  const experimentTypeSelectionProps = {
    onSelectExperimentType: handleExperimentTypeSelected,
    isFrontPageLocked
  };

  const experimentConfigurationProps = {
    experimentType: selectedExperimentType,
    voxelResolution: voxelResolutionInput,
    onVoxelResolutionAxisChange: handleVoxelResolutionAxisChange,
    onVoxelResolutionUnitChange: handleVoxelResolutionUnitChange,
    onVoxelResolutionTimeUnitChange: handleVoxelResolutionTimeUnitChange,
    onVoxelResolutionAnisotropyToggle: handleVoxelResolutionAnisotropyToggle
  };

  const preprocessedLoaderProps = {
    isOpen: preprocessedState.isPreprocessedLoaderOpen,
    isPreprocessedImporting: preprocessedState.isPreprocessedImporting,
    onPreprocessedBrowse: preprocessedState.handlePreprocessedBrowse,
    onPreprocessedArchiveBrowse: preprocessedState.handlePreprocessedArchiveBrowse,
    onPreprocessedArchiveDrop: preprocessedState.handlePreprocessedArchiveDrop,
    preprocessedImportError: preprocessedState.preprocessedImportError
  };

  const channelListPanelProps = {
    channels,
    channelValidationMap,
    activeChannelId,
    activeChannel,
    editingChannelId,
    editingChannelInputRef,
    editingChannelOriginalNameRef,
    setActiveChannelId,
    setEditingChannelId,
    onAddChannel,
    onChannelNameChange,
    onRemoveChannel,
    onChannelLayerFilesAdded,
    onChannelLayerDrop,
    onChannelLayerSegmentationToggle,
    onChannelLayerRemove,
    onChannelTrackFilesAdded,
    onChannelTrackDrop,
    onChannelTrackSetNameChange,
    onChannelTrackSetRemove,
    isFrontPageLocked
  };

  const preprocessedSummaryProps = {
    preprocessedExperiment,
    computeTrackSummary
  };

  const launchActionsProps = {
    frontPageMode,
    hasGlobalTimepointMismatch,
    interactionErrorMessage,
    launchErrorMessage,
    showLaunchViewerButton:
      frontPageMode === 'configuring' || frontPageMode === 'preprocessed' || isPreprocessedLoaderOpen,
    onPreprocessExperiment: handlePreprocessExperiment,
    isPreprocessingExperiment,
    preprocessButtonEnabled: canLaunch,
    preprocessSuccessMessage,
    exportWhilePreprocessing,
    onExportWhilePreprocessingChange: handleExportWhilePreprocessingChange,
    exportName,
    onExportNameChange: handleExportNameChange,
    exportDestinationLabel,
    onLaunchViewer,
    isLaunchingViewer,
    launchButtonEnabled,
    launchButtonLaunchable,
    canLaunch
  };

  const warningsWindowProps = {
    launchErrorMessage,
    warningWindowInitialPosition,
    warningWindowWidth,
    datasetErrorResetSignal,
    onDatasetErrorDismiss: clearDatasetError
  };

  return (
    <FrontPage
      isFrontPageLocked={isFrontPageLocked}
      frontPageMode={frontPageMode}
      header={headerProps}
      initialActions={initialActions}
      experimentTypeSelection={experimentTypeSelectionProps}
      experimentConfiguration={experimentConfigurationProps}
      preprocessedLoader={preprocessedLoaderProps}
      channelListPanel={channelListPanelProps}
      preprocessedSummary={preprocessedSummaryProps}
      launchActions={launchActionsProps}
      warningsWindow={warningsWindowProps}
    />
  );
}
