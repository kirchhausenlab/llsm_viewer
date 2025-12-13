import { create, root } from 'zarrita';
import type { Array as ZarrArray } from 'zarrita';
import type { VolumeChunkShape } from '../data/zarrLayout';
import { computeChunkShape, computeShardShape, getVolumeArrayPath } from '../data/zarrLayout';
import {
  createPreprocessingStore,
  openArrayAt,
  openGroupAt,
  type MinimalZarrArray,
  type MinimalZarrGroup,
  type ZarrMutableStore
} from '../data/zarr';
import {
  createVolumeTypedArray,
  isVolumeDataHandle,
  getBytesPerValue,
  type VolumePayload,
  type VolumeDataHandle,
  type VolumeTypedArray
} from '../types/volume';
import VolumeWorker from '../workers/volumeLoader.worker?worker';
import type {
  VolumeLoadedMessage,
  VolumeSliceMessage,
  VolumeStartMessage,
  VolumeWorkerOutboundMessage
} from '../workers/volumeLoaderMessages';

export type PreprocessingResult<Store extends ZarrMutableStore = ZarrMutableStore> = {
  store: Store;
  group: MinimalZarrGroup<Store>;
  arrays: Array<{ array: MinimalZarrArray<Store>; chunkShape: VolumeChunkShape }>;
};

export type VolumePreprocessingHooks = {
  onPreprocessingComplete?: (result: PreprocessingResult) => void | Promise<void>;
};

export type VolumeLoadCallbacks = {
  onVolumeLoaded?: (index: number, payload: VolumePayload<VolumeDataHandle>) => void;
  preprocessingHooks?: VolumePreprocessingHooks;
};

type VolumeAssemblyState = {
  metadata: VolumeStartMessage['metadata'];
  sliceCount: number;
  sliceLength: number;
  bytesPerSlice: number;
  slicesReceived: number;
};

type ZarrArrayContext = {
  chunk_shape: VolumeChunkShape;
  encode_chunk_key(chunkCoords: number[]): string;
  codec: {
    encode(chunk: { data: VolumeTypedArray; shape: number[]; stride: number[] }): Promise<Uint8Array>;
  };
  get_strides(shape: number[]): number[];
};

function getZarrContext(zarrArray: object): ZarrArrayContext {
  const contextSymbol = Object.getOwnPropertySymbols(zarrArray).find(
    (symbol) => symbol.description === 'zarrita.context'
  );
  const zarrContext = contextSymbol ? (zarrArray as Record<symbol, unknown>)[contextSymbol] : undefined;
  if (!zarrContext || typeof zarrContext !== 'object') {
    throw new Error('Failed to access Zarr array context.');
  }
  return zarrContext as ZarrArrayContext;
}

type ChunkRanges = {
  c: { start: number; end: number };
  z: { start: number; end: number };
  y: { start: number; end: number };
  x: { start: number; end: number };
};

type ChunkAssembly = {
  coords: [number, number, number, number];
  ranges: ChunkRanges;
  data: VolumeTypedArray;
  chunkShape: VolumeChunkShape;
  chunkStrides: number[];
  zarrArray: Awaited<ReturnType<typeof createVolumeArray>>['array'];
  zarrContext: ZarrArrayContext;
};

class VolumePreprocessingWriter {
  private readonly chunkWriters = new Map<string, ChunkAssembly>();
  private readonly volumeArrayPromise: ReturnType<typeof createVolumeArray>;
  private readonly chunkCounts: { x: number; y: number; z: number; c: number };
  private readonly targetChunkShape: VolumeChunkShape;

  constructor(
    private readonly store: ZarrMutableStore,
    private readonly index: number,
    private readonly metadata: VolumeStartMessage['metadata']
  ) {
    this.targetChunkShape = computeChunkShape(metadata, { bytesPerValue: metadata.bytesPerValue });
    this.volumeArrayPromise = createVolumeArray(store, index, metadata);
    this.chunkCounts = {
      x: Math.ceil(metadata.width / this.targetChunkShape[3]),
      y: Math.ceil(metadata.height / this.targetChunkShape[2]),
      z: Math.ceil(metadata.depth / this.targetChunkShape[1]),
      c: Math.ceil(metadata.channels / this.targetChunkShape[0])
    };
  }

