import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FrontPageContainerProps } from '../../../components/pages/FrontPageContainer';
import type { ViewerShellContainerProps } from '../../../components/viewers/ViewerShellContainer';
import type { ChannelSource, ChannelValidation, StagedPreprocessedExperiment } from '../../../hooks/dataset';
import { clearTextureCache } from '../../../core/textureCache';
import { DEFAULT_WINDOW_MAX, DEFAULT_WINDOW_MIN } from '../../../state/layerSettings';
import { deriveChannelTrackOffsets } from '../../../state/channelTrackOffsets';
import type { FollowedVoxelTarget } from '../../../types/follow';
import type { HoveredVoxelInfo } from '../../../types/hover';
import { getVolumeHistogram } from '../../../autoContrast';
import { computeTrackSummary } from '../../../shared/utils/trackSummary';
import { type ExperimentDimension } from '../../../hooks/useVoxelResolution';
import type { DatasetErrorContext } from '../../../hooks/useDatasetErrors';
import { useDatasetSetup } from '../../../hooks/dataset';
import { useTrackState } from '../../../hooks/tracks';
import { useChannelLayerStateContext } from '../../../hooks/useChannelLayerState';
import { useViewerPlayback } from '../../../hooks/viewer';
import useChannelEditing from './useChannelEditing';
import { useLayerControls } from './useLayerControls';
import { useDatasetLaunch } from './useDatasetLaunch';
import { useViewerModePlayback } from './useViewerModePlayback';
import { useWindowLayout } from './useWindowLayout';
import { WARNING_WINDOW_WIDTH, WINDOW_MARGIN } from '../../../shared/utils/windowLayout';

const DEFAULT_RESET_WINDOW = { windowMin: DEFAULT_WINDOW_MIN, windowMax: DEFAULT_WINDOW_MAX };

export type DatasetSetupRouteProps = FrontPageContainerProps;

export type ViewerRouteProps = {
  viewerShellProps: Omit<ViewerShellContainerProps, 'helpMenuRef' | 'isHelpMenuOpen' | 'onHelpMenuToggle'>;
  isViewerLaunched: boolean;
};

export type AppRouteState = {
  isViewerLaunched: boolean;
  datasetSetupProps: DatasetSetupRouteProps;
  viewerRouteProps: ViewerRouteProps;
};

