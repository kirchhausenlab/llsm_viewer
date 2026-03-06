import assert from 'node:assert/strict';

import type { ViewerLayer, VolumeResources } from '../src/components/viewers/VolumeViewer.types.ts';
import {
  resetPlaybackWarmupGateState,
  resolvePlaybackWarmupGateWaitMs,
  shouldAllowPlaybackAdvanceWithWarmup,
  type PlaybackWarmupGateState
} from '../src/components/viewers/volume-viewer/playbackWarmupGate.ts';

console.log('Starting playbackWarmupGate tests');

function createWarmupLayer(key: string, baseLayerKey: string, timeIndex: number): ViewerLayer {
  return {
    key,
    label: key,
    channelName: 'channel-a',
    fullResolutionWidth: 1,
    fullResolutionHeight: 1,
    fullResolutionDepth: 1,
    volume: null,
    visible: false,
    sliderRange: 1,
    minSliderIndex: 0,
    maxSliderIndex: 1,
    brightnessSliderIndex: 0,
    contrastSliderIndex: 0,
    windowMin: 0,
    windowMax: 1,
    color: '#ffffff',
    offsetX: 0,
    offsetY: 0,
    renderStyle: '3d',
    blDensityScale: 1,
    blBackgroundCutoff: 0,
    blOpacityScale: 1,
    blEarlyExitAlpha: 1,
    mipEarlyExitThreshold: 0,
    invert: false,
    samplingMode: 'nearest',
    playbackWarmupForLayerKey: baseLayerKey,
    playbackWarmupTimeIndex: timeIndex,
    playbackRole: 'warmup',
    playbackSlotIndex: 0,
  };
}

function createResource(playbackWarmupReady: boolean | null): VolumeResources {
  return {
    playbackWarmupReady,
    gpuBrickResidencyMetrics: playbackWarmupReady === null
      ? { pendingBricks: 1, scheduledUploads: 1 }
      : { pendingBricks: playbackWarmupReady ? 0 : 1, scheduledUploads: 0 },
  } as unknown as VolumeResources;
}

function createGateState(): PlaybackWarmupGateState {
  return {
    blockedNextIndex: null,
    blockedAtMs: null
  };
}

(() => {
  const gateState = createGateState();
  const allowed = shouldAllowPlaybackAdvanceWithWarmup({
    nextIndex: 1,
    requiredLayerKeys: [],
    playbackWarmupLayers: [],
    resources: new Map(),
    fps: 12,
    nowMs: 0,
    gateState
  });
  assert.equal(allowed, true);
  assert.equal(gateState.blockedNextIndex, null);
})();

(() => {
  const gateState = createGateState();
  const allowed = shouldAllowPlaybackAdvanceWithWarmup({
    nextIndex: 1,
    requiredLayerKeys: ['layer-a'],
    playbackWarmupLayers: [],
    resources: new Map(),
    fps: 12,
    nowMs: 0,
    gateState
  });
  assert.equal(allowed, true, 'missing viewer warmup layers should fail open');
  assert.equal(gateState.blockedNextIndex, null);
})();

(() => {
  const gateState = createGateState();
  const playbackWarmupLayers = [createWarmupLayer('layer-a::playback-warmup:slot:0', 'layer-a', 1)];
  const resources = new Map<string, VolumeResources>([
    ['layer-a::playback-warmup:slot:0', createResource(false)]
  ]);
  const waitMs = resolvePlaybackWarmupGateWaitMs(12);

  const initiallyAllowed = shouldAllowPlaybackAdvanceWithWarmup({
    nextIndex: 1,
    requiredLayerKeys: ['layer-a'],
    playbackWarmupLayers,
    resources,
    fps: 12,
    nowMs: 1000,
    gateState
  });
  assert.equal(initiallyAllowed, false);

  const allowedAfterTimeout = shouldAllowPlaybackAdvanceWithWarmup({
    nextIndex: 1,
    requiredLayerKeys: ['layer-a'],
    playbackWarmupLayers,
    resources,
    fps: 12,
    nowMs: 1000 + waitMs + 1,
    gateState
  });
  assert.equal(allowedAfterTimeout, true, 'stalled viewer warmup should fail open after the grace window');
})();

(() => {
  const gateState = createGateState();
  gateState.blockedNextIndex = 1;
  gateState.blockedAtMs = 100;
  const playbackWarmupLayers = [createWarmupLayer('layer-a::playback-warmup:slot:0', 'layer-a', 1)];
  const resources = new Map<string, VolumeResources>([
    ['layer-a::playback-warmup:slot:0', createResource(true)]
  ]);

  const allowed = shouldAllowPlaybackAdvanceWithWarmup({
    nextIndex: 1,
    requiredLayerKeys: ['layer-a'],
    playbackWarmupLayers,
    resources,
    fps: 12,
    nowMs: 150,
    gateState
  });
  assert.equal(allowed, true);
  assert.equal(gateState.blockedNextIndex, null, 'ready warmup resources should clear any previous stall state');
})();

(() => {
  const gateState = createGateState();
  gateState.blockedNextIndex = 2;
  gateState.blockedAtMs = 200;
  resetPlaybackWarmupGateState(gateState);
  assert.deepStrictEqual(gateState, {
    blockedNextIndex: null,
    blockedAtMs: null
  });
})();

console.log('playbackWarmupGate tests passed');
