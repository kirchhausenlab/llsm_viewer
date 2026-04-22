import type { VolumeProviderDiagnostics } from '../../core/volumeProvider';
import type { LODPolicyDiagnosticsSnapshot } from '../../core/lodPolicyDiagnostics';
import {
  DEFAULT_TRACK_LINE_WIDTH,
  DEFAULT_TRACK_OPACITY,
  TRACK_SMOOTHING_RANGE,
  TRACK_TRAIL_LENGTH_RANGE
} from '../../hooks/tracks';
import {
  CONTROL_WINDOW_WIDTH,
  SELECTED_TRACKS_WINDOW_WIDTH,
  WINDOW_MARGIN
} from '../../shared/utils/windowLayout';
import type { VolumeViewerVrProps } from '../../components/viewers/VolumeViewer.types';
import type { ViewerShellProps } from '../../components/viewers/viewer-shell/types';

type ViewerLayerConfig = ViewerShellProps['volumeViewerProps']['layers'][number];

type ViewerShellContainerHelpMenuProps = Pick<
  ViewerShellProps['topMenu'],
  'isHelpMenuOpen' | 'openHelpMenu' | 'closeHelpMenu'
>;

type ViewerShellContainerTopMenuProps = Omit<
  ViewerShellProps['topMenu'],
  'isHelpMenuOpen' | 'openHelpMenu' | 'closeHelpMenu'
>;

type ViewerShellContainerLayoutProps = Omit<
  ViewerShellProps['layout'],
  'windowMargin' | 'controlWindowWidth' | 'selectedTracksWindowWidth'
>;

type ViewerShellContainerTracksPanelProps = ViewerShellProps['tracksPanel'] & {
  hasParsedTrackData: boolean;
};

type ViewerShellContainerSelectedTracksPanelProps = Omit<ViewerShellProps['selectedTracksPanel'], 'shouldRender'>;

type ViewerShellContainerPlotSettingsProps = Omit<ViewerShellProps['plotSettings'], 'smoothingExtent'>;

type ViewerShellContainerTrackSettingsProps = Omit<ViewerShellProps['trackSettings'], 'trailLengthExtent'>;

type ViewerPanelsLoadingInput = Pick<
  ViewerShellProps['volumeViewerProps'],
  'isLoading' | 'loadingProgress' | 'loadedVolumes' | 'expectedVolumes'
>;

type ViewerPanelsTrackInput = Pick<
  ViewerShellProps['volumeViewerProps'],
  | 'trackScale'
  | 'tracks'
  | 'compiledTrackPayloadByTrackSet'
  | 'onRequireTrackPayloads'
  | 'trackSetStates'
  | 'trackOpacityByTrackSet'
  | 'trackLineWidthByTrackSet'
  | 'trackColorModesByTrackSet'
  | 'channelTrackOffsets'
  | 'selectedTrackIds'
  | 'followedTrackId'
  | 'followedVoxel'
  | 'playbackWindow'
  | 'onTrackSelectionToggle'
  | 'onTrackFollowRequest'
  | 'onVoxelFollowRequest'
  | 'onHoverVoxelChange'
>;

export type ViewerShellContainerViewerPanelsProps = {
  layers: ViewerLayerConfig[];
  playbackWarmupLayers?: ViewerLayerConfig[];
  playbackWarmupFrames?: ViewerShellProps['volumeViewerProps']['playbackWarmupFrames'];
  temporalResolution?: ViewerShellProps['volumeViewerProps']['temporalResolution'];
  voxelResolution?: ViewerShellProps['volumeViewerProps']['voxelResolution'];
  loading: ViewerPanelsLoadingInput;
  tracks: ViewerPanelsTrackInput;
  zClipFrontFraction: number;
  runtimeDiagnostics?: VolumeProviderDiagnostics | null;
  lodPolicyDiagnostics?: LODPolicyDiagnosticsSnapshot | null;
  canAdvancePlayback?: ViewerShellProps['volumeViewerProps']['canAdvancePlayback'];
  onRegisterReset: ViewerShellProps['volumeViewerProps']['onRegisterReset'];
  onVolumeStepScaleChange?: ViewerShellProps['volumeViewerProps']['onVolumeStepScaleChange'];
  onRegisterVolumeStepScaleChange?: ViewerShellProps['volumeViewerProps']['onRegisterVolumeStepScaleChange'];
  onCameraNavigationSample?: ViewerShellProps['volumeViewerProps']['onCameraNavigationSample'];
};

