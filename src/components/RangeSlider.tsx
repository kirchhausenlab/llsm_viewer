import { useMemo, type ChangeEventHandler } from 'react';

import type { NumericRange } from '../types/tracks';

const clampToRange = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const formatAxisValue = (value: number) => {
  if (!Number.isFinite(value)) {
    return '0';
  }
  const isInteger = Number.isInteger(value);
  return isInteger ? value.toString() : value.toFixed(2).replace(/\.00$/, '');
};

type RangeSliderProps = {
  label: string;
  bounds: NumericRange;
  value: NumericRange;
  onChange: (value: NumericRange) => void;
  step?: number | 'any';
  disabled?: boolean;
};

const RangeSlider = ({ label, bounds, value, onChange, step = 0.1, disabled = false }: RangeSliderProps) => {
  const span = bounds.max - bounds.min;
  const minPercent = span === 0 ? 0 : ((value.min - bounds.min) / span) * 100;
  const maxPercent = span === 0 ? 0 : ((value.max - bounds.min) / span) * 100;

  const handleMinChange: ChangeEventHandler<HTMLInputElement> = (event) => {
    const nextMin = clampToRange(Number(event.target.value), bounds.min, value.max);
    const clampedMax = clampToRange(value.max, nextMin, bounds.max);
    onChange({ min: nextMin, max: clampedMax });
  };

  const handleMaxChange: ChangeEventHandler<HTMLInputElement> = (event) => {
    const nextMax = clampToRange(Number(event.target.value), value.min, bounds.max);
    const clampedMin = clampToRange(value.min, bounds.min, nextMax);
    onChange({ min: clampedMin, max: nextMax });
  };

  const resolvedStep = useMemo(() => {
    if (step === 'any') {
      return step;
    }
    const stepSize = step ?? 0.1;
    if (!Number.isFinite(stepSize) || stepSize <= 0) {
      return 0.1;
    }
    return stepSize;
  }, [step]);

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
            step={resolvedStep}
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
            step={resolvedStep}
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

export default RangeSlider;
