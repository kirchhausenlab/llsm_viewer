import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction
} from 'react';

import { clearTextureCache } from '../../../core/textureCache';
import type { LODPolicyDiagnosticsSnapshot, LODPromotionState } from '../../../core/lodPolicyDiagnostics';
import { getLod0FeatureFlags } from '../../../config/lod0Flags';
import type {
  VolumeBrickAtlas,
  VolumeBackgroundMask,
  VolumeBrickPageTable,
  VolumeProvider,
  VolumeProviderDiagnostics
} from '../../../core/volumeProvider';
import { isIntensityVolume, type NormalizedVolume } from '../../../core/volumeProcessing';
import { shouldPreferDirectVolumeSampling } from '../../../shared/utils/lod0Residency';
import type { PlaybackIndexWindow } from '../../../shared/utils';
import { computeLoopedNextTimeIndex } from '../../../shared/utils';
import type { PreprocessedLayerScaleManifestEntry } from '../../../shared/utils/preprocessedDataset/types';
import type { LoadedDatasetLayer, StagedPreprocessedExperiment } from '../../../hooks/dataset';

type SetLaunchProgressOptions = {
  loadedCount: number;
  totalCount: number;
};

type UseRouteLayerVolumesOptions = {
  isViewerLaunched: boolean;
  isLaunchingViewer: boolean;
  isPlaying?: boolean;
  preprocessedExperiment: StagedPreprocessedExperiment | null;
  volumeProvider: VolumeProvider | null;
  loadedChannelIds: string[];
  channelLayersMap: Map<string, LoadedDatasetLayer[]>;
  channelVisibility: Record<string, boolean>;
  layerChannelMap: Map<string, string>;
  preferBrickResidency: boolean;
  viewerCameraSample?: {
    distanceToTarget: number;
    isMoving: boolean;
    capturedAtMs: number;
  } | null;
  volumeTimepointCount: number;
  selectedIndex: number;
  playbackWindow?: PlaybackIndexWindow | null;
  clearDatasetError: () => void;
  beginLaunchSession: () => void;
  setLaunchExpectedVolumeCount: (count: number) => void;
  setLaunchProgress: (options: SetLaunchProgressOptions) => void;
  completeLaunchSession: (totalCount: number) => void;
  failLaunchSession: (message: string) => void;
  finishLaunchSessionAttempt: () => void;
  setSelectedIndex: Dispatch<SetStateAction<number>>;
  setIsPlaying: Dispatch<SetStateAction<boolean>>;
  showLaunchError: (message: string) => void;
};

type RouteLayerVolumesState = {
  currentLayerVolumes: Record<string, NormalizedVolume | null>;
  currentLayerPageTables: Record<string, VolumeBrickPageTable | null>;
  currentLayerBrickAtlases: Record<string, VolumeBrickAtlas | null>;
  currentBackgroundMasksByScale: Record<number, VolumeBackgroundMask | null>;
  playbackWarmupFrames: PlaybackWarmupFrameState[];
  playbackWarmupTimeIndex: number | null;
  playbackWarmupLayerVolumes: Record<string, NormalizedVolume | null>;
  playbackWarmupLayerPageTables: Record<string, VolumeBrickPageTable | null>;
  playbackWarmupLayerBrickAtlases: Record<string, VolumeBrickAtlas | null>;
  playbackWarmupBackgroundMasksByScale: Record<number, VolumeBackgroundMask | null>;
  volumeProviderDiagnostics: VolumeProviderDiagnostics | null;
  lodPolicyDiagnostics: LODPolicyDiagnosticsSnapshot | null;
  setCurrentLayerVolumes: Dispatch<SetStateAction<Record<string, NormalizedVolume | null>>>;
  playbackLayerKeys: string[];
  playbackAtlasScaleLevelByLayerKey: Record<string, number>;
  handleLaunchViewer: () => Promise<void>;
};

const DIAGNOSTICS_POLL_INTERVAL_MS = 500;
const LOD_POLICY_WINDOW_MS = 60_000;
const LOD_POLICY_THRASH_WINDOW_MS = 4_000;
const LOD_PROMOTE_COOLDOWN_MS = 1_200;
const LOD_MIN_PROJECTED_PIXELS_PER_VOXEL = 0.75;
const LOD_THRASH_AUTO_DISABLE_PER_MINUTE = 60;
const MAX_BRICK_ATLAS_DEPTH_HINT = 2048;
const MAX_BRICK_ATLAS_BYTES_HINT = 384 * 1024 * 1024;
const MAX_VOLUME_BYTES_HINT = 384 * 1024 * 1024;
const MAX_ADAPTIVE_DOWNSAMPLE_MULTIPLIER = 8;
const MAX_ADAPTIVE_DEMOTION_STEPS = 4;
const CAMERA_PROJECTED_PIXELS_REFERENCE_DISTANCE = 1.2;
const CAMERA_PROJECTED_PIXELS_AT_REFERENCE = 1.4;
const PLAYBACK_WARMUP_SLOT_COUNT = 3;

type LayerPolicyRuntimeState = {
  layerKey: string;
  desiredScaleLevel: number;
  activeScaleLevel: number | null;
  fallbackScaleLevel: number | null;
  promotionState: LODPromotionState;
  lastPromoteMs: number | null;
  lastDemoteMs: number | null;
  promoteCount: number;
  demoteCount: number;
  thrashEvents: number;
  lastReadyLatencyMs: number | null;
};

function nowMs(): number {
  return Date.now();
}

function isAbortLikeError(error: unknown): boolean {
  return (
    (typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  );
}

function createAbortError(): Error {
  if (typeof DOMException !== 'undefined') {
    try {
      return new DOMException('The operation was aborted.', 'AbortError');
    } catch {
      // Fall back to Error below.
    }
  }
  const error = new Error('The operation was aborted.');
  error.name = 'AbortError';
  return error;
}

function throwIfAborted(signal: AbortSignal | null | undefined): void {
  if (!signal?.aborted) {
    return;
  }
  if (signal.reason instanceof Error) {
    throw signal.reason;
  }
  throw createAbortError();
}

function isAllocationLikeError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message.toLowerCase();
  return (
    message.includes('array buffer allocation failed') ||
    message.includes('allocation failed') ||
    message.includes('invalid typed array length') ||
    message.includes('out of memory') ||
    message.includes('cannot allocate')
  );
}

function getTextureChannelCountForSourceChannels(sourceChannels: number): number {
  if (sourceChannels <= 1) {
    return 1;
  }
  if (sourceChannels === 2) {
    return 2;
  }
  return 4;
}

function selectDeterministicLayerKey(layers: ReadonlyArray<{ key: string }>): string | null {
  if (layers.length === 0) {
    return null;
  }
  return [...layers].sort((left, right) => left.key.localeCompare(right.key))[0]?.key ?? null;
}

function collectActiveLayerKeys(
  loadedChannelIds: string[],
  channelLayersMap: Map<string, LoadedDatasetLayer[]>
): string[] {
  const keys: string[] = [];
  for (const channelId of loadedChannelIds) {
    const channelLayers = channelLayersMap.get(channelId) ?? [];
    if (channelLayers.length === 0) {
      continue;
    }
    const resolvedLayerKey = selectDeterministicLayerKey(channelLayers);
    if (resolvedLayerKey) {
      keys.push(resolvedLayerKey);
    }
  }
  return keys;
}

type LoadedLayerResources = readonly [
  layerKey: string,
  volume: NormalizedVolume | null,
  pageTable: VolumeBrickPageTable | null,
  brickAtlas: VolumeBrickAtlas | null
];

export type PlaybackWarmupFrameState = {
  slotIndex: number;
  timeIndex: number;
  scaleSignature: string;
  layerVolumes: Record<string, NormalizedVolume | null>;
  layerPageTables: Record<string, VolumeBrickPageTable | null>;
  layerBrickAtlases: Record<string, VolumeBrickAtlas | null>;
  backgroundMasksByScale: Record<number, VolumeBackgroundMask | null>;
};

