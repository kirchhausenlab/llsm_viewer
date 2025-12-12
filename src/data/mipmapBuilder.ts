import { create, root } from 'zarrita';
import type { GroupMetadata } from 'zarrita';

import { computeChunkShape, computeShardShape, type VolumeChunkShape } from './zarrLayout';
import { openArrayAt, type ZarrMutableStore } from './zarr';
import {
  createWritableVolumeArray,
  getBytesPerValue,
  type VolumeDataType,
  type VolumeTypedArray
} from '../types/volume';

const DEFAULT_MAX_DIMENSION = 64;
const DEFAULT_HISTOGRAM_BINS = 1024;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function getZarrContext(zarrArray: object): {
  chunk_shape: VolumeChunkShape;
  encode_chunk_key(chunkCoords: number[]): string;
  codec: {
    encode(chunk: { data: VolumeTypedArray; shape: number[]; stride: number[] }): Promise<Uint8Array>;
  };
  get_strides(shape: number[]): number[];
} {
  const contextSymbol = Object.getOwnPropertySymbols(zarrArray).find(
    (symbol) => symbol.description === 'zarrita.context'
  );
  const zarrContext = contextSymbol ? (zarrArray as Record<symbol, unknown>)[contextSymbol] : undefined;
  if (!zarrContext || typeof zarrContext !== 'object') {
    throw new Error('Failed to access Zarr array context.');
  }
  return zarrContext as {
    chunk_shape: VolumeChunkShape;
    encode_chunk_key(chunkCoords: number[]): string;
    codec: {
      encode(chunk: { data: VolumeTypedArray; shape: number[]; stride: number[] }): Promise<Uint8Array>;
    };
    get_strides(shape: number[]): number[];
  };
}

function joinPath(...segments: string[]): string {
  return (
    '/' +
    segments
      .map((segment) => segment.replace(/^\/+|\/+$/g, ''))
      .filter((segment) => segment.length > 0)
      .join('/')
  );
}

function computeLevelShape(previous: VolumeChunkShape): VolumeChunkShape {
  return [
    previous[0],
    Math.max(1, Math.ceil(previous[1] / 2)),
    Math.max(1, Math.ceil(previous[2] / 2)),
    Math.max(1, Math.ceil(previous[3] / 2))
  ];
}

function computeChunkCounts(shape: VolumeChunkShape, chunkShape: VolumeChunkShape) {
  return {
    c: Math.ceil(shape[0] / chunkShape[0]),
    z: Math.ceil(shape[1] / chunkShape[1]),
    y: Math.ceil(shape[2] / chunkShape[2]),
    x: Math.ceil(shape[3] / chunkShape[3])
  };
}

type Range = { start: number; end: number };

function chunkRange(index: number, chunkSize: number, total: number): Range {
  const start = index * chunkSize;
  const end = Math.min(total, start + chunkSize);
  return { start, end };
}

function getSentinelValue(type: VolumeDataType): number {
  switch (type) {
    case 'int8':
      return -128;
    case 'int16':
      return -32768;
    case 'int32':
      return -2147483648;
    case 'uint8':
    case 'uint16':
    case 'uint32':
      return 0;
    case 'float32':
    case 'float64':
      return Number.NEGATIVE_INFINITY;
    default: {
      const exhaustive: never = type;
      throw new Error(`Unsupported data type: ${exhaustive}`);
    }
  }
}

function getFillValue(type: VolumeDataType): number {
  switch (type) {
    case 'int8':
    case 'int16':
    case 'int32':
    case 'uint8':
    case 'uint16':
    case 'uint32':
      return 0;
    case 'float32':
    case 'float64':
      return 0;
    default: {
      const exhaustive: never = type;
      throw new Error(`Unsupported data type: ${exhaustive}`);
    }
  }
}

class DynamicHistogram {
  private counts: Uint32Array;
  private minimum = Number.POSITIVE_INFINITY;
  private maximum = Number.NEGATIVE_INFINITY;
  private total = 0;

  constructor(private readonly bins: number) {
    this.counts = new Uint32Array(bins);
  }

  add(value: number) {
    if (!Number.isFinite(value)) return;
    if (!this.isInitialized()) {
      this.minimum = value;
      this.maximum = value === this.minimum ? this.minimum + 1 : value;
    } else if (value < this.minimum || value > this.maximum) {
      this.expandRange(value);
    }

    const bin = this.getBin(value);
    this.counts[bin] += 1;
    this.total += 1;
  }

  private isInitialized(): boolean {
    return Number.isFinite(this.minimum) && Number.isFinite(this.maximum);
  }

