import type { VolumeDataType, VolumeTypedArray } from '../../types/volume';

export const BACKGROUND_MASK_VISIBLE = 0;
export const BACKGROUND_MASK_MASKED = 255;

export type ParsedBackgroundMaskValues = {
  values: number[];
  error: string | null;
};

export type BackgroundMaskVolume = {
  width: number;
  height: number;
  depth: number;
  data: Uint8Array;
};

export type BackgroundMaskVisibleRegion = {
  hasVisibleVoxels: boolean;
  minVoxel: [number, number, number];
  maxVoxel: [number, number, number];
  minFaceFractions: [number, number, number];
  maxFaceFractions: [number, number, number];
};

const INTEGER_DATA_TYPE_RANGE: Readonly<Record<
  Exclude<VolumeDataType, 'float32' | 'float64'>,
  { min: number; max: number }
>> = {
  uint8: { min: 0, max: 255 },
  int8: { min: -128, max: 127 },
  uint16: { min: 0, max: 65535 },
  int16: { min: -32768, max: 32767 },
  uint32: { min: 0, max: 4294967295 },
  int32: { min: -2147483648, max: 2147483647 }
};

function isFiniteNumber(value: number): boolean {
  return Number.isFinite(value) && !Number.isNaN(value);
}

export function parseBackgroundMaskValues(input: string): ParsedBackgroundMaskValues {
  const tokens = input
    .split(';')
    .map((token) => token.trim())
    .filter((token) => token.length > 0);

  if (tokens.length === 0) {
    return {
      values: [],
      error: 'Enter one or more numeric values separated by semicolons.'
    };
  }

  const values: number[] = [];
  for (const token of tokens) {
    const parsed = Number(token);
    if (!isFiniteNumber(parsed)) {
      return {
        values: [],
        error: `Invalid background-mask value "${token}".`
      };
    }
    values.push(parsed);
  }

  return { values, error: null };
}

export function coerceBackgroundMaskValuesForDataType(
  values: number[],
  dataType: VolumeDataType
): number[] {
  if (values.length === 0) {
    throw new Error('Background mask requires at least one value.');
  }

  if (dataType === 'float32') {
    const unique = new Set<number>();
    for (const value of values) {
      if (!isFiniteNumber(value)) {
        throw new Error('Background mask values must be finite numbers.');
      }
      unique.add(new Float32Array([value])[0] ?? 0);
    }
    return [...unique];
  }

  if (dataType === 'float64') {
    const unique = new Set<number>();
    for (const value of values) {
      if (!isFiniteNumber(value)) {
        throw new Error('Background mask values must be finite numbers.');
      }
      unique.add(value);
    }
    return [...unique];
  }

  const range = INTEGER_DATA_TYPE_RANGE[dataType];
  const unique = new Set<number>();
  for (const value of values) {
    if (!isFiniteNumber(value) || Math.trunc(value) !== value) {
      throw new Error(
        `Background mask value ${String(value)} must be an integer for ${dataType} data.`
      );
    }
    if (value < range.min || value > range.max) {
      throw new Error(
        `Background mask value ${String(value)} is out of range for ${dataType} data.`
      );
    }
    unique.add(value);
  }
  return [...unique];
}

function buildMaskedValueSet(values: readonly number[]): Set<number> {
  return new Set<number>(values);
}

export function buildBackgroundMaskFromTypedArray({
  width,
  height,
  depth,
  channels,
  source,
  values
}: {
  width: number;
  height: number;
  depth: number;
  channels: number;
  source: VolumeTypedArray;
  values: readonly number[];
}): BackgroundMaskVolume {
  const voxelCount = width * height * depth;
  const expectedLength = voxelCount * channels;
  if (source.length !== expectedLength) {
    throw new Error(
      `Background mask source length mismatch: expected ${expectedLength}, got ${source.length}.`
    );
  }
  if (channels <= 0) {
    throw new Error(`Background mask requires a positive channel count, got ${channels}.`);
  }

  const maskedValues = buildMaskedValueSet(values);
  const mask = new Uint8Array(voxelCount);
  for (let voxelIndex = 0; voxelIndex < voxelCount; voxelIndex += 1) {
    const voxelBase = voxelIndex * channels;
    const firstValue = source[voxelBase] as number;
    if (!maskedValues.has(firstValue)) {
      continue;
    }
    let matches = true;
    for (let channel = 1; channel < channels; channel += 1) {
      if ((source[voxelBase + channel] as number) !== firstValue) {
        matches = false;
        break;
      }
    }
    if (matches) {
      mask[voxelIndex] = BACKGROUND_MASK_MASKED;
    }
  }

  return { width, height, depth, data: mask };
}

export function findMinMaxExcludingBackgroundMask({
  source,
  channels,
  mask
}: {
  source: VolumeTypedArray;
  channels: number;
  mask: Uint8Array | null;
}): { min: number; max: number } {
  if (channels <= 0) {
    throw new Error(`Expected a positive channel count, got ${channels}.`);
  }
  if (source.length % channels !== 0) {
    throw new Error(
      `Background mask min/max scan length mismatch: ${source.length} is not divisible by ${channels}.`
    );
  }
  const voxelCount = source.length / channels;
  if (mask && mask.length !== voxelCount) {
    throw new Error(
      `Background mask length mismatch while scanning min/max: expected ${voxelCount}, got ${mask.length}.`
    );
  }

  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let voxelIndex = 0; voxelIndex < voxelCount; voxelIndex += 1) {
    if (mask && (mask[voxelIndex] ?? 0) > 0) {
      continue;
    }
    const voxelBase = voxelIndex * channels;
    for (let channel = 0; channel < channels; channel += 1) {
      const value = source[voxelBase + channel] as number;
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
  }
  return { min, max };
}

