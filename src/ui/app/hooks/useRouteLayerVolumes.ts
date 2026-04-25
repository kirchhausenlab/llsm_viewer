import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';

import { clearTextureCache } from '../../../core/textureCache';
import { DEFAULT_PLAYBACK_BUFFER_FRAMES } from '../../../shared/utils/viewerPlayback';
import type { LODPolicyDiagnosticsSnapshot } from '../../../core/lodPolicyDiagnostics';
import { getLod0FeatureFlags } from '../../../config/lod0Flags';
import type {
  VolumeBrickAtlas,
  VolumeBackgroundMask,
  VolumeBrickPageTable,
  VolumeProviderDiagnostics
} from '../../../core/volumeProvider';
import type { NormalizedVolume } from '../../../core/volumeProcessing';
import { isAbortLikeError, throwIfAborted } from '../../../shared/utils/abort';
import {
  isSparseSegmentationLayerManifest,
  type PreprocessedAnyLayerScaleManifestEntry
} from '../../../shared/utils/preprocessedDataset/types';
import { createLodPolicyController, type LayerPolicyRuntimeState } from '../volume-loading/lodPolicyController';
import {
  DIAGNOSTICS_POLL_INTERVAL_MS,
  HTTP_INITIAL_LAUNCH_MAX_DATA_CHUNKS,
  MAX_BRICK_ATLAS_BYTES_HINT,
  MAX_BRICK_ATLAS_DEPTH_HINT,
  MAX_VOLUME_BYTES_HINT,
  arePlaybackWarmupFramesEquivalent,
  collectActiveScaleLevels,
  collectPlaybackWarmupTimeIndices,
  collectVisibleLayerKeys,
  estimateDataChunkCount,
  isAllocationLikeError,
  isPromotionReadyForResource,
  nowMs,
  sortWarmupFramesByTargetOrder
} from '../volume-loading/policy';
import type { LayerResidencyPreference, ResidencyDecision } from '../volume-loading/residencyPolicy';
import {
  buildLayerResidencyPreferenceMap,
  buildPreferredResidencyDecision,
  collectResidencyDecisionSignature,
  resolveScaleAwareResidencyDecision
} from '../volume-loading/residencyPolicy';
import type {
  LaunchResourceLoadStrategy,
  LaunchViewerOptions,
  PlaybackWarmupFrameState,
  RouteLayerVolumesState,
  UseRouteLayerVolumesOptions
} from '../volume-loading/types';

export type { PlaybackWarmupFrameState } from '../volume-loading/types';