export function useAppRouteState(): AppRouteState {
  const {
    channels,
    setChannels,
    layerTimepointCounts,
    setLayerTimepointCounts,
    channelIdRef,
    layerIdRef,
    computeLayerTimepointCount,
    getLayerTimepointCount,
    createChannelSource,
    createLayerSource,
    updateChannelIdCounter,
    channelValidationList,
    channelValidationMap,
    hasGlobalTimepointMismatch,
    hasAnyLayers,
    hasLoadingTracks,
    allChannelsValid,
    layers,
    setLayers,
    channelVisibility,
    setChannelVisibility,
    channelActiveLayer,
    setChannelActiveLayer,
    layerSettings,
    setLayerSettings,
    layerAutoThresholds,
    setLayerAutoThresholds,
    globalRenderStyle,
    setGlobalRenderStyle,
    globalSamplingMode,
    setGlobalSamplingMode,
    getChannelDefaultColor,
    createLayerDefaultSettings,
    createLayerDefaultBrightnessState,
    applyLoadedLayers,
    loadSelectedDataset
  } = useChannelLayerStateContext();
  const [preprocessedExperiment, setPreprocessedExperiment] = useState<StagedPreprocessedExperiment | null>(null);
  const [isExperimentSetupStarted, setIsExperimentSetupStarted] = useState(false);
  const {
    voxelResolution: voxelResolutionHook,
    datasetErrors,
    channelNameMap,
    channelLayersMap,
    layerChannelMap,
    channelTintMap,
    loadedChannelIds,
    volumeTimepointCount,
    handleChannelLayerFilesAdded,
    handleChannelLayerDrop,
    handleChannelLayerSegmentationToggle,
    handleChannelLayerRemove,
    showInteractionWarning
  } = useDatasetSetup({
    channels,
    layers,
    channelActiveLayer,
    layerSettings,
    setChannels,
    setLayerSettings,
    setLayerAutoThresholds,
    setLayerTimepointCounts,
    computeLayerTimepointCount,
    createLayerSource
  });
  const {
    voxelResolutionInput,
    voxelResolution,
    anisotropyScale,
    experimentDimension,
    trackScale,
    handleVoxelResolutionAxisChange,
    handleVoxelResolutionUnitChange,
    handleVoxelResolutionAnisotropyToggle,
    handleExperimentDimensionChange,
    setExperimentDimension
  } = voxelResolutionHook;
  const {
    datasetError,
    datasetErrorContext,
    reportDatasetError,
    clearDatasetError,
    bumpDatasetErrorResetSignal
  } = datasetErrors;
  const [blendingMode, setBlendingMode] = useState<'alpha' | 'additive'>('additive');
  const resetPreprocessedStateRef = useRef<() => void>(() => {});
  const [resetViewHandler, setResetViewHandler] = useState<(() => void) | null>(null);
  const [activeChannelTabId, setActiveChannelTabId] = useState<string | null>(null);
  const [maxSliceDepth, setMaxSliceDepth] = useState(0);
  const [hoveredVolumeVoxel, setHoveredVolumeVoxel] = useState<HoveredVoxelInfo | null>(null);
  const [followedVoxel, setFollowedVoxel] = useState<FollowedVoxelTarget | null>(null);
  const [lastHoveredVolumeVoxel, setLastHoveredVolumeVoxel] = useState<HoveredVoxelInfo | null>(null);
  const playback = useViewerPlayback();
  const { selectedIndex, setSelectedIndex, isPlaying, fps, setFps, stopPlayback, setIsPlaying } = playback;
  const is3dViewerAvailable = experimentDimension === '3d';

  const {
    layoutResetToken,
    controlWindowInitialPosition,
    layersWindowInitialPosition,
    trackWindowInitialPosition,
    viewerSettingsWindowInitialPosition,
    selectedTracksWindowInitialPosition,
    plotSettingsWindowInitialPosition,
    resetLayout: handleResetWindowLayout
  } = useWindowLayout();

  const handlePreprocessedStateChange = useCallback(
    ({
      preprocessedExperiment: nextPreprocessedExperiment,
      resetPreprocessedState
    }: {
      preprocessedExperiment: StagedPreprocessedExperiment | null;
      resetPreprocessedState: () => void;
    }) => {
      setPreprocessedExperiment(nextPreprocessedExperiment);
      resetPreprocessedStateRef.current = resetPreprocessedState;
    },
    []
  );

  const resetPreprocessedState = useCallback(() => {
    resetPreprocessedStateRef.current();
  }, []);
  const {
    preprocessingSettingsRef,
    status,
    setStatus,
    error,
    setError,
    loadProgress,
    setLoadProgress,
    loadedCount,
    setLoadedCount,
    expectedVolumeCount,
    setExpectedVolumeCount,
    isViewerLaunched,
    setIsViewerLaunched,
    isLaunchingViewer,
    setIsLaunchingViewer,
    showLaunchError,
    loadDataset,
    resetLaunchState
  } = useDatasetLaunch({
    voxelResolution,
    anisotropyScale,
    experimentDimension,
    loadSelectedDataset,
    clearDatasetError,
    reportDatasetError,
    bumpDatasetErrorResetSignal,
    datasetError,
    datasetErrorContext,
    setSelectedIndex,
    setIsPlaying,
    setActiveChannelTabId
  });
  const isLoading = status === 'loading';
  const {
    activeChannelId,
    editingChannelId,
    editingChannelInputRef,
    editingChannelOriginalNameRef,
    setActiveChannelId,
    setEditingChannelId,
    startEditingChannel,
    queuePendingChannelFocus,
    handleChannelRemoved,
    resetChannelEditingState
  } = useChannelEditing({ channels, isLaunchingViewer });
  const {
    channelTrackStates,
    setChannelTrackStates,
    trackOrderModeByChannel,
    setTrackOrderModeByChannel,
    setSelectedTrackOrder,
    selectedTrackIds,
    trackSmoothing,
    pendingMinimumTrackLength,
    minimumTrackLength,
    followedTrack,
    setFollowedTrack,
    activeTrackChannelId,
    setActiveTrackChannelId,
    parsedTracksByChannel,
    parsedTracks,
    trackLookup,
    filteredTracksByChannel,
    filteredTracks,
    selectedTrackOrder,
    selectedTrackSeries,
    amplitudeExtent,
    timeExtent,
    resolvedAmplitudeLimits,
    resolvedTimeLimits,
    trackLengthBounds,
    trackSummaryByChannel,
    trackVisibility,
    trackOpacityByChannel,
    trackLineWidthByChannel,
    channelTrackColorModes,
    followedTrackId,
    followedTrackChannelId,
    handleChannelTrackFileSelected,
    handleChannelTrackDrop,
    handleChannelTrackClear,
    handleTrackVisibilityToggle,
    handleTrackVisibilityAllChange,
    handleMinimumTrackLengthChange,
    handleMinimumTrackLengthApply,
    handleTrackOrderToggle,
    handleTrackOpacityChange,
    handleTrackLineWidthChange,
    handleTrackColorSelect,
    handleTrackColorReset,
    handleTrackSelectionToggle,
    handleTrackFollow,
    handleTrackFollowFromViewer,
    handleTrackChannelSelect,
    handleStopTrackFollow,
    handleSelectedTracksAmplitudeLimitsChange,
    handleSelectedTracksTimeLimitsChange,
    handleSelectedTracksAutoRange,
    handleTrackSmoothingChange,
    handleClearSelectedTracks,
    resetTrackState,
    hasParsedTrackData
  } = useTrackState({
    channels,
    setChannels,
    experimentDimension,
    volumeTimepointCount
  });

  const handleBeforeEnterVr = useCallback(() => {
    setFollowedTrack(null);
    setFollowedVoxel(null);
  }, [setFollowedTrack, setFollowedVoxel]);

  const resetHoveredVoxel = useCallback(() => {
    setHoveredVolumeVoxel(null);
    setLastHoveredVolumeVoxel(null);
  }, []);

  const handleHoverVoxelChange = useCallback((value: HoveredVoxelInfo | null) => {
    if (value) {
      setLastHoveredVolumeVoxel(value);
    }
    setHoveredVolumeVoxel(value);
  }, []);

  const handleTrackFollowWithVoxelReset = useCallback(
    (trackId: string) => {
      setFollowedVoxel(null);
      handleTrackFollow(trackId);
    },
    [handleTrackFollow, setFollowedVoxel],
  );

  const handleTrackFollowFromViewerWithVoxelReset = useCallback(
    (trackId: string) => {
      setFollowedVoxel(null);
      handleTrackFollowFromViewer(trackId);
    },
    [handleTrackFollowFromViewer, setFollowedVoxel],
  );

  const handleVoxelFollowRequest = useCallback(
    (target: FollowedVoxelTarget) => {
      if (followedTrackId !== null) {
        return;
      }

      setFollowedVoxel(target);
    },
    [followedTrackId, setFollowedVoxel],
  );

  const handleStopVoxelFollow = useCallback(() => {
    setFollowedVoxel(null);
  }, [setFollowedVoxel]);

  const {
    viewerControls,
    playbackDisabled,
    playbackLabel,
    handleTogglePlayback,
    handleTimeIndexChange,
    handleJumpToStart,
    handleJumpToEnd
  } = useViewerModePlayback({
    playback,
    experimentDimension,
    is3dViewerAvailable,
    maxSliceDepth,
    onBeforeEnterVr: handleBeforeEnterVr,
    onViewerModeToggle: () => {
      setResetViewHandler(null);
      handleStopTrackFollow();
      setFollowedVoxel(null);
    },
    onViewerModeChange: resetHoveredVoxel,
    volumeTimepointCount,
    isLoading
  });

  const {
    viewerMode,
    setViewerMode,
    toggleViewerMode,
    sliceIndex,
    handleSliceIndexChange,
    orthogonalViewsEnabled,
    toggleOrthogonalViews,
    orthogonalViewsAvailable,
    vr: {
      isVrSupportChecked,
      isVrSupported,
      isVrPassthroughSupported,
      isVrActive,
      isVrRequesting,
      hasVrSessionHandlers,
      isVrAvailable,
      vrButtonLabel,
      enterVr,
      exitVr,
      registerSessionHandlers,
      handleSessionStarted,
      handleSessionEnded,
      vrButtonDisabled,
      vrButtonTitle,
      handleVrButtonClick
    }
  } = viewerControls;

  useEffect(() => {
    if (datasetError && datasetErrorContext === 'launch') {
      bumpDatasetErrorResetSignal();
    }
  }, [bumpDatasetErrorResetSignal, datasetError, datasetErrorContext]);
  const volumeStepScaleChangeRef = useRef<((value: number) => void) | null>(null);

  const handleRegisterReset = useCallback((handler: (() => void) | null) => {
    setResetViewHandler(() => handler);
  }, []);

  const handleRegisterVolumeStepScaleChange = useCallback(
    (handler: ((value: number) => void) | null) => {
      volumeStepScaleChangeRef.current = handler;
    },
    [],
  );

  const handleVolumeStepScaleChange = useCallback((value: number) => {
    volumeStepScaleChangeRef.current?.(value);
  }, []);

  const handleReturnToLauncher = useCallback(() => {
    if (typeof window !== 'undefined') {
      const confirmed = window.confirm(
        'Do you really want to return? The current session will be discarded'
      );
      if (!confirmed) {
        return;
      }
    }
    setIsViewerLaunched(false);
  }, [setIsViewerLaunched]);

  useEffect(() => {
    setFollowedTrack((current) => {
      if (!current) {
        return current;
      }
      if (trackLookup.has(current.id)) {
        return current;
      }
      return null;
    });
  }, [trackLookup]);

  useEffect(() => {
    if (followedTrackId !== null) {
      setFollowedVoxel(null);
    }
  }, [followedTrackId]);

  const trackChannels = useMemo(() => {
    return loadedChannelIds.map((channelId) => ({
      id: channelId,
      name: channelNameMap.get(channelId) ?? 'Untitled channel'
    }));
  }, [channelNameMap, loadedChannelIds]);

  const vrChannelPanels = useMemo(() => {
    return loadedChannelIds.map((channelId) => {
      const channelLayers = channelLayersMap.get(channelId) ?? [];
      const name = channelNameMap.get(channelId) ?? 'Untitled channel';
      const visible = channelVisibility[channelId] ?? true;
      const activeLayerKey = channelActiveLayer[channelId] ?? channelLayers[0]?.key ?? null;
      const layersInfo = channelLayers.map((layer) => {
        const defaultWindow = DEFAULT_RESET_WINDOW;
        const settings = layerSettings[layer.key] ?? createLayerDefaultSettings(layer.key);
        const firstVolume = layer.volumes[0] ?? null;
        const isGrayscale = Boolean(firstVolume && firstVolume.channels === 1);
        const histogram = firstVolume ? getVolumeHistogram(firstVolume) : null;
        return {
          key: layer.key,
          label: layer.label,
          hasData: layer.volumes.length > 0,
          isGrayscale,
          isSegmentation: layer.isSegmentation,
          defaultWindow,
          histogram,
          settings
        };
      });
      return {
        id: channelId,
        name,
        visible,
        activeLayerKey,
        layers: layersInfo
      };
    });
  }, [
    channelActiveLayer,
    channelLayersMap,
    channelNameMap,
    channelVisibility,
    layerSettings,
    loadedChannelIds
  ]);

  const channelTrackOffsets = useMemo(
    () =>
      deriveChannelTrackOffsets({
        channels,
        channelLayersMap,
        channelActiveLayer,
        layerSettings
      }),
    [channelActiveLayer, channelLayersMap, channels, layerSettings]
  );

  const handleStartExperimentSetup = useCallback(() => {
    resetPreprocessedState();
    setIsExperimentSetupStarted(true);
    resetChannelEditingState();
    clearDatasetError();
  }, [clearDatasetError, resetChannelEditingState, resetPreprocessedState]);

  const handleAddChannel = useCallback(() => {
    resetPreprocessedState();
    setIsExperimentSetupStarted(true);

    let createdChannel: ChannelSource | null = null;
    setChannels((current) => {
      const newChannel: ChannelSource = createChannelSource('');
      createdChannel = newChannel;
      return [...current, newChannel];
    });
    if (createdChannel === null) {
      return;
    }
    const channel = createdChannel as ChannelSource;
    queuePendingChannelFocus(channel.id, channel.name);
    startEditingChannel(channel.id, channel.name);
    clearDatasetError();
  }, [clearDatasetError, createChannelSource, queuePendingChannelFocus, resetPreprocessedState, startEditingChannel]);

  const handleChannelNameChange = useCallback((channelId: string, value: string) => {
    setChannels((current) =>
      current.map((channel) => (channel.id === channelId ? { ...channel, name: value } : channel))
    );
  }, []);

  const handleRemoveChannel = useCallback((channelId: string) => {
    let removedLayerIds: string[] = [];
    setChannels((current) => {
      const filtered = current.filter((channel) => channel.id !== channelId);
      const removedChannel = current.find((channel) => channel.id === channelId);
      if (removedChannel) {
        removedLayerIds = removedChannel.layers.map((layer) => layer.id);
      }
      handleChannelRemoved({
        removedChannelId: channelId,
        previousChannels: current,
        nextChannels: filtered
      });
      return filtered;
    });
    if (removedLayerIds.length > 0) {
      setLayerTimepointCounts((current) => {
        let changed = false;
        const next = { ...current };
        for (const layerId of removedLayerIds) {
          if (layerId in next) {
            delete next[layerId];
            changed = true;
          }
        }
        return changed ? next : current;
      });
    }
    clearDatasetError();
  }, [clearDatasetError, handleChannelRemoved]);


  const handleDiscardPreprocessedExperiment = useCallback(() => {
    resetPreprocessedState();
    setPreprocessedExperiment(null);
    setChannels([]);
    setChannelVisibility({});
    setChannelActiveLayer({});
    setLayerSettings({});
    setLayerAutoThresholds({});
    setLayers([]);
    setSelectedIndex(0);
    resetChannelEditingState();
    setActiveChannelTabId(null);
    resetTrackState();
    resetLaunchState();
    setIsExperimentSetupStarted(false);
    channelIdRef.current = 0;
    layerIdRef.current = 0;
    clearTextureCache();
    clearDatasetError();
  }, [
    clearDatasetError,
    resetChannelEditingState,
    resetLaunchState,
    resetPreprocessedState,
    resetTrackState
  ]);

  const handleReturnToFrontPage = useCallback(() => {
    handleDiscardPreprocessedExperiment();
  }, [handleDiscardPreprocessedExperiment]);
  const canLaunch = hasAnyLayers && allChannelsValid && !hasLoadingTracks && voxelResolution !== null;

  const activeChannel = useMemo(
    () => channels.find((channel) => channel.id === activeChannelId) ?? null,
    [activeChannelId, channels]
  );

  const launchErrorMessage = datasetErrorContext === 'launch' ? datasetError : null;
  const interactionErrorMessage = datasetErrorContext === 'interaction' ? datasetError : null;


  const handleLaunchViewer = useCallback(async () => {
    if (isLaunchingViewer) {
      return;
    }

    if (!preprocessedExperiment && !voxelResolution) {
      showLaunchError('Fill in all voxel resolution fields before launching.');
      return;
    }

    if (preprocessedExperiment) {
      clearDatasetError();
      setIsLaunchingViewer(true);
      try {
        const manifestVoxelResolution =
          preprocessedExperiment.manifest.dataset.voxelResolution ?? voxelResolution ?? null;
        const manifestViewerMode = preprocessedExperiment.manifest.dataset.movieMode;
        setExperimentDimension(manifestViewerMode);
        setViewerMode(manifestViewerMode);
        preprocessingSettingsRef.current = manifestVoxelResolution;
        setLayers(preprocessedExperiment.layers);
        applyLoadedLayers(preprocessedExperiment.layers, preprocessedExperiment.totalVolumeCount, {
          setChannelVisibility,
          setChannelActiveLayer,
          setLayerSettings,
          setLayerAutoThresholds,
          setSelectedIndex,
          setActiveChannelTabId,
          setStatus,
          setLoadedCount,
          setExpectedVolumeCount,
          setLoadProgress,
          setIsPlaying,
          clearDatasetError,
          setError,
          globalRenderStyle,
          globalSamplingMode,
          getChannelDefaultColor
        });
        setIsViewerLaunched(true);
      } catch (error) {
        console.error('Failed to launch preprocessed experiment', error);
        showLaunchError('Failed to launch the preprocessed experiment.');
        setStatus('error');
      } finally {
        setIsLaunchingViewer(false);
      }
      return;
    }

    const hasAnyLayersConfigured = channels.some((channel) =>
      channel.layers.some((layer) => layer.files.length > 0)
    );
    if (!hasAnyLayersConfigured) {
      showLaunchError('Add a volume before launching the viewer.');
      return;
    }

    const blockingChannel = channelValidationList.find((entry) => entry.errors.length > 0);
    if (blockingChannel) {
      const rawName = channels.find((channel) => channel.id === blockingChannel.channelId)?.name ?? '';
      const channelName = rawName.trim() || 'this channel';
      showLaunchError(`Resolve the errors in ${channelName} before launching.`);
      return;
    }

    const hasPendingTracks = channels.some((channel) => channel.trackStatus === 'loading');
    if (hasPendingTracks) {
      showLaunchError('Wait for tracks to finish loading before launching.');
      return;
    }

    clearDatasetError();
    preprocessingSettingsRef.current = voxelResolution;
    setViewerMode(experimentDimension);
    setIsLaunchingViewer(true);
    try {
      const normalizedLayers = await loadDataset();
      if (!normalizedLayers) {
        return;
      }

      setIsViewerLaunched(true);
    } finally {
      setIsLaunchingViewer(false);
    }
  }, [
    channelValidationList,
    channels,
    clearDatasetError,
    isLaunchingViewer,
    loadDataset,
    preprocessedExperiment,
    showLaunchError,
    experimentDimension,
    voxelResolution
  ]);

  const handleChannelVisibilityToggle = useCallback((channelId: string) => {
    setChannelVisibility((current) => {
      const previous = current[channelId] ?? true;
      const nextValue = !previous;
      return {
        ...current,
        [channelId]: nextValue
      };
    });
  }, []);


  useEffect(() => {
    if (layers.length === 0) {
      setActiveChannelTabId(null);
      return;
    }

    setActiveChannelTabId((current) => {
      if (current && layers.some((layer) => layer.channelId === current)) {
        return current;
      }
      return layers[0].channelId;
    });
  }, [layers]);

  useEffect(() => {
    if (channels.length === 0) {
      setActiveTrackChannelId(null);
      return;
    }

    setActiveTrackChannelId((current) => {
      if (current && channels.some((channel) => channel.id === current)) {
        return current;
      }
      return channels[0].id;
    });
  }, [channels]);

  useEffect(() => {
    setChannelActiveLayer((current) => {
      if (layers.length === 0) {
        if (Object.keys(current).length === 0) {
          return current;
        }
        return {};
      }

      const next: Record<string, string> = { ...current };
      let changed = false;
      const validChannels = new Set<string>();
      for (const layer of layers) {
        validChannels.add(layer.channelId);
      }

      for (const channelId of Object.keys(next)) {
        if (!validChannels.has(channelId)) {
          delete next[channelId];
          changed = true;
        }
      }

      for (const channelId of validChannels) {
        const channelLayers = channelLayersMap.get(channelId) ?? [];
        const activeKey = next[channelId];
        const hasActive = activeKey ? channelLayers.some((layer) => layer.key === activeKey) : false;
        if (!hasActive) {
          const fallback = channelLayers[0];
          if (fallback) {
            next[channelId] = fallback.key;
            changed = true;
          }
        }
      }

      return changed ? next : current;
    });
  }, [channelLayersMap, layers]);

  const handleBlendingModeToggle = useCallback(() => {
    setBlendingMode((current) => (current === 'additive' ? 'alpha' : 'additive'));
  }, []);

  const {
    viewerLayers,
    computedMaxSliceDepth,
    handleChannelLayerSelectionChange,
    handleLayerSelect,
    handleLayerSoloToggle,
    handleChannelSliderReset,
    handleLayerContrastChange,
    handleLayerBrightnessChange,
    handleLayerWindowMinChange,
    handleLayerWindowMaxChange,
    handleLayerAutoContrast,
    handleLayerOffsetChange,
    handleLayerColorChange,
    handleLayerRenderStyleToggle,
    handleLayerSamplingModeToggle,
    handleLayerInvertToggle
  } = useLayerControls({
    layers,
    selectedIndex,
    layerAutoThresholds,
    setLayerAutoThresholds,
    createLayerDefaultSettings,
    createLayerDefaultBrightnessState,
    layerSettings,
    setLayerSettings,
    setChannelActiveLayer,
    setChannelVisibility,
    channelVisibility,
    channelActiveLayer,
    channelNameMap,
    layerChannelMap,
    loadedChannelIds,
    setActiveChannelTabId,
    setGlobalRenderStyle,
    setGlobalSamplingMode
  });

  const handleDatasetErrorDismiss = useCallback(() => {
    clearDatasetError();
  }, [clearDatasetError]);

  useEffect(() => {
    setMaxSliceDepth(computedMaxSliceDepth);
  }, [computedMaxSliceDepth]);

  const warningWindowInitialPosition =
    typeof window === 'undefined'
      ? { x: WINDOW_MARGIN, y: WINDOW_MARGIN }
      : {
          x: Math.max(WINDOW_MARGIN, Math.round(window.innerWidth / 2 - WARNING_WINDOW_WIDTH / 2)),
          y: WINDOW_MARGIN + 16
        };
  const datasetSetupProps: FrontPageContainerProps = {
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
    onStartExperimentSetup: handleStartExperimentSetup,
    onAddChannel: handleAddChannel,
    onReturnToStart: handleReturnToFrontPage,
    onChannelNameChange: handleChannelNameChange,
    onRemoveChannel: handleRemoveChannel,
    onChannelLayerFilesAdded: handleChannelLayerFilesAdded,
    onChannelLayerDrop: handleChannelLayerDrop,
    onChannelLayerSegmentationToggle: handleChannelLayerSegmentationToggle,
    onChannelLayerRemove: handleChannelLayerRemove,
    onChannelTrackFileSelected: handleChannelTrackFileSelected,
    onChannelTrackDrop: handleChannelTrackDrop,
    onChannelTrackClear: handleChannelTrackClear,
    setIsExperimentSetupStarted,
    setViewerMode,
    updateChannelIdCounter,
    loadSelectedDataset: loadDataset,
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
    onLaunchViewer: handleLaunchViewer,
    canLaunch,
    warningWindowInitialPosition,
    warningWindowWidth: WARNING_WINDOW_WIDTH,
    onPreprocessedStateChange: handlePreprocessedStateChange,
    datasetErrors,
    voxelResolution: voxelResolutionHook
  };

  const viewerShellContainerProps: Omit<
    ViewerShellContainerProps,
    'helpMenuRef' | 'isHelpMenuOpen' | 'onHelpMenuToggle'
  > = {
    viewerMode,
    viewerLayers,
    isLoading,
    loadProgress,
    loadedCount,
    expectedVolumeCount,
    selectedIndex,
    volumeTimepointCount,
    isPlaying,
    playbackDisabled,
    playbackLabel,
    fps,
    blendingMode,
    sliceIndex,
    maxSliceDepth,
    trackScale,
    filteredTracks,
    trackVisibility,
    trackOpacityByChannel,
    trackLineWidthByChannel,
    channelTrackColorModes,
    channelTrackOffsets,
    selectedTrackIds,
    followedTrackId,
    followedVoxel,
    followedTrackChannelId,
    activeTrackChannelId,
    activeChannelTabId,
    trackChannels,
    vrChannelPanels,
    is3dViewerAvailable,
    isVrActive,
    isVrRequesting,
    resetViewHandler,
    isVrPassthroughSupported,
    hasParsedTrackData,
    orthogonalViewsAvailable,
    orthogonalViewsEnabled,
    onOrthogonalViewsToggle: toggleOrthogonalViews,
    layoutResetToken,
    controlWindowInitialPosition,
    viewerSettingsWindowInitialPosition,
    layersWindowInitialPosition,
    trackWindowInitialPosition,
    selectedTracksWindowInitialPosition,
    plotSettingsWindowInitialPosition,
    channels,
    channelNameMap,
    channelVisibility,
    channelTintMap,
    channelLayersMap,
    channelActiveLayer,
    layerSettings,
    loadedChannelIds,
    parsedTracksByChannel,
    filteredTracksByChannel,
    minimumTrackLength,
    pendingMinimumTrackLength,
    trackLengthBounds,
    trackSummaryByChannel,
    trackOrderModeByChannel,
    selectedTrackOrder,
    selectedTrackSeries,
    resolvedAmplitudeLimits,
    resolvedTimeLimits,
    trackSmoothing,
    amplitudeExtent,
    timeExtent,
    error,
    hoveredVolumeVoxel: hoveredVolumeVoxel ?? lastHoveredVolumeVoxel,
    onTogglePlayback: handleTogglePlayback,
    onTimeIndexChange: handleTimeIndexChange,
    onFpsChange: setFps,
    onVolumeStepScaleChange: handleVolumeStepScaleChange,
    onRegisterVolumeStepScaleChange: handleRegisterVolumeStepScaleChange,
    onRegisterReset: handleRegisterReset,
    onTrackSelectionToggle: handleTrackSelectionToggle,
    onTrackFollowRequest: handleTrackFollowFromViewerWithVoxelReset,
    onVoxelFollowRequest: handleVoxelFollowRequest,
    onHoverVoxelChange: handleHoverVoxelChange,
    onTrackChannelSelect: handleTrackChannelSelect,
    onTrackVisibilityToggle: handleTrackVisibilityToggle,
    onTrackVisibilityAllChange: handleTrackVisibilityAllChange,
    onTrackOpacityChange: handleTrackOpacityChange,
    onTrackLineWidthChange: handleTrackLineWidthChange,
    onTrackColorSelect: handleTrackColorSelect,
    onTrackColorReset: handleTrackColorReset,
    onStopTrackFollow: handleStopTrackFollow,
    onStopVoxelFollow: handleStopVoxelFollow,
    onChannelPanelSelect: setActiveChannelTabId,
    onTrackPanelChannelSelect: setActiveTrackChannelId,
    onChannelVisibilityToggle: handleChannelVisibilityToggle,
    onChannelReset: handleChannelSliderReset,
    onChannelLayerSelect: handleChannelLayerSelectionChange,
    onLayerSelect: handleLayerSelect,
    onLayerSoloToggle: handleLayerSoloToggle,
    onLayerContrastChange: handleLayerContrastChange,
    onLayerBrightnessChange: handleLayerBrightnessChange,
    onLayerWindowMinChange: handleLayerWindowMinChange,
    onLayerWindowMaxChange: handleLayerWindowMaxChange,
    onLayerAutoContrast: handleLayerAutoContrast,
    onLayerOffsetChange: handleLayerOffsetChange,
    onLayerColorChange: handleLayerColorChange,
    onLayerRenderStyleToggle: handleLayerRenderStyleToggle,
    onLayerSamplingModeToggle: handleLayerSamplingModeToggle,
    onLayerInvertToggle: handleLayerInvertToggle,
    onRegisterVrSession: registerSessionHandlers,
    onVrSessionStarted: handleSessionStarted,
    onVrSessionEnded: handleSessionEnded,
    onSliceIndexChange: handleSliceIndexChange,
    onReturnToLauncher: handleReturnToLauncher,
    onResetWindowLayout: handleResetWindowLayout,
    onToggleViewerMode: toggleViewerMode,
    onVrButtonClick: handleVrButtonClick,
    vrButtonDisabled,
    vrButtonTitle,
    vrButtonLabel,
    renderStyle: globalRenderStyle,
    samplingMode: globalSamplingMode,
    onRenderStyleToggle: () => handleLayerRenderStyleToggle(),
    onSamplingModeToggle: () => handleLayerSamplingModeToggle(),
    onBlendingModeToggle: handleBlendingModeToggle,
    onJumpToStart: handleJumpToStart,
    onJumpToEnd: handleJumpToEnd,
    onMinimumTrackLengthChange: handleMinimumTrackLengthChange,
    onMinimumTrackLengthApply: handleMinimumTrackLengthApply,
    onTrackOrderToggle: handleTrackOrderToggle,
    onTrackFollow: handleTrackFollowWithVoxelReset,
    onAmplitudeLimitsChange: handleSelectedTracksAmplitudeLimitsChange,
    onTimeLimitsChange: handleSelectedTracksTimeLimitsChange,
    onSmoothingChange: handleTrackSmoothingChange,
    onAutoRange: handleSelectedTracksAutoRange,
    onClearSelection: handleClearSelectedTracks,
    getLayerDefaultSettings: createLayerDefaultSettings
  };

  return {
    isViewerLaunched,
    datasetSetupProps,
    viewerRouteProps: {
      isViewerLaunched,
      viewerShellProps: viewerShellContainerProps
    }
  };
}
