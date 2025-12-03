import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import FrontPage from './components/FrontPage';
import ViewerShell, { type ViewerShellProps } from './components/ViewerShell';
import type { ChannelLayerSource, ChannelSource, ChannelValidation } from './hooks/useChannelSources';
import { DEFAULT_LAYER_COLOR, normalizeHexColor } from './layerColors';
import { clearTextureCache } from './textureCache';
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
} from './state/layerSettings';
import { deriveChannelTrackOffsets } from './state/channelTrackOffsets';
import type { LoadedLayer } from './types/layers';
import type { HoveredVoxelInfo } from './types/hover';
import type { NormalizedVolume } from './volumeProcessing';
import './styles/app/index.css';
import { computeAutoWindow, getVolumeHistogram } from './autoContrast';
import { computeTrackSummary } from './utils/trackSummary';
import usePreprocessedExperiment from './hooks/usePreprocessedExperiment';
import type { VoxelResolutionInput, VoxelResolutionUnit, VoxelResolutionValues } from './types/voxelResolution';
import {
  collectFilesFromDataTransfer,
  dedupeFiles,
  groupFilesIntoLayers,
  hasTiffExtension,
  sortVolumeFiles
} from './utils/appHelpers';
import { useVoxelResolution, type ExperimentDimension } from './hooks/useVoxelResolution';
import { useDatasetErrors, type DatasetErrorContext } from './hooks/useDatasetErrors';
import useTrackState, {
  DEFAULT_TRACK_LINE_WIDTH,
  DEFAULT_TRACK_OPACITY,
  TRACK_SMOOTHING_RANGE
} from './hooks/useTrackState';
import { useChannelLayerStateContext } from './hooks/useChannelLayerState';
import { useViewerControls } from './hooks/useViewerControls';
import { useViewerPlayback } from './hooks/useViewerPlayback';
import {
  CONTROL_WINDOW_WIDTH,
  LAYERS_WINDOW_VERTICAL_OFFSET,
  SELECTED_TRACKS_WINDOW_HEIGHT,
  SELECTED_TRACKS_WINDOW_WIDTH,
  WARNING_WINDOW_WIDTH,
  WINDOW_MARGIN,
  computeControlWindowDefaultPosition,
  computeLayersWindowDefaultPosition,
  computePlotSettingsWindowDefaultPosition,
  computeSelectedTracksWindowDefaultPosition,
  computeTrackWindowDefaultPosition,
  computeViewerSettingsWindowDefaultPosition,
  nextLayoutResetToken,
  type WindowPosition
} from './utils/windowLayout';

const DEFAULT_RESET_WINDOW = { windowMin: DEFAULT_WINDOW_MIN, windowMax: DEFAULT_WINDOW_MAX };

type LoadState = 'idle' | 'loading' | 'loaded' | 'error';

