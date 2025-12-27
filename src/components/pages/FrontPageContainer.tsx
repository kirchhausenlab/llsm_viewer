import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction, ChangeEvent, DragEvent, FormEvent } from 'react';
import FrontPage from './FrontPage';
import usePreprocessedExperiment from '../../hooks/dataset/usePreprocessedExperiment';
import { type ExperimentDimension, type VoxelResolutionHook } from '../../hooks/useVoxelResolution';
import type { DatasetErrorHook } from '../../hooks/useDatasetErrors';
import type { FollowedTrackState, TrackSetState } from '../../types/channelTracks';
import type { ChannelSource, ChannelValidation, StagedPreprocessedExperiment } from '../../hooks/dataset';
import { preprocessDatasetToStorage } from '../../shared/utils/preprocessedDataset';
import { createDirectoryHandlePreprocessedStorage, createOpfsPreprocessedStorage } from '../../shared/storage/preprocessedStorage';

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
  onChannelTrackFilesAdded: (channelId: string, files: File[]) => void | Promise<void>;
  onChannelTrackDrop: (channelId: string, dataTransfer: DataTransfer) => void;
  onChannelTrackSetNameChange: (channelId: string, trackSetId: string, name: string) => void;
  onChannelTrackSetRemove: (channelId: string, trackSetId: string) => void;
  setIsExperimentSetupStarted: Dispatch<SetStateAction<boolean>>;
  setViewerMode: Dispatch<SetStateAction<'3d' | '2d'>>;
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
    setExperimentDimension,
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

  const createDefaultExportName = useCallback((): string => {
    const now = new Date();
    const stamp = now.toISOString().replace(/[:.]/g, '-');
    const random = Math.random().toString(16).slice(2, 6);
    return `llsm-viewer-preprocessed-${stamp}-${random}`;
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

      const opfsStorageHandle = await createOpfsPreprocessedStorage();
      let storage = opfsStorageHandle.storage;

      if (exportWhilePreprocessing) {
        if (typeof window === 'undefined' || typeof (window as any).showDirectoryPicker !== 'function') {
          showInteractionWarning('Folder export is not supported in this browser.');
          return;
        }

        let directoryHandle: any;
        try {
          directoryHandle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
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

        let exportDirectoryHandle: any;
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

        const exportStorageHandle = await createDirectoryHandlePreprocessedStorage(exportDirectoryHandle);
        storage = {
          async writeFile(path, data) {
            await Promise.all([
              opfsStorageHandle.storage.writeFile(path, data),
              exportStorageHandle.storage.writeFile(path, data)
            ]);
          },
          async readFile(path) {
            return opfsStorageHandle.storage.readFile(path);
          },
          async finalizeManifest(manifest) {
            await Promise.all([
              opfsStorageHandle.storage.finalizeManifest(manifest),
              exportStorageHandle.storage.finalizeManifest(manifest)
            ]);
          }
        };
      }

      const { manifest, channelSummaries, totalVolumeCount } = await preprocessDatasetToStorage({
        layers: layersToProcess,
        channels: channelsMetadata,
        voxelResolution: voxelResolutionValue,
        movieMode: experimentDimension,
        storage
      });

      setPreprocessedExperiment({
        manifest,
        channelSummaries,
        totalVolumeCount,
        storageHandle: opfsStorageHandle,
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
    experimentDimension,
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
    onReturnToStart,
    isFrontPageLocked
  };

  const initialActions = {
    isFrontPageLocked,
    onStartExperimentSetup,
    onOpenPreprocessedLoader: preprocessedState.handlePreprocessedLoaderOpen,
    isPreprocessedImporting: preprocessedState.isPreprocessedImporting
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
      experimentConfiguration={experimentConfigurationProps}
      preprocessedLoader={preprocessedLoaderProps}
      channelListPanel={channelListPanelProps}
      preprocessedSummary={preprocessedSummaryProps}
      launchActions={launchActionsProps}
      warningsWindow={warningsWindowProps}
    />
  );
}
