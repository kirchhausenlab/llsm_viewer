import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { NormalizedVolume } from '../../core/volumeProcessing';
import type { HoveredVoxelInfo } from '../../types/hover';
import './VolumeViewer.css';
import type {
  TrackLineResource,
  VolumeResources,
  VolumeViewerProps,
} from './VolumeViewer.types';
import { VolumeViewerVrBridge } from './volume-viewer/VolumeViewerVrBridge';
import {
  DESKTOP_VOLUME_STEP_SCALE,
  VR_VOLUME_BASE_OFFSET,
} from './volume-viewer/vr';
import {
  brightnessContrastModel,
  computeContrastMultiplier,
  formatContrastMultiplier,
  DEFAULT_WINDOW_MIN,
  DEFAULT_WINDOW_MAX
} from '../../state/layerSettings';
import { denormalizeValue, formatChannelValuesDetailed } from '../../shared/utils/intensityFormatting';
import { clampValue, sampleRawValuesAtPosition, sampleSegmentationLabel } from '../../shared/utils/hoverSampling';
import {
  disposeMaterial,
  HOVER_HIGHLIGHT_RADIUS_VOXELS,
  HOVER_PULSE_SPEED,
  hoverBoundingBox,
  hoverEntryOffset,
  hoverEntryPoint,
  hoverEnd,
  hoverExitPoint,
  hoverExitRay,
  hoverInverseMatrix,
  hoverLayerMatrix,
  hoverLayerOffsetMatrix,
  hoverLocalRay,
  hoverMaxPosition,
  hoverPointerVector,
  hoverRayDirection,
  hoverRefineStep,
  hoverSample,
  hoverStart,
  hoverStartNormalized,
  hoverStep,
  hoverVolumeSize,
  MIP_MAX_STEPS,
  MIP_REFINEMENT_STEPS,
} from './volume-viewer/rendering';
import { LoadingOverlay } from './volume-viewer/LoadingOverlay';
import { TrackTooltip } from './volume-viewer/TrackTooltip';
import { HoverDebug } from './volume-viewer/HoverDebug';
import { useVolumeViewerVrBridge } from './volume-viewer/useVolumeViewerVrBridge';
import { useCameraControls } from './volume-viewer/useCameraControls';
import { useTrackRendering } from './volume-viewer/useTrackRendering';
import { usePlaybackControls } from './volume-viewer/usePlaybackControls';
import { useTrackTooltip } from './volume-viewer/useTrackTooltip';
import { useVolumeViewerState } from './volume-viewer/useVolumeViewerState';
import { useVolumeViewerDataState, useVolumeViewerResources } from './volume-viewer/useVolumeViewerData';
import { useVolumeViewerInteractions } from './volume-viewer/useVolumeViewerInteractions';

