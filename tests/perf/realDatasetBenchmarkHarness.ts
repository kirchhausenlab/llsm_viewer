import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

import {
  createVolumeProvider,
  DEFAULT_MAX_CACHED_CHUNK_BYTES,
  DEFAULT_MAX_CACHED_VOLUMES,
  DEFAULT_MAX_CONCURRENT_CHUNK_READS,
  DEFAULT_MAX_CONCURRENT_PREFETCH_LOADS,
  type VolumeProvider,
} from '../../src/core/volumeProvider.ts';
import type { PreprocessedStorage } from '../../src/shared/storage/preprocessedStorage.ts';
import { openPreprocessedDatasetFromZarrStorage } from '../../src/shared/utils/preprocessedDataset/open.ts';
import type {
  PreprocessedLayerManifestEntry,
  PreprocessedManifest,
} from '../../src/shared/utils/preprocessedDataset/types.ts';

const MAX_BRICK_ATLAS_DEPTH_HINT = 2048;
const MAX_BRICK_ATLAS_BYTES_HINT = 512 * 1024 * 1024;
const MAX_VOLUME_BYTES_HINT = 512 * 1024 * 1024;

const DURATION_THRESHOLD_RELATIVE_MARGIN = 1.35;
const DURATION_THRESHOLD_ABSOLUTE_MARGIN_MS = 8;
const HIT_RATE_THRESHOLD_MARGIN = 0.08;

export const REAL_DATASET_BASELINE_VERSION = 1;
export const DEFAULT_REAL_DATASET_BASELINE_PATH = 'docs/performance/real-dataset-baseline.json';

export type RealDatasetBenchmarkCaseId = 'fib_large' | 'npc2_20';

export type RealDatasetBenchmarkCaseConfig = {
  id: RealDatasetBenchmarkCaseId;
  name: string;
  datasetPath: string;
  sweepTimepoints: number;
};

export type RealDatasetBenchmarkMetrics = {
  selectedScaleLevel: number;
  selectedResidencyMode: 'atlas' | 'volume';
  coldLoadMs: number;
  warmLoadMs: number;
  transitionLoadMs: number | null;
  sweepLoadMs: number | null;
  chunkHitRate: number;
};

export type RealDatasetBenchmarkThresholds = {
  selectedScaleLevel: number;
  selectedResidencyMode: 'atlas' | 'volume';
  coldLoadMsMax: number;
  warmLoadMsMax: number;
  transitionLoadMsMax: number | null;
  sweepLoadMsMax: number | null;
  chunkHitRateMin: number;
};

export type RealDatasetBenchmarkCaseResult = {
  id: RealDatasetBenchmarkCaseId;
  name: string;
  datasetPath: string;
  datasetRoot: string;
  layerKey: string;
  totalTimepoints: number;
  sweepTimepoints: number;
  metrics: RealDatasetBenchmarkMetrics;
  diagnostics: {
    scaleRequestCounts: Record<string, number>;
  };
};

export type RealDatasetBaselineEntry = {
  id: RealDatasetBenchmarkCaseId;
  name: string;
  datasetPath: string;
  layerKey: string;
  totalTimepoints: number;
  sweepTimepoints: number;
  metrics: RealDatasetBenchmarkMetrics;
  thresholds: RealDatasetBenchmarkThresholds;
};

export type RealDatasetBaselineReport = {
  version: number;
  generatedAt: string;
  environment: {
    cwd: string;
    node: string;
    platform: NodeJS.Platform;
    arch: string;
  };
  cases: Record<RealDatasetBenchmarkCaseId, RealDatasetBaselineEntry>;
};

type ViewerLoadSelection = {
  residencyMode: 'atlas' | 'volume';
  scaleLevel: number;
};

export const REAL_DATASET_BENCHMARK_CASES: readonly RealDatasetBenchmarkCaseConfig[] = [
  {
    id: 'fib_large',
    name: 'FIB large single-volume',
    datasetPath: 'data/test_fib_large.zarr',
    sweepTimepoints: 1,
  },
  {
    id: 'npc2_20',
    name: 'NPC2 20-timepoint sequence',
    datasetPath: 'data/test_npc2_20.zarr',
    sweepTimepoints: 20,
  },
];

function getTextureChannelCountForSourceChannels(sourceChannels: number): number {
  if (sourceChannels <= 1) {
    return 1;
  }
  if (sourceChannels === 2) {
    return 2;
  }
  return 4;
}

function isAllocationLikeError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message.toLowerCase();
  return (
    message.includes('array buffer allocation failed') ||
    message.includes('allocation failed') ||
    message.includes('invalid typed array length') ||
    message.includes('out of memory') ||
    message.includes('cannot allocate')
  );
}

