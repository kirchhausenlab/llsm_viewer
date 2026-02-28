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
  VolumeBrickPageTable,
  VolumeProvider,
  VolumeProviderDiagnostics
} from '../../../core/volumeProvider';
import type { NormalizedVolume } from '../../../core/volumeProcessing';
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
  channelActiveLayer: Record<string, string>;
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
const LOD_DEMOTE_COOLDOWN_MS = 2_000;
const LOD_MIN_PROJECTED_PIXELS_PER_VOXEL = 0.75;
const LOD_THRASH_AUTO_DISABLE_PER_MINUTE = 60;
const MAX_BRICK_ATLAS_BYTES_HINT_INTERACTIVE = 384 * 1024 * 1024;
const MAX_BRICK_ATLAS_BYTES_HINT_PLAYBACK = 192 * 1024 * 1024;
const MAX_VOLUME_BYTES_HINT_INTERACTIVE = 384 * 1024 * 1024;
const MAX_VOLUME_BYTES_HINT_PLAYBACK = 192 * 1024 * 1024;
const MAX_ADAPTIVE_DOWNSAMPLE_MULTIPLIER_PLAYBACK = 4;
const MAX_ADAPTIVE_DOWNSAMPLE_MULTIPLIER_INTERACTIVE = 2.5;
const CAMERA_PROJECTED_PIXELS_REFERENCE_DISTANCE = 1.2;
const CAMERA_PROJECTED_PIXELS_AT_REFERENCE = 1.4;

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
  channelLayersMap: Map<string, LoadedDatasetLayer[]>,
  channelActiveLayer: Record<string, string>
): string[] {
  const keys: string[] = [];
  for (const channelId of loadedChannelIds) {
    const channelLayers = channelLayersMap.get(channelId) ?? [];
    if (channelLayers.length === 0) {
      continue;
    }

    const selectedLayerKey = channelActiveLayer[channelId];
    const selectedLayer = selectedLayerKey
      ? channelLayers.find((layer) => layer.key === selectedLayerKey) ?? null
      : null;
    const resolvedLayerKey = selectedLayer?.key ?? selectDeterministicLayerKey(channelLayers);
    if (resolvedLayerKey) {
      keys.push(resolvedLayerKey);
    }
  }
  return keys;
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
    return volume.normalized.byteLength > 0;
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
      const useAtlas = preferBrickResidency && canUseAtlas && layer.depth > 1 && !layer.isSegmentation;
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
  channelActiveLayer,
  channelVisibility,
  layerChannelMap,
  preferBrickResidency,
  viewerCameraSample = null,
  volumeTimepointCount,
  selectedIndex,
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
  const [volumeProviderDiagnostics, setVolumeProviderDiagnostics] = useState<VolumeProviderDiagnostics | null>(null);
  const [lodPolicyDiagnostics, setLodPolicyDiagnostics] = useState<LODPolicyDiagnosticsSnapshot | null>(null);
  const volumeLoadRequestRef = useRef(0);
  const lastLoadIntentRef = useRef<string | null>(null);
  const volumeLoadAbortControllerRef = useRef<AbortController | null>(null);
  const showLaunchErrorRef = useRef(showLaunchError);
  const lodPolicyStartedAtMsRef = useRef<number>(nowMs());
  const lodPolicyThrashEventsRef = useRef<number[]>([]);
  const layerPolicyStateByLayerKeyRef = useRef<Map<string, LayerPolicyRuntimeState>>(new Map());
  const adaptivePolicyDisabledRef = useRef(false);
  const lod0Flags = useMemo(() => getLod0FeatureFlags(), []);
  const canUseAtlas = typeof volumeProvider?.getBrickAtlas === 'function';
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
      const fallbackBinaryDesired = (() => {
        const desired = isPlaying ? 1 : 0;
        let resolved = finestLevel;
        for (const level of levels) {
          if (level <= desired) {
            resolved = level;
          }
        }
        return resolved;
      })();
      if (!lod0Flags.adaptiveScaleSelector || adaptivePolicyDisabledRef.current) {
        return fallbackBinaryDesired;
      }

      const pressureVolume = volumeProviderDiagnostics?.cachePressure.volume ?? 0;
      const pressureChunk = volumeProviderDiagnostics?.cachePressure.chunk ?? 0;
      const pressure = Math.max(0, Math.min(1, (pressureVolume + pressureChunk) / 2));
      const missVolume = volumeProviderDiagnostics?.missRates.volume ?? 0;
      const missChunk = volumeProviderDiagnostics?.missRates.chunk ?? 0;
      const missRate = Math.max(0, Math.min(1, (missVolume + missChunk) / 2));

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
      const baseProjectedPixelsPerVoxel = Number.isFinite(projectedPixelsFromCamera)
        ? projectedPixelsFromCamera
        : isPlaying
          ? 1.1
          : 1.4;
      const motionPenalty = viewerCameraSample?.isMoving ? (isPlaying ? 0.82 : 0.9) : 1;
      const projectedPixelsPerVoxel =
        baseProjectedPixelsPerVoxel * motionPenalty * (1 - pressure * 0.2) * (1 - missRate * 0.1);

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
        levels.findIndex((level) => level === fallbackBinaryDesired)
      );
      const fallbackDownsampleMagnitude = downsampleMagnitude(
        layerScalesByLevelByKey.get(layerKey)?.get(fallbackBinaryDesired) ?? null
      );
      const maxAdaptiveDownsampleMagnitude =
        fallbackDownsampleMagnitude *
        (isPlaying ? MAX_ADAPTIVE_DOWNSAMPLE_MULTIPLIER_PLAYBACK : MAX_ADAPTIVE_DOWNSAMPLE_MULTIPLIER_INTERACTIVE);
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
        fallbackIndex + (isPlaying ? 2 : 1),
        magnitudeBoundedDemotionIndex
      );
      const projectedChoiceIndex = Math.max(
        0,
        levels.findIndex((level) => level === projectedChoice)
      );
      const pressureDemotionSteps =
        pressure >= 0.96 || missRate >= 0.92 ? 1 : pressure >= 0.88 || missRate >= 0.8 ? 1 : 0;
      projectedChoice =
        levels[Math.min(maxAdaptiveDemotionIndex, projectedChoiceIndex + (isPlaying ? pressureDemotionSteps : Math.min(pressureDemotionSteps, 1)))] ??
        projectedChoice;

      const previousState = layerPolicyStateByLayerKeyRef.current.get(layerKey);
      if (!previousState || previousState.activeScaleLevel === null) {
        return projectedChoice;
      }

      const activeScaleLevel = previousState.activeScaleLevel;
      if (projectedChoice === activeScaleLevel) {
        return projectedChoice;
      }
      const activeScaleIndex = levels.findIndex((level) => level === activeScaleLevel);
      const projectedScaleIndex = levels.findIndex((level) => level === projectedChoice);
      if (activeScaleIndex >= 0 && projectedScaleIndex >= 0 && Math.abs(projectedScaleIndex - activeScaleIndex) > 1) {
        const stepDirection = projectedScaleIndex > activeScaleIndex ? 1 : -1;
        projectedChoice = levels[activeScaleIndex + stepDirection] ?? projectedChoice;
      }

      const now = nowMs();
      const isPromotion = projectedChoice < activeScaleLevel;
      if (isPromotion) {
        const lastDemoteMs = previousState.lastDemoteMs ?? 0;
        if (now - lastDemoteMs < LOD_PROMOTE_COOLDOWN_MS) {
          return activeScaleLevel;
        }
      } else {
        const pressureAllowsDemotion = pressure >= 0.72;
        const lastPromoteMs = previousState.lastPromoteMs ?? 0;
        if (!pressureAllowsDemotion && now - lastPromoteMs < LOD_DEMOTE_COOLDOWN_MS) {
          return activeScaleLevel;
        }
      }

      return projectedChoice;
    },
    [
      isPlaying,
      layerScaleLevelsByKey,
      layerScalesByLevelByKey,
      lod0Flags.adaptiveScaleSelector,
      viewerCameraSample,
      volumeProviderDiagnostics
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
      const maxBrickAtlasBytesHint = isPlaying
        ? MAX_BRICK_ATLAS_BYTES_HINT_PLAYBACK
        : MAX_BRICK_ATLAS_BYTES_HINT_INTERACTIVE;
      const maxVolumeBytesHint = isPlaying
        ? MAX_VOLUME_BYTES_HINT_PLAYBACK
        : MAX_VOLUME_BYTES_HINT_INTERACTIVE;
      const knownLevels = (() => {
        const fromManifest = layerScaleLevelsByKey.get(layerKey);
        if (fromManifest && fromManifest.length > 0) {
          return fromManifest;
        }
        return desiredScaleLevel === 0 ? [0] : [0, desiredScaleLevel];
      })();
      const fallbackScaleLevel = knownLevels[knownLevels.length - 1] ?? desiredScaleLevel;
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
        // Keep atlas playback on the atlas/page-table path only.
        // Pulling full volumes here regresses playback throughput and cache miss diagnostics.
        const candidateScaleLevels = knownLevels.filter((level) => level >= desiredScaleLevel);
        if (candidateScaleLevels.length === 0) {
          candidateScaleLevels.push(...knownLevels);
        }

        let lastError: unknown = null;
        for (let index = 0; index < candidateScaleLevels.length; index += 1) {
          const scaleLevel = candidateScaleLevels[index] ?? desiredScaleLevel;
          throwIfAborted(signal);
          const scale = layerScalesByLevelByKey.get(layerKey)?.get(scaleLevel) ?? null;
          const sourceChannels = scale?.channels ?? 1;
          const textureChannels = getTextureChannelCountForSourceChannels(sourceChannels);

          if (typeof volumeProvider?.getBrickPageTable === 'function') {
            const pageTable = await volumeProvider.getBrickPageTable(layerKey, timeIndex, { scaleLevel, signal });
            throwIfAborted(signal);
            const [chunkDepth, chunkHeight, chunkWidth] = pageTable.chunkShape;
            const estimatedAtlasDepth = chunkDepth * pageTable.occupiedBrickCount;
            const estimatedAtlasBytes = chunkWidth * chunkHeight * estimatedAtlasDepth * textureChannels;
            if (estimatedAtlasBytes > maxBrickAtlasBytesHint) {
              continue;
            }
          }

          try {
            const atlas = await volumeProvider!.getBrickAtlas!(layerKey, timeIndex, { scaleLevel, signal });
            throwIfAborted(signal);
            if (!atlas.enabled) {
              continue;
            }
            if (atlas.data.byteLength > maxBrickAtlasBytesHint) {
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
              lastError = error;
              continue;
            }
            throw error;
          }
        }

        if (lastError instanceof Error) {
          throw lastError;
        }
        throw new Error(`Brick atlas is unavailable for layer "${layerKey}" at timepoint ${timeIndex}.`);
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
          const [volume, pageTable] = await Promise.all([
            volumeProvider!.getVolume(layerKey, timeIndex, { scaleLevel, signal }),
            typeof volumeProvider?.getBrickPageTable === 'function'
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
      isPlaying,
      layerScaleLevelsByKey,
      layerScalesByLevelByKey,
      resolveDesiredScaleLevel,
      updateLayerPolicyState,
      volumeProvider,
      lod0Flags.promotionStateMachine,
      volumeProviderDiagnostics
    ]
  );

  const playbackLayerKeys = useMemo(() => {
    if (!isViewerLaunched || loadedChannelIds.length === 0) {
      return [] as string[];
    }

    const keys = collectActiveLayerKeys(loadedChannelIds, channelLayersMap, channelActiveLayer).filter((layerKey) => {
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
    channelActiveLayer,
    layerChannelMap,
    channelVisibility
  ]);
  const playbackLayerKeySignature = useMemo(() => playbackLayerKeys.join('\u001f'), [playbackLayerKeys]);
  const playbackAtlasScaleLevelByLayerKey = useMemo(() => {
    const byKey: Record<string, number> = {};
    for (const layerKey of playbackLayerKeys) {
      const layerPolicy = layerPolicyStateByLayerKeyRef.current.get(layerKey);
      const desiredScaleLevel = resolveDesiredScaleLevel(layerKey);
      if (!isPlaying) {
        byKey[layerKey] = desiredScaleLevel;
        continue;
      }

      const levels = layerScaleLevelsByKey.get(layerKey) ?? [desiredScaleLevel];
      let playbackBaselineScaleLevel = levels[0] ?? desiredScaleLevel;
      for (const level of levels) {
        if (level <= 1) {
          playbackBaselineScaleLevel = level;
        }
      }
      const activeScaleLevel = layerPolicy?.activeScaleLevel;
      const playbackGuardScaleLevel =
        activeScaleLevel == null
          ? playbackBaselineScaleLevel
          : Math.max(playbackBaselineScaleLevel, activeScaleLevel);
      byKey[layerKey] = Math.max(desiredScaleLevel, playbackGuardScaleLevel);
    }
    return byKey;
  }, [isPlaying, layerScaleLevelsByKey, lodPolicyDiagnostics, playbackLayerKeys, resolveDesiredScaleLevel]);

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
    setSelectedIndex(0);
    setIsPlaying(false);
    try {
      clearTextureCache();

      const initialTimeIndex = 0;
      const layerKeys = collectActiveLayerKeys(loadedChannelIds, channelLayersMap, channelActiveLayer);
      setLaunchExpectedVolumeCount(layerKeys.length);

      const loadedVolumes: Record<string, NormalizedVolume | null> = {};
      const loadedPageTables: Record<string, VolumeBrickPageTable | null> = {};
      const loadedBrickAtlases: Record<string, VolumeBrickAtlas | null> = {};
      for (let index = 0; index < layerKeys.length; index++) {
        const layerKey = layerKeys[index];
        const { volume, pageTable, brickAtlas } = await loadLayerTimepointResources(
          layerKey,
          initialTimeIndex
        );
        loadedVolumes[layerKey] = volume;
        loadedPageTables[layerKey] = pageTable;
        loadedBrickAtlases[layerKey] = brickAtlas;
        const nextLoaded = index + 1;
        setLaunchProgress({ loadedCount: nextLoaded, totalCount: layerKeys.length });
      }

      setCurrentLayerVolumes(loadedVolumes);
      setCurrentLayerPageTables(loadedPageTables);
      setCurrentLayerBrickAtlases(loadedBrickAtlases);
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
    channelActiveLayer,
    setLaunchExpectedVolumeCount,
    setLaunchProgress,
    loadLayerTimepointResources,
    completeLaunchSession,
    failLaunchSession,
    finishLaunchSessionAttempt
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
    if (!isViewerLaunched || !volumeProvider) {
      volumeLoadAbortControllerRef.current?.abort();
      volumeLoadAbortControllerRef.current = null;
      lastLoadIntentRef.current = null;
      return;
    }
    if (volumeTimepointCount === 0 || playbackLayerKeys.length === 0) {
      volumeLoadAbortControllerRef.current?.abort();
      volumeLoadAbortControllerRef.current = null;
      lastLoadIntentRef.current = null;
      setCurrentLayerVolumes({});
      setCurrentLayerPageTables({});
      setCurrentLayerBrickAtlases({});
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
    if (lastLoadIntentRef.current === loadIntentKey) {
      return;
    }
    lastLoadIntentRef.current = loadIntentKey;

    const requestId = volumeLoadRequestRef.current + 1;
    volumeLoadRequestRef.current = requestId;
    let cancelled = false;
    volumeLoadAbortControllerRef.current?.abort();
    const requestAbortController = new AbortController();
    volumeLoadAbortControllerRef.current = requestAbortController;

    void (async () => {
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
          cancelled ||
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

        setCurrentLayerVolumes(nextVolumes);
        setCurrentLayerPageTables(nextPageTables);
        setCurrentLayerBrickAtlases(nextBrickAtlases);
        if (typeof volumeProvider.getDiagnostics === 'function') {
          setVolumeProviderDiagnostics(volumeProvider.getDiagnostics());
        }
      } catch (error) {
        if (
          cancelled ||
          requestAbortController.signal.aborted ||
          volumeLoadRequestRef.current !== requestId ||
          isAbortLikeError(error)
        ) {
          return;
        }
        console.error('Failed to load timepoint volumes', error);
        lastLoadIntentRef.current = null;
        showLaunchErrorRef.current(error instanceof Error ? error.message : 'Failed to load timepoint volumes.');
      }
    })();

    return () => {
      cancelled = true;
      requestAbortController.abort();
      if (volumeLoadAbortControllerRef.current === requestAbortController) {
        volumeLoadAbortControllerRef.current = null;
      }
    };
  }, [
    isViewerLaunched,
    volumeProvider,
    volumeTimepointCount,
    playbackLayerKeySignature,
    selectedIndex,
    resolveDesiredScaleLevel,
    loadLayerTimepointResources
  ]);

  return {
    currentLayerVolumes,
    currentLayerPageTables,
    currentLayerBrickAtlases,
    volumeProviderDiagnostics,
    lodPolicyDiagnostics,
    setCurrentLayerVolumes,
    playbackLayerKeys,
    playbackAtlasScaleLevelByLayerKey,
    handleLaunchViewer
  };
}
