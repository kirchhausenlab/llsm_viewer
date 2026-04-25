import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { NormalizedVolume } from '../../../core/volumeProcessing';
import type {
  LoadedDatasetLayer,
  StagedPreprocessedExperiment
} from '../../../hooks/dataset';
import type { LayerSettings } from '../../../state/layerSettings';
import { deriveChannelTrackOffsets } from '../../../state/channelTrackOffsets';
import {
  createLayerAutoThresholdRecord,
  createVolumeDerivedBrightnessState,
  createLayerDefaultSettingsRecord,
  createLayerDefaultSettingsFromLayer,
  layerBrightnessStatesMatch
} from './layerDefaults';
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
  createAllVisibleChannelVisibility,
  createInitialChannelVisibility
} from '../../../hooks/dataset/channelVisibility';
import {
  createVolumeProvider,
  DEFAULT_MAX_CACHED_CHUNK_BYTES,
  DEFAULT_MAX_CACHED_VOLUMES,
  DEFAULT_MAX_CONCURRENT_CHUNK_READS,
  DEFAULT_MAX_CONCURRENT_PREFETCH_LOADS
} from '../../../core/volumeProvider';
import { isSparseSegmentationLayerManifest } from '../../../shared/utils/preprocessedDataset/types';
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
import type { ViewerCameraNavigationSample } from '../../../hooks/useVolumeRenderSetup';
import {
  collectInitialHttpLaunchTrackedTargets
} from './initialHttpLaunch';
import { getTrackPlaybackIndexWindow, snapTimeIndexToWindow } from '../../../shared/utils';
import { clampPlaybackBufferFrames, DEFAULT_PLAYBACK_BUFFER_FRAMES } from '../../../shared/utils/viewerPlayback';
import { getNextVrCompatibleRenderStyle } from '../../../shared/utils/vrRenderStyle';
import type { AppRouteState } from '../../contracts/routes';

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

function getResolvedLoadedScaleLevel({
  layerKey,
  currentLayerVolumes,
  currentLayerPageTables,
  currentLayerBrickAtlases
}: {
  layerKey: string;
  currentLayerVolumes: Record<string, { scaleLevel?: number } | null>;
  currentLayerPageTables: Record<string, { scaleLevel?: number } | null>;
  currentLayerBrickAtlases: Record<string, { scaleLevel?: number } | null>;
}): number | null {
  const scaleLevel =
    currentLayerBrickAtlases[layerKey]?.scaleLevel ??
    currentLayerVolumes[layerKey]?.scaleLevel ??
    currentLayerPageTables[layerKey]?.scaleLevel ??
    null;
  return typeof scaleLevel === 'number' && Number.isFinite(scaleLevel) ? Number(scaleLevel) : null;
}

export type ProjectionMode = 'perspective' | 'orthographic';

export function normalizeProjectionModeForVr(
  projectionMode: ProjectionMode,
  isVrActive: boolean
): ProjectionMode {
  if (isVrActive && projectionMode === 'orthographic') {
    return 'perspective';
  }
  return projectionMode;
}

