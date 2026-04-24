import type { MutableRefObject } from 'react';
import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

import type { VolumeResources } from '../VolumeViewer.types';
import type { CameraWindowState } from '../../../types/camera';
import {
  computeProjectedPixelsPerUnit,
  getProjectionModeForCamera,
  type DesktopViewerCamera,
  type ViewerCameraNavigationSample,
} from '../../../hooks/useVolumeRenderSetup';
import { HOVER_PULSE_SPEED } from './rendering';

type CreateVolumeViewerRenderLoopOptions = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  cameraRef?: MutableRefObject<DesktopViewerCamera | null>;
  controlsRef?: MutableRefObject<OrbitControls | null>;
  camera?: DesktopViewerCamera;
  controls?: OrbitControls;
  applyKeyboardRotation: (
    renderer: THREE.WebGLRenderer,
    camera: DesktopViewerCamera,
    controls: OrbitControls
  ) => void;
  applyKeyboardMovement: (
    renderer: THREE.WebGLRenderer,
    camera: DesktopViewerCamera,
    controls: OrbitControls
  ) => void;
  rotationTargetRef: MutableRefObject<THREE.Vector3>;
  updateTrackAppearance: (timestamp: number) => void;
  renderRoiBlOcclusionPass?: (renderer: THREE.WebGLRenderer, camera: THREE.Camera) => void;
  refreshViewerProps: () => void;
  updateCameraFrustum?: (camera: DesktopViewerCamera) => void;
  renderBackgroundPass?: (renderer: THREE.WebGLRenderer, camera: DesktopViewerCamera) => void;
  followTargetActiveRef: MutableRefObject<boolean>;
  followTargetOffsetRef: MutableRefObject<THREE.Vector3 | null>;
  roiGroupRef?: MutableRefObject<THREE.Group | null>;
  resourcesRef: MutableRefObject<Map<string, VolumeResources>>;
  currentDimensionsRef?: MutableRefObject<{ width: number; height: number; depth: number } | null>;
  onCameraNavigationSample?: (sample: ViewerCameraNavigationSample) => void;
  emitCameraWindowState?: () => CameraWindowState | null;
  onCameraWindowStateChange?: (state: CameraWindowState | null) => void;
  advancePlaybackFrame: (timestamp: number) => void;
  refreshVrHudPlacements: () => void;
  refreshInitialVrPlacement?: () => void;
  updateControllerRays: () => void;
  controllersRef: MutableRefObject<Array<{ hoverTrackId: string | null }>>;
  vrLog: (...args: Parameters<typeof console.debug>) => void;
};

