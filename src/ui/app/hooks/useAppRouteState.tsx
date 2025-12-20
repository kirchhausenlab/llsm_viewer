import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FrontPageContainerProps } from '../../../components/pages/FrontPageContainer';
import type { ViewerShellContainerProps } from '../../../components/viewers/ViewerShellContainer';
import type {
  ChannelSource,
  ChannelValidation,
  LoadedDatasetLayer,
  StagedPreprocessedExperiment
} from '../../../hooks/dataset';
import { clearTextureCache } from '../../../core/textureCache';
import { DEFAULT_WINDOW_MAX, DEFAULT_WINDOW_MIN } from '../../../state/layerSettings';
import { deriveChannelTrackOffsets } from '../../../state/channelTrackOffsets';
import type { FollowedVoxelTarget } from '../../../types/follow';
import type { HoveredVoxelInfo } from '../../../types/hover';
import { computeTrackSummary } from '../../../shared/utils/trackSummary';
import { type ExperimentDimension } from '../../../hooks/useVoxelResolution';
import type { DatasetErrorContext } from '../../../hooks/useDatasetErrors';
import { useDatasetSetup } from '../../../hooks/dataset';
import { useTrackState } from '../../../hooks/tracks';
import { useChannelLayerStateContext } from '../../../hooks/useChannelLayerState';
import type { NormalizedVolume } from '../../../core/volumeProcessing';
import { createVolumeProvider } from '../../../core/volumeProvider';
import { useViewerPlayback } from '../../../hooks/viewer';
import useChannelEditing from './useChannelEditing';
import { useLayerControls } from './useLayerControls';
import { useViewerModePlayback } from './useViewerModePlayback';
import { useWindowLayout } from './useWindowLayout';
import { WARNING_WINDOW_WIDTH, WINDOW_MARGIN } from '../../../shared/utils/windowLayout';
import { getTrackPlaybackIndexWindow } from '../../../shared/utils';

const DEFAULT_RESET_WINDOW = { windowMin: DEFAULT_WINDOW_MIN, windowMax: DEFAULT_WINDOW_MAX };

export type DatasetSetupRouteProps = FrontPageContainerProps;

