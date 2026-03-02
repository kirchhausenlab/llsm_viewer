import type { MutableRefObject } from 'react';
import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

import type { VolumeResources } from '../VolumeViewer.types';
import { HOVER_PULSE_SPEED } from './rendering';

type CreateVolumeViewerRenderLoopOptions = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  applyKeyboardRotation: (
    renderer: THREE.WebGLRenderer,
    camera: THREE.PerspectiveCamera,
    controls: OrbitControls
  ) => void;
  applyKeyboardMovement: (
    renderer: THREE.WebGLRenderer,
    camera: THREE.PerspectiveCamera,
    controls: OrbitControls
  ) => void;
  rotationTargetRef: MutableRefObject<THREE.Vector3>;
  updateTrackAppearance: (timestamp: number) => void;
  followTargetActiveRef: MutableRefObject<boolean>;
  followTargetOffsetRef: MutableRefObject<THREE.Vector3 | null>;
  resourcesRef: MutableRefObject<Map<string, VolumeResources>>;
  onCameraNavigationSample?: (sample: {
    distanceToTarget: number;
    isMoving: boolean;
    capturedAtMs: number;
  }) => void;
  advancePlaybackFrame: (timestamp: number) => void;
  refreshVrHudPlacements: () => void;
  updateControllerRays: () => void;
  controllersRef: MutableRefObject<Array<{ hoverTrackId: string | null }>>;
  vrLog: (...args: Parameters<typeof console.debug>) => void;
};

export function createVolumeViewerRenderLoop({
  renderer,
  scene,
  camera,
  controls,
  applyKeyboardRotation,
  applyKeyboardMovement,
  rotationTargetRef,
  updateTrackAppearance,
  followTargetActiveRef,
  followTargetOffsetRef,
  resourcesRef,
  onCameraNavigationSample,
  advancePlaybackFrame,
  refreshVrHudPlacements,
  updateControllerRays,
  controllersRef,
  vrLog
}: CreateVolumeViewerRenderLoopOptions): (timestamp: number) => void {
  let lastRenderTickSummary: { presenting: boolean; hoveredByController: string | null } | null = null;
  const cameraWorldPosition = new THREE.Vector3();
  const previousCameraPosition = new THREE.Vector3(Number.NaN, Number.NaN, Number.NaN);
  const previousTarget = new THREE.Vector3(Number.NaN, Number.NaN, Number.NaN);
  const worldBoundsSphere = new THREE.Sphere();
  const adaptiveLodBaseEnabledByMesh = new WeakMap<THREE.Mesh, number>();
  let lastCameraSampleSentAtMs = Number.NEGATIVE_INFINITY;
  let lastMovementState = false;

  const CAMERA_MOVEMENT_EPSILON_SQ = 1e-8;
  const CAMERA_SAMPLE_INTERVAL_MS = 100;

  return (timestamp: number) => {
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

    const hasPreviousCameraPose = Number.isFinite(previousCameraPosition.x) && Number.isFinite(previousTarget.x);
    const cameraMoved =
      !hasPreviousCameraPose ||
      camera.position.distanceToSquared(previousCameraPosition) > CAMERA_MOVEMENT_EPSILON_SQ ||
      controls.target.distanceToSquared(previousTarget) > CAMERA_MOVEMENT_EPSILON_SQ;
    previousCameraPosition.copy(camera.position);
    previousTarget.copy(controls.target);

    const resources = resourcesRef.current;
    cameraWorldPosition.setFromMatrixPosition(camera.matrixWorld);
    let nearestVisibleVolumeDistance = Number.POSITIVE_INFINITY;
    for (const resource of resources.values()) {
      const { mesh } = resource;
      mesh.updateMatrixWorld();
      resource.updateGpuBrickResidencyForCamera?.(cameraWorldPosition);

      if (resource.mode !== '3d') {
        continue;
      }
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
          }
        }
      }
      const uniforms = (mesh.material as THREE.ShaderMaterial).uniforms as Record<
        string,
        { value: unknown } | undefined
      >;
      const adaptiveUniform = uniforms.u_adaptiveLodEnabled;
      if (!adaptiveUniform || typeof adaptiveUniform.value !== 'number') {
        continue;
      }
      const currentAdaptiveEnabled = Number(adaptiveUniform.value);
      if (!Number.isFinite(currentAdaptiveEnabled)) {
        continue;
      }
      if (!cameraMoved) {
        adaptiveLodBaseEnabledByMesh.set(mesh, currentAdaptiveEnabled);
      }
      const baseAdaptiveEnabled =
        adaptiveLodBaseEnabledByMesh.get(mesh) ?? currentAdaptiveEnabled;
      const nextAdaptiveEnabled =
        cameraMoved && baseAdaptiveEnabled > 0.5 ? 0 : baseAdaptiveEnabled;
      if (Math.abs(currentAdaptiveEnabled - nextAdaptiveEnabled) > 1e-6) {
        adaptiveUniform.value = nextAdaptiveEnabled;
      }
    }

    if (onCameraNavigationSample) {
      const shouldEmitCameraSample =
        !Number.isFinite(lastCameraSampleSentAtMs) ||
        timestamp - lastCameraSampleSentAtMs >= CAMERA_SAMPLE_INTERVAL_MS ||
        cameraMoved !== lastMovementState;
      if (shouldEmitCameraSample) {
        lastCameraSampleSentAtMs = timestamp;
        lastMovementState = cameraMoved;
        const sampledCameraDistance = Number.isFinite(nearestVisibleVolumeDistance)
          ? nearestVisibleVolumeDistance
          : camera.position.distanceTo(controls.target);
        onCameraNavigationSample({
          distanceToTarget: sampledCameraDistance,
          isMoving: cameraMoved,
          capturedAtMs: Date.now()
        });
      }
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
}
