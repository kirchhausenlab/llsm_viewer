import type { LoadedDatasetLayer } from '../../../hooks/dataset';
import type { ViewerLayer } from '../../../ui/contracts/viewerLayer';
import type {
  EditableSegmentationChannel,
  EditableSegmentationCreatedFrom,
  EditableSegmentationLabel,
} from '../../../types/annotation';
import type { VolumeBrickAtlas, VolumeBrickPageTable } from '../../../core/volumeProvider';
import {
  computeBrickGridShape,
  coordKey,
  localCoordForOffset,
  localOffsetForVoxel,
  type SparseSegmentationBrickCoord,
  type SparseSegmentationBrickSize,
  type SparseSegmentationLocalVoxel,
} from '../preprocessedDataset/sparseSegmentation';
import {
  createDefaultLayerSettings,
  resolveLayerSamplingMode,
  type LayerSettings,
} from '../../../state/layerSettings';

export const DEFAULT_ANNOTATION_BRICK_SIZE: SparseSegmentationBrickSize = [32, 32, 32];
export const MIN_ANNOTATION_RADIUS = 1;
export const MAX_ANNOTATION_RADIUS = 10;

export function createEditableSegmentationChannel({
  channelId,
  layerKey,
  name,
  dimensions,
  volumeCount,
  createdFrom,
  labels = [{ name: '' }],
  timepointLabels,
}: {
  channelId: string;
  layerKey: string;
  name: string;
  dimensions: EditableSegmentationChannel['dimensions'];
  volumeCount: number;
  createdFrom: EditableSegmentationCreatedFrom;
  labels?: EditableSegmentationLabel[];
  timepointLabels?: Map<number, Uint32Array>;
}): EditableSegmentationChannel {
  return {
    channelId,
    layerKey,
    name,
    dimensions,
    volumeCount: Math.max(1, Math.floor(volumeCount)),
    labels: labels.length > 0 ? labels.map((label) => ({ name: label.name })) : [{ name: '' }],
    activeLabelIndex: 0,
    mode: '3d',
    brushMode: 'brush',
    radius: MIN_ANNOTATION_RADIUS,
    overlayVisible: true,
    enabled: false,
    dirty: true,
    revision: 0,
    savedRevision: 0,
    createdFrom,
    timepointLabels: cloneTimepointLabelMap(timepointLabels ?? new Map()),
  };
}

export function cloneTimepointLabelMap(source: ReadonlyMap<number, Uint32Array>): Map<number, Uint32Array> {
  const next = new Map<number, Uint32Array>();
  for (const [timepoint, labels] of source.entries()) {
    next.set(timepoint, labels.slice());
  }
  return next;
}

export function cloneEditableSegmentationChannel(
  source: EditableSegmentationChannel,
  options: {
    channelId: string;
    layerKey: string;
    name: string;
    createdFrom: EditableSegmentationCreatedFrom;
  }
): EditableSegmentationChannel {
  return createEditableSegmentationChannel({
    channelId: options.channelId,
    layerKey: options.layerKey,
    name: options.name,
    dimensions: { ...source.dimensions },
    volumeCount: source.volumeCount,
    createdFrom: options.createdFrom,
    labels: source.labels,
    timepointLabels: source.timepointLabels,
  });
}

export function getEditableVoxelCount(channel: Pick<EditableSegmentationChannel, 'dimensions'>): number {
  return channel.dimensions.width * channel.dimensions.height * channel.dimensions.depth;
}

export function getOrCreateEditableTimepointLabels(
  channel: EditableSegmentationChannel,
  timepoint: number
): Uint32Array {
  const safeTimepoint = Math.max(0, Math.min(channel.volumeCount - 1, Math.floor(timepoint)));
  const existing = channel.timepointLabels.get(safeTimepoint);
  if (existing) {
    return existing;
  }
  const labels = new Uint32Array(getEditableVoxelCount(channel));
  channel.timepointLabels.set(safeTimepoint, labels);
  return labels;
}

export function getEditableTimepointLabels(
  channel: EditableSegmentationChannel,
  timepoint: number
): Uint32Array | null {
  return channel.timepointLabels.get(Math.max(0, Math.min(channel.volumeCount - 1, Math.floor(timepoint)))) ?? null;
}

export function hasEditableLabelVoxels(channel: EditableSegmentationChannel, labelId: number): boolean {
  if (labelId <= 0) {
    return false;
  }
  for (const labels of channel.timepointLabels.values()) {
    for (let index = 0; index < labels.length; index += 1) {
      if ((labels[index] ?? 0) === labelId) {
        return true;
      }
    }
  }
  return false;
}

