import path from 'node:path';
import { parentPort, workerData } from 'node:worker_threads';
import { fromFile, Pool } from 'geotiff';
import type {
  LoadVolumeRequestMessage,
  LoadVolumeWorkerResponse,
  VolumeDataType,
  VolumeMetadata
} from './types';

const port = parentPort;

if (!port) {
  throw new Error('loadVolumeWorker must be run as a worker thread.');
}

const geotiffPoolSize =
  typeof workerData === 'object' && workerData !== null && typeof workerData.poolSize === 'number'
    ? Math.max(1, workerData.poolSize)
    : 1;

const geotiffPool = new Pool(geotiffPoolSize);
let destroyed = false;

process.on('exit', () => {
  if (!destroyed) {
    geotiffPool.destroy();
    destroyed = true;
  }
});

const send = (message: LoadVolumeWorkerResponse, transfer?: ArrayBuffer[]) => {
  if (transfer) {
    port.postMessage(message, transfer);
    return;
  }
  port.postMessage(message);
};

type SupportedTypedArray =
  | Uint8Array
  | Int8Array
  | Uint16Array
  | Int16Array
  | Uint32Array
  | Int32Array
  | Float32Array
  | Float64Array;

interface WorkerError extends Error {
  statusCode?: number;
  code?: string;
}

function fail(message: string, statusCode: number): never {
  const error = new Error(message) as WorkerError;
  error.name = 'VolumeWorkerError';
  error.statusCode = statusCode;
  throw error;
}

