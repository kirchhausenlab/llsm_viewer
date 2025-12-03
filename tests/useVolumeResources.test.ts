import assert from 'node:assert/strict';
import * as THREE from 'three';

import { useVolumeResources } from '../src/components/volume-viewer/useVolumeResources.ts';
import type { NormalizedVolume } from '../src/volumeProcessing.ts';
import type { VolumeResources } from '../src/components/VolumeViewer.types.ts';
import { renderHook } from './hooks/renderHook.ts';

console.log('Starting useVolumeResources tests');

const createFakeResource = (): VolumeResources => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  const texture = new THREE.DataTexture(new Uint8Array([0]), 1, 1, THREE.LuminanceFormat);
  return {
    mesh,
    texture,
    dimensions: { width: 1, height: 1, depth: 1 },
    channels: 1,
    mode: 'slice',
    samplingMode: 'linear',
  };
};

(() => {
  const resourcesRef = { current: new Map<string, VolumeResources>([['resource', createFakeResource()]]) };
  const currentDimensionsRef = { current: { width: 1, height: 1, depth: 1 } };
  const applyVolumeRootTransformArgs: Array<{ width: number; height: number; depth: number } | null> = [];
  const trackGroupRef = { current: new THREE.Group() };

  renderHook(() =>
    useVolumeResources({
      layers: [],
      primaryVolume: null,
      isAdditiveBlending: false,
      renderContextRevision: 0,
      sceneRef: { current: null },
      cameraRef: { current: null },
      controlsRef: { current: null },
      rotationTargetRef: { current: new THREE.Vector3() },
      defaultViewStateRef: { current: null },
      trackGroupRef,
      resourcesRef,
      currentDimensionsRef,
      colormapCacheRef: { current: new Map() },
      volumeRootGroupRef: { current: new THREE.Group() },
      volumeRootBaseOffsetRef: { current: new THREE.Vector3() },
      volumeRootCenterOffsetRef: { current: new THREE.Vector3() },
      volumeRootCenterUnscaledRef: { current: new THREE.Vector3() },
      volumeRootHalfExtentsRef: { current: new THREE.Vector3() },
      volumeNormalizationScaleRef: { current: 1 },
      volumeUserScaleRef: { current: 2 },
      volumeStepScaleRef: { current: 1 },
      volumeYawRef: { current: 0 },
      volumePitchRef: { current: 0 },
      volumeRootRotatedCenterTempRef: { current: new THREE.Vector3() },
      applyTrackGroupTransform: () => {},
      applyVolumeRootTransform: (dimensions) => {
        applyVolumeRootTransformArgs.push(dimensions);
      },
      applyVolumeStepScaleToResources: () => {},
      applyHoverHighlightToResources: () => {},
    }),
  );

  assert.strictEqual(resourcesRef.current.size, 0);
  assert.strictEqual(currentDimensionsRef.current, null);
  assert.deepStrictEqual(applyVolumeRootTransformArgs, [null]);
})();

(() => {
  const volume: NormalizedVolume = {
    width: 2,
    height: 2,
    depth: 2,
    channels: 1,
    dataType: 'uint8',
    normalized: new Uint8Array(8),
    min: 0,
    max: 1,
  };

  const resourcesRef = { current: new Map<string, VolumeResources>([['resource', createFakeResource()]]) };
  const currentDimensionsRef = { current: { width: 1, height: 1, depth: 1 } };
  const volumeUserScaleRef = { current: 3 };

  const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 10);
  const controls = {
    target: new THREE.Vector3(),
    update: () => {},
    saveState: () => {},
  } as unknown as THREE.OrbitControls;

  renderHook(() =>
    useVolumeResources({
      layers: [],
      primaryVolume: volume,
      isAdditiveBlending: false,
      renderContextRevision: 0,
      sceneRef: { current: new THREE.Scene() },
      cameraRef: { current: camera },
      controlsRef: { current: controls },
      rotationTargetRef: { current: new THREE.Vector3() },
      defaultViewStateRef: { current: null },
      trackGroupRef: { current: new THREE.Group() },
      resourcesRef,
      currentDimensionsRef,
      colormapCacheRef: { current: new Map() },
      volumeRootGroupRef: { current: new THREE.Group() },
      volumeRootBaseOffsetRef: { current: new THREE.Vector3() },
      volumeRootCenterOffsetRef: { current: new THREE.Vector3() },
      volumeRootCenterUnscaledRef: { current: new THREE.Vector3() },
      volumeRootHalfExtentsRef: { current: new THREE.Vector3() },
      volumeNormalizationScaleRef: { current: 1 },
      volumeUserScaleRef,
      volumeStepScaleRef: { current: 1 },
      volumeYawRef: { current: 0 },
      volumePitchRef: { current: 0 },
      volumeRootRotatedCenterTempRef: { current: new THREE.Vector3() },
      applyTrackGroupTransform: () => {},
      applyVolumeRootTransform: () => {},
      applyVolumeStepScaleToResources: () => {},
      applyHoverHighlightToResources: () => {},
    }),
  );

  assert.strictEqual(resourcesRef.current.size, 0);
  assert.deepStrictEqual(currentDimensionsRef.current, { width: 2, height: 2, depth: 2 });
  assert.strictEqual(volumeUserScaleRef.current, 1);
})();

console.log('useVolumeResources tests passed');
