import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';

import {
  WRIST_MENU_GRIP_OFFSET,
  applyWristMenuGripPlacement,
} from '../src/components/viewers/volume-viewer/vr/wristMenuPlacement.ts';

const EPSILON = 1e-12;

function assertVectorClose(actual: THREE.Vector3, expected: THREE.Vector3): void {
  assert.ok(
    actual.distanceTo(expected) <= EPSILON,
    `expected ${actual.toArray()} to equal ${expected.toArray()}`,
  );
}

test('wrist menu placement keeps the wrist offset and faces the watch pose viewer', () => {
  const group = new THREE.Group();
  group.position.set(1, 2, 3);
  group.rotation.set(-Math.PI / 2, Math.PI / 3, Math.PI / 4);

  applyWristMenuGripPlacement(group);
  group.updateMatrixWorld(true);

  assertVectorClose(
    group.position,
    new THREE.Vector3(
      WRIST_MENU_GRIP_OFFSET.x,
      WRIST_MENU_GRIP_OFFSET.y,
      WRIST_MENU_GRIP_OFFSET.z,
    ),
  );

  const panelForward = new THREE.Vector3(0, 0, 1).applyQuaternion(group.quaternion).normalize();
  const panelUp = new THREE.Vector3(0, 1, 0).applyQuaternion(group.quaternion).normalize();

  assertVectorClose(panelForward, new THREE.Vector3(0, 0, -1));
  assertVectorClose(panelUp, new THREE.Vector3(0, 1, 0));
});
