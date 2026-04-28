import type { LoadedDatasetLayer } from '../../../hooks/dataset';
import type { ViewerLayer } from '../../../ui/contracts/viewerLayer';
import type {
  EditableSegmentationBrick,
  EditableSegmentationChannel,
  EditableSegmentationCreatedFrom,
  EditableSegmentationLabel,
  EditableSegmentationTimepointState,
} from '../../../types/annotation';
import type { VolumeBrickAtlas, VolumeBrickPageTable } from '../../../core/volumeProvider';
import {
  brickCoordForVoxel,
  brickIndex,
  computeBrickGridShape,
  coordKey,
  globalCoordForLocalOffset,
  localOffsetForCoord,
  localOffsetForVoxel,
  validBrickLocalSize,
  type SparseSegmentationBrickCoord,
  type SparseSegmentationBrickSize,
  type SparseSegmentationGlobalVoxel,
  type SparseSegmentationLocalVoxel,
} from '../preprocessedDataset/sparseSegmentation';
import {
  createDefaultLayerSettings,
  resolveLayerSamplingMode,
  type LayerSettings,
} from '../../../state/layerSettings';
import {
  resolvePackedBrickSlotCoordinates,
  resolvePackedBrickSlotGridLayout,
} from '../sparseSegmentationAtlasLayout';

export const DEFAULT_ANNOTATION_BRICK_SIZE: SparseSegmentationBrickSize = [32, 32, 32];
export const MIN_ANNOTATION_RADIUS = 1;
export const DEFAULT_ANNOTATION_RADIUS = 5;
export const MAX_ANNOTATION_RADIUS = 10;

type EditableSkipHierarchyLevel = VolumeBrickPageTable['skipHierarchy']['levels'][number];

export type EditableVoxelWriteResult = {
  changed: boolean;
  previous: number;
  current: number;
  brickKey: string | null;
};

export type EditableSparseVoxel = SparseSegmentationGlobalVoxel & {
  timepoint: number;
  brickCoord: SparseSegmentationBrickCoord;
  localOffset: number;
};

export type EditableOccupiedBounds = {
  min: { z: number; y: number; x: number };
  max: { z: number; y: number; x: number };
};

function cloneLabels(labels: readonly EditableSegmentationLabel[]): EditableSegmentationLabel[] {
  return labels.map((label) => ({ name: label.name }));
}

function normalizeTimepoint(channel: Pick<EditableSegmentationChannel, 'volumeCount'>, timepoint: number): number {
  return Math.max(0, Math.min(channel.volumeCount - 1, Math.floor(timepoint)));
}

function brickCapacity(brickSize: SparseSegmentationBrickSize): number {
  return brickSize[0] * brickSize[1] * brickSize[2];
}

function createEditableBrick(
  coord: SparseSegmentationBrickCoord,
  brickSize: SparseSegmentationBrickSize,
): EditableSegmentationBrick {
  return {
    coord: { ...coord },
    labels: new Uint32Array(brickCapacity(brickSize)),
    nonzeroCount: 0,
    minLabel: 0,
    maxLabel: 0,
    localBounds: null,
    revision: 0,
    dirty: true,
    statsDirty: true,
  };
}

function cloneEditableBrick(brick: EditableSegmentationBrick): EditableSegmentationBrick {
  return {
    coord: { ...brick.coord },
    labels: brick.labels.slice(),
    nonzeroCount: brick.nonzeroCount,
    minLabel: brick.minLabel,
    maxLabel: brick.maxLabel,
    localBounds: brick.localBounds
      ? {
          min: { ...brick.localBounds.min },
          max: { ...brick.localBounds.max },
        }
      : null,
    revision: brick.revision,
    dirty: brick.dirty,
    statsDirty: brick.statsDirty,
  };
}

export function createEditableTimepointState(
  brickSize: SparseSegmentationBrickSize = DEFAULT_ANNOTATION_BRICK_SIZE,
): EditableSegmentationTimepointState {
  return {
    brickSize: [...brickSize] as SparseSegmentationBrickSize,
    bricks: new Map(),
    revision: 0,
    dirtyBrickKeys: new Set(),
    deletedBrickKeys: new Set(),
    renderAtlas: null,
    renderAtlasRevision: -1,
  };
}

