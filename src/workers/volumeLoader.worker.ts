/// <reference lib="webworker" />
import { fromBlob } from 'geotiff';
import { MAX_VOLUME_BYTES } from '../shared/constants/volumeLimits';
import { VolumeTooLargeError } from '../errors';
import type { VolumeDataType, VolumeTypedArray } from '../types/volume';
import { getBytesPerValue } from '../types/volume';
import type {
  VolumeLoadedMessage,
  VolumeWorkerCompleteMessage,
  VolumeWorkerErrorMessage
} from './volumeLoaderMessages';

type SupportedTypedArray = VolumeTypedArray;

type LoadVolumesMessage = {
  type: 'load-volumes';
  requestId: number;
  files: File[];
};

type WorkerMessage = LoadVolumesMessage;

const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const message = event.data;
  if (!message) {
    return;
  }

  switch (message.type) {
    case 'load-volumes': {
      const { files, requestId } = message;
      try {
        const { error } = await loadVolumesConcurrently(files, requestId);
        if (error !== null) {
          throw error;
        }
        ctx.postMessage(
          {
            type: 'complete',
            requestId
          } satisfies VolumeWorkerCompleteMessage
        );
      } catch (error) {
        const serialized = serializeErrorDetails(error);
        ctx.postMessage(
          {
            type: 'error',
            requestId,
            message: serialized.message,
            code: serialized.code,
            details: serialized.details
          } satisfies VolumeWorkerErrorMessage
        );
      }
      break;
    }
    default:
      break;
  }
};

async function loadVolumesConcurrently(
  files: File[],
  requestId: number
): Promise<{ error: unknown | null }> {
  if (files.length === 0) {
    return { error: null };
  }

  const hardwareConcurrency = ctx.navigator?.hardwareConcurrency;
  const maxConcurrency = Number.isFinite(hardwareConcurrency) && hardwareConcurrency
    ? hardwareConcurrency
    : 4;
  const concurrency = Math.max(1, Math.min(files.length, maxConcurrency));

  let nextIndex = 0;
  const getNextIndex = () => {
    if (nextIndex >= files.length) {
      return null;
    }
    const current = nextIndex;
    nextIndex += 1;
    return current;
  };

  const errorRef: { value: unknown | null } = { value: null };

  const runWorker = async (): Promise<void> => {
    while (true) {
      if (errorRef.value) {
        return;
      }

      const index = getNextIndex();
      if (index === null) {
        return;
      }

      const file = files[index];

      try {
        await loadVolumeFromFile(file, requestId, index);
        if (errorRef.value) {
          return;
        }
      } catch (error) {
        if (!errorRef.value) {
          errorRef.value = error;
        }
        return;
      }
    }
  };

  const workers = Array.from({ length: concurrency }, () => runWorker());
  await Promise.all(workers);

  return { error: errorRef.value };
}

async function loadVolumeFromFile(
  file: File,
  requestId: number,
  index: number
): Promise<void> {
  const tiff = await fromBlob(file);
  const imageCount = await tiff.getImageCount();
  if (imageCount === 0) {
    throw new Error(`File "${file.name}" does not contain any images.`);
  }

  const firstImage = await tiff.getImage(0);
  const width = firstImage.getWidth();
  const height = firstImage.getHeight();
  const channels = firstImage.getSamplesPerPixel();

  const sliceLength = width * height * channels;
  const totalValues = sliceLength * imageCount;

  const firstRasterRaw = (await firstImage.readRasters({ interleave: true })) as unknown;
  if (!ArrayBuffer.isView(firstRasterRaw)) {
    throw new Error(`File "${file.name}" does not provide raster data as a typed array.`);
  }

  const typedFirstRaster = firstRasterRaw as SupportedTypedArray;
  const dataType = detectDataType(typedFirstRaster);
  const bytesPerValue = getBytesPerValue(dataType);
  const totalBytes = totalValues * bytesPerValue;
  if (totalBytes > MAX_VOLUME_BYTES) {
    throw new VolumeTooLargeError({
      requiredBytes: totalBytes,
      maxBytes: MAX_VOLUME_BYTES,
      dimensions: { width, height, depth: imageCount, channels, dataType },
      fileName: file.name
    });
  }

  const volumeValues = createWritableArray(dataType, totalValues);

  let globalMin = Number.POSITIVE_INFINITY;
  let globalMax = Number.NEGATIVE_INFINITY;

  if (typedFirstRaster.length !== sliceLength) {
    throw new Error(`File "${file.name}" returned an unexpected slice length.`);
  }

  scanAndCopySlice(typedFirstRaster, 0);

  for (let sliceIndex = 1; sliceIndex < imageCount; sliceIndex += 1) {
    const image = await tiff.getImage(sliceIndex);
    if (image.getWidth() !== width || image.getHeight() !== height) {
      throw new Error(`Slice ${sliceIndex + 1} in file "${file.name}" has mismatched dimensions.`);
    }
    if (image.getSamplesPerPixel() !== channels) {
      throw new Error(`Slice ${sliceIndex + 1} in file "${file.name}" has a different channel count.`);
    }

    const rasterRaw = (await image.readRasters({ interleave: true })) as unknown;
    if (!ArrayBuffer.isView(rasterRaw)) {
      throw new Error(`File "${file.name}" does not provide raster data as a typed array.`);
    }

    const raster = ensureTypedArray(rasterRaw as SupportedTypedArray, dataType, file.name, sliceIndex);
    if (raster.length !== sliceLength) {
      throw new Error(`Slice ${sliceIndex + 1} in file "${file.name}" returned an unexpected slice length.`);
    }

    scanAndCopySlice(raster, sliceIndex);
  }

  if (!Number.isFinite(globalMin) || globalMin === Number.POSITIVE_INFINITY) {
    globalMin = 0;
  }
  if (!Number.isFinite(globalMax) || globalMax === Number.NEGATIVE_INFINITY) {
    globalMax = globalMin === 0 ? 1 : globalMin + 1;
  }
  if (globalMin === globalMax) {
    globalMax = globalMin + 1;
  }
  const loadedMessage: VolumeLoadedMessage = {
    type: 'volume-loaded',
    requestId,
    index,
    metadata: {
      width,
      height,
      depth: imageCount,
      channels,
      dataType,
      min: globalMin,
      max: globalMax
    },
    buffer: toTransferableBuffer(volumeValues)
  };
  ctx.postMessage(loadedMessage, [loadedMessage.buffer]);

  function scanAndCopySlice(array: SupportedTypedArray, sliceIndex: number) {
    let sliceMin = Number.POSITIVE_INFINITY;
    let sliceMax = Number.NEGATIVE_INFINITY;

    for (let i = 0; i < array.length; i += 1) {
      const rawValue = array[i] as number;
      if (Number.isNaN(rawValue)) {
        continue;
      }
      if (rawValue < sliceMin) {
        sliceMin = rawValue;
      }
      if (rawValue > sliceMax) {
        sliceMax = rawValue;
      }
    }

    if (Number.isFinite(sliceMin) && sliceMin < globalMin) {
      globalMin = sliceMin;
    }
    if (Number.isFinite(sliceMax) && sliceMax > globalMax) {
      globalMax = sliceMax;
    }
    volumeValues.set(array, sliceIndex * sliceLength);
  }
}

