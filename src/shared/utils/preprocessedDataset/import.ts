import { Uint8ArrayWriter, ZipReader } from '@zip.js/zip.js';
import type { FileEntry } from '@zip.js/zip.js';

import type { LoadedLayer, LoadedVolume } from '../../../types/layers';
import { VOXEL_RESOLUTION_UNITS } from '../../../types/voxelResolution';
import { getBytesPerValue, type VolumeDataType } from '../../../types/volume';
import { ZarrVolumeSource, type ZarrMipLevel } from '../../../data/ZarrVolumeSource';

import { computeSha256Hex } from './hash';
import {
  type ImportPreprocessedDatasetResult,
  type PreprocessedMovieMode,
  type PreprocessedChannelSummary,
  type PreprocessedLayerSummary,
  type PreprocessedManifest,
  type PreprocessedZarrStore,
  type PreprocessedVolumeManifestEntry,
  MANIFEST_FILE_NAME,
  type PreprocessedImportMilestone
} from './types';
import {
  DirectoryHandleStore,
  IndexedDBStore,
  KeyedFileStore,
  createFetchStore,
  openArrayAt
} from '../../../data/zarr';
import type { AsyncReadable } from '@zarrita/storage';

const textDecoder = new TextDecoder();
const VALID_VOLUME_DATA_TYPES: VolumeDataType[] = [
  'uint8',
  'int8',
  'uint16',
  'int16',
  'uint32',
  'int32',
  'float32',
  'float64'
];

function isVolumeDataType(value: unknown): value is VolumeDataType {
  return typeof value === 'string' && VALID_VOLUME_DATA_TYPES.includes(value as VolumeDataType);
}

function validateZarrStore(store: PreprocessedZarrStore): void {
  if (!store || typeof store !== 'object') {
    throw new Error('Manifest Zarr store description is invalid.');
  }

  const { source } = store as { source?: unknown };
  if (source !== 'archive' && source !== 'url' && source !== 'local' && source !== 'opfs') {
    throw new Error('Manifest Zarr store source is invalid.');
  }

  if ('url' in store) {
    if (typeof store.url !== 'string' || store.url.length === 0) {
      throw new Error('Manifest Zarr store URL is invalid.');
    }
  }

  if (store.root !== undefined && store.root !== null && typeof store.root !== 'string') {
    throw new Error('Manifest Zarr store root is invalid.');
  }

  if ('name' in store && store.name !== undefined && store.name !== null && typeof store.name !== 'string') {
    throw new Error('Manifest Zarr store name is invalid.');
  }
}

export type ImportPreprocessedDatasetOptions = {
  onProgress?: (bytesProcessed: number) => void;
  onVolumeDecoded?: (volumesDecoded: number, totalVolumeCount: number) => void;
  onMilestone?: (milestone: PreprocessedImportMilestone) => void;
};

type VolumeData = {
  data: Uint8Array;
  digest: string;
};

function isReadableStream(value: unknown): value is ReadableStream<Uint8Array> {
  return typeof value === 'object' && value !== null && typeof (value as ReadableStream).getReader === 'function';
}

function toReadableStream(
  source: ArrayBuffer | Uint8Array | ReadableStream<Uint8Array>
): { stream: ReadableStream<Uint8Array>; totalBytes: number | null } {
  if (isReadableStream(source)) {
    return { stream: source, totalBytes: null };
  }

  const view = source instanceof Uint8Array ? source : new Uint8Array(source);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      if (view.byteLength > 0) {
        controller.enqueue(view);
      }
      controller.close();
    }
  });

  return { stream, totalBytes: view.byteLength };
}

function createProgressReportingStream(
  stream: ReadableStream<Uint8Array>,
  onChunk?: (delta: number) => void
): ReadableStream<Uint8Array> {
  if (!onChunk) {
    return stream;
  }

  return new ReadableStream<Uint8Array>({
    start(controller) {
      const reader = stream.getReader();

      const pump = async (): Promise<void> => {
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) {
              controller.close();
              break;
            }
            if (value && value.byteLength > 0) {
              onChunk(value.byteLength);
              controller.enqueue(value);
            }
          }
        } catch (error) {
          controller.error(error);
        } finally {
          reader.releaseLock();
        }
      };

      void pump();
    },
    cancel(reason) {
      if (typeof stream.cancel === 'function') {
        return stream.cancel(reason);
      }
      return undefined;
    }
  });
}