export function cloneEditableTimepointState(
  source: EditableSegmentationTimepointState,
): EditableSegmentationTimepointState {
  const bricks = new Map<string, EditableSegmentationBrick>();
  for (const [key, brick] of source.bricks.entries()) {
    bricks.set(key, cloneEditableBrick(brick));
  }
  return {
    brickSize: [...source.brickSize] as SparseSegmentationBrickSize,
    bricks,
    revision: source.revision,
    dirtyBrickKeys: new Set(source.dirtyBrickKeys),
    deletedBrickKeys: new Set(source.deletedBrickKeys),
    renderAtlas: null,
    renderAtlasRevision: -1,
  };
}

export function cloneEditableTimepointStateMap(
  source: ReadonlyMap<number, EditableSegmentationTimepointState>,
): Map<number, EditableSegmentationTimepointState> {
  const next = new Map<number, EditableSegmentationTimepointState>();
  for (const [timepoint, state] of source.entries()) {
    next.set(timepoint, cloneEditableTimepointState(state));
  }
  return next;
}

export function createEditableSegmentationChannel({
  channelId,
  layerKey,
  name,
  dimensions,
  volumeCount,
  createdFrom,
  labels,
  timepoints,
  timepointLabels,
}: {
  channelId: string;
  layerKey: string;
  name: string;
  dimensions: EditableSegmentationChannel['dimensions'];
  volumeCount: number;
  createdFrom: EditableSegmentationCreatedFrom;
  labels?: EditableSegmentationLabel[];
  timepoints?: Map<number, EditableSegmentationTimepointState>;
  timepointLabels?: Map<number, Uint32Array>;
}): EditableSegmentationChannel {
  const channel: EditableSegmentationChannel = {
    channelId,
    layerKey,
    name,
    dimensions,
    volumeCount: Math.max(1, Math.floor(volumeCount)),
    labels: labels === undefined ? [{ name: '' }] : cloneLabels(labels),
    activeLabelIndex: 0,
    mode: '3d',
    brushMode: 'brush',
    brushShape: 'circle',
    hoverMode: '3d',
    radius: DEFAULT_ANNOTATION_RADIUS,
    overlayVisible: true,
    enabled: false,
    dirty: true,
    revision: 0,
    savedRevision: 0,
    createdFrom,
    timepoints: cloneEditableTimepointStateMap(timepoints ?? new Map()),
  };
  if (timepointLabels) {
    for (const [timepoint, denseLabels] of timepointLabels.entries()) {
      replaceEditableTimepointFromDenseLabels(channel, timepoint, denseLabels);
    }
  }
  return channel;
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
    timepoints: source.timepoints,
  });
}

export function getEditableVoxelCount(channel: Pick<EditableSegmentationChannel, 'dimensions'>): number {
  return channel.dimensions.width * channel.dimensions.height * channel.dimensions.depth;
}

function voxelCoordForIndex(
  channel: Pick<EditableSegmentationChannel, 'dimensions'>,
  index: number,
): { z: number; y: number; x: number } {
  const { width, height } = channel.dimensions;
  const safeIndex = Math.max(0, Math.floor(index));
  const z = Math.floor(safeIndex / (width * height));
  const remainder = safeIndex - z * width * height;
  const y = Math.floor(remainder / width);
  const x = remainder - y * width;
  return { z, y, x };
}

function indexForVoxel(
  channel: Pick<EditableSegmentationChannel, 'dimensions'>,
  voxel: { z: number; y: number; x: number },
): number {
  return (voxel.z * channel.dimensions.height + voxel.y) * channel.dimensions.width + voxel.x;
}

