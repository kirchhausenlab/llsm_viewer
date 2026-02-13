import assert from 'node:assert/strict';

import {
  clampRecordingBitrateMbps,
  createRecordingFileName,
  resolveCaptureFps
} from '../../src/components/viewers/viewer-shell/hooks/useViewerRecording.ts';

console.log('Starting useViewerRecording helper tests');

(() => {
  assert.strictEqual(clampRecordingBitrateMbps(0), 1);
  assert.strictEqual(clampRecordingBitrateMbps(1000), 100);
  assert.strictEqual(clampRecordingBitrateMbps(20.4), 20);
  assert.strictEqual(clampRecordingBitrateMbps(20.5), 21);
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
})();

console.log('useViewerRecording helper tests passed');
