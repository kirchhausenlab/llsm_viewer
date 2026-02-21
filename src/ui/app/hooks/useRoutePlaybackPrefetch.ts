import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { VolumeProvider } from '../../../core/volumeProvider';
import { resolvePreferredScaleLevel, type ViewerQualityProfile } from './multiscaleQualityPolicy';

const MIN_CACHED_VOLUMES = 6;
const PLAYBACK_CACHE_ENTRY_CAP = 192;
const PLAYBACK_PREFETCH_MIN_IN_FLIGHT = 2;
const PLAYBACK_PREFETCH_MAX_IN_FLIGHT = 4;
const PLAYBACK_LAYER_LOAD_CONCURRENCY = 3;
const PLAYBACK_LAYER_LOAD_CONCURRENCY_MIN = 2;

type UseRoutePlaybackPrefetchOptions = {
  isViewerLaunched: boolean;
  isPlaying: boolean;
  qualityProfile: ViewerQualityProfile;
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
  pendingQueue: number[];
  pendingSet: Set<number>;
  inFlight: Set<number>;
  layerKeys: string[];
  maxInFlight: number;
  drainScheduled: boolean;
};

type UseRoutePlaybackPrefetchResult = {
  canAdvancePlaybackToIndex: (nextIndex: number) => boolean;
};

function normalizeTimepointIndex(index: number, volumeTimepointCount: number): number {
  if (volumeTimepointCount <= 0) {
    return 0;
  }
  const mod = index % volumeTimepointCount;
  return mod < 0 ? mod + volumeTimepointCount : mod;
}

function resolveForwardDirection(
  previousIndex: number | null,
  currentIndex: number,
  volumeTimepointCount: number,
): 1 | -1 {
  if (previousIndex === null || volumeTimepointCount <= 1) {
    return 1;
  }
  const prev = normalizeTimepointIndex(previousIndex, volumeTimepointCount);
  const next = normalizeTimepointIndex(currentIndex, volumeTimepointCount);
  if (prev === next) {
    return 1;
  }

  const forwardDistance = (next - prev + volumeTimepointCount) % volumeTimepointCount;
  const backwardDistance = (prev - next + volumeTimepointCount) % volumeTimepointCount;
  return forwardDistance <= backwardDistance ? 1 : -1;
}

