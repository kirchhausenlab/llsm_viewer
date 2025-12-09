import assert from 'node:assert/strict';
import { createRef } from 'react';

import { type ViewerShellContainerProps, useViewerShellProps } from '../src/components/viewers/useViewerShellProps.ts';
import { createDefaultLayerSettings } from '../src/state/layerSettings.ts';
import { DEFAULT_TRACK_LINE_WIDTH, DEFAULT_TRACK_OPACITY } from '../src/hooks/tracks';
import { WINDOW_MARGIN, CONTROL_WINDOW_WIDTH, SELECTED_TRACKS_WINDOW_WIDTH } from '../src/shared/utils/windowLayout.ts';

const noop = () => {};
const noopWithArgs = (..._args: unknown[]) => {};

function createViewerShellContainerProps(
  overrides: Partial<ViewerShellContainerProps> = {}
): ViewerShellContainerProps {
  const baseProps: ViewerShellContainerProps = {
    viewerMode: '3d',
    viewerLayers: [],
    isLoading: false,
    loadProgress: 0,
    loadedCount: 0,
    expectedVolumeCount: 0,
    selectedIndex: 0,
    volumeTimepointCount: 1,
    isPlaying: false,
    playbackDisabled: false,
    playbackLabel: 'Paused',
    fps: 1,
    blendingMode: 'additive',
    sliceIndex: 0,
    maxSliceDepth: 5,
    trackScale: { x: 1, y: 1, z: 1, unit: 'μm', correctAnisotropy: false },
    filteredTracks: [],
    trackVisibility: {},
    trackOpacityByChannel: {},
    trackLineWidthByChannel: {},
    channelTrackColorModes: {},
    channelTrackOffsets: {},
    selectedTrackIds: new Set(),
    followedTrackId: null,
    followedVoxel: null,
    followedTrackChannelId: null,
    activeTrackChannelId: null,
    activeChannelTabId: null,
    trackChannels: [],
    vrChannelPanels: [],
    is3dViewerAvailable: true,
    isVrActive: false,
    isVrRequesting: false,
    resetViewHandler: null,
    isVrPassthroughSupported: false,
    hasParsedTrackData: true,
    orthogonalViewsAvailable: true,
    orthogonalViewsEnabled: true,
    onOrthogonalViewsToggle: noop,
    layoutResetToken: 0,
    controlWindowInitialPosition: { x: 0, y: 0 },
    viewerSettingsWindowInitialPosition: { x: 0, y: 0 },
    layersWindowInitialPosition: { x: 0, y: 0 },
    trackWindowInitialPosition: { x: 0, y: 0 },
    selectedTracksWindowInitialPosition: { x: 0, y: 0 },
    plotSettingsWindowInitialPosition: { x: 0, y: 0 },
    channels: [],
    channelNameMap: new Map(),
    channelVisibility: {},
    channelTintMap: new Map(),
    channelLayersMap: new Map(),
    channelActiveLayer: {},
    layerSettings: {},
    loadedChannelIds: [],
    parsedTracksByChannel: new Map(),
    filteredTracksByChannel: new Map(),
    minimumTrackLength: 0,
    pendingMinimumTrackLength: 0,
    trackLengthBounds: { min: 0, max: 1 },
    trackSummaryByChannel: new Map(),
    trackOrderModeByChannel: {},
    selectedTrackSeries: [],
    resolvedAmplitudeLimits: { min: 0, max: 1 },
    resolvedTimeLimits: { min: 0, max: 1 },
    trackSmoothing: 0,
    amplitudeExtent: { min: 0, max: 1 },
    timeExtent: { min: 0, max: 1 },
    error: null,
    hoveredVolumeVoxel: null,
    onTogglePlayback: noop,
    onTimeIndexChange: noopWithArgs,
    onFpsChange: noopWithArgs,
    onVolumeStepScaleChange: noopWithArgs,
    onRegisterVolumeStepScaleChange: noopWithArgs,
    onRegisterReset: noopWithArgs,
    onTrackSelectionToggle: noopWithArgs,
    onTrackFollowRequest: noopWithArgs,
    onVoxelFollowRequest: noopWithArgs,
    onHoverVoxelChange: noopWithArgs,
    onTrackChannelSelect: noopWithArgs,
    onTrackVisibilityToggle: noopWithArgs,
    onTrackVisibilityAllChange: noopWithArgs,
    onTrackOpacityChange: noopWithArgs,
    onTrackLineWidthChange: noopWithArgs,
    onTrackColorSelect: noopWithArgs,
    onTrackColorReset: noopWithArgs,
    onStopTrackFollow: noopWithArgs,
    onStopVoxelFollow: noopWithArgs,
    onChannelPanelSelect: noopWithArgs,
    onTrackPanelChannelSelect: noopWithArgs,
    onChannelVisibilityToggle: noopWithArgs,
    onChannelReset: noopWithArgs,
    onChannelLayerSelect: noopWithArgs,
    onLayerSelect: noopWithArgs,
    onLayerSoloToggle: noopWithArgs,
    onLayerContrastChange: noopWithArgs,
    onLayerBrightnessChange: noopWithArgs,
    onLayerWindowMinChange: noopWithArgs,
    onLayerWindowMaxChange: noopWithArgs,
    onLayerAutoContrast: noopWithArgs,
    onLayerOffsetChange: noopWithArgs,
    onLayerColorChange: noopWithArgs,
    onLayerRenderStyleToggle: noopWithArgs,
    onLayerSamplingModeToggle: noopWithArgs,
    onLayerInvertToggle: noopWithArgs,
    onRegisterVrSession: noopWithArgs,
    onVrSessionStarted: noop,
    onVrSessionEnded: noop,
    onSliceIndexChange: noopWithArgs,
    onReturnToLauncher: noop,
    onResetWindowLayout: noop,
    helpMenuRef: createRef<HTMLDivElement>(),
    isHelpMenuOpen: false,
    onHelpMenuToggle: noop,
    onToggleViewerMode: noop,
    onVrButtonClick: noop,
    vrButtonDisabled: false,
    vrButtonTitle: 'title',
    vrButtonLabel: 'label',
    renderStyle: 0,
    samplingMode: 'linear',
    onRenderStyleToggle: noop,
    onSamplingModeToggle: noop,
    onBlendingModeToggle: noop,
    onJumpToStart: noop,
    onJumpToEnd: noop,
    onMinimumTrackLengthChange: noopWithArgs,
    onMinimumTrackLengthApply: noop,
    onTrackOrderToggle: noopWithArgs,
    onTrackFollow: noopWithArgs,
    onAmplitudeLimitsChange: noopWithArgs,
    onTimeLimitsChange: noopWithArgs,
    onSmoothingChange: noopWithArgs,
    onAutoRange: noop,
    onClearSelection: noop,
    getLayerDefaultSettings: () => createDefaultLayerSettings()
  };

  return { ...baseProps, ...overrides } as ViewerShellContainerProps;
}

