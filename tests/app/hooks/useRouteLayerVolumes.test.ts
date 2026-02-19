import assert from 'node:assert/strict';

import type { NormalizedVolume } from '../../../src/core/volumeProcessing.ts';
import type { VolumeBrickAtlas, VolumeBrickPageTable, VolumeProvider } from '../../../src/core/volumeProvider.ts';
import type { LoadedDatasetLayer, StagedPreprocessedExperiment } from '../../../src/hooks/dataset/index.ts';
import { useRouteLayerVolumes } from '../../../src/ui/app/hooks/useRouteLayerVolumes.ts';
import { renderHook } from '../../hooks/renderHook.ts';

console.log('Starting useRouteLayerVolumes tests');

const createLoadedLayer = (key: string, channelId: string, isSegmentation = false): LoadedDatasetLayer => ({
  key,
  label: key,
  channelId,
  isSegmentation,
  volumeCount: 3,
  width: 2,
  height: 2,
  depth: 2,
  channels: 1,
  dataType: 'uint8',
  min: 0,
  max: 255,
});

const createVolume = (seed: number): NormalizedVolume => ({
  width: 2,
  height: 2,
  depth: 2,
  channels: 1,
  dataType: 'uint8',
  normalized: new Uint8Array([seed, seed, seed, seed, seed, seed, seed, seed]),
  histogram: new Uint32Array([seed, seed + 1]),
  min: 0,
  max: 255,
});

const createDiagnosticsSnapshot = (pressure: number) =>
  ({
    capturedAt: new Date().toISOString(),
    residency: {
      cachedVolumes: 1,
      inFlightVolumes: 0,
      cachedChunks: 1,
      inFlightChunks: 0,
      chunkBytes: 1024
    },
    cachePressure: {
      volume: pressure,
      chunk: pressure
    },
    missRates: {
      volume: 0.1,
      chunk: 0.2
    },
    activePrefetchRequests: [],
    stats: {} as ReturnType<VolumeProvider['getStats']>
  });

const createBrickPageTable = (seed: number, scaleLevel = 0): VolumeBrickPageTable => ({
  layerKey: `layer-${seed}`,
  timepoint: seed,
  scaleLevel,
  gridShape: [1, 1, 1],
  chunkShape: [1, 1, 1],
  volumeShape: [2, 2, 2],
  brickAtlasIndices: new Int32Array([0]),
  chunkMin: new Uint8Array([seed]),
  chunkMax: new Uint8Array([seed + 1]),
  chunkOccupancy: new Float32Array([1]),
  occupiedBrickCount: 1
});

const createBrickAtlas = (seed: number, scaleLevel = 0): VolumeBrickAtlas => {
  const pageTable = createBrickPageTable(seed, scaleLevel);
  return {
    layerKey: pageTable.layerKey,
    timepoint: pageTable.timepoint,
    scaleLevel,
    pageTable,
    width: 1,
    height: 1,
    depth: 1,
    textureFormat: 'red',
    sourceChannels: 1,
    data: new Uint8Array([seed & 0xff]),
    enabled: true
  };
};

const flushAsyncWork = async (iterations = 8) => {
  for (let index = 0; index < iterations; index += 1) {
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
  }
};

