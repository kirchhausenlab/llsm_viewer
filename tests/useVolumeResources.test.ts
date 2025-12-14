import assert from 'node:assert/strict';
import * as THREE from 'three';

import { useVolumeResources } from '../src/components/viewers/volume-viewer/useVolumeResources.ts';
import type { NormalizedVolume } from '../src/core/volumeProcessing.ts';
import type { StreamableNormalizedVolume, VolumeResources } from '../src/components/viewers/VolumeViewer.types.ts';
import type { ZarrVolumeSource } from '../src/data/ZarrVolumeSource.ts';
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

(async () => {
  const localSize = 4;
  const localValue = 5;
  const localVolume: StreamableNormalizedVolume = {
    width: localSize,
    height: localSize,
    depth: localSize,
    channels: 1,
    dataType: 'uint8',
    normalized: new Uint8Array(localSize * localSize * localSize).fill(localValue),
    min: 0,
    max: 1,
  };

  const sceneRef = { current: new THREE.Scene() };
  const cameraRef = { current: new THREE.PerspectiveCamera(75, 1, 0.1, 10) };
  const controlsRef = {
    current: {
      target: new THREE.Vector3(),
      update: () => {},
      saveState: () => {},
    } as unknown as THREE.OrbitControls,
  };

  const resourcesRef = { current: new Map<string, VolumeResources>() };
  const trackGroupRef = { current: new THREE.Group() };
  const volumeRootGroupRef = { current: new THREE.Group() };

  const hook = renderHook(() =>
    useVolumeResources({
      layers: [
        {
          key: 'local',
          label: 'Local layer',
          channelName: 'local',
          volume: localVolume,
          visible: true,
          sliderRange: 1,
          minSliderIndex: 0,
          maxSliderIndex: 0,
          brightnessSliderIndex: 0,
          contrastSliderIndex: 0,
          windowMin: 0,
          windowMax: 1,
          color: '#ffffff',
          offsetX: 0,
          offsetY: 0,
          renderStyle: 0,
          invert: false,
          samplingMode: 'nearest',
          isSegmentation: false,
          mode: '3d',
        },
      ],
      primaryVolume: localVolume,
      isAdditiveBlending: false,
      renderContextRevision: 0,
      sceneRef,
      cameraRef,
      controlsRef,
      timeIndex: 0,
      rotationTargetRef: { current: new THREE.Vector3(localSize / 2, localSize / 2, localSize / 2) },
      defaultViewStateRef: { current: null },
      trackGroupRef,
      resourcesRef,
      currentDimensionsRef: { current: null },
      colormapCacheRef: { current: new Map() },
      volumeRootGroupRef,
      volumeRootBaseOffsetRef: { current: new THREE.Vector3() },
      volumeRootCenterOffsetRef: { current: new THREE.Vector3() },
      volumeRootCenterUnscaledRef: { current: new THREE.Vector3() },
      volumeRootHalfExtentsRef: { current: new THREE.Vector3() },
      volumeNormalizationScaleRef: { current: 1 },
      volumeUserScaleRef: { current: 1 },
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

  const resource = resourcesRef.current.get('local');
  assert(resource, 'Local clipmap resource was not created');
  assert(resource?.clipmap, 'Local clipmap was not initialized');

  await resource?.clipmap?.update(new THREE.Vector3(localSize / 2, localSize / 2, localSize / 2));
  resource?.clipmap?.uploadPending();
  const firstLevel = resource?.clipmap?.levels[0];
  assert(firstLevel, 'Local clipmap levels missing');
  assert(firstLevel.buffer.includes(localValue), 'Local clipmap never populated from CPU volume');

  hook.unmount();
})();

(async () => {
  const streamingSize = 4;
  const streamingValue = 9;
  let streamingReads = 0;
  const streamingSource: ZarrVolumeSource = {
    getMipLevels: () => [0],
    getMip: () => ({
      level: 0,
      shape: [1, 1, streamingSize, streamingSize, streamingSize] as const,
      chunkShape: [1, 1, streamingSize, streamingSize, streamingSize] as const,
      dataType: 'uint8',
      array: null as never,
    }),
    readRegion: async ({ shape }) => {
      streamingReads += 1;
      return new Uint8Array(shape[0] * shape[1] * shape[2] * shape[3]).fill(streamingValue);
    },
  } as unknown as ZarrVolumeSource;

  const streamingVolume: StreamableNormalizedVolume = {
    width: streamingSize,
    height: streamingSize,
    depth: streamingSize,
    channels: 1,
    dataType: 'uint8',
    normalized: new Uint8Array(streamingSize * streamingSize * streamingSize),
    min: 0,
    max: 1,
    streamingSource,
    streamingBaseShape: [1, 1, streamingSize, streamingSize, streamingSize],
    chunkShape: [streamingSize, streamingSize, streamingSize],
  };

  const sceneRef = { current: new THREE.Scene() };
  const cameraRef = { current: new THREE.PerspectiveCamera(75, 1, 0.1, 10) };
  const controlsRef = {
    current: {
      target: new THREE.Vector3(),
      update: () => {},
      saveState: () => {},
    } as unknown as THREE.OrbitControls,
  };

  const resourcesRef = { current: new Map<string, VolumeResources>() };
  const trackGroupRef = { current: new THREE.Group() };
  const volumeRootGroupRef = { current: new THREE.Group() };

  const hook = renderHook(() =>
    useVolumeResources({
      layers: [
        {
          key: 'streaming',
          label: 'Streaming layer',
          channelName: 'streaming',
          volume: streamingVolume,
          visible: true,
          sliderRange: 1,
          minSliderIndex: 0,
          maxSliderIndex: 0,
          brightnessSliderIndex: 0,
          contrastSliderIndex: 0,
          windowMin: 0,
          windowMax: 1,
          color: '#ffffff',
          offsetX: 0,
          offsetY: 0,
          renderStyle: 0,
          invert: false,
          samplingMode: 'linear',
          isSegmentation: false,
          mode: '3d',
        },
      ],
      primaryVolume: streamingVolume,
      isAdditiveBlending: false,
      renderContextRevision: 0,
      sceneRef,
      cameraRef,
      controlsRef,
      timeIndex: 0,
      rotationTargetRef: { current: new THREE.Vector3(streamingSize / 2, streamingSize / 2, streamingSize / 2) },
      defaultViewStateRef: { current: null },
      trackGroupRef,
      resourcesRef,
      currentDimensionsRef: { current: null },
      colormapCacheRef: { current: new Map() },
      volumeRootGroupRef,
      volumeRootBaseOffsetRef: { current: new THREE.Vector3() },
      volumeRootCenterOffsetRef: { current: new THREE.Vector3() },
      volumeRootCenterUnscaledRef: { current: new THREE.Vector3() },
      volumeRootHalfExtentsRef: { current: new THREE.Vector3() },
      volumeNormalizationScaleRef: { current: 1 },
      volumeUserScaleRef: { current: 1 },
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

  const resource = resourcesRef.current.get('streaming');
  assert(resource, 'Streaming resource was not created');
  assert(resource?.clipmap, 'Streaming clipmap was not initialized');

  await resource?.clipmap?.update(new THREE.Vector3(streamingSize / 2, streamingSize / 2, streamingSize / 2));
  resource?.clipmap?.uploadPending();
  const firstLevel = resource?.clipmap?.levels[0];
  assert(firstLevel, 'Streaming clipmap levels missing');
  assert(firstLevel.buffer.includes(streamingValue), 'Streaming clipmap never received mip data');
  assert.strictEqual(streamingReads > 0, true, 'Streaming clipmap never requested streamed mip data');

  hook.unmount();
})();

console.log('useVolumeResources tests passed');
