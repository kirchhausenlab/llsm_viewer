import FloatingWindow from '../../widgets/FloatingWindow';
import type { LayoutProps } from './types';
import type { RoiMeasurementMetricKey, RoiMeasurementSettings, RoiMeasurementsSnapshot } from '../../../types/roiMeasurements';
import { ROI_MEASUREMENT_METRIC_ORDER } from '../../../types/roiMeasurements';
import { formatRoiMeasurementValue } from '../../../shared/utils/roiMeasurements';

type MeasurementsWindowProps = {
  initialPosition: LayoutProps['measurementsWindowInitialPosition'];
  windowMargin: number;
  width: number;
  resetSignal: number;
  snapshot: RoiMeasurementsSnapshot;
  settings: RoiMeasurementSettings;
  visibleChannelIds: string[];
  channelColorsById: ReadonlyMap<string, string>;
  onVisibleChannelIdsChange: (channelIds: string[]) => void;
  onOpenSettings: () => void;
  onSave: () => void;
  onClose: () => void;
};

const METRIC_LABELS: Record<RoiMeasurementMetricKey, string> = {
  count: 'Count',
  std: 'Std',
  min: 'Min',
  max: 'Max',
  mean: 'Mean',
  median: 'Median',
};

export default function MeasurementsWindow({
  initialPosition,
  windowMargin,
  width,
  resetSignal,
  snapshot,
  settings,
  visibleChannelIds,
  channelColorsById,
  onVisibleChannelIdsChange,
  onOpenSettings,
  onSave,
  onClose,
}: MeasurementsWindowProps) {
  const enabledMetrics = ROI_MEASUREMENT_METRIC_ORDER.filter((metric) => settings.enabledMetrics[metric]);
  const visibleChannelIdSet = new Set(visibleChannelIds);
  const visibleRows = snapshot.rows.filter((row) => visibleChannelIdSet.has(row.channelId));

  return (
    <FloatingWindow
      title="Measurements"
      initialPosition={initialPosition}
      width={`min(${width}px, calc(100vw - ${windowMargin * 2}px))`}
      resetSignal={resetSignal}
      className="floating-window--measurements"
      onClose={onClose}
    >
      <div className="measurements-window">
        <div className="measurements-window-actions">
          <button type="button" onClick={onOpenSettings}>
            Set measurements
          </button>
          <button type="button" onClick={onSave}>
            Save
          </button>
        </div>

        <div className="measurements-channel-row" role="group" aria-label="Displayed channels">
          {snapshot.channels.map((channel) => {
            const checked = visibleChannelIdSet.has(channel.id);
            return (
              <label key={channel.id} className="measurements-channel-toggle">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(event) => {
                    if (event.target.checked) {
                      onVisibleChannelIdsChange(
                        snapshot.channels
                          .map((entry) => entry.id)
                          .filter((channelId) => visibleChannelIdSet.has(channelId) || channelId === channel.id)
                      );
                      return;
                    }

                    onVisibleChannelIdsChange(visibleChannelIds.filter((channelId) => channelId !== channel.id));
                  }}
                />
                <span>{channel.name}</span>
              </label>
            );
          })}
        </div>

        {visibleRows.length > 0 ? (
          <div className="measurements-table-scroll">
            <table className="measurements-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Ch</th>
                  {enabledMetrics.map((metric) => (
                    <th key={metric}>{METRIC_LABELS[metric]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr
                    key={`${row.roiId}:${row.channelId}`}
                    style={{ color: channelColorsById.get(row.channelId) ?? undefined }}
                  >
                    <td>{row.roiOrder}</td>
                    <td>{row.channelName}</td>
                    {enabledMetrics.map((metric) => (
                      <td key={metric}>{formatRoiMeasurementValue(row.values[metric], metric, settings.decimalPlaces)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="measurements-empty-state">No channels selected.</p>
        )}
      </div>
    </FloatingWindow>
  );
}
