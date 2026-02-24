import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import './viewerCommon.css';
import './VolumeViewer.css';
import type {
  VolumeResources,
  VolumeViewerProps,
} from './VolumeViewer.types';
import { LoadingOverlay } from './volume-viewer/LoadingOverlay';
import { TrackTooltip } from './volume-viewer/TrackTooltip';
import { HoverDebug } from './volume-viewer/HoverDebug';
import { VolumeViewerVrAdapter } from './volume-viewer/VolumeViewerVrAdapter';
import { TrackCameraPresenter } from './volume-viewer/TrackCameraPresenter';
import { useVolumeHover } from './volume-viewer/useVolumeHover';
import { useVolumeViewerVrBridge } from './volume-viewer/useVolumeViewerVrBridge';
import { useCameraControls } from './volume-viewer/useCameraControls';
import { useTrackRendering } from './volume-viewer/useTrackRendering';
import { usePlaybackControls } from './volume-viewer/usePlaybackControls';
import { useTrackTooltip } from './volume-viewer/useTrackTooltip';
import { useVolumeViewerState } from './volume-viewer/useVolumeViewerState';
import { useVolumeViewerDataState, useVolumeViewerResources } from './volume-viewer/useVolumeViewerData';
import { useVolumeViewerInteractions } from './volume-viewer/useVolumeViewerInteractions';
import { useVolumeViewerFollowTarget } from './volume-viewer/useVolumeViewerFollowTarget';
import { useVolumeViewerLifecycle } from './volume-viewer/useVolumeViewerLifecycle';
import { useVolumeViewerResets } from './volume-viewer/useVolumeViewerResets';
import { useVolumeViewerAnisotropy } from './volume-viewer/useVolumeViewerAnisotropy';
import { useVolumeViewerRefSync } from './volume-viewer/useVolumeViewerRefSync';
import { useVolumeViewerSurfaceBinding } from './volume-viewer/useVolumeViewerSurfaceBinding';
import { useVolumeViewerTransformBindings } from './volume-viewer/useVolumeViewerTransformBindings';
import { resolveVolumeViewerVrRuntime } from './volume-viewer/volumeViewerVrRuntime';
import {
  buildVolumeViewerLifecycleParams,
  buildVolumeViewerVrBridgeOptions,
} from './volume-viewer/volumeViewerRuntimeArgs';
import { getTrackPlaybackIndexWindow } from '../../shared/utils';

function formatPercentage(value: number): string {
  if (!Number.isFinite(value)) {
    return '0%';
  }
  const clamped = Math.max(0, Math.min(1, value));
  return `${Math.round(clamped * 100)}%`;
}