  private expandRange(value: number) {
    const newMinimum = Math.min(this.minimum, value);
    const newMaximum = Math.max(this.maximum, value);
    const oldMinimum = this.minimum;
    const oldMaximum = this.maximum;
    this.minimum = newMinimum;
    this.maximum = newMaximum === newMinimum ? newMinimum + 1 : newMaximum;

    const next = new Uint32Array(this.bins);
    for (let i = 0; i < this.counts.length; i += 1) {
      const count = this.counts[i];
      if (!count) continue;
      const fraction = i / (this.counts.length - 1);
      const representative = oldMinimum + fraction * (oldMaximum - oldMinimum);
      const newBin = this.getBin(representative);
      next[newBin] += count;
    }
    this.counts = next;
  }

  private getBin(value: number): number {
    const range = this.maximum - this.minimum;
    if (range <= 0) return 0;
    const normalized = (value - this.minimum) / range;
    const bin = Math.floor(normalized * (this.bins - 1));
    return Math.min(this.bins - 1, Math.max(0, bin));
  }

  finalize(targetQuantiles: number[]): {
    min: number;
    max: number;
    histogram: { bins: number; min: number; max: number; counts: number[] };
    quantiles: Record<string, number>;
  } {
    const initialized = this.total > 0 && Number.isFinite(this.minimum) && Number.isFinite(this.maximum);
    const min = initialized ? this.minimum : 0;
    const max = initialized ? this.maximum : 1;
    const histogram = {
      bins: this.counts.length,
      min,
      max,
      counts: Array.from(this.counts)
    };

    const quantiles: Record<string, number> = {};
    const total = this.total;
    let cumulative = 0;

    if (!initialized || total === 0) {
      for (const q of targetQuantiles) {
        quantiles[`p${Math.round(q * 100)}`] = 0;
      }
      return { min, max, histogram, quantiles };
    }

    const thresholds = targetQuantiles.map((q) => ({ label: `p${Math.round(q * 100)}`, threshold: q * total }));
    let thresholdIndex = 0;

    for (let i = 0; i < this.counts.length && thresholdIndex < thresholds.length; i += 1) {
      cumulative += this.counts[i];
      while (thresholdIndex < thresholds.length && cumulative >= thresholds[thresholdIndex].threshold) {
        const fraction = i / (this.counts.length - 1);
        const value = this.minimum + fraction * (this.maximum - this.minimum);
        quantiles[thresholds[thresholdIndex].label] = value;
        thresholdIndex += 1;
      }
    }

    if (thresholdIndex < thresholds.length) {
      const value = this.maximum;
      for (; thresholdIndex < thresholds.length; thresholdIndex += 1) {
        quantiles[thresholds[thresholdIndex].label] = value;
      }
    }

    return {
      min: this.minimum,
      max: this.maximum,
      histogram,
      quantiles
    };
  }
}

async function readGroupMetadata(store: ZarrMutableStore, path: string): Promise<GroupMetadata | null> {
  const location = root(store).resolve(path);
  const metadataPath = location.resolve('zarr.json').path;
  const raw = await store.get(metadataPath as any);
  if (!raw) return null;
  const decoded = textDecoder.decode(raw);
  return JSON.parse(decoded) as GroupMetadata;
}

async function writeGroupMetadata(store: ZarrMutableStore, path: string, metadata: GroupMetadata) {
  const location = root(store).resolve(path);
  const metadataPath = location.resolve('zarr.json').path;
  await store.set(metadataPath as any, textEncoder.encode(JSON.stringify(metadata)));
}

async function updateGroupAttributes(
  store: ZarrMutableStore,
  path: string,
  update: (attributes: GroupMetadata['attributes']) => GroupMetadata['attributes']
) {
  const existing = (await readGroupMetadata(store, path)) ?? { zarr_format: 3, node_type: 'group', attributes: {} };
  const attributes = update(existing.attributes ?? {});
  const next: GroupMetadata = { ...existing, attributes };
  await writeGroupMetadata(store, path, next);
  return attributes;
}

