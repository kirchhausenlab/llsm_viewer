import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type {
  LoadedDatasetLayer,
  StagedPreprocessedExperiment
} from '../../../hooks/dataset';
import { useDatasetSetup } from '../../../hooks/dataset';
import { useTrackState } from '../../../hooks/tracks';
import { useChannelLayerStateContext } from '../../../hooks/useChannelLayerState';
import {
  createAllVisibleChannelVisibility,
  createInitialChannelVisibility
} from '../../../hooks/dataset/channelVisibility';
import {
  clearOpfsPreprocessedStorageRoot,
  PREPROCESSED_STORAGE_ROOT_DIR
} from '../../../shared/storage/preprocessedStorage';
import {
  createLayerAutoThresholdRecord,
  createLayerDefaultSettingsRecord
} from './layerDefaults';
import { computeTrackSummary } from '../../../shared/utils/trackSummary';
import { WARNING_WINDOW_WIDTH, WINDOW_MARGIN } from '../../../shared/utils/windowLayout';
import useChannelEditing from './useChannelEditing';
import { createRouteDatasetSetupProps } from './routeDatasetSetupProps';
import { useRouteDatasetSetupState } from './useRouteDatasetSetupState';
import { useRouteLaunchSessionState } from './useRouteLaunchSessionState';
import type { AppRouteState, ViewerLaunchRequest, ViewerRouteStateInput } from './viewerRouteStateTypes';

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
  const [isExperimentSetupStarted, setIsExperimentSetupStarted] = useState(false);
  const [, setViewerMode] = useState<'3d'>('3d');
  const resetPreprocessedStateRef = useRef<() => void>(() => {});
  const hasScheduledOpfsCleanupRef = useRef(false);
  const nextLaunchRequestIdRef = useRef(0);
  const [viewerLaunchRequest, setViewerLaunchRequest] = useState<ViewerLaunchRequest | null>(null);

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
  const { voxelResolution } = voxelResolutionHook;
  const {
    datasetError,
    datasetErrorContext,
    clearDatasetError
  } = datasetErrors;

  const stopPlaybackNoop = useCallback(() => {}, []);
  const launchState = useRouteLaunchSessionState({ stopPlayback: stopPlaybackNoop });
  const isLaunchPending = launchState.isLaunchingViewer || viewerLaunchRequest !== null;

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
  } = useChannelEditing({ channels, isLaunchingViewer: isLaunchPending });

  const trackState = useTrackState({
    channels,
    tracks,
    setTracks,
    createTrackSetSource,
    updateTrackSetIdCounter,
    volumeTimepointCount
  });

  const {
    setTrackSetStates,
    setTrackOrderModeByTrackSet,
    setSelectedTrackOrder,
    setFollowedTrack,
    handleAddTrackSet,
    handleTrackFilesAdded,
    handleTrackDrop,
    handleTrackSetNameChange,
    handleTrackSetBoundChannelChange,
    handleTrackSetTimepointConventionChange,
    handleTrackSetClearFile,
    handleTrackSetRemove,
    resetTrackState
  } = trackState;

  const handleReturnToFrontPage = useCallback(() => {
    resetPreprocessedState();
    setPreprocessedExperiment(null);
    setChannels([]);
    setTracks([]);
    setLayerTimepointCounts({});
    setLayerTimepointCountErrors({});
    setChannelVisibility({});
    setLayerSettings({});
    setLayerAutoThresholds({});
    resetChannelEditingState();
    resetTrackState();
    launchState.resetLaunchState();
    setViewerLaunchRequest(null);
    setIsExperimentSetupStarted(false);
    setViewerMode('3d');
    channelIdRef.current = 0;
    layerIdRef.current = 0;
    trackSetIdRef.current = 0;
    clearDatasetError();
  }, [
    channelIdRef,
    clearDatasetError,
    launchState,
    layerIdRef,
    resetChannelEditingState,
    resetPreprocessedState,
    resetTrackState,
    setChannelVisibility,
    setChannels,
    setLayerAutoThresholds,
    setLayerSettings,
    setLayerTimepointCountErrors,
    setLayerTimepointCounts,
    setTracks,
    trackSetIdRef
  ]);

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

  const activeChannel = useMemo(
    () => channels.find((channel) => channel.id === activeChannelId) ?? null,
    [activeChannelId, channels]
  );

  useEffect(() => {
    if (!preprocessedExperiment) {
      return;
    }
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
  }, [loadedDatasetLayers, preprocessedExperiment, setChannelVisibility]);

  const canLaunch = hasAnyLayers && allChannelsValid && allTracksValid && !hasLoadingTracks && voxelResolution !== null;
  const launchErrorMessage = datasetErrorContext === 'launch' ? datasetError : null;
  const interactionErrorMessage = datasetErrorContext === 'interaction' ? datasetError : null;

  const requestViewerLaunch = useCallback(
    (performanceMode: boolean) => {
      if (isLaunchPending) {
        return;
      }
      clearDatasetError();
      nextLaunchRequestIdRef.current += 1;
      setViewerLaunchRequest({
        id: nextLaunchRequestIdRef.current,
        performanceMode
      });
    },
    [clearDatasetError, isLaunchPending]
  );

  const handleLaunchViewer = useCallback(() => {
    requestViewerLaunch(false);
  }, [requestViewerLaunch]);

  const handleLaunchViewerInPerformanceMode = useCallback(() => {
    requestViewerLaunch(true);
  }, [requestViewerLaunch]);

  const handleLaunchRequestSettled = useCallback((requestId: number, _launched: boolean) => {
    setViewerLaunchRequest((current) => (current?.id === requestId ? null : current));
  }, []);

  const warningWindowInitialPosition =
    typeof window === 'undefined'
      ? { x: WINDOW_MARGIN, y: WINDOW_MARGIN }
      : {
          x: Math.max(WINDOW_MARGIN, Math.round(window.innerWidth / 2 - WARNING_WINDOW_WIDTH / 2)),
          y: WINDOW_MARGIN + 16
        };

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
      isLaunchingViewer: isLaunchPending,
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

  const datasetSetupProps = {
    ...routeDatasetSetup,
    warningWindowInitialPosition,
    warningWindowWidth: WARNING_WINDOW_WIDTH
  };

  const viewerRouteState = useMemo<ViewerRouteStateInput>(() => ({
    preprocessedExperiment,
    setPreprocessedExperiment,
    loadedDatasetLayers,
    channels,
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
    datasetSetup: {
      voxelResolution: voxelResolutionHook,
      datasetErrors,
      channelNameMap,
      channelLayersMap,
      layerChannelMap,
      channelTintMap,
      loadedChannelIds,
      volumeTimepointCount,
      showInteractionWarning
    },
    trackState,
    launchState,
    onReturnToFrontPage: handleReturnToFrontPage
  }), [
    channelLayersMap,
    channelNameMap,
    channelTintMap,
    channelVisibility,
    channels,
    createLayerDefaultBrightnessState,
    datasetErrors,
    getChannelDefaultColor,
    globalBlBackgroundCutoff,
    globalBlDensityScale,
    globalBlEarlyExitAlpha,
    globalBlOpacityScale,
    globalMipEarlyExitThreshold,
    globalSamplingMode,
    handleReturnToFrontPage,
    launchState,
    layerAutoThresholds,
    layerChannelMap,
    layerSettings,
    loadedChannelIds,
    loadedDatasetLayers,
    preprocessedExperiment,
    setChannelVisibility,
    setGlobalBlBackgroundCutoff,
    setGlobalBlDensityScale,
    setGlobalBlEarlyExitAlpha,
    setGlobalBlOpacityScale,
    setGlobalMipEarlyExitThreshold,
    setGlobalSamplingMode,
    setLayerAutoThresholds,
    setLayerSettings,
    showInteractionWarning,
    trackState,
    volumeTimepointCount,
    voxelResolutionHook
  ]);

  const shouldMountViewerRoute =
    launchState.isViewerLaunched || launchState.isLaunchingViewer || viewerLaunchRequest !== null;

  return {
    isViewerLaunched: launchState.isViewerLaunched,
    datasetSetupProps,
    viewerRouteProps: shouldMountViewerRoute
      ? {
          visible: launchState.isViewerLaunched,
          launchRequest: viewerLaunchRequest,
          onLaunchRequestSettled: handleLaunchRequestSettled,
          state: viewerRouteState
        }
      : null
  };
}