function stripPrefix(value: string, prefix: string): string {
  if (!prefix) return value;
  return value.startsWith(prefix) ? value.slice(prefix.length) : value;
}

function normalizeRoot(root?: string | null): string {
  if (!root) return '';
  const trimmed = root.replace(/^\/+/, '').replace(/\/+$/, '');
  return trimmed.length > 0 ? `${trimmed}/` : '';
}

async function createArchiveZarrStore(
  entries: Map<string, FileEntry>,
  store: PreprocessedZarrStore
): Promise<AsyncReadable | null> {
  const rootPrefix = normalizeRoot(store.root ?? 'zarr');
  const files = new Map<string, Blob>();

  for (const [filename, entry] of entries) {
    if (rootPrefix && !filename.startsWith(rootPrefix)) {
      continue;
    }
    const normalizedKey = `/${stripPrefix(filename, rootPrefix)}`;
    const data = await entry.getData(new Uint8ArrayWriter());
    files.set(normalizedKey, new Blob([data]));
  }

  if (files.size === 0) {
    return null;
  }

  return new KeyedFileStore(files);
}

type NamedZarrStore = Extract<PreprocessedZarrStore, { source: 'opfs' | 'local' }>;

async function createOpfsZarrStore(store: NamedZarrStore): Promise<AsyncReadable | null> {
  if (typeof navigator === 'undefined' || typeof navigator.storage?.getDirectory !== 'function') {
    return null;
  }

  try {
    const rootHandle = await navigator.storage.getDirectory();
    const targetHandle =
      store.name && store.name.length > 0
        ? await rootHandle.getDirectoryHandle(store.name, { create: false })
        : rootHandle;
    return new DirectoryHandleStore(targetHandle);
  } catch (error) {
    console.warn('Failed to open OPFS-backed Zarr store', error);
    return null;
  }
}

export async function openExternalZarrStore(store: PreprocessedZarrStore): Promise<AsyncReadable | null> {
  if (store.source === 'url') {
    return createFetchStore(store.url);
  }

  if (store.source === 'opfs') {
    return createOpfsZarrStore(store);
  }

  if (store.source === 'local') {
    const opfsStore = await createOpfsZarrStore(store);
    if (opfsStore) {
      return opfsStore;
    }
    const storeName = store.name && store.name.length > 0 ? store.name : undefined;
    return IndexedDBStore.create(storeName);
  }

  return null;
}

async function createZarrStore(
  entries: Map<string, FileEntry>,
  store?: PreprocessedZarrStore | null
): Promise<AsyncReadable | null> {
  if (!store) return null;

  if (store.source === 'archive') {
    return createArchiveZarrStore(entries, store);
  }

  const externalStore = await openExternalZarrStore(store);
  if (externalStore) {
    return externalStore;
  }

  if (store.source === 'local' || store.source === 'opfs') {
    throw new Error('This preprocessed dataset targets a local Zarr store; please import it from the source directly.');
  }

  return null;
}

function ensureUint8Array(data: unknown): Uint8Array {
  if (data instanceof Uint8Array) {
    return data.byteOffset === 0 && data.byteLength === data.buffer.byteLength
      ? data
      : data.slice();
  }
  if (ArrayBuffer.isView(data)) {
    const view = data as ArrayBufferView;
    return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  }
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }
  throw new Error('Zarr array read returned an unsupported payload.');
}

async function readZarrVolume(
  store: AsyncReadable,
  path: string,
  expectedBytes: number
): Promise<Uint8Array> {
  const array = await openArrayAt(store, path);
  const payload = await array.getChunk([0, 0, 0, 0] as any);
  const data = ensureUint8Array((payload as any).data ?? payload);
  if (data.byteLength !== expectedBytes) {
    console.warn(`Zarr volume at ${path} has ${data.byteLength} bytes; expected ${expectedBytes}.`);
  }
  return data;
}

type StreamingContext = {
  streamingSource: ZarrVolumeSource;
  streamingBaseShape: [number, number, number, number];
};

function normalizeToFourDimensions(
  shape: readonly number[] | undefined,
  fallback: [number, number, number, number]
): [number, number, number, number] {
  const normalized: [number, number, number, number] = [...fallback];
  if (!Array.isArray(shape)) {
    return normalized;
  }

  for (let index = 0; index < 4; index += 1) {
    const value = shape[index];
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      normalized[index] = value;
    }
  }

  return normalized;
}