  async writeSlice(slice: VolumeTypedArray, sliceIndex: number): Promise<void> {
    const volumeArray = await this.volumeArrayPromise;
    const { chunkShape, chunkStrides } = volumeArray;

    for (let cChunk = 0; cChunk < this.chunkCounts.c; cChunk += 1) {
      const cStart = cChunk * chunkShape[0];
      const cEnd = Math.min(this.metadata.channels, cStart + chunkShape[0]);

      for (let yChunk = 0; yChunk < this.chunkCounts.y; yChunk += 1) {
        const yStart = yChunk * chunkShape[2];
        const yEnd = Math.min(this.metadata.height, yStart + chunkShape[2]);

        for (let xChunk = 0; xChunk < this.chunkCounts.x; xChunk += 1) {
          const xStart = xChunk * chunkShape[3];
          const xEnd = Math.min(this.metadata.width, xStart + chunkShape[3]);

          const zChunk = Math.floor(sliceIndex / chunkShape[1]);
          const zStart = zChunk * chunkShape[1];
          const zEnd = Math.min(this.metadata.depth, zStart + chunkShape[1]);

          if (sliceIndex < zStart || sliceIndex >= zEnd) {
            continue;
          }

          const chunkKey = `${cChunk}/${zChunk}/${yChunk}/${xChunk}`;
          const assembly = this.getOrCreateAssembly({
            chunkKey,
            coords: [cChunk, zChunk, yChunk, xChunk],
            ranges: { c: { start: cStart, end: cEnd }, z: { start: zStart, end: zEnd }, y: { start: yStart, end: yEnd }, x: { start: xStart, end: xEnd } },
            chunkShape,
            chunkStrides,
            zarrArray: volumeArray.array,
            zarrContext: volumeArray.zarrContext
          });

          this.writeChunkSlice(assembly, slice, sliceIndex);

          if (sliceIndex + 1 >= assembly.ranges.z.end) {
            await this.flushChunk(chunkKey, assembly);
          }
        }
      }
    }
  }

  async finalize(): Promise<void> {
    const chunks = Array.from(this.chunkWriters.entries());
    this.chunkWriters.clear();
    await Promise.all(chunks.map(([key, assembly]) => this.flushChunk(key, assembly)));
  }

  async reopen(): Promise<{ array: MinimalZarrArray<ZarrMutableStore>; chunkShape: VolumeChunkShape }> {
    const { chunkShape } = await this.volumeArrayPromise;
    const array = await openArrayAt(this.store, getVolumeArrayPath(this.index));
    return { array, chunkShape };
  }

  private writeChunkSlice(assembly: ChunkAssembly, slice: VolumeTypedArray, sliceIndex: number) {
    const localZ = sliceIndex - assembly.ranges.z.start;
    const stride = assembly.chunkStrides;

    for (let y = assembly.ranges.y.start; y < assembly.ranges.y.end; y += 1) {
      for (let x = assembly.ranges.x.start; x < assembly.ranges.x.end; x += 1) {
        const baseIndex = (y * this.metadata.width + x) * this.metadata.channels;
        for (let c = assembly.ranges.c.start; c < assembly.ranges.c.end; c += 1) {
          const localC = c - assembly.ranges.c.start;
          const localY = y - assembly.ranges.y.start;
          const localX = x - assembly.ranges.x.start;
          const destinationIndex =
            localC * stride[0] + localZ * stride[1] + localY * stride[2] + localX * stride[3];
          if (destinationIndex >= assembly.data.length) {
            throw new Error(
              `Chunk write out of bounds at ${assembly.coords.join('/')} (${destinationIndex} / ${assembly.data.length})`
            );
          }
          assembly.data[destinationIndex] = slice[baseIndex + c];
        }
      }
    }
  }

  private async flushChunk(chunkKey: string, assembly: ChunkAssembly): Promise<void> {
    const chunkPath = assembly.zarrArray.resolve(assembly.zarrContext.encode_chunk_key(assembly.coords)).path;
    const encoded = await assembly.zarrContext.codec.encode({
      data: assembly.data,
      shape: assembly.chunkShape,
      stride: assembly.chunkStrides
    });
    await assembly.zarrArray.store.set(chunkPath, encoded);
    this.chunkWriters.delete(chunkKey);
  }