await (async () => {
  const getVolumeCalls: Array<{ layerKey: string; timeIndex: number }> = [];
  const getPageTableCalls: Array<{ layerKey: string; timeIndex: number }> = [];
  const progressCalls: Array<{ loadedCount: number; totalCount: number }> = [];
  let beginLaunchCalls = 0;
  let completeLaunchCalls = 0;
  let finishLaunchCalls = 0;
  let selectedIndexReset = -1;
  let isPlayingValue = true;
  let clearDatasetErrorCalls = 0;
  let launchExpectedVolumeCount = -1;

  const provider = {
    getVolume: async (layerKey: string, timeIndex: number) => {
      getVolumeCalls.push({ layerKey, timeIndex });
      return createVolume(timeIndex + 1);
    },
    getBrickPageTable: async (layerKey: string, timeIndex: number) => {
      getPageTableCalls.push({ layerKey, timeIndex });
      return createBrickPageTable(timeIndex);
    }
  } as unknown as VolumeProvider;

  const hook = renderHook(() =>
    useRouteLayerVolumes({
      isViewerLaunched: false,
      isLaunchingViewer: false,
      preprocessedExperiment: {} as StagedPreprocessedExperiment,
      volumeProvider: provider,
      loadedChannelIds: ['channel-a', 'channel-b'],
      channelLayersMap: new Map<string, LoadedDatasetLayer[]>([
        ['channel-a', [createLoadedLayer('layer-a', 'channel-a')]],
        ['channel-b', [createLoadedLayer('layer-b', 'channel-b')]],
      ]),
      channelActiveLayer: {},
      channelVisibility: { 'channel-a': true, 'channel-b': true },
      layerChannelMap: new Map<string, string>([
        ['layer-a', 'channel-a'],
        ['layer-b', 'channel-b'],
      ]),
      preferBrickResidency: false,
      volumeTimepointCount: 3,
      selectedIndex: 1,
      clearDatasetError: () => {
        clearDatasetErrorCalls += 1;
      },
      beginLaunchSession: () => {
        beginLaunchCalls += 1;
      },
      setLaunchExpectedVolumeCount: (count) => {
        launchExpectedVolumeCount = count;
      },
      setLaunchProgress: (options) => {
        progressCalls.push(options);
      },
      completeLaunchSession: () => {
        completeLaunchCalls += 1;
      },
      failLaunchSession: () => {
        throw new Error('Launch should not fail in this test');
      },
      finishLaunchSessionAttempt: () => {
        finishLaunchCalls += 1;
      },
      setSelectedIndex: (value) => {
        selectedIndexReset = typeof value === 'function' ? value(selectedIndexReset) : value;
      },
      setIsPlaying: (value) => {
        isPlayingValue = typeof value === 'function' ? value(isPlayingValue) : value;
      },
      showLaunchError: () => {
        throw new Error('showLaunchError should not be called in this test');
      },
    }),
  );

  await hook.act(async () => {
    await hook.result.handleLaunchViewer();
  });

  assert.strictEqual(beginLaunchCalls, 1);
  assert.strictEqual(clearDatasetErrorCalls, 1);
  assert.strictEqual(selectedIndexReset, 0);
  assert.strictEqual(isPlayingValue, false);
  assert.strictEqual(launchExpectedVolumeCount, 2);
  assert.deepStrictEqual(progressCalls, [
    { loadedCount: 1, totalCount: 2 },
    { loadedCount: 2, totalCount: 2 },
  ]);
  assert.strictEqual(completeLaunchCalls, 1);
  assert.strictEqual(finishLaunchCalls, 1);
  assert.deepStrictEqual(getVolumeCalls, [
    { layerKey: 'layer-a', timeIndex: 0 },
    { layerKey: 'layer-b', timeIndex: 0 },
  ]);
  assert.deepStrictEqual(getPageTableCalls, [
    { layerKey: 'layer-a', timeIndex: 0 },
    { layerKey: 'layer-b', timeIndex: 0 },
  ]);
  assert.ok(hook.result.currentLayerVolumes['layer-a']);
  assert.ok(hook.result.currentLayerVolumes['layer-b']);
  assert.ok(hook.result.currentLayerPageTables['layer-a']);
  assert.ok(hook.result.currentLayerPageTables['layer-b']);
  hook.unmount();
})();

