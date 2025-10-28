import { useMemo } from 'react';
import { getVolumeHistogram } from '../autoContrast';
import type { NormalizedVolume } from '../volumeProcessing';

const HISTOGRAM_WIDTH = 255;
const HISTOGRAM_HEIGHT = 100;

const clamp = (value: number, min: number, max: number): number => {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
};

type BrightnessContrastHistogramProps = {
  volume: NormalizedVolume | null;
  windowMin: number;
  windowMax: number;
  defaultMin: number;
  defaultMax: number;
  sliderRange: number;
  className?: string;
};

type HistogramShape = {
  path: string;
  isEmpty: boolean;
};

const createHistogramPath = (histogram: Uint32Array | null): HistogramShape => {
  if (!histogram || histogram.length === 0) {
    return { path: '', isEmpty: true };
  }

  let maxCount = 0;
  for (let i = 0; i < histogram.length; i++) {
    const value = histogram[i];
    if (value > maxCount) {
      maxCount = value;
    }
  }

  if (maxCount === 0) {
    return { path: '', isEmpty: true };
  }

  const bins = histogram.length;
  const width = bins > 1 ? bins - 1 : bins;
  const step = width > 0 ? HISTOGRAM_WIDTH / width : HISTOGRAM_WIDTH;
  const commands: string[] = [`M0 ${HISTOGRAM_HEIGHT}`];

  for (let i = 0; i < bins; i++) {
    const count = histogram[i];
    const x = step * i;
    const normalized = count / maxCount;
    const y = HISTOGRAM_HEIGHT - normalized * HISTOGRAM_HEIGHT;
    commands.push(`L${x.toFixed(2)} ${y.toFixed(2)}`);
  }

  commands.push(`L${HISTOGRAM_WIDTH.toFixed(2)} ${HISTOGRAM_HEIGHT}`);
  commands.push('Z');

  return { path: commands.join(' '), isEmpty: false };
};

const createMappingPath = (
  windowMin: number,
  windowMax: number,
  defaultMin: number,
  defaultMax: number,
  sliderRange: number
): string => {
  const defaultRange = defaultMax - defaultMin;
  if (!(defaultRange > 0) || !(sliderRange > 0)) {
    return '';
  }

  const denom = Math.max(Math.round(sliderRange) - 1, 1);
  const quantize = (value: number) => {
    const normalized = (value - defaultMin) / defaultRange;
    const index = Math.round(normalized * denom);
    const clampedIndex = clamp(index, 0, denom);
    return denom > 0 ? clampedIndex / denom : 0;
  };

  const safeMin = Math.min(windowMin, windowMax);
  const safeMax = Math.max(windowMin, windowMax);

  let minFraction = quantize(safeMin);
  let maxFraction = quantize(safeMax);

  if (minFraction > maxFraction) {
    const temp = minFraction;
    minFraction = maxFraction;
    maxFraction = temp;
  }

  const toX = (fraction: number) => clamp(fraction, 0, 1) * HISTOGRAM_WIDTH;
  const minX = toX(minFraction);
  const maxX = toX(maxFraction);
  const parts: string[] = [`M0 ${HISTOGRAM_HEIGHT}`, `L${minX.toFixed(2)} ${HISTOGRAM_HEIGHT}`];

  if (maxX <= minX) {
    parts.push(`L${minX.toFixed(2)} 0`);
  } else {
    parts.push(`L${maxX.toFixed(2)} 0`);
  }

  parts.push(`L${HISTOGRAM_WIDTH} 0`);

  return parts.join(' ');
};

function BrightnessContrastHistogram({
  volume,
  windowMin,
  windowMax,
  defaultMin,
  defaultMax,
  sliderRange,
  className
}: BrightnessContrastHistogramProps) {
  const histogram = volume ? getVolumeHistogram(volume) : null;

  const histogramShape = useMemo(() => createHistogramPath(histogram), [histogram]);

  const mappingPath = useMemo(
    () => createMappingPath(windowMin, windowMax, defaultMin, defaultMax, sliderRange),
    [windowMin, windowMax, defaultMin, defaultMax, sliderRange]
  );

  const containerClassName = className
    ? `brightness-contrast-histogram ${className}`
    : 'brightness-contrast-histogram';
  const figureClassName = histogramShape.isEmpty
    ? 'brightness-contrast-histogram__figure is-empty'
    : 'brightness-contrast-histogram__figure';

  return (
    <div className={containerClassName} aria-hidden={histogramShape.isEmpty}>
      <svg
        className={figureClassName}
        viewBox={`0 0 ${HISTOGRAM_WIDTH} ${HISTOGRAM_HEIGHT}`}
        preserveAspectRatio="none"
        role="presentation"
      >
        <rect
          className="brightness-contrast-histogram__background"
          x={0}
          y={0}
          width={HISTOGRAM_WIDTH}
          height={HISTOGRAM_HEIGHT}
          rx={8}
          ry={8}
        />
        {histogramShape.path ? (
          <path className="brightness-contrast-histogram__area" d={histogramShape.path} />
        ) : null}
        {!histogramShape.isEmpty && mappingPath ? (
          <path className="brightness-contrast-histogram__mapping" d={mappingPath} />
        ) : null}
      </svg>
    </div>
  );
}

export default BrightnessContrastHistogram;
