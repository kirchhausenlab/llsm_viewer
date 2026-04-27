import {
  mapViewerShellLayoutProps,
  mapViewerShellPlotSettingsProps,
  mapViewerShellTrackDefaults,
  mapViewerShellTrackSettingsProps,
  type ViewerShellContainerProps
} from '../../ui/contracts/viewerShell';
import type { ViewerShellProps } from './viewer-shell/types';

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
    playbackWarmupLayers: viewerPanels.playbackWarmupLayers ?? [],
    playbackWarmupFrames: viewerPanels.playbackWarmupFrames ?? [],
    isLoading: viewerPanels.loading.isLoading,
    loadingProgress: viewerPanels.loading.loadingProgress,
    loadedVolumes: viewerPanels.loading.loadedVolumes,
    expectedVolumes: viewerPanels.loading.expectedVolumes,
    runtimeDiagnostics: viewerPanels.runtimeDiagnostics ?? null,
    lodPolicyDiagnostics: viewerPanels.lodPolicyDiagnostics ?? null,
    residencyDecisions: viewerPanels.residencyDecisions ?? {},
    timeIndex: playbackControls.selectedIndex,
    totalTimepoints: playbackControls.volumeTimepointCount,
    temporalResolution: viewerPanels.temporalResolution ?? null,
    voxelResolution: viewerPanels.voxelResolution ?? null,
    isPlaying: playbackControls.isPlaying,
    playbackDisabled: playbackControls.playbackDisabled,
    playbackLabel: playbackControls.playbackLabel,
    fps: playbackControls.fps,
    playbackBufferFrames: playbackControls.playbackBufferFrames,
    isPlaybackStartPending: playbackControls.isPlaybackStartPending,
    projectionMode: modeControls.projectionMode,
    zClipFrontFraction: viewerPanels.zClipFrontFraction,
    blendingMode: modeControls.blendingMode,
    onTogglePlayback: playbackControls.onTogglePlayback,
    onTimeIndexChange: playbackControls.onTimeIndexChange,
    playbackWindow: viewerPanels.tracks.playbackWindow ?? null,
    canAdvancePlayback: viewerPanels.canAdvancePlayback,
    onBufferedPlaybackStart: playbackControls.onBufferedPlaybackStart,
    onFpsChange: playbackControls.onFpsChange,
    onVolumeStepScaleChange: viewerPanels.onVolumeStepScaleChange,
    onRegisterVolumeStepScaleChange: viewerPanels.onRegisterVolumeStepScaleChange,
    onCameraNavigationSample: viewerPanels.onCameraNavigationSample,
    onRegisterReset: viewerPanels.onRegisterReset,
    tracks: viewerPanels.tracks.tracks,
    compiledTrackPayloadByTrackSet: viewerPanels.tracks.compiledTrackPayloadByTrackSet,
    onRequireTrackPayloads: viewerPanels.tracks.onRequireTrackPayloads,
    trackSetStates: viewerPanels.tracks.trackSetStates,
    trackOpacityByTrackSet: viewerPanels.tracks.trackOpacityByTrackSet,
    trackLineWidthByTrackSet: viewerPanels.tracks.trackLineWidthByTrackSet,
    trackColorModesByTrackSet: viewerPanels.tracks.trackColorModesByTrackSet,
    channelTrackOffsets: viewerPanels.tracks.channelTrackOffsets,
    isFullTrackTrailEnabled: trackSettings.isFullTrailEnabled,
    trackTrailLength: trackSettings.trailLength,
    drawTrackCentroids: trackSettings.drawCentroids,
    drawTrackStartingPoints: trackSettings.drawStartingPoints,
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

function mapLayoutProps(layout: ViewerShellContainerProps['layout']): ViewerShellProps['layout'] {
  return mapViewerShellLayoutProps(layout);
}

function mapTracksPanelProps(tracksPanel: ViewerShellContainerProps['tracksPanel']): ViewerShellProps['tracksPanel'] {
  const { hasParsedTrackData: _hasParsedTrackData, ...rest } = tracksPanel;
  return rest;
}

function mapSelectedTracksPanelProps({
  selectedTracksPanel,
  modeControls
}: Pick<ViewerShellContainerProps, 'selectedTracksPanel' | 'modeControls'>): ViewerShellProps['selectedTracksPanel'] {
  return {
    ...selectedTracksPanel,
    shouldRender: !modeControls.isVrActive && selectedTracksPanel.series.length > 0
  };
}

function mapPlotSettingsProps(plotSettings: ViewerShellContainerProps['plotSettings']): ViewerShellProps['plotSettings'] {
  return mapViewerShellPlotSettingsProps(plotSettings);
}

function mapTrackSettingsProps(trackSettings: ViewerShellContainerProps['trackSettings']): ViewerShellProps['trackSettings'] {
  return mapViewerShellTrackSettingsProps(trackSettings);
}

function mapTrackDefaults(): ViewerShellProps['trackDefaults'] {
  return mapViewerShellTrackDefaults();
}

export function useViewerShellProps(props: ViewerShellContainerProps): ViewerShellProps {
  return {
    viewerMode: props.viewerMode,
    volumeViewerProps: mapVolumeViewerProps(props),
    loadMeasurementVolume: props.loadMeasurementVolume,
    datasetAccess: props.datasetAccess,
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

export type { ViewerShellContainerProps } from '../../ui/contracts/viewerShell';
