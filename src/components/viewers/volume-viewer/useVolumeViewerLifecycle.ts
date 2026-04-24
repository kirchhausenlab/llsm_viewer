import { useEffect, useRef } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

import {
  applyDesktopViewState,
  captureDesktopViewState,
  type DesktopViewStateMap,
  type DesktopViewerCamera,
  type ViewerProjectionMode,
  type VolumeRenderContext,
} from '../../../hooks/useVolumeRenderSetup';
import type {
  ControllerEntry,
  RaycasterLike,
  VrChannelsHud,
  VrHudPlacement,
  VrPlaybackHud,
  VrTracksHud,
} from './vr';
import { DESKTOP_VOLUME_STEP_SCALE } from './vr';
import type { VolumeResources, VolumeViewerProps } from '../VolumeViewer.types';
import { destroyVolumeRenderContext } from '../../../hooks/useVolumeRenderSetup';
import { attachVolumeViewerPointerLifecycle } from './volumeViewerPointerLifecycle';
import { createVolumeViewerRenderLoop } from './volumeViewerRenderLoop';
import { disposeVolumeResources } from './useVolumeResources';
import { disposeMaterial } from './rendering';

type RenderLoopOptions = Parameters<typeof createVolumeViewerRenderLoop>[0];
type PointerLifecycleOptions = Parameters<typeof attachVolumeViewerPointerLifecycle>[0];

type PointerLookHandlers = Pick<
  PointerLifecycleOptions,
  'beginPointerLook' | 'updatePointerLook' | 'endPointerLook'
>;

