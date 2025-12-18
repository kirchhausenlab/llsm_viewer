import { fromBlob } from 'geotiff';
import * as zarr from 'zarrita';

import type { NormalizationParameters } from '../../../core/volumeProcessing';
import {
  colorizeSegmentationVolume,
  computeNormalizationParameters,
  normalizeVolume
} from '../../../core/volumeProcessing';
import type { PreprocessedStorage } from '../../storage/preprocessedStorage';
import { createSegmentationSeed, sortVolumeFiles } from '../appHelpers';
import { computeAnisotropyScale } from '../anisotropyCorrection';
import type { VolumePayload, VolumeTypedArray } from '../../../types/volume';
import { createVolumeTypedArray } from '../../../types/volume';

import type {
  ChannelExportMetadata,
  PreprocessedChannelSummary,
  PreprocessedLayerManifestEntry,
  PreprocessedManifest,
  PreprocessedManifestV4,
  PreprocessedMovieMode,
  PreprocessedTracksDescriptor,
  ZarrArrayDescriptor
} from './types';
import { createZarrStoreFromPreprocessedStorage } from '../zarrStore';
import { buildChannelSummariesFromManifest } from './manifest';
import { createTracksDescriptor, serializeTrackEntriesToCsvBytes } from './tracks';
import { computeUint8VolumeHistogram, encodeUint32ArrayLE, HISTOGRAM_BINS } from '../histogram';

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

function createZarrDataArrayPath(channelId: string, layerKey: string): string {
  return `channels/${channelId}/${layerKey}/data`;
}

function createZarrLabelsArrayPath(channelId: string, layerKey: string): string {
  return `channels/${channelId}/${layerKey}/labels`;
}

function createZarrHistogramArrayPath(channelId: string, layerKey: string): string {
  return `channels/${channelId}/${layerKey}/histogram`;
}

function createZarrChunkKey(timepoint: number, rank: number): string {
  if (!Number.isFinite(timepoint) || timepoint < 0 || Math.floor(timepoint) !== timepoint) {
    throw new Error(`Invalid timepoint chunk coord: ${timepoint}`);
  }
  const coords = [timepoint, ...Array.from({ length: Math.max(0, rank - 1) }, () => 0)];
  return `c/${coords.join('/')}`;
}

