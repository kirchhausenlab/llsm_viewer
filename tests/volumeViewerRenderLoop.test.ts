import assert from 'node:assert/strict';
import * as THREE from 'three';

import { createVolumeViewerRenderLoop } from '../src/components/viewers/volume-viewer/volumeViewerRenderLoop.ts';

(() => {
  const calls: string[] = [];
  const controls = {
    target: new THREE.Vector3(),
    update: () => {
      calls.push('controls.update');
    },
  };
  const renderer = {
    xr: { isPresenting: false },
    render: () => {
      calls.push('renderer.render');
    },
  };
  const camera = new THREE.PerspectiveCamera();
  camera.updateMatrixWorld();

  const renderLoop = createVolumeViewerRenderLoop({
    renderer: renderer as any,
    scene: new THREE.Scene(),
    camera,
    controls: controls as any,
    applyKeyboardRotation: () => {
      calls.push('applyKeyboardRotation');
    },
    applyKeyboardMovement: () => {
      calls.push('applyKeyboardMovement');
    },
    rotationTargetRef: { current: { copy: () => {} } } as any,
    updateTrackAppearance: () => {
      calls.push('updateTrackAppearance');
    },
    refreshViewerProps: () => {
      calls.push('refreshViewerProps');
    },
    followTargetActiveRef: { current: false },
    followTargetOffsetRef: { current: null },
    resourcesRef: { current: new Map() },
    onCameraNavigationSample: undefined,
    advancePlaybackFrame: () => {
      calls.push('advancePlaybackFrame');
    },
    refreshVrHudPlacements: () => {
      calls.push('refreshVrHudPlacements');
    },
    updateControllerRays: () => {
      calls.push('updateControllerRays');
    },
    controllersRef: { current: [] },
    vrLog: () => {},
  });

  renderLoop(0);

  assert.ok(calls.indexOf('refreshViewerProps') >= 0);
  assert.ok(calls.indexOf('renderer.render') >= 0);
  assert.ok(calls.indexOf('refreshViewerProps') < calls.indexOf('renderer.render'));
})();
