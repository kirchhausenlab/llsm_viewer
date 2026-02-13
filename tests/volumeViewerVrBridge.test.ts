import assert from 'node:assert/strict';

import { hasChangedVrIntegration } from '../src/components/viewers/volume-viewer/VolumeViewerVrBridge.tsx';
import type { UseVolumeViewerVrResult } from '../src/components/viewers/volume-viewer/useVolumeViewerVr.ts';

console.log('Starting volume viewer VR bridge tests');

(() => {
  const sharedPlaybackLoopRef = { current: { lastTimestamp: null, accumulator: 0 } };
  const requestVrSession = async () => ({}) as XRSession;
  const updateControllerRays = () => {};

  const previous = {
    playbackLoopRef: sharedPlaybackLoopRef,
    requestVrSession,
    updateControllerRays,
  } as unknown as UseVolumeViewerVrResult;
  const next = {
    playbackLoopRef: sharedPlaybackLoopRef,
    requestVrSession,
    updateControllerRays,
  } as unknown as UseVolumeViewerVrResult;

  assert.strictEqual(hasChangedVrIntegration(previous, next), false);
})();

(() => {
  const sharedPlaybackLoopRef = { current: { lastTimestamp: null, accumulator: 0 } };
  const previous = {
    playbackLoopRef: sharedPlaybackLoopRef,
    requestVrSession: async () => ({}) as XRSession,
    updateControllerRays: () => {},
  } as unknown as UseVolumeViewerVrResult;
  const next = {
    playbackLoopRef: sharedPlaybackLoopRef,
    requestVrSession: async () => ({}) as XRSession,
    updateControllerRays: () => {},
  } as unknown as UseVolumeViewerVrResult;

  assert.strictEqual(hasChangedVrIntegration(previous, next), true);
})();

(() => {
  const next = {
    playbackLoopRef: { current: { lastTimestamp: null, accumulator: 0 } },
    requestVrSession: async () => ({}) as XRSession,
    updateControllerRays: () => {},
  } as unknown as UseVolumeViewerVrResult;

  assert.strictEqual(hasChangedVrIntegration(null, next), true);
})();

console.log('volume viewer VR bridge tests passed');