export type ViewerShellContainerVrProps = Pick<
  VolumeViewerVrProps,
  | 'isVrActive'
  | 'isVrPassthroughSupported'
  | 'trackChannels'
  | 'onTrackChannelSelect'
  | 'onTrackVisibilityToggle'
  | 'onTrackVisibilityAllChange'
  | 'onTrackOpacityChange'
  | 'onTrackLineWidthChange'
  | 'onTrackColorSelect'
  | 'onTrackColorReset'
  | 'onStopTrackFollow'
  | 'channelPanels'
  | 'onChannelPanelSelect'
  | 'onChannelVisibilityToggle'
  | 'onChannelReset'
  | 'onLayerSelect'
  | 'onLayerSoloToggle'
  | 'onLayerContrastChange'
  | 'onLayerBrightnessChange'
  | 'onLayerWindowMinChange'
  | 'onLayerWindowMaxChange'
  | 'onLayerAutoContrast'
  | 'onLayerOffsetChange'
  | 'onLayerColorChange'
  | 'onLayerRenderStyleToggle'
  | 'onLayerSamplingModeToggle'
  | 'onLayerInvertToggle'
  | 'onRegisterVrSession'
  | 'onVrSessionStarted'
  | 'onVrSessionEnded'
>;

export type ViewerShellContainerProps = ViewerShellContainerHelpMenuProps & {
  viewerMode: ViewerShellProps['viewerMode'];
  loadMeasurementVolume: ViewerShellProps['loadMeasurementVolume'];
  viewerPanels: ViewerShellContainerViewerPanelsProps;
  vr: ViewerShellContainerVrProps;
  topMenu: ViewerShellContainerTopMenuProps;
  layout: ViewerShellContainerLayoutProps;
  modeControls: ViewerShellProps['modeControls'];
  playbackControls: ViewerShellProps['playbackControls'];
  channelsPanel: ViewerShellProps['channelsPanel'];
  tracksPanel: ViewerShellContainerTracksPanelProps;
  selectedTracksPanel: ViewerShellContainerSelectedTracksPanelProps;
  plotSettings: ViewerShellContainerPlotSettingsProps;
  trackSettings: ViewerShellContainerTrackSettingsProps;
};

export type ViewerShellRouteProps = Omit<
  ViewerShellContainerProps,
  'isHelpMenuOpen' | 'openHelpMenu' | 'closeHelpMenu'
>;

export function mapViewerShellLayoutProps(layout: ViewerShellContainerLayoutProps): ViewerShellProps['layout'] {
  return {
    windowMargin: WINDOW_MARGIN,
    controlWindowWidth: CONTROL_WINDOW_WIDTH,
    selectedTracksWindowWidth: SELECTED_TRACKS_WINDOW_WIDTH,
    ...layout
  };
}

export function mapViewerShellTrackDefaults(): ViewerShellProps['trackDefaults'] {
  return {
    opacity: DEFAULT_TRACK_OPACITY,
    lineWidth: DEFAULT_TRACK_LINE_WIDTH
  };
}

export function mapViewerShellPlotSettingsProps(
  plotSettings: ViewerShellContainerPlotSettingsProps
): ViewerShellProps['plotSettings'] {
  return {
    ...plotSettings,
    smoothingExtent: TRACK_SMOOTHING_RANGE
  };
}

export function mapViewerShellTrackSettingsProps(
  trackSettings: ViewerShellContainerTrackSettingsProps
): ViewerShellProps['trackSettings'] {
  return {
    ...trackSettings,
    trailLengthExtent: TRACK_TRAIL_LENGTH_RANGE
  };
}