function isVoxelInBounds(
  channel: Pick<EditableSegmentationChannel, 'dimensions'>,
  voxel: { z: number; y: number; x: number },
): boolean {
  return (
    voxel.z >= 0 &&
    voxel.y >= 0 &&
    voxel.x >= 0 &&
    voxel.z < channel.dimensions.depth &&
    voxel.y < channel.dimensions.height &&
    voxel.x < channel.dimensions.width
  );
}

function isIndexInBounds(channel: Pick<EditableSegmentationChannel, 'dimensions'>, index: number): boolean {
  return Number.isFinite(index) && index >= 0 && index < getEditableVoxelCount(channel);
}

export function getOrCreateEditableTimepointState(
  channel: EditableSegmentationChannel,
  timepoint: number,
): EditableSegmentationTimepointState {
  const safeTimepoint = normalizeTimepoint(channel, timepoint);
  const existing = channel.timepoints.get(safeTimepoint);
  if (existing) {
    return existing;
  }
  const state = createEditableTimepointState(DEFAULT_ANNOTATION_BRICK_SIZE);
  channel.timepoints.set(safeTimepoint, state);
  return state;
}

export function getEditableTimepointState(
  channel: EditableSegmentationChannel,
  timepoint: number,
): EditableSegmentationTimepointState | null {
  return channel.timepoints.get(normalizeTimepoint(channel, timepoint)) ?? null;
}

function markTimepointStateDirty(
  state: EditableSegmentationTimepointState,
  brickKey: string | null,
  deleted = false,
): void {
  state.revision += 1;
  state.renderAtlasRevision = -1;
  if (brickKey) {
    if (deleted) {
      state.deletedBrickKeys.add(brickKey);
      state.dirtyBrickKeys.delete(brickKey);
    } else {
      state.dirtyBrickKeys.add(brickKey);
      state.deletedBrickKeys.delete(brickKey);
    }
  }
}

export function refreshEditableBrickStats(
  brick: EditableSegmentationBrick,
  brickSize: SparseSegmentationBrickSize,
  dimensions?: EditableSegmentationChannel['dimensions'],
): boolean {
  let nonzeroCount = 0;
  let minLabel = Number.POSITIVE_INFINITY;
  let maxLabel = 0;
  let minZ = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minX = Number.POSITIVE_INFINITY;
  let maxZ = 0;
  let maxY = 0;
  let maxX = 0;
  const localSize = dimensions
    ? validBrickLocalSize({
        dimensions,
        brickCoord: brick.coord,
        brickSize,
      })
    : brickSize;

  for (let localZ = 0; localZ < localSize[0]; localZ += 1) {
    for (let localY = 0; localY < localSize[1]; localY += 1) {
      for (let localX = 0; localX < localSize[2]; localX += 1) {
        const offset = localOffsetForCoord({ z: localZ, y: localY, x: localX }, brickSize);
        const label = brick.labels[offset] ?? 0;
        if (label === 0) {
          continue;
        }
        nonzeroCount += 1;
        minLabel = Math.min(minLabel, label);
        maxLabel = Math.max(maxLabel, label);
        minZ = Math.min(minZ, localZ);
        minY = Math.min(minY, localY);
        minX = Math.min(minX, localX);
        maxZ = Math.max(maxZ, localZ);
        maxY = Math.max(maxY, localY);
        maxX = Math.max(maxX, localX);
      }
    }
  }

  brick.nonzeroCount = nonzeroCount;
  brick.minLabel = nonzeroCount > 0 ? minLabel : 0;
  brick.maxLabel = maxLabel;
  brick.localBounds =
    nonzeroCount > 0
      ? {
          min: { z: minZ, y: minY, x: minX },
          max: { z: maxZ, y: maxY, x: maxX },
        }
      : null;
  brick.statsDirty = false;
  return nonzeroCount > 0;
}

function ensureBrickStats(
  brick: EditableSegmentationBrick,
  brickSize: SparseSegmentationBrickSize,
  dimensions: EditableSegmentationChannel['dimensions'],
): boolean {
  return brick.statsDirty ? refreshEditableBrickStats(brick, brickSize, dimensions) : brick.nonzeroCount > 0;
}

