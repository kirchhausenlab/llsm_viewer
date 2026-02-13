import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { PlaybackControlsProps, ViewerMode } from '../types';

type CaptureTargetGetter = () => HTMLCanvasElement | null;
type CaptureTarget = HTMLCanvasElement | CaptureTargetGetter | null;

const DEFAULT_RECORDING_BITRATE_MBPS = 20;
const RECORDING_BITRATE_RANGE_MBPS = { min: 1, max: 100 } as const;
const DEFAULT_RECORDING_FRAME_PUMP_FPS = 30;
const MAX_RECORDING_FRAME_PUMP_FPS = 60;

function normalizeCaptureTarget(target: CaptureTarget): CaptureTargetGetter | null {
  if (!target) {
    return null;
  }
  if (typeof target === 'function') {
    return target;
  }
  return () => target;
}

export function clampRecordingBitrateMbps(value: number): number {
  const rounded = Math.round(value);
  return Math.min(RECORDING_BITRATE_RANGE_MBPS.max, Math.max(RECORDING_BITRATE_RANGE_MBPS.min, rounded));
}

export function resolveCaptureFps(value: unknown): number | null {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }
  return Math.min(MAX_RECORDING_FRAME_PUMP_FPS, Math.max(1, Math.round(numeric)));
}

export function createRecordingFileName(timestamp: Date, mimeType: string): string {
  const pad = (value: number) => value.toString().padStart(2, '0');
  const extension = mimeType.includes('mp4') ? 'mp4' : 'webm';
  return `recording-${timestamp.getFullYear()}-${pad(timestamp.getMonth() + 1)}-${pad(timestamp.getDate())}-${pad(timestamp.getHours())}${pad(timestamp.getMinutes())}${pad(timestamp.getSeconds())}.${extension}`;
}

type UseViewerRecordingOptions = {
  viewerMode: ViewerMode;
  playbackControls: PlaybackControlsProps;
};

type UseViewerRecordingResult = {
  playbackControlsWithRecording: PlaybackControlsProps;
  registerVolumeCaptureTarget: (target: CaptureTarget) => void;
  registerPlanarCaptureTarget: (target: CaptureTarget) => void;
};

export function useViewerRecording({
  viewerMode,
  playbackControls
}: UseViewerRecordingOptions): UseViewerRecordingResult {
  const [captureTargets, setCaptureTargets] = useState<Record<ViewerMode, CaptureTargetGetter | null>>({
    '3d': null,
    '2d': null
  });
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [captureStream, setCaptureStream] = useState<MediaStream | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingBitrateMbps, setRecordingBitrateMbps] = useState(DEFAULT_RECORDING_BITRATE_MBPS);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const recordingChunksRef = useRef<BlobPart[]>([]);
  const recordingFramePumpRef = useRef<ReturnType<typeof globalThis.setInterval> | null>(null);
  const previousViewerModeRef = useRef(viewerMode);
  const isRecordingRef = useRef(isRecording);

  const stopStreamTracks = useCallback((stream: MediaStream | null) => {
    stream?.getTracks().forEach((track) => track.stop());
  }, []);

  const stopRecordingFramePump = useCallback(() => {
    if (recordingFramePumpRef.current !== null) {
      globalThis.clearInterval(recordingFramePumpRef.current);
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
      recordingFramePumpRef.current = globalThis.setInterval(() => {
        videoTrack.requestFrame?.();
      }, intervalMs);
    },
    [stopRecordingFramePump]
  );

  const registerCaptureTargetForMode = useCallback((mode: ViewerMode, target: CaptureTarget) => {
    setCaptureTargets((current) => ({
      ...current,
      [mode]: normalizeCaptureTarget(target)
    }));
  }, []);

  const registerVolumeCaptureTarget = useCallback(
    (target: CaptureTarget) => {
      registerCaptureTargetForMode('3d', target);
    },
    [registerCaptureTargetForMode]
  );

  const registerPlanarCaptureTarget = useCallback(
    (target: CaptureTarget) => {
      registerCaptureTargetForMode('2d', target);
    },
    [registerCaptureTargetForMode]
  );

  const handleRecordingBitrateChange = useCallback((value: number) => {
    if (!Number.isFinite(value)) {
      return;
    }
    setRecordingBitrateMbps((current) => {
      const clamped = clampRecordingBitrateMbps(value);
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

    const captureFps = resolveCaptureFps(playbackControls.fps);

    let stream: MediaStream | null = null;
    try {
      stream = captureFps ? canvas.captureStream(captureFps) : canvas.captureStream();
    } catch {
      try {
        stream = canvas.captureStream();
      } catch {
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
        videoBitsPerSecond: recordingBitrate
      };
      recorder = new MediaRecorder(stream, options);
    } catch {
      try {
        recorder = new MediaRecorder(stream, preferredMimeType ? { mimeType: preferredMimeType } : undefined);
      } catch {
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

        if (blob.size > 0 && typeof document !== 'undefined') {
          const url = URL.createObjectURL(blob);
          const timestamp = new Date();
          const mimeType = recorder.mimeType || blob.type;
          const fileName = createRecordingFileName(timestamp, mimeType);

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
    stopStreamTracks
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

  const playbackControlsWithRecording = useMemo(
    () =>
      ({
        ...playbackControls,
        onStartRecording: handleStartRecording,
        onStopRecording: handleStopRecording,
        isRecording,
        canRecord,
        recordingBitrateMbps,
        onRecordingBitrateMbpsChange: handleRecordingBitrateChange,
        error: playbackControls.error ?? recordingError ?? null
      }) satisfies PlaybackControlsProps,
    [
      canRecord,
      handleRecordingBitrateChange,
      handleStartRecording,
      handleStopRecording,
      isRecording,
      playbackControls,
      recordingBitrateMbps,
      recordingError
    ]
  );

  return {
    playbackControlsWithRecording,
    registerVolumeCaptureTarget,
    registerPlanarCaptureTarget
  };
}