(() => {
  const viewerShellProps = useViewerShellProps(createViewerShellContainerProps());

  assert.strictEqual(viewerShellProps.layout.windowMargin, WINDOW_MARGIN);
  assert.strictEqual(viewerShellProps.layout.controlWindowWidth, CONTROL_WINDOW_WIDTH);
  assert.strictEqual(viewerShellProps.layout.selectedTracksWindowWidth, SELECTED_TRACKS_WINDOW_WIDTH);
  assert.deepStrictEqual(viewerShellProps.trackDefaults, {
    opacity: DEFAULT_TRACK_OPACITY,
    lineWidth: DEFAULT_TRACK_LINE_WIDTH
  });
  assert.ok(viewerShellProps.volumeViewerProps.vr);
})();

(() => {
  const viewerShellProps = useViewerShellProps(
    createViewerShellContainerProps({
      is3dViewerAvailable: false,
      isVrActive: true,
      hasParsedTrackData: true
    })
  );

  assert.strictEqual(viewerShellProps.volumeViewerProps.vr, undefined);
  assert.strictEqual(viewerShellProps.selectedTracksPanel.shouldRender, false);
})();

(() => {
  const onOrthogonalViewsToggle = () => {};
  const onTrackPanelChannelSelect = () => {};
  const props = createViewerShellContainerProps({
    onOrthogonalViewsToggle,
    onTrackPanelChannelSelect,
    vrChannelPanels: [{
      id: 'channel',
      name: 'Channel',
      visible: true,
      activeLayerKey: null,
      layers: []
    }]
  });

  const viewerShellProps = useViewerShellProps(props);

  assert.strictEqual(viewerShellProps.planarSettings.onOrthogonalViewsToggle, onOrthogonalViewsToggle);
  assert.strictEqual(viewerShellProps.tracksPanel.onChannelTabSelect, onTrackPanelChannelSelect);
  assert.deepStrictEqual(viewerShellProps.volumeViewerProps.vr?.channelPanels, props.vrChannelPanels);
})();

console.log('ViewerShellContainer wiring tests passed');
