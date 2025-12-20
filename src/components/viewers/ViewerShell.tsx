import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import PlanarViewer from './PlanarViewer';
import VolumeViewer from './VolumeViewer';
import ChannelsPanel from './viewer-shell/ChannelsPanel';
import PlaybackControlsPanel from './viewer-shell/PlaybackControlsPanel';
import PlotSettingsPanel from './viewer-shell/PlotSettingsPanel';
import TopMenu from './viewer-shell/TopMenu';
import TracksPanel from './viewer-shell/TracksPanel';
import NavigationHelpWindow, { computeNavigationHelpInitialPosition } from './viewer-shell/NavigationHelpWindow';
import { useViewerModeControls } from './viewer-shell/hooks/useViewerModeControls';
import { useViewerPlaybackControls } from './viewer-shell/hooks/useViewerPlaybackControls';
import type { ViewerMode, ViewerShellProps } from './viewer-shell/types';

const NAVIGATION_HELP_WINDOW_WIDTH = 420;

function ViewerShell({
  viewerMode,
  volumeViewerProps,
  planarViewerProps,
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
    trackWindowInitialPosition,
    selectedTracksWindowInitialPosition,
    plotSettingsWindowInitialPosition,
    trackSettingsWindowInitialPosition
  } = layout;
  const { loadedChannelIds, channelLayersMap } = channelsPanel;

  const hasVolumeData = loadedChannelIds.some((channelId) =>
    (channelLayersMap.get(channelId) ?? []).some((layer) => layer.volumeCount > 0)
  );
  const hasTrackData = tracksPanel.channels.some(
    (channel) => (tracksPanel.parsedTracksByChannel.get(channel.id)?.length ?? 0) > 0
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

  type CaptureTargetGetter = () => HTMLCanvasElement | null;

  const [captureTargets, setCaptureTargets] = useState<Record<ViewerMode, CaptureTargetGetter | null>>({
    '3d': null,
    '2d': null,
  });
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [captureStream, setCaptureStream] = useState<MediaStream | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const recordingChunksRef = useRef<BlobPart[]>([]);

  const [renderingQuality, setRenderingQuality] = useState(1);
  const [isViewerSettingsOpen, setIsViewerSettingsOpen] = useState(false);
  const [isPlotSettingsOpen, setIsPlotSettingsOpen] = useState(false);
  const [isTrackSettingsOpen, setIsTrackSettingsOpen] = useState(false);
  const previousViewerModeRef = useRef(viewerMode);
  const isRecordingRef = useRef(isRecording);

  const normalizeCaptureTarget = useCallback(
    (target: HTMLCanvasElement | CaptureTargetGetter | null): CaptureTargetGetter | null => {
      if (!target) {
        return null;
      }
      if (typeof target === 'function') {
        return target;
      }
      return () => target;
    },
    []
  );

  const stopStreamTracks = useCallback((stream: MediaStream | null) => {
    stream?.getTracks().forEach((track) => track.stop());
  }, []);

  const registerCaptureTargetForMode = useCallback(
    (mode: ViewerMode, target: HTMLCanvasElement | CaptureTargetGetter | null) => {
      setCaptureTargets((current) => ({
        ...current,
        [mode]: normalizeCaptureTarget(target),
      }));
    },
    [normalizeCaptureTarget]
  );

  const handleVolumeCaptureTarget = useCallback(
    (target: HTMLCanvasElement | CaptureTargetGetter | null) => {
      registerCaptureTargetForMode('3d', target);
    },
    [registerCaptureTargetForMode]
  );

  const handlePlanarCaptureTarget = useCallback(
    (target: HTMLCanvasElement | CaptureTargetGetter | null) => {
      registerCaptureTargetForMode('2d', target);
    },
    [registerCaptureTargetForMode]
  );

  const handleRenderingQualityChange = (value: number) => {
    setRenderingQuality(value);
    volumeViewerProps.onVolumeStepScaleChange?.(value);
  };

  const activeCaptureTarget = captureTargets[viewerMode];
  const canRecord = Boolean(playbackControls.canRecord && activeCaptureTarget && activeCaptureTarget());

  const handleStopRecording = useCallback(() => {
    setRecordingError(null);

    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
      return;
    }

    stopStreamTracks(captureStream);
    setCaptureStream(null);
    setMediaRecorder(null);
    setIsRecording(false);
    recordingChunksRef.current = [];
  }, [captureStream, mediaRecorder, stopStreamTracks]);

  const handleStartRecording = useCallback(() => {
    if (!canRecord || isRecording || !activeCaptureTarget) {
      return;
    }

    const canvas = activeCaptureTarget();
    if (!canvas || typeof canvas.captureStream !== 'function') {
      setRecordingError('Recording unavailable: capture target not ready.');
      return;
    }

    setRecordingError(null);

    let stream: MediaStream | null = null;
    try {
      stream = canvas.captureStream(playbackControls.fps);
    } catch (error) {
      try {
        stream = canvas.captureStream();
      } catch (fallbackError) {
        stream = null;
      }
    }

    if (!stream) {
      setRecordingError('Recording unavailable: captureStream is not supported.');
      return;
    }

    const preferredMimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(
      (candidate) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(candidate)
    );

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, preferredMimeType ? { mimeType: preferredMimeType } : undefined);
    } catch (error) {
      stopStreamTracks(stream);
      setRecordingError('Recording unavailable: failed to start recorder.');
      return;
    }

    recordingChunksRef.current = [];

    const handleDataAvailable = (event: BlobEvent) => {
      if (event.data && event.data.size > 0) {
        recordingChunksRef.current.push(event.data);
      }
    };

    const handleStop = () => {
      recorder.removeEventListener('dataavailable', handleDataAvailable);
      recorder.removeEventListener('stop', handleStop);

      const hasChunks = recordingChunksRef.current.length > 0;

      stopStreamTracks(stream);
      setCaptureStream(null);
      setMediaRecorder(null);
      setIsRecording(false);

      if (hasChunks) {
        const blob = new Blob(recordingChunksRef.current, { type: recorder.mimeType || 'video/webm' });
        recordingChunksRef.current = [];

        if (blob.size > 0) {
          const url = URL.createObjectURL(blob);
          const timestamp = new Date();
          const pad = (value: number) => value.toString().padStart(2, '0');
          const fileName = `recording-${timestamp.getFullYear()}-${pad(timestamp.getMonth() + 1)}-${pad(timestamp.getDate())}-${pad(timestamp.getHours())}${pad(timestamp.getMinutes())}${pad(timestamp.getSeconds())}.mp4`;

          const link = document.createElement('a');
          link.href = url;
          link.download = fileName;
          document.body.appendChild(link);
          link.click();
          link.remove();
          requestAnimationFrame(() => URL.revokeObjectURL(url));
        }
      }
    };

    recorder.addEventListener('dataavailable', handleDataAvailable);
    recorder.addEventListener('stop', handleStop);

    setCaptureStream(stream);
    setMediaRecorder(recorder);
    setIsRecording(true);
    recorder.start();
  }, [
    activeCaptureTarget,
    canRecord,
    isRecording,
    playbackControls.fps,
    stopStreamTracks,
  ]);

  useEffect(() => {
    if (!activeCaptureTarget && isRecording) {
      handleStopRecording();
    }
  }, [activeCaptureTarget, handleStopRecording, isRecording]);

  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  useEffect(() => {
    const previousViewerMode = previousViewerModeRef.current;

    if (viewerMode !== previousViewerMode && isRecordingRef.current) {
      handleStopRecording();
    }

    previousViewerModeRef.current = viewerMode;
  }, [handleStopRecording, viewerMode]);

  const stopRecordingOnUnmountRef = useRef(handleStopRecording);

  useEffect(() => {
    stopRecordingOnUnmountRef.current = handleStopRecording;
  }, [handleStopRecording]);

  useEffect(() => () => stopRecordingOnUnmountRef.current(), []);

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

  const toggleTrackSettingsVisibility = () => {
    setIsTrackSettingsOpen((current) => !current);
  };

  const closeTrackSettings = () => {
    setIsTrackSettingsOpen(false);
  };

  useEffect(() => {
    setIsTrackSettingsOpen(false);
  }, [resetToken]);

  useEffect(() => {
    if (!hasTrackData) {
      setIsTrackSettingsOpen(false);
    }
  }, [hasTrackData]);

  const showRenderingQualityControl =
    modeControls.is3dModeAvailable && viewerMode === '3d' && modeControls.samplingMode === 'linear';

  const { modeToggle, viewerSettings } = useViewerModeControls({
    viewerMode,
    modeControls,
    showRenderingQualityControl,
    renderingQuality,
    onRenderingQualityChange: handleRenderingQualityChange,
    hasVolumeData
  });

  const volumeViewerWithCaptureTarget = {
    ...volumeViewerProps,
    onRegisterCaptureTarget: handleVolumeCaptureTarget,
  } satisfies ViewerShellProps['volumeViewerProps'];

  const planarViewerWithCaptureTarget = {
    ...planarViewerProps,
    onRegisterCaptureTarget: handlePlanarCaptureTarget,
  } satisfies ViewerShellProps['planarViewerProps'];

  const playbackControlsWithRecording = {
    ...playbackControls,
    onStartRecording: handleStartRecording,
    onStopRecording: handleStopRecording,
    isRecording,
    canRecord,
    error: playbackControls.error ?? recordingError ?? null,
  } satisfies ViewerShellProps['playbackControls'];

  const playbackState = useViewerPlaybackControls({
    viewerMode,
    playbackControls: playbackControlsWithRecording,
  });

  return (
    <div className="app">
      <main className="viewer">
        {viewerMode === '3d' ? (
          <VolumeViewer {...volumeViewerWithCaptureTarget} />
        ) : (
          <PlanarViewer {...planarViewerWithCaptureTarget} />
        )}
      </main>

      <TopMenu {...topMenu} />

      <NavigationHelpWindow
        isOpen={isHelpMenuOpen}
        onClose={closeHelpMenu}
        initialPosition={navigationHelpInitialPosition}
        windowMargin={windowMargin}
        width={NAVIGATION_HELP_WINDOW_WIDTH}
        resetSignal={resetToken}
      />

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
        layout={{
          windowMargin,
          controlWindowWidth,
          trackWindowInitialPosition,
          trackSettingsWindowInitialPosition,
          resetToken,
        }}
        hasTrackData={hasTrackData}
        trackDefaults={trackDefaults}
        trackSettings={trackSettings}
        isTrackSettingsOpen={isTrackSettingsOpen}
        onToggleTrackSettings={toggleTrackSettingsVisibility}
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
        onTogglePlotSettings={togglePlotSettingsVisibility}
        onClosePlotSettings={closePlotSettings}
      />
    </div>
  );
}

export type { ViewerShellProps } from './viewer-shell/types';
export default ViewerShell;
