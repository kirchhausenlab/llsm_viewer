import type { ViewerLayer, VolumeResources } from '../VolumeViewer.types';

export type PlaybackWarmupGateState = {
  blockedNextIndex: number | null;
  blockedAtMs: number | null;
};

const PLAYBACK_WARMUP_GATE_MIN_WAIT_MS = 150;
const PLAYBACK_WARMUP_GATE_MAX_WAIT_MS = 350;
const PLAYBACK_WARMUP_GATE_FRAME_MULTIPLIER = 2.5;

function isWarmupResourceReady(resource: VolumeResources | undefined): boolean {
  if (!resource) {
    return false;
  }
  if (typeof resource.playbackWarmupReady === 'boolean') {
    return resource.playbackWarmupReady;
  }
  const metrics = resource.gpuBrickResidencyMetrics;
  if (!metrics) {
    return false;
  }
  return (metrics.pendingBricks ?? 0) <= 0 && (metrics.scheduledUploads ?? 0) <= 0;
}

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
  playbackWarmupLayers,
  resources,
  fps,
  nowMs,
  gateState
}: {
  nextIndex: number;
  requiredLayerKeys: string[];
  playbackWarmupLayers: ViewerLayer[];
  resources: Map<string, VolumeResources>;
  fps: number;
  nowMs: number;
  gateState: PlaybackWarmupGateState;
}): boolean {
  if (requiredLayerKeys.length === 0) {
    resetPlaybackWarmupGateState(gateState);
    return true;
  }

  const warmupLayerByBaseKey = new Map(
    playbackWarmupLayers
      .filter((layer) => layer.playbackWarmupTimeIndex === nextIndex && layer.playbackWarmupForLayerKey)
      .map((layer) => [layer.playbackWarmupForLayerKey as string, layer])
  );

  // If the route-level playback state says the next frame is ready but the hidden
  // viewer warmup layer is missing entirely, fail open instead of wedging playback.
  if (!requiredLayerKeys.every((layerKey) => warmupLayerByBaseKey.has(layerKey))) {
    resetPlaybackWarmupGateState(gateState);
    return true;
  }

  const allWarmupResourcesReady = requiredLayerKeys.every((layerKey) => {
    const warmupLayer = warmupLayerByBaseKey.get(layerKey);
    if (!warmupLayer) {
      return false;
    }
    return isWarmupResourceReady(resources.get(warmupLayer.key));
  });
  if (allWarmupResourcesReady) {
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