function roundTo(value: number, digits: number): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function sanitizeStoragePath(storagePath: string): string {
  const normalized = path.posix.normalize(storagePath).replace(/^\/+/, '').trim();
  if (!normalized || normalized === '.') {
    throw new Error(`Storage path must not be empty: "${storagePath}"`);
  }
  if (normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) {
    throw new Error(`Storage path escapes dataset root: "${storagePath}"`);
  }
  return normalized;
}

function createFilesystemReadOnlyStorage(rootDir: string): PreprocessedStorage {
  const absoluteRoot = path.resolve(rootDir);
  return {
    async writeFile() {
      throw new Error('Read-only benchmark storage does not support writes.');
    },
    async readFile(storagePath) {
      const safePath = sanitizeStoragePath(storagePath);
      const absolutePath = path.resolve(absoluteRoot, safePath);
      if (absolutePath !== absoluteRoot && !absolutePath.startsWith(`${absoluteRoot}${path.sep}`)) {
        throw new Error(`Resolved storage path escapes dataset root: ${storagePath}`);
      }
      const bytes = await fs.promises.readFile(absolutePath);
      return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    },
  };
}

function pickBenchmarkLayer(manifest: PreprocessedManifest): PreprocessedLayerManifestEntry {
  const layers = manifest.dataset.channels.flatMap((channel) => channel.layers);
  if (layers.length === 0) {
    throw new Error('Benchmark dataset does not define any layers.');
  }
  const preferred = layers.find((layer) => !layer.isSegmentation && layer.depth > 1);
  return preferred ?? layers[0]!;
}

function resolvePreferredAtlasScaleLevel(levels: number[], isPlaying: boolean): number {
  const desired = isPlaying ? 1 : 0;
  let resolved = levels[0] ?? 0;
  for (const level of levels) {
    if (level <= desired) {
      resolved = level;
    }
  }
  return resolved;
}

async function loadLayerTimepointLikeViewer({
  provider,
  layer,
  layerKey,
  timepoint,
  isPlaying,
}: {
  provider: VolumeProvider;
  layer: PreprocessedLayerManifestEntry;
  layerKey: string;
  timepoint: number;
  isPlaying: boolean;
}): Promise<ViewerLoadSelection> {
  const knownLevels = Array.from(new Set(layer.zarr.scales.map((scale) => scale.level))).sort((left, right) => left - right);
  const layerScalesByLevel = new Map(layer.zarr.scales.map((scale) => [scale.level, scale]));
  const canUseAtlas =
    typeof provider.getBrickAtlas === 'function' &&
    !layer.isSegmentation &&
    layer.depth > 1;

  if (canUseAtlas) {
    const preferredScaleLevel = resolvePreferredAtlasScaleLevel(knownLevels, isPlaying);
    const candidateScaleLevels = knownLevels.filter((level) => level >= preferredScaleLevel);
    if (candidateScaleLevels.length === 0) {
      candidateScaleLevels.push(preferredScaleLevel);
    }

    let lastError: unknown = null;
    for (const scaleLevel of candidateScaleLevels) {
      const scale = layerScalesByLevel.get(scaleLevel) ?? null;
      const sourceChannels = scale?.channels ?? 1;
      const textureChannels = getTextureChannelCountForSourceChannels(sourceChannels);

      if (typeof provider.getBrickPageTable === 'function') {
        const pageTable = await provider.getBrickPageTable(layerKey, timepoint, { scaleLevel });
        const [chunkDepth, chunkHeight, chunkWidth] = pageTable.chunkShape;
        const estimatedAtlasDepth = chunkDepth * pageTable.occupiedBrickCount;
        const estimatedAtlasBytes = chunkWidth * chunkHeight * estimatedAtlasDepth * textureChannels;
        if (estimatedAtlasDepth > MAX_BRICK_ATLAS_DEPTH_HINT || estimatedAtlasBytes > MAX_BRICK_ATLAS_BYTES_HINT) {
          continue;
        }
      }

      try {
        const atlas = await provider.getBrickAtlas!(layerKey, timepoint, { scaleLevel });
        if (!atlas.enabled) {
          continue;
        }
        if (atlas.depth > MAX_BRICK_ATLAS_DEPTH_HINT) {
          continue;
        }
        if (atlas.data.byteLength > MAX_BRICK_ATLAS_BYTES_HINT) {
          continue;
        }
        return {
          residencyMode: 'atlas',
          scaleLevel: atlas.scaleLevel,
        };
      } catch (error) {
        if (isAllocationLikeError(error)) {
          lastError = error;
          continue;
        }
        throw error;
      }
    }

    if (lastError instanceof Error) {
      throw lastError;
    }
    throw new Error(`Brick atlas is unavailable for layer "${layerKey}" at timepoint ${timepoint}.`);
  }

  const candidateScaleLevels = knownLevels.filter((level) => level >= 0);
  if (candidateScaleLevels.length === 0) {
    candidateScaleLevels.push(0);
  }

  let lastVolumeError: unknown = null;
  for (let index = 0; index < candidateScaleLevels.length; index += 1) {
    const scaleLevel = candidateScaleLevels[index] ?? 0;
    const isLastCandidate = index === candidateScaleLevels.length - 1;
    const scale = layerScalesByLevel.get(scaleLevel) ?? null;
    const estimatedVolumeBytes = scale ? scale.width * scale.height * scale.depth * scale.channels : 0;
    if (!isLastCandidate && estimatedVolumeBytes > MAX_VOLUME_BYTES_HINT) {
      continue;
    }

    try {
      const [volume] = await Promise.all([
        provider.getVolume(layerKey, timepoint, { scaleLevel }),
        typeof provider.getBrickPageTable === 'function'
          ? provider.getBrickPageTable(layerKey, timepoint, { scaleLevel })
          : Promise.resolve(null),
      ]);
      return {
        residencyMode: 'volume',
        scaleLevel: volume.scaleLevel ?? scaleLevel,
      };
    } catch (error) {
      if (isAllocationLikeError(error)) {
        lastVolumeError = error;
        continue;
      }
      throw error;
    }
  }

  if (lastVolumeError instanceof Error) {
    throw lastVolumeError;
  }
  throw new Error(`Volume is unavailable for layer "${layerKey}" at timepoint ${timepoint}.`);
}

