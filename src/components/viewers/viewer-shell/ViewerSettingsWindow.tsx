import {
  DEFAULT_WINDOW_MAX,
  DEFAULT_WINDOW_MIN,
} from '../../../state/layerSettings';
import {
  clampPlaybackBufferFrames,
  MAX_PLAYBACK_BUFFER_FRAMES,
  MIN_PLAYBACK_BUFFER_FRAMES,
} from '../../../shared/utils/viewerPlayback';
import FloatingWindow from '../../widgets/FloatingWindow';
import type { GlobalRenderControls, LayoutProps, PlaybackControlsProps } from './types';
import type { ModeToggleState, ViewerSettingsControls } from './hooks/useViewerModeControls';

const MIN_FPS = 1;
const MAX_FPS = 30;

const clampFps = (value: number) => Math.min(MAX_FPS, Math.max(MIN_FPS, value));

const formatNormalizedIntensity = (value: number): string => {
  const fixed = value.toFixed(3);
  return fixed.replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '');
};

const formatBlControlValue = (value: number): string => {
  const fixed = value.toFixed(2);
  return fixed.replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '');
};

export type ViewerSettingsWindowProps = {
  layout: Pick<LayoutProps, 'windowMargin' | 'controlWindowWidth' | 'viewerSettingsWindowInitialPosition' | 'resetToken'>;
  modeToggle: ModeToggleState;
  playbackControls: Pick<
    PlaybackControlsProps,
    'fps' | 'onFpsChange' | 'playbackBufferFrames' | 'onPlaybackBufferFramesChange' | 'volumeTimepointCount'
  >;
  viewerSettings: ViewerSettingsControls;
  isOpen: boolean;
  onClose: () => void;
  renderingQuality: number;
  onRenderingQualityChange: (value: number) => void;
  globalRenderControls: GlobalRenderControls;
};

