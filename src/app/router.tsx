import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import FrontPageContainer, { type FrontPageContainerProps } from '../components/FrontPageContainer';
import ViewerShellContainer, { type ViewerShellContainerProps } from '../components/ViewerShellContainer';
import type { ChannelSource, ChannelValidation, StagedPreprocessedExperiment } from '../hooks/useChannelSources';
import { DEFAULT_LAYER_COLOR, normalizeHexColor } from '../layerColors';
import { clearTextureCache } from '../textureCache';
import {
  brightnessContrastModel,
  clampWindowBounds,
  computeContrastMultiplier,
  createDefaultLayerSettings,
  DEFAULT_RENDER_STYLE,
  DEFAULT_SAMPLING_MODE,
  DEFAULT_WINDOW_MAX,
  DEFAULT_WINDOW_MIN,
  formatContrastMultiplier,
  type LayerSettings,
  type SamplingMode
} from '../state/layerSettings';
import { deriveChannelTrackOffsets } from '../state/channelTrackOffsets';
import type { LoadedLayer } from '../types/layers';
import type { HoveredVoxelInfo } from '../types/hover';
import type { NormalizedVolume } from '../volumeProcessing';
import { computeAutoWindow, getVolumeHistogram } from '../autoContrast';
import { computeTrackSummary } from '../utils/trackSummary';
import { type ExperimentDimension } from '../hooks/useVoxelResolution';
import type { DatasetErrorContext } from '../hooks/useDatasetErrors';
import { useDatasetSetup } from '../hooks/useDatasetSetup';
import useTrackState from '../hooks/useTrackState';
import { useChannelLayerStateContext } from '../hooks/useChannelLayerState';
import { useViewerPlayback } from '../hooks/useViewerPlayback';
import HelpMenu from '../components/app/HelpMenu';
import useChannelEditing from './hooks/useChannelEditing';
import { useDatasetLaunch } from './hooks/useDatasetLaunch';
import { useViewerModePlayback } from './hooks/useViewerModePlayback';
import { useWindowLayout } from './hooks/useWindowLayout';
import { WARNING_WINDOW_WIDTH, WINDOW_MARGIN } from '../utils/windowLayout';

const DEFAULT_RESET_WINDOW = { windowMin: DEFAULT_WINDOW_MIN, windowMax: DEFAULT_WINDOW_MAX };

