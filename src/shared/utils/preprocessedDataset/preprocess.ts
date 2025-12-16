import { fromBlob } from 'geotiff';

import type { NormalizedVolume, NormalizationParameters } from '../../../core/volumeProcessing';
import {
  colorizeSegmentationVolume,
  computeNormalizationParameters,
  normalizeVolume
} from '../../../core/volumeProcessing';
import type { PreprocessedStorage } from '../../storage/preprocessedStorage';
import { createSegmentationSeed, sortVolumeFiles } from '../appHelpers';
import { computeAnisotropyScale } from '../anisotropyCorrection';
import { computeSha256Hex } from './hash';
import type { VolumePayload, VolumeTypedArray } from '../../../types/volume';
import { createVolumeTypedArray } from '../../../types/volume';

import type {
  ChannelExportMetadata,
  PreprocessedChannelManifest,
  PreprocessedChannelSummary,
  PreprocessedLayerManifestEntry,
  PreprocessedLayerSummary,
  PreprocessedManifest,
  PreprocessedMovieMode,
  PreprocessedVolumeManifestEntry
} from './types';

export type PreprocessLayerSource = {
  channelId: string;
  channelLabel: string;
  key: string;
  label: string;
  files: File[];
  isSegmentation: boolean;
};

export type PreprocessDatasetProgress =
  | {
      stage: 'rep-stats';
      layerKey: string;
    }
  | {
      stage: 'write-volumes';
      processedVolumes: number;
      totalVolumes: number;
      layerKey: string;
      timepoint: number;
    }
  | {
      stage: 'finalize-manifest';
    };

export type PreprocessDatasetToStorageOptions = {
  layers: PreprocessLayerSource[];
  channels: ChannelExportMetadata[];
  voxelResolution: NonNullable<PreprocessedManifest['dataset']['voxelResolution']>;
  movieMode: PreprocessedMovieMode;
  storage: PreprocessedStorage;
  signal?: AbortSignal;
  onProgress?: (progress: PreprocessDatasetProgress) => void;
};

function throwIfAborted(signal: AbortSignal | undefined) {
  if (signal?.aborted) {
    const reason = signal.reason;
    if (reason instanceof Error) {
      throw reason;
    }
    throw new DOMException('Aborted', 'AbortError');
  }
}

function createVolumePath(channelId: string, layerKey: string, timepoint: number): string {
  return `volumes/${channelId}/${layerKey}/timepoint-${timepoint.toString().padStart(4, '0')}.bin`;
}

function createSegmentationLabelPath(channelId: string, layerKey: string, timepoint: number): string {
  return `volumes/${channelId}/${layerKey}/timepoint-${timepoint.toString().padStart(4, '0')}.labels`;
}

function computeSliceMinMax(slice: VolumeTypedArray): { min: number; max: number } {
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

  if (!Number.isFinite(min) || min === Number.POSITIVE_INFINITY) {
    min = 0;
  }
  if (!Number.isFinite(max) || max === Number.NEGATIVE_INFINITY) {
    max = min === 0 ? 1 : min + 1;
  }
  if (min === max) {
    max = min + 1;
  }

  return { min, max };
}

function extract2dSlice(volume: VolumePayload, sliceIndex: number): VolumePayload {
  const sliceLength = volume.width * volume.height * volume.channels;
  if (sliceLength <= 0 || volume.depth <= 0) {
    throw new Error('Received invalid volume dimensions while extracting slice.');
  }
  if (sliceIndex < 0 || sliceIndex >= volume.depth) {
    throw new Error(`Slice index ${sliceIndex} is out of bounds for depth ${volume.depth}.`);
  }

  const source = createVolumeTypedArray(volume.dataType, volume.data);
  const start = sliceIndex * sliceLength;
  const end = start + sliceLength;
  const slice = source.slice(start, end);
  const { min, max } = computeSliceMinMax(slice);

  return {
    width: volume.width,
    height: volume.height,
    depth: 1,
    channels: volume.channels,
    dataType: volume.dataType,
    voxelSize: volume.voxelSize,
    min,
    max,
    data: slice.buffer
  };
}