export async function buildStreamingContexts(
  manifest: PreprocessedManifest,
  store: AsyncReadable
): Promise<Map<string, StreamingContext>> {
  const contexts = new Map<string, StreamingContext>();
  const visited = new Set<string>();

  for (const channel of manifest.dataset.channels) {
    for (const layer of channel.layers) {
      for (const volume of layer.volumes) {
        if (visited.has(volume.path)) {
          continue;
        }
        visited.add(volume.path);

        try {
          const baseArray = await openArrayAt(store, volume.path);
          const baseShape = normalizeToFourDimensions(baseArray.shape as number[] | undefined, [
            volume.channels,
            volume.depth,
            volume.height,
            volume.width
          ]);
          const baseChunkShape = normalizeToFourDimensions(
            (baseArray as { chunks?: readonly number[] }).chunks,
            baseShape
          );
          const streamingBaseShape: [number, number, number, number] = [
            Math.max(baseShape[0], baseChunkShape[0]),
            Math.max(baseShape[1], baseChunkShape[1]),
            Math.max(baseShape[2], baseChunkShape[2]),
            Math.max(baseShape[3], baseChunkShape[3])
          ];

          const levels: ZarrMipLevel[] = [
            {
              level: 0,
              array: baseArray,
              dataType: volume.dataType,
              shape: baseShape,
              chunkShape: baseChunkShape
            }
          ];

          const mipEntries =
            (volume as { mips?: Array<{ level: number; path: string }> }).mips ??
            (volume as { mipLevels?: Array<{ level: number; path: string }> }).mipLevels;

          if (Array.isArray(mipEntries)) {
            const seenLevels = new Set<number>([0]);
            for (const entry of mipEntries) {
              if (!entry || typeof entry !== 'object') continue;
              const levelIndex = (entry as { level?: number }).level;
              const path = (entry as { path?: string }).path;
              if (typeof levelIndex !== 'number' || !Number.isFinite(levelIndex) || typeof path !== 'string') {
                continue;
              }
              if (seenLevels.has(levelIndex)) {
                continue;
              }
              try {
                const mipArray = await openArrayAt(store, path);
                const mipShape = normalizeToFourDimensions(mipArray.shape as number[] | undefined, baseShape);
                const mipChunkShape = normalizeToFourDimensions(
                  (mipArray as { chunks?: readonly number[] }).chunks,
                  mipShape
                );
                levels.push({
                  level: levelIndex,
                  array: mipArray,
                  dataType: volume.dataType,
                  shape: mipShape,
                  chunkShape: mipChunkShape
                });
                seenLevels.add(levelIndex);
              } catch (mipError) {
                console.warn(`Failed to initialize mip level ${levelIndex} for ${path}`, mipError);
              }
            }
            levels.sort((a, b) => a.level - b.level);
          }

          const streamingSource = new ZarrVolumeSource(levels);
          contexts.set(volume.path, { streamingSource, streamingBaseShape });
        } catch (error) {
          console.warn(`Failed to initialize streaming for ${volume.path}`, error);
        }
      }
    }
  }

  return contexts;
}

export async function attachStreamingContexts(
  manifest: PreprocessedManifest,
  layers: LoadedLayer[],
  contexts: Map<string, StreamingContext>
): Promise<LoadedLayer[]> {
  if (contexts.size === 0) {
    return layers;
  }

  const layerMap = new Map(layers.map((layer) => [layer.key, layer] as const));
  const updated = new Map<string, LoadedLayer>();

  for (const channel of manifest.dataset.channels) {
    for (const layer of channel.layers) {
      const targetLayer = layerMap.get(layer.key);
      if (!targetLayer) {
        continue;
      }
      const nextVolumes = targetLayer.volumes.map((volume, index) => {
        const manifestVolume = layer.volumes[index];
        if (!manifestVolume) {
          return volume;
        }
        const context = contexts.get(manifestVolume.path);
        if (!context) {
          return volume;
        }
        return {
          ...volume,
          streamingSource: context.streamingSource,
          streamingBaseShape: context.streamingBaseShape
        } satisfies LoadedVolume;
      });
      updated.set(layer.key, { ...targetLayer, volumes: nextVolumes });
    }
  }

  return layers.map((layer) => updated.get(layer.key) ?? layer);
}

