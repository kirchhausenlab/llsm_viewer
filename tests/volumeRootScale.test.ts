import assert from 'node:assert/strict';
import * as THREE from 'three';

import {
  applyVolumeRootTransform,
  resolveVolumeRootScale,
  resolveInitialVrVolumeBaseOffset,
  resolveInitialVrVolumePlacement,
  updateVolumeHandles,
} from '../src/components/viewers/volume-viewer/vr/volume.ts';
import { computeHudFrameFromVolume } from '../src/components/viewers/volume-viewer/vr/hud.ts';

console.log('Starting volumeRootScale tests');

const approxEqual = (actual: number, expected: number, tolerance = 1e-6) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `Expected ${actual} to be close to ${expected}`);
};

(() => {
  const scale = resolveVolumeRootScale({
    normalizationScale: 0.5,
    userScale: 3,
    anisotropyScale: { x: 2, y: 1, z: 4 },
  });

  assert.deepStrictEqual(scale, {
    x: 3,
    y: -1.5,
    z: -6,
  });
})();

(() => {
  const scale = resolveVolumeRootScale({
    normalizationScale: Number.NaN,
    userScale: 0,
    anisotropyScale: { x: 1, y: 1, z: 1 },
  });

  assert.deepStrictEqual(scale, {
    x: 1,
    y: -1,
    z: -1,
  });
})();

(() => {
  const center = new THREE.Vector3(4.5, 3.5, 2.5);
  const translationHandle = new THREE.Mesh();
  const scaleHandle = new THREE.Mesh();
  const pitchHandle = new THREE.Mesh();
  const yawHandles = [new THREE.Mesh(), new THREE.Mesh()];
  updateVolumeHandles({
    rendererRef: { current: { xr: { isPresenting: true } } as unknown as THREE.WebGLRenderer },
    volumeRootGroupRef: { current: new THREE.Group() },
    currentDimensionsRef: { current: { width: 10, height: 8, depth: 6 } },
    hasActive3DLayerRef: { current: true },
    volumeNormalizationScaleRef: { current: 1 },
    volumeAnisotropyScaleRef: { current: { x: 1, y: 1, z: 1 } },
    volumeUserScaleRef: { current: 1 },
    volumeRootCenterUnscaledRef: { current: center },
    volumeRootHalfExtentsRef: { current: new THREE.Vector3(4.5, 3.5, 2.5) },
    vrHandleLocalPointRef: { current: new THREE.Vector3() },
    vrTranslationHandleRef: { current: translationHandle },
    vrVolumeScaleHandleRef: { current: scaleHandle },
    vrVolumeYawHandlesRef: { current: yawHandles },
    vrVolumePitchHandleRef: { current: pitchHandle },
  });

  assert.ok(
    translationHandle.position.y < center.y,
    `expected translation handle to be vertically mirrored above the volume, got y=${translationHandle.position.y}`,
  );
  assert.ok(
    scaleHandle.position.y < center.y,
    `expected scale handle to be vertically mirrored above the volume, got y=${scaleHandle.position.y}`,
  );
  assert.ok(
    pitchHandle.position.y > center.y,
    `expected pitch handle to be vertically mirrored below the volume, got y=${pitchHandle.position.y}`,
  );
  assert.equal(yawHandles[0].position.y, center.y);
  assert.equal(yawHandles[1].position.y, center.y);
})();

(() => {
  const volumeRootGroup = new THREE.Group();
  const params = {
    rendererRef: { current: null },
    volumeRootGroupRef: { current: volumeRootGroup },
    currentDimensionsRef: { current: null },
    hasActive3DLayerRef: { current: true },
    volumeNormalizationScaleRef: { current: 1 },
    volumeAnisotropyScaleRef: { current: { x: 2, y: 3, z: 4 } },
    volumeUserScaleRef: { current: 2 },
    volumeRootCenterUnscaledRef: { current: new THREE.Vector3() },
    volumeRootHalfExtentsRef: { current: new THREE.Vector3() },
    vrHandleLocalPointRef: { current: new THREE.Vector3() },
    vrTranslationHandleRef: { current: null },
    vrVolumeScaleHandleRef: { current: null },
    vrVolumeYawHandlesRef: { current: [] },
    vrVolumePitchHandleRef: { current: null },
    volumeRootBaseOffsetRef: { current: new THREE.Vector3(5, 6, 7) },
    volumeRootCenterOffsetRef: { current: new THREE.Vector3() },
    volumeRootRotatedCenterTempRef: { current: new THREE.Vector3() },
    volumeYawRef: { current: 0 },
    volumePitchRef: { current: 0 },
    vrHudYawEulerRef: { current: new THREE.Euler() },
    vrHandleQuaternionTempRef: { current: new THREE.Quaternion() },
  };

  applyVolumeRootTransform(params, { width: 10, height: 8, depth: 6 });

  const worldCenter = volumeRootGroup.localToWorld(params.volumeRootCenterUnscaledRef.current.clone());
  assert.deepStrictEqual(worldCenter.toArray(), [5, 6, 7]);
})();

(() => {
  const target = resolveInitialVrVolumeBaseOffset({
    renderer: null,
    camera: null,
  });

  assert.deepStrictEqual(target.toArray(), [0, 1.22, -1]);
})();