async function writeZarrChunk({
  storage,
  arrayPath,
  timepoint,
  rank,
  bytes,
  signal
}: {
  storage: PreprocessedStorage;
  arrayPath: string;
  timepoint: number;
  rank: number;
  bytes: Uint8Array;
  signal?: AbortSignal;
}): Promise<void> {
  throwIfAborted(signal);
  const chunkKey = createZarrChunkKey(timepoint, rank);
  await storage.writeFile(`${arrayPath}/${chunkKey}`, bytes);
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
  const layerMetadataByKey = new Map<
    string,
    { width: number; height: number; depth: number; channels: number; dataType: VolumePayload['dataType'] }
  >();

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
      layerMetadataByKey.set(layer.key, {
        width: firstSlice.width,
        height: firstSlice.height,
        depth: 1,
        channels: layer.isSegmentation ? 4 : firstSlice.channels,
        dataType: layer.isSegmentation ? 'uint8' : firstSlice.dataType
      });
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
      layerMetadataByKey.set(layer.key, {
        width: firstVolume.width,
        height: firstVolume.height,
        depth: firstVolume.depth,
        channels: layer.isSegmentation ? 4 : firstVolume.channels,
        dataType: layer.isSegmentation ? 'uint8' : firstVolume.dataType
      });
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

  const manifestChannels: PreprocessedManifestV4['dataset']['channels'] = [];
  const layerManifestByKey = new Map<string, PreprocessedLayerManifestEntry>();

  const tracksByChannelId = new Map<string, string[][]>();
  for (const channel of channels) {
    const layerSources = layersByChannel.get(channel.id) ?? [];
    const manifestLayers: PreprocessedLayerManifestEntry[] = [];

    for (let layerIndex = 0; layerIndex < layerSources.length; layerIndex += 1) {
      const layer = layerSources[layerIndex];
      const layerMetadata = layerMetadataByKey.get(layer.key);
      if (!layerMetadata) {
        throw new Error(`Missing metadata for layer "${layer.key}".`);
      }

      const dataArrayPath = createZarrDataArrayPath(layer.channelId, layer.key);
      const labelsArrayPath = layer.isSegmentation ? createZarrLabelsArrayPath(layer.channelId, layer.key) : null;
      const histogramArrayPath = createZarrHistogramArrayPath(layer.channelId, layer.key);
      const dataShape = [
        expectedTimepoints,
        layerMetadata.depth,
        layerMetadata.height,
        layerMetadata.width,
        layerMetadata.channels
      ];
      const dataChunkShape = [
        1,
        layerMetadata.depth,
        layerMetadata.height,
        layerMetadata.width,
        layerMetadata.channels
      ];
      const dataZarr: ZarrArrayDescriptor = {
        path: dataArrayPath,
        shape: dataShape,
        chunkShape: dataChunkShape,
        dataType: 'uint8'
      };

      const labelsZarr: ZarrArrayDescriptor | undefined = labelsArrayPath
        ? {
            path: labelsArrayPath,
            shape: [expectedTimepoints, layerMetadata.depth, layerMetadata.height, layerMetadata.width],
            chunkShape: [1, layerMetadata.depth, layerMetadata.height, layerMetadata.width],
            dataType: 'uint32'
          }
        : undefined;

      const histogramZarr: ZarrArrayDescriptor = {
        path: histogramArrayPath,
        shape: [expectedTimepoints, HISTOGRAM_BINS],
        chunkShape: [1, HISTOGRAM_BINS],
        dataType: 'uint32'
      };

      const manifestLayer: PreprocessedLayerManifestEntry = {
        key: layer.key,
        label: layer.label,
        channelId: layer.channelId,
        isSegmentation: layer.isSegmentation,
        volumeCount: expectedTimepoints,
        width: layerMetadata.width,
        height: layerMetadata.height,
        depth: layerMetadata.depth,
        channels: layerMetadata.channels,
        dataType: layerMetadata.dataType,
        normalization: layer.isSegmentation
          ? { min: 0, max: 255 }
          : (normalizationByLayerKey.get(layer.key) ?? null),
        zarr: {
          data: dataZarr,
          histogram: histogramZarr,
          ...(labelsZarr ? { labels: labelsZarr } : {})
        }
      };

      manifestLayers.push(manifestLayer);
      layerManifestByKey.set(layer.key, manifestLayer);
    }

    tracksByChannelId.set(channel.id, channel.trackEntries);
    const tracksDescriptor: PreprocessedTracksDescriptor | null =
      channel.trackEntries.length > 0
        ? createTracksDescriptor(`tracks/${encodeURIComponent(channel.id)}.csv`)
        : null;

    manifestChannels.push({
      id: channel.id,
      name: channel.name,
      tracks: tracksDescriptor,
      layers: manifestLayers
    });
  }

  const anisotropyScale = computeAnisotropyScale(voxelResolution);
  const anisotropyCorrection = anisotropyScale ? { scale: anisotropyScale } : null;

  const manifest: PreprocessedManifestV4 = {
    format: 'llsm-viewer-preprocessed',
    version: 4,
    generatedAt: new Date().toISOString(),
    dataset: {
      movieMode,
      totalVolumeCount,
      channels: manifestChannels,
      voxelResolution,
      anisotropyCorrection
    }
  };

  const zarrStore = createZarrStoreFromPreprocessedStorage(storage);
  const root = zarr.root(zarrStore);

  throwIfAborted(signal);
  onProgress?.({ stage: 'finalize-manifest' });
  await zarr.create(root, { attributes: { llsmViewerPreprocessed: manifest } });

  for (const channel of manifest.dataset.channels) {
    if (!channel.tracks) {
      continue;
    }
    const entries = tracksByChannelId.get(channel.id) ?? [];
    const payload = serializeTrackEntriesToCsvBytes(entries, { decimalPlaces: channel.tracks.decimalPlaces });
    await storage.writeFile(channel.tracks.path, payload);
  }

  for (const channel of manifest.dataset.channels) {
    for (const layer of channel.layers) {
      const data = layer.zarr.data;
      await zarr.create(root.resolve(data.path), {
        shape: data.shape,
        data_type: data.dataType,
        chunk_shape: data.chunkShape,
        codecs: [],
        fill_value: 0
      });
      if (layer.zarr.labels) {
        const labels = layer.zarr.labels;
        await zarr.create(root.resolve(labels.path), {
          shape: labels.shape,
          data_type: labels.dataType,
          chunk_shape: labels.chunkShape,
          codecs: [],
          fill_value: 0
        });
      }

      const histogram = layer.zarr.histogram;
      await zarr.create(root.resolve(histogram.path), {
        shape: histogram.shape,
        data_type: histogram.dataType,
        chunk_shape: histogram.chunkShape,
        codecs: [],
        fill_value: 0
      });
    }
  }

  for (const channel of channels) {
    const layerSources = layersByChannel.get(channel.id) ?? [];
    for (let layerIndex = 0; layerIndex < layerSources.length; layerIndex += 1) {
      const layer = layerSources[layerIndex];
      const manifestLayer = layerManifestByKey.get(layer.key);
      if (!manifestLayer) {
        throw new Error(`Missing manifest entry for layer "${layer.key}".`);
      }

      const dataArrayPath = manifestLayer.zarr.data.path;
      const labelsArrayPath = manifestLayer.zarr.labels?.path ?? null;
      const histogramArrayPath = manifestLayer.zarr.histogram.path;

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

            await writeZarrChunk({
              storage,
              arrayPath: dataArrayPath,
              timepoint,
              rank: manifestLayer.zarr.data.shape.length,
              bytes: normalized.normalized,
              signal
            });
            const histogram = computeUint8VolumeHistogram(normalized);
            await writeZarrChunk({
              storage,
              arrayPath: histogramArrayPath,
              timepoint,
              rank: manifestLayer.zarr.histogram.shape.length,
              bytes: encodeUint32ArrayLE(histogram),
              signal
            });
            if (layer.isSegmentation && normalized.segmentationLabels && labelsArrayPath) {
              const labelBytes = new Uint8Array(
                normalized.segmentationLabels.buffer,
                normalized.segmentationLabels.byteOffset,
                normalized.segmentationLabels.byteLength
              );
              await writeZarrChunk({
                storage,
                arrayPath: labelsArrayPath,
                timepoint,
                rank: manifestLayer.zarr.labels?.shape.length ?? 4,
                bytes: labelBytes,
                signal
              });
            }

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

          await writeZarrChunk({
            storage,
            arrayPath: dataArrayPath,
            timepoint,
            rank: manifestLayer.zarr.data.shape.length,
            bytes: normalized.normalized,
            signal
          });
          const histogram = computeUint8VolumeHistogram(normalized);
          await writeZarrChunk({
            storage,
            arrayPath: histogramArrayPath,
            timepoint,
            rank: manifestLayer.zarr.histogram.shape.length,
            bytes: encodeUint32ArrayLE(histogram),
            signal
          });
          if (layer.isSegmentation && normalized.segmentationLabels && labelsArrayPath) {
            const labelBytes = new Uint8Array(
              normalized.segmentationLabels.buffer,
              normalized.segmentationLabels.byteOffset,
              normalized.segmentationLabels.byteLength
            );
            await writeZarrChunk({
              storage,
              arrayPath: labelsArrayPath,
              timepoint,
              rank: manifestLayer.zarr.labels?.shape.length ?? 4,
              bytes: labelBytes,
              signal
            });
          }

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
    }
  }

  const channelSummaries = buildChannelSummariesFromManifest(manifest, tracksByChannelId);
  return { manifest, channelSummaries, totalVolumeCount };
}
