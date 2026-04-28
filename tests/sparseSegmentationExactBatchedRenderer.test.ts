import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';

import {
  buildSparseSegmentationExactBatchAtlasBaseData,
  buildSparseSegmentationExactBatchAtlasData,
  buildSparseSegmentationExactBatchAtlasIndexData,
  createSparseSegmentationExactBatchRenderState,
  prepareSparseSegmentationExactBatch,
} from '../src/components/viewers/volume-viewer/sparseSegmentationExactBatchedRenderer.ts';
import type { SparseSegmentationRenderStrategy } from '../src/components/viewers/volume-viewer/sparseSegmentationRenderPlanner.ts';
import type { VolumeBrickPageTable } from '../src/core/volumeProvider.ts';

function createPageTable(): VolumeBrickPageTable {
  return {
    layerKey: 'segmentation',
    timepoint: 0,
    scaleLevel: 0,
    gridShape: [1, 2, 2],
    chunkShape: [1, 1, 1],
    volumeShape: [1, 2, 2],
    brickAtlasIndices: new Int32Array([0, 1, 2, 3]),
    chunkMin: new Uint8Array([1, 1, 1, 1]),
    chunkMax: new Uint8Array([255, 255, 255, 255]),
    chunkOccupancy: new Float32Array([1, 1, 1, 1]),
    occupiedBrickCount: 4,
    skipHierarchy: {
      levels: [
        {
          level: 0,
          gridShape: [1, 2, 2],
          min: new Uint8Array([1, 1, 1, 1]),
          max: new Uint8Array([255, 255, 255, 255]),
          occupancy: new Uint8Array([255, 255, 255, 255]),
        },
        {
          level: 1,
          gridShape: [1, 1, 1],
          min: new Uint8Array([1]),
          max: new Uint8Array([255]),
          occupancy: new Uint8Array([255]),
        },
      ],
    },
  };
}

const exactBatchPlan = {
  kind: 'exact-batched',
  reason: 'memory-budget',
  batchSlotGrid: { x: 2, y: 1, z: 1 },
  batchAtlasSize: { width: 2, height: 1, depth: 1 },
  batchSlotCapacity: 2,
  batchCount: 2,
  estimatedBytesPerBatch: 8,
} satisfies SparseSegmentationRenderStrategy;

test('exact batched segmentation atlas packing preserves source labels per batch', () => {
  const pageTable = createPageTable();
  const sourceAtlasData = new Uint8Array([
    1, 0, 0, 0,
    2, 0, 0, 0,
    3, 0, 0, 0,
    4, 0, 0, 0,
  ]);

  const firstBatch = buildSparseSegmentationExactBatchAtlasData({
    pageTable,
    sourceAtlasData,
    sourceAtlasSize: { width: 2, height: 2, depth: 1 },
    sourceSlotGrid: { x: 2, y: 2, z: 1 },
    batchSourceIndices: [0, 1],
    batchSlotGrid: exactBatchPlan.batchSlotGrid,
    batchAtlasSize: exactBatchPlan.batchAtlasSize,
    textureFormat: THREE.RGBAFormat,
  });
  assert.deepEqual(Array.from(firstBatch), [1, 0, 0, 0, 2, 0, 0, 0]);

  const secondBatch = buildSparseSegmentationExactBatchAtlasData({
    pageTable,
    sourceAtlasData,
    sourceAtlasSize: { width: 2, height: 2, depth: 1 },
    sourceSlotGrid: { x: 2, y: 2, z: 1 },
    batchSourceIndices: [2, 3],
    batchSlotGrid: exactBatchPlan.batchSlotGrid,
    batchAtlasSize: exactBatchPlan.batchAtlasSize,
    textureFormat: THREE.RGBAFormat,
  });
  assert.deepEqual(Array.from(secondBatch), [3, 0, 0, 0, 4, 0, 0, 0]);
});

test('exact batched segmentation atlas base marks only current batch bricks resident', () => {
  const pageTable = createPageTable();
  const atlasIndices = buildSparseSegmentationExactBatchAtlasIndexData({
    pageTable,
    batchSourceIndices: [2, 3],
  });
  assert.deepEqual(Array.from(atlasIndices), [0, 0, 1, 2]);

  const atlasBase = buildSparseSegmentationExactBatchAtlasBaseData({
    pageTable,
    atlasIndices,
    slotGrid: exactBatchPlan.batchSlotGrid,
    atlasSize: exactBatchPlan.batchAtlasSize,
  });
  assert.deepEqual(Array.from(atlasBase.slice(0, 8)), [0, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(Array.from(atlasBase.slice(8, 16)), [0, 0, 0, 1, 1, 0, 0, 1]);
});

test('exact batched render state reuses one batch texture payload across batches', () => {
  const pageTable = createPageTable();
  const sourceAtlasData = new Uint8Array([
    1, 0, 0, 0,
    2, 0, 0, 0,
    3, 0, 0, 0,
    4, 0, 0, 0,
  ]);
  const state = createSparseSegmentationExactBatchRenderState({
    pageTable,
    sourceAtlasData,
    sourceAtlasSize: { width: 2, height: 2, depth: 1 },
    sourceSlotGrid: { x: 2, y: 2, z: 1 },
    textureFormat: THREE.RGBAFormat,
    plan: exactBatchPlan,
  });

  prepareSparseSegmentationExactBatch(state, 0);
  const firstTexture = state.batchAtlasTexture;
  assert.ok(firstTexture);
  assert.deepEqual(Array.from(state.batchAtlasData), [1, 0, 0, 0, 2, 0, 0, 0]);

  prepareSparseSegmentationExactBatch(state, 1);
  assert.equal(state.batchAtlasTexture, firstTexture);
  assert.deepEqual(Array.from(state.batchAtlasData), [3, 0, 0, 0, 4, 0, 0, 0]);
  assert.deepEqual(Array.from(state.batchAtlasIndexData), [0, 0, 1, 2]);
});
