/// <reference lib="webworker" />
import { fromBlob } from 'geotiff';
import type { VolumeDataType, VolumePayload } from '../types/volume';

type SupportedTypedArray =
  | Uint8Array
  | Int8Array
  | Uint16Array
  | Int16Array
  | Uint32Array
  | Int32Array
  | Float32Array
  | Float64Array;

type LoadVolumesMessage = {
  type: 'load-volumes';
  requestId: number;
  files: File[];
};

type WorkerMessage = LoadVolumesMessage;

type VolumeLoadedMessage = {
  type: 'volume-loaded';
  requestId: number;
  index: number;
  payload: VolumePayload;
};

type LoadCompleteMessage = {
  type: 'complete';
  requestId: number;
};

type LoadErrorMessage = {
  type: 'error';
  requestId: number;
  message: string;
};

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
        for (let index = 0; index < files.length; index += 1) {
          const file = files[index];
          const payload = await loadVolumeFromFile(file);
          const transferable = payload.data;
          ctx.postMessage(
            {
              type: 'volume-loaded',
              requestId,
              index,
              payload
            } satisfies VolumeLoadedMessage,
            [transferable]
          );
        }
        ctx.postMessage(
          {
            type: 'complete',
            requestId
          } satisfies LoadCompleteMessage
        );
      } catch (error) {
        ctx.postMessage(
          {
            type: 'error',
            requestId,
            message:
              error instanceof Error
                ? error.message
                : 'An unexpected error occurred while loading volumes.'
          } satisfies LoadErrorMessage
        );
      }
      break;
    }
    default:
      break;
  }
};

async function loadVolumeFromFile(file: File): Promise<VolumePayload> {
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
  const combined = createTypedArray(dataType, totalValues) as SupportedTypedArray & {
    [index: number]: number;
  };

  let globalMin = Number.POSITIVE_INFINITY;
  let globalMax = Number.NEGATIVE_INFINITY;

  const copySlice = (source: SupportedTypedArray, offset: number) => {
    for (let i = 0; i < source.length; i += 1) {
      const value = source[i] as number;
      if (value < globalMin) {
        globalMin = value;
      }
      if (value > globalMax) {
        globalMax = value;
      }
      combined[offset + i] = value;
    }
  };

  if (typedFirstRaster.length !== sliceLength) {
    throw new Error(`File "${file.name}" returned an unexpected slice length.`);
  }

  copySlice(typedFirstRaster, 0);

  for (let index = 1; index < imageCount; index += 1) {
    const image = await tiff.getImage(index);
    if (image.getWidth() !== width || image.getHeight() !== height) {
      throw new Error(`Slice ${index + 1} in file "${file.name}" has mismatched dimensions.`);
    }
    if (image.getSamplesPerPixel() !== channels) {
      throw new Error(`Slice ${index + 1} in file "${file.name}" has a different channel count.`);
    }

    const rasterRaw = (await image.readRasters({ interleave: true })) as unknown;
    if (!ArrayBuffer.isView(rasterRaw)) {
      throw new Error(`File "${file.name}" does not provide raster data as a typed array.`);
    }

    const raster = ensureTypedArray(rasterRaw as SupportedTypedArray, dataType, file.name, index);
    if (raster.length !== sliceLength) {
      throw new Error(`Slice ${index + 1} in file "${file.name}" returned an unexpected slice length.`);
    }

    copySlice(raster, index * sliceLength);
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

  const buffer = combined.buffer.slice(
    combined.byteOffset,
    combined.byteOffset + combined.byteLength
  ) as ArrayBuffer;

  return {
    width,
    height,
    depth: imageCount,
    channels,
    dataType,
    min: globalMin,
    max: globalMax,
    data: buffer
  } satisfies VolumePayload;
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

function createTypedArray(type: VolumeDataType, length: number): SupportedTypedArray {
  switch (type) {
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
      const exhaustiveCheck: never = type;
      throw new Error(`Unsupported volume data type: ${exhaustiveCheck}`);
    }
  }
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

export {};
