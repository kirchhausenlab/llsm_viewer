import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fromArrayBuffer } from 'geotiff';

import { preprocessDatasetToStorage } from '../src/shared/utils/preprocessedDataset/preprocess.ts';
import { createInMemoryPreprocessedStorage } from '../src/shared/storage/preprocessedStorage.ts';
import type { ChannelExportMetadata } from '../src/shared/utils/preprocessedDataset/types.ts';
import type { VolumeDataType, VolumePayload, VolumeTypedArray } from '../src/types/volume.ts';

type SupportedTypedArray = VolumeTypedArray;

type RunResult = {
  run: number;
  elapsedMs: number;
  totalVolumeCount: number;
};

const DEFAULT_RUNS = 3;
const TIFF_EXTENSIONS = new Set(['.tif', '.tiff']);

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

function createWritableArray(type: VolumeDataType, length: number): SupportedTypedArray {
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
      const exhaustive: never = type;
      throw new Error(`Unsupported dtype ${exhaustive}`);
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
        throw new Error(`Slice ${sliceIndex + 1} in "${fileName}" changed sample type.`);
      }
      return array;
    case 'int8':
      if (!(array instanceof Int8Array)) {
        throw new Error(`Slice ${sliceIndex + 1} in "${fileName}" changed sample type.`);
      }
      return array;
    case 'uint16':
      if (!(array instanceof Uint16Array)) {
        throw new Error(`Slice ${sliceIndex + 1} in "${fileName}" changed sample type.`);
      }
      return array;
    case 'int16':
      if (!(array instanceof Int16Array)) {
        throw new Error(`Slice ${sliceIndex + 1} in "${fileName}" changed sample type.`);
      }
      return array;
    case 'uint32':
      if (!(array instanceof Uint32Array)) {
        throw new Error(`Slice ${sliceIndex + 1} in "${fileName}" changed sample type.`);
      }
      return array;
    case 'int32':
      if (!(array instanceof Int32Array)) {
        throw new Error(`Slice ${sliceIndex + 1} in "${fileName}" changed sample type.`);
      }
      return array;
    case 'float32':
      if (!(array instanceof Float32Array)) {
        throw new Error(`Slice ${sliceIndex + 1} in "${fileName}" changed sample type.`);
      }
      return array;
    case 'float64':
      if (!(array instanceof Float64Array)) {
        throw new Error(`Slice ${sliceIndex + 1} in "${fileName}" changed sample type.`);
      }
      return array;
    default: {
      const exhaustive: never = expected;
      throw new Error(`Unsupported dtype ${exhaustive}`);
    }
  }
}

async function decodeVolume(file: File): Promise<VolumePayload> {
  const sourceBuffer = await file.arrayBuffer();
  const tiff = await fromArrayBuffer(sourceBuffer);
  const imageCount = await tiff.getImageCount();
  if (imageCount <= 0) {
    throw new Error(`File "${file.name}" has no images.`);
  }

  const firstImage = await tiff.getImage(0);
  const width = firstImage.getWidth();
  const height = firstImage.getHeight();
  const channels = firstImage.getSamplesPerPixel();
  const sliceLength = width * height * channels;
  const totalValues = sliceLength * imageCount;

  const firstRasterRaw = (await firstImage.readRasters({ interleave: true })) as unknown;
  if (!ArrayBuffer.isView(firstRasterRaw)) {
    throw new Error(`File "${file.name}" did not return typed raster data.`);
  }

  const firstRaster = firstRasterRaw as SupportedTypedArray;
  const dataType = detectDataType(firstRaster);
  const values = createWritableArray(dataType, totalValues);

  let globalMin = Number.POSITIVE_INFINITY;
  let globalMax = Number.NEGATIVE_INFINITY;

  const scanAndCopy = (slice: SupportedTypedArray, sliceIndex: number) => {
    if (slice.length !== sliceLength) {
      throw new Error(`Unexpected slice length in "${file.name}" at slice ${sliceIndex + 1}.`);
    }
    values.set(slice, sliceIndex * sliceLength);
    for (let i = 0; i < slice.length; i += 1) {
      const value = slice[i] as number;
      if (Number.isNaN(value)) {
        continue;
      }
      if (value < globalMin) {
        globalMin = value;
      }
      if (value > globalMax) {
        globalMax = value;
      }
    }
  };

  scanAndCopy(firstRaster, 0);

  for (let sliceIndex = 1; sliceIndex < imageCount; sliceIndex += 1) {
    const image = await tiff.getImage(sliceIndex);
    if (image.getWidth() !== width || image.getHeight() !== height) {
      throw new Error(`Mismatched dimensions in "${file.name}" at slice ${sliceIndex + 1}.`);
    }
    if (image.getSamplesPerPixel() !== channels) {
      throw new Error(`Mismatched channel count in "${file.name}" at slice ${sliceIndex + 1}.`);
    }

    const rasterRaw = (await image.readRasters({ interleave: true })) as unknown;
    if (!ArrayBuffer.isView(rasterRaw)) {
      throw new Error(`File "${file.name}" did not return typed raster data.`);
    }
    const raster = ensureTypedArray(rasterRaw as SupportedTypedArray, dataType, file.name, sliceIndex);
    scanAndCopy(raster, sliceIndex);
  }

  if (!Number.isFinite(globalMin)) {
    globalMin = 0;
  }
  if (!Number.isFinite(globalMax) || globalMax === globalMin) {
    globalMax = globalMin + 1;
  }

  const bytes = new Uint8Array(values.buffer, values.byteOffset, values.byteLength).slice();
  return {
    width,
    height,
    depth: imageCount,
    channels,
    dataType,
    min: globalMin,
    max: globalMax,
    data: bytes.buffer
  };
}

