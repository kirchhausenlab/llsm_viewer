import { Zip, ZipDeflate, unzipSync } from 'fflate';
import type { LoadedLayer } from '../types/layers';
import type { NormalizedVolume } from '../volumeProcessing';
import type { VolumeDataType } from '../types/volume';

export type ChannelExportMetadata = {
  id: string;
  name: string;
  trackEntries: string[][];
};

export type PreprocessedVolumeManifestEntry = {
  path: string;
  timepoint: number;
  width: number;
  height: number;
  depth: number;
  channels: number;
  dataType: VolumeDataType;
  min: number;
  max: number;
  byteLength: number;
  digest: string;
};

export type PreprocessedLayerManifestEntry = {
  key: string;
  label: string;
  channelId: string;
  isSegmentation: boolean;
  volumes: PreprocessedVolumeManifestEntry[];
};

export type PreprocessedChannelManifest = {
  id: string;
  name: string;
  layers: PreprocessedLayerManifestEntry[];
  trackEntries: string[][];
};

export type PreprocessedManifest = {
  format: 'llsm-viewer-preprocessed';
  version: 1;
  generatedAt: string;
  dataset: {
    totalVolumeCount: number;
    channels: PreprocessedChannelManifest[];
  };
};

export type ExportPreprocessedDatasetOptions = {
  layers: LoadedLayer[];
  channels: ChannelExportMetadata[];
};

export type ExportPreprocessedDatasetChunkHandler = (chunk: Uint8Array, final: boolean) => void;

export type ExportPreprocessedDatasetResult = {
  blob?: Blob;
  manifest: PreprocessedManifest;
};

export type PreprocessedLayerSummary = {
  key: string;
  label: string;
  isSegmentation: boolean;
  volumeCount: number;
  width: number;
  height: number;
  depth: number;
  channels: number;
  dataType: VolumeDataType;
  min: number;
  max: number;
};

export type PreprocessedChannelSummary = {
  id: string;
  name: string;
  trackEntries: string[][];
  layers: PreprocessedLayerSummary[];
};

export type ImportPreprocessedDatasetResult = {
  manifest: PreprocessedManifest;
  layers: LoadedLayer[];
  channelSummaries: PreprocessedChannelSummary[];
  totalVolumeCount: number;
};

const MANIFEST_FILE_NAME = 'manifest.json';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function toUint8Array(data: ArrayBuffer | Uint8Array): Uint8Array {
  return data instanceof Uint8Array ? data : new Uint8Array(data);
}

