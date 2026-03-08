import { useMemo, useState } from 'react';

import VolumeViewer from './VolumeViewer';
import ChannelsPanel from './viewer-shell/ChannelsPanel';
import NavigationHelpWindow, { computeNavigationHelpInitialPosition } from './viewer-shell/NavigationHelpWindow';
import PaintbrushWindow from './viewer-shell/PaintbrushWindow';
import PlotSettingsPanel from './viewer-shell/PlotSettingsPanel';
import PropsWindow from './viewer-shell/PropsWindow';
import TopMenu from './viewer-shell/TopMenu';
import TracksPanel from './viewer-shell/TracksPanel';
import ViewerSettingsWindow from './viewer-shell/ViewerSettingsWindow';
import { useViewerModeControls } from './viewer-shell/hooks/useViewerModeControls';
import { useViewerPaintbrushIntegration } from './viewer-shell/hooks/useViewerPaintbrushIntegration';
import { useViewerPanelWindows } from './viewer-shell/hooks/useViewerPanelWindows';
import { useViewerPropsState } from './viewer-shell/hooks/useViewerPropsState';
import { useViewerRecording } from './viewer-shell/hooks/useViewerRecording';
import type { ViewerShellProps } from './viewer-shell/types';
import { formatIntensityValue } from '../../shared/utils/intensityFormatting';

const NAVIGATION_HELP_WINDOW_WIDTH = 420;

