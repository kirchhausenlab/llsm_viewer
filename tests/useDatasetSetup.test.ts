import assert from 'node:assert/strict';

import React from 'react';

import { useDatasetSetup } from '../src/hooks/dataset/useDatasetSetup.ts';
import { createDefaultLayerSettings } from '../src/state/layerSettings.ts';
import { renderHook } from './hooks/renderHook.ts';

console.log('Starting useDatasetSetup tests');

const createFile = (name: string, relativePath?: string) => {
  const file = new File(['content'], name);
  if (relativePath) {
    Object.defineProperty(file, 'webkitRelativePath', {
      value: relativePath,
      configurable: true
    });
  }
  return file;
};

await (async () => {
  const hook = renderHook(() => {
    const [channels, setChannels] = React.useState([
      {
        id: 'channel-1',
        name: 'Channel 1',
        volume: { id: 'layer-1', files: [createFile('initial.tif')], isSegmentation: false }
      }
    ]);
    const [layerSettings, setLayerSettings] = React.useState<Record<string, ReturnType<typeof createDefaultLayerSettings>>>(
      {
        'layer-1': createDefaultLayerSettings({ windowMin: 0, windowMax: 1 })
      }
    );
    const [layerAutoThresholds, setLayerAutoThresholds] = React.useState<Record<string, number>>({ 'layer-1': 0.2 });
    const [layerTimepointCounts, setLayerTimepointCounts] = React.useState<Record<string, number>>({ 'layer-1': 1 });
    const [layerTimepointCountErrors, setLayerTimepointCountErrors] = React.useState<Record<string, string>>({});
    const layerCounter = React.useRef(2);

    const datasetSetup = useDatasetSetup({
      channels,
      loadedLayers: [],
      layerSettings,
      setChannels,
      setLayerSettings,
      setLayerAutoThresholds,
      setLayerTimepointCounts,
      setLayerTimepointCountErrors,
      computeLayerTimepointCount: async (files) => files.length,
      createVolumeSource: (files) => ({ id: `layer-${layerCounter.current++}`, files, isSegmentation: false })
    });

    return {
      ...datasetSetup,
      channels,
      layerSettings,
      layerAutoThresholds,
      layerTimepointCounts,
      layerTimepointCountErrors
    };
  });

  const { act } = hook;
  const replacement = createFile('replacement.tif');

  await act(async () => {
    await hook.result.handleChannelLayerFilesAdded('channel-1', [replacement]);
  });

  assert.ok(!('layer-1' in hook.result.layerSettings));
  assert.ok(!('layer-1' in hook.result.layerAutoThresholds));
  assert.ok(!('layer-1' in hook.result.layerTimepointCounts));
  assert.ok(!('layer-1' in hook.result.layerTimepointCountErrors));
})();

await (async () => {
  const hook = renderHook(() => {
    const [channels, setChannels] = React.useState([
      {
        id: 'channel-1',
        name: 'Channel 1',
        volume: null
      }
    ]);

    const layerCounter = React.useRef(1);

    const datasetSetup = useDatasetSetup({
      channels,
      loadedLayers: [],
      layerSettings: {},
      setChannels,
      setLayerSettings: React.useState<Record<string, ReturnType<typeof createDefaultLayerSettings>>>({})[1],
      setLayerAutoThresholds: React.useState<Record<string, number>>({})[1],
      setLayerTimepointCounts: React.useState<Record<string, number>>({})[1],
      setLayerTimepointCountErrors: React.useState<Record<string, string>>({})[1],
      computeLayerTimepointCount: async (files) => files.length,
      createVolumeSource: (files) => ({ id: `layer-${layerCounter.current++}`, files, isSegmentation: false })
    });

    return datasetSetup;
  });

  const { act } = hook;
  const first = createFile('a.tif', 'group-a/volume1.tif');
  const second = createFile('b.tif', 'group-b/volume1.tif');

  await act(async () => {
    await hook.result.handleChannelLayerFilesAdded('channel-1', [first, second]);
  });

  assert.strictEqual(
    hook.result.datasetErrors.datasetError,
    'Only the first TIFF sequence was added. Additional sequences were ignored.'
  );
  assert.strictEqual(hook.result.datasetErrors.datasetErrorContext, 'interaction');
})();

await (async () => {
  const hook = renderHook(() => {
    const [channels, setChannels] = React.useState([
      {
        id: 'channel-1',
        name: 'Channel 1',
        volume: null
      }
    ]);
    const [layerTimepointCounts, setLayerTimepointCounts] = React.useState<Record<string, number>>({});
    const [layerTimepointCountErrors, setLayerTimepointCountErrors] = React.useState<Record<string, string>>({});
    const layerCounter = React.useRef(1);

    const datasetSetup = useDatasetSetup({
      channels,
      loadedLayers: [],
      layerSettings: {},
      setChannels,
      setLayerSettings: React.useState<Record<string, ReturnType<typeof createDefaultLayerSettings>>>({})[1],
      setLayerAutoThresholds: React.useState<Record<string, number>>({})[1],
      setLayerTimepointCounts,
      setLayerTimepointCountErrors,
      computeLayerTimepointCount: async () => {
        throw new Error('Decoder exploded.');
      },
      createVolumeSource: (files) => ({ id: `layer-${layerCounter.current++}`, files, isSegmentation: false })
    });

    return {
      ...datasetSetup,
      channels,
      layerTimepointCounts,
      layerTimepointCountErrors
    };
  });

  const { act } = hook;
  await act(async () => {
    await hook.result.handleChannelLayerFilesAdded('channel-1', [createFile('broken.tif')]);
  });

  const volume = hook.result.channels[0]?.volume;
  assert.ok(volume);
  assert.deepStrictEqual(hook.result.layerTimepointCounts, {});
  assert.strictEqual(
    hook.result.layerTimepointCountErrors[volume.id],
    'Failed to read TIFF timepoint count: Decoder exploded.'
  );
  assert.strictEqual(
    hook.result.datasetErrors.datasetError,
    'Failed to read TIFF timepoint count: Decoder exploded.'
  );
  assert.strictEqual(hook.result.datasetErrors.datasetErrorContext, 'interaction');
})();

console.log('useDatasetSetup tests passed');