export function createVolumeViewerRenderLoop({
  renderer,
  scene,
  cameraRef,
  controlsRef,
  camera: staticCamera,
  controls: staticControls,
  applyKeyboardRotation,
  applyKeyboardMovement,
  rotationTargetRef,
  updateTrackAppearance,
  renderRoiBlOcclusionPass,
  refreshViewerProps,
  updateCameraFrustum,
  renderBackgroundPass,
  followTargetActiveRef,
  followTargetOffsetRef,
  roiGroupRef,
  resourcesRef,
  currentDimensionsRef,
  onCameraNavigationSample,
  emitCameraWindowState,
  onCameraWindowStateChange,
  advancePlaybackFrame,
  refreshVrHudPlacements,
  refreshInitialVrPlacement,
  updateControllerRays,
  controllersRef,
  vrLog
}: CreateVolumeViewerRenderLoopOptions): (timestamp: number) => void {
  let lastRenderTickSummary: { presenting: boolean; hoveredByController: string | null } | null = null;
  const cameraWorldPosition = new THREE.Vector3();
  const cameraWorldDirection = new THREE.Vector3();
  const fallbackProjectionTarget = new THREE.Vector3();
  const previousCameraPosition = new THREE.Vector3(Number.NaN, Number.NaN, Number.NaN);
  const previousTarget = new THREE.Vector3(Number.NaN, Number.NaN, Number.NaN);
  const worldBoundsSphere = new THREE.Sphere();
  let lastCameraSampleSentAtMs = Number.NEGATIVE_INFINITY;
  let lastCameraWindowStateSentAtMs = Number.NEGATIVE_INFINITY;
  let lastMovementState = false;

  const CAMERA_MOVEMENT_EPSILON_SQ = 1e-8;
  const CAMERA_SAMPLE_INTERVAL_MS = 100;

  return (timestamp: number) => {
    const camera = cameraRef?.current ?? staticCamera ?? null;
    const controls = controlsRef?.current ?? staticControls ?? null;
    if (!camera || !controls) {
      return;
    }

    const isXrPresenting = renderer.xr.isPresenting;
    if (isXrPresenting && camera instanceof THREE.PerspectiveCamera) {
      renderer.xr.updateCamera(camera);
    } else {
      applyKeyboardRotation(renderer, camera, controls);
      applyKeyboardMovement(renderer, camera, controls);
      controls.update();
    }
    camera.updateMatrixWorld(true);
    if (isXrPresenting) {
      refreshInitialVrPlacement?.();
    }
    if (!isXrPresenting) {
      rotationTargetRef.current.copy(controls.target);
    }

    updateTrackAppearance(timestamp);
    refreshViewerProps();
    updateCameraFrustum?.(camera);

    if (followTargetActiveRef.current) {
      const rotationTarget = rotationTargetRef.current;
      if (rotationTarget) {
        if (!followTargetOffsetRef.current) {
          followTargetOffsetRef.current = new THREE.Vector3();
        }
        followTargetOffsetRef.current.copy(camera.position).sub(rotationTarget);
      }
    }

    const hasPreviousCameraPose = Number.isFinite(previousCameraPosition.x) && Number.isFinite(previousTarget.x);
    const cameraMoved =
      !hasPreviousCameraPose ||
      camera.position.distanceToSquared(previousCameraPosition) > CAMERA_MOVEMENT_EPSILON_SQ ||
      controls.target.distanceToSquared(previousTarget) > CAMERA_MOVEMENT_EPSILON_SQ;
    const movementStateChanged = cameraMoved !== lastMovementState;
    previousCameraPosition.copy(camera.position);
    previousTarget.copy(controls.target);

    const resources = resourcesRef.current;
    cameraWorldPosition.setFromMatrixPosition(camera.matrixWorld);
    camera.getWorldDirection(cameraWorldDirection);
    let nearestVisibleVolumeDistance = Number.POSITIVE_INFINITY;
    let nearestVisibleVolumeTarget: THREE.Vector3 | null = null;
    for (const resource of resources.values()) {
      const { mesh } = resource;
      mesh.updateMatrixWorld();
      resource.updateGpuBrickResidencyForCamera?.({
        cameraWorldPosition,
        projectionMode: getProjectionModeForCamera(camera),
        targetWorldPosition: controls.target,
        viewDirectionWorld: cameraWorldDirection,
        zoom: camera.zoom ?? 1,
      });

      if (mesh.visible) {
        const geometry = mesh.geometry as THREE.BufferGeometry;
        if (geometry.boundingSphere === null) {
          geometry.computeBoundingSphere();
        }
        const localBoundsSphere = geometry.boundingSphere;
        if (localBoundsSphere) {
          worldBoundsSphere.copy(localBoundsSphere);
          worldBoundsSphere.applyMatrix4(mesh.matrixWorld);
          const distanceToBounds = Math.max(
            0,
            cameraWorldPosition.distanceTo(worldBoundsSphere.center) - worldBoundsSphere.radius
          );
          if (distanceToBounds < nearestVisibleVolumeDistance) {
            nearestVisibleVolumeDistance = distanceToBounds;
            nearestVisibleVolumeTarget = worldBoundsSphere.center.clone();
          }
        }
      }
    }

    const currentDimensions = currentDimensionsRef?.current ?? null;
    const referenceDimension = currentDimensions
      ? Math.max(currentDimensions.width, currentDimensions.height, currentDimensions.depth, 1)
      : 1;
    const projectionTarget =
      nearestVisibleVolumeTarget ??
      fallbackProjectionTarget.copy(camera.position).add(
        camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(Math.max(referenceDimension * 0.5, 1)),
      );

    const shouldEmitCameraSample =
      !Number.isFinite(lastCameraSampleSentAtMs) ||
      timestamp - lastCameraSampleSentAtMs >= CAMERA_SAMPLE_INTERVAL_MS ||
      movementStateChanged;

    if (onCameraNavigationSample) {
      if (shouldEmitCameraSample) {
        lastCameraSampleSentAtMs = timestamp;
        const sampledCameraDistance = Number.isFinite(nearestVisibleVolumeDistance)
          ? nearestVisibleVolumeDistance
          : Math.max(referenceDimension * 0.5, 1);
        const projectedPixelsPerUnit = computeProjectedPixelsPerUnit(
          camera,
          renderer,
          projectionTarget,
        );
        onCameraNavigationSample({
          projectionMode: getProjectionModeForCamera(camera),
          distanceToTarget: sampledCameraDistance,
          projectedPixelsPerVoxel: projectedPixelsPerUnit / referenceDimension,
          isMoving: cameraMoved,
          capturedAtMs: Date.now()
        });
      }
    }

    if (onCameraWindowStateChange && emitCameraWindowState) {
      const shouldEmitCameraWindowState =
        !Number.isFinite(lastCameraWindowStateSentAtMs) ||
        timestamp - lastCameraWindowStateSentAtMs >= CAMERA_SAMPLE_INTERVAL_MS ||
        movementStateChanged;
      if (shouldEmitCameraWindowState) {
        lastCameraWindowStateSentAtMs = timestamp;
        onCameraWindowStateChange(emitCameraWindowState());
      }
    }

    if (shouldEmitCameraSample || (onCameraWindowStateChange && emitCameraWindowState)) {
      lastMovementState = cameraMoved;
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
    refreshVrHudPlacements();

    updateControllerRays();
    const hoveredEntry = controllersRef.current.find((entry) => entry.hoverTrackId);
    const renderSummary = {
      presenting: isXrPresenting,
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
    const roiGroup = roiGroupRef?.current ?? null;
    const previousRoiVisibility = roiGroup?.visible ?? false;
    const previousAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderBackgroundPass?.(renderer, camera);
    if (roiGroup) {
      roiGroup.visible = false;
    }
    renderer.render(scene, camera);
    if (roiGroup) {
      roiGroup.visible = previousRoiVisibility;
    }
    renderRoiBlOcclusionPass?.(renderer, camera);
    renderer.autoClear = previousAutoClear;
  };
}
