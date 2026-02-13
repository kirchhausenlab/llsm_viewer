import { HISTOGRAM_FIRST_VALID_BIN } from '../../../../autoContrast';

export type HudPoint = { x: number; y: number };

export const formatNormalizedIntensity = (value: number): string => {
  const fixed = value.toFixed(3);
  return fixed.replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '');
};

export const clampToRange = (value: number, min: number, max: number): number => {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
};

export const computeHistogramShape = (
  histogram: Uint32Array | null,
  width: number,
  height: number
): { points: HudPoint[]; isEmpty: boolean } => {
  if (!histogram || histogram.length === 0) {
    return { points: [], isEmpty: true };
  }

  let maxCount = 0;
  for (let index = HISTOGRAM_FIRST_VALID_BIN; index < histogram.length; index += 1) {
    const value = histogram[index];
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
  const points: HudPoint[] = [];

  for (let index = HISTOGRAM_FIRST_VALID_BIN; index < bins; index += 1) {
    const normalized = histogram[index] / maxCount;
    points.push({
      x: step * index,
      y: height - normalized * height
    });
  }

  return { points, isEmpty: false };
};

export const computeHistogramMappingPoints = (
  windowMin: number,
  windowMax: number,
  defaultMin: number,
  defaultMax: number,
  width: number,
  height: number
): HudPoint[] => {
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

  const points: HudPoint[] = [];
  for (const fraction of uniqueFractions) {
    const clampedFraction = clampToRange(fraction, 0, 1);
    const x = clampedFraction * width;
    const value = defaultMin + clampedFraction * defaultRange;
    const normalized = clampToRange((value - windowMin) / windowWidth, 0, 1);
    points.push({ x, y: (1 - normalized) * height });
  }

  return points;
};
