import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FrontPageContainerProps } from '../../../components/pages/FrontPageContainer';
import type { ViewerShellContainerProps } from '../../../components/viewers/ViewerShellContainer';
import type {
  LoadedDatasetLayer,
  StagedPreprocessedExperiment
} from '../../../hooks/dataset';
import { clearTextureCache } from '../../../core/textureCache';
import { deriveChannelTrackOffsets } from '../../../state/channelTrackOffsets';
import type { FollowedVoxelTarget } from '../../../types/follow';
import type { HoveredVoxelInfo } from '../../../types/hover';
import { computeTrackSummary } from '../../../shared/utils/trackSummary';
import { useDatasetSetup } from '../../../hooks/dataset';
import { useTrackState } from '../../../hooks/tracks';
import { useChannelLayerStateContext } from '../../../hooks/useChannelLayerState';
import {
  clearOpfsPreprocessedStorageRoot,
  PREPROCESSED_STORAGE_ROOT_DIR
} from '../../../shared/storage/preprocessedStorage';
import {
  createVolumeProvider,
  DEFAULT_MAX_CACHED_CHUNK_BYTES,
  DEFAULT_MAX_CACHED_VOLUMES,
  DEFAULT_MAX_CONCURRENT_CHUNK_READS,
  DEFAULT_MAX_CONCURRENT_PREFETCH_LOADS
} from '../../../core/volumeProvider';
import { useViewerPlayback } from '../../../hooks/viewer';
import useChannelEditing from './useChannelEditing';
import { useRouteDatasetResetState } from './useRouteDatasetResetState';
import { useRouteDatasetSetupState } from './useRouteDatasetSetupState';
import { useRouteLayerVolumes } from './useRouteLayerVolumes';
import { useRouteVrChannelPanels } from './useRouteVrChannelPanels';
import { useLayerControls } from './useLayerControls';
import { useRouteLaunchSessionState } from './useRouteLaunchSessionState';
import { useRoutePlaybackPrefetch } from './useRoutePlaybackPrefetch';
import {
  useRouteViewerProps
} from './useRouteViewerProps';
import { createRouteDatasetSetupProps } from './routeDatasetSetupProps';
import { createRouteViewerShellProps } from './routeViewerShellProps';
import { useViewerModePlayback } from './useViewerModePlayback';
import { useWindowLayout } from './useWindowLayout';
import { getTrackPlaybackIndexWindow } from '../../../shared/utils';

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

function selectDeterministicLayerKey(layers: ReadonlyArray<{ key: string }>): string | null {
  if (layers.length === 0) {
    return null;
  }
  return [...layers].sort((left, right) => left.key.localeCompare(right.key))[0]?.key ?? null;
}

function selectDeterministicId(values: ReadonlyArray<string>): string | null {
  if (values.length === 0) {
    return null;
  }
  return [...values].sort((left, right) => left.localeCompare(right))[0] ?? null;
}

function sanitizeHoveredVoxel(value: HoveredVoxelInfo | null): HoveredVoxelInfo | null {
  if (!value) {
    return null;
  }
  return {
    ...value,
    coordinates: {
      x: Math.round(value.coordinates.x),
      y: Math.round(value.coordinates.y),
      z: Math.round(value.coordinates.z),
    },
  };
}

function formatScaleLevelToken(level: number): string {
  return `L${Math.max(0, Math.floor(level))}`;
}

function formatDownsampleSuffix(downsampleFactor: [number, number, number] | null): string {
  if (!downsampleFactor) {
    return '';
  }
  const [depth, height, width] = downsampleFactor;
  if (depth === height && height === width && depth > 1) {
    return ` (${depth}x)`;
  }
  return '';
}

