import type { ComponentProps, CSSProperties } from 'react';

import type BrightnessContrastHistogram from '../BrightnessContrastHistogram';
import type FloatingWindow from '../../widgets/FloatingWindow';
import type PlotSettingsWindow from '../../widgets/PlotSettingsWindow';
import type SelectedTracksWindow from '../../widgets/SelectedTracksWindow';
import type { VolumeViewerProps } from '../VolumeViewer.types';
import type { LoadedDatasetLayer } from '../../../hooks/dataset';
import type { NormalizedVolume } from '../../../core/volumeProcessing';
import type { VolumeBrickAtlas } from '../../../core/volumeProvider';
import type { LayerSettings, RenderStyle, SamplingMode } from '../../../state/layerSettings';
import type { TrackSetState } from '../../../types/channelTracks';
import type { FollowedVoxelTarget } from '../../../types/follow';
import type { HoveredVoxelInfo } from '../../../types/hover';
import type { NumericRange, TrackColorMode, TrackPoint, TrackSummary } from '../../../types/tracks';

export type TopMenuChromeProps = {
  onReturnToLauncher: () => void;
  onResetLayout: () => void;
  currentScaleLabel: string;
  initialScaleWarningMessage?: string | null;
  isPerformanceMode?: boolean;
  isHelpMenuOpen: boolean;
  openHelpMenu: () => void;
  closeHelpMenu: () => void;
  followedTrackSetId: string | null;
  followedTrackId: string | null;
  followedVoxel: FollowedVoxelTarget | null;
  onStopTrackFollow: (trackSetId?: string) => void;
  onStopVoxelFollow: () => void;
  hoveredVoxel: HoveredVoxelInfo | null;
};

export type VolumeChannelTabsProps = {
  loadedChannelIds: string[];
  channelNameMap: Map<string, string>;
  channelVisibility: Record<string, boolean>;
  channelTintMap: Map<string, string>;
  segmentationChannelIds?: ReadonlySet<string>;
  activeChannelId: string | null;
  onChannelTabSelect: (channelId: string) => void;
  onChannelVisibilityToggle: (channelId: string) => void;
};

export type VolumeTrackTabsProps = {
  trackSets: Array<{
    id: string;
    name: string;
  }>;
  trackHeadersByTrackSet: Map<string, { totalTracks: number }>;
  activeTrackSetId: string | null;
  trackColorModesByTrackSet: Record<string, TrackColorMode>;
  trackVisibilitySummaryByTrackSet: Map<string, { total: number; visible: number }>;
  onTrackSetTabSelect: (trackSetId: string) => void;
  onTrackVisibilityAllChange: (trackSetId: string, visible: boolean) => void;
};

export type TopMenuProps = TopMenuChromeProps &
  VolumeChannelTabsProps &
  VolumeTrackTabsProps & {
    hoverCoordinateDigits: {
      x: number;
      y: number;
      z: number;
    };
    hoverIntensityValueDigits: number;
    onOpenChannelsWindow: () => void;
    onOpenPropsWindow: () => void;
    onOpenPaintbrush: () => void;
    onOpenRecordWindow: () => void;
    onOpenRenderSettingsWindow: () => void;
    onOpenTracksWindow: () => void;
    onOpenAmplitudePlotWindow: () => void;
    onOpenPlotSettingsWindow: () => void;
    onOpenTrackSettingsWindow: () => void;
    onOpenDiagnosticsWindow: () => void;
    is3dModeAvailable: boolean;
    resetViewHandler: (() => void) | null;
    onVrButtonClick: () => void;
    vrButtonDisabled: boolean;
    vrButtonTitle?: string;
    vrButtonLabel: string;
    volumeTimepointCount: number;
    isPlaying: boolean;
    selectedIndex: number;
    onTimeIndexChange: (index: number) => void;
    playbackDisabled: boolean;
    onTogglePlayback: () => void;
    zSliderValue?: number;
    zSliderMax?: number;
    onZSliderChange?: (value: number) => void;
  };