type UseVolumeViewerLifecycleParams = {
  containerNode: HTMLDivElement | null;
  onRegisterCaptureTarget: VolumeViewerProps['onRegisterCaptureTarget'];
  initializeRenderContext: (container: HTMLElement) => VolumeRenderContext;
  createPointerLookHandlers: (context: VolumeRenderContext) => PointerLookHandlers;
  handleResize: () => void;
  applyKeyboardRotation: RenderLoopOptions['applyKeyboardRotation'];
  applyKeyboardMovement: RenderLoopOptions['applyKeyboardMovement'];
  updateTrackAppearance: RenderLoopOptions['updateTrackAppearance'];
  renderRoiBlOcclusionPass: RenderLoopOptions['renderRoiBlOcclusionPass'];
  refreshViewerProps: RenderLoopOptions['refreshViewerProps'];
  updateCameraFrustum: RenderLoopOptions['updateCameraFrustum'];
  renderBackgroundPass: RenderLoopOptions['renderBackgroundPass'];
  advancePlaybackFrame: RenderLoopOptions['advancePlaybackFrame'];
  refreshInitialVrPlacement: RenderLoopOptions['refreshInitialVrPlacement'];
  updateControllerRays: RenderLoopOptions['updateControllerRays'];
  controllersRef: MutableRefObject<ControllerEntry[]>;
  vrLog: RenderLoopOptions['vrLog'];
  followTargetActiveRef: RenderLoopOptions['followTargetActiveRef'];
  followTargetOffsetRef: RenderLoopOptions['followTargetOffsetRef'];
  resourcesRef: MutableRefObject<Map<string, VolumeResources>>;
  onCameraNavigationSample: RenderLoopOptions['onCameraNavigationSample'];
  emitCameraWindowState: RenderLoopOptions['emitCameraWindowState'];
  onCameraWindowStateChange: RenderLoopOptions['onCameraWindowStateChange'];
  rotationTargetRef: RenderLoopOptions['rotationTargetRef'];
  refreshVrHudPlacementsRef: MutableRefObject<(() => void) | undefined>;
  currentDimensionsRef: MutableRefObject<{ width: number; height: number; depth: number } | null>;
  rendererRef: MutableRefObject<THREE.WebGLRenderer | null>;
  sceneRef: MutableRefObject<THREE.Scene | null>;
  cameraRef: MutableRefObject<DesktopViewerCamera | null>;
  controlsRef: MutableRefObject<OrbitControls | null>;
  raycasterRef: MutableRefObject<RaycasterLike | null>;
  volumeRootGroupRef: MutableRefObject<THREE.Group | null>;
  trackGroupRef: MutableRefObject<THREE.Group | null>;
  roiGroupRef: MutableRefObject<THREE.Group | null>;
  applyVolumeRootTransformRef: MutableRefObject<((dimensions: { width: number; height: number; depth: number } | null) => void) | undefined>;
  applyTrackGroupTransformRef: MutableRefObject<((dimensions: { width: number; height: number; depth: number } | null) => void) | undefined>;
  preservedViewStateRef: MutableRefObject<DesktopViewStateMap>;
  currentProjectionModeRef: MutableRefObject<ViewerProjectionMode>;
  setRenderContextRevision: Dispatch<SetStateAction<number>>;
  refreshTrackOverlay: () => void;
  layersRef: PointerLifecycleOptions['layersRef'];
  paintbrushRef: PointerLifecycleOptions['paintbrushRef'];
  paintStrokePointerIdRef: PointerLifecycleOptions['paintStrokePointerIdRef'];
  hoverIntensityRef: PointerLifecycleOptions['hoverIntensityRef'];
  followedTrackIdRef: PointerLifecycleOptions['followedTrackIdRef'];
  updateVoxelHover: PointerLifecycleOptions['updateVoxelHover'];
  isRoiDrawToolActiveRef: PointerLifecycleOptions['isRoiDrawToolActiveRef'];
  isRoiDrawPreviewActiveRef: PointerLifecycleOptions['isRoiDrawPreviewActiveRef'];
  isRoiMoveInteractionActiveRef: PointerLifecycleOptions['isRoiMoveInteractionActiveRef'];
  isRoiMoveActiveRef: PointerLifecycleOptions['isRoiMoveActiveRef'];
  handleRoiPointerDown: PointerLifecycleOptions['handleRoiPointerDown'];
  handleRoiPointerMove: PointerLifecycleOptions['handleRoiPointerMove'];
  handleRoiPointerUp: PointerLifecycleOptions['handleRoiPointerUp'];
  handleRoiPointerLeave: PointerLifecycleOptions['handleRoiPointerLeave'];
  performRoiHitTest: PointerLifecycleOptions['performRoiHitTest'];
  performPropHitTest: PointerLifecycleOptions['performPropHitTest'];
  resolveWorldPropDragPosition: PointerLifecycleOptions['resolveWorldPropDragPosition'];
  performHoverHitTest: PointerLifecycleOptions['performHoverHitTest'];
  clearHoverState: PointerLifecycleOptions['clearHoverState'];
  clearVoxelHover: PointerLifecycleOptions['clearVoxelHover'];
  resolveHoveredFollowTarget: PointerLifecycleOptions['resolveHoveredFollowTarget'];
  onPropSelect: PointerLifecycleOptions['onPropSelect'];
  onWorldPropPositionChange: PointerLifecycleOptions['onWorldPropPositionChange'];
  onTrackSelectionToggle: PointerLifecycleOptions['onTrackSelectionToggle'];
  onVoxelFollowRequest: PointerLifecycleOptions['onVoxelFollowRequest'];
  resetHoverState: () => void;
  markHoverInitializationFailed: () => void;
  markHoverInitialized: (raycaster: THREE.Raycaster) => void;
  teardownHover: () => void;
  setHoverNotReady: (message: string) => void;
  restoreVrFoveation: () => void;
  applyVolumeStepScaleToResources: (stepScale: number) => void;
  setControllerVisibility: (visible: boolean) => void;
  xrSessionRef: MutableRefObject<XRSession | null>;
  sessionCleanupRef: MutableRefObject<(() => void) | null>;
  endVrSessionRequestRef: MutableRefObject<(() => Promise<void> | void) | null>;
  applyVrPlaybackHoverState: (
    playHovered: boolean,
    playbackSliderHovered: boolean,
    playbackSliderActive: boolean,
    fpsSliderHovered: boolean,
    fpsSliderActive: boolean,
    resetVolumeHovered: boolean,
    resetHudHovered: boolean,
    exitHovered: boolean,
    modeHovered: boolean,
  ) => void;
  createVrPlaybackHud: () => VrPlaybackHud | null;
  createVrChannelsHud: () => VrChannelsHud | null;
  createVrTracksHud: () => VrTracksHud | null;
  vrPlaybackHudRef: MutableRefObject<VrPlaybackHud | null>;
  vrChannelsHudRef: MutableRefObject<VrChannelsHud | null>;
  vrTracksHudRef: MutableRefObject<VrTracksHud | null>;
  vrPlaybackHudPlacementRef: MutableRefObject<VrHudPlacement | null>;
  vrChannelsHudPlacementRef: MutableRefObject<VrHudPlacement | null>;
  vrTracksHudPlacementRef: MutableRefObject<VrHudPlacement | null>;
  resetVrPlaybackHudPlacement: () => void;
  resetVrChannelsHudPlacement: () => void;
  resetVrTracksHudPlacement: () => void;
  updateVrPlaybackHud: () => void;
  updateVrChannelsHud: () => void;
  updateVrTracksHud: () => void;
  onRendererInitialized: () => void;
  vrTranslationHandleRef: MutableRefObject<THREE.Mesh | null>;
  vrVolumeScaleHandleRef: MutableRefObject<THREE.Mesh | null>;
  vrVolumeYawHandlesRef: MutableRefObject<THREE.Mesh[]>;
  vrVolumePitchHandleRef: MutableRefObject<THREE.Mesh | null>;
  disposeTrackResources: () => void;
  disposeRoiResources: () => void;
};

