import {
  BACKGROUND_MASK_MASKED,
  type BackgroundMaskVolume
} from './backgroundMask';

export type DeskewAngleUnit = 'degrees' | 'radians';
export type DeskewDirection = 'X' | 'Y';

export const DESKEW_NO_SKEW_RADIANS = Math.PI / 2;
export const DESKEW_ANGLE_EPSILON_RADIANS = 1e-6;
const DESKEW_BOUNDARY_EPSILON = 1e-9;

export type DeskewConfig = {
  angleRadians: number;
  direction: DeskewDirection;
  maskVoxels: boolean;
};

export type DeskewGeometry = {
  angleRadians: number;
  direction: DeskewDirection;
  axisSize: number;
  depth: number;
  minimumAngleRadians: number;
  shiftVoxels: number;
  validSpanVoxels: number;
  noSkew: boolean;
};

export function degreesToRadians(value: number): number {
  return (value * Math.PI) / 180;
}

export function radiansToDegrees(value: number): number {
  return (value * 180) / Math.PI;
}

export function normalizeDeskewAngleRadians(angleRadians: number): number {
  if (!Number.isFinite(angleRadians)) {
    return angleRadians;
  }
  const sign = angleRadians < 0 ? -1 : 1;
  const absolute = Math.abs(angleRadians);
  if (Math.abs(absolute - DESKEW_NO_SKEW_RADIANS) <= DESKEW_ANGLE_EPSILON_RADIANS) {
    return sign * DESKEW_NO_SKEW_RADIANS;
  }
  return angleRadians;
}

export function parseDeskewAngleInput(
  input: string,
  unit: DeskewAngleUnit
): { angleRadians: number | null; error: string | null } {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return { angleRadians: null, error: 'Enter a skew angle before preprocessing.' };
  }
  const parsed = Number(trimmed.replace(/,/g, '.'));
  if (!Number.isFinite(parsed)) {
    return { angleRadians: null, error: 'Skew angle must be a finite number.' };
  }
  const angleRadians = unit === 'degrees' ? degreesToRadians(parsed) : parsed;
  const absolute = Math.abs(angleRadians);
  if (absolute <= DESKEW_ANGLE_EPSILON_RADIANS) {
    return { angleRadians: null, error: 'Skew angle must be non-zero.' };
  }
  if (absolute > DESKEW_NO_SKEW_RADIANS + DESKEW_ANGLE_EPSILON_RADIANS) {
    return {
      angleRadians: null,
      error: 'Skew angle must be between -90° and 90°, excluding 0°.'
    };
  }
  return { angleRadians: normalizeDeskewAngleRadians(angleRadians), error: null };
}

function formatAngleRadians(value: number): string {
  return `${radiansToDegrees(value).toFixed(3)}° (${value.toFixed(6)} rad)`;
}

export function resolveDeskewGeometry({
  width,
  height,
  depth,
  angleRadians,
  direction
}: {
  width: number;
  height: number;
  depth: number;
  angleRadians: number;
  direction: DeskewDirection;
}): DeskewGeometry {
  if (direction !== 'X' && direction !== 'Y') {
    throw new Error(`Unsupported skew direction "${String(direction)}".`);
  }
  if (![width, height, depth].every((value) => Number.isFinite(value) && value > 0)) {
    throw new Error('Deskew requires positive volume dimensions.');
  }

  const axisSize = direction === 'X' ? width : height;
  const normalizedAngle = normalizeDeskewAngleRadians(angleRadians);
  const absoluteAngle = Math.abs(normalizedAngle);
  const minimumAngleRadians = Math.atan(depth / axisSize);

  if (!Number.isFinite(normalizedAngle)) {
    throw new Error('Skew angle must be a finite number.');
  }
  if (absoluteAngle > DESKEW_NO_SKEW_RADIANS + DESKEW_ANGLE_EPSILON_RADIANS) {
    throw new Error('Skew angle must be between -90° and 90°, excluding 0°.');
  }
  if (absoluteAngle <= minimumAngleRadians + DESKEW_ANGLE_EPSILON_RADIANS) {
    throw new Error(
      `Skew angle leaves no valid data interior for ${direction} skew: ` +
        `|angle| must be greater than ${formatAngleRadians(minimumAngleRadians)} ` +
        `for volume shape ${depth}×${height}×${width} (Z×Y×X).`
    );
  }

  if (Math.abs(absoluteAngle - DESKEW_NO_SKEW_RADIANS) <= DESKEW_ANGLE_EPSILON_RADIANS) {
    return {
      angleRadians: normalizedAngle,
      direction,
      axisSize,
      depth,
      minimumAngleRadians,
      shiftVoxels: 0,
      validSpanVoxels: axisSize,
      noSkew: true
    };
  }

  const shiftVoxels = depth / Math.tan(absoluteAngle);
  const validSpanVoxels = axisSize - shiftVoxels;
  if (!Number.isFinite(shiftVoxels) || validSpanVoxels <= DESKEW_ANGLE_EPSILON_RADIANS) {
    throw new Error(
      `Skew angle leaves no valid data interior for ${direction} skew: ` +
        `|angle| must be greater than ${formatAngleRadians(minimumAngleRadians)} ` +
        `for volume shape ${depth}×${height}×${width} (Z×Y×X).`
    );
  }

  return {
    angleRadians: normalizedAngle,
    direction,
    axisSize,
    depth,
    minimumAngleRadians,
    shiftVoxels,
    validSpanVoxels,
    noSkew: false
  };
}

export function computeDeskewGlassTiltRadians(angleRadians: number): number {
  const normalizedAngle = normalizeDeskewAngleRadians(angleRadians);
  if (!Number.isFinite(normalizedAngle)) {
    return 0;
  }
  return normalizedAngle;
}

export function buildDeskewBackgroundMask({
  width,
  height,
  depth,
  angleRadians,
  direction
}: {
  width: number;
  height: number;
  depth: number;
  angleRadians: number;
  direction: DeskewDirection;
}): BackgroundMaskVolume {
  const geometry = resolveDeskewGeometry({
    width,
    height,
    depth,
    angleRadians,
    direction
  });
  const data = new Uint8Array(width * height * depth);
  if (geometry.noSkew) {
    return { width, height, depth, data };
  }

  const shift = geometry.shiftVoxels;
  const signedPositive = geometry.angleRadians >= 0;
  for (let z = 0; z < depth; z += 1) {
    const progress = (z + 0.5) / depth;
    const low = signedPositive ? shift * progress : shift * (1 - progress);
    const high = signedPositive
      ? geometry.axisSize - shift + shift * progress
      : geometry.axisSize - shift * progress;

    if (direction === 'X') {
      for (let x = 0; x < width; x += 1) {
        const xCenter = x + 0.5;
        if (xCenter + DESKEW_BOUNDARY_EPSILON >= low && xCenter < high - DESKEW_BOUNDARY_EPSILON) {
          continue;
        }
        for (let y = 0; y < height; y += 1) {
          data[(z * height + y) * width + x] = BACKGROUND_MASK_MASKED;
        }
      }
    } else {
      for (let y = 0; y < height; y += 1) {
        const yCenter = y + 0.5;
        if (yCenter + DESKEW_BOUNDARY_EPSILON >= low && yCenter < high - DESKEW_BOUNDARY_EPSILON) {
          continue;
        }
        const rowOffset = (z * height + y) * width;
        data.fill(BACKGROUND_MASK_MASKED, rowOffset, rowOffset + width);
      }
    }
  }

  return { width, height, depth, data };
}
