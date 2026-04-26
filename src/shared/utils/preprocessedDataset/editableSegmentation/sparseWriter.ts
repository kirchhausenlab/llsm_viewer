import type { PreprocessedStorage } from '../../../storage/preprocessedStorage';
import {
  SPARSE_SEGMENTATION_PREPROCESSED_DATASET_FORMAT,
  type PreprocessedChannelManifest,
  type PreprocessedManifest,
  type PreprocessedSparseSegmentationLayerManifestEntry,
  type SparseSegmentationScaleManifestEntry,
} from '../types';
import { computeMultiscaleGeometryLevels } from '../mipPolicy';
import {
  buildSparseSegmentationPayloadShard,
  buildSparseSegmentationOccupancyHierarchy,
  computeBrickGridShape,
  coordKey,
  downsampleSparseSegmentationVoxels,
  encodeSparseSegmentationBrickDirectory,
  encodeSparseSegmentationBrickPayload,
  encodeSparseSegmentationLabelMetadata,
  encodeSparseSegmentationOccupancyLevel,
  localCoordForOffset,
  localOffsetForVoxel,
  updateSparseSegmentationLabelStats,
  type SparseSegmentationBrickCoord,
  type SparseSegmentationBrickDirectoryRecord,
  type SparseSegmentationBrickSize,
  type SparseSegmentationGlobalVoxel,
  type SparseSegmentationLabelStatsAccumulator,
  type SparseSegmentationLocalVoxel,
} from '../sparseSegmentation';
import { computeSparseSegmentationCrc32 } from '../sparseSegmentation/binaryLayout';
import type { EditableSegmentationChannel } from '../../../../types/annotation';

const DEFAULT_SHARD_TARGET_BYTES = 16 * 1024 * 1024;
const textEncoder = new TextEncoder();

type ScaleBuildState = {
  scale: SparseSegmentationScaleManifestEntry;
  records: SparseSegmentationBrickDirectoryRecord[];
  payloads: Uint8Array[];
  nonzeroVoxelCount: number;
};

type LayerBuildState = {
  manifestLayer: PreprocessedSparseSegmentationLayerManifestEntry;
  scaleStates: ScaleBuildState[];
  labelStats: Map<number, SparseSegmentationLabelStatsAccumulator>;
};

function padRevision(revision: number): string {
  return Math.max(1, Math.floor(revision)).toString().padStart(6, '0');
}

function createScaleBasePath(layerKey: string, revision: number, level: number): string {
  return `annotations/${layerKey}/rev-${padRevision(revision)}/scale-${level}`;
}

function buildEmptySparseOccupancyDescriptors({
  basePath,
  brickGridShape,
}: {
  basePath: string;
  brickGridShape: SparseSegmentationBrickSize;
}): SparseSegmentationScaleManifestEntry['occupancyHierarchy'] {
  let gridShape = brickGridShape;
  let level = 0;
  const levels: SparseSegmentationScaleManifestEntry['occupancyHierarchy']['levels'] = [];
  while (true) {
    levels.push({
      level,
      path: `${basePath}/occupancy-level-${level}.bin`,
      byteLength: 64 + gridShape[0] * gridShape[1] * gridShape[2],
      gridShape,
      dataType: 'uint8',
      occupiedNodeCount: 0,
      checksum: null,
    });
    if (gridShape[0] === 1 && gridShape[1] === 1 && gridShape[2] === 1) {
      break;
    }
    gridShape = [
      Math.max(1, Math.ceil(gridShape[0] / 2)),
      Math.max(1, Math.ceil(gridShape[1] / 2)),
      Math.max(1, Math.ceil(gridShape[2] / 2)),
    ];
    level += 1;
  }
  return {
    format: 'sparse-occupancy-hierarchy-v1',
    levels,
  };
}

