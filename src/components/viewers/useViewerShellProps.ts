import {
  CONTROL_WINDOW_WIDTH,
  SELECTED_TRACKS_WINDOW_WIDTH,
  WINDOW_MARGIN
} from '../../shared/utils/windowLayout';
import {
  DEFAULT_TRACK_LINE_WIDTH,
  DEFAULT_TRACK_OPACITY,
  TRACK_SMOOTHING_RANGE,
  TRACK_TRAIL_LENGTH_RANGE
} from '../../hooks/tracks';
import type { VolumeProviderDiagnostics } from '../../core/volumeProvider';
import type { VolumeViewerVrProps } from './VolumeViewer.types';
import type { ViewerShellProps } from './ViewerShell';

type ViewerLayerConfig =
  ViewerShellProps['planarViewerProps']['layers'][number] &
  ViewerShellProps['volumeViewerProps']['layers'][number];

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
  | 'trackVisibility'
  | 'trackOpacityByTrackSet'
  | 'trackLineWidthByTrackSet'
  | 'trackColorModesByTrackSet'
  | 'channelTrackOffsets'
  | 'selectedTrackIds'
  | 'followedTrackId'
  | 'followedVoxel'
  | 'onTrackSelectionToggle'
  | 'onTrackFollowRequest'
  | 'onVoxelFollowRequest'
  | 'onHoverVoxelChange'
>;

export type ViewerShellContainerViewerPanelsProps = {
  layers: ViewerLayerConfig[];
  loading: ViewerPanelsLoadingInput;
  tracks: ViewerPanelsTrackInput;
  runtimeDiagnostics?: VolumeProviderDiagnostics | null;
  canAdvancePlayback?: ViewerShellProps['volumeViewerProps']['canAdvancePlayback'];
  onRegisterReset: ViewerShellProps['volumeViewerProps']['onRegisterReset'];
  onVolumeStepScaleChange?: ViewerShellProps['volumeViewerProps']['onVolumeStepScaleChange'];
  onRegisterVolumeStepScaleChange?: ViewerShellProps['volumeViewerProps']['onRegisterVolumeStepScaleChange'];
};

export type ViewerShellContainerVrProps = Pick<
  VolumeViewerVrProps,
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
  | 'onChannelLayerSelect'
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

function mapVolumeViewerProps({
  viewerPanels,
  playbackControls,
  modeControls,
  trackSettings,
  vr,
  tracksPanel,
  channelsPanel
}: Pick<
  ViewerShellContainerProps,
  'viewerPanels' | 'playbackControls' | 'modeControls' | 'trackSettings' | 'vr' | 'tracksPanel' | 'channelsPanel'
>): ViewerShellProps['volumeViewerProps'] {
  return {
    layers: viewerPanels.layers,
    isLoading: viewerPanels.loading.isLoading,
    loadingProgress: viewerPanels.loading.loadingProgress,
    loadedVolumes: viewerPanels.loading.loadedVolumes,
    expectedVolumes: viewerPanels.loading.expectedVolumes,
    runtimeDiagnostics: viewerPanels.runtimeDiagnostics ?? null,
    timeIndex: playbackControls.selectedIndex,
    totalTimepoints: playbackControls.volumeTimepointCount,
    isPlaying: playbackControls.isPlaying,
    playbackDisabled: playbackControls.playbackDisabled,
    playbackLabel: playbackControls.playbackLabel,
    fps: playbackControls.fps,
    blendingMode: modeControls.blendingMode,
    onTogglePlayback: playbackControls.onTogglePlayback,
    onTimeIndexChange: playbackControls.onTimeIndexChange,
    canAdvancePlayback: viewerPanels.canAdvancePlayback,
    onFpsChange: playbackControls.onFpsChange,
    onVolumeStepScaleChange: viewerPanels.onVolumeStepScaleChange,
    onRegisterVolumeStepScaleChange: viewerPanels.onRegisterVolumeStepScaleChange,
    onRegisterReset: viewerPanels.onRegisterReset,
    trackScale: viewerPanels.tracks.trackScale,
    tracks: viewerPanels.tracks.tracks,
    trackVisibility: viewerPanels.tracks.trackVisibility,
    trackOpacityByTrackSet: viewerPanels.tracks.trackOpacityByTrackSet,
    trackLineWidthByTrackSet: viewerPanels.tracks.trackLineWidthByTrackSet,
    trackColorModesByTrackSet: viewerPanels.tracks.trackColorModesByTrackSet,
    channelTrackOffsets: viewerPanels.tracks.channelTrackOffsets,
    isFullTrackTrailEnabled: trackSettings.isFullTrailEnabled,
    trackTrailLength: trackSettings.trailLength,
    selectedTrackIds: viewerPanels.tracks.selectedTrackIds,
    followedTrackId: viewerPanels.tracks.followedTrackId,
    followedVoxel: viewerPanels.tracks.followedVoxel,
    onTrackSelectionToggle: viewerPanels.tracks.onTrackSelectionToggle,
    onTrackFollowRequest: viewerPanels.tracks.onTrackFollowRequest,
    onVoxelFollowRequest: viewerPanels.tracks.onVoxelFollowRequest,
    onHoverVoxelChange: viewerPanels.tracks.onHoverVoxelChange,
    vr: modeControls.is3dModeAvailable
      ? {
          ...vr,
          activeTrackChannelId: tracksPanel.activeTrackSetId,
          activeChannelPanelId: channelsPanel.activeChannelId
        }
      : undefined
  };
}

