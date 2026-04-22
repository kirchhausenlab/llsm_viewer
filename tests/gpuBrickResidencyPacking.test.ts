import assert from 'node:assert/strict';
import * as THREE from 'three';

import type { VolumeBrickPageTable } from '../src/core/volumeProvider.ts';
import type { VolumeResources } from '../src/components/viewers/VolumeViewer.types.ts';
import { updateGpuBrickResidency } from '../src/components/viewers/volume-viewer/gpuBrickResidency.ts';
import {
  buildFullGpuBrickResidencyAtlas,
  resolveFullGpuBrickResidencyLayout,
} from '../src/components/viewers/volume-viewer/gpuBrickResidencyPacking.ts';

console.log('Starting gpuBrickResidencyPacking tests');

(() => {
  const pageTable: VolumeBrickPageTable = {
    layerKey: 'layer-a',
    timepoint: 0,
    scaleLevel: 1,
    gridShape: [1, 1, 2],
    chunkShape: [2, 2, 2],
    volumeShape: [2, 2, 4],
    skipHierarchy: {
      levels: [],
    },
    brickAtlasIndices: new Int32Array([0, 1]),
    chunkMin: new Uint8Array([1, 2]),
    chunkMax: new Uint8Array([200, 201]),
    chunkOccupancy: new Float32Array([1, 1]),
    occupiedBrickCount: 2,
    subcell: null,
  };
  const sourceData = new Uint8Array([
    1, 2, 3, 4, 5, 6, 7, 8,
    9, 10, 11, 12, 13, 14, 15, 16,
  ]);
  const packed = buildFullGpuBrickResidencyAtlas({
    pageTable,
    sourceData,
    textureComponents: 1,
    max3DTextureSize: 64,
  });
  assert.ok(packed, 'expected a packed full-residency atlas for a layout that fits the 3D texture limit');

  const resource = {
    dimensions: {
      width: 4,
      height: 2,
      depth: 2,
    },
    gpuBrickResidencyMetrics: null,
  } as unknown as VolumeResources;
  const residency = updateGpuBrickResidency({
    resource,
    pageTable,
    sourceData,
    sourceToken: { id: 'source-a' },
    textureFormat: THREE.RedFormat,
    cameraPosition: null,
    atlasSize: {
      width: 2,
      height: 2,
      depth: 4,
    },
    max3DTextureSize: 64,
    layerKey: pageTable.layerKey,
    timepoint: pageTable.timepoint,
    maxUploadsPerUpdate: 24,
    allowBootstrapUploadBurst: true,
    forceFullResidency: true,
  });

  assert.deepEqual(packed?.atlasSize, residency.atlasSize);
  assert.deepEqual(packed?.slotGrid, residency.slotGrid);
  assert.deepEqual([...packed!.atlasIndices], [...residency.atlasIndices]);
  assert.deepEqual([...packed!.atlasData], [...residency.atlasData]);
})();

(() => {
  const pageTable = {
    chunkShape: [2, 2, 2] as [number, number, number],
    occupiedBrickCount: 2,
    scaleLevel: 1,
  };
  assert.equal(
    resolveFullGpuBrickResidencyLayout({
      pageTable,
      textureComponents: 1,
      max3DTextureSize: 4,
    }),
    null
  );
})();

console.log('gpuBrickResidencyPacking tests passed');
