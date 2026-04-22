import assert from 'node:assert/strict';

import {
  resetPlaybackWarmupGateState,
  resolvePlaybackWarmupGateWaitMs,
  shouldAllowPlaybackAdvanceWithWarmup,
  type PlaybackWarmupGateState
} from '../src/components/viewers/volume-viewer/playbackWarmupGate.ts';

console.log('Starting playbackWarmupGate tests');

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
    getWarmupStatus: () => 'ready',
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
    getWarmupStatus: () => 'missing',
    fps: 12,
    nowMs: 0,
    gateState
  });
  assert.equal(allowed, true, 'missing viewer warmup layers should fail open');
  assert.equal(gateState.blockedNextIndex, null);
})();

(() => {
  const gateState = createGateState();
  const waitMs = resolvePlaybackWarmupGateWaitMs(12);

  const initiallyAllowed = shouldAllowPlaybackAdvanceWithWarmup({
    nextIndex: 1,
    requiredLayerKeys: ['layer-a'],
    getWarmupStatus: () => 'pending',
    fps: 12,
    nowMs: 1000,
    gateState
  });
  assert.equal(initiallyAllowed, false);

  const allowedAfterTimeout = shouldAllowPlaybackAdvanceWithWarmup({
    nextIndex: 1,
    requiredLayerKeys: ['layer-a'],
    getWarmupStatus: () => 'pending',
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

  const allowed = shouldAllowPlaybackAdvanceWithWarmup({
    nextIndex: 1,
    requiredLayerKeys: ['layer-a'],
    getWarmupStatus: () => 'ready',
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
