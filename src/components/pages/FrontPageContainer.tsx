import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import FrontPage, { type ExperimentType } from './FrontPage';
import usePreprocessedExperiment from '../../hooks/dataset/usePreprocessedExperiment';
import { preprocessDatasetToStorage } from '../../shared/utils/preprocessedDataset';
import {
  createDirectoryHandlePreprocessedStorage,
  createOpfsPreprocessedStorage,
  PREPROCESSED_STORAGE_ROOT_DIR
} from '../../shared/storage/preprocessedStorage';
import type { PreprocessedStorageHandle } from '../../shared/storage/preprocessedStorage';
import { parseBackgroundMaskValues } from '../../shared/utils/backgroundMask';
import {
  getDirectoryPickerUnavailableMessage,
  inspectDirectoryPickerSupport
} from '../../shared/utils/directoryPickerSupport';
import type { FrontPageContainerProps } from '../../ui/contracts/frontPage';

const FRONTPAGE_OPFS_DATASET_ID = 'preprocessed-experiment';
const PREPROCESS_STORAGE_STRATEGY = {
  maxInFlightChunkWrites: 4,
  sharding: {
    enabled: true
  }
} as const;

export default function FrontPageContainer({
  isExperimentSetupStarted,
  channels,
  setChannels,
  tracks,
  setTracks,
  activeChannelId,
  activeChannel,
  channelValidationMap,
  trackValidationMap,
  editingChannelId,
  editingChannelInputRef,
  editingChannelOriginalNameRef,
  setActiveChannelId,
  setEditingChannelId,
  onStartExperimentSetup,
  onAddChannel,
  onAddSegmentationChannel,
  onReturnToStart,
  onChannelNameChange,
  onRemoveChannel,
  onChannelLayerFilesAdded,
  onChannelLayerDrop,
  onChannelLayerRemove,
  onAddTrack,
  onTrackFilesAdded,
  onTrackDrop,
  onTrackSetNameChange,
  onTrackSetBoundChannelChange,
  onTrackSetTimepointConventionChange,
  onTrackSetClearFile,
  onTrackSetRemove,
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
  onLaunchViewerInPerformanceMode,
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
  const temporalResolutionValue = useMemo(() => {
    const rawValue = voxelResolutionInput.t.trim();
    if (rawValue.length === 0) {
      return null;
    }

    const interval = Number(rawValue);
    if (!Number.isFinite(interval) || interval <= 0) {
      return null;
    }

    return {
      interval,
      unit: voxelResolutionInput.timeUnit
    };
  }, [voxelResolutionInput.t, voxelResolutionInput.timeUnit]);

  const preprocessedState = usePreprocessedExperiment({
    channels,
    setChannels,
    tracks,
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
  const [backgroundMaskEnabled, setBackgroundMaskEnabled] = useState(false);
  const [backgroundMaskValuesInput, setBackgroundMaskValuesInput] = useState('');
  const [force8BitRender, setForce8BitRender] = useState(false);
  const [deSkewModeEnabled, setDeSkewModeEnabled] = useState(false);
  const [skewAngleInput, setSkewAngleInput] = useState('31.5');
  const [skewAngleUnit, setSkewAngleUnit] = useState<'degrees' | 'radians'>('degrees');
  const [skewDirection, setSkewDirection] = useState<'X' | 'Y'>('X');
  const [deSkewMaskVoxels, setDeSkewMaskVoxels] = useState(true);

  const createDefaultExportName = useCallback((): string => {
    const now = new Date();
    const stamp = now.toISOString().replace(/[:.]/g, '-');
    const random = Math.random().toString(16).slice(2, 6);
    return `llsm-viewer-preprocessed-vnext-hes2-${stamp}-${random}`;
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
    if (experimentType === 'single-3d-volume') {
      setTracks([]);
    }
    setIsExperimentTypeSelectionOpen(false);
    onStartExperimentSetup();
  }, [handleVoxelResolutionAxisChange, onStartExperimentSetup, setTracks]);

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

  const frontPageMode = useMemo<'initial' | 'experimentTypeSelection' | 'configuring' | 'preprocessed' | 'publicExperiments'>(() => {
    if (preprocessedExperiment) {
      return 'preprocessed';
    }
    if (preprocessedState.isPublicExperimentLoaderOpen) {
      return 'publicExperiments';
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
    preprocessedExperiment,
    preprocessedState.isPublicExperimentLoaderOpen
  ]);

  const handleReturnFromFrontPage = useCallback(() => {
    setIsExperimentTypeSelectionOpen(false);
    setSelectedExperimentType('single-3d-volume');
    setBackgroundMaskEnabled(false);
    setBackgroundMaskValuesInput('');
    setForce8BitRender(false);
    setDeSkewModeEnabled(false);
    setSkewAngleInput('31.5');
    setSkewAngleUnit('degrees');
    setSkewDirection('X');
    setDeSkewMaskVoxels(true);
    onReturnToStart();
  }, [onReturnToStart]);

  const handleBackgroundMaskToggle = useCallback((value: boolean) => {
    setBackgroundMaskEnabled(value);
  }, []);

  const handleBackgroundMaskValuesInputChange = useCallback((value: string) => {
    setBackgroundMaskValuesInput(value);
  }, []);

  const handleForce8BitRenderToggle = useCallback((value: boolean) => {
    setForce8BitRender(value);
  }, []);

  const handleDeSkewModeToggle = useCallback((value: boolean) => {
    setDeSkewModeEnabled(value);
  }, []);

  const handleSkewAngleInputChange = useCallback((value: string) => {
    setSkewAngleInput(value.replace(/,/g, '.'));
  }, []);

  const handleSkewAngleUnitChange = useCallback((value: 'degrees' | 'radians') => {
    setSkewAngleUnit(value);
  }, []);

  const handleSkewDirectionChange = useCallback((value: 'X' | 'Y') => {
    setSkewDirection(value);
  }, []);

  const handleDeSkewMaskVoxelsToggle = useCallback((value: boolean) => {
    setDeSkewMaskVoxels(value);
  }, []);

  const backgroundMaskParseResult = useMemo(() => {
    if (!backgroundMaskEnabled) {
      return { values: [], error: null as string | null };
    }
    return parseBackgroundMaskValues(backgroundMaskValuesInput);
  }, [backgroundMaskEnabled, backgroundMaskValuesInput]);

  const handlePreprocessExperiment = useCallback(async () => {
    if (
      isPreprocessingExperiment ||
      isLaunchingViewer ||
      isPreprocessedImporting
    ) {
      return;
    }

    if (!voxelResolutionValue || !temporalResolutionValue) {
      showInteractionWarning('Fill in all spatial and temporal resolution fields before preprocessing.');
      return;
    }

    if (!canLaunch) {
      showInteractionWarning('Resolve all dataset issues before preprocessing.');
      return;
    }

    if (backgroundMaskEnabled && backgroundMaskParseResult.error) {
      showInteractionWarning(backgroundMaskParseResult.error);
      return;
    }

    setPreprocessSuccessMessage(null);
    setIsPreprocessingExperiment(true);
    try {
      setIsExperimentSetupStarted(true);
      const channelsMetadata = channels.map((channel) => ({
        id: channel.id,
        name: channel.name.trim()
      }));
      const channelNameById = new Map(channels.map((channel) => [channel.id, channel.name.trim() || null] as const));
      const trackSetsMetadata = await Promise.all((selectedExperimentType === 'single-3d-volume' ? [] : tracks).map(async (set) => {
        if (!set.compiledHeader || !set.loadCompiledCatalog || !set.loadCompiledPayload) {
          throw new Error(`Track set "${set.name.trim() || set.fileName || set.id}" is missing compiled data.`);
        }

        const [compiledCatalog, compiledPayload] = await Promise.all([
          set.loadCompiledCatalog(),
          set.loadCompiledPayload()
        ]);
        const trackSetName = set.name.trim();
        const boundChannelName = set.boundChannelId ? (channelNameById.get(set.boundChannelId) ?? null) : null;

        return {
          id: set.id,
          name: trackSetName,
          fileName: set.fileName,
          boundChannelId: set.boundChannelId,
          compiled: {
            summary: {
              ...set.compiledHeader,
              trackSetId: set.id,
              trackSetName,
              boundChannelId: set.boundChannelId,
              tracks: compiledCatalog.map((track) => ({
                ...track,
                trackSetId: set.id,
                trackSetName,
                channelId: set.boundChannelId,
                channelName: boundChannelName
              }))
            },
            payload: compiledPayload
          }
        };
      }));
      const layersToProcess = channels
        .flatMap((channel) => {
          const layer = channel.volume;
          if (!layer) {
            return [];
          }
          return [{
            channelId: channel.id,
            channelLabel: channel.name.trim(),
            key: layer.id,
            label: 'Volume',
            files: layer.files,
            isSegmentation: layer.isSegmentation,
            sourceDataType: layer.sourceDataType,
            sourceChannelCount: layer.sourceChannels,
            sourceChannelIndex:
              typeof layer.componentIndex === 'number' && (layer.sourceChannels ?? 1) > 1 ? layer.componentIndex : null
          }];
        })
        .filter((layer) => layer.files.length > 0);

      let selectedStorageHandle: PreprocessedStorageHandle | null = null;

      if (exportWhilePreprocessing) {
        const directoryPickerSupport = inspectDirectoryPickerSupport();
        if (!directoryPickerSupport.supported) {
          showInteractionWarning(
            getDirectoryPickerUnavailableMessage(directoryPickerSupport, { feature: 'Folder export' })
          );
          return;
        }

        let directoryHandle: FileSystemDirectoryHandle;
        try {
          const showDirectoryPicker = window.showDirectoryPicker;
          if (typeof showDirectoryPicker !== 'function') {
            showInteractionWarning(
              getDirectoryPickerUnavailableMessage(inspectDirectoryPickerSupport(), { feature: 'Folder export' })
            );
            return;
          }
          directoryHandle = await showDirectoryPicker({ mode: 'readwrite' });
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

      const { manifest, channelSummaries, trackSummaries, totalVolumeCount } = await preprocessDatasetToStorage({
        layers: layersToProcess,
        channels: channelsMetadata,
        trackSets: trackSetsMetadata,
        voxelResolution: voxelResolutionValue,
        temporalResolution: temporalResolutionValue,
        movieMode: '3d',
        inputInterpretation: selectedExperimentType,
        backgroundMask: backgroundMaskEnabled
          ? {
              values: backgroundMaskParseResult.values
            }
          : null,
        renderIn16Bit: !force8BitRender,
        storage: selectedStorageHandle.storage,
        storageStrategy: PREPROCESS_STORAGE_STRATEGY
      });

      setPreprocessedExperiment({
        manifest,
        channelSummaries,
        trackSummaries,
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
    backgroundMaskEnabled,
    backgroundMaskParseResult.error,
    backgroundMaskParseResult.values,
    force8BitRender,
    isLaunchingViewer,
    isPreprocessingExperiment,
    isPreprocessedImporting,
    setIsExperimentSetupStarted,
    setPreprocessedExperiment,
    showInteractionWarning,
    tracks,
    selectedExperimentType,
    temporalResolutionValue,
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
    isFrontPageLocked,
    versionLabel: frontPageMode === 'initial' && !preprocessedState.isPreprocessedLoaderOpen ? 'v0.2.0' : null,
    performanceNotice:
      frontPageMode === 'initial' && !preprocessedState.isPreprocessedLoaderOpen
        ? {
            title: 'Performance note',
            lines: [
              'Mirante4D works best in Chrome.',
              'It makes heavy use of the user\'s GPUs.',
              'This is an early build still being optimized: browser performance and stability may be affected.'
            ]
          }
        : null
  };

  const initialActions = {
    isFrontPageLocked,
    onStartExperimentSetup: handleOpenExperimentTypeSelection,
    onOpenPreprocessedLoader: preprocessedState.handlePreprocessedLoaderOpen,
    onOpenPublicExperimentLoader: preprocessedState.handlePublicExperimentLoaderOpen,
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
    onVoxelResolutionAnisotropyToggle: handleVoxelResolutionAnisotropyToggle,
    backgroundMaskEnabled,
    backgroundMaskValuesInput,
    backgroundMaskError: backgroundMaskEnabled ? backgroundMaskParseResult.error : null,
    onBackgroundMaskToggle: handleBackgroundMaskToggle,
    onBackgroundMaskValuesInputChange: handleBackgroundMaskValuesInputChange,
    force8BitRender,
    onForce8BitRenderToggle: handleForce8BitRenderToggle,
    deSkewModeEnabled,
    skewAngleInput,
    skewAngleUnit,
    skewDirection,
    deSkewMaskVoxels,
    onDeSkewModeToggle: handleDeSkewModeToggle,
    onSkewAngleInputChange: handleSkewAngleInputChange,
    onSkewAngleUnitChange: handleSkewAngleUnitChange,
    onSkewDirectionChange: handleSkewDirectionChange,
    onDeSkewMaskVoxelsToggle: handleDeSkewMaskVoxelsToggle
  };

  const preprocessedLoaderProps = {
    isOpen: preprocessedState.isPreprocessedLoaderOpen,
    isPreprocessedImporting: preprocessedState.isPreprocessedImporting,
    onPreprocessedBrowse: preprocessedState.handlePreprocessedBrowse,
    onPreprocessedArchiveBrowse: preprocessedState.handlePreprocessedArchiveBrowse,
    onPreprocessedArchiveDrop: preprocessedState.handlePreprocessedArchiveDrop,
    preprocessedImportError: preprocessedState.preprocessedImportError
  };

  const publicExperimentLoaderProps = {
    isOpen: preprocessedState.isPublicExperimentLoaderOpen,
    catalogUrl: preprocessedState.publicExperimentCatalogUrl,
    publicExperiments: preprocessedState.publicExperimentCatalog,
    isCatalogLoading: preprocessedState.isPublicExperimentCatalogLoading,
    isPreprocessedImporting: preprocessedState.isPreprocessedImporting,
    activePublicExperimentId: preprocessedState.activePublicExperimentId,
    publicExperimentError: preprocessedState.publicExperimentCatalogError,
    onRefreshPublicExperiments: preprocessedState.handlePublicExperimentCatalogRefresh,
    onLoadPublicExperiment: preprocessedState.handlePublicExperimentLoad
  };

  const channelListPanelProps = {
    channels,
    tracks,
    channelValidationMap,
    trackValidationMap,
    activeChannelId,
    activeChannel,
    editingChannelId,
    editingChannelInputRef,
    editingChannelOriginalNameRef,
    setActiveChannelId,
    setEditingChannelId,
    onAddChannel,
    onAddSegmentationChannel,
    onChannelNameChange,
    onRemoveChannel,
    onChannelLayerFilesAdded,
    onChannelLayerDrop,
    onChannelLayerRemove,
    onAddTrack,
    onTrackFilesAdded,
    onTrackDrop,
    onTrackSetNameChange,
    onTrackSetBoundChannelChange,
    onTrackSetTimepointConventionChange,
    onTrackSetClearFile,
    onTrackSetRemove,
    isFrontPageLocked
  };

  const preprocessedSummaryProps = {
    preprocessedExperiment,
    computeTrackSummary
  };

  const launchActionsProps = {
    frontPageMode,
    hasGlobalTimepointMismatch:
      selectedExperimentType === 'single-3d-volume' ? false : hasGlobalTimepointMismatch,
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
    onLaunchViewerInPerformanceMode,
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
      publicExperimentLoader={publicExperimentLoaderProps}
      channelListPanel={channelListPanelProps}
      preprocessedSummary={preprocessedSummaryProps}
      launchActions={launchActionsProps}
      warningsWindow={warningsWindowProps}
    />
  );
}

export type { FrontPageContainerProps } from '../../ui/contracts/frontPage';