(() => {
  let showLaunchErrorMessage: string | null = null;
  let beginLaunchCalls = 0;
  const hook = renderHook(() =>
    useRouteLayerVolumes({
      isViewerLaunched: false,
      isLaunchingViewer: false,
      preprocessedExperiment: null,
      volumeProvider: null,
      loadedChannelIds: [],
      channelLayersMap: new Map<string, LoadedDatasetLayer[]>(),
      channelActiveLayer: {},
      channelVisibility: {},
      layerChannelMap: new Map<string, string>(),
      preferBrickResidency: false,
      volumeTimepointCount: 0,
      selectedIndex: 0,
      clearDatasetError: () => {},
      beginLaunchSession: () => {
        beginLaunchCalls += 1;
      },
      setLaunchExpectedVolumeCount: () => {},
      setLaunchProgress: () => {},
      completeLaunchSession: () => {},
      failLaunchSession: () => {},
      finishLaunchSessionAttempt: () => {},
      setSelectedIndex: () => {},
      setIsPlaying: () => {},
      showLaunchError: (message) => {
        showLaunchErrorMessage = message;
      },
    }),
  );

  hook.act(() => {
    void hook.result.handleLaunchViewer();
  });

  assert.strictEqual(beginLaunchCalls, 0);
  assert.strictEqual(
    showLaunchErrorMessage,
    'Preprocess or import a preprocessed experiment before launching the viewer.',
  );
  hook.unmount();
})();

await (async () => {
  let selectedIndex = 1;
  const getVolumeCalls: Array<{ layerKey: string; timeIndex: number }> = [];

  const provider = {
    getVolume: async (layerKey: string, timeIndex: number) => {
      getVolumeCalls.push({ layerKey, timeIndex });
      return createVolume(timeIndex + 10);
    },
  } as unknown as VolumeProvider;

  const hook = renderHook(() =>
    useRouteLayerVolumes({
      isViewerLaunched: true,
      isLaunchingViewer: false,
      preprocessedExperiment: {} as StagedPreprocessedExperiment,
      volumeProvider: provider,
      loadedChannelIds: ['channel-a', 'channel-b'],
      channelLayersMap: new Map<string, LoadedDatasetLayer[]>([
        ['channel-a', [createLoadedLayer('layer-a-1', 'channel-a'), createLoadedLayer('layer-a-2', 'channel-a')]],
        ['channel-b', [createLoadedLayer('layer-b-1', 'channel-b')]],
      ]),
      channelActiveLayer: {
        'channel-a': 'layer-a-2',
        'channel-b': 'layer-b-1',
      },
      channelVisibility: {
        'channel-a': true,
        'channel-b': false,
      },
      layerChannelMap: new Map<string, string>([
        ['layer-a-1', 'channel-a'],
        ['layer-a-2', 'channel-a'],
        ['layer-b-1', 'channel-b'],
      ]),
      preferBrickResidency: false,
      volumeTimepointCount: 4,
      selectedIndex,
      clearDatasetError: () => {},
      beginLaunchSession: () => {},
      setLaunchExpectedVolumeCount: () => {},
      setLaunchProgress: () => {},
      completeLaunchSession: () => {},
      failLaunchSession: () => {},
      finishLaunchSessionAttempt: () => {},
      setSelectedIndex: () => {},
      setIsPlaying: () => {},
      showLaunchError: () => {},
    }),
  );

  assert.deepStrictEqual(hook.result.playbackLayerKeys, ['layer-a-2']);

  await flushAsyncWork();
  assert.ok(hook.result.currentLayerVolumes['layer-a-2']);
  assert.strictEqual(hook.result.currentLayerPageTables['layer-a-2'], null);
  assert.deepStrictEqual(getVolumeCalls[0], { layerKey: 'layer-a-2', timeIndex: 1 });

  selectedIndex = 3;
  hook.rerender();
  await flushAsyncWork();
  assert.deepStrictEqual(getVolumeCalls[getVolumeCalls.length - 1], { layerKey: 'layer-a-2', timeIndex: 3 });

  hook.unmount();
})();

