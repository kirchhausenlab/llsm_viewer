import { useMemo, useState } from 'react';

import VolumeViewer from './VolumeViewer';
import ChannelsPanel from './viewer-shell/ChannelsPanel';
import NavigationHelpWindow, { computeNavigationHelpInitialPosition } from './viewer-shell/NavigationHelpWindow';
import PaintbrushWindow from './viewer-shell/PaintbrushWindow';
import PlaybackControlsPanel from './viewer-shell/PlaybackControlsPanel';
import PlotSettingsPanel from './viewer-shell/PlotSettingsPanel';
import TopMenu from './viewer-shell/TopMenu';
import TracksPanel from './viewer-shell/TracksPanel';
import { useViewerModeControls } from './viewer-shell/hooks/useViewerModeControls';
import { useViewerPaintbrushIntegration } from './viewer-shell/hooks/useViewerPaintbrushIntegration';
import { useViewerPanelWindows } from './viewer-shell/hooks/useViewerPanelWindows';
import { useViewerPlaybackControls } from './viewer-shell/hooks/useViewerPlaybackControls';
import { useViewerRecording } from './viewer-shell/hooks/useViewerRecording';
import type { ViewerShellProps } from './viewer-shell/types';

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
    controlWindowInitialPosition,
    viewerSettingsWindowInitialPosition,
    layersWindowInitialPosition,
    paintbrushWindowInitialPosition,
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
    (trackSet) => (tracksPanel.parsedTracksByTrackSet.get(trackSet.id)?.length ?? 0) > 0
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
    isViewerSettingsOpen,
    toggleViewerSettings,
    closeViewerSettings,
    isPlotSettingsOpen,
    togglePlotSettings,
    closePlotSettings,
    isTrackSettingsOpen,
    toggleTrackSettings,
    closeTrackSettings,
    isPaintbrushOpen,
    openPaintbrush,
    closePaintbrush
  } = useViewerPanelWindows({
    resetToken,
    hasTrackData,
    canShowPlotSettings: selectedTracksPanel.shouldRender
  });

  const showRenderingQualityControl = modeControls.is3dModeAvailable && modeControls.samplingMode === 'linear';

  const { modeToggle, viewerSettings } = useViewerModeControls({
    modeControls,
    showRenderingQualityControl,
    renderingQuality,
    onRenderingQualityChange: handleRenderingQualityChange,
    hasVolumeData
  });

  const playbackState = useViewerPlaybackControls({ playbackControls: playbackControlsWithRecording });

  const topMenuProps = useMemo(
    () => ({ ...topMenu, onOpenPaintbrush: openPaintbrush }),
    [openPaintbrush, topMenu]
  );

  return (
    <div className="app">
      <main className="viewer">
        <VolumeViewer {...volumeViewerWithCaptureTarget} />
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

      <PlaybackControlsPanel
        layout={{
          windowMargin,
          controlWindowWidth,
          resetToken,
          controlWindowInitialPosition,
          viewerSettingsWindowInitialPosition
        }}
        modeToggle={modeToggle}
        playbackControls={playbackState}
        viewerSettings={viewerSettings}
        isViewerSettingsOpen={isViewerSettingsOpen}
        onToggleViewerSettings={toggleViewerSettings}
        onCloseViewerSettings={closeViewerSettings}
        renderingQuality={renderingQuality}
        onRenderingQualityChange={handleRenderingQualityChange}
      />

      <ChannelsPanel
        layout={{ windowMargin, controlWindowWidth, layersWindowInitialPosition, resetToken }}
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
        hasTrackData={hasTrackData}
        trackDefaults={trackDefaults}
        trackSettings={trackSettings}
        isTrackSettingsOpen={isTrackSettingsOpen}
        onToggleTrackSettings={toggleTrackSettings}
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
        isPlotSettingsOpen={isPlotSettingsOpen}
        onTogglePlotSettings={togglePlotSettings}
        onClosePlotSettings={closePlotSettings}
      />
    </div>
  );
}

export type { ViewerShellProps } from './viewer-shell/types';
export default ViewerShell;