port.on('message', async (rawMessage: LoadVolumeRequestMessage) => {
  const { id, directoryPath, filename } = rawMessage;
  try {
    const resolvedDirectory = path.resolve(directoryPath);
    const resolvedFile = path.resolve(resolvedDirectory, filename);
    const relative = path.relative(resolvedDirectory, resolvedFile);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      fail('Requested file is outside the dataset directory.', 400);
    }

    const tiff = await fromFile(resolvedFile);
    const imageCount = await tiff.getImageCount();
    if (imageCount === 0) {
      fail('TIFF file does not contain any images.', 400);
    }

    const firstImage = await tiff.getImage(0);
    const width = firstImage.getWidth();
    const height = firstImage.getHeight();
    const channels = firstImage.getSamplesPerPixel();

    const sliceLength = width * height * channels;
    const totalValues = sliceLength * imageCount;

    const firstRasterRaw = (await firstImage.readRasters({ interleave: true, pool: geotiffPool })) as unknown;
    if (!ArrayBuffer.isView(firstRasterRaw)) {
      fail('Volume rasters must be typed arrays.', 500);
    }

    let dataType: VolumeDataType;
    let combinedData: SupportedTypedArray;
    let firstRaster: SupportedTypedArray;

    if (firstRasterRaw instanceof Uint8Array) {
      dataType = 'uint8';
      combinedData = new Uint8Array(totalValues);
      firstRaster = firstRasterRaw;
    } else if (firstRasterRaw instanceof Int8Array) {
      dataType = 'int8';
      combinedData = new Int8Array(totalValues);
      firstRaster = firstRasterRaw;
    } else if (firstRasterRaw instanceof Uint16Array) {
      dataType = 'uint16';
      combinedData = new Uint16Array(totalValues);
      firstRaster = firstRasterRaw;
    } else if (firstRasterRaw instanceof Int16Array) {
      dataType = 'int16';
      combinedData = new Int16Array(totalValues);
      firstRaster = firstRasterRaw;
    } else if (firstRasterRaw instanceof Uint32Array) {
      dataType = 'uint32';
      combinedData = new Uint32Array(totalValues);
      firstRaster = firstRasterRaw;
    } else if (firstRasterRaw instanceof Int32Array) {
      dataType = 'int32';
      combinedData = new Int32Array(totalValues);
      firstRaster = firstRasterRaw;
    } else if (firstRasterRaw instanceof Float32Array) {
      dataType = 'float32';
      combinedData = new Float32Array(totalValues);
      firstRaster = firstRasterRaw;
    } else if (firstRasterRaw instanceof Float64Array) {
      dataType = 'float64';
      combinedData = new Float64Array(totalValues);
      firstRaster = firstRasterRaw;
    } else {
      fail('Unsupported raster data type.', 415);
    }

    if (firstRaster.length !== sliceLength) {
      fail('Unexpected raster length for first slice.', 500);
    }

    let globalMin = Number.POSITIVE_INFINITY;
    let globalMax = Number.NEGATIVE_INFINITY;

    const copySlice = (source: SupportedTypedArray, offset: number) => {
      for (let i = 0; i < source.length; i++) {
        const value = source[i];
        if (value < globalMin) {
          globalMin = value;
        }
        if (value > globalMax) {
          globalMax = value;
        }
        combinedData[offset + i] = value;
      }
    };

    copySlice(firstRaster, 0);

    for (let index = 1; index < imageCount; index++) {
      const image = await tiff.getImage(index);
      if (image.getWidth() !== width || image.getHeight() !== height) {
        fail('All slices in a volume must have identical dimensions.', 400);
      }
      if (image.getSamplesPerPixel() !== channels) {
        fail('All slices in a volume must have the same channel count.', 400);
      }

      const rasterRaw = (await image.readRasters({ interleave: true, pool: geotiffPool })) as unknown;

      let raster: SupportedTypedArray;
      switch (dataType) {
        case 'uint8':
          if (!(rasterRaw instanceof Uint8Array)) {
            fail('All slices in a volume must use the same sample type.', 400);
          }
          raster = rasterRaw;
          break;
        case 'int8':
          if (!(rasterRaw instanceof Int8Array)) {
            fail('All slices in a volume must use the same sample type.', 400);
          }
          raster = rasterRaw;
          break;
        case 'uint16':
          if (!(rasterRaw instanceof Uint16Array)) {
            fail('All slices in a volume must use the same sample type.', 400);
          }
          raster = rasterRaw;
          break;
        case 'int16':
          if (!(rasterRaw instanceof Int16Array)) {
            fail('All slices in a volume must use the same sample type.', 400);
          }
          raster = rasterRaw;
          break;
        case 'uint32':
          if (!(rasterRaw instanceof Uint32Array)) {
            fail('All slices in a volume must use the same sample type.', 400);
          }
          raster = rasterRaw;
          break;
        case 'int32':
          if (!(rasterRaw instanceof Int32Array)) {
            fail('All slices in a volume must use the same sample type.', 400);
          }
          raster = rasterRaw;
          break;
        case 'float32':
          if (!(rasterRaw instanceof Float32Array)) {
            fail('All slices in a volume must use the same sample type.', 400);
          }
          raster = rasterRaw;
          break;
        case 'float64':
          if (!(rasterRaw instanceof Float64Array)) {
            fail('All slices in a volume must use the same sample type.', 400);
          }
          raster = rasterRaw;
          break;
        default:
          fail('Unsupported raster data type.', 415);
      }

      if (raster.length !== sliceLength) {
        fail('Unexpected raster length for slice.', 500);
      }

      const offset = index * sliceLength;
      copySlice(raster, offset);
    }

    if (!Number.isFinite(globalMin) || globalMin === Number.POSITIVE_INFINITY) {
      globalMin = 0;
    }
    if (!Number.isFinite(globalMax) || globalMax === Number.NEGATIVE_INFINITY) {
      globalMax = 1;
    }
    if (globalMin === globalMax) {
      globalMax = globalMin + 1;
    }

    const metadata: VolumeMetadata = {
      width,
      height,
      depth: imageCount,
      channels,
      dataType,
      min: globalMin,
      max: globalMax
    };

    const sourceBuffer = combinedData.buffer;
    let transferableBuffer: ArrayBuffer;
    if (sourceBuffer instanceof ArrayBuffer) {
      transferableBuffer = sourceBuffer;
    } else {
      transferableBuffer = new ArrayBuffer(sourceBuffer.byteLength);
      new Uint8Array(transferableBuffer).set(new Uint8Array(sourceBuffer));
    }

    send({ id, ok: true, metadata, buffer: transferableBuffer }, [transferableBuffer]);
  } catch (rawError) {
    const error = rawError as WorkerError;
    send({
      id,
      ok: false,
      error: {
        message: error?.message ?? 'Failed to load TIFF volume.',
        statusCode: typeof error?.statusCode === 'number' ? error.statusCode : undefined,
        code: typeof error?.code === 'string' ? error.code : undefined
      }
    });
  }
});