export function deleteEditableLabelInPlace(channel: EditableSegmentationChannel, labelIndex: number): void {
  if (channel.labels.length <= 1) {
    channel.labels = [{ name: '' }];
    channel.activeLabelIndex = 0;
    for (const labels of channel.timepointLabels.values()) {
      labels.fill(0);
    }
    return;
  }
  const labelId = labelIndex + 1;
  channel.labels.splice(labelIndex, 1);
  for (const labels of channel.timepointLabels.values()) {
    for (let index = 0; index < labels.length; index += 1) {
      const current = labels[index] ?? 0;
      if (current === labelId) {
        labels[index] = 0;
      } else if (current > labelId) {
        labels[index] = current - 1;
      }
    }
  }
  channel.activeLabelIndex = Math.max(0, Math.min(channel.activeLabelIndex, channel.labels.length - 1));
}

export function clearEditableSegmentationChannelInPlace(channel: EditableSegmentationChannel): void {
  channel.timepointLabels.clear();
  channel.labels = [{ name: '' }];
  channel.activeLabelIndex = 0;
}

export function getEditableChannelMaxLabel(channel: EditableSegmentationChannel): number {
  let max = channel.labels.length;
  for (const labels of channel.timepointLabels.values()) {
    for (let index = 0; index < labels.length; index += 1) {
      max = Math.max(max, labels[index] ?? 0);
    }
  }
  return max;
}

export function createEditableLoadedDatasetLayer(channel: EditableSegmentationChannel): LoadedDatasetLayer {
  return {
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
    min: 0,
    max: Math.max(1, getEditableChannelMaxLabel(channel)),
  };
}

type EditableSkipHierarchyLevel = VolumeBrickPageTable['skipHierarchy']['levels'][number];

function reduceSkipHierarchyLevel(child: EditableSkipHierarchyLevel): EditableSkipHierarchyLevel {
  const [childZ, childY, childX] = child.gridShape;
  const parentGridShape: [number, number, number] = [
    Math.max(1, Math.ceil(childZ / 2)),
    Math.max(1, Math.ceil(childY / 2)),
    Math.max(1, Math.ceil(childX / 2)),
  ];
  const [parentZ, parentY, parentX] = parentGridShape;
  const parentCount = parentZ * parentY * parentX;
  const parentOccupancy = new Uint8Array(parentCount);
  const parentMin = new Uint8Array(parentCount);
  const parentMax = new Uint8Array(parentCount);
  const childPlaneSize = childY * childX;
  const parentPlaneSize = parentY * parentX;

  for (let z = 0; z < parentZ; z += 1) {
    const childZStart = z * 2;
    for (let y = 0; y < parentY; y += 1) {
      const childYStart = y * 2;
      for (let x = 0; x < parentX; x += 1) {
        const childXStart = x * 2;
        const parentIndex = z * parentPlaneSize + y * parentX + x;
        let occupied = false;
        let localMin = 255;
        let localMax = 0;

        for (let dz = 0; dz < 2; dz += 1) {
          const sourceZ = childZStart + dz;
          if (sourceZ >= childZ) {
            continue;
          }
          for (let dy = 0; dy < 2; dy += 1) {
            const sourceY = childYStart + dy;
            if (sourceY >= childY) {
              continue;
            }
            for (let dx = 0; dx < 2; dx += 1) {
              const sourceX = childXStart + dx;
              if (sourceX >= childX) {
                continue;
              }
              const childIndex = sourceZ * childPlaneSize + sourceY * childX + sourceX;
              if ((child.occupancy[childIndex] ?? 0) === 0) {
                continue;
              }
              occupied = true;
              localMin = Math.min(localMin, child.min[childIndex] ?? 0);
              localMax = Math.max(localMax, child.max[childIndex] ?? 0);
            }
          }
        }

        if (occupied) {
          parentOccupancy[parentIndex] = 255;
          parentMin[parentIndex] = localMin;
          parentMax[parentIndex] = localMax;
        }
      }
    }
  }

  return {
    level: child.level + 1,
    gridShape: parentGridShape,
    occupancy: parentOccupancy,
    min: parentMin,
    max: parentMax,
  };
}

