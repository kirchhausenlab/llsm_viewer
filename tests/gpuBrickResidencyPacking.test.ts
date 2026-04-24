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
    viewPriority: null,
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

(() => {
  const previousBudget = process.env.VITE_MAX_GPU_BRICK_BYTES;
  const previousMaxUploads = process.env.VITE_MAX_BRICK_UPLOADS_PER_UPDATE;
  process.env.VITE_MAX_GPU_BRICK_BYTES = '27';
  process.env.VITE_MAX_BRICK_UPLOADS_PER_UPDATE = '1';

  try {
    const pageTable: VolumeBrickPageTable = {
      layerKey: 'layer-ortho',
      timepoint: 0,
      scaleLevel: 1,
      gridShape: [1, 1, 3],
      chunkShape: [1, 1, 1],
      volumeShape: [1, 1, 3],
      brickAtlasIndices: new Int32Array([0, 1, 2]),
      chunkMin: new Uint8Array([1, 1, 1]),
      chunkMax: new Uint8Array([255, 255, 255]),
      chunkOccupancy: new Float32Array([1, 1, 1]),
      occupiedBrickCount: 3,
    };
    const sourceData = new Uint8Array([10, 20, 30]);
    const resource = {
      dimensions: {
        width: 3,
        height: 1,
        depth: 1,
      },
      gpuBrickResidencyMetrics: null,
    } as unknown as VolumeResources;

    const orthographicResidency = updateGpuBrickResidency({
      resource,
      pageTable,
      sourceData,
      sourceToken: { id: 'source-ortho' },
      textureFormat: THREE.RedFormat,
      viewPriority: {
        projectionMode: 'orthographic',
        cameraPosition: new THREE.Vector3(0.5, 0.5, 4),
        targetPosition: new THREE.Vector3(2.5, 0.5, 0.5),
        viewDirection: new THREE.Vector3(0, 0, -1),
        zoom: 8,
      },
      atlasSize: {
        width: 1,
        height: 1,
        depth: 3,
      },
      max3DTextureSize: 64,
      layerKey: pageTable.layerKey,
      timepoint: pageTable.timepoint,
      maxUploadsPerUpdate: 1,
      allowBootstrapUploadBurst: false,
      forceFullResidency: false,
    });

    assert.deepEqual(Array.from(orthographicResidency.atlasIndices), [0, 0, 1]);
  } finally {
    if (previousBudget === undefined) {
      delete process.env.VITE_MAX_GPU_BRICK_BYTES;
    } else {
      process.env.VITE_MAX_GPU_BRICK_BYTES = previousBudget;
    }
    if (previousMaxUploads === undefined) {
      delete process.env.VITE_MAX_BRICK_UPLOADS_PER_UPDATE;
    } else {
      process.env.VITE_MAX_BRICK_UPLOADS_PER_UPDATE = previousMaxUploads;
    }
  }
})();

(() => {
  const previousBudget = process.env.VITE_MAX_GPU_BRICK_BYTES;
  const previousMaxUploads = process.env.VITE_MAX_BRICK_UPLOADS_PER_UPDATE;
  process.env.VITE_MAX_GPU_BRICK_BYTES = '27';
  process.env.VITE_MAX_BRICK_UPLOADS_PER_UPDATE = '1';

  try {
    const pageTable: VolumeBrickPageTable = {
      layerKey: 'layer-ortho-depth-invariant',
      timepoint: 0,
      scaleLevel: 1,
      gridShape: [3, 1, 1],
      chunkShape: [1, 1, 1],
      volumeShape: [3, 1, 1],
      brickAtlasIndices: new Int32Array([0, 1, 2]),
      chunkMin: new Uint8Array([1, 1, 1]),
      chunkMax: new Uint8Array([255, 255, 255]),
      chunkOccupancy: new Float32Array([1, 1, 1]),
      occupiedBrickCount: 3,
      skipHierarchy: {
        levels: [],
      },
      subcell: null,
    };
    const sourceData = new Uint8Array([10, 20, 30]);
    const makeResource = () =>
      ({
        dimensions: {
          width: 1,
          height: 1,
          depth: 3,
        },
        gpuBrickResidencyMetrics: null,
      }) as unknown as VolumeResources;

    const nearTargetResidency = updateGpuBrickResidency({
      resource: makeResource(),
      pageTable,
      sourceData,
      sourceToken: { id: 'source-ortho-depth-invariant-near' },
      textureFormat: THREE.RedFormat,
      viewPriority: {
        projectionMode: 'orthographic',
        cameraPosition: new THREE.Vector3(0.5, 0.5, 4),
        targetPosition: new THREE.Vector3(0.5, 0.5, 0.5),
        viewDirection: new THREE.Vector3(0, 0, -1),
        zoom: 8,
      },
      atlasSize: {
        width: 1,
        height: 1,
        depth: 3,
      },
      max3DTextureSize: 64,
      layerKey: pageTable.layerKey,
      timepoint: pageTable.timepoint,
      maxUploadsPerUpdate: 1,
      allowBootstrapUploadBurst: false,
      forceFullResidency: false,
    });

    const farTargetResidency = updateGpuBrickResidency({
      resource: makeResource(),
      pageTable,
      sourceData,
      sourceToken: { id: 'source-ortho-depth-invariant-far' },
      textureFormat: THREE.RedFormat,
      viewPriority: {
        projectionMode: 'orthographic',
        cameraPosition: new THREE.Vector3(0.5, 0.5, 4),
        targetPosition: new THREE.Vector3(0.5, 0.5, 2.5),
        viewDirection: new THREE.Vector3(0, 0, -1),
        zoom: 8,
      },
      atlasSize: {
        width: 1,
        height: 1,
        depth: 3,
      },
      max3DTextureSize: 64,
      layerKey: pageTable.layerKey,
      timepoint: pageTable.timepoint,
      maxUploadsPerUpdate: 1,
      allowBootstrapUploadBurst: false,
      forceFullResidency: false,
    });

    assert.deepEqual(
      Array.from(nearTargetResidency.atlasIndices),
      Array.from(farTargetResidency.atlasIndices),
      'orthographic residency should remain invariant when the target only shifts along the view direction'
    );
  } finally {
    if (previousBudget === undefined) {
      delete process.env.VITE_MAX_GPU_BRICK_BYTES;
    } else {
      process.env.VITE_MAX_GPU_BRICK_BYTES = previousBudget;
    }
    if (previousMaxUploads === undefined) {
      delete process.env.VITE_MAX_BRICK_UPLOADS_PER_UPDATE;
    } else {
      process.env.VITE_MAX_BRICK_UPLOADS_PER_UPDATE = previousMaxUploads;
    }
  }
})();

console.log('gpuBrickResidencyPacking tests passed');
