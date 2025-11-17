import { BlobWriter, Uint8ArrayReader, ZipWriter } from '@zip.js/zip.js';

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

const textEncoder = new TextEncoder();

const ZIP_COMPRESSION_LEVEL = 9;

function createVolumePath(layer: LoadedLayer, timepoint: number): string {
  return `volumes/${layer.channelId}/${layer.key}/timepoint-${timepoint
    .toString()
    .padStart(4, '0')}.bin`;
}

export async function exportPreprocessedDataset(
  { layers, channels, voxelResolution }: ExportPreprocessedDatasetOptions,
  onChunk?: ExportPreprocessedDatasetChunkHandler
): Promise<ExportPreprocessedDatasetResult> {
  const manifestChannels: PreprocessedChannelManifest[] = [];
  const groupedLayers = new Map<string, LoadedLayer[]>();
  let totalVolumeCount = 0;
  let zipWriter: ZipWriter<unknown> | null = null;
  let blobWriter: BlobWriter | null = null;

  const writable = onChunk
    ? new WritableStream<Uint8Array>({
        write(chunk) {
          onChunk(chunk, false);
        },
        close() {
          onChunk(new Uint8Array(0), true);
        }
      })
    : null;

  if (writable) {
    zipWriter = new ZipWriter(writable, { zip64: true });
  } else {
    blobWriter = new BlobWriter('application/zip');
    zipWriter = new ZipWriter(blobWriter, { zip64: true });
  }

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

          await zipWriter!.add(
            path,
            new Uint8ArrayReader(volumeBytes),
            { level: ZIP_COMPRESSION_LEVEL, zip64: true }
          );

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
    try {
      await zipWriter?.close();
    } catch {
      // Ignore close failures when recovering from an earlier error.
    }
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
      channels: manifestChannels,
      voxelResolution
    }
  };

  try {
    const manifestBytes = textEncoder.encode(JSON.stringify(manifest));
    await zipWriter!.add(
      MANIFEST_FILE_NAME,
      new Uint8ArrayReader(manifestBytes),
      { level: ZIP_COMPRESSION_LEVEL, zip64: true }
    );
    await zipWriter!.close(undefined, { zip64: true });
  } catch (error) {
    try {
      await zipWriter!.close();
    } catch {
      // Ignore close failures when handling the primary error.
    }
    throw error instanceof Error ? error : new Error(String(error));
  }

  if (blobWriter) {
    const blob = await blobWriter.getData();
    return { blob, manifest };
  }

  return { manifest };
}