function buildSparseScales({
  channel,
  revision,
}: {
  channel: EditableSegmentationChannel;
  revision: number;
}): SparseSegmentationScaleManifestEntry[] {
  const geometryLevels = computeMultiscaleGeometryLevels(channel.dimensions);
  const brickSize: SparseSegmentationBrickSize = [32, 32, 32];
  return geometryLevels.map((geometryLevel) => {
    const basePath = createScaleBasePath(channel.layerKey, revision, geometryLevel.level);
    const brickGridShape = computeBrickGridShape(
      {
        width: geometryLevel.width,
        height: geometryLevel.height,
        depth: geometryLevel.depth,
      },
      brickSize
    );
    return {
      level: geometryLevel.level,
      downsampleFactor: geometryLevel.downsampleFactor,
      width: geometryLevel.width,
      height: geometryLevel.height,
      depth: geometryLevel.depth,
      brickSize,
      brickGridShape,
      occupiedBrickCount: 0,
      nonzeroVoxelCount: 0,
      directory: {
        format: 'sparse-brick-directory-v1',
        path: `${basePath}/directory.bin`,
        byteLength: 64,
        recordCount: 0,
        recordByteLength: 80,
        checksum: null,
      },
      payload: {
        format: 'sparse-brick-payload-shards-v1',
        shardCount: 0,
        shardPathPrefix: `${basePath}/payloads/shard-`,
        shardFileExtension: '.ssbp',
        targetShardBytes: DEFAULT_SHARD_TARGET_BYTES,
        totalPayloadBytes: 0,
      },
      occupancyHierarchy: buildEmptySparseOccupancyDescriptors({ basePath, brickGridShape }),
    };
  });
}

function createManifestLayer({
  channel,
  revision,
}: {
  channel: EditableSegmentationChannel;
  revision: number;
}): PreprocessedSparseSegmentationLayerManifestEntry {
  const labelBasePath = `annotations/${channel.layerKey}/rev-${padRevision(revision)}`;
  return {
    kind: 'segmentation',
    key: channel.layerKey,
    label: channel.name,
    channelId: channel.channelId,
    isSegmentation: true,
    volumeCount: channel.volumeCount,
    width: channel.dimensions.width,
    height: channel.dimensions.height,
    depth: channel.dimensions.depth,
    channels: 1,
    dataType: 'uint32',
    labelDataType: 'uint32',
    emptyLabel: 0,
    normalization: null,
    representation: 'sparse-label-bricks-v1',
    brickSize: [32, 32, 32],
    colorSeed: 0,
    sparse: {
      version: 1,
      labels: {
        format: 'sparse-label-metadata-v1',
        path: `${labelBasePath}/labels.bin`,
        byteLength: 64,
        recordCount: 0,
        recordByteLength: 96,
        checksum: null,
      },
      scales: buildSparseScales({ channel, revision }),
    },
    editableSegmentation: {
      version: 1,
      labelNames: channel.labels.map((label) => label.name),
    },
  };
}

function collectVoxelsForTimepoint({
  channel,
  timepoint,
  labelStats,
}: {
  channel: EditableSegmentationChannel;
  timepoint: number;
  labelStats: Map<number, SparseSegmentationLabelStatsAccumulator>;
}): SparseSegmentationGlobalVoxel[] {
  const labels = channel.timepointLabels.get(timepoint);
  if (!labels) {
    return [];
  }
  const { width, height, depth } = channel.dimensions;
  const voxels: SparseSegmentationGlobalVoxel[] = [];
  for (let z = 0; z < depth; z += 1) {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = (z * height + y) * width + x;
        const label = labels[index] ?? 0;
        if (label === 0) {
          continue;
        }
        voxels.push({ z, y, x, label });
        updateSparseSegmentationLabelStats(labelStats, label, timepoint, z, y, x);
      }
    }
  }
  return voxels;
}

