import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { VolumeProvider } from '../../../core/volumeProvider';
import { getLod0FeatureFlags } from '../../../config/lod0Flags';

const MIN_CACHED_VOLUMES = 6;
const PLAYBACK_CACHE_ENTRY_CAP = 64;
const PLAYBACK_PREFETCH_MIN_IN_FLIGHT = 1;
const PLAYBACK_PREFETCH_MAX_IN_FLIGHT = 2;
const PLAYBACK_LAYER_LOAD_CONCURRENCY = 2;
const PREFETCH_CLASS_VISIBLE_FRACTION = 0.5;
const PREFETCH_CLASS_NEAR_FRACTION = 0.35;
const PREFETCH_CLASS_SPECULATIVE_FRACTION = 0.15;

type PrefetchPriorityClass = 'visible-now' | 'near-future' | 'speculative';

type PrefetchWorkItem = {
  timepoint: number;
  priorityClass: PrefetchPriorityClass;
  score: number;
  distance: number;
};

type UseRoutePlaybackPrefetchOptions = {
  isViewerLaunched: boolean;
  isPlaying: boolean;
  fps: number;
  preferBrickResidency: boolean;
  brickResidencyLayerKeys: string[];
  playbackAtlasScaleLevelByLayerKey?: Record<string, number>;
  volumeProvider: VolumeProvider | null;
  volumeTimepointCount: number;
  playbackLayerKeys: string[];
  selectedIndex: number;
};

type RoutePlaybackPrefetchState = {
  pendingQueue: PrefetchWorkItem[];
  pendingSet: Set<number>;
  inFlight: Set<number>;
  inFlightClassByTimepoint: Map<number, PrefetchPriorityClass>;
  inFlightByClass: Record<PrefetchPriorityClass, number>;
  classBudgets: Record<PrefetchPriorityClass, number>;
  layerKeys: string[];
  maxInFlight: number;
  drainScheduled: boolean;
};

type UseRoutePlaybackPrefetchResult = {
  canAdvancePlaybackToIndex: (nextIndex: number) => boolean;
};

function createClassCounter(): Record<PrefetchPriorityClass, number> {
  return {
    'visible-now': 0,
    'near-future': 0,
    speculative: 0
  };
}

function computeClassBudgets(maxInFlight: number): Record<PrefetchPriorityClass, number> {
  const normalizedMax = Math.max(1, Math.floor(maxInFlight));
  const visible = Math.max(1, Math.ceil(normalizedMax * PREFETCH_CLASS_VISIBLE_FRACTION));
  let near = Math.max(0, Math.ceil(normalizedMax * PREFETCH_CLASS_NEAR_FRACTION));
  let speculative = Math.max(0, Math.ceil(normalizedMax * PREFETCH_CLASS_SPECULATIVE_FRACTION));
  let budgetTotal = visible + near + speculative;
  while (budgetTotal > normalizedMax) {
    if (speculative > 0) {
      speculative -= 1;
    } else if (near > 0) {
      near -= 1;
    } else {
      break;
    }
    budgetTotal = visible + near + speculative;
  }
  while (budgetTotal < normalizedMax) {
    near += 1;
    budgetTotal = visible + near + speculative;
  }

  return {
    'visible-now': visible,
    'near-future': near,
    speculative
  };
}

function resolveDirectionFromIndexDelta(previousIndex: number, nextIndex: number, count: number, fallbackDirection: 1 | -1): 1 | -1 {
  if (count <= 1) {
    return fallbackDirection;
  }
  const forward = (nextIndex - previousIndex + count) % count;
  const backward = (previousIndex - nextIndex + count) % count;
  if (forward === backward) {
    return fallbackDirection;
  }
  return forward < backward ? 1 : -1;
}