function collectActiveScaleLevels(resources: readonly LoadedLayerResources[]): number[] {
  const levels = new Set<number>();
  for (const [, volume, pageTable, brickAtlas] of resources) {
    const scaleLevel =
      brickAtlas?.scaleLevel ??
      volume?.scaleLevel ??
      pageTable?.scaleLevel;
    if (typeof scaleLevel !== 'number' || !Number.isFinite(scaleLevel)) {
      continue;
    }
    levels.add(Math.max(0, Math.floor(scaleLevel)));
  }
  return [...levels].sort((left, right) => left - right);
}

function collectPlaybackWarmupTimeIndices(
  currentIndex: number,
  totalTimepoints: number,
  playbackWindow: PlaybackIndexWindow | null,
  slotCount: number,
): number[] {
  if (totalTimepoints <= 1 || slotCount <= 0) {
    return [];
  }
  const indices: number[] = [];
  const seen = new Set<number>([currentIndex]);
  let candidate = currentIndex;
  for (let slotIndex = 0; slotIndex < slotCount; slotIndex += 1) {
    candidate = computeLoopedNextTimeIndex(candidate, totalTimepoints, playbackWindow);
    if (seen.has(candidate)) {
      break;
    }
    seen.add(candidate);
    indices.push(candidate);
  }
  return indices;
}

function sortWarmupFramesByTargetOrder(
  frames: PlaybackWarmupFrameState[],
  targetTimeIndices: number[],
): PlaybackWarmupFrameState[] {
  const orderByTimeIndex = new Map<number, number>();
  targetTimeIndices.forEach((timeIndex, index) => {
    orderByTimeIndex.set(timeIndex, index);
  });
  return [...frames].sort((left, right) => {
    const leftOrder = orderByTimeIndex.get(left.timeIndex) ?? Number.POSITIVE_INFINITY;
    const rightOrder = orderByTimeIndex.get(right.timeIndex) ?? Number.POSITIVE_INFINITY;
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }
    return left.slotIndex - right.slotIndex;
  });
}

function arePlaybackWarmupFramesEquivalent(
  left: PlaybackWarmupFrameState[],
  right: PlaybackWarmupFrameState[],
): boolean {
  return (
    left.length === right.length &&
    left.every((frame, index) => {
      const other = right[index];
      return (
        other !== undefined &&
        frame.slotIndex === other.slotIndex &&
        frame.timeIndex === other.timeIndex &&
        frame.scaleSignature === other.scaleSignature &&
        frame.layerVolumes === other.layerVolumes &&
        frame.layerPageTables === other.layerPageTables &&
        frame.layerBrickAtlases === other.layerBrickAtlases &&
        frame.backgroundMasksByScale === other.backgroundMasksByScale
      );
    })
  );
}

function applyPlaybackScaleOverride({
  levels,
  resolvedScaleLevel,
  isPlaying
}: {
  levels: number[];
  resolvedScaleLevel: number;
  isPlaying: boolean;
}): number {
  if (!isPlaying || resolvedScaleLevel !== 0) {
    return resolvedScaleLevel;
  }
  if (levels.includes(1)) {
    return 1;
  }
  return levels.find((level) => level > 0) ?? 0;
}

function downsampleMagnitude(scale: PreprocessedLayerScaleManifestEntry | null): number {
  if (!scale) {
    return 1;
  }
  const factors = (scale as { downsampleFactor?: [number, number, number] }).downsampleFactor;
  if (!Array.isArray(factors) || factors.length < 3) {
    return 1;
  }
  const [depth, height, width] = factors;
  const values = [depth, height, width].map((value) =>
    Number.isFinite(value) && value > 0 ? value : 1
  );
  return Math.cbrt(values[0] * values[1] * values[2]);
}

function isPromotionReadyForResource({
  volume,
  pageTable,
  brickAtlas,
  cachePressure
}: {
  volume: NormalizedVolume | null;
  pageTable: VolumeBrickPageTable | null;
  brickAtlas: VolumeBrickAtlas | null;
  cachePressure: { volume: number; chunk: number } | null;
}): boolean {
  const pressure = cachePressure
    ? Math.max(0, Math.min(1, (cachePressure.volume + cachePressure.chunk) / 2))
    : 0;
  if (pressure >= 0.98) {
    return false;
  }
  if (brickAtlas) {
    return brickAtlas.enabled && brickAtlas.pageTable.occupiedBrickCount > 0;
  }
  if (volume) {
    return isIntensityVolume(volume) ? volume.normalized.byteLength > 0 : volume.labels.byteLength > 0;
  }
  return pageTable ? pageTable.occupiedBrickCount > 0 : false;
}

function buildLayerResidencyModeMap({
  channelLayersMap,
  preferBrickResidency,
  canUseAtlas
}: {
  channelLayersMap: Map<string, LoadedDatasetLayer[]>;
  preferBrickResidency: boolean;
  canUseAtlas: boolean;
}): Map<string, 'volume' | 'atlas'> {
  const modeByKey = new Map<string, 'volume' | 'atlas'>();
  for (const layers of channelLayersMap.values()) {
    for (const layer of layers) {
      const useAtlas = preferBrickResidency && canUseAtlas && layer.depth > 1;
      modeByKey.set(layer.key, useAtlas ? 'atlas' : 'volume');
    }
  }
  return modeByKey;
}