export function applyBackgroundMaskInPlace({
  target,
  channels,
  mask
}: {
  target: Uint8Array | Uint16Array;
  channels: number;
  mask: Uint8Array;
}): void {
  if (channels <= 0) {
    throw new Error(`Expected a positive channel count, got ${channels}.`);
  }
  const voxelCount = mask.length;
  const expectedLength = voxelCount * channels;
  if (target.length !== expectedLength) {
    throw new Error(
      `Background mask target length mismatch: expected ${expectedLength}, got ${target.length}.`
    );
  }

  for (let voxelIndex = 0; voxelIndex < voxelCount; voxelIndex += 1) {
    if ((mask[voxelIndex] ?? 0) === 0) {
      continue;
    }
    const voxelBase = voxelIndex * channels;
    target.fill(0, voxelBase, voxelBase + channels);
  }
}

export function computeBackgroundMaskVisibleRegion(
  mask: BackgroundMaskVolume
): BackgroundMaskVisibleRegion {
  let minX = mask.width;
  let minY = mask.height;
  let minZ = mask.depth;
  let maxX = -1;
  let maxY = -1;
  let maxZ = -1;

  for (let z = 0; z < mask.depth; z += 1) {
    for (let y = 0; y < mask.height; y += 1) {
      for (let x = 0; x < mask.width; x += 1) {
        const index = (z * mask.height + y) * mask.width + x;
        if ((mask.data[index] ?? 0) !== BACKGROUND_MASK_VISIBLE) {
          continue;
        }
        if (x < minX) {
          minX = x;
        }
        if (y < minY) {
          minY = y;
        }
        if (z < minZ) {
          minZ = z;
        }
        if (x > maxX) {
          maxX = x;
        }
        if (y > maxY) {
          maxY = y;
        }
        if (z > maxZ) {
          maxZ = z;
        }
      }
    }
  }

  if (maxX < minX || maxY < minY || maxZ < minZ) {
    return {
      hasVisibleVoxels: false,
      minVoxel: [0, 0, 0],
      maxVoxel: [0, 0, 0],
      minFaceFractions: [1, 1, 1],
      maxFaceFractions: [0, 0, 0]
    };
  }

  return {
    hasVisibleVoxels: true,
    minVoxel: [minX, minY, minZ],
    maxVoxel: [maxX, maxY, maxZ],
    minFaceFractions: [
      minX / Math.max(1, mask.width),
      minY / Math.max(1, mask.height),
      minZ / Math.max(1, mask.depth)
    ],
    maxFaceFractions: [
      (maxX + 1) / Math.max(1, mask.width),
      (maxY + 1) / Math.max(1, mask.height),
      (maxZ + 1) / Math.max(1, mask.depth)
    ]
  };
}

export function downsampleBackgroundMaskByAllMasked(mask: BackgroundMaskVolume): BackgroundMaskVolume {
  const nextDepth = Math.max(1, Math.ceil(mask.depth / 2));
  const nextHeight = Math.max(1, Math.ceil(mask.height / 2));
  const nextWidth = Math.max(1, Math.ceil(mask.width / 2));
  const downsampled = new Uint8Array(nextDepth * nextHeight * nextWidth);

  for (let z = 0; z < nextDepth; z += 1) {
    const sourceZStart = z * 2;
    const sourceZEnd = Math.min(mask.depth, sourceZStart + 2);
    for (let y = 0; y < nextHeight; y += 1) {
      const sourceYStart = y * 2;
      const sourceYEnd = Math.min(mask.height, sourceYStart + 2);
      for (let x = 0; x < nextWidth; x += 1) {
        const sourceXStart = x * 2;
        const sourceXEnd = Math.min(mask.width, sourceXStart + 2);
        const destinationIndex = (z * nextHeight + y) * nextWidth + x;
        let allMasked = true;
        for (let sourceZ = sourceZStart; sourceZ < sourceZEnd; sourceZ += 1) {
          for (let sourceY = sourceYStart; sourceY < sourceYEnd; sourceY += 1) {
            for (let sourceX = sourceXStart; sourceX < sourceXEnd; sourceX += 1) {
              const sourceIndex = (sourceZ * mask.height + sourceY) * mask.width + sourceX;
              if ((mask.data[sourceIndex] ?? 0) === BACKGROUND_MASK_VISIBLE) {
                allMasked = false;
                break;
              }
            }
            if (!allMasked) {
              break;
            }
          }
          if (!allMasked) {
            break;
          }
        }
        if (allMasked) {
          downsampled[destinationIndex] = BACKGROUND_MASK_MASKED;
        }
      }
    }
  }

  return {
    width: nextWidth,
    height: nextHeight,
    depth: nextDepth,
    data: downsampled
  };
}
