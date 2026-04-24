import assert from 'node:assert/strict';

import type { NormalizedVolume } from '../../../src/core/volumeProcessing.ts';
import type {
  VolumeBackgroundMask,
  VolumeBrickAtlas,
  VolumeBrickPageTable,
  VolumeProvider
} from '../../../src/core/volumeProvider.ts';
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
  kind: 'intensity',
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

const createDenseL0BrickPageTable = (
  seed: number,
  options?: {
    layerKey?: string;
    scaleLevel?: number;
    gridShape?: [number, number, number];
    chunkShape?: [number, number, number];
    occupiedBrickCount?: number;
    volumeShape?: [number, number, number];
  }
): VolumeBrickPageTable => {
  const gridShape = options?.gridShape ?? [4, 8, 8];
  const chunkShape = options?.chunkShape ?? [32, 32, 32];
  const volumeShape = options?.volumeShape ?? [128, 256, 256];
  const scaleLevel = options?.scaleLevel ?? 0;
  const totalBricks = gridShape[0] * gridShape[1] * gridShape[2];
  const occupiedBrickCount = Math.min(options?.occupiedBrickCount ?? 224, totalBricks);
  const brickAtlasIndices = new Int32Array(totalBricks).fill(-1);
  const chunkMin = new Uint8Array(totalBricks);
  const chunkMax = new Uint8Array(totalBricks);
  const chunkOccupancy = new Float32Array(totalBricks);

  for (let index = 0; index < totalBricks; index += 1) {
    const occupied = index < occupiedBrickCount;
    brickAtlasIndices[index] = occupied ? index : -1;
    chunkMin[index] = occupied ? 1 : 0;
    chunkMax[index] = occupied ? 255 : 0;
    chunkOccupancy[index] = occupied ? 1 : 0;
  }

  return {
    layerKey: options?.layerKey ?? `dense-layer-${seed}`,
    timepoint: seed,
    scaleLevel,
    gridShape,
    chunkShape,
    volumeShape,
    brickAtlasIndices,
    chunkMin,
    chunkMax,
    chunkOccupancy,
    occupiedBrickCount
  };
};

const createBackgroundMask = (scaleLevel: number): VolumeBackgroundMask => ({
  sourceLayerKey: 'layer-a',
  sourceDataType: 'uint8',
  values: [0],
  scaleLevel,
  width: scaleLevel === 0 ? 8 : 4,
  height: scaleLevel === 0 ? 8 : 4,
  depth: scaleLevel === 0 ? 8 : 4,
  data: new Uint8Array((scaleLevel === 0 ? 8 : 4) ** 3),
});

const createStorageHandle = (backend: 'directory' | 'http') => ({
  backend,
  id: `storage-${backend}`,
  storage: {} as StagedPreprocessedExperiment['storageHandle']['storage']
});

const createScaleEntry = ({
  level,
  width,
  height,
  depth,
  chunkShape,
  channels = 1,
  downsampleFactor = [1, 1, 1] as [number, number, number]
}: {
  level: number;
  width: number;
  height: number;
  depth: number;
  chunkShape: [number, number, number, number, number];
  channels?: number;
  downsampleFactor?: [number, number, number];
}) => ({
  level,
  width,
  height,
  depth,
  channels,
  downsampleFactor,
  zarr: {
    data: {
      path: `channels/channel-a/layer-a/scales/${level}/data`,
      shape: [1, depth, height, width, channels],
      chunkShape,
      dataType: 'uint8' as const
    },
    skipHierarchy: {
      levels: []
    }
  }
});

const flushAsyncWork = async (iterations = 8) => {
  for (let index = 0; index < iterations; index += 1) {
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
  }
};

const createAbortLikeError = (): Error => {
  const error = new Error('The operation was aborted.');
  error.name = 'AbortError';
  return error;
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
  assert.deepStrictEqual(getPageTableCalls, []);
  assert.ok(hook.result.currentLayerVolumes['layer-a']);
  assert.ok(hook.result.currentLayerVolumes['layer-b']);
  assert.strictEqual(hook.result.currentLayerPageTables['layer-a'], null);
  assert.strictEqual(hook.result.currentLayerPageTables['layer-b'], null);
  hook.unmount();
})();

await (async () => {
  const startedLayerKeys: string[] = [];
  const progressCalls: Array<{ loadedCount: number; totalCount: number }> = [];
  const resolvers = new Map<string, () => void>();
  let completeLaunchCalls = 0;

  const provider = {
    getVolume: (layerKey: string, timeIndex: number) =>
      new Promise<NormalizedVolume>((resolve) => {
        startedLayerKeys.push(layerKey);
        resolvers.set(layerKey, () => resolve(createVolume(timeIndex + (layerKey === 'layer-a' ? 1 : 10))));
      })
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
      channelVisibility: { 'channel-a': true, 'channel-b': true },
      layerChannelMap: new Map<string, string>([
        ['layer-a', 'channel-a'],
        ['layer-b', 'channel-b'],
      ]),
      preferBrickResidency: false,
      volumeTimepointCount: 3,
      selectedIndex: 0,
      clearDatasetError: () => {},
      beginLaunchSession: () => {},
      setLaunchExpectedVolumeCount: () => {},
      setLaunchProgress: (options) => {
        progressCalls.push(options);
      },
      completeLaunchSession: () => {
        completeLaunchCalls += 1;
      },
      failLaunchSession: () => {
        throw new Error('Launch should not fail in this test');
      },
      finishLaunchSessionAttempt: () => {},
      setSelectedIndex: () => {},
      setIsPlaying: () => {},
      showLaunchError: () => {
        throw new Error('showLaunchError should not be called in this test');
      },
    }),
  );

  let launchPromise: Promise<void> | null = null;
  await hook.act(async () => {
    launchPromise = hook.result.handleLaunchViewer();
    await Promise.resolve();
  });

  assert.deepStrictEqual([...startedLayerKeys].sort(), ['layer-a', 'layer-b']);
  assert.strictEqual(completeLaunchCalls, 0);

  await hook.act(async () => {
    resolvers.get('layer-b')?.();
    await Promise.resolve();
  });

  assert.deepStrictEqual(progressCalls, [{ loadedCount: 1, totalCount: 2 }]);
  assert.strictEqual(completeLaunchCalls, 0);

  await hook.act(async () => {
    resolvers.get('layer-a')?.();
    await launchPromise;
  });

  assert.deepStrictEqual(progressCalls, [
    { loadedCount: 1, totalCount: 2 },
    { loadedCount: 2, totalCount: 2 },
  ]);
  assert.strictEqual(completeLaunchCalls, 1);
  hook.unmount();
})();

