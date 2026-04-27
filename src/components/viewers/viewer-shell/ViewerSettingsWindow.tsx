import {
  DEFAULT_WINDOW_MAX,
  DEFAULT_WINDOW_MIN,
} from '../../../state/layerSettings';
import {
  clampPlaybackBufferFrames,
  MAX_PLAYBACK_BUFFER_FRAMES,
  MIN_PLAYBACK_BUFFER_FRAMES,
} from '../../../shared/utils/viewerPlayback';
import {
  DESKTOP_RENDER_RESOLUTION_OPTIONS,
  resolveDesktopRenderResolutionPixelRatioCap,
  type DesktopRenderResolution,
} from '../../../types/renderResolution';
import FloatingWindow from '../../widgets/FloatingWindow';
import type { GlobalRenderControls, LayoutProps, PlaybackControlsProps } from './types';
import type { ModeToggleState, ViewerSettingsControls } from './hooks/useViewerModeControls';
import {
  ViewerWindowButton,
  ViewerWindowRow,
  ViewerWindowSelectField,
  ViewerWindowSlider,
  ViewerWindowStack,
} from './window-ui';

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

const formatPixelRatioCap = (value: number): string => {
  const fixed = value.toFixed(1);
  return fixed.replace(/\.0$/, '');
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
  desktopRenderResolution: DesktopRenderResolution;
  onDesktopRenderResolutionChange: (value: DesktopRenderResolution) => void;
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
  desktopRenderResolution,
  onDesktopRenderResolutionChange,
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
  const selectedRenderResolutionPixelRatioCap =
    resolveDesktopRenderResolutionPixelRatioCap(desktopRenderResolution);

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
        <ViewerWindowStack className="viewer-settings-window">
          {is3dModeAvailable ? (
            <div className="control-group">
              <div className="viewer-mode-row">
                <ViewerWindowButton
                  type="button"
                  className="viewer-mode-button"
                  active={blendingMode === 'additive'}
                  onClick={onBlendingModeToggle}
                  disabled={!hasVolumeData}
                  aria-pressed={blendingMode === 'additive'}
                >
                  {blendingMode === 'additive' ? 'Additive color blending' : 'Alpha color blending'}
                </ViewerWindowButton>
              </div>
            </div>
          ) : null}

          {showRenderingQualityControl ? (
            <ViewerWindowSlider
              id="volume-steps-slider"
              label="Trilinear quality"
              valueLabel={renderingQuality}
              min={0.1}
              max={3}
              step={0.1}
              value={renderingQuality}
              onChange={(event) => onRenderingQualityChange(Number(event.target.value))}
            />
          ) : null}

          <ViewerWindowSelectField
            id="desktop-render-resolution-select"
            label={
              <>
                Render resolution <span>{formatPixelRatioCap(selectedRenderResolutionPixelRatioCap)}x</span>
              </>
            }
            value={desktopRenderResolution}
            onChange={(event) => onDesktopRenderResolutionChange(event.target.value as DesktopRenderResolution)}
          >
            {DESKTOP_RENDER_RESOLUTION_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label} ({formatPixelRatioCap(option.pixelRatioCap)}x)
              </option>
            ))}
          </ViewerWindowSelectField>

          <ViewerWindowSlider
            id="fps-slider"
            label="frames per second"
            valueLabel={fps}
            min={MIN_FPS}
            max={MAX_FPS}
            step={1}
            value={fps}
            onChange={(event) => onFpsChange(clampFps(Number(event.target.value)))}
            disabled={volumeTimepointCount <= 1}
          />

          <ViewerWindowSlider
            id="playback-buffer-slider"
            label="playback buffer frames"
            valueLabel={displayedPlaybackBufferFrames}
            min={MIN_PLAYBACK_BUFFER_FRAMES}
            max={playbackBufferSliderMax}
            step={1}
            value={displayedPlaybackBufferFrames}
            onChange={(event) => onPlaybackBufferFramesChange(clampPlaybackBufferFrames(Number(event.target.value)))}
            disabled={volumeTimepointCount <= 1}
          />

          <div className="render-settings-section">
            <span className="control-label control-label--compact">Global MIP / BL</span>
            <ViewerWindowSlider
              id="global-mip-early-exit"
              label="MIP early exit"
              valueLabel={formatNormalizedIntensity(mipEarlyExitThreshold)}
              min={DEFAULT_WINDOW_MIN}
              max={DEFAULT_WINDOW_MAX}
              step={0.001}
              value={mipEarlyExitThreshold}
              onChange={(event) => onMipEarlyExitThresholdChange(Number(event.target.value))}
              disabled={globalRenderControlsDisabled}
            />
            <ViewerWindowRow>
              <ViewerWindowSlider
                id="global-bl-density"
                label="BL density"
                valueLabel={formatBlControlValue(blDensityScale)}
                min={0}
                max={8}
                step={0.05}
                value={blDensityScale}
                onChange={(event) => onBlDensityScaleChange(Number(event.target.value))}
                disabled={globalRenderControlsDisabled}
              />
              <ViewerWindowSlider
                id="global-bl-background-cutoff"
                label="BL cutoff"
                valueLabel={formatNormalizedIntensity(blBackgroundCutoff)}
                min={0}
                max={1}
                step={0.005}
                value={blBackgroundCutoff}
                onChange={(event) => onBlBackgroundCutoffChange(Number(event.target.value))}
                disabled={globalRenderControlsDisabled}
              />
            </ViewerWindowRow>
            <ViewerWindowRow>
              <ViewerWindowSlider
                id="global-bl-opacity"
                label="BL opacity"
                valueLabel={formatBlControlValue(blOpacityScale)}
                min={0}
                max={8}
                step={0.05}
                value={blOpacityScale}
                onChange={(event) => onBlOpacityScaleChange(Number(event.target.value))}
                disabled={globalRenderControlsDisabled}
              />
              <ViewerWindowSlider
                id="global-bl-early-exit"
                label="BL early exit"
                valueLabel={formatNormalizedIntensity(blEarlyExitAlpha)}
                min={0}
                max={1}
                step={0.005}
                value={blEarlyExitAlpha}
                onChange={(event) => onBlEarlyExitAlphaChange(Number(event.target.value))}
                disabled={globalRenderControlsDisabled}
              />
            </ViewerWindowRow>
          </div>
        </ViewerWindowStack>
      </div>
    </FloatingWindow>
  );
}