function formatChunkBytesAsMb(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0.0 MB';
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function summarizeGpuResidency(resources: Map<string, VolumeResources>) {
  let layerCount = 0;
  let residentBricks = 0;
  let totalBricks = 0;
  let residentBytes = 0;
  let budgetBytes = 0;
  let uploads = 0;
  let evictions = 0;
  let pendingBricks = 0;
  let scheduledUploads = 0;

  for (const resource of resources.values()) {
    const metrics = resource.gpuBrickResidencyMetrics;
    if (!metrics) {
      continue;
    }
    layerCount += 1;
    residentBricks += metrics.residentBricks;
    totalBricks += metrics.totalBricks;
    residentBytes += metrics.residentBytes;
    budgetBytes += metrics.budgetBytes;
    uploads += metrics.uploads;
    evictions += metrics.evictions;
    pendingBricks += metrics.pendingBricks;
    scheduledUploads += metrics.scheduledUploads;
  }

  if (layerCount === 0) {
    return null;
  }

  return {
    layerCount,
    residentBricks,
    totalBricks,
    residentBytes,
    budgetBytes,
    uploads,
    evictions,
    pendingBricks,
    scheduledUploads
  };
}

function VolumeViewer({
  layers,
  isLoading,
  loadingProgress,
  loadedVolumes,
  expectedVolumes,
  runtimeDiagnostics,
  timeIndex,
  totalTimepoints,
  isPlaying,
  playbackDisabled,
  playbackLabel,
  fps,
  blendingMode,
  onTogglePlayback,
  onTimeIndexChange,
  canAdvancePlayback,
  onFpsChange,
  onRegisterVolumeStepScaleChange,
  onRegisterReset,
  onRegisterCaptureTarget,
  trackScale,
  tracks,
  trackVisibility,
  trackOpacityByTrackSet,
  trackLineWidthByTrackSet,
  trackColorModesByTrackSet,
  channelTrackOffsets,
  isFullTrackTrailEnabled,
  trackTrailLength,
  selectedTrackIds,
  followedTrackId,
  followedVoxel,
  onTrackSelectionToggle,
  onTrackFollowRequest,
  onVoxelFollowRequest,
  onHoverVoxelChange,
  paintbrush,
  vr
}: VolumeViewerProps) {
  const vrLog = (...args: Parameters<typeof console.debug>) => {
    if (import.meta.env?.DEV) {
      console.debug(...args);
    }
  };

  const {
    isVrPassthroughSupported,
    trackChannels,
    activeTrackChannelId,
    channelPanels,
    activeChannelPanelId,
    onRegisterVrSession,
  } = resolveVolumeViewerVrRuntime(vr);
  const paintbrushRef = useRef(paintbrush);
  const paintStrokePointerIdRef = useRef<number | null>(null);

  const resourcesRef = useRef<Map<string, VolumeResources>>(new Map());
  const hoverRaycasterRef = useRef<THREE.Raycaster | null>(null);
  const {
    containerNode,
    setContainerNode,
    currentDimensionsRef,
    colormapCacheRef,
    volumeRootGroupRef,
    volumeRootBaseOffsetRef,
    volumeRootCenterOffsetRef,
    volumeRootCenterUnscaledRef,
    volumeRootHalfExtentsRef,
    volumeNormalizationScaleRef,
    volumeAnisotropyScaleRef,
    volumeStepScaleBaseRef,
    volumeStepScaleRatioRef,
    volumeUserScaleRef,
    volumeStepScaleRef,
    volumeYawRef,
    volumePitchRef,
    volumeRootRotatedCenterTempRef,
    trackGroupRef,
    trackLinesRef,
    followedTrackIdRef,
    followTargetOffsetRef,
    previousFollowTargetKeyRef,
    followTargetActiveRef,
    followedVoxelRef,
    hasActive3DLayerRef,
    hasMeasured,
    setHasMeasured,
    renderContextRevision,
    setRenderContextRevision,
    layersRef,
    hoverIntensityRef,
    hoveredVoxelRef,
    voxelHoverDebugRef,
    voxelHoverDebug,
    setVoxelHoverDebug,
    resetVolumeCallbackRef,
    resetHudPlacementCallbackRef,
    trackFollowRequestCallbackRef,
  } = useVolumeViewerState();
  const enableKeyboardNavigation = useMemo(
    () =>
      layers.some((layer) => {
        const depth =
          layer.volume?.depth ??
          layer.brickAtlas?.pageTable.volumeShape[0] ??
          layer.fullResolutionDepth ??
          0;
        const mode =
          layer.mode === 'slice' || layer.mode === '3d'
            ? layer.mode
            : depth > 1
              ? '3d'
              : 'slice';
        return mode === '3d';
      }),
    [layers],
  );
  const {
    containerRef,
    rendererRef,
    sceneRef,
    cameraRef,
    controlsRef,
    rotationTargetRef,
    defaultViewStateRef,
    movementStateRef,
    endPointerLookRef,
    handleResize,
    applyKeyboardRotation,
    applyKeyboardMovement,
    createPointerLookHandlers,
    initializeRenderContext,
  } = useCameraControls({
    trackLinesRef,
    followTargetActiveRef,
    setHasMeasured,
    enableKeyboardNavigation,
  });
  const isDevMode = Boolean(import.meta.env?.DEV);
  const { resolvedAnisotropyScale, anisotropyStepRatio } = useVolumeViewerAnisotropy({
    trackScale,
    volumeAnisotropyScaleRef,
    volumeStepScaleBaseRef,
    volumeStepScaleRatioRef,
    volumeStepScaleRef,
  });
  const {
    requestVolumeReset,
    requestHudPlacementReset,
    handleTrackFollowRequest,
  } = useVolumeViewerRefSync({
    paintbrush,
    paintbrushRef,
    layers,
    layersRef,
    followedTrackId,
    followedTrackIdRef,
    followedVoxel,
    followedVoxelRef,
    followTargetActiveRef,
    trackFollowRequestCallbackRef,
    onTrackFollowRequest,
    resetVolumeCallbackRef,
    resetHudPlacementCallbackRef,
  });

  const playbackWindow = useMemo(() => {
    if (!followedTrackId) {
      return null;
    }
    const track = tracks.find((entry) => entry.id === followedTrackId);
    if (!track) {
      return null;
    }
    return getTrackPlaybackIndexWindow(track, totalTimepoints);
  }, [followedTrackId, totalTimepoints, tracks]);

  const {
    playbackState,
    clampedTimeIndex,
    timeIndexRef,
    registerPlaybackRefs,
    advancePlaybackFrame,
  } = usePlaybackControls({
    isPlaying,
    playbackDisabled,
    playbackLabel,
    fps,
    timeIndex,
    totalTimepoints,
    onTogglePlayback,
    onTimeIndexChange,
    canAdvancePlayback,
    playbackWindow,
    onFpsChange,
  });

  const isAdditiveBlending = blendingMode === 'additive';
  const preservedViewStateRef = useRef<{
    position: THREE.Vector3;
    target: THREE.Vector3;
  } | null>(null);
  const gpuResidencySummary = summarizeGpuResidency(resourcesRef.current);

  const {
    applyHoverHighlightToResources,
    emitHoverVoxel,
    clearVoxelHover,
    reportVoxelHoverAbort,
    clearVoxelHoverDebug,
    setHoverNotReady,
  } = useVolumeViewerInteractions({
    layersRef,
    resourcesRef,
    hoveredVoxelRef,
    volumeAnisotropyScaleRef,
    hoverIntensityRef,
    voxelHoverDebugRef,
    setVoxelHoverDebug,
    isDevMode,
    onHoverVoxelChange,
  });

  const { showLoadingOverlay, primaryVolume, hasRenderableLayer, hasActive3DLayer } =
    useVolumeViewerDataState({
      layers,
      isLoading,
      loadingProgress,
      loadedVolumes,
      expectedVolumes,
    });

  const {
    hoveredTrackId,
    tooltipPosition,
    trackLookup,
    applyTrackGroupTransform,
    performHoverHitTest,
    updateHoverState,
    clearHoverState,
    updateTrackAppearance,
    computeTrackCentroid,
    refreshTrackOverlay,
    disposeTrackResources,
  } = useTrackRendering({
    tracks,
    trackVisibility,
    trackOpacityByTrackSet,
    trackLineWidthByTrackSet,
    trackColorModesByTrackSet,
    channelTrackOffsets,
    isFullTrackTrailEnabled,
    trackTrailLength,
    trackScale,
    selectedTrackIds,
    followedTrackId,
    clampedTimeIndex,
    trackGroupRef,
    trackLinesRef,
    containerRef,
    rendererRef,
    cameraRef,
    hoverRaycasterRef,
    currentDimensionsRef,
    hasActive3DLayer,
  });

  const { hoveredTrackLabel } = useTrackTooltip({
    hoveredTrackId,
    trackLookup,
  });

  const { computeFollowedVoxelPosition, resolveHoveredFollowTarget } = useVolumeViewerFollowTarget({
    layersRef,
    volumeRootGroupRef,
    hoveredVoxelRef,
  });

  const vrBridgeOptions = buildVolumeViewerVrBridgeOptions({
    vr,
    refs: {
      containerRef,
      rendererRef,
      cameraRef,
      controlsRef,
      sceneRef,
      volumeRootGroupRef,
      currentDimensionsRef,
      volumeRootBaseOffsetRef,
      volumeRootCenterOffsetRef,
      volumeRootCenterUnscaledRef,
      volumeRootHalfExtentsRef,
      volumeNormalizationScaleRef,
      volumeAnisotropyScaleRef,
      volumeUserScaleRef,
      volumeRootRotatedCenterTempRef,
      volumeStepScaleRef,
      volumeYawRef,
      volumePitchRef,
      trackGroupRef,
      resourcesRef,
      timeIndexRef,
      movementStateRef,
      trackLinesRef,
      followTargetOffsetRef,
      hasActive3DLayerRef,
    },
    playbackState,
    vrState: {
      isVrPassthroughSupported,
      channelPanels,
      activeChannelPanelId,
      trackChannels,
      activeTrackChannelId,
    },
    trackState: {
      tracks,
      trackVisibility,
      trackOpacityByTrackSet,
      trackLineWidthByTrackSet,
      trackColorModesByTrackSet,
      selectedTrackIds,
      followedTrackId,
    },
    callbacks: {
      updateHoverState,
      clearHoverState,
      onResetVolume: requestVolumeReset,
      onResetHudPlacement: requestHudPlacementReset,
      onTrackFollowRequest: handleTrackFollowRequest,
      vrLog,
      onAfterSessionEnd: handleResize,
    },
  });
  const { vrApi, vrParams, vrIntegration, setVrIntegration } = useVolumeViewerVrBridge(vrBridgeOptions);
  const {
    callOnRegisterVrSession,
    requestVrSession,
    endVrSession,
    vrPlaybackHudRef,
    vrChannelsHudRef,
    vrTracksHudRef,
    vrPlaybackHudPlacementRef,
    vrChannelsHudPlacementRef,
    vrTracksHudPlacementRef,
    vrTranslationHandleRef,
    vrVolumeScaleHandleRef,
    vrVolumeYawHandlesRef,
    vrVolumePitchHandleRef,
    playbackStateRef,
    playbackLoopRef,
    vrHoverStateRef,
    controllersRef,
    setControllerVisibility,
    raycasterRef,
    xrSessionRef,
    sessionCleanupRef,
    applyVrPlaybackHoverState,
    updateVrPlaybackHud,
    createVrPlaybackHud,
    createVrChannelsHud,
    createVrTracksHud,
    updateVrChannelsHud,
    updateVrTracksHud,
    updateVolumeHandles,
    updateHudGroupFromPlacement,
    resetVrPlaybackHudPlacement,
    resetVrChannelsHudPlacement,
    resetVrTracksHudPlacement,
    applyVolumeRootTransform,
    applyVolumeStepScaleToResources,
    restoreVrFoveation,
    onRendererInitialized,
    endVrSessionRequestRef,
    updateControllerRays,
  } = vrApi;

  useEffect(() => {
    registerPlaybackRefs({
      playbackStateRef,
      playbackLoopRef,
      vrHoverStateRef,
      updateVrPlaybackHud,
      vrIntegration,
    });
  }, [
    playbackLoopRef,
    playbackStateRef,
    registerPlaybackRefs,
    updateVrPlaybackHud,
    vrHoverStateRef,
    vrIntegration,
  ]);
  const { handleContainerRef } = useVolumeViewerSurfaceBinding({
    containerRef,
    containerNode,
    setContainerNode,
    onRegisterCaptureTarget,
    setHoverNotReady,
    hasActive3DLayer,
    hasActive3DLayerRef,
    updateVolumeHandles,
  });
  useVolumeViewerResources({
    layers,
    primaryVolume,
    isAdditiveBlending,
    renderContextRevision,
    rendererRef,
    sceneRef,
    cameraRef,
    controlsRef,
    rotationTargetRef,
    defaultViewStateRef,
    trackGroupRef,
    resourcesRef,
    currentDimensionsRef,
    colormapCacheRef,
    volumeRootGroupRef,
    volumeRootBaseOffsetRef,
    volumeRootCenterOffsetRef,
    volumeRootCenterUnscaledRef,
    volumeRootHalfExtentsRef,
    volumeNormalizationScaleRef,
    volumeUserScaleRef,
    volumeStepScaleRef,
    volumeYawRef,
    volumePitchRef,
    volumeRootRotatedCenterTempRef,
    applyTrackGroupTransform,
    applyVolumeRootTransform,
    applyVolumeStepScaleToResources,
    applyHoverHighlightToResources,
  });
  const {
    updateVoxelHover,
    resetHoverState,
    markHoverInitializationFailed,
    markHoverInitialized,
    teardownHover,
  } = useVolumeHover({
    layersRef,
    resourcesRef,
    hoverRaycasterRef,
    volumeRootGroupRef,
    volumeStepScaleRef,
    hoveredVoxelRef,
    rendererRef,
    cameraRef,
    applyHoverHighlightToResources,
    emitHoverVoxel,
    clearVoxelHover,
    reportVoxelHoverAbort,
    clearVoxelHoverDebug,
    setHoverNotReady,
    isAdditiveBlending,
  });
  useVolumeViewerResets({
    rendererRef,
    cameraRef,
    controlsRef,
    defaultViewStateRef,
    rotationTargetRef,
    currentDimensionsRef,
    volumeRootBaseOffsetRef,
    volumeYawRef,
    volumePitchRef,
    volumeUserScaleRef,
    volumeStepScaleBaseRef,
    volumeStepScaleRatioRef,
    volumeStepScaleRef,
    resetVolumeCallbackRef,
    resetHudPlacementCallbackRef,
    applyVolumeRootTransform,
    applyVolumeStepScaleToResources,
    resetVrPlaybackHudPlacement,
    resetVrChannelsHudPlacement,
    resetVrTracksHudPlacement,
    onRegisterVolumeStepScaleChange,
    onRegisterReset,
    hasRenderableLayer,
  });
  const {
    applyVolumeRootTransformRef,
    applyTrackGroupTransformRef,
    refreshVrHudPlacementsRef,
  } = useVolumeViewerTransformBindings({
    updateHudGroupFromPlacement,
    vrPlaybackHudRef,
    vrChannelsHudRef,
    vrTracksHudRef,
    vrPlaybackHudPlacementRef,
    vrChannelsHudPlacementRef,
    vrTracksHudPlacementRef,
    applyVolumeRootTransform,
    applyTrackGroupTransform,
    currentDimensionsRef,
    applyVolumeStepScaleToResources,
    volumeStepScaleRef,
    anisotropyStepRatio,
    resolvedAnisotropyScale,
  });

  const lifecycleParams = buildVolumeViewerLifecycleParams({
    core: {
      containerNode,
      onRegisterCaptureTarget,
      initializeRenderContext,
      createPointerLookHandlers,
      handleResize,
    },
    renderLoop: {
      applyKeyboardRotation,
      applyKeyboardMovement,
      updateTrackAppearance,
      advancePlaybackFrame,
      updateControllerRays,
      controllersRef,
      vrLog,
      followTargetActiveRef,
      followTargetOffsetRef,
      resourcesRef,
      rotationTargetRef,
      refreshVrHudPlacementsRef,
      currentDimensionsRef,
      rendererRef,
      sceneRef,
      cameraRef,
      controlsRef,
      raycasterRef,
      volumeRootGroupRef,
      trackGroupRef,
      applyVolumeRootTransformRef,
      applyTrackGroupTransformRef,
      preservedViewStateRef,
      setRenderContextRevision,
      refreshTrackOverlay,
    },
    interaction: {
      layersRef,
      paintbrushRef,
      paintStrokePointerIdRef,
      hoverIntensityRef,
      followedTrackIdRef,
      updateVoxelHover,
      performHoverHitTest,
      clearHoverState,
      clearVoxelHover,
      resolveHoveredFollowTarget,
      onTrackSelectionToggle,
      onVoxelFollowRequest,
    },
    hoverLifecycle: {
      resetHoverState,
      markHoverInitializationFailed,
      markHoverInitialized,
      teardownHover,
      setHoverNotReady,
    },
    vrLifecycle: {
      restoreVrFoveation,
      applyVolumeStepScaleToResources,
      setControllerVisibility,
      xrSessionRef,
      sessionCleanupRef,
      endVrSessionRequestRef,
      applyVrPlaybackHoverState,
      createVrPlaybackHud,
      createVrChannelsHud,
      createVrTracksHud,
      vrPlaybackHudRef,
      vrChannelsHudRef,
      vrTracksHudRef,
      vrPlaybackHudPlacementRef,
      vrChannelsHudPlacementRef,
      vrTracksHudPlacementRef,
      resetVrPlaybackHudPlacement,
      resetVrChannelsHudPlacement,
      resetVrTracksHudPlacement,
      updateVrPlaybackHud,
      updateVrChannelsHud,
      updateVrTracksHud,
      onRendererInitialized,
      vrTranslationHandleRef,
      vrVolumeScaleHandleRef,
      vrVolumeYawHandlesRef,
      vrVolumePitchHandleRef,
      disposeTrackResources,
    },
  });
  useVolumeViewerLifecycle(lifecycleParams);

  useEffect(() => {
    return () => {
      emitHoverVoxel(null);
    };
  }, [emitHoverVoxel]);

  return (
    <div className="volume-viewer">
      <TrackCameraPresenter
        followedTrackId={followedTrackId}
        followedVoxel={followedVoxel}
        clampedTimeIndex={clampedTimeIndex}
        computeTrackCentroid={computeTrackCentroid}
        computeVoxelWorldPosition={computeFollowedVoxelPosition}
        movementStateRef={movementStateRef}
        controlsRef={controlsRef}
        cameraRef={cameraRef}
        rotationTargetRef={rotationTargetRef}
        followTargetOffsetRef={followTargetOffsetRef}
        previousFollowTargetKeyRef={previousFollowTargetKeyRef}
        endPointerLookRef={endPointerLookRef}
      />
      <VolumeViewerVrAdapter
        vrParams={vrParams}
        onRegisterVrSession={onRegisterVrSession}
        setVrIntegration={setVrIntegration}
        callOnRegisterVrSession={callOnRegisterVrSession}
        requestVrSession={requestVrSession}
        endVrSession={endVrSession}
      />
      <section className="viewer-surface">
        <LoadingOverlay visible={showLoadingOverlay} />
        <div className={`render-surface${hasMeasured ? ' is-ready' : ''}`} ref={handleContainerRef}>
          <TrackTooltip label={hoveredTrackLabel} position={tooltipPosition} />
          <HoverDebug message={isDevMode ? voxelHoverDebug : null} />
          {isDevMode && runtimeDiagnostics ? (
            <aside className="runtime-diagnostics" aria-label="Runtime diagnostics">
              <div className="runtime-diagnostics__title">Runtime diagnostics</div>
              <ul>
                <li>
                  <span>Cache pressure</span>
                  <span>
                    V {formatPercentage(runtimeDiagnostics.cachePressure.volume)} / C{' '}
                    {formatPercentage(runtimeDiagnostics.cachePressure.chunk)}
                  </span>
                </li>
                <li>
                  <span>Miss rate</span>
                  <span>
                    V {formatPercentage(runtimeDiagnostics.missRates.volume)} / C{' '}
                    {formatPercentage(runtimeDiagnostics.missRates.chunk)}
                  </span>
                </li>
                <li>
                  <span>Residency</span>
                  <span>
                    Vol {runtimeDiagnostics.residency.cachedVolumes} +{runtimeDiagnostics.residency.inFlightVolumes} / Ch{' '}
                    {runtimeDiagnostics.residency.cachedChunks} +{runtimeDiagnostics.residency.inFlightChunks}
                  </span>
                </li>
                <li>
                  <span>Chunk bytes</span>
                  <span>{formatChunkBytesAsMb(runtimeDiagnostics.residency.chunkBytes)}</span>
                </li>
                <li>
                  <span>Prefetch</span>
                  <span>{runtimeDiagnostics.activePrefetchRequests.length} active</span>
                </li>
                {gpuResidencySummary ? (
                  <li>
                    <span>GPU bricks</span>
                    <span>
                      {gpuResidencySummary.residentBricks}/{gpuResidencySummary.totalBricks} (
                      {gpuResidencySummary.layerCount} layers)
                    </span>
                  </li>
                ) : null}
                {gpuResidencySummary ? (
                  <li>
                    <span>GPU budget</span>
                    <span>
                      {formatChunkBytesAsMb(gpuResidencySummary.residentBytes)} /{' '}
                      {formatChunkBytesAsMb(gpuResidencySummary.budgetBytes)}
                    </span>
                  </li>
                ) : null}
                {gpuResidencySummary ? (
                  <li>
                    <span>GPU scheduler</span>
                    <span>
                      up {gpuResidencySummary.uploads} ev {gpuResidencySummary.evictions} p{' '}
                      {gpuResidencySummary.pendingBricks} / sched {gpuResidencySummary.scheduledUploads}
                    </span>
                  </li>
                ) : null}
              </ul>
            </aside>
          ) : null}
        </div>
      </section>
    </div>
  );
}

export default VolumeViewer;
