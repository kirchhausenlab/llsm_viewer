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
import type { VolumeViewerVrProps } from './VolumeViewer.types';
import type { LayerSettings } from '../../state/layerSettings';
import type { HoveredVoxelInfo } from '../../types/hover';
import type { NumericRange, TrackDefinition } from '../../types/tracks';
import type { ChannelSource } from '../../hooks/dataset';
import type { ViewerShellProps } from './ViewerShell';

type ViewerLayerConfig =
  ViewerShellProps['planarViewerProps']['layers'][number] &
  ViewerShellProps['volumeViewerProps']['layers'][number];

export type ViewerShellContainerProps = {
  viewerMode: ViewerShellProps['viewerMode'];
  viewerLayers: ViewerLayerConfig[];
  isLoading: boolean;
  loadProgress: number;
  loadedCount: number;
  expectedVolumeCount: number;
  selectedIndex: number;
  volumeTimepointCount: number;
  isPlaying: boolean;
  playbackDisabled: boolean;
  playbackLabel: string;
  isRecording: boolean;
  canRecord: boolean;
  fps: number;
  blendingMode: ViewerShellProps['modeControls']['blendingMode'];
  sliceIndex: number;
  maxSliceDepth: number;
  trackScale: ViewerShellProps['volumeViewerProps']['trackScale'];
  filteredTracks: TrackDefinition[];
  trackVisibility: ViewerShellProps['volumeViewerProps']['trackVisibility'];
  trackOpacityByTrackSet: ViewerShellProps['volumeViewerProps']['trackOpacityByTrackSet'];
  trackLineWidthByTrackSet: ViewerShellProps['volumeViewerProps']['trackLineWidthByTrackSet'];
  trackColorModesByTrackSet: ViewerShellProps['volumeViewerProps']['trackColorModesByTrackSet'];
  channelTrackOffsets: ViewerShellProps['volumeViewerProps']['channelTrackOffsets'];
  selectedTrackIds: ViewerShellProps['volumeViewerProps']['selectedTrackIds'];
  followedTrackId: ViewerShellProps['volumeViewerProps']['followedTrackId'];
  followedVoxel: ViewerShellProps['volumeViewerProps']['followedVoxel'];
  followedTrackSetId: ViewerShellProps['topMenu']['followedTrackSetId'];
  activeTrackSetId: ViewerShellProps['tracksPanel']['activeTrackSetId'];
  activeChannelTabId: ViewerShellProps['channelsPanel']['activeChannelId'];
  trackChannels: VolumeViewerVrProps['trackChannels'];
  vrChannelPanels: VolumeViewerVrProps['channelPanels'];
  is3dViewerAvailable: ViewerShellProps['modeControls']['is3dModeAvailable'];
  isVrActive: ViewerShellProps['modeControls']['isVrActive'];
  isVrRequesting: ViewerShellProps['modeControls']['isVrRequesting'];
  resetViewHandler: ViewerShellProps['modeControls']['resetViewHandler'];
  isVrPassthroughSupported: VolumeViewerVrProps['isVrPassthroughSupported'];
  hasParsedTrackData: boolean;
  layoutResetToken: ViewerShellProps['layout']['resetToken'];
  controlWindowInitialPosition: ViewerShellProps['layout']['controlWindowInitialPosition'];
  viewerSettingsWindowInitialPosition: ViewerShellProps['layout']['viewerSettingsWindowInitialPosition'];
  layersWindowInitialPosition: ViewerShellProps['layout']['layersWindowInitialPosition'];
  paintbrushWindowInitialPosition: ViewerShellProps['layout']['paintbrushWindowInitialPosition'];
  trackWindowInitialPosition: ViewerShellProps['layout']['trackWindowInitialPosition'];
  selectedTracksWindowInitialPosition: ViewerShellProps['layout']['selectedTracksWindowInitialPosition'];
  plotSettingsWindowInitialPosition: ViewerShellProps['layout']['plotSettingsWindowInitialPosition'];
  trackSettingsWindowInitialPosition: ViewerShellProps['layout']['trackSettingsWindowInitialPosition'];
  channels: ChannelSource[];
  channelNameMap: ViewerShellProps['channelsPanel']['channelNameMap'];
  channelVisibility: ViewerShellProps['channelsPanel']['channelVisibility'];
  channelTintMap: ViewerShellProps['channelsPanel']['channelTintMap'];
  channelLayersMap: ViewerShellProps['channelsPanel']['channelLayersMap'];
  layerVolumesByKey: ViewerShellProps['channelsPanel']['layerVolumesByKey'];
  channelActiveLayer: ViewerShellProps['channelsPanel']['channelActiveLayer'];
  layerSettings: ViewerShellProps['channelsPanel']['layerSettings'];
  loadedChannelIds: ViewerShellProps['channelsPanel']['loadedChannelIds'];
  trackSets: ViewerShellProps['tracksPanel']['trackSets'];
  parsedTracksByTrackSet: ViewerShellProps['tracksPanel']['parsedTracksByTrackSet'];
  filteredTracksByTrackSet: ViewerShellProps['tracksPanel']['filteredTracksByTrackSet'];
  minimumTrackLength: ViewerShellProps['tracksPanel']['minimumTrackLength'];
  pendingMinimumTrackLength: ViewerShellProps['tracksPanel']['pendingMinimumTrackLength'];
  trackLengthBounds: ViewerShellProps['tracksPanel']['trackLengthBounds'];
  trackSummaryByTrackSet: ViewerShellProps['tracksPanel']['trackSummaryByTrackSet'];
  trackOrderModeByTrackSet: ViewerShellProps['tracksPanel']['trackOrderModeByTrackSet'];
  selectedTrackSeries: ViewerShellProps['selectedTracksPanel']['series'];
  selectedTrackOrder: ViewerShellProps['tracksPanel']['selectedTrackOrder'];
  resolvedAmplitudeLimits: NumericRange;
  resolvedTimeLimits: NumericRange;
  trackSmoothing: number;
  isFullTrackTrailEnabled: boolean;
  trackTrailLength: number;
  amplitudeExtent: NumericRange;
  timeExtent: NumericRange;
  error: ViewerShellProps['playbackControls']['error'];
  hoveredVolumeVoxel: HoveredVoxelInfo | null;
  onTogglePlayback: ViewerShellProps['volumeViewerProps']['onTogglePlayback'];
  onTimeIndexChange: ViewerShellProps['volumeViewerProps']['onTimeIndexChange'];
  canAdvancePlayback?: ViewerShellProps['volumeViewerProps']['canAdvancePlayback'];
  onFpsChange: ViewerShellProps['volumeViewerProps']['onFpsChange'];
  onVolumeStepScaleChange?: ViewerShellProps['volumeViewerProps']['onVolumeStepScaleChange'];
  onRegisterVolumeStepScaleChange?: ViewerShellProps['volumeViewerProps']['onRegisterVolumeStepScaleChange'];
  onRegisterReset: ViewerShellProps['volumeViewerProps']['onRegisterReset'];
  onTrackSelectionToggle: ViewerShellProps['volumeViewerProps']['onTrackSelectionToggle'];
  onTrackFollowRequest: ViewerShellProps['volumeViewerProps']['onTrackFollowRequest'];
  onVoxelFollowRequest: ViewerShellProps['volumeViewerProps']['onVoxelFollowRequest'];
  onHoverVoxelChange?: ViewerShellProps['volumeViewerProps']['onHoverVoxelChange'];
  onStartRecording: ViewerShellProps['playbackControls']['onStartRecording'];
  onStopRecording: ViewerShellProps['playbackControls']['onStopRecording'];
  onTrackChannelSelect: VolumeViewerVrProps['onTrackChannelSelect'];
  onTrackVisibilityToggle: VolumeViewerVrProps['onTrackVisibilityToggle'];
  onTrackVisibilityAllChange: VolumeViewerVrProps['onTrackVisibilityAllChange'];
  onTrackOpacityChange: VolumeViewerVrProps['onTrackOpacityChange'];
  onTrackLineWidthChange: VolumeViewerVrProps['onTrackLineWidthChange'];
  onTrackColorSelect: VolumeViewerVrProps['onTrackColorSelect'];
  onTrackColorReset: VolumeViewerVrProps['onTrackColorReset'];
  onTrackTrailModeChange: (isFull: boolean) => void;
  onTrackTrailLengthChange: (value: number) => void;
  onStopTrackFollow: VolumeViewerVrProps['onStopTrackFollow'];
  onStopVoxelFollow: ViewerShellProps['topMenu']['onStopVoxelFollow'];
  onChannelPanelSelect: VolumeViewerVrProps['onChannelPanelSelect'];
  onTrackPanelChannelSelect: ViewerShellProps['tracksPanel']['onTrackSetTabSelect'];
  onChannelVisibilityToggle: VolumeViewerVrProps['onChannelVisibilityToggle'];
  onChannelReset: VolumeViewerVrProps['onChannelReset'];
  onChannelLayerSelect: VolumeViewerVrProps['onChannelLayerSelect'];
  onLayerSelect?: VolumeViewerVrProps['onLayerSelect'];
  onLayerSoloToggle?: VolumeViewerVrProps['onLayerSoloToggle'];
  onLayerContrastChange: VolumeViewerVrProps['onLayerContrastChange'];
  onLayerBrightnessChange: VolumeViewerVrProps['onLayerBrightnessChange'];
  onLayerWindowMinChange: VolumeViewerVrProps['onLayerWindowMinChange'];
  onLayerWindowMaxChange: VolumeViewerVrProps['onLayerWindowMaxChange'];
  onLayerAutoContrast: VolumeViewerVrProps['onLayerAutoContrast'];
  onLayerOffsetChange: VolumeViewerVrProps['onLayerOffsetChange'];
  onLayerColorChange: VolumeViewerVrProps['onLayerColorChange'];
  onLayerRenderStyleToggle: VolumeViewerVrProps['onLayerRenderStyleToggle'];
  onLayerSamplingModeToggle: VolumeViewerVrProps['onLayerSamplingModeToggle'];
  onLayerInvertToggle: VolumeViewerVrProps['onLayerInvertToggle'];
  onRegisterVrSession?: VolumeViewerVrProps['onRegisterVrSession'];
  onVrSessionStarted?: VolumeViewerVrProps['onVrSessionStarted'];
  onVrSessionEnded?: VolumeViewerVrProps['onVrSessionEnded'];
  onSliceIndexChange: ViewerShellProps['planarViewerProps']['onSliceIndexChange'];
  onReturnToLauncher: ViewerShellProps['topMenu']['onReturnToLauncher'];
  onResetWindowLayout: ViewerShellProps['topMenu']['onResetLayout'];
  isHelpMenuOpen: boolean;
  openHelpMenu: ViewerShellProps['topMenu']['openHelpMenu'];
  closeHelpMenu: ViewerShellProps['topMenu']['closeHelpMenu'];
  onToggleViewerMode: ViewerShellProps['modeControls']['onToggleViewerMode'];
  onVrButtonClick: ViewerShellProps['modeControls']['onVrButtonClick'];
  vrButtonDisabled: ViewerShellProps['modeControls']['vrButtonDisabled'];
  vrButtonTitle?: ViewerShellProps['modeControls']['vrButtonTitle'];
  vrButtonLabel: ViewerShellProps['modeControls']['vrButtonLabel'];
  renderStyle: ViewerShellProps['modeControls']['renderStyle'];
  samplingMode: ViewerShellProps['modeControls']['samplingMode'];
  onRenderStyleToggle: ViewerShellProps['modeControls']['onRenderStyleToggle'];
  onSamplingModeToggle: ViewerShellProps['modeControls']['onSamplingModeToggle'];
  onBlendingModeToggle: ViewerShellProps['modeControls']['onBlendingModeToggle'];
  onJumpToStart: ViewerShellProps['playbackControls']['onJumpToStart'];
  onJumpToEnd: ViewerShellProps['playbackControls']['onJumpToEnd'];
  onMinimumTrackLengthChange: ViewerShellProps['tracksPanel']['onMinimumTrackLengthChange'];
  onMinimumTrackLengthApply: ViewerShellProps['tracksPanel']['onMinimumTrackLengthApply'];
  onTrackOrderToggle: ViewerShellProps['tracksPanel']['onTrackOrderToggle'];
  onTrackFollow: ViewerShellProps['tracksPanel']['onTrackFollow'];
  onAmplitudeLimitsChange: ViewerShellProps['plotSettings']['onAmplitudeLimitsChange'];
  onTimeLimitsChange: ViewerShellProps['plotSettings']['onTimeLimitsChange'];
  onSmoothingChange: ViewerShellProps['plotSettings']['onSmoothingChange'];
  onAutoRange: ViewerShellProps['plotSettings']['onAutoRange'];
  onClearSelection: ViewerShellProps['plotSettings']['onClearSelection'];
  getLayerDefaultSettings: (layerKey: string) => LayerSettings;
};

