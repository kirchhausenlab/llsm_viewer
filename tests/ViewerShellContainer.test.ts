import assert from 'node:assert/strict';

import { type ViewerShellContainerProps, useViewerShellProps } from '../src/components/viewers/useViewerShellProps.ts';
import { createDefaultLayerSettings } from '../src/state/layerSettings.ts';
import { DEFAULT_TRACK_LINE_WIDTH, DEFAULT_TRACK_OPACITY } from '../src/hooks/tracks';
import { WINDOW_MARGIN, CONTROL_WINDOW_WIDTH, SELECTED_TRACKS_WINDOW_WIDTH } from '../src/shared/utils/windowLayout.ts';

const noop = () => {};
const noopWithArgs = (..._args: unknown[]) => {};

function createViewerShellContainerProps(): ViewerShellContainerProps {
  return {
    viewerMode: '3d',
    isHelpMenuOpen: false,
    openHelpMenu: noop,
    closeHelpMenu: noop,
    viewerPanels: {
      layers: [],
      loading: {
        isLoading: false,
        loadingProgress: 0,
        loadedVolumes: 0,
        expectedVolumes: 0
      },
      tracks: {
        trackScale: { x: 1, y: 1, z: 1 },
        tracks: [],
        trackVisibility: {},
        trackOpacityByTrackSet: {},
        trackLineWidthByTrackSet: {},
        trackColorModesByTrackSet: {},
        channelTrackOffsets: {},
        selectedTrackIds: new Set(),
        followedTrackId: null,
        followedVoxel: null,
        onTrackSelectionToggle: noopWithArgs,
        onTrackFollowRequest: noopWithArgs,
        onVoxelFollowRequest: noopWithArgs,
        onHoverVoxelChange: noopWithArgs
      },
      canAdvancePlayback: undefined,
      onRegisterReset: noopWithArgs,
      onVolumeStepScaleChange: noopWithArgs,
      onRegisterVolumeStepScaleChange: noopWithArgs
    },
    vr: {
      isVrPassthroughSupported: false,
      trackChannels: [],
      onTrackChannelSelect: noopWithArgs,
      onTrackVisibilityToggle: noopWithArgs,
      onTrackVisibilityAllChange: noopWithArgs,
      onTrackOpacityChange: noopWithArgs,
      onTrackLineWidthChange: noopWithArgs,
      onTrackColorSelect: noopWithArgs,
      onTrackColorReset: noopWithArgs,
      onStopTrackFollow: noopWithArgs,
      channelPanels: [],
      onChannelPanelSelect: noopWithArgs,
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
      onVrSessionEnded: noop
    },
    topMenu: {
      onReturnToLauncher: noop,
      onResetLayout: noop,
      followedTrackSetId: null,
      followedTrackId: null,
      followedVoxel: null,
      onStopTrackFollow: noopWithArgs,
      onStopVoxelFollow: noop,
      hoveredVoxel: null
    },
    layout: {
      resetToken: 0,
      controlWindowInitialPosition: { x: 0, y: 0 },
      viewerSettingsWindowInitialPosition: { x: 0, y: 0 },
      layersWindowInitialPosition: { x: 0, y: 0 },
      paintbrushWindowInitialPosition: { x: 0, y: 0 },
      trackWindowInitialPosition: { x: 0, y: 0 },
      selectedTracksWindowInitialPosition: { x: 0, y: 0 },
      plotSettingsWindowInitialPosition: { x: 0, y: 0 },
      trackSettingsWindowInitialPosition: { x: 0, y: 0 }
    },
    modeControls: {
      is3dModeAvailable: true,
      isVrActive: false,
      isVrRequesting: false,
      resetViewHandler: null,
      onToggleViewerMode: noop,
      onVrButtonClick: noop,
      vrButtonDisabled: false,
      vrButtonTitle: 'title',
      vrButtonLabel: 'label',
      renderStyle: 0,
      samplingMode: 'linear',
      onRenderStyleToggle: noop,
      onSamplingModeToggle: noop,
      blendingMode: 'additive',
      onBlendingModeToggle: noop
    },
    playbackControls: {
      fps: 1,
      onFpsChange: noopWithArgs,
      volumeTimepointCount: 1,
      sliceIndex: 0,
      maxSliceDepth: 5,
      onSliceIndexChange: noopWithArgs,
      isPlaying: false,
      playbackLabel: 'Paused',
      selectedIndex: 0,
      onTimeIndexChange: noopWithArgs,
      playbackDisabled: false,
      onTogglePlayback: noop,
      onJumpToStart: noop,
      onJumpToEnd: noop,
      error: null,
      onStartRecording: noop,
      onStopRecording: noop,
      isRecording: false,
      canRecord: true
    },
    channelsPanel: {
      isPlaying: false,
      loadedChannelIds: [],
      channelNameMap: new Map(),
      channelVisibility: {},
      channelTintMap: new Map(),
      activeChannelId: null,
      onChannelTabSelect: noopWithArgs,
      onChannelVisibilityToggle: noopWithArgs,
      channelLayersMap: new Map(),
      layerVolumesByKey: {},
      layerBrickAtlasesByKey: {},
      channelActiveLayer: {},
      layerSettings: {},
      getLayerDefaultSettings: (_layerKey: string) => createDefaultLayerSettings(),
      onChannelLayerSelect: noopWithArgs,
      onChannelReset: noopWithArgs,
      onLayerWindowMinChange: noopWithArgs,
      onLayerWindowMaxChange: noopWithArgs,
      onLayerBrightnessChange: noopWithArgs,
      onLayerContrastChange: noopWithArgs,
      onLayerAutoContrast: noopWithArgs,
      onLayerOffsetChange: noopWithArgs,
      onLayerColorChange: noopWithArgs,
      onLayerInvertToggle: noopWithArgs
    },
    tracksPanel: {
      trackSets: [],
      activeTrackSetId: null,
      onTrackSetTabSelect: noopWithArgs,
      parsedTracksByTrackSet: new Map(),
      filteredTracksByTrackSet: new Map(),
      minimumTrackLength: 0,
      pendingMinimumTrackLength: 0,
      trackLengthBounds: { min: 0, max: 1 },
      onMinimumTrackLengthChange: noopWithArgs,
      onMinimumTrackLengthApply: noop,
      trackColorModesByTrackSet: {},
      trackOpacityByTrackSet: {},
      trackLineWidthByTrackSet: {},
      trackSummaryByTrackSet: new Map(),
      followedTrackSetId: null,
      followedTrackId: null,
      onTrackOrderToggle: noopWithArgs,
      trackOrderModeByTrackSet: {},
      trackVisibility: {},
      onTrackVisibilityToggle: noopWithArgs,
      onTrackVisibilityAllChange: noopWithArgs,
      onTrackOpacityChange: noopWithArgs,
      onTrackLineWidthChange: noopWithArgs,
      onTrackColorSelect: noopWithArgs,
      onTrackColorReset: noopWithArgs,
      onTrackSelectionToggle: noopWithArgs,
      selectedTrackOrder: [],
      selectedTrackIds: new Set(),
      onTrackFollow: noopWithArgs,
      hasParsedTrackData: true
    },
    selectedTracksPanel: {
      series: [],
      totalTimepoints: 1,
      amplitudeLimits: { min: 0, max: 1 },
      timeLimits: { min: 0, max: 1 },
      currentTimepoint: 0,
      channelTintMap: new Map(),
      smoothing: 0,
      onTrackSelectionToggle: noopWithArgs
    },
    plotSettings: {
      amplitudeExtent: { min: 0, max: 1 },
      amplitudeLimits: { min: 0, max: 1 },
      timeExtent: { min: 0, max: 1 },
      timeLimits: { min: 0, max: 1 },
      smoothing: 0,
      onAmplitudeLimitsChange: noopWithArgs,
      onTimeLimitsChange: noopWithArgs,
      onSmoothingChange: noopWithArgs,
      onAutoRange: noop,
      onClearSelection: noop
    },
    trackSettings: {
      isFullTrailEnabled: true,
      trailLength: 3,
      onFullTrailToggle: noopWithArgs,
      onTrailLengthChange: noopWithArgs
    }
  };
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
  const props = createViewerShellContainerProps();
  props.modeControls.is3dModeAvailable = false;
  props.modeControls.isVrActive = true;
  props.tracksPanel.hasParsedTrackData = true;

  const viewerShellProps = useViewerShellProps(props);

  assert.strictEqual(viewerShellProps.volumeViewerProps.vr, undefined);
  assert.strictEqual(viewerShellProps.selectedTracksPanel.shouldRender, false);
})();