export function useVolumeViewerLifecycle({
  containerNode,
  onRegisterCaptureTarget,
  initializeRenderContext,
  createPointerLookHandlers,
  handleResize,
  applyKeyboardRotation,
  applyKeyboardMovement,
  updateTrackAppearance,
  renderRoiBlOcclusionPass,
  refreshViewerProps,
  updateCameraFrustum,
  renderBackgroundPass,
  advancePlaybackFrame,
  refreshInitialVrPlacement,
  updateControllerRays,
  controllersRef,
  vrLog,
  followTargetActiveRef,
  followTargetOffsetRef,
  resourcesRef,
  onCameraNavigationSample,
  emitCameraWindowState,
  onCameraWindowStateChange,
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
  roiGroupRef,
  applyVolumeRootTransformRef,
  applyTrackGroupTransformRef,
  preservedViewStateRef,
  currentProjectionModeRef,
  setRenderContextRevision,
  refreshTrackOverlay,
  layersRef,
  paintbrushRef,
  paintStrokePointerIdRef,
  hoverIntensityRef,
  followedTrackIdRef,
  updateVoxelHover,
  isRoiDrawToolActiveRef,
  isRoiDrawPreviewActiveRef,
  isRoiMoveInteractionActiveRef,
  isRoiMoveActiveRef,
  handleRoiPointerDown,
  handleRoiPointerMove,
  handleRoiPointerUp,
  handleRoiPointerLeave,
  performRoiHitTest,
  performPropHitTest,
  resolveWorldPropDragPosition,
  performHoverHitTest,
  clearHoverState,
  clearVoxelHover,
  resolveHoveredFollowTarget,
  onPropSelect,
  onWorldPropPositionChange,
  onTrackSelectionToggle,
  onVoxelFollowRequest,
  resetHoverState,
  markHoverInitializationFailed,
  markHoverInitialized,
  teardownHover,
  setHoverNotReady,
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
  disposeRoiResources,
}: UseVolumeViewerLifecycleParams) {
  const initializeRenderContextRef = useRef(initializeRenderContext);
  initializeRenderContextRef.current = initializeRenderContext;
  const createPointerLookHandlersRef = useRef(createPointerLookHandlers);
  createPointerLookHandlersRef.current = createPointerLookHandlers;
  const handleResizeRef = useRef(handleResize);
  handleResizeRef.current = handleResize;
  const applyKeyboardRotationRef = useRef(applyKeyboardRotation);
  applyKeyboardRotationRef.current = applyKeyboardRotation;
  const applyKeyboardMovementRef = useRef(applyKeyboardMovement);
  applyKeyboardMovementRef.current = applyKeyboardMovement;
  const updateTrackAppearanceRef = useRef(updateTrackAppearance);
  updateTrackAppearanceRef.current = updateTrackAppearance;
  const renderRoiBlOcclusionPassRef = useRef(renderRoiBlOcclusionPass);
  renderRoiBlOcclusionPassRef.current = renderRoiBlOcclusionPass;
  const refreshViewerPropsRef = useRef(refreshViewerProps);
  refreshViewerPropsRef.current = refreshViewerProps;
  const updateCameraFrustumRef = useRef(updateCameraFrustum);
  updateCameraFrustumRef.current = updateCameraFrustum;
  const renderBackgroundPassRef = useRef(renderBackgroundPass);
  renderBackgroundPassRef.current = renderBackgroundPass;
  const advancePlaybackFrameRef = useRef(advancePlaybackFrame);
  advancePlaybackFrameRef.current = advancePlaybackFrame;
  const refreshInitialVrPlacementRef = useRef(refreshInitialVrPlacement);
  refreshInitialVrPlacementRef.current = refreshInitialVrPlacement;
  const updateControllerRaysRef = useRef(updateControllerRays);
  updateControllerRaysRef.current = updateControllerRays;
  const refreshTrackOverlayRef = useRef(refreshTrackOverlay);
  refreshTrackOverlayRef.current = refreshTrackOverlay;
  const onCameraNavigationSampleRef = useRef(onCameraNavigationSample);
  onCameraNavigationSampleRef.current = onCameraNavigationSample;
  const emitCameraWindowStateRef = useRef(emitCameraWindowState);
  emitCameraWindowStateRef.current = emitCameraWindowState;
  const onCameraWindowStateChangeRef = useRef(onCameraWindowStateChange);
  onCameraWindowStateChangeRef.current = onCameraWindowStateChange;
  const updateVoxelHoverRef = useRef(updateVoxelHover);
  updateVoxelHoverRef.current = updateVoxelHover;
  const isRoiDrawToolActiveRefRef = useRef(isRoiDrawToolActiveRef);
  isRoiDrawToolActiveRefRef.current = isRoiDrawToolActiveRef;
  const isRoiDrawPreviewActiveRefRef = useRef(isRoiDrawPreviewActiveRef);
  isRoiDrawPreviewActiveRefRef.current = isRoiDrawPreviewActiveRef;
  const isRoiMoveInteractionActiveRefRef = useRef(isRoiMoveInteractionActiveRef);
  isRoiMoveInteractionActiveRefRef.current = isRoiMoveInteractionActiveRef;
  const isRoiMoveActiveRefRef = useRef(isRoiMoveActiveRef);
  isRoiMoveActiveRefRef.current = isRoiMoveActiveRef;
  const handleRoiPointerDownRef = useRef(handleRoiPointerDown);
  handleRoiPointerDownRef.current = handleRoiPointerDown;
  const handleRoiPointerMoveRef = useRef(handleRoiPointerMove);
  handleRoiPointerMoveRef.current = handleRoiPointerMove;
  const handleRoiPointerUpRef = useRef(handleRoiPointerUp);
  handleRoiPointerUpRef.current = handleRoiPointerUp;
  const handleRoiPointerLeaveRef = useRef(handleRoiPointerLeave);
  handleRoiPointerLeaveRef.current = handleRoiPointerLeave;
  const performRoiHitTestRef = useRef(performRoiHitTest);
  performRoiHitTestRef.current = performRoiHitTest;
  const performPropHitTestRef = useRef(performPropHitTest);
  performPropHitTestRef.current = performPropHitTest;
  const resolveWorldPropDragPositionRef = useRef(resolveWorldPropDragPosition);
  resolveWorldPropDragPositionRef.current = resolveWorldPropDragPosition;
  const performHoverHitTestRef = useRef(performHoverHitTest);
  performHoverHitTestRef.current = performHoverHitTest;
  const clearHoverStateRef = useRef(clearHoverState);
  clearHoverStateRef.current = clearHoverState;
  const clearVoxelHoverRef = useRef(clearVoxelHover);
  clearVoxelHoverRef.current = clearVoxelHover;
  const resolveHoveredFollowTargetRef = useRef(resolveHoveredFollowTarget);
  resolveHoveredFollowTargetRef.current = resolveHoveredFollowTarget;
  const onPropSelectRef = useRef(onPropSelect);
  onPropSelectRef.current = onPropSelect;
  const onWorldPropPositionChangeRef = useRef(onWorldPropPositionChange);
  onWorldPropPositionChangeRef.current = onWorldPropPositionChange;
  const onTrackSelectionToggleRef = useRef(onTrackSelectionToggle);
  onTrackSelectionToggleRef.current = onTrackSelectionToggle;
  const onVoxelFollowRequestRef = useRef(onVoxelFollowRequest);
  onVoxelFollowRequestRef.current = onVoxelFollowRequest;
  const resetHoverStateRef = useRef(resetHoverState);
  resetHoverStateRef.current = resetHoverState;
  const markHoverInitializationFailedRef = useRef(markHoverInitializationFailed);
  markHoverInitializationFailedRef.current = markHoverInitializationFailed;
  const markHoverInitializedRef = useRef(markHoverInitialized);
  markHoverInitializedRef.current = markHoverInitialized;
  const teardownHoverRef = useRef(teardownHover);
  teardownHoverRef.current = teardownHover;
  const setHoverNotReadyRef = useRef(setHoverNotReady);
  setHoverNotReadyRef.current = setHoverNotReady;
  const restoreVrFoveationRef = useRef(restoreVrFoveation);
  restoreVrFoveationRef.current = restoreVrFoveation;
  const applyVolumeStepScaleToResourcesRef = useRef(applyVolumeStepScaleToResources);
  applyVolumeStepScaleToResourcesRef.current = applyVolumeStepScaleToResources;
  const setControllerVisibilityRef = useRef(setControllerVisibility);
  setControllerVisibilityRef.current = setControllerVisibility;
  const applyVrPlaybackHoverStateRef = useRef(applyVrPlaybackHoverState);
  applyVrPlaybackHoverStateRef.current = applyVrPlaybackHoverState;
  const createVrPlaybackHudRef = useRef(createVrPlaybackHud);
  createVrPlaybackHudRef.current = createVrPlaybackHud;
  const createVrChannelsHudRef = useRef(createVrChannelsHud);
  createVrChannelsHudRef.current = createVrChannelsHud;
  const createVrTracksHudRef = useRef(createVrTracksHud);
  createVrTracksHudRef.current = createVrTracksHud;
  const updateVrPlaybackHudRef = useRef(updateVrPlaybackHud);
  updateVrPlaybackHudRef.current = updateVrPlaybackHud;
  const updateVrChannelsHudRef = useRef(updateVrChannelsHud);
  updateVrChannelsHudRef.current = updateVrChannelsHud;
  const updateVrTracksHudRef = useRef(updateVrTracksHud);
  updateVrTracksHudRef.current = updateVrTracksHud;
  const onRendererInitializedRef = useRef(onRendererInitialized);
  onRendererInitializedRef.current = onRendererInitialized;
  const disposeTrackResourcesRef = useRef(disposeTrackResources);
  disposeTrackResourcesRef.current = disposeTrackResources;
  const disposeRoiResourcesRef = useRef(disposeRoiResources);
  disposeRoiResourcesRef.current = disposeRoiResources;

  useEffect(() => {
    resetHoverStateRef.current();
    setHoverNotReadyRef.current('Hover inactive: renderer not initialized.');

    const container = containerNode;
    if (!container) {
      markHoverInitializationFailedRef.current();
      return;
    }

    let renderContext: ReturnType<typeof initializeRenderContext>;
    try {
      renderContext = initializeRenderContextRef.current(container);
      onRegisterCaptureTarget?.(() => rendererRef.current?.domElement ?? null);
    } catch {
      markHoverInitializationFailedRef.current();
      setHoverNotReadyRef.current('Hover inactive: renderer not initialized.');
      onRegisterCaptureTarget?.(null);
      return;
    }

    const { renderer, scene, camera, controls } = renderContext;

    const preservedViewState = preservedViewStateRef.current[currentProjectionModeRef.current];
    if (preservedViewState) {
      applyDesktopViewState(
        camera,
        controls,
        preservedViewState,
        container.clientWidth,
        container.clientHeight,
      );
      rotationTargetRef.current.copy(preservedViewState.target);
    }

    const volumeRootGroup = new THREE.Group();
    volumeRootGroup.name = 'VolumeRoot';
    scene.add(volumeRootGroup);
    volumeRootGroupRef.current = volumeRootGroup;

    const translationHandleMaterial = new THREE.MeshBasicMaterial({
      color: 0x4d9dff,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
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
      depthWrite: false,
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
      depthWrite: false,
    });
    rotationHandleMaterial.depthTest = false;
    const yawHandles: THREE.Mesh[] = [];
    for (const direction of [1, -1] as const) {
      const yawHandle = new THREE.Mesh(
        new THREE.SphereGeometry(1, 32, 32),
        rotationHandleMaterial.clone(),
      );
      yawHandle.name = direction > 0 ? 'VolumeYawHandleRight' : 'VolumeYawHandleLeft';
      yawHandle.visible = false;
      volumeRootGroup.add(yawHandle);
      yawHandles.push(yawHandle);
    }
    vrVolumeYawHandlesRef.current = yawHandles;

    const pitchHandle = new THREE.Mesh(
      new THREE.SphereGeometry(1, 32, 32),
      rotationHandleMaterial.clone(),
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

    const roiGroup = new THREE.Group();
    roiGroup.name = 'RoiOverlay';
    roiGroup.visible = false;
    volumeRootGroup.add(roiGroup);
    roiGroupRef.current = roiGroup;

    applyTrackGroupTransformRef.current?.(currentDimensionsRef.current);
    refreshTrackOverlayRef.current();
    setRenderContextRevision((revision) => revision + 1);

    cameraRef.current = camera;
    controlsRef.current = controls;

    const playbackHud = createVrPlaybackHudRef.current();
    if (playbackHud) {
      playbackHud.group.visible = false;
      scene.add(playbackHud.group);
      vrPlaybackHudRef.current = playbackHud;
      resetVrPlaybackHudPlacement();
      updateVrPlaybackHudRef.current();
      applyVrPlaybackHoverStateRef.current(false, false, false, false, false, false, false, false, false);
    } else {
      vrPlaybackHudRef.current = null;
    }

    const channelsHud = createVrChannelsHudRef.current();
    if (channelsHud) {
      channelsHud.group.visible = false;
      scene.add(channelsHud.group);
      vrChannelsHudRef.current = channelsHud;
      resetVrChannelsHudPlacement();
      updateVrChannelsHudRef.current();
    } else {
      vrChannelsHudRef.current = null;
    }

    const tracksHud = createVrTracksHudRef.current();
    if (tracksHud) {
      tracksHud.group.visible = false;
      scene.add(tracksHud.group);
      vrTracksHudRef.current = tracksHud;
      resetVrTracksHudPlacement();
      updateVrTracksHudRef.current();
    } else {
      vrTracksHudRef.current = null;
    }

    const domElement = renderer.domElement;

    const raycaster = new THREE.Raycaster();
    raycaster.params.Line = { threshold: 0.02 };
    raycaster.params.Line2 = { threshold: 0.02 };

    const { beginPointerLook, updatePointerLook, endPointerLook } = createPointerLookHandlersRef.current(renderContext);

    rendererRef.current = renderer;
    sceneRef.current = scene;
    cameraRef.current = camera;
    raycasterRef.current = raycaster;
    markHoverInitializedRef.current(raycaster);

    const detachPointerLifecycle = attachVolumeViewerPointerLifecycle({
      domElement,
      camera,
      controlsRef,
      layersRef,
      resourcesRef,
      volumeRootGroupRef,
      paintbrushRef,
      paintStrokePointerIdRef,
      hoverIntensityRef,
      followTargetActiveRef,
      followedTrackIdRef,
      rotationTargetRef,
      updateVoxelHover: (event) => updateVoxelHoverRef.current(event),
      isRoiDrawToolActiveRef: isRoiDrawToolActiveRefRef.current,
      isRoiDrawPreviewActiveRef: isRoiDrawPreviewActiveRefRef.current,
      isRoiMoveInteractionActiveRef: isRoiMoveInteractionActiveRefRef.current,
      isRoiMoveActiveRef: isRoiMoveActiveRefRef.current,
      handleRoiPointerDown: (event, canvas) => handleRoiPointerDownRef.current(event, canvas),
      handleRoiPointerMove: (event) => handleRoiPointerMoveRef.current(event),
      handleRoiPointerUp: (event, canvas) => handleRoiPointerUpRef.current(event, canvas),
      handleRoiPointerLeave: (event, canvas) => handleRoiPointerLeaveRef.current(event, canvas),
      performRoiHitTest: (event) => performRoiHitTestRef.current(event),
      performPropHitTest: (event) => performPropHitTestRef.current(event),
      resolveWorldPropDragPosition: (propId, event) =>
        resolveWorldPropDragPositionRef.current(propId, event),
      performHoverHitTest: (event) => performHoverHitTestRef.current(event),
      clearHoverState: (source) => clearHoverStateRef.current(source),
      clearVoxelHover: () => clearVoxelHoverRef.current(),
      resolveHoveredFollowTarget: () => resolveHoveredFollowTargetRef.current(),
      onPropSelect: (propId) => onPropSelectRef.current(propId),
      onWorldPropPositionChange: (propId, nextPosition) =>
        onWorldPropPositionChangeRef.current(propId, nextPosition),
      onTrackSelectionToggle: (trackId) => onTrackSelectionToggleRef.current(trackId),
      onVoxelFollowRequest: (target) => onVoxelFollowRequestRef.current(target),
      beginPointerLook,
      updatePointerLook,
      endPointerLook,
    });

    resetVrPlaybackHudPlacement();
    resetVrChannelsHudPlacement();
    resetVrTracksHudPlacement();
    onRendererInitializedRef.current();

    const resizeObserver = new ResizeObserver(() => handleResizeRef.current());
    resizeObserver.observe(container);
    handleResizeRef.current();

    const renderLoop = createVolumeViewerRenderLoop({
      renderer,
      scene,
      cameraRef,
      controlsRef,
      applyKeyboardRotation: (rendererInstance, cameraInstance, controlsInstance) =>
        applyKeyboardRotationRef.current(rendererInstance, cameraInstance, controlsInstance),
      applyKeyboardMovement: (rendererInstance, cameraInstance, controlsInstance) =>
        applyKeyboardMovementRef.current(rendererInstance, cameraInstance, controlsInstance),
      rotationTargetRef,
      updateTrackAppearance: (timestamp) => updateTrackAppearanceRef.current(timestamp),
      renderRoiBlOcclusionPass: (rendererInstance, cameraInstance) =>
        renderRoiBlOcclusionPassRef.current?.(rendererInstance, cameraInstance),
      refreshViewerProps: () => refreshViewerPropsRef.current(),
      updateCameraFrustum: (cameraInstance) => updateCameraFrustumRef.current?.(cameraInstance),
      renderBackgroundPass: (rendererInstance, cameraInstance) =>
        renderBackgroundPassRef.current?.(rendererInstance, cameraInstance),
      followTargetActiveRef,
      followTargetOffsetRef,
      roiGroupRef,
      resourcesRef,
      currentDimensionsRef,
      onCameraNavigationSample: (sample) => onCameraNavigationSampleRef.current?.(sample),
      emitCameraWindowState: () => emitCameraWindowStateRef.current?.() ?? null,
      onCameraWindowStateChange: (state) => onCameraWindowStateChangeRef.current?.(state),
      advancePlaybackFrame: (timestamp) => advancePlaybackFrameRef.current(timestamp),
      refreshVrHudPlacements: () => refreshVrHudPlacementsRef.current?.(),
      refreshInitialVrPlacement: () => refreshInitialVrPlacementRef.current?.(),
      updateControllerRays: () => updateControllerRaysRef.current(),
      controllersRef,
      vrLog,
    });
    renderer.setAnimationLoop(renderLoop);

    return () => {
      teardownHoverRef.current();

      restoreVrFoveationRef.current();
      applyVolumeStepScaleToResourcesRef.current(DESKTOP_VOLUME_STEP_SCALE);

      preservedViewStateRef.current[currentProjectionModeRef.current] = captureDesktopViewState(
        camera,
        controls.target,
        currentProjectionModeRef.current,
        controls,
      );
      renderer.setAnimationLoop(null);
      detachPointerLifecycle();
      resizeObserver.disconnect();

      const activeSession = xrSessionRef.current;
      if (activeSession) {
        try {
          sessionCleanupRef.current?.();
        } finally {
          activeSession.end().catch((error) => {
            console.error('Failed to end active XR session during viewer cleanup.', error);
          });
        }
      }

      xrSessionRef.current = null;
      sessionCleanupRef.current = null;
      setControllerVisibilityRef.current(false);

      const playbackHudToDispose = vrPlaybackHudRef.current;
      if (playbackHudToDispose) {
        if (playbackHudToDispose.group.parent) {
          playbackHudToDispose.group.parent.remove(playbackHudToDispose.group);
        }
        playbackHudToDispose.group.traverse((object) => {
          if ((object as THREE.Mesh).isMesh) {
            const mesh = object as THREE.Mesh;
            mesh.geometry.dispose?.();
            disposeMaterial(mesh.material);
          }
        });
        playbackHudToDispose.labelTexture.dispose();
        vrPlaybackHudRef.current = null;
        vrPlaybackHudPlacementRef.current = null;
      }

      const channelsHudToDispose = vrChannelsHudRef.current;
      if (channelsHudToDispose) {
        if (channelsHudToDispose.group.parent) {
          channelsHudToDispose.group.parent.remove(channelsHudToDispose.group);
        }
        channelsHudToDispose.group.traverse((object) => {
          if ((object as THREE.Mesh).isMesh) {
            const mesh = object as THREE.Mesh;
            mesh.geometry.dispose?.();
            disposeMaterial(mesh.material);
          }
        });
        channelsHudToDispose.panelTexture.dispose();
        vrChannelsHudRef.current = null;
        vrChannelsHudPlacementRef.current = null;
      }

      const tracksHudToDispose = vrTracksHudRef.current;
      if (tracksHudToDispose) {
        if (tracksHudToDispose.group.parent) {
          tracksHudToDispose.group.parent.remove(tracksHudToDispose.group);
        }
        tracksHudToDispose.group.traverse((object) => {
          if ((object as THREE.Mesh).isMesh) {
            const mesh = object as THREE.Mesh;
            mesh.geometry.dispose?.();
            disposeMaterial(mesh.material);
          }
        });
        tracksHudToDispose.panelTexture.dispose();
        vrTracksHudRef.current = null;
        vrTracksHudPlacementRef.current = null;
      }

      disposeVolumeResources(resourcesRef.current, { scene, renderer });

      const mountedTrackGroup = trackGroupRef.current;
      if (mountedTrackGroup) {
        disposeTrackResourcesRef.current();
      }
      trackGroupRef.current = null;
      const mountedRoiGroup = roiGroupRef.current;
      if (mountedRoiGroup) {
        disposeRoiResourcesRef.current();
      }
      roiGroupRef.current = null;

      const mountedVolumeRootGroup = volumeRootGroupRef.current;
      if (mountedVolumeRootGroup) {
        if (mountedTrackGroup && mountedTrackGroup.parent === mountedVolumeRootGroup) {
          mountedVolumeRootGroup.remove(mountedTrackGroup);
        }
        if (mountedRoiGroup && mountedRoiGroup.parent === mountedVolumeRootGroup) {
          mountedVolumeRootGroup.remove(mountedRoiGroup);
        }
        mountedVolumeRootGroup.clear();
        if (mountedVolumeRootGroup.parent) {
          mountedVolumeRootGroup.parent.remove(mountedVolumeRootGroup);
        }
      }

      vrTranslationHandleRef.current = null;
      vrVolumeScaleHandleRef.current = null;
      vrVolumeYawHandlesRef.current = [];
      vrVolumePitchHandleRef.current = null;
      volumeRootGroupRef.current = null;
      clearHoverStateRef.current();

      raycasterRef.current = null;
      destroyVolumeRenderContext(renderContext);
      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
      endVrSessionRequestRef.current = null;
      onRegisterCaptureTarget?.(null);
    };
  }, [
    containerNode,
    onRegisterCaptureTarget,
  ]);
}
