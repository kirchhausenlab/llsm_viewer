import { useEffect, useRef } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

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
import { disposeMaterial } from './rendering';

type RenderLoopOptions = Parameters<typeof createVolumeViewerRenderLoop>[0];
type PointerLifecycleOptions = Parameters<typeof attachVolumeViewerPointerLifecycle>[0];

type VolumeRenderContext = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
};

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
  advancePlaybackFrame: RenderLoopOptions['advancePlaybackFrame'];
  updateControllerRays: RenderLoopOptions['updateControllerRays'];
  controllersRef: MutableRefObject<ControllerEntry[]>;
  vrLog: RenderLoopOptions['vrLog'];
  followTargetActiveRef: RenderLoopOptions['followTargetActiveRef'];
  followTargetOffsetRef: RenderLoopOptions['followTargetOffsetRef'];
  resourcesRef: MutableRefObject<Map<string, VolumeResources>>;
  rotationTargetRef: RenderLoopOptions['rotationTargetRef'];
  refreshVrHudPlacementsRef: MutableRefObject<(() => void) | undefined>;
  currentDimensionsRef: MutableRefObject<{ width: number; height: number; depth: number } | null>;
  rendererRef: MutableRefObject<THREE.WebGLRenderer | null>;
  sceneRef: MutableRefObject<THREE.Scene | null>;
  cameraRef: MutableRefObject<THREE.PerspectiveCamera | null>;
  controlsRef: MutableRefObject<OrbitControls | null>;
  raycasterRef: MutableRefObject<RaycasterLike | null>;
  volumeRootGroupRef: MutableRefObject<THREE.Group | null>;
  trackGroupRef: MutableRefObject<THREE.Group | null>;
  applyVolumeRootTransformRef: MutableRefObject<((dimensions: { width: number; height: number; depth: number } | null) => void) | undefined>;
  applyTrackGroupTransformRef: MutableRefObject<((dimensions: { width: number; height: number; depth: number } | null) => void) | undefined>;
  preservedViewStateRef: MutableRefObject<{
    position: THREE.Vector3;
    target: THREE.Vector3;
  } | null>;
  setRenderContextRevision: Dispatch<SetStateAction<number>>;
  refreshTrackOverlay: () => void;
  paintbrushRef: PointerLifecycleOptions['paintbrushRef'];
  paintStrokePointerIdRef: PointerLifecycleOptions['paintStrokePointerIdRef'];
  hoverIntensityRef: PointerLifecycleOptions['hoverIntensityRef'];
  followedTrackIdRef: PointerLifecycleOptions['followedTrackIdRef'];
  updateVoxelHover: PointerLifecycleOptions['updateVoxelHover'];
  performHoverHitTest: PointerLifecycleOptions['performHoverHitTest'];
  clearHoverState: PointerLifecycleOptions['clearHoverState'];
  clearVoxelHover: PointerLifecycleOptions['clearVoxelHover'];
  resolveHoveredFollowTarget: PointerLifecycleOptions['resolveHoveredFollowTarget'];
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
  const advancePlaybackFrameRef = useRef(advancePlaybackFrame);
  advancePlaybackFrameRef.current = advancePlaybackFrame;
  const updateControllerRaysRef = useRef(updateControllerRays);
  updateControllerRaysRef.current = updateControllerRays;
  const refreshTrackOverlayRef = useRef(refreshTrackOverlay);
  refreshTrackOverlayRef.current = refreshTrackOverlay;
  const updateVoxelHoverRef = useRef(updateVoxelHover);
  updateVoxelHoverRef.current = updateVoxelHover;
  const performHoverHitTestRef = useRef(performHoverHitTest);
  performHoverHitTestRef.current = performHoverHitTest;
  const clearHoverStateRef = useRef(clearHoverState);
  clearHoverStateRef.current = clearHoverState;
  const clearVoxelHoverRef = useRef(clearVoxelHover);
  clearVoxelHoverRef.current = clearVoxelHover;
  const resolveHoveredFollowTargetRef = useRef(resolveHoveredFollowTarget);
  resolveHoveredFollowTargetRef.current = resolveHoveredFollowTarget;
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
      controls,
      paintbrushRef,
      paintStrokePointerIdRef,
      hoverIntensityRef,
      followTargetActiveRef,
      followedTrackIdRef,
      rotationTargetRef,
      updateVoxelHover: (event) => updateVoxelHoverRef.current(event),
      performHoverHitTest: (event) => performHoverHitTestRef.current(event),
      clearHoverState: (source) => clearHoverStateRef.current(source),
      clearVoxelHover: () => clearVoxelHoverRef.current(),
      resolveHoveredFollowTarget: () => resolveHoveredFollowTargetRef.current(),
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
      camera,
      controls,
      applyKeyboardRotation: (rendererInstance, cameraInstance, controlsInstance) =>
        applyKeyboardRotationRef.current(rendererInstance, cameraInstance, controlsInstance),
      applyKeyboardMovement: (rendererInstance, cameraInstance, controlsInstance) =>
        applyKeyboardMovementRef.current(rendererInstance, cameraInstance, controlsInstance),
      rotationTargetRef,
      updateTrackAppearance: (timestamp) => updateTrackAppearanceRef.current(timestamp),
      followTargetActiveRef,
      followTargetOffsetRef,
      resourcesRef,
      advancePlaybackFrame: (timestamp) => advancePlaybackFrameRef.current(timestamp),
      refreshVrHudPlacements: () => refreshVrHudPlacementsRef.current?.(),
      updateControllerRays: () => updateControllerRaysRef.current(),
      controllersRef,
      vrLog,
    });
    renderer.setAnimationLoop(renderLoop);

    return () => {
      teardownHoverRef.current();

      restoreVrFoveationRef.current();
      applyVolumeStepScaleToResourcesRef.current(DESKTOP_VOLUME_STEP_SCALE);

      preservedViewStateRef.current = {
        position: camera.position.clone(),
        target: controls.target.clone(),
      };
      renderer.setAnimationLoop(null);
      detachPointerLifecycle();
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

      const resources = resourcesRef.current;
      for (const resource of resources.values()) {
        scene.remove(resource.mesh);
        resource.mesh.geometry.dispose();
        disposeMaterial(resource.mesh.material);
        resource.texture.dispose();
      }
      resources.clear();

      const mountedTrackGroup = trackGroupRef.current;
      if (mountedTrackGroup) {
        disposeTrackResourcesRef.current();
      }
      trackGroupRef.current = null;

      const mountedVolumeRootGroup = volumeRootGroupRef.current;
      if (mountedVolumeRootGroup) {
        if (mountedTrackGroup && mountedTrackGroup.parent === mountedVolumeRootGroup) {
          mountedVolumeRootGroup.remove(mountedTrackGroup);
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
