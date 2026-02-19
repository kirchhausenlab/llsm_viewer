import { VolumeTooLargeError, type VolumeDimensions } from '../errors';
import {
  createVolumeTypedArray,
  type VolumePayload,
  type VolumeTypedArray
} from '../types/volume';
import VolumeWorker from '../workers/volumeLoader.worker?worker';
import type { VolumeWorkerOutboundMessage } from '../workers/volumeLoaderMessages';

export type VolumeLoadCallbacks = {
  onVolumeLoaded?: (index: number, payload: VolumePayload) => void;
};

type VolumeTooLargeMessageDetails = {
  requiredBytes: number;
  maxBytes: number;
  dimensions: VolumeDimensions;
  fileName?: string;
};

type PendingLoadRequest = {
  expectedVolumeCount: number;
  callbacks: VolumeLoadCallbacks;
  volumes: Array<VolumePayload | undefined>;
  settled: boolean;
  resolve: (volumes: VolumePayload[]) => void;
  reject: (error: Error) => void;
};

let sharedVolumeWorker: Worker | null = null;
const pendingLoadRequests = new Map<number, PendingLoadRequest>();
let nextRequestId = 1;

function isVolumeTooLargeMessageDetails(value: unknown): value is VolumeTooLargeMessageDetails {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const details = value as Partial<VolumeTooLargeMessageDetails>;
  return (
    typeof details.requiredBytes === 'number' &&
    typeof details.maxBytes === 'number' &&
    typeof details.dimensions === 'object' &&
    details.dimensions !== null &&
    typeof (details.dimensions as VolumeDimensions).width === 'number' &&
    typeof (details.dimensions as VolumeDimensions).height === 'number' &&
    typeof (details.dimensions as VolumeDimensions).depth === 'number' &&
    typeof (details.dimensions as VolumeDimensions).channels === 'number' &&
    typeof (details.dimensions as VolumeDimensions).dataType === 'string'
  );
}

function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function toVolumeTooLargeError(details: VolumeTooLargeMessageDetails, message: string): VolumeTooLargeError {
  return new VolumeTooLargeError(
    {
      requiredBytes: details.requiredBytes,
      maxBytes: details.maxBytes,
      dimensions: details.dimensions,
      fileName: details.fileName
    },
    message
  );
}

function destroySharedWorker(): void {
  if (!sharedVolumeWorker) {
    return;
  }
  sharedVolumeWorker.terminate();
  sharedVolumeWorker = null;
}

function failLoadRequest(requestId: number, error: unknown): void {
  const request = pendingLoadRequests.get(requestId);
  if (!request || request.settled) {
    return;
  }
  request.settled = true;
  pendingLoadRequests.delete(requestId);
  request.reject(normalizeError(error));
}

function failAllLoadRequests(error: unknown): void {
  const requestIds = Array.from(pendingLoadRequests.keys());
  for (const requestId of requestIds) {
    failLoadRequest(requestId, error);
  }
}

function completeLoadRequest(requestId: number): void {
  const request = pendingLoadRequests.get(requestId);
  if (!request || request.settled) {
    return;
  }

  const loadedCount = request.volumes.filter((volume) => volume !== undefined).length;
  if (loadedCount !== request.expectedVolumeCount) {
    failLoadRequest(
      requestId,
      new Error(
        `Worker completed request ${requestId} with ${loadedCount} of ${request.expectedVolumeCount} volumes loaded.`
      )
    );
    return;
  }

  request.settled = true;
  pendingLoadRequests.delete(requestId);
  request.resolve(request.volumes as VolumePayload[]);
}

function assignLoadedVolume(
  request: PendingLoadRequest,
  index: number,
  payload: VolumePayload
): void {
  if (index < 0 || index >= request.expectedVolumeCount) {
    throw new Error(`Worker returned out-of-bounds volume index ${index}.`);
  }
  request.volumes[index] = payload;
}