await (async () => {
  const getVolumeCalls: Array<{ layerKey: string; timeIndex: number }> = [];
  let launchExpectedVolumeCount = -1;

  const provider = {
    getVolume: async (layerKey: string, timeIndex: number) => {
      getVolumeCalls.push({ layerKey, timeIndex });
      return createVolume(timeIndex + 1);
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
      channelVisibility: { 'channel-a': true, 'channel-b': false },
      layerChannelMap: new Map<string, string>([
        ['layer-a', 'channel-a'],
        ['layer-b', 'channel-b'],
      ]),
      preferBrickResidency: false,
      volumeTimepointCount: 3,
      selectedIndex: 0,
      clearDatasetError: () => {},
      beginLaunchSession: () => {},
      setLaunchExpectedVolumeCount: (count) => {
        launchExpectedVolumeCount = count;
      },
      setLaunchProgress: () => {},
      completeLaunchSession: () => {},
      failLaunchSession: () => {
        throw new Error('Launch should not fail in this test');
      },
      finishLaunchSessionAttempt: () => {},
      setSelectedIndex: () => {},
      setIsPlaying: () => {},
      showLaunchError: () => {
        throw new Error('showLaunchError should not be called in this test');
      },
    }),
  );

  await hook.act(async () => {
    await hook.result.handleLaunchViewer();
  });

  assert.strictEqual(launchExpectedVolumeCount, 1);
  assert.deepStrictEqual(getVolumeCalls, [{ layerKey: 'layer-a', timeIndex: 0 }]);
  hook.unmount();
})();

await (async () => {
  const getVolumeCalls: Array<{ layerKey: string; timeIndex: number; scaleLevel: number | undefined }> = [];
  const getBrickAtlasCalls: Array<{ layerKey: string; timeIndex: number; scaleLevel: number | undefined }> = [];
  const getBrickPageTableCalls: Array<{ layerKey: string; timeIndex: number; scaleLevel: number | undefined }> = [];

  const provider = {
    getVolume: async (layerKey: string, timeIndex: number, options?: { scaleLevel?: number }) => {
      getVolumeCalls.push({ layerKey, timeIndex, scaleLevel: options?.scaleLevel });
      return {
        ...createVolume(timeIndex + 21),
        scaleLevel: options?.scaleLevel ?? 0
      };
    },
    getBrickPageTable: async (layerKey: string, timeIndex: number, options?: { scaleLevel?: number }) => {
      getBrickPageTableCalls.push({ layerKey, timeIndex, scaleLevel: options?.scaleLevel });
      return createDenseL0BrickPageTable(timeIndex, {
        layerKey,
        scaleLevel: options?.scaleLevel ?? 0
      });
    },
    getBrickAtlas: async (layerKey: string, timeIndex: number, options?: { scaleLevel?: number }) => {
      getBrickAtlasCalls.push({ layerKey, timeIndex, scaleLevel: options?.scaleLevel });
      return createBrickAtlas(timeIndex, options?.scaleLevel ?? 0);
    }
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
                  scales: [
                    createScaleEntry({
                      level: 0,
                      width: 256,
                      height: 256,
                      depth: 128,
                      chunkShape: [1, 32, 32, 32, 1]
                    })
                  ]
                }
              }
            ]
          }
        ]
      }
    },
    storageHandle: createStorageHandle('directory')
  } as StagedPreprocessedExperiment;

  const hook = renderHook(() =>
    useRouteLayerVolumes({
      isViewerLaunched: false,
      isLaunchingViewer: false,
      isPlaying: false,
      preprocessedExperiment,
      volumeProvider: provider,
      loadedChannelIds: ['channel-a'],
      channelLayersMap: new Map<string, LoadedDatasetLayer[]>([
        ['channel-a', [createLoadedLayer('layer-a', 'channel-a')]],
      ]),
      channelVisibility: { 'channel-a': true },
      layerChannelMap: new Map<string, string>([['layer-a', 'channel-a']]),
      preferBrickResidency: true,
      volumeTimepointCount: 4,
      selectedIndex: 0,
      clearDatasetError: () => {},
      beginLaunchSession: () => {},
      setLaunchExpectedVolumeCount: () => {},
      setLaunchProgress: () => {},
      completeLaunchSession: () => {},
      failLaunchSession: () => {
        throw new Error('Launch should not fail in this test');
      },
      finishLaunchSessionAttempt: () => {},
      setSelectedIndex: () => {},
      setIsPlaying: () => {},
      showLaunchError: () => {
        throw new Error('showLaunchError should not be called in this test');
      }
    })
  );

  await hook.act(async () => {
    await hook.result.handleLaunchViewer();
  });

  assert.deepStrictEqual(getBrickPageTableCalls, [{ layerKey: 'layer-a', timeIndex: 0, scaleLevel: 0 }]);
  assert.deepStrictEqual(getVolumeCalls, [{ layerKey: 'layer-a', timeIndex: 0, scaleLevel: 0 }]);
  assert.strictEqual(getBrickAtlasCalls.length, 0);
  hook.unmount();
})();

