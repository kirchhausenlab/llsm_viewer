import { fromBlob } from 'geotiff';
import * as zarr from 'zarrita';

import type { NormalizationParameters, NormalizedVolume } from '../../../core/volumeProcessing';
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
import { loadVolumesFromFiles } from '../../../loaders/volumeLoader';

import type {
  ChannelExportMetadata,
  PreprocessedChannelSummary,
  PreprocessedLayerManifestEntry,
  PreprocessedManifest,
  PreprocessedMovieMode,
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

type VolumeShapeExpectation = {
  width: number;
  height: number;
  depth?: number;
  channels: number;
  dataType: VolumePayload['dataType'];
};

function assertVolumeMatchesExpectedShape(
  volume: Pick<VolumePayload, 'width' | 'height' | 'depth' | 'channels' | 'dataType'>,
  expected: VolumeShapeExpectation,
  context: string
): void {
  const depthMatches = expected.depth === undefined || volume.depth === expected.depth;
  if (
    volume.width !== expected.width ||
    volume.height !== expected.height ||
    !depthMatches ||
    volume.channels !== expected.channels ||
    volume.dataType !== expected.dataType
  ) {
    const expectedDepthLabel = expected.depth === undefined ? '*' : String(expected.depth);
    throw new Error(
      `${context} has shape ${volume.width}×${volume.height}×${volume.depth} (${volume.channels}ch ${volume.dataType}) but expected ${expected.width}×${expected.height}×${expectedDepthLabel} (${expected.channels}ch ${expected.dataType}).`
    );
  }
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

type LayerMetadata = {
  width: number;
  height: number;
  depth: number;
  channels: number;
  dataType: VolumePayload['dataType'];
};

async function computeLayerTimepointMetadata({
  sortedLayerSources,
  movieMode,
  signal
}: {
  sortedLayerSources: PreprocessLayerSource[];
  movieMode: PreprocessedMovieMode;
  signal?: AbortSignal;
}): Promise<{
  expectedTimepoints: number;
  layer2dFileDepthsByKey: Map<string, number[]>;
}> {
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

  return {
    expectedTimepoints,
    layer2dFileDepthsByKey
  };
}

async function computeLayerRepresentativeNormalization({
  sortedLayerSources,
  movieMode,
  representativeTimepoint,
  layer2dFileDepthsByKey,
  signal,
  onProgress
}: {
  sortedLayerSources: PreprocessLayerSource[];
  movieMode: PreprocessedMovieMode;
  representativeTimepoint: number;
  layer2dFileDepthsByKey: Map<string, number[]>;
  signal?: AbortSignal;
  onProgress?: (progress: PreprocessDatasetProgress) => void;
}): Promise<Map<string, NormalizationParameters>> {
  const normalizationByLayerKey = new Map<string, NormalizationParameters>();

  for (const layer of sortedLayerSources) {
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
      const { fileIndex, sliceIndex } = resolve2dFileSliceForTimepoint(representativeTimepoint, depths);
      const stackVolume = await loadVolumeFor3dTimepoint(layer.files[fileIndex]!, loadVolumesFromFiles, signal);
      const sliceVolume = extract2dSlice(stackVolume, sliceIndex);
      normalizationByLayerKey.set(layer.key, computeRepresentativeNormalization(sliceVolume));
    } else {
      const volume = await loadVolumeFor3dTimepoint(layer.files[representativeTimepoint]!, loadVolumesFromFiles, signal);
      normalizationByLayerKey.set(layer.key, computeRepresentativeNormalization(volume));
    }
  }

  return normalizationByLayerKey;
}

async function collectLayerMetadata({
  sortedLayerSources,
  movieMode,
  layer2dFileDepthsByKey,
  signal
}: {
  sortedLayerSources: PreprocessLayerSource[];
  movieMode: PreprocessedMovieMode;
  layer2dFileDepthsByKey: Map<string, number[]>;
  signal?: AbortSignal;
}): Promise<{
  sourceMetadataByLayerKey: Map<string, LayerMetadata>;
  layerMetadataByKey: Map<string, LayerMetadata>;
}> {
  let referenceShape3d: { width: number; height: number; depth: number } | null = null;
  let referenceShape2d: { width: number; height: number } | null = null;

  const sourceMetadataByLayerKey = new Map<string, LayerMetadata>();
  const layerMetadataByKey = new Map<string, LayerMetadata>();

  for (const layer of sortedLayerSources) {
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
      sourceMetadataByLayerKey.set(layer.key, {
        width: firstSlice.width,
        height: firstSlice.height,
        depth: 1,
        channels: firstSlice.channels,
        dataType: firstSlice.dataType
      });
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
      sourceMetadataByLayerKey.set(layer.key, {
        width: firstVolume.width,
        height: firstVolume.height,
        depth: firstVolume.depth,
        channels: firstVolume.channels,
        dataType: firstVolume.dataType
      });
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

  return {
    sourceMetadataByLayerKey,
    layerMetadataByKey
  };
}

function groupLayersByChannel(sortedLayerSources: PreprocessLayerSource[]): Map<string, PreprocessLayerSource[]> {
  const layersByChannel = new Map<string, PreprocessLayerSource[]>();
  for (const layer of sortedLayerSources) {
    const bucket = layersByChannel.get(layer.channelId);
    if (bucket) {
      bucket.push(layer);
    } else {
      layersByChannel.set(layer.channelId, [layer]);
    }
  }
  return layersByChannel;
}

function buildManifestFromLayerMetadata({
  channels,
  layersByChannel,
  layerMetadataByKey,
  expectedTimepoints,
  normalizationByLayerKey,
  movieMode,
  totalVolumeCount,
  voxelResolution
}: {
  channels: ChannelExportMetadata[];
  layersByChannel: Map<string, PreprocessLayerSource[]>;
  layerMetadataByKey: Map<string, LayerMetadata>;
  expectedTimepoints: number;
  normalizationByLayerKey: Map<string, NormalizationParameters>;
  movieMode: PreprocessedMovieMode;
  totalVolumeCount: number;
  voxelResolution: NonNullable<PreprocessedManifest['dataset']['voxelResolution']>;
}): {
  manifest: PreprocessedManifest;
  layerManifestByKey: Map<string, PreprocessedLayerManifestEntry>;
  trackEntriesByTrackSetId: Map<string, string[][]>;
} {
  const manifestChannels: PreprocessedManifest['dataset']['channels'] = [];
  const layerManifestByKey = new Map<string, PreprocessedLayerManifestEntry>();
  const trackEntriesByTrackSetId = new Map<string, string[][]>();

  for (const channel of channels) {
    const layerSources = layersByChannel.get(channel.id) ?? [];
    const manifestLayers: PreprocessedLayerManifestEntry[] = [];

    for (const layer of layerSources) {
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

    const manifestTrackSets = channel.trackSets.map((trackSet) => {
      trackEntriesByTrackSetId.set(trackSet.id, trackSet.entries);
      return {
        id: trackSet.id,
        name: trackSet.name,
        fileName: trackSet.fileName,
        tracks: createTracksDescriptor(`tracks/${encodeURIComponent(trackSet.id)}.csv`)
      } as const;
    });

    manifestChannels.push({
      id: channel.id,
      name: channel.name,
      trackSets: manifestTrackSets,
      layers: manifestLayers
    });
  }

  const anisotropyScale = computeAnisotropyScale(voxelResolution);
  const anisotropyCorrection = anisotropyScale ? { scale: anisotropyScale } : null;

  const manifest: PreprocessedManifest = {
    format: 'llsm-viewer-preprocessed',
    generatedAt: new Date().toISOString(),
    dataset: {
      movieMode,
      totalVolumeCount,
      channels: manifestChannels,
      voxelResolution,
      anisotropyCorrection
    }
  };

  return {
    manifest,
    layerManifestByKey,
    trackEntriesByTrackSetId
  };
}

async function writeTrackSetCsvFiles({
  manifest,
  trackEntriesByTrackSetId,
  storage
}: {
  manifest: PreprocessedManifest;
  trackEntriesByTrackSetId: Map<string, string[][]>;
  storage: PreprocessedStorage;
}): Promise<void> {
  for (const channel of manifest.dataset.channels) {
    for (const trackSet of channel.trackSets) {
      const entries = trackEntriesByTrackSetId.get(trackSet.id) ?? [];
      const payload = serializeTrackEntriesToCsvBytes(entries, { decimalPlaces: trackSet.tracks.decimalPlaces });
      await storage.writeFile(trackSet.tracks.path, payload);
    }
  }
}

async function createManifestZarrArrays({
  root,
  manifest
}: {
  root: any;
  manifest: PreprocessedManifest;
}): Promise<void> {
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
}

async function writeNormalizedLayerTimepoint({
  normalized,
  layer,
  manifestLayer,
  storage,
  signal,
  timepoint
}: {
  normalized: NormalizedVolume;
  layer: PreprocessLayerSource;
  manifestLayer: PreprocessedLayerManifestEntry;
  storage: PreprocessedStorage;
  signal?: AbortSignal;
  timepoint: number;
}): Promise<void> {
  const dataArrayPath = manifestLayer.zarr.data.path;
  const labelsArrayPath = manifestLayer.zarr.labels?.path ?? null;
  const histogramArrayPath = manifestLayer.zarr.histogram.path;

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
}

async function writeLayerVolumesFor2d({
  layer,
  manifestLayer,
  sourceMetadata,
  normalizationByLayerKey,
  layer2dFileDepthsByKey,
  storage,
  signal,
  onProgress,
  totalVolumeCount,
  progressState
}: {
  layer: PreprocessLayerSource;
  manifestLayer: PreprocessedLayerManifestEntry;
  sourceMetadata: LayerMetadata;
  normalizationByLayerKey: Map<string, NormalizationParameters>;
  layer2dFileDepthsByKey: Map<string, number[]>;
  storage: PreprocessedStorage;
  signal?: AbortSignal;
  onProgress?: (progress: PreprocessDatasetProgress) => void;
  totalVolumeCount: number;
  progressState: { processedVolumes: number };
}): Promise<void> {
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
    assertVolumeMatchesExpectedShape(
      stackVolume,
      {
        width: sourceMetadata.width,
        height: sourceMetadata.height,
        channels: sourceMetadata.channels,
        dataType: sourceMetadata.dataType
      },
      `Layer "${layer.channelLabel}" file "${layer.files[fileIndex]?.name ?? `#${fileIndex + 1}`}" stack`
    );
    if (stackVolume.depth !== depth) {
      throw new Error(
        `Layer "${layer.channelLabel}" file "${layer.files[fileIndex]?.name ?? `#${fileIndex + 1}`}" reported ${depth} slices during indexing but decoded as ${stackVolume.depth} slices.`
      );
    }

    for (let sliceIndex = 0; sliceIndex < depth; sliceIndex += 1) {
      throwIfAborted(signal);
      const rawSlice = extract2dSlice(stackVolume, sliceIndex);
      assertVolumeMatchesExpectedShape(rawSlice, sourceMetadata, `Layer "${layer.channelLabel}" timepoint ${timepoint + 1}`);

      const normalized = layer.isSegmentation
        ? colorizeSegmentationVolume(rawSlice, createSegmentationSeed(layer.key, timepoint))
        : normalizeVolume(rawSlice, normalizationByLayerKey.get(layer.key) ?? computeRepresentativeNormalization(rawSlice));

      await writeNormalizedLayerTimepoint({
        normalized,
        layer,
        manifestLayer,
        storage,
        signal,
        timepoint
      });

      progressState.processedVolumes += 1;
      onProgress?.({
        stage: 'write-volumes',
        processedVolumes: progressState.processedVolumes,
        totalVolumes: totalVolumeCount,
        layerKey: layer.key,
        timepoint
      });
      timepoint += 1;
    }
  }
}

async function writeLayerVolumesFor3d({
  layer,
  manifestLayer,
  sourceMetadata,
  representativeTimepoint,
  normalizationByLayerKey,
  storage,
  signal,
  onProgress,
  totalVolumeCount,
  progressState
}: {
  layer: PreprocessLayerSource;
  manifestLayer: PreprocessedLayerManifestEntry;
  sourceMetadata: LayerMetadata;
  representativeTimepoint: number;
  normalizationByLayerKey: Map<string, NormalizationParameters>;
  storage: PreprocessedStorage;
  signal?: AbortSignal;
  onProgress?: (progress: PreprocessDatasetProgress) => void;
  totalVolumeCount: number;
  progressState: { processedVolumes: number };
}): Promise<void> {
  const normalization = layer.isSegmentation
    ? null
    : normalizationByLayerKey.get(layer.key) ??
      computeRepresentativeNormalization(
        await loadVolumeFor3dTimepoint(layer.files[representativeTimepoint]!, loadVolumesFromFiles, signal)
      );

  for (let timepoint = 0; timepoint < layer.files.length; timepoint += 1) {
    throwIfAborted(signal);
    const raw = await loadVolumeFor3dTimepoint(layer.files[timepoint]!, loadVolumesFromFiles, signal);
    assertVolumeMatchesExpectedShape(raw, sourceMetadata, `Layer "${layer.channelLabel}" timepoint ${timepoint + 1}`);

    const normalized = layer.isSegmentation
      ? colorizeSegmentationVolume(raw, createSegmentationSeed(layer.key, timepoint))
      : normalizeVolume(raw, normalization ?? computeRepresentativeNormalization(raw));

    await writeNormalizedLayerTimepoint({
      normalized,
      layer,
      manifestLayer,
      storage,
      signal,
      timepoint
    });

    progressState.processedVolumes += 1;
    onProgress?.({
      stage: 'write-volumes',
      processedVolumes: progressState.processedVolumes,
      totalVolumes: totalVolumeCount,
      layerKey: layer.key,
      timepoint
    });
  }
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
  const { expectedTimepoints, layer2dFileDepthsByKey } = await computeLayerTimepointMetadata({
    sortedLayerSources,
    movieMode,
    signal
  });
  const representativeTimepoint = Math.floor(expectedTimepoints / 2);
  const normalizationByLayerKey = await computeLayerRepresentativeNormalization({
    sortedLayerSources,
    movieMode,
    representativeTimepoint,
    layer2dFileDepthsByKey,
    signal,
    onProgress
  });
  const { sourceMetadataByLayerKey, layerMetadataByKey } = await collectLayerMetadata({
    sortedLayerSources,
    movieMode,
    layer2dFileDepthsByKey,
    signal
  });
  const totalVolumeCount = expectedTimepoints * sortedLayerSources.length;
  const layersByChannel = groupLayersByChannel(sortedLayerSources);
  const { manifest, layerManifestByKey, trackEntriesByTrackSetId } = buildManifestFromLayerMetadata({
    channels,
    layersByChannel,
    layerMetadataByKey,
    expectedTimepoints,
    normalizationByLayerKey,
    movieMode,
    totalVolumeCount,
    voxelResolution
  });

  const zarrStore = createZarrStoreFromPreprocessedStorage(storage);
  const root = zarr.root(zarrStore);

  throwIfAborted(signal);
  onProgress?.({ stage: 'finalize-manifest' });
  await zarr.create(root, { attributes: { llsmViewerPreprocessed: manifest } });
  await writeTrackSetCsvFiles({ manifest, trackEntriesByTrackSetId, storage });
  await createManifestZarrArrays({ root, manifest });

  const progressState = { processedVolumes: 0 };
  for (const channel of channels) {
    const layerSources = layersByChannel.get(channel.id) ?? [];
    for (const layer of layerSources) {
      const manifestLayer = layerManifestByKey.get(layer.key);
      if (!manifestLayer) {
        throw new Error(`Missing manifest entry for layer "${layer.key}".`);
      }
      const sourceMetadata = sourceMetadataByLayerKey.get(layer.key);
      if (!sourceMetadata) {
        throw new Error(`Missing source metadata for layer "${layer.key}".`);
      }

      if (movieMode === '2d') {
        await writeLayerVolumesFor2d({
          layer,
          manifestLayer,
          sourceMetadata,
          normalizationByLayerKey,
          layer2dFileDepthsByKey,
          storage,
          signal,
          onProgress,
          totalVolumeCount,
          progressState
        });
      } else {
        await writeLayerVolumesFor3d({
          layer,
          manifestLayer,
          sourceMetadata,
          representativeTimepoint,
          normalizationByLayerKey,
          storage,
          signal,
          onProgress,
          totalVolumeCount,
          progressState
        });
      }
    }
  }

  const channelSummaries = buildChannelSummariesFromManifest(manifest, trackEntriesByTrackSetId);
  return { manifest, channelSummaries, totalVolumeCount };
}