function resolveDatasetPath(): string {
  const configured = process.env.TEST_DATA_DIR?.trim();
  if (!configured) {
    throw new Error('TEST_DATA_DIR must be set to a directory containing TIFF files.');
  }
  return path.resolve(process.cwd(), configured);
}

async function loadFixtureFiles(rootDir: string): Promise<File[]> {
  const tiffPaths = fs.readdirSync(rootDir)
    .map((name) => path.join(rootDir, name))
    .filter((candidatePath) => TIFF_EXTENSIONS.has(path.extname(candidatePath).toLowerCase()))
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' }));

  if (tiffPaths.length === 0) {
    throw new Error(`No TIFF files found under ${rootDir}`);
  }

  return Promise.all(
    tiffPaths.map(async (tiffPath) => {
      const bytes = await fs.promises.readFile(tiffPath);
      return new File([bytes], path.basename(tiffPath), { type: 'image/tiff' });
    })
  );
}

function summarize(results: RunResult[]): { minMs: number; maxMs: number; avgMs: number } {
  const values = results.map((entry) => entry.elapsedMs);
  const minMs = Math.min(...values);
  const maxMs = Math.max(...values);
  const avgMs = values.reduce((sum, value) => sum + value, 0) / values.length;
  return { minMs, maxMs, avgMs };
}

async function run(): Promise<void> {
  const rootDir = resolveDatasetPath();
  const files = await loadFixtureFiles(rootDir);
  const runs = Math.max(1, Number.parseInt(process.env.PREPROCESS_FIXTURE_RUNS ?? '', 10) || DEFAULT_RUNS);

  const channels: ChannelExportMetadata[] = [
    {
      id: 'fixture-channel',
      name: 'Fixture Channel',
      trackSets: []
    }
  ];
  const layers = [
    {
      channelId: 'fixture-channel',
      channelLabel: 'Fixture Channel',
      key: 'fixture-layer',
      label: 'Fixture Layer',
      files,
      isSegmentation: false
    }
  ];

  const volumeLoader = async (batch: File[]) => Promise.all(batch.map((file) => decodeVolume(file)));

  const results: RunResult[] = [];
  for (let runIndex = 0; runIndex < runs; runIndex += 1) {
    const storageHandle = createInMemoryPreprocessedStorage({ datasetId: `preprocess-fixture-run-${runIndex + 1}` });
    const startedAt = performance.now();
    const result = await preprocessDatasetToStorage({
      layers,
      channels,
      voxelResolution: { x: 120, y: 120, z: 300, unit: 'nm', correctAnisotropy: true },
      movieMode: '3d',
      storage: storageHandle.storage,
      volumeLoader,
      storageStrategy: { sharding: { enabled: false } }
    });
    const elapsedMs = performance.now() - startedAt;
    const current: RunResult = {
      run: runIndex + 1,
      elapsedMs,
      totalVolumeCount: result.totalVolumeCount
    };
    results.push(current);
    console.log(`run ${current.run}/${runs}: ${current.elapsedMs.toFixed(2)}ms (${current.totalVolumeCount} timepoints)`);
  }

  const summary = summarize(results);
  console.log(
    `summary: min=${summary.minMs.toFixed(2)}ms avg=${summary.avgMs.toFixed(2)}ms max=${summary.maxMs.toFixed(2)}ms`
  );
  console.log(`dataset: ${rootDir}`);
  console.log(`files: ${files.length}`);
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
