import { zipSync } from 'fflate';

import type { NormalizedVolume } from '../../core/volumeProcessing';
import type { VolumeProvider } from '../../core/volumeProvider';
import type { LoadedDatasetLayer } from '../../hooks/dataset';
import type { EditableSegmentationChannel } from '../../types/annotation';
import { encodeGrayscaleTiffStack } from './tiffWriter';
import {
  getEditableTimepointLabels,
  getEditableVoxelCount,
} from './annotation/editableSegmentationState';
import {
  globalCoordForLocalOffset,
  type SparseSegmentationBrickCoord,
} from './preprocessedDataset/sparseSegmentation';

export type ChannelExportSource =
  | {
      kind: 'regular';
      channelId: string;
      name: string;
      layer: LoadedDatasetLayer;
    }
  | {
      kind: 'editable';
      channelId: string;
      name: string;
      channel: EditableSegmentationChannel;
    };

export type ChannelExportResult = {
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
};

export function sanitizeExportBaseName(input: string): string {
  const normalized = input
    .trim()
    .replace(/\.[tT][iI][fF]{1,2}$|\.zip$/i, '')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '_');
  return normalized.length > 0 ? normalized : 'channel-export';
}

function arrayBufferToBytes(buffer: ArrayBuffer): Uint8Array {
  return new Uint8Array(buffer);
}

function encodeIntensityVolume(volume: NormalizedVolume): Uint8Array {
  if (volume.kind !== 'intensity') {
    throw new Error('Expected an intensity volume.');
  }
  if (volume.normalizedDataType === 'uint16') {
    if (!(volume.normalized instanceof Uint16Array)) {
      throw new Error('Expected uint16 normalized intensity data.');
    }
    return arrayBufferToBytes(
      encodeGrayscaleTiffStack({
        width: volume.width,
        height: volume.height,
        depth: volume.depth,
        bitsPerSample: 16,
        data: volume.normalized,
      })
    );
  }
  if (!(volume.normalized instanceof Uint8Array)) {
    throw new Error('Expected uint8 normalized intensity data.');
  }
  return arrayBufferToBytes(
    encodeGrayscaleTiffStack({
      width: volume.width,
      height: volume.height,
      depth: volume.depth,
      bitsPerSample: 8,
      data: volume.normalized,
    })
  );
}

function encodeSegmentationLabels({
  width,
  height,
  depth,
  labels,
}: {
  width: number;
  height: number;
  depth: number;
  labels: Uint32Array;
}): Uint8Array {
  return arrayBufferToBytes(
    encodeGrayscaleTiffStack({
      width,
      height,
      depth,
      bitsPerSample: 32,
      data: labels,
    })
  );
}

async function materializeSparseSegmentationLabels({
  provider,
  layerKey,
  timepoint,
}: {
  provider: VolumeProvider;
  layerKey: string;
  timepoint: number;
}): Promise<{
  width: number;
  height: number;
  depth: number;
  labels: Uint32Array;
}> {
  if (!provider.getSparseSegmentationField || !provider.getSparseSegmentationBrick) {
    throw new Error('Sparse segmentation export is unavailable for this provider.');
  }
  const field = await provider.getSparseSegmentationField(layerKey, timepoint, {
    scaleLevel: 0,
    loadDirectory: true,
    loadLabelMetadata: false,
  });
  const labels = new Uint32Array(field.width * field.height * field.depth);
  const records = field.directory.recordsForTimepoint(timepoint);
  await Promise.all(
    records.map(async (record) => {
      const brick = await provider.getSparseSegmentationBrick!(
        layerKey,
        timepoint,
        0,
        record.brickCoord as SparseSegmentationBrickCoord
      );
      brick.forEachNonzero((offset, label) => {
        const global = globalCoordForLocalOffset(record.brickCoord, offset, field.brickSize);
        if (global.z >= field.depth || global.y >= field.height || global.x >= field.width) {
          return;
        }
        labels[(global.z * field.height + global.y) * field.width + global.x] = label;
      });
    })
  );
  return {
    width: field.width,
    height: field.height,
    depth: field.depth,
    labels,
  };
}

