import { useMemo } from 'react';
import type { TrackPoint } from '../types/tracks';

type SelectedTrackSeries = {
  id: string;
  label: string;
  color: string;
  points: TrackPoint[];
};

type SelectedTracksWindowProps = {
  series: SelectedTrackSeries[];
  totalTimepoints: number;
};

const SVG_WIDTH = 900;
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

function SelectedTracksWindow({ series, totalTimepoints }: SelectedTracksWindowProps) {
  const domainXMax = Math.max(totalTimepoints - 1, 1);
  const amplitudeDomain = useMemo(() => {
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;

    for (const entry of series) {
      for (const point of entry.points) {
        if (!Number.isFinite(point.amplitude)) {
          continue;
        }
        if (point.amplitude < min) {
          min = point.amplitude;
        }
        if (point.amplitude > max) {
          max = point.amplitude;
        }
      }
    }

    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      return { min: 0, max: 1 } as const;
    }

    if (min === max) {
      return { min, max } as const;
    }

    return { min, max } as const;
  }, [series]);
  const domainYMin = amplitudeDomain.min;
  const domainYMax = amplitudeDomain.max;
  const domainYSpan = domainYMax - domainYMin;
  const chartWidth = SVG_WIDTH - PADDING.left - PADDING.right;
  const chartHeight = SVG_HEIGHT - PADDING.top - PADDING.bottom;

  const resolvedSeries = useMemo<ChartSeries[]>(() => {
    if (chartWidth <= 0 || chartHeight <= 0) {
      return [];
    }

    const scaleX = (time: number) => {
      if (domainXMax === 0) {
        return PADDING.left;
      }
      const normalized = clampToRange(time, 0, domainXMax) / domainXMax;
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
    domainYMin,
    domainYMax,
    domainYSpan,
    series
  ]);

  const xAxisEnd = PADDING.left + chartWidth;
  const yAxisEnd = PADDING.top + chartHeight;
  const domainYMinLabel = formatAxisValue(domainYMin);
  const domainYMaxLabel = formatAxisValue(domainYMax);
  const totalTimepointsLabel = totalTimepoints.toLocaleString();

  const hasSeries = resolvedSeries.some((entry) => entry.path);

  return (
    <div className="selected-tracks-window">
      <div className="selected-tracks-chart" role="img" aria-label="Track amplitudes over time">
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
          <g className="selected-tracks-chart-axis-labels">
            <text x={PADDING.left} y={yAxisEnd + 24}>
              0
            </text>
            <text x={xAxisEnd} y={yAxisEnd + 24} textAnchor="end">
              {totalTimepointsLabel}
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