await (async () => {
  let selectedIndex = 0;
  let diagnosticsPressure = 0.25;

  const provider = {
    getVolume: async (_layerKey: string, timeIndex: number) => createVolume(timeIndex + 20),
    getDiagnostics: () => createDiagnosticsSnapshot(diagnosticsPressure)
  } as unknown as VolumeProvider;

  const hook = renderHook(() =>
    useRouteLayerVolumes({
      isViewerLaunched: true,
      isLaunchingViewer: false,
      preprocessedExperiment: {} as StagedPreprocessedExperiment,
      volumeProvider: provider,
      loadedChannelIds: ['channel-a'],
      channelLayersMap: new Map<string, LoadedDatasetLayer[]>([
        ['channel-a', [createLoadedLayer('layer-a', 'channel-a')]]
      ]),
      channelActiveLayer: { 'channel-a': 'layer-a' },
      channelVisibility: { 'channel-a': true },
      layerChannelMap: new Map<string, string>([['layer-a', 'channel-a']]),
      preferBrickResidency: false,
      volumeTimepointCount: 4,
      selectedIndex,
      clearDatasetError: () => {},
      beginLaunchSession: () => {},
      setLaunchExpectedVolumeCount: () => {},
      setLaunchProgress: () => {},
      completeLaunchSession: () => {},
      failLaunchSession: () => {},
      finishLaunchSessionAttempt: () => {},
      setSelectedIndex: () => {},
      setIsPlaying: () => {},
      showLaunchError: () => {}
    })
  );

  await flushAsyncWork();
  assert.strictEqual(hook.result.volumeProviderDiagnostics?.cachePressure.volume, 0.25);

  diagnosticsPressure = 0.6;
  selectedIndex = 2;
  hook.rerender();
  await flushAsyncWork();
  assert.strictEqual(hook.result.volumeProviderDiagnostics?.cachePressure.volume, 0.6);

  hook.unmount();
})();

await (async () => {
  let selectedIndex = 1;
  const getVolumeCalls: Array<{ layerKey: string; timeIndex: number }> = [];
  const getBrickAtlasCalls: Array<{ layerKey: string; timeIndex: number }> = [];

  const provider = {
    getVolume: async (layerKey: string, timeIndex: number) => {
      getVolumeCalls.push({ layerKey, timeIndex });
      return createVolume(timeIndex + 30);
    },
    getBrickAtlas: async (layerKey: string, timeIndex: number) => {
      getBrickAtlasCalls.push({ layerKey, timeIndex });
      return createBrickAtlas(timeIndex);
    },
  } as unknown as VolumeProvider;

  const hook = renderHook(() =>
    useRouteLayerVolumes({
      isViewerLaunched: true,
      isLaunchingViewer: false,
      preprocessedExperiment: {} as StagedPreprocessedExperiment,
      volumeProvider: provider,
      loadedChannelIds: ['channel-a'],
      channelLayersMap: new Map<string, LoadedDatasetLayer[]>([
        ['channel-a', [createLoadedLayer('layer-a', 'channel-a')]],
      ]),
      channelActiveLayer: { 'channel-a': 'layer-a' },
      channelVisibility: { 'channel-a': true },
      layerChannelMap: new Map<string, string>([['layer-a', 'channel-a']]),
      preferBrickResidency: true,
      volumeTimepointCount: 4,
      selectedIndex,
      clearDatasetError: () => {},
      beginLaunchSession: () => {},
      setLaunchExpectedVolumeCount: () => {},
      setLaunchProgress: () => {},
      completeLaunchSession: () => {},
      failLaunchSession: () => {},
      finishLaunchSessionAttempt: () => {},
      setSelectedIndex: () => {},
      setIsPlaying: () => {},
      showLaunchError: () => {}
    })
  );

  await flushAsyncWork();
  assert.strictEqual(getVolumeCalls.length, 0);
  assert.deepStrictEqual(getBrickAtlasCalls[0], { layerKey: 'layer-a', timeIndex: 1 });
  assert.strictEqual(hook.result.currentLayerVolumes['layer-a'] ?? null, null);
  assert.ok(hook.result.currentLayerPageTables['layer-a']);
  assert.ok(hook.result.currentLayerBrickAtlases['layer-a']);

  selectedIndex = 3;
  hook.rerender();
  await flushAsyncWork();
  assert.deepStrictEqual(getBrickAtlasCalls[getBrickAtlasCalls.length - 1], {
    layerKey: 'layer-a',
    timeIndex: 3
  });
  assert.strictEqual(getVolumeCalls.length, 0);
  hook.unmount();
})();