  private getOrCreateAssembly(options: {
    chunkKey: string;
    coords: [number, number, number, number];
    ranges: ChunkRanges;
    chunkShape: VolumeChunkShape;
    chunkStrides: number[];
    zarrArray: Awaited<ReturnType<typeof createVolumeArray>>['array'];
    zarrContext: ZarrArrayContext;
  }): ChunkAssembly {
    const existing = this.chunkWriters.get(options.chunkKey);
    if (existing) {
      return existing;
    }

    const valuesPerChunk = options.chunkShape.reduce((product, value) => product * value, 1);
    const buffer = new ArrayBuffer(valuesPerChunk * this.metadata.bytesPerValue);
    const data = createVolumeTypedArray(this.metadata.dataType, buffer);
    const assembly: ChunkAssembly = {
      coords: options.coords,
      ranges: options.ranges,
      data,
      chunkShape: options.chunkShape,
      chunkStrides: options.chunkStrides,
      zarrArray: options.zarrArray,
      zarrContext: options.zarrContext
    };
    this.chunkWriters.set(options.chunkKey, assembly);
    return assembly;
  }
}

class PreprocessingCoordinator {
  private readonly writers = new Map<number, VolumePreprocessingWriter>();

  constructor(private readonly store: ZarrMutableStore) {}

  getStore(): ZarrMutableStore {
    return this.store;
  }

  getWriter(index: number): VolumePreprocessingWriter | undefined {
    return this.writers.get(index);
  }

  startVolume(index: number, metadata: VolumeStartMessage['metadata']): void {
    this.writers.set(index, new VolumePreprocessingWriter(this.store, index, metadata));
  }

  async writeSlice(index: number, slice: VolumeTypedArray, sliceIndex: number): Promise<void> {
    const writer = this.writers.get(index);
    if (!writer) return;
    await writer.writeSlice(slice, sliceIndex);
  }

  async finalizeVolume(index: number): Promise<void> {
    const writer = this.writers.get(index);
    if (!writer) return;
    await writer.finalize();
  }

  async finalizeAll(volumeCount: number): Promise<PreprocessingResult> {
    await Promise.all(Array.from(this.writers.values()).map((writer) => writer.finalize()));
    const group = await openGroupAt(this.store);
    const arrays = await Promise.all(
      Array.from({ length: volumeCount }, (_value, index) => writerOrOpen(this.store, index, this))
    );
    return { store: this.store, group, arrays };
  }
}

async function writerOrOpen(
  store: ZarrMutableStore,
  index: number,
  coordinator: PreprocessingCoordinator
): Promise<{ array: MinimalZarrArray<ZarrMutableStore>; chunkShape: VolumeChunkShape }> {
  const writer = coordinator.getWriter(index);
  if (writer) {
    return writer.reopen();
  }
  const array = await openArrayAt(store, getVolumeArrayPath(index));
  const chunkShape = extractLogicalChunkShape(array);
  return { array, chunkShape };
}

function extractLogicalChunkShape(array: MinimalZarrArray): VolumeChunkShape {
  const primaryCodec = (array as { codecs?: Array<{ configuration?: { chunk_shape?: number[] } }> }).codecs?.[0];
  const codecChunkShape = primaryCodec?.configuration?.chunk_shape;
  if (codecChunkShape?.length === 4) {
    return codecChunkShape as VolumeChunkShape;
  }
  return array.chunks as VolumeChunkShape;
}

async function createVolumeArray(
  store: ZarrMutableStore,
  index: number,
  metadata: VolumeStartMessage['metadata']
): Promise<{
  array: ZarrArray<any, ZarrMutableStore>;
  zarrContext: ZarrArrayContext;
  chunkShape: VolumeChunkShape;
  chunkStrides: number[];
}> {
  const path = root(store).resolve(getVolumeArrayPath(index));
  const chunkShape = computeChunkShape(metadata, { bytesPerValue: metadata.bytesPerValue });
  const shardShape = computeShardShape(chunkShape, { bytesPerValue: metadata.bytesPerValue });
  const array = await create(path, {
    shape: [metadata.channels, metadata.depth, metadata.height, metadata.width],
    chunk_shape: shardShape,
    data_type: metadata.dataType,
    codecs: [
      {
        name: 'sharding_indexed',
        configuration: { chunk_shape: chunkShape, codecs: [], index_codecs: [] }
      }
    ]
  });
  const zarrContext = getZarrContext(array);
  return {
    array,
    zarrContext,
    chunkShape,
    chunkStrides: zarrContext.get_strides(chunkShape)
  };
}