(() => {
  const onTrackSetTabSelect = () => {};
  const props = createViewerShellContainerProps();
  props.tracksPanel.onTrackSetTabSelect = onTrackSetTabSelect;
  const diagnostics = {
    capturedAt: '2026-02-13T00:00:00.000Z',
    residency: {
      cachedVolumes: 1,
      inFlightVolumes: 0,
      cachedChunks: 2,
      inFlightChunks: 0,
      chunkBytes: 2048
    },
    cachePressure: {
      volume: 0.2,
      chunk: 0.4
    },
    missRates: {
      volume: 0.1,
      chunk: 0.3
    },
    activePrefetchRequests: [],
    stats: {} as any
  };
  props.viewerPanels.runtimeDiagnostics = diagnostics as any;
  props.vr.channelPanels = [{
    id: 'channel',
    name: 'Channel',
    visible: true,
    activeLayerKey: null,
    layers: []
  }];

  const viewerShellProps = useViewerShellProps(props);

  assert.strictEqual(viewerShellProps.tracksPanel.onTrackSetTabSelect, onTrackSetTabSelect);
  assert.deepStrictEqual(viewerShellProps.volumeViewerProps.vr?.channelPanels, props.vr.channelPanels);
  assert.strictEqual(viewerShellProps.volumeViewerProps.runtimeDiagnostics, diagnostics);
})();

console.log('ViewerShellContainer wiring tests passed');