await (async () => {
  const getVolumeCalls: Array<{ layerKey: string; timeIndex: number }> = [];
  const getBrickAtlasCalls: Array<{ layerKey: string; timeIndex: number }> = [];

  const provider = {
    getVolume: async (layerKey: string, timeIndex: number) => {
      getVolumeCalls.push({ layerKey, timeIndex });
      return createVolume(timeIndex + 40);
    },
    getBrickAtlas: async (layerKey: string, timeIndex: number) => {
      getBrickAtlasCalls.push({ layerKey, timeIndex });
      return createBrickAtlas(timeIndex);
    },
  } as unknown as VolumeProvider;

  const hook = renderHook(() =>
    useRouteLayerVolumes({
      isViewerLaunched: true,
      isLaunchingViewer: false,
      preprocessedExperiment: {} as StagedPreprocessedExperiment,
      volumeProvider: provider,
      loadedChannelIds: ['channel-a'],
      channelLayersMap: new Map<string, LoadedDatasetLayer[]>([
        ['channel-a', [createLoadedLayer('layer-a', 'channel-a', true)]],
      ]),
      channelActiveLayer: { 'channel-a': 'layer-a' },
      channelVisibility: { 'channel-a': true },
      layerChannelMap: new Map<string, string>([['layer-a', 'channel-a']]),
      preferBrickResidency: true,
      volumeTimepointCount: 3,
      selectedIndex: 1,
      clearDatasetError: () => {},
      beginLaunchSession: () => {},
      setLaunchExpectedVolumeCount: () => {},
      setLaunchProgress: () => {},
      completeLaunchSession: () => {},
      failLaunchSession: () => {},
      finishLaunchSessionAttempt: () => {},
      setSelectedIndex: () => {},
      setIsPlaying: () => {},
      showLaunchError: () => {}
    })
  );

  await flushAsyncWork();
  assert.deepStrictEqual(getVolumeCalls[0], { layerKey: 'layer-a', timeIndex: 1 });
  assert.strictEqual(getBrickAtlasCalls.length, 0);
  assert.ok(hook.result.currentLayerVolumes['layer-a']);
  assert.strictEqual(hook.result.currentLayerBrickAtlases['layer-a'] ?? null, null);
  hook.unmount();
})();