function AppRouter() {
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
  }, [setFollowedTrack]);

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
    },
    onViewerModeChange: () => {
      setHoveredVolumeVoxel(null);
    },
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
        preprocessingSettingsRef.current = manifestVoxelResolution;
        setLayers(preprocessedExperiment.layers);
        applyLoadedLayers(preprocessedExperiment.layers, preprocessedExperiment.totalVolumeCount, {
          setSelectedIndex,
          setActiveChannelTabId,
          setStatus,
          setLoadedCount,
          setExpectedVolumeCount,
          setLoadProgress,
          setIsPlaying,
          clearDatasetError,
          setError
        });
        setIsViewerLaunched(true);
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

  const handleLayerContrastChange = useCallback((key: string, sliderIndex: number) => {
    setLayerSettings((current) => {
      const previous = current[key] ?? createLayerDefaultSettings(key);
      if (previous.contrastSliderIndex === sliderIndex) {
        return current;
      }
      const updated = brightnessContrastModel.applyContrast(previous, sliderIndex);
      if (
        previous.windowMin === updated.windowMin &&
        previous.windowMax === updated.windowMax &&
        previous.contrastSliderIndex === updated.contrastSliderIndex &&
        previous.brightnessSliderIndex === updated.brightnessSliderIndex &&
        previous.minSliderIndex === updated.minSliderIndex &&
        previous.maxSliderIndex === updated.maxSliderIndex
      ) {
        return current;
      }
      return {
        ...current,
        [key]: {
          ...previous,
          ...updated
        }
      };
    });
  }, [createLayerDefaultSettings]);

  const handleLayerBrightnessChange = useCallback((key: string, sliderIndex: number) => {
    setLayerSettings((current) => {
      const previous = current[key] ?? createLayerDefaultSettings(key);
      if (previous.brightnessSliderIndex === sliderIndex) {
        return current;
      }
      const updated = brightnessContrastModel.applyBrightness(previous, sliderIndex);
      if (
        previous.windowMin === updated.windowMin &&
        previous.windowMax === updated.windowMax &&
        previous.contrastSliderIndex === updated.contrastSliderIndex &&
        previous.brightnessSliderIndex === updated.brightnessSliderIndex &&
        previous.minSliderIndex === updated.minSliderIndex &&
        previous.maxSliderIndex === updated.maxSliderIndex
      ) {
        return current;
      }
      return {
        ...current,
        [key]: {
          ...previous,
          ...updated
        }
      };
    });
  }, [createLayerDefaultSettings]);

  const handleLayerWindowMinChange = useCallback((key: string, value: number) => {
    setLayerSettings((current) => {
      const previous = current[key] ?? createLayerDefaultSettings(key);
      const clampedValue = Math.max(DEFAULT_WINDOW_MIN, Math.min(DEFAULT_WINDOW_MAX, value));
      if (previous.windowMin === clampedValue) {
        return current;
      }
      const updated = brightnessContrastModel.applyWindow(clampedValue, previous.windowMax);
      if (
        previous.windowMin === updated.windowMin &&
        previous.windowMax === updated.windowMax &&
        previous.contrastSliderIndex === updated.contrastSliderIndex &&
        previous.brightnessSliderIndex === updated.brightnessSliderIndex &&
        previous.minSliderIndex === updated.minSliderIndex &&
        previous.maxSliderIndex === updated.maxSliderIndex
      ) {
        return current;
      }
      return {
        ...current,
        [key]: {
          ...previous,
          ...updated
        }
      };
    });
  }, [createLayerDefaultSettings]);

  const handleLayerWindowMaxChange = useCallback((key: string, value: number) => {
    setLayerSettings((current) => {
      const previous = current[key] ?? createLayerDefaultSettings(key);
      const clampedValue = Math.max(DEFAULT_WINDOW_MIN, Math.min(DEFAULT_WINDOW_MAX, value));
      if (previous.windowMax === clampedValue) {
        return current;
      }
      const updated = brightnessContrastModel.applyWindow(previous.windowMin, clampedValue);
      if (
        previous.windowMin === updated.windowMin &&
        previous.windowMax === updated.windowMax &&
        previous.contrastSliderIndex === updated.contrastSliderIndex &&
        previous.brightnessSliderIndex === updated.brightnessSliderIndex &&
        previous.minSliderIndex === updated.minSliderIndex &&
        previous.maxSliderIndex === updated.maxSliderIndex
      ) {
        return current;
      }
      return {
        ...current,
        [key]: {
          ...previous,
          ...updated
        }
      };
    });
  }, [createLayerDefaultSettings]);

  const handleLayerAutoContrast = useCallback(
    (key: string) => {
      const layer = layers.find((entry) => entry.key === key);
      if (!layer) {
        return;
      }
      const volume = layer.volumes[selectedIndex] ?? null;
      if (!volume) {
        return;
      }

      const previousThreshold = layerAutoThresholds[key] ?? 0;
      const { windowMin, windowMax, nextThreshold } = computeAutoWindow(volume, previousThreshold);
      const { windowMin: clampedMin, windowMax: clampedMax } = clampWindowBounds(windowMin, windowMax);
      const updatedState = brightnessContrastModel.applyWindow(clampedMin, clampedMax);

      setLayerAutoThresholds((current) => {
        if (current[key] === nextThreshold) {
          return current;
        }
        return {
          ...current,
          [key]: nextThreshold
        };
      });

      setLayerSettings((current) => {
        const previous = current[key] ?? createLayerDefaultSettings(key);
        if (
          previous.windowMin === updatedState.windowMin &&
          previous.windowMax === updatedState.windowMax &&
          previous.brightnessSliderIndex === updatedState.brightnessSliderIndex &&
          previous.contrastSliderIndex === updatedState.contrastSliderIndex &&
          previous.minSliderIndex === updatedState.minSliderIndex &&
          previous.maxSliderIndex === updatedState.maxSliderIndex
        ) {
          return current;
        }
        return {
          ...current,
          [key]: {
            ...previous,
            ...updatedState
          }
        };
      });
    },
    [createLayerDefaultSettings, layerAutoThresholds, layers, selectedIndex]
  );

  const handleLayerOffsetChange = useCallback((key: string, axis: 'x' | 'y', value: number) => {
    setLayerSettings((current) => {
      const previous = current[key] ?? createLayerDefaultSettings(key);
      const property = axis === 'x' ? 'xOffset' : 'yOffset';
      if (previous[property] === value) {
        return current;
      }
      return {
        ...current,
        [key]: {
          ...previous,
          [property]: value
        }
      };
    });
  }, [createLayerDefaultSettings]);

  const handleLayerColorChange = useCallback((key: string, value: string) => {
    setLayerSettings((current) => {
      const previous = current[key] ?? createLayerDefaultSettings(key);
      const normalized = normalizeHexColor(value, DEFAULT_LAYER_COLOR);
      if (previous.color === normalized) {
        return current;
      }
      return {
        ...current,
        [key]: {
          ...previous,
          color: normalized
        }
      };
    });
  }, [createLayerDefaultSettings]);

  const handleLayerRenderStyleToggle = useCallback(
    (_key?: string) => {
      setGlobalRenderStyle((current) => {
        const nextStyle: 0 | 1 = current === 1 ? 0 : 1;
        setLayerSettings((settings) => {
          let changed = false;
          const nextSettings: Record<string, LayerSettings> = { ...settings };
          for (const [layerKey, previous] of Object.entries(settings)) {
            if (previous.renderStyle !== nextStyle) {
              nextSettings[layerKey] = { ...previous, renderStyle: nextStyle };
              changed = true;
            }
          }
          return changed ? nextSettings : settings;
        });
        return nextStyle;
      });
    },
    []
  );

  const handleLayerSamplingModeToggle = useCallback(
    (_key?: string) => {
      setGlobalSamplingMode((current) => {
        const nextMode: SamplingMode = current === 'nearest' ? 'linear' : 'nearest';
        setLayerSettings((settings) => {
          let changed = false;
          const nextSettings: Record<string, LayerSettings> = { ...settings };
          for (const [layerKey, previous] of Object.entries(settings)) {
            if (previous.samplingMode !== nextMode) {
              nextSettings[layerKey] = { ...previous, samplingMode: nextMode };
              changed = true;
            }
          }
          return changed ? nextSettings : settings;
        });
        return nextMode;
      });
    },
    []
  );

  const handleBlendingModeToggle = useCallback(() => {
    setBlendingMode((current) => (current === 'additive' ? 'alpha' : 'additive'));
  }, []);

  const handleLayerInvertToggle = useCallback((key: string) => {
    setLayerSettings((current) => {
      const previous = current[key] ?? createLayerDefaultSettings(key);
      const nextInvert = !previous.invert;
      if (previous.invert === nextInvert) {
        return current;
      }
      return {
        ...current,
        [key]: {
          ...previous,
          invert: nextInvert
        }
      };
    });
  }, [createLayerDefaultSettings]);

  const handleChannelLayerSelectionChange = useCallback((channelId: string, layerKey: string) => {
    setChannelActiveLayer((current) => {
      if (current[channelId] === layerKey) {
        return current;
      }
      return {
        ...current,
        [channelId]: layerKey
      };
    });
  }, []);

  const handleLayerSelect = useCallback(
    (layerKey: string) => {
      const channelId = layerChannelMap.get(layerKey);
      if (!channelId) {
        return;
      }
      handleChannelLayerSelectionChange(channelId, layerKey);
      setActiveChannelTabId((current) => (current === channelId ? current : channelId));
    },
    [handleChannelLayerSelectionChange, layerChannelMap]
  );

  const handleLayerSoloToggle = useCallback(
    (layerKey: string) => {
      const channelId = layerChannelMap.get(layerKey);
      if (!channelId || loadedChannelIds.length === 0) {
        return;
      }

      handleLayerSelect(layerKey);

      setChannelVisibility((current) => {
        const visibleCount = loadedChannelIds.reduce(
          (count, id) => ((current[id] ?? true) ? count + 1 : count),
          0
        );
        const targetVisible = current[channelId] ?? true;
        const isSolo = targetVisible && visibleCount === 1;

        const next: Record<string, boolean> = { ...current };
        let changed = false;

        if (isSolo) {
          for (const id of loadedChannelIds) {
            const previous = next[id] ?? true;
            if (previous === false) {
              next[id] = true;
              changed = true;
            }
          }
        } else {
          for (const id of loadedChannelIds) {
            const desired = id === channelId;
            const previous = next[id] ?? true;
            if (previous !== desired) {
              next[id] = desired;
              changed = true;
            }
          }
        }

        return changed ? next : current;
      });
    },
    [handleLayerSelect, layerChannelMap, loadedChannelIds]
  );

  const handleChannelSliderReset = useCallback(
    (channelId: string) => {
      const relevantLayers = layers.filter((layer) => layer.channelId === channelId);
      if (relevantLayers.length === 0) {
        return;
      }

      setLayerSettings((current) => {
        let changed = false;
        const next: Record<string, LayerSettings> = { ...current };
        for (const layer of relevantLayers) {
          const previous = current[layer.key] ?? createLayerDefaultSettings(layer.key);
          const defaultState = createLayerDefaultBrightnessState(layer.key);
          const updated: LayerSettings = {
            ...previous,
            ...defaultState,
            xOffset: 0,
            yOffset: 0,
            renderStyle: previous.renderStyle,
            invert: false,
            samplingMode: previous.samplingMode
          };
          if (
            previous.windowMin !== updated.windowMin ||
            previous.windowMax !== updated.windowMax ||
            previous.minSliderIndex !== updated.minSliderIndex ||
            previous.maxSliderIndex !== updated.maxSliderIndex ||
            previous.brightnessSliderIndex !== updated.brightnessSliderIndex ||
            previous.contrastSliderIndex !== updated.contrastSliderIndex ||
            previous.xOffset !== updated.xOffset ||
            previous.yOffset !== updated.yOffset ||
            previous.renderStyle !== updated.renderStyle ||
            previous.invert !== updated.invert ||
            previous.samplingMode !== updated.samplingMode
          ) {
            next[layer.key] = updated;
            changed = true;
          }
        }

        return changed ? next : current;
      });

      setLayerAutoThresholds((current) => {
        let changed = false;
        const next = { ...current };
        for (const layer of relevantLayers) {
          if (next[layer.key] !== 0) {
            next[layer.key] = 0;
            changed = true;
          }
        }
        return changed ? next : current;
      });
    },
    [createLayerDefaultBrightnessState, createLayerDefaultSettings, layers]
  );

  const handleDatasetErrorDismiss = useCallback(() => {
    clearDatasetError();
  }, [clearDatasetError]);

  const viewerLayers = useMemo(() => {
    const activeLayers: LoadedLayer[] = [];
    for (const layer of layers) {
      if (channelActiveLayer[layer.channelId] === layer.key) {
        activeLayers.push(layer);
      }
    }

    return activeLayers.map((layer) => {
      const settings = layerSettings[layer.key] ?? createLayerDefaultSettings(layer.key);
      const channelVisible = channelVisibility[layer.channelId];
      return {
        key: layer.key,
        label: layer.label,
        channelId: layer.channelId,
        channelName: channelNameMap.get(layer.channelId) ?? 'Untitled channel',
        volume: layer.volumes[selectedIndex] ?? null,
        visible: channelVisible ?? true,
        sliderRange: settings.sliderRange,
        minSliderIndex: settings.minSliderIndex,
        maxSliderIndex: settings.maxSliderIndex,
        brightnessSliderIndex: settings.brightnessSliderIndex,
        contrastSliderIndex: settings.contrastSliderIndex,
        windowMin: settings.windowMin,
        windowMax: settings.windowMax,
        color: normalizeHexColor(settings.color, DEFAULT_LAYER_COLOR),
        offsetX: settings.xOffset,
        offsetY: settings.yOffset,
        renderStyle: settings.renderStyle,
        invert: settings.invert,
        samplingMode: settings.samplingMode,
        isSegmentation: layer.isSegmentation
      };
    });
  }, [
    channelActiveLayer,
    channelNameMap,
    channelVisibility,
    layerSettings,
    layers,
    selectedIndex
  ]);

  const computedMaxSliceDepth = useMemo(() => {
    let depth = 0;
    for (const layer of viewerLayers) {
      if (layer.volume) {
        depth = Math.max(depth, layer.volume.depth);
      }
    }
    return depth;
  }, [viewerLayers]);

  useEffect(() => {
    setMaxSliceDepth(computedMaxSliceDepth);
  }, [computedMaxSliceDepth]);

  if (!isViewerLaunched) {
    const warningWindowInitialPosition =
      typeof window === 'undefined'
        ? { x: WINDOW_MARGIN, y: WINDOW_MARGIN }
        : {
            x: Math.max(WINDOW_MARGIN, Math.round(window.innerWidth / 2 - WARNING_WINDOW_WIDTH / 2)),
            y: WINDOW_MARGIN + 16
          };
    const frontPageContainerProps: FrontPageContainerProps = {
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
    return (
      <FrontPageContainer {...frontPageContainerProps} />
    );
  }

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
    selectedTrackSeries,
    resolvedAmplitudeLimits,
    resolvedTimeLimits,
    trackSmoothing,
    amplitudeExtent,
    timeExtent,
    error,
    hoveredVolumeVoxel,
    onTogglePlayback: handleTogglePlayback,
    onTimeIndexChange: handleTimeIndexChange,
    onFpsChange: setFps,
    onVolumeStepScaleChange: handleVolumeStepScaleChange,
    onRegisterVolumeStepScaleChange: handleRegisterVolumeStepScaleChange,
    onRegisterReset: handleRegisterReset,
    onTrackSelectionToggle: handleTrackSelectionToggle,
    onTrackFollowRequest: handleTrackFollowFromViewer,
    onHoverVoxelChange: setHoveredVolumeVoxel,
    onTrackChannelSelect: handleTrackChannelSelect,
    onTrackVisibilityToggle: handleTrackVisibilityToggle,
    onTrackVisibilityAllChange: handleTrackVisibilityAllChange,
    onTrackOpacityChange: handleTrackOpacityChange,
    onTrackLineWidthChange: handleTrackLineWidthChange,
    onTrackColorSelect: handleTrackColorSelect,
    onTrackColorReset: handleTrackColorReset,
    onStopTrackFollow: handleStopTrackFollow,
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
    onTrackFollow: handleTrackFollow,
    onAmplitudeLimitsChange: handleSelectedTracksAmplitudeLimitsChange,
    onTimeLimitsChange: handleSelectedTracksTimeLimitsChange,
    onSmoothingChange: handleTrackSmoothingChange,
    onAutoRange: handleSelectedTracksAutoRange,
    onClearSelection: handleClearSelectedTracks,
    getLayerDefaultSettings: createLayerDefaultSettings
  };

  return (
    <HelpMenu isViewerLaunched={isViewerLaunched}>
      {(helpMenuProps) => <ViewerShellContainer {...viewerShellContainerProps} {...helpMenuProps} />}
    </HelpMenu>
  );
}

export default AppRouter;