export function useAppRouteState(): AppRouteState {
  const {
    channels,
    setChannels,
    tracks,
    setTracks,
    setLayerTimepointCounts,
    setLayerTimepointCountErrors,
    channelIdRef,
    layerIdRef,
    trackSetIdRef,
    computeLayerTimepointCount,
    createChannelSource,
    createVolumeSource,
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
    layerSettings,
    setLayerSettings,
    layerAutoThresholds,
    setLayerAutoThresholds,
    getChannelDefaultColor,
    globalSamplingMode,
    setGlobalSamplingMode,
    globalBlDensityScale,
    setGlobalBlDensityScale,
    globalBlBackgroundCutoff,
    setGlobalBlBackgroundCutoff,
    globalBlOpacityScale,
    setGlobalBlOpacityScale,
    globalBlEarlyExitAlpha,
    setGlobalBlEarlyExitAlpha,
    globalMipEarlyExitThreshold,
    setGlobalMipEarlyExitThreshold,
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
  const loadedDatasetLayerByKey = useMemo(
    () => new Map(loadedDatasetLayers.map((layer) => [layer.key, layer])),
    [loadedDatasetLayers]
  );
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
    setTracks,
    loadedLayers: loadedDatasetLayers,
    layerSettings,
    setChannels,
    setLayerSettings,
    setLayerAutoThresholds,
    setLayerTimepointCounts,
    setLayerTimepointCountErrors,
    computeLayerTimepointCount,
    createChannelSource,
    createVolumeSource
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
  const [projectionMode, setProjectionMode] = useState<ProjectionMode>('perspective');
  const resetPreprocessedStateRef = useRef<() => void>(() => {});
  const hasScheduledOpfsCleanupRef = useRef(false);
  const [resetViewHandler, setResetViewHandler] = useState<(() => void) | null>(null);
  const [activeChannelTabId, setActiveChannelTabId] = useState<string | null>(null);
  const [hoveredVolumeVoxel, setHoveredVolumeVoxel] = useState<HoveredVoxelInfo | null>(null);
  const [followedVoxel, setFollowedVoxel] = useState<FollowedVoxelTarget | null>(null);
  const [lastHoveredVolumeVoxel, setLastHoveredVolumeVoxel] = useState<HoveredVoxelInfo | null>(null);
  const [viewerCameraSample, setViewerCameraSample] = useState<ViewerCameraNavigationSample | null>(null);
  const initializedPreprocessedLayerDefaultsRef = useRef<StagedPreprocessedExperiment | null>(null);
  const initialHttpLaunchScaleTargetsRef = useRef<Map<string, number>>(new Map());
  const initialHttpLaunchObservationDoneRef = useRef(false);
  const [isInitialHttpLaunchLoading, setIsInitialHttpLaunchLoading] = useState(false);
  const playback = useViewerPlayback();
  const { selectedIndex, setSelectedIndex, isPlaying, fps, setFps, stopPlayback, setIsPlaying } = playback;
  const [playbackBufferFrames, setPlaybackBufferFrames] = useState(DEFAULT_PLAYBACK_BUFFER_FRAMES);
  const [isPlaybackStartPending, setIsPlaybackStartPending] = useState(false);
  const [zSliderValue, setZSliderValue] = useState(1);
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
  const createLayerDefaultSettings = useCallback(
    (layerKey: string): LayerSettings =>
      createLayerDefaultSettingsFromLayer({
        layer: loadedDatasetLayerByKey.get(layerKey) ?? null,
        getChannelDefaultColor,
        globalSamplingMode,
        globalBlDensityScale,
        globalBlBackgroundCutoff,
        globalBlOpacityScale,
        globalBlEarlyExitAlpha,
        globalMipEarlyExitThreshold
      }),
    [
      getChannelDefaultColor,
      globalBlBackgroundCutoff,
      globalBlDensityScale,
      globalBlEarlyExitAlpha,
      globalBlOpacityScale,
      globalMipEarlyExitThreshold,
      globalSamplingMode,
      loadedDatasetLayerByKey
    ]
  );
  const handleLaunchLayerVolumesResolved = useCallback(
    (loadedVolumes: Record<string, NormalizedVolume | null>) => {
      const derivedByLayerKey = new Map<
        string,
        ReturnType<typeof createVolumeDerivedBrightnessState>
      >();
      for (const layer of loadedDatasetLayers) {
        const volume = loadedVolumes[layer.key] ?? null;
        if (!volume) {
          continue;
        }
        derivedByLayerKey.set(layer.key, createVolumeDerivedBrightnessState(volume));
      }

      if (derivedByLayerKey.size === 0) {
        return;
      }

      setLayerSettings((current) => {
        let changed = false;
        const next: Record<string, LayerSettings> = { ...current };
        for (const layer of loadedDatasetLayers) {
          const derived = derivedByLayerKey.get(layer.key);
          if (!derived) {
            continue;
          }
          const defaultSettings = createLayerDefaultSettings(layer.key);
          const previous = current[layer.key] ?? defaultSettings;
          if (!layerBrightnessStatesMatch(previous, defaultSettings)) {
            continue;
          }
          if (layerBrightnessStatesMatch(previous, derived.brightnessState)) {
            continue;
          }
          next[layer.key] = {
            ...previous,
            ...derived.brightnessState
          };
          changed = true;
        }
        return changed ? next : current;
      });

      setLayerAutoThresholds((current) => {
        let changed = false;
        const next = { ...current };
        for (const layer of loadedDatasetLayers) {
          const derived = derivedByLayerKey.get(layer.key);
          if (!derived || derived.autoThreshold <= 0) {
            continue;
          }
          if ((current[layer.key] ?? 0) !== 0) {
            continue;
          }
          next[layer.key] = derived.autoThreshold;
          changed = true;
        }
        return changed ? next : current;
      });
    },
    [createLayerDefaultSettings, loadedDatasetLayers, setLayerAutoThresholds, setLayerSettings]
  );

  const {
    layoutResetToken,
    layersWindowInitialPosition,
    cameraWindowInitialPosition,
    cameraSettingsWindowInitialPosition,
    paintbrushWindowInitialPosition,
    drawRoiWindowInitialPosition,
    propsWindowInitialPosition,
    roiManagerWindowInitialPosition,
    trackWindowInitialPosition,
    viewerSettingsWindowInitialPosition,
    recordWindowInitialPosition,
    selectedTracksWindowInitialPosition,
    plotSettingsWindowInitialPosition,
    trackSettingsWindowInitialPosition,
    measurementsWindowInitialPosition,
    setMeasurementsWindowInitialPosition,
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
    isPerformanceMode,
    resetLaunchState,
    beginLaunchSession,
    setLaunchExpectedVolumeCount,
    setLaunchProgress,
    completeLaunchSession,
    failLaunchSession,
    finishLaunchSessionAttempt,
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

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    if (!import.meta.env?.DEV) {
      return;
    }

    const manifest = preprocessedExperiment?.manifest ?? null;
    window.__LLSM_PREPROCESSED_MANIFEST__ = manifest;
    return () => {
      if (window.__LLSM_PREPROCESSED_MANIFEST__ === manifest) {
        delete window.__LLSM_PREPROCESSED_MANIFEST__;
      }
    };
  }, [preprocessedExperiment]);

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
    trackHeadersByTrackSet,
    parsedTracksByTrackSet,
    compiledPayloadByTrackSet,
    ensureCompiledCatalogsLoaded,
    ensureCompiledPayloadsLoaded,
    trackLookup,
    filteredTracksByTrackSet,
    renderTracks,
    trackSetStates,
    selectedTrackOrder,
    selectedTrackSeries,
    amplitudeExtent,
    timeExtent,
    resolvedAmplitudeLimits,
    resolvedTimeLimits,
    trackLengthBounds,
    trackOpacityByTrackSet,
    trackLineWidthByTrackSet,
    trackColorModesByTrackSet,
    isFullTrackTrailEnabled,
    trackTrailLength,
    drawTrackCentroids,
    drawTrackStartingPoints,
    followedTrackId,
    followedTrackSetId,
    handleAddTrackSet,
    handleTrackFilesAdded,
    handleTrackDrop,
    handleTrackSetNameChange,
    handleTrackSetBoundChannelChange,
    handleTrackSetTimepointConventionChange,
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
    handleDrawTrackCentroidsToggle,
    handleDrawTrackStartingPointsToggle,
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
    setProjectionMode('perspective');
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

  const followedTrackPlaybackWindow = useMemo(() => {
    if (followedTrackId === null) {
      return null;
    }
    const track = trackLookup.get(followedTrackId) ?? null;
    return getTrackPlaybackIndexWindow(track, volumeTimepointCount);
  }, [followedTrackId, trackLookup, volumeTimepointCount]);
  const resolvedSelectedIndex = useMemo(
    () => snapTimeIndexToWindow(selectedIndex, volumeTimepointCount, followedTrackPlaybackWindow),
    [followedTrackPlaybackWindow, selectedIndex, volumeTimepointCount]
  );
  const resolvedPlaybackLabel = useMemo(() => {
    if (volumeTimepointCount === 0) {
      return '0 / 0';
    }
    const currentFrame = Math.min(resolvedSelectedIndex + 1, volumeTimepointCount);
    return `${currentFrame} / ${volumeTimepointCount}`;
  }, [resolvedSelectedIndex, volumeTimepointCount]);

  const {
    currentLayerResidencyDecisions,
    currentLayerVolumes,
    currentLayerPageTables,
    currentLayerBrickAtlases,
    currentBackgroundMasksByScale,
    playbackWarmupFrames,
    playbackWarmupTimeIndex,
    playbackWarmupLayerVolumes,
    playbackWarmupLayerPageTables,
    playbackWarmupLayerBrickAtlases,
    playbackWarmupBackgroundMasksByScale,
    volumeProviderDiagnostics,
    lodPolicyDiagnostics,
    setCurrentLayerVolumes,
    playbackLayerKeys,
    playbackResidencyDecisionByLayerKey,
    playbackAtlasScaleLevelByLayerKey,
    handleLaunchViewer: handleRouteLaunchViewer
  } = useRouteLayerVolumes({
    isViewerLaunched,
    isLaunchingViewer,
    isPerformanceMode,
    isPlaying,
    isPlaybackStartPending,
    preprocessedExperiment,
    volumeProvider,
    loadedChannelIds,
    channelLayersMap,
    channelVisibility,
    layerChannelMap,
    preferBrickResidency,
    projectionMode,
    viewerCameraSample,
    volumeTimepointCount,
    playbackBufferFrameCount: playbackBufferFrames,
    selectedIndex: resolvedSelectedIndex,
    playbackWindow: followedTrackPlaybackWindow,
    clearDatasetError,
    beginLaunchSession,
    setLaunchExpectedVolumeCount,
    setLaunchProgress,
    completeLaunchSession,
    failLaunchSession,
    finishLaunchSessionAttempt,
    setSelectedIndex,
    setIsPlaying,
    showLaunchError,
    onLaunchLayerVolumesResolved: handleLaunchLayerVolumesResolved
  });
  useEffect(() => {
    if (!isViewerLaunched) {
      return;
    }
    handleLaunchLayerVolumesResolved(currentLayerVolumes);
  }, [currentLayerVolumes, handleLaunchLayerVolumesResolved, isViewerLaunched]);
  const handleLaunchViewer = useCallback(
    () => handleRouteLaunchViewer({ performanceMode: false }),
    [handleRouteLaunchViewer]
  );
  const handleLaunchViewerInPerformanceMode = useCallback(
    () => handleRouteLaunchViewer({ performanceMode: true }),
    [handleRouteLaunchViewer]
  );
  const layerDownsampleFactorByLevelByKey = useMemo(() => {
    const byLayer = new Map<string, Map<number, [number, number, number]>>();
    const manifest = preprocessedExperiment?.manifest;
    if (!manifest) {
      return byLayer;
    }
    for (const channel of manifest.dataset.channels) {
      for (const layer of channel.layers) {
        const byLevel = new Map<number, [number, number, number]>();
        const scales = isSparseSegmentationLayerManifest(layer) ? layer.sparse.scales : layer.zarr.scales;
        for (const scale of scales) {
          byLevel.set(scale.level, scale.downsampleFactor);
        }
        byLayer.set(layer.key, byLevel);
      }
    }
    return byLayer;
  }, [preprocessedExperiment?.manifest]);
  const finestScaleLevelByLayerKey = useMemo(() => {
    const byLayer = new Map<string, number>();
    const manifest = preprocessedExperiment?.manifest;
    if (!manifest) {
      return byLayer;
    }
    for (const channel of manifest.dataset.channels) {
      for (const layer of channel.layers) {
        const scales = isSparseSegmentationLayerManifest(layer) ? layer.sparse.scales : layer.zarr.scales;
        const levels = scales
          .map((scale) => scale.level)
          .filter((level) => Number.isFinite(level));
        if (levels.length === 0) {
          continue;
        }
        byLayer.set(layer.key, Math.min(...levels));
      }
    }
    return byLayer;
  }, [preprocessedExperiment?.manifest]);
  const currentScaleLabel = useMemo(() => {
    if (!isViewerLaunched || playbackLayerKeys.length === 0) {
      return '—';
    }

    const policyScaleByLayerKey = new Map<string, number>();
    for (const layer of lodPolicyDiagnostics?.layers ?? []) {
      if (Number.isFinite(layer.activeScaleLevel)) {
        policyScaleByLayerKey.set(layer.layerKey, Number(layer.activeScaleLevel));
      }
    }

    const loadedScaleEntries = playbackLayerKeys
      .map((layerKey) => {
        const policyScaleLevel = policyScaleByLayerKey.get(layerKey);
        const loadedScaleLevel =
          currentLayerBrickAtlases[layerKey]?.scaleLevel ??
          currentLayerVolumes[layerKey]?.scaleLevel ??
          null;
        const scaleLevel =
          loadedScaleLevel !== null && Number.isFinite(loadedScaleLevel)
            ? Number(loadedScaleLevel)
            : policyScaleLevel ?? null;
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
    lodPolicyDiagnostics,
    playbackLayerKeys
  ]);
  useEffect(() => {
    if (!isViewerLaunched || preprocessedExperiment?.storageHandle.backend !== 'http') {
      initialHttpLaunchScaleTargetsRef.current.clear();
      initialHttpLaunchObservationDoneRef.current = false;
      setIsInitialHttpLaunchLoading(false);
      return;
    }

    const trackedTargets = initialHttpLaunchScaleTargetsRef.current;
    const visibleLoadedLayerKeys = playbackLayerKeys.filter(
      (layerKey) =>
        getResolvedLoadedScaleLevel({
          layerKey,
          currentLayerVolumes,
          currentLayerPageTables,
          currentLayerBrickAtlases
        }) !== null
    );

    if (!initialHttpLaunchObservationDoneRef.current) {
      if (visibleLoadedLayerKeys.length === 0) {
        return;
      }
      trackedTargets.clear();
      const trackedTargetsByLayerKey = collectInitialHttpLaunchTrackedTargets({
        layerKeys: playbackLayerKeys,
        loadedScaleLevelByLayerKey: Object.fromEntries(
          playbackLayerKeys.map((layerKey) => [
            layerKey,
            getResolvedLoadedScaleLevel({
              layerKey,
              currentLayerVolumes,
              currentLayerPageTables,
              currentLayerBrickAtlases
            })
          ])
        ),
        desiredScaleLevelByLayerKey: playbackAtlasScaleLevelByLayerKey,
        finestScaleLevelByLayerKey
      });
      for (const [layerKey, targetScaleLevel] of trackedTargetsByLayerKey.entries()) {
        trackedTargets.set(layerKey, targetScaleLevel);
      }
      initialHttpLaunchObservationDoneRef.current = true;
      setIsInitialHttpLaunchLoading(trackedTargets.size > 0);
      if (trackedTargets.size === 0) {
        return;
      }
    }

    if (trackedTargets.size === 0) {
      setIsInitialHttpLaunchLoading(false);
      return;
    }

    const stillPending = [...trackedTargets.entries()].some(([layerKey, targetScaleLevel]) => {
      const loadedScaleLevel = getResolvedLoadedScaleLevel({
        layerKey,
        currentLayerVolumes,
        currentLayerPageTables,
        currentLayerBrickAtlases
      });
      return loadedScaleLevel === null || loadedScaleLevel > targetScaleLevel;
    });

    if (stillPending) {
      setIsInitialHttpLaunchLoading(true);
      return;
    }

    trackedTargets.clear();
    setIsInitialHttpLaunchLoading(false);
  }, [
    currentLayerBrickAtlases,
    currentLayerPageTables,
    currentLayerVolumes,
    finestScaleLevelByLayerKey,
    isViewerLaunched,
    playbackAtlasScaleLevelByLayerKey,
    playbackLayerKeys,
    preprocessedExperiment?.storageHandle.backend
  ]);
  const initialScaleWarningMessage = isInitialHttpLaunchLoading ? 'temporary scale' : null;
  const { canAdvancePlaybackToIndex } = useRoutePlaybackPrefetch({
    isViewerLaunched,
    isPlaying,
    fps,
    playbackResidencyDecisionByLayerKey,
    playbackWarmupFrames,
    volumeProvider,
    volumeTimepointCount,
    playbackLayerKeys,
    selectedIndex: resolvedSelectedIndex
  });

  const {
    viewerControls,
    playbackDisabled,
    handleTogglePlayback,
    handleTimeIndexChange
  } = useViewerModePlayback({
    playback,
    is3dViewerAvailable,
    onBeforeEnterVr: handleBeforeEnterVr,
    onViewerModeChange: resetHoveredVoxel,
    volumeTimepointCount,
    isLoading,
    isPlaybackStartPending,
    bufferBeforePlayDefault: true,
    onPlaybackStartRequest: () => {
      setIsPlaybackStartPending(true);
    },
    onPlaybackStartCancel: () => setIsPlaybackStartPending(false),
    playbackWindow: followedTrackPlaybackWindow
  });

  useEffect(() => {
    if (!playbackDisabled) {
      return;
    }
    setIsPlaybackStartPending(false);
    setIsPlaying(false);
  }, [playbackDisabled]);
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const buildPlaybackDebugSummary = () => ({
      isViewerLaunched,
      isPlaying,
      isPlaybackStartPending,
      playbackDisabled,
      playbackBufferFrames,
      selectedIndex: resolvedSelectedIndex,
      volumeTimepointCount,
      loadedChannelIds,
      playbackLayerKeys,
      playbackWarmupFrameCount: playbackWarmupFrames.length,
    });
    (window as Window & { __LLSM_ROUTE_PLAYBACK_DEBUG__?: (() => unknown) | null }).__LLSM_ROUTE_PLAYBACK_DEBUG__ =
      buildPlaybackDebugSummary;
    return () => {
      if (
        (window as Window & { __LLSM_ROUTE_PLAYBACK_DEBUG__?: (() => unknown) | null }).__LLSM_ROUTE_PLAYBACK_DEBUG__ ===
        buildPlaybackDebugSummary
      ) {
        delete (window as Window & { __LLSM_ROUTE_PLAYBACK_DEBUG__?: (() => unknown) | null }).__LLSM_ROUTE_PLAYBACK_DEBUG__;
      }
    };
  }, [
    isPlaybackStartPending,
    isPlaying,
    isViewerLaunched,
    loadedChannelIds,
    playbackBufferFrames,
    playbackDisabled,
    playbackLayerKeys,
    playbackWarmupFrames.length,
    resolvedSelectedIndex,
    volumeTimepointCount,
  ]);

  const canRecord = volumeTimepointCount > 0 && !isLoading;

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
    setProjectionMode((current) => normalizeProjectionModeForVr(current, isVrActive));
  }, [isVrActive]);

  const handleProjectionModeChange = useCallback(
    (nextProjectionMode: ProjectionMode) => {
      setProjectionMode((current) => {
        if (isVrActive && nextProjectionMode === 'orthographic') {
          return 'perspective';
        }
        return current === nextProjectionMode ? current : nextProjectionMode;
      });
    },
    [isVrActive]
  );

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
  const lastViewerCameraSampleRef = useRef<ViewerCameraNavigationSample | null>(null);
  const handleViewerCameraNavigationSample = useCallback((sample: ViewerCameraNavigationSample) => {
    const normalizedDistance = Number.isFinite(sample.distanceToTarget)
      ? Math.max(0, sample.distanceToTarget)
      : Number.NaN;
    const normalizedProjectedPixels = Number.isFinite(sample.projectedPixelsPerVoxel)
      ? Math.max(0, sample.projectedPixelsPerVoxel)
      : Number.NaN;
    if (!Number.isFinite(normalizedDistance) || !Number.isFinite(normalizedProjectedPixels)) {
      return;
    }

    const capturedAtMs =
      Number.isFinite(sample.capturedAtMs) && sample.capturedAtMs > 0 ? sample.capturedAtMs : Date.now();
    const nextSample: ViewerCameraNavigationSample = {
      projectionMode: sample.projectionMode,
      distanceToTarget: normalizedDistance,
      projectedPixelsPerVoxel: normalizedProjectedPixels,
      isMoving: Boolean(sample.isMoving),
      capturedAtMs
    };

    const previous = lastViewerCameraSampleRef.current;
    const elapsedMs = previous ? capturedAtMs - previous.capturedAtMs : Number.POSITIVE_INFINITY;
    const absoluteDelta = previous
      ? Math.abs(previous.distanceToTarget - nextSample.distanceToTarget)
      : Number.POSITIVE_INFINITY;
    const projectedPixelsDelta = previous
      ? Math.abs(previous.projectedPixelsPerVoxel - nextSample.projectedPixelsPerVoxel)
      : Number.POSITIVE_INFINITY;
    const relativeDelta =
      previous && previous.distanceToTarget > 1e-6
        ? absoluteDelta / previous.distanceToTarget
        : absoluteDelta;
    const relativeProjectedDelta =
      previous && previous.projectedPixelsPerVoxel > 1e-6
        ? projectedPixelsDelta / previous.projectedPixelsPerVoxel
        : projectedPixelsDelta;
    const movementChanged = previous ? previous.isMoving !== nextSample.isMoving : true;
    const projectionChanged = previous ? previous.projectionMode !== nextSample.projectionMode : true;
    const minIntervalMs = nextSample.isMoving ? 100 : 250;

    if (
      !movementChanged &&
      !projectionChanged &&
      elapsedMs < minIntervalMs &&
      absoluteDelta < 0.03 &&
      relativeDelta < 0.08 &&
      projectedPixelsDelta < 0.05 &&
      relativeProjectedDelta < 0.08
    ) {
      return;
    }

    lastViewerCameraSampleRef.current = nextSample;
    setViewerCameraSample(nextSample);
  }, []);

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
    isVrActive,
    loadedChannelIds,
    channelNameMap,
    channelLayersMap,
    channelVisibility,
    layerSettings,
    currentLayerVolumes,
    createLayerDefaultSettings
  });

  const channelTrackOffsets = useMemo(
    () =>
      deriveChannelTrackOffsets({
        channels,
        channelLayersMap,
        layerSettings
      }),
    [channelLayersMap, channels, layerSettings]
  );
  const {
    handleStartExperimentSetup,
    handleAddChannel,
    handleAddSegmentationChannel,
    handleChannelNameChange,
    handleRemoveChannel
  } = useRouteDatasetSetupState({
    channels,
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
    setLayerTimepointCounts,
    setLayerTimepointCountErrors
  });
  const { handleReturnToFrontPage } = useRouteDatasetResetState({
    resetPreprocessedState,
    setPreprocessedExperiment,
    setChannels,
    setTracks,
    setChannelVisibility,
    setLayerSettings,
    setLayerAutoThresholds,
    setCurrentLayerVolumes,
    setSelectedIndex,
    setZSliderValue,
    resetChannelEditingState,
    setActiveChannelTabId,
    resetTrackState,
    resetLaunchState,
    setIsExperimentSetupStarted,
    setHoveredVolumeVoxel,
    setLastHoveredVolumeVoxel,
    setFollowedVoxel,
    setViewerCameraSample,
    setResetViewHandler,
    channelIdRef,
    layerIdRef,
    trackSetIdRef,
    clearDatasetError
  });
  const handleReturnToLauncher = useCallback(() => {
    if (typeof window !== 'undefined') {
      const confirmed = window.confirm(
        'Do you really want to return? The current session will be discarded'
      );
      if (!confirmed) {
        return;
      }
    }

    volumeProvider?.clear();
    handleReturnToFrontPage();
  }, [handleReturnToFrontPage, volumeProvider]);
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
    if (!preprocessedExperiment) {
      initializedPreprocessedLayerDefaultsRef.current = null;
      return;
    }
    if (initializedPreprocessedLayerDefaultsRef.current === preprocessedExperiment) {
      return;
    }
    initializedPreprocessedLayerDefaultsRef.current = preprocessedExperiment;
    setLayerSettings(
      createLayerDefaultSettingsRecord({
        layers: loadedDatasetLayers,
        getChannelDefaultColor,
        globalSamplingMode,
        globalBlDensityScale,
        globalBlBackgroundCutoff,
        globalBlOpacityScale,
        globalBlEarlyExitAlpha,
        globalMipEarlyExitThreshold
      })
    );
    setLayerAutoThresholds(createLayerAutoThresholdRecord(loadedDatasetLayers));
  }, [
    getChannelDefaultColor,
    globalBlBackgroundCutoff,
    globalBlDensityScale,
    globalBlEarlyExitAlpha,
    globalBlOpacityScale,
    globalMipEarlyExitThreshold,
    globalSamplingMode,
    loadedDatasetLayers,
    preprocessedExperiment,
    setLayerAutoThresholds,
    setLayerSettings
  ]);

  useEffect(() => {
    if (!preprocessedExperiment) {
      return;
    }

    const initialVisibility =
      preprocessedExperiment.storageHandle.backend === 'http'
        ? createAllVisibleChannelVisibility(loadedDatasetLayers)
        : createInitialChannelVisibility(loadedDatasetLayers);
    setChannelVisibility((current) => {
      const initialChannelIds = Object.keys(initialVisibility);
      if (
        Object.keys(current).length === initialChannelIds.length &&
        initialChannelIds.every((channelId) => current[channelId] === initialVisibility[channelId])
      ) {
        return current;
      }
      return initialVisibility;
    });
    setActiveChannelTabId(loadedChannelIds[0] ?? null);
  }, [loadedChannelIds, loadedDatasetLayers, preprocessedExperiment, setChannelVisibility]);

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

  const handleBlendingModeToggle = useCallback(() => {
    setBlendingMode((current) => (current === 'additive' ? 'alpha' : 'additive'));
  }, []);

  const {
    viewerLayers,
    viewerPlaybackWarmupLayers,
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
    handleLayerBlDensityScaleChange,
    handleLayerBlBackgroundCutoffChange,
    handleLayerBlOpacityScaleChange,
    handleLayerBlEarlyExitAlphaChange,
    handleLayerMipEarlyExitThresholdChange,
    handleLayerSamplingModeToggle,
    handleLayerInvertToggle
  } = useLayerControls({
    layers: loadedDatasetLayers,
    isVrActive,
    selectedIndex: resolvedSelectedIndex,
    isPlaying,
    layerVolumes: currentLayerVolumes,
    layerPageTables: currentLayerPageTables,
    layerBrickAtlases: currentLayerBrickAtlases,
    backgroundMasksByScale: currentBackgroundMasksByScale,
    playbackWarmupFrames,
    playbackWarmupTimeIndex,
    playbackWarmupLayerVolumes,
    playbackWarmupLayerPageTables,
    playbackWarmupLayerBrickAtlases,
    playbackWarmupBackgroundMasksByScale,
    loadVolume: volumeProvider ? volumeProvider.getVolume : null,
    layerAutoThresholds,
    setLayerAutoThresholds,
    createLayerDefaultSettings,
    createLayerDefaultBrightnessState,
    layerSettings,
    setLayerSettings,
    setChannelVisibility,
    channelVisibility,
    channelNameMap,
    layerChannelMap,
    loadedChannelIds,
    setActiveChannelTabId,
    setGlobalSamplingMode,
    setGlobalBlDensityScale,
    setGlobalBlBackgroundCutoff,
    setGlobalBlOpacityScale,
    setGlobalBlEarlyExitAlpha,
    setGlobalMipEarlyExitThreshold
  });

  const handleVrLayerRenderStyleToggle = useCallback(
    (layerKey?: string) => {
      if (!layerKey) {
        return;
      }

      const targetLayer = loadedDatasetLayers.find((layer) => layer.key === layerKey);
      if (!targetLayer) {
        return;
      }

      const currentSettings = layerSettings[layerKey] ?? createLayerDefaultSettings(layerKey);
      const nextStyle = getNextVrCompatibleRenderStyle(currentSettings, targetLayer.isSegmentation);
      if (!nextStyle) {
        return;
      }

      handleLayerRenderStyleChange(layerKey, nextStyle.renderStyle, nextStyle.samplingMode);
    },
    [
      createLayerDefaultSettings,
      handleLayerRenderStyleChange,
      layerSettings,
      loadedDatasetLayers,
    ]
  );

  const zSliderMax = useMemo(() => {
    let depth = 1;
    for (const layer of viewerLayers) {
      const resolvedDepth = Math.max(
        layer.fullResolutionDepth,
        layer.volume?.depth ?? 0,
        layer.brickAtlas?.pageTable.volumeShape[0] ?? 0
      );
      if (!Number.isFinite(resolvedDepth) || resolvedDepth <= 1) {
        continue;
      }
      depth = Math.max(depth, Math.floor(resolvedDepth));
    }
    return Math.max(1, depth);
  }, [viewerLayers]);
  useEffect(() => {
    setZSliderValue((current) => {
      const clamped = Math.min(Math.max(Math.round(current), 1), zSliderMax);
      return clamped === current ? current : clamped;
    });
  }, [zSliderMax]);
  const handleZSliderChange = useCallback(
    (nextValue: number) => {
      if (!Number.isFinite(nextValue)) {
        return;
      }
      setZSliderValue((current) => {
        const clamped = Math.min(Math.max(Math.round(nextValue), 1), zSliderMax);
        return clamped === current ? current : clamped;
      });
    },
    [zSliderMax]
  );
  const zClipFrontFraction = useMemo(() => {
    if (zSliderMax <= 1) {
      return 0;
    }
    const clamped = Math.min(Math.max(zSliderValue, 1), zSliderMax);
    return (clamped - 1) / (zSliderMax - 1);
  }, [zSliderMax, zSliderValue]);

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
      onTrackSetTimepointConventionChange: handleTrackSetTimepointConventionChange,
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
      onLaunchViewerInPerformanceMode: handleLaunchViewerInPerformanceMode,
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
      loadMeasurementVolume: volumeProvider ? volumeProvider.getVolume : null,
      viewerPanels: {
        layers: viewerLayers,
        playbackWarmupLayers: viewerPlaybackWarmupLayers,
        playbackWarmupFrames,
        zClipFrontFraction,
        loading: {
          isLoading,
          loadingProgress: loadProgress,
          loadedVolumes: loadedCount,
          expectedVolumes: expectedVolumeCount
        },
        tracks: {
          trackScale: effectiveTrackScale,
          tracks: renderTracks,
          compiledTrackPayloadByTrackSet: compiledPayloadByTrackSet,
          onRequireTrackPayloads: ensureCompiledPayloadsLoaded,
          trackSetStates,
          trackOpacityByTrackSet,
          trackLineWidthByTrackSet,
          trackColorModesByTrackSet,
          channelTrackOffsets,
          selectedTrackIds,
          followedTrackId,
          followedVoxel,
          playbackWindow: followedTrackPlaybackWindow,
          onTrackSelectionToggle: handleTrackSelectionToggle,
          onTrackFollowRequest: handleTrackFollowFromViewerWithVoxelReset,
          onVoxelFollowRequest: handleVoxelFollowRequest,
          onHoverVoxelChange: handleHoverVoxelChange
        },
        runtimeDiagnostics: volumeProviderDiagnostics,
        lodPolicyDiagnostics,
        residencyDecisions: currentLayerResidencyDecisions,
        canAdvancePlayback: canAdvancePlaybackToIndex,
        onRegisterReset: handleRegisterReset,
        onVolumeStepScaleChange: handleVolumeStepScaleChange,
        onRegisterVolumeStepScaleChange: handleRegisterVolumeStepScaleChange,
        onCameraNavigationSample: handleViewerCameraNavigationSample,
        temporalResolution: preprocessedExperiment?.manifest.dataset.temporalResolution ?? null,
        voxelResolution: preprocessedExperiment?.manifest.dataset.voxelResolution ?? null
      },
      vr: {
        isVrActive,
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
        onLayerSelect: handleLayerSelect,
        onLayerSoloToggle: handleLayerSoloToggle,
        onLayerContrastChange: handleLayerContrastChange,
        onLayerBrightnessChange: handleLayerBrightnessChange,
        onLayerWindowMinChange: handleLayerWindowMinChange,
        onLayerWindowMaxChange: handleLayerWindowMaxChange,
        onLayerAutoContrast: handleLayerAutoContrast,
        onLayerOffsetChange: handleLayerOffsetChange,
        onLayerColorChange: handleLayerColorChange,
        onLayerRenderStyleToggle: handleVrLayerRenderStyleToggle,
        onLayerSamplingModeToggle: handleLayerSamplingModeToggle,
        onLayerInvertToggle: handleLayerInvertToggle,
        onLayerBlDensityScaleChange: handleLayerBlDensityScaleChange,
        onLayerBlBackgroundCutoffChange: handleLayerBlBackgroundCutoffChange,
        onLayerBlOpacityScaleChange: handleLayerBlOpacityScaleChange,
        onLayerBlEarlyExitAlphaChange: handleLayerBlEarlyExitAlphaChange,
        onLayerMipEarlyExitThresholdChange: handleLayerMipEarlyExitThresholdChange,
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
        initialScaleWarningMessage,
        isPerformanceMode,
        hoveredVoxel: hoveredVolumeVoxel ?? lastHoveredVolumeVoxel,
        followedTrackSetId,
        followedTrackId,
        followedVoxel,
        onStopTrackFollow: handleStopTrackFollow,
        onStopVoxelFollow: handleStopVoxelFollow
      },
      layout: {
        resetToken: layoutResetToken,
        cameraWindowInitialPosition,
        cameraSettingsWindowInitialPosition,
        viewerSettingsWindowInitialPosition,
        recordWindowInitialPosition,
        layersWindowInitialPosition,
        paintbrushWindowInitialPosition,
        drawRoiWindowInitialPosition,
        propsWindowInitialPosition,
        roiManagerWindowInitialPosition,
        trackWindowInitialPosition,
        selectedTracksWindowInitialPosition,
        plotSettingsWindowInitialPosition,
        trackSettingsWindowInitialPosition,
        measurementsWindowInitialPosition,
        setMeasurementsWindowInitialPosition,
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
        projectionMode: normalizeProjectionModeForVr(projectionMode, isVrActive),
        onProjectionModeChange: handleProjectionModeChange,
        samplingMode: globalSamplingMode,
        onSamplingModeToggle: () => handleLayerSamplingModeToggle(),
        blendingMode,
        onBlendingModeToggle: handleBlendingModeToggle
      },
      playbackControls: {
        fps,
        onFpsChange: setFps,
        playbackBufferFrames,
        onPlaybackBufferFramesChange: (value: number) => setPlaybackBufferFrames(clampPlaybackBufferFrames(value)),
        isPlaybackStartPending,
        onBufferedPlaybackStart: () => {
          setIsPlaybackStartPending(false);
          setIsPlaying(true);
        },
        zSliderValue,
        zSliderMax,
        onZSliderChange: handleZSliderChange,
        volumeTimepointCount,
        isPlaying,
        playbackLabel: resolvedPlaybackLabel,
        selectedIndex: resolvedSelectedIndex,
        onTimeIndexChange: handleTimeIndexChange,
        playbackDisabled,
        onTogglePlayback: handleTogglePlayback,
        error,
        onTakeScreenshot: () => {},
        canTakeScreenshot: canRecord,
        onRecordingPrimaryAction: () => {},
        onStopRecording: () => {},
        recordingStatus: 'idle',
        countdownSeconds: 0,
        onCountdownSecondsChange: (_value: number) => {},
        countdownRemainingSeconds: null,
        isRecording: false,
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
        layerSettings,
        getLayerDefaultSettings: createLayerDefaultSettings,
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
        trackHeadersByTrackSet,
        activeTrackSetId,
        onTrackSetTabSelect: setActiveTrackSetId,
        onRequireTrackCatalog: (trackSetId: string) => ensureCompiledCatalogsLoaded([trackSetId]),
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
        trackSetStates,
        followedTrackSetId,
        followedTrackId,
        onTrackOrderToggle: handleTrackOrderToggle,
        trackOrderModeByTrackSet,
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
        currentTimepoint: resolvedSelectedIndex,
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
        drawCentroids: drawTrackCentroids,
        drawStartingPoints: drawTrackStartingPoints,
        onFullTrailToggle: handleTrackTrailModeChange,
        onTrailLengthChange: handleTrackTrailLengthChange,
        onDrawCentroidsToggle: handleDrawTrackCentroidsToggle,
        onDrawStartingPointsToggle: handleDrawTrackStartingPointsToggle
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
