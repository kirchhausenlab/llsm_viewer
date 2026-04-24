/// <reference lib="webworker" />

import { buildFullGpuBrickResidencyAtlas } from '../components/viewers/volume-viewer/gpuBrickResidencyPacking';
import type {
  GpuBrickResidencyPackInboundMessage,
  GpuBrickResidencyPackOutboundMessage,
} from './gpuBrickResidencyPackMessages';

const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (event: MessageEvent<GpuBrickResidencyPackInboundMessage>) => {
  const message = event.data;
  if (message.type !== 'build-full-resident-atlas') {
    return;
  }

  try {
    const pageTable = {
      gridShape: message.pageTable.gridShape,
      chunkShape: message.pageTable.chunkShape,
      volumeShape: message.pageTable.volumeShape,
      occupiedBrickCount: message.pageTable.occupiedBrickCount,
      scaleLevel: message.pageTable.scaleLevel,
      brickAtlasIndices: new Int32Array(message.pageTable.brickAtlasIndices),
    };
    const sourceData = new Uint8Array(message.sourceData);
    const build = buildFullGpuBrickResidencyAtlas({
      pageTable,
      sourceData,
      textureComponents: message.textureComponents,
      max3DTextureSize: message.max3DTextureSize,
    });
    if (!build) {
      throw new Error('Unable to build a full resident atlas for the requested brick residency layout.');
    }
    const outbound: GpuBrickResidencyPackOutboundMessage = {
      type: 'built',
      id: message.id,
      atlasData: build.atlasData.buffer as ArrayBuffer,
      atlasIndices: build.atlasIndices.buffer as ArrayBuffer,
      atlasWidth: build.atlasSize.width,
      atlasHeight: build.atlasSize.height,
      atlasDepth: build.atlasSize.depth,
      slotGrid: build.slotGrid,
      residentBytes: build.residentBytes,
    };
    ctx.postMessage(outbound, [build.atlasData.buffer as ArrayBuffer, build.atlasIndices.buffer as ArrayBuffer]);
  } catch (error) {
    const outbound: GpuBrickResidencyPackOutboundMessage = {
      type: 'error',
      id: message.id,
      message: error instanceof Error ? error.message : 'GPU brick residency pack worker failed.',
    };
    ctx.postMessage(outbound);
  }
};
