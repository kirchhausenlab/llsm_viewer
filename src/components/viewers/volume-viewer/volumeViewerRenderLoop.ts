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
  advancePlaybackFrame,
  refreshVrHudPlacements,
  updateControllerRays,
  controllersRef,
  vrLog
}: CreateVolumeViewerRenderLoopOptions): (timestamp: number) => void {
  let lastRenderTickSummary: { presenting: boolean; hoveredByController: string | null } | null = null;
  const cameraWorldPosition = new THREE.Vector3();

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

    const resources = resourcesRef.current;
    cameraWorldPosition.setFromMatrixPosition(camera.matrixWorld);
    for (const resource of resources.values()) {
      const { mesh } = resource;
      mesh.updateMatrixWorld();
      resource.updateGpuBrickResidencyForCamera?.(cameraWorldPosition);
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
