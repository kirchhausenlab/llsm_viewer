import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type MouseEvent } from 'react';
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
  onTrackSelectionToggle: (trackId: string) => void;
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

const computeNiceStep = (span: number, maxTicks: number) => {
  if (!Number.isFinite(span) || span <= 0 || maxTicks <= 0) {
    return 0;
  }

  const roughStep = span / maxTicks;
  const exponent = Math.pow(10, Math.floor(Math.log10(roughStep)));
  const fraction = roughStep / exponent;

  const niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return niceFraction * exponent;
};

const generateNiceTicks = (min: number, max: number, maxTicks: number) => {
  const span = max - min;
  const step = computeNiceStep(span, maxTicks);

  if (step <= 0 || !Number.isFinite(step)) {
    return [] as number[];
  }

  const ticks: number[] = [];
  const start = Math.ceil(min / step) * step;

  for (let value = start; value < max; value += step) {
    if (value > min && value < max) {
      ticks.push(value);
    }
  }

  return ticks;
};

const computeNiceBounds = (min: number, max: number, maxTicks: number) => {
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return { min, max };
  }

  if (min === max) {
    const padding = Math.max(1, Math.abs(min) * 0.05);
    return { min: min - padding, max: max + padding };
  }

  const span = max - min;
  const step = computeNiceStep(span, maxTicks);

  if (step <= 0 || !Number.isFinite(step)) {
    return { min, max };
  }

  const niceMin = Math.floor(min / step) * step;
  const niceMax = Math.ceil(max / step) * step;

  if (niceMin === niceMax) {
    return { min: min - step, max: max + step };
  }

  return { min: niceMin, max: niceMax };
};

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
  currentTimepoint,
  onTrackSelectionToggle
}: SelectedTracksWindowProps) {
  const [hoverTimepoint, setHoverTimepoint] = useState<number | null>(null);
  const legendRef = useRef<HTMLDivElement | null>(null);
  const previousLegendLengthRef = useRef(0);

  const xBounds = useMemo(
    () => computeNiceBounds(timeLimits.min, timeLimits.max, 8),
    [timeLimits.max, timeLimits.min]
  );
  const yBounds = useMemo(
    () => computeNiceBounds(amplitudeLimits.min, amplitudeLimits.max, 4),
    [amplitudeLimits.max, amplitudeLimits.min]
  );

  const domainXMin = xBounds.min;
  const domainXMax = xBounds.max;
  const domainXSpan = domainXMax - domainXMin;
  const domainYMin = yBounds.min;
  const domainYMax = yBounds.max;
  const domainYSpan = domainYMax - domainYMin;
  const chartWidth = SVG_WIDTH - PADDING.left - PADDING.right;
  const chartHeight = SVG_HEIGHT - PADDING.top - PADDING.bottom;

  const scaleX = useMemo(() => {
    if (chartWidth <= 0) {
      return () => PADDING.left;
    }
    if (domainXSpan === 0) {
      const center = PADDING.left + chartWidth / 2;
      return () => center;
    }

    return (time: number) => {
      const clampedTime = clampToRange(time, domainXMin, domainXMax);
      const normalized = (clampedTime - domainXMin) / domainXSpan;
      return PADDING.left + normalized * chartWidth;
    };
  }, [chartWidth, domainXMax, domainXMin, domainXSpan]);

  const scaleY = useMemo(() => {
    if (chartHeight <= 0) {
      return () => PADDING.top;
    }
    if (domainYSpan === 0) {
      const center = PADDING.top + chartHeight / 2;
      return () => center;
    }

    return (amplitude: number) => {
      const clamped = clampToRange(amplitude, domainYMin, domainYMax);
      const normalized = (clamped - domainYMin) / domainYSpan;
      return PADDING.top + chartHeight - normalized * chartHeight;
    };
  }, [chartHeight, domainYMax, domainYMin, domainYSpan]);

  const xTicks = useMemo(
    () => generateNiceTicks(domainXMin, domainXMax, 8),
    [domainXMax, domainXMin]
  );
  const yTicks = useMemo(
    () => generateNiceTicks(domainYMin, domainYMax, 4),
    [domainYMax, domainYMin]
  );

  const xAxisLabels = useMemo(
    () => [domainXMin, ...xTicks, domainXMax],
    [domainXMax, domainXMin, xTicks]
  );
  const yAxisLabels = useMemo(
    () => [domainYMin, ...yTicks, domainYMax],
    [domainYMax, domainYMin, yTicks]
  );

  const resolvedSeries = useMemo<ChartSeries[]>(() => {
    if (chartWidth <= 0 || chartHeight <= 0) {
      return [];
    }

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
    scaleX,
    scaleY,
    series
  ]);

  const xAxisEnd = PADDING.left + chartWidth;
  const yAxisEnd = PADDING.top + chartHeight;
  const totalTimepointsLabel = totalTimepoints.toLocaleString();

  const hasSeries = resolvedSeries.some((entry) => entry.path);
  const playheadX = useMemo(() => {
    return scaleX(currentTimepoint);
  }, [currentTimepoint, scaleX]);
  const hoverX = useMemo(() => {
    if (hoverTimepoint === null) {
      return null;
    }
    return scaleX(hoverTimepoint);
  }, [hoverTimepoint, scaleX]);

  const amplitudeByTrack = useMemo(() => {
    const map = new Map<string, Map<number, number>>();
    for (const entry of series) {
      const timeMap = new Map<number, number>();
      for (const point of entry.points) {
        timeMap.set(point.time, point.amplitude);
      }
      map.set(entry.id, timeMap);
    }
    return map;
  }, [series]);

  const handleMouseMove = useCallback(
    (event: MouseEvent<SVGSVGElement>) => {
      const svgRect = event.currentTarget.getBoundingClientRect();
      if (svgRect.width === 0 || chartWidth <= 0) {
        return;
      }

      const relativeX = ((event.clientX - svgRect.left) / svgRect.width) * SVG_WIDTH;
      const clampedX = clampToRange(relativeX, PADDING.left, PADDING.left + chartWidth);
      const normalizedX = (clampedX - PADDING.left) / chartWidth;
      const domainX = domainXMin + normalizedX * domainXSpan;
      const snappedTimepoint = Math.round(domainX);
      const clampedTimepoint = clampToRange(snappedTimepoint, timeLimits.min, timeLimits.max);
      setHoverTimepoint(clampedTimepoint);
    },
    [chartWidth, domainXMin, domainXSpan, timeLimits.max, timeLimits.min]
  );

  const handleMouseLeave = useCallback(() => {
    setHoverTimepoint(null);
  }, []);

  const hoverLabel = hoverTimepoint === null ? null : formatAxisValue(hoverTimepoint);

  useEffect(() => {
    const legendNode = legendRef.current;
    if (!legendNode) {
      previousLegendLengthRef.current = resolvedSeries.length;
      return;
    }

    const previousLength = previousLegendLengthRef.current;
    if (
      resolvedSeries.length > previousLength &&
      legendNode.scrollHeight > legendNode.clientHeight
    ) {
      legendNode.scrollTop = legendNode.scrollHeight;
    }

    previousLegendLengthRef.current = resolvedSeries.length;
  }, [resolvedSeries.length]);

  return (
    <div className="selected-tracks-window">
      <div
        className={`selected-tracks-chart-card${resolvedSeries.length > 0 ? ' has-legend' : ''}`}
      >
        <div
          className="selected-tracks-chart"
          role="img"
          aria-label={`Track amplitudes over ${totalTimepointsLabel} timepoints`}
        >
          <svg
            viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
            preserveAspectRatio="xMidYMid meet"
            className="selected-tracks-chart-svg"
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
          >
            <g className="selected-tracks-chart-grid">
              <line x1={PADDING.left} y1={yAxisEnd} x2={xAxisEnd} y2={yAxisEnd} />
              <line x1={PADDING.left} y1={PADDING.top} x2={PADDING.left} y2={yAxisEnd} />
              <line x1={PADDING.left} y1={PADDING.top} x2={xAxisEnd} y2={PADDING.top} />
              <line x1={xAxisEnd} y1={PADDING.top} x2={xAxisEnd} y2={yAxisEnd} />
              {xTicks.map((value) => {
                const x = scaleX(value);
                return (
                  <line
                    key={`grid-x-${value}`}
                    className="selected-tracks-chart-subgrid"
                    x1={x}
                    y1={PADDING.top}
                    x2={x}
                    y2={yAxisEnd}
                  />
                );
              })}
              {yTicks.map((value) => {
                const y = scaleY(value);
                return (
                  <line
                    key={`grid-y-${value}`}
                    className="selected-tracks-chart-subgrid"
                    x1={PADDING.left}
                    y1={y}
                    x2={xAxisEnd}
                    y2={y}
                  />
                );
              })}
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
            {hoverX !== null ? (
              <g className="selected-tracks-hover">
                <line x1={hoverX} y1={PADDING.top} x2={hoverX} y2={yAxisEnd} />
                <line
                  className="selected-tracks-hover-tick"
                  x1={hoverX}
                  y1={PADDING.top}
                  x2={hoverX}
                  y2={PADDING.top - 8}
                />
                {hoverLabel ? (
                  <text x={hoverX} y={PADDING.top - 12} textAnchor="middle">
                    {hoverLabel}
                  </text>
                ) : null}
              </g>
            ) : null}
            <g className="selected-tracks-chart-axis-labels">
              {xAxisLabels.map((value) => {
                const x = scaleX(value);
                const label = formatAxisValue(value);
                return (
                  <g key={`x-label-${value}`}>
                    <line
                      className="selected-tracks-axis-tick-mark"
                      x1={x}
                      y1={yAxisEnd}
                      x2={x}
                      y2={yAxisEnd - 6}
                    />
                    <text x={x} y={yAxisEnd + 20} textAnchor="middle">
                      {label}
                    </text>
                  </g>
                );
              })}
              {yAxisLabels.map((value) => {
                const y = scaleY(value);
                const label = formatAxisValue(value);
                return (
                  <g key={`y-label-${value}`}>
                    <line
                      className="selected-tracks-axis-tick-mark"
                      x1={PADDING.left}
                      y1={y}
                      x2={PADDING.left + 6}
                      y2={y}
                    />
                    <text x={PADDING.left - 10} y={y} textAnchor="end" dominantBaseline="middle">
                      {label}
                    </text>
                  </g>
                );
              })}
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
        {resolvedSeries.length > 0 ? (
          <div
            className="selected-tracks-legend-panel"
            aria-label="Track legend"
            ref={legendRef}
          >
            <ul className="selected-tracks-legend">
              {resolvedSeries.map((entry) => (
                <li key={entry.id} className="selected-tracks-legend-item">
                  <button
                    type="button"
                    className="selected-tracks-legend-button"
                    onClick={() => onTrackSelectionToggle(entry.id)}
                    aria-label={`Deselect ${entry.label}`}
                  >
                    <span
                      className="selected-tracks-legend-swatch"
                      style={{ backgroundColor: entry.color }}
                      aria-hidden="true"
                    />
                    <span className="selected-tracks-legend-label">
                      {entry.label}
                      {hoverTimepoint !== null
                        ? (() => {
                            const value = amplitudeByTrack.get(entry.id)?.get(hoverTimepoint);
                            return value === undefined ? null : `: ${formatAxisValue(value)}`;
                          })()
                        : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
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
  );
}

export default SelectedTracksWindow;