export function getEditableLabelAtIndex(
  channel: EditableSegmentationChannel,
  timepoint: number,
  index: number,
): number {
  if (!isIndexInBounds(channel, index)) {
    return 0;
  }
  const state = getEditableTimepointState(channel, timepoint);
  if (!state) {
    return 0;
  }
  const voxel = voxelCoordForIndex(channel, index);
  const brickCoord = brickCoordForVoxel(voxel, state.brickSize);
  const brick = state.bricks.get(coordKey(brickCoord));
  if (!brick) {
    return 0;
  }
  return brick.labels[localOffsetForVoxel(voxel, state.brickSize)] ?? 0;
}

export function setEditableLabelAtIndex(
  channel: EditableSegmentationChannel,
  timepoint: number,
  index: number,
  label: number,
): EditableVoxelWriteResult {
  if (!isIndexInBounds(channel, index)) {
    return { changed: false, previous: 0, current: 0, brickKey: null };
  }
  const nextLabel = Math.max(0, Math.floor(label));
  const state = getOrCreateEditableTimepointState(channel, timepoint);
  const voxel = voxelCoordForIndex(channel, index);
  const brickCoord = brickCoordForVoxel(voxel, state.brickSize);
  const key = coordKey(brickCoord);
  let brick = state.bricks.get(key) ?? null;
  const localOffset = localOffsetForVoxel(voxel, state.brickSize);
  const previous = brick?.labels[localOffset] ?? 0;
  if (previous === nextLabel) {
    return { changed: false, previous, current: previous, brickKey: key };
  }
  if (!brick) {
    if (nextLabel === 0) {
      return { changed: false, previous: 0, current: 0, brickKey: key };
    }
    brick = createEditableBrick(brickCoord, state.brickSize);
    state.bricks.set(key, brick);
  }

  brick.labels[localOffset] = nextLabel;
  if (previous === 0 && nextLabel > 0) {
    brick.nonzeroCount += 1;
  } else if (previous > 0 && nextLabel === 0) {
    brick.nonzeroCount = Math.max(0, brick.nonzeroCount - 1);
  }
  brick.revision += 1;
  brick.dirty = true;
  brick.statsDirty = true;

  if (brick.nonzeroCount <= 0) {
    state.bricks.delete(key);
    markTimepointStateDirty(state, key, true);
  } else {
    markTimepointStateDirty(state, key, false);
  }
  return { changed: true, previous, current: nextLabel, brickKey: key };
}

export function materializeEditableTimepointLabels(
  channel: EditableSegmentationChannel,
  timepoint: number,
): Uint32Array {
  const labels = new Uint32Array(getEditableVoxelCount(channel));
  const state = getEditableTimepointState(channel, timepoint);
  if (!state) {
    return labels;
  }
  for (const brick of state.bricks.values()) {
    const localSize = validBrickLocalSize({
      dimensions: channel.dimensions,
      brickCoord: brick.coord,
      brickSize: state.brickSize,
    });
    for (let localZ = 0; localZ < localSize[0]; localZ += 1) {
      for (let localY = 0; localY < localSize[1]; localY += 1) {
        for (let localX = 0; localX < localSize[2]; localX += 1) {
          const localOffset = localOffsetForCoord({ z: localZ, y: localY, x: localX }, state.brickSize);
          const label = brick.labels[localOffset] ?? 0;
          if (label === 0) {
            continue;
          }
          const global = {
            z: brick.coord.z * state.brickSize[0] + localZ,
            y: brick.coord.y * state.brickSize[1] + localY,
            x: brick.coord.x * state.brickSize[2] + localX,
          };
          labels[indexForVoxel(channel, global)] = label;
        }
      }
    }
  }
  return labels;
}

export function getEditableTimepointLabels(
  channel: EditableSegmentationChannel,
  timepoint: number,
): Uint32Array | null {
  const state = getEditableTimepointState(channel, timepoint);
  return state && state.bricks.size > 0 ? materializeEditableTimepointLabels(channel, timepoint) : null;
}