function parseManifest(bytes: Uint8Array): PreprocessedManifest {
  const manifestText = textDecoder.decode(bytes);
  try {
    const parsed = JSON.parse(manifestText) as PreprocessedManifest & {
      dataset: PreprocessedManifest['dataset'] & { movieMode?: PreprocessedMovieMode };
    };
    if (!parsed.dataset.movieMode) {
      parsed.dataset.movieMode = '3d';
    }
    validateManifest(parsed);
    return parsed;
  } catch (error) {
    throw new Error('The manifest.json file is not valid JSON.');
  }
}

function validateManifest(manifest: PreprocessedManifest): void {
  if (manifest.format !== 'llsm-viewer-preprocessed') {
    throw new Error('Unsupported preprocessed dataset format.');
  }
  if (manifest.version !== 1) {
    throw new Error(`Unsupported preprocessed dataset version: ${manifest.version}`);
  }
  if (manifest.dataset.movieMode !== '2d' && manifest.dataset.movieMode !== '3d') {
    throw new Error('Manifest movie mode is invalid.');
  }
  const { voxelResolution } = manifest.dataset;
  if (voxelResolution !== undefined && voxelResolution !== null) {
    const axes: Array<'x' | 'y' | 'z'> = ['x', 'y', 'z'];
    for (const axis of axes) {
      const value = voxelResolution[axis];
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error('Manifest voxel resolution values are invalid.');
      }
    }
    if (!VOXEL_RESOLUTION_UNITS.includes(voxelResolution.unit)) {
      throw new Error('Manifest voxel resolution unit is invalid.');
    }
    if (typeof voxelResolution.correctAnisotropy !== 'boolean') {
      throw new Error('Manifest voxel resolution metadata is invalid.');
    }
  }
  const { anisotropyCorrection } = manifest.dataset;
  if (anisotropyCorrection !== undefined && anisotropyCorrection !== null) {
    if (typeof anisotropyCorrection !== 'object' || anisotropyCorrection === null) {
      throw new Error('Manifest anisotropy correction metadata is invalid.');
    }
    const { scale } = anisotropyCorrection as { scale?: Partial<Record<'x' | 'y' | 'z', number>> };
    if (!scale) {
      throw new Error('Manifest anisotropy correction metadata is invalid.');
    }
    const axes: Array<'x' | 'y' | 'z'> = ['x', 'y', 'z'];
    for (const axis of axes) {
      const value = scale[axis];
      if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        throw new Error('Manifest anisotropy correction metadata is invalid.');
      }
    }
  }

  const { zarrStore } = manifest.dataset;
  if (zarrStore !== undefined && zarrStore !== null) {
    validateZarrStore(zarrStore);
  }

  for (const channel of manifest.dataset.channels) {
    for (const layer of channel.layers) {
      for (const volume of layer.volumes) {
        const { segmentationLabels } = volume;
        if (!segmentationLabels) {
          continue;
        }

        if (layer.isSegmentation !== true) {
          throw new Error('Segmentation labels are only allowed on segmentation layers.');
        }

        const { path, byteLength, digest, dataType } = segmentationLabels as {
          path?: unknown;
          byteLength?: unknown;
          digest?: unknown;
          dataType?: unknown;
        };

        if (typeof path !== 'string' || path.length === 0) {
          throw new Error('Manifest segmentation label path is invalid.');
        }
        if (typeof byteLength !== 'number' || !Number.isFinite(byteLength) || byteLength < 0) {
          throw new Error('Manifest segmentation label byte length is invalid.');
        }
        if (typeof digest !== 'string' || digest.length === 0) {
          throw new Error('Manifest segmentation label digest is invalid.');
        }
        if (!isVolumeDataType(dataType)) {
          throw new Error('Manifest segmentation label data type is invalid.');
        }
        getBytesPerValue(dataType);
      }
    }
  }
}