function mapPlanarViewerProps({
  viewerPanels,
  playbackControls,
  trackSettings
}: Pick<ViewerShellContainerProps, 'viewerPanels' | 'playbackControls' | 'trackSettings'>): ViewerShellProps['planarViewerProps'] {
  return {
    layers: viewerPanels.layers,
    isLoading: viewerPanels.loading.isLoading,
    loadingProgress: viewerPanels.loading.loadingProgress,
    loadedVolumes: viewerPanels.loading.loadedVolumes,
    expectedVolumes: viewerPanels.loading.expectedVolumes,
    timeIndex: playbackControls.selectedIndex,
    totalTimepoints: playbackControls.volumeTimepointCount,
    onRegisterReset: viewerPanels.onRegisterReset,
    sliceIndex: playbackControls.sliceIndex,
    maxSlices: playbackControls.maxSliceDepth,
    onSliceIndexChange: playbackControls.onSliceIndexChange,
    trackScale: viewerPanels.tracks.trackScale,
    tracks: viewerPanels.tracks.tracks,
    trackVisibility: viewerPanels.tracks.trackVisibility,
    trackOpacityByTrackSet: viewerPanels.tracks.trackOpacityByTrackSet,
    trackLineWidthByTrackSet: viewerPanels.tracks.trackLineWidthByTrackSet,
    trackColorModesByTrackSet: viewerPanels.tracks.trackColorModesByTrackSet,
    channelTrackOffsets: viewerPanels.tracks.channelTrackOffsets,
    isFullTrackTrailEnabled: trackSettings.isFullTrailEnabled,
    trackTrailLength: trackSettings.trailLength,
    followedTrackId: viewerPanels.tracks.followedTrackId,
    selectedTrackIds: viewerPanels.tracks.selectedTrackIds,
    onTrackSelectionToggle: viewerPanels.tracks.onTrackSelectionToggle,
    onTrackFollowRequest: viewerPanels.tracks.onTrackFollowRequest,
    onHoverVoxelChange: viewerPanels.tracks.onHoverVoxelChange
  };
}

function mapTopMenuProps({
  topMenu,
  isHelpMenuOpen,
  openHelpMenu,
  closeHelpMenu
}: Pick<ViewerShellContainerProps, 'topMenu' | 'isHelpMenuOpen' | 'openHelpMenu' | 'closeHelpMenu'>): ViewerShellProps['topMenu'] {
  return {
    ...topMenu,
    isHelpMenuOpen,
    openHelpMenu,
    closeHelpMenu
  };
}

function mapLayoutProps(layout: ViewerShellContainerLayoutProps): ViewerShellProps['layout'] {
  return {
    windowMargin: WINDOW_MARGIN,
    controlWindowWidth: CONTROL_WINDOW_WIDTH,
    selectedTracksWindowWidth: SELECTED_TRACKS_WINDOW_WIDTH,
    ...layout
  };
}

function mapTracksPanelProps(tracksPanel: ViewerShellContainerTracksPanelProps): ViewerShellProps['tracksPanel'] {
  const { hasParsedTrackData: _hasParsedTrackData, ...rest } = tracksPanel;
  return rest;
}

function mapSelectedTracksPanelProps({
  selectedTracksPanel,
  modeControls,
  tracksPanel
}: Pick<ViewerShellContainerProps, 'selectedTracksPanel' | 'modeControls' | 'tracksPanel'>): ViewerShellProps['selectedTracksPanel'] {
  return {
    ...selectedTracksPanel,
    shouldRender: !modeControls.isVrActive && tracksPanel.hasParsedTrackData
  };
}

function mapPlotSettingsProps(plotSettings: ViewerShellContainerPlotSettingsProps): ViewerShellProps['plotSettings'] {
  return {
    ...plotSettings,
    smoothingExtent: TRACK_SMOOTHING_RANGE
  };
}

function mapTrackSettingsProps(trackSettings: ViewerShellContainerTrackSettingsProps): ViewerShellProps['trackSettings'] {
  return {
    ...trackSettings,
    trailLengthExtent: TRACK_TRAIL_LENGTH_RANGE
  };
}

function mapTrackDefaults(): ViewerShellProps['trackDefaults'] {
  return {
    opacity: DEFAULT_TRACK_OPACITY,
    lineWidth: DEFAULT_TRACK_LINE_WIDTH
  };
}

export function useViewerShellProps(props: ViewerShellContainerProps): ViewerShellProps {
  return {
    viewerMode: props.viewerMode,
    volumeViewerProps: mapVolumeViewerProps(props),
    planarViewerProps: mapPlanarViewerProps(props),
    topMenu: mapTopMenuProps(props),
    layout: mapLayoutProps(props.layout),
    modeControls: props.modeControls,
    playbackControls: props.playbackControls,
    channelsPanel: props.channelsPanel,
    tracksPanel: mapTracksPanelProps(props.tracksPanel),
    selectedTracksPanel: mapSelectedTracksPanelProps(props),
    plotSettings: mapPlotSettingsProps(props.plotSettings),
    trackSettings: mapTrackSettingsProps(props.trackSettings),
    trackDefaults: mapTrackDefaults()
  };
}