export async function materializeRegularSegmentationSource({
  provider,
  layer,
  timepoint,
}: {
  provider: VolumeProvider;
  layer: LoadedDatasetLayer;
  timepoint: number;
}): Promise<{
  width: number;
  height: number;
  depth: number;
  labels: Uint32Array;
}> {
  if (layer.dataType === 'uint32') {
    return materializeSparseSegmentationLabels({ provider, layerKey: layer.key, timepoint });
  }

  const volume = await provider.getVolume(layer.key, timepoint, { scaleLevel: 0 });
  if (volume.kind !== 'segmentation') {
    throw new Error(`Layer "${layer.label}" is not a segmentation volume.`);
  }
  const labels = new Uint32Array(volume.labels.length);
  for (let index = 0; index < volume.labels.length; index += 1) {
    labels[index] = volume.labels[index] ?? 0;
  }
  return {
    width: volume.width,
    height: volume.height,
    depth: volume.depth,
    labels,
  };
}

async function encodeRegularChannelTimepoint({
  provider,
  source,
  timepoint,
}: {
  provider: VolumeProvider;
  source: Extract<ChannelExportSource, { kind: 'regular' }>;
  timepoint: number;
}): Promise<Uint8Array> {
  if (source.layer.isSegmentation) {
    const materialized = await materializeRegularSegmentationSource({
      provider,
      layer: source.layer,
      timepoint,
    });
    return encodeSegmentationLabels(materialized);
  }
  const volume = await provider.getVolume(source.layer.key, timepoint, { scaleLevel: 0 });
  return encodeIntensityVolume(volume);
}

function encodeEditableChannelTimepoint({
  source,
  timepoint,
}: {
  source: Extract<ChannelExportSource, { kind: 'editable' }>;
  timepoint: number;
}): Uint8Array {
  const labels = getEditableTimepointLabels(source.channel, timepoint);
  const data = labels ? labels.slice() : new Uint32Array(getEditableVoxelCount(source.channel));
  return encodeSegmentationLabels({
    width: source.channel.dimensions.width,
    height: source.channel.dimensions.height,
    depth: source.channel.dimensions.depth,
    labels: data,
  });
}

function zipPathForTimepoint(baseName: string, timepoint: number, total: number): string {
  const width = Math.max(3, String(total).length);
  return `${baseName}/${String(timepoint + 1).padStart(width, '0')}.tif`;
}

export async function exportChannel({
  source,
  provider,
  fileName,
}: {
  source: ChannelExportSource;
  provider: VolumeProvider | null;
  fileName: string;
}): Promise<ChannelExportResult> {
  const baseName = sanitizeExportBaseName(fileName);
  const volumeCount = source.kind === 'regular' ? source.layer.volumeCount : source.channel.volumeCount;
  if (volumeCount <= 0) {
    throw new Error('Selected channel has no volume data.');
  }
  if (source.kind === 'regular' && !provider) {
    throw new Error('Channel export is unavailable until the dataset provider is ready.');
  }

  const encodeTimepoint = async (timepoint: number) => {
    try {
      if (source.kind === 'editable') {
        return encodeEditableChannelTimepoint({ source, timepoint });
      }
      return encodeRegularChannelTimepoint({ provider: provider!, source, timepoint });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Export failed at timepoint ${timepoint + 1}: ${message}`);
    }
  };

  if (volumeCount === 1) {
    return {
      fileName: `${baseName}.tif`,
      mimeType: 'image/tiff',
      bytes: await encodeTimepoint(0),
    };
  }

  const entries: Record<string, Uint8Array> = {};
  for (let timepoint = 0; timepoint < volumeCount; timepoint += 1) {
    entries[zipPathForTimepoint(baseName, timepoint, volumeCount)] = await encodeTimepoint(timepoint);
  }
  return {
    fileName: `${baseName}.zip`,
    mimeType: 'application/zip',
    bytes: zipSync(entries),
  };
}