function createNormalizedVolume(
  entry: PreprocessedVolumeManifestEntry,
  data: Uint8Array,
  segmentationLabels?: { manifest: NonNullable<PreprocessedVolumeManifestEntry['segmentationLabels']>; data: VolumeData },
  streaming?: StreamingContext
): LoadedVolume {
  if (data.byteLength !== entry.byteLength) {
    throw new Error(
      `Volume size mismatch for ${entry.path}. Expected ${entry.byteLength} bytes, received ${data.byteLength}.`
    );
  }

  let labelArray: Uint32Array | undefined;
  let segmentationLabelDataType: VolumeDataType | undefined;

  if (segmentationLabels) {
    const bytesPerValue = getBytesPerValue(segmentationLabels.manifest.dataType);
    if (segmentationLabels.data.data.byteLength !== segmentationLabels.manifest.byteLength) {
      throw new Error(
        `Segmentation label size mismatch for ${entry.path}. Expected ${segmentationLabels.manifest.byteLength} bytes, received ${segmentationLabels.data.data.byteLength}.`
      );
    }

    if (segmentationLabels.manifest.dataType !== 'uint32') {
      throw new Error('Unsupported segmentation label data type in manifest.');
    }

    if (segmentationLabels.data.data.byteLength % bytesPerValue !== 0) {
      throw new Error('Segmentation label buffer length is not aligned to the declared data type.');
    }

    labelArray = new Uint32Array(
      segmentationLabels.data.data.buffer,
      segmentationLabels.data.data.byteOffset,
      segmentationLabels.data.data.byteLength / Uint32Array.BYTES_PER_ELEMENT
    );
    segmentationLabelDataType = segmentationLabels.manifest.dataType;
  }

  return {
    width: entry.width,
    height: entry.height,
    depth: entry.depth,
    channels: entry.channels,
    dataType: entry.dataType,
    normalized: data,
    min: entry.min,
    max: entry.max,
    segmentationLabels: labelArray,
    segmentationLabelDataType,
    streamingSource: streaming?.streamingSource,
    streamingBaseShape: streaming?.streamingBaseShape
  };
}

function buildImportResult(
  manifest: PreprocessedManifest,
  volumes: Map<string, VolumeData>,
  segmentationLabels: Map<string, VolumeData>,
  streamingContexts: Map<string, StreamingContext>
): ImportPreprocessedDatasetResult {
  const layers: LoadedLayer[] = [];
  const channelSummaries: PreprocessedChannelSummary[] = [];
  let actualVolumeCount = 0;

  for (const channel of manifest.dataset.channels) {
    const layerSummaries: PreprocessedLayerSummary[] = [];
    for (const layer of channel.layers) {
      const normalizedVolumes: LoadedVolume[] = [];
      for (const volume of layer.volumes) {
        const data = volumes.get(volume.path);
        if (!data) {
          throw new Error(`Archive is missing volume data at ${volume.path}.`);
        }
        if (data.digest !== volume.digest) {
          throw new Error(`Digest mismatch for ${volume.path}. The file may be corrupted.`);
        }
        const segmentationManifest = volume.segmentationLabels;
        const segmentationData = segmentationManifest
          ? segmentationLabels.get(segmentationManifest.path)
          : undefined;

        if (segmentationManifest && !segmentationData) {
          throw new Error(`Archive is missing segmentation labels at ${segmentationManifest.path}.`);
        }

        if (segmentationManifest && segmentationData?.digest !== segmentationManifest.digest) {
          throw new Error(`Digest mismatch for ${segmentationManifest.path}. The file may be corrupted.`);
        }

        normalizedVolumes.push(
          createNormalizedVolume(
            volume,
            data.data,
            segmentationManifest && segmentationData
              ? { manifest: segmentationManifest, data: segmentationData }
              : undefined,
            streamingContexts.get(volume.path)
          )
        );
        volumes.delete(volume.path);
        if (segmentationManifest && segmentationData) {
          segmentationLabels.delete(segmentationManifest.path);
        }
        actualVolumeCount += 1;
      }
      layers.push({
        key: layer.key,
        label: layer.label,
        channelId: layer.channelId,
        volumes: normalizedVolumes,
        isSegmentation: layer.isSegmentation
      });

      const firstVolume = layer.volumes[0];
      layerSummaries.push({
        key: layer.key,
        label: layer.label,
        isSegmentation: layer.isSegmentation,
        volumeCount: layer.volumes.length,
        width: firstVolume?.width ?? 0,
        height: firstVolume?.height ?? 0,
        depth: firstVolume?.depth ?? 0,
        channels: firstVolume?.channels ?? 0,
        dataType: firstVolume?.dataType ?? 'uint8',
        min: firstVolume?.min ?? 0,
        max: firstVolume?.max ?? 0
      });
    }

    channelSummaries.push({
      id: channel.id,
      name: channel.name,
      trackEntries: channel.trackEntries,
      layers: layerSummaries
    });
  }

  if (actualVolumeCount !== manifest.dataset.totalVolumeCount) {
    throw new Error('Manifest volume count does not match the archive contents.');
  }

  return {
    manifest,
    layers,
    channelSummaries,
    totalVolumeCount: manifest.dataset.totalVolumeCount
  };
}

