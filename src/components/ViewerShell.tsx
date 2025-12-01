import {
  useEffect,
  useState,
  type ComponentProps,
  type CSSProperties,
  type MouseEvent,
  type RefObject
} from 'react';

import FloatingWindow from './FloatingWindow';
import PlanarViewer from './PlanarViewer';
import SelectedTracksWindow from './SelectedTracksWindow';
import VolumeViewer from './VolumeViewer';
import type { VolumeViewerProps } from './VolumeViewer.types';
import BrightnessContrastHistogram from './BrightnessContrastHistogram';
import { DEFAULT_LAYER_COLOR, GRAYSCALE_COLOR_SWATCHES, normalizeHexColor } from '../layerColors';
import {
  DEFAULT_WINDOW_MAX,
  DEFAULT_WINDOW_MIN,
  createDefaultLayerSettings,
  type LayerSettings
} from '../state/layerSettings';
import { applyAlphaToHex } from '../utils/appHelpers';
import {
  DEFAULT_TRACK_COLOR,
  TRACK_COLOR_SWATCHES,
  getTrackColorHex,
  normalizeTrackColor
} from '../trackColors';
import type { LoadedLayer } from '../types/layers';
import type { HoveredVoxelInfo } from '../types/hover';
import type { NumericRange, TrackColorMode, TrackDefinition, TrackPoint } from '../types/tracks';
import type { ChannelSource } from '../App';

const formatNormalizedIntensity = (value: number): string => {
  const fixed = value.toFixed(3);
  return fixed.replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '');
};

type TrackSummary = { total: number; visible: number };

type PlanarViewerProps = ComponentProps<typeof PlanarViewer>;

type TopMenuProps = {
  onReturnToLauncher: () => void;
  onResetLayout: () => void;
  helpMenuRef: RefObject<HTMLDivElement>;
  isHelpMenuOpen: boolean;
  onHelpMenuToggle: () => void;
  followedTrackChannelId: string | null;
  followedTrackId: string | null;
  onStopTrackFollow: (channelId?: string) => void;
  hoveredVoxel: HoveredVoxelInfo | null;
};

type ModeControlsProps = {
  is3dModeAvailable: boolean;
  isVrActive: boolean;
  isVrRequesting: boolean;
  resetViewHandler: (() => void) | null;
  onToggleViewerMode: () => void;
  onVrButtonClick: () => void;
  vrButtonDisabled: boolean;
  vrButtonTitle?: string;
  vrButtonLabel: string;
  renderStyle: 0 | 1;
  samplingMode: 'linear' | 'nearest';
  onRenderStyleToggle: () => void;
  onSamplingModeToggle: () => void;
  blendingMode: 'alpha' | 'additive';
  onBlendingModeToggle: () => void;
};

type PlaybackControlsProps = {
  fps: number;
  onFpsChange: (value: number) => void;
  volumeTimepointCount: number;
  sliceIndex: number;
  maxSliceDepth: number;
  onSliceIndexChange: (index: number) => void;
  isPlaying: boolean;
  playbackLabel: string;
  selectedIndex: number;
  onTimeIndexChange: (index: number) => void;
  playbackDisabled: boolean;
  onTogglePlayback: () => void;
  onJumpToStart: () => void;
  onJumpToEnd: () => void;
  error: string | null;
};

type ChannelsPanelProps = {
  loadedChannelIds: string[];
  channelNameMap: Map<string, string>;
  channelVisibility: Record<string, boolean>;
  channelTintMap: Map<string, string>;
  activeChannelId: string | null;
  onChannelTabSelect: (channelId: string) => void;
  onChannelVisibilityToggle: (channelId: string) => void;
  channelLayersMap: Map<string, LoadedLayer[]>;
  channelActiveLayer: Record<string, string>;
  layerSettings: Record<string, LayerSettings>;
  getLayerDefaultSettings: (layerKey: string) => LayerSettings;
  onChannelLayerSelect: (channelId: string, layerKey: string) => void;
  onChannelReset: (channelId: string) => void;
  onLayerWindowMinChange: (layerKey: string, value: number) => void;
  onLayerWindowMaxChange: (layerKey: string, value: number) => void;
  onLayerBrightnessChange: (layerKey: string, value: number) => void;
  onLayerContrastChange: (layerKey: string, value: number) => void;
  onLayerAutoContrast: (layerKey: string) => void;
  onLayerOffsetChange: (layerKey: string, axis: 'x' | 'y', value: number) => void;
  onLayerColorChange: (layerKey: string, color: string) => void;
  onLayerInvertToggle: (layerKey: string) => void;
};

type ChannelPanelStyle = CSSProperties & { '--channel-slider-color'?: string };

type TrackPanelStyle = CSSProperties & {
  '--track-accent-color'?: string;
  '--track-accent-border'?: string;
  '--track-accent-strong-border'?: string;
  '--track-accent-soft'?: string;
  '--track-accent-strong'?: string;
  '--track-accent-hover'?: string;
  '--track-accent-focus'?: string;
  '--track-accent-glow'?: string;
};

type TracksPanelProps = {
  channels: ChannelSource[];
  channelNameMap: Map<string, string>;
  activeChannelId: string | null;
  onChannelTabSelect: (channelId: string) => void;
  parsedTracksByChannel: Map<string, TrackDefinition[]>;
  filteredTracksByChannel: Map<string, TrackDefinition[]>;
  minimumTrackLength: number;
  pendingMinimumTrackLength: number;
  trackLengthBounds: NumericRange;
  onMinimumTrackLengthChange: (value: number) => void;
  onMinimumTrackLengthApply: () => void;
  channelTrackColorModes: Record<string, TrackColorMode>;
  trackOpacityByChannel: Record<string, number>;
  trackLineWidthByChannel: Record<string, number>;
  trackSummaryByChannel: Map<string, TrackSummary>;
  followedTrackChannelId: string | null;
  followedTrackId: string | null;
  onTrackOrderToggle: (channelId: string) => void;
  trackOrderModeByChannel: Record<string, 'id' | 'length'>;
  trackVisibility: Record<string, boolean>;
  onTrackVisibilityToggle: (trackId: string) => void;
  onTrackVisibilityAllChange: (channelId: string, visible: boolean) => void;
  onTrackOpacityChange: (channelId: string, value: number) => void;
  onTrackLineWidthChange: (channelId: string, value: number) => void;
  onTrackColorSelect: (channelId: string, color: string) => void;
  onTrackColorReset: (channelId: string) => void;
  onTrackSelectionToggle: (trackId: string) => void;
  selectedTrackIds: ReadonlySet<string>;
  onTrackFollow: (trackId: string) => void;
};