export default function ViewerSettingsWindow({
  layout,
  modeToggle,
  playbackControls,
  viewerSettings,
  isOpen,
  onClose,
  renderingQuality,
  onRenderingQualityChange,
  globalRenderControls
}: ViewerSettingsWindowProps) {
  const { windowMargin, controlWindowWidth, resetToken, viewerSettingsWindowInitialPosition } = layout;
  const { is3dModeAvailable } = modeToggle;
  const {
    fps,
    onFpsChange,
    playbackBufferFrames,
    onPlaybackBufferFramesChange,
    volumeTimepointCount
  } = playbackControls;
  const {
    blendingMode,
    onBlendingModeToggle,
    showRenderingQualityControl,
    hasVolumeData
  } = viewerSettings;
  const {
    disabled: globalRenderControlsDisabled,
    mipEarlyExitThreshold,
    blDensityScale,
    blBackgroundCutoff,
    blOpacityScale,
    blEarlyExitAlpha,
    onBlDensityScaleChange,
    onBlBackgroundCutoffChange,
    onBlOpacityScaleChange,
    onBlEarlyExitAlphaChange,
    onMipEarlyExitThresholdChange
  } = globalRenderControls;
  const playbackBufferSliderMax = Math.min(
    MAX_PLAYBACK_BUFFER_FRAMES,
    Math.max(MIN_PLAYBACK_BUFFER_FRAMES, volumeTimepointCount - 1)
  );
  const displayedPlaybackBufferFrames = Math.min(playbackBufferFrames, playbackBufferSliderMax);

  if (!isOpen) {
    return null;
  }

  return (
    <FloatingWindow
      title="Render settings"
      initialPosition={viewerSettingsWindowInitialPosition}
      width={`min(${controlWindowWidth}px, calc(100vw - ${windowMargin * 2}px))`}
      className="floating-window--viewer-settings"
      resetSignal={resetToken}
      onClose={onClose}
    >
      <div className="sidebar sidebar-right">
        <div className="global-controls">
          {is3dModeAvailable ? (
            <div className="control-group">
              <div className="viewer-mode-row">
                <button
                  type="button"
                  className={blendingMode === 'additive' ? 'viewer-mode-button is-active' : 'viewer-mode-button'}
                  onClick={onBlendingModeToggle}
                  disabled={!hasVolumeData}
                  aria-pressed={blendingMode === 'additive'}
                >
                  {blendingMode === 'additive' ? 'Additive color blending' : 'Alpha color blending'}
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

          <div className="control-group control-group--slider">
            <label htmlFor="playback-buffer-slider">playback buffer frames</label>
            <div className="double-range-input">
              <input
                id="playback-buffer-slider"
                type="range"
                min={MIN_PLAYBACK_BUFFER_FRAMES}
                max={playbackBufferSliderMax}
                step={1}
                value={displayedPlaybackBufferFrames}
                onChange={(event) => onPlaybackBufferFramesChange(clampPlaybackBufferFrames(Number(event.target.value)))}
                disabled={volumeTimepointCount <= 1}
              />
              <input
                type="number"
                min={MIN_PLAYBACK_BUFFER_FRAMES}
                max={playbackBufferSliderMax}
                value={displayedPlaybackBufferFrames}
                onChange={(event) => onPlaybackBufferFramesChange(clampPlaybackBufferFrames(Number(event.target.value)))}
                disabled={volumeTimepointCount <= 1}
              />
            </div>
          </div>

          <div className="render-settings-section">
            <span className="control-label control-label--compact">Global MIP / BL</span>
            <div className="control-group control-group--slider">
              <label htmlFor="global-mip-early-exit">
                MIP early exit <span>{formatNormalizedIntensity(mipEarlyExitThreshold)}</span>
              </label>
              <input
                id="global-mip-early-exit"
                type="range"
                min={DEFAULT_WINDOW_MIN}
                max={DEFAULT_WINDOW_MAX}
                step={0.001}
                value={mipEarlyExitThreshold}
                onChange={(event) => onMipEarlyExitThresholdChange(Number(event.target.value))}
                disabled={globalRenderControlsDisabled}
              />
            </div>
            <div className="control-row">
              <div className="control-group control-group--slider">
                <label htmlFor="global-bl-density">
                  BL density <span>{formatBlControlValue(blDensityScale)}</span>
                </label>
                <input
                  id="global-bl-density"
                  type="range"
                  min={0}
                  max={8}
                  step={0.05}
                  value={blDensityScale}
                  onChange={(event) => onBlDensityScaleChange(Number(event.target.value))}
                  disabled={globalRenderControlsDisabled}
                />
              </div>
              <div className="control-group control-group--slider">
                <label htmlFor="global-bl-background-cutoff">
                  BL cutoff <span>{formatNormalizedIntensity(blBackgroundCutoff)}</span>
                </label>
                <input
                  id="global-bl-background-cutoff"
                  type="range"
                  min={0}
                  max={1}
                  step={0.005}
                  value={blBackgroundCutoff}
                  onChange={(event) => onBlBackgroundCutoffChange(Number(event.target.value))}
                  disabled={globalRenderControlsDisabled}
                />
              </div>
            </div>
            <div className="control-row">
              <div className="control-group control-group--slider">
                <label htmlFor="global-bl-opacity">
                  BL opacity <span>{formatBlControlValue(blOpacityScale)}</span>
                </label>
                <input
                  id="global-bl-opacity"
                  type="range"
                  min={0}
                  max={8}
                  step={0.05}
                  value={blOpacityScale}
                  onChange={(event) => onBlOpacityScaleChange(Number(event.target.value))}
                  disabled={globalRenderControlsDisabled}
                />
              </div>
              <div className="control-group control-group--slider">
                <label htmlFor="global-bl-early-exit">
                  BL early exit <span>{formatNormalizedIntensity(blEarlyExitAlpha)}</span>
                </label>
                <input
                  id="global-bl-early-exit"
                  type="range"
                  min={0}
                  max={1}
                  step={0.005}
                  value={blEarlyExitAlpha}
                  onChange={(event) => onBlEarlyExitAlphaChange(Number(event.target.value))}
                  disabled={globalRenderControlsDisabled}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </FloatingWindow>
  );
}
