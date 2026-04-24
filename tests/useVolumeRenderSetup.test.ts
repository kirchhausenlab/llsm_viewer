import assert from 'node:assert/strict';
import * as THREE from 'three';

import {
  applyDesktopViewState,
  applyOrthographicZoomBounds,
  captureDesktopViewState,
  computeOrthographicVisibleHeight,
  computePerspectiveVisibleHeight,
  computeProjectedPixelsPerUnit,
  createOrthographicViewStateFromPerspective,
  createPerspectiveViewStateFromOrthographic,
} from '../src/hooks/useVolumeRenderSetup.ts';

(() => {
  const target = new THREE.Vector3(0, 0, 0);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 1000);
  camera.position.set(0, 0, 2.5);
  camera.lookAt(target);
  camera.updateMatrixWorld(true);

  const orthographicState = createOrthographicViewStateFromPerspective(camera, target);
  assert.equal(orthographicState.projectionMode, 'orthographic');
  assert.ok(orthographicState.zoom > 0);

  const orthographicCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
  orthographicCamera.position.copy(orthographicState.position);
  orthographicCamera.up.copy(orthographicState.up);
  orthographicCamera.zoom = orthographicState.zoom;
  orthographicCamera.lookAt(target);
  orthographicCamera.updateProjectionMatrix();
  orthographicCamera.updateMatrixWorld(true);

  const perspectiveState = createPerspectiveViewStateFromOrthographic(orthographicCamera, target, camera.fov);
  assert.equal(perspectiveState.projectionMode, 'perspective');

  const perspectiveVisibleHeight = computePerspectiveVisibleHeight(camera, target);
  const orthographicVisibleHeight = computeOrthographicVisibleHeight(orthographicCamera);
  assert.ok(Math.abs(perspectiveVisibleHeight - orthographicVisibleHeight) < 1e-6);
  assert.ok(Math.abs(perspectiveState.distanceToTarget - camera.position.distanceTo(target)) < 1e-6);
})();

(() => {
  const renderer = {
    domElement: { clientHeight: 800 },
  } as unknown as THREE.WebGLRenderer;
  const target = new THREE.Vector3(0, 0, 0);

  const perspectiveCamera = new THREE.PerspectiveCamera(38, 1, 0.1, 1000);
  perspectiveCamera.position.set(0, 0, 2.5);
  perspectiveCamera.lookAt(target);
  perspectiveCamera.updateMatrixWorld(true);

  const orthographicCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
  orthographicCamera.zoom = 4;
  orthographicCamera.updateProjectionMatrix();
  orthographicCamera.position.set(0, 0, 2.5);
  orthographicCamera.lookAt(target);
  orthographicCamera.updateMatrixWorld(true);

  const perspectivePixelsPerUnit = computeProjectedPixelsPerUnit(perspectiveCamera, renderer, target);
  const orthographicPixelsPerUnit = computeProjectedPixelsPerUnit(orthographicCamera, renderer, target);
  assert.ok(perspectivePixelsPerUnit > 0);
  assert.ok(orthographicPixelsPerUnit > perspectivePixelsPerUnit);
})();

(() => {
  const target = new THREE.Vector3(0, 0, 0);
  const controls = {
    target: new THREE.Vector3(),
    minZoom: 0,
    maxZoom: Number.POSITIVE_INFINITY,
    update: () => {},
  };
  const referenceZoom = 4;
  const minZoom = applyOrthographicZoomBounds(controls, referenceZoom);

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
  camera.position.set(0, 0, 2.5);
  camera.lookAt(target);
  camera.zoom = minZoom * 0.1;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);

  const capturedState = captureDesktopViewState(camera, target, 'orthographic', controls);
  assert.ok(Math.abs(capturedState.zoom - minZoom) < 1e-9);

  applyDesktopViewState(
    camera,
    controls as any,
    {
      projectionMode: 'orthographic',
      position: camera.position.clone(),
      target: target.clone(),
      up: camera.up.clone(),
      zoom: minZoom * 0.1,
      distanceToTarget: camera.position.distanceTo(target),
    },
    800,
    800,
  );
  assert.ok(Math.abs(camera.zoom - minZoom) < 1e-9);
})();
