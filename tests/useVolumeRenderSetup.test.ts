import assert from 'node:assert/strict';
import * as THREE from 'three';

import {
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
