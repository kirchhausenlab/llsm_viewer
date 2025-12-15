import { useCallback, useEffect, useRef } from 'react';
import * as THREE from 'three';
import './viewerCommon.css';
import './VolumeViewer.css';
import type {
  FollowedVoxelTarget,
  TrackLineResource,
  VolumeResources,
  VolumeViewerProps,
} from './VolumeViewer.types';
import {
  DESKTOP_VOLUME_STEP_SCALE,
  VR_VOLUME_BASE_OFFSET,
} from './volume-viewer/vr';
import { disposeMaterial, HOVER_PULSE_SPEED } from './volume-viewer/rendering';
import { LoadingOverlay } from './volume-viewer/LoadingOverlay';
import { TrackTooltip } from './volume-viewer/TrackTooltip';
import { HoverDebug } from './volume-viewer/HoverDebug';
import { VolumeViewerVrAdapter } from './volume-viewer/VolumeViewerVrAdapter';
import { TrackCameraPresenter } from './volume-viewer/TrackCameraPresenter';
import { useVolumeHover } from './volume-viewer/useVolumeHover';
import { useVolumeViewerVrBridge } from './volume-viewer/useVolumeViewerVrBridge';
import { useCameraControls } from './volume-viewer/useCameraControls';
import { destroyVolumeRenderContext } from '../../hooks/useVolumeRenderSetup';
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
  onRegisterCaptureTarget,
  trackScale,
  tracks,
  trackVisibility,
  trackOpacityByChannel,
  trackLineWidthByChannel,
  channelTrackColorModes,
  channelTrackOffsets,
  selectedTrackIds,
  followedTrackId,
  followedVoxel,
  onTrackSelectionToggle,
  onTrackFollowRequest,
  onVoxelFollowRequest,
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
  } = useCameraControls({ trackLinesRef, followTargetActiveRef, setHasMeasured });
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
  const preservedViewStateRef = useRef<{
    position: THREE.Vector3;
    target: THREE.Vector3;
  } | null>(null);

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

  const computeFollowedVoxelPosition = useCallback(
    (target: FollowedVoxelTarget) => {
      const volumeRootGroup = volumeRootGroupRef.current;
      if (!volumeRootGroup) {
        return null;
      }

      const layer = layersRef.current.find((entry) => entry.key === target.layerKey);
      const volume = layer?.volume;

      if (!layer || !volume) {
        return null;
      }

      const clampedX = THREE.MathUtils.clamp(target.coordinates.x, 0, volume.width - 1);
      const clampedY = THREE.MathUtils.clamp(target.coordinates.y, 0, volume.height - 1);
      const clampedZ = THREE.MathUtils.clamp(target.coordinates.z, 0, volume.depth - 1);

      const localPosition = new THREE.Vector3(
        clampedX + (layer.offsetX ?? 0),
        clampedY + (layer.offsetY ?? 0),
        clampedZ,
      );

      volumeRootGroup.updateMatrixWorld(true);
      return volumeRootGroup.localToWorld(localPosition);
    },
    [layersRef, volumeRootGroupRef],
  );

  const resolveHoveredFollowTarget = useCallback((): FollowedVoxelTarget | null => {
    const hovered = hoveredVoxelRef.current;
    const normalizedPosition = hovered?.normalizedPosition;
    const layerKey = hovered?.layerKey;

    if (!normalizedPosition || !layerKey) {
      return null;
    }

    const layer = layersRef.current.find((entry) => entry.key === layerKey);
    const volume = layer?.volume;

    if (!layer || !volume) {
      return null;
    }

    return {
      layerKey,
      coordinates: {
        x: Math.round(THREE.MathUtils.clamp(normalizedPosition.x * volume.width, 0, volume.width - 1)),
        y: Math.round(
          THREE.MathUtils.clamp(normalizedPosition.y * volume.height, 0, volume.height - 1),
        ),
        z: Math.round(THREE.MathUtils.clamp(normalizedPosition.z * volume.depth, 0, volume.depth - 1)),
      },
    };
  }, [hoveredVoxelRef, layersRef]);

  useEffect(() => {
    followedTrackIdRef.current = followedTrackId ?? null;
  }, [followedTrackId]);

  useEffect(() => {
    followedVoxelRef.current = followedVoxel;
    followTargetActiveRef.current = followedTrackId !== null || followedVoxel !== null;
  }, [followTargetActiveRef, followedTrackId, followedVoxel, followedVoxelRef]);

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
    followTargetOffsetRef,
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

  const handleContainerRef = useCallback(
    (node: HTMLDivElement | null) => {
      containerRef.current = node;
      if (!node) {
        onRegisterCaptureTarget?.(null);
        return;
      }
      setContainerNode((current) => (current === node ? current : node));
    },
    [onRegisterCaptureTarget]
  );

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
    currentDimensionsRef,
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
    const camera = cameraRef.current;
    if (!controls) {
      return;
    }
    const defaultViewState = defaultViewStateRef.current;
    if (defaultViewState && camera) {
      camera.up.set(0, 1, 0);
      camera.position.copy(defaultViewState.position);
      controls.target.copy(defaultViewState.target);
      rotationTargetRef.current.copy(defaultViewState.target);
      camera.lookAt(defaultViewState.target);
      controls.update();
      return;
    }

    controls.reset();
    controls.target.copy(rotationTargetRef.current);
    if (camera) {
      camera.up.set(0, 1, 0);
      camera.lookAt(controls.target);
    }
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
    resetHoverState();
    setHoverNotReady('Hover inactive: renderer not initialized.');

    const container = containerNode;
    if (!container) {
      markHoverInitializationFailed();
      return;
    }

    let renderContext: ReturnType<typeof initializeRenderContext>;
    try {
      renderContext = initializeRenderContext(container);
      onRegisterCaptureTarget?.(() => rendererRef.current?.domElement ?? null);
    } catch (error) {
      markHoverInitializationFailed();
      setHoverNotReady('Hover inactive: renderer not initialized.');
      onRegisterCaptureTarget?.(null);
      return;
    }

    const { renderer, scene, camera, controls } = renderContext;

    const preservedViewState = preservedViewStateRef.current;
    if (preservedViewState) {
      camera.position.copy(preservedViewState.position);
      controls.target.copy(preservedViewState.target);
      rotationTargetRef.current.copy(preservedViewState.target);
      controls.update();
    }

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
    const pointerTarget = domElement;

    const raycaster = new THREE.Raycaster();
    raycaster.params.Line = { threshold: 0.02 };
    raycaster.params.Line2 = { threshold: 0.02 };

    const { beginPointerLook, updatePointerLook, endPointerLook } = createPointerLookHandlers(renderContext);

    rendererRef.current = renderer;
    sceneRef.current = scene;
    cameraRef.current = camera;
    raycasterRef.current = raycaster;
    markHoverInitialized(raycaster);

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0) {
        return;
      }

      rotationTargetRef.current.copy(controls.target);
      if (!followTargetActiveRef.current) {
        beginPointerLook(event);
      }

      updateVoxelHover(event);
      const hitTrackId = performHoverHitTest(event);
      if (hitTrackId !== null) {
        onTrackSelectionToggle(hitTrackId);
      }
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (followTargetActiveRef.current) {
        rotationTargetRef.current.copy(controls.target);
      }

      if (!followTargetActiveRef.current) {
        updatePointerLook(event);
      }

      updateVoxelHover(event);
      performHoverHitTest(event);
    };

    const handlePointerUp = (event: PointerEvent) => {
      updateVoxelHover(event);
      performHoverHitTest(event);

      if (!followTargetActiveRef.current) {
        endPointerLook(event);
      }
    };

    const handlePointerLeave = (event: PointerEvent) => {
      clearHoverState('pointer');
      clearVoxelHover();
      if (!followTargetActiveRef.current) {
        endPointerLook(event);
      }
    };

    const handleDoubleClick = (event: MouseEvent) => {
      updateVoxelHover(event);

      if (followedTrackIdRef.current !== null) {
        return;
      }

      const hoveredTarget = resolveHoveredFollowTarget();
      if (hoveredTarget) {
        onVoxelFollowRequest(hoveredTarget);
      }
    };

    const pointerDownOptions: AddEventListenerOptions = { capture: true };

    domElement.addEventListener('pointerdown', handlePointerDown, pointerDownOptions);
    pointerTarget.addEventListener('pointermove', handlePointerMove);
    pointerTarget.addEventListener('pointerup', handlePointerUp);
    pointerTarget.addEventListener('pointercancel', handlePointerUp);
    pointerTarget.addEventListener('pointerleave', handlePointerLeave);
    pointerTarget.addEventListener('dblclick', handleDoubleClick);

    resetVrPlaybackHudPlacement();
    resetVrChannelsHudPlacement();
    resetVrTracksHudPlacement();
    onRendererInitialized();

    const resizeObserver = new ResizeObserver(() => handleResize());
    resizeObserver.observe(container);
    handleResize();

    let lastRenderTickSummary: { presenting: boolean; hoveredByController: string | null } | null = null;

    const renderLoop = (timestamp: number) => {
      applyKeyboardRotation(renderer, camera, controls);
      applyKeyboardMovement(renderer, camera, controls);
      controls.update();
      rotationTargetRef.current.copy(controls.target);

      updateTrackAppearance(timestamp);

      if (followTargetActiveRef.current) {
        const rotationTarget = rotationTargetRef.current;
        if (rotationTarget) {
          if (!followTargetOffsetRef.current) {
            followTargetOffsetRef.current = new THREE.Vector3();
          }
          followTargetOffsetRef.current.copy(camera.position).sub(rotationTarget);
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
      teardownHover();

      restoreVrFoveation();
      applyVolumeStepScaleToResources(DESKTOP_VOLUME_STEP_SCALE);

      preservedViewStateRef.current = {
        position: camera.position.clone(),
        target: controls.target.clone(),
      };
      renderer.setAnimationLoop(null);

      domElement.removeEventListener('pointerdown', handlePointerDown, pointerDownOptions);
      pointerTarget.removeEventListener('pointermove', handlePointerMove);
      pointerTarget.removeEventListener('pointerup', handlePointerUp);
      pointerTarget.removeEventListener('pointercancel', handlePointerUp);
      pointerTarget.removeEventListener('pointerleave', handlePointerLeave);
      pointerTarget.removeEventListener('dblclick', handleDoubleClick);

      resizeObserver.disconnect();

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
      pointerTarget.removeEventListener('dblclick', handleDoubleClick);

      raycasterRef.current = null;
      resizeObserver.disconnect();
      destroyVolumeRenderContext(renderContext);
      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
      endVrSessionRequestRef.current = null;
      onRegisterCaptureTarget?.(null);
    };
  }, [
    applyVrPlaybackHoverState,
    applyKeyboardRotation,
    applyKeyboardMovement,
    applyVolumeStepScaleToResources,
    advancePlaybackFrame,
    containerNode,
    controllersRef,
    createPointerLookHandlers,
    createVrChannelsHud,
    createVrPlaybackHud,
    createVrTracksHud,
    followTargetActiveRef,
    followTargetOffsetRef,
    clearVoxelHoverDebug,
    endVrSessionRequestRef,
    disposeTrackResources,
    handleResize,
    initializeRenderContext,
    markHoverInitializationFailed,
    markHoverInitialized,
    onRegisterCaptureTarget,
    onRendererInitialized,
    onVoxelFollowRequest,
    playbackLoopRef,
    playbackStateRef,
    performHoverHitTest,
    raycasterRef,
    resolveHoveredFollowTarget,
    resetHoverState,
    resetVrChannelsHudPlacement,
    resetVrPlaybackHudPlacement,
    resetVrTracksHudPlacement,
    restoreVrFoveation,
    refreshTrackOverlay,
    requestHudPlacementReset,
    requestVolumeReset,
    sessionCleanupRef,
    setHoverNotReady,
    teardownHover,
    setControllerVisibility,
    updateTrackAppearance,
    updateControllerRays,
    updateVoxelHover,
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
        </div>
      </section>
    </div>
  );
}

export default VolumeViewer;
