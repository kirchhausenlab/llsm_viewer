import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

import {
  createVolumeProvider,
  DEFAULT_MAX_CACHED_CHUNK_BYTES,
  DEFAULT_MAX_CACHED_VOLUMES,
  DEFAULT_MAX_CONCURRENT_CHUNK_READS,
  DEFAULT_MAX_CONCURRENT_PREFETCH_LOADS,
} from '../src/core/volumeProvider';
import { createInMemoryPreprocessedStorage, type PreprocessedStorage } from '../src/shared/storage/preprocessedStorage';
import { openPreprocessedDatasetFromZarrStorage } from '../src/shared/utils/preprocessedDataset/open';
import { preprocessDatasetToStorage, type PreprocessLayerSource } from '../src/shared/utils/preprocessedDataset/preprocess';
import type { VolumePayload } from '../src/types/volume';

type BenchmarkCase = {
  occupancy: number;
  pattern: 'compact-block' | 'random-isolated';
};

const WIDTH = 128;
const HEIGHT = 128;
const DEPTH = 64;
const VOXEL_COUNT = WIDTH * HEIGHT * DEPTH;
const CASES: BenchmarkCase[] = [
  { occupancy: 0, pattern: 'compact-block' },
  { occupancy: 0.0001, pattern: 'compact-block' },
  { occupancy: 0.001, pattern: 'compact-block' },
  { occupancy: 0.01, pattern: 'compact-block' },
  { occupancy: 0.05, pattern: 'compact-block' },
  { occupancy: 0.2, pattern: 'compact-block' },
  { occupancy: 0.001, pattern: 'random-isolated' },
  { occupancy: 0.01, pattern: 'random-isolated' },
];

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(value === 0 ? 0 : value < 0.001 ? 3 : 2)}%`;
}

function formatBytes(value: number): string {
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KiB`;
  }
  return `${(value / 1024 / 1024).toFixed(2)} MiB`;
}

function fillCompact(values: Uint32Array, foregroundCount: number): void {
  let written = 0;
  const brickSize = 32;
  for (let brickZ = 0; brickZ < Math.ceil(DEPTH / brickSize) && written < foregroundCount; brickZ += 1) {
    for (let brickY = 0; brickY < Math.ceil(HEIGHT / brickSize) && written < foregroundCount; brickY += 1) {
      for (let brickX = 0; brickX < Math.ceil(WIDTH / brickSize) && written < foregroundCount; brickX += 1) {
        for (let localZ = 0; localZ < brickSize && written < foregroundCount; localZ += 1) {
          const z = brickZ * brickSize + localZ;
          if (z >= DEPTH) {
            continue;
          }
          for (let localY = 0; localY < brickSize && written < foregroundCount; localY += 1) {
            const y = brickY * brickSize + localY;
            if (y >= HEIGHT) {
              continue;
            }
            for (let localX = 0; localX < brickSize && written < foregroundCount; localX += 1) {
              const x = brickX * brickSize + localX;
              if (x >= WIDTH) {
                continue;
              }
              values[(z * HEIGHT + y) * WIDTH + x] = 1;
              written += 1;
            }
          }
        }
      }
    }
  }
}

function fillRandomIsolated(values: Uint32Array, foregroundCount: number): void {
  const used = new Set<number>();
  let state = 0x12345678;
  while (used.size < foregroundCount) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const index = state % values.length;
    if (used.has(index)) {
      continue;
    }
    used.add(index);
    values[index] = (used.size % 65535) + 1;
  }
}

function createPayload(values: Uint32Array): VolumePayload {
  return {
    width: WIDTH,
    height: HEIGHT,
    depth: DEPTH,
    channels: 1,
    dataType: 'uint32',
    min: 0,
    max: values.reduce((max, value) => Math.max(max, value), 0),
    data: values.buffer.slice(values.byteOffset, values.byteOffset + values.byteLength),
  };
}

function createCountingStorage(storage: PreprocessedStorage): {
  storage: PreprocessedStorage;
  sizes: Map<string, number>;
} {
  const sizes = new Map<string, number>();
  return {
    sizes,
    storage: {
      async writeFile(filePath, data) {
        sizes.set(filePath, data.byteLength);
        await storage.writeFile(filePath, data);
      },
      async readFile(filePath) {
        return storage.readFile(filePath);
      },
      async readFileRange(filePath, offset, length) {
        if (typeof storage.readFileRange !== 'function') {
          const bytes = await storage.readFile(filePath);
          return bytes.slice(offset, offset + length);
        }
        return storage.readFileRange(filePath, offset, length);
      },
    },
  };
}