export function useViewerShellProps({
  viewerMode,
  viewerLayers,
  isLoading,
  loadProgress,
  loadedCount,
  expectedVolumeCount,
  selectedIndex,
  volumeTimepointCount,
  isPlaying,
  playbackDisabled,
  playbackLabel,
  isRecording,
  canRecord,
  fps,
  blendingMode,
  sliceIndex,
  maxSliceDepth,
  trackScale,
  filteredTracks,
  trackVisibility,
  trackOpacityByTrackSet,
  trackLineWidthByTrackSet,
  trackColorModesByTrackSet,
  channelTrackOffsets,
  selectedTrackIds,
  followedTrackId,
  followedVoxel,
  followedTrackSetId,
  activeTrackSetId,
  activeChannelTabId,
  trackChannels,
  vrChannelPanels,
  is3dViewerAvailable,
  isVrActive,
  isVrRequesting,
  resetViewHandler,
  isVrPassthroughSupported,
  hasParsedTrackData,
  layoutResetToken,
  controlWindowInitialPosition,
  viewerSettingsWindowInitialPosition,
  layersWindowInitialPosition,
  paintbrushWindowInitialPosition,
  trackWindowInitialPosition,
  selectedTracksWindowInitialPosition,
  plotSettingsWindowInitialPosition,
  trackSettingsWindowInitialPosition,
  channels,
  channelNameMap,
  channelVisibility,
  channelTintMap,
  channelLayersMap,
  layerVolumesByKey,
  channelActiveLayer,
  layerSettings,
  loadedChannelIds,
  trackSets,
  parsedTracksByTrackSet,
  filteredTracksByTrackSet,
  minimumTrackLength,
  pendingMinimumTrackLength,
  trackLengthBounds,
  trackSummaryByTrackSet,
  trackOrderModeByTrackSet,
  selectedTrackOrder,
  selectedTrackSeries,
  resolvedAmplitudeLimits,
  resolvedTimeLimits,
  trackSmoothing,
  isFullTrackTrailEnabled,
  trackTrailLength,
  amplitudeExtent,
  timeExtent,
  error,
  hoveredVolumeVoxel,
  onTogglePlayback,
  onTimeIndexChange,
  canAdvancePlayback,
  onFpsChange,
  onVolumeStepScaleChange,
  onRegisterVolumeStepScaleChange,
  onRegisterReset,
  onTrackSelectionToggle,
  onTrackFollowRequest,
  onVoxelFollowRequest,
  onHoverVoxelChange,
  onStartRecording,
  onStopRecording,
  onTrackChannelSelect,
  onTrackVisibilityToggle,
  onTrackVisibilityAllChange,
  onTrackOpacityChange,
  onTrackLineWidthChange,
  onTrackColorSelect,
  onTrackColorReset,
  onTrackTrailModeChange,
  onTrackTrailLengthChange,
  onStopTrackFollow,
  onStopVoxelFollow,
  onChannelPanelSelect,
  onTrackPanelChannelSelect,
  onChannelVisibilityToggle,
  onChannelReset,
  onChannelLayerSelect,
  onLayerSelect,
  onLayerSoloToggle,
  onLayerContrastChange,
  onLayerBrightnessChange,
  onLayerWindowMinChange,
  onLayerWindowMaxChange,
  onLayerAutoContrast,
  onLayerOffsetChange,
  onLayerColorChange,
  onLayerRenderStyleToggle,
  onLayerSamplingModeToggle,
  onLayerInvertToggle,
  onRegisterVrSession,
  onVrSessionStarted,
  onVrSessionEnded,
  onSliceIndexChange,
  onReturnToLauncher,
  onResetWindowLayout,
  isHelpMenuOpen,
  openHelpMenu,
  closeHelpMenu,
  onToggleViewerMode,
  onVrButtonClick,
  vrButtonDisabled,
  vrButtonTitle,
  vrButtonLabel,
  renderStyle,
  samplingMode,
  onRenderStyleToggle,
  onSamplingModeToggle,
  onBlendingModeToggle,
  onJumpToStart,
  onJumpToEnd,
  onMinimumTrackLengthChange,
  onMinimumTrackLengthApply,
  onTrackOrderToggle,
  onTrackFollow,
  onAmplitudeLimitsChange,
  onTimeLimitsChange,
  onSmoothingChange,
  onAutoRange,
  onClearSelection,
  getLayerDefaultSettings
  }: ViewerShellContainerProps): ViewerShellProps {
  const volumeViewerProps: ViewerShellProps['volumeViewerProps'] = {
    layers: viewerLayers,
    isLoading,
    loadingProgress: loadProgress,
    loadedVolumes: loadedCount,
    expectedVolumes: expectedVolumeCount,
    timeIndex: selectedIndex,
    totalTimepoints: volumeTimepointCount,
    isPlaying,
    playbackDisabled,
    playbackLabel,
    fps,
    blendingMode,
    onTogglePlayback,
    onTimeIndexChange,
    canAdvancePlayback,
    onFpsChange,
    onVolumeStepScaleChange,
    onRegisterVolumeStepScaleChange,
    onRegisterReset,
    trackScale,
    tracks: filteredTracks,
    trackVisibility,
    trackOpacityByTrackSet,
    trackLineWidthByTrackSet,
    trackColorModesByTrackSet,
    channelTrackOffsets,
    isFullTrackTrailEnabled,
    trackTrailLength,
    selectedTrackIds,
    followedTrackId,
    followedVoxel,
    onTrackSelectionToggle,
    onTrackFollowRequest,
    onVoxelFollowRequest,
    onHoverVoxelChange,
    vr: is3dViewerAvailable
      ? {
          isVrPassthroughSupported,
          trackChannels,
          activeTrackChannelId: activeTrackSetId,
          onTrackChannelSelect,
          onTrackVisibilityToggle,
          onTrackVisibilityAllChange,
          onTrackOpacityChange,
          onTrackLineWidthChange,
          onTrackColorSelect,
          onTrackColorReset,
          onStopTrackFollow,
          channelPanels: vrChannelPanels,
          activeChannelPanelId: activeChannelTabId,
          onChannelPanelSelect,
          onChannelVisibilityToggle,
          onChannelReset,
          onChannelLayerSelect,
          onLayerSelect,
          onLayerSoloToggle,
          onLayerContrastChange,
          onLayerBrightnessChange,
          onLayerWindowMinChange,
          onLayerWindowMaxChange,
          onLayerAutoContrast,
          onLayerOffsetChange,
          onLayerColorChange,
          onLayerRenderStyleToggle,
          onLayerSamplingModeToggle,
          onLayerInvertToggle,
          onRegisterVrSession,
          onVrSessionStarted,
          onVrSessionEnded
        }
      : undefined
  };

  const planarViewerProps: ViewerShellProps['planarViewerProps'] = {
    layers: viewerLayers,
    isLoading,
    loadingProgress: loadProgress,
    loadedVolumes: loadedCount,
    expectedVolumes: expectedVolumeCount,
    timeIndex: selectedIndex,
    totalTimepoints: volumeTimepointCount,
    onRegisterReset,
    sliceIndex,
    maxSlices: maxSliceDepth,
    onSliceIndexChange,
    trackScale,
    tracks: filteredTracks,
    trackVisibility,
    trackOpacityByTrackSet,
    trackLineWidthByTrackSet,
    trackColorModesByTrackSet,
    channelTrackOffsets,
    isFullTrackTrailEnabled,
    trackTrailLength,
    followedTrackId,
    selectedTrackIds,
    onTrackSelectionToggle,
    onTrackFollowRequest,
    onHoverVoxelChange
  };

  const showSelectedTracksWindow = !isVrActive && hasParsedTrackData;

  return {
    viewerMode,
    volumeViewerProps,
    planarViewerProps,
    topMenu: {
      onReturnToLauncher,
      onResetLayout: onResetWindowLayout,
      isHelpMenuOpen,
      openHelpMenu,
      closeHelpMenu,
      hoveredVoxel: hoveredVolumeVoxel,
      followedTrackSetId,
      followedTrackId,
      followedVoxel,
      onStopTrackFollow,
      onStopVoxelFollow
    },
    layout: {
      windowMargin: WINDOW_MARGIN,
      controlWindowWidth: CONTROL_WINDOW_WIDTH,
      selectedTracksWindowWidth: SELECTED_TRACKS_WINDOW_WIDTH,
      resetToken: layoutResetToken,
      controlWindowInitialPosition,
      viewerSettingsWindowInitialPosition,
      layersWindowInitialPosition,
      paintbrushWindowInitialPosition,
      trackWindowInitialPosition,
      selectedTracksWindowInitialPosition,
      plotSettingsWindowInitialPosition,
      trackSettingsWindowInitialPosition
    },
    modeControls: {
      is3dModeAvailable: is3dViewerAvailable,
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
    },
    playbackControls: {
      fps,
      onFpsChange,
      volumeTimepointCount,
      sliceIndex,
      maxSliceDepth,
      onSliceIndexChange,
      isPlaying,
      playbackLabel,
      isRecording,
      canRecord,
      selectedIndex,
      onTimeIndexChange,
      playbackDisabled,
      onTogglePlayback,
      onJumpToStart,
      onJumpToEnd,
      error,
      onStartRecording,
      onStopRecording
    },
    channelsPanel: {
      isPlaying,
      loadedChannelIds,
      channelNameMap,
      channelVisibility,
      channelTintMap,
      activeChannelId: activeChannelTabId,
      onChannelTabSelect: onChannelPanelSelect,
      onChannelVisibilityToggle,
      channelLayersMap,
      layerVolumesByKey,
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
    },
    tracksPanel: {
      trackSets,
      activeTrackSetId,
      onTrackSetTabSelect: onTrackPanelChannelSelect,
      parsedTracksByTrackSet,
      filteredTracksByTrackSet,
      minimumTrackLength,
      pendingMinimumTrackLength,
      trackLengthBounds,
      onMinimumTrackLengthChange,
      onMinimumTrackLengthApply,
      trackColorModesByTrackSet,
      trackOpacityByTrackSet,
      trackLineWidthByTrackSet,
      trackSummaryByTrackSet,
      followedTrackSetId,
      followedTrackId,
      onTrackOrderToggle,
      trackOrderModeByTrackSet,
      trackVisibility,
      onTrackVisibilityToggle,
      onTrackVisibilityAllChange,
      onTrackOpacityChange,
      onTrackLineWidthChange,
      onTrackColorSelect,
      onTrackColorReset,
      onTrackSelectionToggle,
      selectedTrackOrder,
      selectedTrackIds,
      onTrackFollow
    },
    selectedTracksPanel: {
      shouldRender: showSelectedTracksWindow,
      series: selectedTrackSeries,
      totalTimepoints: volumeTimepointCount,
      amplitudeLimits: resolvedAmplitudeLimits,
      timeLimits: resolvedTimeLimits,
      currentTimepoint: selectedIndex,
      channelTintMap,
      smoothing: trackSmoothing,
      onTrackSelectionToggle
    },
    plotSettings: {
      amplitudeExtent,
      amplitudeLimits: resolvedAmplitudeLimits,
      timeExtent,
      timeLimits: resolvedTimeLimits,
      smoothing: trackSmoothing,
      smoothingExtent: TRACK_SMOOTHING_RANGE,
      onAmplitudeLimitsChange,
      onTimeLimitsChange,
      onSmoothingChange,
      onAutoRange,
      onClearSelection
    },
    trackSettings: {
      isFullTrailEnabled: isFullTrackTrailEnabled,
      trailLength: trackTrailLength,
      trailLengthExtent: TRACK_TRAIL_LENGTH_RANGE,
      onFullTrailToggle: onTrackTrailModeChange,
      onTrailLengthChange: onTrackTrailLengthChange
    },
    trackDefaults: {
      opacity: DEFAULT_TRACK_OPACITY,
      lineWidth: DEFAULT_TRACK_LINE_WIDTH
    }
  };
}