function buildEditableSkipHierarchy({
  gridShape,
  leafMin,
  leafMax,
  leafOccupancy,
}: {
  gridShape: SparseSegmentationBrickSize;
  leafMin: Uint8Array;
  leafMax: Uint8Array;
  leafOccupancy: Uint8Array;
}): VolumeBrickPageTable['skipHierarchy'] {
  const levels: EditableSkipHierarchyLevel[] = [{
    level: 0,
    gridShape,
    occupancy: leafOccupancy,
    min: leafMin,
    max: leafMax,
  }];
  while (true) {
    const current = levels[levels.length - 1]!;
    if (current.gridShape[0] === 1 && current.gridShape[1] === 1 && current.gridShape[2] === 1) {
      break;
    }
    levels.push(reduceSkipHierarchyLevel(current));
  }
  return { levels };
}

export function createEmptySegmentationBrickAtlas(
  channel: EditableSegmentationChannel,
  timepoint: number,
  brickSize: SparseSegmentationBrickSize = DEFAULT_ANNOTATION_BRICK_SIZE
): VolumeBrickAtlas {
  const gridShape = computeBrickGridShape(
    {
      width: channel.dimensions.width,
      height: channel.dimensions.height,
      depth: channel.dimensions.depth,
    },
    brickSize
  );
  const brickCount = gridShape[0] * gridShape[1] * gridShape[2];
  const chunkMin = new Uint8Array(brickCount);
  const chunkMax = new Uint8Array(brickCount);
  const leafOccupancy = new Uint8Array(brickCount);
  const pageTable: VolumeBrickPageTable = {
    layerKey: channel.layerKey,
    timepoint,
    scaleLevel: 0,
    gridShape,
    chunkShape: brickSize,
    volumeShape: [channel.dimensions.depth, channel.dimensions.height, channel.dimensions.width],
    skipHierarchy: buildEditableSkipHierarchy({
      gridShape,
      leafMin: chunkMin.slice(),
      leafMax: chunkMax.slice(),
      leafOccupancy,
    }),
    brickAtlasIndices: new Int32Array(brickCount).fill(-1),
    chunkMin,
    chunkMax,
    chunkOccupancy: new Float32Array(brickCount),
    occupiedBrickCount: 0,
    subcell: null,
  };
  return {
    layerKey: channel.layerKey,
    timepoint,
    scaleLevel: 0,
    kind: 'segmentation',
    pageTable,
    width: 1,
    height: 1,
    depth: 1,
    dataType: 'uint8',
    textureFormat: 'rgba',
    sourceChannels: 1,
    data: new Uint8Array(4),
    enabled: false,
  };
}