async function runCase(entry: BenchmarkCase) {
  const foregroundCount = Math.floor(VOXEL_COUNT * entry.occupancy);
  const values = new Uint32Array(VOXEL_COUNT);
  if (entry.pattern === 'compact-block') {
    fillCompact(values, foregroundCount);
  } else {
    fillRandomIsolated(values, foregroundCount);
  }
  const labels = new Set<number>();
  for (const value of values) {
    if (value !== 0) {
      labels.add(value);
    }
  }

  const payload = createPayload(values);
  const file = new File(['seg'], `${entry.pattern}-${foregroundCount}.tif`, { type: 'image/tiff' });
  const layers: PreprocessLayerSource[] = [
    {
      channelId: 'channel-seg',
      channelLabel: 'Segmentation',
      key: 'seg',
      label: 'Segmentation',
      files: [file],
      isSegmentation: true,
    },
  ];
  const storageHandle = createInMemoryPreprocessedStorage({
    datasetId: `sparse-benchmark-${entry.pattern}-${foregroundCount}`,
  });
  const counted = createCountingStorage(storageHandle.storage);

  const preprocessStart = performance.now();
  const preprocessResult = await preprocessDatasetToStorage({
    layers,
    channels: [{ id: 'channel-seg', name: 'Segmentation' }],
    trackSets: [],
    voxelResolution: { x: 120, y: 120, z: 300, unit: 'nm', correctAnisotropy: false },
    temporalResolution: { interval: 1, unit: 's' },
    movieMode: '3d',
    storage: counted.storage,
    storageStrategy: { sharding: { enabled: false } },
    volumeLoader: async () => [{ ...payload, data: (payload.data as ArrayBuffer).slice(0) }],
  });
  const preprocessMs = performance.now() - preprocessStart;

  const opened = await openPreprocessedDatasetFromZarrStorage(counted.storage);
  const provider = createVolumeProvider({
    manifest: opened.manifest,
    storage: counted.storage,
    maxCachedVolumes: DEFAULT_MAX_CACHED_VOLUMES,
    maxCachedChunkBytes: DEFAULT_MAX_CACHED_CHUNK_BYTES,
    maxConcurrentChunkReads: DEFAULT_MAX_CONCURRENT_CHUNK_READS,
    maxConcurrentPrefetchLoads: DEFAULT_MAX_CONCURRENT_PREFETCH_LOADS,
  });

  const firstReadyStart = performance.now();
  const [field, atlas] = await Promise.all([
    provider.getSparseSegmentationField('seg', 0, { scaleLevel: 0 }),
    provider.getBrickAtlas?.('seg', 0, { scaleLevel: 0 }),
  ]);
  const firstReadyMs = performance.now() - firstReadyStart;

  const sliceStart = performance.now();
  await provider.extractSparseSegmentationSlice?.('seg', 0, 0, { axis: 'z', index: Math.floor(DEPTH / 2) });
  const sliceMs = performance.now() - sliceStart;

  const queryStart = performance.now();
  for (let index = 0; index < 32; index += 1) {
    await provider.querySparseSegmentationLabel?.('seg', 0, 0, {
      z: (index * 7) % DEPTH,
      y: (index * 11) % HEIGHT,
      x: (index * 13) % WIDTH,
    });
  }
  const hoverQueryAvgMs = (performance.now() - queryStart) / 32;

  const sparseStorageBytes = Array.from(counted.sizes.entries())
    .filter(([filePath]) => filePath !== 'zarr.json')
    .reduce((sum, [, byteLength]) => sum + byteLength, 0);
  const denseUint16StorageBytes = VOXEL_COUNT * 2;
  const denseRgbaGpuBytes = VOXEL_COUNT * 4;
  const sparseGpuBytes = atlas?.data.byteLength ?? 0;
  const layer = preprocessResult.manifest.dataset.channels[0]?.layers[0];
  const scale = layer && 'sparse' in layer ? layer.sparse.scales[0] : null;

  return {
    dimensions: `${DEPTH}x${HEIGHT}x${WIDTH}`,
    occupancy: formatPercent(entry.occupancy),
    pattern: entry.pattern,
    labelCount: labels.size,
    foregroundCount,
    occupiedBrickCount: field.occupiedBrickCount,
    sparseStorageBytes,
    denseUint16StorageBytes,
    sparseGpuBytes,
    denseRgbaGpuBytes,
    preprocessMs,
    firstReadyMs,
    sliceMs,
    hoverQueryAvgMs,
    payloadBytes: scale?.payload.totalPayloadBytes ?? 0,
  };
}

async function main(): Promise<void> {
  const results = [];
  for (const entry of CASES) {
    const result = await runCase(entry);
    results.push(result);
    const storageRatio =
      result.sparseStorageBytes > 0
        ? `${(result.denseUint16StorageBytes / result.sparseStorageBytes).toFixed(1)}x`
        : 'n/a';
    const gpuRatio =
      result.sparseGpuBytes > 0 ? `${(result.denseRgbaGpuBytes / result.sparseGpuBytes).toFixed(1)}x` : 'n/a';
    console.log(
      [
        `[${result.pattern} ${result.occupancy}]`,
        `fg=${result.foregroundCount}`,
        `bricks=${result.occupiedBrickCount}`,
        `storage=${formatBytes(result.sparseStorageBytes)} (${storageRatio})`,
        `gpu=${formatBytes(result.sparseGpuBytes)} (${gpuRatio})`,
        `preprocess=${result.preprocessMs.toFixed(2)}ms`,
        `ready=${result.firstReadyMs.toFixed(2)}ms`,
        `slice=${result.sliceMs.toFixed(2)}ms`,
        `hoverAvg=${result.hoverQueryAvgMs.toFixed(3)}ms`,
      ].join(' ')
    );
  }

  const outputPath = path.resolve(process.cwd(), 'docs/sparse-segmentation/BENCHMARK_RESULTS.json');
  fs.writeFileSync(outputPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2)}\n`);
  console.log(`Wrote sparse segmentation benchmark report: ${outputPath}`);
}

await main();