async function measureAsync<T>(fn: () => Promise<T>): Promise<{ value: T; elapsedMs: number }> {
  const start = performance.now();
  const value = await fn();
  const elapsedMs = performance.now() - start;
  return { value, elapsedMs };
}

export function resolveBenchmarkDatasetRoot(datasetPath: string): string {
  return path.resolve(process.cwd(), datasetPath);
}

export function benchmarkDatasetExists(datasetPath: string): boolean {
  return fs.existsSync(resolveBenchmarkDatasetRoot(datasetPath));
}

export async function runRealDatasetBenchmarkCase(
  config: RealDatasetBenchmarkCaseConfig
): Promise<RealDatasetBenchmarkCaseResult> {
  const datasetRoot = resolveBenchmarkDatasetRoot(config.datasetPath);
  const storage = createFilesystemReadOnlyStorage(datasetRoot);
  const opened = await openPreprocessedDatasetFromZarrStorage(storage);
  const manifest = opened.manifest;
  const layer = pickBenchmarkLayer(manifest);
  const layerKey = layer.key;
  const totalTimepoints = Math.max(1, manifest.dataset.totalVolumeCount);
  const sweepTimepoints = Math.max(1, Math.min(config.sweepTimepoints, totalTimepoints));

  const provider = createVolumeProvider({
    manifest,
    storage,
    maxCachedVolumes: DEFAULT_MAX_CACHED_VOLUMES,
    maxCachedChunkBytes: DEFAULT_MAX_CACHED_CHUNK_BYTES,
    maxConcurrentChunkReads: DEFAULT_MAX_CONCURRENT_CHUNK_READS,
    maxConcurrentPrefetchLoads: DEFAULT_MAX_CONCURRENT_PREFETCH_LOADS,
  });

  const coldLoad = await measureAsync(() =>
    loadLayerTimepointLikeViewer({
      provider,
      layer,
      layerKey,
      timepoint: 0,
      isPlaying: false,
    })
  );
  const warmLoad = await measureAsync(() =>
    loadLayerTimepointLikeViewer({
      provider,
      layer,
      layerKey,
      timepoint: 0,
      isPlaying: false,
    })
  );

  let transitionLoadMs: number | null = null;
  if (totalTimepoints > 1) {
    const transition = await measureAsync(() =>
      loadLayerTimepointLikeViewer({
        provider,
        layer,
        layerKey,
        timepoint: 1,
        isPlaying: false,
      })
    );
    transitionLoadMs = transition.elapsedMs;
  }

  let sweepLoadMs: number | null = null;
  if (sweepTimepoints > 1) {
    const sweep = await measureAsync(async () => {
      for (let timepoint = 0; timepoint < sweepTimepoints; timepoint += 1) {
        await loadLayerTimepointLikeViewer({
          provider,
          layer,
          layerKey,
          timepoint,
          isPlaying: false,
        });
      }
    });
    sweepLoadMs = sweep.elapsedMs;
  }

  const stats = provider.getStats();
  const diagnostics = provider.getDiagnostics();
  const chunkLookups = stats.chunkCacheHits + stats.chunkCacheHitInFlight + stats.chunkCacheMisses;
  const chunkHitRate =
    chunkLookups > 0
      ? (stats.chunkCacheHits + stats.chunkCacheHitInFlight) / chunkLookups
      : 0;

  return {
    id: config.id,
    name: config.name,
    datasetPath: config.datasetPath,
    datasetRoot,
    layerKey,
    totalTimepoints,
    sweepTimepoints,
    metrics: {
      selectedScaleLevel: coldLoad.value.scaleLevel,
      selectedResidencyMode: coldLoad.value.residencyMode,
      coldLoadMs: coldLoad.elapsedMs,
      warmLoadMs: warmLoad.elapsedMs,
      transitionLoadMs,
      sweepLoadMs,
      chunkHitRate,
    },
    diagnostics: {
      scaleRequestCounts: diagnostics.streaming.scaleRequestCounts,
    },
  };
}

