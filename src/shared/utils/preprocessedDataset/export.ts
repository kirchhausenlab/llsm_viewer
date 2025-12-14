import { BlobWriter, Uint8ArrayReader, ZipWriter } from '@zip.js/zip.js';

import type { LoadedLayer } from '../../../types/layers';

import {
  type AnisotropyCorrectionMetadata,
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
import { computeAnisotropyScale } from '../anisotropyCorrection';

const textEncoder = new TextEncoder();

const ZIP_COMPRESSION_LEVEL = 9;
const ZARR_STORE_ROOT = 'zarr';
const ZARR_SINGLE_CHUNK_KEY = '0.0.0.0';

type ZarrEntry = { path: string; data: Uint8Array };

function normalizeZarrPath(path: string): string {
  return path.startsWith('/') ? path.slice(1) : path;
}

function dtypeToZarrV2(data: Uint8Array | Uint32Array): string {
  if (data instanceof Uint8Array) return '|u1';
  if (data instanceof Uint32Array) return '<u4';
  return '|u1';
}

function dtypeToZarrV3(data: Uint8Array | Uint32Array): string {
  if (data instanceof Uint8Array) return 'uint8';
  if (data instanceof Uint32Array) return 'uint32';
  return 'uint8';
}

function writeZarrArray(
  entries: ZarrEntry[],
  root: string,
  arrayPath: string,
  data: Uint8Array | Uint32Array,
  metadata: { min: number; max: number; shape: [number, number, number, number] }
) {
  const normalized = normalizeZarrPath(arrayPath);
  const basePath = root ? `${root}/${normalized}` : normalized;
  const dtypeV2 = dtypeToZarrV2(data);
  const dtypeV3 = dtypeToZarrV3(data);
  const shape = metadata.shape;

  entries.push({
    path: `${basePath}/.zarray`,
    data: textEncoder.encode(
      JSON.stringify({
        zarr_format: 2,
        shape: shape,
        chunks: shape,
        dtype: dtypeV2,
        order: 'C',
        compressor: null,
        filters: null,
        fill_value: 0
      })
    )
  });

  entries.push({
    path: `${basePath}/.zattrs`,
    data: textEncoder.encode(JSON.stringify({ min: metadata.min, max: metadata.max }))
  });

  entries.push({
    path: `${basePath}/zarr.json`,
    data: textEncoder.encode(
      JSON.stringify({
        zarr_format: 3,
        node_type: 'array',
        shape,
        data_type: dtypeV3,
        chunk_grid: { name: 'regular', configuration: { chunk_shape: shape } },
        chunk_key_encoding: { name: 'default', configuration: { separator: '.' } },
        codecs: [],
        fill_value: 0,
        attributes: { min: metadata.min, max: metadata.max }
      })
    )
  });

  entries.push({
    path: `${basePath}/${ZARR_SINGLE_CHUNK_KEY}`,
    data: data instanceof Uint8Array ? data : new Uint8Array(data.buffer)
  });
}

function createVolumePath(layer: LoadedLayer, timepoint: number): string {
  return `volumes/${layer.channelId}/${layer.key}/timepoint-${timepoint
    .toString()
    .padStart(4, '0')}.bin`;
}

function createSegmentationLabelPath(layer: LoadedLayer, timepoint: number): string {
  return `volumes/${layer.channelId}/${layer.key}/timepoint-${timepoint
    .toString()
    .padStart(4, '0')}.labels`;
}

export async function exportPreprocessedDataset(
  { layers, channels, voxelResolution, movieMode }: ExportPreprocessedDatasetOptions,
  onChunk?: ExportPreprocessedDatasetChunkHandler
): Promise<ExportPreprocessedDatasetResult> {
  const manifestChannels: PreprocessedChannelManifest[] = [];
  const groupedLayers = new Map<string, LoadedLayer[]>();
  let totalVolumeCount = 0;
  let zipWriter: ZipWriter<unknown> | null = null;
  let blobWriter: BlobWriter | null = null;
  const zarrEntries: ZarrEntry[] = [];
  const anisotropyScale = computeAnisotropyScale(voxelResolution);
  const anisotropyCorrection: AnisotropyCorrectionMetadata | null = anisotropyScale
    ? { scale: anisotropyScale }
    : null;
  const rootAttributes = {
    movieMode,
    voxelResolution,
    anisotropyCorrection
  };
  const requiredRootEntries = new Set<string>([
    `${ZARR_STORE_ROOT}/.zattrs`,
    `${ZARR_STORE_ROOT}/zarr.json`,
    `${ZARR_STORE_ROOT}/.zgroup`
  ]);
  const addedRootEntries = new Set<string>();

  const ensureRootEntriesPersisted = () => {
    const missing = [...requiredRootEntries].filter((path) => !addedRootEntries.has(path));
    if (missing.length > 0) {
      throw new Error('Export incomplete—root metadata missing');
    }
  };

  const markRootEntry = (path: string) => {
    if (requiredRootEntries.has(path)) {
      addedRootEntries.add(path);
    }
  };

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
    for (const entry of [
      { path: `${ZARR_STORE_ROOT}/.zgroup`, data: textEncoder.encode(JSON.stringify({ zarr_format: 2 })) },
      { path: `${ZARR_STORE_ROOT}/.zattrs`, data: textEncoder.encode(JSON.stringify(rootAttributes)) },
      {
        path: `${ZARR_STORE_ROOT}/zarr.json`,
        data: textEncoder.encode(
          JSON.stringify({ zarr_format: 3, node_type: 'group', attributes: rootAttributes })
        )
      }
    ]) {
      await zipWriter!.add(entry.path, new Uint8ArrayReader(entry.data), {
        level: ZIP_COMPRESSION_LEVEL,
        zip64: true
      });
      markRootEntry(entry.path);
    }

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

          const zarrShape: [number, number, number, number] = [
            volume.channels,
            volume.depth,
            volume.height,
            volume.width
          ];
          writeZarrArray(zarrEntries, ZARR_STORE_ROOT, path, volumeBytes, {
            min: volume.min,
            max: volume.max,
            shape: zarrShape
          });

          let segmentationLabelsManifest: PreprocessedVolumeManifestEntry['segmentationLabels'];
          if (layer.isSegmentation && volume.segmentationLabels) {
            const labelPath = createSegmentationLabelPath(layer, index);
            let labelBytes = new Uint8Array(
              volume.segmentationLabels.buffer,
              volume.segmentationLabels.byteOffset,
              volume.segmentationLabels.byteLength
            );

            if (labelBytes.byteOffset !== 0 || labelBytes.byteLength !== labelBytes.buffer.byteLength) {
              labelBytes = labelBytes.slice();
            }

            const labelDigest = await computeSha256Hex(labelBytes);

            segmentationLabelsManifest = {
              path: labelPath,
              byteLength: labelBytes.byteLength,
              digest: labelDigest,
              dataType: 'uint32'
            };

            const labelArrayView =
              labelBytes.byteOffset === 0 && labelBytes.byteLength === labelBytes.buffer.byteLength
                ? new Uint32Array(labelBytes.buffer)
                : new Uint32Array(labelBytes.slice().buffer);
            writeZarrArray(zarrEntries, ZARR_STORE_ROOT, labelPath, labelArrayView, {
              min: volume.min,
              max: volume.max,
              shape: zarrShape
            });

            await zipWriter!.add(labelPath, new Uint8ArrayReader(labelBytes), {
              level: ZIP_COMPRESSION_LEVEL,
              zip64: true
            });

            labelBytes = new Uint8Array(0);
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
            digest,
            ...(segmentationLabelsManifest ? { segmentationLabels: segmentationLabelsManifest } : {})
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
    if (requiredRootEntries.size !== addedRootEntries.size) {
      throw new Error('Export incomplete—root metadata missing');
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
      movieMode,
      totalVolumeCount,
      channels: manifestChannels,
      voxelResolution,
      anisotropyCorrection,
      zarrStore: { source: 'archive', root: ZARR_STORE_ROOT }
    }
  };

  try {
    for (const entry of zarrEntries) {
      await zipWriter!.add(entry.path, new Uint8ArrayReader(entry.data), {
        level: ZIP_COMPRESSION_LEVEL,
        zip64: true
      });
    }

    const manifestBytes = textEncoder.encode(JSON.stringify(manifest));
    await zipWriter!.add(
      MANIFEST_FILE_NAME,
      new Uint8ArrayReader(manifestBytes),
      { level: ZIP_COMPRESSION_LEVEL, zip64: true }
    );
    ensureRootEntriesPersisted();
    await zipWriter!.close(undefined, { zip64: true });
  } catch (error) {
    try {
      await zipWriter!.close();
    } catch {
      // Ignore close failures when handling the primary error.
    }
    if (requiredRootEntries.size !== addedRootEntries.size) {
      throw new Error('Export incomplete—root metadata missing');
    }
    throw error instanceof Error ? error : new Error(String(error));
  }

  if (blobWriter) {
    const blob = await blobWriter.getData();
    return { blob, manifest };
  }

  return { manifest };
}
