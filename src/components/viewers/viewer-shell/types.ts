import type { ComponentProps, CSSProperties, MouseEvent } from 'react';

import type BrightnessContrastHistogram from '../BrightnessContrastHistogram';
import type FloatingWindow from '../../widgets/FloatingWindow';
import type PlanarViewer from '../PlanarViewer';
import type PlotSettingsWindow from '../../widgets/PlotSettingsWindow';
import type SelectedTracksWindow from '../../widgets/SelectedTracksWindow';
import type VolumeViewer from '../VolumeViewer';
import type { VolumeViewerProps } from '../VolumeViewer.types';
import type { ChannelSource } from '../../../hooks/dataset';
import type { LoadedDatasetLayer } from '../../../hooks/dataset';
import type { NormalizedVolume } from '../../../core/volumeProcessing';
import type { LayerSettings } from '../../../state/layerSettings';
import type { FollowedVoxelTarget } from '../../../types/follow';
import type { HoveredVoxelInfo } from '../../../types/hover';
import type { NumericRange, TrackColorMode, TrackDefinition, TrackPoint } from '../../../types/tracks';

export type PlanarViewerProps = ComponentProps<typeof PlanarViewer>;

export type TopMenuProps = {
  onReturnToLauncher: () => void;
  onResetLayout: () => void;
  isHelpMenuOpen: boolean;
  openHelpMenu: () => void;
  closeHelpMenu: () => void;
  followedTrackChannelId: string | null;
  followedTrackId: string | null;
  followedVoxel: FollowedVoxelTarget | null;
  onStopTrackFollow: (channelId?: string) => void;
  onStopVoxelFollow: () => void;
  hoveredVoxel: HoveredVoxelInfo | null;
};

export type ModeControlsProps = {
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

export type PlaybackControlsProps = {
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
  onStartRecording: () => void;
  onStopRecording: () => void;
  isRecording: boolean;
  canRecord: boolean;
};

export type PlanarSettingsProps = {
  orthogonalViewsEnabled: boolean;
  orthogonalViewsAvailable: boolean;
  onOrthogonalViewsToggle: () => void;
};

export type ChannelPanelStyle = (CSSProperties & { '--channel-slider-color'?: string }) &
  Record<string, string | number | undefined>;

export type ChannelsPanelProps = {
  isPlaying: boolean;
  loadedChannelIds: string[];
  channelNameMap: Map<string, string>;
  channelVisibility: Record<string, boolean>;
  channelTintMap: Map<string, string>;
  activeChannelId: string | null;
  onChannelTabSelect: (channelId: string) => void;
  onChannelVisibilityToggle: (channelId: string) => void;
  channelLayersMap: Map<string, LoadedDatasetLayer[]>;
  layerVolumesByKey: Record<string, NormalizedVolume | null>;
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

export type TrackSummary = { total: number; visible: number };

export type TracksPanelProps = {
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
  selectedTrackOrder: string[];
  selectedTrackIds: ReadonlySet<string>;
  onTrackFollow: (trackId: string) => void;
};

export type SelectedTracksPanelProps = {
  shouldRender: boolean;
  series: Array<{
    id: string;
    channelId: string;
    channelName: string;
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
  controlWindowInitialPosition: Position;
  viewerSettingsWindowInitialPosition: Position;
  layersWindowInitialPosition: Position;
  trackWindowInitialPosition: Position;
  selectedTracksWindowInitialPosition: Position;
  plotSettingsWindowInitialPosition: Position;
};

export type TrackDefaults = {
  opacity: number;
  lineWidth: number;
};

export type ViewerShellProps = {
  viewerMode: '3d' | '2d';
  volumeViewerProps: VolumeViewerProps;
  planarViewerProps: PlanarViewerProps;
  planarSettings: PlanarSettingsProps;
  topMenu: TopMenuProps;
  layout: LayoutProps;
  modeControls: ModeControlsProps;
  playbackControls: PlaybackControlsProps;
  channelsPanel: ChannelsPanelProps;
  tracksPanel: TracksPanelProps;
  selectedTracksPanel: SelectedTracksPanelProps;
  plotSettings: PlotSettingsProps;
  trackDefaults: TrackDefaults;
};

export type FloatingWindowProps = ComponentProps<typeof FloatingWindow>;
export type BrightnessContrastHistogramProps = ComponentProps<typeof BrightnessContrastHistogram>;
export type SelectedTracksWindowProps = ComponentProps<typeof SelectedTracksWindow>;
export type PlotSettingsWindowProps = ComponentProps<typeof PlotSettingsWindow>;

export type ViewerMode = ViewerShellProps['viewerMode'];
