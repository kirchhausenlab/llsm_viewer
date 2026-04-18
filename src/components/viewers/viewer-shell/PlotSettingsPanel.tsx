import FloatingWindow from '../../widgets/FloatingWindow';
import PlotSettingsWindow from '../../widgets/PlotSettingsWindow';
import SelectedTracksWindow from '../../widgets/SelectedTracksWindow';
import type { LayoutProps, PlotSettingsProps, SelectedTracksPanelProps } from './types';

export type PlotSettingsPanelProps = {
  layout: Pick<LayoutProps, 'windowMargin' | 'controlWindowWidth' | 'selectedTracksWindowWidth' | 'selectedTracksWindowInitialPosition' | 'plotSettingsWindowInitialPosition' | 'resetToken'>;
  selectedTracksPanel: SelectedTracksPanelProps;
  plotSettings: PlotSettingsProps;
  isVrActive: boolean;
  isPlotWindowOpen: boolean;
  onClosePlotWindow: () => void;
  isPlotSettingsOpen: boolean;
  onClosePlotSettings: () => void;
};

export default function PlotSettingsPanel({
  layout,
  selectedTracksPanel,
  plotSettings,
  isVrActive,
  isPlotWindowOpen,
  onClosePlotWindow,
  isPlotSettingsOpen,
  onClosePlotSettings
}: PlotSettingsPanelProps) {
  const {
    windowMargin,
    controlWindowWidth,
    selectedTracksWindowWidth,
    selectedTracksWindowInitialPosition,
    plotSettingsWindowInitialPosition,
    resetToken
  } = layout;
  const { shouldRender, series, totalTimepoints, amplitudeLimits, timeLimits, currentTimepoint, channelTintMap, smoothing, onTrackSelectionToggle } =
    selectedTracksPanel;
  const { amplitudeExtent, timeExtent, smoothing: plotSmoothing, smoothingExtent, onAmplitudeLimitsChange, onTimeLimitsChange, onSmoothingChange, onAutoRange, onClearSelection } =
    plotSettings;

  if (isVrActive || (!shouldRender && !isPlotWindowOpen)) {
    return null;
  }

  return (
    <>
      {isPlotWindowOpen ? (
        <FloatingWindow
          title="Amplitude plot"
          initialPosition={selectedTracksWindowInitialPosition}
          width={`min(${selectedTracksWindowWidth}px, calc(100vw - ${windowMargin * 2}px))`}
          className="floating-window--selected-tracks"
          bodyClassName="floating-window-body--selected-tracks"
          resetSignal={resetToken}
          headerPosition="bottom"
          onClose={onClosePlotWindow}
        >
          <SelectedTracksWindow
            series={series}
            totalTimepoints={totalTimepoints}
            amplitudeLimits={amplitudeLimits}
            timeLimits={timeLimits}
            currentTimepoint={currentTimepoint}
            channelTintMap={channelTintMap}
            smoothing={smoothing}
            onTrackSelectionToggle={onTrackSelectionToggle}
          />
        </FloatingWindow>
      ) : null}
      {isPlotWindowOpen && isPlotSettingsOpen ? (
        <FloatingWindow
          title="Plot settings"
          initialPosition={plotSettingsWindowInitialPosition}
          width={`min(${controlWindowWidth}px, calc(100vw - ${windowMargin * 2}px))`}
          className="floating-window--plot-settings"
          resetSignal={resetToken}
          onClose={onClosePlotSettings}
        >
          <PlotSettingsWindow
            amplitudeExtent={amplitudeExtent}
            amplitudeLimits={amplitudeLimits}
            timeExtent={timeExtent}
            timeLimits={timeLimits}
            smoothing={plotSmoothing}
            smoothingExtent={smoothingExtent}
            onAmplitudeLimitsChange={onAmplitudeLimitsChange}
            onTimeLimitsChange={onTimeLimitsChange}
            onSmoothingChange={onSmoothingChange}
            onAutoRange={onAutoRange}
            onClearSelection={onClearSelection}
          />
        </FloatingWindow>
      ) : null}
    </>
  );
}
