import { useState, type ComponentProps, type CSSProperties, type RefObject } from 'react';

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
import { applyAlphaToHex, getTrackTabTextColor } from '../utils/appHelpers';
import {
  TRACK_COLOR_SWATCHES,
  getTrackColorHex,
  normalizeTrackColor
} from '../trackColors';
import type { LoadedLayer } from '../types/layers';
import type { TrackColorMode, TrackDefinition, TrackPoint } from '../types/tracks';
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
  hoveredIntensity: string | null;
};

type ModeControlsProps = {
  isVrActive: boolean;
  isVrRequesting: boolean;
  resetViewHandler: (() => void) | null;
  onToggleViewerMode: () => void;
  onVrButtonClick: () => void;
  vrButtonDisabled: boolean;
  vrButtonTitle?: string;
  vrButtonLabel: string;
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
  onLayerRenderStyleToggle: (layerKey: string) => void;
  onLayerSamplingModeToggle: (layerKey: string) => void;
  onLayerWindowMinChange: (layerKey: string, value: number) => void;
  onLayerWindowMaxChange: (layerKey: string, value: number) => void;
  onLayerBrightnessChange: (layerKey: string, value: number) => void;
  onLayerContrastChange: (layerKey: string, value: number) => void;
  onLayerAutoContrast: (layerKey: string) => void;
  onLayerOffsetChange: (layerKey: string, axis: 'x' | 'y', value: number) => void;
  onLayerColorChange: (layerKey: string, color: string) => void;
  onLayerInvertToggle: (layerKey: string) => void;
};

type TracksPanelProps = {
  channels: ChannelSource[];
  channelNameMap: Map<string, string>;
  activeChannelId: string | null;
  onChannelTabSelect: (channelId: string) => void;
  parsedTracksByChannel: Map<string, TrackDefinition[]>;
  channelTrackColorModes: Record<string, TrackColorMode>;
  trackOpacityByChannel: Record<string, number>;
  trackLineWidthByChannel: Record<string, number>;
  trackSummaryByChannel: Map<string, TrackSummary>;
  followedTrackChannelId: string | null;
  followedTrackId: string | null;
  onTrackOrderToggle: (channelId: string) => void;
  trackOrderModeByChannel: Record<string, 'id' | 'length'>;
  registerTrackMasterCheckbox: (channelId: string) => (element: HTMLInputElement | null) => void;
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
  onStopTrackFollow: (channelId?: string) => void;
};

type SelectedTracksPanelProps = {
  shouldRender: boolean;
  series: Array<{ id: string; label: string; color: string; points: TrackPoint[] }>;
  totalTimepoints: number;
};

type GridPanelProps = {
  gridEnabled: boolean;
  gridOpacity: number;
  gridThickness: number;
  gridSpacing: number;
  onGridEnabledChange: (value: boolean) => void;
  onGridOpacityChange: (value: number) => void;
  onGridThicknessChange: (value: number) => void;
  onGridSpacingChange: (value: number) => void;
};

type Position = { x: number; y: number };