export async function loadVolumesFromFiles(
  files: File[],
  callbacks: VolumeLoadCallbacks = {}
): Promise<VolumePayload<VolumeDataHandle>[]> {
  if (files.length === 0) {
    return [];
  }

  return new Promise<VolumePayload<VolumeDataHandle>[]>((resolve, reject) => {
    const worker = new VolumeWorker();
    const requestId = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
    const volumes: Array<VolumePayload<VolumeDataHandle> | undefined> = new Array(files.length);

    const assemblies = new Map<number, VolumeAssemblyState>();
    const pendingVolumes = new Set<Promise<void>>();
    let settled = false;

    const preprocessingCoordinatorPromise: Promise<PreprocessingCoordinator> = createPreprocessingStore().then(
      (store) => new PreprocessingCoordinator(store)
    );

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
      const bytesPerSlice = sliceLength * metadata.bytesPerValue;

      return {
        metadata,
        sliceCount,
        sliceLength,
        bytesPerSlice,
        slicesReceived: 0
      };
    };

    let messageQueue = Promise.resolve();

    const processWorkerMessage = async (message: VolumeWorkerOutboundMessage) => {
      if (!message || settled) {
        return;
      }

      const isMatchingRequest = message.requestId === requestId;
      if (!isMatchingRequest && message.type !== 'error') {
        return;
      }

      switch (message.type) {
        case 'volume-start': {
          try {
            const state = createAssemblyState(message);
            assemblies.set(message.index, state);
            const coordinator = await preprocessingCoordinatorPromise;
            coordinator.startVolume(message.index, message.metadata);
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
            const coordinator = await preprocessingCoordinatorPromise;
            await coordinator.writeSlice(message.index, slice, message.sliceIndex);
            state.slicesReceived += 1;
          } catch (error) {
            fail(error);
          }
          break;
        }
        case 'volume-loaded': {
          const handleVolumeLoaded = async () => {
            const state = assemblies.get(message.index);
            if (!state) {
              throw new Error('Received volume metadata before initialization.');
            }

            assemblies.delete(message.index);

            if (state.slicesReceived !== state.sliceCount) {
              console.warn(
                `Volume ${message.index} completed with ${state.slicesReceived} of ${state.sliceCount} slices.`
              );
            }

            const coordinator = await preprocessingCoordinatorPromise;
            await coordinator.finalizeVolume(message.index);
            const { chunkShape } = await writerOrOpen(coordinator.getStore(), message.index, coordinator);
            const payload: VolumePayload<VolumeDataHandle> = {
              ...message.metadata,
              data: {
                kind: 'zarr',
                store: coordinator.getStore(),
                path: getVolumeArrayPath(message.index),
                chunkShape
              }
            };

            volumes[message.index] = payload;

            if (callbacks.onVolumeLoaded) {
              callbacks.onVolumeLoaded(message.index, payload);
            }
          };

          const volumePromise = handleVolumeLoaded();
          pendingVolumes.add(volumePromise);
          volumePromise
            .catch((error) => fail(error))
            .finally(() => pendingVolumes.delete(volumePromise));

          await volumePromise.catch(() => {});
          break;
        }
        case 'complete':
          try {
            await Promise.all(Array.from(pendingVolumes));
            const coordinator = await preprocessingCoordinatorPromise;
            if (coordinator && callbacks.preprocessingHooks?.onPreprocessingComplete) {
              const result = await coordinator.finalizeAll(files.length);
              await callbacks.preprocessingHooks.onPreprocessingComplete(result);
            }
            const missingIndex = volumes.findIndex((volume) => volume === undefined);
            if (missingIndex !== -1) {
              throw new Error(
                `Volume ${missingIndex + 1} did not finish loading. Please retry the launch.`
              );
            }
            settled = true;
            cleanup();
            resolve(volumes as VolumePayload<VolumeDataHandle>[]);
          } catch (error) {
            fail(error);
          }
          break;
        case 'error': {
          const details = message.code ? `${message.code}: ${message.message}` : message.message;
          const errorToReport = new Error(details);
          if (message.details) {
            (errorToReport as Error & { details?: unknown }).details = message.details;
          }
          fail(errorToReport);
          break;
        }
        default:
          break;
      }
    };

    worker.onmessage = (event) => {
      messageQueue = messageQueue
        .then(() => processWorkerMessage(event.data as VolumeWorkerOutboundMessage))
        .catch((error) => fail(error));
    };

    worker.onerror = (event) => {
      const fallbackMessage = event.message || String(event.error || 'Worker error');
      fail(event.error instanceof Error ? event.error : new Error(fallbackMessage));
    };

    worker.postMessage({ type: 'load-volumes', requestId, files });
  });
}