export type ModeControlsProps = {
  is3dModeAvailable: boolean;
  isVrActive: boolean;
  isVrRequesting: boolean;
  resetViewHandler: (() => void) | null;
  onVrButtonClick: () => void;
  vrButtonDisabled: boolean;
  vrButtonTitle?: string;
  vrButtonLabel: string;
  samplingMode: 'linear' | 'nearest';
  onSamplingModeToggle: () => void;
  blendingMode: 'alpha' | 'additive';
  onBlendingModeToggle: () => void;
};

export type PlaybackControlsProps = {
  fps: number;
  onFpsChange: (value: number) => void;
  zSliderValue?: number;
  zSliderMax?: number;
  onZSliderChange?: (value: number) => void;
  recordingBitrateMbps?: number;
  onRecordingBitrateMbpsChange?: (value: number) => void;
  volumeTimepointCount: number;
  isPlaying: boolean;
  playbackLabel: string;
  selectedIndex: number;
  onTimeIndexChange: (index: number) => void;
  playbackDisabled: boolean;
  onTogglePlayback: () => void;
  error: string | null;
  onStartRecording: () => void;
  onStopRecording: () => void;
  isRecording: boolean;
  canRecord: boolean;
};

export type ChannelPanelStyle = (CSSProperties & { '--channel-slider-color'?: string }) &
  Record<string, string | number | undefined>;

export type ChannelsPanelProps = VolumeChannelTabsProps & {
  isPlaying: boolean;
  channelLayersMap: Map<string, LoadedDatasetLayer[]>;
  layerVolumesByKey: Record<string, NormalizedVolume | null>;
  layerBrickAtlasesByKey: Record<string, VolumeBrickAtlas | null>;
  layerSettings: Record<string, LayerSettings>;
  getLayerDefaultSettings: (layerKey: string) => LayerSettings;
  onChannelReset: (channelId: string) => void;
  onLayerWindowMinChange: (layerKey: string, value: number) => void;
  onLayerWindowMaxChange: (layerKey: string, value: number) => void;
  onLayerBrightnessChange: (layerKey: string, value: number) => void;
  onLayerContrastChange: (layerKey: string, value: number) => void;
  onLayerAutoContrast: (layerKey: string) => void;
  onLayerOffsetChange: (layerKey: string, axis: 'x' | 'y', value: number) => void;
  onLayerColorChange: (layerKey: string, color: string) => void;
  onLayerRenderStyleChange: (layerKey: string, renderStyle: RenderStyle, samplingMode?: SamplingMode) => void;
  onLayerBlDensityScaleChange: (layerKey: string, value: number) => void;
  onLayerBlBackgroundCutoffChange: (layerKey: string, value: number) => void;
  onLayerBlOpacityScaleChange: (layerKey: string, value: number) => void;
  onLayerBlEarlyExitAlphaChange: (layerKey: string, value: number) => void;
  onLayerMipEarlyExitThresholdChange: (layerKey: string, value: number) => void;
  onLayerInvertToggle: (layerKey: string) => void;
};

export type GlobalRenderControls = {
  disabled: boolean;
  mipEarlyExitThreshold: number;
  blDensityScale: number;
  blBackgroundCutoff: number;
  blOpacityScale: number;
  blEarlyExitAlpha: number;
  onBlDensityScaleChange: (value: number) => void;
  onBlBackgroundCutoffChange: (value: number) => void;
  onBlOpacityScaleChange: (value: number) => void;
  onBlEarlyExitAlphaChange: (value: number) => void;
  onMipEarlyExitThresholdChange: (value: number) => void;
};

export type TrackSettingsProps = {
  isFullTrailEnabled: boolean;
  trailLength: number;
  trailLengthExtent: NumericRange;
  onFullTrailToggle: (enabled: boolean) => void;
  onTrailLengthChange: (value: number) => void;
};

