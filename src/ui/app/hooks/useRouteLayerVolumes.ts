import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';

import { clearTextureCache } from '../../../core/textureCache';
import type { LODPolicyDiagnosticsSnapshot } from '../../../core/lodPolicyDiagnostics';
import { getLod0FeatureFlags } from '../../../config/lod0Flags';
import type {
  VolumeBrickAtlas,
  VolumeBackgroundMask,
  VolumeBrickPageTable,
  VolumeProviderDiagnostics
} from '../../../core/volumeProvider';
import type { NormalizedVolume } from '../../../core/volumeProcessing';
import { shouldPreferDirectVolumeSampling } from '../../../shared/utils/lod0Residency';
import { isAbortLikeError, throwIfAborted } from '../../../shared/utils/abort';
import type { PreprocessedLayerScaleManifestEntry } from '../../../shared/utils/preprocessedDataset/types';
import { createLodPolicyController, type LayerPolicyRuntimeState } from '../volume-loading/lodPolicyController';
import {
  DIAGNOSTICS_POLL_INTERVAL_MS,
  HTTP_INITIAL_LAUNCH_MAX_DATA_CHUNKS,
  MAX_BRICK_ATLAS_BYTES_HINT,
  MAX_BRICK_ATLAS_DEPTH_HINT,
  MAX_VOLUME_BYTES_HINT,
  PLAYBACK_WARMUP_SLOT_COUNT,
  arePlaybackWarmupFramesEquivalent,
  buildLayerResidencyModeMap,
  collectActiveScaleLevels,
  collectPlaybackWarmupTimeIndices,
  collectVisibleLayerKeys,
  estimateDataChunkCount,
  getTextureChannelCountForSourceChannels,
  isAllocationLikeError,
  isPromotionReadyForResource,
  nowMs,
  sortWarmupFramesByTargetOrder
} from '../volume-loading/policy';
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
  showLaunchError,
  onLaunchLayerVolumesResolved
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
      layerScaleLevelsByKey,
      layerScalesByLevelByKey,
      lod0Flags,
      viewerCameraSample
    ]
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
    resetLodPolicyState();
  }, [isViewerLaunched, resetLodPolicyState]);

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
    resetLodPolicyState();
  }, [isPlaying, resetLodPolicyState]);

  const loadLayerTimepointResources = useCallback(
    async (
      layerKey: string,
      timeIndex: number,
      options?: { signal?: AbortSignal | null; strategy?: LaunchResourceLoadStrategy; performanceMode?: boolean }
    ): Promise<{
      volume: NormalizedVolume | null;
      pageTable: VolumeBrickPageTable | null;
      brickAtlas: VolumeBrickAtlas | null;
    }> => {
      const signal = options?.signal ?? null;
      const strategy = options?.strategy ?? 'default';
      const performanceMode = Boolean(options?.performanceMode ?? isPerformanceMode);
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
      updateLayerPolicyState({
        layerKey,
        desiredScaleLevel,
        activeScaleLevel: null,
        fallbackScaleLevel,
        readyLatencyMs: null
      });
      const residencyMode = layerResidencyModeByKeyRef.current.get(layerKey) ?? 'volume';
      const shouldLoadBrickAtlas =
        strategy !== 'http-initial' &&
        residencyMode === 'atlas' &&
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
          // Direct-volume rendering can start without page-table metadata. Reuse an
          // already-fetched table from atlas probing, but do not block on one here.
          const volume = await volumeProvider!.getVolume(layerKey, timeIndex, { scaleLevel, signal });
          throwIfAborted(signal);
          const activeScaleLevel = volume.scaleLevel ?? scaleLevel;
          const readyLatencyMs = Math.max(0, nowMs() - loadStartedAtMs);
          const readinessPassed =
            activeScaleLevel === desiredScaleLevel &&
            isPromotionReadyForResource({
              volume,
              pageTable: prefetchedPageTable,
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
  const playbackAtlasScaleLevelByLayerKey = useMemo(() => {
    const byKey: Record<string, number> = {};
    for (const layerKey of playbackLayerKeys) {
      const desiredScaleLevel = resolveDesiredScaleLevel(layerKey);
      byKey[layerKey] = desiredScaleLevel;
    }
    return byKey;
  }, [playbackLayerKeys, resolveDesiredScaleLevel]);

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
      setLaunchExpectedVolumeCount(layerKeys.length);
      let completedLayerCount = 0;
      // Only gate launch on the resources required for the first frame. The
      // steady-state loader fills in non-critical metadata after mount.
      const loadedEntries = await Promise.all(
        layerKeys.map(async (layerKey) => {
          const { volume, pageTable, brickAtlas } = await loadLayerTimepointResources(
            layerKey,
            initialTimeIndex,
            { strategy: launchStrategy, performanceMode }
          );
          completedLayerCount += 1;
          setLaunchProgress({ loadedCount: completedLayerCount, totalCount: layerKeys.length });
          return [layerKey, volume, pageTable, brickAtlas] as const;
        })
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

      onLaunchLayerVolumesResolved?.(loadedVolumes);
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
