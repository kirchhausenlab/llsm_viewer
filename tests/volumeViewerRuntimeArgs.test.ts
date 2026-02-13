import assert from 'node:assert/strict';

import {
  buildVolumeViewerLifecycleParams,
  buildVolumeViewerVrBridgeOptions,
  type VolumeViewerLifecycleOptionGroups,
  type VolumeViewerVrBridgeOptionGroups,
} from '../src/components/viewers/volume-viewer/volumeViewerRuntimeArgs.ts';

console.log('Starting volume viewer runtime args helper tests');

(() => {
  const refs = {
    containerRef: { current: 'container' },
    rendererRef: { current: 'renderer' },
  } as unknown as VolumeViewerVrBridgeOptionGroups['refs'];
  const playbackState = {
    fps: 20,
  } as unknown as VolumeViewerVrBridgeOptionGroups['playbackState'];
  const vrState = {
    isVrPassthroughSupported: true,
    trackChannels: [],
  } as unknown as VolumeViewerVrBridgeOptionGroups['vrState'];
  const trackState = {
    tracks: [],
    followedTrackId: 'track-1',
  } as unknown as VolumeViewerVrBridgeOptionGroups['trackState'];
  const callbacks = {
    vrLog: () => {},
    onAfterSessionEnd: () => {},
  } as unknown as VolumeViewerVrBridgeOptionGroups['callbacks'];

  const options = buildVolumeViewerVrBridgeOptions({
    vr: undefined,
    refs,
    playbackState,
    vrState,
    trackState,
    callbacks,
  });

  assert.strictEqual(options.vr, undefined);
  assert.strictEqual(options.containerRef, refs.containerRef);
  assert.strictEqual(options.rendererRef, refs.rendererRef);
  assert.strictEqual(options.playbackState, playbackState);
  assert.strictEqual(options.isVrPassthroughSupported, true);
  assert.strictEqual(options.tracks, trackState.tracks);
  assert.strictEqual(options.followedTrackId, 'track-1');
  assert.strictEqual(options.vrLog, callbacks.vrLog);
})();

(() => {
  const core = {
    containerNode: 'container',
  } as unknown as VolumeViewerLifecycleOptionGroups['core'];
  const renderLoop = {
    rendererRef: { current: 'renderer' },
    applyKeyboardRotation: () => {},
  } as unknown as VolumeViewerLifecycleOptionGroups['renderLoop'];
  const interaction = {
    paintbrushRef: { current: null },
    onVoxelFollowRequest: () => {},
  } as unknown as VolumeViewerLifecycleOptionGroups['interaction'];
  const hoverLifecycle = {
    resetHoverState: () => {},
    setHoverNotReady: () => {},
  } as unknown as VolumeViewerLifecycleOptionGroups['hoverLifecycle'];
  const vrLifecycle = {
    xrSessionRef: { current: null },
    restoreVrFoveation: () => {},
  } as unknown as VolumeViewerLifecycleOptionGroups['vrLifecycle'];

  const params = buildVolumeViewerLifecycleParams({
    core,
    renderLoop,
    interaction,
    hoverLifecycle,
    vrLifecycle,
  });

  assert.strictEqual(params.containerNode, core.containerNode);
  assert.strictEqual(params.rendererRef, renderLoop.rendererRef);
  assert.strictEqual(params.onVoxelFollowRequest, interaction.onVoxelFollowRequest);
  assert.strictEqual(params.resetHoverState, hoverLifecycle.resetHoverState);
  assert.strictEqual(params.xrSessionRef, vrLifecycle.xrSessionRef);
})();

console.log('volume viewer runtime args helper tests passed');
