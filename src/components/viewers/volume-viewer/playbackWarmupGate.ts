export type PlaybackWarmupGateState = {
  blockedNextIndex: number | null;
  blockedAtMs: number | null;
};

const PLAYBACK_WARMUP_GATE_MIN_WAIT_MS = 150;
const PLAYBACK_WARMUP_GATE_MAX_WAIT_MS = 350;
const PLAYBACK_WARMUP_GATE_FRAME_MULTIPLIER = 2.5;

export function resetPlaybackWarmupGateState(state: PlaybackWarmupGateState): void {
  state.blockedNextIndex = null;
  state.blockedAtMs = null;
}

export function resolvePlaybackWarmupGateWaitMs(fps: number): number {
  const safeFps = Number.isFinite(fps) && fps > 0 ? fps : 12;
  const frameDurationMs = 1000 / safeFps;
  return Math.max(
    PLAYBACK_WARMUP_GATE_MIN_WAIT_MS,
    Math.min(PLAYBACK_WARMUP_GATE_MAX_WAIT_MS, frameDurationMs * PLAYBACK_WARMUP_GATE_FRAME_MULTIPLIER)
  );
}

export function shouldAllowPlaybackAdvanceWithWarmup({
  nextIndex,
  requiredLayerKeys,
  getWarmupStatus,
  fps,
  nowMs,
  gateState
}: {
  nextIndex: number;
  requiredLayerKeys: string[];
  getWarmupStatus: (nextIndex: number, requiredLayerKeys: string[]) => 'ready' | 'pending' | 'missing';
  fps: number;
  nowMs: number;
  gateState: PlaybackWarmupGateState;
}): boolean {
  if (requiredLayerKeys.length === 0) {
    resetPlaybackWarmupGateState(gateState);
    return true;
  }

  const warmupStatus = getWarmupStatus(nextIndex, requiredLayerKeys);
  if (warmupStatus === 'missing') {
    resetPlaybackWarmupGateState(gateState);
    return true;
  }

  if (warmupStatus === 'ready') {
    resetPlaybackWarmupGateState(gateState);
    return true;
  }

  const waitMs = resolvePlaybackWarmupGateWaitMs(fps);
  if (gateState.blockedNextIndex !== nextIndex) {
    gateState.blockedNextIndex = nextIndex;
    gateState.blockedAtMs = nowMs;
    return false;
  }

  const blockedAtMs = Number.isFinite(gateState.blockedAtMs) ? (gateState.blockedAtMs as number) : nowMs;
  gateState.blockedAtMs = blockedAtMs;
  return nowMs - blockedAtMs >= waitMs;
}