export function useRouteLayerVolumes({
  isViewerLaunched,
  isLaunchingViewer,
  isPerformanceMode = false,
  isPlaying = false,
  isPlaybackStartPending = false,
  preprocessedExperiment,
  volumeProvider,
  loadedChannelIds,
  channelLayersMap,
  channelVisibility,
  layerChannelMap,
  preferBrickResidency,
  projectionMode = 'perspective',
  viewerCameraSample = null,
  volumeTimepointCount,
  playbackBufferFrameCount = DEFAULT_PLAYBACK_BUFFER_FRAMES,
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
  showLaunchError,
  onLaunchLayerVolumesResolved
}: UseRouteLayerVolumesOptions): RouteLayerVolumesState {
  const [currentLayerResidencyDecisions, setCurrentLayerResidencyDecisions] = useState<
    Record<string, ResidencyDecision | null>
  >({});
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
  const currentLoadedTimeIndexRef = useRef<number | null>(null);
  const volumeLoadAbortControllerRef = useRef<AbortController | null>(null);
  const volumeLoadAbortControllersRef = useRef<Set<AbortController>>(new Set());
  const playbackWarmupFramesRef = useRef<PlaybackWarmupFrameState[]>([]);
  const playbackWarmupRequestSequenceRef = useRef(0);
  const playbackWarmupRequestBySlotRef = useRef<Map<number, { requestId: number; abortController: AbortController }>>(
    new Map()
  );
  const lastWarmupIntentBySlotRef = useRef<Map<number, string>>(new Map());
  const backgroundMaskCacheRef = useRef<Record<number, VolumeBackgroundMask | null>>({});
  const playbackLayerKeysRef = useRef<string[]>([]);
  const layerResidencyPreferenceDebugRef = useRef<Record<string, LayerResidencyPreference>>({});
  const playbackResidencyDecisionDebugRef = useRef<Record<string, ResidencyDecision>>({});
  const previousIsPlayingRef = useRef<boolean>(isPlaying);
  const showLaunchErrorRef = useRef(showLaunchError);
  const volumeProviderDiagnosticsRef = useRef<VolumeProviderDiagnostics | null>(null);
  const lodPolicyStartedAtMsRef = useRef<number>(nowMs());
  const lodPolicyThrashEventsRef = useRef<number[]>([]);
  const layerPolicyStateByLayerKeyRef = useRef<Map<string, LayerPolicyRuntimeState>>(new Map());
  const adaptivePolicyDisabledRef = useRef(false);
  const lod0Flags = useMemo(() => getLod0FeatureFlags(), []);
  const canUseAtlas = typeof volumeProvider?.getBrickAtlas === 'function';
  const normalizedPlaybackBufferFrameCount = Math.max(0, Math.floor(playbackBufferFrameCount));
  const isPlaybackWarmupActive = isPlaying || isPlaybackStartPending;
  const startupWarmupFrameCount = isPlaybackStartPending
    ? Math.min(1, normalizedPlaybackBufferFrameCount)
    : normalizedPlaybackBufferFrameCount;
  useEffect(() => {
    playbackWarmupFramesRef.current = playbackWarmupFrames;
  }, [playbackWarmupFrames]);
  useEffect(() => {
    volumeProviderDiagnosticsRef.current = volumeProviderDiagnostics;
  }, [volumeProviderDiagnostics]);
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const buildWarmupDebugSummary = () => ({
      canUseAtlas,
      layerResidencyPreferenceByKey: layerResidencyPreferenceDebugRef.current,
      playbackResidencyDecisionByLayerKey: playbackResidencyDecisionDebugRef.current,
      isPlaybackWarmupActive,
      normalizedPlaybackBufferFrameCount,
      startupWarmupFrameCount,
      currentLayerResidencyDecisions,
      currentLayerSources: Object.fromEntries(
        playbackLayerKeysRef.current.map((layerKey) => [
          layerKey,
          {
            volumeScaleLevel: currentLayerVolumes[layerKey]?.scaleLevel ?? null,
            pageTableScaleLevel: currentLayerPageTables[layerKey]?.scaleLevel ?? null,
            brickAtlasScaleLevel: currentLayerBrickAtlases[layerKey]?.scaleLevel ?? null,
            hasVolume: currentLayerVolumes[layerKey] !== undefined && currentLayerVolumes[layerKey] !== null,
            hasBrickAtlas:
              currentLayerBrickAtlases[layerKey] !== undefined && currentLayerBrickAtlases[layerKey] !== null,
          },
        ])
      ),
      playbackWarmupFrames: playbackWarmupFramesRef.current.map((frame) => ({
        slotIndex: frame.slotIndex,
        timeIndex: frame.timeIndex,
        scaleSignature: frame.scaleSignature,
      })),
      inFlightWarmupSlots: Array.from(playbackWarmupRequestBySlotRef.current.entries()).map(([slotIndex, request]) => ({
        slotIndex,
        requestId: request.requestId,
        aborted: request.abortController.signal.aborted,
      })),
      warmupIntentBySlot: Array.from(lastWarmupIntentBySlotRef.current.entries()).map(([slotIndex, intent]) => ({
        slotIndex,
        intent,
      })),
      playbackLayerKeys: playbackLayerKeysRef.current,
    });
    (window as Window & { __LLSM_ROUTE_WARMUP_DEBUG__?: (() => unknown) | null }).__LLSM_ROUTE_WARMUP_DEBUG__ =
      buildWarmupDebugSummary;
    return () => {
      if (
        (window as Window & { __LLSM_ROUTE_WARMUP_DEBUG__?: (() => unknown) | null }).__LLSM_ROUTE_WARMUP_DEBUG__ ===
        buildWarmupDebugSummary
      ) {
        delete (window as Window & { __LLSM_ROUTE_WARMUP_DEBUG__?: (() => unknown) | null }).__LLSM_ROUTE_WARMUP_DEBUG__;
      }
    };
  }, [
    currentLayerBrickAtlases,
    currentLayerPageTables,
    currentLayerResidencyDecisions,
    currentLayerVolumes,
    isPlaybackWarmupActive,
    canUseAtlas,
    normalizedPlaybackBufferFrameCount,
    startupWarmupFrameCount,
  ]);
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
  const cancelAllCurrentLoadRequests = useCallback(() => {
    for (const controller of volumeLoadAbortControllersRef.current) {
      controller.abort();
    }
    volumeLoadAbortControllersRef.current.clear();
    volumeLoadAbortControllerRef.current = null;
  }, []);
  const replacePlaybackWarmupFrames = useCallback((
    nextFramesOrUpdater:
      | PlaybackWarmupFrameState[]
      | ((current: PlaybackWarmupFrameState[]) => PlaybackWarmupFrameState[])
  ) => {
    setPlaybackWarmupFrames((current) => {
      const nextFrames =
        typeof nextFramesOrUpdater === 'function' ? nextFramesOrUpdater(current) : nextFramesOrUpdater;
      return arePlaybackWarmupFramesEquivalent(current, nextFrames) ? current : nextFrames;
    });
  }, []);
  const layerScaleLevelsByKey = useMemo(() => {
    const map = new Map<string, number[]>();
    const manifest = preprocessedExperiment?.manifest;
    if (!manifest) {
      return map;
    }
    for (const channel of manifest.dataset.channels) {
      for (const layer of channel.layers) {
        const scales = isSparseSegmentationLayerManifest(layer) ? layer.sparse.scales : layer.zarr.scales;
        const levels = Array.from(new Set(scales.map((scale) => scale.level))).sort((left, right) => left - right);
        map.set(layer.key, levels.length > 0 ? levels : [0]);
      }
    }
    return map;
  }, [preprocessedExperiment?.manifest]);
  const layerScalesByLevelByKey = useMemo(() => {
    const map = new Map<string, Map<number, PreprocessedAnyLayerScaleManifestEntry>>();
    const manifest = preprocessedExperiment?.manifest;
    if (!manifest) {
      return map;
    }
    for (const channel of manifest.dataset.channels) {
      for (const layer of channel.layers) {
        const byLevel = new Map<number, PreprocessedAnyLayerScaleManifestEntry>();
        const scales = isSparseSegmentationLayerManifest(layer) ? layer.sparse.scales : layer.zarr.scales;
        for (const scale of scales) {
          byLevel.set(scale.level, scale);
        }
        map.set(layer.key, byLevel);
      }
    }
    return map;
  }, [preprocessedExperiment?.manifest]);
  const {
    resolveDesiredScaleLevel,
    resetLodPolicyState,
    updateLayerPolicyState
  } = useMemo(
    () =>
      createLodPolicyController({
        layerScaleLevelsByKey,
        layerScalesByLevelByKey,
        isPerformanceMode,
        isPlaying,
        isPlaybackStartPending,
        viewerCameraSample,
        lod0Flags,
        layerPolicyStateByLayerKeyRef,
        lodPolicyStartedAtMsRef,
        lodPolicyThrashEventsRef,
        adaptivePolicyDisabledRef,
        setLodPolicyDiagnostics
      }),
    [
      isPerformanceMode,
      isPlaying,
      isPlaybackStartPending,
      layerScaleLevelsByKey,
      layerScalesByLevelByKey,
      lod0Flags,
      viewerCameraSample
    ]
  );
  const layerResidencyPreferenceByKey = useMemo(
    () =>
      buildLayerResidencyPreferenceMap({
        channelLayersMap,
        preferBrickResidency,
        canUseAtlas,
        projectionMode,
      }),
    [canUseAtlas, channelLayersMap, preferBrickResidency, projectionMode]
  );
  const layerResidencyPreferenceByKeyRef = useRef<Map<string, LayerResidencyPreference>>(
    buildLayerResidencyPreferenceMap({
      channelLayersMap,
      preferBrickResidency,
      canUseAtlas,
      projectionMode,
    })
  );

  useEffect(() => {
    showLaunchErrorRef.current = showLaunchError;
  }, [showLaunchError]);

  useEffect(() => {
    layerResidencyPreferenceByKeyRef.current = layerResidencyPreferenceByKey;
    layerResidencyPreferenceDebugRef.current = Object.fromEntries(layerResidencyPreferenceByKey.entries());
  }, [layerResidencyPreferenceByKey]);

  useEffect(() => {
    if (isViewerLaunched) {
      return;
    }
    lastLoadIntentRef.current = null;
    resetLodPolicyState();
  }, [isViewerLaunched, resetLodPolicyState]);

  useEffect(() => {
    const wasPlaying = previousIsPlayingRef.current;
    previousIsPlayingRef.current = isPlaying;
    if (!wasPlaying || isPlaying) {
      return;
    }
    // Playback stop should not inherit transient playback policy state.
    const activeController = volumeLoadAbortControllerRef.current;
    activeController?.abort();
    if (activeController) {
      volumeLoadAbortControllersRef.current.delete(activeController);
    }
    volumeLoadAbortControllerRef.current = null;
    lastLoadIntentRef.current = null;
    currentLoadedTimeIndexRef.current = null;
    resetLodPolicyState();
  }, [isPlaying, resetLodPolicyState]);

  useEffect(() => {
    if (!isPlaybackStartPending) {
      return;
    }
    cancelAllCurrentLoadRequests();
    lastLoadIntentRef.current = null;
  }, [cancelAllCurrentLoadRequests, isPlaybackStartPending]);

  const loadLayerTimepointResources = useCallback(
    async (
      layerKey: string,
      timeIndex: number,
      options?: {
        signal?: AbortSignal | null;
        strategy?: LaunchResourceLoadStrategy;
        performanceMode?: boolean;
        includeHistogram?: boolean;
      }
    ): Promise<{
      decision: ResidencyDecision;
      volume: NormalizedVolume | null;
      pageTable: VolumeBrickPageTable | null;
      brickAtlas: VolumeBrickAtlas | null;
    }> => {
      const signal = options?.signal ?? null;
      const strategy = options?.strategy ?? 'default';
      const performanceMode = Boolean(options?.performanceMode ?? isPerformanceMode);
      const includeHistogram = options?.includeHistogram !== false;
      throwIfAborted(signal);
      const loadStartedAtMs = nowMs();
      const baseDesiredScaleLevel = resolveDesiredScaleLevel(layerKey, { performanceMode });
      const desiredScaleLevel =
        strategy === 'http-initial'
          ? (() => {
              const levels = layerScaleLevelsByKey.get(layerKey) ?? [baseDesiredScaleLevel];
              let hasChunkMetadata = false;
              for (const level of levels) {
                if (level < baseDesiredScaleLevel) {
                  continue;
                }
                const scale = layerScalesByLevelByKey.get(layerKey)?.get(level) ?? null;
                const estimatedChunkCount = estimateDataChunkCount(scale);
                if (estimatedChunkCount === null) {
                  continue;
                }
                hasChunkMetadata = true;
                if (estimatedChunkCount <= HTTP_INITIAL_LAUNCH_MAX_DATA_CHUNKS) {
                  return level;
                }
              }
              if (!hasChunkMetadata) {
                return baseDesiredScaleLevel;
              }
              return levels[levels.length - 1] ?? baseDesiredScaleLevel;
            })()
          : baseDesiredScaleLevel;
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
      const preferredScale = layerScalesByLevelByKey.get(layerKey)?.get(desiredScaleLevel) ?? null;
      const isSparseSegmentationAtlasOnly = Boolean(preferredScale && 'brickSize' in preferredScale);
      const preferredDecision = buildPreferredResidencyDecision({
        scaleLevel: desiredScaleLevel,
        preference: layerResidencyPreferenceByKeyRef.current.get(layerKey) ?? null,
        scale: preferredScale,
        playbackActive: isPlaying || isPlaybackStartPending,
      });
      const lastCommittedScaleLevel =
        layerPolicyStateByLayerKeyRef.current.get(layerKey)?.activeScaleLevel ?? null;
      updateLayerPolicyState({
        layerKey,
        desiredScaleLevel,
        activeScaleLevel: lastCommittedScaleLevel,
        fallbackScaleLevel,
        readyLatencyMs: null,
        promotionStateOverride: 'warming',
      });
      const shouldLoadBrickAtlas =
        (strategy !== 'http-initial' || isSparseSegmentationAtlasOnly) &&
        preferredDecision.mode === 'atlas' &&
        typeof volumeProvider?.getBrickAtlas === 'function';

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
          if (typeof volumeProvider?.getBrickPageTable === 'function') {
            const pageTable = await volumeProvider.getBrickPageTable(layerKey, timeIndex, { scaleLevel, signal });
            throwIfAborted(signal);
            prefetchedPageTablesByScale.set(scaleLevel, pageTable);
            const resolvedDecision = resolveScaleAwareResidencyDecision({
              preferredDecision: {
                ...preferredDecision,
                scaleLevel,
              },
              scale,
              pageTable,
              playbackActive: isPlaying || isPlaybackStartPending,
            });
            if (resolvedDecision.mode !== 'atlas') {
              if (isSparseSegmentationAtlasOnly) {
                continue;
              }
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
              if (isSparseSegmentationAtlasOnly) {
                const readyLatencyMs = Math.max(0, nowMs() - loadStartedAtMs);
                updateLayerPolicyState({
                  layerKey,
                  desiredScaleLevel,
                  activeScaleLevel: atlas.scaleLevel,
                  fallbackScaleLevel,
                  readyLatencyMs,
                  promotionStateOverride: lod0Flags.promotionStateMachine ? 'promoted' : undefined
                });
                return {
                  decision: {
                    ...preferredDecision,
                    scaleLevel: atlas.scaleLevel,
                    rationale: preferredDecision.rationale,
                  },
                  volume: null,
                  pageTable: atlas.pageTable,
                  brickAtlas: atlas
                };
              }
              if (isDesiredScaleLevel) {
                break;
              }
              continue;
            }
            if (atlas.data.byteLength > maxBrickAtlasBytesHint) {
              if (isSparseSegmentationAtlasOnly) {
                return {
                  decision: {
                    ...preferredDecision,
                    scaleLevel: atlas.scaleLevel,
                    rationale: preferredDecision.rationale,
                  },
                  volume: null,
                  pageTable: atlas.pageTable,
                  brickAtlas: atlas
                };
              }
              if (isDesiredScaleLevel) {
                break;
              }
              continue;
            }
            if (atlas.depth > MAX_BRICK_ATLAS_DEPTH_HINT) {
              if (isSparseSegmentationAtlasOnly) {
                return {
                  decision: {
                    ...preferredDecision,
                    scaleLevel: atlas.scaleLevel,
                    rationale: preferredDecision.rationale,
                  },
                  volume: null,
                  pageTable: atlas.pageTable,
                  brickAtlas: atlas
                };
              }
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
                cachePressure: volumeProviderDiagnosticsRef.current?.cachePressure ?? null
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
              decision: {
                ...preferredDecision,
                scaleLevel: atlas.scaleLevel,
                rationale: preferredDecision.rationale,
              },
              volume: null,
              pageTable: atlas.pageTable,
              brickAtlas: atlas
            };
          } catch (error) {
            if (isAllocationLikeError(error)) {
              if (isSparseSegmentationAtlasOnly) {
                throw error;
              }
              if (isDesiredScaleLevel) {
                break;
              }
              continue;
            }
            throw error;
          }
        }
      }

      if (isSparseSegmentationAtlasOnly) {
        throw new Error(`Sparse segmentation atlas is unavailable for layer "${layerKey}" at timepoint ${timeIndex}.`);
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
        const estimatedVolumeBytes =
          scale ? scale.width * scale.height * scale.depth * ('channels' in scale ? scale.channels : 1) : 0;
        if (!isLastCandidate && estimatedVolumeBytes > maxVolumeBytesHint) {
          continue;
        }

        try {
          const prefetchedPageTable = prefetchedPageTablesByScale.get(scaleLevel) ?? null;
          // Direct-volume rendering can start without page-table metadata. Reuse an
          // already-fetched table from atlas probing, but do not block on one here.
          const volume = await volumeProvider!.getVolume(layerKey, timeIndex, {
            scaleLevel,
            signal,
            includeHistogram,
          });
          throwIfAborted(signal);
          const activeScaleLevel = volume.scaleLevel ?? scaleLevel;
          const resolvedDecision: ResidencyDecision = {
            mode: 'volume',
            scaleLevel: activeScaleLevel,
            rationale:
              preferredDecision.mode === 'atlas' && activeScaleLevel === desiredScaleLevel
                ? 'atlas-fallback-volume-load'
                : preferredDecision.rationale,
          };
          const readyLatencyMs = Math.max(0, nowMs() - loadStartedAtMs);
          const readinessPassed =
            activeScaleLevel === desiredScaleLevel &&
            isPromotionReadyForResource({
              volume,
              pageTable: prefetchedPageTable,
              brickAtlas: null,
              cachePressure: volumeProviderDiagnosticsRef.current?.cachePressure ?? null
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
            decision: resolvedDecision,
            volume,
            pageTable: prefetchedPageTable,
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
      isPerformanceMode,
      layerScaleLevelsByKey,
      layerScalesByLevelByKey,
      resolveDesiredScaleLevel,
      updateLayerPolicyState,
      volumeProvider,
      lod0Flags.promotionStateMachine
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

    return collectVisibleLayerKeys({
      loadedChannelIds,
      channelLayersMap,
      layerChannelMap,
      channelVisibility
    });
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
  const playbackResidencyDecisionByLayerKey = useMemo(() => {
    const byKey: Record<string, ResidencyDecision> = {};
    for (const layerKey of playbackLayerKeys) {
      const desiredScaleLevel = resolveDesiredScaleLevel(layerKey);
      byKey[layerKey] = buildPreferredResidencyDecision({
        scaleLevel: desiredScaleLevel,
        preference: layerResidencyPreferenceByKey.get(layerKey) ?? null,
        scale: layerScalesByLevelByKey.get(layerKey)?.get(desiredScaleLevel) ?? null,
        playbackActive: true,
      });
    }
    return byKey;
  }, [layerResidencyPreferenceByKey, layerScalesByLevelByKey, playbackLayerKeys, resolveDesiredScaleLevel]);
  const playbackAtlasScaleLevelByLayerKey = useMemo(() => {
    const byKey: Record<string, number> = {};
    for (const layerKey of playbackLayerKeys) {
      byKey[layerKey] = playbackResidencyDecisionByLayerKey[layerKey]?.scaleLevel ?? 0;
    }
    return byKey;
  }, [playbackLayerKeys, playbackResidencyDecisionByLayerKey]);
  const playbackResidencyDecisionByLayerKeyRef = useRef<Record<string, ResidencyDecision>>(
    playbackResidencyDecisionByLayerKey
  );
  const playbackResidencyDecisionSignature = useMemo(
    () =>
      collectResidencyDecisionSignature({
        layerKeys: playbackLayerKeys,
        residencyDecisionByLayerKey: playbackResidencyDecisionByLayerKey,
      }),
    [playbackLayerKeys, playbackResidencyDecisionByLayerKey]
  );
  useEffect(() => {
    playbackResidencyDecisionByLayerKeyRef.current = playbackResidencyDecisionByLayerKey;
    playbackResidencyDecisionDebugRef.current = playbackResidencyDecisionByLayerKey;
  }, [playbackResidencyDecisionByLayerKey]);

  const handleLaunchViewer = useCallback(async (options?: LaunchViewerOptions) => {
    if (isLaunchingViewer) {
      return;
    }

    if (!preprocessedExperiment || !volumeProvider) {
      showLaunchError('Preprocess or import a preprocessed experiment before launching the viewer.');
      return;
    }

    const performanceMode = Boolean(options?.performanceMode);
    clearDatasetError();
    beginLaunchSession({ performanceMode });
    setCurrentLayerResidencyDecisions({});
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
      const layerKeys = collectVisibleLayerKeys({
        loadedChannelIds,
        channelLayersMap,
        layerChannelMap,
        channelVisibility
      });
      const launchStrategy: LaunchResourceLoadStrategy =
        preprocessedExperiment.storageHandle?.backend === 'http' ? 'http-initial' : 'default';
      const launchResidencyDecisionByLayerKey = Object.fromEntries(
        layerKeys.map((layerKey) => {
          const desiredScaleLevel = resolveDesiredScaleLevel(layerKey, { performanceMode });
          const decision = buildPreferredResidencyDecision({
            scaleLevel: desiredScaleLevel,
            preference: layerResidencyPreferenceByKeyRef.current.get(layerKey) ?? null,
            scale: layerScalesByLevelByKey.get(layerKey)?.get(desiredScaleLevel) ?? null,
            playbackActive: false,
          });
          return [layerKey, decision];
        })
      ) as Record<string, ResidencyDecision>;
      const launchIntentKey = `${initialTimeIndex}|${collectResidencyDecisionSignature({
        layerKeys,
        residencyDecisionByLayerKey: launchResidencyDecisionByLayerKey,
      })}`;
      setLaunchExpectedVolumeCount(layerKeys.length);
      let completedLayerCount = 0;
      // Only gate launch on the resources required for the first frame. The
      // steady-state loader fills in non-critical metadata after mount.
      const loadedEntries = await Promise.all(
        layerKeys.map(async (layerKey) => {
          const { decision, volume, pageTable, brickAtlas } = await loadLayerTimepointResources(
            layerKey,
            initialTimeIndex,
            { strategy: launchStrategy, performanceMode }
          );
          completedLayerCount += 1;
          setLaunchProgress({ loadedCount: completedLayerCount, totalCount: layerKeys.length });
          return [layerKey, decision, volume, pageTable, brickAtlas] as const;
        })
      );
      const loadedDecisions = loadedEntries.reduce<Record<string, ResidencyDecision | null>>((acc, [layerKey, decision]) => {
        acc[layerKey] = decision;
        return acc;
      }, {});
      const loadedVolumes = loadedEntries.reduce<Record<string, NormalizedVolume | null>>((acc, [layerKey, _decision, volume]) => {
        acc[layerKey] = volume;
        return acc;
      }, {});
      const loadedPageTables = loadedEntries.reduce<Record<string, VolumeBrickPageTable | null>>(
        (acc, [layerKey, _decision, _volume, pageTable]) => {
          acc[layerKey] = pageTable;
          return acc;
        },
        {}
      );
      const loadedBrickAtlases = loadedEntries.reduce<Record<string, VolumeBrickAtlas | null>>(
        (acc, [layerKey, _decision, _volume, _pageTable, brickAtlas]) => {
          acc[layerKey] = brickAtlas;
          return acc;
        },
        {}
      );

      onLaunchLayerVolumesResolved?.(loadedVolumes);
      lastLoadIntentRef.current = launchIntentKey;
      currentLoadedTimeIndexRef.current = initialTimeIndex;
      setCurrentLayerResidencyDecisions(loadedDecisions);
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
    channelVisibility,
    layerChannelMap,
    setLaunchExpectedVolumeCount,
    setLaunchProgress,
    loadLayerTimepointResources,
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
      volumeLoadAbortControllersRef.current.clear();
      cancelAllWarmupRequests();
    };
  }, [cancelAllWarmupRequests]);

  useEffect(() => {
    if (!isViewerLaunched || !volumeProvider) {
      cancelAllCurrentLoadRequests();
      lastLoadIntentRef.current = null;
      currentLoadedTimeIndexRef.current = null;
      cancelAllWarmupRequests();
      backgroundMaskCacheRef.current = {};
      setCurrentLayerResidencyDecisions({});
      setCurrentBackgroundMasksByScale({});
      replacePlaybackWarmupFrames([]);
      return;
    }
    if (volumeTimepointCount === 0 || playbackLayerKeys.length === 0) {
      cancelAllCurrentLoadRequests();
      lastLoadIntentRef.current = null;
      currentLoadedTimeIndexRef.current = null;
      cancelAllWarmupRequests();
      backgroundMaskCacheRef.current = {};
      setCurrentLayerResidencyDecisions({});
      setCurrentLayerVolumes({});
      setCurrentLayerPageTables({});
      setCurrentLayerBrickAtlases({});
      setCurrentBackgroundMasksByScale({});
      replacePlaybackWarmupFrames([]);
      return;
    }

    const clampedIndex = Math.max(0, Math.min(volumeTimepointCount - 1, selectedIndex));
    const desiredScaleSignature = playbackResidencyDecisionSignature;
    const loadIntentKey = `${clampedIndex}|${desiredScaleSignature}`;
    const hasRenderableCurrentResources = playbackLayerKeys.every((layerKey) => {
      const currentAtlas = currentLayerBrickAtlases[layerKey] ?? null;
      if (currentAtlas?.enabled) {
        return true;
      }
      return (currentLayerVolumes[layerKey] ?? null) !== null;
    });
    if (
      !isPlaying &&
      !isPlaybackStartPending &&
      hasRenderableCurrentResources &&
      currentLoadedTimeIndexRef.current === clampedIndex
    ) {
      lastLoadIntentRef.current = loadIntentKey;
      return;
    }
    if (isPlaybackStartPending && hasRenderableCurrentResources) {
      lastLoadIntentRef.current = loadIntentKey;
      return;
    }
    const promotableWarmupFrame =
      playbackWarmupFrames.find(
        (frame) => frame.timeIndex === clampedIndex && frame.scaleSignature === desiredScaleSignature
      ) ?? null;
    if (promotableWarmupFrame) {
      lastLoadIntentRef.current = loadIntentKey;
      currentLoadedTimeIndexRef.current = clampedIndex;
      setCurrentLayerResidencyDecisions(promotableWarmupFrame.layerResidencyDecisions);
      setCurrentLayerVolumes(promotableWarmupFrame.layerVolumes);
      setCurrentLayerPageTables(promotableWarmupFrame.layerPageTables);
      setCurrentLayerBrickAtlases(promotableWarmupFrame.layerBrickAtlases);
      setCurrentBackgroundMasksByScale(promotableWarmupFrame.backgroundMasksByScale);
      lastWarmupIntentBySlotRef.current.delete(promotableWarmupFrame.slotIndex);
      replacePlaybackWarmupFrames(
        playbackWarmupFrames.filter((frame) => frame.slotIndex !== promotableWarmupFrame.slotIndex)
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
    volumeLoadAbortControllersRef.current.add(requestAbortController);

    void (async () => {
      let loadCompleted = false;
      try {
        const entries = await Promise.all(
          playbackLayerKeys.map(async (layerKey) => {
            const { decision, volume, pageTable, brickAtlas } = await loadLayerTimepointResources(
              layerKey,
              clampedIndex,
              { signal: requestAbortController.signal }
            );
            return [layerKey, decision, volume, pageTable, brickAtlas] as const;
          })
        );

        if (
          requestAbortController.signal.aborted ||
          volumeLoadRequestRef.current !== requestId
        ) {
          return;
        }

        const nextDecisions = entries.reduce<Record<string, ResidencyDecision | null>>((acc, [layerKey, decision]) => {
          acc[layerKey] = decision;
          return acc;
        }, {});
        const nextVolumes = entries.reduce<Record<string, NormalizedVolume | null>>((acc, [layerKey, _decision, volume]) => {
          acc[layerKey] = volume;
          return acc;
        }, {});
        const nextPageTables = entries.reduce<Record<string, VolumeBrickPageTable | null>>(
          (acc, [layerKey, _decision, _volume, pageTable]) => {
            acc[layerKey] = pageTable;
            return acc;
          },
          {}
        );
        const nextBrickAtlases = entries.reduce<Record<string, VolumeBrickAtlas | null>>(
          (acc, [layerKey, _decision, _volume, _pageTable, brickAtlas]) => {
            acc[layerKey] = brickAtlas;
            return acc;
          },
          {}
        );
        const nextBackgroundMasksByScale = await loadBackgroundMasksForScaleLevels(
          collectActiveScaleLevels(
            entries.map(([layerKey, _decision, volume, pageTable, brickAtlas]) => [
              layerKey,
              volume,
              pageTable,
              brickAtlas
            ] as const)
          ),
          requestAbortController.signal
        );

        if (
          requestAbortController.signal.aborted ||
          volumeLoadRequestRef.current !== requestId
        ) {
          return;
        }

        setCurrentLayerResidencyDecisions(nextDecisions);
        currentLoadedTimeIndexRef.current = clampedIndex;
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
        volumeLoadAbortControllersRef.current.delete(requestAbortController);
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
      playbackResidencyDecisionSignature,
      currentLayerBrickAtlases,
      currentLayerVolumes,
      isPlaybackStartPending,
      loadLayerTimepointResources,
      loadBackgroundMasksForScaleLevels,
      cancelAllCurrentLoadRequests,
      cancelAllWarmupRequests,
      replacePlaybackWarmupFrames,
    ]);

  useEffect(() => {
    if (
      !isViewerLaunched ||
      !volumeProvider ||
      volumeTimepointCount <= 1 ||
      playbackLayerKeysRef.current.length === 0
    ) {
      cancelAllWarmupRequests();
      if (!isViewerLaunched || !volumeProvider || volumeTimepointCount <= 1 || playbackLayerKeysRef.current.length === 0) {
        replacePlaybackWarmupFrames([]);
      }
      return;
    }

    if (!isPlaybackWarmupActive) {
      cancelAllWarmupRequests();
      return;
    }

    const clampedIndex = Math.max(0, Math.min(volumeTimepointCount - 1, selectedIndex));
    const warmupTimeIndices = collectPlaybackWarmupTimeIndices(
      clampedIndex,
      volumeTimepointCount,
      playbackWindow,
      startupWarmupFrameCount
    );
    if (warmupTimeIndices.length === 0) {
      cancelAllWarmupRequests();
      replacePlaybackWarmupFrames([]);
      return;
    }

    const warmupLayerKeys = playbackLayerKeysRef.current;
    const desiredScaleSignature = collectResidencyDecisionSignature({
      layerKeys: warmupLayerKeys,
      residencyDecisionByLayerKey: playbackResidencyDecisionByLayerKeyRef.current,
    });
    const currentWarmupFrames = playbackWarmupFrames;
    const retainedFrames = currentWarmupFrames.filter(
      (frame) =>
        frame.scaleSignature === desiredScaleSignature &&
        warmupTimeIndices.includes(frame.timeIndex)
    );
    const retainedByTimeIndex = new Map(retainedFrames.map((frame) => [frame.timeIndex, frame]));
    const usedSlots = new Set(retainedFrames.map((frame) => frame.slotIndex));
    const availableSlots = Array.from({ length: normalizedPlaybackBufferFrameCount }, (_value, index) => index).filter(
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

    replacePlaybackWarmupFrames((current) =>
      sortWarmupFramesByTargetOrder(
        current.filter(
          (frame) =>
            frame.scaleSignature === desiredScaleSignature &&
            warmupTimeIndices.includes(frame.timeIndex) &&
            desiredSlotSet.has(frame.slotIndex)
        ),
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
              const { decision, volume, pageTable, brickAtlas } = await loadLayerTimepointResources(
                layerKey,
                timeIndex,
                {
                  signal: requestAbortController.signal,
                  includeHistogram: false,
                }
              );
              return [layerKey, decision, volume, pageTable, brickAtlas] as const;
            })
          );
          const activeRequest = playbackWarmupRequestBySlotRef.current.get(slotIndex);
          if (
            requestAbortController.signal.aborted ||
            activeRequest?.requestId !== requestId
          ) {
            return;
          }

          const nextDecisions = entries.reduce<Record<string, ResidencyDecision | null>>((acc, [layerKey, decision]) => {
            acc[layerKey] = decision;
            return acc;
          }, {});
          const nextVolumes = entries.reduce<Record<string, NormalizedVolume | null>>((acc, [layerKey, _decision, volume]) => {
            acc[layerKey] = volume;
            return acc;
          }, {});
          const nextPageTables = entries.reduce<Record<string, VolumeBrickPageTable | null>>(
            (acc, [layerKey, _decision, _volume, pageTable]) => {
              acc[layerKey] = pageTable;
              return acc;
            },
            {}
          );
          const nextBrickAtlases = entries.reduce<Record<string, VolumeBrickAtlas | null>>(
            (acc, [layerKey, _decision, _volume, _pageTable, brickAtlas]) => {
              acc[layerKey] = brickAtlas;
              return acc;
            },
            {}
          );
          const nextBackgroundMasksByScale = await loadBackgroundMasksForScaleLevels(
            collectActiveScaleLevels(
              entries.map(([layerKey, _decision, volume, pageTable, brickAtlas]) => [
                layerKey,
                volume,
                pageTable,
                brickAtlas
              ] as const)
            ),
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
            layerResidencyDecisions: nextDecisions,
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
    isPlaybackStartPending,
    isPlaybackWarmupActive,
    loadBackgroundMasksForScaleLevels,
    loadLayerTimepointResources,
    normalizedPlaybackBufferFrameCount,
    startupWarmupFrameCount,
    playbackLayerKeySignature,
    playbackWarmupFrames,
    playbackWindow,
    playbackResidencyDecisionSignature,
    selectedIndex,
    volumeProvider,
    volumeTimepointCount,
    cancelAllWarmupRequests,
    cancelWarmupSlot,
    replacePlaybackWarmupFrames,
  ]);

  return {
    currentLayerResidencyDecisions,
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
    playbackResidencyDecisionByLayerKey,
    playbackAtlasScaleLevelByLayerKey,
    handleLaunchViewer
  };
}
