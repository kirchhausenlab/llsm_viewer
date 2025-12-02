import { Uint8ArrayWriter, ZipReader } from '@zip.js/zip.js';
import type { FileEntry } from '@zip.js/zip.js';

import type { LoadedLayer } from '../../types/layers';
import type { NormalizedVolume } from '../../volumeProcessing';
import { VOXEL_RESOLUTION_UNITS } from '../../types/voxelResolution';
import { getBytesPerValue, type VolumeDataType } from '../../types/volume';

import { computeSha256Hex } from './hash';
import {
  type ImportPreprocessedDatasetResult,
  type PreprocessedMovieMode,
  type PreprocessedChannelSummary,
  type PreprocessedLayerSummary,
  type PreprocessedManifest,
  type PreprocessedVolumeManifestEntry,
  MANIFEST_FILE_NAME
} from './types';

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

export type ImportPreprocessedDatasetOptions = {
  onProgress?: (bytesProcessed: number) => void;
  onVolumeDecoded?: (volumesDecoded: number, totalVolumeCount: number) => void;
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
  segmentationLabels?: { manifest: NonNullable<PreprocessedVolumeManifestEntry['segmentationLabels']>; data: VolumeData }
): NormalizedVolume {
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
    segmentationLabelDataType
  };
}

function buildImportResult(
  manifest: PreprocessedManifest,
  volumes: Map<string, VolumeData>,
  segmentationLabels: Map<string, VolumeData>
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
              : undefined
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

    const volumes = new Map<string, VolumeData>();
    const segmentationLabelVolumes = new Map<string, VolumeData>();
    const totalVolumeCount = manifest.dataset.totalVolumeCount;
    let volumesDecoded = 0;

    for (const channel of manifest.dataset.channels) {
      for (const layer of channel.layers) {
        for (const volume of layer.volumes) {
          const entry = fileEntries.get(volume.path);
          if (!entry) {
            throw new Error(`Archive is missing volume data at ${volume.path}.`);
          }
          const volumeData = await entry.getData(new Uint8ArrayWriter());
          const digest = await computeSha256Hex(volumeData);
          volumes.set(volume.path, { data: volumeData, digest });
          fileEntries.delete(volume.path);
          volumesDecoded += 1;
          options?.onVolumeDecoded?.(volumesDecoded, totalVolumeCount);

          if (volume.segmentationLabels) {
            const segmentationEntry = fileEntries.get(volume.segmentationLabels.path);
            if (!segmentationEntry) {
              throw new Error(`Archive is missing segmentation labels at ${volume.segmentationLabels.path}.`);
            }
            const segmentationData = await segmentationEntry.getData(new Uint8ArrayWriter());
            const segmentationDigest = await computeSha256Hex(segmentationData);
            segmentationLabelVolumes.set(volume.segmentationLabels.path, {
              data: segmentationData,
              digest: segmentationDigest
            });
            fileEntries.delete(volume.segmentationLabels.path);
          }
        }
      }
    }

    return buildImportResult(manifest, volumes, segmentationLabelVolumes);
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
