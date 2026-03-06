import FloatingWindow from '../../widgets/FloatingWindow';
import type { LayoutProps, PlaybackControlsProps } from './types';
import type { ModeToggleState, ViewerSettingsControls } from './hooks/useViewerModeControls';

const MIN_FPS = 1;
const MAX_FPS = 30;

const clampFps = (value: number) => Math.min(MAX_FPS, Math.max(MIN_FPS, value));

export type ViewerSettingsWindowProps = {
  layout: Pick<LayoutProps, 'windowMargin' | 'controlWindowWidth' | 'viewerSettingsWindowInitialPosition' | 'resetToken'>;
  modeToggle: ModeToggleState;
  playbackControls: Pick<
    PlaybackControlsProps,
    | 'fps'
    | 'onFpsChange'
    | 'recordingBitrateMbps'
    | 'onRecordingBitrateMbpsChange'
    | 'volumeTimepointCount'
    | 'onStartRecording'
    | 'onStopRecording'
    | 'isRecording'
    | 'canRecord'
  >;
  viewerSettings: ViewerSettingsControls;
  isOpen: boolean;
  onClose: () => void;
  renderingQuality: number;
  onRenderingQualityChange: (value: number) => void;
};

export default function ViewerSettingsWindow({
  layout,
  modeToggle,
  playbackControls,
  viewerSettings,
  isOpen,
  onClose,
  renderingQuality,
  onRenderingQualityChange
}: ViewerSettingsWindowProps) {
  const { windowMargin, controlWindowWidth, resetToken, viewerSettingsWindowInitialPosition } = layout;
  const {
    is3dModeAvailable
  } = modeToggle;
  const {
    fps,
    onFpsChange,
    recordingBitrateMbps,
    onRecordingBitrateMbpsChange,
    volumeTimepointCount,
    onStartRecording,
    onStopRecording,
    isRecording,
    canRecord
  } = playbackControls;
  const {
    samplingMode,
    onSamplingModeToggle,
    blendingMode,
    onBlendingModeToggle,
    showRenderingQualityControl,
    hasVolumeData
  } = viewerSettings;

  if (!isOpen) {
    return null;
  }

  return (
    <FloatingWindow
      title="Viewer settings"
      initialPosition={viewerSettingsWindowInitialPosition}
      width={`min(${controlWindowWidth}px, calc(100vw - ${windowMargin * 2}px))`}
      className="floating-window--viewer-settings"
      resetSignal={resetToken}
      headerEndActions={
        <button
          type="button"
          className="floating-window-toggle"
          onClick={onClose}
          aria-label="Close viewer settings window"
          data-no-drag
          title="Close"
        >
          <span aria-hidden="true">×</span>
        </button>
      }
    >
      <div className="sidebar sidebar-right">
        <div className="global-controls">
          {is3dModeAvailable ? (
            <div className="control-group">
              <div className="viewer-mode-row">
                <button
                  type="button"
                  className={samplingMode === 'linear' ? 'viewer-mode-button is-active' : 'viewer-mode-button'}
                  onClick={onSamplingModeToggle}
                  disabled={!hasVolumeData}
                  aria-pressed={samplingMode === 'linear'}
                >
                  {samplingMode === 'linear' ? 'Trilinear' : 'Nearest'}
                </button>
                <button
                  type="button"
                  className={blendingMode === 'additive' ? 'viewer-mode-button is-active' : 'viewer-mode-button'}
                  onClick={onBlendingModeToggle}
                  disabled={!hasVolumeData}
                  aria-pressed={blendingMode === 'additive'}
                >
                  {blendingMode === 'additive' ? 'Additive' : 'Alpha'}
                </button>
              </div>
            </div>
          ) : null}

          {showRenderingQualityControl ? (
            <div className="control-group control-group--slider">
              <label htmlFor="volume-steps-slider">
                Trilinear quality <span>{renderingQuality}</span>
              </label>
              <input
                id="volume-steps-slider"
                type="range"
                min={0.1}
                max={3}
                step={0.1}
                value={renderingQuality}
                onChange={(event) => onRenderingQualityChange(Number(event.target.value))}
              />
            </div>
          ) : null}

          {is3dModeAvailable ? (
            <div className="control-group control-group--slider">
              <label htmlFor="fps-slider">frames per second</label>
              <div className="double-range-input">
                <input
                  id="fps-slider"
                  type="range"
                  min={MIN_FPS}
                  max={MAX_FPS}
                  step={1}
                  value={fps}
                  onChange={(event) => onFpsChange(clampFps(Number(event.target.value)))}
                  disabled={volumeTimepointCount <= 1}
                />
                <input
                  type="number"
                  min={MIN_FPS}
                  max={MAX_FPS}
                  value={fps}
                  onChange={(event) => onFpsChange(clampFps(Number(event.target.value)))}
                  disabled={volumeTimepointCount <= 1}
                />
              </div>
            </div>
          ) : (
            <div className="control-group control-group--slider">
              <label htmlFor="fps-slider">
                frames per second <span>{fps}</span>
              </label>
              <input
                id="fps-slider"
                type="range"
                min={MIN_FPS}
                max={MAX_FPS}
                step={1}
                value={fps}
                onChange={(event) => onFpsChange(clampFps(Number(event.target.value)))}
                disabled={volumeTimepointCount <= 1}
              />
            </div>
          )}

          <div className="control-group viewer-settings-recording-row">
            <div className="viewer-mode-row">
              <button
                type="button"
                className={
                  isRecording
                    ? 'playback-button playback-toggle playing'
                    : 'playback-button playback-toggle'
                }
                onClick={onStartRecording}
                disabled={!canRecord || isRecording}
                aria-pressed={isRecording}
              >
                Record
              </button>
              <button
                type="button"
                className="playback-button"
                onClick={onStopRecording}
                disabled={!isRecording}
              >
                Stop
              </button>
            </div>
          </div>

          {typeof recordingBitrateMbps === 'number' && onRecordingBitrateMbpsChange ? (
            <div className="control-group control-group--slider">
              <label htmlFor="recording-bitrate-slider">
                Recording bitrate (Mbps) <span>{recordingBitrateMbps}</span>
              </label>
              <div className="double-range-input">
                <input
                  id="recording-bitrate-slider"
                  type="range"
                  min={1}
                  max={100}
                  step={1}
                  value={recordingBitrateMbps}
                  onChange={(event) => onRecordingBitrateMbpsChange(Number(event.target.value))}
                  disabled={isRecording}
                />
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={recordingBitrateMbps}
                  onChange={(event) => onRecordingBitrateMbpsChange(Number(event.target.value))}
                  disabled={isRecording}
                />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </FloatingWindow>
  );
}
