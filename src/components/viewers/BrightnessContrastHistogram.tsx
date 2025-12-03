import { useMemo, type CSSProperties } from 'react';
import { getVolumeHistogram, HISTOGRAM_FIRST_VALID_BIN } from '../../autoContrast';
import type { NormalizedVolume } from '../../core/volumeProcessing';
import { applyAlphaToHex } from '../../shared/utils/appHelpers';

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
  tintColor?: string;
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
  for (let i = HISTOGRAM_FIRST_VALID_BIN; i < histogram.length; i++) {
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

  for (let i = HISTOGRAM_FIRST_VALID_BIN; i < bins; i++) {
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
  _sliderRange: number
): string => {
  const defaultRange = defaultMax - defaultMin;
  const windowWidth = windowMax - windowMin;
  if (!(defaultRange > 0) || !(windowWidth > 0)) {
    return '';
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

  const toX = (fraction: number) => clamp(fraction, 0, 1) * HISTOGRAM_WIDTH;
  const toY = (fraction: number) => {
    const clampedFraction = clamp(fraction, 0, 1);
    const value = defaultMin + clampedFraction * defaultRange;
    const normalized = clamp((value - windowMin) / windowWidth, 0, 1);
    return (1 - normalized) * HISTOGRAM_HEIGHT;
  };

  const commands: string[] = [];
  uniqueFractions.forEach((fraction, index) => {
    const command = index === 0 ? 'M' : 'L';
    commands.push(`${command}${toX(fraction).toFixed(2)} ${toY(fraction).toFixed(2)}`);
  });

  return commands.join(' ');
};

function BrightnessContrastHistogram({
  volume,
  windowMin,
  windowMax,
  defaultMin,
  defaultMax,
  sliderRange,
  className,
  tintColor
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
  type HistogramStyle = CSSProperties & {
    '--histogram-color'?: string;
    '--histogram-fill'?: string;
  };
  const style: HistogramStyle | undefined = tintColor
    ? {
        '--histogram-color': tintColor,
        '--histogram-fill': applyAlphaToHex(tintColor, 0.35)
      }
    : undefined;

  return (
    <div className={containerClassName} aria-hidden={histogramShape.isEmpty}>
      <svg
        className={figureClassName}
        viewBox={`0 0 ${HISTOGRAM_WIDTH} ${HISTOGRAM_HEIGHT}`}
        preserveAspectRatio="none"
        role="presentation"
        style={style}
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