function handleWorkerMessage(event: MessageEvent<VolumeWorkerOutboundMessage>): void {
  const message = event.data;
  if (!message) {
    return;
  }

  const request = pendingLoadRequests.get(message.requestId);
  if (!request || request.settled) {
    return;
  }

  switch (message.type) {
    case 'volume-loaded': {
      try {
        const payload: VolumePayload = {
          ...message.metadata,
          data: message.buffer
        };
        assignLoadedVolume(request, message.index, payload);

        if (request.callbacks.onVolumeLoaded) {
          request.callbacks.onVolumeLoaded(message.index, payload);
        }
      } catch (error) {
        failLoadRequest(message.requestId, error);
      }
      break;
    }
    case 'complete':
      completeLoadRequest(message.requestId);
      break;
    case 'error': {
      if (message.code === 'volume-too-large' && isVolumeTooLargeMessageDetails(message.details)) {
        failLoadRequest(message.requestId, toVolumeTooLargeError(message.details, message.message));
        break;
      }
      failLoadRequest(message.requestId, new Error(message.message));
      break;
    }
    default:
      break;
  }
}

function handleWorkerError(event: ErrorEvent): void {
  const normalized = event.error instanceof Error
    ? event.error
    : new Error(event.message || 'Volume loader worker error');
  failAllLoadRequests(normalized);
  destroySharedWorker();
}

function ensureSharedWorker(): Worker {
  if (sharedVolumeWorker) {
    return sharedVolumeWorker;
  }
  const worker = new VolumeWorker();
  worker.onmessage = handleWorkerMessage as (event: MessageEvent) => void;
  worker.onerror = handleWorkerError;
  sharedVolumeWorker = worker;
  return worker;
}

function allocateRequestId(): number {
  let candidate = nextRequestId;
  while (pendingLoadRequests.has(candidate)) {
    candidate += 1;
    if (candidate >= Number.MAX_SAFE_INTEGER) {
      candidate = 1;
    }
  }
  nextRequestId = candidate + 1;
  if (nextRequestId >= Number.MAX_SAFE_INTEGER) {
    nextRequestId = 1;
  }
  return candidate;
}

export async function loadVolumesFromFiles(
  files: File[],
  callbacks: VolumeLoadCallbacks = {}
): Promise<VolumePayload[]> {
  if (files.length === 0) {
    return [];
  }

  return new Promise<VolumePayload[]>((resolve, reject) => {
    const requestId = allocateRequestId();
    pendingLoadRequests.set(requestId, {
      expectedVolumeCount: files.length,
      callbacks,
      volumes: new Array(files.length),
      settled: false,
      resolve,
      reject
    });

    const worker = ensureSharedWorker();
    try {
      worker.postMessage({ type: 'load-volumes', requestId, files });
    } catch (error) {
      failLoadRequest(requestId, error);
    }
  });
}

const computeSliceRange = (slice: VolumeTypedArray): { min: number; max: number } => {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (let i = 0; i < slice.length; i += 1) {
    const value = slice[i] as number;
    if (Number.isNaN(value)) {
      continue;
    }
    if (value < min) {
      min = value;
    }
    if (value > max) {
      max = value;
    }
  }

  if (!Number.isFinite(min)) {
    min = 0;
  }
  if (!Number.isFinite(max)) {
    max = min === 0 ? 1 : min + 1;
  }
  if (min === max) {
    max = min + 1;
  }

  return { min, max };
};

export function expandVolumesForMovieMode(
  volumes: VolumePayload[],
  movieMode: '2d' | '3d'
): VolumePayload[] {
  if (movieMode !== '2d') {
    return volumes;
  }

  const expanded: VolumePayload[] = [];
  for (const volume of volumes) {
    if (volume.depth <= 0) {
      continue;
    }

    const sliceLength = volume.width * volume.height * volume.channels;
    const source = createVolumeTypedArray(volume.dataType, volume.data);

    for (let sliceIndex = 0; sliceIndex < volume.depth; sliceIndex += 1) {
      const slice = source.slice(sliceIndex * sliceLength, (sliceIndex + 1) * sliceLength);
      const { min, max } = computeSliceRange(slice);
      expanded.push({
        width: volume.width,
        height: volume.height,
        depth: 1,
        channels: volume.channels,
        dataType: volume.dataType,
        voxelSize: volume.voxelSize,
        min,
        max,
        data: slice.buffer
      });
    }
  }

  return expanded;
}
