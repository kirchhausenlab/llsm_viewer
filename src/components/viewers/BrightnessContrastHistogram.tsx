import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { getVolumeHistogram, HISTOGRAM_FIRST_VALID_BIN } from '../../autoContrast';
import type { NormalizedVolume } from '../../core/volumeProcessing';
import { applyAlphaToHex } from '../../shared/utils/appHelpers';

const HISTOGRAM_WIDTH = 255;
const HISTOGRAM_HEIGHT = 100;
const HISTOGRAM_BINS = 256;
const FULL_HISTOGRAM_MAX_VOXELS = 250_000;
const MAX_APPROX_SAMPLES = 250_000;

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
  histogram?: Uint32Array | null;
  isPlaying?: boolean;
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

function computeApproxHistogram(volume: NormalizedVolume): Uint32Array {
  const { normalized, width, height, depth } = volume;
  const channels = Math.max(1, volume.channels);
  const voxelCount = width * height * depth;
  const histogram = new Uint32Array(HISTOGRAM_BINS);

  if (voxelCount === 0 || normalized.length === 0) {
    return histogram;
  }

  const expectedLength = voxelCount * channels;
  if (normalized.length < expectedLength) {
    return histogram;
  }

  const stride = Math.max(1, Math.ceil(voxelCount / MAX_APPROX_SAMPLES));

  if (channels === 1) {
    for (let index = 0; index < voxelCount; index += stride) {
      histogram[normalized[index] ?? 0] += 1;
    }
    return histogram;
  }

  if (channels === 2) {
    for (let index = 0; index < voxelCount; index += stride) {
      const offset = index * 2;
      const r = normalized[offset] ?? 0;
      const g = normalized[offset + 1] ?? 0;
      histogram[Math.round((r + g) * 0.5)] += 1;
    }
    return histogram;
  }

  for (let index = 0; index < voxelCount; index += stride) {
    const offset = index * channels;
    const r = normalized[offset] ?? 0;
    const g = normalized[offset + 1] ?? 0;
    const b = normalized[offset + 2] ?? 0;
    const luminance = Math.round(r * 0.2126 + g * 0.7152 + b * 0.0722);
    const clamped = luminance < 0 ? 0 : luminance > 255 ? 255 : luminance;
    histogram[clamped] += 1;
  }

  return histogram;
}

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
  histogram: histogramOverride = null,
  isPlaying = false,
  windowMin,
  windowMax,
  defaultMin,
  defaultMax,
  sliderRange,
  className,
  tintColor
}: BrightnessContrastHistogramProps) {
  const [histogram, setHistogram] = useState<Uint32Array | null>(null);
  const histogramVolumeRef = useRef<NormalizedVolume | null>(null);

  useEffect(() => {
    if (histogramOverride) {
      histogramVolumeRef.current = volume;
      setHistogram(histogramOverride);
      return;
    }

    if (!volume) {
      histogramVolumeRef.current = null;
      setHistogram(null);
      return;
    }

    if (isPlaying) {
      return;
    }

    if (histogramVolumeRef.current === volume) {
      return;
    }

    let cancelled = false;
    const voxelCount = volume.width * volume.height * volume.depth;
    const compute = () => {
      if (cancelled) {
        return;
      }
      const next =
        volume.histogram ??
        (voxelCount <= FULL_HISTOGRAM_MAX_VOXELS ? getVolumeHistogram(volume) : computeApproxHistogram(volume));
      if (cancelled) {
        return;
      }
      histogramVolumeRef.current = volume;
      setHistogram(next);
    };

    let idleHandle: number | null = null;
    let timeoutHandle: ReturnType<typeof globalThis.setTimeout> | null = null;
    const requestIdle = (globalThis as unknown as { requestIdleCallback?: unknown }).requestIdleCallback;
    const cancelIdle = (globalThis as unknown as { cancelIdleCallback?: unknown }).cancelIdleCallback;
    if (typeof requestIdle === 'function') {
      idleHandle = (requestIdle as (cb: () => void) => number)(compute);
    } else if (typeof globalThis.setTimeout === 'function') {
      timeoutHandle = globalThis.setTimeout(compute, 0);
    } else {
      compute();
    }

    return () => {
      cancelled = true;
      if (idleHandle !== null && typeof cancelIdle === 'function') {
        (cancelIdle as (handle: number) => void)(idleHandle);
      }
      if (timeoutHandle !== null && typeof globalThis.clearTimeout === 'function') {
        globalThis.clearTimeout(timeoutHandle);
      }
    };
  }, [histogramOverride, isPlaying, volume]);

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