export function useRouteLayerVolumes({
  isViewerLaunched,
  isLaunchingViewer,
  isPlaying = false,
  preprocessedExperiment,
  volumeProvider,
  loadedChannelIds,
  channelLayersMap,
  channelVisibility,
  layerChannelMap,
  preferBrickResidency,
  viewerCameraSample = null,
  volumeTimepointCount,
  selectedIndex,
  playbackWindow = null,
  clearDatasetError,
  beginLaunchSession,
  setLaunchExpectedVolumeCount,
  setLaunchProgress,
  completeLaunchSession,
  failLaunchSession,
  finishLaunchSessionAttempt,
  setSelectedIndex,
  setIsPlaying,
  showLaunchError
}: UseRouteLayerVolumesOptions): RouteLayerVolumesState {
  const [currentLayerVolumes, setCurrentLayerVolumes] = useState<Record<string, NormalizedVolume | null>>({});
  const [currentLayerPageTables, setCurrentLayerPageTables] = useState<Record<string, VolumeBrickPageTable | null>>(
    {}
  );
  const [currentLayerBrickAtlases, setCurrentLayerBrickAtlases] = useState<Record<string, VolumeBrickAtlas | null>>(
    {}
  );
  const [currentBackgroundMasksByScale, setCurrentBackgroundMasksByScale] = useState<
    Record<number, VolumeBackgroundMask | null>
  >({});
  const [playbackWarmupFrames, setPlaybackWarmupFrames] = useState<PlaybackWarmupFrameState[]>([]);
  const [volumeProviderDiagnostics, setVolumeProviderDiagnostics] = useState<VolumeProviderDiagnostics | null>(null);
  const [lodPolicyDiagnostics, setLodPolicyDiagnostics] = useState<LODPolicyDiagnosticsSnapshot | null>(null);
  const volumeLoadRequestRef = useRef(0);
  const lastLoadIntentRef = useRef<string | null>(null);
  const volumeLoadAbortControllerRef = useRef<AbortController | null>(null);
  const playbackWarmupFramesRef = useRef<PlaybackWarmupFrameState[]>([]);
  const playbackWarmupRequestSequenceRef = useRef(0);
  const playbackWarmupRequestBySlotRef = useRef<Map<number, { requestId: number; abortController: AbortController }>>(
    new Map()
  );
  const lastWarmupIntentBySlotRef = useRef<Map<number, string>>(new Map());
  const backgroundMaskCacheRef = useRef<Record<number, VolumeBackgroundMask | null>>({});
  const playbackLayerKeysRef = useRef<string[]>([]);
  const previousIsPlayingRef = useRef<boolean>(isPlaying);
  const showLaunchErrorRef = useRef(showLaunchError);
  const lodPolicyStartedAtMsRef = useRef<number>(nowMs());
  const lodPolicyThrashEventsRef = useRef<number[]>([]);
  const layerPolicyStateByLayerKeyRef = useRef<Map<string, LayerPolicyRuntimeState>>(new Map());
  const adaptivePolicyDisabledRef = useRef(false);
  const lod0Flags = useMemo(() => getLod0FeatureFlags(), []);
  const canUseAtlas = typeof volumeProvider?.getBrickAtlas === 'function';
  useEffect(() => {
    playbackWarmupFramesRef.current = playbackWarmupFrames;
  }, [playbackWarmupFrames]);
  const primaryPlaybackWarmupFrame = useMemo(() => playbackWarmupFrames[0] ?? null, [playbackWarmupFrames]);
  const playbackWarmupTimeIndex = primaryPlaybackWarmupFrame?.timeIndex ?? null;
  const playbackWarmupLayerVolumes = primaryPlaybackWarmupFrame?.layerVolumes ?? {};
  const playbackWarmupLayerPageTables = primaryPlaybackWarmupFrame?.layerPageTables ?? {};
  const playbackWarmupLayerBrickAtlases = primaryPlaybackWarmupFrame?.layerBrickAtlases ?? {};
  const playbackWarmupBackgroundMasksByScale = primaryPlaybackWarmupFrame?.backgroundMasksByScale ?? {};
  const cancelWarmupSlot = useCallback((slotIndex: number) => {
    const activeRequest = playbackWarmupRequestBySlotRef.current.get(slotIndex);
    activeRequest?.abortController.abort();
    playbackWarmupRequestBySlotRef.current.delete(slotIndex);
    lastWarmupIntentBySlotRef.current.delete(slotIndex);
  }, []);
  const cancelAllWarmupRequests = useCallback(() => {
    for (const slotIndex of playbackWarmupRequestBySlotRef.current.keys()) {
      cancelWarmupSlot(slotIndex);
    }
  }, [cancelWarmupSlot]);
  const replacePlaybackWarmupFrames = useCallback((nextFrames: PlaybackWarmupFrameState[]) => {
    setPlaybackWarmupFrames((current) =>
      arePlaybackWarmupFramesEquivalent(current, nextFrames) ? current : nextFrames
    );
  }, []);
  const layerScaleLevelsByKey = useMemo(() => {
    const map = new Map<string, number[]>();
    const manifest = preprocessedExperiment?.manifest;
    if (!manifest) {
      return map;
    }
    for (const channel of manifest.dataset.channels) {
      for (const layer of channel.layers) {
        const levels = Array.from(new Set(layer.zarr.scales.map((scale) => scale.level))).sort((left, right) => left - right);
        map.set(layer.key, levels.length > 0 ? levels : [0]);
      }
    }
    return map;
  }, [preprocessedExperiment?.manifest]);
  const layerScalesByLevelByKey = useMemo(() => {
    const map = new Map<string, Map<number, PreprocessedLayerScaleManifestEntry>>();
    const manifest = preprocessedExperiment?.manifest;
    if (!manifest) {
      return map;
    }
    for (const channel of manifest.dataset.channels) {
      for (const layer of channel.layers) {
        const byLevel = new Map<number, PreprocessedLayerScaleManifestEntry>();
        for (const scale of layer.zarr.scales) {
          byLevel.set(scale.level, scale);
        }
        map.set(layer.key, byLevel);
      }
    }
    return map;
  }, [preprocessedExperiment?.manifest]);
  const resolveDesiredScaleLevel = useCallback(
    (layerKey: string): number => {
      const levels = layerScaleLevelsByKey.get(layerKey) ?? [0];
      const finestLevel = levels[0] ?? 0;
      const fallbackBaseDesired = (() => {
        const desired = 0;
        let resolved = finestLevel;
        for (const level of levels) {
          if (level <= desired) {
            resolved = level;
          }
        }
        return resolved;
      })();
      if (isPlaying) {
        return applyPlaybackScaleOverride({
          levels,
          resolvedScaleLevel: fallbackBaseDesired,
          isPlaying: true
        });
      }
      if (!lod0Flags.adaptiveScaleSelector || adaptivePolicyDisabledRef.current) {
        return applyPlaybackScaleOverride({
          levels,
          resolvedScaleLevel: fallbackBaseDesired,
          isPlaying
        });
      }

      const cameraDistance = Number.isFinite(viewerCameraSample?.distanceToTarget)
        ? Math.max(0.05, Number(viewerCameraSample?.distanceToTarget))
        : Number.NaN;
      const projectedPixelsFromCamera = Number.isFinite(cameraDistance)
        ? Math.max(
            0.2,
            Math.min(
              6,
              (CAMERA_PROJECTED_PIXELS_AT_REFERENCE * CAMERA_PROJECTED_PIXELS_REFERENCE_DISTANCE) / cameraDistance
            )
          )
        : Number.NaN;
      const baseProjectedPixelsPerVoxel = Number.isFinite(projectedPixelsFromCamera) ? projectedPixelsFromCamera : 1.4;
      const motionPenalty = viewerCameraSample?.isMoving ? 0.9 : 1;
      const projectedPixelsPerVoxel = baseProjectedPixelsPerVoxel * motionPenalty;

      let projectedChoice = finestLevel;
      for (const level of levels) {
        const scale = layerScalesByLevelByKey.get(layerKey)?.get(level) ?? null;
        const projectedPixels = projectedPixelsPerVoxel * downsampleMagnitude(scale);
        if (projectedPixels >= LOD_MIN_PROJECTED_PIXELS_PER_VOXEL) {
          projectedChoice = level;
          break;
        }
      }
      const fallbackIndex = Math.max(
        0,
        levels.findIndex((level) => level === fallbackBaseDesired)
      );
      const fallbackDownsampleMagnitude = downsampleMagnitude(
        layerScalesByLevelByKey.get(layerKey)?.get(fallbackBaseDesired) ?? null
      );
      const maxAdaptiveDownsampleMagnitude = fallbackDownsampleMagnitude * MAX_ADAPTIVE_DOWNSAMPLE_MULTIPLIER;
      let magnitudeBoundedDemotionIndex = fallbackIndex;
      for (let levelIndex = fallbackIndex; levelIndex < levels.length; levelIndex += 1) {
        const level = levels[levelIndex];
        if (level === undefined) {
          continue;
        }
        const magnitude = downsampleMagnitude(layerScalesByLevelByKey.get(layerKey)?.get(level) ?? null);
        if (magnitude <= maxAdaptiveDownsampleMagnitude + 1e-6) {
          magnitudeBoundedDemotionIndex = levelIndex;
        }
      }
      const maxAdaptiveDemotionIndex = Math.min(
        levels.length - 1,
        fallbackIndex + MAX_ADAPTIVE_DEMOTION_STEPS,
        magnitudeBoundedDemotionIndex
      );
      const projectedChoiceIndex = Math.max(
        0,
        levels.findIndex((level) => level === projectedChoice)
      );
      projectedChoice = levels[Math.min(maxAdaptiveDemotionIndex, projectedChoiceIndex)] ?? projectedChoice;

      const previousState = layerPolicyStateByLayerKeyRef.current.get(layerKey);
      if (!previousState || previousState.activeScaleLevel === null) {
        return applyPlaybackScaleOverride({
          levels,
          resolvedScaleLevel: projectedChoice,
          isPlaying
        });
      }

      const activeScaleLevel = previousState.activeScaleLevel;
      if (projectedChoice === activeScaleLevel) {
        return applyPlaybackScaleOverride({
          levels,
          resolvedScaleLevel: projectedChoice,
          isPlaying
        });
      }
      const activeScaleIndex = levels.findIndex((level) => level === activeScaleLevel);
      const projectedScaleIndex = levels.findIndex((level) => level === projectedChoice);
      if (activeScaleIndex >= 0 && projectedScaleIndex >= 0 && Math.abs(projectedScaleIndex - activeScaleIndex) > 1) {
        const stepDirection = projectedScaleIndex > activeScaleIndex ? 1 : -1;
        const isPromotionToFinerScale = projectedScaleIndex < activeScaleIndex;
        const shouldStepTransition = !isPromotionToFinerScale || viewerCameraSample?.isMoving;
        projectedChoice = shouldStepTransition
          ? levels[activeScaleIndex + stepDirection] ?? projectedChoice
          : projectedChoice;
      }

      const now = nowMs();
      const isPromotion = projectedChoice < activeScaleLevel;
      if (isPromotion) {
        const lastDemoteMs = previousState.lastDemoteMs ?? 0;
        if (now - lastDemoteMs < LOD_PROMOTE_COOLDOWN_MS) {
          return applyPlaybackScaleOverride({
            levels,
            resolvedScaleLevel: activeScaleLevel,
            isPlaying
          });
        }
      }

      return applyPlaybackScaleOverride({
        levels,
        resolvedScaleLevel: projectedChoice,
        isPlaying
      });
    },
    [
      isPlaying,
      layerScaleLevelsByKey,
      layerScalesByLevelByKey,
      lod0Flags.adaptiveScaleSelector,
      viewerCameraSample
    ]
  );
  const captureLodPolicyDiagnosticsSnapshot = useCallback(() => {
    const states = Array.from(layerPolicyStateByLayerKeyRef.current.values()).sort((left, right) =>
      left.layerKey.localeCompare(right.layerKey)
    );
    if (states.length === 0) {
      setLodPolicyDiagnostics(null);
      return;
    }

    const now = nowMs();
    const recentThrashEvents = lodPolicyThrashEventsRef.current;
    while (recentThrashEvents.length > 0 && now - (recentThrashEvents[0] ?? 0) > LOD_POLICY_WINDOW_MS) {
      recentThrashEvents.shift();
    }
    const sessionDurationMs = Math.max(1, now - lodPolicyStartedAtMsRef.current);
    const effectiveDurationMs = Math.min(LOD_POLICY_WINDOW_MS, sessionDurationMs);
    const thrashEventsPerMinute = recentThrashEvents.length / (effectiveDurationMs / 60_000);

    setLodPolicyDiagnostics({
      capturedAt: new Date(now).toISOString(),
      layerCount: states.length,
      promotedLayers: states.filter((state) => state.promotionState === 'promoted').length,
      warmingLayers: states.filter((state) => state.promotionState === 'warming').length,
      thrashEventsPerMinute: Number.isFinite(thrashEventsPerMinute)
        ? Math.max(0, thrashEventsPerMinute)
        : 0,
      adaptivePolicyDisabled: adaptivePolicyDisabledRef.current,
      layers: states
    });
  }, []);
  const updateLayerPolicyState = useCallback(
    ({
      layerKey,
      desiredScaleLevel,
      activeScaleLevel,
      fallbackScaleLevel,
      readyLatencyMs,
      promotionStateOverride
    }: {
      layerKey: string;
      desiredScaleLevel: number;
      activeScaleLevel: number | null;
      fallbackScaleLevel: number | null;
      readyLatencyMs: number | null;
      promotionStateOverride?: LODPromotionState;
    }) => {
      const now = nowMs();
      const previousState = layerPolicyStateByLayerKeyRef.current.get(layerKey) ?? {
        layerKey,
        desiredScaleLevel,
        activeScaleLevel: null,
        fallbackScaleLevel: null,
        promotionState: 'idle' as LODPromotionState,
        lastPromoteMs: null,
        lastDemoteMs: null,
        promoteCount: 0,
        demoteCount: 0,
        thrashEvents: 0,
        lastReadyLatencyMs: null
      };

      let promoteCount = previousState.promoteCount;
      let demoteCount = previousState.demoteCount;
      let thrashEvents = previousState.thrashEvents;
      let lastPromoteMs = previousState.lastPromoteMs;
      let lastDemoteMs = previousState.lastDemoteMs;

      const previousActive = previousState.activeScaleLevel;
      if (
        previousActive !== null &&
        activeScaleLevel !== null &&
        previousActive !== activeScaleLevel
      ) {
        const isPromotion = activeScaleLevel < previousActive;
        const oppositeTransitionMs = isPromotion ? previousState.lastDemoteMs : previousState.lastPromoteMs;
        if (oppositeTransitionMs !== null && now - oppositeTransitionMs <= LOD_POLICY_THRASH_WINDOW_MS) {
          thrashEvents += 1;
          lodPolicyThrashEventsRef.current.push(now);
        }
        if (isPromotion) {
          promoteCount += 1;
          lastPromoteMs = now;
        } else {
          demoteCount += 1;
          lastDemoteMs = now;
        }
      }

      const promotionState: LODPromotionState =
        promotionStateOverride ??
        (activeScaleLevel === null
          ? 'warming'
          : activeScaleLevel === desiredScaleLevel
            ? 'promoted'
            : 'warming');

      const nextState: LayerPolicyRuntimeState = {
        layerKey,
        desiredScaleLevel,
        activeScaleLevel,
        fallbackScaleLevel,
        promotionState,
        lastPromoteMs,
        lastDemoteMs,
        promoteCount,
        demoteCount,
        thrashEvents,
        lastReadyLatencyMs: readyLatencyMs ?? previousState.lastReadyLatencyMs
      };
      layerPolicyStateByLayerKeyRef.current.set(layerKey, nextState);
      const nowForThrashRate = nowMs();
      const recentThrashEvents = lodPolicyThrashEventsRef.current;
      while (recentThrashEvents.length > 0 && nowForThrashRate - (recentThrashEvents[0] ?? 0) > LOD_POLICY_WINDOW_MS) {
        recentThrashEvents.shift();
      }
      const thrashEventsPerMinute = recentThrashEvents.length / (LOD_POLICY_WINDOW_MS / 60_000);
      if (
        lod0Flags.adaptiveScaleSelector &&
        !adaptivePolicyDisabledRef.current &&
        thrashEventsPerMinute >= LOD_THRASH_AUTO_DISABLE_PER_MINUTE
      ) {
        adaptivePolicyDisabledRef.current = true;
      }
      captureLodPolicyDiagnosticsSnapshot();
    },
    [captureLodPolicyDiagnosticsSnapshot, lod0Flags.adaptiveScaleSelector]
  );
  const layerResidencyModeByKeyRef = useRef<Map<string, 'volume' | 'atlas'>>(
    buildLayerResidencyModeMap({ channelLayersMap, preferBrickResidency, canUseAtlas })
  );

  useEffect(() => {
    showLaunchErrorRef.current = showLaunchError;
  }, [showLaunchError]);

  useEffect(() => {
    layerResidencyModeByKeyRef.current = buildLayerResidencyModeMap({
      channelLayersMap,
      preferBrickResidency,
      canUseAtlas
    });
  }, [canUseAtlas, channelLayersMap, preferBrickResidency]);

  useEffect(() => {
    if (isViewerLaunched) {
      return;
    }
    lastLoadIntentRef.current = null;
    layerPolicyStateByLayerKeyRef.current.clear();
    lodPolicyThrashEventsRef.current.length = 0;
    lodPolicyStartedAtMsRef.current = nowMs();
    adaptivePolicyDisabledRef.current = false;
    setLodPolicyDiagnostics(null);
  }, [isViewerLaunched]);

  useEffect(() => {
    const wasPlaying = previousIsPlayingRef.current;
    previousIsPlayingRef.current = isPlaying;
    if (!wasPlaying || isPlaying) {
      return;
    }
    // Playback stop should not inherit transient playback policy state.
    volumeLoadAbortControllerRef.current?.abort();
    volumeLoadAbortControllerRef.current = null;
    lastLoadIntentRef.current = null;
    layerPolicyStateByLayerKeyRef.current.clear();
    lodPolicyThrashEventsRef.current.length = 0;
    lodPolicyStartedAtMsRef.current = nowMs();
    adaptivePolicyDisabledRef.current = false;
    setLodPolicyDiagnostics(null);
  }, [isPlaying]);

  const loadLayerTimepointResources = useCallback(
    async (
      layerKey: string,
      timeIndex: number,
      options?: { signal?: AbortSignal | null }
    ): Promise<{
      volume: NormalizedVolume | null;
      pageTable: VolumeBrickPageTable | null;
      brickAtlas: VolumeBrickAtlas | null;
    }> => {
      const signal = options?.signal ?? null;
      throwIfAborted(signal);
      const loadStartedAtMs = nowMs();
      const desiredScaleLevel = resolveDesiredScaleLevel(layerKey);
      const maxBrickAtlasBytesHint = MAX_BRICK_ATLAS_BYTES_HINT;
      const maxVolumeBytesHint = MAX_VOLUME_BYTES_HINT;
      const knownLevels = (() => {
        const fromManifest = layerScaleLevelsByKey.get(layerKey);
        if (fromManifest && fromManifest.length > 0) {
          return fromManifest;
        }
        return desiredScaleLevel === 0 ? [0] : [0, desiredScaleLevel];
      })();
      const fallbackScaleLevel = knownLevels[knownLevels.length - 1] ?? desiredScaleLevel;
      const prefetchedPageTablesByScale = new Map<number, VolumeBrickPageTable>();
      updateLayerPolicyState({
        layerKey,
        desiredScaleLevel,
        activeScaleLevel: null,
        fallbackScaleLevel,
        readyLatencyMs: null
      });
      const residencyMode = layerResidencyModeByKeyRef.current.get(layerKey) ?? 'volume';
      const shouldLoadBrickAtlas =
        residencyMode === 'atlas' && typeof volumeProvider?.getBrickAtlas === 'function';

      if (shouldLoadBrickAtlas) {
        // Prefer atlas/page-table path first; fall back to volume path when needed.
        const candidateScaleLevels = knownLevels.filter((level) => level >= desiredScaleLevel);
        if (candidateScaleLevels.length === 0) {
          candidateScaleLevels.push(...knownLevels);
        }

        for (let index = 0; index < candidateScaleLevels.length; index += 1) {
          const scaleLevel = candidateScaleLevels[index] ?? desiredScaleLevel;
          const isDesiredScaleLevel = scaleLevel === desiredScaleLevel;
          throwIfAborted(signal);
          const scale = layerScalesByLevelByKey.get(layerKey)?.get(scaleLevel) ?? null;
          const sourceChannels = scale?.channels ?? 1;
          const textureChannels = getTextureChannelCountForSourceChannels(sourceChannels);

          if (typeof volumeProvider?.getBrickPageTable === 'function') {
            const pageTable = await volumeProvider.getBrickPageTable(layerKey, timeIndex, { scaleLevel, signal });
            throwIfAborted(signal);
            prefetchedPageTablesByScale.set(scaleLevel, pageTable);
            const [chunkDepth, chunkHeight, chunkWidth] = pageTable.chunkShape;
            const estimatedAtlasDepth = chunkDepth * pageTable.occupiedBrickCount;
            const estimatedAtlasBytes = chunkWidth * chunkHeight * estimatedAtlasDepth * textureChannels;
            const shouldPreferDirectVolume =
              scale !== null &&
              shouldPreferDirectVolumeSampling({
                scaleLevel,
                volumeWidth: scale.width,
                volumeHeight: scale.height,
                volumeDepth: scale.depth,
                textureChannels,
                gridShape: pageTable.gridShape,
                chunkShape: pageTable.chunkShape,
                occupiedBrickCount: pageTable.occupiedBrickCount,
                maxDirectVolumeBytes: maxVolumeBytesHint
              });
            if (shouldPreferDirectVolume) {
              break;
            }
            if (
              estimatedAtlasDepth > MAX_BRICK_ATLAS_DEPTH_HINT ||
              estimatedAtlasBytes > maxBrickAtlasBytesHint
            ) {
              if (isDesiredScaleLevel) {
                break;
              }
              continue;
            }
          }

          try {
            const atlas = await volumeProvider!.getBrickAtlas!(layerKey, timeIndex, { scaleLevel, signal });
            throwIfAborted(signal);
            if (!atlas.enabled) {
              if (isDesiredScaleLevel) {
                break;
              }
              continue;
            }
            if (atlas.data.byteLength > maxBrickAtlasBytesHint) {
              if (isDesiredScaleLevel) {
                break;
              }
              continue;
            }
            if (atlas.depth > MAX_BRICK_ATLAS_DEPTH_HINT) {
              if (isDesiredScaleLevel) {
                break;
              }
              continue;
            }
            const readyLatencyMs = Math.max(0, nowMs() - loadStartedAtMs);
            const readinessPassed =
              atlas.scaleLevel === desiredScaleLevel &&
              isPromotionReadyForResource({
                volume: null,
                pageTable: atlas.pageTable,
                brickAtlas: atlas,
                cachePressure: volumeProviderDiagnostics?.cachePressure ?? null
              });
            if (lod0Flags.promotionStateMachine && readinessPassed) {
              updateLayerPolicyState({
                layerKey,
                desiredScaleLevel,
                activeScaleLevel: atlas.scaleLevel,
                fallbackScaleLevel,
                readyLatencyMs,
                promotionStateOverride: 'ready'
              });
            }
            updateLayerPolicyState({
              layerKey,
              desiredScaleLevel,
              activeScaleLevel: atlas.scaleLevel,
              fallbackScaleLevel,
              readyLatencyMs,
              promotionStateOverride:
                lod0Flags.promotionStateMachine
                  ? readinessPassed
                    ? 'promoted'
                    : 'warming'
                  : undefined
            });
            return {
              volume: null,
              pageTable: atlas.pageTable,
              brickAtlas: atlas
            };
          } catch (error) {
            if (isAllocationLikeError(error)) {
              if (isDesiredScaleLevel) {
                break;
              }
              continue;
            }
            throw error;
          }
        }
      }

      const candidateScaleLevels = knownLevels.filter((level) => level >= desiredScaleLevel);
      if (candidateScaleLevels.length === 0) {
        candidateScaleLevels.push(...knownLevels);
      }

      let lastVolumeError: unknown = null;
      for (let index = 0; index < candidateScaleLevels.length; index += 1) {
        const scaleLevel = candidateScaleLevels[index] ?? 0;
        const isLastCandidate = index === candidateScaleLevels.length - 1;
        const scale = layerScalesByLevelByKey.get(layerKey)?.get(scaleLevel) ?? null;
        const estimatedVolumeBytes = scale ? scale.width * scale.height * scale.depth * scale.channels : 0;
        if (!isLastCandidate && estimatedVolumeBytes > maxVolumeBytesHint) {
          continue;
        }

        try {
          const prefetchedPageTable = prefetchedPageTablesByScale.get(scaleLevel) ?? null;
          const [volume, pageTable] = await Promise.all([
            volumeProvider!.getVolume(layerKey, timeIndex, { scaleLevel, signal }),
            prefetchedPageTable
              ? Promise.resolve(prefetchedPageTable)
              : typeof volumeProvider?.getBrickPageTable === 'function'
              ? volumeProvider.getBrickPageTable(layerKey, timeIndex, { scaleLevel, signal })
              : Promise.resolve(null)
          ]);
          throwIfAborted(signal);
          const activeScaleLevel = volume.scaleLevel ?? scaleLevel;
          const readyLatencyMs = Math.max(0, nowMs() - loadStartedAtMs);
          const readinessPassed =
            activeScaleLevel === desiredScaleLevel &&
            isPromotionReadyForResource({
              volume,
              pageTable,
              brickAtlas: null,
              cachePressure: volumeProviderDiagnostics?.cachePressure ?? null
            });
          if (lod0Flags.promotionStateMachine && readinessPassed) {
            updateLayerPolicyState({
              layerKey,
              desiredScaleLevel,
              activeScaleLevel,
              fallbackScaleLevel,
              readyLatencyMs,
              promotionStateOverride: 'ready'
            });
          }
          updateLayerPolicyState({
            layerKey,
            desiredScaleLevel,
            activeScaleLevel,
            fallbackScaleLevel,
            readyLatencyMs,
            promotionStateOverride:
              lod0Flags.promotionStateMachine
                ? readinessPassed
                  ? 'promoted'
                  : 'warming'
                : undefined
          });
          return {
            volume,
            pageTable,
            brickAtlas: null
          };
        } catch (error) {
          if (isAllocationLikeError(error)) {
            lastVolumeError = error;
            continue;
          }
          throw error;
        }
      }
      if (lastVolumeError instanceof Error) {
        throw lastVolumeError;
      }
      throw new Error(`Volume is unavailable for layer "${layerKey}" at timepoint ${timeIndex}.`);
    },
    [
      layerScaleLevelsByKey,
      layerScalesByLevelByKey,
      resolveDesiredScaleLevel,
      updateLayerPolicyState,
      volumeProvider,
      lod0Flags.promotionStateMachine,
      volumeProviderDiagnostics
    ]
  );

  const loadBackgroundMasksForScaleLevels = useCallback(
    async (
      scaleLevels: readonly number[],
      signal?: AbortSignal | null
    ): Promise<Record<number, VolumeBackgroundMask | null>> => {
      if (!volumeProvider || typeof volumeProvider.getBackgroundMask !== 'function') {
        return {};
      }
      const uniqueScaleLevels = [...new Set(scaleLevels)]
        .filter((scaleLevel) => Number.isFinite(scaleLevel))
        .map((scaleLevel) => Math.max(0, Math.floor(scaleLevel)))
        .sort((left, right) => left - right);
      if (uniqueScaleLevels.length === 0) {
        return {};
      }
      const cachedMasks = backgroundMaskCacheRef.current;
      const missingScaleLevels = uniqueScaleLevels.filter((scaleLevel) => !(scaleLevel in cachedMasks));
      if (missingScaleLevels.length === 0) {
        return cachedMasks;
      }
      const loadedMasks = await Promise.all(
        missingScaleLevels.map(async (scaleLevel) => {
          const mask = await volumeProvider.getBackgroundMask?.({ scaleLevel, signal: signal ?? null });
          return [scaleLevel, mask ?? null] as const;
        })
      );
      const nextMasks = loadedMasks.reduce<Record<number, VolumeBackgroundMask | null>>((acc, [scaleLevel, mask]) => {
        acc[scaleLevel] = mask;
        return acc;
      }, { ...cachedMasks });
      backgroundMaskCacheRef.current = nextMasks;
      return nextMasks;
    },
    [volumeProvider]
  );

  const playbackLayerKeys = useMemo(() => {
    if (!isViewerLaunched || loadedChannelIds.length === 0) {
      return [] as string[];
    }

    const keys = collectActiveLayerKeys(loadedChannelIds, channelLayersMap).filter((layerKey) => {
      const channelId = layerChannelMap.get(layerKey);
      if (!channelId) {
        return true;
      }
      return channelVisibility[channelId] ?? true;
    });
    return keys;
  }, [
    isViewerLaunched,
    loadedChannelIds,
    channelLayersMap,
    layerChannelMap,
    channelVisibility
  ]);
  const playbackLayerKeySignature = useMemo(() => playbackLayerKeys.join('\u001f'), [playbackLayerKeys]);
  useEffect(() => {
    playbackLayerKeysRef.current = playbackLayerKeys;
  }, [playbackLayerKeySignature, playbackLayerKeys]);
  const playbackAtlasScaleLevelByLayerKey = useMemo(() => {
    const byKey: Record<string, number> = {};
    for (const layerKey of playbackLayerKeys) {
      const desiredScaleLevel = resolveDesiredScaleLevel(layerKey);
      byKey[layerKey] = desiredScaleLevel;
    }
    return byKey;
  }, [playbackLayerKeys, resolveDesiredScaleLevel]);

  const handleLaunchViewer = useCallback(async () => {
    if (isLaunchingViewer) {
      return;
    }

    if (!preprocessedExperiment || !volumeProvider) {
      showLaunchError('Preprocess or import a preprocessed experiment before launching the viewer.');
      return;
    }

    clearDatasetError();
    beginLaunchSession();
    setCurrentLayerVolumes({});
    setCurrentLayerPageTables({});
    setCurrentLayerBrickAtlases({});
    setCurrentBackgroundMasksByScale({});
    cancelAllWarmupRequests();
    setPlaybackWarmupFrames([]);
    setSelectedIndex(0);
    setIsPlaying(false);
    try {
      clearTextureCache();

      const initialTimeIndex = 0;
      const layerKeys = collectActiveLayerKeys(loadedChannelIds, channelLayersMap);
      setLaunchExpectedVolumeCount(layerKeys.length);
      const loadedEntries: LoadedLayerResources[] = [];
      for (let index = 0; index < layerKeys.length; index += 1) {
        const layerKey = layerKeys[index];
        const { volume, pageTable, brickAtlas } = await loadLayerTimepointResources(
          layerKey,
          initialTimeIndex
        );
        loadedEntries.push([layerKey, volume, pageTable, brickAtlas]);
        const nextLoaded = index + 1;
        setLaunchProgress({ loadedCount: nextLoaded, totalCount: layerKeys.length });
      }
      const loadedBackgroundMasksByScale = await loadBackgroundMasksForScaleLevels(
        collectActiveScaleLevels(loadedEntries)
      );
      const loadedVolumes = loadedEntries.reduce<Record<string, NormalizedVolume | null>>((acc, [layerKey, volume]) => {
        acc[layerKey] = volume;
        return acc;
      }, {});
      const loadedPageTables = loadedEntries.reduce<Record<string, VolumeBrickPageTable | null>>(
        (acc, [layerKey, _volume, pageTable]) => {
          acc[layerKey] = pageTable;
          return acc;
        },
        {}
      );
      const loadedBrickAtlases = loadedEntries.reduce<Record<string, VolumeBrickAtlas | null>>(
        (acc, [layerKey, _volume, _pageTable, brickAtlas]) => {
          acc[layerKey] = brickAtlas;
          return acc;
        },
        {}
      );

      setCurrentLayerVolumes(loadedVolumes);
      setCurrentLayerPageTables(loadedPageTables);
      setCurrentLayerBrickAtlases(loadedBrickAtlases);
      setCurrentBackgroundMasksByScale(loadedBackgroundMasksByScale);
      if (typeof volumeProvider.getDiagnostics === 'function') {
        setVolumeProviderDiagnostics(volumeProvider.getDiagnostics());
      }
      completeLaunchSession(layerKeys.length);
    } catch (error) {
      console.error('Failed to launch viewer', error);
      const message = error instanceof Error ? error.message : 'Failed to launch viewer.';
      failLaunchSession(message);
      showLaunchError(message);
    } finally {
      finishLaunchSessionAttempt();
    }
  }, [
    isLaunchingViewer,
    preprocessedExperiment,
    volumeProvider,
    showLaunchError,
    clearDatasetError,
    beginLaunchSession,
    setSelectedIndex,
    setIsPlaying,
    loadedChannelIds,
    channelLayersMap,
    setLaunchExpectedVolumeCount,
    setLaunchProgress,
    loadLayerTimepointResources,
    loadBackgroundMasksForScaleLevels,
    completeLaunchSession,
    failLaunchSession,
    finishLaunchSessionAttempt,
    cancelAllWarmupRequests
  ]);

  useEffect(() => {
    if (!isViewerLaunched || !volumeProvider || typeof volumeProvider.getDiagnostics !== 'function') {
      setVolumeProviderDiagnostics(null);
      return;
    }

    let active = true;
    const captureDiagnostics = () => {
      if (!active) {
        return;
      }
      try {
        setVolumeProviderDiagnostics(volumeProvider.getDiagnostics());
      } catch (error) {
        console.warn('Failed to capture volume provider diagnostics', error);
      }
    };

    captureDiagnostics();
    const intervalId = setInterval(captureDiagnostics, DIAGNOSTICS_POLL_INTERVAL_MS);
    return () => {
      active = false;
      clearInterval(intervalId);
    };
  }, [isViewerLaunched, volumeProvider]);

  useEffect(() => {
    return () => {
      volumeLoadAbortControllerRef.current?.abort();
      volumeLoadAbortControllerRef.current = null;
      cancelAllWarmupRequests();
    };
  }, [cancelAllWarmupRequests]);

  useEffect(() => {
    if (!isViewerLaunched || !volumeProvider) {
      volumeLoadAbortControllerRef.current?.abort();
      volumeLoadAbortControllerRef.current = null;
      lastLoadIntentRef.current = null;
      cancelAllWarmupRequests();
      backgroundMaskCacheRef.current = {};
      setCurrentBackgroundMasksByScale({});
      replacePlaybackWarmupFrames([]);
      return;
    }
    if (volumeTimepointCount === 0 || playbackLayerKeys.length === 0) {
      volumeLoadAbortControllerRef.current?.abort();
      volumeLoadAbortControllerRef.current = null;
      lastLoadIntentRef.current = null;
      cancelAllWarmupRequests();
      backgroundMaskCacheRef.current = {};
      setCurrentLayerVolumes({});
      setCurrentLayerPageTables({});
      setCurrentLayerBrickAtlases({});
      setCurrentBackgroundMasksByScale({});
      replacePlaybackWarmupFrames([]);
      return;
    }

    const clampedIndex = Math.max(0, Math.min(volumeTimepointCount - 1, selectedIndex));
    const desiredScaleSignature = playbackLayerKeys
      .map((layerKey) => {
        const desiredScaleLevel = resolveDesiredScaleLevel(layerKey);
        return `${layerKey}:${desiredScaleLevel}`;
      })
      .join('|');
    const loadIntentKey = `${clampedIndex}|${desiredScaleSignature}`;
    const promotableWarmupFrame =
      playbackWarmupFramesRef.current.find(
        (frame) => frame.timeIndex === clampedIndex && frame.scaleSignature === desiredScaleSignature
      ) ?? null;
    if (promotableWarmupFrame) {
      lastLoadIntentRef.current = loadIntentKey;
      setCurrentLayerVolumes(promotableWarmupFrame.layerVolumes);
      setCurrentLayerPageTables(promotableWarmupFrame.layerPageTables);
      setCurrentLayerBrickAtlases(promotableWarmupFrame.layerBrickAtlases);
      setCurrentBackgroundMasksByScale(promotableWarmupFrame.backgroundMasksByScale);
      lastWarmupIntentBySlotRef.current.delete(promotableWarmupFrame.slotIndex);
      replacePlaybackWarmupFrames(
        playbackWarmupFramesRef.current.filter((frame) => frame.slotIndex !== promotableWarmupFrame.slotIndex)
      );
      if (typeof volumeProvider.getDiagnostics === 'function') {
        setVolumeProviderDiagnostics(volumeProvider.getDiagnostics());
      }
      return;
    }
    if (lastLoadIntentRef.current === loadIntentKey) {
      return;
    }
    lastLoadIntentRef.current = loadIntentKey;

    const requestId = volumeLoadRequestRef.current + 1;
    volumeLoadRequestRef.current = requestId;
    volumeLoadAbortControllerRef.current?.abort();
    const requestAbortController = new AbortController();
    volumeLoadAbortControllerRef.current = requestAbortController;

    void (async () => {
      let loadCompleted = false;
      try {
        const entries = await Promise.all(
          playbackLayerKeys.map(async (layerKey) => {
            const { volume, pageTable, brickAtlas } = await loadLayerTimepointResources(
              layerKey,
              clampedIndex,
              { signal: requestAbortController.signal }
            );
            return [layerKey, volume, pageTable, brickAtlas] as const;
          })
        );

        if (
          requestAbortController.signal.aborted ||
          volumeLoadRequestRef.current !== requestId
        ) {
          return;
        }

        const nextVolumes = entries.reduce<Record<string, NormalizedVolume | null>>((acc, [layerKey, volume]) => {
          acc[layerKey] = volume;
          return acc;
        }, {});
        const nextPageTables = entries.reduce<Record<string, VolumeBrickPageTable | null>>(
          (acc, [layerKey, _volume, pageTable]) => {
            acc[layerKey] = pageTable;
            return acc;
          },
          {}
        );
        const nextBrickAtlases = entries.reduce<Record<string, VolumeBrickAtlas | null>>(
          (acc, [layerKey, _volume, _pageTable, brickAtlas]) => {
            acc[layerKey] = brickAtlas;
            return acc;
          },
          {}
        );
        const nextBackgroundMasksByScale = await loadBackgroundMasksForScaleLevels(
          collectActiveScaleLevels(entries),
          requestAbortController.signal
        );

        if (
          requestAbortController.signal.aborted ||
          volumeLoadRequestRef.current !== requestId
        ) {
          return;
        }

        setCurrentLayerVolumes(nextVolumes);
        setCurrentLayerPageTables(nextPageTables);
        setCurrentLayerBrickAtlases(nextBrickAtlases);
        setCurrentBackgroundMasksByScale(nextBackgroundMasksByScale);
        loadCompleted = true;
        if (typeof volumeProvider.getDiagnostics === 'function') {
          setVolumeProviderDiagnostics(volumeProvider.getDiagnostics());
        }
      } catch (error) {
        if (
          requestAbortController.signal.aborted ||
          volumeLoadRequestRef.current !== requestId ||
          isAbortLikeError(error)
        ) {
          return;
        }
        console.error('Failed to load timepoint volumes', error);
        lastLoadIntentRef.current = null;
        showLaunchErrorRef.current(error instanceof Error ? error.message : 'Failed to load timepoint volumes.');
      } finally {
        if (
          !loadCompleted &&
          volumeLoadRequestRef.current === requestId &&
          lastLoadIntentRef.current === loadIntentKey
        ) {
          lastLoadIntentRef.current = null;
        }
        if (volumeLoadAbortControllerRef.current === requestAbortController) {
          volumeLoadAbortControllerRef.current = null;
        }
      }
    })();
  }, [
    isViewerLaunched,
    volumeProvider,
    volumeTimepointCount,
    playbackLayerKeySignature,
    playbackWarmupFrames,
    selectedIndex,
    resolveDesiredScaleLevel,
    loadLayerTimepointResources,
    loadBackgroundMasksForScaleLevels,
    cancelAllWarmupRequests,
    replacePlaybackWarmupFrames
  ]);

  useEffect(() => {
    if (
      !isViewerLaunched ||
      !volumeProvider ||
      !isPlaying ||
      volumeTimepointCount <= 1 ||
      playbackLayerKeysRef.current.length === 0
    ) {
      cancelAllWarmupRequests();
      replacePlaybackWarmupFrames([]);
      return;
    }

    const clampedIndex = Math.max(0, Math.min(volumeTimepointCount - 1, selectedIndex));
    const warmupTimeIndices = collectPlaybackWarmupTimeIndices(
      clampedIndex,
      volumeTimepointCount,
      playbackWindow,
      PLAYBACK_WARMUP_SLOT_COUNT
    );
    if (warmupTimeIndices.length === 0) {
      cancelAllWarmupRequests();
      replacePlaybackWarmupFrames([]);
      return;
    }

    const warmupLayerKeys = playbackLayerKeysRef.current;
    const desiredScaleSignature = warmupLayerKeys
      .map((layerKey) => {
        const desiredScaleLevel = resolveDesiredScaleLevel(layerKey);
        return `${layerKey}:${desiredScaleLevel}`;
      })
      .join('|');
    const currentWarmupFrames = playbackWarmupFramesRef.current;
    const retainedFrames = currentWarmupFrames.filter(
      (frame) =>
        frame.scaleSignature === desiredScaleSignature &&
        warmupTimeIndices.includes(frame.timeIndex)
    );
    const retainedByTimeIndex = new Map(retainedFrames.map((frame) => [frame.timeIndex, frame]));
    const usedSlots = new Set(retainedFrames.map((frame) => frame.slotIndex));
    const availableSlots = Array.from({ length: PLAYBACK_WARMUP_SLOT_COUNT }, (_value, index) => index).filter(
      (slotIndex) => !usedSlots.has(slotIndex)
    );
    const assignments = warmupTimeIndices.flatMap((timeIndex) => {
      const existingFrame = retainedByTimeIndex.get(timeIndex) ?? null;
      const slotIndex = existingFrame?.slotIndex ?? availableSlots.shift();
      if (slotIndex === undefined) {
        return [];
      }
      return [{ timeIndex, slotIndex, existingFrame }] as const;
    });
    const desiredSlotSet = new Set(assignments.map(({ slotIndex }) => slotIndex));
    for (const frame of currentWarmupFrames) {
      const shouldRetainFrame =
        frame.scaleSignature === desiredScaleSignature &&
        warmupTimeIndices.includes(frame.timeIndex) &&
        desiredSlotSet.has(frame.slotIndex);
      if (!shouldRetainFrame) {
        cancelWarmupSlot(frame.slotIndex);
      }
    }

    replacePlaybackWarmupFrames(
      sortWarmupFramesByTargetOrder(
        assignments.flatMap(({ existingFrame }) => (existingFrame ? [existingFrame] : [])),
        warmupTimeIndices
      )
    );

    for (const { timeIndex, slotIndex, existingFrame } of assignments) {
      const warmupIntentKey = `${timeIndex}|${desiredScaleSignature}`;
      if (existingFrame) {
        lastWarmupIntentBySlotRef.current.set(slotIndex, warmupIntentKey);
        continue;
      }
      if (lastWarmupIntentBySlotRef.current.get(slotIndex) === warmupIntentKey) {
        continue;
      }

      cancelWarmupSlot(slotIndex);
      lastWarmupIntentBySlotRef.current.set(slotIndex, warmupIntentKey);
      const requestId = playbackWarmupRequestSequenceRef.current + 1;
      playbackWarmupRequestSequenceRef.current = requestId;
      const requestAbortController = new AbortController();
      playbackWarmupRequestBySlotRef.current.set(slotIndex, {
        requestId,
        abortController: requestAbortController
      });

      void (async () => {
        let warmupCompleted = false;
        try {
          const entries = await Promise.all(
            warmupLayerKeys.map(async (layerKey) => {
              const { volume, pageTable, brickAtlas } = await loadLayerTimepointResources(
                layerKey,
                timeIndex,
                { signal: requestAbortController.signal }
              );
              return [layerKey, volume, pageTable, brickAtlas] as const;
            })
          );

          const activeRequest = playbackWarmupRequestBySlotRef.current.get(slotIndex);
          if (
            requestAbortController.signal.aborted ||
            activeRequest?.requestId !== requestId
          ) {
            return;
          }

          const nextVolumes = entries.reduce<Record<string, NormalizedVolume | null>>((acc, [layerKey, volume]) => {
            acc[layerKey] = volume;
            return acc;
          }, {});
          const nextPageTables = entries.reduce<Record<string, VolumeBrickPageTable | null>>(
            (acc, [layerKey, _volume, pageTable]) => {
              acc[layerKey] = pageTable;
              return acc;
            },
            {}
          );
          const nextBrickAtlases = entries.reduce<Record<string, VolumeBrickAtlas | null>>(
            (acc, [layerKey, _volume, _pageTable, brickAtlas]) => {
              acc[layerKey] = brickAtlas;
              return acc;
            },
            {}
          );
          const nextBackgroundMasksByScale = await loadBackgroundMasksForScaleLevels(
            collectActiveScaleLevels(entries),
            requestAbortController.signal
          );

          if (
            requestAbortController.signal.aborted ||
            playbackWarmupRequestBySlotRef.current.get(slotIndex)?.requestId !== requestId
          ) {
            return;
          }

          const nextFrame: PlaybackWarmupFrameState = {
            slotIndex,
            timeIndex,
            scaleSignature: desiredScaleSignature,
            layerVolumes: nextVolumes,
            layerPageTables: nextPageTables,
            layerBrickAtlases: nextBrickAtlases,
            backgroundMasksByScale: nextBackgroundMasksByScale
          };
          setPlaybackWarmupFrames((current) => {
            const nextFrames = sortWarmupFramesByTargetOrder(
              [...current.filter((frame) => frame.slotIndex !== slotIndex), nextFrame].filter(
                (frame) =>
                  frame.scaleSignature === desiredScaleSignature &&
                  warmupTimeIndices.includes(frame.timeIndex)
              ),
              warmupTimeIndices
            );
            return arePlaybackWarmupFramesEquivalent(current, nextFrames) ? current : nextFrames;
          });
          warmupCompleted = true;
        } catch (error) {
          if (requestAbortController.signal.aborted || isAbortLikeError(error)) {
            return;
          }
          console.error('Failed to load playback warmup volumes', error);
          lastWarmupIntentBySlotRef.current.delete(slotIndex);
        } finally {
          const activeRequest = playbackWarmupRequestBySlotRef.current.get(slotIndex);
          if (activeRequest?.requestId === requestId) {
            playbackWarmupRequestBySlotRef.current.delete(slotIndex);
            if (!warmupCompleted && lastWarmupIntentBySlotRef.current.get(slotIndex) === warmupIntentKey) {
              lastWarmupIntentBySlotRef.current.delete(slotIndex);
            }
          }
        }
      })();
    }
  }, [
    isViewerLaunched,
    isPlaying,
    loadBackgroundMasksForScaleLevels,
    loadLayerTimepointResources,
    playbackLayerKeySignature,
    playbackWarmupFrames,
    playbackWindow,
    resolveDesiredScaleLevel,
    selectedIndex,
    volumeProvider,
    volumeTimepointCount,
    cancelAllWarmupRequests,
    cancelWarmupSlot,
    replacePlaybackWarmupFrames,
  ]);

  return {
    currentLayerVolumes,
    currentLayerPageTables,
    currentLayerBrickAtlases,
    currentBackgroundMasksByScale,
    playbackWarmupFrames,
    playbackWarmupTimeIndex,
    playbackWarmupLayerVolumes,
    playbackWarmupLayerPageTables,
    playbackWarmupLayerBrickAtlases,
    playbackWarmupBackgroundMasksByScale,
    volumeProviderDiagnostics,
    lodPolicyDiagnostics,
    setCurrentLayerVolumes,
    playbackLayerKeys,
    playbackAtlasScaleLevelByLayerKey,
    handleLaunchViewer
  };
}
