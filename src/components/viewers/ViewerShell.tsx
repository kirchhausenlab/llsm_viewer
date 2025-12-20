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
const DEFAULT_RECORDING_BITRATE_MBPS = 20;
const RECORDING_BITRATE_RANGE_MBPS = { min: 1, max: 100 } as const;
const DEFAULT_RECORDING_FRAME_PUMP_FPS = 30;
const MAX_RECORDING_FRAME_PUMP_FPS = 60;

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
  const [recordingBitrateMbps, setRecordingBitrateMbps] = useState(DEFAULT_RECORDING_BITRATE_MBPS);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const recordingChunksRef = useRef<BlobPart[]>([]);
  const recordingFramePumpRef = useRef<number | null>(null);

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

  const stopRecordingFramePump = useCallback(() => {
    if (recordingFramePumpRef.current !== null) {
      window.clearInterval(recordingFramePumpRef.current);
      recordingFramePumpRef.current = null;
    }
  }, []);

  const startRecordingFramePump = useCallback(
    (stream: MediaStream, requestedFps: number | null) => {
      stopRecordingFramePump();

      const videoTrack = stream.getVideoTracks()[0] as (MediaStreamTrack & { requestFrame?: () => void }) | undefined;
      if (!videoTrack || typeof videoTrack.requestFrame !== 'function') {
        return;
      }

      const safeFps =
        requestedFps && Number.isFinite(requestedFps) && requestedFps > 0
          ? Math.min(MAX_RECORDING_FRAME_PUMP_FPS, Math.max(1, Math.round(requestedFps)))
          : DEFAULT_RECORDING_FRAME_PUMP_FPS;

      const intervalMs = Math.max(1, Math.round(1000 / safeFps));
      videoTrack.requestFrame();
      recordingFramePumpRef.current = window.setInterval(() => {
        videoTrack.requestFrame?.();
      }, intervalMs);
    },
    [stopRecordingFramePump]
  );

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

  const handleRecordingBitrateChange = useCallback((value: number) => {
    if (!Number.isFinite(value)) {
      return;
    }
    setRecordingBitrateMbps((current) => {
      const next = Math.round(value);
      const clamped = Math.min(RECORDING_BITRATE_RANGE_MBPS.max, Math.max(RECORDING_BITRATE_RANGE_MBPS.min, next));
      return clamped === current ? current : clamped;
    });
  }, []);

  const activeCaptureTarget = captureTargets[viewerMode];
  const canRecord = Boolean(playbackControls.canRecord && activeCaptureTarget && activeCaptureTarget());

  const handleStopRecording = useCallback(() => {
    setRecordingError(null);
    stopRecordingFramePump();

    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
      return;
    }

    stopStreamTracks(captureStream);
    setCaptureStream(null);
    setMediaRecorder(null);
    setIsRecording(false);
    recordingChunksRef.current = [];
  }, [captureStream, mediaRecorder, stopRecordingFramePump, stopStreamTracks]);

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

    const resolveCaptureFps = (value: unknown) => {
      const numeric = typeof value === 'number' ? value : Number(value);
      if (!Number.isFinite(numeric) || numeric <= 0) {
        return null;
      }
      return Math.min(MAX_RECORDING_FRAME_PUMP_FPS, Math.max(1, Math.round(numeric)));
    };

    const captureFps = resolveCaptureFps(playbackControls.fps);

    let stream: MediaStream | null = null;
    try {
      stream = captureFps ? canvas.captureStream(captureFps) : canvas.captureStream();
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
      const recordingBitrate = Math.round(recordingBitrateMbps * 1_000_000);
      const options: MediaRecorderOptions = {
        ...(preferredMimeType ? { mimeType: preferredMimeType } : {}),
        bitsPerSecond: recordingBitrate,
        videoBitsPerSecond: recordingBitrate,
      };
      recorder = new MediaRecorder(stream, options);
    } catch (error) {
      try {
        recorder = new MediaRecorder(stream, preferredMimeType ? { mimeType: preferredMimeType } : undefined);
      } catch (fallbackError) {
        stopStreamTracks(stream);
        setRecordingError('Recording unavailable: failed to start recorder.');
        return;
      }
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

      stopRecordingFramePump();
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
          const mimeType = recorder.mimeType || blob.type;
          const extension = mimeType.includes('mp4') ? 'mp4' : 'webm';
          const fileName = `recording-${timestamp.getFullYear()}-${pad(timestamp.getMonth() + 1)}-${pad(timestamp.getDate())}-${pad(timestamp.getHours())}${pad(timestamp.getMinutes())}${pad(timestamp.getSeconds())}.${extension}`;

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

    startRecordingFramePump(stream, captureFps);
    setCaptureStream(stream);
    setMediaRecorder(recorder);
    setIsRecording(true);
    recorder.start();
  }, [
    activeCaptureTarget,
    canRecord,
    isRecording,
    playbackControls.fps,
    recordingBitrateMbps,
    startRecordingFramePump,
    stopRecordingFramePump,
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
    recordingBitrateMbps,
    onRecordingBitrateMbpsChange: handleRecordingBitrateChange,
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
