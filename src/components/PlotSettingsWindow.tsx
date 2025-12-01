import { useMemo, type ChangeEvent } from 'react';
import type { NumericRange } from '../types/tracks';

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

const formatNumericValue = (value: number) =>
  value.toLocaleString(undefined, { maximumFractionDigits: 2 });

type RangeSliderProps = {
  label: string;
  bounds: NumericRange;
  value: NumericRange;
  onChange: (limits: NumericRange) => void;
  step?: number | 'any';
};

const RangeSlider = ({ label, bounds, value, onChange, step = 'any' }: RangeSliderProps) => {
  const clampValue = (input: number) => clampToRange(input, bounds.min, bounds.max);

  const minPercent = useMemo(() => {
    const span = bounds.max - bounds.min;
    if (span <= 0) {
      return 0;
    }
    return ((value.min - bounds.min) / span) * 100;
  }, [bounds.max, bounds.min, value.min]);

  const maxPercent = useMemo(() => {
    const span = bounds.max - bounds.min;
    if (span <= 0) {
      return 0;
    }
    return ((value.max - bounds.min) / span) * 100;
  }, [bounds.max, bounds.min, value.max]);

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
          {`${formatNumericValue(value.min)} – ${formatNumericValue(value.max)}`}
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

type SingleSliderProps = {
  label: string;
  min: number;
  max: number;
  value: number;
  step?: number | 'any';
  onChange: (value: number) => void;
  formatValue?: (value: number) => string;
};

const SingleSlider = ({
  label,
  min,
  max,
  value,
  step = 'any',
  onChange,
  formatValue = formatNumericValue
}: SingleSliderProps) => {
  const clampedValue = clampToRange(value, min, max);
  const span = max - min;
  const percent = span > 0 ? ((clampedValue - min) / span) * 100 : 0;

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextValue = clampToRange(Number(event.target.value), min, max);
    if (!Number.isFinite(nextValue)) {
      return;
    }
    onChange(nextValue);
  };

  const disabled = max <= min;

  return (
    <div className="selected-tracks-slider selected-tracks-slider--single">
      <div className="selected-tracks-slider__header">
        <span className="selected-tracks-slider__label">{label}</span>
        <span className="selected-tracks-slider__value">{formatValue(clampedValue)}</span>
      </div>
      <div className="selected-tracks-slider__inputs">
        <div className="selected-tracks-slider__range" aria-hidden={disabled}>
          <div className="selected-tracks-slider__track" />
          <div className="selected-tracks-slider__fill" style={{ left: 0, width: `${percent}%` }} />
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={clampedValue}
            onChange={handleChange}
            aria-label={label}
            className="selected-tracks-slider__handle selected-tracks-slider__handle--single"
            disabled={disabled}
          />
        </div>
      </div>
    </div>
  );
};

type PlotSettingsWindowProps = {
  amplitudeExtent: NumericRange;
  amplitudeLimits: NumericRange;
  timeExtent: NumericRange;
  timeLimits: NumericRange;
  smoothing: number;
  smoothingExtent: NumericRange;
  onAmplitudeLimitsChange: (limits: NumericRange) => void;
  onTimeLimitsChange: (limits: NumericRange) => void;
  onSmoothingChange: (value: number) => void;
  onAutoRange: () => void;
  onClearSelection: () => void;
};

function PlotSettingsWindow({
  amplitudeExtent,
  amplitudeLimits,
  timeExtent,
  timeLimits,
  smoothing,
  smoothingExtent,
  onAmplitudeLimitsChange,
  onTimeLimitsChange,
  onSmoothingChange,
  onAutoRange,
  onClearSelection
}: PlotSettingsWindowProps) {
  return (
    <div className="plot-settings-window">
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
      <SingleSlider
        label="Smoothing"
        min={smoothingExtent.min}
        max={smoothingExtent.max}
        value={smoothing}
        step={0.05}
        onChange={onSmoothingChange}
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
  );
}

export default PlotSettingsWindow;
