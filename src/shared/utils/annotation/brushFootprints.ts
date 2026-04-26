import type { AnnotateDimensionMode } from '../../../types/annotation';

export type BrushOffset = {
  dx: number;
  dy: number;
  dz: number;
};

const footprintCache = new Map<string, BrushOffset[]>();

function normalizeRadius(radius: number): number {
  if (!Number.isFinite(radius)) {
    return 1;
  }
  return Math.max(1, Math.round(radius));
}

export function computeAnnotationBrushOffsets(
  radius: number,
  mode: AnnotateDimensionMode
): BrushOffset[] {
  const safeRadius = normalizeRadius(radius);
  const key = `${mode}:${safeRadius}`;
  const cached = footprintCache.get(key);
  if (cached) {
    return cached;
  }

  if (safeRadius === 1) {
    const single = [{ dx: 0, dy: 0, dz: 0 }];
    footprintCache.set(key, single);
    return single;
  }

  const threshold = safeRadius * safeRadius;
  const offsets: BrushOffset[] = [];
  for (let dz = mode === '2d' ? 0 : -safeRadius + 1; dz <= (mode === '2d' ? 0 : safeRadius - 1); dz += 1) {
    for (let dy = -safeRadius + 1; dy <= safeRadius - 1; dy += 1) {
      for (let dx = -safeRadius + 1; dx <= safeRadius - 1; dx += 1) {
        if (dx * dx + dy * dy + dz * dz < threshold) {
          offsets.push({ dx, dy, dz });
        }
      }
    }
  }

  const result = offsets.length > 0 ? offsets : [{ dx: 0, dy: 0, dz: 0 }];
  footprintCache.set(key, result);
  return result;
}

export function clampVoxelCoordinate(
  value: number,
  maxExclusive: number
): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(Math.max(0, maxExclusive - 1), Math.round(value)));
}