async function computeSha256Hex(data: Uint8Array): Promise<string> {
  const subtle = typeof crypto !== 'undefined' ? crypto.subtle : undefined;
  if (!subtle) {
    throw new Error('Web Crypto API is not available in this environment.');
  }
  const digest = await subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(digest);
  return Array.from(bytes)
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

function createVolumePath(layer: LoadedLayer, timepoint: number): string {
  return `volumes/${layer.channelId}/${layer.key}/timepoint-${timepoint.toString().padStart(4, '0')}.bin`;
}

export async function exportPreprocessedDataset(
  { layers, channels }: ExportPreprocessedDatasetOptions,
  onChunk?: ExportPreprocessedDatasetChunkHandler
): Promise<ExportPreprocessedDatasetResult> {
  const manifestChannels: PreprocessedChannelManifest[] = [];
  const groupedLayers = new Map<string, LoadedLayer[]>();
  let totalVolumeCount = 0;

  const zipChunks: Uint8Array[] | null = onChunk ? null : [];
  let isZipComplete = false;

  let resolveZip!: () => void;
  let rejectZip!: (error: Error) => void;
  const zipCompleted = new Promise<void>((resolve, reject) => {
    resolveZip = resolve;
    rejectZip = reject;
  });

  const zip = new Zip((err, chunk, final) => {
    if (err) {
      if (!isZipComplete) {
        isZipComplete = true;
        rejectZip(err instanceof Error ? err : new Error(String(err)));
      }
      return;
    }

    if (chunk) {
      if (onChunk) {
        try {
          onChunk(chunk, final);
        } catch (error) {
          if (!isZipComplete) {
            isZipComplete = true;
            rejectZip(error instanceof Error ? error : new Error(String(error)));
          }
          zip.terminate();
          return;
        }
      } else {
        zipChunks!.push(chunk);
      }
    }

    if (final && !isZipComplete) {
      isZipComplete = true;
      resolveZip();
    }
  });

  for (const layer of layers) {
    const bucket = groupedLayers.get(layer.channelId);
    if (bucket) {
      bucket.push(layer);
    } else {
      groupedLayers.set(layer.channelId, [layer]);
    }
  }

  try {
    for (const channel of channels) {
      const associatedLayers = groupedLayers.get(channel.id) ?? [];
      const manifestLayers: PreprocessedLayerManifestEntry[] = [];

      for (const layer of associatedLayers) {
        const manifestVolumes: PreprocessedVolumeManifestEntry[] = [];
        for (let index = 0; index < layer.volumes.length; index += 1) {
          const volume = layer.volumes[index];
          const path = createVolumePath(layer, index);
          let volumeBytes = volume.normalized;
          if (
            volumeBytes.byteOffset !== 0 ||
            volumeBytes.byteLength !== volumeBytes.buffer.byteLength
          ) {
            volumeBytes = volumeBytes.slice();
          }

          const manifestEntry: PreprocessedVolumeManifestEntry = {
            path,
            timepoint: index,
            width: volume.width,
            height: volume.height,
            depth: volume.depth,
            channels: volume.channels,
            dataType: volume.dataType,
            min: volume.min,
            max: volume.max,
            byteLength: volumeBytes.byteLength,
            digest: await computeSha256Hex(volumeBytes)
          };

          manifestVolumes.push(manifestEntry);

          const deflater = new ZipDeflate(path, { level: 9 });
          zip.add(deflater);
          // NormalizedVolume.normalized is treated as immutable, so sharing the underlying buffer is safe.
          deflater.push(volumeBytes, true);

          // Release the reference once the chunk has been queued
          volumeBytes = new Uint8Array(0);
        }
        manifestLayers.push({
          key: layer.key,
          label: layer.label,
          channelId: layer.channelId,
          isSegmentation: layer.isSegmentation,
          volumes: manifestVolumes
        });
      }

      manifestChannels.push({
        id: channel.id,
        name: channel.name,
        layers: manifestLayers,
        trackEntries: channel.trackEntries
      });
    }
  } catch (error) {
    zip.terminate();
    throw error instanceof Error ? error : new Error(String(error));
  }

  for (const channel of manifestChannels) {
    for (const layer of channel.layers) {
      for (const volume of layer.volumes) {
        if (!volume.digest) {
          throw new Error(`Failed to compute digest for ${volume.path}`);
        }
        totalVolumeCount += 1;
      }
    }
  }

  const manifest: PreprocessedManifest = {
    format: 'llsm-viewer-preprocessed',
    version: 1,
    generatedAt: new Date().toISOString(),
    dataset: {
      totalVolumeCount,
      channels: manifestChannels
    }
  };

  try {
    let manifestBytes = textEncoder.encode(JSON.stringify(manifest));
    const manifestEntry = new ZipDeflate(MANIFEST_FILE_NAME, { level: 9 });
    zip.add(manifestEntry);
    manifestEntry.push(manifestBytes, true);
    manifestBytes = new Uint8Array(0);

    zip.end();
    await zipCompleted;
  } catch (error) {
    zip.terminate();
    throw error instanceof Error ? error : new Error(String(error));
  }

  if (zipChunks) {
    const blob = new Blob(zipChunks, { type: 'application/zip' });
    return { blob, manifest };
  }

  return { manifest };
}

function validateManifest(manifest: PreprocessedManifest): void {
  if (manifest.format !== 'llsm-viewer-preprocessed') {
    throw new Error('Unsupported preprocessed dataset format.');
  }
  if (manifest.version !== 1) {
    throw new Error(`Unsupported preprocessed dataset version: ${manifest.version}`);
  }
}

function createNormalizedVolume(entry: PreprocessedVolumeManifestEntry, data: Uint8Array): NormalizedVolume {
  if (data.byteLength !== entry.byteLength) {
    throw new Error(`Volume size mismatch for ${entry.path}. Expected ${entry.byteLength} bytes, received ${data.byteLength}.`);
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

export async function importPreprocessedDataset(
  source: ArrayBuffer | Uint8Array
): Promise<ImportPreprocessedDatasetResult> {
  const bytes = toUint8Array(source);
  const files = unzipSync(bytes);
  const manifestRaw = files[MANIFEST_FILE_NAME];
  if (!manifestRaw) {
    throw new Error('The archive does not contain a manifest.json file.');
  }

  const manifestText = textDecoder.decode(manifestRaw);
  let parsed: PreprocessedManifest;
  try {
    parsed = JSON.parse(manifestText) as PreprocessedManifest;
  } catch (error) {
    throw new Error('The manifest.json file is not valid JSON.');
  }

  validateManifest(parsed);

  const layers: LoadedLayer[] = [];
  const channelSummaries: PreprocessedChannelSummary[] = [];
  let actualVolumeCount = 0;

  for (const channel of parsed.dataset.channels) {
    const layerSummaries: PreprocessedLayerSummary[] = [];
    for (const layer of channel.layers) {
      const normalizedVolumes: NormalizedVolume[] = [];
      for (const volume of layer.volumes) {
        const entryData = files[volume.path];
        if (!entryData) {
          throw new Error(`Archive is missing volume data at ${volume.path}.`);
        }
        const digest = await computeSha256Hex(entryData);
        if (digest !== volume.digest) {
          throw new Error(`Digest mismatch for ${volume.path}. The file may be corrupted.`);
        }
        const owned = new Uint8Array(entryData); // copy to detach from fflate internal buffer
        normalizedVolumes.push(createNormalizedVolume(volume, owned));
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

  if (actualVolumeCount !== parsed.dataset.totalVolumeCount) {
    throw new Error('Manifest volume count does not match the archive contents.');
  }

  return {
    manifest: parsed,
    layers,
    channelSummaries,
    totalVolumeCount: parsed.dataset.totalVolumeCount
  };
}
