import type { NormalizationParameters } from '../../../core/volumeProcessing';
import { createVolumeTypedArray, type VolumePayload } from '../../../types/volume';
import type { PreprocessedLayerScaleManifestEntry } from './types';
import type {
  BuildPreprocessScalePyramidMessage,
  PreprocessScalePyramidWorkerOutboundMessage
} from '../../../workers/preprocessScalePyramidMessages';

export type PreprocessScalePyramidWorkerResultScale = {
  level: number;
  width: number;
  height: number;
  depth: number;
  channels: number;
  data: Uint8Array;
  labels?: Uint32Array;
};

type PendingScalePyramidRequest = {
  resolve: (scales: PreprocessScalePyramidWorkerResultScale[]) => void;
  reject: (error: Error) => void;
};

type WorkerConstructor = new () => Worker;

let sharedWorkerPromise: Promise<Worker> | null = null;
let nextRequestId = 1;
const pendingRequests = new Map<number, PendingScalePyramidRequest>();

function createAbortError(reason: unknown): Error {
  if (reason instanceof Error && reason.name === 'AbortError') {
    return reason;
  }
  if (typeof DOMException !== 'undefined') {
    try {
      return new DOMException('Aborted', 'AbortError');
    } catch {
      // fall through
    }
  }
  const error = reason instanceof Error ? reason : new Error('Aborted');
  error.name = 'AbortError';
  return error;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) {
    return;
  }
  throw createAbortError(signal.reason);
}

function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function failRequest(requestId: number, error: unknown): void {
  const pending = pendingRequests.get(requestId);
  if (!pending) {
    return;
  }
  pendingRequests.delete(requestId);
  pending.reject(normalizeError(error));
}

function failAllRequests(error: unknown): void {
  const requestIds = Array.from(pendingRequests.keys());
  for (const requestId of requestIds) {
    failRequest(requestId, error);
  }
}

function destroySharedWorker(): void {
  if (!sharedWorkerPromise) {
    return;
  }
  sharedWorkerPromise
    .then((worker) => {
      worker.terminate();
    })
    .catch(() => {
      // ignore worker init failures during teardown
    });
  sharedWorkerPromise = null;
}

function handleWorkerMessage(event: MessageEvent<PreprocessScalePyramidWorkerOutboundMessage>): void {
  const message = event.data;
  if (!message) {
    return;
  }

  if (message.type === 'error') {
    failRequest(message.requestId, new Error(message.message));
    return;
  }
  if (message.type !== 'preprocess-scale-pyramid-ready') {
    return;
  }

  const pending = pendingRequests.get(message.requestId);
  if (!pending) {
    return;
  }
  pendingRequests.delete(message.requestId);
  pending.resolve(
    message.scales.map((scale) => ({
      level: scale.level,
      width: scale.width,
      height: scale.height,
      depth: scale.depth,
      channels: scale.channels,
      data: new Uint8Array(scale.data),
      ...(scale.labels ? { labels: new Uint32Array(scale.labels) } : {})
    }))
  );
}

function handleWorkerError(event: ErrorEvent): void {
  failAllRequests(event.error instanceof Error ? event.error : new Error(event.message || 'Worker error'));
  destroySharedWorker();
}

async function ensureSharedWorker(): Promise<Worker> {
  if (sharedWorkerPromise) {
    return sharedWorkerPromise;
  }

  sharedWorkerPromise = (async () => {
    const module = await import('../../../workers/preprocessScalePyramid.worker?worker');
    const WorkerClass = module.default as unknown as WorkerConstructor;
    const worker = new WorkerClass();
    worker.onmessage = handleWorkerMessage as (event: MessageEvent) => void;
    worker.onerror = handleWorkerError;
    return worker;
  })();

  try {
    return await sharedWorkerPromise;
  } catch (error) {
    sharedWorkerPromise = null;
    throw error;
  }
}

function allocateRequestId(): number {
  let requestId = nextRequestId;
  while (pendingRequests.has(requestId)) {
    requestId += 1;
    if (requestId >= Number.MAX_SAFE_INTEGER) {
      requestId = 1;
    }
  }
  nextRequestId = requestId + 1;
  if (nextRequestId >= Number.MAX_SAFE_INTEGER) {
    nextRequestId = 1;
  }
  return requestId;
}

function createTransferableRawVolumeData(rawVolume: VolumePayload): {
  data: ArrayBuffer;
  transferList: ArrayBuffer[];
} {
  const typed = createVolumeTypedArray(rawVolume.dataType, rawVolume.data);
  const copied = new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength).slice().buffer;
  return { data: copied, transferList: [copied] };
}

export function supportsPreprocessScalePyramidWorker(): boolean {
  return typeof window !== 'undefined' && typeof Worker !== 'undefined';
}

export async function buildPreprocessScalePyramidInWorker({
  rawVolume,
  scales,
  layerKey,
  isSegmentation,
  segmentationSeed,
  normalization,
  signal
}: {
  rawVolume: VolumePayload;
  scales: PreprocessedLayerScaleManifestEntry[];
  layerKey: string;
  isSegmentation: boolean;
  segmentationSeed: number;
  normalization: NormalizationParameters | null;
  signal?: AbortSignal;
}): Promise<PreprocessScalePyramidWorkerResultScale[]> {
  throwIfAborted(signal);
  const worker = await ensureSharedWorker();
  throwIfAborted(signal);

  const requestId = allocateRequestId();
  const { data, transferList } = createTransferableRawVolumeData(rawVolume);

  return new Promise<PreprocessScalePyramidWorkerResultScale[]>((resolve, reject) => {
    pendingRequests.set(requestId, {
      resolve,
      reject
    });

    const onAbort = () => {
      pendingRequests.delete(requestId);
      reject(createAbortError(signal?.reason));
    };

    if (signal) {
      signal.addEventListener('abort', onAbort, { once: true });
    }

    const finish = () => {
      if (signal) {
        signal.removeEventListener('abort', onAbort);
      }
    };

    const pending = pendingRequests.get(requestId);
    if (!pending) {
      finish();
      reject(createAbortError(signal?.reason));
      return;
    }
    pending.resolve = (value) => {
      finish();
      resolve(value);
    };
    pending.reject = (error) => {
      finish();
      reject(error);
    };

    const message: BuildPreprocessScalePyramidMessage = {
      type: 'build-preprocess-scale-pyramid',
      requestId,
      layerKey,
      isSegmentation,
      segmentationSeed,
      normalization,
      rawVolume: {
        width: rawVolume.width,
        height: rawVolume.height,
        depth: rawVolume.depth,
        channels: rawVolume.channels,
        dataType: rawVolume.dataType,
        voxelSize: rawVolume.voxelSize,
        min: rawVolume.min,
        max: rawVolume.max,
        data
      },
      scales: scales.map((scale) => ({
        level: scale.level,
        width: scale.width,
        height: scale.height,
        depth: scale.depth,
        channels: scale.channels,
        hasLabels: Boolean(scale.zarr.labels)
      }))
    };

    try {
      worker.postMessage(message, transferList);
    } catch (error) {
      pendingRequests.delete(requestId);
      finish();
      reject(normalizeError(error));
    }
  });
}
