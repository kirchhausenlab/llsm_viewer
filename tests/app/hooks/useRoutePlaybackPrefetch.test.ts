import assert from 'node:assert/strict';

import { useRoutePlaybackPrefetch } from '../../../src/ui/app/hooks/useRoutePlaybackPrefetch.ts';
import type { VolumeProvider } from '../../../src/core/volumeProvider.ts';
import { renderHook } from '../../hooks/renderHook.ts';

console.log('Starting useRoutePlaybackPrefetch tests');

type ProviderHarness = {
  provider: VolumeProvider;
  prefetchCalls: Array<{ layerKeys: string[]; timepoint: number }>;
  setMaxCachedVolumesCalls: number[];
};

const createProviderHarness = (available = new Set<string>()): ProviderHarness => {
  const prefetchCalls: Array<{ layerKeys: string[]; timepoint: number }> = [];
  const setMaxCachedVolumesCalls: number[] = [];

  const provider = {
    getVolume: async () => {
      throw new Error('getVolume should not be called in this test');
    },
    prefetch: async (layerKeys: string[], timepoint: number) => {
      prefetchCalls.push({ layerKeys: [...layerKeys], timepoint });
    },
    hasVolume: (layerKey: string, timepoint: number) => available.has(`${layerKey}:${timepoint}`),
    clear: () => {},
    setMaxCachedVolumes: (value: number) => {
      setMaxCachedVolumesCalls.push(value);
    },
    getStats: () => ({
      getVolumeCalls: 0,
      prefetchCalls: 0,
      cacheHits: 0,
      cacheHitInFlight: 0,
      cacheMisses: 0,
      loadsStarted: 0,
      loadsCompleted: 0,
      loadsFailed: 0,
      bytesRead: 0,
      dataBytesRead: 0,
      labelBytesRead: 0,
      totalLoadMs: 0,
      totalDataReadMs: 0,
      totalLabelReadMs: 0,
      lastLoadMs: null,
      lastDataReadMs: null,
      lastLabelReadMs: null,
      maxCachedVolumes: 0,
      cacheSize: 0,
      inFlightCount: 0,
    }),
    resetStats: () => {},
  } as VolumeProvider;

  return {
    provider,
    prefetchCalls,
    setMaxCachedVolumesCalls,
  };
};

const flushAsyncWork = async (iterations = 8) => {
  for (let index = 0; index < iterations; index++) {
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
  }
};

await (async () => {
  const { provider, prefetchCalls, setMaxCachedVolumesCalls } = createProviderHarness();

  const hook = renderHook(() =>
    useRoutePlaybackPrefetch({
      isViewerLaunched: true,
      isPlaying: false,
      fps: 24,
      volumeProvider: provider,
      volumeTimepointCount: 2,
      playbackLayerKeys: ['layer-a', 'layer-b'],
      selectedIndex: 0,
    }),
  );

  assert.strictEqual(setMaxCachedVolumesCalls[0], 6);
  const canAdvance = hook.result.canAdvancePlaybackToIndex(1);
  assert.strictEqual(canAdvance, false);

  await flushAsyncWork();

  assert.deepStrictEqual(
    prefetchCalls.map((entry) => entry.timepoint),
    [1, 0],
  );
  assert.deepStrictEqual(prefetchCalls[0]?.layerKeys, ['layer-a', 'layer-b']);
  hook.unmount();
})();

(() => {
  const available = new Set<string>(['layer-a:1', 'layer-b:1']);
  const { provider, prefetchCalls } = createProviderHarness(available);

  const hook = renderHook(() =>
    useRoutePlaybackPrefetch({
      isViewerLaunched: true,
      isPlaying: false,
      fps: 24,
      volumeProvider: provider,
      volumeTimepointCount: 2,
      playbackLayerKeys: ['layer-a', 'layer-b'],
      selectedIndex: 0,
    }),
  );

  const canAdvance = hook.result.canAdvancePlaybackToIndex(1);
  assert.strictEqual(canAdvance, true);
  assert.strictEqual(prefetchCalls.length, 0);
  hook.unmount();
})();

console.log('useRoutePlaybackPrefetch tests passed');
