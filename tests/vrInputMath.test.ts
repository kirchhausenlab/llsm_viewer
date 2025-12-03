import assert from 'node:assert/strict';
import * as THREE from 'three';

import { clampUiRayLength } from '../src/ui/components/volume-viewer/vr/controllerHudInteractions.ts';
import {
  computePitchRotation,
  computeYawRotation,
  createVolumeScaleState,
} from '../src/ui/components/volume-viewer/vr/controllerVolumeGestures.ts';

console.log('Starting VR input math tests');

(() => {
  assert.strictEqual(clampUiRayLength(0.01), 0.12);
  assert.strictEqual(clampUiRayLength(1.25), 1.25);
  assert.strictEqual(clampUiRayLength(20), 8);
})();

(() => {
  const forward = new THREE.Vector3(0, 0, -1);
  const right = new THREE.Vector3(1, 0, 0);
  const direction = new THREE.Vector3(0, 0, -2);
  assert.strictEqual(computeYawRotation(direction, forward, right, 0.7), 0);
  const fallback = 0.42;
  assert.strictEqual(computeYawRotation(new THREE.Vector3(), forward, right, fallback), fallback);
})();

(() => {
  const forward = new THREE.Vector3(0, 0, 1);
  const direction = new THREE.Vector3(0, 1, 1);
  const expected = Math.atan2(1, 1);
  assert.strictEqual(computePitchRotation(direction, forward, 0), expected);
  const fallback = -0.5;
  assert.strictEqual(computePitchRotation(new THREE.Vector3(), forward, fallback), fallback);
})();

(() => {
  const handlePoint = new THREE.Vector3(1, 0, 0);
  const centerPoint = new THREE.Vector3(0, 0, 0);
  const state = createVolumeScaleState(handlePoint, centerPoint, 2);
  assert.ok(state);
  assert.deepEqual(state?.direction.toArray(), [1, 0, 0]);
  assert.strictEqual(Number(state?.baseLength.toFixed(6)), 0.5);
  assert.strictEqual(createVolumeScaleState(centerPoint, centerPoint, 1), null);
})();

console.log('VR input math tests passed');