function VolumeViewer({
  layers,
  isLoading,
  loadingProgress,
  loadedVolumes,
  expectedVolumes,
  timeIndex,
  totalTimepoints,
  isPlaying,
  playbackDisabled,
  playbackLabel,
  fps,
  blendingMode,
  onTogglePlayback,
  onTimeIndexChange,
  onFpsChange,
  onRegisterVolumeStepScaleChange,
  onRegisterReset,
  trackScale,
  tracks,
  trackVisibility,
  trackOpacityByChannel,
  trackLineWidthByChannel,
  channelTrackColorModes,
  channelTrackOffsets,
  selectedTrackIds,
  followedTrackId,
  onTrackSelectionToggle,
  onTrackFollowRequest,
  onHoverVoxelChange,
  vr
}: VolumeViewerProps) {
  const vrLog = (...args: Parameters<typeof console.debug>) => {
    if (import.meta.env?.DEV) {
      console.debug(...args);
    }
  };

  const isVrPassthroughSupported = vr?.isVrPassthroughSupported ?? false;
  const trackChannels = vr?.trackChannels ?? [];
  const activeTrackChannelId = vr?.activeTrackChannelId ?? null;
  const channelPanels = vr?.channelPanels ?? [];
  const activeChannelPanelId = vr?.activeChannelPanelId ?? null;
  const onTrackChannelSelect = vr?.onTrackChannelSelect;
  const onTrackVisibilityToggle = vr?.onTrackVisibilityToggle;
  const onTrackVisibilityAllChange = vr?.onTrackVisibilityAllChange;
  const onTrackOpacityChange = vr?.onTrackOpacityChange;
  const onTrackLineWidthChange = vr?.onTrackLineWidthChange;
  const onTrackColorSelect = vr?.onTrackColorSelect;
  const onTrackColorReset = vr?.onTrackColorReset;
  const onStopTrackFollow = vr?.onStopTrackFollow;
  const onChannelPanelSelect = vr?.onChannelPanelSelect;
  const onChannelVisibilityToggle = vr?.onChannelVisibilityToggle;
  const onChannelReset = vr?.onChannelReset;
  const onChannelLayerSelect = vr?.onChannelLayerSelect;
  const onLayerContrastChange = vr?.onLayerContrastChange;
  const onLayerBrightnessChange = vr?.onLayerBrightnessChange;
  const onLayerWindowMinChange = vr?.onLayerWindowMinChange;
  const onLayerWindowMaxChange = vr?.onLayerWindowMaxChange;
  const onLayerAutoContrast = vr?.onLayerAutoContrast;
  const onLayerOffsetChange = vr?.onLayerOffsetChange;
  const onLayerColorChange = vr?.onLayerColorChange;
  const onLayerRenderStyleToggle = vr?.onLayerRenderStyleToggle;
  const onLayerSamplingModeToggle = vr?.onLayerSamplingModeToggle;
  const onLayerInvertToggle = vr?.onLayerInvertToggle;
  const onRegisterVrSession = vr?.onRegisterVrSession;

  const hoverRaycasterRef = useRef<THREE.Raycaster | null>(null);
  const resourcesRef = useRef<Map<string, VolumeResources>>(new Map());
  const hoverTeardownRef = useRef(false);
  const hoverInitializationFailedRef = useRef(false);
  const hoverSystemReadyRef = useRef(false);
  const pendingHoverEventRef = useRef<PointerEvent | null>(null);
  const hoverRetryFrameRef = useRef<number | null>(null);
  const updateVoxelHoverRef = useRef<(event: PointerEvent) => void>(() => {});
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
    volumeUserScaleRef,
    volumeStepScaleRef,
    volumeYawRef,
    volumePitchRef,
    volumeRootRotatedCenterTempRef,
    trackGroupRef,
    trackLinesRef,
    followedTrackIdRef,
    trackFollowOffsetRef,
    previousFollowedTrackIdRef,
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
    applyKeyboardMovement,
    createPointerLookHandlers,
    initializeRenderContext,
  } = useCameraControls({ trackLinesRef, followedTrackIdRef, setHasMeasured });
  const isDevMode = Boolean(import.meta.env?.DEV);
  trackFollowRequestCallbackRef.current = onTrackFollowRequest;

  const requestVolumeReset = useCallback(() => {
    resetVolumeCallbackRef.current?.();
  }, []);

  const requestHudPlacementReset = useCallback(() => {
    resetHudPlacementCallbackRef.current?.();
  }, []);

  const handleTrackFollowRequest = useCallback((trackId: string) => {
    trackFollowRequestCallbackRef.current?.(trackId);
  }, []);

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
    onFpsChange,
  });

  const isAdditiveBlending = blendingMode === 'additive';

  useEffect(() => {
    layersRef.current = layers;
  }, [layers]);

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
    trackOpacityByChannel,
    trackLineWidthByChannel,
    channelTrackColorModes,
    channelTrackOffsets,
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

  const { vrApi, vrParams, vrIntegration, setVrIntegration } = useVolumeViewerVrBridge({
    vr,
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
    trackFollowOffsetRef,
    hasActive3DLayerRef,
    playbackState,
    isVrPassthroughSupported,
    channelPanels,
    activeChannelPanelId,
    trackChannels,
    activeTrackChannelId,
    tracks,
    trackVisibility,
    trackOpacityByChannel,
    trackLineWidthByChannel,
    channelTrackColorModes,
    selectedTrackIds,
    followedTrackId,
    updateHoverState,
    clearHoverState,
    onResetVolume: requestVolumeReset,
    onResetHudPlacement: requestHudPlacementReset,
    onTrackFollowRequest: handleTrackFollowRequest,
    vrLog,
    onAfterSessionEnd: handleResize,
  });
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

  useEffect(() => {
    if (!onRegisterVrSession) {
      callOnRegisterVrSession(null);
      return;
    }
    callOnRegisterVrSession({
      requestSession: () => requestVrSession(),
      endSession: () => endVrSession(),
    });
    return () => {
      callOnRegisterVrSession(null);
    };
  }, [callOnRegisterVrSession, endVrSession, onRegisterVrSession, requestVrSession]);


  const refreshVrHudPlacements = useCallback(() => {
    updateHudGroupFromPlacement(
      vrPlaybackHudRef.current,
      vrPlaybackHudPlacementRef.current ?? null
    );
    updateHudGroupFromPlacement(
      vrChannelsHudRef.current,
      vrChannelsHudPlacementRef.current ?? null
    );
    updateHudGroupFromPlacement(
      vrTracksHudRef.current,
      vrTracksHudPlacementRef.current ?? null
    );
  }, [updateHudGroupFromPlacement]);

  const handleContainerRef = useCallback((node: HTMLDivElement | null) => {
    containerRef.current = node;
    if (!node) {
      return;
    }
    setContainerNode((current) => (current === node ? current : node));
  }, []);

  useEffect(() => {
    const activeContainer = containerNode ?? containerRef.current;
    if (!activeContainer) {
      setHoverNotReady('Hover inactive: viewer container unavailable.');
      return;
    }
    if (!containerNode && activeContainer) {
      setContainerNode(activeContainer);
    }
  }, [containerNode, setHoverNotReady]);

  useEffect(() => {
    hasActive3DLayerRef.current = hasActive3DLayer;
    updateVolumeHandles();
  }, [hasActive3DLayer, updateVolumeHandles]);

  const { getColormapTexture } = useVolumeViewerResources({
    layers,
    primaryVolume,
    isAdditiveBlending,
    renderContextRevision,
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

  const retryPendingVoxelHover = useCallback(() => {
    const pendingEvent = pendingHoverEventRef.current;
    if (!pendingEvent) {
      return;
    }

    if (hoverTeardownRef.current) {
      pendingHoverEventRef.current = null;
      return;
    }

    if (hoverInitializationFailedRef.current) {
      pendingHoverEventRef.current = null;
      setHoverNotReady('Hover inactive: renderer not initialized.');
      return;
    }

    const renderer = rendererRef.current;
    const cameraInstance = cameraRef.current;
    const raycasterInstance = hoverRaycasterRef.current;
    const hasHoverRefs = renderer !== null && cameraInstance !== null && raycasterInstance !== null;

    if (!hoverSystemReadyRef.current || !hasHoverRefs) {
      if (!hoverSystemReadyRef.current) {
        setHoverNotReady('Hover inactive: renderer not initialized.');
      } else if (!hasHoverRefs) {
        setHoverNotReady('Hover inactive: hover dependencies missing.');
      }

      if (hoverRetryFrameRef.current !== null) {
        cancelAnimationFrame(hoverRetryFrameRef.current);
      }

      hoverRetryFrameRef.current = requestAnimationFrame(() => {
        hoverRetryFrameRef.current = null;
        if (hoverTeardownRef.current) {
          return;
        }
        retryPendingVoxelHover();
      });
      return;
    }

    if (hoverRetryFrameRef.current !== null) {
      cancelAnimationFrame(hoverRetryFrameRef.current);
      hoverRetryFrameRef.current = null;
    }

    pendingHoverEventRef.current = null;
    updateVoxelHoverRef.current(pendingEvent);
  }, [setHoverNotReady]);

  const updateVoxelHover = useCallback(
    (event: PointerEvent) => {
      if (hoverTeardownRef.current) {
        pendingHoverEventRef.current = null;
        return;
      }

      if (!hoverSystemReadyRef.current) {
        if (hoverInitializationFailedRef.current) {
          pendingHoverEventRef.current = null;
          setHoverNotReady('Hover inactive: renderer not initialized.');
        } else {
          pendingHoverEventRef.current = event;
          setHoverNotReady('Hover inactive: renderer not initialized.');
          retryPendingVoxelHover();
        }
        return;
      }

      const renderer = rendererRef.current;
      const cameraInstance = cameraRef.current;
      const raycasterInstance = hoverRaycasterRef.current;
      if (!renderer || !cameraInstance || !raycasterInstance) {
        pendingHoverEventRef.current = event;
        setHoverNotReady('Hover inactive: hover dependencies missing.');
        retryPendingVoxelHover();
        return;
      }

      if (renderer.xr?.isPresenting) {
        reportVoxelHoverAbort('Hover sampling disabled while XR session is active.');
        return;
      }

      const domElement = renderer.domElement;
      const rect = domElement.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;
      if (width <= 0 || height <= 0) {
        reportVoxelHoverAbort('Render surface has no measurable area.');
        return;
      }

      const offsetX = event.clientX - rect.left;
      const offsetY = event.clientY - rect.top;
      if (offsetX < 0 || offsetY < 0 || offsetX > width || offsetY > height) {
        clearVoxelHoverDebug();
        clearVoxelHover();
        return;
      }

      const layersSnapshot = layersRef.current;
      const hoverableLayers: (typeof layersSnapshot)[number][] = [];
      let targetLayer: (typeof layersSnapshot)[number] | null = null;
      let resource: VolumeResources | null = null;
      let cpuFallbackLayer: (typeof layersSnapshot)[number] | null = null;

      for (const layer of layersSnapshot) {
        const volume = layer.volume;
        if (!volume || !layer.visible) {
          continue;
        }

        const hasVolumeDepth = volume.depth > 1;
        const viewerMode =
          layer.mode === 'slice' || layer.mode === '3d'
            ? layer.mode
            : hasVolumeDepth
            ? '3d'
            : 'slice';

        const canSampleLayer = viewerMode === '3d' || hasVolumeDepth;

        if (!canSampleLayer) {
          continue;
        }

        hoverableLayers.push(layer);

        const candidate = resourcesRef.current.get(layer.key) ?? null;
        const isSliceResource = candidate?.mode === 'slice' && hasVolumeDepth;
        const has3dResource = candidate?.mode === '3d';

        if (has3dResource && (!resource || resource.mode !== '3d')) {
          targetLayer = layer;
          resource = candidate;
        } else if (isSliceResource && (!resource || resource.mode !== '3d') && !targetLayer) {
          targetLayer = layer;
          resource = candidate;
        } else if (!cpuFallbackLayer) {
          cpuFallbackLayer = layer;
        }
      }

      if (!targetLayer && cpuFallbackLayer) {
        targetLayer = cpuFallbackLayer;
      }

      if (!targetLayer || !targetLayer.volume) {
        reportVoxelHoverAbort('No visible 3D-capable volume layer is available.');
        return;
      }

      const volume = targetLayer.volume;
      hoverVolumeSize.set(volume.width, volume.height, volume.depth);

      const useGpuHover = resource?.mode === '3d';
      const useSliceResource = resource?.mode === 'slice' && volume.depth > 1;
      let boundingBox: THREE.Box3 | null = null;

      if (useGpuHover && resource) {
        const geometry = resource.mesh.geometry as THREE.BufferGeometry;
        if (!geometry.boundingBox) {
          geometry.computeBoundingBox();
        }

        boundingBox = geometry.boundingBox ?? null;
        resource.mesh.updateMatrixWorld(true);
        hoverInverseMatrix.copy(resource.mesh.matrixWorld).invert();
      } else if (useSliceResource && resource) {
        const geometry = resource.mesh.geometry as THREE.BufferGeometry;
        if (!geometry.boundingBox) {
          geometry.computeBoundingBox();
        }

        boundingBox = geometry.boundingBox ?? null;
        resource.mesh.updateMatrixWorld(true);
        hoverInverseMatrix.copy(resource.mesh.matrixWorld).invert();
      } else {
        hoverBoundingBox.min.set(-0.5, -0.5, -0.5);
        hoverBoundingBox.max.set(
          volume.width - 0.5,
          volume.height - 0.5,
          volume.depth - 0.5,
        );
        boundingBox = hoverBoundingBox;

        const volumeRootGroup = volumeRootGroupRef.current;
        hoverLayerMatrix.identity();
        if (volumeRootGroup) {
          volumeRootGroup.updateMatrixWorld(true);
          hoverLayerMatrix.copy(volumeRootGroup.matrixWorld);
        }
        hoverLayerOffsetMatrix.makeTranslation(targetLayer.offsetX, targetLayer.offsetY, 0);
        hoverLayerMatrix.multiply(hoverLayerOffsetMatrix);
        hoverInverseMatrix.copy(hoverLayerMatrix).invert();
      }

      if (!boundingBox) {
        reportVoxelHoverAbort('Unable to compute a bounding box for hover sampling.');
        return;
      }

      hoverPointerVector.set((offsetX / width) * 2 - 1, -(offsetY / height) * 2 + 1);
      raycasterInstance.setFromCamera(hoverPointerVector, cameraInstance);
      hoverLocalRay.copy(raycasterInstance.ray).applyMatrix4(hoverInverseMatrix);

      const isInsideBoundingBox = boundingBox.containsPoint(hoverLocalRay.origin);
      let hasEntry = false;
      if (isInsideBoundingBox) {
        hoverEntryPoint.copy(hoverLocalRay.origin);
        hasEntry = true;
      } else {
        const entryHit = hoverLocalRay.intersectBox(boundingBox, hoverEntryPoint);
        hasEntry = entryHit !== null;
      }

      hoverRayDirection.copy(hoverLocalRay.direction).normalize();
      hoverEntryOffset.copy(hoverRayDirection).multiplyScalar(1e-4);
      hoverExitRay.origin.copy(isInsideBoundingBox ? hoverLocalRay.origin : hoverEntryPoint);
      hoverExitRay.origin.add(hoverEntryOffset);
      hoverExitRay.direction.copy(hoverRayDirection);
      const exitHit = hoverExitRay.intersectBox(boundingBox, hoverExitPoint);
      const hasExit = exitHit !== null;

      if (!hasEntry || !hasExit) {
        reportVoxelHoverAbort('Ray does not intersect the target volume.');
        return;
      }

      const entryDistance = hoverLocalRay.origin.distanceTo(hoverEntryPoint);
      const exitDistance = hoverLocalRay.origin.distanceTo(hoverExitPoint);
      hoverStart.copy(entryDistance <= exitDistance ? hoverEntryPoint : hoverExitPoint);
      hoverEnd.copy(entryDistance <= exitDistance ? hoverExitPoint : hoverEntryPoint);

      const safeStepScale = Math.max(volumeStepScaleRef.current, 1e-3);
      const travelDistance = hoverEnd.distanceTo(hoverStart);
      let nsteps = Math.round(travelDistance * safeStepScale);
      nsteps = clampValue(nsteps, 1, MIP_MAX_STEPS);

      hoverStartNormalized.copy(hoverStart).divide(hoverVolumeSize);
      hoverStep.copy(hoverEnd).sub(hoverStart).divide(hoverVolumeSize).divideScalar(nsteps);
      hoverSample.copy(hoverStartNormalized);

      const channels = Math.max(1, volume.channels);
      const sliceStride = volume.width * volume.height * channels;
      const rowStride = volume.width * channels;

      const sampleVolume = (coords: THREE.Vector3) => {
        const x = clampValue(coords.x * volume.width, 0, volume.width - 1);
        const y = clampValue(coords.y * volume.height, 0, volume.height - 1);
        const z = clampValue(coords.z * volume.depth, 0, volume.depth - 1);

        const leftX = Math.floor(x);
        const rightX = Math.min(volume.width - 1, leftX + 1);
        const topY = Math.floor(y);
        const bottomY = Math.min(volume.height - 1, topY + 1);
        const frontZ = Math.floor(z);
        const backZ = Math.min(volume.depth - 1, frontZ + 1);

        const tX = x - leftX;
        const tY = y - topY;
        const tZ = z - frontZ;
        const invTX = 1 - tX;
        const invTY = 1 - tY;
        const invTZ = 1 - tZ;

        const weight000 = invTX * invTY * invTZ;
        const weight100 = tX * invTY * invTZ;
        const weight010 = invTX * tY * invTZ;
        const weight110 = tX * tY * invTZ;
        const weight001 = invTX * invTY * tZ;
        const weight101 = tX * invTY * tZ;
        const weight011 = invTX * tY * tZ;
        const weight111 = tX * tY * tZ;

        const frontOffset = frontZ * sliceStride;
        const backOffset = backZ * sliceStride;
        const topFrontOffset = frontOffset + topY * rowStride;
        const bottomFrontOffset = frontOffset + bottomY * rowStride;
        const topBackOffset = backOffset + topY * rowStride;
        const bottomBackOffset = backOffset + bottomY * rowStride;

        const normalizedValues: number[] = [];
        const rawValues: number[] = [];

        for (let channelIndex = 0; channelIndex < channels; channelIndex++) {
          const baseChannelOffset = channelIndex;
          const topLeftFront = volume.normalized[topFrontOffset + leftX * channels + baseChannelOffset] ?? 0;
          const topRightFront = volume.normalized[topFrontOffset + rightX * channels + baseChannelOffset] ?? 0;
          const bottomLeftFront = volume.normalized[bottomFrontOffset + leftX * channels + baseChannelOffset] ?? 0;
          const bottomRightFront = volume.normalized[bottomFrontOffset + rightX * channels + baseChannelOffset] ?? 0;

          const topLeftBack = volume.normalized[topBackOffset + leftX * channels + baseChannelOffset] ?? 0;
          const topRightBack = volume.normalized[topBackOffset + rightX * channels + baseChannelOffset] ?? 0;
          const bottomLeftBack = volume.normalized[bottomBackOffset + leftX * channels + baseChannelOffset] ?? 0;
          const bottomRightBack = volume.normalized[bottomBackOffset + rightX * channels + baseChannelOffset] ?? 0;

          const interpolated =
            topLeftFront * weight000 +
            topRightFront * weight100 +
            bottomLeftFront * weight010 +
            bottomRightFront * weight110 +
            topLeftBack * weight001 +
            topRightBack * weight101 +
            bottomLeftBack * weight011 +
            bottomRightBack * weight111;

          normalizedValues.push(interpolated / 255);
          rawValues.push(denormalizeValue(interpolated, volume));
        }

        return { normalizedValues, rawValues };
      };

      const computeLuminance = (values: number[]) => {
        if (channels === 1) {
          return values[0] ?? 0;
        }
        if (channels === 2) {
          return 0.5 * ((values[0] ?? 0) + (values[1] ?? 0));
        }
        if (channels === 3) {
          return 0.2126 * (values[0] ?? 0) + 0.7152 * (values[1] ?? 0) + 0.0722 * (values[2] ?? 0);
        }
        return Math.max(...values, 0);
      };

      const adjustIntensity = (value: number) => {
        const range = Math.max(targetLayer.windowMax - targetLayer.windowMin, 1e-5);
        const normalized = clampValue((value - targetLayer.windowMin) / range, 0, 1);
        return targetLayer.invert ? 1 - normalized : normalized;
      };

      let maxValue = -Infinity;
      let maxIndex = 0;
      hoverMaxPosition.copy(hoverSample);
      let maxRawValues: number[] = [];
      let maxNormalizedValues: number[] = [];

      const highWaterMark = targetLayer.invert ? 0.001 : 0.999;

      for (let i = 0; i < nsteps; i++) {
        const sample = sampleVolume(hoverSample);
        const luminance = computeLuminance(sample.normalizedValues);
        const adjusted = adjustIntensity(luminance);
        if (adjusted > maxValue) {
          maxValue = adjusted;
          maxIndex = i;
          hoverMaxPosition.copy(hoverSample);
          maxRawValues = sample.rawValues;
          maxNormalizedValues = sample.normalizedValues;

          if ((!targetLayer.invert && maxValue >= highWaterMark) || (targetLayer.invert && maxValue <= highWaterMark)) {
            break;
          }
        }

        hoverSample.add(hoverStep);
      }

      hoverSample.copy(hoverStartNormalized).addScaledVector(hoverStep, maxIndex - 0.5);
      hoverRefineStep.copy(hoverStep).divideScalar(MIP_REFINEMENT_STEPS);

      for (let i = 0; i < MIP_REFINEMENT_STEPS; i++) {
        const sample = sampleVolume(hoverSample);
        const luminance = computeLuminance(sample.normalizedValues);
        const adjusted = adjustIntensity(luminance);
        if (adjusted > maxValue) {
          maxValue = adjusted;
          hoverMaxPosition.copy(hoverSample);
          maxRawValues = sample.rawValues;
          maxNormalizedValues = sample.normalizedValues;
        }
        hoverSample.add(hoverRefineStep);
      }

      if (!Number.isFinite(maxValue) || maxRawValues.length === 0) {
        reportVoxelHoverAbort('No finite intensity was found along the hover ray.');
        return;
      }

      hoverMaxPosition.set(
        clampValue(hoverMaxPosition.x, 0, 1),
        clampValue(hoverMaxPosition.y, 0, 1),
        clampValue(hoverMaxPosition.z, 0, 1),
      );

      const hoveredSegmentationLabel =
        targetLayer.isSegmentation && targetLayer.volume?.segmentationLabels
          ? sampleSegmentationLabel(targetLayer.volume, hoverMaxPosition)
          : null;

      const displayLayers = isAdditiveBlending && hoverableLayers.length > 0 ? hoverableLayers : [targetLayer];
      const useLayerLabels = isAdditiveBlending && displayLayers.length > 1;
      const samples: Array<{
        values: number[];
        type: NormalizedVolume['dataType'];
        label: string | null;
        color: string;
      }> = [];

      for (const layer of displayLayers) {
        const layerVolume = layer.volume;
        if (!layerVolume) {
          continue;
        }

        let displayValues: number[] | null = null;

        if (layer.isSegmentation && layerVolume.segmentationLabels) {
          const labelValue =
            layer.key === targetLayer.key && hoveredSegmentationLabel !== null
              ? hoveredSegmentationLabel
              : sampleSegmentationLabel(layerVolume, hoverMaxPosition);
          if (labelValue !== null) {
            displayValues = [labelValue];
          }
        }

        if (!displayValues) {
          displayValues = layer.key === targetLayer.key
            ? maxRawValues
            : sampleRawValuesAtPosition(layerVolume, hoverMaxPosition);
        }

        if (!displayValues || displayValues.length === 0) {
          continue;
        }

        const channelLabel = layer.channelName?.trim() || layer.label?.trim() || null;
        samples.push({
          values: displayValues,
          type: layerVolume.dataType,
          label: useLayerLabels ? channelLabel : null,
          color: layer.color,
        });
      }

      const totalValues = samples.reduce((sum, sample) => sum + sample.values.length, 0);
      if (totalValues === 0) {
        reportVoxelHoverAbort('Unable to format hover intensity for display.');
        return;
      }

      const includeLabel = totalValues > 1;
      const intensityParts = samples.flatMap((sample) =>
        formatChannelValuesDetailed(sample.values, sample.type, sample.label, includeLabel).map((entry) => ({
          text: entry.text,
          color: sample.color,
        })),
      );

      if (intensityParts.length === 0) {
        reportVoxelHoverAbort('Unable to format hover intensity for display.');
        return;
      }

      clearVoxelHoverDebug();

      const hoveredVoxel = {
        intensity: intensityParts.map((entry) => entry.text).join(' · '),
        components: intensityParts.map((entry) => ({ text: entry.text, color: entry.color })),
        coordinates: {
          x: Math.round(clampValue(hoverMaxPosition.x * volume.width, 0, volume.width - 1)),
          y: Math.round(clampValue(hoverMaxPosition.y * volume.height, 0, volume.height - 1)),
          z: Math.round(clampValue(hoverMaxPosition.z * volume.depth, 0, volume.depth - 1))
        }
      } satisfies HoveredVoxelInfo;

      emitHoverVoxel(hoveredVoxel);
      hoveredVoxelRef.current = {
        layerKey: targetLayer.key,
        normalizedPosition: hoverMaxPosition.clone(),
        segmentationLabel: hoveredSegmentationLabel,
      };
      applyHoverHighlightToResources();
    },
    [
      applyHoverHighlightToResources,
      clearVoxelHover,
      clearVoxelHoverDebug,
      emitHoverVoxel,
      setHoverNotReady,
      retryPendingVoxelHover,
      reportVoxelHoverAbort
    ],
  );
  updateVoxelHoverRef.current = updateVoxelHover;

  useEffect(() => {
    const controls = controlsRef.current;
    if (controls) {
      controls.enableRotate = followedTrackId !== null;
    }

    const wasFollowingTrack = followedTrackIdRef.current !== null;
    followedTrackIdRef.current = followedTrackId;

    if (followedTrackId === null) {
      trackFollowOffsetRef.current = null;
      previousFollowedTrackIdRef.current = null;
      if (wasFollowingTrack) {
        endPointerLookRef.current?.();
      }
    }
  }, [followedTrackId]);

  useEffect(() => {
    if (followedTrackId === null) {
      return;
    }

    const movementState = movementStateRef.current;
    if (movementState) {
      movementState.moveForward = false;
      movementState.moveBackward = false;
      movementState.moveLeft = false;
      movementState.moveRight = false;
      movementState.moveUp = false;
      movementState.moveDown = false;
    }

    const controls = controlsRef.current;
    const camera = cameraRef.current;
    const rotationTarget = rotationTargetRef.current;

    if (!camera || !controls || !rotationTarget) {
      return;
    }

    const centroid = computeTrackCentroid(followedTrackId, clampedTimeIndex);
    if (!centroid) {
      return;
    }

    const previousTrackId = previousFollowedTrackIdRef.current;
    previousFollowedTrackIdRef.current = followedTrackId;

    let offset: THREE.Vector3;
    if (previousTrackId === followedTrackId && trackFollowOffsetRef.current) {
      offset = trackFollowOffsetRef.current.clone();
    } else {
      offset = camera.position.clone().sub(rotationTarget);
    }

    rotationTarget.copy(centroid);
    controls.target.copy(centroid);
    camera.position.copy(centroid).add(offset);
    controls.update();

    trackFollowOffsetRef.current = camera.position.clone().sub(rotationTarget);
  }, [clampedTimeIndex, computeTrackCentroid, followedTrackId, primaryVolume]);

  const handleResetHudPlacement = useCallback(() => {
    const renderer = rendererRef.current;
    const isVrPresenting = renderer?.xr?.isPresenting ?? false;
    if (!isVrPresenting) {
      return;
    }
    resetVrPlaybackHudPlacement();
    resetVrChannelsHudPlacement();
    resetVrTracksHudPlacement();
  }, [
    resetVrChannelsHudPlacement,
    resetVrPlaybackHudPlacement,
    resetVrTracksHudPlacement
  ]);
  resetHudPlacementCallbackRef.current = handleResetHudPlacement;

  const handleResetVolume = useCallback(() => {
    const renderer = rendererRef.current;
    const isVrPresenting = renderer?.xr?.isPresenting ?? false;
    if (isVrPresenting) {
      volumeRootBaseOffsetRef.current.copy(VR_VOLUME_BASE_OFFSET);
    } else {
      volumeRootBaseOffsetRef.current.set(0, 0, 0);
    }
    volumeYawRef.current = 0;
    volumePitchRef.current = 0;
    volumeUserScaleRef.current = 1;
    applyVolumeRootTransformRef.current?.(currentDimensionsRef.current);

    const controls = controlsRef.current;
    if (!controls) {
      return;
    }
    const camera = cameraRef.current;
    const defaultViewState = defaultViewStateRef.current;
    if (defaultViewState && camera) {
      camera.position.copy(defaultViewState.position);
      controls.target.copy(defaultViewState.target);
      rotationTargetRef.current.copy(defaultViewState.target);
      controls.update();
      return;
    }

    controls.reset();
    controls.target.copy(rotationTargetRef.current);
    controls.update();
  }, [applyVolumeRootTransform]);
  resetVolumeCallbackRef.current = handleResetVolume;

  const handleResetView = useCallback(() => {
    handleResetVolume();
    handleResetHudPlacement();
  }, [handleResetHudPlacement, handleResetVolume]);

  const handleVolumeStepScaleChange = useCallback(
    (stepScale: number) => {
      const clampedStepScale = Math.max(stepScale, 1e-3);
      volumeStepScaleRef.current = clampedStepScale;
      applyVolumeStepScaleToResources(clampedStepScale);
    },
    [applyVolumeStepScaleToResources],
  );

  useEffect(() => {
    if (!onRegisterVolumeStepScaleChange) {
      return undefined;
    }

    onRegisterVolumeStepScaleChange(handleVolumeStepScaleChange);
    return () => {
      onRegisterVolumeStepScaleChange(null);
    };
  }, [handleVolumeStepScaleChange, onRegisterVolumeStepScaleChange]);

  useEffect(() => {
    onRegisterReset(hasRenderableLayer ? handleResetView : null);
    return () => {
      onRegisterReset(null);
    };
  }, [handleResetView, hasRenderableLayer, onRegisterReset]);

  const applyVolumeRootTransformRef = useRef(applyVolumeRootTransform);
  const applyTrackGroupTransformRef = useRef(applyTrackGroupTransform);
  const updateVolumeHandlesRef = useRef(updateVolumeHandles);
  const refreshVrHudPlacementsRef = useRef(refreshVrHudPlacements);

  useEffect(() => {
    applyVolumeRootTransformRef.current = applyVolumeRootTransform;
    applyTrackGroupTransformRef.current = applyTrackGroupTransform;
    updateVolumeHandlesRef.current = updateVolumeHandles;
    refreshVrHudPlacementsRef.current = refreshVrHudPlacements;
  }, [
    applyTrackGroupTransform,
    applyVolumeRootTransform,
    refreshVrHudPlacements,
    updateVolumeHandles
  ]);

  useEffect(() => {
    applyVolumeRootTransformRef.current?.(currentDimensionsRef.current);
    applyTrackGroupTransformRef.current?.(currentDimensionsRef.current);
  }, [applyTrackGroupTransform, applyVolumeRootTransform]);

  useEffect(() => {
    hoverTeardownRef.current = false;
    hoverInitializationFailedRef.current = false;
    hoverSystemReadyRef.current = false;
    setHoverNotReady('Hover inactive: renderer not initialized.');

    const container = containerNode;
    if (!container) {
      hoverInitializationFailedRef.current = true;
      return;
    }

    let renderContext: ReturnType<typeof initializeRenderContext>;
    try {
      renderContext = initializeRenderContext(container);
    } catch (error) {
      hoverInitializationFailedRef.current = true;
      setHoverNotReady('Hover inactive: renderer not initialized.');
      return;
    }

    const { renderer, scene, camera, controls } = renderContext;

    const volumeRootGroup = new THREE.Group();
    volumeRootGroup.name = 'VolumeRoot';
    scene.add(volumeRootGroup);
    volumeRootGroupRef.current = volumeRootGroup;
    const translationHandleMaterial = new THREE.MeshBasicMaterial({
      color: 0x4d9dff,
      transparent: true,
      opacity: 0.75,
      depthWrite: false
    });
    translationHandleMaterial.depthTest = false;
    const translationHandle = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 32), translationHandleMaterial);
    translationHandle.name = 'VolumeTranslateHandle';
    translationHandle.visible = false;
    volumeRootGroup.add(translationHandle);
    vrTranslationHandleRef.current = translationHandle;

    const scaleHandleMaterial = new THREE.MeshBasicMaterial({
      color: 0xc84dff,
      transparent: true,
      opacity: 0.8,
      depthWrite: false
    });
    scaleHandleMaterial.depthTest = false;
    const scaleHandle = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 32), scaleHandleMaterial);
    scaleHandle.name = 'VolumeScaleHandle';
    scaleHandle.visible = false;
    volumeRootGroup.add(scaleHandle);
    vrVolumeScaleHandleRef.current = scaleHandle;

    const rotationHandleMaterial = new THREE.MeshBasicMaterial({
      color: 0xffb347,
      transparent: true,
      opacity: 0.85,
      depthWrite: false
    });
    rotationHandleMaterial.depthTest = false;
    const yawHandles: THREE.Mesh[] = [];
    for (const direction of [1, -1] as const) {
      const yawHandle = new THREE.Mesh(
        new THREE.SphereGeometry(1, 32, 32),
        rotationHandleMaterial.clone()
      );
      yawHandle.name = direction > 0 ? 'VolumeYawHandleRight' : 'VolumeYawHandleLeft';
      yawHandle.visible = false;
      volumeRootGroup.add(yawHandle);
      yawHandles.push(yawHandle);
    }
    vrVolumeYawHandlesRef.current = yawHandles;

    const pitchHandle = new THREE.Mesh(
      new THREE.SphereGeometry(1, 32, 32),
      rotationHandleMaterial.clone()
    );
    pitchHandle.name = 'VolumePitchHandle';
    pitchHandle.visible = false;
    volumeRootGroup.add(pitchHandle);
    vrVolumePitchHandleRef.current = pitchHandle;

    applyVolumeRootTransformRef.current?.(currentDimensionsRef.current);

    const trackGroup = new THREE.Group();
    trackGroup.name = 'TrackingOverlay';
    trackGroup.visible = false;
    volumeRootGroup.add(trackGroup);
    trackGroupRef.current = trackGroup;

    // If the volume dimensions were already resolved (e.g., when toggling
    // between 2D and 3D views), make sure the tracking overlay immediately
    // adopts the normalized transform. Otherwise the tracks momentarily render
    // in unnormalized dataset coordinates until another interaction triggers a
    // redraw.
    applyTrackGroupTransformRef.current?.(currentDimensionsRef.current);
    refreshTrackOverlay();
    setRenderContextRevision((revision) => revision + 1);

    cameraRef.current = camera;
    controlsRef.current = controls;

    const hud = createVrPlaybackHud();
    if (hud) {
      hud.group.visible = false;
      scene.add(hud.group);
      vrPlaybackHudRef.current = hud;
      resetVrPlaybackHudPlacement();
      updateVrPlaybackHud();
      applyVrPlaybackHoverState(false, false, false, false, false, false, false, false, false);
    } else {
      vrPlaybackHudRef.current = null;
    }

    const channelsHud = createVrChannelsHud();
    if (channelsHud) {
      channelsHud.group.visible = false;
      scene.add(channelsHud.group);
      vrChannelsHudRef.current = channelsHud;
      resetVrChannelsHudPlacement();
      updateVrChannelsHud();
    } else {
      vrChannelsHudRef.current = null;
    }

    const tracksHud = createVrTracksHud();
    if (tracksHud) {
      tracksHud.group.visible = false;
      scene.add(tracksHud.group);
      vrTracksHudRef.current = tracksHud;
      resetVrTracksHudPlacement();
      updateVrTracksHud();
    } else {
      vrTracksHudRef.current = null;
    }

    const domElement = renderer.domElement;
    const pointerTarget = domElement.parentElement ?? domElement;

    const raycaster = new THREE.Raycaster();
    raycaster.params.Line = { threshold: 0.02 };
    raycaster.params.Line2 = { threshold: 0.02 };

    const { beginPointerLook, updatePointerLook, endPointerLook } = createPointerLookHandlers(renderContext);

    rendererRef.current = renderer;
    sceneRef.current = scene;
    cameraRef.current = camera;
    raycasterRef.current = raycaster;
    hoverRaycasterRef.current = raycaster;
    clearVoxelHoverDebug();
    hoverSystemReadyRef.current = true;
    retryPendingVoxelHover();

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0) {
        return;
      }

      const shouldUsePointerLook = followedTrackIdRef.current === null;
      if (shouldUsePointerLook) {
        beginPointerLook(event);
      } else {
        endPointerLook();
      }

      if (hoverSystemReadyRef.current) {
        updateVoxelHover(event);
      } else {
        pendingHoverEventRef.current = event;
        retryPendingVoxelHover();
      }
      const hitTrackId = performHoverHitTest(event);
      if (hitTrackId !== null) {
        onTrackSelectionToggle(hitTrackId);
      }
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (followedTrackIdRef.current === null) {
        updatePointerLook(event);
      }

      if (hoverSystemReadyRef.current) {
        updateVoxelHover(event);
      } else {
        pendingHoverEventRef.current = event;
        retryPendingVoxelHover();
      }
      performHoverHitTest(event);
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (hoverSystemReadyRef.current) {
        updateVoxelHover(event);
      } else {
        pendingHoverEventRef.current = event;
        retryPendingVoxelHover();
      }
      performHoverHitTest(event);

      endPointerLook(event);
    };

    const handlePointerLeave = (event: PointerEvent) => {
      clearHoverState('pointer');
      clearVoxelHover();
      endPointerLook(event);
    };

    const pointerDownOptions: AddEventListenerOptions = { capture: true };

    domElement.addEventListener('pointerdown', handlePointerDown, pointerDownOptions);
    pointerTarget.addEventListener('pointermove', handlePointerMove);
    pointerTarget.addEventListener('pointerup', handlePointerUp);
    pointerTarget.addEventListener('pointercancel', handlePointerUp);
    pointerTarget.addEventListener('pointerleave', handlePointerLeave);

    resetVrPlaybackHudPlacement();
    resetVrChannelsHudPlacement();
    resetVrTracksHudPlacement();
    onRendererInitialized();

    const resizeObserver = new ResizeObserver(() => handleResize());
    resizeObserver.observe(container);
    handleResize();

    let lastRenderTickSummary: { presenting: boolean; hoveredByController: string | null } | null = null;

    const renderLoop = (timestamp: number) => {
      applyKeyboardMovement(renderer, camera, controls);
      controls.update();
      rotationTargetRef.current.copy(controls.target);

      updateTrackAppearance(timestamp);

      if (followedTrackIdRef.current !== null) {
        const rotationTarget = rotationTargetRef.current;
        if (rotationTarget) {
          if (!trackFollowOffsetRef.current) {
            trackFollowOffsetRef.current = new THREE.Vector3();
          }
          trackFollowOffsetRef.current.copy(camera.position).sub(rotationTarget);
        }
      }

      const resources = resourcesRef.current;
      for (const resource of resources.values()) {
        const { mesh } = resource;
        mesh.updateMatrixWorld();
      }

      const hoverPulse = 0.5 + 0.5 * Math.sin(timestamp * HOVER_PULSE_SPEED);
      for (const resource of resources.values()) {
        if (resource.mode !== '3d') {
          continue;
        }
        const uniforms = (resource.mesh.material as THREE.ShaderMaterial).uniforms;
        if (uniforms.u_hoverPulse) {
          uniforms.u_hoverPulse.value = hoverPulse;
        }
      }

      advancePlaybackFrame(timestamp);

      refreshVrHudPlacementsRef.current?.();

      updateControllerRays();
      const hoveredEntry = controllersRef.current.find((entry) => entry.hoverTrackId);
      const renderSummary = {
        presenting: renderer.xr.isPresenting,
        hoveredByController: hoveredEntry?.hoverTrackId ?? null
      };
      if (
        !lastRenderTickSummary ||
        renderSummary.presenting !== lastRenderTickSummary.presenting ||
        renderSummary.hoveredByController !== lastRenderTickSummary.hoveredByController
      ) {
        vrLog('[VR] render tick', renderSummary);
      }
      lastRenderTickSummary = renderSummary;
      renderer.render(scene, camera);
    };
    renderer.setAnimationLoop(renderLoop);

    return () => {
      hoverTeardownRef.current = true;
      hoverSystemReadyRef.current = false;
      pendingHoverEventRef.current = null;

      restoreVrFoveation();
      applyVolumeStepScaleToResources(DESKTOP_VOLUME_STEP_SCALE);
      renderer.setAnimationLoop(null);

      const activeSession = xrSessionRef.current;
      if (activeSession) {
        try {
          sessionCleanupRef.current?.();
        } finally {
          activeSession.end().catch(() => undefined);
        }
      }
      xrSessionRef.current = null;
      sessionCleanupRef.current = null;
      setControllerVisibility(false);
      const hud = vrPlaybackHudRef.current;
      if (hud) {
        if (hud.group.parent) {
          hud.group.parent.remove(hud.group);
        }
        hud.group.traverse((object) => {
          if ((object as THREE.Mesh).isMesh) {
            const mesh = object as THREE.Mesh;
            if (mesh.geometry) {
              mesh.geometry.dispose?.();
            }
            disposeMaterial(mesh.material);
          }
        });
        hud.labelTexture.dispose();
        vrPlaybackHudRef.current = null;
        vrPlaybackHudPlacementRef.current = null;
      }

      const channelsHud = vrChannelsHudRef.current;
      if (channelsHud) {
        if (channelsHud.group.parent) {
          channelsHud.group.parent.remove(channelsHud.group);
        }
        channelsHud.group.traverse((object) => {
          if ((object as THREE.Mesh).isMesh) {
            const mesh = object as THREE.Mesh;
            if (mesh.geometry) {
              mesh.geometry.dispose?.();
            }
            disposeMaterial(mesh.material);
          }
        });
        channelsHud.panelTexture.dispose();
        vrChannelsHudRef.current = null;
        vrChannelsHudPlacementRef.current = null;
      }

      const tracksHud = vrTracksHudRef.current;
      if (tracksHud) {
        if (tracksHud.group.parent) {
          tracksHud.group.parent.remove(tracksHud.group);
        }
        tracksHud.group.traverse((object) => {
          if ((object as THREE.Mesh).isMesh) {
            const mesh = object as THREE.Mesh;
            if (mesh.geometry) {
              mesh.geometry.dispose?.();
            }
            disposeMaterial(mesh.material);
          }
        });
        tracksHud.panelTexture.dispose();
        vrTracksHudRef.current = null;
        vrTracksHudPlacementRef.current = null;
      }

      const resources = resourcesRef.current;
      for (const resource of resources.values()) {
        scene.remove(resource.mesh);
        resource.mesh.geometry.dispose();
        disposeMaterial(resource.mesh.material);
        resource.texture.dispose();
      }
      resources.clear();

      const trackGroup = trackGroupRef.current;
      if (trackGroup) {
        disposeTrackResources();
      }
      trackGroupRef.current = null;

      const volumeRootGroup = volumeRootGroupRef.current;
      if (volumeRootGroup) {
        if (trackGroup && trackGroup.parent === volumeRootGroup) {
          volumeRootGroup.remove(trackGroup);
        }
        volumeRootGroup.clear();
        if (volumeRootGroup.parent) {
          volumeRootGroup.parent.remove(volumeRootGroup);
        }
      }
      vrTranslationHandleRef.current = null;
      vrVolumeScaleHandleRef.current = null;
      vrVolumeYawHandlesRef.current = [];
      vrVolumePitchHandleRef.current = null;
      volumeRootGroupRef.current = null;
      clearHoverState();

      domElement.removeEventListener('pointerdown', handlePointerDown, pointerDownOptions);
      pointerTarget.removeEventListener('pointermove', handlePointerMove);
      pointerTarget.removeEventListener('pointerup', handlePointerUp);
      pointerTarget.removeEventListener('pointercancel', handlePointerUp);
      pointerTarget.removeEventListener('pointerleave', handlePointerLeave);

      raycasterRef.current = null;
      hoverRaycasterRef.current = null;
      resizeObserver.disconnect();
      controls.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
      if (hoverRetryFrameRef.current !== null) {
        cancelAnimationFrame(hoverRetryFrameRef.current);
        hoverRetryFrameRef.current = null;
      }
      endVrSessionRequestRef.current = null;
    };
  }, [
    applyVrPlaybackHoverState,
    applyKeyboardMovement,
    applyVolumeStepScaleToResources,
    containerNode,
    controllersRef,
    createPointerLookHandlers,
    createVrChannelsHud,
    createVrPlaybackHud,
    createVrTracksHud,
    clearVoxelHoverDebug,
    endVrSessionRequestRef,
    disposeTrackResources,
    handleResize,
    initializeRenderContext,
    onRendererInitialized,
    playbackLoopRef,
    playbackStateRef,
    performHoverHitTest,
    raycasterRef,
    hoverRaycasterRef,
    resetVrChannelsHudPlacement,
    resetVrPlaybackHudPlacement,
    resetVrTracksHudPlacement,
    retryPendingVoxelHover,
    restoreVrFoveation,
    refreshTrackOverlay,
    sessionCleanupRef,
    setHoverNotReady,
    setControllerVisibility,
    updateTrackAppearance,
    updateControllerRays,
    updateVrChannelsHud,
    updateVrPlaybackHud,
    updateVrTracksHud,
    vrChannelsHudPlacementRef,
    vrChannelsHudRef,
    vrHoverStateRef,
    vrPlaybackHudPlacementRef,
    vrPlaybackHudRef,
    vrTracksHudPlacementRef,
    vrTracksHudRef,
    vrTranslationHandleRef,
    vrVolumePitchHandleRef,
    vrVolumeScaleHandleRef,
    vrVolumeYawHandlesRef,
    xrSessionRef,
  ]);

  useEffect(() => {
    return () => {
      emitHoverVoxel(null);
    };
  }, [emitHoverVoxel]);

  return (
    <div className="volume-viewer">
      {vrParams ? (
        <Suspense fallback={null}>
          <VolumeViewerVrBridge params={vrParams} onValue={setVrIntegration} />
        </Suspense>
      ) : null}
      <section className="viewer-surface">
        <LoadingOverlay visible={showLoadingOverlay} />
        <div className={`render-surface${hasMeasured ? ' is-ready' : ''}`} ref={handleContainerRef}>
          <TrackTooltip label={hoveredTrackLabel} position={tooltipPosition} />
          <HoverDebug message={isDevMode ? voxelHoverDebug : null} />
        </div>
      </section>
    </div>
  );
}

export default VolumeViewer;
