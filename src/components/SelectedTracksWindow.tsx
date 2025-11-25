import { useMemo, type ChangeEvent } from 'react';
import type { NumericRange, TrackPoint } from '../types/tracks';

type SelectedTrackSeries = {
  id: string;
  label: string;
  color: string;
  points: TrackPoint[];
};

type SelectedTracksWindowProps = {
  series: SelectedTrackSeries[];
  totalTimepoints: number;
  amplitudeExtent: NumericRange;
  amplitudeLimits: NumericRange;
  timeExtent: NumericRange;
  timeLimits: NumericRange;
  onAmplitudeLimitsChange: (limits: NumericRange) => void;
  onTimeLimitsChange: (limits: NumericRange) => void;
  onAutoRange: () => void;
  onClearSelection: () => void;
  currentTimepoint: number;
};

const SVG_WIDTH = 1040;
const SVG_HEIGHT = 180;
const PADDING = {
  top: 20,
  right: 28,
  bottom: 42,
  left: 60
};

type ChartSeries = SelectedTrackSeries & {
  path: string;
};

const clampToRange = (value: number, min: number, max: number) => {
  if (!Number.isFinite(value)) {
    return min;
  }
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
};

const formatAxisValue = (value: number) =>
  value.toLocaleString(undefined, { maximumFractionDigits: 2 });

type RangeSliderProps = {
  label: string;
  bounds: NumericRange;
  value: NumericRange;
  onChange: (limits: NumericRange) => void;
  step?: number | 'any';
};

const RangeSlider = ({ label, bounds, value, onChange, step = 'any' }: RangeSliderProps) => {
  const clampValue = (raw: number) => clampToRange(raw, bounds.min, bounds.max);

  const span = bounds.max - bounds.min;
  const normalizedSpan = span === 0 ? 1 : span;
  const minPercent = ((value.min - bounds.min) / normalizedSpan) * 100;
  const maxPercent = ((value.max - bounds.min) / normalizedSpan) * 100;

  const handleMinChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextValue = clampValue(Number(event.target.value));
    if (!Number.isFinite(nextValue)) {
      return;
    }
    onChange({ min: Math.min(nextValue, value.max), max: value.max });
  };

  const handleMaxChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextValue = clampValue(Number(event.target.value));
    if (!Number.isFinite(nextValue)) {
      return;
    }
    onChange({ min: value.min, max: Math.max(nextValue, value.min) });
  };

  const disabled = bounds.max <= bounds.min;

  return (
    <div className="selected-tracks-slider">
      <div className="selected-tracks-slider__header">
        <span className="selected-tracks-slider__label">{label}</span>
        <span className="selected-tracks-slider__value">
          {`${formatAxisValue(value.min)} – ${formatAxisValue(value.max)}`}
        </span>
      </div>
      <div className="selected-tracks-slider__inputs">
        <div className="selected-tracks-slider__range" aria-hidden={disabled}>
          <div className="selected-tracks-slider__track" />
          <div
            className="selected-tracks-slider__fill"
            style={{ left: `${minPercent}%`, width: `${Math.max(maxPercent - minPercent, 0)}%` }}
          />
          <input
            type="range"
            min={bounds.min}
            max={bounds.max}
            step={step}
            value={value.min}
            onChange={handleMinChange}
            aria-label={`${label} minimum`}
            className="selected-tracks-slider__handle selected-tracks-slider__handle--min"
            disabled={disabled}
          />
          <input
            type="range"
            min={bounds.min}
            max={bounds.max}
            step={step}
            value={value.max}
            onChange={handleMaxChange}
            aria-label={`${label} maximum`}
            className="selected-tracks-slider__handle selected-tracks-slider__handle--max"
            disabled={disabled}
          />
        </div>
      </div>
    </div>
  );
};