export function buildEditableSegmentationBrickAtlas({
  channel,
  timepoint,
  brickSize = DEFAULT_ANNOTATION_BRICK_SIZE,
}: {
  channel: EditableSegmentationChannel;
  timepoint: number;
  brickSize?: SparseSegmentationBrickSize;
}): VolumeBrickAtlas {
  const labels = getEditableTimepointLabels(channel, timepoint);
  if (!labels) {
    return createEmptySegmentationBrickAtlas(channel, timepoint, brickSize);
  }

  const { width, height, depth } = channel.dimensions;
  const gridShape = computeBrickGridShape({ width, height, depth }, brickSize);
  const brickCount = gridShape[0] * gridShape[1] * gridShape[2];
  const bricks = new Map<string, { coord: SparseSegmentationBrickCoord; voxels: SparseSegmentationLocalVoxel[] }>();

  for (let z = 0; z < depth; z += 1) {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const globalIndex = (z * height + y) * width + x;
        const label = labels[globalIndex] ?? 0;
        if (label === 0) {
          continue;
        }
        const coord = {
          z: Math.floor(z / brickSize[0]),
          y: Math.floor(y / brickSize[1]),
          x: Math.floor(x / brickSize[2]),
        };
        const key = coordKey(coord);
        let brick = bricks.get(key);
        if (!brick) {
          brick = { coord, voxels: [] };
          bricks.set(key, brick);
        }
        brick.voxels.push({
          offset: localOffsetForVoxel({ z, y, x }, brickSize),
          label,
        });
      }
    }
  }

  if (bricks.size === 0) {
    return createEmptySegmentationBrickAtlas(channel, timepoint, brickSize);
  }

  const sortedBricks = [...bricks.values()].sort(
    (left, right) => left.coord.z - right.coord.z || left.coord.y - right.coord.y || left.coord.x - right.coord.x
  );
  const brickAtlasIndices = new Int32Array(brickCount);
  brickAtlasIndices.fill(-1);
  const chunkMin = new Uint8Array(brickCount);
  const chunkMax = new Uint8Array(brickCount);
  const chunkOccupancy = new Float32Array(brickCount);
  const leafOccupancy = new Uint8Array(brickCount);
  const chunksPerPlane = gridShape[1] * gridShape[2];

  const [brickDepth, brickHeight, brickWidth] = brickSize;
  const atlasWidth = brickWidth;
  const atlasHeight = brickHeight;
  const atlasDepth = brickDepth * sortedBricks.length;
  const data = new Uint8Array(atlasWidth * atlasHeight * atlasDepth * 4);

  for (let slot = 0; slot < sortedBricks.length; slot += 1) {
    const brick = sortedBricks[slot]!;
    const pageIndex = brick.coord.z * chunksPerPlane + brick.coord.y * gridShape[2] + brick.coord.x;
    brickAtlasIndices[pageIndex] = slot;
    chunkMin[pageIndex] = 255;
    chunkMax[pageIndex] = 255;
    chunkOccupancy[pageIndex] = 1;
    leafOccupancy[pageIndex] = 255;

    for (const voxel of brick.voxels) {
      const local = localCoordForOffset(voxel.offset, brickSize);
      const atlasZ = slot * brickDepth + local.z;
      const target = ((atlasZ * atlasHeight + local.y) * atlasWidth + local.x) * 4;
      data[target] = voxel.label & 0xff;
      data[target + 1] = (voxel.label >>> 8) & 0xff;
      data[target + 2] = (voxel.label >>> 16) & 0xff;
      data[target + 3] = Math.floor(voxel.label / 0x1000000) & 0xff;
    }
  }

  const pageTable: VolumeBrickPageTable = {
    layerKey: channel.layerKey,
    timepoint,
    scaleLevel: 0,
    gridShape,
    chunkShape: brickSize,
    volumeShape: [depth, height, width],
    skipHierarchy: buildEditableSkipHierarchy({
      gridShape,
      leafMin: chunkMin.slice(),
      leafMax: chunkMax.slice(),
      leafOccupancy,
    }),
    brickAtlasIndices,
    chunkMin,
    chunkMax,
    chunkOccupancy,
    occupiedBrickCount: sortedBricks.length,
    subcell: null,
  };

  return {
    layerKey: channel.layerKey,
    timepoint,
    scaleLevel: 0,
    kind: 'segmentation',
    pageTable,
    width: atlasWidth,
    height: atlasHeight,
    depth: atlasDepth,
    dataType: 'uint8',
    textureFormat: 'rgba',
    sourceChannels: 1,
    data,
    enabled: true,
  };
}

export function createEditableViewerLayer({
  channel,
  visible,
  brickAtlas,
  settings = createDefaultLayerSettings(),
}: {
  channel: EditableSegmentationChannel;
  visible: boolean;
  brickAtlas: VolumeBrickAtlas | null;
  settings?: LayerSettings;
}): ViewerLayer {
  const layer = createEditableLoadedDatasetLayer(channel);
  const samplingMode = resolveLayerSamplingMode(settings.renderStyle, settings.samplingMode, true);
  return {
    key: channel.layerKey,
    label: channel.name,
    channelName: channel.name,
    fullResolutionWidth: channel.dimensions.width,
    fullResolutionHeight: channel.dimensions.height,
    fullResolutionDepth: channel.dimensions.depth,
    volume: null,
    channels: 1,
    dataType: 'uint32',
    min: layer.min,
    max: layer.max,
    visible: visible && channel.overlayVisible,
    isHoverTarget: true,
    sliderRange: settings.sliderRange,
    minSliderIndex: settings.minSliderIndex,
    maxSliderIndex: settings.maxSliderIndex,
    brightnessSliderIndex: settings.brightnessSliderIndex,
    contrastSliderIndex: settings.contrastSliderIndex,
    windowMin: settings.windowMin,
    windowMax: settings.windowMax,
    color: settings.color,
    offsetX: settings.xOffset,
    offsetY: settings.yOffset,
    renderStyle: settings.renderStyle,
    blDensityScale: settings.blDensityScale,
    blBackgroundCutoff: settings.blBackgroundCutoff,
    blOpacityScale: settings.blOpacityScale,
    blEarlyExitAlpha: settings.blEarlyExitAlpha,
    mipEarlyExitThreshold: settings.mipEarlyExitThreshold,
    invert: settings.invert,
    samplingMode,
    isSegmentation: true,
    mode: undefined,
    sliceIndex: undefined,
    scaleLevel: 0,
    brickPageTable: brickAtlas?.pageTable ?? null,
    brickAtlas,
    backgroundMask: null,
    playbackRole: undefined,
  };
}
