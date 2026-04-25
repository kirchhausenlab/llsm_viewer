import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';

import {
  WRIST_MENU_BASE_GRIP_OFFSET,
  WRIST_MENU_FACE_OFFSET_METERS,
  WRIST_MENU_GRIP_OFFSET,
  applyWristMenuGripPlacement,
} from '../src/components/viewers/volume-viewer/vr/wristMenuPlacement.ts';

const EPSILON = 1e-3;

function assertVectorClose(actual: THREE.Vector3, expected: THREE.Vector3): void {
  assert.ok(
    actual.distanceTo(expected) <= EPSILON,
    `expected ${actual.toArray()} to equal ${expected.toArray()}`,
  );
}

function createMeasuredWatchGrip(): THREE.Group {
  const grip = new THREE.Group();
  const gripX = new THREE.Vector3(-0.096, -0.984, 0.151).normalize();
  const gripYRaw = new THREE.Vector3(-0.965, 0.129, 0.230).normalize();
  const gripZ = new THREE.Vector3().crossVectors(gripX, gripYRaw).normalize();
  const gripY = new THREE.Vector3().crossVectors(gripZ, gripX).normalize();
  grip.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(gripX, gripY, gripZ));
  return grip;
}

test('wrist menu placement keeps the wrist offset', () => {
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
});

test('wrist menu calibration maps the measured watch pose to book axes', () => {
  const grip = createMeasuredWatchGrip();
  const group = new THREE.Group();
  grip.add(group);

  applyWristMenuGripPlacement(group);
  grip.updateMatrixWorld(true);

  const worldQuaternion = new THREE.Quaternion();
  group.getWorldQuaternion(worldQuaternion);
  const panelForward = new THREE.Vector3(0, 0, 1).applyQuaternion(worldQuaternion).normalize();
  const panelUp = new THREE.Vector3(0, 1, 0).applyQuaternion(worldQuaternion).normalize();
  const panelRight = new THREE.Vector3(1, 0, 0).applyQuaternion(worldQuaternion).normalize();

  assertVectorClose(panelForward, new THREE.Vector3(0, 0, 1));
  assertVectorClose(panelUp, new THREE.Vector3(0, 1, 0));
  assertVectorClose(panelRight, new THREE.Vector3(1, 0, 0));
});

test('wrist menu position moves fifteen centimeters toward the viewer in the measured watch pose', () => {
  const grip = createMeasuredWatchGrip();
  const group = new THREE.Group();
  grip.add(group);

  applyWristMenuGripPlacement(group);
  grip.updateMatrixWorld(true);

  const hudPosition = new THREE.Vector3();
  group.getWorldPosition(hudPosition);
  const basePosition = new THREE.Vector3(
    WRIST_MENU_BASE_GRIP_OFFSET.x,
    WRIST_MENU_BASE_GRIP_OFFSET.y,
    WRIST_MENU_BASE_GRIP_OFFSET.z,
  );
  grip.localToWorld(basePosition);

  assertVectorClose(
    hudPosition.sub(basePosition),
    new THREE.Vector3(0, 0, WRIST_MENU_FACE_OFFSET_METERS),
  );
});
