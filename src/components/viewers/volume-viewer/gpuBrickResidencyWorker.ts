import * as THREE from 'three';

import type { VolumeBrickPageTable } from '../../../core/volumeProvider';
import {
  buildFullGpuBrickResidencyAtlas,
  resolveFullGpuBrickResidencyLayout,
  type FullGpuBrickResidencyBuildResult,
  type FullGpuBrickResidencyLayout,
} from './gpuBrickResidencyPacking';
import type {
  GpuBrickResidencyPackInboundMessage,
  GpuBrickResidencyPackOutboundMessage,
} from '../../../workers/gpuBrickResidencyPackMessages';

type TextureFormat = THREE.Data3DTexture['format'];

type ResourceWorkerBuildState = {
  requestId: number;
  sourceToken: object | null;
  pageTable: VolumeBrickPageTable | null;
  textureFormat: TextureFormat | null;
  max3DTextureSize: number | null;
  layout: FullGpuBrickResidencyLayout | null;
  status: 'idle' | 'pending' | 'ready' | 'error';
  result: FullGpuBrickResidencyBuildResult | null;
  error: Error | null;
};

type PendingWorkerRequest = {
  state: ResourceWorkerBuildState;
  onSettled: () => void;
};

export type FullGpuBrickResidencyBuildStatus =
  | { status: 'pending'; layout: FullGpuBrickResidencyLayout }
  | { status: 'ready'; result: FullGpuBrickResidencyBuildResult }
  | { status: 'unavailable' }
  | { status: 'error'; error: Error };

const buildStateByResource = new WeakMap<object, ResourceWorkerBuildState>();
const pendingWorkerRequests = new Map<number, PendingWorkerRequest>();
let residencyPackWorker: Worker | null = null;
let residencyPackWorkerFatalError: Error | null = null;
let nextResidencyPackRequestId = 1;

function getTextureComponentsFromFormat(format: TextureFormat): number | null {
  if (format === THREE.RedFormat) {
    return 1;
  }
  if (format === THREE.RGFormat) {
    return 2;
  }
  if (format === THREE.RGBAFormat) {
    return 4;
  }
  return null;
}

function normalizeWorkerError(error: unknown): Error {
  const detail =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : error === undefined || error === null
          ? ''
          : String(error);
  const suffix = detail ? `: ${detail}` : '';
  return new Error(`GPU brick residency pack worker failed${suffix}`);
}

function closeResidencyPackWorker(options?: { fatal?: boolean; cause?: unknown }) {
  residencyPackWorker?.terminate();
  residencyPackWorker = null;
  if (options?.fatal) {
    residencyPackWorkerFatalError = normalizeWorkerError(options.cause);
  } else {
    residencyPackWorkerFatalError = null;
  }
  const stopError = residencyPackWorkerFatalError ?? new Error('GPU brick residency pack worker stopped.');
  for (const pending of pendingWorkerRequests.values()) {
    pending.state.status = 'error';
    pending.state.error = stopError;
    pending.state.result = null;
    pending.onSettled();
  }
  pendingWorkerRequests.clear();
}