export async function importPreprocessedDataset(
  source: ArrayBuffer | Uint8Array | ReadableStream<Uint8Array>,
  options?: ImportPreprocessedDatasetOptions
): Promise<ImportPreprocessedDatasetResult> {
  const { stream, totalBytes } = toReadableStream(source);
  let bytesProcessed = 0;
  const emitMilestone = (milestone: PreprocessedImportMilestone) => {
    options?.onMilestone?.(milestone);
  };
  const reportingStream = createProgressReportingStream(stream, (delta) => {
    bytesProcessed += delta;
    options?.onProgress?.(bytesProcessed);
  });

  const reader = new ZipReader(reportingStream);

  try {
    const entries = await reader.getEntries();
    const fileEntries = new Map<string, FileEntry>();

    for (const entry of entries) {
      if (entry.directory) {
        continue;
      }
      fileEntries.set(entry.filename, entry as FileEntry);
    }

    const manifestEntry = fileEntries.get(MANIFEST_FILE_NAME);
    if (!manifestEntry) {
      throw new Error('The archive does not contain a manifest.json file.');
    }

    const manifestBytes = await manifestEntry.getData(new Uint8ArrayWriter());
    const manifest = parseManifest(manifestBytes);
    fileEntries.delete(MANIFEST_FILE_NAME);
    emitMilestone('scan');

    const zarrStore = await createZarrStore(fileEntries, manifest.dataset.zarrStore);
    const streamingContexts = zarrStore
      ? await buildStreamingContexts(manifest, zarrStore)
      : new Map<string, StreamingContext>();

    const volumes = new Map<string, VolumeData>();
    const segmentationLabelVolumes = new Map<string, VolumeData>();
    const totalVolumeCount = manifest.dataset.totalVolumeCount;
    let volumesDecoded = 0;

    for (const channel of manifest.dataset.channels) {
      for (const layer of channel.layers) {
        for (const volume of layer.volumes) {
          let volumeBytes: Uint8Array | null = null;

          if (zarrStore) {
            volumeBytes = await readZarrVolume(zarrStore, volume.path, volume.byteLength);
          } else {
            const entry = fileEntries.get(volume.path);
            if (!entry) {
              throw new Error(`Archive is missing volume data at ${volume.path}.`);
            }
            volumeBytes = await entry.getData(new Uint8ArrayWriter());
            fileEntries.delete(volume.path);
          }

          const digest = await computeSha256Hex(volumeBytes);
          volumes.set(volume.path, { data: volumeBytes, digest });
          volumesDecoded += 1;
          options?.onVolumeDecoded?.(volumesDecoded, totalVolumeCount);

          if (volume.segmentationLabels) {
            let segmentationBytes: Uint8Array | null = null;

            if (zarrStore) {
              segmentationBytes = await readZarrVolume(
                zarrStore,
                volume.segmentationLabels.path,
                volume.segmentationLabels.byteLength
              );
            } else {
              const segmentationEntry = fileEntries.get(volume.segmentationLabels.path);
              if (!segmentationEntry) {
                throw new Error(`Archive is missing segmentation labels at ${volume.segmentationLabels.path}.`);
              }
              segmentationBytes = await segmentationEntry.getData(new Uint8ArrayWriter());
              fileEntries.delete(volume.segmentationLabels.path);
            }

            const segmentationDigest = await computeSha256Hex(segmentationBytes);
            segmentationLabelVolumes.set(volume.segmentationLabels.path, {
              data: segmentationBytes,
              digest: segmentationDigest
            });
          }
        }
      }
    }

    emitMilestone('level0');

    const result = buildImportResult(manifest, volumes, segmentationLabelVolumes, streamingContexts);
    emitMilestone('mips');
    emitMilestone('finalize');
    return result;
  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error));
  } finally {
    try {
      await reader.close();
    } catch (closeError) {
      console.warn('Failed to close zip reader', closeError);
    }
    if (totalBytes !== null && bytesProcessed < totalBytes) {
      options?.onProgress?.(totalBytes);
    }
  }
}
