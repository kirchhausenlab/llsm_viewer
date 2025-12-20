import FloatingWindow from '../../widgets/FloatingWindow';
import type { LayoutProps, ViewerMode } from './types';
import type { ModeToggleState, ViewerSettingsControls } from './hooks/useViewerModeControls';
import type { PlaybackControlState } from './hooks/useViewerPlaybackControls';

export type PlaybackControlsPanelProps = {
  layout: Pick<LayoutProps, 'windowMargin' | 'controlWindowWidth' | 'controlWindowInitialPosition' | 'resetToken'> & {
    viewerSettingsWindowInitialPosition: LayoutProps['viewerSettingsWindowInitialPosition'];
  };
  viewerMode: ViewerMode;
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
  viewerMode,
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
    onToggleViewerMode,
    onVrButtonClick,
    vrButtonDisabled,
    vrButtonLabel,
    vrButtonTitle
  } = modeToggle;
  const {
    fps,
    onFpsChange,
    volumeTimepointCount,
    clampedSliceIndex,
    maxSliceDepth,
    onSliceIndexChange,
    isPlaying,
    playbackLabel,
    selectedIndex,
    onTimeIndexChange,
    playbackDisabled,
    onTogglePlayback,
    onJumpToStart,
    onJumpToEnd,
    error,
    isSliceSliderVisible,
    onStartRecording,
    onStopRecording,
    isRecording,
    canRecord
  } = playbackControls;
  const {
    renderStyle,
    samplingMode,
    onRenderStyleToggle,
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
                onClick={onToggleViewerMode}
                className={viewerMode === '3d' ? 'viewer-mode-button is-active' : 'viewer-mode-button'}
                disabled={isVrActive || isVrRequesting || !is3dModeAvailable}
              >
                {viewerMode === '3d' ? '3D view' : '2D view'}
              </button>
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
                  disabled={vrButtonDisabled}
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

            {isSliceSliderVisible ? (
              <div className="control-group">
                <label htmlFor="z-plane-slider" className="control-label control-label--compact">
                  Z plane{' '}
                  <span>
                    {clampedSliceIndex} / {maxSliceDepth}
                  </span>
                </label>
                <input
                  id="z-plane-slider"
                  type="range"
                  min={0}
                  max={maxSliceDepth}
                  value={clampedSliceIndex}
                  onChange={(event) => onSliceIndexChange(Number(event.target.value))}
                  disabled={maxSliceDepth <= 1}
                />
              </div>
            ) : null}
          </div>

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
                      className={renderStyle === 1 ? 'viewer-mode-button is-active' : 'viewer-mode-button'}
                      onClick={onRenderStyleToggle}
                      disabled={!hasVolumeData || viewerMode !== '3d'}
                      aria-pressed={renderStyle === 1}
                    >
                      Rendering
                    </button>
                    <button
                      type="button"
                      className={samplingMode === 'linear' ? 'viewer-mode-button is-active' : 'viewer-mode-button'}
                      onClick={onSamplingModeToggle}
                      disabled={!hasVolumeData || viewerMode !== '3d'}
                      aria-pressed={samplingMode === 'linear'}
                    >
                      {samplingMode === 'linear' ? 'Quality' : 'Speed'}
                    </button>
                    <button
                      type="button"
                      className={blendingMode === 'additive' ? 'viewer-mode-button is-active' : 'viewer-mode-button'}
                      onClick={onBlendingModeToggle}
                      disabled={!hasVolumeData || viewerMode !== '3d'}
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
                      min={1}
                      max={120}
                      step={1}
                      value={fps}
                      onChange={(event) => onFpsChange(Number(event.target.value))}
                      disabled={volumeTimepointCount <= 1}
                    />
                    <input
                      type="number"
                      min={1}
                      max={120}
                      value={fps}
                      onChange={(event) => onFpsChange(Number(event.target.value))}
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
                    min={1}
                    max={60}
                    step={1}
                    value={fps}
                    onChange={(event) => onFpsChange(Number(event.target.value))}
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
            </div>
          </div>
        </FloatingWindow>
      </div>
    </>
  );
}
