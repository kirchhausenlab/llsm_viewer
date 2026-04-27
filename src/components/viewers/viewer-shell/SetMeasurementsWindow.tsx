import FloatingWindow from '../../widgets/FloatingWindow';
import {
  ViewerWindowButton,
  ViewerWindowRow,
  ViewerWindowStack,
} from './window-ui';
import type { LayoutProps } from './types';
import type { RoiMeasurementMetricKey, RoiMeasurementSettings } from '../../../types/roiMeasurements';
import { ROI_MEASUREMENT_METRIC_ORDER } from '../../../types/roiMeasurements';

type SetMeasurementsWindowProps = {
  initialPosition: LayoutProps['setMeasurementsWindowInitialPosition'];
  windowMargin: number;
  width: number;
  resetSignal: number;
  settings: RoiMeasurementSettings;
  onSettingsChange: (settings: RoiMeasurementSettings) => void;
  onHelp: () => void;
  onCancel: () => void;
  onConfirm: () => void;
  onClose: () => void;
};

const METRIC_LABELS: Record<RoiMeasurementMetricKey, string> = {
  count: 'Length/Area/Volume',
  std: 'Standard deviation',
  min: 'Min',
  max: 'Max',
  mean: 'Mean',
  median: 'Median',
};

export default function SetMeasurementsWindow({
  initialPosition,
  windowMargin,
  width,
  resetSignal,
  settings,
  onSettingsChange,
  onHelp,
  onCancel,
  onConfirm,
  onClose,
}: SetMeasurementsWindowProps) {
  return (
    <FloatingWindow
      title="Set measurements"
      initialPosition={initialPosition}
      width={`min(${width}px, calc(100vw - ${windowMargin * 2}px))`}
      resetSignal={resetSignal}
      className="floating-window--set-measurements"
      onClose={onClose}
    >
      <ViewerWindowStack className="set-measurements-window">
        <div className="set-measurements-options">
          {ROI_MEASUREMENT_METRIC_ORDER.map((metric) => (
            <label key={metric} className="set-measurements-option">
              <input
                type="checkbox"
                checked={settings.enabledMetrics[metric]}
                onChange={(event) =>
                  onSettingsChange({
                    ...settings,
                    enabledMetrics: {
                      ...settings.enabledMetrics,
                      [metric]: event.target.checked,
                    },
                  })
                }
              />
              <span>{METRIC_LABELS[metric]}</span>
            </label>
          ))}
        </div>

        <label className="set-measurements-decimals-row">
          <span>Decimal places:</span>
          <input
            type="number"
            min={0}
            max={9}
            step={1}
            value={settings.decimalPlaces}
            onChange={(event) => {
              const nextValue = Number.parseInt(event.target.value, 10);
              onSettingsChange({
                ...settings,
                decimalPlaces: Number.isFinite(nextValue) ? Math.min(9, Math.max(0, nextValue)) : 0,
              });
            }}
          />
        </label>

        <ViewerWindowRow className="set-measurements-actions" justify="end" wrap>
          <ViewerWindowButton type="button" onClick={onHelp}>
            Help
          </ViewerWindowButton>
          <ViewerWindowButton type="button" onClick={onCancel}>
            Cancel
          </ViewerWindowButton>
          <ViewerWindowButton type="button" onClick={onConfirm}>
            OK
          </ViewerWindowButton>
        </ViewerWindowRow>
      </ViewerWindowStack>
    </FloatingWindow>
  );
}
