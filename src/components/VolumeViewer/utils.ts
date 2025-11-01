import * as THREE from 'three';

import { HISTOGRAM_FIRST_VALID_BIN } from '../../autoContrast';
import { DEFAULT_LAYER_COLOR, normalizeHexColor } from '../../layerColors';
import type { NormalizedVolume } from '../../volumeProcessing';

export type VrHistogramShape = {
  points: Array<{ x: number; y: number }>;
  isEmpty: boolean;
};

export function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export function getExpectedSliceBufferLength(volume: NormalizedVolume) {
  const pixelCount = volume.width * volume.height;
  return pixelCount * 4;
}

export function formatNormalizedIntensity(value: number): string {
  const fixed = value.toFixed(3);
  return fixed.replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '');
}

export function clampValue(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

export function computeHistogramShape(
  histogram: Uint32Array | null,
  width: number,
  height: number
): VrHistogramShape {
  if (!histogram || histogram.length === 0) {
    return { points: [], isEmpty: true };
  }

  let maxCount = 0;
  for (let i = HISTOGRAM_FIRST_VALID_BIN; i < histogram.length; i++) {
    const value = histogram[i];
    if (value > maxCount) {
      maxCount = value;
    }
  }

  if (maxCount === 0) {
    return { points: [], isEmpty: true };
  }

  const bins = histogram.length;
  const span = bins > 1 ? bins - 1 : bins;
  const step = span > 0 ? width / span : width;
  const points: Array<{ x: number; y: number }> = [];

  for (let i = HISTOGRAM_FIRST_VALID_BIN; i < bins; i++) {
    const count = histogram[i];
    const normalized = count / maxCount;
    const x = step * i;
    const y = height - normalized * height;
    points.push({ x, y });
  }

  return { points, isEmpty: false };
}

export function computeHistogramMappingPoints(
  windowMin: number,
  windowMax: number,
  defaultMin: number,
  defaultMax: number,
  width: number,
  height: number
): Array<{ x: number; y: number }> {
  const defaultRange = defaultMax - defaultMin;
  const windowWidth = windowMax - windowMin;

  if (!(defaultRange > 0) || !(windowWidth > 0)) {
    return [];
  }

  const lowerFraction = (windowMin - defaultMin) / defaultRange;
  const upperFraction = (windowMax - defaultMin) / defaultRange;
  const fractions: number[] = [0, 1];

  if (lowerFraction > 0 && lowerFraction < 1) {
    fractions.push(lowerFraction);
  }

  if (upperFraction > 0 && upperFraction < 1) {
    fractions.push(upperFraction);
  }

  fractions.sort((a, b) => a - b);

  const uniqueFractions: number[] = [];
  for (const fraction of fractions) {
    if (
      uniqueFractions.length === 0 ||
      Math.abs(fraction - uniqueFractions[uniqueFractions.length - 1]) > 1e-6
    ) {
      uniqueFractions.push(fraction);
    }
  }

  return uniqueFractions.map((fraction) => {
    const clampedFraction = clampValue(fraction, 0, 1);
    const x = clampedFraction * width;
    const value = defaultMin + clampedFraction * defaultRange;
    const normalized = clampValue((value - windowMin) / windowWidth, 0, 1);
    const y = (1 - normalized) * height;
    return { x, y };
  });
}

export function prepareSliceTexture(
  volume: NormalizedVolume,
  sliceIndex: number,
  existingBuffer: Uint8Array | null
) {
  const { width, height, depth, channels, normalized } = volume;
  const pixelCount = width * height;
  const targetLength = pixelCount * 4;

  let buffer = existingBuffer ?? null;
  if (!buffer || buffer.length !== targetLength) {
    buffer = new Uint8Array(targetLength);
  }

  const maxIndex = Math.max(0, depth - 1);
  const clampedIndex = Math.min(Math.max(sliceIndex, 0), maxIndex);
  const sliceStride = pixelCount * channels;
  const sliceOffset = clampedIndex * sliceStride;

  for (let i = 0; i < pixelCount; i++) {
    const sourceOffset = sliceOffset + i * channels;
    const targetOffset = i * 4;

    const red = normalized[sourceOffset] ?? 0;
    const green = channels > 1 ? normalized[sourceOffset + 1] ?? 0 : red;
    const blue = channels > 2 ? normalized[sourceOffset + 2] ?? 0 : green;
    const alpha = channels > 3 ? normalized[sourceOffset + 3] ?? 0 : 255;

    if (channels === 1) {
      buffer[targetOffset] = red;
      buffer[targetOffset + 1] = red;
      buffer[targetOffset + 2] = red;
      buffer[targetOffset + 3] = 255;
    } else if (channels === 2) {
      buffer[targetOffset] = red;
      buffer[targetOffset + 1] = green;
      buffer[targetOffset + 2] = 0;
      buffer[targetOffset + 3] = 255;
    } else if (channels === 3) {
      buffer[targetOffset] = red;
      buffer[targetOffset + 1] = green;
      buffer[targetOffset + 2] = blue;
      buffer[targetOffset + 3] = 255;
    } else {
      buffer[targetOffset] = red;
      buffer[targetOffset + 1] = green;
      buffer[targetOffset + 2] = blue;
      buffer[targetOffset + 3] = alpha;
    }
  }

  return { data: buffer, format: THREE.RGBAFormat };
}

export function createColormapTexture(hexColor: string) {
  const normalized = normalizeHexColor(hexColor, DEFAULT_LAYER_COLOR);
  const red = parseInt(normalized.slice(1, 3), 16) / 255;
  const green = parseInt(normalized.slice(3, 5), 16) / 255;
  const blue = parseInt(normalized.slice(5, 7), 16) / 255;

  const size = 256;
  const data = new Uint8Array(size * 4);
  for (let i = 0; i < size; i++) {
    const intensity = i / (size - 1);
    data[i * 4 + 0] = Math.round(red * intensity * 255);
    data[i * 4 + 1] = Math.round(green * intensity * 255);
    data[i * 4 + 2] = Math.round(blue * intensity * 255);
    data[i * 4 + 3] = Math.round(intensity * 255);
  }
  const texture = new THREE.DataTexture(data, size, 1, THREE.RGBAFormat);
  texture.needsUpdate = true;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
