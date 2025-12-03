import FloatingWindow from '../FloatingWindow';
import PlotSettingsWindow from '../PlotSettingsWindow';
import SelectedTracksWindow from '../SelectedTracksWindow';
import type { LayoutProps, PlotSettingsProps, SelectedTracksPanelProps } from './types';

export type PlotSettingsPanelProps = {
  layout: Pick<LayoutProps, 'windowMargin' | 'controlWindowWidth' | 'selectedTracksWindowWidth' | 'selectedTracksWindowInitialPosition' | 'plotSettingsWindowInitialPosition' | 'resetToken'>;
  selectedTracksPanel: SelectedTracksPanelProps;
  plotSettings: PlotSettingsProps;
  isVrActive: boolean;
  isPlotSettingsOpen: boolean;
  onTogglePlotSettings: () => void;
  onClosePlotSettings: () => void;
};

export default function PlotSettingsPanel({
  layout,
  selectedTracksPanel,
  plotSettings,
  isVrActive,
  isPlotSettingsOpen,
  onTogglePlotSettings,
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

  if (isVrActive || !shouldRender) {
    return null;
  }

  return (
    <>
      <FloatingWindow
        title="Amplitude plot"
        initialPosition={selectedTracksWindowInitialPosition}
        width={`min(${selectedTracksWindowWidth}px, calc(100vw - ${windowMargin * 2}px))`}
        className="floating-window--selected-tracks"
        bodyClassName="floating-window-body--selected-tracks"
        resetSignal={resetToken}
        headerPosition="bottom"
        headerActions={
          <button
            type="button"
            className="floating-window-toggle"
            onClick={onTogglePlotSettings}
            aria-label={isPlotSettingsOpen ? 'Hide plot settings window' : 'Show plot settings window'}
            aria-pressed={isPlotSettingsOpen}
            data-no-drag
            title="Settings"
          >
            <span aria-hidden="true">⚙</span>
          </button>
        }
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
      <div style={{ display: isPlotSettingsOpen ? undefined : 'none' }} aria-hidden={!isPlotSettingsOpen}>
        <FloatingWindow
          title="Plot settings"
          initialPosition={plotSettingsWindowInitialPosition}
          width={`min(${controlWindowWidth}px, calc(100vw - ${windowMargin * 2}px))`}
          className="floating-window--plot-settings"
          resetSignal={resetToken}
          headerEndActions={
            <button
              type="button"
              className="floating-window-toggle"
              onClick={onClosePlotSettings}
              aria-label="Close plot settings window"
              data-no-drag
              title="Close"
            >
              <span aria-hidden="true">×</span>
            </button>
          }
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
      </div>
    </>
  );
}