async function createLevelArray(
  store: ZarrMutableStore,
  path: string,
  shape: VolumeChunkShape,
  dataType: VolumeDataType
) {
  const bytesPerValue = getBytesPerValue(dataType);
  const chunkShape = computeChunkShape(
    { channels: shape[0], depth: shape[1], height: shape[2], width: shape[3] },
    { bytesPerValue }
  );
  const shardShape = computeShardShape(chunkShape, { bytesPerValue });
  const location = root(store).resolve(path);
  const array = await create(location, {
    shape,
    data_type: dataType,
    chunk_shape: shardShape,
    codecs: [
      {
        name: 'sharding_indexed',
        configuration: { chunk_shape: chunkShape, codecs: [], index_codecs: [] }
      }
    ]
  });
  const context = getZarrContext(array);
  return { array, context, chunkShape: context.chunk_shape, chunkStrides: context.get_strides(context.chunk_shape) };
}

type ChunkStride = { shape: VolumeChunkShape; stride: number[]; data: VolumeTypedArray };

type DownsampleContext = {
  source: Awaited<ReturnType<typeof createLevelArray>>;
  target: Awaited<ReturnType<typeof createLevelArray>>;
  histogram?: DynamicHistogram[];
  stats?: Array<{ min: number; max: number }>;
};

type ScanContext = {
  source: Awaited<ReturnType<typeof createLevelArray>>;
  histogram?: DynamicHistogram[];
  stats?: Array<{ min: number; max: number }>;
};

function computeLocalRange(
  globalStart: number,
  globalEnd: number,
  chunkStart: number,
  chunkSize: number
): Range {
  const start = Math.max(globalStart, chunkStart) - chunkStart;
  const end = Math.min(globalEnd, chunkStart + chunkSize) - chunkStart;
  return { start, end };
}

function getChunkStride(chunk: ChunkStride, local: { c: number; z: number; y: number; x: number }): number {
  return (
    local.c * chunk.stride[0] +
    local.z * chunk.stride[1] +
    local.y * chunk.stride[2] +
    local.x * chunk.stride[3]
  );
}