export function replaceEditableTimepointFromDenseLabels(
  channel: EditableSegmentationChannel,
  timepoint: number,
  labels: Uint32Array,
): EditableSegmentationTimepointState {
  const state = createEditableTimepointState(DEFAULT_ANNOTATION_BRICK_SIZE);
  const voxelCount = Math.min(labels.length, getEditableVoxelCount(channel));
  for (let index = 0; index < voxelCount; index += 1) {
    const label = labels[index] ?? 0;
    if (label === 0) {
      continue;
    }
    const voxel = voxelCoordForIndex(channel, index);
    const brickCoord = brickCoordForVoxel(voxel, state.brickSize);
    const key = coordKey(brickCoord);
    let brick = state.bricks.get(key);
    if (!brick) {
      brick = createEditableBrick(brickCoord, state.brickSize);
      state.bricks.set(key, brick);
    }
    brick.labels[localOffsetForVoxel(voxel, state.brickSize)] = label;
    brick.nonzeroCount += 1;
    brick.statsDirty = true;
    brick.dirty = true;
    state.dirtyBrickKeys.add(key);
  }
  for (const brick of state.bricks.values()) {
    refreshEditableBrickStats(brick, state.brickSize, channel.dimensions);
  }
  state.revision += 1;
  channel.timepoints.set(normalizeTimepoint(channel, timepoint), state);
  return state;
}

export function addEditableSparseVoxel(
  channel: EditableSegmentationChannel,
  timepoint: number,
  voxel: SparseSegmentationGlobalVoxel,
): void {
  if (!isVoxelInBounds(channel, voxel) || voxel.label === 0) {
    return;
  }
  setEditableLabelAtIndex(channel, timepoint, indexForVoxel(channel, voxel), voxel.label);
}

export function addEditableSparseBrickVoxels({
  channel,
  timepoint,
  brickCoord,
  brickSize = DEFAULT_ANNOTATION_BRICK_SIZE,
  voxels,
}: {
  channel: EditableSegmentationChannel;
  timepoint: number;
  brickCoord: SparseSegmentationBrickCoord;
  brickSize?: SparseSegmentationBrickSize;
  voxels: Iterable<SparseSegmentationLocalVoxel>;
}): void {
  const state = getOrCreateEditableTimepointState(channel, timepoint);
  const touchedKeys = new Set<string>();
  for (const voxel of voxels) {
    if (voxel.label === 0) {
      continue;
    }
    const global = globalCoordForLocalOffset(brickCoord, voxel.offset, brickSize);
    if (!isVoxelInBounds(channel, global)) {
      continue;
    }
    const editableBrickCoord = brickCoordForVoxel(global, state.brickSize);
    const key = coordKey(editableBrickCoord);
    let brick = state.bricks.get(key);
    if (!brick) {
      brick = createEditableBrick(editableBrickCoord, state.brickSize);
      state.bricks.set(key, brick);
    }
    const localOffset = localOffsetForVoxel(global, state.brickSize);
    const previous = brick.labels[localOffset] ?? 0;
    if (previous === voxel.label) {
      continue;
    }
    if (previous === 0) {
      brick.nonzeroCount += 1;
    }
    brick.labels[localOffset] = voxel.label;
    brick.revision += 1;
    brick.dirty = true;
    brick.statsDirty = true;
    touchedKeys.add(key);
    markTimepointStateDirty(state, key, false);
  }
  for (const key of touchedKeys) {
    const brick = state.bricks.get(key);
    if (!brick) {
      continue;
    }
    if (!brick.statsDirty) {
      continue;
    }
    if (!refreshEditableBrickStats(brick, state.brickSize, channel.dimensions)) {
      state.bricks.delete(key);
      markTimepointStateDirty(state, key, true);
    }
  }
}