(() => {
  const xrCamera = new THREE.PerspectiveCamera();
  xrCamera.position.set(1, 1.6, 2);
  xrCamera.lookAt(new THREE.Vector3(1, 1.6, 1));
  xrCamera.updateMatrixWorld(true);

  const target = resolveInitialVrVolumeBaseOffset({
    renderer: {
      xr: {
        isPresenting: true,
        getCamera: () => xrCamera,
      },
    } as unknown as THREE.WebGLRenderer,
    camera: xrCamera,
  });

  approxEqual(target.x, 1);
  approxEqual(target.y, 1.35);
  approxEqual(target.z, 1);
})();

(() => {
  const xrCamera = new THREE.PerspectiveCamera();
  xrCamera.position.set(0, 1.6, 0);
  xrCamera.lookAt(new THREE.Vector3(-1, 1.6, 0));
  xrCamera.updateMatrixWorld(true);

  const placement = resolveInitialVrVolumePlacement({
    renderer: {
      xr: {
        isPresenting: true,
        getCamera: () => xrCamera,
      },
    } as unknown as THREE.WebGLRenderer,
    camera: xrCamera,
  });

  approxEqual(placement.baseOffset.x, -1);
  approxEqual(placement.baseOffset.y, 1.35);
  approxEqual(placement.baseOffset.z, 0);
  approxEqual(placement.yaw, Math.PI / 2);
})();

(() => {
  const volumeRootGroup = new THREE.Group();
  const baseOffset = resolveInitialVrVolumeBaseOffset({
    renderer: null,
    camera: null,
  });
  const halfExtents = new THREE.Vector3();
  const params = {
    rendererRef: { current: null },
    volumeRootGroupRef: { current: volumeRootGroup },
    currentDimensionsRef: { current: null },
    hasActive3DLayerRef: { current: true },
    volumeNormalizationScaleRef: { current: 1 },
    volumeAnisotropyScaleRef: { current: { x: 1, y: 1, z: 1 } },
    volumeUserScaleRef: { current: 1 },
    volumeRootCenterUnscaledRef: { current: new THREE.Vector3() },
    volumeRootHalfExtentsRef: { current: halfExtents },
    vrHandleLocalPointRef: { current: new THREE.Vector3() },
    vrTranslationHandleRef: { current: null },
    vrVolumeScaleHandleRef: { current: null },
    vrVolumeYawHandlesRef: { current: [] },
    vrVolumePitchHandleRef: { current: null },
    volumeRootBaseOffsetRef: { current: baseOffset },
    volumeRootCenterOffsetRef: { current: new THREE.Vector3() },
    volumeRootRotatedCenterTempRef: { current: new THREE.Vector3() },
    volumeYawRef: { current: 0 },
    volumePitchRef: { current: 0 },
    vrHudYawEulerRef: { current: new THREE.Euler() },
    vrHandleQuaternionTempRef: { current: new THREE.Quaternion() },
  };

  applyVolumeRootTransform(params, { width: 100, height: 100, depth: 100 });
  const frame = computeHudFrameFromVolume({
    baseOffset,
    volumeRootGroup,
    halfExtents,
  });

  assert.ok(frame);
  assert.ok(frame.center.z < -0.2, `expected HUD in front of the viewer, got z=${frame.center.z}`);
})();

(() => {
  const xrCamera = new THREE.PerspectiveCamera();
  xrCamera.position.set(0, 1.6, 0);
  xrCamera.lookAt(new THREE.Vector3(-1, 1.6, 0));
  xrCamera.updateMatrixWorld(true);
  const placement = resolveInitialVrVolumePlacement({
    renderer: {
      xr: {
        isPresenting: true,
        getCamera: () => xrCamera,
      },
    } as unknown as THREE.WebGLRenderer,
    camera: xrCamera,
  });

  const volumeRootGroup = new THREE.Group();
  const halfExtents = new THREE.Vector3();
  const params = {
    rendererRef: { current: null },
    volumeRootGroupRef: { current: volumeRootGroup },
    currentDimensionsRef: { current: null },
    hasActive3DLayerRef: { current: true },
    volumeNormalizationScaleRef: { current: 1 },
    volumeAnisotropyScaleRef: { current: { x: 1, y: 1, z: 1 } },
    volumeUserScaleRef: { current: 1 },
    volumeRootCenterUnscaledRef: { current: new THREE.Vector3() },
    volumeRootHalfExtentsRef: { current: halfExtents },
    vrHandleLocalPointRef: { current: new THREE.Vector3() },
    vrTranslationHandleRef: { current: null },
    vrVolumeScaleHandleRef: { current: null },
    vrVolumeYawHandlesRef: { current: [] },
    vrVolumePitchHandleRef: { current: null },
    volumeRootBaseOffsetRef: { current: placement.baseOffset },
    volumeRootCenterOffsetRef: { current: new THREE.Vector3() },
    volumeRootRotatedCenterTempRef: { current: new THREE.Vector3() },
    volumeYawRef: { current: placement.yaw },
    volumePitchRef: { current: placement.pitch },
    vrHudYawEulerRef: { current: new THREE.Euler() },
    vrHandleQuaternionTempRef: { current: new THREE.Quaternion() },
  };

  applyVolumeRootTransform(params, { width: 100, height: 100, depth: 100 });
  const frame = computeHudFrameFromVolume({
    baseOffset: placement.baseOffset,
    volumeRootGroup,
    halfExtents,
  });

  assert.ok(frame);
  assert.ok(
    frame.center.x > placement.baseOffset.x,
    `expected HUD between the viewer and side-facing volume, got x=${frame.center.x}`,
  );
})();

console.log('volumeRootScale tests passed');