export async function materializeVolumePayload(
  volume: VolumePayload<VolumeDataHandle | ArrayBufferLike>
): Promise<VolumePayload<ArrayBufferLike>> {
  if (!isVolumeDataHandle(volume.data)) {
    return volume as VolumePayload<ArrayBufferLike>;
  }

  const handle = volume.data as VolumeDataHandle<ZarrMutableStore>;
  const array = await openArrayAt(handle.store, handle.path);
  const chunkShape = (handle.chunkShape ?? extractLogicalChunkShape(array)) as VolumeChunkShape;

  const chunkCounts = {
    x: Math.ceil(volume.width / chunkShape[3]),
    y: Math.ceil(volume.height / chunkShape[2]),
    z: Math.ceil(volume.depth / chunkShape[1]),
    c: Math.ceil(volume.channels / chunkShape[0])
  };

  const valuesPerVolume = volume.width * volume.height * volume.depth * volume.channels;
  const buffer = new ArrayBuffer(valuesPerVolume * getBytesPerValue(volume.dataType));
  const destination = createVolumeTypedArray(volume.dataType, buffer);

  for (let cChunk = 0; cChunk < chunkCounts.c; cChunk += 1) {
    const cStart = cChunk * chunkShape[0];
    const cEnd = Math.min(volume.channels, cStart + chunkShape[0]);

    for (let zChunk = 0; zChunk < chunkCounts.z; zChunk += 1) {
      const zStart = zChunk * chunkShape[1];
      const zEnd = Math.min(volume.depth, zStart + chunkShape[1]);

      for (let yChunk = 0; yChunk < chunkCounts.y; yChunk += 1) {
        const yStart = yChunk * chunkShape[2];
        const yEnd = Math.min(volume.height, yStart + chunkShape[2]);

        for (let xChunk = 0; xChunk < chunkCounts.x; xChunk += 1) {
          const xStart = xChunk * chunkShape[3];
          const xEnd = Math.min(volume.width, xStart + chunkShape[3]);

          const chunk = await array.getChunk([cChunk, zChunk, yChunk, xChunk]);
          const stride = chunk.stride;
          const data = chunk.data as VolumeTypedArray;

          for (let c = cStart; c < cEnd; c += 1) {
            const localC = c - cStart;

            for (let z = zStart; z < zEnd; z += 1) {
              const localZ = z - zStart;

              for (let y = yStart; y < yEnd; y += 1) {
                const localY = y - yStart;

                for (let x = xStart; x < xEnd; x += 1) {
                  const localX = x - xStart;
                  const chunkIndex =
                    localC * stride[0] + localZ * stride[1] + localY * stride[2] + localX * stride[3];
                  const destinationIndex =
                    ((z * volume.height + y) * volume.width + x) * volume.channels + c;
                  destination[destinationIndex] = data[chunkIndex];
                }
              }
            }
          }
        }
      }
    }
  }

  return { ...volume, data: buffer };
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
  volumes: VolumePayload<ArrayBufferLike>[],
  movieMode: '2d' | '3d'
): VolumePayload<ArrayBufferLike>[] {
  if (movieMode !== '2d') {
    return volumes;
  }

  const expanded: VolumePayload<ArrayBufferLike>[] = [];
  for (const volume of volumes) {
    if (volume.depth <= 0) {
      continue;
    }

    const sliceLength = volume.width * volume.height * volume.channels;
    if (isVolumeDataHandle(volume.data)) {
      throw new Error('Expected materialized volume data but received a VolumeDataHandle.');
    }
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
