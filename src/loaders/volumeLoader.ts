import { VolumeTooLargeError, type VolumeDimensions } from '../errors';
import {
  createVolumeTypedArray,
  type VolumePayload,
  type VolumeTypedArray
} from '../types/volume';
import VolumeWorker from '../workers/volumeLoader.worker?worker';
import type {
  VolumeLoadedMessage,
  VolumeSliceMessage,
  VolumeStartMessage,
  VolumeWorkerOutboundMessage
} from '../workers/volumeLoaderMessages';

export type VolumeLoadCallbacks = {
  onVolumeLoaded?: (index: number, payload: VolumePayload) => void;
};

type VolumeAssemblyState = {
  metadata: VolumeStartMessage['metadata'];
  buffer: ArrayBufferLike;
  destination: VolumeTypedArray;
  sliceCount: number;
  sliceLength: number;
  bytesPerSlice: number;
  slicesReceived: number;
};

type VolumeTooLargeMessageDetails = {
  requiredBytes: number;
  maxBytes: number;
  dimensions: VolumeDimensions;
  fileName?: string;
};

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

export async function loadVolumesFromFiles(
  files: File[],
  callbacks: VolumeLoadCallbacks = {}
): Promise<VolumePayload[]> {
  if (files.length === 0) {
    return [];
  }

  return new Promise<VolumePayload[]>((resolve, reject) => {
    const worker = new VolumeWorker();
    const requestId = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
    const volumes: VolumePayload[] = new Array(files.length);

    const assemblies = new Map<number, VolumeAssemblyState>();
    let settled = false;

    const cleanup = () => {
      assemblies.clear();
      worker.terminate();
    };

    const fail = (error: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(error instanceof Error ? error : new Error(String(error)));
    };

    const createAssemblyState = (start: VolumeStartMessage): VolumeAssemblyState => {
      const { metadata } = start;
      const sliceLength = metadata.width * metadata.height * metadata.channels;
      const sliceCount = metadata.depth;
      if (sliceLength <= 0 || sliceCount <= 0) {
        throw new Error('Received invalid volume dimensions from worker.');
      }
      const totalValues = sliceLength * sliceCount;
      const bytesPerSlice = sliceLength * metadata.bytesPerValue;
      const totalBytes = bytesPerSlice * sliceCount;

      let buffer: ArrayBufferLike | null = null;
      let allocationError: unknown = null;

      if (typeof SharedArrayBuffer !== 'undefined') {
        try {
          buffer = new SharedArrayBuffer(totalBytes);
        } catch (error) {
          allocationError = error;
        }
      }

      if (!buffer) {
        try {
          buffer = new ArrayBuffer(totalBytes);
        } catch (error) {
          throw (allocationError ?? error);
        }
      }

      const destination = createVolumeTypedArray(metadata.dataType, buffer, 0, totalValues);

      return {
        metadata,
        buffer,
        destination,
        sliceCount,
        sliceLength,
        bytesPerSlice,
        slicesReceived: 0
      };
    };

    worker.onmessage = (event) => {
      const message = event.data as VolumeWorkerOutboundMessage;

      if (!message || message.requestId !== requestId || settled) {
        return;
      }

      switch (message.type) {
        case 'volume-start': {
          try {
            const state = createAssemblyState(message);
            assemblies.set(message.index, state);
          } catch (error) {
            fail(error);
          }
          break;
        }
        case 'volume-slice': {
          const state = assemblies.get(message.index);
          if (!state) {
            fail(new Error('Received a volume slice before initialization.'));
            return;
          }

          try {
            if (message.sliceCount !== state.sliceCount) {
              throw new Error('Volume slice count mismatch between worker and loader.');
            }
            if (message.sliceIndex < 0 || message.sliceIndex >= state.sliceCount) {
              throw new Error(
                `Slice index ${message.sliceIndex} is out of bounds for volume ${message.index}.`
              );
            }
            if (message.buffer.byteLength !== state.bytesPerSlice) {
              throw new Error('Received a volume slice with an unexpected byte length.');
            }

            const slice = createVolumeTypedArray(
              state.metadata.dataType,
              message.buffer,
              0,
              state.sliceLength
            );
            state.destination.set(slice, message.sliceIndex * state.sliceLength);
            state.slicesReceived += 1;
          } catch (error) {
            fail(error);
          }
          break;
        }
        case 'volume-loaded': {
          const state = assemblies.get(message.index);
          if (!state) {
            fail(new Error('Received volume metadata before initialization.'));
            return;
          }

          assemblies.delete(message.index);

          if (state.slicesReceived !== state.sliceCount) {
            console.warn(
              `Volume ${message.index} completed with ${state.slicesReceived} of ${state.sliceCount} slices.`
            );
          }

          const payload: VolumePayload = {
            ...message.metadata,
            data: state.buffer
          };

          volumes[message.index] = payload;

          if (callbacks.onVolumeLoaded) {
            try {
              callbacks.onVolumeLoaded(message.index, payload);
            } catch (error) {
              fail(error);
              return;
            }
          }
          break;
        }
        case 'complete':
          settled = true;
          cleanup();
          resolve(volumes);
          break;
        case 'error': {
          let errorToReport: Error;
          if (message.code === 'volume-too-large' && isVolumeTooLargeMessageDetails(message.details)) {
            errorToReport = new VolumeTooLargeError(
              {
                requiredBytes: message.details.requiredBytes,
                maxBytes: message.details.maxBytes,
                dimensions: message.details.dimensions,
                fileName: message.details.fileName
              },
              message.message
            );
          } else {
            errorToReport = new Error(message.message);
          }
          fail(errorToReport);
          break;
        }
        default:
          break;
      }
    };

    worker.onerror = (event) => {
      fail(event.error instanceof Error ? event.error : new Error(event.message ?? 'Worker error'));
    };

    worker.postMessage({ type: 'load-volumes', requestId, files });
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
