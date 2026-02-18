import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { VolumeProvider } from '../../../core/volumeProvider';

type UseRoutePlaybackPrefetchOptions = {
  isViewerLaunched: boolean;
  isPlaying: boolean;
  fps: number;
  preferBrickResidency: boolean;
  brickResidencyLayerKeys: string[];
  volumeProvider: VolumeProvider | null;
  volumeTimepointCount: number;
  playbackLayerKeys: string[];
  selectedIndex: number;
};

type RoutePlaybackPrefetchState = {
  pending: number[];
  inFlight: Set<number>;
  layerKeys: string[];
  maxInFlight: number;
  drainScheduled: boolean;
};

type UseRoutePlaybackPrefetchResult = {
  canAdvancePlaybackToIndex: (nextIndex: number) => boolean;
};

export function useRoutePlaybackPrefetch({
  isViewerLaunched,
  isPlaying,
  fps,
  preferBrickResidency,
  brickResidencyLayerKeys,
  volumeProvider,
  volumeTimepointCount,
  playbackLayerKeys,
  selectedIndex
}: UseRoutePlaybackPrefetchOptions): UseRoutePlaybackPrefetchResult {
  const brickResidencyLayerKeySet = useMemo(() => new Set(brickResidencyLayerKeys), [brickResidencyLayerKeys]);
  const atlasScaleLevels = useMemo(() => (isPlaying ? [0, 1] : [0]), [isPlaying]);
  const preferredAtlasScaleLevel = atlasScaleLevels[atlasScaleLevels.length - 1] ?? 0;

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
    const maxLookahead = 8;
    const requestedFps = Number.isFinite(fps) ? fps : 0;
    const estimated = Math.ceil(Math.max(requestedFps, 0) / 8) + 2;
    return Math.min(maxLookahead, Math.max(minLookahead, estimated));
  }, [fps, isPlaying]);

  const playbackPrefetchSessionRef = useRef(0);
  const playbackPrefetchAbortRef = useRef<AbortController | null>(null);
  const playbackPrefetchStateRef = useRef<RoutePlaybackPrefetchState>({
    pending: [],
    inFlight: new Set<number>(),
    layerKeys: [],
    maxInFlight: 1,
    drainScheduled: false
  });

  const resetPlaybackPrefetchSession = useCallback(() => {
    playbackPrefetchSessionRef.current += 1;
    playbackPrefetchAbortRef.current?.abort();
    playbackPrefetchAbortRef.current = null;
    const state = playbackPrefetchStateRef.current;
    state.pending.length = 0;
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

      while (nextState.inFlight.size < nextState.maxInFlight && nextState.pending.length > 0) {
        const idx = nextState.pending.shift();
        if (idx === undefined) {
          break;
        }
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
          prefetchTasks.push(
            (
              typeof volumeProvider.prefetchBrickAtlases === 'function'
                ? volumeProvider.prefetchBrickAtlases(atlasLayerKeys, idx, {
                    policy: 'missing-only',
                    reason: 'playback',
                    signal: prefetchSignal,
                    maxConcurrentLayerLoads: 2,
                    scaleLevels: atlasScaleLevels
                  })
                : Promise.all(
                    atlasLayerKeys.flatMap((layerKey) =>
                      atlasScaleLevels.map((scaleLevel) =>
                        volumeProvider.getBrickAtlas!(layerKey, idx, { scaleLevel })
                      )
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
              maxConcurrentLayerLoads: 2
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
  }, [atlasScaleLevels, brickResidencyLayerKeySet, useBrickResidencyPrefetch, volumeProvider]);

  const schedulePlaybackPrefetch = useCallback(
    (baseIndex: number) => {
      if (!isViewerLaunched || !volumeProvider || volumeTimepointCount <= 1 || playbackLayerKeys.length === 0) {
        return;
      }

      const clampedIndex = Math.max(0, Math.min(volumeTimepointCount - 1, baseIndex));
      const lookahead = Math.min(playbackPrefetchLookahead, Math.max(0, volumeTimepointCount - 1));

      const maxInFlight = lookahead >= 6 ? 2 : 1;
      const state = playbackPrefetchStateRef.current;
      if (!playbackPrefetchAbortRef.current || playbackPrefetchAbortRef.current.signal.aborted) {
        playbackPrefetchAbortRef.current = new AbortController();
      }
      state.layerKeys = playbackLayerKeys;
      state.maxInFlight = maxInFlight;
      state.pending.length = 0;

      for (let offset = 0; offset <= lookahead; offset++) {
        const idx = (clampedIndex + offset) % volumeTimepointCount;
        if (state.inFlight.has(idx)) {
          continue;
        }

        let ready = true;
        for (const layerKey of playbackLayerKeys) {
          const useLayerBrickResidency = useBrickResidencyPrefetch && brickResidencyLayerKeySet.has(layerKey);
          const layerReady = useLayerBrickResidency
            ? volumeProvider.hasBrickAtlas?.(layerKey, idx, { scaleLevel: preferredAtlasScaleLevel }) ?? false
            : volumeProvider.hasVolume(layerKey, idx);
          if (!layerReady) {
            ready = false;
            break;
          }
        }

        if (!ready) {
          state.pending.push(idx);
        }
      }

      if (state.pending.length > 0) {
        drainPlaybackPrefetchQueue();
      }
    },
    [
      drainPlaybackPrefetchQueue,
      isViewerLaunched,
      playbackLayerKeys,
      playbackPrefetchLookahead,
      brickResidencyLayerKeySet,
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
      volumeProvider.setMaxCachedVolumes(6);
      return;
    }

    const desired = Math.max(
      6,
      layerCount * (playbackPrefetchLookahead + 2) * (useBrickResidencyPrefetch ? atlasScaleLevels.length : 1)
    );
    volumeProvider.setMaxCachedVolumes(desired);
  }, [atlasScaleLevels.length, playbackLayerKeys.length, playbackPrefetchLookahead, useBrickResidencyPrefetch, volumeProvider]);

  const canAdvancePlaybackToIndex = useCallback(
    (nextIndex: number): boolean => {
      if (!isViewerLaunched || !volumeProvider || volumeTimepointCount <= 1 || playbackLayerKeys.length === 0) {
        return true;
      }

      const clampedIndex = Math.max(0, Math.min(volumeTimepointCount - 1, nextIndex));
      const ready = playbackLayerKeys.every((layerKey) => {
        const useLayerBrickResidency = useBrickResidencyPrefetch && brickResidencyLayerKeySet.has(layerKey);
        return useLayerBrickResidency
          ? volumeProvider.hasBrickAtlas?.(layerKey, clampedIndex, { scaleLevel: preferredAtlasScaleLevel }) ?? false
          : volumeProvider.hasVolume(layerKey, clampedIndex);
      }
      );

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
      preferredAtlasScaleLevel,
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
