import * as THREE from 'three';

const MAJOR_GRID_TARGET_DIVISIONS = 8;
const FAR_GRID_SPACING_MULTIPLIER = 4;

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
  gridSpacing: number;
  gridLineStrength: number;
  gridColor: string;
  farGridSpacing: number;
  farGridLineStrength: number;
  farGridColor: string;
};

export function resolveBackgroundGridStyle({
  floorColor,
  maxDimension,
}: {
  floorColor: string;
  maxDimension: number;
}): BackgroundGridStyle {
  const safeMaxDimension = Number.isFinite(maxDimension) && maxDimension > 0 ? maxDimension : 1;
  const gridSpacing = Math.max(1, chooseNiceStep(safeMaxDimension / MAJOR_GRID_TARGET_DIVISIONS));
  const farGridSpacing = Math.max(gridSpacing * 2, chooseNiceStep(gridSpacing * FAR_GRID_SPACING_MULTIPLIER));

  const baseColor = new THREE.Color(floorColor);
  const luminance = clamp01(0.2126 * baseColor.r + 0.7152 * baseColor.g + 0.0722 * baseColor.b);
  const gridColor = baseColor.clone();
  const farGridColor = baseColor.clone();

  if (luminance >= 0.55) {
    gridColor.multiplyScalar(0.62);
    farGridColor.multiplyScalar(0.74);
  } else {
    gridColor.lerp(new THREE.Color(1, 1, 1), 0.5);
    farGridColor.lerp(new THREE.Color(1, 1, 1), 0.34);
  }

  return {
    gridSpacing,
    gridLineStrength: 0.5,
    gridColor: `#${gridColor.getHexString()}`,
    farGridSpacing,
    farGridLineStrength: 0.34,
    farGridColor: `#${farGridColor.getHexString()}`,
  };
}
