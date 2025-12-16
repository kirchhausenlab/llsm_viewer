import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction, ChangeEvent, DragEvent, FormEvent } from 'react';
import FrontPage from './FrontPage';
import usePreprocessedExperiment from '../../hooks/dataset/usePreprocessedExperiment';
import { type ExperimentDimension, type VoxelResolutionHook } from '../../hooks/useVoxelResolution';
import type { DatasetErrorHook } from '../../hooks/useDatasetErrors';
import type { DropboxAppKeySource } from '../../integrations/dropbox';
import type { ChannelTrackState, FollowedTrackState } from '../../types/channelTracks';
import type { LoadedLayer } from '../../types/layers';
import type { ChannelSource, ChannelValidation, StagedPreprocessedExperiment } from '../../hooks/dataset';
import { stagePreprocessedDataset } from '../../shared/utils/preprocessedDataset';

type TrackSummary = { totalRows: number; uniqueTracks: number };

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
  onChannelTrackFileSelected: (channelId: string, file: File | null) => void;
  onChannelTrackDrop: (channelId: string, dataTransfer: DataTransfer) => void;
  onChannelTrackClear: (channelId: string) => void;
  setIsExperimentSetupStarted: Dispatch<SetStateAction<boolean>>;
  setViewerMode: Dispatch<SetStateAction<'3d' | '2d'>>;
  updateChannelIdCounter: (sources: ChannelSource[]) => void;
  loadSelectedDataset: () => Promise<LoadedLayer[] | null>;
  showInteractionWarning: (message: string) => void;
  isLaunchingViewer: boolean;
  setChannelTrackStates: Dispatch<SetStateAction<Record<string, ChannelTrackState>>>;
  setTrackOrderModeByChannel: Dispatch<SetStateAction<Record<string, 'id' | 'length'>>>;
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
  onChannelTrackFileSelected,
  onChannelTrackDrop,
  onChannelTrackClear,
  setIsExperimentSetupStarted,
  setViewerMode,
  updateChannelIdCounter,
  loadSelectedDataset,
  showInteractionWarning,
  isLaunchingViewer,
  setChannelTrackStates,
  setTrackOrderModeByChannel,
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
    datasetError,
    datasetErrorContext,
    datasetErrorResetSignal,
    reportDatasetError,
    clearDatasetError,
    bumpDatasetErrorResetSignal
  } = datasetErrors;
  const {
    voxelResolutionInput,
    voxelResolution: voxelResolutionValue,
    anisotropyScale,
    experimentDimension,
    trackScale,
    handleVoxelResolutionAxisChange,
    handleVoxelResolutionUnitChange,
    handleVoxelResolutionAnisotropyToggle,
    handleExperimentDimensionChange,
    setExperimentDimension,
    setVoxelResolutionInput
  } = voxelResolution;

  const handleLoadSelectedDataset = useCallback(() => {
    setIsExperimentSetupStarted(true);
    setExperimentDimension(experimentDimension);
    return loadSelectedDataset();
  }, [experimentDimension, loadSelectedDataset, setExperimentDimension, setIsExperimentSetupStarted]);

  const preprocessedState = usePreprocessedExperiment({
    channels,
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
    loadSelectedDataset: handleLoadSelectedDataset,
    showInteractionWarning,
    isLaunchingViewer,
    voxelResolution: voxelResolutionValue,
    experimentDimension
  });

  const {
    preprocessedExperiment,
    setPreprocessedExperiment,
    resetPreprocessedState,
    isExportingPreprocessed,
    isPreprocessedImporting,
    preprocessedDropboxImporting,
    isPreprocessedLoaderOpen,
    handleExportPreprocessedExperiment
  } = preprocessedState;

  const [isPreprocessingExperiment, setIsPreprocessingExperiment] = useState(false);
  const [preprocessSuccessMessage, setPreprocessSuccessMessage] = useState<string | null>(null);

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

  const frontPageMode = useMemo<'initial' | 'configuring' | 'preprocessed'>(() => {
    if (preprocessedExperiment) {
      return 'preprocessed';
    }
    if (channels.length > 0 || isExperimentSetupStarted) {
      return 'configuring';
    }
    return 'initial';
  }, [channels.length, isExperimentSetupStarted, preprocessedExperiment]);

  const handlePreprocessExperiment = useCallback(async () => {
    if (
      isPreprocessingExperiment ||
      isLaunchingViewer ||
      isExportingPreprocessed ||
      isPreprocessedImporting ||
      preprocessedDropboxImporting
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
      const normalizedLayers = await loadSelectedDataset();
      if (!normalizedLayers) {
        return;
      }

      const channelsMetadata = channels.map((channel) => ({
        id: channel.id,
        name: channel.name.trim() || 'Untitled channel',
        trackEntries: channel.trackEntries
      }));

      const staged = stagePreprocessedDataset({
        layers: normalizedLayers,
        channels: channelsMetadata,
        voxelResolution: voxelResolutionValue,
        movieMode: experimentDimension
      });

      setPreprocessedExperiment({
        ...staged,
        sourceName: 'experiment',
        sourceSize: null
      });
      clearDatasetError();
      setPreprocessSuccessMessage('Experiment successfully preprocessed.');
    } finally {
      setIsPreprocessingExperiment(false);
    }
  }, [
    canLaunch,
    channels,
    clearDatasetError,
    experimentDimension,
    isLaunchingViewer,
    isPreprocessingExperiment,
    isExportingPreprocessed,
    isPreprocessedImporting,
    loadSelectedDataset,
    preprocessedDropboxImporting,
    setIsExperimentSetupStarted,
    setPreprocessedExperiment,
    showInteractionWarning,
    voxelResolutionValue
  ]);

  const isFrontPageLocked =
    isLaunchingViewer ||
    isPreprocessingExperiment ||
    isExportingPreprocessed ||
    isPreprocessedImporting ||
    preprocessedDropboxImporting;

  const launchButtonEnabled =
    frontPageMode === 'preprocessed' ? preprocessedState.preprocessedExperiment !== null : canLaunch;
  const launchButtonLaunchable: 'true' | 'false' = launchButtonEnabled ? 'true' : 'false';

  const headerProps = {
    onReturnToStart,
    isFrontPageLocked
  };

  const initialActions = {
    isFrontPageLocked,
    onStartExperimentSetup,
    onOpenPreprocessedLoader: preprocessedState.handlePreprocessedLoaderOpen,
    isPreprocessedImporting: preprocessedState.isPreprocessedImporting,
    preprocessedDropboxImporting: preprocessedState.preprocessedDropboxImporting
  };

  const experimentConfigurationProps = {
    experimentDimension,
    onExperimentDimensionChange: handleExperimentDimensionChange,
    voxelResolution: voxelResolutionInput,
    onVoxelResolutionAxisChange: handleVoxelResolutionAxisChange,
    onVoxelResolutionUnitChange: handleVoxelResolutionUnitChange,
    onVoxelResolutionAnisotropyToggle: handleVoxelResolutionAnisotropyToggle
  };

  const preprocessedLoaderProps = {
    isOpen: preprocessedState.isPreprocessedLoaderOpen,
    isPreprocessedDragActive: preprocessedState.isPreprocessedDragActive,
    onPreprocessedDragEnter: preprocessedState.handlePreprocessedDragEnter,
    onPreprocessedDragLeave: preprocessedState.handlePreprocessedDragLeave,
    onPreprocessedDragOver: preprocessedState.handlePreprocessedDragOver,
    onPreprocessedDrop: preprocessedState.handlePreprocessedDrop,
    preprocessedFileInputRef: preprocessedState.preprocessedFileInputRef,
    onPreprocessedFileInputChange: preprocessedState.handlePreprocessedFileInputChange,
    isPreprocessedImporting: preprocessedState.isPreprocessedImporting,
    preprocessedImportBytesProcessed: preprocessedState.preprocessedImportBytesProcessed,
    preprocessedImportTotalBytes: preprocessedState.preprocessedImportTotalBytes,
    preprocessedImportVolumesDecoded: preprocessedState.preprocessedImportVolumesDecoded,
    preprocessedImportTotalVolumeCount: preprocessedState.preprocessedImportTotalVolumeCount,
    preprocessedDropboxImporting: preprocessedState.preprocessedDropboxImporting,
    onPreprocessedBrowse: preprocessedState.handlePreprocessedBrowse,
    onPreprocessedDropboxImport: preprocessedState.handlePreprocessedDropboxImport,
    preprocessedImportError: preprocessedState.preprocessedImportError,
    preprocessedDropboxError: preprocessedState.preprocessedDropboxError,
    preprocessedDropboxInfo: preprocessedState.preprocessedDropboxInfo,
    isPreprocessedDropboxConfigOpen: preprocessedState.isPreprocessedDropboxConfigOpen,
    onPreprocessedDropboxConfigSubmit: preprocessedState.handlePreprocessedDropboxConfigSubmit,
    preprocessedDropboxAppKeyInput: preprocessedState.preprocessedDropboxAppKeyInput,
    onPreprocessedDropboxConfigInputChange: preprocessedState.handlePreprocessedDropboxConfigInputChange,
    preprocessedDropboxAppKeySource: preprocessedState.preprocessedDropboxAppKeySource as DropboxAppKeySource | null,
    onPreprocessedDropboxConfigCancel: preprocessedState.handlePreprocessedDropboxConfigCancel,
    onPreprocessedDropboxConfigClear: preprocessedState.handlePreprocessedDropboxConfigClear
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
    onChannelTrackFileSelected,
    onChannelTrackDrop,
    onChannelTrackClear,
    experimentDimension,
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
    showLaunchViewerButton: frontPageMode !== 'initial' || isPreprocessedLoaderOpen,
    onPreprocessExperiment: handlePreprocessExperiment,
    isPreprocessingExperiment,
    preprocessButtonEnabled: canLaunch,
    preprocessSuccessMessage,
    onLaunchViewer,
    isLaunchingViewer,
    launchButtonEnabled,
    launchButtonLaunchable,
    onExportPreprocessedExperiment: handleExportPreprocessedExperiment,
    isExportingPreprocessed,
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
      experimentConfiguration={experimentConfigurationProps}
      preprocessedLoader={preprocessedLoaderProps}
      channelListPanel={channelListPanelProps}
      preprocessedSummary={preprocessedSummaryProps}
      launchActions={launchActionsProps}
      warningsWindow={warningsWindowProps}
    />
  );
}