function createWritableArray(dataType: VolumeDataType, length: number): SupportedTypedArray {
  switch (dataType) {
    case 'uint8':
      return new Uint8Array(length);
    case 'int8':
      return new Int8Array(length);
    case 'uint16':
      return new Uint16Array(length);
    case 'int16':
      return new Int16Array(length);
    case 'uint32':
      return new Uint32Array(length);
    case 'int32':
      return new Int32Array(length);
    case 'float32':
      return new Float32Array(length);
    case 'float64':
      return new Float64Array(length);
    default: {
      const exhaustiveCheck: never = dataType;
      throw new Error(`Unsupported volume data type: ${exhaustiveCheck}`);
    }
  }
}

function detectDataType(array: SupportedTypedArray): VolumeDataType {
  if (array instanceof Uint8Array) {
    return 'uint8';
  }
  if (array instanceof Int8Array) {
    return 'int8';
  }
  if (array instanceof Uint16Array) {
    return 'uint16';
  }
  if (array instanceof Int16Array) {
    return 'int16';
  }
  if (array instanceof Uint32Array) {
    return 'uint32';
  }
  if (array instanceof Int32Array) {
    return 'int32';
  }
  if (array instanceof Float32Array) {
    return 'float32';
  }
  if (array instanceof Float64Array) {
    return 'float64';
  }
  throw new Error('Unsupported raster data type.');
}

function ensureTypedArray(
  array: SupportedTypedArray,
  expected: VolumeDataType,
  fileName: string,
  sliceIndex: number
): SupportedTypedArray {
  switch (expected) {
    case 'uint8':
      if (!(array instanceof Uint8Array)) {
        throw new Error(`Slice ${sliceIndex + 1} in "${fileName}" changed its sample type.`);
      }
      return array;
    case 'int8':
      if (!(array instanceof Int8Array)) {
        throw new Error(`Slice ${sliceIndex + 1} in "${fileName}" changed its sample type.`);
      }
      return array;
    case 'uint16':
      if (!(array instanceof Uint16Array)) {
        throw new Error(`Slice ${sliceIndex + 1} in "${fileName}" changed its sample type.`);
      }
      return array;
    case 'int16':
      if (!(array instanceof Int16Array)) {
        throw new Error(`Slice ${sliceIndex + 1} in "${fileName}" changed its sample type.`);
      }
      return array;
    case 'uint32':
      if (!(array instanceof Uint32Array)) {
        throw new Error(`Slice ${sliceIndex + 1} in "${fileName}" changed its sample type.`);
      }
      return array;
    case 'int32':
      if (!(array instanceof Int32Array)) {
        throw new Error(`Slice ${sliceIndex + 1} in "${fileName}" changed its sample type.`);
      }
      return array;
    case 'float32':
      if (!(array instanceof Float32Array)) {
        throw new Error(`Slice ${sliceIndex + 1} in "${fileName}" changed its sample type.`);
      }
      return array;
    case 'float64':
      if (!(array instanceof Float64Array)) {
        throw new Error(`Slice ${sliceIndex + 1} in "${fileName}" changed its sample type.`);
      }
      return array;
    default: {
      const exhaustiveCheck: never = expected;
      throw new Error(`Unsupported volume data type: ${exhaustiveCheck}`);
    }
  }
}

function toTransferableBuffer(array: SupportedTypedArray): ArrayBuffer {
  const { buffer, byteOffset, byteLength } = array;
  if (
    buffer instanceof ArrayBuffer &&
    byteOffset === 0 &&
    byteLength === buffer.byteLength
  ) {
    return buffer;
  }
  return new Uint8Array(buffer, byteOffset, byteLength).slice().buffer;
}

function serializeErrorDetails(error: unknown): {
  message: string;
  code?: string;
  details?: unknown;
} {
  if (error instanceof VolumeTooLargeError) {
    return {
      message: error.message,
      code: 'volume-too-large',
      details: {
        requiredBytes: error.requiredBytes,
        maxBytes: error.maxBytes,
        dimensions: error.dimensions,
        fileName: error.fileName
      }
    };
  }

  if (error instanceof Error) {
    return { message: error.message };
  }

  return { message: 'An unexpected error occurred while loading volumes.' };
}

export {};
