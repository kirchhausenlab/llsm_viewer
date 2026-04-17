import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { PlaybackControlsProps, RecordingStatus, ViewerMode } from '../types';
import type { VolumeViewerCaptureTarget } from '../../VolumeViewer.types';

type CaptureTargetValue = VolumeViewerCaptureTarget | HTMLCanvasElement | null;
type CaptureTargetGetter = () => VolumeViewerCaptureTarget | null;
type CaptureTarget =
  | CaptureTargetValue
  | (() => VolumeViewerCaptureTarget | HTMLCanvasElement | null)
  | null;
type PendingRecordingAction = 'start' | 'resume';

const DEFAULT_RECORDING_BITRATE_MBPS = 20;
const RECORDING_BITRATE_RANGE_MBPS = { min: 1, max: 100 } as const;
const DEFAULT_RECORDING_COUNTDOWN_SECONDS = 0;
const RECORDING_COUNTDOWN_RANGE_SECONDS = { min: 0, max: 5 } as const;
const DEFAULT_RECORDING_FRAME_PUMP_FPS = 30;
const MAX_RECORDING_FRAME_PUMP_FPS = 60;

function normalizeCaptureTargetValue(target: CaptureTargetValue): VolumeViewerCaptureTarget | null {
  if (!target) {
    return null;
  }
  if (typeof target === 'object' && 'canvas' in target) {
    return {
      canvas: target.canvas ?? null,
      captureImage: typeof target.captureImage === 'function' ? target.captureImage : undefined,
    };
  }
  return { canvas: target };
}

function normalizeCaptureTarget(target: CaptureTarget): CaptureTargetGetter | null {
  if (!target) {
    return null;
  }
  if (typeof target === 'function') {
    return () => normalizeCaptureTargetValue(target());
  }
  const normalized = normalizeCaptureTargetValue(target);
  return normalized ? () => normalized : null;
}

function formatTimestampSegment(timestamp: Date): string {
  const pad = (value: number) => value.toString().padStart(2, '0');
  return `${timestamp.getFullYear()}-${pad(timestamp.getMonth() + 1)}-${pad(timestamp.getDate())}-${pad(
    timestamp.getHours()
  )}${pad(timestamp.getMinutes())}${pad(timestamp.getSeconds())}`;
}

function dataUrlToBlob(dataUrl: string): Blob | null {
  const [header, encodedPayload] = dataUrl.split(',', 2);
  if (!header || !encodedPayload) {
    return null;
  }

  const mimeTypeMatch = /^data:(.*?)(;base64)?$/.exec(header);
  if (!mimeTypeMatch) {
    return null;
  }

  const mimeType = mimeTypeMatch[1] || 'application/octet-stream';

  try {
    if (mimeTypeMatch[2] === ';base64') {
      const binary = globalThis.atob(encodedPayload);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
      return new Blob([bytes], { type: mimeType });
    }

    return new Blob([decodeURIComponent(encodedPayload)], { type: mimeType });
  } catch {
    return null;
  }
}

async function captureCanvasPng(canvas: HTMLCanvasElement): Promise<Blob | null> {
  if (typeof canvas.toBlob === 'function') {
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((nextBlob) => resolve(nextBlob), 'image/png');
    });
    if (blob) {
      return blob;
    }
  }

  try {
    return dataUrlToBlob(canvas.toDataURL('image/png'));
  } catch {
    return null;
  }
}

function saveBlobAsDownload(blob: Blob, fileName: string): void {
  if (blob.size <= 0 || typeof document === 'undefined') {
    return;
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();

  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(() => URL.revokeObjectURL(url));
    return;
  }

  globalThis.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function clampRecordingBitrateMbps(value: number): number {
  const rounded = Math.round(value);
  return Math.min(RECORDING_BITRATE_RANGE_MBPS.max, Math.max(RECORDING_BITRATE_RANGE_MBPS.min, rounded));
}

export function clampRecordingCountdownSeconds(value: number): number {
  const rounded = Math.round(value);
  return Math.min(
    RECORDING_COUNTDOWN_RANGE_SECONDS.max,
    Math.max(RECORDING_COUNTDOWN_RANGE_SECONDS.min, rounded)
  );
}

export function resolveCaptureFps(value: unknown): number | null {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }
  return Math.min(MAX_RECORDING_FRAME_PUMP_FPS, Math.max(1, Math.round(numeric)));
}

