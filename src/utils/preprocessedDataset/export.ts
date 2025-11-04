import { Zip, ZipDeflate } from 'fflate';

import type { LoadedLayer } from '../../types/layers';

import {
  type ExportPreprocessedDatasetChunkHandler,
  type ExportPreprocessedDatasetOptions,
  type ExportPreprocessedDatasetResult,
  type PreprocessedChannelManifest,
  type PreprocessedLayerManifestEntry,
  type PreprocessedManifest,
  type PreprocessedVolumeManifestEntry,
  MANIFEST_FILE_NAME
} from './types';
import { computeSha256Hex } from './hash';
import { ensureArrayBuffer } from '../buffer';

const textEncoder = new TextEncoder();

const ZIP_INPUT_CHUNK_SIZE = 8 * 1024 * 1024; // 8 MiB per push keeps memory bounded for large volumes.

function createVolumePath(layer: LoadedLayer, timepoint: number): string {
  return `volumes/${layer.channelId}/${layer.key}/timepoint-${timepoint
    .toString()
    .padStart(4, '0')}.bin`;
}

export async function exportPreprocessedDataset(
  { layers, channels }: ExportPreprocessedDatasetOptions,
  onChunk?: ExportPreprocessedDatasetChunkHandler
): Promise<ExportPreprocessedDatasetResult> {
  const manifestChannels: PreprocessedChannelManifest[] = [];
  const groupedLayers = new Map<string, LoadedLayer[]>();
  let totalVolumeCount = 0;

  const zipChunks: BlobPart[] | null = onChunk ? null : [];
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
        zipChunks!.push(ensureArrayBuffer(chunk));
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

          const digest = await computeSha256Hex(volumeBytes);

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
            digest
          };

          manifestVolumes.push(manifestEntry);

          const deflater = new ZipDeflate(path, { level: 9 });
          zip.add(deflater);
          // NormalizedVolume.normalized is treated as immutable, so sharing the underlying buffer is safe.
          if (volumeBytes.byteLength === 0) {
            deflater.push(volumeBytes, true);
          } else {
            for (
              let offset = 0;
              offset < volumeBytes.byteLength;
              offset += ZIP_INPUT_CHUNK_SIZE
            ) {
              const end = Math.min(offset + ZIP_INPUT_CHUNK_SIZE, volumeBytes.byteLength);
              const chunk = volumeBytes.subarray(offset, end);
              deflater.push(chunk, end === volumeBytes.byteLength);
            }
          }

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
