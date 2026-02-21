import assert from 'node:assert/strict';
import * as THREE from 'three';

import type { VolumeResources, VolumeViewerProps } from '../src/components/viewers/VolumeViewer.types.ts';
import { useVolumeViewerFollowTarget } from '../src/components/viewers/volume-viewer/useVolumeViewerFollowTarget.ts';
import { renderHook } from './hooks/renderHook.ts';

console.log('Starting useVolumeViewerFollowTarget tests');

function createVolume(width: number, height: number, depth: number) {
  return {
    width,
    height,
    depth,
    channels: 1,
    dataType: 'uint8' as const,
    normalized: new Uint8Array(Math.max(1, width * height * depth)),
    min: 0,
    max: 255,
  };
}

function createLayer(
  key: string,
  overrides: Partial<VolumeViewerProps['layers'][number]> = {},
): VolumeViewerProps['layers'][number] {
  return {
    key,
    label: key,
    channelName: key,
    fullResolutionWidth: 64,
    fullResolutionHeight: 64,
    fullResolutionDepth: 64,
    volume: createVolume(64, 64, 64),
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
    blDensityScale: 1,
    blBackgroundCutoff: 0.08,
    blOpacityScale: 1,
    blEarlyExitAlpha: 0.98,
    invert: false,
    samplingMode: 'linear',
    ...overrides,
  };
}

function createResource(
  dimensions: { width: number; height: number; depth: number },
  mesh: THREE.Mesh,
): VolumeResources {
  return {
    mesh,
    texture: new THREE.DataTexture(),
    dimensions,
    channels: 1,
    mode: '3d',
    samplingMode: 'linear',
  };
}

(() => {
  const layer = createLayer('atlas-with-resource', {
    volume: null,
    fullResolutionWidth: 1024,
    fullResolutionHeight: 512,
    fullResolutionDepth: 256,
    offsetX: 5,
    offsetY: -3,
  });

  const volumeRoot = new THREE.Group();
  volumeRoot.position.set(1, 2, 3);
  volumeRoot.scale.set(2, 2, 2);

  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  mesh.position.set(layer.offsetX, layer.offsetY, 0);
  volumeRoot.add(mesh);

  const resourcesRef = {
    current: new Map<string, VolumeResources>([
      [layer.key, createResource({ width: 256, height: 128, depth: 64 }, mesh)],
    ]),
  };

  const hook = renderHook(() =>
    useVolumeViewerFollowTarget({
      layersRef: { current: [layer] },
      resourcesRef,
      volumeRootGroupRef: { current: volumeRoot },
      hoveredVoxelRef: {
        current: {
          layerKey: layer.key,
          normalizedPosition: new THREE.Vector3(0.5, 0.25, 0.75),
        },
      },
    }),
  );

  const target = hook.result.resolveHoveredFollowTarget();
  assert.deepStrictEqual(target, {
    layerKey: layer.key,
    coordinates: { x: 128, y: 32, z: 48 },
  });

  const world = hook.result.computeFollowedVoxelPosition(target!);
  assert.ok(world, 'expected world position for followed voxel');
  assert.ok(world!.distanceTo(new THREE.Vector3(267, 60, 99)) < 1e-6);
})();

(() => {
  const layer = createLayer('atlas-no-resource', {
    volume: null,
    fullResolutionWidth: 0,
    fullResolutionHeight: 0,
    fullResolutionDepth: 0,
    offsetX: 2,
    offsetY: 4,
    brickPageTable: {
      volumeShape: [20, 30, 40],
    } as VolumeViewerProps['layers'][number]['brickPageTable'],
  });

  const volumeRoot = new THREE.Group();
  volumeRoot.position.set(10, 0, 0);

  const hook = renderHook(() =>
    useVolumeViewerFollowTarget({
      layersRef: { current: [layer] },
      resourcesRef: { current: new Map() },
      volumeRootGroupRef: { current: volumeRoot },
      hoveredVoxelRef: {
        current: {
          layerKey: layer.key,
          normalizedPosition: new THREE.Vector3(1, 0.5, 0),
        },
      },
    }),
  );

  const target = hook.result.resolveHoveredFollowTarget();
  assert.deepStrictEqual(target, {
    layerKey: layer.key,
    coordinates: { x: 39, y: 15, z: 0 },
  });

  const world = hook.result.computeFollowedVoxelPosition({
    layerKey: layer.key,
    coordinates: { x: 999, y: -10, z: 999 },
  });
  assert.ok(world, 'expected world position fallback via volume root group');
  assert.ok(world!.distanceTo(new THREE.Vector3(51, 4, 19)) < 1e-6);
})();

(() => {
  const layer = createLayer('invalid-layer', {
    volume: null,
    fullResolutionWidth: 0,
    fullResolutionHeight: 0,
    fullResolutionDepth: 0,
    brickPageTable: null,
  });

  const hook = renderHook(() =>
    useVolumeViewerFollowTarget({
      layersRef: { current: [layer] },
      resourcesRef: { current: new Map() },
      volumeRootGroupRef: { current: new THREE.Group() },
      hoveredVoxelRef: {
        current: {
          layerKey: layer.key,
          normalizedPosition: new THREE.Vector3(0.5, 0.5, 0.5),
        },
      },
    }),
  );

  assert.equal(hook.result.resolveHoveredFollowTarget(), null);
})();

console.log('useVolumeViewerFollowTarget tests passed');