type LayoutProps = {
  windowMargin: number;
  playbackWindowWidth: number;
  controlWindowWidth: number;
  trackWindowWidth: number;
  gridWindowWidth: number;
  selectedTracksWindowWidth: number;
  resetToken: number;
  controlWindowInitialPosition: Position;
  layersWindowInitialPosition: Position;
  trackWindowInitialPosition: Position;
  gridWindowInitialPosition: Position;
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
  gridPanel: GridPanelProps;
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
  gridPanel,
  selectedTracksPanel,
  trackDefaults
}: ViewerShellProps) {
  const {
    onReturnToLauncher,
    onResetLayout,
    helpMenuRef,
    isHelpMenuOpen,
    onHelpMenuToggle,
    hoveredIntensity
  } = topMenu;
  const {
    windowMargin,
    playbackWindowWidth,
    controlWindowWidth,
    trackWindowWidth,
    gridWindowWidth,
    selectedTracksWindowWidth,
    resetToken,
    controlWindowInitialPosition,
    layersWindowInitialPosition,
    trackWindowInitialPosition,
    gridWindowInitialPosition,
    selectedTracksWindowInitialPosition
  } = layout;
  const {
    isVrActive,
    isVrRequesting,
    resetViewHandler,
    onToggleViewerMode,
    onVrButtonClick,
    vrButtonDisabled,
    vrButtonTitle,
    vrButtonLabel
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
    onLayerRenderStyleToggle,
    onLayerSamplingModeToggle,
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
    channelTrackColorModes,
    trackOpacityByChannel,
    trackLineWidthByChannel,
    trackSummaryByChannel,
    followedTrackChannelId,
    followedTrackId,
    onTrackOrderToggle,
    trackOrderModeByChannel,
    registerTrackMasterCheckbox,
    trackVisibility,
    onTrackVisibilityToggle,
    onTrackVisibilityAllChange,
    onTrackOpacityChange,
    onTrackLineWidthChange,
    onTrackColorSelect,
    onTrackColorReset,
    onTrackSelectionToggle,
    selectedTrackIds,
    onTrackFollow,
    onStopTrackFollow
  } = tracksPanel;
  const {
    gridEnabled,
    gridOpacity,
    gridThickness,
    gridSpacing,
    onGridEnabledChange,
    onGridOpacityChange,
    onGridThicknessChange,
    onGridSpacingChange
  } = gridPanel;
  const { shouldRender, series, totalTimepoints } = selectedTracksPanel;

  const [renderingQuality, setRenderingQuality] = useState(1);

  const handleRenderingQualityChange = (value: number) => {
    setRenderingQuality(value);
    volumeViewerProps.onVolumeStepScaleChange?.(value);
  };

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
                Return to Launcher
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
            </div>
            <div className="viewer-top-menu-intensity" role="status" aria-live="polite">
              <span>Hover:</span>
              <span>{hoveredIntensity ?? '—'}</span>
            </div>
          </div>
        </div>
        <FloatingWindow
          title="Viewer controls"
          initialPosition={controlWindowInitialPosition}
          width={`min(${playbackWindowWidth}px, calc(100vw - ${windowMargin * 2}px))`}
          className="floating-window--playback"
          resetSignal={resetToken}
        >
          <div className="sidebar sidebar-left">
            <div className="global-controls">
              <div className="control-group">
                <div className="viewer-mode-row">
                  <button
                    type="button"
                    onClick={onToggleViewerMode}
                    className={viewerMode === '3d' ? 'viewer-mode-button is-active' : 'viewer-mode-button'}
                    disabled={isVrActive || isVrRequesting}
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
                  <button
                    type="button"
                    className="viewer-mode-button"
                    onClick={onVrButtonClick}
                    disabled={vrButtonDisabled}
                    title={vrButtonTitle}
                  >
                    {vrButtonLabel}
                  </button>
                </div>
              </div>
              <div className="control-group">
                <label htmlFor="rendering-quality-slider">
                  Rendering quality <span>{renderingQuality.toFixed(2)}</span>
                </label>
                <input
                  id="rendering-quality-slider"
                  type="range"
                  min={0.5}
                  max={2}
                  step={0.01}
                  value={renderingQuality}
                  onChange={(event) => handleRenderingQualityChange(Number(event.target.value))}
                />
              </div>
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
              {viewerMode === '2d' && maxSliceDepth > 0 ? (
                <div className="control-group">
                  <label htmlFor="z-plane-slider">
                    Z plane <span>{Math.min(sliceIndex + 1, maxSliceDepth)} / {maxSliceDepth}</span>
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
              <div className="playback-controls">
                <div className="control-group playback-progress">
                  <label htmlFor="playback-slider">
                    <span
                      className={
                        isPlaying
                          ? 'playback-status playback-status--playing'
                          : 'playback-status playback-status--stopped'
                      }
                    >
                      {isPlaying ? 'Playing' : 'Stopped'}
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
            </div>
            {error && <p className="error">{error}</p>}
          </div>
        </FloatingWindow>

        <FloatingWindow
          title="Channels"
          initialPosition={layersWindowInitialPosition}
          width={`min(${controlWindowWidth}px, calc(100vw - ${windowMargin * 2}px))`}
          className="floating-window--channels"
          resetSignal={resetToken}
        >
          <div className="sidebar sidebar-left">
            {loadedChannelIds.length > 0 ? (
              <div className="channel-controls">
                <div className="channel-tabs" role="tablist" aria-label="Volume channels">
                  {loadedChannelIds.map((channelId) => {
                    const label = channelNameMap.get(channelId) ?? 'Untitled channel';
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
                    return (
                      <button
                        key={channelId}
                        type="button"
                        className={tabClassName}
                        style={tabStyle}
                        onClick={() => onChannelTabSelect(channelId)}
                        role="tab"
                        id={`channel-tab-${channelId}`}
                        aria-selected={isActive}
                        aria-controls={`channel-panel-${channelId}`}
                      >
                        <span
                          className={labelClassName}
                          role="switch"
                          aria-checked={isVisible}
                          tabIndex={0}
                          onClick={(event) => {
                            event.stopPropagation();
                            onChannelVisibilityToggle(channelId);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              event.stopPropagation();
                              onChannelVisibilityToggle(channelId);
                            }
                          }}
                        >
                          {label}
                        </span>
                      </button>
                    );
                  })}
                </div>
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

                  return (
                    <div
                      key={channelId}
                      id={`channel-panel-${channelId}`}
                      role="tabpanel"
                      aria-labelledby={`channel-tab-${channelId}`}
                      className={isActive ? 'channel-panel is-active' : 'channel-panel'}
                      hidden={!isActive}
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
                                onClick={() => onLayerRenderStyleToggle(selectedLayer.key)}
                                disabled={sliderDisabled}
                                aria-pressed={settings.renderStyle === 1}
                              >
                                Render style
                              </button>
                              {viewerMode === '3d' ? (
                                <button
                                  type="button"
                                  className="channel-action-button"
                                  onClick={() => onLayerSamplingModeToggle(selectedLayer.key)}
                                  disabled={sliderDisabled}
                                  aria-pressed={settings.samplingMode === 'nearest'}
                                >
                                  Sampling mode
                                </button>
                              ) : null}
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

        <FloatingWindow
          title="Tracks"
          initialPosition={trackWindowInitialPosition}
          width={`min(${trackWindowWidth}px, calc(100vw - ${windowMargin * 2}px))`}
          className="floating-window--tracks"
          resetSignal={resetToken}
        >
          <div className="sidebar sidebar-right">
            {channels.length > 0 ? (
              <div className="track-controls">
                <div className="track-tabs" role="tablist" aria-label="Track channels">
                  {channels.map((channel) => {
                    const isActive = channel.id === activeTrackChannelId;
                    const channelName = channelNameMap.get(channel.id) ?? 'Untitled channel';
                    const hasTracks = (parsedTracksByChannel.get(channel.id)?.length ?? 0) > 0;
                    const tabClassName = ['track-tab', isActive ? 'is-active' : '', !hasTracks ? 'is-empty' : '']
                      .filter(Boolean)
                      .join(' ');
                    const colorMode = channelTrackColorModes[channel.id] ?? { type: 'random' };
                    const baseColor =
                      colorMode.type === 'uniform' ? normalizeTrackColor(colorMode.color) : '#FFFFFF';
                    const textColor =
                      colorMode.type === 'uniform' ? getTrackTabTextColor(baseColor) : '#0b1220';
                    const borderColor =
                      colorMode.type === 'uniform' ? 'rgba(11, 18, 32, 0.22)' : 'rgba(15, 23, 42, 0.18)';
                    const activeBorderColor =
                      colorMode.type === 'uniform' ? 'rgba(11, 18, 32, 0.35)' : 'rgba(15, 23, 42, 0.28)';
                    const tabStyle: CSSProperties & Record<string, string> = {
                      '--track-tab-background': baseColor,
                      '--track-tab-background-active': baseColor,
                      '--track-tab-border': borderColor,
                      '--track-tab-border-active': activeBorderColor,
                      '--track-tab-text': textColor,
                      '--track-tab-text-active': textColor
                    };
                    return (
                      <button
                        key={channel.id}
                        type="button"
                        className={tabClassName}
                        style={tabStyle}
                        onClick={() => onTrackChannelTabSelect(channel.id)}
                        role="tab"
                        id={`track-tab-${channel.id}`}
                        aria-selected={isActive}
                        aria-controls={`track-panel-${channel.id}`}
                      >
                        <span className="track-tab-label">{channelName}</span>
                      </button>
                    );
                  })}
                </div>
                {channels.map((channel) => {
                  const channelName = channelNameMap.get(channel.id) ?? 'Untitled channel';
                  const tracksForChannel = parsedTracksByChannel.get(channel.id) ?? [];
                  const isActive = channel.id === activeTrackChannelId;
                  const colorMode = channelTrackColorModes[channel.id] ?? { type: 'random' };
                  const opacity = trackOpacityByChannel[channel.id] ?? trackDefaults.opacity;
                  const lineWidth = trackLineWidthByChannel[channel.id] ?? trackDefaults.lineWidth;
                  const summary = trackSummaryByChannel.get(channel.id) ?? { total: 0, visible: 0 };
                  const allChecked = summary.total > 0 && summary.visible === summary.total;
                  const channelFollowedId = followedTrackChannelId === channel.id ? followedTrackId : null;
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

                  return (
                    <div
                      key={channel.id}
                      id={`track-panel-${channel.id}`}
                      role="tabpanel"
                      aria-labelledby={`track-tab-${channel.id}`}
                      className={isActive ? 'track-panel is-active' : 'track-panel'}
                      hidden={!isActive}
                    >
                      <div className="track-follow-controls">
                        <button
                          type="button"
                          onClick={() => onStopTrackFollow(channel.id)}
                          disabled={channelFollowedId === null}
                          className={
                            channelFollowedId !== null ? 'viewer-stop-tracking is-active' : 'viewer-stop-tracking'
                          }
                        >
                          Stop following
                        </button>
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
                            Randomize
                          </button>
                        </div>
                      </div>
                      <div className="track-list-section">
                        <div className="track-list-header">
                          <label className="track-master-toggle">
                            <input
                              ref={registerTrackMasterCheckbox(channel.id)}
                              type="checkbox"
                              checked={tracksForChannel.length > 0 && allChecked}
                              onChange={(event) =>
                                onTrackVisibilityAllChange(channel.id, event.target.checked)
                              }
                              disabled={tracksForChannel.length === 0}
                              aria-label={`Show all tracks for ${channelName}`}
                            />
                            <span>Show all tracks</span>
                          </label>
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
                            {orderedTracks.map((track) => {
                              const isFollowed = followedTrackId === track.id;
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
        <FloatingWindow
          title="Grid"
          initialPosition={gridWindowInitialPosition}
          width={`min(${gridWindowWidth}px, calc(100vw - ${windowMargin * 2}px))`}
          className="floating-window--grid"
          resetSignal={resetToken}
        >
          <div className="sidebar sidebar-right">
            <div className="control-group">
              <button
                type="button"
                className={gridEnabled ? 'viewer-mode-button is-active' : 'viewer-mode-button'}
                onClick={() => onGridEnabledChange(!gridEnabled)}
                aria-pressed={gridEnabled}
              >
                {gridEnabled ? 'Hide grid' : 'Show grid'}
              </button>
            </div>
            <div className="slider-control">
              <label htmlFor="grid-opacity">
                Opacity <span>{Math.round(gridOpacity * 100)}%</span>
              </label>
              <input
                id="grid-opacity"
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={gridOpacity}
                onChange={(event) => onGridOpacityChange(Number(event.target.value))}
                disabled={!gridEnabled}
              />
            </div>
            <div className="slider-control">
              <label htmlFor="grid-thickness">
                Thickness <span>{gridThickness.toFixed(1)}</span>
              </label>
              <input
                id="grid-thickness"
                type="range"
                min={0.5}
                max={5}
                step={0.1}
                value={gridThickness}
                onChange={(event) => onGridThicknessChange(Number(event.target.value))}
                disabled={!gridEnabled}
              />
            </div>
            <div className="control-group">
              <label htmlFor="grid-spacing">
                Spacing <span>{gridSpacing} px</span>
              </label>
              <input
                id="grid-spacing"
                type="number"
                min={1}
                step={1}
                value={gridSpacing}
                onChange={(event) => onGridSpacingChange(Number(event.target.value))}
                disabled={!gridEnabled}
              />
            </div>
          </div>
        </FloatingWindow>
        {!isVrActive && shouldRender ? (
          <FloatingWindow
            title="Selected Tracks"
            initialPosition={selectedTracksWindowInitialPosition}
            width={`min(${selectedTracksWindowWidth}px, calc(100vw - ${windowMargin * 2}px))`}
            className="floating-window--selected-tracks"
            bodyClassName="floating-window-body--selected-tracks"
            resetSignal={resetToken}
          >
            <SelectedTracksWindow series={series} totalTimepoints={totalTimepoints} />
          </FloatingWindow>
        ) : null}
      </div>
    </>
  );
}

export default ViewerShell;