function appendSparseScale({
  state,
  timepoint,
  voxels,
}: {
  state: ScaleBuildState;
  timepoint: number;
  voxels: readonly SparseSegmentationGlobalVoxel[];
}): void {
  if (voxels.length === 0) {
    return;
  }
  const { scale } = state;
  const bricks = new Map<string, { coord: SparseSegmentationBrickCoord; voxels: SparseSegmentationLocalVoxel[] }>();
  for (const voxel of voxels) {
    const brickCoord = {
      z: Math.floor(voxel.z / scale.brickSize[0]),
      y: Math.floor(voxel.y / scale.brickSize[1]),
      x: Math.floor(voxel.x / scale.brickSize[2]),
    };
    const key = coordKey(brickCoord);
    let entry = bricks.get(key);
    if (!entry) {
      entry = { coord: brickCoord, voxels: [] };
      bricks.set(key, entry);
    }
    entry.voxels.push({
      offset: localOffsetForVoxel(voxel, scale.brickSize),
      label: voxel.label,
    });
  }

  const sortedBricks = [...bricks.values()].sort(
    (left, right) => left.coord.z - right.coord.z || left.coord.y - right.coord.y || left.coord.x - right.coord.x
  );
  for (const brick of sortedBricks) {
    const sortedVoxels = [...brick.voxels].sort((left, right) => left.offset - right.offset);
    if (sortedVoxels.length === 0) {
      continue;
    }
    let minZ = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let minX = Number.POSITIVE_INFINITY;
    let maxZ = 0;
    let maxY = 0;
    let maxX = 0;
    let labelMin = Number.POSITIVE_INFINITY;
    let labelMax = 0;
    for (const voxel of sortedVoxels) {
      const local = localCoordForOffset(voxel.offset, scale.brickSize);
      minZ = Math.min(minZ, local.z);
      minY = Math.min(minY, local.y);
      minX = Math.min(minX, local.x);
      maxZ = Math.max(maxZ, local.z);
      maxY = Math.max(maxY, local.y);
      maxX = Math.max(maxX, local.x);
      labelMin = Math.min(labelMin, voxel.label);
      labelMax = Math.max(labelMax, voxel.label);
    }
    const encoded = encodeSparseSegmentationBrickPayload({
      voxels: sortedVoxels,
      brickSize: scale.brickSize,
    });
    const payloadIndex = state.payloads.length;
    state.payloads.push(encoded.bytes);
    state.records.push({
      timepoint,
      scaleLevel: scale.level,
      brickCoord: brick.coord,
      localBounds: {
        min: { z: minZ, y: minY, x: minX },
        max: { z: maxZ, y: maxY, x: maxX },
      },
      nonzeroVoxelCount: sortedVoxels.length,
      labelMin,
      labelMax,
      codec: encoded.codec,
      shardId: 0,
      payloadByteLength: encoded.bytes.byteLength,
      payloadByteOffset: payloadIndex,
      decodedVoxelCount: sortedVoxels.length,
      payloadCrc32: computeSparseSegmentationCrc32(encoded.bytes),
    });
    state.nonzeroVoxelCount += sortedVoxels.length;
  }
}

function appendTimepoint({
  buildState,
  timepoint,
  baseVoxels,
}: {
  buildState: LayerBuildState;
  timepoint: number;
  baseVoxels: SparseSegmentationGlobalVoxel[];
}): void {
  let current = {
    width: buildState.manifestLayer.width,
    height: buildState.manifestLayer.height,
    depth: buildState.manifestLayer.depth,
    voxels: baseVoxels,
  };
  for (let index = 0; index < buildState.scaleStates.length; index += 1) {
    const scaleState = buildState.scaleStates[index]!;
    appendSparseScale({ state: scaleState, timepoint, voxels: current.voxels });
    if (index < buildState.scaleStates.length - 1) {
      current = downsampleSparseSegmentationVoxels(current);
    }
  }
}

async function finalizeLayerBuild({
  storage,
  buildState,
}: {
  storage: PreprocessedStorage;
  buildState: LayerBuildState;
}): Promise<void> {
  const { manifestLayer } = buildState;
  const labelBytes = encodeSparseSegmentationLabelMetadata({
    stats: buildState.labelStats,
    timepointCount: manifestLayer.volumeCount,
  });
  await storage.writeFile(manifestLayer.sparse.labels.path, labelBytes);
  manifestLayer.sparse.labels.byteLength = labelBytes.byteLength;
  manifestLayer.sparse.labels.recordCount = buildState.labelStats.size;

  for (const scaleState of buildState.scaleStates) {
    const { scale } = scaleState;
    const totalPayloadBytes = scaleState.payloads.reduce((sum, payload) => sum + payload.byteLength, 0);
    if (scaleState.payloads.length > 0) {
      const shard = buildSparseSegmentationPayloadShard({
        shardId: 0,
        payloads: scaleState.payloads,
      });
      for (let index = 0; index < scaleState.records.length; index += 1) {
        const record = scaleState.records[index]!;
        record.payloadByteOffset = shard.payloadOffsets[index] ?? 64;
      }
      await storage.writeFile(`${scale.payload.shardPathPrefix}0${scale.payload.shardFileExtension}`, shard.bytes);
      scale.payload.shardCount = 1;
    } else {
      scale.payload.shardCount = 0;
    }
    scale.payload.totalPayloadBytes = totalPayloadBytes;

    const directoryBytes = encodeSparseSegmentationBrickDirectory({
      records: scaleState.records,
      scaleLevel: scale.level,
      timepointCount: manifestLayer.volumeCount,
      brickGridShape: scale.brickGridShape,
      brickSize: scale.brickSize,
    });
    await storage.writeFile(scale.directory.path, directoryBytes);
    scale.directory.byteLength = directoryBytes.byteLength;
    scale.directory.recordCount = scaleState.records.length;
    scale.occupiedBrickCount = scaleState.records.length;
    scale.nonzeroVoxelCount = scaleState.nonzeroVoxelCount;

    const occupancyHierarchy = buildSparseSegmentationOccupancyHierarchy({
      brickGridShape: scale.brickGridShape,
      records: scaleState.records,
    });
    scale.occupancyHierarchy.levels = occupancyHierarchy.levels.map((level) => {
      const bytes = encodeSparseSegmentationOccupancyLevel(level);
      const descriptor = scale.occupancyHierarchy.levels[level.level];
      return {
        level: level.level,
        path: descriptor?.path ?? `${createScaleBasePath(manifestLayer.key, 1, scale.level)}/occupancy-level-${level.level}.bin`,
        byteLength: bytes.byteLength,
        gridShape: level.gridShape,
        dataType: 'uint8' as const,
        occupiedNodeCount: level.occupiedNodeCount,
        checksum: null,
      };
    });
    for (const level of occupancyHierarchy.levels) {
      const descriptor = scale.occupancyHierarchy.levels[level.level];
      if (!descriptor) {
        throw new Error(`Missing sparse occupancy descriptor for level ${level.level}.`);
      }
      await storage.writeFile(descriptor.path, encodeSparseSegmentationOccupancyLevel(level));
    }
  }
}