export async function runRealDatasetBenchmarks(
  cases: readonly RealDatasetBenchmarkCaseConfig[] = REAL_DATASET_BENCHMARK_CASES
): Promise<RealDatasetBenchmarkCaseResult[]> {
  const results: RealDatasetBenchmarkCaseResult[] = [];
  for (const benchmarkCase of cases) {
    results.push(await runRealDatasetBenchmarkCase(benchmarkCase));
  }
  return results;
}

export function deriveThresholds(metrics: RealDatasetBenchmarkMetrics): RealDatasetBenchmarkThresholds {
  const deriveDurationMax = (measured: number): number =>
    roundTo(
      Math.max(
        measured * DURATION_THRESHOLD_RELATIVE_MARGIN,
        measured + DURATION_THRESHOLD_ABSOLUTE_MARGIN_MS
      ),
      2
    );
  const deriveDurationOptionalMax = (measured: number | null): number | null =>
    measured === null ? null : deriveDurationMax(measured);

  return {
    selectedScaleLevel: metrics.selectedScaleLevel,
    selectedResidencyMode: metrics.selectedResidencyMode,
    coldLoadMsMax: deriveDurationMax(metrics.coldLoadMs),
    warmLoadMsMax: deriveDurationMax(metrics.warmLoadMs),
    transitionLoadMsMax: deriveDurationOptionalMax(metrics.transitionLoadMs),
    sweepLoadMsMax: deriveDurationOptionalMax(metrics.sweepLoadMs),
    chunkHitRateMin: roundTo(Math.max(0, metrics.chunkHitRate - HIT_RATE_THRESHOLD_MARGIN), 3),
  };
}

export function buildBaselineReport(results: RealDatasetBenchmarkCaseResult[]): RealDatasetBaselineReport {
  const entries: Partial<Record<RealDatasetBenchmarkCaseId, RealDatasetBaselineEntry>> = {};
  for (const result of results) {
    entries[result.id] = {
      id: result.id,
      name: result.name,
      datasetPath: result.datasetPath,
      layerKey: result.layerKey,
      totalTimepoints: result.totalTimepoints,
      sweepTimepoints: result.sweepTimepoints,
      metrics: {
        ...result.metrics,
        coldLoadMs: roundTo(result.metrics.coldLoadMs, 2),
        warmLoadMs: roundTo(result.metrics.warmLoadMs, 2),
        transitionLoadMs:
          result.metrics.transitionLoadMs === null ? null : roundTo(result.metrics.transitionLoadMs, 2),
        sweepLoadMs: result.metrics.sweepLoadMs === null ? null : roundTo(result.metrics.sweepLoadMs, 2),
        chunkHitRate: roundTo(result.metrics.chunkHitRate, 3),
      },
      thresholds: deriveThresholds(result.metrics),
    };
  }
  for (const benchmarkCase of REAL_DATASET_BENCHMARK_CASES) {
    if (!entries[benchmarkCase.id]) {
      throw new Error(`Missing benchmark result for case "${benchmarkCase.id}".`);
    }
  }

  return {
    version: REAL_DATASET_BASELINE_VERSION,
    generatedAt: new Date().toISOString(),
    environment: {
      cwd: process.cwd(),
      node: process.version,
      platform: process.platform,
      arch: process.arch,
    },
    cases: entries as Record<RealDatasetBenchmarkCaseId, RealDatasetBaselineEntry>,
  };
}