async function downsampleLevel(context: DownsampleContext) {
  const { source, target } = context;
  const poolFactor = 2;
  const targetChunkCounts = computeChunkCounts(target.array.shape as VolumeChunkShape, target.chunkShape);
  const sourceChunkShape = source.chunkShape;

  for (let cChunk = 0; cChunk < targetChunkCounts.c; cChunk += 1) {
    const targetCRange = chunkRange(cChunk, target.chunkShape[0], target.array.shape[0]);

    for (let zChunk = 0; zChunk < targetChunkCounts.z; zChunk += 1) {
      const targetZRange = chunkRange(zChunk, target.chunkShape[1], target.array.shape[1]);

      for (let yChunk = 0; yChunk < targetChunkCounts.y; yChunk += 1) {
        const targetYRange = chunkRange(yChunk, target.chunkShape[2], target.array.shape[2]);

        for (let xChunk = 0; xChunk < targetChunkCounts.x; xChunk += 1) {
          const targetXRange = chunkRange(xChunk, target.chunkShape[3], target.array.shape[3]);
          const targetRanges = { c: targetCRange, z: targetZRange, y: targetYRange, x: targetXRange };
          const sourceRanges = {
            c: targetCRange,
            z: {
              start: targetZRange.start * poolFactor,
              end: Math.min(source.array.shape[1], targetZRange.end * poolFactor)
            },
            y: {
              start: targetYRange.start * poolFactor,
              end: Math.min(source.array.shape[2], targetYRange.end * poolFactor)
            },
            x: {
              start: targetXRange.start * poolFactor,
              end: Math.min(source.array.shape[3], targetXRange.end * poolFactor)
            }
          };

          const bufferLength = target.chunkShape.reduce((product, value) => product * value, 1);
          const chunkBuffer = createWritableVolumeArray(target.array.dtype as VolumeDataType, bufferLength);
          const written = new Uint8Array(bufferLength);
          const sentinel = getSentinelValue(target.array.dtype as VolumeDataType);
          const fill = getFillValue(target.array.dtype as VolumeDataType);
          chunkBuffer.fill(sentinel);

          const chunkStride = { shape: target.chunkShape, stride: target.chunkStrides, data: chunkBuffer };

          const sourceChunkRanges = {
            c: {
              start: Math.floor(sourceRanges.c.start / sourceChunkShape[0]),
              end: Math.floor((sourceRanges.c.end - 1) / sourceChunkShape[0])
            },
            z: {
              start: Math.floor(sourceRanges.z.start / sourceChunkShape[1]),
              end: Math.floor((sourceRanges.z.end - 1) / sourceChunkShape[1])
            },
            y: {
              start: Math.floor(sourceRanges.y.start / sourceChunkShape[2]),
              end: Math.floor((sourceRanges.y.end - 1) / sourceChunkShape[2])
            },
            x: {
              start: Math.floor(sourceRanges.x.start / sourceChunkShape[3]),
              end: Math.floor((sourceRanges.x.end - 1) / sourceChunkShape[3])
            }
          };

          for (let sourceC = sourceChunkRanges.c.start; sourceC <= sourceChunkRanges.c.end; sourceC += 1) {
            for (let sourceZ = sourceChunkRanges.z.start; sourceZ <= sourceChunkRanges.z.end; sourceZ += 1) {
              for (let sourceY = sourceChunkRanges.y.start; sourceY <= sourceChunkRanges.y.end; sourceY += 1) {
                for (let sourceX = sourceChunkRanges.x.start; sourceX <= sourceChunkRanges.x.end; sourceX += 1) {
                  const chunkCoords = [sourceC, sourceZ, sourceY, sourceX];
                  const { data, shape, stride } = (await source.array.getChunk(chunkCoords)) as {
                    data: VolumeTypedArray;
                    shape: VolumeChunkShape;
                    stride: number[];
                  };
                  const globalChunkStart = {
                    c: sourceC * sourceChunkShape[0],
                    z: sourceZ * sourceChunkShape[1],
                    y: sourceY * sourceChunkShape[2],
                    x: sourceX * sourceChunkShape[3]
                  };

                  const localRange = {
                    c: computeLocalRange(sourceRanges.c.start, sourceRanges.c.end, globalChunkStart.c, shape[0]),
                    z: computeLocalRange(sourceRanges.z.start, sourceRanges.z.end, globalChunkStart.z, shape[1]),
                    y: computeLocalRange(sourceRanges.y.start, sourceRanges.y.end, globalChunkStart.y, shape[2]),
                    x: computeLocalRange(sourceRanges.x.start, sourceRanges.x.end, globalChunkStart.x, shape[3])
                  };

                  for (let c = localRange.c.start; c < localRange.c.end; c += 1) {
                    const globalC = globalChunkStart.c + c;
                    const histogram = context.histogram?.[globalC];
                    const stats = context.stats?.[globalC];

                    for (let z = localRange.z.start; z < localRange.z.end; z += 1) {
                      const globalZ = globalChunkStart.z + z;
                      const pooledZ = Math.floor(globalZ / poolFactor);
                      const targetLocalZ = pooledZ - targetRanges.z.start;

                      for (let y = localRange.y.start; y < localRange.y.end; y += 1) {
                        const globalY = globalChunkStart.y + y;
                        const pooledY = Math.floor(globalY / poolFactor);
                        const targetLocalY = pooledY - targetRanges.y.start;

                        for (let x = localRange.x.start; x < localRange.x.end; x += 1) {
                          const globalX = globalChunkStart.x + x;
                          const pooledX = Math.floor(globalX / poolFactor);
                          const targetLocalX = pooledX - targetRanges.x.start;
                          const sourceIndex =
                            c * stride[0] + z * stride[1] + y * stride[2] + x * stride[3];
                          const value = data[sourceIndex] as number;

                          if (histogram) histogram.add(value);
                          if (stats) {
                            stats.min = Math.min(stats.min, value);
                            stats.max = Math.max(stats.max, value);
                          }

                          const targetIndex = getChunkStride(chunkStride, {
                            c: c - targetRanges.c.start,
                            z: targetLocalZ,
                            y: targetLocalY,
                            x: targetLocalX
                          });

                          if (!written[targetIndex]) {
                            chunkStride.data[targetIndex] = value;
                            written[targetIndex] = 1;
                            continue;
                          }
                          const current = chunkStride.data[targetIndex] as number;
                          if (value > current) {
                            chunkStride.data[targetIndex] = value;
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }

          for (let i = 0; i < chunkStride.data.length; i += 1) {
            if (!written[i]) {
              chunkStride.data[i] = fill;
            }
          }

          const chunkPath = target.array
            .resolve(target.context.encode_chunk_key([cChunk, zChunk, yChunk, xChunk]))
            .path;
          const encoded = await target.context.codec.encode({
            data: chunkStride.data,
            shape: target.chunkShape,
            stride: target.chunkStrides
          });
          await target.array.store.set(chunkPath as any, encoded);
        }
      }
    }
  }
}

async function scanLevel(context: ScanContext) {
  const { source } = context;
  const chunkCounts = computeChunkCounts(source.array.shape as VolumeChunkShape, source.chunkShape);

  for (let cChunk = 0; cChunk < chunkCounts.c; cChunk += 1) {
    for (let zChunk = 0; zChunk < chunkCounts.z; zChunk += 1) {
      for (let yChunk = 0; yChunk < chunkCounts.y; yChunk += 1) {
        for (let xChunk = 0; xChunk < chunkCounts.x; xChunk += 1) {
          const { data, shape, stride } = (await source.array.getChunk([cChunk, zChunk, yChunk, xChunk])) as {
            data: VolumeTypedArray;
            shape: VolumeChunkShape;
            stride: number[];
          };

          for (let c = 0; c < shape[0]; c += 1) {
            const histogram = context.histogram?.[cChunk * source.chunkShape[0] + c];
            const stats = context.stats?.[cChunk * source.chunkShape[0] + c];

            for (let z = 0; z < shape[1]; z += 1) {
              for (let y = 0; y < shape[2]; y += 1) {
                for (let x = 0; x < shape[3]; x += 1) {
                  const index = c * stride[0] + z * stride[1] + y * stride[2] + x * stride[3];
                  const value = data[index] as number;
                  histogram?.add(value);
                  if (stats) {
                    stats.min = Math.min(stats.min, value);
                    stats.max = Math.max(stats.max, value);
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}

export type BuildMipmapsOptions = {
  store: ZarrMutableStore;
  basePath: string;
  levelPrefix?: string;
  targetMaxDimension?: number;
  histogramBins?: number;
  analyticsGroupPath?: string;
};

export type MipmapBuildResult = {
  levels: string[];
  stats: Array<{
    min: number;
    max: number;
    histogram: { bins: number; min: number; max: number; counts: number[] };
    quantiles: Record<string, number>;
  }>;
};

export async function buildMipmaps({
  store,
  basePath,
  levelPrefix = '/mipmaps',
  targetMaxDimension = DEFAULT_MAX_DIMENSION,
  histogramBins = DEFAULT_HISTOGRAM_BINS,
  analyticsGroupPath = '/analytics'
}: BuildMipmapsOptions): Promise<MipmapBuildResult> {
  const baseArray = await openArrayAt(store, basePath);
  const baseContext = getZarrContext(baseArray);
  const levels: string[] = [];
  const histogram = Array.from({ length: baseArray.shape[0] ?? 0 }, () => new DynamicHistogram(histogramBins));
  const stats = Array.from({ length: baseArray.shape[0] ?? 0 }, () => ({ min: Infinity, max: -Infinity }));

  let current = { array: baseArray, context: baseContext, chunkShape: baseContext.chunk_shape } as Awaited<
    ReturnType<typeof createLevelArray>
  >;
  let currentShape = baseArray.shape as VolumeChunkShape;
  let levelIndex = 0;

  while (Math.max(currentShape[1], currentShape[2], currentShape[3]) > targetMaxDimension) {
    const nextShape = computeLevelShape(currentShape);
    const levelPath = joinPath(levelPrefix, basePath, `level-${levelIndex + 1}`);
    const next = await createLevelArray(store, levelPath, nextShape, baseArray.dtype as VolumeDataType);
    await downsampleLevel({
      source: current,
      target: next,
      histogram: levelIndex === 0 ? histogram : undefined,
      stats: levelIndex === 0 ? stats : undefined
    });

    levels.push(levelPath);
    current = next;
    currentShape = nextShape;
    levelIndex += 1;
  }

  if (levelIndex === 0) {
    // Still compute histogram and stats for the base level without generating new mips.
    await scanLevel({
      source: current,
      histogram,
      stats
    });
  }

  const finalized = histogram.map((entry) =>
    entry.finalize([
      0.01,
      0.05,
      0.1,
      0.25,
      0.5,
      0.75,
      0.9,
      0.95,
      0.99
    ])
  );

  await updateGroupAttributes(store, '/', (attributes) => {
    const statsByPath = (attributes.stats && typeof attributes.stats === 'object' ? attributes.stats : {}) as Record<
      string,
      unknown
    >;
    statsByPath[basePath] = finalized.map((entry, index) => ({
      channel: index,
      min: Number.isFinite(stats[index]?.min) ? stats[index]?.min : entry.min,
      max: Number.isFinite(stats[index]?.max) ? stats[index]?.max : entry.max,
      histogram: entry.histogram,
      quantiles: entry.quantiles
    }));
    return { ...attributes, stats: statsByPath };
  });

  await updateGroupAttributes(store, analyticsGroupPath, (attributes) => ({
    ...attributes,
    histograms: {
      ...((attributes as Record<string, unknown>).histograms as Record<string, unknown> | undefined),
      [basePath]: finalized
    }
  }));

  return { levels, stats: finalized };
}
