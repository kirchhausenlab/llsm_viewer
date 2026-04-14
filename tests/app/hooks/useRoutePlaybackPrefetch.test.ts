import assert from 'node:assert/strict';

import { useRoutePlaybackPrefetch } from '../../../src/ui/app/hooks/useRoutePlaybackPrefetch.ts';
import type { VolumeProvider } from '../../../src/core/volumeProvider.ts';
import type { PlaybackWarmupFrameState } from '../../../src/ui/app/hooks/useRouteLayerVolumes.ts';
import { renderHook } from '../../hooks/renderHook.ts';

console.log('Starting useRoutePlaybackPrefetch tests');

type ProviderHarness = {
  provider: VolumeProvider;
  prefetchCalls: Array<{ layerKeys: string[]; timepoint: number }>;
  atlasPrefetchCalls: Array<{
    layerKeys: string[];
    timepoint: number;
    scaleLevels: number[];
    reason: string | null;
    policy: string | null;
  }>;
  atlasHasCalls: Array<{ layerKey: string; timepoint: number; scaleLevel: number | null }>;
  setMaxCachedVolumesCalls: number[];
  setMaxCachedChunkBytesCalls: number[];
};

const createProviderHarness = ({
  availableVolumes = new Set<string>(),
  availableAtlases = new Set<string>(),
}: {
  availableVolumes?: Set<string>;
  availableAtlases?: Set<string>;
} = {}): ProviderHarness => {
  const prefetchCalls: Array<{ layerKeys: string[]; timepoint: number }> = [];
  const atlasPrefetchCalls: Array<{
    layerKeys: string[];
    timepoint: number;
    scaleLevels: number[];
    reason: string | null;
    policy: string | null;
  }> = [];
  const atlasHasCalls: Array<{ layerKey: string; timepoint: number; scaleLevel: number | null }> = [];
  const setMaxCachedVolumesCalls: number[] = [];
  const setMaxCachedChunkBytesCalls: number[] = [];

  const provider = {
    getVolume: async () => {
      throw new Error('getVolume should not be called in this test');
    },
    prefetch: async (layerKeys: string[], timepoint: number) => {
      prefetchCalls.push({ layerKeys: [...layerKeys], timepoint });
    },
    prefetchBrickAtlases: async (layerKeys: string[], timepoint: number, options) => {
      atlasPrefetchCalls.push({
        layerKeys: [...layerKeys],
        timepoint,
        scaleLevels: options?.scaleLevels ? [...options.scaleLevels] : [],
        reason: options?.reason ?? null,
        policy: options?.policy ?? null
      });
    },
    hasVolume: (layerKey: string, timepoint: number) => availableVolumes.has(`${layerKey}:${timepoint}`),
    getBrickAtlas: async () => ({
      layerKey: 'layer-a',
      timepoint: 0,
      scaleLevel: 0,
      pageTable: {
        layerKey: 'layer-a',
        timepoint: 0,
        scaleLevel: 0,
        gridShape: [1, 1, 1],
        chunkShape: [1, 1, 1],
        volumeShape: [1, 1, 1],
        brickAtlasIndices: new Int32Array([0]),
        chunkMin: new Uint8Array([0]),
        chunkMax: new Uint8Array([255]),
        chunkOccupancy: new Float32Array([1]),
        occupiedBrickCount: 1
      },
      width: 1,
      height: 1,
      depth: 1,
      textureFormat: 'red',
      sourceChannels: 1,
      data: new Uint8Array([0]),
      enabled: true
    }),
    hasBrickAtlas: (layerKey: string, timepoint: number, options) => {
      const scaleLevel = options?.scaleLevel ?? null;
      atlasHasCalls.push({ layerKey, timepoint, scaleLevel });
      return (
        availableAtlases.has(`${layerKey}:${timepoint}:s${scaleLevel ?? 0}`) ||
        availableAtlases.has(`${layerKey}:${timepoint}`)
      );
    },
    clear: () => {},
    setMaxCachedVolumes: (value: number) => {
      setMaxCachedVolumesCalls.push(value);
    },
    setMaxCachedChunkBytes: (value: number) => {
      setMaxCachedChunkBytesCalls.push(value);
    },
    getStats: () => ({
      getVolumeCalls: 0,
      prefetchCalls: 0,
      prefetchSkippedCached: 0,
      prefetchSkippedInFlight: 0,
      prefetchLoadsStarted: 0,
      prefetchLoadsCompleted: 0,
      prefetchLoadsFailed: 0,
      prefetchLoadsCancelled: 0,
      prefetchRequestsAborted: 0,
      prefetchActiveRequests: 0,
      cacheHits: 0,
      cacheHitInFlight: 0,
      cacheMisses: 0,
      loadsStarted: 0,
      loadsCompleted: 0,
      loadsFailed: 0,
      lastLoadMs: null,
      bytesRead: 0,
      dataBytesRead: 0,
      labelBytesRead: 0,
      totalLoadMs: 0,
      totalDataReadMs: 0,
      totalLabelReadMs: 0,
      lastDataReadMs: null,
      lastLabelReadMs: null,
      maxCachedVolumes: 0,
      cacheSize: 0,
      inFlightCount: 0,
      chunkCacheHits: 0,
      chunkCacheHitInFlight: 0,
      chunkCacheMisses: 0,
      chunkReadsStarted: 0,
      chunkReadsCompleted: 0,
      chunkReadsFailed: 0,
      chunkBytesRead: 0,
      chunkCacheEvictions: 0,
      maxCachedChunkBytes: 0,
      chunkCacheBytes: 0,
      chunkCacheSize: 0,
      chunkInFlightCount: 0,
    }),
    resetStats: () => {},
  } as VolumeProvider;

  return {
    provider,
    prefetchCalls,
    atlasPrefetchCalls,
    atlasHasCalls,
    setMaxCachedVolumesCalls,
    setMaxCachedChunkBytesCalls,
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
  const { provider, prefetchCalls, setMaxCachedVolumesCalls, setMaxCachedChunkBytesCalls } = createProviderHarness();

  const hook = renderHook(() =>
    useRoutePlaybackPrefetch({
      isViewerLaunched: true,
      isPlaying: false,
      fps: 24,
      preferBrickResidency: false,
      brickResidencyLayerKeys: [],
      volumeProvider: provider,
      volumeTimepointCount: 2,
      playbackLayerKeys: ['layer-a', 'layer-b'],
      selectedIndex: 0,
    }),
  );

  assert.strictEqual(setMaxCachedVolumesCalls[0], 12);
  assert.strictEqual(setMaxCachedChunkBytesCalls[0], 128 * 1024 * 1024);
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
  const availableVolumes = new Set<string>(['layer-a:1', 'layer-b:1']);
  const { provider, prefetchCalls } = createProviderHarness({ availableVolumes });

  const hook = renderHook(() =>
    useRoutePlaybackPrefetch({
      isViewerLaunched: true,
      isPlaying: false,
      fps: 24,
      preferBrickResidency: false,
      brickResidencyLayerKeys: [],
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

await (async () => {
  const { provider, prefetchCalls, atlasPrefetchCalls } = createProviderHarness();

  const hook = renderHook(() =>
    useRoutePlaybackPrefetch({
      isViewerLaunched: true,
      isPlaying: false,
      fps: 24,
      preferBrickResidency: true,
      brickResidencyLayerKeys: ['layer-a', 'layer-b'],
      volumeProvider: provider,
      volumeTimepointCount: 2,
      playbackLayerKeys: ['layer-a', 'layer-b'],
      selectedIndex: 0,
    }),
  );

  const canAdvance = hook.result.canAdvancePlaybackToIndex(1);
  assert.strictEqual(canAdvance, false);
  await flushAsyncWork();
  assert.deepStrictEqual(
    atlasPrefetchCalls.map((entry) => entry.timepoint),
    [1, 0],
  );
  assert.deepStrictEqual(
    atlasPrefetchCalls.map((entry) => entry.scaleLevels),
    [[0], [0]]
  );
  assert.strictEqual(prefetchCalls.length, 0);
  hook.unmount();
})();

await (async () => {
  const { provider, prefetchCalls, atlasPrefetchCalls } = createProviderHarness();

  const hook = renderHook(() =>
    useRoutePlaybackPrefetch({
      isViewerLaunched: true,
      isPlaying: false,
      fps: 24,
      preferBrickResidency: true,
      brickResidencyLayerKeys: ['layer-a'],
      volumeProvider: provider,
      volumeTimepointCount: 2,
      playbackLayerKeys: ['layer-a', 'layer-b'],
      selectedIndex: 0,
    }),
  );

  const canAdvance = hook.result.canAdvancePlaybackToIndex(1);
  assert.strictEqual(canAdvance, false);
  await flushAsyncWork();
  assert.deepStrictEqual(
    atlasPrefetchCalls.map((entry) => entry.layerKeys),
    [['layer-a'], ['layer-a']],
  );
  assert.deepStrictEqual(
    atlasPrefetchCalls.map((entry) => entry.scaleLevels),
    [[0], [0]]
  );
  assert.deepStrictEqual(
    prefetchCalls.map((entry) => entry.layerKeys),
    [['layer-b'], ['layer-b']],
  );
  hook.unmount();
})();

await (async () => {
  const { provider, atlasPrefetchCalls, atlasHasCalls } = createProviderHarness();

  const hook = renderHook(() =>
    useRoutePlaybackPrefetch({
      isViewerLaunched: true,
      isPlaying: true,
      fps: 24,
      preferBrickResidency: true,
      brickResidencyLayerKeys: ['layer-a'],
      volumeProvider: provider,
      volumeTimepointCount: 3,
      playbackLayerKeys: ['layer-a'],
      selectedIndex: 0,
    }),
  );

  const canAdvance = hook.result.canAdvancePlaybackToIndex(1);
  assert.strictEqual(canAdvance, false);
  await flushAsyncWork();
  assert.ok(atlasHasCalls.some((entry) => entry.layerKey === 'layer-a' && entry.scaleLevel === 0));
  assert.deepStrictEqual(
    atlasPrefetchCalls.map((entry) => entry.scaleLevels),
    [[0], [0], [0]]
  );
  hook.unmount();
})();

(() => {
  const { provider, prefetchCalls, atlasPrefetchCalls, atlasHasCalls } = createProviderHarness();
  const warmupFrame: PlaybackWarmupFrameState = {
    slotIndex: 0,
    timeIndex: 1,
    scaleSignature: 'layer-a:1',
    layerVolumes: { 'layer-a': null },
    layerPageTables: {
      'layer-a': {
        layerKey: 'layer-a',
        timepoint: 1,
        scaleLevel: 1,
        gridShape: [1, 1, 1],
        chunkShape: [1, 1, 1],
        volumeShape: [1, 1, 1],
        brickAtlasIndices: new Int32Array([0]),
        chunkMin: new Uint8Array([0]),
        chunkMax: new Uint8Array([255]),
        chunkOccupancy: new Float32Array([1]),
        occupiedBrickCount: 1
      }
    },
    layerBrickAtlases: {
      'layer-a': {
        layerKey: 'layer-a',
        timepoint: 1,
        scaleLevel: 1,
        pageTable: {
          layerKey: 'layer-a',
          timepoint: 1,
          scaleLevel: 1,
          gridShape: [1, 1, 1],
          chunkShape: [1, 1, 1],
          volumeShape: [1, 1, 1],
          brickAtlasIndices: new Int32Array([0]),
          chunkMin: new Uint8Array([0]),
          chunkMax: new Uint8Array([255]),
          chunkOccupancy: new Float32Array([1]),
          occupiedBrickCount: 1
        },
        width: 1,
        height: 1,
        depth: 1,
        textureFormat: 'red',
        sourceChannels: 1,
        data: new Uint8Array([0]),
        enabled: true
      }
    },
    backgroundMasksByScale: {}
  };

  const hook = renderHook(() =>
    useRoutePlaybackPrefetch({
      isViewerLaunched: true,
      isPlaying: false,
      fps: 24,
      preferBrickResidency: true,
      brickResidencyLayerKeys: ['layer-a'],
      playbackAtlasScaleLevelByLayerKey: { 'layer-a': 1 },
      playbackWarmupFrames: [warmupFrame],
      volumeProvider: provider,
      volumeTimepointCount: 3,
      playbackLayerKeys: ['layer-a'],
      selectedIndex: 0,
    }),
  );

  const canAdvance = hook.result.canAdvancePlaybackToIndex(1);
  assert.strictEqual(canAdvance, true);
  assert.ok(atlasHasCalls.some((entry) => entry.layerKey === 'layer-a' && entry.scaleLevel === 1));
  assert.strictEqual(prefetchCalls.length, 0);
  assert.strictEqual(atlasPrefetchCalls.length, 0);
  hook.unmount();
})();

(() => {
  const { provider } = createProviderHarness();
  assert.throws(
    () =>
      renderHook(() =>
        useRoutePlaybackPrefetch({
          isViewerLaunched: true,
          isPlaying: false,
          fps: 24,
          preferBrickResidency: true,
          brickResidencyLayerKeys: ['layer-a'],
          playbackAtlasScaleLevelByLayerKey: { 'layer-a': Number.NaN },
          volumeProvider: provider,
          volumeTimepointCount: 3,
          playbackLayerKeys: ['layer-a'],
          selectedIndex: 0,
        }),
      ),
    /Invalid playback atlas scale level for layer "layer-a"/,
  );
})();

console.log('useRoutePlaybackPrefetch tests passed');