export type TracksPanelProps = {
  trackSets: Array<{
    id: string;
    name: string;
    boundChannelId: string | null;
    boundChannelName: string | null;
    fileName: string;
  }>;
  trackHeadersByTrackSet: Map<string, { totalTracks: number }>;
  activeTrackSetId: string | null;
  onTrackSetTabSelect: (trackSetId: string) => void;
  onRequireTrackCatalog: (trackSetId: string) => void;
  parsedTracksByTrackSet: Map<string, TrackSummary[]>;
  filteredTracksByTrackSet: Map<string, TrackSummary[]>;
  minimumTrackLength: number;
  pendingMinimumTrackLength: number;
  trackLengthBounds: NumericRange;
  onMinimumTrackLengthChange: (value: number) => void;
  onMinimumTrackLengthApply: () => void;
  trackColorModesByTrackSet: Record<string, TrackColorMode>;
  trackOpacityByTrackSet: Record<string, number>;
  trackLineWidthByTrackSet: Record<string, number>;
  trackSetStates: Record<string, TrackSetState>;
  followedTrackSetId: string | null;
  followedTrackId: string | null;
  onTrackOrderToggle: (trackSetId: string) => void;
  trackOrderModeByTrackSet: Record<string, 'id' | 'length'>;
  onTrackVisibilityToggle: (trackId: string) => void;
  onTrackVisibilityAllChange: (trackSetId: string, visible: boolean) => void;
  onTrackOpacityChange: (trackSetId: string, value: number) => void;
  onTrackLineWidthChange: (trackSetId: string, value: number) => void;
  onTrackColorSelect: (trackSetId: string, color: string) => void;
  onTrackColorReset: (trackSetId: string) => void;
  onTrackSelectionToggle: (trackId: string) => void;
  selectedTrackOrder: string[];
  selectedTrackIds: ReadonlySet<string>;
  onTrackFollow: (trackId: string) => void;
};

export type SelectedTracksPanelProps = {
  shouldRender: boolean;
  series: Array<{
    id: string;
    channelId: string | null;
    channelName: string | null;
    trackSetId: string;
    trackSetName: string;
    trackNumber: number;
    displayTrackNumber?: string;
    color: string;
    rawPoints: TrackPoint[];
    points: TrackPoint[];
  }>;
  totalTimepoints: number;
  amplitudeLimits: NumericRange;
  timeLimits: NumericRange;
  currentTimepoint: number;
  channelTintMap: Map<string, string>;
  smoothing: number;
  onTrackSelectionToggle: (trackId: string) => void;
};

export type PlotSettingsProps = {
  amplitudeExtent: NumericRange;
  amplitudeLimits: NumericRange;
  timeExtent: NumericRange;
  timeLimits: NumericRange;
  smoothing: number;
  smoothingExtent: NumericRange;
  onAmplitudeLimitsChange: (limits: NumericRange) => void;
  onTimeLimitsChange: (limits: NumericRange) => void;
  onSmoothingChange: (value: number) => void;
  onAutoRange: () => void;
  onClearSelection: () => void;
};

export type Position = { x: number; y: number };

export type LayoutProps = {
  windowMargin: number;
  controlWindowWidth: number;
  selectedTracksWindowWidth: number;
  resetToken: number;
  viewerSettingsWindowInitialPosition: Position;
  recordWindowInitialPosition: Position;
  layersWindowInitialPosition: Position;
  paintbrushWindowInitialPosition: Position;
  propsWindowInitialPosition: Position;
  trackWindowInitialPosition: Position;
  selectedTracksWindowInitialPosition: Position;
  plotSettingsWindowInitialPosition: Position;
  trackSettingsWindowInitialPosition: Position;
};

export type TrackDefaults = {
  opacity: number;
  lineWidth: number;
};

export type ViewerShellProps = {
  viewerMode: '3d';
  volumeViewerProps: VolumeViewerProps;
  topMenu: TopMenuChromeProps;
  layout: LayoutProps;
  modeControls: ModeControlsProps;
  playbackControls: PlaybackControlsProps;
  channelsPanel: ChannelsPanelProps;
  tracksPanel: TracksPanelProps;
  selectedTracksPanel: SelectedTracksPanelProps;
  plotSettings: PlotSettingsProps;
  trackSettings: TrackSettingsProps;
  trackDefaults: TrackDefaults;
};

export type FloatingWindowProps = ComponentProps<typeof FloatingWindow>;
export type BrightnessContrastHistogramProps = ComponentProps<typeof BrightnessContrastHistogram>;
export type SelectedTracksWindowProps = ComponentProps<typeof SelectedTracksWindow>;
export type PlotSettingsWindowProps = ComponentProps<typeof PlotSettingsWindow>;

export type ViewerMode = ViewerShellProps['viewerMode'];
