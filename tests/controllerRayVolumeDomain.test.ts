import assert from 'node:assert/strict';
import * as THREE from 'three';

import { resolveVolumeRayDomain } from '../src/components/viewers/volume-viewer/vr/controllerRayVolumeDomain.ts';
import type { ControllerEntry } from '../src/components/viewers/volume-viewer/vr/types.ts';

console.log('Starting controllerRayVolumeDomain tests');

const createControllerEntry = (overrides: Partial<ControllerEntry> = {}): ControllerEntry => {
  const rayGeometry = new THREE.BufferGeometry();
  const rayMaterial = new THREE.LineBasicMaterial();
  const ray = new THREE.Line(rayGeometry, rayMaterial);
  const entry: ControllerEntry = {
    controller: new THREE.Group(),
    grip: new THREE.Group(),
    ray,
    rayGeometry,
    rayMaterial,
    touchIndicator: new THREE.Mesh(new THREE.SphereGeometry(0.01), new THREE.MeshBasicMaterial()),
    raycaster: new THREE.Raycaster(),
    onConnected: () => {},
    onDisconnected: () => {},
    onSelectStart: () => {},
    onSelectEnd: () => {},
    isConnected: true,
    targetRayMode: null,
    gamepad: null,
    hoverTrackId: null,
    hoverUiTarget: null,
    activeUiTarget: null,
    hoverUiPoint: new THREE.Vector3(),
    hasHoverUiPoint: false,
    hoverPoint: new THREE.Vector3(),
    rayOrigin: new THREE.Vector3(),
    rayDirection: new THREE.Vector3(0, 0, -1),
    rayLength: 3,
    isSelecting: false,
    hudGrabOffsets: { playback: null, channels: null, tracks: null },
    translateGrabOffset: null,
    scaleGrabOffset: null,
    volumeScaleState: null,
    volumeRotationState: null,
    hudRotationState: null,
    ...overrides,
  };
  return entry;
};

const createTemps = () => ({
  translationHandleWorldPoint: new THREE.Vector3(),
  rotationCenterWorldPoint: new THREE.Vector3(),
  rotationDirectionTemp: new THREE.Vector3(),
  rotationHandleWorldPoint: new THREE.Vector3(),
  scaleHandleWorldPoint: new THREE.Vector3(),
  scaleDirectionTemp: new THREE.Vector3(),
  scaleTargetWorldPoint: new THREE.Vector3(),
});

const approxEqual = (actual: number, expected: number, tolerance = 1e-6) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `Expected ${actual} to be close to ${expected}`);
};

(() => {
  const volumeRootGroup = new THREE.Group();
  const translationHandle = new THREE.Mesh(new THREE.SphereGeometry(0.02), new THREE.MeshBasicMaterial());
  translationHandle.position.set(1, 0, 0);
  volumeRootGroup.add(translationHandle);
  volumeRootGroup.updateMatrixWorld(true);

  const volumeRootCenterUnscaledRef = { current: new THREE.Vector3(0, 0, 0) };
  const volumeRootBaseOffsetRef = { current: new THREE.Vector3(0, 0, 0) };

  const entry = createControllerEntry({
    activeUiTarget: { type: 'volume-translate-handle', object: translationHandle },
    isSelecting: true,
    rayOrigin: new THREE.Vector3(2, 0, 0),
    translateGrabOffset: new THREE.Vector3(-0.5, 0, 0),
  });

  const result = resolveVolumeRayDomain({
    entry,
    initialRayLength: 3,
    translationHandle,
    scaleHandle: null,
    yawHandles: [],
    pitchHandle: null,
    applyVolumeYawPitch: () => {},
    volumeRootGroup,
    volumeRootCenterUnscaledRef,
    volumeRootBaseOffsetRef,
    volumeNormalizationScaleRef: { current: 1 },
    volumeAnisotropyScaleRef: { current: { x: 1, y: 1, z: 1 } },
    volumeUserScaleRef: { current: 1 },
    volumeYawRef: { current: 0 },
    volumePitchRef: { current: 0 },
    temps: createTemps(),
  });

  approxEqual(volumeRootGroup.position.x, 0.5);
  approxEqual(volumeRootBaseOffsetRef.current.x, 0.5);
  assert.strictEqual(entry.hasHoverUiPoint, true);
  approxEqual(entry.hoverUiPoint.x, 1.5);
  assert.strictEqual(result.handleCandidateTarget?.type, 'volume-translate-handle');
  approxEqual(result.rayLength, 0.5);
})();

(() => {
  const volumeRootGroup = new THREE.Group();
  const scaleHandle = new THREE.Mesh(new THREE.SphereGeometry(0.02), new THREE.MeshBasicMaterial());
  scaleHandle.position.set(1, 0, 0);
  volumeRootGroup.add(scaleHandle);
  volumeRootGroup.updateMatrixWorld(true);

  const applyVolumeYawPitchCalls: Array<{ yaw: number; pitch: number }> = [];
  const volumeUserScaleRef = { current: 1 };
  const volumeYawRef = { current: 1.2 };
  const volumePitchRef = { current: -0.4 };

  const entry = createControllerEntry({
    activeUiTarget: { type: 'volume-scale-handle', object: scaleHandle },
    isSelecting: true,
    rayOrigin: new THREE.Vector3(6, 0, 0),
    volumeScaleState: {
      baseLength: 2,
      direction: new THREE.Vector3(1, 0, 0),
    },
  });

  const result = resolveVolumeRayDomain({
    entry,
    initialRayLength: 10,
    translationHandle: null,
    scaleHandle,
    yawHandles: [],
    pitchHandle: null,
    applyVolumeYawPitch: (yaw, pitch) => {
      applyVolumeYawPitchCalls.push({ yaw, pitch });
    },
    volumeRootGroup,
    volumeRootCenterUnscaledRef: { current: new THREE.Vector3(0, 0, 0) },
    volumeRootBaseOffsetRef: { current: new THREE.Vector3(0, 0, 0) },
    volumeNormalizationScaleRef: { current: 0.5 },
    volumeAnisotropyScaleRef: { current: { x: 2, y: -3, z: 3 } },
    volumeUserScaleRef,
    volumeYawRef,
    volumePitchRef,
    temps: createTemps(),
  });

  approxEqual(volumeUserScaleRef.current, 3);
  approxEqual(volumeRootGroup.scale.x, 3);
  approxEqual(volumeRootGroup.scale.y, 1.5);
  approxEqual(volumeRootGroup.scale.z, 4.5);
  assert.deepStrictEqual(applyVolumeYawPitchCalls, [{ yaw: 1.2, pitch: -0.4 }]);
  assert.strictEqual(entry.hasHoverUiPoint, true);
  assert.strictEqual(result.handleCandidateTarget?.type, 'volume-scale-handle');
  approxEqual(result.rayLength, 3);
})();

console.log('controllerRayVolumeDomain tests passed');
