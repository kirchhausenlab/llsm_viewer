import assert from 'node:assert/strict';

import {
  clampRecordingBitrateMbps,
  clampRecordingCountdownSeconds,
  createRecordingFileName,
  createScreenshotFileName,
  resolveCaptureFps,
  useViewerRecording,
} from '../../src/components/viewers/viewer-shell/hooks/useViewerRecording.ts';
import { renderHook } from '../hooks/renderHook.ts';

console.log('Starting useViewerRecording helper tests');

(() => {
  assert.strictEqual(clampRecordingBitrateMbps(0), 1);
  assert.strictEqual(clampRecordingBitrateMbps(1000), 100);
  assert.strictEqual(clampRecordingBitrateMbps(20.4), 20);
  assert.strictEqual(clampRecordingBitrateMbps(20.5), 21);
})();

(() => {
  assert.strictEqual(clampRecordingCountdownSeconds(-1), 0);
  assert.strictEqual(clampRecordingCountdownSeconds(8), 5);
  assert.strictEqual(clampRecordingCountdownSeconds(2.4), 2);
  assert.strictEqual(clampRecordingCountdownSeconds(2.5), 3);
})();

(() => {
  assert.strictEqual(resolveCaptureFps(0), null);
  assert.strictEqual(resolveCaptureFps(-1), null);
  assert.strictEqual(resolveCaptureFps('not-a-number'), null);
  assert.strictEqual(resolveCaptureFps('29.8'), 30);
  assert.strictEqual(resolveCaptureFps(200), 60);
})();

(() => {
  const timestamp = new Date(2025, 0, 2, 3, 4, 5);
  assert.strictEqual(createRecordingFileName(timestamp, 'video/webm'), 'recording-2025-01-02-030405.webm');
  assert.strictEqual(createRecordingFileName(timestamp, 'video/mp4'), 'recording-2025-01-02-030405.mp4');
  assert.strictEqual(createScreenshotFileName(timestamp), 'screenshot-2025-01-02-030405.png');
})();

await (async () => {
  let fallbackCanvasCaptureCalls = 0;
  let customCaptureCalls = 0;
  const fallbackCanvas = {
    toBlob(callback: (blob: Blob | null) => void) {
      fallbackCanvasCaptureCalls += 1;
      callback(new Blob([], { type: 'image/png' }));
    },
  } as unknown as HTMLCanvasElement;

  const hook = renderHook(() =>
    useViewerRecording({
      viewerMode: '3d',
      playbackControls: {
        fps: 30,
        onFpsChange: () => {},
        volumeTimepointCount: 1,
        isPlaying: false,
        playbackLabel: 'Frame 1/1',
        selectedIndex: 0,
        onTimeIndexChange: () => {},
        playbackDisabled: false,
        onTogglePlayback: () => {},
        error: null,
        onTakeScreenshot: () => {},
        canTakeScreenshot: false,
        onRecordingPrimaryAction: () => {},
        onStopRecording: () => {},
        recordingStatus: 'idle',
        countdownRemainingSeconds: null,
        isRecording: false,
        canRecord: true,
      },
    }),
  );

  hook.act(() => {
    hook.result.registerVolumeCaptureTarget({
      canvas: fallbackCanvas,
      captureImage: async () => {
        customCaptureCalls += 1;
        return new Blob([], { type: 'image/png' });
      },
    });
  });

  await hook.act(async () => {
    await hook.result.playbackControlsWithRecording.onTakeScreenshot();
  });

  assert.equal(customCaptureCalls, 1);
  assert.equal(fallbackCanvasCaptureCalls, 0);
  hook.unmount();
})();

console.log('useViewerRecording helper tests passed');