await (async () => {
  let selectedIndex = 1;
  let isPlaying = false;
  const getBrickAtlasCalls: Array<{ layerKey: string; timeIndex: number; scaleLevel: number | undefined }> = [];
  const getVolumeCalls: Array<{ layerKey: string; timeIndex: number }> = [];

  const provider = {
    getVolume: async (layerKey: string, timeIndex: number) => {
      getVolumeCalls.push({ layerKey, timeIndex });
      return createVolume(timeIndex + 50);
    },
    getBrickAtlas: async (layerKey: string, timeIndex: number, options?: { scaleLevel?: number }) => {
      getBrickAtlasCalls.push({ layerKey, timeIndex, scaleLevel: options?.scaleLevel });
      return createBrickAtlas(timeIndex, options?.scaleLevel ?? 0);
    },
  } as unknown as VolumeProvider;

  const preprocessedExperiment = {
    manifest: {
      dataset: {
        channels: [
          {
            id: 'channel-a',
            layers: [
              {
                key: 'layer-a',
                zarr: {
                  scales: [{ level: 0 }, { level: 1 }]
                }
              }
            ]
          }
        ]
      }
    }
  } as StagedPreprocessedExperiment;

  const hook = renderHook(() =>
    useRouteLayerVolumes({
      isViewerLaunched: true,
      isLaunchingViewer: false,
      isPlaying,
      preprocessedExperiment,
      volumeProvider: provider,
      loadedChannelIds: ['channel-a'],
      channelLayersMap: new Map<string, LoadedDatasetLayer[]>([
        ['channel-a', [createLoadedLayer('layer-a', 'channel-a')]],
      ]),
      channelActiveLayer: { 'channel-a': 'layer-a' },
      channelVisibility: { 'channel-a': true },
      layerChannelMap: new Map<string, string>([['layer-a', 'channel-a']]),
      preferBrickResidency: true,
      volumeTimepointCount: 4,
      selectedIndex,
      clearDatasetError: () => {},
      beginLaunchSession: () => {},
      setLaunchExpectedVolumeCount: () => {},
      setLaunchProgress: () => {},
      completeLaunchSession: () => {},
      failLaunchSession: () => {},
      finishLaunchSessionAttempt: () => {},
      setSelectedIndex: () => {},
      setIsPlaying: () => {},
      showLaunchError: () => {}
    })
  );

  await flushAsyncWork();
  assert.strictEqual(getVolumeCalls.length, 0);
  assert.deepStrictEqual(getBrickAtlasCalls[0], { layerKey: 'layer-a', timeIndex: 1, scaleLevel: 0 });

  isPlaying = true;
  selectedIndex = 2;
  hook.rerender();
  await flushAsyncWork();
  assert.strictEqual(getVolumeCalls.length, 0);
  assert.deepStrictEqual(getBrickAtlasCalls[getBrickAtlasCalls.length - 1], {
    layerKey: 'layer-a',
    timeIndex: 2,
    scaleLevel: 1
  });
  hook.unmount();
})();

await (async () => {
  let selectedIndex = 1;
  const getBrickAtlasCalls: Array<{ layerKey: string; timeIndex: number; scaleLevel: number | undefined }> = [];
  let getVolumeCalls = 0;

  const provider = {
    getVolume: async () => {
      getVolumeCalls += 1;
      return createVolume(1);
    },
    getBrickAtlas: async (layerKey: string, timeIndex: number, options?: { scaleLevel?: number }) => {
      getBrickAtlasCalls.push({ layerKey, timeIndex, scaleLevel: options?.scaleLevel });
      const level = options?.scaleLevel ?? 0;
      const atlas = createBrickAtlas(timeIndex, level);
      atlas.depth = level === 0 ? 5000 : 1200;
      return atlas;
    },
  } as unknown as VolumeProvider;

  const preprocessedExperiment = {
    manifest: {
      dataset: {
        channels: [
          {
            id: 'channel-a',
            layers: [
              {
                key: 'layer-a',
                zarr: {
                  scales: [{ level: 0 }, { level: 1 }]
                }
              }
            ]
          }
        ]
      }
    }
  } as StagedPreprocessedExperiment;

  const hook = renderHook(() =>
    useRouteLayerVolumes({
      isViewerLaunched: true,
      isLaunchingViewer: false,
      isPlaying: false,
      preprocessedExperiment,
      volumeProvider: provider,
      loadedChannelIds: ['channel-a'],
      channelLayersMap: new Map<string, LoadedDatasetLayer[]>([
        ['channel-a', [createLoadedLayer('layer-a', 'channel-a')]],
      ]),
      channelActiveLayer: { 'channel-a': 'layer-a' },
      channelVisibility: { 'channel-a': true },
      layerChannelMap: new Map<string, string>([['layer-a', 'channel-a']]),
      preferBrickResidency: true,
      volumeTimepointCount: 4,
      selectedIndex,
      clearDatasetError: () => {},
      beginLaunchSession: () => {},
      setLaunchExpectedVolumeCount: () => {},
      setLaunchProgress: () => {},
      completeLaunchSession: () => {},
      failLaunchSession: () => {},
      finishLaunchSessionAttempt: () => {},
      setSelectedIndex: () => {},
      setIsPlaying: () => {},
      showLaunchError: () => {}
    })
  );

  await flushAsyncWork();
  assert.deepStrictEqual(getBrickAtlasCalls, [
    { layerKey: 'layer-a', timeIndex: 1, scaleLevel: 0 },
    { layerKey: 'layer-a', timeIndex: 1, scaleLevel: 1 }
  ]);
  assert.strictEqual(getVolumeCalls, 0);
  assert.strictEqual(hook.result.currentLayerBrickAtlases['layer-a']?.scaleLevel, 1);
  hook.unmount();
})();

