import assert from 'node:assert/strict';

import type { NormalizedVolume } from '../../../src/core/volumeProcessing.ts';
import type { VolumeProvider } from '../../../src/core/volumeProvider.ts';
import type { LoadedDatasetLayer, StagedPreprocessedExperiment } from '../../../src/hooks/dataset/index.ts';
import { useRouteLayerVolumes } from '../../../src/ui/app/hooks/useRouteLayerVolumes.ts';
import { renderHook } from '../../hooks/renderHook.ts';

console.log('Starting useRouteLayerVolumes tests');

const createLoadedLayer = (key: string, channelId: string): LoadedDatasetLayer => ({
  key,
  label: key,
  channelId,
  isSegmentation: false,
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

const flushAsyncWork = async (iterations = 8) => {
  for (let index = 0; index < iterations; index += 1) {
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
  }
};

await (async () => {
  const getVolumeCalls: Array<{ layerKey: string; timeIndex: number }> = [];
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
  assert.ok(hook.result.currentLayerVolumes['layer-a']);
  assert.ok(hook.result.currentLayerVolumes['layer-b']);
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
  assert.deepStrictEqual(getVolumeCalls[0], { layerKey: 'layer-a-2', timeIndex: 1 });

  selectedIndex = 3;
  hook.rerender();
  await flushAsyncWork();
  assert.deepStrictEqual(getVolumeCalls[getVolumeCalls.length - 1], { layerKey: 'layer-a-2', timeIndex: 3 });

  hook.unmount();
})();

console.log('useRouteLayerVolumes tests passed');
