import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { VolumeProvider } from '../../../core/volumeProvider';

type UseRoutePlaybackPrefetchOptions = {
  isViewerLaunched: boolean;
  isPlaying: boolean;
  fps: number;
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
  volumeProvider,
  volumeTimepointCount,
  playbackLayerKeys,
  selectedIndex
}: UseRoutePlaybackPrefetchOptions): UseRoutePlaybackPrefetchResult {
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
  const playbackPrefetchStateRef = useRef<RoutePlaybackPrefetchState>({
    pending: [],
    inFlight: new Set<number>(),
    layerKeys: [],
    maxInFlight: 1,
    drainScheduled: false
  });

  useEffect(() => {
    playbackPrefetchSessionRef.current += 1;
    const state = playbackPrefetchStateRef.current;
    state.pending.length = 0;
    state.inFlight.clear();
    state.layerKeys = [];
    state.drainScheduled = false;
  }, [volumeProvider]);

  useEffect(() => {
    if (isPlaying) {
      return;
    }
    playbackPrefetchSessionRef.current += 1;
    const state = playbackPrefetchStateRef.current;
    state.pending.length = 0;
    state.inFlight.clear();
    state.layerKeys = [];
    state.drainScheduled = false;
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

      while (nextState.inFlight.size < nextState.maxInFlight && nextState.pending.length > 0) {
        const idx = nextState.pending.shift();
        if (idx === undefined) {
          break;
        }
        nextState.inFlight.add(idx);

        void volumeProvider
          .prefetch(nextState.layerKeys, idx)
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
  }, [volumeProvider]);

  const schedulePlaybackPrefetch = useCallback(
    (baseIndex: number) => {
      if (!isViewerLaunched || !volumeProvider || volumeTimepointCount <= 1 || playbackLayerKeys.length === 0) {
        return;
      }

      const clampedIndex = Math.max(0, Math.min(volumeTimepointCount - 1, baseIndex));
      const lookahead = Math.min(playbackPrefetchLookahead, Math.max(0, volumeTimepointCount - 1));

      const maxInFlight = lookahead >= 6 ? 2 : 1;
      const state = playbackPrefetchStateRef.current;
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
          if (!volumeProvider.hasVolume(layerKey, idx)) {
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

    const desired = Math.max(6, layerCount * (playbackPrefetchLookahead + 2));
    volumeProvider.setMaxCachedVolumes(desired);
  }, [playbackLayerKeys.length, playbackPrefetchLookahead, volumeProvider]);

  const canAdvancePlaybackToIndex = useCallback(
    (nextIndex: number): boolean => {
      if (!isViewerLaunched || !volumeProvider || volumeTimepointCount <= 1 || playbackLayerKeys.length === 0) {
        return true;
      }

      const clampedIndex = Math.max(0, Math.min(volumeTimepointCount - 1, nextIndex));
      const ready = playbackLayerKeys.every((layerKey) => volumeProvider.hasVolume(layerKey, clampedIndex));

      if (!ready) {
        schedulePlaybackPrefetch(clampedIndex);
        return false;
      }

      return true;
    },
    [isViewerLaunched, playbackLayerKeys, schedulePlaybackPrefetch, volumeProvider, volumeTimepointCount]
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