function upsertManifestChannel({
  manifest,
  channel,
  layer,
}: {
  manifest: PreprocessedManifest;
  channel: EditableSegmentationChannel;
  layer: PreprocessedSparseSegmentationLayerManifestEntry;
}): PreprocessedManifest {
  const nextChannels: PreprocessedChannelManifest[] = manifest.dataset.channels.map((entry) => ({
    ...entry,
    layers: entry.layers.map((existingLayer) => ({ ...existingLayer })),
  }));
  const existingChannelIndex = nextChannels.findIndex((entry) => entry.id === channel.channelId);
  if (existingChannelIndex >= 0) {
    const existing = nextChannels[existingChannelIndex]!;
    const existingLayerIndex = existing.layers.findIndex((entry) => entry.key === channel.layerKey);
    const layers =
      existingLayerIndex >= 0
        ? existing.layers.map((entry, index) => (index === existingLayerIndex ? layer : entry))
        : [...existing.layers, layer];
    nextChannels[existingChannelIndex] = {
      ...existing,
      name: channel.name,
      layers,
    };
  } else {
    nextChannels.push({
      id: channel.channelId,
      name: channel.name,
      layers: [layer],
    });
  }

  return {
    ...manifest,
    format: SPARSE_SEGMENTATION_PREPROCESSED_DATASET_FORMAT,
    generatedAt: new Date().toISOString(),
    dataset: {
      ...manifest.dataset,
      channels: nextChannels,
    },
  };
}

export function encodeRootZarrManifest(manifest: PreprocessedManifest): Uint8Array {
  return textEncoder.encode(
    JSON.stringify({
      zarr_format: 3,
      node_type: 'group',
      attributes: {
        llsmViewerPreprocessed: manifest,
      },
    })
  );
}

export async function writeEditableSegmentationChannel({
  storage,
  manifest,
  channel,
  revision,
}: {
  storage: PreprocessedStorage;
  manifest: PreprocessedManifest;
  channel: EditableSegmentationChannel;
  revision: number;
}): Promise<PreprocessedManifest> {
  const manifestLayer = createManifestLayer({ channel, revision });
  const buildState: LayerBuildState = {
    manifestLayer,
    scaleStates: manifestLayer.sparse.scales.map((scale) => ({
      scale,
      records: [],
      payloads: [],
      nonzeroVoxelCount: 0,
    })),
    labelStats: new Map(),
  };

  for (let timepoint = 0; timepoint < channel.volumeCount; timepoint += 1) {
    const voxels = collectVoxelsForTimepoint({
      channel,
      timepoint,
      labelStats: buildState.labelStats,
    });
    appendTimepoint({ buildState, timepoint, baseVoxels: voxels });
  }

  await finalizeLayerBuild({ storage, buildState });
  const nextManifest = upsertManifestChannel({ manifest, channel, layer: manifestLayer });
  await storage.writeFile('zarr.json', encodeRootZarrManifest(nextManifest));
  return nextManifest;
}