function ViewerShell({
  viewerMode,
  volumeViewerProps,
  topMenu,
  layout,
  modeControls,
  playbackControls,
  channelsPanel,
  tracksPanel,
  selectedTracksPanel,
  plotSettings,
  trackSettings,
  trackDefaults
}: ViewerShellProps) {
  const {
    windowMargin,
    controlWindowWidth,
    selectedTracksWindowWidth,
    resetToken,
    viewerSettingsWindowInitialPosition,
    layersWindowInitialPosition,
    paintbrushWindowInitialPosition,
    propsWindowInitialPosition,
    trackWindowInitialPosition,
    selectedTracksWindowInitialPosition,
    plotSettingsWindowInitialPosition,
    trackSettingsWindowInitialPosition
  } = layout;
  const { loadedChannelIds, channelLayersMap } = channelsPanel;

  const hasVolumeData = loadedChannelIds.some((channelId) =>
    (channelLayersMap.get(channelId) ?? []).some((layer) => layer.volumeCount > 0)
  );
  const hasTrackData = tracksPanel.trackSets.some(
    (trackSet) => (tracksPanel.trackHeadersByTrackSet.get(trackSet.id)?.totalTracks ?? 0) > 0
  );
  const navigationHelpInitialPosition = useMemo(
    () =>
      computeNavigationHelpInitialPosition({
        windowMargin,
        windowWidth: NAVIGATION_HELP_WINDOW_WIDTH
      }),
    [windowMargin]
  );
  const { isHelpMenuOpen, closeHelpMenu } = topMenu;
  const hoverCoordinateDigits = useMemo(() => {
    let maxWidth = 1;
    let maxHeight = 1;
    let maxDepth = 1;

    for (const channelLayers of channelLayersMap.values()) {
      for (const layer of channelLayers) {
        maxWidth = Math.max(maxWidth, layer.width);
        maxHeight = Math.max(maxHeight, layer.height);
        maxDepth = Math.max(maxDepth, layer.depth);
      }
    }

    return {
      x: Math.max(1, String(Math.max(0, maxWidth - 1)).length),
      y: Math.max(1, String(Math.max(0, maxHeight - 1)).length),
      z: Math.max(1, String(Math.max(0, maxDepth - 1)).length)
    };
  }, [channelLayersMap]);
  const hoverIntensityValueDigits = useMemo(() => {
    let maxDigits = 1;

    for (const channelLayers of channelLayersMap.values()) {
      for (const layer of channelLayers) {
        const minDigits = formatIntensityValue(layer.min, layer.dataType).length;
        const maxValueDigits = formatIntensityValue(layer.max, layer.dataType).length;
        const componentPrefixDigits = layer.channels > 1 ? `C${layer.channels} `.length : 0;
        maxDigits = Math.max(maxDigits, componentPrefixDigits + minDigits, componentPrefixDigits + maxValueDigits);
      }
    }

    return maxDigits;
  }, [channelLayersMap]);
  const volumeDimensions = useMemo(() => {
    let maxWidth = 1;
    let maxHeight = 1;
    let maxDepth = 1;

    for (const channelLayers of channelLayersMap.values()) {
      for (const layer of channelLayers) {
        maxWidth = Math.max(maxWidth, layer.width);
        maxHeight = Math.max(maxHeight, layer.height);
        maxDepth = Math.max(maxDepth, layer.depth);
      }
    }

    return {
      width: maxWidth,
      height: maxHeight,
      depth: maxDepth
    };
  }, [channelLayersMap]);
  const [renderingQuality, setRenderingQuality] = useState(1.1);

  const handleRenderingQualityChange = (value: number) => {
    setRenderingQuality(value);
    volumeViewerProps.onVolumeStepScaleChange?.(value);
  };

  const {
    playbackControlsWithRecording,
    registerVolumeCaptureTarget
  } = useViewerRecording({
    viewerMode,
    playbackControls
  });
  const playbackState = playbackControlsWithRecording;
  const totalViewerPropTimepoints = Math.max(1, playbackState.volumeTimepointCount);
  const currentViewerPropTimepoint = Math.min(
    totalViewerPropTimepoints,
    Math.max(1, playbackState.selectedIndex + 1)
  );

  const {
    paintbrushController,
    volumeViewerProps: volumeViewerWithCaptureTarget,
    handleSavePainting
  } = useViewerPaintbrushIntegration({
    volumeViewerProps,
    resetToken,
    onVolumeCaptureTarget: registerVolumeCaptureTarget
  });

  const {
    isChannelsWindowOpen,
    openChannelsWindow,
    closeChannelsWindow,
    isPropsWindowOpen,
    openPropsWindow,
    closePropsWindow,
    isTracksWindowOpen,
    openTracksWindow,
    closeTracksWindow,
    isViewerSettingsOpen,
    openViewerSettings,
    closeViewerSettings,
    isAmplitudePlotOpen,
    openAmplitudePlot,
    closeAmplitudePlot,
    isPlotSettingsOpen,
    closePlotSettings,
    isTrackSettingsOpen,
    openTrackSettings,
    closeTrackSettings,
    isPaintbrushOpen,
    openPaintbrush,
    closePaintbrush,
    isDiagnosticsWindowOpen,
    openDiagnosticsWindow,
    closeDiagnosticsWindow
  } = useViewerPanelWindows({
    resetToken,
    hasTrackData,
    canShowPlotSettings: selectedTracksPanel.shouldRender
  });
  const propsController = useViewerPropsState({
    volumeDimensions,
    totalTimepoints: totalViewerPropTimepoints,
    voxelResolution: volumeViewerProps.voxelResolution ?? null,
  });

  const showRenderingQualityControl = modeControls.is3dModeAvailable && modeControls.samplingMode === 'linear';

  const { modeToggle, viewerSettings } = useViewerModeControls({
    modeControls,
    showRenderingQualityControl,
    renderingQuality,
    onRenderingQualityChange: handleRenderingQualityChange,
    hasVolumeData
  });

  const topMenuProps = useMemo(
    () => ({
      ...topMenu,
      onOpenChannelsWindow: openChannelsWindow,
      onOpenPropsWindow: openPropsWindow,
      onOpenPaintbrush: openPaintbrush,
      onOpenRenderSettingsWindow: openViewerSettings,
      onOpenTracksWindow: openTracksWindow,
      onOpenAmplitudePlotWindow: openAmplitudePlot,
      onOpenTrackSettingsWindow: openTrackSettings,
      onOpenDiagnosticsWindow: openDiagnosticsWindow,
      is3dModeAvailable: modeToggle.is3dModeAvailable,
      resetViewHandler: modeToggle.resetViewHandler,
      onVrButtonClick: modeToggle.onVrButtonClick,
      vrButtonDisabled: modeToggle.vrButtonDisabled,
      vrButtonTitle: modeToggle.vrButtonTitle,
      vrButtonLabel: modeToggle.vrButtonLabel,
      volumeTimepointCount: playbackState.volumeTimepointCount,
      isPlaying: playbackState.isPlaying,
      selectedIndex: playbackState.selectedIndex,
      onTimeIndexChange: playbackState.onTimeIndexChange,
      playbackDisabled: playbackState.playbackDisabled,
      onTogglePlayback: playbackState.onTogglePlayback,
      zSliderValue: playbackState.zSliderValue,
      zSliderMax: playbackState.zSliderMax,
      onZSliderChange: playbackState.onZSliderChange,
      loadedChannelIds: channelsPanel.loadedChannelIds,
      channelNameMap: channelsPanel.channelNameMap,
      channelVisibility: channelsPanel.channelVisibility,
      channelTintMap: channelsPanel.channelTintMap,
      activeChannelId: channelsPanel.activeChannelId,
      onChannelTabSelect: channelsPanel.onChannelTabSelect,
      onChannelVisibilityToggle: channelsPanel.onChannelVisibilityToggle,
      hoverCoordinateDigits,
      hoverIntensityValueDigits
    }),
    [
      channelsPanel,
      hoverCoordinateDigits,
      hoverIntensityValueDigits,
      modeToggle,
      openAmplitudePlot,
      openChannelsWindow,
      openDiagnosticsWindow,
      openPaintbrush,
      openPropsWindow,
      openTrackSettings,
      openTracksWindow,
      openViewerSettings,
      playbackState,
      topMenu
    ]
  );
  const volumeViewerPropsWithViewerProps = useMemo(
    () => ({
      ...volumeViewerWithCaptureTarget,
      viewerPropsConfig: {
        props: propsController.props,
        selectedPropId: propsController.selectedPropId,
        isEditing: isPropsWindowOpen,
        currentTimepoint: currentViewerPropTimepoint,
        totalTimepoints: totalViewerPropTimepoints,
        temporalResolution: volumeViewerProps.temporalResolution ?? null,
        voxelResolution: volumeViewerProps.voxelResolution ?? null,
        onSelectProp: propsController.selectProp,
        onUpdateScreenPosition: propsController.updateScreenPosition,
        onUpdateWorldPosition: propsController.updateWorldPosition,
      }
    }),
    [
      isPropsWindowOpen,
      propsController.props,
      propsController.selectProp,
      propsController.selectedPropId,
      propsController.updateScreenPosition,
      propsController.updateWorldPosition,
      currentViewerPropTimepoint,
      totalViewerPropTimepoints,
      volumeViewerProps.temporalResolution,
      volumeViewerWithCaptureTarget
    ]
  );

  return (
    <div className="app">
      <main className="viewer">
        <VolumeViewer
          {...volumeViewerPropsWithViewerProps}
          isDiagnosticsWindowOpen={isDiagnosticsWindowOpen}
          onCloseDiagnosticsWindow={closeDiagnosticsWindow}
          windowResetSignal={resetToken}
        />
      </main>

      <TopMenu {...topMenuProps} />

      <NavigationHelpWindow
        isOpen={isHelpMenuOpen}
        onClose={closeHelpMenu}
        initialPosition={navigationHelpInitialPosition}
        windowMargin={windowMargin}
        width={NAVIGATION_HELP_WINDOW_WIDTH}
        resetSignal={resetToken}
      />

      {isPaintbrushOpen ? (
        <PaintbrushWindow
          initialPosition={paintbrushWindowInitialPosition}
          windowMargin={windowMargin}
          controlWindowWidth={controlWindowWidth}
          resetSignal={resetToken}
          enabled={paintbrushController.enabled}
          overlayVisible={paintbrushController.overlayVisible}
          mode={paintbrushController.mode}
          radius={paintbrushController.radius}
          color={paintbrushController.color}
          labelCount={paintbrushController.labelCount}
          canUndo={paintbrushController.canUndo}
          canRedo={paintbrushController.canRedo}
          onEnabledChange={paintbrushController.setEnabled}
          onOverlayVisibleChange={paintbrushController.setOverlayVisible}
          onModeChange={paintbrushController.setMode}
          onRadiusChange={paintbrushController.setRadius}
          onColorChange={paintbrushController.setColor}
          onRandomColor={paintbrushController.pickRandomUnusedColor}
          onUndo={paintbrushController.undo}
          onRedo={paintbrushController.redo}
          onClear={paintbrushController.clear}
          onSave={handleSavePainting}
          onClose={closePaintbrush}
        />
      ) : null}

      <PropsWindow
        layout={{
          windowMargin,
          propsWindowInitialPosition,
          resetToken
        }}
        isOpen={isPropsWindowOpen}
        onClose={closePropsWindow}
        props={propsController.props}
        selectedPropId={propsController.selectedPropId}
        volumeDimensions={volumeDimensions}
        currentTimepoint={currentViewerPropTimepoint}
        totalTimepoints={totalViewerPropTimepoints}
        temporalResolution={volumeViewerProps.temporalResolution ?? null}
        voxelResolution={volumeViewerProps.voxelResolution ?? null}
        onCreateProp={propsController.createProp}
        onSelectProp={propsController.selectProp}
        onUpdateProp={propsController.updateProp}
        onSetAllVisible={propsController.setAllVisible}
        onClearProps={propsController.clearProps}
        onDeleteProp={propsController.deleteProp}
      />

      <ViewerSettingsWindow
        layout={{
          windowMargin,
          controlWindowWidth,
          resetToken,
          viewerSettingsWindowInitialPosition
        }}
        modeToggle={modeToggle}
        playbackControls={playbackState}
        viewerSettings={viewerSettings}
        isOpen={isViewerSettingsOpen}
        onClose={closeViewerSettings}
        renderingQuality={renderingQuality}
        onRenderingQualityChange={handleRenderingQualityChange}
      />

      <ChannelsPanel
        layout={{ windowMargin, controlWindowWidth, layersWindowInitialPosition, resetToken }}
        isOpen={isChannelsWindowOpen}
        onClose={closeChannelsWindow}
        {...channelsPanel}
      />

      <TracksPanel
        layout={{
          windowMargin,
          controlWindowWidth,
          trackWindowInitialPosition,
          trackSettingsWindowInitialPosition,
          resetToken
        }}
        isOpen={isTracksWindowOpen}
        onClose={closeTracksWindow}
        hasTrackData={hasTrackData}
        trackDefaults={trackDefaults}
        trackSettings={trackSettings}
        isTrackSettingsOpen={isTrackSettingsOpen}
        onCloseTrackSettings={closeTrackSettings}
        {...tracksPanel}
      />

      <PlotSettingsPanel
        layout={{
          windowMargin,
          controlWindowWidth,
          selectedTracksWindowWidth,
          selectedTracksWindowInitialPosition,
          plotSettingsWindowInitialPosition,
          resetToken
        }}
        selectedTracksPanel={selectedTracksPanel}
        plotSettings={plotSettings}
        isVrActive={modeControls.isVrActive}
        isPlotWindowOpen={isAmplitudePlotOpen}
        onClosePlotWindow={closeAmplitudePlot}
        isPlotSettingsOpen={isPlotSettingsOpen}
        onClosePlotSettings={closePlotSettings}
      />
    </div>
  );
}

export type { ViewerShellProps } from './viewer-shell/types';
export default ViewerShell;