function resolve2dFileSliceForTimepoint(
  files: File[],
  timepoint: number,
  depths: number[]
): { fileIndex: number; sliceIndex: number } {
  let remaining = timepoint;
  for (let index = 0; index < depths.length; index += 1) {
    const depth = depths[index] ?? 0;
    if (remaining < depth) {
      return { fileIndex: index, sliceIndex: remaining };
    }
    remaining -= depth;
  }
  throw new Error(`Timepoint ${timepoint} is out of bounds for the provided 2D stacks.`);
}

type LoadVolumesFromFiles = (files: File[]) => Promise<VolumePayload[]>;

async function loadVolumeFor3dTimepoint(
  file: File,
  loader: LoadVolumesFromFiles,
  signal?: AbortSignal
): Promise<VolumePayload> {
  throwIfAborted(signal);
  const [volume] = await loader([file]);
  if (!volume) {
    throw new Error(`Failed to decode volume from file "${file.name}".`);
  }
  return volume;
}

function buildLayerSummaryFromManifest(layer: PreprocessedLayerManifestEntry): PreprocessedLayerSummary {
  const firstVolume = layer.volumes[0];
  return {
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
  };
}

function buildChannelSummariesFromManifest(manifest: PreprocessedManifest): PreprocessedChannelSummary[] {
  return manifest.dataset.channels.map((channel) => ({
    id: channel.id,
    name: channel.name,
    trackEntries: channel.trackEntries,
    layers: channel.layers.map(buildLayerSummaryFromManifest)
  }));
}