function SelectedTracksWindow({
  series,
  totalTimepoints,
  amplitudeExtent,
  amplitudeLimits,
  timeExtent,
  timeLimits,
  onAmplitudeLimitsChange,
  onTimeLimitsChange,
  onAutoRange,
  onClearSelection,
  currentTimepoint
}: SelectedTracksWindowProps) {
  const domainXMin = timeLimits.min;
  const domainXMax = timeLimits.max;
  const domainXSpan = domainXMax - domainXMin;
  const domainYMin = amplitudeLimits.min;
  const domainYMax = amplitudeLimits.max;
  const domainYSpan = domainYMax - domainYMin;
  const chartWidth = SVG_WIDTH - PADDING.left - PADDING.right;
  const chartHeight = SVG_HEIGHT - PADDING.top - PADDING.bottom;

  const resolvedSeries = useMemo<ChartSeries[]>(() => {
    if (chartWidth <= 0 || chartHeight <= 0) {
      return [];
    }

    const scaleX = (time: number) => {
      if (domainXSpan === 0) {
        return PADDING.left + chartWidth / 2;
      }
      const clampedTime = clampToRange(time, domainXMin, domainXMax);
      const normalized = (clampedTime - domainXMin) / domainXSpan;
      return PADDING.left + normalized * chartWidth;
    };

    const scaleY = (amplitude: number) => {
      if (domainYSpan === 0) {
        return PADDING.top + chartHeight / 2;
      }
      const clamped = clampToRange(amplitude, domainYMin, domainYMax);
      const normalized = (clamped - domainYMin) / domainYSpan;
      return PADDING.top + chartHeight - normalized * chartHeight;
    };

    return series.map((entry) => {
      const sortedPoints = [...entry.points].sort((a, b) => a.time - b.time);
      let path = '';

      for (const point of sortedPoints) {
        const x = scaleX(point.time);
        const y = scaleY(point.amplitude);
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
          continue;
        }
        if (path === '') {
          path = `M${x} ${y}`;
        } else {
          path += ` L${x} ${y}`;
        }
      }

      return {
        ...entry,
        path
      };
    });
  }, [
    chartHeight,
    chartWidth,
    domainXMax,
    domainXMin,
    domainXSpan,
    domainYMax,
    domainYMin,
    domainYSpan,
    series
  ]);

  const xAxisEnd = PADDING.left + chartWidth;
  const yAxisEnd = PADDING.top + chartHeight;
  const domainYMinLabel = formatAxisValue(domainYMin);
  const domainYMaxLabel = formatAxisValue(domainYMax);
  const domainXMinLabel = formatAxisValue(domainXMin);
  const domainXMaxLabel = formatAxisValue(domainXMax);
  const totalTimepointsLabel = totalTimepoints.toLocaleString();

  const hasSeries = resolvedSeries.some((entry) => entry.path);
  const playheadX = useMemo(() => {
    if (chartWidth <= 0) {
      return PADDING.left;
    }
    if (domainXSpan === 0) {
      return PADDING.left + chartWidth / 2;
    }
    const clampedTime = clampToRange(currentTimepoint, domainXMin, domainXMax);
    const normalized = (clampedTime - domainXMin) / domainXSpan;
    return PADDING.left + normalized * chartWidth;
  }, [chartWidth, currentTimepoint, domainXMax, domainXMin, domainXSpan]);

  return (
    <div className="selected-tracks-window">
      <div className="selected-tracks-main">
        <div
          className="selected-tracks-chart"
          role="img"
          aria-label={`Track amplitudes over ${totalTimepointsLabel} timepoints`}
        >
          <svg
            viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
            preserveAspectRatio="none"
            className="selected-tracks-chart-svg"
          >
            <rect
              className="selected-tracks-chart-background"
              x={0}
              y={0}
              width={SVG_WIDTH}
              height={SVG_HEIGHT}
              rx={16}
              ry={16}
            />
            <g className="selected-tracks-chart-grid">
              <line x1={PADDING.left} y1={yAxisEnd} x2={xAxisEnd} y2={yAxisEnd} />
              <line x1={PADDING.left} y1={PADDING.top} x2={PADDING.left} y2={yAxisEnd} />
              <line x1={PADDING.left} y1={PADDING.top} x2={xAxisEnd} y2={PADDING.top} />
              <line x1={xAxisEnd} y1={PADDING.top} x2={xAxisEnd} y2={yAxisEnd} />
            </g>
            <g className="selected-tracks-chart-series">
              {resolvedSeries.map((entry) =>
                entry.path ? (
                  <path key={entry.id} d={entry.path} stroke={entry.color} />
                ) : null
              )}
            </g>
            <g
              className={`selected-tracks-playhead${
                currentTimepoint < timeLimits.min || currentTimepoint > timeLimits.max
                  ? ' selected-tracks-playhead--out-of-range'
                  : ''
              }`}
            >
              <line x1={playheadX} y1={PADDING.top} x2={playheadX} y2={yAxisEnd} />
            </g>
            <g className="selected-tracks-chart-axis-labels">
              <text x={PADDING.left} y={yAxisEnd + 24}>
                {domainXMinLabel}
              </text>
              <text x={xAxisEnd} y={yAxisEnd + 24} textAnchor="end">
                {domainXMaxLabel}
              </text>
              <text x={PADDING.left - 12} y={yAxisEnd} textAnchor="end" dominantBaseline="middle">
                {domainYMinLabel}
              </text>
              <text x={PADDING.left - 12} y={PADDING.top} textAnchor="end" dominantBaseline="middle">
                {domainYMaxLabel}
              </text>
              <text
                x={PADDING.left + chartWidth / 2}
                y={SVG_HEIGHT - 4}
                textAnchor="middle"
                className="selected-tracks-axis-caption"
              >
                Timepoint
              </text>
              <text
                x={PADDING.left - 40}
                y={PADDING.top + chartHeight / 2}
                textAnchor="middle"
                className="selected-tracks-axis-caption"
                transform={`rotate(-90 ${PADDING.left - 40} ${PADDING.top + chartHeight / 2})`}
              >
                Amplitude
              </text>
            </g>
          </svg>
          {!hasSeries ? (
            <p className="selected-tracks-empty">Select tracks to plot their amplitudes.</p>
          ) : null}
        </div>
        <div className="selected-tracks-controls" aria-label="Track plot limits">
          <RangeSlider
            label="Amplitude range"
            bounds={amplitudeExtent}
            value={amplitudeLimits}
            onChange={onAmplitudeLimitsChange}
          />
          <RangeSlider
            label="Time range"
            bounds={timeExtent}
            value={timeLimits}
            onChange={onTimeLimitsChange}
            step={1}
          />
          <div className="selected-tracks-actions">
            <button type="button" className="selected-tracks-button" onClick={onAutoRange}>
              Auto
            </button>
            <button type="button" className="selected-tracks-button" onClick={onClearSelection}>
              Clear
            </button>
          </div>
        </div>
      </div>
      {resolvedSeries.length > 0 ? (
        <ul className="selected-tracks-legend">
          {resolvedSeries.map((entry) => (
            <li key={entry.id} className="selected-tracks-legend-item">
              <span
                className="selected-tracks-legend-swatch"
                style={{ backgroundColor: entry.color }}
                aria-hidden="true"
              />
              <span className="selected-tracks-legend-label">{entry.label}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export default SelectedTracksWindow;
