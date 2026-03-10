import assert from 'node:assert/strict';
import * as THREE from 'three';

import {
  applyVolumeRootTransform,
  resolveVolumeRootScale,
} from '../src/components/viewers/volume-viewer/vr/volume.ts';

console.log('Starting volumeRootScale tests');

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

console.log('volumeRootScale tests passed');