await (async () => {
  let selectedIndex = 0;
  let showLaunchErrorCalls = 0;
  const pendingLoads: Array<{
    timeIndex: number;
    signal: AbortSignal | null | undefined;
    resolve: () => void;
  }> = [];

  const provider = {
    getVolume: async (_layerKey: string, timeIndex: number, options?: { signal?: AbortSignal | null }) =>
      new Promise<NormalizedVolume>((resolve) => {
        pendingLoads.push({
          timeIndex,
          signal: options?.signal,
          resolve: () => resolve(createVolume(timeIndex + 70))
        });
      })
  } as unknown as VolumeProvider;

  const hook = renderHook(() =>
    useRouteLayerVolumes({
      isViewerLaunched: true,
      isLaunchingViewer: false,
      preprocessedExperiment: {} as StagedPreprocessedExperiment,
      volumeProvider: provider,
      loadedChannelIds: ['channel-a'],
      channelLayersMap: new Map<string, LoadedDatasetLayer[]>([
        ['channel-a', [createLoadedLayer('layer-a', 'channel-a')]]
      ]),
      channelActiveLayer: { 'channel-a': 'layer-a' },
      channelVisibility: { 'channel-a': true },
      layerChannelMap: new Map<string, string>([['layer-a', 'channel-a']]),
      preferBrickResidency: false,
      volumeTimepointCount: 4,
      selectedIndex,
      clearDatasetError: () => {},
      beginLaunchSession: () => {},
      setLaunchExpectedVolumeCount: () => {},
      setLaunchProgress: () => {},
      completeLaunchSession: () => {},
      failLaunchSession: () => {},
      finishLaunchSessionAttempt: () => {},
      setSelectedIndex: () => {},
      setIsPlaying: () => {},
      showLaunchError: () => {
        showLaunchErrorCalls += 1;
      }
    })
  );

  await flushAsyncWork();
  assert.strictEqual(pendingLoads.length, 1);
  assert.strictEqual(pendingLoads[0]?.timeIndex, 0);

  selectedIndex = 1;
  hook.rerender();
  await flushAsyncWork();
  assert.strictEqual(pendingLoads.length, 2);
  assert.strictEqual(pendingLoads[0]?.signal?.aborted, true);
  assert.strictEqual(pendingLoads[1]?.signal?.aborted ?? false, false);

  pendingLoads[0]?.resolve();
  await flushAsyncWork();
  assert.strictEqual(hook.result.currentLayerVolumes['layer-a'] ?? null, null);

  pendingLoads[1]?.resolve();
  await flushAsyncWork();
  assert.deepStrictEqual(Array.from(hook.result.currentLayerVolumes['layer-a']?.normalized ?? []), Array(8).fill(71));
  assert.strictEqual(showLaunchErrorCalls, 0);
  hook.unmount();
})();

console.log('useRouteLayerVolumes tests passed');