export function useAppRouteState(): AppRouteState {
  const {
    channels,
    setChannels,
    tracks,
    setTracks,
    setLayerTimepointCounts,
    channelIdRef,
    layerIdRef,
    trackSetIdRef,
    computeLayerTimepointCount,
    createChannelSource,
    createLayerSource,
    createTrackSetSource,
    updateChannelIdCounter,
    updateTrackSetIdCounter,
    channelValidationMap,
    trackValidationMap,
    hasGlobalTimepointMismatch,
    hasAnyLayers,
    hasLoadingTracks,
    allChannelsValid,
    allTracksValid,
    channelVisibility,
    setChannelVisibility,
    channelActiveLayer,
    setChannelActiveLayer,
    layerSettings,
    setLayerSettings,
    layerAutoThresholds,
    setLayerAutoThresholds,
    setGlobalRenderStyle,
    globalSamplingMode,
    setGlobalSamplingMode,
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
    voxelResolution,
    trackScale
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
  const hasScheduledOpfsCleanupRef = useRef(false);
  const [resetViewHandler, setResetViewHandler] = useState<(() => void) | null>(null);
  const [activeChannelTabId, setActiveChannelTabId] = useState<string | null>(null);
  const [hoveredVolumeVoxel, setHoveredVolumeVoxel] = useState<HoveredVoxelInfo | null>(null);
  const [followedVoxel, setFollowedVoxel] = useState<FollowedVoxelTarget | null>(null);
  const [lastHoveredVolumeVoxel, setLastHoveredVolumeVoxel] = useState<HoveredVoxelInfo | null>(null);
  const playback = useViewerPlayback();
  const { selectedIndex, setSelectedIndex, isPlaying, fps, setFps, stopPlayback, setIsPlaying } = playback;
  const is3dViewerAvailable = true;
  const preferBrickResidency = true;

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
    paintbrushWindowInitialPosition,
    trackWindowInitialPosition,
    viewerSettingsWindowInitialPosition,
    selectedTracksWindowInitialPosition,
    plotSettingsWindowInitialPosition,
    trackSettingsWindowInitialPosition,
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

  const showLaunchError = useCallback((message: string) => reportDatasetError(message, 'launch'), [reportDatasetError]);
  const {
    error,
    loadProgress,
    loadedCount,
    expectedVolumeCount,
    isViewerLaunched,
    isLaunchingViewer,
    isLoading,
    resetLaunchState,
    beginLaunchSession,
    setLaunchExpectedVolumeCount,
    setLaunchProgress,
    completeLaunchSession,
    failLaunchSession,
    finishLaunchSessionAttempt,
    endViewerSession
  } = useRouteLaunchSessionState({ stopPlayback });

  const volumeProvider = useMemo(() => {
    if (!preprocessedExperiment) {
      return null;
    }
    return createVolumeProvider({
      manifest: preprocessedExperiment.manifest,
      storage: preprocessedExperiment.storageHandle.storage,
      maxCachedVolumes: DEFAULT_MAX_CACHED_VOLUMES,
      maxCachedChunkBytes: DEFAULT_MAX_CACHED_CHUNK_BYTES,
      maxConcurrentChunkReads: DEFAULT_MAX_CONCURRENT_CHUNK_READS,
      maxConcurrentPrefetchLoads: DEFAULT_MAX_CONCURRENT_PREFETCH_LOADS
    });
  }, [preprocessedExperiment]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const scheduleOpfsCleanup = () => {
      if (hasScheduledOpfsCleanupRef.current) {
        return;
      }
      hasScheduledOpfsCleanupRef.current = true;
      void clearOpfsPreprocessedStorageRoot({ rootDir: PREPROCESSED_STORAGE_ROOT_DIR }).catch((error) => {
        console.warn('Failed to clear OPFS preprocessed cache during tab teardown.', error);
      });
    };

    const handlePageHide = (event: PageTransitionEvent) => {
      if (event.persisted) {
        return;
      }
      scheduleOpfsCleanup();
    };
    const handleBeforeUnload = () => {
      scheduleOpfsCleanup();
    };

    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    if (!import.meta.env?.DEV) {
      return;
    }

    window.__LLSM_VOLUME_PROVIDER__ = volumeProvider;
    return () => {
      if (window.__LLSM_VOLUME_PROVIDER__ === volumeProvider) {
        delete window.__LLSM_VOLUME_PROVIDER__;
      }
    };
  }, [volumeProvider]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    if (!import.meta.env?.DEV) {
      return;
    }

    const diagnosticsGetter = volumeProvider ? () => volumeProvider.getDiagnostics() : null;
    window.__LLSM_VOLUME_PROVIDER_DIAGNOSTICS__ = diagnosticsGetter;
    return () => {
      if (window.__LLSM_VOLUME_PROVIDER_DIAGNOSTICS__ === diagnosticsGetter) {
        delete window.__LLSM_VOLUME_PROVIDER_DIAGNOSTICS__;
      }
    };
  }, [volumeProvider]);

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
    trackSets,
    setTrackSetStates,
    trackOrderModeByTrackSet,
    setTrackOrderModeByTrackSet,
    setSelectedTrackOrder,
    selectedTrackIds,
    trackSmoothing,
    pendingMinimumTrackLength,
    minimumTrackLength,
    setFollowedTrack,
    activeTrackSetId,
    setActiveTrackSetId,
    parsedTracksByTrackSet,
    trackLookup,
    filteredTracksByTrackSet,
    filteredTracks,
    selectedTrackOrder,
    selectedTrackSeries,
    amplitudeExtent,
    timeExtent,
    resolvedAmplitudeLimits,
    resolvedTimeLimits,
    trackLengthBounds,
    trackSummaryByTrackSet,
    trackVisibility,
    trackOpacityByTrackSet,
    trackLineWidthByTrackSet,
    trackColorModesByTrackSet,
    isFullTrackTrailEnabled,
    trackTrailLength,
    followedTrackId,
    followedTrackSetId,
    handleAddTrackSet,
    handleTrackFilesAdded,
    handleTrackDrop,
    handleTrackSetNameChange,
    handleTrackSetBoundChannelChange,
    handleTrackSetClearFile,
    handleTrackSetRemove,
    handleTrackVisibilityToggle,
    handleTrackVisibilityAllChange,
    handleMinimumTrackLengthChange,
    handleMinimumTrackLengthApply,
    handleTrackOrderToggle,
    handleTrackOpacityChange,
    handleTrackLineWidthChange,
    handleTrackColorSelect,
    handleTrackColorReset,
    handleTrackTrailModeChange,
    handleTrackTrailLengthChange,
    handleTrackSelectionToggle,
    handleTrackFollow,
    handleTrackFollowFromViewer,
    handleTrackSetSelect,
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
    tracks,
    setTracks,
    createTrackSetSource,
    updateTrackSetIdCounter,
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
    const sanitized = sanitizeHoveredVoxel(value);
    if (sanitized) {
      setLastHoveredVolumeVoxel(sanitized);
    }
    setHoveredVolumeVoxel(sanitized);
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
    currentLayerVolumes,
    currentLayerPageTables,
    currentLayerBrickAtlases,
    volumeProviderDiagnostics,
    setCurrentLayerVolumes,
    playbackLayerKeys,
    handleLaunchViewer
  } = useRouteLayerVolumes({
    isViewerLaunched,
    isLaunchingViewer,
    isPlaying,
    preprocessedExperiment,
    volumeProvider,
    loadedChannelIds,
    channelLayersMap,
    channelActiveLayer,
    channelVisibility,
    layerChannelMap,
    preferBrickResidency,
    volumeTimepointCount,
    selectedIndex,
    clearDatasetError,
    beginLaunchSession,
    setLaunchExpectedVolumeCount,
    setLaunchProgress,
    completeLaunchSession,
    failLaunchSession,
    finishLaunchSessionAttempt,
    setSelectedIndex,
    setIsPlaying,
    showLaunchError
  });
  const brickResidencyLayerKeys = useMemo(() => {
    if (!preferBrickResidency) {
      return [] as string[];
    }
    return loadedDatasetLayers
      .filter((layer) => !layer.isSegmentation && layer.depth > 1)
      .map((layer) => layer.key);
  }, [loadedDatasetLayers, preferBrickResidency]);
  const playbackAtlasScaleLevelByLayerKey = useMemo(() => {
    const byKey: Record<string, number> = {};
    const manifest = preprocessedExperiment?.manifest;
    if (!manifest) {
      return byKey;
    }

    const desiredScaleLevel = isPlaying ? 1 : 0;
    for (const channel of manifest.dataset.channels) {
      for (const layer of channel.layers) {
        const levels = Array.from(new Set(layer.zarr.scales.map((scale) => scale.level))).sort((left, right) => left - right);
        let resolvedScaleLevel = levels[0] ?? 0;
        for (const level of levels) {
          if (level <= desiredScaleLevel) {
            resolvedScaleLevel = level;
          }
        }
        byKey[layer.key] = resolvedScaleLevel;
      }
    }
    return byKey;
  }, [isPlaying, preprocessedExperiment?.manifest]);
  const layerDownsampleFactorByLevelByKey = useMemo(() => {
    const byLayer = new Map<string, Map<number, [number, number, number]>>();
    const manifest = preprocessedExperiment?.manifest;
    if (!manifest) {
      return byLayer;
    }
    for (const channel of manifest.dataset.channels) {
      for (const layer of channel.layers) {
        const byLevel = new Map<number, [number, number, number]>();
        for (const scale of layer.zarr.scales) {
          byLevel.set(scale.level, scale.downsampleFactor);
        }
        byLayer.set(layer.key, byLevel);
      }
    }
    return byLayer;
  }, [preprocessedExperiment?.manifest]);
  const currentScaleLabel = useMemo(() => {
    if (!isViewerLaunched || playbackLayerKeys.length === 0) {
      return '—';
    }

    const loadedScaleEntries = playbackLayerKeys
      .map((layerKey) => {
        const scaleLevel =
          currentLayerBrickAtlases[layerKey]?.scaleLevel ??
          currentLayerVolumes[layerKey]?.scaleLevel ??
          null;
        if (!Number.isFinite(scaleLevel)) {
          return null;
        }
        return {
          layerKey,
          scaleLevel: Number(scaleLevel)
        };
      })
      .filter((entry): entry is { layerKey: string; scaleLevel: number } => entry !== null);

    if (loadedScaleEntries.length === 0) {
      return 'Loading…';
    }

    const uniqueLevels = Array.from(new Set(loadedScaleEntries.map((entry) => entry.scaleLevel))).sort(
      (left, right) => left - right
    );
    if (uniqueLevels.length === 1) {
      const scaleLevel = uniqueLevels[0] ?? 0;
      const entryForLevel = loadedScaleEntries.find((entry) => entry.scaleLevel === scaleLevel) ?? null;
      const downsampleFactor =
        entryForLevel
          ? layerDownsampleFactorByLevelByKey.get(entryForLevel.layerKey)?.get(scaleLevel) ?? null
          : null;
      return `${formatScaleLevelToken(scaleLevel)}${formatDownsampleSuffix(downsampleFactor)}`;
    }

    const listed = uniqueLevels.slice(0, 3).map((level) => formatScaleLevelToken(level));
    if (uniqueLevels.length > listed.length) {
      listed.push(`+${uniqueLevels.length - listed.length}`);
    }
    return listed.join(' / ');
  }, [
    currentLayerBrickAtlases,
    currentLayerVolumes,
    isViewerLaunched,
    layerDownsampleFactorByLevelByKey,
    playbackLayerKeys
  ]);
  const { canAdvancePlaybackToIndex } = useRoutePlaybackPrefetch({
    isViewerLaunched,
    isPlaying,
    fps,
    preferBrickResidency,
    brickResidencyLayerKeys,
    playbackAtlasScaleLevelByLayerKey,
    volumeProvider,
    volumeTimepointCount,
    playbackLayerKeys,
    selectedIndex
  });

  const followedTrackPlaybackWindow = useMemo(() => {
    if (followedTrackId === null) {
      return null;
    }
    const track = trackLookup.get(followedTrackId) ?? null;
    return getTrackPlaybackIndexWindow(track, volumeTimepointCount);
  }, [followedTrackId, trackLookup, volumeTimepointCount]);

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
    is3dViewerAvailable,
    onBeforeEnterVr: handleBeforeEnterVr,
    onViewerModeChange: resetHoveredVoxel,
    volumeTimepointCount,
    isLoading,
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
    vr: {
      isVrPassthroughSupported,
      isVrActive,
      isVrRequesting,
      vrButtonLabel,
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
    endViewerSession();
    volumeProvider?.clear();
    setCurrentLayerVolumes({});
    clearTextureCache();
  }, [endViewerSession, volumeProvider]);

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

  const { trackChannels, vrChannelPanels } = useRouteVrChannelPanels({
    trackSets,
    loadedChannelIds,
    channelNameMap,
    channelLayersMap,
    channelVisibility,
    channelActiveLayer,
    layerSettings,
    currentLayerVolumes,
    createLayerDefaultSettings
  });

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
  const {
    handleStartExperimentSetup,
    handleAddChannel,
    handleAddSegmentationChannel,
    handleChannelNameChange,
    handleRemoveChannel
  } = useRouteDatasetSetupState({
    resetPreprocessedState,
    setIsExperimentSetupStarted,
    resetChannelEditingState,
    clearDatasetError,
    setChannels,
    setTracks,
    createChannelSource,
    queuePendingChannelFocus,
    startEditingChannel,
    handleChannelRemoved,
    setLayerTimepointCounts
  });
  const { handleReturnToFrontPage } = useRouteDatasetResetState({
    resetPreprocessedState,
    setPreprocessedExperiment,
    setChannels,
    setTracks,
    setChannelVisibility,
    setChannelActiveLayer,
    setLayerSettings,
    setLayerAutoThresholds,
    setCurrentLayerVolumes,
    setSelectedIndex,
    resetChannelEditingState,
    setActiveChannelTabId,
    resetTrackState,
    resetLaunchState,
    setIsExperimentSetupStarted,
    channelIdRef,
    layerIdRef,
    trackSetIdRef,
    clearDatasetError
  });
  const canLaunch = hasAnyLayers && allChannelsValid && allTracksValid && !hasLoadingTracks && voxelResolution !== null;

  const activeChannel = useMemo(
    () => channels.find((channel) => channel.id === activeChannelId) ?? null,
    [activeChannelId, channels]
  );

  const launchErrorMessage = datasetErrorContext === 'launch' ? datasetError : null;
  const interactionErrorMessage = datasetErrorContext === 'interaction' ? datasetError : null;

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
      return selectDeterministicId(loadedChannelIds);
    });
  }, [loadedChannelIds]);

  useEffect(() => {
    if (trackSets.length === 0) {
      setActiveTrackSetId(null);
      return;
    }

    setActiveTrackSetId((current) => {
      if (current && trackSets.some((trackSet) => trackSet.id === current)) {
        return current;
      }
      return selectDeterministicId(trackSets.map((trackSet) => trackSet.id));
    });
  }, [trackSets]);

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
          const deterministicLayerKey = selectDeterministicLayerKey(channelLayers);
          if (deterministicLayerKey) {
            next[channelId] = deterministicLayerKey;
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

  const {
    viewerLayers,
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
    handleLayerRenderStyleChange,
    handleLayerRenderStyleToggle,
    handleLayerBlDensityScaleChange,
    handleLayerBlBackgroundCutoffChange,
    handleLayerBlOpacityScaleChange,
    handleLayerBlEarlyExitAlphaChange,
    handleLayerMipEarlyExitThresholdChange,
    handleLayerSamplingModeToggle,
    handleLayerInvertToggle
  } = useLayerControls({
    layers: loadedDatasetLayers,
    selectedIndex,
    layerVolumes: currentLayerVolumes,
    layerPageTables: currentLayerPageTables,
    layerBrickAtlases: currentLayerBrickAtlases,
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

  const routeDatasetSetup = createRouteDatasetSetupProps({
    state: {
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
      setIsExperimentSetupStarted,
      setViewerMode,
      updateChannelIdCounter
    },
    handlers: {
      onStartExperimentSetup: handleStartExperimentSetup,
      onAddChannel: handleAddChannel,
      onAddSegmentationChannel: handleAddSegmentationChannel,
      onReturnToStart: handleReturnToFrontPage,
      onChannelNameChange: handleChannelNameChange,
      onRemoveChannel: handleRemoveChannel,
      onChannelLayerFilesAdded: handleChannelLayerFilesAdded,
      onChannelLayerDrop: handleChannelLayerDrop,
      onChannelLayerRemove: handleChannelLayerRemove,
      onAddTrack: handleAddTrackSet,
      onTrackFilesAdded: handleTrackFilesAdded,
      onTrackDrop: handleTrackDrop,
      onTrackSetNameChange: handleTrackSetNameChange,
      onTrackSetBoundChannelChange: handleTrackSetBoundChannelChange,
      onTrackSetClearFile: handleTrackSetClearFile,
      onTrackSetRemove: handleTrackSetRemove
    },
    tracks: {
      setTrackSetStates,
      setTrackOrderModeByTrackSet,
      setSelectedTrackOrder,
      setFollowedTrack,
      computeTrackSummary
    },
    launch: {
      showInteractionWarning,
      isLaunchingViewer,
      hasGlobalTimepointMismatch,
      interactionErrorMessage,
      launchErrorMessage,
      onLaunchViewer: handleLaunchViewer,
      canLaunch
    },
    preprocess: {
      onPreprocessedStateChange: handlePreprocessedStateChange,
      datasetErrors,
      voxelResolution: voxelResolutionHook
    }
  });

  const routeViewerShell = createRouteViewerShellProps({
    viewer: {
      viewerMode,
      viewerPanels: {
        layers: viewerLayers,
        loading: {
          isLoading,
          loadingProgress: loadProgress,
          loadedVolumes: loadedCount,
          expectedVolumes: expectedVolumeCount
        },
        tracks: {
          trackScale: effectiveTrackScale,
          tracks: filteredTracks,
          trackVisibility,
          trackOpacityByTrackSet,
          trackLineWidthByTrackSet,
          trackColorModesByTrackSet,
          channelTrackOffsets,
          selectedTrackIds,
          followedTrackId,
          followedVoxel,
          onTrackSelectionToggle: handleTrackSelectionToggle,
          onTrackFollowRequest: handleTrackFollowFromViewerWithVoxelReset,
          onVoxelFollowRequest: handleVoxelFollowRequest,
          onHoverVoxelChange: handleHoverVoxelChange
        },
        runtimeDiagnostics: volumeProviderDiagnostics,
        canAdvancePlayback: canAdvancePlaybackToIndex,
        onRegisterReset: handleRegisterReset,
        onVolumeStepScaleChange: handleVolumeStepScaleChange,
        onRegisterVolumeStepScaleChange: handleRegisterVolumeStepScaleChange
      },
      vr: {
        isVrPassthroughSupported,
        trackChannels,
        onTrackChannelSelect: handleTrackSetSelect,
        onTrackVisibilityToggle: handleTrackVisibilityToggle,
        onTrackVisibilityAllChange: handleTrackVisibilityAllChange,
        onTrackOpacityChange: handleTrackOpacityChange,
        onTrackLineWidthChange: handleTrackLineWidthChange,
        onTrackColorSelect: handleTrackColorSelect,
        onTrackColorReset: handleTrackColorReset,
        onStopTrackFollow: handleStopTrackFollow,
        channelPanels: vrChannelPanels,
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
    },
    chrome: {
      topMenu: {
        onReturnToLauncher: handleReturnToLauncher,
        onResetLayout: handleResetWindowLayout,
        currentScaleLabel,
        hoveredVoxel: hoveredVolumeVoxel ?? lastHoveredVolumeVoxel,
        followedTrackSetId,
        followedTrackId,
        followedVoxel,
        onStopTrackFollow: handleStopTrackFollow,
        onStopVoxelFollow: handleStopVoxelFollow
      },
      layout: {
        resetToken: layoutResetToken,
        controlWindowInitialPosition,
        viewerSettingsWindowInitialPosition,
        layersWindowInitialPosition,
        paintbrushWindowInitialPosition,
        trackWindowInitialPosition,
        selectedTracksWindowInitialPosition,
        plotSettingsWindowInitialPosition,
        trackSettingsWindowInitialPosition
      },
      modeControls: {
        is3dModeAvailable: is3dViewerAvailable,
        isVrActive,
        isVrRequesting,
        resetViewHandler,
        onVrButtonClick: handleVrButtonClick,
        vrButtonDisabled,
        vrButtonTitle,
        vrButtonLabel,
        samplingMode: globalSamplingMode,
        onSamplingModeToggle: () => handleLayerSamplingModeToggle(),
        blendingMode,
        onBlendingModeToggle: handleBlendingModeToggle
      },
      playbackControls: {
        fps,
        onFpsChange: setFps,
        volumeTimepointCount,
        isPlaying,
        playbackLabel,
        selectedIndex,
        onTimeIndexChange: handleTimeIndexChange,
        playbackDisabled,
        onTogglePlayback: handleTogglePlayback,
        onJumpToStart: handleJumpToStart,
        onJumpToEnd: handleJumpToEnd,
        error,
        onStartRecording: handleStartRecording,
        onStopRecording: handleStopRecording,
        isRecording,
        canRecord,
      }
    },
    panels: {
      channelsPanel: {
        isPlaying,
        loadedChannelIds,
        channelNameMap,
        channelVisibility,
        channelTintMap,
        activeChannelId: activeChannelTabId,
        onChannelTabSelect: setActiveChannelTabId,
        onChannelVisibilityToggle: handleChannelVisibilityToggle,
        channelLayersMap,
        layerVolumesByKey: currentLayerVolumes,
        layerBrickAtlasesByKey: currentLayerBrickAtlases,
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
        onLayerRenderStyleChange: handleLayerRenderStyleChange,
        onLayerBlDensityScaleChange: handleLayerBlDensityScaleChange,
        onLayerBlBackgroundCutoffChange: handleLayerBlBackgroundCutoffChange,
        onLayerBlOpacityScaleChange: handleLayerBlOpacityScaleChange,
        onLayerBlEarlyExitAlphaChange: handleLayerBlEarlyExitAlphaChange,
        onLayerMipEarlyExitThresholdChange: handleLayerMipEarlyExitThresholdChange,
        onLayerInvertToggle: handleLayerInvertToggle
      },
      tracksPanel: {
        trackSets,
        activeTrackSetId,
        onTrackSetTabSelect: setActiveTrackSetId,
        parsedTracksByTrackSet,
        filteredTracksByTrackSet,
        minimumTrackLength,
        pendingMinimumTrackLength,
        trackLengthBounds,
        onMinimumTrackLengthChange: handleMinimumTrackLengthChange,
        onMinimumTrackLengthApply: handleMinimumTrackLengthApply,
        trackColorModesByTrackSet,
        trackOpacityByTrackSet,
        trackLineWidthByTrackSet,
        trackSummaryByTrackSet,
        followedTrackSetId,
        followedTrackId,
        onTrackOrderToggle: handleTrackOrderToggle,
        trackOrderModeByTrackSet,
        trackVisibility,
        onTrackVisibilityToggle: handleTrackVisibilityToggle,
        onTrackVisibilityAllChange: handleTrackVisibilityAllChange,
        onTrackOpacityChange: handleTrackOpacityChange,
        onTrackLineWidthChange: handleTrackLineWidthChange,
        onTrackColorSelect: handleTrackColorSelect,
        onTrackColorReset: handleTrackColorReset,
        onTrackSelectionToggle: handleTrackSelectionToggle,
        selectedTrackOrder,
        selectedTrackIds,
        onTrackFollow: handleTrackFollowWithVoxelReset,
        hasParsedTrackData
      },
      selectedTracksPanel: {
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
        onAmplitudeLimitsChange: handleSelectedTracksAmplitudeLimitsChange,
        onTimeLimitsChange: handleSelectedTracksTimeLimitsChange,
        onSmoothingChange: handleTrackSmoothingChange,
        onAutoRange: handleSelectedTracksAutoRange,
        onClearSelection: handleClearSelectedTracks
      },
      trackSettings: {
        isFullTrailEnabled: isFullTrackTrailEnabled,
        trailLength: trackTrailLength,
        onFullTrailToggle: handleTrackTrailModeChange,
        onTrailLengthChange: handleTrackTrailLengthChange
      }
    }
  });

  const { datasetSetupProps, viewerShellContainerProps } = useRouteViewerProps({
    datasetSetup: routeDatasetSetup,
    viewerShell: routeViewerShell
  });

  return {
    isViewerLaunched,
    datasetSetupProps,
    viewerRouteProps: {
      isViewerLaunched,
      viewerShellProps: viewerShellContainerProps
    }
  };
}