export function useRoutePlaybackPrefetch({
  isViewerLaunched,
  isPlaying,
  qualityProfile,
  fps,
  preferBrickResidency,
  brickResidencyLayerKeys,
  playbackAtlasScaleLevelByLayerKey,
  volumeProvider,
  volumeTimepointCount,
  playbackLayerKeys,
  selectedIndex
}: UseRoutePlaybackPrefetchOptions): UseRoutePlaybackPrefetchResult {
  const brickResidencyLayerKeySet = useMemo(() => new Set(brickResidencyLayerKeys), [brickResidencyLayerKeys]);
  const atlasScaleLevelByLayerKey = useMemo(() => {
    const map = new Map<string, number>();
    for (const layerKey of playbackLayerKeys) {
      map.set(
        layerKey,
        resolvePreferredScaleLevel({
          configuredScaleLevel: playbackAtlasScaleLevelByLayerKey?.[layerKey],
          qualityProfile
        })
      );
    }
    return map;
  }, [playbackAtlasScaleLevelByLayerKey, playbackLayerKeys, qualityProfile]);
  const resolveAtlasScaleLevelForLayer = useCallback(
    (layerKey: string) =>
      atlasScaleLevelByLayerKey.get(layerKey) ??
      resolvePreferredScaleLevel({
        configuredScaleLevel: playbackAtlasScaleLevelByLayerKey?.[layerKey],
        qualityProfile
      }),
    [atlasScaleLevelByLayerKey, playbackAtlasScaleLevelByLayerKey, qualityProfile]
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
    const minLookahead = qualityProfile === 'playback' ? 3 : 2;
    const maxLookahead = qualityProfile === 'playback' ? 10 : 6;
    const requestedFps = Number.isFinite(fps) ? fps : 0;
    const estimated = Math.ceil(Math.max(requestedFps, 0) / 7) + 2;
    return Math.min(maxLookahead, Math.max(minLookahead, estimated));
  }, [fps, isPlaying, qualityProfile]);

  const playbackLayerLoadConcurrency = useMemo(() => {
    const requestedFps = Number.isFinite(fps) ? fps : 0;
    const base = requestedFps >= 20 ? PLAYBACK_LAYER_LOAD_CONCURRENCY : requestedFps >= 12 ? 3 : 2;
    const profileAdjusted = qualityProfile === 'playback' ? base + 1 : base;
    return Math.max(PLAYBACK_LAYER_LOAD_CONCURRENCY_MIN, Math.min(PLAYBACK_LAYER_LOAD_CONCURRENCY + 1, profileAdjusted));
  }, [fps, qualityProfile]);

  const playbackPrefetchSessionRef = useRef(0);
  const playbackPrefetchAbortRef = useRef<AbortController | null>(null);
  const playbackPrefetchStateRef = useRef<RoutePlaybackPrefetchState>({
    pendingQueue: [],
    pendingSet: new Set<number>(),
    inFlight: new Set<number>(),
    layerKeys: [],
    maxInFlight: 1,
    drainScheduled: false
  });
  const playbackDirectionRef = useRef<1 | -1>(1);
  const previousPlaybackIndexRef = useRef<number | null>(null);

  const resetPlaybackPrefetchSession = useCallback(() => {
    playbackPrefetchSessionRef.current += 1;
    playbackPrefetchAbortRef.current?.abort();
    playbackPrefetchAbortRef.current = null;
    const state = playbackPrefetchStateRef.current;
    state.pendingQueue.length = 0;
    state.pendingSet.clear();
    state.inFlight.clear();
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
    if (!isPlaying || volumeTimepointCount <= 1) {
      previousPlaybackIndexRef.current = selectedIndex;
      playbackDirectionRef.current = 1;
      return;
    }
    const direction = resolveForwardDirection(previousPlaybackIndexRef.current, selectedIndex, volumeTimepointCount);
    playbackDirectionRef.current = direction;
    previousPlaybackIndexRef.current = selectedIndex;
  }, [isPlaying, selectedIndex, volumeTimepointCount]);

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
        const idx = nextState.pendingQueue.shift();
        if (idx === undefined) {
          break;
        }
        nextState.pendingSet.delete(idx);
        nextState.inFlight.add(idx);

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
                        maxConcurrentLayerLoads: playbackLayerLoadConcurrency,
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
              maxConcurrentLayerLoads: playbackLayerLoadConcurrency
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
            playbackPrefetchStateRef.current.inFlight.delete(idx);
            drainPlaybackPrefetchQueue();
          });
      }
    });
  }, [
    brickResidencyLayerKeySet,
    resolveAtlasScaleLevelForLayer,
    useBrickResidencyPrefetch,
    volumeProvider,
    playbackLayerLoadConcurrency
  ]);

  const schedulePlaybackPrefetch = useCallback(
    (baseIndex: number) => {
      if (!isViewerLaunched || !volumeProvider || volumeTimepointCount <= 1 || playbackLayerKeys.length === 0) {
        return;
      }

      const clampedIndex = Math.max(0, Math.min(volumeTimepointCount - 1, baseIndex));
      const lookahead = Math.min(playbackPrefetchLookahead, Math.max(0, volumeTimepointCount - 1));
      const direction = playbackDirectionRef.current;
      const backwardContext = isPlaying ? Math.max(1, Math.floor(lookahead / 3)) : 0;

      const profileMaxInFlight = qualityProfile === 'playback' ? PLAYBACK_PREFETCH_MAX_IN_FLIGHT : 3;
      const maxInFlight = isPlaying
        ? Math.min(
            profileMaxInFlight,
            Math.max(PLAYBACK_PREFETCH_MIN_IN_FLIGHT, Math.ceil((lookahead + 1) / 2))
          )
        : 1;
      const state = playbackPrefetchStateRef.current;
      if (!playbackPrefetchAbortRef.current || playbackPrefetchAbortRef.current.signal.aborted) {
        playbackPrefetchAbortRef.current = new AbortController();
      }
      state.layerKeys = playbackLayerKeys;
      state.maxInFlight = maxInFlight;

      const prioritizedPending: number[] = [];
      const prioritizedPendingSet = new Set<number>();

      const maybeQueueIndex = (idx: number) => {
        if (state.inFlight.has(idx)) {
          return;
        }
        let ready = true;
        for (const layerKey of playbackLayerKeys) {
          const useLayerBrickResidency = useBrickResidencyPrefetch && brickResidencyLayerKeySet.has(layerKey);
          const layerReady = useLayerBrickResidency
            ? volumeProvider.hasBrickAtlas?.(layerKey, idx, {
                scaleLevel: resolveAtlasScaleLevelForLayer(layerKey)
              }) ?? false
            : volumeProvider.hasVolume(layerKey, idx);
          if (!layerReady) {
            ready = false;
            break;
          }
        }
        if (!ready && !prioritizedPendingSet.has(idx)) {
          prioritizedPending.push(idx);
          prioritizedPendingSet.add(idx);
        }
      };

      for (let offset = 0; offset <= lookahead; offset++) {
        maybeQueueIndex(normalizeTimepointIndex(clampedIndex + direction * offset, volumeTimepointCount));
      }
      for (let offset = 1; offset <= backwardContext; offset++) {
        maybeQueueIndex(normalizeTimepointIndex(clampedIndex - direction * offset, volumeTimepointCount));
      }

      for (const queuedIndex of state.pendingQueue) {
        if (
          queuedIndex < 0 ||
          queuedIndex >= volumeTimepointCount ||
          state.inFlight.has(queuedIndex) ||
          prioritizedPendingSet.has(queuedIndex)
        ) {
          continue;
        }
        prioritizedPending.push(queuedIndex);
        prioritizedPendingSet.add(queuedIndex);
      }

      state.pendingQueue.length = 0;
      state.pendingQueue.push(...prioritizedPending);
      state.pendingSet.clear();
      for (const queuedIndex of prioritizedPending) {
        state.pendingSet.add(queuedIndex);
      }

      if (state.pendingQueue.length > 0) {
        drainPlaybackPrefetchQueue();
      }
    },
    [
      drainPlaybackPrefetchQueue,
      isPlaying,
      isViewerLaunched,
      qualityProfile,
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
