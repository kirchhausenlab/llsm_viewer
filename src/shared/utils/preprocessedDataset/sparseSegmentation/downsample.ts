import type { SparseSegmentationGlobalVoxel } from './types';

function targetKey(z: number, y: number, x: number): string {
  return `${z}:${y}:${x}`;
}

function parseTargetKey(key: string): { z: number; y: number; x: number } {
  const [z, y, x] = key.split(':').map((value) => Number(value));
  return { z: z ?? 0, y: y ?? 0, x: x ?? 0 };
}

function breakTie(left: number, right: number): number {
  if (left === 0 && right !== 0) {
    return right;
  }
  if (right === 0 && left !== 0) {
    return left;
  }
  return Math.min(left, right);
}

export function downsampleSparseSegmentationVoxels({
  voxels,
  width,
  height,
  depth
}: {
  voxels: readonly SparseSegmentationGlobalVoxel[];
  width: number;
  height: number;
  depth: number;
}): {
  width: number;
  height: number;
  depth: number;
  voxels: SparseSegmentationGlobalVoxel[];
} {
  const nextDepth = Math.max(1, Math.ceil(depth / 2));
  const nextHeight = Math.max(1, Math.ceil(height / 2));
  const nextWidth = Math.max(1, Math.ceil(width / 2));
  const votes = new Map<string, { nonzeroTotal: number; labels: Map<number, number> }>();
  for (const voxel of voxels) {
    const z = Math.floor(voxel.z / 2);
    const y = Math.floor(voxel.y / 2);
    const x = Math.floor(voxel.x / 2);
    const key = targetKey(z, y, x);
    let entry = votes.get(key);
    if (!entry) {
      entry = { nonzeroTotal: 0, labels: new Map() };
      votes.set(key, entry);
    }
    entry.nonzeroTotal += 1;
    entry.labels.set(voxel.label, (entry.labels.get(voxel.label) ?? 0) + 1);
  }
  const output: SparseSegmentationGlobalVoxel[] = [];
  for (const [key, entry] of votes) {
    const coord = parseTargetKey(key);
    const sourceZStart = coord.z * 2;
    const sourceYStart = coord.y * 2;
    const sourceXStart = coord.x * 2;
    const validSourceCount =
      (Math.min(depth, sourceZStart + 2) - sourceZStart) *
      (Math.min(height, sourceYStart + 2) - sourceYStart) *
      (Math.min(width, sourceXStart + 2) - sourceXStart);
    let winnerLabel = 0;
    let winnerCount = validSourceCount - entry.nonzeroTotal;
    for (const [label, count] of entry.labels) {
      if (count > winnerCount) {
        winnerLabel = label;
        winnerCount = count;
      } else if (count === winnerCount) {
        winnerLabel = breakTie(winnerLabel, label);
      }
    }
    if (winnerLabel !== 0) {
      output.push({ ...coord, label: winnerLabel });
    }
  }
  output.sort((left, right) => left.z - right.z || left.y - right.y || left.x - right.x || left.label - right.label);
  return {
    width: nextWidth,
    height: nextHeight,
    depth: nextDepth,
    voxels: output
  };
}
