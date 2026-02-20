import FloatingWindow from '../../widgets/FloatingWindow';
import type { LayoutProps } from './types';
import type { ModeToggleState, ViewerSettingsControls } from './hooks/useViewerModeControls';
import type { PlaybackControlState } from './hooks/useViewerPlaybackControls';

const MIN_FPS = 1;
const MAX_FPS = 30;

const clampFps = (value: number) => Math.min(MAX_FPS, Math.max(MIN_FPS, value));

export type PlaybackControlsPanelProps = {
  layout: Pick<LayoutProps, 'windowMargin' | 'controlWindowWidth' | 'controlWindowInitialPosition' | 'resetToken'> & {
    viewerSettingsWindowInitialPosition: LayoutProps['viewerSettingsWindowInitialPosition'];
  };
  modeToggle: ModeToggleState;
  playbackControls: PlaybackControlState;
  viewerSettings: ViewerSettingsControls;
  isViewerSettingsOpen: boolean;
  onToggleViewerSettings: () => void;
  onCloseViewerSettings: () => void;
  renderingQuality: number;
  onRenderingQualityChange: (value: number) => void;
};

export default function PlaybackControlsPanel({
  layout,
  modeToggle,
  playbackControls,
  viewerSettings,
  isViewerSettingsOpen,
  onToggleViewerSettings,
  onCloseViewerSettings,
  renderingQuality,
  onRenderingQualityChange
}: PlaybackControlsPanelProps) {
  const { windowMargin, controlWindowWidth, resetToken, controlWindowInitialPosition, viewerSettingsWindowInitialPosition } =
    layout;
  const {
    is3dModeAvailable,
    isVrActive,
    isVrRequesting,
    resetViewHandler,
    onVrButtonClick,
    vrButtonDisabled,
    vrButtonLabel,
    vrButtonTitle
  } = modeToggle;
  const {
    fps,
    onFpsChange,
    recordingBitrateMbps,
    onRecordingBitrateMbpsChange,
    volumeTimepointCount,
    isPlaying,
    playbackLabel,
    selectedIndex,
    onTimeIndexChange,
    playbackDisabled,
    onTogglePlayback,
    onJumpToStart,
    onJumpToEnd,
    error,
    onStartRecording,
    onStopRecording,
    isRecording,
    canRecord,
    activeSlicedLayerControl,
    onActiveSlicedLayerDepthChange
  } = playbackControls;
  const slicedDepthMax = activeSlicedLayerControl
    ? Math.max(0, activeSlicedLayerControl.depth - 1)
    : 0;
  const slicedDepthValue = activeSlicedLayerControl
    ? Math.min(Math.max(activeSlicedLayerControl.zIndex, 0), slicedDepthMax)
    : 0;
  const {
    samplingMode,
    onSamplingModeToggle,
    blendingMode,
    onBlendingModeToggle,
    showRenderingQualityControl,
    hasVolumeData
  } = viewerSettings;

  return (
    <>
      <FloatingWindow
        title="Viewer controls"
        initialPosition={controlWindowInitialPosition}
        width={`min(${controlWindowWidth}px, calc(100vw - ${windowMargin * 2}px))`}
        headerActions={
          <button
            type="button"
            className="floating-window-toggle"
            onClick={onToggleViewerSettings}
            aria-label={isViewerSettingsOpen ? 'Hide viewer settings window' : 'Show viewer settings window'}
            aria-pressed={isViewerSettingsOpen}
            data-no-drag
            title="Settings"
          >
            <span aria-hidden="true">⚙</span>
          </button>
        }
        className="floating-window--playback"
        resetSignal={resetToken}
      >
        <div className="sidebar sidebar-left global-controls">
          <div className="control-group">
            <div className="viewer-mode-row">
              <button
                type="button"
                className="viewer-mode-button"
                onClick={() => resetViewHandler?.()}
                disabled={!resetViewHandler}
              >
                Reset view
              </button>
              {is3dModeAvailable ? (
              <button
                type="button"
                className="viewer-mode-button"
                onClick={onVrButtonClick}
                disabled={isVrActive || isVrRequesting || !is3dModeAvailable || vrButtonDisabled}
                title={vrButtonTitle}
              >
                {vrButtonLabel}
                </button>
              ) : null}
            </div>
          </div>

          <div className="playback-controls">
            <div className="control-group playback-progress">
              <label htmlFor="playback-slider" className="control-label control-label--compact playback-progress__label">
                <span
                  className={
                    isPlaying ? 'playback-status playback-status--playing' : 'playback-status playback-status--stopped'
                  }
                >
                  {isPlaying ? 'Playing' : ''}
                </span>{' '}
                <span>{playbackLabel}</span>
              </label>
              <input
                id="playback-slider"
                className="playback-slider"
                type="range"
                min={0}
                max={Math.max(0, volumeTimepointCount - 1)}
                value={Math.min(selectedIndex, Math.max(0, volumeTimepointCount - 1))}
                onChange={(event) => onTimeIndexChange(Number(event.target.value))}
                disabled={playbackDisabled}
              />
            </div>
            <div className="playback-button-row">
              <button
                type="button"
                className="playback-button playback-button--skip"
                onClick={onJumpToStart}
                disabled={playbackDisabled}
                aria-label="Go to first frame"
              >
                <svg className="playback-button-icon" viewBox="0 0 24 24" role="img" aria-hidden="true" focusable="false">
                  <path d="M6.25 4c.414 0 .75.336.75.75v5.69l9.088-6.143A1.5 1.5 0 0 1 18.5 5.61v12.78a1.5 1.5 0 0 1-2.412 1.313L7 13.56v5.69a.75.75 0 0 1-1.5 0V4.75c0-.414.336-.75.75-.75Z" />
                </svg>
              </button>
              <button
                type="button"
                onClick={onTogglePlayback}
                disabled={playbackDisabled}
                className={isPlaying ? 'playback-button playback-toggle playing' : 'playback-button playback-toggle'}
                aria-label={isPlaying ? 'Pause playback' : 'Start playback'}
              >
                {isPlaying ? (
                  <svg className="playback-button-icon" viewBox="0 0 24 24" role="img" aria-hidden="true" focusable="false">
                    <path d="M9 5a1 1 0 0 1 1 1v12a1 1 0 1 1-2 0V6a1 1 0 0 1 1-1Zm6 0a1 1 0 0 1 1 1v12a1 1 0 1 1-2 0V6a1 1 0 0 1 1-1Z" />
                  </svg>
                ) : (
                  <svg className="playback-button-icon" viewBox="0 0 24 24" role="img" aria-hidden="true" focusable="false">
                    <path d="M8.5 5.636a1 1 0 0 1 1.53-.848l8.01 5.363a1 1 0 0 1 0 1.698l-8.01 5.363A1 1 0 0 1 8 16.364V7.636a1 1 0 0 1 .5-.868Z" />
                  </svg>
                )}
              </button>
              <button
                type="button"
                className="playback-button playback-button--skip"
                onClick={onJumpToEnd}
                disabled={playbackDisabled}
                aria-label="Go to last frame"
              >
                <svg className="playback-button-icon" viewBox="0 0 24 24" role="img" aria-hidden="true" focusable="false">
                  <path d="M17.75 4a.75.75 0 0 1 .75.75v13.5a.75.75 0 0 1-1.5 0v-5.69l-9.088 6.143A1.5 1.5 0 0 1 5.5 18.39V5.61a1.5 1.5 0 0 1 2.412-1.313L17 10.44V4.75c0-.414.336-.75.75-.75Z" />
                </svg>
              </button>
            </div>

          </div>

          {activeSlicedLayerControl ? (
            <div className="control-group control-group--slider">
              <label htmlFor={`sliced-depth-slider-${activeSlicedLayerControl.layerKey}`}>
                Z <span>{slicedDepthValue}</span>
              </label>
              <input
                id={`sliced-depth-slider-${activeSlicedLayerControl.layerKey}`}
                type="range"
                min={0}
                max={slicedDepthMax}
                step={1}
                value={slicedDepthValue}
                onChange={(event) =>
                  onActiveSlicedLayerDepthChange(Number.parseInt(event.target.value, 10))
                }
                disabled={playbackDisabled || slicedDepthMax <= 0}
              />
            </div>
          ) : null}

          {error && <p className="error">{error}</p>}
        </div>
      </FloatingWindow>

      <div style={{ display: isViewerSettingsOpen ? undefined : 'none' }} aria-hidden={!isViewerSettingsOpen}>
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
              onClick={onCloseViewerSettings}
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
      </div>
    </>
  );
}
