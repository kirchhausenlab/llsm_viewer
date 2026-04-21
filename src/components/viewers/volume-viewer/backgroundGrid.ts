import * as THREE from 'three';

const MAJOR_GRID_TARGET_DIVISIONS = 8;
const MINOR_GRID_SUBDIVISIONS = 5;

function chooseNiceStep(targetStep: number): number {
  const safeTarget = Number.isFinite(targetStep) && targetStep > 0 ? targetStep : 1;
  const exponent = Math.floor(Math.log10(safeTarget));
  const base = 10 ** exponent;
  const normalized = safeTarget / base;

  if (normalized <= 1) {
    return base;
  }
  if (normalized <= 2) {
    return 2 * base;
  }
  if (normalized <= 5) {
    return 5 * base;
  }
  return 10 * base;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

export type BackgroundGridStyle = {
  majorSpacing: number;
  minorSpacing: number;
  majorLineStrength: number;
  minorLineStrength: number;
  minorFadeStart: number;
  minorFadeEnd: number;
  majorColor: string;
  minorColor: string;
};

export function resolveBackgroundGridStyle({
  floorColor,
  maxDimension,
  boundsRadius,
}: {
  floorColor: string;
  maxDimension: number;
  boundsRadius: number;
}): BackgroundGridStyle {
  const safeMaxDimension = Number.isFinite(maxDimension) && maxDimension > 0 ? maxDimension : 1;
  const safeBoundsRadius = Number.isFinite(boundsRadius) && boundsRadius > 0 ? boundsRadius : 1;
  const majorSpacing = Math.max(1, chooseNiceStep(safeMaxDimension / MAJOR_GRID_TARGET_DIVISIONS));
  const minorSpacing = Math.max(1, majorSpacing / MINOR_GRID_SUBDIVISIONS);

  const baseColor = new THREE.Color(floorColor);
  const luminance = clamp01(0.2126 * baseColor.r + 0.7152 * baseColor.g + 0.0722 * baseColor.b);
  const majorColor = baseColor.clone();
  const minorColor = baseColor.clone();

  if (luminance >= 0.55) {
    majorColor.multiplyScalar(0.62);
    minorColor.multiplyScalar(0.8);
  } else {
    majorColor.lerp(new THREE.Color(1, 1, 1), 0.5);
    minorColor.lerp(new THREE.Color(1, 1, 1), 0.28);
  }

  return {
    majorSpacing,
    minorSpacing,
    majorLineStrength: 0.5,
    minorLineStrength: 0.24,
    minorFadeStart: safeBoundsRadius * 1.5,
    minorFadeEnd: safeBoundsRadius * 4.5,
    majorColor: `#${majorColor.getHexString()}`,
    minorColor: `#${minorColor.getHexString()}`,
  };
}
