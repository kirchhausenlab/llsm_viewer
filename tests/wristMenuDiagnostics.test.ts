import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';

import { createWristMenuPoseDiagnostic } from '../src/components/viewers/volume-viewer/vr/wristMenuDiagnostics.ts';
import { applyWristMenuGripPlacement } from '../src/components/viewers/volume-viewer/vr/wristMenuPlacement.ts';
import type { ControllerEntry, VrWristMenuHud } from '../src/components/viewers/volume-viewer/vr/types.ts';

function assertClose(actual: number | undefined, expected: number): void {
  assert.equal(typeof actual, 'number');
  assert.ok(Math.abs(actual - expected) <= 1e-3, `expected ${actual} to be close to ${expected}`);
}

test('wrist menu diagnostic reports controller, grip, and HUD axes in head coordinates', () => {
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 0, 0);
  camera.rotation.set(0, 0, 0);
  camera.updateMatrixWorld(true);

  const controller = new THREE.Group();
  controller.rotation.set(0, -Math.PI / 2, 0);
  controller.updateMatrixWorld(true);

  const grip = new THREE.Group();
  grip.rotation.set(0, Math.PI, 0);

  const wristMenuGroup = new THREE.Group();
  applyWristMenuGripPlacement(wristMenuGroup);
  grip.add(wristMenuGroup);
  grip.updateMatrixWorld(true);

  const entry = {
    controller,
    grip,
    handedness: 'left',
    wristMenuHud: {
      group: wristMenuGroup,
    } as VrWristMenuHud,
  } as ControllerEntry;

  const diagnostic = createWristMenuPoseDiagnostic(entry, 0, camera);

  assertClose(diagnostic.controllerAxes.rayMinusZ.head?.right, 1);
  assertClose(diagnostic.gripAxes.plusZ.head?.forward, 1);
  assertClose(diagnostic.hudAxes.frontPlusZ?.head?.forward, -1);
  assertClose(diagnostic.hudAxes.upPlusY?.head?.up, 1);
});