export type ViewerRouteProps = {
  viewerShellProps: Omit<ViewerShellContainerProps, 'isHelpMenuOpen' | 'openHelpMenu' | 'closeHelpMenu'>;
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
  } = useChannelLayerStateContext();
  const [preprocessedExperiment, setPreprocessedExperiment] = useState<StagedPreprocessedExperiment | null>(null);
  const loadedDatasetLayers = useMemo<LoadedDatasetLayer[]>(() => {
    if (!preprocessedExperiment) {
      return [];
    }

    return preprocessedExperiment.channelSummaries.flatMap((channel) =>
      channel.layers.map((layer) => ({
        ...layer,
        channelId: channel.id
      }))
    );
  }, [preprocessedExperiment]);
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
    loadedLayers: loadedDatasetLayers,
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

  const effectiveTrackScale = useMemo(() => {
    if (!preprocessedExperiment) {
      return trackScale;
    }
    const saved = preprocessedExperiment.manifest.dataset.anisotropyCorrection?.scale ?? null;
    if (!saved) {
      return { x: 1, y: 1, z: 1 };
    }
    return saved;
  }, [preprocessedExperiment, trackScale]);

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

  const [status, setStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [loadProgress, setLoadProgress] = useState(0);
  const [loadedCount, setLoadedCount] = useState(0);
  const [expectedVolumeCount, setExpectedVolumeCount] = useState(0);
  const [isViewerLaunched, setIsViewerLaunched] = useState(false);
  const [isLaunchingViewer, setIsLaunchingViewer] = useState(false);
  const showLaunchError = useCallback((message: string) => reportDatasetError(message, 'launch'), [reportDatasetError]);

  const resetLaunchState = useCallback(() => {
    setStatus('idle');
    setError(null);
    setLoadProgress(0);
    setLoadedCount(0);
    setExpectedVolumeCount(0);
    stopPlayback();
    setIsViewerLaunched(false);
    setIsLaunchingViewer(false);
  }, [stopPlayback]);

  const volumeProvider = useMemo(() => {
    if (!preprocessedExperiment) {
      return null;
    }
    return createVolumeProvider({
      manifest: preprocessedExperiment.manifest,
      storage: preprocessedExperiment.storageHandle.storage,
      maxCachedVolumes: 12
    });
  }, [preprocessedExperiment]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    if (!import.meta.env?.DEV) {
      return;
    }

    (window as any).__LLSM_VOLUME_PROVIDER__ = volumeProvider;
    return () => {
      if ((window as any).__LLSM_VOLUME_PROVIDER__ === volumeProvider) {
        delete (window as any).__LLSM_VOLUME_PROVIDER__;
      }
    };
  }, [volumeProvider]);

  const [currentLayerVolumes, setCurrentLayerVolumes] = useState<Record<string, NormalizedVolume | null>>({});
  const volumeLoadRequestRef = useRef(0);

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

  const playbackLayerKeys = useMemo(() => {
    if (!isViewerLaunched || loadedChannelIds.length === 0) {
      return [] as string[];
    }

    const keys = loadedChannelIds
      .map((channelId) => {
        const channelLayers = channelLayersMap.get(channelId) ?? [];
        const selectedLayerKey = channelActiveLayer[channelId] ?? channelLayers[0]?.key ?? null;
        return selectedLayerKey;
      })
      .filter((key): key is string => Boolean(key))
      .filter((layerKey) => {
        const channelId = layerChannelMap.get(layerKey);
        if (!channelId) {
          return true;
        }
        return channelVisibility[channelId] ?? true;
      });

    return keys;
  }, [
    channelActiveLayer,
    channelLayersMap,
    channelVisibility,
    isViewerLaunched,
    layerChannelMap,
    loadedChannelIds
  ]);

  const playbackPrefetchLookahead = useMemo(() => {
    if (!isPlaying) {
      return 1;
    }
    const minLookahead = 2;
    const maxLookahead = 8;
    const requestedFps = Number.isFinite(fps) ? fps : 0;
    const estimated = Math.ceil(Math.max(requestedFps, 0) / 8) + 2;
    return Math.min(maxLookahead, Math.max(minLookahead, estimated));
  }, [fps, isPlaying]);

  const playbackPrefetchSessionRef = useRef(0);
  const playbackPrefetchStateRef = useRef({
    pending: [] as number[],
    inFlight: new Set<number>(),
    layerKeys: [] as string[],
    maxInFlight: 1,
    drainScheduled: false,
  });

  useEffect(() => {
    playbackPrefetchSessionRef.current += 1;
    const state = playbackPrefetchStateRef.current;
    state.pending.length = 0;
    state.inFlight.clear();
    state.layerKeys = [];
    state.drainScheduled = false;
  }, [volumeProvider]);

  useEffect(() => {
    if (isPlaying) {
      return;
    }
    playbackPrefetchSessionRef.current += 1;
    const state = playbackPrefetchStateRef.current;
    state.pending.length = 0;
    state.inFlight.clear();
    state.layerKeys = [];
    state.drainScheduled = false;
  }, [isPlaying]);

  const drainPlaybackPrefetchQueue = useCallback(() => {
    if (!volumeProvider) {
      return;
    }

    const session = playbackPrefetchSessionRef.current;
    const state = playbackPrefetchStateRef.current;
    if (state.drainScheduled) {
      return;
    }

    state.drainScheduled = true;
    queueMicrotask(() => {
      const nextState = playbackPrefetchStateRef.current;
      nextState.drainScheduled = false;

      if (!volumeProvider) {
        return;
      }
      if (playbackPrefetchSessionRef.current !== session) {
        return;
      }

      while (nextState.inFlight.size < nextState.maxInFlight && nextState.pending.length > 0) {
        const idx = nextState.pending.shift();
        if (idx === undefined) {
          break;
        }
        nextState.inFlight.add(idx);

        void volumeProvider
          .prefetch(nextState.layerKeys, idx)
          .catch((error) => {
            console.warn('Playback prefetch failed', error);
          })
          .finally(() => {
            if (playbackPrefetchSessionRef.current !== session) {
              return;
            }
            playbackPrefetchStateRef.current.inFlight.delete(idx);
            drainPlaybackPrefetchQueue();
          });
      }
    });
  }, [volumeProvider]);

  const schedulePlaybackPrefetch = useCallback(
    (baseIndex: number) => {
      if (!isViewerLaunched || !volumeProvider || volumeTimepointCount <= 1 || playbackLayerKeys.length === 0) {
        return;
      }

      const clampedIndex = Math.max(0, Math.min(volumeTimepointCount - 1, baseIndex));
      const lookahead = Math.min(playbackPrefetchLookahead, Math.max(0, volumeTimepointCount - 1));

      const maxInFlight = lookahead >= 6 ? 2 : 1;
      const state = playbackPrefetchStateRef.current;
      state.layerKeys = playbackLayerKeys;
      state.maxInFlight = maxInFlight;
      state.pending.length = 0;

      for (let offset = 0; offset <= lookahead; offset++) {
        const idx = (clampedIndex + offset) % volumeTimepointCount;
        if (state.inFlight.has(idx)) {
          continue;
        }

        let ready = true;
        for (const layerKey of playbackLayerKeys) {
          if (!volumeProvider.hasVolume(layerKey, idx)) {
            ready = false;
            break;
          }
        }

        if (!ready) {
          state.pending.push(idx);
        }
      }

      if (state.pending.length > 0) {
        drainPlaybackPrefetchQueue();
      }
    },
    [
      drainPlaybackPrefetchQueue,
      isViewerLaunched,
      playbackLayerKeys,
      playbackPrefetchLookahead,
      volumeProvider,
      volumeTimepointCount
    ]
  );

  useEffect(() => {
    if (!volumeProvider) {
      return;
    }
    const layerCount = playbackLayerKeys.length;
    if (layerCount === 0) {
      volumeProvider.setMaxCachedVolumes(6);
      return;
    }

    const desired = Math.max(6, layerCount * (playbackPrefetchLookahead + 2));
    volumeProvider.setMaxCachedVolumes(desired);
  }, [playbackLayerKeys.length, playbackPrefetchLookahead, volumeProvider]);

  const canAdvancePlaybackToIndex = useCallback(
    (nextIndex: number): boolean => {
      if (!isViewerLaunched || !volumeProvider || volumeTimepointCount <= 1 || playbackLayerKeys.length === 0) {
        return true;
      }

      const clampedIndex = Math.max(0, Math.min(volumeTimepointCount - 1, nextIndex));
      const ready = playbackLayerKeys.every((layerKey) => volumeProvider.hasVolume(layerKey, clampedIndex));

      if (!ready) {
        schedulePlaybackPrefetch(clampedIndex);
        return false;
      }

      return true;
    },
    [isViewerLaunched, playbackLayerKeys, schedulePlaybackPrefetch, volumeProvider, volumeTimepointCount]
  );

  const followedTrackPlaybackWindow = useMemo(() => {
    if (followedTrackId === null) {
      return null;
    }
    const track = trackLookup.get(followedTrackId) ?? null;
    return getTrackPlaybackIndexWindow(track, volumeTimepointCount);
  }, [followedTrackId, trackLookup, volumeTimepointCount]);

  useEffect(() => {
    if (!isViewerLaunched || !isPlaying || !volumeProvider || volumeTimepointCount <= 1 || playbackLayerKeys.length === 0) {
      return;
    }

    schedulePlaybackPrefetch(selectedIndex);
  }, [
    isPlaying,
    isViewerLaunched,
    playbackLayerKeys,
    schedulePlaybackPrefetch,
    selectedIndex,
    volumeProvider,
    volumeTimepointCount
  ]);

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
    isLoading,
    canAdvancePlayback: canAdvancePlaybackToIndex,
    playbackWindow: followedTrackPlaybackWindow
  });

  const [isRecording, setIsRecording] = useState(false);
  const canRecord = volumeTimepointCount > 0 && !isLoading;

  const handleStartRecording = useCallback(() => {
    if (!canRecord) {
      return;
    }

    setIsRecording(true);
  }, [canRecord]);

  const handleStopRecording = useCallback(() => {
    setIsRecording(false);
  }, []);

  useEffect(() => {
    if (!canRecord) {
      setIsRecording(false);
    }
  }, [canRecord]);

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
    stopPlayback();
    volumeProvider?.clear();
    setCurrentLayerVolumes({});
    clearTextureCache();
    setIsViewerLaunched(false);
  }, [setIsViewerLaunched, stopPlayback, volumeProvider]);

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
        const isGrayscale = layer.channels === 1;
        const volume = currentLayerVolumes[layer.key] ?? null;
        return {
          key: layer.key,
          label: layer.label,
          hasData: layer.volumeCount > 0,
          isGrayscale,
          isSegmentation: layer.isSegmentation,
          defaultWindow,
          histogram: volume?.histogram ?? null,
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
    createLayerDefaultSettings,
    layerSettings,
    loadedChannelIds,
    currentLayerVolumes
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
    setCurrentLayerVolumes({});
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

    if (!preprocessedExperiment || !volumeProvider) {
      showLaunchError('Preprocess or import a preprocessed experiment before launching the viewer.');
      return;
    }

    clearDatasetError();
    setIsLaunchingViewer(true);
    setStatus('loading');
    setError(null);
    setCurrentLayerVolumes({});
    setSelectedIndex(0);
    setIsPlaying(false);
    setLoadProgress(0);
    setLoadedCount(0);
    try {
      clearTextureCache();

      const initialTimeIndex = 0;
      const layerKeys = loadedChannelIds
        .map((channelId) => {
          const channelLayers = channelLayersMap.get(channelId) ?? [];
          const selectedLayerKey = channelActiveLayer[channelId] ?? channelLayers[0]?.key ?? null;
          return selectedLayerKey;
        })
        .filter((key): key is string => Boolean(key));

      setExpectedVolumeCount(layerKeys.length);

      const loadedVolumes: Record<string, NormalizedVolume | null> = {};
      for (let index = 0; index < layerKeys.length; index++) {
        const layerKey = layerKeys[index];
        loadedVolumes[layerKey] = await volumeProvider.getVolume(layerKey, initialTimeIndex);
        const nextLoaded = index + 1;
        setLoadedCount(nextLoaded);
        setLoadProgress(layerKeys.length === 0 ? 0 : nextLoaded / layerKeys.length);
      }

      setCurrentLayerVolumes(loadedVolumes);
      setIsViewerLaunched(true);
      setStatus('loaded');
      setLoadedCount(layerKeys.length);
      setLoadProgress(layerKeys.length === 0 ? 0 : 1);
    } catch (error) {
      console.error('Failed to launch viewer', error);
      const message = error instanceof Error ? error.message : 'Failed to launch viewer.';
      setStatus('error');
      setError(message);
      showLaunchError(message);
      setIsViewerLaunched(false);
    } finally {
      setIsLaunchingViewer(false);
    }
  }, [
    clearDatasetError,
    isLaunchingViewer,
    showLaunchError,
    preprocessedExperiment,
    volumeProvider,
    channelActiveLayer,
    channelLayersMap,
    loadedChannelIds,
    setIsPlaying
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
    if (loadedChannelIds.length === 0) {
      setActiveChannelTabId(null);
      return;
    }

    setActiveChannelTabId((current) => {
      if (current && loadedChannelIds.includes(current)) {
        return current;
      }
      return loadedChannelIds[0] ?? null;
    });
  }, [loadedChannelIds]);

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
      if (loadedChannelIds.length === 0) {
        if (Object.keys(current).length === 0) {
          return current;
        }
        return {};
      }

      const next: Record<string, string> = { ...current };
      let changed = false;
      const validChannels = new Set<string>(loadedChannelIds);

      for (const channelId of Object.keys(next)) {
        if (!validChannels.has(channelId)) {
          delete next[channelId];
          changed = true;
        }
      }

      for (const channelId of loadedChannelIds) {
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
  }, [channelLayersMap, loadedChannelIds]);

  const handleBlendingModeToggle = useCallback(() => {
    setBlendingMode((current) => (current === 'additive' ? 'alpha' : 'additive'));
  }, []);

  const activeViewerLayerKeys = playbackLayerKeys;

  useEffect(() => {
    if (!isViewerLaunched || !volumeProvider) {
      return;
    }
    if (volumeTimepointCount === 0 || activeViewerLayerKeys.length === 0) {
      setCurrentLayerVolumes({});
      return;
    }

    const requestId = volumeLoadRequestRef.current + 1;
    volumeLoadRequestRef.current = requestId;
    let cancelled = false;

    const clampedIndex = Math.max(0, Math.min(volumeTimepointCount - 1, selectedIndex));

    void (async () => {
      try {
        const entries = await Promise.all(
          activeViewerLayerKeys.map(async (layerKey) => [
            layerKey,
            await volumeProvider.getVolume(layerKey, clampedIndex)
          ] as const)
        );

        if (cancelled || volumeLoadRequestRef.current !== requestId) {
          return;
        }

        const nextVolumes = entries.reduce<Record<string, NormalizedVolume | null>>((acc, [layerKey, volume]) => {
          acc[layerKey] = volume;
          return acc;
        }, {});

        setCurrentLayerVolumes(nextVolumes);
      } catch (error) {
        console.error('Failed to load timepoint volumes', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeViewerLayerKeys, isViewerLaunched, selectedIndex, volumeProvider, volumeTimepointCount]);

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
    layers: loadedDatasetLayers,
    selectedIndex,
    layerVolumes: currentLayerVolumes,
    loadVolume: volumeProvider ? volumeProvider.getVolume : null,
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
    'isHelpMenuOpen' | 'openHelpMenu' | 'closeHelpMenu'
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
    isRecording,
    canRecord,
    fps,
    blendingMode,
    sliceIndex,
    maxSliceDepth,
    trackScale: effectiveTrackScale,
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
    layerVolumesByKey: currentLayerVolumes,
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
    canAdvancePlayback: canAdvancePlaybackToIndex,
    onStartRecording: handleStartRecording,
    onStopRecording: handleStopRecording,
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