type SelectedTracksPanelProps = {
  shouldRender: boolean;
  series: Array<{ id: string; label: string; color: string; points: TrackPoint[] }>;
  totalTimepoints: number;
  amplitudeExtent: NumericRange;
  amplitudeLimits: NumericRange;
  timeExtent: NumericRange;
  timeLimits: NumericRange;
  onAmplitudeLimitsChange: (limits: NumericRange) => void;
  onTimeLimitsChange: (limits: NumericRange) => void;
  onAutoRange: () => void;
  onClearSelection: () => void;
  currentTimepoint: number;
  onTrackSelectionToggle: (trackId: string) => void;
};

type Position = { x: number; y: number };

type LayoutProps = {
  windowMargin: number;
  controlWindowWidth: number;
  selectedTracksWindowWidth: number;
  resetToken: number;
  controlWindowInitialPosition: Position;
  viewerSettingsWindowInitialPosition: Position;
  layersWindowInitialPosition: Position;
  trackWindowInitialPosition: Position;
  selectedTracksWindowInitialPosition: Position;
};

type TrackDefaults = {
  opacity: number;
  lineWidth: number;
};

export type ViewerShellProps = {
  viewerMode: '3d' | '2d';
  volumeViewerProps: VolumeViewerProps;
  planarViewerProps: PlanarViewerProps;
  topMenu: TopMenuProps;
  layout: LayoutProps;
  modeControls: ModeControlsProps;
  playbackControls: PlaybackControlsProps;
  channelsPanel: ChannelsPanelProps;
  tracksPanel: TracksPanelProps;
  selectedTracksPanel: SelectedTracksPanelProps;
  trackDefaults: TrackDefaults;
};

