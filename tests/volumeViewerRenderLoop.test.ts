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

(() => {
  let sample: {
    projectionMode: string;
    distanceToTarget: number;
    projectedPixelsPerVoxel: number;
    isMoving: boolean;
    capturedAtMs: number;
  } | null = null;
  const controls = {
    target: new THREE.Vector3(),
    update: () => {},
  };
  const renderer = {
    domElement: { clientHeight: 800 },
    xr: { isPresenting: false },
    render: () => {},
  };
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
  camera.zoom = 4;
  camera.updateProjectionMatrix();
  camera.position.set(0, 0, 10);
  camera.updateMatrixWorld();

  const renderLoop = createVolumeViewerRenderLoop({
    renderer: renderer as any,
    scene: new THREE.Scene(),
    camera,
    controls: controls as any,
    applyKeyboardRotation: () => {},
    applyKeyboardMovement: () => {},
    rotationTargetRef: { current: new THREE.Vector3() } as any,
    updateTrackAppearance: () => {},
    refreshViewerProps: () => {},
    followTargetActiveRef: { current: false },
    followTargetOffsetRef: { current: null },
    resourcesRef: { current: new Map() },
    currentDimensionsRef: { current: { width: 100, height: 100, depth: 100 } },
    onCameraNavigationSample: (nextSample) => {
      sample = nextSample;
    },
    advancePlaybackFrame: () => {},
    refreshVrHudPlacements: () => {},
    updateControllerRays: () => {},
    controllersRef: { current: [] },
    vrLog: () => {},
  });

  renderLoop(0);

  assert.equal(sample?.projectionMode, 'orthographic');
  assert.ok((sample?.projectedPixelsPerVoxel ?? 0) > 0);
})();

(() => {
  const calls: string[] = [];
  const controls = {
    target: new THREE.Vector3(),
    update: () => {
      calls.push('controls.update');
    },
  };
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 0, 2);
  camera.updateMatrixWorld(true);
  const xrCamera = new THREE.PerspectiveCamera();
  xrCamera.position.set(0, 1.6, 0);
  xrCamera.lookAt(new THREE.Vector3(0, 1.6, -1));
  xrCamera.updateMatrixWorld(true);

  const renderer = {
    domElement: { clientHeight: 800 },
    xr: {
      isPresenting: true,
      updateCamera: (targetCamera: THREE.PerspectiveCamera) => {
        calls.push('xr.updateCamera');
        targetCamera.position.copy(xrCamera.position);
        targetCamera.quaternion.copy(xrCamera.quaternion);
        targetCamera.updateMatrixWorld(true);
      },
    },
    render: () => {
      calls.push('renderer.render');
    },
  };

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
    rotationTargetRef: { current: new THREE.Vector3() } as any,
    updateTrackAppearance: () => {},
    refreshViewerProps: () => {},
    followTargetActiveRef: { current: false },
    followTargetOffsetRef: { current: null },
    resourcesRef: { current: new Map() },
    currentDimensionsRef: { current: { width: 100, height: 100, depth: 100 } },
    advancePlaybackFrame: () => {},
    refreshVrHudPlacements: () => {},
    updateControllerRays: () => {},
    controllersRef: { current: [] },
    vrLog: () => {},
  });

  renderLoop(0);

  assert.ok(calls.includes('xr.updateCamera'));
  assert.ok(!calls.includes('controls.update'));
  assert.ok(!calls.includes('applyKeyboardRotation'));
  assert.ok(!calls.includes('applyKeyboardMovement'));
  assert.equal(camera.position.y, 1.6);
})();
