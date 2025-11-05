import { AsyncUnzipInflate, Unzip } from 'fflate';

import type { LoadedLayer } from '../../types/layers';
import type { NormalizedVolume } from '../../volumeProcessing';

import { computeSha256Hex } from './hash';
import {
  type ImportPreprocessedDatasetResult,
  type PreprocessedChannelSummary,
  type PreprocessedLayerSummary,
  type PreprocessedManifest,
  type PreprocessedVolumeManifestEntry,
  MANIFEST_FILE_NAME
} from './types';

const textDecoder = new TextDecoder();

export type ImportPreprocessedDatasetOptions = {
  onProgress?: (bytesProcessed: number) => void;
};

type VolumeData = {
  data: Uint8Array;
  digest: string;
};

type ChunkQueueEntry = {
  chunk: Uint8Array;
  byteLength: number;
};

function isReadableStream(value: unknown): value is ReadableStream<Uint8Array> {
  return typeof value === 'object' && value !== null && typeof (value as ReadableStream).getReader === 'function';
}

function toAsyncChunkSource(
  source: ArrayBuffer | Uint8Array | ReadableStream<Uint8Array>
): AsyncIterable<Uint8Array> {
  if (isReadableStream(source)) {
    return streamToAsyncIterable(source);
  }
  return arrayLikeToAsyncIterable(source);
}

function arrayLikeToAsyncIterable(data: ArrayBuffer | Uint8Array): AsyncIterable<Uint8Array> {
  const view = data instanceof Uint8Array ? data : new Uint8Array(data);
  return {
    async *[Symbol.asyncIterator]() {
      yield view;
    }
  };
}

async function* streamToAsyncIterable(stream: ReadableStream<Uint8Array>): AsyncIterable<Uint8Array> {
  const reader = stream.getReader();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      if (value) {
        yield value;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function concatChunks(chunks: ChunkQueueEntry[], totalLength: number): Uint8Array {
  if (totalLength === 0) {
    return new Uint8Array(0);
  }
  if (chunks.length === 1 && chunks[0].byteLength === totalLength) {
    return chunks[0].chunk;
  }
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const entry of chunks) {
    result.set(entry.chunk, offset);
    offset += entry.byteLength;
  }
  return result;
}

function parseManifest(bytes: Uint8Array): PreprocessedManifest {
  const manifestText = textDecoder.decode(bytes);
  try {
    const parsed = JSON.parse(manifestText) as PreprocessedManifest;
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
}

function createNormalizedVolume(
  entry: PreprocessedVolumeManifestEntry,
  data: Uint8Array
): NormalizedVolume {
  if (data.byteLength !== entry.byteLength) {
    throw new Error(
      `Volume size mismatch for ${entry.path}. Expected ${entry.byteLength} bytes, received ${data.byteLength}.`
    );
  }

  return {
    width: entry.width,
    height: entry.height,
    depth: entry.depth,
    channels: entry.channels,
    dataType: entry.dataType,
    normalized: data,
    min: entry.min,
    max: entry.max
  };
}

function buildImportResult(
  manifest: PreprocessedManifest,
  volumes: Map<string, VolumeData>
): ImportPreprocessedDatasetResult {
  const layers: LoadedLayer[] = [];
  const channelSummaries: PreprocessedChannelSummary[] = [];
  let actualVolumeCount = 0;

  for (const channel of manifest.dataset.channels) {
    const layerSummaries: PreprocessedLayerSummary[] = [];
    for (const layer of channel.layers) {
      const normalizedVolumes: NormalizedVolume[] = [];
      for (const volume of layer.volumes) {
        const data = volumes.get(volume.path);
        if (!data) {
          throw new Error(`Archive is missing volume data at ${volume.path}.`);
        }
        if (data.digest !== volume.digest) {
          throw new Error(`Digest mismatch for ${volume.path}. The file may be corrupted.`);
        }
        normalizedVolumes.push(createNormalizedVolume(volume, data.data));
        volumes.delete(volume.path);
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
  const chunkSource = toAsyncChunkSource(source);
  const unzip = new Unzip();
  unzip.register(AsyncUnzipInflate);

  let manifest: PreprocessedManifest | null = null;
  const volumeBuffers = new Map<string, VolumeData>();
  const pendingEntries: Promise<void>[] = [];

  unzip.onfile = (file) => {
    if (!file || file.name.endsWith('/')) {
      return;
    }

    const entryPromise = new Promise<void>((resolveEntry, rejectEntry) => {
      const collected: ChunkQueueEntry[] = [];
      let totalLength = 0;

      file.ondata = (err, chunk, final) => {
        if (err) {
          rejectEntry(err instanceof Error ? err : new Error(String(err)));
          return;
        }
        if (chunk) {
          const owned =
            chunk.byteOffset === 0 && chunk.byteLength === chunk.buffer.byteLength
              ? chunk
              : chunk.slice();
          collected.push({ chunk: owned, byteLength: owned.byteLength });
          totalLength += owned.byteLength;
        }
        if (final) {
          try {
            const data = concatChunks(collected, totalLength);
            if (file.name === MANIFEST_FILE_NAME) {
              manifest = parseManifest(data);
            } else {
              const digestPromise = computeSha256Hex(data);
              void digestPromise.then((digest) => {
                collected.length = 0;
                volumeBuffers.set(file.name, { data, digest });
                resolveEntry();
              }, rejectEntry);
              return;
            }
            collected.length = 0;
            resolveEntry();
          } catch (error) {
            rejectEntry(error instanceof Error ? error : new Error(String(error)));
          }
        }
      };

      try {
        file.start();
      } catch (error) {
        rejectEntry(error instanceof Error ? error : new Error(String(error)));
      }
    });

    pendingEntries.push(entryPromise);
  };

  let bytesProcessed = 0;

  try {
    for await (const chunk of chunkSource) {
      bytesProcessed += chunk.byteLength;
      if (options?.onProgress) {
        options.onProgress(bytesProcessed);
      }
      unzip.push(chunk, false);
    }
    unzip.push(new Uint8Array(0), true);
  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error));
  }

  await Promise.all(pendingEntries);

  if (!manifest) {
    throw new Error('The archive does not contain a manifest.json file.');
  }

  return buildImportResult(manifest, volumeBuffers);
}