export function useRoutePlaybackPrefetch({
  isViewerLaunched,
  isPlaying,
  fps,
  preferBrickResidency,
  brickResidencyLayerKeys,
  playbackAtlasScaleLevelByLayerKey,
  volumeProvider,
  volumeTimepointCount,
  playbackLayerKeys,
  selectedIndex
}: UseRoutePlaybackPrefetchOptions): UseRoutePlaybackPrefetchResult {
  const lod0Flags = useMemo(() => getLod0FeatureFlags(), []);
  const brickResidencyLayerKeySet = useMemo(() => new Set(brickResidencyLayerKeys), [brickResidencyLayerKeys]);
  const fallbackAtlasScaleLevel = isPlaying ? 1 : 0;
  const atlasScaleLevelByLayerKey = useMemo(() => {
    const map = new Map<string, number>();
    for (const layerKey of playbackLayerKeys) {
      const configuredScaleLevel = playbackAtlasScaleLevelByLayerKey?.[layerKey];
      const normalizedScaleLevel =
        Number.isFinite(configuredScaleLevel) && configuredScaleLevel !== undefined
          ? Math.max(0, Math.floor(configuredScaleLevel))
          : Number.NaN;
      map.set(layerKey, Number.isFinite(normalizedScaleLevel) ? normalizedScaleLevel : fallbackAtlasScaleLevel);
    }
    return map;
  }, [fallbackAtlasScaleLevel, playbackAtlasScaleLevelByLayerKey, playbackLayerKeys]);
  const resolveAtlasScaleLevelForLayer = useCallback(
    (layerKey: string) => atlasScaleLevelByLayerKey.get(layerKey) ?? fallbackAtlasScaleLevel,
    [atlasScaleLevelByLayerKey, fallbackAtlasScaleLevel]
  );

  const useBrickResidencyPrefetch = useMemo(
    () =>
      Boolean(
        preferBrickResidency &&
          volumeProvider &&
          typeof volumeProvider.getBrickAtlas === 'function' &&
          typeof volumeProvider.hasBrickAtlas === 'function'
      ),
    [preferBrickResidency, volumeProvider]
  );

  const playbackPrefetchLookahead = useMemo(() => {
    if (!isPlaying) {
      return 1;
    }
    const minLookahead = 2;
    const maxLookahead = 6;
    const requestedFps = Number.isFinite(fps) ? fps : 0;
    const estimated = Math.ceil(Math.max(requestedFps, 0) / 8) + 2;
    return Math.min(maxLookahead, Math.max(minLookahead, estimated));
  }, [fps, isPlaying]);

  const playbackPrefetchSessionRef = useRef(0);
  const playbackPrefetchAbortRef = useRef<AbortController | null>(null);
  const playbackMotionRef = useRef<{ lastBaseIndex: number; direction: 1 | -1 }>({
    lastBaseIndex: Math.max(0, selectedIndex),
    direction: 1
  });
  const playbackPrefetchStateRef = useRef<RoutePlaybackPrefetchState>({
    pendingQueue: [],
    pendingSet: new Set<number>(),
    inFlight: new Set<number>(),
    inFlightClassByTimepoint: new Map<number, PrefetchPriorityClass>(),
    inFlightByClass: createClassCounter(),
    classBudgets: computeClassBudgets(1),
    layerKeys: [],
    maxInFlight: 1,
    drainScheduled: false
  });

  const resetPlaybackPrefetchSession = useCallback(() => {
    playbackPrefetchSessionRef.current += 1;
    playbackPrefetchAbortRef.current?.abort();
    playbackPrefetchAbortRef.current = null;
    const state = playbackPrefetchStateRef.current;
    state.pendingQueue.length = 0;
    state.pendingSet.clear();
    state.inFlight.clear();
    state.inFlightClassByTimepoint.clear();
    state.inFlightByClass = createClassCounter();
    state.classBudgets = computeClassBudgets(1);
    state.layerKeys = [];
    state.drainScheduled = false;
  }, []);

  useEffect(() => {
    resetPlaybackPrefetchSession();
  }, [resetPlaybackPrefetchSession, volumeProvider]);

  useEffect(() => {
    return () => {
      playbackPrefetchAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (isPlaying) {
      return;
    }
    resetPlaybackPrefetchSession();
  }, [isPlaying, resetPlaybackPrefetchSession]);

  useEffect(() => {
    if (!isPlaying) {
      return;
    }
    if (!playbackPrefetchAbortRef.current || playbackPrefetchAbortRef.current.signal.aborted) {
      playbackPrefetchAbortRef.current = new AbortController();
    }
  }, [isPlaying]);

  const drainPlaybackPrefetchQueue = useCallback(() => {
    if (!volumeProvider) {
      return;
    }

    const session = playbackPrefetchSessionRef.current;
    const state = playbackPrefetchStateRef.current;
    if (state.drainScheduled) {
      return;
    }

    state.drainScheduled = true;
    queueMicrotask(() => {
      const nextState = playbackPrefetchStateRef.current;
      nextState.drainScheduled = false;

      if (!volumeProvider) {
        return;
      }
      if (playbackPrefetchSessionRef.current !== session) {
        return;
      }
      const prefetchSignal = playbackPrefetchAbortRef.current?.signal ?? null;
      if (prefetchSignal?.aborted) {
        return;
      }

      while (nextState.inFlight.size < nextState.maxInFlight && nextState.pendingQueue.length > 0) {
        let workItemIndex = nextState.pendingQueue.findIndex(
          (item) => nextState.inFlightByClass[item.priorityClass] < nextState.classBudgets[item.priorityClass]
        );
        if (workItemIndex < 0) {
          workItemIndex = 0;
        }
        const workItem = nextState.pendingQueue.splice(workItemIndex, 1)[0];
        if (!workItem) {
          break;
        }
        const idx = workItem.timepoint;
        const priorityClass = workItem.priorityClass;
        nextState.pendingSet.delete(idx);
        nextState.inFlight.add(idx);
        nextState.inFlightClassByTimepoint.set(idx, priorityClass);
        nextState.inFlightByClass[priorityClass] += 1;

        const atlasLayerKeys =
          useBrickResidencyPrefetch
            ? nextState.layerKeys.filter((layerKey) => brickResidencyLayerKeySet.has(layerKey))
            : [];
        const volumeLayerKeys =
          atlasLayerKeys.length > 0
            ? nextState.layerKeys.filter((layerKey) => !brickResidencyLayerKeySet.has(layerKey))
            : nextState.layerKeys;
        const prefetchTasks: Promise<void>[] = [];

        if (atlasLayerKeys.length > 0) {
          const layerKeysByScaleLevel = new Map<number, string[]>();
          for (const layerKey of atlasLayerKeys) {
            const scaleLevel = resolveAtlasScaleLevelForLayer(layerKey);
            const bucket = layerKeysByScaleLevel.get(scaleLevel) ?? [];
            bucket.push(layerKey);
            layerKeysByScaleLevel.set(scaleLevel, bucket);
          }

          prefetchTasks.push(
            (
              typeof volumeProvider.prefetchBrickAtlases === 'function'
                ? Promise.all(
                    Array.from(layerKeysByScaleLevel.entries()).map(([scaleLevel, layerKeysForScale]) =>
                      volumeProvider.prefetchBrickAtlases!(layerKeysForScale, idx, {
                        policy: 'missing-only',
                        reason: 'playback',
                        signal: prefetchSignal,
                        maxConcurrentLayerLoads: PLAYBACK_LAYER_LOAD_CONCURRENCY,
                        scaleLevels: [scaleLevel]
                      })
                    )
                  ).then(() => {})
                : Promise.all(
                    atlasLayerKeys.map((layerKey) =>
                      volumeProvider.getBrickAtlas!(layerKey, idx, {
                        scaleLevel: resolveAtlasScaleLevelForLayer(layerKey),
                        signal: prefetchSignal
                      })
                    )
                  ).then(() => {})
            ) as Promise<void>
          );
        }

        if (volumeLayerKeys.length > 0) {
          prefetchTasks.push(
            volumeProvider.prefetch(volumeLayerKeys, idx, {
              policy: 'missing-only',
              reason: 'playback',
              signal: prefetchSignal,
              maxConcurrentLayerLoads: PLAYBACK_LAYER_LOAD_CONCURRENCY
            })
          );
        }

        const prefetchTask =
          prefetchTasks.length === 1
            ? prefetchTasks[0]!
            : Promise.all(prefetchTasks).then(() => {});

        void prefetchTask
          .catch((error) => {
            console.warn('Playback prefetch failed', error);
          })
          .finally(() => {
            if (playbackPrefetchSessionRef.current !== session) {
              return;
            }
            const state = playbackPrefetchStateRef.current;
            state.inFlight.delete(idx);
            const inFlightClass = state.inFlightClassByTimepoint.get(idx);
            if (inFlightClass) {
              state.inFlightByClass[inFlightClass] = Math.max(0, state.inFlightByClass[inFlightClass] - 1);
              state.inFlightClassByTimepoint.delete(idx);
            }
            drainPlaybackPrefetchQueue();
          });
      }
    });
  }, [brickResidencyLayerKeySet, resolveAtlasScaleLevelForLayer, useBrickResidencyPrefetch, volumeProvider]);

  const schedulePlaybackPrefetch = useCallback(
    (baseIndex: number) => {
      if (!isViewerLaunched || !volumeProvider || volumeTimepointCount <= 1 || playbackLayerKeys.length === 0) {
        return;
      }

      const clampedIndex = Math.max(0, Math.min(volumeTimepointCount - 1, baseIndex));
      const lookahead = Math.min(playbackPrefetchLookahead, Math.max(0, volumeTimepointCount - 1));

      const maxInFlight = isPlaying
        ? Math.min(
            PLAYBACK_PREFETCH_MAX_IN_FLIGHT,
            Math.max(PLAYBACK_PREFETCH_MIN_IN_FLIGHT, Math.ceil((lookahead + 1) / 2))
          )
        : 1;
      const state = playbackPrefetchStateRef.current;
      if (!playbackPrefetchAbortRef.current || playbackPrefetchAbortRef.current.signal.aborted) {
        playbackPrefetchAbortRef.current = new AbortController();
      }
      state.layerKeys = playbackLayerKeys;
      state.maxInFlight = maxInFlight;
      state.classBudgets = computeClassBudgets(maxInFlight);

      const isTimepointReady = (idx: number): boolean =>
        playbackLayerKeys.every((layerKey) => {
          const useLayerBrickResidency = useBrickResidencyPrefetch && brickResidencyLayerKeySet.has(layerKey);
          return useLayerBrickResidency
            ? volumeProvider.hasBrickAtlas?.(layerKey, idx, {
                scaleLevel: resolveAtlasScaleLevelForLayer(layerKey)
              }) ?? false
            : volumeProvider.hasVolume(layerKey, idx);
        });

      if (!lod0Flags.advancedPrefetchScheduler) {
        const simpleItems: PrefetchWorkItem[] = [];
        for (let offset = 0; offset <= lookahead; offset += 1) {
          const idx = (clampedIndex + offset) % volumeTimepointCount;
          if (state.inFlight.has(idx) || isTimepointReady(idx)) {
            continue;
          }
          simpleItems.push({
            timepoint: idx,
            priorityClass: offset === 0 ? 'visible-now' : 'near-future',
            score: 100 - offset * 8,
            distance: offset
          });
        }
        state.pendingQueue.length = 0;
        state.pendingQueue.push(...simpleItems);
        state.pendingSet.clear();
        for (const item of simpleItems) {
          state.pendingSet.add(item.timepoint);
        }
        if (state.pendingQueue.length > 0) {
          drainPlaybackPrefetchQueue();
        }
        return;
      }

      const motion = playbackMotionRef.current;
      const direction = resolveDirectionFromIndexDelta(
        motion.lastBaseIndex,
        clampedIndex,
        volumeTimepointCount,
        motion.direction
      );
      motion.lastBaseIndex = clampedIndex;
      motion.direction = direction;

      const candidateByTimepoint = new Map<number, PrefetchWorkItem>();
      const recordCandidate = (candidate: PrefetchWorkItem) => {
        const existing = candidateByTimepoint.get(candidate.timepoint);
        if (!existing || candidate.score > existing.score) {
          candidateByTimepoint.set(candidate.timepoint, candidate);
        }
      };

      for (let step = 0; step <= lookahead; step += 1) {
        const idx = (clampedIndex + direction * step + volumeTimepointCount) % volumeTimepointCount;
        if (state.inFlight.has(idx) || isTimepointReady(idx)) {
          continue;
        }
        const priorityClass: PrefetchPriorityClass =
          step === 0 ? 'visible-now' : step <= 2 ? 'near-future' : 'speculative';
        const classWeight = priorityClass === 'visible-now' ? 3 : priorityClass === 'near-future' ? 2 : 1;
        const score = classWeight * 100 - step * 8 + (isPlaying ? 6 : 0);
        recordCandidate({
          timepoint: idx,
          priorityClass,
          score,
          distance: step
        });
      }

      const oppositeDirectionDepth = Math.min(2, lookahead);
      for (let step = 1; step <= oppositeDirectionDepth; step += 1) {
        const idx = (clampedIndex - direction * step + volumeTimepointCount) % volumeTimepointCount;
        if (state.inFlight.has(idx) || isTimepointReady(idx)) {
          continue;
        }
        recordCandidate({
          timepoint: idx,
          priorityClass: 'speculative',
          score: 40 - step * 8,
          distance: step
        });
      }

      for (const queuedItem of state.pendingQueue) {
        if (
          queuedItem.timepoint < 0 ||
          queuedItem.timepoint >= volumeTimepointCount ||
          state.inFlight.has(queuedItem.timepoint)
        ) {
          continue;
        }
        recordCandidate(queuedItem);
      }

      const prioritizedPending = Array.from(candidateByTimepoint.values()).sort((left, right) => {
        if (left.score !== right.score) {
          return right.score - left.score;
        }
        if (left.distance !== right.distance) {
          return left.distance - right.distance;
        }
        return left.timepoint - right.timepoint;
      });

      state.pendingQueue.length = 0;
      state.pendingQueue.push(...prioritizedPending);
      state.pendingSet.clear();
      for (const item of prioritizedPending) {
        state.pendingSet.add(item.timepoint);
      }

      if (state.pendingQueue.length > 0) {
        drainPlaybackPrefetchQueue();
      }
    },
    [
      drainPlaybackPrefetchQueue,
      isPlaying,
      isViewerLaunched,
      lod0Flags.advancedPrefetchScheduler,
      playbackLayerKeys,
      playbackPrefetchLookahead,
      brickResidencyLayerKeySet,
      resolveAtlasScaleLevelForLayer,
      useBrickResidencyPrefetch,
      volumeProvider,
      volumeTimepointCount
    ]
  );

  useEffect(() => {
    if (!volumeProvider) {
      return;
    }
    const layerCount = playbackLayerKeys.length;
    if (layerCount === 0) {
      volumeProvider.setMaxCachedVolumes(MIN_CACHED_VOLUMES);
      return;
    }

    const fullCoverageTarget = layerCount * (volumeTimepointCount + 2);
    const desired = Math.max(MIN_CACHED_VOLUMES, Math.min(PLAYBACK_CACHE_ENTRY_CAP, fullCoverageTarget));
    volumeProvider.setMaxCachedVolumes(desired);
  }, [playbackLayerKeys.length, volumeProvider, volumeTimepointCount]);

  const canAdvancePlaybackToIndex = useCallback(
    (nextIndex: number): boolean => {
      if (!isViewerLaunched || !volumeProvider || volumeTimepointCount <= 1 || playbackLayerKeys.length === 0) {
        return true;
      }

      const clampedIndex = Math.max(0, Math.min(volumeTimepointCount - 1, nextIndex));
      const ready = playbackLayerKeys.every((layerKey) => {
        const useLayerBrickResidency = useBrickResidencyPrefetch && brickResidencyLayerKeySet.has(layerKey);
        return useLayerBrickResidency
          ? volumeProvider.hasBrickAtlas?.(layerKey, clampedIndex, {
              scaleLevel: resolveAtlasScaleLevelForLayer(layerKey)
            }) ?? false
          : volumeProvider.hasVolume(layerKey, clampedIndex);
      });

      if (!ready) {
        schedulePlaybackPrefetch(clampedIndex);
        return false;
      }

      return true;
    },
    [
      isViewerLaunched,
      playbackLayerKeys,
      schedulePlaybackPrefetch,
      brickResidencyLayerKeySet,
      useBrickResidencyPrefetch,
      resolveAtlasScaleLevelForLayer,
      volumeProvider,
      volumeTimepointCount
    ]
  );

  useEffect(() => {
    if (!isViewerLaunched || !isPlaying || !volumeProvider || volumeTimepointCount <= 1 || playbackLayerKeys.length === 0) {
      return;
    }

    schedulePlaybackPrefetch(selectedIndex);
  }, [
    isPlaying,
    isViewerLaunched,
    playbackLayerKeys,
    schedulePlaybackPrefetch,
    selectedIndex,
    volumeProvider,
    volumeTimepointCount
  ]);

  return {
    canAdvancePlaybackToIndex
  };
}