function ensureResidencyPackWorker(): Worker | null {
  if (residencyPackWorker) {
    return residencyPackWorker;
  }
  if (residencyPackWorkerFatalError) {
    throw residencyPackWorkerFatalError;
  }
  if (typeof Worker === 'undefined') {
    return null;
  }
  try {
    const worker = new Worker(new URL('../../../workers/gpuBrickResidencyPack.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = (event: MessageEvent<GpuBrickResidencyPackOutboundMessage>) => {
      const message = event.data;
      const pending = pendingWorkerRequests.get(message.id);
      if (!pending) {
        return;
      }
      pendingWorkerRequests.delete(message.id);
      if (pending.state.requestId !== message.id) {
        return;
      }
      if (message.type === 'built') {
        pending.state.status = 'ready';
        pending.state.error = null;
        pending.state.result = {
          atlasData: new Uint8Array(message.atlasData),
          atlasIndices: new Float32Array(message.atlasIndices),
          atlasSize: {
            width: message.atlasWidth,
            height: message.atlasHeight,
            depth: message.atlasDepth,
          },
          slotGrid: message.slotGrid,
          residentBytes: message.residentBytes,
        };
      } else {
        pending.state.status = 'error';
        pending.state.error = new Error(message.message);
        pending.state.result = null;
      }
      pending.onSettled();
    };
    worker.onerror = (event) => {
      closeResidencyPackWorker({
        fatal: true,
        cause: event.error instanceof Error ? event.error : new Error(event.message || 'Worker error'),
      });
    };
    residencyPackWorker = worker;
    return worker;
  } catch (error) {
    residencyPackWorker = null;
    residencyPackWorkerFatalError = normalizeWorkerError(error);
    throw residencyPackWorkerFatalError;
  }
}

function normalizeMax3DTextureSize(max3DTextureSize: number | null | undefined): number | null {
  if (!max3DTextureSize || !Number.isFinite(max3DTextureSize) || max3DTextureSize <= 0) {
    return null;
  }
  return Math.max(1, Math.floor(max3DTextureSize));
}

export function clearGpuBrickResidencyWorkerState(resource: object): void {
  buildStateByResource.delete(resource);
}

export function getOrStartGpuBrickResidencyWorkerBuild({
  resource,
  pageTable,
  sourceData,
  sourceToken,
  textureFormat,
  max3DTextureSize,
  onSettled,
}: {
  resource: object;
  pageTable: VolumeBrickPageTable;
  sourceData: Uint8Array;
  sourceToken: object | null;
  textureFormat: TextureFormat;
  max3DTextureSize: number | null | undefined;
  onSettled: () => void;
}): FullGpuBrickResidencyBuildStatus {
  const textureComponents = getTextureComponentsFromFormat(textureFormat);
  if (!textureComponents || !sourceToken) {
    return { status: 'unavailable' };
  }

  const normalizedMax3DTextureSize = normalizeMax3DTextureSize(max3DTextureSize);
  const layout = resolveFullGpuBrickResidencyLayout({
    pageTable,
    textureComponents,
    max3DTextureSize: normalizedMax3DTextureSize,
  });
  if (!layout) {
    return { status: 'unavailable' };
  }

  const existing = buildStateByResource.get(resource);
  if (
    existing &&
    existing.sourceToken === sourceToken &&
    existing.pageTable === pageTable &&
    existing.textureFormat === textureFormat &&
    existing.max3DTextureSize === normalizedMax3DTextureSize
  ) {
    if (existing.status === 'ready' && existing.result) {
      return { status: 'ready', result: existing.result };
    }
    if (existing.status === 'pending') {
      return { status: 'pending', layout };
    }
    if (existing.status === 'error' && existing.error) {
      return { status: 'error', error: existing.error };
    }
  }

  let worker: Worker | null = null;
  try {
    worker = ensureResidencyPackWorker();
  } catch (error) {
    return { status: 'error', error: normalizeWorkerError(error) };
  }
  if (!worker) {
    return { status: 'unavailable' };
  }

  const state: ResourceWorkerBuildState = {
    requestId: nextResidencyPackRequestId++,
    sourceToken,
    pageTable,
    textureFormat,
    max3DTextureSize: normalizedMax3DTextureSize,
    layout,
    status: 'pending',
    result: null,
    error: null,
  };
  buildStateByResource.set(resource, state);
  pendingWorkerRequests.set(state.requestId, {
    state,
    onSettled,
  });

  const sourceCopy = sourceData.slice();
  const atlasIndexCopy = pageTable.brickAtlasIndices.slice();
  const message: GpuBrickResidencyPackInboundMessage = {
    type: 'build-full-resident-atlas',
    id: state.requestId,
    textureComponents,
    max3DTextureSize: normalizedMax3DTextureSize,
    pageTable: {
      gridShape: pageTable.gridShape,
      chunkShape: pageTable.chunkShape,
      volumeShape: pageTable.volumeShape,
      occupiedBrickCount: pageTable.occupiedBrickCount,
      scaleLevel: pageTable.scaleLevel,
      brickAtlasIndices: atlasIndexCopy.buffer,
    },
    sourceData: sourceCopy.buffer,
  };
  worker.postMessage(message, [message.sourceData, message.pageTable.brickAtlasIndices]);
  return { status: 'pending', layout };
}

export function buildGpuBrickResidencyWorkerFallback({
  pageTable,
  sourceData,
  textureFormat,
  max3DTextureSize,
}: {
  pageTable: VolumeBrickPageTable;
  sourceData: Uint8Array;
  textureFormat: TextureFormat;
  max3DTextureSize: number | null | undefined;
}): FullGpuBrickResidencyBuildResult | null {
  const textureComponents = getTextureComponentsFromFormat(textureFormat);
  if (!textureComponents) {
    return null;
  }
  return buildFullGpuBrickResidencyAtlas({
    pageTable,
    sourceData,
    textureComponents,
    max3DTextureSize: normalizeMax3DTextureSize(max3DTextureSize),
  });
}