async function buildVolumeManifestEntry({
  channelId,
  layerKey,
  timepoint,
  volume,
  storage,
  signal
}: {
  channelId: string;
  layerKey: string;
  timepoint: number;
  volume: NormalizedVolume;
  storage: PreprocessedStorage;
  signal?: AbortSignal;
}): Promise<PreprocessedVolumeManifestEntry> {
  throwIfAborted(signal);
  const path = createVolumePath(channelId, layerKey, timepoint);
  const volumeBytes = volume.normalized;
  const digest = await computeSha256Hex(volumeBytes);
  await storage.writeFile(path, volumeBytes);

  let segmentationLabelsManifest: PreprocessedVolumeManifestEntry['segmentationLabels'];

  if (volume.segmentationLabels) {
    const labelPath = createSegmentationLabelPath(channelId, layerKey, timepoint);
    const labelsView = new Uint8Array(
      volume.segmentationLabels.buffer,
      volume.segmentationLabels.byteOffset,
      volume.segmentationLabels.byteLength
    );
    const labelDigest = await computeSha256Hex(labelsView);
    await storage.writeFile(labelPath, labelsView);
    segmentationLabelsManifest = {
      path: labelPath,
      byteLength: labelsView.byteLength,
      digest: labelDigest,
      dataType: 'uint32'
    };
  }

  return {
    path,
    timepoint,
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
}

function computeRepresentativeNormalization(volume: VolumePayload): NormalizationParameters {
  return computeNormalizationParameters([volume]);
}

export async function preprocessDatasetToStorage({
  layers,
  channels,
  voxelResolution,
  movieMode,
  storage,
  signal,
  onProgress
}: PreprocessDatasetToStorageOptions): Promise<{
  manifest: PreprocessedManifest;
  channelSummaries: PreprocessedChannelSummary[];
  totalVolumeCount: number;
}> {
  const sortedLayerSources = layers
    .map((layer) => ({ ...layer, files: sortVolumeFiles(layer.files) }))
    .filter((layer) => layer.files.length > 0);

  if (sortedLayerSources.length === 0) {
    throw new Error('No TIFF files were provided for preprocessing.');
  }

  throwIfAborted(signal);

  const { loadVolumesFromFiles } = await import('../../../loaders/volumeLoader');

  const layerTimepointCounts: number[] = [];
  const layer2dFileDepthsByKey = new Map<string, number[]>();
  for (const layer of sortedLayerSources) {
    if (movieMode === '2d') {
      const depths: number[] = [];
      for (const file of layer.files) {
        throwIfAborted(signal);
        const tiff = await fromBlob(file);
        const depth = await tiff.getImageCount();
        depths.push(Math.max(0, depth));
      }
      layer2dFileDepthsByKey.set(layer.key, depths);
      layerTimepointCounts.push(depths.reduce((sum, value) => sum + value, 0));
    } else {
      layerTimepointCounts.push(layer.files.length);
    }
  }

  const expectedTimepoints = layerTimepointCounts[0] ?? 0;
  if (expectedTimepoints <= 0) {
    throw new Error('The selected dataset does not contain any TIFF frames.');
  }
  for (let index = 0; index < layerTimepointCounts.length; index += 1) {
    if (layerTimepointCounts[index] !== expectedTimepoints) {
      throw new Error('All layers must contain the same number of timepoints.');
    }
  }

  const representativeTimepoint = Math.floor(expectedTimepoints / 2);
  const normalizationByLayerKey = new Map<string, NormalizationParameters>();

  for (let layerIndex = 0; layerIndex < sortedLayerSources.length; layerIndex += 1) {
    const layer = sortedLayerSources[layerIndex];
    if (layer.isSegmentation) {
      continue;
    }
    throwIfAborted(signal);
    onProgress?.({ stage: 'rep-stats', layerKey: layer.key });

    if (movieMode === '2d') {
      const depths = layer2dFileDepthsByKey.get(layer.key);
      if (!depths) {
        throw new Error('Missing 2D stack metadata while computing representative stats.');
      }
      const { fileIndex, sliceIndex } = resolve2dFileSliceForTimepoint(layer.files, representativeTimepoint, depths);
      const stackVolume = await loadVolumeFor3dTimepoint(layer.files[fileIndex]!, loadVolumesFromFiles, signal);
      const sliceVolume = extract2dSlice(stackVolume, sliceIndex);
      normalizationByLayerKey.set(layer.key, computeRepresentativeNormalization(sliceVolume));
    } else {
      const volume = await loadVolumeFor3dTimepoint(layer.files[representativeTimepoint]!, loadVolumesFromFiles, signal);
      normalizationByLayerKey.set(layer.key, computeRepresentativeNormalization(volume));
    }
  }

  let referenceShape3d: { width: number; height: number; depth: number } | null = null;
  let referenceShape2d: { width: number; height: number } | null = null;

  for (let layerIndex = 0; layerIndex < sortedLayerSources.length; layerIndex += 1) {
    const layer = sortedLayerSources[layerIndex];
    throwIfAborted(signal);

    if (movieMode === '2d') {
      const depths = layer2dFileDepthsByKey.get(layer.key);
      if (!depths) {
        throw new Error('Missing 2D stack metadata while validating shapes.');
      }
      const firstAvailableFileIndex = depths.findIndex((depth) => depth > 0);
      if (firstAvailableFileIndex < 0) {
        throw new Error(`Layer "${layer.channelLabel}" does not contain any TIFF frames.`);
      }
      const stackVolume = await loadVolumeFor3dTimepoint(
        layer.files[firstAvailableFileIndex]!,
        loadVolumesFromFiles,
        signal
      );
      const firstSlice = extract2dSlice(stackVolume, 0);
      if (!referenceShape2d) {
        referenceShape2d = { width: firstSlice.width, height: firstSlice.height };
      } else if (
        firstSlice.width !== referenceShape2d.width ||
        firstSlice.height !== referenceShape2d.height
      ) {
        throw new Error(
          `Channel "${layer.channelLabel}" has volume dimensions ${firstSlice.width}×${firstSlice.height}×1 that do not match the reference shape ${referenceShape2d.width}×${referenceShape2d.height}×1.`
        );
      }
    } else {
      const firstVolume = await loadVolumeFor3dTimepoint(layer.files[0]!, loadVolumesFromFiles, signal);
      if (!referenceShape3d) {
        referenceShape3d = {
          width: firstVolume.width,
          height: firstVolume.height,
          depth: firstVolume.depth
        };
      } else if (
        firstVolume.width !== referenceShape3d.width ||
        firstVolume.height !== referenceShape3d.height ||
        firstVolume.depth !== referenceShape3d.depth
      ) {
        throw new Error(
          `Channel "${layer.channelLabel}" has volume dimensions ${firstVolume.width}×${firstVolume.height}×${firstVolume.depth} that do not match the reference shape ${referenceShape3d.width}×${referenceShape3d.height}×${referenceShape3d.depth}.`
        );
      }
    }
  }

  const totalVolumeCount = expectedTimepoints * sortedLayerSources.length;
  let processedVolumes = 0;

  const layersByChannel = new Map<string, PreprocessLayerSource[]>();
  for (const layer of sortedLayerSources) {
    const bucket = layersByChannel.get(layer.channelId);
    if (bucket) {
      bucket.push(layer);
    } else {
      layersByChannel.set(layer.channelId, [layer]);
    }
  }

  const manifestChannels: PreprocessedChannelManifest[] = [];

  for (const channel of channels) {
    const layerSources = layersByChannel.get(channel.id) ?? [];
    const manifestLayers: PreprocessedLayerManifestEntry[] = [];

    for (let layerIndex = 0; layerIndex < layerSources.length; layerIndex += 1) {
      const layer = layerSources[layerIndex];
      const manifestVolumes: PreprocessedVolumeManifestEntry[] = [];

      if (movieMode === '2d') {
        const depths = layer2dFileDepthsByKey.get(layer.key);
        if (!depths) {
          throw new Error('Missing 2D stack metadata while preprocessing.');
        }

        let timepoint = 0;
        for (let fileIndex = 0; fileIndex < layer.files.length; fileIndex += 1) {
          throwIfAborted(signal);
          const depth = depths[fileIndex] ?? 0;
          if (depth <= 0) {
            continue;
          }
          const stackVolume = await loadVolumeFor3dTimepoint(layer.files[fileIndex]!, loadVolumesFromFiles, signal);
          for (let sliceIndex = 0; sliceIndex < depth; sliceIndex += 1) {
            throwIfAborted(signal);
            const rawSlice = extract2dSlice(stackVolume, sliceIndex);
            const normalized = layer.isSegmentation
              ? colorizeSegmentationVolume(rawSlice, createSegmentationSeed(layer.key, timepoint))
              : normalizeVolume(
                  rawSlice,
                  normalizationByLayerKey.get(layer.key) ?? computeRepresentativeNormalization(rawSlice)
                );

            const entry = await buildVolumeManifestEntry({
              channelId: layer.channelId,
              layerKey: layer.key,
              timepoint,
              volume: normalized,
              storage,
              signal
            });
            manifestVolumes.push(entry);
            processedVolumes += 1;
            onProgress?.({
              stage: 'write-volumes',
              processedVolumes,
              totalVolumes: totalVolumeCount,
              layerKey: layer.key,
              timepoint
            });
            timepoint += 1;
          }
        }
      } else {
        const normalization = layer.isSegmentation
          ? null
          : normalizationByLayerKey.get(layer.key) ??
            computeRepresentativeNormalization(
              await loadVolumeFor3dTimepoint(
                layer.files[representativeTimepoint]!,
                loadVolumesFromFiles,
                signal
              )
            );

        for (let timepoint = 0; timepoint < layer.files.length; timepoint += 1) {
          throwIfAborted(signal);
          const raw = await loadVolumeFor3dTimepoint(layer.files[timepoint]!, loadVolumesFromFiles, signal);
          const normalized = layer.isSegmentation
            ? colorizeSegmentationVolume(raw, createSegmentationSeed(layer.key, timepoint))
            : normalizeVolume(raw, normalization ?? computeRepresentativeNormalization(raw));

          const entry = await buildVolumeManifestEntry({
            channelId: layer.channelId,
            layerKey: layer.key,
            timepoint,
            volume: normalized,
            storage,
            signal
          });
          manifestVolumes.push(entry);
          processedVolumes += 1;
          onProgress?.({
            stage: 'write-volumes',
            processedVolumes,
            totalVolumes: totalVolumeCount,
            layerKey: layer.key,
            timepoint
          });
        }
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
      trackEntries: channel.trackEntries,
      layers: manifestLayers
    });
  }

  const anisotropyScale = computeAnisotropyScale(voxelResolution);
  const anisotropyCorrection = anisotropyScale ? { scale: anisotropyScale } : null;

  const manifest: PreprocessedManifest = {
    format: 'llsm-viewer-preprocessed',
    version: 1,
    generatedAt: new Date().toISOString(),
    dataset: {
      movieMode,
      totalVolumeCount,
      channels: manifestChannels,
      voxelResolution,
      anisotropyCorrection
    }
  };

  throwIfAborted(signal);
  onProgress?.({ stage: 'finalize-manifest' });
  await storage.finalizeManifest(manifest);

  const channelSummaries = buildChannelSummariesFromManifest(manifest);
  return { manifest, channelSummaries, totalVolumeCount };
}