export function forEachEditableSparseVoxel(
  channel: EditableSegmentationChannel,
  timepoint: number,
  callback: (voxel: EditableSparseVoxel) => void,
): void {
  const state = getEditableTimepointState(channel, timepoint);
  if (!state) {
    return;
  }
  const sortedBricks = [...state.bricks.values()].sort(
    (left, right) => left.coord.z - right.coord.z || left.coord.y - right.coord.y || left.coord.x - right.coord.x,
  );
  for (const brick of sortedBricks) {
    if (!ensureBrickStats(brick, state.brickSize, channel.dimensions)) {
      continue;
    }
    const localSize = validBrickLocalSize({
      dimensions: channel.dimensions,
      brickCoord: brick.coord,
      brickSize: state.brickSize,
    });
    for (let localZ = 0; localZ < localSize[0]; localZ += 1) {
      for (let localY = 0; localY < localSize[1]; localY += 1) {
        for (let localX = 0; localX < localSize[2]; localX += 1) {
          const localOffset = localOffsetForCoord({ z: localZ, y: localY, x: localX }, state.brickSize);
          const label = brick.labels[localOffset] ?? 0;
          if (label === 0) {
            continue;
          }
          callback({
            timepoint: normalizeTimepoint(channel, timepoint),
            z: brick.coord.z * state.brickSize[0] + localZ,
            y: brick.coord.y * state.brickSize[1] + localY,
            x: brick.coord.x * state.brickSize[2] + localX,
            label,
            brickCoord: brick.coord,
            localOffset,
          });
        }
      }
    }
  }
}

export function hasEditableLabelVoxels(channel: EditableSegmentationChannel, labelId: number): boolean {
  if (labelId <= 0) {
    return false;
  }
  for (const state of channel.timepoints.values()) {
    for (const brick of state.bricks.values()) {
      const localSize = validBrickLocalSize({
        dimensions: channel.dimensions,
        brickCoord: brick.coord,
        brickSize: state.brickSize,
      });
      for (let localZ = 0; localZ < localSize[0]; localZ += 1) {
        for (let localY = 0; localY < localSize[1]; localY += 1) {
          for (let localX = 0; localX < localSize[2]; localX += 1) {
            const offset = localOffsetForCoord({ z: localZ, y: localY, x: localX }, state.brickSize);
            if ((brick.labels[offset] ?? 0) === labelId) {
              return true;
            }
          }
        }
      }
    }
  }
  return false;
}

export function deleteEditableLabelInPlace(channel: EditableSegmentationChannel, labelIndex: number): void {
  if (channel.labels.length <= 1) {
    channel.labels = [];
    channel.activeLabelIndex = 0;
    for (const state of channel.timepoints.values()) {
      state.bricks.clear();
      state.dirtyBrickKeys.clear();
      state.deletedBrickKeys.clear();
      state.revision += 1;
      state.renderAtlas = null;
      state.renderAtlasRevision = -1;
    }
    return;
  }
  const labelId = labelIndex + 1;
  channel.labels.splice(labelIndex, 1);
  for (const state of channel.timepoints.values()) {
    for (const [key, brick] of [...state.bricks.entries()]) {
      const localSize = validBrickLocalSize({
        dimensions: channel.dimensions,
        brickCoord: brick.coord,
        brickSize: state.brickSize,
      });
      let changed = false;
      for (let localZ = 0; localZ < localSize[0]; localZ += 1) {
        for (let localY = 0; localY < localSize[1]; localY += 1) {
          for (let localX = 0; localX < localSize[2]; localX += 1) {
            const offset = localOffsetForCoord({ z: localZ, y: localY, x: localX }, state.brickSize);
            const current = brick.labels[offset] ?? 0;
            if (current === labelId) {
              brick.labels[offset] = 0;
              changed = true;
            } else if (current > labelId) {
              brick.labels[offset] = current - 1;
              changed = true;
            }
          }
        }
      }
      if (!changed) {
        continue;
      }
      brick.revision += 1;
      brick.dirty = true;
      brick.statsDirty = true;
      if (!refreshEditableBrickStats(brick, state.brickSize, channel.dimensions)) {
        state.bricks.delete(key);
        markTimepointStateDirty(state, key, true);
      } else {
        markTimepointStateDirty(state, key, false);
      }
    }
  }
  channel.activeLabelIndex = Math.max(0, Math.min(channel.activeLabelIndex, channel.labels.length - 1));
}