await (async () => {
  const getVolumeCalls: Array<{ layerKey: string; timeIndex: number; scaleLevel: number | undefined }> = [];
  const getBrickAtlasCalls: Array<{ layerKey: string; timeIndex: number; scaleLevel: number | undefined }> = [];
  const getBrickPageTableCalls: Array<{ layerKey: string; timeIndex: number; scaleLevel: number | undefined }> = [];

  const provider = {
    getVolume: async (layerKey: string, timeIndex: number, options?: { scaleLevel?: number }) => {
      getVolumeCalls.push({ layerKey, timeIndex, scaleLevel: options?.scaleLevel });
      return {
        ...createVolume(timeIndex + 22),
        scaleLevel: options?.scaleLevel ?? 0
      };
    },
    getBrickPageTable: async (layerKey: string, timeIndex: number, options?: { scaleLevel?: number }) => {
      getBrickPageTableCalls.push({ layerKey, timeIndex, scaleLevel: options?.scaleLevel });
      return createDenseL0BrickPageTable(timeIndex, {
        layerKey,
        scaleLevel: options?.scaleLevel ?? 0
      });
    },
    getBrickAtlas: async (layerKey: string, timeIndex: number, options?: { scaleLevel?: number }) => {
      getBrickAtlasCalls.push({ layerKey, timeIndex, scaleLevel: options?.scaleLevel });
      return createBrickAtlas(timeIndex, options?.scaleLevel ?? 0);
    }
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
                  scales: [
                    createScaleEntry({
                      level: 0,
                      width: 710,
                      height: 608,
                      depth: 102,
                      chunkShape: [1, 16, 64, 64, 1]
                    }),
                    createScaleEntry({
                      level: 1,
                      width: 355,
                      height: 304,
                      depth: 51,
                      chunkShape: [1, 16, 64, 64, 1],
                      downsampleFactor: [2, 2, 2]
                    }),
                    createScaleEntry({
                      level: 2,
                      width: 178,
                      height: 152,
                      depth: 26,
                      chunkShape: [1, 16, 64, 64, 1],
                      downsampleFactor: [4, 4, 4]
                    })
                  ]
                }
              }
            ]
          }
        ]
      }
    },
    storageHandle: createStorageHandle('http')
  } as StagedPreprocessedExperiment;

  const hook = renderHook(() =>
    useRouteLayerVolumes({
      isViewerLaunched: false,
      isLaunchingViewer: false,
      isPlaying: false,
      preprocessedExperiment,
      volumeProvider: provider,
      loadedChannelIds: ['channel-a'],
      channelLayersMap: new Map<string, LoadedDatasetLayer[]>([
        ['channel-a', [createLoadedLayer('layer-a', 'channel-a')]],
      ]),
      channelVisibility: { 'channel-a': true },
      layerChannelMap: new Map<string, string>([['layer-a', 'channel-a']]),
      preferBrickResidency: true,
      volumeTimepointCount: 4,
      selectedIndex: 0,
      clearDatasetError: () => {},
      beginLaunchSession: () => {},
      setLaunchExpectedVolumeCount: () => {},
      setLaunchProgress: () => {},
      completeLaunchSession: () => {},
      failLaunchSession: () => {
        throw new Error('Launch should not fail in this test');
      },
      finishLaunchSessionAttempt: () => {},
      setSelectedIndex: () => {},
      setIsPlaying: () => {},
      showLaunchError: () => {
        throw new Error('showLaunchError should not be called in this test');
      }
    })
  );

  await hook.act(async () => {
    await hook.result.handleLaunchViewer();
  });

  assert.deepStrictEqual(getVolumeCalls, [{ layerKey: 'layer-a', timeIndex: 0, scaleLevel: 2 }]);
  assert.strictEqual(getBrickPageTableCalls.length, 0);
  assert.strictEqual(getBrickAtlasCalls.length, 0);
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

  assert.deepStrictEqual(hook.result.playbackLayerKeys, ['layer-a-1']);

  await flushAsyncWork(16);
  assert.ok(hook.result.currentLayerVolumes['layer-a-1']);
  assert.strictEqual(hook.result.currentLayerPageTables['layer-a-1'], null);
  assert.deepStrictEqual(getVolumeCalls[0], { layerKey: 'layer-a-1', timeIndex: 1 });

  selectedIndex = 3;
  hook.rerender();
  for (let attempt = 0; attempt < 12 && hook.result.playbackWarmupFrames.length < 2; attempt += 1) {
    await flushAsyncWork();
  }
  assert.deepStrictEqual(getVolumeCalls[getVolumeCalls.length - 1], { layerKey: 'layer-a-1', timeIndex: 3 });

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
      channelVisibility: { 'channel-a': true },
      layerChannelMap: new Map<string, string>([['layer-a', 'channel-a']]),
      preferBrickResidency: true,
      volumeTimepointCount: 4,
      playbackBufferFrameCount: 2,
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
  let projectionMode: 'perspective' | 'orthographic' = 'orthographic';
  const getVolumeCalls: Array<{ layerKey: string; timeIndex: number; scaleLevel: number | undefined }> = [];
  const getBrickAtlasCalls: Array<{ layerKey: string; timeIndex: number; scaleLevel: number | undefined }> = [];

  const provider = {
    getVolume: async (layerKey: string, timeIndex: number, options?: { scaleLevel?: number }) => {
      getVolumeCalls.push({ layerKey, timeIndex, scaleLevel: options?.scaleLevel });
      return {
        ...createVolume(timeIndex + 40),
        scaleLevel: options?.scaleLevel ?? 0
      };
    },
    getBrickAtlas: async (layerKey: string, timeIndex: number, options?: { scaleLevel?: number }) => {
      getBrickAtlasCalls.push({ layerKey, timeIndex, scaleLevel: options?.scaleLevel });
      return createBrickAtlas(timeIndex, options?.scaleLevel ?? 0);
    },
  } as unknown as VolumeProvider;

  const hook = renderHook(() =>
    useRouteLayerVolumes({
      isViewerLaunched: true,
      isLaunchingViewer: false,
      projectionMode,
      preprocessedExperiment: {} as StagedPreprocessedExperiment,
      volumeProvider: provider,
      loadedChannelIds: ['channel-a'],
      channelLayersMap: new Map<string, LoadedDatasetLayer[]>([
        ['channel-a', [createLoadedLayer('layer-a', 'channel-a')]],
      ]),
      channelVisibility: { 'channel-a': true },
      layerChannelMap: new Map<string, string>([['layer-a', 'channel-a']]),
      preferBrickResidency: true,
      volumeTimepointCount: 4,
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
  assert.deepStrictEqual(getBrickAtlasCalls, [{ layerKey: 'layer-a', timeIndex: 1, scaleLevel: 0 }]);
  assert.strictEqual(getVolumeCalls.length, 0);
  assert.equal(hook.result.playbackResidencyDecisionByLayerKey['layer-a']?.mode, 'atlas');
  hook.unmount();
})();

await (async () => {
  let projectionMode: 'perspective' | 'orthographic' = 'perspective';
  const getVolumeCalls: Array<{ layerKey: string; timeIndex: number; scaleLevel: number | undefined }> = [];
  const getBrickAtlasCalls: Array<{ layerKey: string; timeIndex: number; scaleLevel: number | undefined }> = [];

  const provider = {
    getVolume: async (layerKey: string, timeIndex: number, options?: { scaleLevel?: number }) => {
      getVolumeCalls.push({ layerKey, timeIndex, scaleLevel: options?.scaleLevel });
      return {
        ...createVolume(timeIndex + 50),
        scaleLevel: options?.scaleLevel ?? 0
      };
    },
    getBrickAtlas: async (layerKey: string, timeIndex: number, options?: { scaleLevel?: number }) => {
      getBrickAtlasCalls.push({ layerKey, timeIndex, scaleLevel: options?.scaleLevel });
      return createBrickAtlas(timeIndex, options?.scaleLevel ?? 0);
    },
  } as unknown as VolumeProvider;

  const hook = renderHook(() =>
    useRouteLayerVolumes({
      isViewerLaunched: true,
      isLaunchingViewer: false,
      projectionMode,
      preprocessedExperiment: {} as StagedPreprocessedExperiment,
      volumeProvider: provider,
      loadedChannelIds: ['channel-a'],
      channelLayersMap: new Map<string, LoadedDatasetLayer[]>([
        ['channel-a', [createLoadedLayer('layer-a', 'channel-a')]],
      ]),
      channelVisibility: { 'channel-a': true },
      layerChannelMap: new Map<string, string>([['layer-a', 'channel-a']]),
      preferBrickResidency: true,
      volumeTimepointCount: 4,
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
  assert.deepStrictEqual(getBrickAtlasCalls, [{ layerKey: 'layer-a', timeIndex: 1, scaleLevel: 0 }]);
  assert.strictEqual(getVolumeCalls.length, 0);

  projectionMode = 'orthographic';
  hook.rerender();
  await flushAsyncWork();

  assert.strictEqual(getVolumeCalls.length, 0);
  assert.deepStrictEqual(getBrickAtlasCalls, [{ layerKey: 'layer-a', timeIndex: 1, scaleLevel: 0 }]);
  assert.equal(hook.result.playbackResidencyDecisionByLayerKey['layer-a']?.mode, 'atlas');
  hook.unmount();
})();

await (async () => {
  const getVolumeCalls: Array<{ layerKey: string; timeIndex: number; scaleLevel: number | undefined }> = [];
  const getBrickAtlasCalls: Array<{ layerKey: string; timeIndex: number; scaleLevel: number | undefined }> = [];
  const getBrickPageTableCalls: Array<{ layerKey: string; timeIndex: number; scaleLevel: number | undefined }> = [];
  const targetScaleLevel = 1;

  const provider = {
    getVolume: async (layerKey: string, timeIndex: number, options?: { scaleLevel?: number }) => {
      getVolumeCalls.push({ layerKey, timeIndex, scaleLevel: options?.scaleLevel });
      return {
        ...createVolume(timeIndex + 31),
        scaleLevel: options?.scaleLevel ?? 0
      };
    },
    getBrickPageTable: async (layerKey: string, timeIndex: number, options?: { scaleLevel?: number }) => {
      getBrickPageTableCalls.push({ layerKey, timeIndex, scaleLevel: options?.scaleLevel });
      return createDenseL0BrickPageTable(timeIndex, {
        layerKey,
        scaleLevel: options?.scaleLevel ?? targetScaleLevel
      });
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
                  scales: [
                    {
                      level: targetScaleLevel,
                      width: 256,
                      height: 256,
                      depth: 128,
                      channels: 1
                    }
                  ]
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
      channelVisibility: { 'channel-a': true },
      layerChannelMap: new Map<string, string>([['layer-a', 'channel-a']]),
      preferBrickResidency: true,
      volumeTimepointCount: 4,
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
  assert.deepStrictEqual(getBrickPageTableCalls, [{ layerKey: 'layer-a', timeIndex: 1, scaleLevel: targetScaleLevel }]);
  assert.deepStrictEqual(getVolumeCalls, [{ layerKey: 'layer-a', timeIndex: 1, scaleLevel: targetScaleLevel }]);
  assert.strictEqual(getBrickAtlasCalls.length, 0);
  assert.ok(hook.result.currentLayerVolumes['layer-a']);
  assert.ok(hook.result.currentLayerPageTables['layer-a']);
  assert.strictEqual(hook.result.currentLayerBrickAtlases['layer-a'] ?? null, null);
  hook.unmount();
})();

await (async () => {
  const getVolumeCalls: Array<{ layerKey: string; timeIndex: number; scaleLevel: number | undefined }> = [];
  const getBrickAtlasCalls: Array<{ layerKey: string; timeIndex: number; scaleLevel: number | undefined }> = [];
  const getBrickPageTableCalls: Array<{ layerKey: string; timeIndex: number; scaleLevel: number | undefined }> = [];
  const targetScaleLevel = 1;

  const provider = {
    getVolume: async (layerKey: string, timeIndex: number, options?: { scaleLevel?: number }) => {
      getVolumeCalls.push({ layerKey, timeIndex, scaleLevel: options?.scaleLevel });
      return {
        ...createVolume(timeIndex + 61),
        scaleLevel: options?.scaleLevel ?? 0
      };
    },
    getBrickPageTable: async (layerKey: string, timeIndex: number, options?: { scaleLevel?: number }) => {
      getBrickPageTableCalls.push({ layerKey, timeIndex, scaleLevel: options?.scaleLevel });
      return createDenseL0BrickPageTable(timeIndex, {
        layerKey,
        scaleLevel: options?.scaleLevel ?? targetScaleLevel
      });
    },
    getBrickAtlas: async (layerKey: string, timeIndex: number, options?: { scaleLevel?: number }) => {
      getBrickAtlasCalls.push({ layerKey, timeIndex, scaleLevel: options?.scaleLevel });
      return createBrickAtlas(timeIndex, options?.scaleLevel ?? targetScaleLevel);
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
                  scales: [
                    {
                      level: targetScaleLevel,
                      width: 256,
                      height: 256,
                      depth: 128,
                      channels: 1,
                      zarr: {
                        playbackAtlas: {} as Record<string, never>,
                      },
                    }
                  ]
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
      isPlaybackStartPending: true,
      preprocessedExperiment,
      volumeProvider: provider,
      loadedChannelIds: ['channel-a'],
      channelLayersMap: new Map<string, LoadedDatasetLayer[]>([
        ['channel-a', [createLoadedLayer('layer-a', 'channel-a')]],
      ]),
      channelVisibility: { 'channel-a': true },
      layerChannelMap: new Map<string, string>([['layer-a', 'channel-a']]),
      preferBrickResidency: true,
      volumeTimepointCount: 4,
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
  assert.equal(hook.result.playbackResidencyDecisionByLayerKey['layer-a']?.mode, 'atlas');
  assert.equal(hook.result.playbackResidencyDecisionByLayerKey['layer-a']?.scaleLevel, targetScaleLevel);
  hook.unmount();
})();

await (async () => {
  const getVolumeCalls: Array<{ layerKey: string; timeIndex: number; scaleLevel: number | undefined }> = [];
  const beginLaunchModes: boolean[] = [];

  const provider = {
    getVolume: async (layerKey: string, timeIndex: number, options?: { scaleLevel?: number }) => {
      getVolumeCalls.push({ layerKey, timeIndex, scaleLevel: options?.scaleLevel });
      return {
        ...createVolume(timeIndex + 51),
        scaleLevel: options?.scaleLevel ?? 0
      };
    }
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
                  scales: [
                    createScaleEntry({
                      level: 0,
                      width: 256,
                      height: 256,
                      depth: 64,
                      chunkShape: [1, 16, 64, 64, 1],
                      downsampleFactor: [1, 1, 1]
                    }),
                    createScaleEntry({
                      level: 1,
                      width: 128,
                      height: 128,
                      depth: 32,
                      chunkShape: [1, 8, 32, 32, 1],
                      downsampleFactor: [2, 2, 2]
                    }),
                    createScaleEntry({
                      level: 2,
                      width: 64,
                      height: 64,
                      depth: 16,
                      chunkShape: [1, 4, 16, 16, 1],
                      downsampleFactor: [4, 4, 4]
                    })
                  ]
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
      isViewerLaunched: false,
      isLaunchingViewer: false,
      isPerformanceMode: false,
      isPlaying: false,
      preprocessedExperiment,
      volumeProvider: provider,
      loadedChannelIds: ['channel-a'],
      channelLayersMap: new Map<string, LoadedDatasetLayer[]>([
        ['channel-a', [createLoadedLayer('layer-a', 'channel-a')]],
      ]),
      channelVisibility: { 'channel-a': true },
      layerChannelMap: new Map<string, string>([['layer-a', 'channel-a']]),
      preferBrickResidency: false,
      volumeTimepointCount: 4,
      selectedIndex: 1,
      clearDatasetError: () => {},
      beginLaunchSession: (options) => {
        beginLaunchModes.push(Boolean(options?.performanceMode));
      },
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

  await hook.result.handleLaunchViewer({ performanceMode: true });

  assert.deepStrictEqual(beginLaunchModes, [true]);
  assert.deepStrictEqual(getVolumeCalls, [{ layerKey: 'layer-a', timeIndex: 0, scaleLevel: 1 }]);
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
  assert.ok(getBrickAtlasCalls.some((call) =>
    call.layerKey === 'layer-a' && call.timeIndex === 2 && call.scaleLevel === 1
  ));
  assert.ok(getBrickAtlasCalls.some((call) =>
    call.layerKey === 'layer-a' && call.timeIndex === 3 && call.scaleLevel === 1
  ));

  isPlaying = false;
  const brickAtlasCallCountBeforePause = getBrickAtlasCalls.length;
  hook.rerender();
  await flushAsyncWork();
  assert.strictEqual(getVolumeCalls.length, 0);
  assert.ok(
    getBrickAtlasCalls.length >= brickAtlasCallCountBeforePause + 1,
    'pausing should trigger a paused-policy reload of the current frame'
  );
  assert.ok(
    getBrickAtlasCalls.some((call, index) =>
      index >= brickAtlasCallCountBeforePause &&
      call.layerKey === 'layer-a' &&
      call.timeIndex === 2 &&
      call.scaleLevel === 0
    ),
    'pausing should request the current frame at the paused-policy scale'
  );
  hook.unmount();
})();

await (async () => {
  let selectedIndex = 0;
  let isPlaying = true;
  const getBrickAtlasCalls: Array<{ layerKey: string; timeIndex: number; scaleLevel: number | undefined }> = [];

  const provider = {
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
  assert.strictEqual(hook.result.playbackWarmupTimeIndex, 1);
  const warmedAtlas = hook.result.playbackWarmupLayerBrickAtlases['layer-a'];
  assert.ok(warmedAtlas);
  assert.strictEqual(
    getBrickAtlasCalls.filter((call) => call.layerKey === 'layer-a' && call.timeIndex === 1 && call.scaleLevel === 1).length,
    1
  );
  assert.strictEqual(
    getBrickAtlasCalls.filter((call) => call.layerKey === 'layer-a' && call.timeIndex === 2 && call.scaleLevel === 1).length,
    1
  );

  selectedIndex = 1;
  hook.rerender();
  for (let attempt = 0; attempt < 12 && hook.result.playbackWarmupFrames.length < 2; attempt += 1) {
    await flushAsyncWork();
  }
  assert.strictEqual(hook.result.currentLayerBrickAtlases['layer-a'], warmedAtlas);
  assert.strictEqual(
    getBrickAtlasCalls.filter((call) => call.layerKey === 'layer-a' && call.timeIndex === 1 && call.scaleLevel === 1).length,
    1
  );
  assert.strictEqual(hook.result.playbackWarmupTimeIndex, 2);
  assert.ok(
    getBrickAtlasCalls.filter((call) => call.layerKey === 'layer-a' && call.timeIndex === 3 && call.scaleLevel === 1).length >= 1,
    'expected buffered playback warmup to request the second future frame'
  );
  hook.unmount();
})();

await (async () => {
  let viewerCameraSample: { distanceToTarget: number; isMoving: boolean; capturedAtMs: number } | null = {
    distanceToTarget: 8,
    isMoving: false,
    capturedAtMs: 1
  };
  const getBrickAtlasCalls: Array<{ layerKey: string; timeIndex: number; scaleLevel: number | undefined }> = [];

  const provider = {
    getVolume: async (_layerKey: string, timeIndex: number) => createVolume(timeIndex + 55),
    getBrickAtlas: async (layerKey: string, timeIndex: number, options?: { scaleLevel?: number }) => {
      getBrickAtlasCalls.push({ layerKey, timeIndex, scaleLevel: options?.scaleLevel });
      return createBrickAtlas(timeIndex, options?.scaleLevel ?? 0);
    }
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
                  scales: [
                    { level: 0, downsampleFactor: [1, 1, 1] },
                    { level: 1, downsampleFactor: [2, 2, 2] },
                    { level: 2, downsampleFactor: [4, 4, 4] }
                  ]
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
      channelVisibility: { 'channel-a': true },
      layerChannelMap: new Map<string, string>([['layer-a', 'channel-a']]),
      preferBrickResidency: true,
      viewerCameraSample,
      volumeTimepointCount: 4,
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
  assert.deepStrictEqual(getBrickAtlasCalls[0], { layerKey: 'layer-a', timeIndex: 1, scaleLevel: 2 });

  viewerCameraSample = {
    distanceToTarget: 0.8,
    isMoving: false,
    capturedAtMs: 2
  };
  const brickAtlasCallCountBeforeCameraUpdate = getBrickAtlasCalls.length;
  hook.rerender();
  await flushAsyncWork();
  assert.strictEqual(
    getBrickAtlasCalls.length,
    brickAtlasCallCountBeforeCameraUpdate,
    'paused current-frame refinement should stay stable for the already-loaded frame'
  );

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
  assert.deepStrictEqual(getBrickAtlasCalls, [{ layerKey: 'layer-a', timeIndex: 1, scaleLevel: 0 }]);
  assert.strictEqual(getVolumeCalls, 1);
  assert.ok(hook.result.currentLayerVolumes['layer-a']);
  assert.strictEqual(hook.result.currentLayerBrickAtlases['layer-a'] ?? null, null);
  hook.unmount();
})();

await (async () => {
  let isPlaying = true;
  let viewerCameraSample: { distanceToTarget: number; isMoving: boolean; capturedAtMs: number } | null = {
    distanceToTarget: 10,
    isMoving: false,
    capturedAtMs: 1
  };
  const getBrickAtlasCalls: Array<{ layerKey: string; timeIndex: number; scaleLevel: number | undefined }> = [];

  const provider = {
    getVolume: async (_layerKey: string, timeIndex: number) => createVolume(timeIndex + 60),
    getBrickAtlas: async (layerKey: string, timeIndex: number, options?: { scaleLevel?: number }) => {
      getBrickAtlasCalls.push({ layerKey, timeIndex, scaleLevel: options?.scaleLevel });
      return createBrickAtlas(timeIndex, options?.scaleLevel ?? 0);
    },
    getDiagnostics: () => createDiagnosticsSnapshot(0.98)
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
                  scales: [
                    { level: 0, downsampleFactor: [1, 1, 1] },
                    { level: 1, downsampleFactor: [2, 2, 2] },
                    { level: 2, downsampleFactor: [4, 4, 4] }
                  ]
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
      channelVisibility: { 'channel-a': true },
      layerChannelMap: new Map<string, string>([['layer-a', 'channel-a']]),
      preferBrickResidency: true,
      viewerCameraSample,
      volumeTimepointCount: 4,
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
  assert.deepStrictEqual(getBrickAtlasCalls[0], { layerKey: 'layer-a', timeIndex: 1, scaleLevel: 1 });

  viewerCameraSample = {
    distanceToTarget: 0.8,
    isMoving: true,
    capturedAtMs: 2
  };
  hook.rerender();
  await flushAsyncWork();
  assert.deepStrictEqual(
    getBrickAtlasCalls.filter((call) => call.timeIndex === 1),
    [{ layerKey: 'layer-a', timeIndex: 1, scaleLevel: 1 }],
    'camera movement during playback should not reload the current playback frame at a new scale'
  );
  assert.ok(
    getBrickAtlasCalls.every((call) => call.scaleLevel === 1),
    'camera movement during playback should keep all playback warmup requests pinned to the playback scale'
  );

  isPlaying = false;
  viewerCameraSample = {
    distanceToTarget: 0.8,
    isMoving: false,
    capturedAtMs: 3
  };
  const brickAtlasCallCountBeforePause = getBrickAtlasCalls.length;
  hook.rerender();
  await flushAsyncWork();
  assert.ok(
    getBrickAtlasCalls.length >= brickAtlasCallCountBeforePause + 1,
    'stopping playback should restore the current frame to the paused-policy scale'
  );
  assert.ok(
    getBrickAtlasCalls.some((call, index) =>
      index >= brickAtlasCallCountBeforePause &&
      call.layerKey === 'layer-a' &&
      call.timeIndex === 1 &&
      call.scaleLevel === 0
    ),
    'stopping playback should request the current frame at the paused-policy scale'
  );
  hook.unmount();
})();

await (async () => {
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
      if (level === 0) {
        throw new Error('Array buffer allocation failed');
      }
      return createBrickAtlas(timeIndex, level);
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
      channelVisibility: { 'channel-a': true },
      layerChannelMap: new Map<string, string>([['layer-a', 'channel-a']]),
      preferBrickResidency: true,
      volumeTimepointCount: 4,
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
  assert.deepStrictEqual(getBrickAtlasCalls, [{ layerKey: 'layer-a', timeIndex: 1, scaleLevel: 0 }]);
  assert.strictEqual(getVolumeCalls, 1);
  assert.ok(hook.result.currentLayerVolumes['layer-a']);
  assert.strictEqual(hook.result.currentLayerBrickAtlases['layer-a'] ?? null, null);
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

await (async () => {
  let viewerCameraSample: { distanceToTarget: number; isMoving: boolean; capturedAtMs: number } | null = {
    distanceToTarget: 1,
    isMoving: false,
    capturedAtMs: 1
  };
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
          resolve: () => resolve(createVolume(timeIndex + 80))
        });
      })
  } as unknown as VolumeProvider;

  const hook = renderHook(() =>
    useRouteLayerVolumes({
      isViewerLaunched: true,
      isLaunchingViewer: false,
      isPlaying: false,
      preprocessedExperiment: {} as StagedPreprocessedExperiment,
      volumeProvider: provider,
      loadedChannelIds: ['channel-a'],
      channelLayersMap: new Map<string, LoadedDatasetLayer[]>([
        ['channel-a', [createLoadedLayer('layer-a', 'channel-a')]]
      ]),
      channelVisibility: { 'channel-a': true },
      layerChannelMap: new Map<string, string>([['layer-a', 'channel-a']]),
      preferBrickResidency: false,
      viewerCameraSample,
      volumeTimepointCount: 4,
      selectedIndex: 0,
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
  assert.strictEqual(pendingLoads[0]?.signal?.aborted ?? false, false);

  viewerCameraSample = {
    distanceToTarget: 1.1,
    isMoving: false,
    capturedAtMs: 2
  };
  hook.rerender();
  await flushAsyncWork();
  assert.strictEqual(
    pendingLoads.length,
    1,
    'camera-only rerender with unchanged load intent should not start a second request'
  );
  assert.strictEqual(pendingLoads[0]?.signal?.aborted ?? false, false);

  pendingLoads[0]?.resolve();
  await flushAsyncWork();
  assert.deepStrictEqual(Array.from(hook.result.currentLayerVolumes['layer-a']?.normalized ?? []), Array(8).fill(80));
  assert.strictEqual(showLaunchErrorCalls, 0);
  hook.unmount();
})();

await (async () => {
  let isPlaying = true;
  const getBrickAtlasCalls: Array<{ layerKey: string; timeIndex: number; scaleLevel: number | undefined }> = [];

  const provider = {
    getVolume: async (_layerKey: string, timeIndex: number) => createVolume(timeIndex + 70),
    getBrickAtlas: async (layerKey: string, timeIndex: number, options?: { scaleLevel?: number }) => {
      getBrickAtlasCalls.push({ layerKey, timeIndex, scaleLevel: options?.scaleLevel });
      return createBrickAtlas(timeIndex, options?.scaleLevel ?? 0);
    }
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
                  scales: [
                    { level: 0, downsampleFactor: [1, 1, 1] },
                    { level: 1, downsampleFactor: [2, 2, 2] }
                  ]
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
      channelVisibility: { 'channel-a': true },
      layerChannelMap: new Map<string, string>([['layer-a', 'channel-a']]),
      preferBrickResidency: true,
      volumeTimepointCount: 4,
      playbackBufferFrameCount: 1,
      selectedIndex: 0,
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
  assert.ok(
    hook.result.playbackWarmupFrames.some((frame) => frame.timeIndex === 1),
    'expected next playback frame to be warmed while playing'
  );
  assert.strictEqual(
    getBrickAtlasCalls.filter((call) => call.layerKey === 'layer-a' && call.timeIndex === 1 && call.scaleLevel === 1).length,
    1
  );

  isPlaying = false;
  hook.rerender();
  await flushAsyncWork();
  assert.ok(
    hook.result.playbackWarmupFrames.some((frame) => frame.timeIndex === 1),
    'pausing should retain completed warmup frames for reuse'
  );

  isPlaying = true;
  hook.rerender();
  await flushAsyncWork();
  assert.strictEqual(
    getBrickAtlasCalls.filter((call) => call.layerKey === 'layer-a' && call.timeIndex === 1 && call.scaleLevel === 1).length,
    1,
    'resuming playback should reuse the retained warmup frame instead of reloading it'
  );
  hook.unmount();
})();

await (async () => {
  const getBrickAtlasCalls: Array<{ layerKey: string; timeIndex: number; scaleLevel: number | undefined }> = [];

  const provider = {
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
                  scales: [
                    { level: 0, downsampleFactor: [1, 1, 1] },
                    { level: 1, downsampleFactor: [2, 2, 2] }
                  ]
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
      isPlaybackStartPending: true,
      preprocessedExperiment,
      volumeProvider: provider,
      loadedChannelIds: ['channel-a'],
      channelLayersMap: new Map<string, LoadedDatasetLayer[]>([
        ['channel-a', [createLoadedLayer('layer-a', 'channel-a')]],
      ]),
      channelVisibility: { 'channel-a': true },
      layerChannelMap: new Map<string, string>([['layer-a', 'channel-a']]),
      preferBrickResidency: true,
      volumeTimepointCount: 4,
      playbackBufferFrameCount: 1,
      selectedIndex: 0,
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
  assert.ok(
    hook.result.playbackWarmupFrames.some((frame) => frame.timeIndex === 1),
    'pending buffered-start should warm the next playback frame before play begins'
  );
  assert.strictEqual(
    getBrickAtlasCalls.filter((call) => call.layerKey === 'layer-a' && call.timeIndex === 1 && call.scaleLevel === 1).length,
    1,
    'pending buffered-start should use playback-scale warming, not paused-view scale warming'
  );
  hook.unmount();
})();

await (async () => {
  const getBackgroundMaskCalls: number[] = [];
  const provider = {
    getVolume: async (layerKey: string, timeIndex: number) => {
      const volume = createVolume(timeIndex + 20);
      return {
        ...volume,
        scaleLevel: layerKey === 'layer-a' ? 2 : 1
      };
    },
    getBrickPageTable: async (_layerKey: string, timeIndex: number) => createBrickPageTable(timeIndex),
    getBackgroundMask: async (options?: { scaleLevel?: number | undefined }) => {
      const scaleLevel = options?.scaleLevel ?? 0;
      getBackgroundMaskCalls.push(scaleLevel);
      return createBackgroundMask(scaleLevel);
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
      channelVisibility: { 'channel-a': true, 'channel-b': true },
      layerChannelMap: new Map<string, string>([
        ['layer-a', 'channel-a'],
        ['layer-b', 'channel-b'],
      ]),
      preferBrickResidency: false,
      volumeTimepointCount: 3,
      selectedIndex: 0,
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
        throw new Error('showLaunchError should not be called in this test');
      }
    })
  );

  await hook.act(async () => {
    await hook.result.handleLaunchViewer();
  });

  assert.deepStrictEqual(getBackgroundMaskCalls, []);
  assert.deepStrictEqual(hook.result.currentBackgroundMasksByScale, {});
  hook.unmount();
})();

await (async () => {
  let viewerCameraSample: { distanceToTarget: number; isMoving: boolean; capturedAtMs: number } | null = {
    distanceToTarget: 10,
    isMoving: false,
    capturedAtMs: 1
  };
  let warmupAbortCount = 0;
  const getBrickAtlasCalls: Array<{ layerKey: string; timeIndex: number; scaleLevel: number | undefined }> = [];

  const provider = {
    getBrickAtlas: async (layerKey: string, timeIndex: number, options?: { scaleLevel?: number }) => {
      getBrickAtlasCalls.push({ layerKey, timeIndex, scaleLevel: options?.scaleLevel });
      if (timeIndex === 1 && warmupAbortCount === 0) {
        warmupAbortCount += 1;
        throw createAbortLikeError();
      }
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
      isPlaying: true,
      preprocessedExperiment,
      volumeProvider: provider,
      loadedChannelIds: ['channel-a'],
      channelLayersMap: new Map<string, LoadedDatasetLayer[]>([
        ['channel-a', [createLoadedLayer('layer-a', 'channel-a')]],
      ]),
      channelVisibility: { 'channel-a': true },
      layerChannelMap: new Map<string, string>([['layer-a', 'channel-a']]),
      preferBrickResidency: true,
      viewerCameraSample,
      volumeTimepointCount: 2,
      selectedIndex: 0,
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
  assert.strictEqual(
    getBrickAtlasCalls.filter((call) => call.timeIndex === 1 && call.scaleLevel === 1).length,
    1,
    'expected initial warmup request for the next playback frame'
  );
  assert.ok(
    !hook.result.playbackWarmupFrames.some((frame) => frame.timeIndex === 1),
    'aborted warmup request should not leave behind a completed warmup frame'
  );

  viewerCameraSample = {
    distanceToTarget: 10,
    isMoving: false,
    capturedAtMs: 2
  };
  hook.rerender();
  await flushAsyncWork();

  assert.strictEqual(
    getBrickAtlasCalls.filter((call) => call.timeIndex === 1 && call.scaleLevel === 1).length,
    2,
    'warmup intent should be cleared after an abort-like failure so the slot can retry'
  );
  assert.ok(
    hook.result.playbackWarmupFrames.some((frame) => frame.timeIndex === 1),
    'the missing playback warmup frame should be restored after retry'
  );
  hook.unmount();
})();

await (async () => {
  let viewerCameraSample: { distanceToTarget: number; isMoving: boolean; capturedAtMs: number } | null = {
    distanceToTarget: 10,
    isMoving: false,
    capturedAtMs: 1
  };
  let currentAbortCount = 0;
  const getBrickAtlasCalls: Array<{ layerKey: string; timeIndex: number; scaleLevel: number | undefined }> = [];

  const provider = {
    getBrickAtlas: async (layerKey: string, timeIndex: number, options?: { scaleLevel?: number }) => {
      getBrickAtlasCalls.push({ layerKey, timeIndex, scaleLevel: options?.scaleLevel });
      if (timeIndex === 0 && currentAbortCount === 0) {
        currentAbortCount += 1;
        throw createAbortLikeError();
      }
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
      isPlaying: true,
      preprocessedExperiment,
      volumeProvider: provider,
      loadedChannelIds: ['channel-a'],
      channelLayersMap: new Map<string, LoadedDatasetLayer[]>([
        ['channel-a', [createLoadedLayer('layer-a', 'channel-a')]],
      ]),
      channelVisibility: { 'channel-a': true },
      layerChannelMap: new Map<string, string>([['layer-a', 'channel-a']]),
      preferBrickResidency: true,
      viewerCameraSample,
      volumeTimepointCount: 1,
      selectedIndex: 0,
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
  assert.strictEqual(
    getBrickAtlasCalls.filter((call) => call.timeIndex === 0 && call.scaleLevel === 1).length,
    1,
    'expected initial current-frame request at the playback scale'
  );
  assert.equal(hook.result.currentLayerBrickAtlases['layer-a'] ?? null, null);

  viewerCameraSample = {
    distanceToTarget: 10,
    isMoving: false,
    capturedAtMs: 2
  };
  hook.rerender();
  await flushAsyncWork();

  assert.strictEqual(
    getBrickAtlasCalls.filter((call) => call.timeIndex === 0 && call.scaleLevel === 1).length,
    2,
    'current-frame intent should be cleared after an abort-like failure so the same frame can retry'
  );
  assert.ok(hook.result.currentLayerBrickAtlases['layer-a']);
  hook.unmount();
})();

console.log('useRouteLayerVolumes tests passed');