export function createRecordingFileName(timestamp: Date, mimeType: string): string {
  const extension = mimeType.includes('mp4') ? 'mp4' : 'webm';
  return `recording-${formatTimestampSegment(timestamp)}.${extension}`;
}

export function createScreenshotFileName(timestamp: Date): string {
  return `screenshot-${formatTimestampSegment(timestamp)}.png`;
}

type UseViewerRecordingOptions = {
  viewerMode: ViewerMode;
  playbackControls: PlaybackControlsProps;
};

type UseViewerRecordingResult = {
  playbackControlsWithRecording: PlaybackControlsProps;
  registerVolumeCaptureTarget: (target: CaptureTarget) => void;
};

export function useViewerRecording({
  viewerMode,
  playbackControls
}: UseViewerRecordingOptions): UseViewerRecordingResult {
  const [captureTarget, setCaptureTarget] = useState<CaptureTargetGetter | null>(null);
  const [mediaRecorder, setMediaRecorderState] = useState<MediaRecorder | null>(null);
  const [captureStream, setCaptureStreamState] = useState<MediaStream | null>(null);
  const [recordingStatus, setRecordingStatusState] = useState<RecordingStatus>('idle');
  const [recordingBitrateMbps, setRecordingBitrateMbps] = useState(DEFAULT_RECORDING_BITRATE_MBPS);
  const [countdownSeconds, setCountdownSeconds] = useState(DEFAULT_RECORDING_COUNTDOWN_SECONDS);
  const [countdownRemainingSeconds, setCountdownRemainingSeconds] = useState<number | null>(null);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const recordingChunksRef = useRef<BlobPart[]>([]);
  const recordingFramePumpRef = useRef<ReturnType<typeof globalThis.setInterval> | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof globalThis.setInterval> | null>(null);
  const countdownTimeoutRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);
  const previousViewerModeRef = useRef(viewerMode);
  const recordingStatusRef = useRef<RecordingStatus>('idle');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const captureStreamRef = useRef<MediaStream | null>(null);
  const performStartRecordingRef = useRef<() => void>(() => {});
  const performResumeRecordingRef = useRef<() => void>(() => {});

  const setRecordingStatus = useCallback((nextStatus: RecordingStatus) => {
    recordingStatusRef.current = nextStatus;
    setRecordingStatusState(nextStatus);
  }, []);

  const setMediaRecorder = useCallback((nextRecorder: MediaRecorder | null) => {
    mediaRecorderRef.current = nextRecorder;
    setMediaRecorderState(nextRecorder);
  }, []);

  const setCaptureStream = useCallback((nextStream: MediaStream | null) => {
    captureStreamRef.current = nextStream;
    setCaptureStreamState(nextStream);
  }, []);

  const stopStreamTracks = useCallback((stream: MediaStream | null) => {
    stream?.getTracks().forEach((track) => track.stop());
  }, []);

  const stopRecordingFramePump = useCallback(() => {
    if (recordingFramePumpRef.current !== null) {
      globalThis.clearInterval(recordingFramePumpRef.current);
      recordingFramePumpRef.current = null;
    }
  }, []);

  const clearCountdownTimers = useCallback(() => {
    if (countdownIntervalRef.current !== null) {
      globalThis.clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    if (countdownTimeoutRef.current !== null) {
      globalThis.clearTimeout(countdownTimeoutRef.current);
      countdownTimeoutRef.current = null;
    }
    setCountdownRemainingSeconds(null);
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

  const cleanupRecorderWithoutSaving = useCallback(() => {
    clearCountdownTimers();
    stopRecordingFramePump();
    stopStreamTracks(captureStreamRef.current);
    setCaptureStream(null);
    setMediaRecorder(null);
    setRecordingStatus('idle');
    recordingChunksRef.current = [];
  }, [clearCountdownTimers, setCaptureStream, setMediaRecorder, setRecordingStatus, stopRecordingFramePump, stopStreamTracks]);

  const registerCaptureTarget = useCallback((target: CaptureTarget) => {
    const normalized = normalizeCaptureTarget(target);
    setCaptureTarget(() => normalized);
  }, []);

  const registerVolumeCaptureTarget = useCallback(
    (target: CaptureTarget) => {
      registerCaptureTarget(target);
    },
    [registerCaptureTarget]
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

  const handleCountdownSecondsChange = useCallback((value: number) => {
    if (!Number.isFinite(value)) {
      return;
    }
    setCountdownSeconds((current) => {
      const clamped = clampRecordingCountdownSeconds(value);
      return clamped === current ? current : clamped;
    });
  }, []);

  const activeCaptureTarget = viewerMode === '3d' && typeof captureTarget === 'function' ? captureTarget : null;
  const canCapture = Boolean(playbackControls.canRecord && activeCaptureTarget?.()?.canvas);

  const handleStopRecording = useCallback(() => {
    const currentStatus = recordingStatusRef.current;
    if (currentStatus === 'pending-start' || currentStatus === 'idle') {
      return;
    }

    setRecordingError(null);
    clearCountdownTimers();
    stopRecordingFramePump();

    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
      return;
    }

    stopStreamTracks(captureStreamRef.current);
    setCaptureStream(null);
    setMediaRecorder(null);
    setRecordingStatus('idle');
    recordingChunksRef.current = [];
  }, [
    clearCountdownTimers,
    setCaptureStream,
    setMediaRecorder,
    setRecordingStatus,
    stopRecordingFramePump,
    stopStreamTracks
  ]);

  const performStartRecording = useCallback(() => {
    clearCountdownTimers();

    if (!canCapture || !activeCaptureTarget) {
      setRecordingStatus('idle');
      return;
    }

    const target = activeCaptureTarget();
    const canvas = target?.canvas ?? null;
    if (!canvas || typeof canvas.captureStream !== 'function') {
      setRecordingError('Recording unavailable: capture target not ready.');
      setRecordingStatus('idle');
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
      setRecordingStatus('idle');
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
        setRecordingStatus('idle');
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
      const nextBlobParts = hasChunks ? [...recordingChunksRef.current] : [];

      clearCountdownTimers();
      stopRecordingFramePump();
      stopStreamTracks(stream);
      setCaptureStream(null);
      setMediaRecorder(null);
      setRecordingStatus('idle');
      recordingChunksRef.current = [];

      if (!hasChunks) {
        return;
      }

      const blob = new Blob(nextBlobParts, { type: recorder.mimeType || 'video/webm' });
      const mimeType = recorder.mimeType || blob.type;
      saveBlobAsDownload(blob, createRecordingFileName(new Date(), mimeType));
    };

    recorder.addEventListener('dataavailable', handleDataAvailable);
    recorder.addEventListener('stop', handleStop);

    startRecordingFramePump(stream, captureFps);
    setCaptureStream(stream);
    setMediaRecorder(recorder);

    try {
      recorder.start();
      setRecordingStatus('recording');
    } catch {
      recorder.removeEventListener('dataavailable', handleDataAvailable);
      recorder.removeEventListener('stop', handleStop);
      stopRecordingFramePump();
      stopStreamTracks(stream);
      setCaptureStream(null);
      setMediaRecorder(null);
      setRecordingStatus('idle');
      recordingChunksRef.current = [];
      setRecordingError('Recording unavailable: failed to start recorder.');
    }
  }, [
    activeCaptureTarget,
    canCapture,
    clearCountdownTimers,
    playbackControls.fps,
    recordingBitrateMbps,
    setCaptureStream,
    setMediaRecorder,
    setRecordingStatus,
    startRecordingFramePump,
    stopRecordingFramePump,
    stopStreamTracks
  ]);

  const performResumeRecording = useCallback(() => {
    clearCountdownTimers();

    const recorder = mediaRecorderRef.current;
    const stream = captureStreamRef.current;
    if (!recorder || !stream) {
      cleanupRecorderWithoutSaving();
      return;
    }

    if (recorder.state !== 'paused') {
      if (recorder.state === 'recording') {
        setRecordingStatus('recording');
      } else {
        cleanupRecorderWithoutSaving();
      }
      return;
    }

    const captureFps = resolveCaptureFps(playbackControls.fps);

    try {
      startRecordingFramePump(stream, captureFps);
      recorder.resume();
      setRecordingStatus('recording');
      setRecordingError(null);
    } catch {
      stopRecordingFramePump();
      setRecordingStatus('paused');
      setRecordingError('Recording unavailable: failed to resume recorder.');
    }
  }, [
    cleanupRecorderWithoutSaving,
    clearCountdownTimers,
    playbackControls.fps,
    setRecordingStatus,
    startRecordingFramePump,
    stopRecordingFramePump
  ]);

  useEffect(() => {
    performStartRecordingRef.current = performStartRecording;
  }, [performStartRecording]);

  useEffect(() => {
    performResumeRecordingRef.current = performResumeRecording;
  }, [performResumeRecording]);

  const scheduleRecordingAction = useCallback(
    (action: PendingRecordingAction) => {
      const seconds = clampRecordingCountdownSeconds(countdownSeconds);
      if (seconds <= 0) {
        if (action === 'start') {
          performStartRecordingRef.current();
        } else {
          performResumeRecordingRef.current();
        }
        return;
      }

      clearCountdownTimers();
      setRecordingError(null);
      setRecordingStatus(action === 'start' ? 'pending-start' : 'pending-resume');
      setCountdownRemainingSeconds(seconds);

      countdownIntervalRef.current = globalThis.setInterval(() => {
        setCountdownRemainingSeconds((current) => {
          if (typeof current !== 'number') {
            return current;
          }
          return current > 1 ? current - 1 : current;
        });
      }, 1000);

      countdownTimeoutRef.current = globalThis.setTimeout(() => {
        clearCountdownTimers();
        if (action === 'start') {
          performStartRecordingRef.current();
        } else {
          performResumeRecordingRef.current();
        }
      }, seconds * 1000);
    },
    [clearCountdownTimers, countdownSeconds, setRecordingStatus]
  );

  const abortPendingRecording = useCallback(() => {
    const currentStatus = recordingStatusRef.current;
    if (currentStatus !== 'pending-start' && currentStatus !== 'pending-resume') {
      return;
    }

    clearCountdownTimers();
    setRecordingStatus(currentStatus === 'pending-start' ? 'idle' : 'paused');
  }, [clearCountdownTimers, setRecordingStatus]);

  const handlePauseRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== 'recording') {
      return;
    }

    try {
      recorder.pause();
      stopRecordingFramePump();
      setRecordingStatus('paused');
      setRecordingError(null);
    } catch {
      setRecordingError('Recording unavailable: failed to pause recorder.');
    }
  }, [setRecordingStatus, stopRecordingFramePump]);

  const handleRecordingPrimaryAction = useCallback(() => {
    const currentStatus = recordingStatusRef.current;

    switch (currentStatus) {
      case 'idle':
        if (!canCapture) {
          return;
        }
        scheduleRecordingAction('start');
        return;
      case 'pending-start':
      case 'pending-resume':
        abortPendingRecording();
        return;
      case 'recording':
        handlePauseRecording();
        return;
      case 'paused':
        scheduleRecordingAction('resume');
        return;
      default:
        return;
    }
  }, [abortPendingRecording, canCapture, handlePauseRecording, scheduleRecordingAction]);

  const handleTakeScreenshot = useCallback(async () => {
    if (!canCapture || recordingStatusRef.current !== 'idle' || !activeCaptureTarget) {
      return;
    }

    const target = activeCaptureTarget();
    const canvas = target?.canvas ?? null;
    if (!target || !canvas) {
      setRecordingError('Screenshot unavailable: capture target not ready.');
      return;
    }

    setRecordingError(null);
    const blob = target.captureImage
      ? await target.captureImage()
      : await captureCanvasPng(canvas);
    if (!blob) {
      setRecordingError('Screenshot unavailable: failed to capture canvas.');
      return;
    }

    saveBlobAsDownload(blob, createScreenshotFileName(new Date()));
  }, [activeCaptureTarget, canCapture]);

  useEffect(() => {
    const currentStatus = recordingStatusRef.current;
    if (activeCaptureTarget || currentStatus === 'idle') {
      return;
    }

    if (currentStatus === 'pending-start') {
      clearCountdownTimers();
      setRecordingStatus('idle');
      return;
    }

    handleStopRecording();
  }, [activeCaptureTarget, clearCountdownTimers, handleStopRecording, setRecordingStatus]);

  useEffect(() => {
    if (playbackControls.canRecord || recordingStatusRef.current === 'idle') {
      return;
    }

    if (recordingStatusRef.current === 'pending-start') {
      clearCountdownTimers();
      setRecordingStatus('idle');
      return;
    }

    handleStopRecording();
  }, [clearCountdownTimers, handleStopRecording, playbackControls.canRecord, setRecordingStatus]);

  useEffect(() => {
    const previousViewerMode = previousViewerModeRef.current;
    const currentStatus = recordingStatusRef.current;

    if (viewerMode !== previousViewerMode && currentStatus !== 'idle') {
      if (currentStatus === 'pending-start') {
        clearCountdownTimers();
        setRecordingStatus('idle');
      } else {
        handleStopRecording();
      }
    }

    previousViewerModeRef.current = viewerMode;
  }, [clearCountdownTimers, handleStopRecording, setRecordingStatus, viewerMode]);

  const stopRecordingOnUnmountRef = useRef<() => void>(() => {});

  useEffect(() => {
    stopRecordingOnUnmountRef.current = () => {
      if (recordingStatusRef.current === 'pending-start') {
        cleanupRecorderWithoutSaving();
        return;
      }

      handleStopRecording();
    };
  }, [cleanupRecorderWithoutSaving, handleStopRecording]);

  useEffect(() => () => stopRecordingOnUnmountRef.current(), []);

  const canTakeScreenshot = canCapture && recordingStatus === 'idle';
  const canRecord = recordingStatus === 'idle' ? canCapture : true;
  const isRecording = recordingStatus === 'recording';

  const playbackControlsWithRecording = useMemo(
    () =>
      ({
        ...playbackControls,
        recordingBitrateMbps,
        onRecordingBitrateMbpsChange: handleRecordingBitrateChange,
        countdownSeconds,
        onCountdownSecondsChange: handleCountdownSecondsChange,
        onTakeScreenshot: handleTakeScreenshot,
        canTakeScreenshot,
        onRecordingPrimaryAction: handleRecordingPrimaryAction,
        onStopRecording: handleStopRecording,
        recordingStatus,
        countdownRemainingSeconds,
        isRecording,
        canRecord,
        error: playbackControls.error ?? recordingError ?? null
      }) satisfies PlaybackControlsProps,
    [
      canRecord,
      canTakeScreenshot,
      countdownRemainingSeconds,
      countdownSeconds,
      handleCountdownSecondsChange,
      handleRecordingBitrateChange,
      handleRecordingPrimaryAction,
      handleStopRecording,
      handleTakeScreenshot,
      isRecording,
      playbackControls,
      recordingBitrateMbps,
      recordingError,
      recordingStatus
    ]
  );

  void mediaRecorder;
  void captureStream;

  return {
    playbackControlsWithRecording,
    registerVolumeCaptureTarget
  };
}