function ViewerShell({
  viewerMode,
  volumeViewerProps,
  planarViewerProps,
  topMenu,
  layout,
  modeControls,
  playbackControls,
  channelsPanel,
  tracksPanel,
    selectedTracksPanel,
  trackDefaults
}: ViewerShellProps) {
  const {
    onReturnToLauncher,
    onResetLayout,
    helpMenuRef,
    isHelpMenuOpen,
    onHelpMenuToggle,
    followedTrackChannelId: topMenuFollowedTrackChannelId,
    followedTrackId: topMenuFollowedTrackId,
    onStopTrackFollow,
    hoveredVoxel
  } = topMenu;
  const {
    windowMargin,
    controlWindowWidth,
    selectedTracksWindowWidth,
    resetToken,
    controlWindowInitialPosition,
    viewerSettingsWindowInitialPosition,
    layersWindowInitialPosition,
    trackWindowInitialPosition,
    selectedTracksWindowInitialPosition
  } = layout;
  const {
    is3dModeAvailable,
    isVrActive,
    isVrRequesting,
    resetViewHandler,
    onToggleViewerMode,
    onVrButtonClick,
    vrButtonDisabled,
    vrButtonTitle,
    vrButtonLabel,
    renderStyle,
    samplingMode,
    onRenderStyleToggle,
    onSamplingModeToggle,
    blendingMode,
    onBlendingModeToggle
  } = modeControls;
  const {
    fps,
    onFpsChange,
    volumeTimepointCount,
    sliceIndex,
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
    error
  } = playbackControls;
  const {
    loadedChannelIds,
    channelNameMap,
    channelVisibility,
    channelTintMap,
    activeChannelId,
    onChannelTabSelect,
    onChannelVisibilityToggle,
    channelLayersMap,
    channelActiveLayer,
    layerSettings,
    getLayerDefaultSettings,
    onChannelLayerSelect,
    onChannelReset,
    onLayerWindowMinChange,
    onLayerWindowMaxChange,
    onLayerBrightnessChange,
    onLayerContrastChange,
    onLayerAutoContrast,
    onLayerOffsetChange,
    onLayerColorChange,
    onLayerInvertToggle
  } = channelsPanel;
  const {
    channels,
    activeChannelId: activeTrackChannelId,
    onChannelTabSelect: onTrackChannelTabSelect,
    parsedTracksByChannel,
    filteredTracksByChannel,
    minimumTrackLength,
    pendingMinimumTrackLength,
    trackLengthBounds,
    onMinimumTrackLengthChange,
    onMinimumTrackLengthApply,
    channelTrackColorModes,
    trackOpacityByChannel,
    trackLineWidthByChannel,
    trackSummaryByChannel,
    followedTrackChannelId: tracksPanelFollowedTrackChannelId,
    followedTrackId: tracksPanelFollowedTrackId,
    onTrackOrderToggle,
    trackOrderModeByChannel,
    trackVisibility,
    onTrackVisibilityToggle,
    onTrackVisibilityAllChange,
    onTrackOpacityChange,
    onTrackLineWidthChange,
    onTrackColorSelect,
    onTrackColorReset,
    onTrackSelectionToggle,
    selectedTrackIds,
    onTrackFollow
  } = tracksPanel;
  const {
    shouldRender,
    series,
    totalTimepoints,
    amplitudeExtent,
    amplitudeLimits,
    timeExtent,
    timeLimits,
    onAmplitudeLimitsChange,
    onTimeLimitsChange,
    onAutoRange,
    onClearSelection,
    currentTimepoint,
    onTrackSelectionToggle: onSelectedTrackToggle
  } = selectedTracksPanel;
  const hasVolumeData = loadedChannelIds.some((channelId) =>
    (channelLayersMap.get(channelId) ?? []).some((layer) => layer.volumes.length > 0)
  );

  const hasTrackData = channels.some(
    (channel) => (parsedTracksByChannel.get(channel.id)?.length ?? 0) > 0
  );

  const [renderingQuality, setRenderingQuality] = useState(1);
  const [isViewerSettingsOpen, setIsViewerSettingsOpen] = useState(false);

  const handleRenderingQualityChange = (value: number) => {
    setRenderingQuality(value);
    volumeViewerProps.onVolumeStepScaleChange?.(value);
  };

  const toggleViewerSettingsVisibility = () => {
    setIsViewerSettingsOpen((current) => !current);
  };

  const closeViewerSettings = () => {
    setIsViewerSettingsOpen(false);
  };

  useEffect(() => {
    setIsViewerSettingsOpen(false);
  }, [resetToken]);

  const showRenderingQualityControl =
    is3dModeAvailable && viewerMode === '3d' && samplingMode === 'linear';

  const intensityComponents =
    hoveredVoxel && hoveredVoxel.components.length > 0
      ? hoveredVoxel.components
      : hoveredVoxel
      ? [{ text: hoveredVoxel.intensity, color: null }]
      : [];

  const isTrackFollowActive =
    topMenuFollowedTrackChannelId !== null && topMenuFollowedTrackId !== null;

  return (
    <>
      <div className="app">
        <main className="viewer">
          {viewerMode === '3d' ? (
            <VolumeViewer {...volumeViewerProps} />
          ) : (
            <PlanarViewer {...planarViewerProps} />
          )}
        </main>
        <div className="viewer-top-menu">
          <div className="viewer-top-menu-row">
            <div className="viewer-top-menu-actions">
              <button type="button" className="viewer-top-menu-button" onClick={onReturnToLauncher}>
                ↩ Return
              </button>
              <button type="button" className="viewer-top-menu-button" onClick={onResetLayout}>
                Reset layout
              </button>
              <div className="viewer-top-menu-help" ref={helpMenuRef}>
                <button
                  type="button"
                  className="viewer-top-menu-button"
                  onClick={onHelpMenuToggle}
                  aria-expanded={isHelpMenuOpen}
                  aria-controls="viewer-help-popover"
                >
                  Help
                </button>
                {isHelpMenuOpen ? (
                  <div
                    id="viewer-help-popover"
                    className="viewer-top-menu-popover"
                    role="dialog"
                    aria-modal="false"
                    aria-labelledby="viewer-help-popover-title"
                  >
                    <h3 id="viewer-help-popover-title" className="viewer-top-menu-popover-title">
                      Viewer tips
                    </h3>
                    <div className="viewer-top-menu-popover-section">
                      <h4>3D volume view</h4>
                      <ul>
                        <li>Use WASDQE to move forward, back, strafe, and rise or descend.</li>
                        <li>
                          Drag to orbit the dataset. Hold Shift while dragging to pan; hold Ctrl to dolly along your view.
                        </li>
                        <li>
                          Click a track line to select and highlight it. Use the Follow button in the Tracks window to follow
                          that object in time.
                        </li>
                      </ul>
                    </div>
                    <div className="viewer-top-menu-popover-section">
                      <h4>2D slice view</h4>
                      <ul>
                        <li>Press W/S to step through slices (hold Shift to skip 10 at a time).</li>
                        <li>Drag to pan the slice, and scroll to zoom.</li>
                        <li>Press Q/E to rotate the slice around its center.</li>
                      </ul>
                    </div>
                  </div>
                ) : null}
              </div>
              {isTrackFollowActive ? (
                <button
                  type="button"
                  className="viewer-top-menu-button viewer-top-menu-button--danger"
                  onClick={() => onStopTrackFollow(topMenuFollowedTrackChannelId ?? undefined)}
                >
                  Stop following
                </button>
              ) : null}
            </div>
            <div className="viewer-top-menu-intensity" role="status" aria-live="polite">
              {hoveredVoxel ? (
                <>
                  <span className="viewer-top-menu-coordinates">
                    ({hoveredVoxel.coordinates.x}, {hoveredVoxel.coordinates.y}, {hoveredVoxel.coordinates.z})
                  </span>
                  <span className="viewer-top-menu-intensity-value">
                    {intensityComponents.map((component, index) => (
                      <span
                        key={`${component.text}-${index}`}
                        className="viewer-top-menu-intensity-part"
                      >
                        <span style={component.color ? { color: component.color } : undefined}>
                          {component.text}
                        </span>
                        {index < intensityComponents.length - 1 ? (
                          <span className="viewer-top-menu-intensity-separator" aria-hidden="true">
                            ·
                          </span>
                        ) : null}
                      </span>
                    ))}
                  </span>
                </>
              ) : (
                <span>—</span>
              )}
            </div>
          </div>
        </div>
        <FloatingWindow
          title="Viewer controls"
          initialPosition={controlWindowInitialPosition}
          width={`min(${controlWindowWidth}px, calc(100vw - ${windowMargin * 2}px))`}
          headerActions={
            <button
              type="button"
              className="floating-window-toggle"
              onClick={toggleViewerSettingsVisibility}
              aria-label={
                isViewerSettingsOpen ? 'Hide viewer settings window' : 'Show viewer settings window'
              }
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
            {viewerMode === '2d' && maxSliceDepth > 0 ? (
              <div className="control-group">
                <label htmlFor="z-plane-slider" className="control-label control-label--compact">
                  Z plane{' '}
                  <span>
                    {Math.min(sliceIndex, Math.max(0, maxSliceDepth - 1))} / {Math.max(0, maxSliceDepth - 1)}
                  </span>
                </label>
                <input
                  id="z-plane-slider"
                  type="range"
                  min={0}
                  max={Math.max(0, maxSliceDepth - 1)}
                  value={Math.min(sliceIndex, Math.max(0, maxSliceDepth - 1))}
                  onChange={(event) => onSliceIndexChange(Number(event.target.value))}
                  disabled={maxSliceDepth <= 1}
                />
              </div>
            ) : null}

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
                <label
                  htmlFor="playback-slider"
                  className="control-label control-label--compact playback-progress__label"
                >
                  <span
                    className={
                      isPlaying
                        ? 'playback-status playback-status--playing'
                        : 'playback-status playback-status--stopped'
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
                  <svg
                    className="playback-button-icon"
                    viewBox="0 0 24 24"
                    role="img"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <path d="M6.25 4c.414 0 .75.336.75.75v5.69l9.088-6.143A1.5 1.5 0 0 1 18.5 5.61v12.78a1.5 1.5 0 0 1-2.412 1.313L7 13.56v5.69a.75.75 0 0 1-1.5 0V4.75c0-.414.336-.75.75-.75Z" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={onTogglePlayback}
                  disabled={playbackDisabled}
                  className={
                    isPlaying
                      ? 'playback-button playback-toggle playing'
                      : 'playback-button playback-toggle'
                  }
                  aria-label={isPlaying ? 'Pause playback' : 'Start playback'}
                >
                  {isPlaying ? (
                    <svg
                      className="playback-button-icon"
                      viewBox="0 0 24 24"
                      role="img"
                      aria-hidden="true"
                      focusable="false"
                    >
                      <path d="M9 5a1 1 0 0 1 1 1v12a1 1 0 1 1-2 0V6a1 1 0 0 1 1-1Zm6 0a1 1 0 0 1 1 1v12a1 1 0 1 1-2 0V6a1 1 0 0 1 1-1Z" />
                    </svg>
                  ) : (
                    <svg
                      className="playback-button-icon"
                      viewBox="0 0 24 24"
                      role="img"
                      aria-hidden="true"
                      focusable="false"
                    >
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
                  <svg
                    className="playback-button-icon"
                    viewBox="0 0 24 24"
                    role="img"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <path d="M17.75 4a.75.75 0 0 1 .75.75v13.5a.75.75 0 0 1-1.5 0v-5.69l-9.088 6.143A1.5 1.5 0 0 1 5.5 18.39V5.61a1.5 1.5 0 0 1 2.412-1.313L17 10.44V4.75c0-.414.336-.75.75-.75Z" />
                  </svg>
                </button>
              </div>
            </div>

            {error && <p className="error">{error}</p>}
          </div>
        </FloatingWindow>

        <div
          style={{ display: isViewerSettingsOpen ? undefined : 'none' }}
          aria-hidden={!isViewerSettingsOpen}
        >
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
                onClick={closeViewerSettings}
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
                        className={
                          samplingMode === 'nearest' ? 'viewer-mode-button is-active' : 'viewer-mode-button'
                        }
                        onClick={onSamplingModeToggle}
                        disabled={!hasVolumeData || viewerMode !== '3d'}
                        aria-pressed={samplingMode === 'nearest'}
                      >
                        Sampling
                      </button>
                      <button
                        type="button"
                        className={
                          blendingMode === 'alpha' ? 'viewer-mode-button is-active' : 'viewer-mode-button'
                        }
                        onClick={onBlendingModeToggle}
                        disabled={!hasVolumeData || viewerMode !== '3d'}
                        aria-pressed={blendingMode === 'alpha'}
                      >
                        Blending
                      </button>
                    </div>
                  </div>
                ) : null}

              {is3dModeAvailable && viewerMode === '3d' ? (
                showRenderingQualityControl ? (
                  <div className="control-row">
                    <div className="control-group control-group--slider">
                      <label htmlFor="rendering-quality-slider">
                        Trilinear quality <span>{renderingQuality.toFixed(2)}</span>
                      </label>
                      <input
                        id="rendering-quality-slider"
                        type="range"
                        min={0.1}
                        max={3}
                        step={0.01}
                        value={renderingQuality}
                        onChange={(event) => handleRenderingQualityChange(Number(event.target.value))}
                      />
                    </div>
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
                )
              ) : (
                <div className="control-group">
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
            </div>
          </div>
        </FloatingWindow>

        </div>

        <FloatingWindow
          title="Channels"
          initialPosition={layersWindowInitialPosition}
          width={`min(${controlWindowWidth}px, calc(100vw - ${windowMargin * 2}px))`}
          className="floating-window--channels"
          resetSignal={resetToken}
          headerContent={
            loadedChannelIds.length > 0 ? (
              <div className="channel-tabs channel-tabs--header" role="tablist" aria-label="Volume channels">
                {loadedChannelIds.map((channelId) => {
                  const label = channelNameMap.get(channelId) ?? 'Untitled channel';
                  const displayLabel = label.length > 9 ? `${label.slice(0, 6)}...` : label;
                  const isActive = channelId === activeChannelId;
                  const isVisible = channelVisibility[channelId] ?? true;
                  const tabClassName = ['channel-tab', isActive ? 'is-active' : '', !isVisible ? 'is-hidden' : '']
                    .filter(Boolean)
                    .join(' ');
                  const labelClassName = isVisible
                    ? 'channel-tab-label'
                    : 'channel-tab-label channel-tab-label--hidden';
                  const tintColor = channelTintMap.get(channelId) ?? DEFAULT_LAYER_COLOR;
                  const tabStyle: CSSProperties & Record<string, string> = {
                    '--channel-tab-background': applyAlphaToHex(tintColor, 0.18),
                    '--channel-tab-background-active': applyAlphaToHex(tintColor, 0.35),
                    '--channel-tab-border': 'rgba(255, 255, 255, 0.15)',
                    '--channel-tab-border-active': applyAlphaToHex(tintColor, 0.55)
                  };
                  const handleChannelTabClick = (event: MouseEvent<HTMLButtonElement>) => {
                    if (event.ctrlKey) {
                      event.preventDefault();
                      onChannelVisibilityToggle(channelId);
                      return;
                    }
                    onChannelTabSelect(channelId);
                  };
                  return (
                    <button
                      key={channelId}
                      type="button"
                      className={tabClassName}
                      style={tabStyle}
                      onClick={handleChannelTabClick}
                      title={
                        isVisible ? 'Ctrl + click to hide this channel' : 'Ctrl + click to show this channel'
                      }
                      role="tab"
                      id={`channel-tab-${channelId}`}
                      aria-label={label}
                      aria-selected={isActive}
                      aria-controls={`channel-panel-${channelId}`}
                    >
                      <span className={labelClassName}>{displayLabel}</span>
                    </button>
                  );
                })}
              </div>
            ) : null
          }
        >
          <div className="sidebar sidebar-left">
            {loadedChannelIds.length > 0 ? (
              <div className="channel-controls">
                {loadedChannelIds.map((channelId) => {
                  const channelLayers = channelLayersMap.get(channelId) ?? [];
                  const selectedLayerKey = channelActiveLayer[channelId] ?? channelLayers[0]?.key ?? null;
                  const selectedLayer =
                    channelLayers.find((layer) => layer.key === selectedLayerKey) ?? channelLayers[0] ?? null;
                  const settings = selectedLayer
                    ? layerSettings[selectedLayer.key] ?? getLayerDefaultSettings(selectedLayer.key)
                    : createDefaultLayerSettings();
                  const sliderDisabled = !selectedLayer || selectedLayer.volumes.length === 0;
                  const offsetDisabled = sliderDisabled || channelId !== activeChannelId;
                  const firstVolume = selectedLayer?.volumes[0] ?? null;
                  const isGrayscale = Boolean(firstVolume && firstVolume.channels === 1);
                  const normalizedColor = normalizeHexColor(settings.color, DEFAULT_LAYER_COLOR);
                  const displayColor = normalizedColor.toUpperCase();
                  const isActive = channelId === activeChannelId;
                  const invertDisabled = sliderDisabled || Boolean(selectedLayer?.isSegmentation);
                  const invertTitle = selectedLayer?.isSegmentation
                    ? 'Invert LUT is unavailable for segmentation volumes.'
                    : undefined;
                  const channelTint = channelTintMap.get(channelId) ?? DEFAULT_LAYER_COLOR;
                  const channelPanelStyle: ChannelPanelStyle = {
                    '--channel-slider-color': channelTint
                  };

                  return (
                    <div
                      key={channelId}
                      id={`channel-panel-${channelId}`}
                      role="tabpanel"
                      aria-labelledby={`channel-tab-${channelId}`}
                      className={isActive ? 'channel-panel is-active' : 'channel-panel'}
                      hidden={!isActive}
                      style={channelPanelStyle}
                    >
                      {channelLayers.length > 1 ? (
                        <div
                          className="channel-layer-selector"
                          role="radiogroup"
                          aria-label={`${channelNameMap.get(channelId) ?? 'Channel'} volume`}
                        >
                          {channelLayers.map((layer) => {
                            const isSelected = Boolean(selectedLayer && selectedLayer.key === layer.key);
                            const inputId = `channel-${channelId}-layer-${layer.key}`;
                            return (
                              <label key={layer.key} className="channel-layer-option" htmlFor={inputId}>
                                <input
                                  type="radio"
                                  id={inputId}
                                  name={`channel-layer-${channelId}`}
                                  checked={isSelected}
                                  onChange={() => onChannelLayerSelect(channelId, layer.key)}
                                />
                                <span>{layer.label}</span>
                              </label>
                            );
                          })}
                        </div>
                      ) : channelLayers.length === 0 ? (
                        <p className="channel-empty-hint">No volume available for this channel.</p>
                      ) : null}
                      {selectedLayer ? (
                        <>
                          <div className="channel-primary-actions">
                            <div className="channel-primary-actions-row">
                              <button
                                type="button"
                                className="channel-action-button"
                                onClick={() => onChannelReset(channelId)}
                                disabled={channelLayers.length === 0}
                              >
                                Reset
                              </button>
                              <button
                                type="button"
                                className="channel-action-button"
                                onClick={() => onLayerInvertToggle(selectedLayer.key)}
                                disabled={invertDisabled}
                                aria-pressed={settings.invert}
                                title={invertTitle}
                              >
                                Invert
                              </button>
                              <button
                                type="button"
                                className="channel-action-button"
                                onClick={() => onLayerAutoContrast(selectedLayer.key)}
                                disabled={sliderDisabled}
                              >
                                Auto
                              </button>
                            </div>
                          </div>
                          <BrightnessContrastHistogram
                            className="channel-histogram"
                            volume={firstVolume}
                            windowMin={settings.windowMin}
                            windowMax={settings.windowMax}
                            defaultMin={DEFAULT_WINDOW_MIN}
                            defaultMax={DEFAULT_WINDOW_MAX}
                            sliderRange={settings.sliderRange}
                            tintColor={channelTint}
                          />
                          <div className="slider-control slider-control--pair">
                            <div className="slider-control slider-control--inline">
                              <label htmlFor={`layer-window-min-${selectedLayer.key}`}>
                                Minimum <span>{formatNormalizedIntensity(settings.windowMin)}</span>
                              </label>
                              <input
                                id={`layer-window-min-${selectedLayer.key}`}
                                type="range"
                                min={DEFAULT_WINDOW_MIN}
                                max={DEFAULT_WINDOW_MAX}
                                step={0.001}
                                value={settings.windowMin}
                                onChange={(event) =>
                                  onLayerWindowMinChange(selectedLayer.key, Number(event.target.value))
                                }
                                disabled={sliderDisabled}
                              />
                            </div>
                            <div className="slider-control slider-control--inline">
                              <label htmlFor={`layer-window-max-${selectedLayer.key}`}>
                                Maximum <span>{formatNormalizedIntensity(settings.windowMax)}</span>
                              </label>
                              <input
                                id={`layer-window-max-${selectedLayer.key}`}
                                type="range"
                                min={DEFAULT_WINDOW_MIN}
                                max={DEFAULT_WINDOW_MAX}
                                step={0.001}
                                value={settings.windowMax}
                                onChange={(event) =>
                                  onLayerWindowMaxChange(selectedLayer.key, Number(event.target.value))
                                }
                                disabled={sliderDisabled}
                              />
                            </div>
                          </div>
                          <div className="slider-control slider-control--pair">
                            <div className="slider-control slider-control--inline">
                              <label htmlFor={`layer-brightness-${selectedLayer.key}`}>Brightness</label>
                              <input
                                id={`layer-brightness-${selectedLayer.key}`}
                                type="range"
                                min={0}
                                max={settings.sliderRange}
                                step={1}
                                value={settings.brightnessSliderIndex}
                                onChange={(event) =>
                                  onLayerBrightnessChange(selectedLayer.key, Number.parseInt(event.target.value, 10))
                                }
                                disabled={sliderDisabled}
                              />
                            </div>
                            <div className="slider-control slider-control--inline">
                              <label htmlFor={`layer-contrast-${selectedLayer.key}`}>Contrast</label>
                              <input
                                id={`layer-contrast-${selectedLayer.key}`}
                                type="range"
                                min={0}
                                max={settings.sliderRange}
                                step={1}
                                value={settings.contrastSliderIndex}
                                onChange={(event) =>
                                  onLayerContrastChange(selectedLayer.key, Number.parseInt(event.target.value, 10))
                                }
                                disabled={sliderDisabled}
                              />
                            </div>
                          </div>
                          <div className="slider-control slider-control--pair">
                            <div className="slider-control slider-control--inline">
                              <label htmlFor={`layer-offset-x-${selectedLayer.key}`}>
                                X shift{' '}
                                <span>
                                  {settings.xOffset >= 0 ? '+' : ''}
                                  {settings.xOffset.toFixed(2)} px
                                </span>
                              </label>
                              <input
                                id={`layer-offset-x-${selectedLayer.key}`}
                                type="range"
                                min={-10}
                                max={10}
                                step={0.1}
                                value={settings.xOffset}
                                onChange={(event) =>
                                  onLayerOffsetChange(selectedLayer.key, 'x', Number(event.target.value))
                                }
                                disabled={offsetDisabled}
                              />
                            </div>
                            <div className="slider-control slider-control--inline">
                              <label htmlFor={`layer-offset-y-${selectedLayer.key}`}>
                                Y shift{' '}
                                <span>
                                  {settings.yOffset >= 0 ? '+' : ''}
                                  {settings.yOffset.toFixed(2)} px
                                </span>
                              </label>
                              <input
                                id={`layer-offset-y-${selectedLayer.key}`}
                                type="range"
                                min={-10}
                                max={10}
                                step={0.1}
                                value={settings.yOffset}
                                onChange={(event) =>
                                  onLayerOffsetChange(selectedLayer.key, 'y', Number(event.target.value))
                                }
                                disabled={offsetDisabled}
                              />
                            </div>
                          </div>
                          {isGrayscale ? (
                            <div className="color-control">
                              <div className="color-control-header">
                                <span id={`layer-color-label-${selectedLayer.key}`}>Tint color</span>
                                <span>{displayColor}</span>
                              </div>
                              <div className="color-swatch-row">
                                <div
                                  className="color-swatch-grid"
                                  role="group"
                                  aria-labelledby={`layer-color-label-${selectedLayer.key}`}
                                >
                                  {GRAYSCALE_COLOR_SWATCHES.map((swatch) => {
                                    const swatchColor = normalizeHexColor(swatch.value, DEFAULT_LAYER_COLOR);
                                    const isSelected = swatchColor === normalizedColor;
                                    return (
                                      <button
                                        key={swatch.value}
                                        type="button"
                                        className={
                                          isSelected ? 'color-swatch-button is-selected' : 'color-swatch-button'
                                        }
                                        style={{ backgroundColor: swatch.value }}
                                        onClick={() => onLayerColorChange(selectedLayer.key, swatch.value)}
                                        disabled={sliderDisabled}
                                        aria-pressed={isSelected}
                                        aria-label={`${swatch.label} tint`}
                                        title={swatch.label}
                                      />
                                    );
                                  })}
                                </div>
                                <label
                                  className={
                                    sliderDisabled ? 'color-picker-trigger is-disabled' : 'color-picker-trigger'
                                  }
                                  htmlFor={`layer-color-custom-${selectedLayer.key}`}
                                >
                                  <input
                                    id={`layer-color-custom-${selectedLayer.key}`}
                                    type="color"
                                    value={normalizedColor}
                                    onChange={(event) => onLayerColorChange(selectedLayer.key, event.target.value)}
                                    disabled={sliderDisabled}
                                    aria-label="Choose custom tint color"
                                    className="color-picker-input"
                                  />
                                  <span
                                    className="color-picker-indicator"
                                    style={{ backgroundColor: normalizedColor }}
                                    aria-hidden="true"
                                  />
                                </label>
                              </div>
                            </div>
                          ) : null}
                        </>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="channel-empty-hint">Load a volume to configure channel properties.</p>
            )}
          </div>
        </FloatingWindow>

        {hasTrackData ? (
          <FloatingWindow
            title="Tracks"
            initialPosition={trackWindowInitialPosition}
            width={`min(${controlWindowWidth}px, calc(100vw - ${windowMargin * 2}px))`}
            className="floating-window--tracks"
            resetSignal={resetToken}
            headerContent={
              <div className="channel-tabs channel-tabs--header" role="tablist" aria-label="Track channels">
                {channels.map((channel) => {
                  const label = channelNameMap.get(channel.id) ?? 'Untitled channel';
                  const displayLabel = label.length > 9 ? `${label.slice(0, 6)}...` : label;
                  const isActive = channel.id === activeTrackChannelId;
                  const summary = trackSummaryByChannel.get(channel.id) ?? { total: 0, visible: 0 };
                  const hasTracksForChannel = (parsedTracksByChannel.get(channel.id)?.length ?? 0) > 0;
                  const hasVisibleTracks = summary.visible > 0;
                  const tabClassName = ['channel-tab', isActive ? 'is-active' : '', !hasTracksForChannel ? 'is-hidden' : '']
                    .filter(Boolean)
                    .join(' ');
                  const labelClassName = hasVisibleTracks
                    ? 'channel-tab-label'
                    : 'channel-tab-label channel-tab-label--crossed';
                  const colorMode = channelTrackColorModes[channel.id] ?? { type: 'random' };
                  const tabStyle: CSSProperties & Record<string, string> | undefined =
                    colorMode.type === 'uniform'
                      ? {
                          '--channel-tab-background': applyAlphaToHex(
                            normalizeTrackColor(colorMode.color),
                            0.18
                          ),
                          '--channel-tab-background-active': applyAlphaToHex(
                            normalizeTrackColor(colorMode.color),
                            0.35
                          ),
                          '--channel-tab-border': 'rgba(255, 255, 255, 0.15)',
                          '--channel-tab-border-active': applyAlphaToHex(
                            normalizeTrackColor(colorMode.color),
                            0.55
                          )
                        }
                      : undefined;

                  const handleTrackTabClick = (event: MouseEvent<HTMLButtonElement>) => {
                    const currentSummary = trackSummaryByChannel.get(channel.id) ?? { total: 0, visible: 0 };
                    const nextHasVisibleTracks = currentSummary.visible > 0;
                    if (event.ctrlKey) {
                      event.preventDefault();
                      onTrackVisibilityAllChange(channel.id, !nextHasVisibleTracks);
                      return;
                    }
                    onTrackChannelTabSelect(channel.id);
                  };

                  const tabTitle = hasVisibleTracks
                    ? 'Ctrl + click to hide all tracks for this channel'
                    : 'Ctrl + click to show all tracks for this channel';

                  return (
                    <button
                      key={channel.id}
                      type="button"
                      className={tabClassName}
                      style={tabStyle}
                      onClick={handleTrackTabClick}
                      role="tab"
                      id={`track-tab-${channel.id}`}
                      aria-label={label}
                      aria-selected={isActive}
                      aria-controls={`track-panel-${channel.id}`}
                      title={tabTitle}
                    >
                      <span className={labelClassName}>{displayLabel}</span>
                    </button>
                  );
                })}
              </div>
            }
          >
            <div className="sidebar sidebar-right">
              {channels.length > 0 ? (
                <div className="track-controls">
                  {channels.map((channel) => {
                  const channelName = channelNameMap.get(channel.id) ?? 'Untitled channel';
                  const tracksForChannel = filteredTracksByChannel.get(channel.id) ?? [];
                  const hasChannelTracks = (parsedTracksByChannel.get(channel.id)?.length ?? 0) > 0;
                  const isActive = channel.id === activeTrackChannelId;
                  const colorMode = channelTrackColorModes[channel.id] ?? { type: 'random' };
                  const opacity = trackOpacityByChannel[channel.id] ?? trackDefaults.opacity;
                  const lineWidth = trackLineWidthByChannel[channel.id] ?? trackDefaults.lineWidth;
                  const orderMode = trackOrderModeByChannel[channel.id] ?? 'id';
                  const orderedTracks =
                    orderMode === 'length'
                      ? [...tracksForChannel].sort((a, b) => {
                          const lengthDelta = b.points.length - a.points.length;
                          if (lengthDelta !== 0) {
                            return lengthDelta;
                          }
                          return a.trackNumber - b.trackNumber;
                        })
                      : tracksForChannel;
                  const colorLabel =
                    colorMode.type === 'uniform' ? normalizeTrackColor(colorMode.color) : 'Sorted';
                  const trackAccentColor =
                    colorMode.type === 'uniform'
                      ? normalizeTrackColor(colorMode.color)
                      : DEFAULT_TRACK_COLOR;
                  const trackPanelStyle: TrackPanelStyle = {
                    '--track-accent-color': trackAccentColor,
                    '--track-accent-border': applyAlphaToHex(trackAccentColor, 0.55),
                    '--track-accent-strong-border': applyAlphaToHex(trackAccentColor, 0.85),
                    '--track-accent-soft': applyAlphaToHex(trackAccentColor, 0.18),
                    '--track-accent-strong': applyAlphaToHex(trackAccentColor, 0.32),
                    '--track-accent-hover': applyAlphaToHex(trackAccentColor, 0.3),
                    '--track-accent-focus': applyAlphaToHex(trackAccentColor, 0.65),
                    '--track-accent-glow': applyAlphaToHex(trackAccentColor, 0.35)
                  };
                  const prioritizedTracks = orderedTracks.filter((track) =>
                    selectedTrackIds.has(track.id)
                  );
                  const remainingTracks = orderedTracks.filter((track) => !selectedTrackIds.has(track.id));
                  const displayTracks =
                    prioritizedTracks.length > 0 ? [...prioritizedTracks, ...remainingTracks] : orderedTracks;

                  return (
                    <div
                      key={channel.id}
                      id={`track-panel-${channel.id}`}
                      role="tabpanel"
                      aria-labelledby={`track-tab-${channel.id}`}
                    className={isActive ? 'track-panel is-active' : 'track-panel'}
                    hidden={!isActive}
                    style={trackPanelStyle}
                  >
                    <div className="track-follow-controls">
                        <div className="track-length-controls">
                          <label htmlFor={`track-minimum-length-${channel.id}`}>
                            Minimum length <span>{Math.round(pendingMinimumTrackLength)}</span>
                          </label>
                          <div className="track-length-row">
                            <input
                              id={`track-minimum-length-${channel.id}`}
                              type="range"
                              min={trackLengthBounds.min}
                              max={trackLengthBounds.max}
                              step={1}
                              value={pendingMinimumTrackLength}
                              onChange={(event) =>
                                onMinimumTrackLengthChange(Number(event.target.value))
                              }
                              disabled={!hasChannelTracks}
                            />
                            <button
                              type="button"
                              className="track-length-apply"
                              onClick={onMinimumTrackLengthApply}
                              disabled={
                                !hasChannelTracks || pendingMinimumTrackLength === minimumTrackLength
                              }
                            >
                              Apply
                            </button>
                          </div>
                        </div>
                        <div className="track-slider-row">
                          <div className="slider-control">
                            <label htmlFor={`track-opacity-${channel.id}`}>
                              Opacity <span>{Math.round(opacity * 100)}%</span>
                            </label>
                            <input
                              id={`track-opacity-${channel.id}`}
                              type="range"
                              min={0}
                              max={1}
                              step={0.05}
                              value={opacity}
                              onChange={(event) =>
                                onTrackOpacityChange(channel.id, Number(event.target.value))
                              }
                              disabled={tracksForChannel.length === 0}
                            />
                          </div>
                          <div className="slider-control">
                            <label htmlFor={`track-linewidth-${channel.id}`}>
                              Thickness <span>{lineWidth.toFixed(1)}</span>
                            </label>
                            <input
                              id={`track-linewidth-${channel.id}`}
                              type="range"
                              min={0.5}
                              max={5}
                              step={0.1}
                              value={lineWidth}
                              onChange={(event) =>
                                onTrackLineWidthChange(channel.id, Number(event.target.value))
                              }
                              disabled={tracksForChannel.length === 0}
                            />
                          </div>
                        </div>
                      </div>
                      <div className="track-color-control">
                        <div className="track-color-control-header">
                          <span id={`track-color-label-${channel.id}`}>Track color</span>
                          <span>{colorLabel}</span>
                        </div>
                        <div className="track-color-swatch-row">
                          <div
                            className="color-swatch-grid"
                            role="group"
                            aria-labelledby={`track-color-label-${channel.id}`}
                          >
                            {TRACK_COLOR_SWATCHES.map((swatch) => {
                              const normalized = normalizeTrackColor(swatch.value);
                              const isSelected =
                                colorMode.type === 'uniform' &&
                                normalizeTrackColor(colorMode.color) === normalized;
                              return (
                                <button
                                  key={swatch.value}
                                  type="button"
                                  className={
                                    isSelected ? 'color-swatch-button is-selected' : 'color-swatch-button'
                                  }
                                  style={{ backgroundColor: swatch.value }}
                                  onClick={() => onTrackColorSelect(channel.id, swatch.value)}
                                  disabled={tracksForChannel.length === 0}
                                  aria-pressed={isSelected}
                                  aria-label={`${swatch.label} tracks color`}
                                  title={swatch.label}
                                />
                              );
                            })}
                          </div>
                          <button
                            type="button"
                            className={
                              colorMode.type === 'random'
                                ? 'track-color-randomizer'
                                : 'track-color-randomizer is-active'
                            }
                            onClick={() => onTrackColorReset(channel.id)}
                            disabled={tracksForChannel.length === 0}
                          >
                            Sorted
                          </button>
                        </div>
                      </div>
                      <div className="track-list-section">
                        <div className="track-list-header">
                          <button
                            type="button"
                            className={
                              orderMode === 'length'
                                ? 'track-order-toggle is-active'
                                : 'track-order-toggle'
                            }
                            onClick={() => onTrackOrderToggle(channel.id)}
                            disabled={tracksForChannel.length === 0}
                            aria-pressed={orderMode === 'length'}
                          >
                            {orderMode === 'length' ? 'Order by ID' : 'Order by length'}
                          </button>
                        </div>
                        {tracksForChannel.length > 0 ? (
                          <div
                            className="track-list"
                            role="group"
                            aria-label={`${channelName} track visibility`}
                          >
                            {displayTracks.map((track) => {
                              const isFollowed = tracksPanelFollowedTrackId === track.id;
                              const isSelected = selectedTrackIds.has(track.id);
                              const isChecked =
                                isFollowed || isSelected || (trackVisibility[track.id] ?? true);
                              const trackColor =
                                colorMode.type === 'uniform'
                                  ? normalizeTrackColor(colorMode.color)
                                  : getTrackColorHex(track.id);
                              const itemClassName = [
                                'track-item',
                                isSelected ? 'is-selected' : '',
                                isFollowed ? 'is-following' : ''
                              ]
                                .filter(Boolean)
                                .join(' ');
                              return (
                                <div
                                  key={track.id}
                                  className={itemClassName}
                                  title={`${track.channelName} · Track #${track.trackNumber}`}
                                >
                                  <div className="track-toggle">
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={() => onTrackVisibilityToggle(track.id)}
                                      aria-label={`Toggle visibility for Track #${track.trackNumber}`}
                                    />
                                  </div>
                                  <button
                                    type="button"
                                    className="track-label-button"
                                    onClick={() => onTrackSelectionToggle(track.id)}
                                    aria-pressed={isSelected}
                                  >
                                    <span className="track-label">
                                      <span
                                        className="track-color-swatch"
                                        style={{ backgroundColor: trackColor }}
                                        aria-hidden="true"
                                      />
                                      <span className="track-name">Track #{track.trackNumber}</span>
                                    </span>
                                  </button>
                                  <button
                                    type="button"
                                    className={
                                      isFollowed ? 'track-follow-button is-active' : 'track-follow-button'
                                    }
                                    onClick={() => onTrackFollow(track.id)}
                                    aria-pressed={isFollowed}
                                  >
                                    {isFollowed ? 'Following' : 'Follow'}
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="track-empty-hint">Load a tracks file to toggle individual trajectories.</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="track-empty-hint">Add a channel to manage tracks.</p>
            )}
          </div>
        </FloatingWindow>
        ) : null}
        {!isVrActive && shouldRender ? (
          <FloatingWindow
            title="Selected Tracks"
            initialPosition={selectedTracksWindowInitialPosition}
            width={`min(${selectedTracksWindowWidth}px, calc(100vw - ${windowMargin * 2}px))`}
            className="floating-window--selected-tracks"
            bodyClassName="floating-window-body--selected-tracks"
            resetSignal={resetToken}
            headerPosition="bottom"
          >
          <SelectedTracksWindow
            series={series}
            totalTimepoints={totalTimepoints}
            amplitudeExtent={amplitudeExtent}
            amplitudeLimits={amplitudeLimits}
            timeExtent={timeExtent}
            timeLimits={timeLimits}
            onAmplitudeLimitsChange={onAmplitudeLimitsChange}
            onTimeLimitsChange={onTimeLimitsChange}
            onAutoRange={onAutoRange}
            onClearSelection={onClearSelection}
            currentTimepoint={currentTimepoint}
            onTrackSelectionToggle={onSelectedTrackToggle}
          />
        </FloatingWindow>
      ) : null}
      </div>
    </>
  );
}

export default ViewerShell;
