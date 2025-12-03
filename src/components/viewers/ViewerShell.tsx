import { useEffect, useState } from 'react';

import PlanarViewer from './PlanarViewer';
import VolumeViewer from './VolumeViewer';
import ChannelsPanel from './viewer-shell/ChannelsPanel';
import PlaybackControlsPanel from './viewer-shell/PlaybackControlsPanel';
import PlotSettingsPanel from './viewer-shell/PlotSettingsPanel';
import TopMenu from './viewer-shell/TopMenu';
import TracksPanel from './viewer-shell/TracksPanel';
import { useViewerModeControls } from './viewer-shell/hooks/useViewerModeControls';
import { useViewerPlaybackControls } from './viewer-shell/hooks/useViewerPlaybackControls';
import type { ViewerShellProps } from './viewer-shell/types';

function ViewerShell({
  viewerMode,
  volumeViewerProps,
  planarViewerProps,
  planarSettings,
  topMenu,
  layout,
  modeControls,
  playbackControls,
  channelsPanel,
  tracksPanel,
  selectedTracksPanel,
  plotSettings,
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
    trackWindowInitialPosition,
    selectedTracksWindowInitialPosition,
    plotSettingsWindowInitialPosition
  } = layout;
  const { loadedChannelIds, channelLayersMap } = channelsPanel;

  const hasVolumeData = loadedChannelIds.some((channelId) =>
    (channelLayersMap.get(channelId) ?? []).some((layer) => layer.volumes.length > 0)
  );
  const hasTrackData = tracksPanel.channels.some(
    (channel) => (tracksPanel.parsedTracksByChannel.get(channel.id)?.length ?? 0) > 0
  );

  const [renderingQuality, setRenderingQuality] = useState(1);
  const [isViewerSettingsOpen, setIsViewerSettingsOpen] = useState(false);
  const [isPlotSettingsOpen, setIsPlotSettingsOpen] = useState(false);

  const handleRenderingQualityChange = (value: number) => {
    setRenderingQuality(value);
    volumeViewerProps.onVolumeStepScaleChange?.(value);
  };

  const toggleViewerSettingsVisibility = () => {
    setIsViewerSettingsOpen((current) => !current);
  };

  const closeViewerSettings = () => {
    setIsViewerSettingsOpen(false);
  };

  useEffect(() => {
    setIsViewerSettingsOpen(false);
  }, [resetToken]);

  const togglePlotSettingsVisibility = () => {
    setIsPlotSettingsOpen((current) => !current);
  };

  const closePlotSettings = () => {
    setIsPlotSettingsOpen(false);
  };

  useEffect(() => {
    setIsPlotSettingsOpen(false);
  }, [resetToken]);

  useEffect(() => {
    if (!selectedTracksPanel.shouldRender) {
      setIsPlotSettingsOpen(false);
    }
  }, [selectedTracksPanel.shouldRender]);

  const showRenderingQualityControl =
    modeControls.is3dModeAvailable && viewerMode === '3d' && modeControls.samplingMode === 'linear';

  const { modeToggle, viewerSettings } = useViewerModeControls({
    viewerMode,
    modeControls,
    planarSettings,
    showRenderingQualityControl,
    renderingQuality,
    onRenderingQualityChange: handleRenderingQualityChange,
    hasVolumeData
  });

  const playbackState = useViewerPlaybackControls({
    viewerMode,
    playbackControls
  });

  return (
    <div className="app">
      <main className="viewer">
        {viewerMode === '3d' ? <VolumeViewer {...volumeViewerProps} /> : <PlanarViewer {...planarViewerProps} />}
      </main>

      <TopMenu {...topMenu} />

      <PlaybackControlsPanel
        layout={{
          windowMargin,
          controlWindowWidth,
          resetToken,
          controlWindowInitialPosition,
          viewerSettingsWindowInitialPosition
        }}
        viewerMode={viewerMode}
        modeToggle={modeToggle}
        playbackControls={playbackState}
        viewerSettings={viewerSettings}
        isViewerSettingsOpen={isViewerSettingsOpen}
        onToggleViewerSettings={toggleViewerSettingsVisibility}
        onCloseViewerSettings={closeViewerSettings}
        renderingQuality={renderingQuality}
        onRenderingQualityChange={handleRenderingQualityChange}
      />

      <ChannelsPanel
        layout={{ windowMargin, controlWindowWidth, layersWindowInitialPosition, resetToken }}
        {...channelsPanel}
      />

      <TracksPanel
        layout={{ windowMargin, controlWindowWidth, trackWindowInitialPosition, resetToken }}
        hasTrackData={hasTrackData}
        trackDefaults={trackDefaults}
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
        onTogglePlotSettings={togglePlotSettingsVisibility}
        onClosePlotSettings={closePlotSettings}
      />
    </div>
  );
}

export type { ViewerShellProps } from './viewer-shell/types';
export default ViewerShell;
