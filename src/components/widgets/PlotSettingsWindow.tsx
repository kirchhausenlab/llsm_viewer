import type { NumericRange } from '../../types/tracks';
import {
  ViewerWindowButton,
  ViewerWindowRangeSlider,
  ViewerWindowRow,
  ViewerWindowSlider,
  ViewerWindowStack,
} from '../viewers/viewer-shell/window-ui';

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
  const clampedSmoothing = clampToRange(smoothing, smoothingExtent.min, smoothingExtent.max);

  return (
    <ViewerWindowStack className="plot-settings-window">
      <ViewerWindowRangeSlider
        label="Amplitude range"
        bounds={amplitudeExtent}
        value={amplitudeLimits}
        onChange={onAmplitudeLimitsChange}
        formatValue={formatNumericValue}
      />
      <ViewerWindowRangeSlider
        label="Time range"
        bounds={timeExtent}
        value={timeLimits}
        onChange={onTimeLimitsChange}
        step={1}
        formatValue={formatNumericValue}
      />
      <ViewerWindowSlider
        id="selected-tracks-smoothing-slider"
        label="Smoothing"
        valueLabel={formatNumericValue(clampedSmoothing)}
        min={smoothingExtent.min}
        max={smoothingExtent.max}
        value={clampedSmoothing}
        step={0.05}
        onChange={(event) =>
          onSmoothingChange(clampToRange(Number(event.target.value), smoothingExtent.min, smoothingExtent.max))
        }
        disabled={smoothingExtent.max <= smoothingExtent.min}
      />
      <ViewerWindowRow className="selected-tracks-actions" justify="end" wrap>
        <ViewerWindowButton type="button" onClick={onAutoRange}>
          Auto
        </ViewerWindowButton>
        <ViewerWindowButton type="button" onClick={onClearSelection}>
          Clear
        </ViewerWindowButton>
      </ViewerWindowRow>
    </ViewerWindowStack>
  );
}

export default PlotSettingsWindow;
