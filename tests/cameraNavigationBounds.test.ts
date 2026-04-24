import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';

import { createDesktopCamera } from '../src/hooks/useVolumeRenderSetup.ts';
import { resolveBackgroundGridStyle } from '../src/components/viewers/volume-viewer/backgroundGrid.ts';
import {
  resolveAdaptiveCameraFrustum,
  resolveSceneWorldBounds,
} from '../src/components/viewers/volume-viewer/cameraNavigationBounds.ts';

test('resolveSceneWorldBounds returns the transformed dataset center and radius', () => {
  const group = new THREE.Group();
  group.position.set(2, -3, 4);
  group.updateMatrixWorld(true);

  const bounds = resolveSceneWorldBounds({ width: 5, height: 7, depth: 9 }, group);

  assert.ok(bounds);
  assert.deepEqual(
    bounds.centerWorld.toArray().map((value) => Number(value.toFixed(6))),
    [4, 0, 8],
  );
  assert.ok(bounds.radius > 0);
});

test('resolveAdaptiveCameraFrustum expands as the camera moves farther away', () => {
  const camera = createDesktopCamera('perspective', 1200, 800);
  const bounds = {
    centerWorld: new THREE.Vector3(0, 0, 0),
    radius: 1,
  };

  camera.position.set(0, 0, 5);
  camera.lookAt(bounds.centerWorld);
  camera.updateMatrixWorld(true);
  const nearView = resolveAdaptiveCameraFrustum(camera, bounds);

  camera.position.set(0, 0, 40);
  camera.lookAt(bounds.centerWorld);
  camera.updateMatrixWorld(true);
  const farView = resolveAdaptiveCameraFrustum(camera, bounds);

  assert.ok(farView.far > nearView.far);
  assert.ok(farView.near > nearView.near);
});

test('resolveBackgroundGridStyle returns stable coarse-grid spacing and color', () => {
  const style = resolveBackgroundGridStyle({
    floorColor: '#d7dbe0',
    maxDimension: 120,
  });

  assert.equal(style.gridSpacing, 20);
  assert.ok(style.gridColor.startsWith('#'));
  assert.ok(style.gridLineStrength > 0);
  assert.ok(style.farGridSpacing > style.gridSpacing);
  assert.ok(style.farGridColor.startsWith('#'));
  assert.ok(style.farGridLineStrength < style.gridLineStrength);
});