function AppContent() {
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
  const [isExperimentSetupStarted, setIsExperimentSetupStarted] = useState(false);
  const [editingChannelId, setEditingChannelId] = useState<string | null>(null);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const {
    voxelResolutionInput,
    voxelResolution,
    anisotropyScale,
    trackScale,
    experimentDimension,
    handleVoxelResolutionAxisChange,
    handleVoxelResolutionUnitChange,
    handleVoxelResolutionAnisotropyToggle,
    handleExperimentDimensionChange,
    setExperimentDimension,
    setVoxelResolutionInput
  } = useVoxelResolution();
  const {
    datasetError,
    datasetErrorContext,
    datasetErrorResetSignal,
    reportDatasetError,
    clearDatasetError,
    bumpDatasetErrorResetSignal
  } = useDatasetErrors();
  const [blendingMode, setBlendingMode] = useState<'alpha' | 'additive'>('additive');
  const preprocessingSettingsRef = useRef<VoxelResolutionValues | null>(null);
  const [status, setStatus] = useState<LoadState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [loadProgress, setLoadProgress] = useState(0);
  const [loadedCount, setLoadedCount] = useState(0);
  const [expectedVolumeCount, setExpectedVolumeCount] = useState(0);
  const [resetViewHandler, setResetViewHandler] = useState<(() => void) | null>(null);
  const [activeChannelTabId, setActiveChannelTabId] = useState<string | null>(null);
  const [maxSliceDepth, setMaxSliceDepth] = useState(0);
  const [isViewerLaunched, setIsViewerLaunched] = useState(false);
  const [isLaunchingViewer, setIsLaunchingViewer] = useState(false);
  const [layoutResetToken, setLayoutResetToken] = useState(0);
  const [hoveredVolumeVoxel, setHoveredVolumeVoxel] = useState<HoveredVoxelInfo | null>(null);
  const [isHelpMenuOpen, setIsHelpMenuOpen] = useState(false);

  const playback = useViewerPlayback();
  const { selectedIndex, setSelectedIndex, isPlaying, fps, togglePlayback, setFps, stopPlayback, setIsPlaying } = playback;

  const is3dViewerAvailable = experimentDimension === '3d';
  const handleHelpMenuToggle = useCallback(() => {
    setIsHelpMenuOpen((previous) => !previous);
  }, []);

  useEffect(() => {
    if (channels.length === 0) {
      setActiveChannelId(null);
    }
  }, [channels.length]);
  const controlWindowInitialPosition = useMemo(computeControlWindowDefaultPosition, []);
  const layersWindowInitialPosition = useMemo(computeLayersWindowDefaultPosition, []);
  const [trackWindowInitialPosition, setTrackWindowInitialPosition] = useState<WindowPosition>(
    () => computeTrackWindowDefaultPosition()
  );
  const [viewerSettingsWindowInitialPosition, setViewerSettingsWindowInitialPosition] = useState<WindowPosition>(
    () => computeViewerSettingsWindowDefaultPosition()
  );
  const [selectedTracksWindowInitialPosition, setSelectedTracksWindowInitialPosition] = useState<WindowPosition>(
    () => computeSelectedTracksWindowDefaultPosition()
  );
  const [plotSettingsWindowInitialPosition, setPlotSettingsWindowInitialPosition] = useState<WindowPosition>(
    () => computePlotSettingsWindowDefaultPosition()
  );
  const editingChannelOriginalNameRef = useRef('');
  const editingChannelInputRef = useRef<HTMLInputElement | null>(null);
  const pendingChannelFocusIdRef = useRef<string | null>(null);
  const helpMenuRef = useRef<HTMLDivElement | null>(null);

  const volumeTimepointCount = layers.length > 0 ? layers[0].volumes.length : 0;
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
  } = useViewerControls({
    playback,
    initialViewerMode: experimentDimension,
    is3dViewerAvailable,
    maxSliceDepth,
    onBeforeEnterVr: handleBeforeEnterVr,
    onViewerModeToggle: () => {
      setResetViewHandler(null);
      handleStopTrackFollow();
    }
  });

  useEffect(() => {
    setHoveredVolumeVoxel(null);
  }, [viewerMode]);

  useEffect(() => {
    if (editingChannelId && editingChannelId !== activeChannelId) {
      setEditingChannelId(null);
    }
  }, [activeChannelId, editingChannelId]);

  useEffect(() => {
    if (!isViewerLaunched) {
      setIsHelpMenuOpen(false);
    }
  }, [isViewerLaunched]);

  useEffect(() => {
    if (!isHelpMenuOpen) {
      return;
    }

    const handleDocumentClick = (event: MouseEvent) => {
      const container = helpMenuRef.current;
      if (!container) {
        return;
      }

      if (!container.contains(event.target as Node)) {
        setIsHelpMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsHelpMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleDocumentClick);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleDocumentClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isHelpMenuOpen]);

  useEffect(() => {
    if (datasetError && datasetErrorContext === 'launch') {
      bumpDatasetErrorResetSignal();
    }
  }, [bumpDatasetErrorResetSignal, datasetError, datasetErrorContext]);

  useEffect(() => {
    const pendingChannelId = pendingChannelFocusIdRef.current;
    if (!pendingChannelId) {
      return;
    }
    const pendingChannel = channels.find((channel) => channel.id === pendingChannelId);
    if (!pendingChannel) {
      pendingChannelFocusIdRef.current = null;
      return;
    }
    pendingChannelFocusIdRef.current = null;
    setActiveChannelId(pendingChannelId);
    editingChannelOriginalNameRef.current = pendingChannel.name;
    setEditingChannelId(pendingChannelId);
  }, [channels]);

  useEffect(() => {
    if (editingChannelId && !channels.some((channel) => channel.id === editingChannelId)) {
      setEditingChannelId(null);
    }
  }, [channels, editingChannelId]);

  useEffect(() => {
    if (isLaunchingViewer) {
      setEditingChannelId(null);
    }
  }, [isLaunchingViewer]);

  useEffect(() => {
    if (editingChannelId) {
      editingChannelInputRef.current?.focus();
      editingChannelInputRef.current?.select();
    }
  }, [editingChannelId]);

  useEffect(() => {
    if (channels.length === 0) {
      if (activeChannelId !== null) {
        setActiveChannelId(null);
      }
      return;
    }
    if (!activeChannelId || !channels.some((channel) => channel.id === activeChannelId)) {
      setActiveChannelId(channels[0].id);
    }
  }, [activeChannelId, channels]);

  const channelNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const channel of channels) {
      map.set(channel.id, channel.name.trim() || 'Untitled channel');
    }
    return map;
  }, [channels, experimentDimension]);
  const channelLayersMap = useMemo(() => {
    const map = new Map<string, LoadedLayer[]>();
    for (const layer of layers) {
      const collection = map.get(layer.channelId);
      if (collection) {
        collection.push(layer);
      } else {
        map.set(layer.channelId, [layer]);
      }
    }
    return map;
  }, [layers]);
  const layerChannelMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const layer of layers) {
      map.set(layer.key, layer.channelId);
    }
    return map;
  }, [layers]);
  const channelTintMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const channel of channels) {
      const channelLayers = channelLayersMap.get(channel.id) ?? [];
      const activeLayerKey = channelActiveLayer[channel.id] ?? channelLayers[0]?.key ?? null;
      if (activeLayerKey) {
        const settings = layerSettings[activeLayerKey];
        const normalized = normalizeHexColor(settings?.color ?? DEFAULT_LAYER_COLOR, DEFAULT_LAYER_COLOR);
        map.set(channel.id, normalized);
      } else {
        map.set(channel.id, DEFAULT_LAYER_COLOR);
      }
    }
    return map;
  }, [channelActiveLayer, channelLayersMap, channels, layerSettings]);
  const loadedChannelIds = useMemo(() => {
    const seen = new Set<string>();
    const order: string[] = [];
    for (const layer of layers) {
      if (!seen.has(layer.channelId)) {
        seen.add(layer.channelId);
        order.push(layer.channelId);
      }
    }
    return order;
  }, [layers]);
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

  const handleResetWindowLayout = useCallback(() => {
    setLayoutResetToken(nextLayoutResetToken);
    setTrackWindowInitialPosition(computeTrackWindowDefaultPosition());
    setViewerSettingsWindowInitialPosition(computeViewerSettingsWindowDefaultPosition());
    setSelectedTracksWindowInitialPosition(computeSelectedTracksWindowDefaultPosition());
    setPlotSettingsWindowInitialPosition(computePlotSettingsWindowDefaultPosition());
  }, [
    nextLayoutResetToken,
    computeSelectedTracksWindowDefaultPosition,
    computePlotSettingsWindowDefaultPosition,
    computeViewerSettingsWindowDefaultPosition,
    computeTrackWindowDefaultPosition
  ]);

  useEffect(() => {
    const defaultPosition = computeTrackWindowDefaultPosition();
    setTrackWindowInitialPosition((current) => {
      if (current.x === defaultPosition.x && current.y === defaultPosition.y) {
        return current;
      }
      return defaultPosition;
    });
  }, [computeTrackWindowDefaultPosition]);

  useEffect(() => {
    const defaultPosition = computeViewerSettingsWindowDefaultPosition();
    setViewerSettingsWindowInitialPosition((current) => {
      if (current.x === defaultPosition.x && current.y === defaultPosition.y) {
        return current;
      }
      return defaultPosition;
    });
  }, [computeViewerSettingsWindowDefaultPosition]);

  useEffect(() => {
    const defaultPosition = computeSelectedTracksWindowDefaultPosition();
    setSelectedTracksWindowInitialPosition((current) => {
      if (current.x === defaultPosition.x && current.y === defaultPosition.y) {
        return current;
      }
      return defaultPosition;
    });
  }, [computeSelectedTracksWindowDefaultPosition]);

  useEffect(() => {
    const defaultPosition = computePlotSettingsWindowDefaultPosition();
    setPlotSettingsWindowInitialPosition((current) => {
      if (current.x === defaultPosition.x && current.y === defaultPosition.y) {
        return current;
      }
      return defaultPosition;
    });
  }, [computePlotSettingsWindowDefaultPosition]);

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

  const showLaunchError = useCallback((message: string) => {
    reportDatasetError(message, 'launch');
  }, [reportDatasetError]);

  const showInteractionWarning = useCallback((message: string) => {
    reportDatasetError(message, 'interaction');
  }, [reportDatasetError]);

  const loadDataset = useCallback(
    () =>
      loadSelectedDataset({
        voxelResolution,
        anisotropyScale,
        experimentDimension,
        preprocessingSettingsRef,
        setStatus,
        setError,
        clearDatasetError,
        setSelectedIndex,
        setIsPlaying,
        setLoadProgress,
        setLoadedCount,
        setExpectedVolumeCount,
        setActiveChannelTabId,
        showLaunchError
      }),
    [
      anisotropyScale,
      clearDatasetError,
      experimentDimension,
      loadSelectedDataset,
      setActiveChannelTabId,
      setExpectedVolumeCount,
      setIsPlaying,
      setLoadProgress,
      setLoadedCount,
      setStatus,
      setError,
      setSelectedIndex,
      voxelResolution,
      showLaunchError
    ]
  );

  const {
    preprocessedExperiment,
    isPreprocessedLoaderOpen,
    isPreprocessedImporting,
    isPreprocessedDragActive,
    isExportingPreprocessed,
    preprocessedDropboxImporting,
    preprocessedImportError,
    preprocessedDropboxError,
    preprocessedDropboxInfo,
    preprocessedImportBytesProcessed,
    preprocessedImportTotalBytes,
    preprocessedImportVolumesDecoded,
    preprocessedImportTotalVolumeCount,
    isPreprocessedDropboxConfigOpen,
    preprocessedDropboxAppKeyInput,
    preprocessedDropboxAppKeySource,
    preprocessedFileInputRef,
    handlePreprocessedLoaderOpen,
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
  } = usePreprocessedExperiment({
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
    loadSelectedDataset: loadDataset,
    showInteractionWarning,
    isLaunchingViewer,
    voxelResolution,
    experimentDimension
  });

  const isLoading = status === 'loading';
  const playbackDisabled = isLoading || volumeTimepointCount <= 1;

  const playbackLabel = useMemo(() => {
    if (volumeTimepointCount === 0) {
      return '0 / 0';
    }
    const currentFrame = Math.min(selectedIndex + 1, volumeTimepointCount);
    return `${currentFrame} / ${volumeTimepointCount}`;
  }, [selectedIndex, volumeTimepointCount]);

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

  const handleTogglePlayback = useCallback(() => {
    setIsPlaying((current) => {
      if (!current && volumeTimepointCount <= 1) {
        return current;
      }
      return !current;
    });
  }, [volumeTimepointCount]);

  const handleTimeIndexChange = useCallback(
    (nextIndex: number) => {
      setSelectedIndex((prev) => {
        if (volumeTimepointCount === 0) {
          return prev;
        }
        const clamped = Math.max(0, Math.min(volumeTimepointCount - 1, nextIndex));
        return clamped;
      });
    },
    [volumeTimepointCount]
  );

  const handleJumpToStart = useCallback(() => {
    if (volumeTimepointCount === 0) {
      return;
    }
    handleTimeIndexChange(0);
  }, [handleTimeIndexChange, volumeTimepointCount]);

  const handleJumpToEnd = useCallback(() => {
    if (volumeTimepointCount === 0) {
      return;
    }
    handleTimeIndexChange(volumeTimepointCount - 1);
  }, [handleTimeIndexChange, volumeTimepointCount]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    if (viewerMode !== '2d') {
      return;
    }
    if (!isPlaying || playbackDisabled) {
      return;
    }

    const minFps = 1;
    const maxFps = 60;
    const clampedFps = Math.min(Math.max(fps, minFps), maxFps);
    const frameDuration = clampedFps > 0 ? 1000 / clampedFps : Infinity;

    let animationFrame: number | null = null;
    let lastTimestamp: number | null = null;
    let accumulator = 0;
    let cancelled = false;

    const step = (timestamp: number) => {
      if (cancelled) {
        return;
      }

      if (lastTimestamp === null) {
        lastTimestamp = timestamp;
      }

      accumulator += timestamp - lastTimestamp;
      lastTimestamp = timestamp;

      while (accumulator >= frameDuration) {
        accumulator -= frameDuration;
        setSelectedIndex((previous) => {
          if (volumeTimepointCount <= 1) {
            const maxIndex = Math.max(0, volumeTimepointCount - 1);
            const clamped = Math.min(Math.max(previous, 0), maxIndex);
            return clamped;
          }

          const maxIndex = Math.max(0, volumeTimepointCount - 1);
          const nextIndex = previous >= maxIndex ? 0 : previous + 1;
          return nextIndex;
        });
      }

      animationFrame = window.requestAnimationFrame(step);
    };

    animationFrame = window.requestAnimationFrame(step);

    return () => {
      cancelled = true;
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame);
      }
    };
  }, [fps, isPlaying, playbackDisabled, viewerMode, volumeTimepointCount]);

  const handleStartExperimentSetup = useCallback(() => {
    resetPreprocessedState();
    setIsExperimentSetupStarted(true);
    setActiveChannelId(null);
    setEditingChannelId(null);
    pendingChannelFocusIdRef.current = null;
    clearDatasetError();
  }, [clearDatasetError, resetPreprocessedState]);

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
    pendingChannelFocusIdRef.current = channel.id;
    setActiveChannelId(channel.id);
    editingChannelOriginalNameRef.current = channel.name;
    setEditingChannelId(channel.id);
    clearDatasetError();
  }, [clearDatasetError, createChannelSource, resetPreprocessedState]);

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
      setActiveChannelId((previous) => {
        if (filtered.length === 0) {
          return null;
        }
        if (previous && filtered.some((channel) => channel.id === previous)) {
          return previous;
        }
        const removedIndex = current.findIndex((channel) => channel.id === channelId);
        if (removedIndex <= 0) {
          return filtered[0].id;
        }
        const fallbackIndex = Math.min(removedIndex - 1, filtered.length - 1);
        return filtered[fallbackIndex]?.id ?? filtered[0].id;
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
  }, [clearDatasetError]);

  const handleChannelLayerFilesAdded = useCallback(
    async (channelId: string, incomingFiles: File[]) => {
      const tiffFiles = dedupeFiles(incomingFiles.filter((file) => hasTiffExtension(file.name)));
      if (tiffFiles.length === 0) {
        showInteractionWarning('No TIFF files detected in the dropped selection.');
        return;
      }

      let addedAny = false;
      let ignoredExtraGroups = false;
      let addedLayer: ChannelLayerSource | null = null;
      const replacedLayerIds: string[] = [];
      setChannels((current) =>
        current.map((channel) => {
          if (channel.id !== channelId) {
            return channel;
          }
          const grouped = groupFilesIntoLayers(tiffFiles);
          if (grouped.length === 0) {
            return channel;
          }
          if (grouped.length > 1) {
            ignoredExtraGroups = true;
          }
          const sorted = sortVolumeFiles(grouped[0]);
          if (sorted.length === 0) {
            return channel;
          }
          addedAny = true;
          if (channel.layers.length > 0) {
            replacedLayerIds.push(channel.layers[0].id);
          }
          const nextLayer = createLayerSource(sorted);
          addedLayer = nextLayer;
          return { ...channel, layers: [nextLayer] };
        })
      );

      if (addedAny) {
        if (addedLayer) {
          const layerForCounts: ChannelLayerSource = addedLayer;
          try {
            const timepointCount = await computeLayerTimepointCount(layerForCounts.files);
            setLayerTimepointCounts((current) => {
              const next: Record<string, number> = {
                ...current,
                [layerForCounts.id]: timepointCount
              };
              for (const layerId of replacedLayerIds) {
                if (layerId in next) {
                  delete next[layerId];
                }
              }
              return next;
            });
          } catch (error) {
            console.error('Failed to compute timepoint count for layer', error);
            setLayerTimepointCounts((current) => {
              const next: Record<string, number> = {
                ...current,
                [layerForCounts.id]: layerForCounts.files.length
              };
              for (const layerId of replacedLayerIds) {
                if (layerId in next) {
                  delete next[layerId];
                }
              }
              return next;
            });
          }
        }
        if (replacedLayerIds.length > 0) {
          setLayerSettings((current) => {
            let changed = false;
            const next = { ...current };
            for (const layerId of replacedLayerIds) {
              if (layerId in next) {
                delete next[layerId];
                changed = true;
              }
            }
            return changed ? next : current;
          });
          setLayerAutoThresholds((current) => {
            let changed = false;
            const next = { ...current };
            for (const layerId of replacedLayerIds) {
              if (layerId in next) {
                delete next[layerId];
                changed = true;
              }
            }
            return changed ? next : current;
          });
        }
        if (ignoredExtraGroups) {
          showInteractionWarning('Only the first TIFF sequence was added. Additional sequences were ignored.');
        } else {
          clearDatasetError();
        }
      }
    },
    [clearDatasetError, computeLayerTimepointCount, createLayerSource, showInteractionWarning]
  );

  const handleChannelLayerDrop = useCallback(
    async (channelId: string, dataTransfer: DataTransfer) => {
      const files = await collectFilesFromDataTransfer(dataTransfer);
      if (files.length === 0) {
        showInteractionWarning('No TIFF files detected in the dropped selection.');
        return;
      }
      handleChannelLayerFilesAdded(channelId, files);
    },
    [handleChannelLayerFilesAdded, showInteractionWarning]
  );

  const handleChannelLayerSegmentationToggle = useCallback(
    (channelId: string, layerId: string, value: boolean) => {
      setChannels((current) =>
        current.map((channel) => {
          if (channel.id !== channelId) {
            return channel;
          }
          return {
            ...channel,
            layers: channel.layers.map((layer) =>
              layer.id === layerId ? { ...layer, isSegmentation: value } : layer
            )
          };
        })
      );
    },
    []
  );

  const handleChannelLayerRemove = useCallback((channelId: string, layerId: string) => {
    let removed = false;
    setChannels((current) =>
      current.map((channel) => {
        if (channel.id !== channelId) {
          return channel;
        }
        const filtered = channel.layers.filter((layer) => layer.id !== layerId);
        if (filtered.length === channel.layers.length) {
          return channel;
        }
        removed = true;
        return {
          ...channel,
          layers: filtered
        };
      })
    );
    if (removed) {
      setLayerSettings((current) => {
        if (!(layerId in current)) {
          return current;
        }
        const next = { ...current };
        delete next[layerId];
        return next;
      });
      setLayerAutoThresholds((current) => {
        if (!(layerId in current)) {
          return current;
        }
        const next = { ...current };
        delete next[layerId];
        return next;
      });
      setLayerTimepointCounts((current) => {
        if (!(layerId in current)) {
          return current;
        }
        const next = { ...current };
        delete next[layerId];
        return next;
      });
      clearDatasetError();
    }

  }, [clearDatasetError]);

  const handleDiscardPreprocessedExperiment = useCallback(() => {
    resetPreprocessedState();
    setChannels([]);
    setChannelVisibility({});
    setChannelActiveLayer({});
    setLayerSettings({});
    setLayerAutoThresholds({});
    setLayers([]);
    setSelectedIndex(0);
    setActiveChannelId(null);
    setEditingChannelId(null);
    setActiveChannelTabId(null);
    resetTrackState();
    setStatus('idle');
    setError(null);
    setLoadProgress(0);
    setLoadedCount(0);
    setExpectedVolumeCount(0);
    setIsPlaying(false);
    setIsViewerLaunched(false);
    setIsExperimentSetupStarted(false);
    channelIdRef.current = 0;
    layerIdRef.current = 0;
    clearTextureCache();
    clearDatasetError();
  }, [clearDatasetError, resetPreprocessedState]);

  const handleReturnToFrontPage = useCallback(() => {
    handleDiscardPreprocessedExperiment();
  }, [handleDiscardPreprocessedExperiment]);



  const frontPageMode = useMemo<'initial' | 'configuring' | 'preprocessed'>(() => {
    if (preprocessedExperiment) {
      return 'preprocessed';
    }
    if (channels.length > 0 || isExperimentSetupStarted) {
      return 'configuring';
    }
    return 'initial';
  }, [channels, isExperimentSetupStarted, preprocessedExperiment]);
  const canLaunch = hasAnyLayers && allChannelsValid && !hasLoadingTracks && voxelResolution !== null;
  const launchButtonEnabled = frontPageMode === 'preprocessed' ? preprocessedExperiment !== null : canLaunch;
  const launchButtonLaunchable = launchButtonEnabled ? 'true' : 'false';

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
    const isFrontPageLocked =
      isLaunchingViewer || isExportingPreprocessed || isPreprocessedImporting || preprocessedDropboxImporting;
    const warningWindowInitialPosition =
      typeof window === 'undefined'
        ? { x: WINDOW_MARGIN, y: WINDOW_MARGIN }
        : {
            x: Math.max(WINDOW_MARGIN, Math.round(window.innerWidth / 2 - WARNING_WINDOW_WIDTH / 2)),
            y: WINDOW_MARGIN + 16
          };
    return (
      <FrontPage
        isFrontPageLocked={isFrontPageLocked}
        frontPageMode={frontPageMode}
        channels={channels}
        activeChannelId={activeChannelId}
        activeChannel={activeChannel}
        channelValidationMap={channelValidationMap}
        editingChannelId={editingChannelId}
        editingChannelInputRef={editingChannelInputRef}
        editingChannelOriginalNameRef={editingChannelOriginalNameRef}
        setActiveChannelId={setActiveChannelId}
        setEditingChannelId={setEditingChannelId}
        onStartExperimentSetup={handleStartExperimentSetup}
        onAddChannel={handleAddChannel}
        onOpenPreprocessedLoader={handlePreprocessedLoaderOpen}
        onReturnToStart={handleReturnToFrontPage}
        experimentDimension={experimentDimension}
        onExperimentDimensionChange={handleExperimentDimensionChange}
        voxelResolution={voxelResolutionInput}
        onVoxelResolutionAxisChange={handleVoxelResolutionAxisChange}
        onVoxelResolutionUnitChange={handleVoxelResolutionUnitChange}
        onVoxelResolutionAnisotropyToggle={handleVoxelResolutionAnisotropyToggle}
        isPreprocessedLoaderOpen={isPreprocessedLoaderOpen}
        isPreprocessedDragActive={isPreprocessedDragActive}
        onPreprocessedDragEnter={handlePreprocessedDragEnter}
        onPreprocessedDragLeave={handlePreprocessedDragLeave}
        onPreprocessedDragOver={handlePreprocessedDragOver}
        onPreprocessedDrop={handlePreprocessedDrop}
        preprocessedFileInputRef={preprocessedFileInputRef}
        onPreprocessedFileInputChange={handlePreprocessedFileInputChange}
        isPreprocessedImporting={isPreprocessedImporting}
        preprocessedImportBytesProcessed={preprocessedImportBytesProcessed}
        preprocessedImportTotalBytes={preprocessedImportTotalBytes}
        preprocessedImportVolumesDecoded={preprocessedImportVolumesDecoded}
        preprocessedImportTotalVolumeCount={preprocessedImportTotalVolumeCount}
        preprocessedDropboxImporting={preprocessedDropboxImporting}
        onPreprocessedBrowse={handlePreprocessedBrowse}
        onPreprocessedDropboxImport={handlePreprocessedDropboxImport}
        preprocessedImportError={preprocessedImportError}
        preprocessedDropboxError={preprocessedDropboxError}
        preprocessedDropboxInfo={preprocessedDropboxInfo}
        isPreprocessedDropboxConfigOpen={isPreprocessedDropboxConfigOpen}
        onPreprocessedDropboxConfigSubmit={handlePreprocessedDropboxConfigSubmit}
        preprocessedDropboxAppKeyInput={preprocessedDropboxAppKeyInput}
        onPreprocessedDropboxConfigInputChange={handlePreprocessedDropboxConfigInputChange}
        preprocessedDropboxAppKeySource={preprocessedDropboxAppKeySource}
        onPreprocessedDropboxConfigCancel={handlePreprocessedDropboxConfigCancel}
        onPreprocessedDropboxConfigClear={handlePreprocessedDropboxConfigClear}
        onChannelNameChange={handleChannelNameChange}
        onRemoveChannel={handleRemoveChannel}
        onChannelLayerFilesAdded={handleChannelLayerFilesAdded}
        onChannelLayerDrop={handleChannelLayerDrop}
        onChannelLayerSegmentationToggle={handleChannelLayerSegmentationToggle}
        onChannelLayerRemove={handleChannelLayerRemove}
        onChannelTrackFileSelected={handleChannelTrackFileSelected}
        onChannelTrackDrop={handleChannelTrackDrop}
        onChannelTrackClear={handleChannelTrackClear}
        preprocessedExperiment={preprocessedExperiment}
        computeTrackSummary={computeTrackSummary}
        hasGlobalTimepointMismatch={hasGlobalTimepointMismatch}
        interactionErrorMessage={interactionErrorMessage}
        launchErrorMessage={launchErrorMessage}
        onLaunchViewer={handleLaunchViewer}
        isLaunchingViewer={isLaunchingViewer}
        launchButtonEnabled={launchButtonEnabled}
        launchButtonLaunchable={launchButtonLaunchable}
        onExportPreprocessedExperiment={handleExportPreprocessedExperiment}
        isExportingPreprocessed={isExportingPreprocessed}
        canLaunch={canLaunch}
        warningWindowInitialPosition={warningWindowInitialPosition}
        warningWindowWidth={WARNING_WINDOW_WIDTH}
        datasetErrorResetSignal={datasetErrorResetSignal}
        onDatasetErrorDismiss={handleDatasetErrorDismiss}
      />
    );
  }

  const volumeViewerProps: ViewerShellProps['volumeViewerProps'] = {
    layers: viewerLayers,
    isLoading,
    loadingProgress: loadProgress,
    loadedVolumes: loadedCount,
    expectedVolumes: expectedVolumeCount,
    timeIndex: selectedIndex,
    totalTimepoints: volumeTimepointCount,
    isPlaying,
    playbackDisabled,
    playbackLabel,
    fps,
    blendingMode,
    onTogglePlayback: handleTogglePlayback,
    onTimeIndexChange: handleTimeIndexChange,
    onFpsChange: setFps,
    onVolumeStepScaleChange: handleVolumeStepScaleChange,
    onRegisterVolumeStepScaleChange: handleRegisterVolumeStepScaleChange,
    onRegisterReset: handleRegisterReset,
    trackScale,
    tracks: filteredTracks,
    trackVisibility,
    trackOpacityByChannel,
    trackLineWidthByChannel,
    channelTrackColorModes,
    channelTrackOffsets,
    selectedTrackIds,
    followedTrackId,
    onTrackSelectionToggle: handleTrackSelectionToggle,
    onTrackFollowRequest: handleTrackFollowFromViewer,
    onHoverVoxelChange: setHoveredVolumeVoxel,
    vr: is3dViewerAvailable
      ? {
          isVrPassthroughSupported,
          trackChannels,
          activeTrackChannelId,
          onTrackChannelSelect: handleTrackChannelSelect,
          onTrackVisibilityToggle: handleTrackVisibilityToggle,
          onTrackVisibilityAllChange: handleTrackVisibilityAllChange,
          onTrackOpacityChange: handleTrackOpacityChange,
          onTrackLineWidthChange: handleTrackLineWidthChange,
          onTrackColorSelect: handleTrackColorSelect,
          onTrackColorReset: handleTrackColorReset,
          onStopTrackFollow: handleStopTrackFollow,
          channelPanels: vrChannelPanels,
          activeChannelPanelId: activeChannelTabId,
          onChannelPanelSelect: setActiveChannelTabId,
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
          onVrSessionEnded: handleSessionEnded
        }
      : undefined
  };

  const planarViewerProps: ViewerShellProps['planarViewerProps'] = {
    layers: viewerLayers,
    isLoading,
    loadingProgress: loadProgress,
    loadedVolumes: loadedCount,
    expectedVolumes: expectedVolumeCount,
    timeIndex: selectedIndex,
    totalTimepoints: volumeTimepointCount,
    onRegisterReset: handleRegisterReset,
    sliceIndex,
    maxSlices: maxSliceDepth,
    onSliceIndexChange: handleSliceIndexChange,
    trackScale,
    tracks: filteredTracks,
    trackVisibility,
    trackOpacityByChannel,
    trackLineWidthByChannel,
    channelTrackColorModes,
    channelTrackOffsets,
    followedTrackId,
    selectedTrackIds,
    onTrackSelectionToggle: handleTrackSelectionToggle,
    onTrackFollowRequest: handleTrackFollowFromViewer,
    onHoverVoxelChange: setHoveredVolumeVoxel,
    orthogonalViewsEnabled: orthogonalViewsAvailable && orthogonalViewsEnabled
  };

  const showSelectedTracksWindow = !isVrActive && hasParsedTrackData;

  const viewerShellProps: ViewerShellProps = {
    viewerMode,
    volumeViewerProps,
    planarViewerProps,
    planarSettings: {
      orthogonalViewsAvailable,
      orthogonalViewsEnabled,
      onOrthogonalViewsToggle: toggleOrthogonalViews
    },
    topMenu: {
      onReturnToLauncher: handleReturnToLauncher,
      onResetLayout: handleResetWindowLayout,
      helpMenuRef,
      isHelpMenuOpen,
      onHelpMenuToggle: handleHelpMenuToggle,
      hoveredVoxel: hoveredVolumeVoxel,
      followedTrackChannelId,
      followedTrackId,
      onStopTrackFollow: handleStopTrackFollow
    },
    layout: {
      windowMargin: WINDOW_MARGIN,
      controlWindowWidth: CONTROL_WINDOW_WIDTH,
      selectedTracksWindowWidth: SELECTED_TRACKS_WINDOW_WIDTH,
      resetToken: layoutResetToken,
      controlWindowInitialPosition,
      viewerSettingsWindowInitialPosition,
      layersWindowInitialPosition,
      trackWindowInitialPosition,
      selectedTracksWindowInitialPosition,
      plotSettingsWindowInitialPosition
    },
    modeControls: {
      is3dModeAvailable: is3dViewerAvailable,
      isVrActive,
      isVrRequesting,
      resetViewHandler,
      onToggleViewerMode: toggleViewerMode,
      onVrButtonClick: handleVrButtonClick,
      vrButtonDisabled,
      vrButtonTitle,
      vrButtonLabel,
      renderStyle: globalRenderStyle,
      samplingMode: globalSamplingMode,
      onRenderStyleToggle: () => handleLayerRenderStyleToggle(),
      onSamplingModeToggle: () => handleLayerSamplingModeToggle(),
      blendingMode,
      onBlendingModeToggle: handleBlendingModeToggle
    },
    playbackControls: {
      fps,
      onFpsChange: setFps,
      volumeTimepointCount,
      sliceIndex,
      maxSliceDepth,
      onSliceIndexChange: handleSliceIndexChange,
      isPlaying,
      playbackLabel,
      selectedIndex,
      onTimeIndexChange: handleTimeIndexChange,
      playbackDisabled,
      onTogglePlayback: handleTogglePlayback,
      onJumpToStart: handleJumpToStart,
      onJumpToEnd: handleJumpToEnd,
      error
    },
    channelsPanel: {
      loadedChannelIds,
      channelNameMap,
      channelVisibility,
      channelTintMap,
      activeChannelId: activeChannelTabId,
      onChannelTabSelect: setActiveChannelTabId,
      onChannelVisibilityToggle: handleChannelVisibilityToggle,
      channelLayersMap,
      channelActiveLayer,
      layerSettings,
      getLayerDefaultSettings: createLayerDefaultSettings,
      onChannelLayerSelect: handleChannelLayerSelectionChange,
      onChannelReset: handleChannelSliderReset,
      onLayerWindowMinChange: handleLayerWindowMinChange,
      onLayerWindowMaxChange: handleLayerWindowMaxChange,
      onLayerBrightnessChange: handleLayerBrightnessChange,
      onLayerContrastChange: handleLayerContrastChange,
      onLayerAutoContrast: handleLayerAutoContrast,
      onLayerOffsetChange: handleLayerOffsetChange,
      onLayerColorChange: handleLayerColorChange,
      onLayerInvertToggle: handleLayerInvertToggle
    },
    tracksPanel: {
      channels,
      channelNameMap,
      activeChannelId: activeTrackChannelId,
      onChannelTabSelect: setActiveTrackChannelId,
      parsedTracksByChannel,
      filteredTracksByChannel,
      minimumTrackLength,
      pendingMinimumTrackLength,
      trackLengthBounds,
      onMinimumTrackLengthChange: handleMinimumTrackLengthChange,
      onMinimumTrackLengthApply: handleMinimumTrackLengthApply,
      channelTrackColorModes,
      trackOpacityByChannel,
      trackLineWidthByChannel,
      trackSummaryByChannel,
      followedTrackChannelId,
      followedTrackId,
      onTrackOrderToggle: handleTrackOrderToggle,
      trackOrderModeByChannel,
      trackVisibility,
      onTrackVisibilityToggle: handleTrackVisibilityToggle,
      onTrackVisibilityAllChange: handleTrackVisibilityAllChange,
      onTrackOpacityChange: handleTrackOpacityChange,
      onTrackLineWidthChange: handleTrackLineWidthChange,
      onTrackColorSelect: handleTrackColorSelect,
      onTrackColorReset: handleTrackColorReset,
      onTrackSelectionToggle: handleTrackSelectionToggle,
      selectedTrackIds,
      onTrackFollow: handleTrackFollow
    },
    selectedTracksPanel: {
      shouldRender: showSelectedTracksWindow,
      series: selectedTrackSeries,
      totalTimepoints: volumeTimepointCount,
      amplitudeLimits: resolvedAmplitudeLimits,
      timeLimits: resolvedTimeLimits,
      currentTimepoint: selectedIndex,
      channelTintMap,
      smoothing: trackSmoothing,
      onTrackSelectionToggle: handleTrackSelectionToggle
    },
    plotSettings: {
      amplitudeExtent,
      amplitudeLimits: resolvedAmplitudeLimits,
      timeExtent,
      timeLimits: resolvedTimeLimits,
      smoothing: trackSmoothing,
      smoothingExtent: TRACK_SMOOTHING_RANGE,
      onAmplitudeLimitsChange: handleSelectedTracksAmplitudeLimitsChange,
      onTimeLimitsChange: handleSelectedTracksTimeLimitsChange,
      onSmoothingChange: handleTrackSmoothingChange,
      onAutoRange: handleSelectedTracksAutoRange,
      onClearSelection: handleClearSelectedTracks
    },
    trackDefaults: {
      opacity: DEFAULT_TRACK_OPACITY,
      lineWidth: DEFAULT_TRACK_LINE_WIDTH
    }
  };

  return <ViewerShell {...viewerShellProps} />;
}

export default function App() {
  return <AppContent />;
}