export function clearEditableSegmentationChannelInPlace(channel: EditableSegmentationChannel): void {
  channel.timepoints.clear();
  channel.labels = [];
  channel.activeLabelIndex = 0;
}

export function getEditableChannelMaxLabel(channel: EditableSegmentationChannel): number {
  let max = channel.labels.length;
  for (const state of channel.timepoints.values()) {
    for (const brick of state.bricks.values()) {
      if (ensureBrickStats(brick, state.brickSize, channel.dimensions)) {
        max = Math.max(max, brick.maxLabel);
      }
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
              if ((child.occupancy[childIndex] ?? 0) !== 0) {
                occupied = true;
              }
            }
          }
        }

        if (occupied) {
          parentOccupancy[parentIndex] = 255;
          parentMin[parentIndex] = 255;
          parentMax[parentIndex] = 255;
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
    slotGrid: { x: 1, y: 1, z: 1 },
    renderStrategy: 'full-resident-packed',
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
  const state = getEditableTimepointState(channel, timepoint);
  if (!state || state.bricks.size === 0) {
    return createEmptySegmentationBrickAtlas(channel, timepoint, brickSize);
  }
  if (state.renderAtlas && state.renderAtlasRevision === state.revision) {
    return state.renderAtlas;
  }

  const { width, height, depth } = channel.dimensions;
  const gridShape = computeBrickGridShape({ width, height, depth }, state.brickSize);
  const brickCount = gridShape[0] * gridShape[1] * gridShape[2];
  const sortedBricks = [...state.bricks.values()]
    .filter((brick) => ensureBrickStats(brick, state.brickSize, channel.dimensions))
    .sort((left, right) => left.coord.z - right.coord.z || left.coord.y - right.coord.y || left.coord.x - right.coord.x);

  if (sortedBricks.length === 0) {
    state.renderAtlas = createEmptySegmentationBrickAtlas(channel, timepoint, state.brickSize);
    state.renderAtlasRevision = state.revision;
    return state.renderAtlas;
  }

  const brickAtlasIndices = new Int32Array(brickCount);
  brickAtlasIndices.fill(-1);
  const chunkMin = new Uint8Array(brickCount);
  const chunkMax = new Uint8Array(brickCount);
  const chunkOccupancy = new Float32Array(brickCount);
  const leafOccupancy = new Uint8Array(brickCount);

  const [brickDepth, brickHeight, brickWidth] = state.brickSize;
  const packedLayout = resolvePackedBrickSlotGridLayout({
    slotCount: sortedBricks.length,
    brickWidth,
    brickHeight,
    brickDepth,
  }) ?? {
    slotGrid: { x: 1, y: 1, z: sortedBricks.length },
    atlasSize: {
      width: brickWidth,
      height: brickHeight,
      depth: brickDepth * sortedBricks.length,
    },
  };
  const atlasWidth = packedLayout.atlasSize.width;
  const atlasHeight = packedLayout.atlasSize.height;
  const atlasDepth = packedLayout.atlasSize.depth;
  const data = new Uint8Array(atlasWidth * atlasHeight * atlasDepth * 4);

  for (let slot = 0; slot < sortedBricks.length; slot += 1) {
    const brick = sortedBricks[slot]!;
    const pageIndex = brickIndex(brick.coord, gridShape);
    brickAtlasIndices[pageIndex] = slot;
    chunkMin[pageIndex] = 255;
    chunkMax[pageIndex] = 255;
    chunkOccupancy[pageIndex] = 1;
    leafOccupancy[pageIndex] = 255;

    const slotCoords = resolvePackedBrickSlotCoordinates(slot, packedLayout.slotGrid);
    const atlasXBase = slotCoords.x * brickWidth;
    const atlasYBase = slotCoords.y * brickHeight;
    const atlasZBase = slotCoords.z * brickDepth;
    const localSize = validBrickLocalSize({
      dimensions: channel.dimensions,
      brickCoord: brick.coord,
      brickSize: state.brickSize,
    });
    for (let localZ = 0; localZ < localSize[0]; localZ += 1) {
      for (let localY = 0; localY < localSize[1]; localY += 1) {
        for (let localX = 0; localX < localSize[2]; localX += 1) {
          const offset = localOffsetForCoord({ z: localZ, y: localY, x: localX }, state.brickSize);
          const label = brick.labels[offset] ?? 0;
          if (label === 0) {
            continue;
          }
          const atlasZ = atlasZBase + localZ;
          const atlasY = atlasYBase + localY;
          const atlasX = atlasXBase + localX;
          const target = ((atlasZ * atlasHeight + atlasY) * atlasWidth + atlasX) * 4;
          data[target] = label & 0xff;
          data[target + 1] = (label >>> 8) & 0xff;
          data[target + 2] = (label >>> 16) & 0xff;
          data[target + 3] = Math.floor(label / 0x1000000) & 0xff;
        }
      }
    }
  }

  const pageTable: VolumeBrickPageTable = {
    layerKey: channel.layerKey,
    timepoint,
    scaleLevel: 0,
    gridShape,
    chunkShape: state.brickSize,
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

  state.renderAtlas = {
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
    slotGrid: packedLayout.slotGrid,
    renderStrategy: 'full-resident-packed',
  };
  state.renderAtlasRevision = state.revision;
  state.dirtyBrickKeys.clear();
  state.deletedBrickKeys.clear();
  for (const brick of sortedBricks) {
    brick.dirty = false;
  }
  return state.renderAtlas;
}

export function getEditableTimepointOccupiedBounds(
  channel: EditableSegmentationChannel,
  timepoint: number,
): EditableOccupiedBounds | null {
  const state = getEditableTimepointState(channel, timepoint);
  if (!state) {
    return null;
  }
  let minZ = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minX = Number.POSITIVE_INFINITY;
  let maxZ = -1;
  let maxY = -1;
  let maxX = -1;
  for (const brick of state.bricks.values()) {
    if (!ensureBrickStats(brick, state.brickSize, channel.dimensions) || !brick.localBounds) {
      continue;
    }
    minZ = Math.min(minZ, brick.coord.z * state.brickSize[0] + brick.localBounds.min.z);
    minY = Math.min(minY, brick.coord.y * state.brickSize[1] + brick.localBounds.min.y);
    minX = Math.min(minX, brick.coord.x * state.brickSize[2] + brick.localBounds.min.x);
    maxZ = Math.max(maxZ, brick.coord.z * state.brickSize[0] + brick.localBounds.max.z);
    maxY = Math.max(maxY, brick.coord.y * state.brickSize[1] + brick.localBounds.max.y);
    maxX = Math.max(maxX, brick.coord.x * state.brickSize[2] + brick.localBounds.max.x);
  }
  if (!Number.isFinite(minZ) || maxZ < minZ || maxY < minY || maxX < minX) {
    return null;
  }
  return {
    min: { z: minZ, y: minY, x: minX },
    max: { z: maxZ, y: maxY, x: maxX },
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
  const occupiedBounds = brickAtlas?.enabled
    ? getEditableTimepointOccupiedBounds(channel, brickAtlas.pageTable.timepoint)
    : null;
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
    renderBounds: occupiedBounds
      ? {
          enabled: true,
          min: [
            Math.max(-0.5, occupiedBounds.min.x - 0.5),
            Math.max(-0.5, occupiedBounds.min.y - 0.5),
            Math.max(-0.5, occupiedBounds.min.z - 0.5),
          ],
          max: [
            Math.min(channel.dimensions.width - 0.5, occupiedBounds.max.x + 0.5),
            Math.min(channel.dimensions.height - 0.5, occupiedBounds.max.y + 0.5),
            Math.min(channel.dimensions.depth - 0.5, occupiedBounds.max.z + 0.5),
          ],
        }
      : null,
    playbackRole: undefined,
  };
}
