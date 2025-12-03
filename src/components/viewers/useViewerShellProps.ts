import { type RefObject } from 'react';

import {
  CONTROL_WINDOW_WIDTH,
  SELECTED_TRACKS_WINDOW_WIDTH,
  WINDOW_MARGIN
} from '../../shared/utils/windowLayout';
import {
  DEFAULT_TRACK_LINE_WIDTH,
  DEFAULT_TRACK_OPACITY,
  TRACK_SMOOTHING_RANGE
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
  fps: number;
  blendingMode: ViewerShellProps['modeControls']['blendingMode'];
  sliceIndex: number;
  maxSliceDepth: number;
  trackScale: ViewerShellProps['volumeViewerProps']['trackScale'];
  filteredTracks: TrackDefinition[];
  trackVisibility: ViewerShellProps['volumeViewerProps']['trackVisibility'];
  trackOpacityByChannel: ViewerShellProps['volumeViewerProps']['trackOpacityByChannel'];
  trackLineWidthByChannel: ViewerShellProps['volumeViewerProps']['trackLineWidthByChannel'];
  channelTrackColorModes: ViewerShellProps['volumeViewerProps']['channelTrackColorModes'];
  channelTrackOffsets: ViewerShellProps['volumeViewerProps']['channelTrackOffsets'];
  selectedTrackIds: ViewerShellProps['volumeViewerProps']['selectedTrackIds'];
  followedTrackId: ViewerShellProps['volumeViewerProps']['followedTrackId'];
  followedTrackChannelId: ViewerShellProps['topMenu']['followedTrackChannelId'];
  activeTrackChannelId: ViewerShellProps['tracksPanel']['activeChannelId'];
  activeChannelTabId: ViewerShellProps['channelsPanel']['activeChannelId'];
  trackChannels: VolumeViewerVrProps['trackChannels'];
  vrChannelPanels: VolumeViewerVrProps['channelPanels'];
  is3dViewerAvailable: ViewerShellProps['modeControls']['is3dModeAvailable'];
  isVrActive: ViewerShellProps['modeControls']['isVrActive'];
  isVrRequesting: ViewerShellProps['modeControls']['isVrRequesting'];
  resetViewHandler: ViewerShellProps['modeControls']['resetViewHandler'];
  isVrPassthroughSupported: VolumeViewerVrProps['isVrPassthroughSupported'];
  hasParsedTrackData: boolean;
  orthogonalViewsAvailable: ViewerShellProps['planarSettings']['orthogonalViewsAvailable'];
  orthogonalViewsEnabled: ViewerShellProps['planarSettings']['orthogonalViewsEnabled'];
  onOrthogonalViewsToggle: ViewerShellProps['planarSettings']['onOrthogonalViewsToggle'];
  layoutResetToken: ViewerShellProps['layout']['resetToken'];
  controlWindowInitialPosition: ViewerShellProps['layout']['controlWindowInitialPosition'];
  viewerSettingsWindowInitialPosition: ViewerShellProps['layout']['viewerSettingsWindowInitialPosition'];
  layersWindowInitialPosition: ViewerShellProps['layout']['layersWindowInitialPosition'];
  trackWindowInitialPosition: ViewerShellProps['layout']['trackWindowInitialPosition'];
  selectedTracksWindowInitialPosition: ViewerShellProps['layout']['selectedTracksWindowInitialPosition'];
  plotSettingsWindowInitialPosition: ViewerShellProps['layout']['plotSettingsWindowInitialPosition'];
  channels: ChannelSource[];
  channelNameMap: ViewerShellProps['channelsPanel']['channelNameMap'];
  channelVisibility: ViewerShellProps['channelsPanel']['channelVisibility'];
  channelTintMap: ViewerShellProps['channelsPanel']['channelTintMap'];
  channelLayersMap: ViewerShellProps['channelsPanel']['channelLayersMap'];
  channelActiveLayer: ViewerShellProps['channelsPanel']['channelActiveLayer'];
  layerSettings: ViewerShellProps['channelsPanel']['layerSettings'];
  loadedChannelIds: ViewerShellProps['channelsPanel']['loadedChannelIds'];
  parsedTracksByChannel: ViewerShellProps['tracksPanel']['parsedTracksByChannel'];
  filteredTracksByChannel: ViewerShellProps['tracksPanel']['filteredTracksByChannel'];
  minimumTrackLength: ViewerShellProps['tracksPanel']['minimumTrackLength'];
  pendingMinimumTrackLength: ViewerShellProps['tracksPanel']['pendingMinimumTrackLength'];
  trackLengthBounds: ViewerShellProps['tracksPanel']['trackLengthBounds'];
  trackSummaryByChannel: ViewerShellProps['tracksPanel']['trackSummaryByChannel'];
  trackOrderModeByChannel: ViewerShellProps['tracksPanel']['trackOrderModeByChannel'];
  selectedTrackSeries: ViewerShellProps['selectedTracksPanel']['series'];
  resolvedAmplitudeLimits: NumericRange;
  resolvedTimeLimits: NumericRange;
  trackSmoothing: number;
  amplitudeExtent: NumericRange;
  timeExtent: NumericRange;
  error: ViewerShellProps['playbackControls']['error'];
  hoveredVolumeVoxel: HoveredVoxelInfo | null;
  onTogglePlayback: ViewerShellProps['volumeViewerProps']['onTogglePlayback'];
  onTimeIndexChange: ViewerShellProps['volumeViewerProps']['onTimeIndexChange'];
  onFpsChange: ViewerShellProps['volumeViewerProps']['onFpsChange'];
  onVolumeStepScaleChange?: ViewerShellProps['volumeViewerProps']['onVolumeStepScaleChange'];
  onRegisterVolumeStepScaleChange?: ViewerShellProps['volumeViewerProps']['onRegisterVolumeStepScaleChange'];
  onRegisterReset: ViewerShellProps['volumeViewerProps']['onRegisterReset'];
  onTrackSelectionToggle: ViewerShellProps['volumeViewerProps']['onTrackSelectionToggle'];
  onTrackFollowRequest: ViewerShellProps['volumeViewerProps']['onTrackFollowRequest'];
  onHoverVoxelChange?: ViewerShellProps['volumeViewerProps']['onHoverVoxelChange'];
  onTrackChannelSelect: VolumeViewerVrProps['onTrackChannelSelect'];
  onTrackVisibilityToggle: VolumeViewerVrProps['onTrackVisibilityToggle'];
  onTrackVisibilityAllChange: VolumeViewerVrProps['onTrackVisibilityAllChange'];
  onTrackOpacityChange: VolumeViewerVrProps['onTrackOpacityChange'];
  onTrackLineWidthChange: VolumeViewerVrProps['onTrackLineWidthChange'];
  onTrackColorSelect: VolumeViewerVrProps['onTrackColorSelect'];
  onTrackColorReset: VolumeViewerVrProps['onTrackColorReset'];
  onStopTrackFollow: VolumeViewerVrProps['onStopTrackFollow'];
  onChannelPanelSelect: VolumeViewerVrProps['onChannelPanelSelect'];
  onTrackPanelChannelSelect: ViewerShellProps['tracksPanel']['onChannelTabSelect'];
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
  helpMenuRef: RefObject<HTMLDivElement>;
  isHelpMenuOpen: boolean;
  onHelpMenuToggle: ViewerShellProps['topMenu']['onHelpMenuToggle'];
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
  fps,
  blendingMode,
  sliceIndex,
  maxSliceDepth,
  trackScale,
  filteredTracks,
  trackVisibility,
  trackOpacityByChannel,
  trackLineWidthByChannel,
  channelTrackColorModes,
  channelTrackOffsets,
  selectedTrackIds,
  followedTrackId,
  followedTrackChannelId,
  activeTrackChannelId,
  activeChannelTabId,
  trackChannels,
  vrChannelPanels,
  is3dViewerAvailable,
  isVrActive,
  isVrRequesting,
  resetViewHandler,
  isVrPassthroughSupported,
  hasParsedTrackData,
  orthogonalViewsAvailable,
  orthogonalViewsEnabled,
  onOrthogonalViewsToggle,
  layoutResetToken,
  controlWindowInitialPosition,
  viewerSettingsWindowInitialPosition,
  layersWindowInitialPosition,
  trackWindowInitialPosition,
  selectedTracksWindowInitialPosition,
  plotSettingsWindowInitialPosition,
  channels,
  channelNameMap,
  channelVisibility,
  channelTintMap,
  channelLayersMap,
  channelActiveLayer,
  layerSettings,
  loadedChannelIds,
  parsedTracksByChannel,
  filteredTracksByChannel,
  minimumTrackLength,
  pendingMinimumTrackLength,
  trackLengthBounds,
  trackSummaryByChannel,
  trackOrderModeByChannel,
  selectedTrackSeries,
  resolvedAmplitudeLimits,
  resolvedTimeLimits,
  trackSmoothing,
  amplitudeExtent,
  timeExtent,
  error,
  hoveredVolumeVoxel,
  onTogglePlayback,
  onTimeIndexChange,
  onFpsChange,
  onVolumeStepScaleChange,
  onRegisterVolumeStepScaleChange,
  onRegisterReset,
  onTrackSelectionToggle,
  onTrackFollowRequest,
  onHoverVoxelChange,
  onTrackChannelSelect,
  onTrackVisibilityToggle,
  onTrackVisibilityAllChange,
  onTrackOpacityChange,
  onTrackLineWidthChange,
  onTrackColorSelect,
  onTrackColorReset,
  onStopTrackFollow,
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
  helpMenuRef,
  isHelpMenuOpen,
  onHelpMenuToggle,
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
    onFpsChange,
    onVolumeStepScaleChange,
    onRegisterVolumeStepScaleChange,
    onRegisterReset,
    trackScale,
    tracks: filteredTracks,
    trackVisibility,
    trackOpacityByChannel,
    trackLineWidthByChannel,
    channelTrackColorModes,
    channelTrackOffsets,
    selectedTrackIds,
    followedTrackId,
    onTrackSelectionToggle,
    onTrackFollowRequest,
    onHoverVoxelChange,
    vr: is3dViewerAvailable
      ? {
          isVrPassthroughSupported,
          trackChannels,
          activeTrackChannelId,
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
    trackOpacityByChannel,
    trackLineWidthByChannel,
    channelTrackColorModes,
    channelTrackOffsets,
    followedTrackId,
    selectedTrackIds,
    onTrackSelectionToggle,
    onTrackFollowRequest,
    onHoverVoxelChange,
    orthogonalViewsEnabled: orthogonalViewsAvailable && orthogonalViewsEnabled
  };

  const showSelectedTracksWindow = !isVrActive && hasParsedTrackData;

  return {
    viewerMode,
    volumeViewerProps,
    planarViewerProps,
    planarSettings: {
      orthogonalViewsAvailable,
      orthogonalViewsEnabled,
      onOrthogonalViewsToggle
    },
    topMenu: {
      onReturnToLauncher,
      onResetLayout: onResetWindowLayout,
      helpMenuRef,
      isHelpMenuOpen,
      onHelpMenuToggle,
      hoveredVoxel: hoveredVolumeVoxel,
      followedTrackChannelId,
      followedTrackId,
      onStopTrackFollow
    },
    layout: {
      windowMargin: WINDOW_MARGIN,
      controlWindowWidth: CONTROL_WINDOW_WIDTH,
      selectedTracksWindowWidth: SELECTED_TRACKS_WINDOW_WIDTH,
      resetToken: layoutResetToken,
      controlWindowInitialPosition,
      viewerSettingsWindowInitialPosition,
      layersWindowInitialPosition,
      trackWindowInitialPosition,
      selectedTracksWindowInitialPosition,
      plotSettingsWindowInitialPosition
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
      selectedIndex,
      onTimeIndexChange,
      playbackDisabled,
      onTogglePlayback,
      onJumpToStart,
      onJumpToEnd,
      error
    },
    channelsPanel: {
      loadedChannelIds,
      channelNameMap,
      channelVisibility,
      channelTintMap,
      activeChannelId: activeChannelTabId,
      onChannelTabSelect: onChannelPanelSelect,
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
    },
    tracksPanel: {
      channels,
      channelNameMap,
      activeChannelId: activeTrackChannelId,
      onChannelTabSelect: onTrackPanelChannelSelect,
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
      followedTrackChannelId,
      followedTrackId,
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
    trackDefaults: {
      opacity: DEFAULT_TRACK_OPACITY,
      lineWidth: DEFAULT_TRACK_LINE_WIDTH
    }
  };
}
