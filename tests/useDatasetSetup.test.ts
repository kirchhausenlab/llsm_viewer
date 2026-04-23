import assert from 'node:assert/strict';

import React from 'react';

import { useDatasetSetup } from '../src/hooks/dataset/useDatasetSetup.ts';
import type { TrackSetSource } from '../src/hooks/dataset/useChannelSources.ts';
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
      setTracks: React.useState<TrackSetSource[]>([])[1],
      loadedLayers: [],
      layerSettings,
      setChannels,
      setLayerSettings,
      setLayerAutoThresholds,
      setLayerTimepointCounts,
      setLayerTimepointCountErrors,
      computeLayerTimepointCount: async (files) => files.length,
      createChannelSource: (name, channelType = 'channel') => ({ id: `channel-generated-${name || 'empty'}`, name, volume: null, channelType }),
      createVolumeSource: (files) => ({ id: `layer-${layerCounter.current++}`, files, isSegmentation: false }),
      probeVolumeSourceMetadata: async () => ({ channels: 1, dataType: 'uint8' as const })
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
      setTracks: React.useState<TrackSetSource[]>([])[1],
      loadedLayers: [],
      layerSettings: {},
      setChannels,
      setLayerSettings: React.useState<Record<string, ReturnType<typeof createDefaultLayerSettings>>>({})[1],
      setLayerAutoThresholds: React.useState<Record<string, number>>({})[1],
      setLayerTimepointCounts: React.useState<Record<string, number>>({})[1],
      setLayerTimepointCountErrors: React.useState<Record<string, string>>({})[1],
      computeLayerTimepointCount: async (files) => files.length,
      createChannelSource: (name, channelType = 'channel') => ({ id: `channel-generated-${name || 'empty'}`, name, volume: null, channelType }),
      createVolumeSource: (files) => ({ id: `layer-${layerCounter.current++}`, files, isSegmentation: false }),
      probeVolumeSourceMetadata: async () => ({ channels: 1, dataType: 'uint8' as const })
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
  let resolveTimepointCount: ((value: number) => void) | null = null;
  const pendingTimepointCount = new Promise<number>((resolve) => {
    resolveTimepointCount = resolve;
  });

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
      setTracks: React.useState<TrackSetSource[]>([])[1],
      loadedLayers: [],
      layerSettings: {},
      setChannels,
      setLayerSettings: React.useState<Record<string, ReturnType<typeof createDefaultLayerSettings>>>({})[1],
      setLayerAutoThresholds: React.useState<Record<string, number>>({})[1],
      setLayerTimepointCounts,
      setLayerTimepointCountErrors,
      computeLayerTimepointCount: async () => pendingTimepointCount,
      createChannelSource: (name, channelType = 'channel') => ({ id: `channel-generated-${name || 'empty'}`, name, volume: null, channelType }),
      createVolumeSource: (files) => ({ id: `layer-${layerCounter.current++}`, files, isSegmentation: false }),
      probeVolumeSourceMetadata: async () => ({ channels: 1 })
    });

    return {
      ...datasetSetup,
      channels,
      layerTimepointCounts,
      layerTimepointCountErrors
    };
  });

  const { act } = hook;
  let pendingUpload: Promise<void> | null = null;

  await act(async () => {
    pendingUpload = hook.result.handleChannelLayerFilesAdded('channel-1', [createFile('slow.tif')]);
    await Promise.resolve();
  });

  const volume = hook.result.channels[0]?.volume;
  assert.ok(volume);
  assert.deepEqual(volume.files.map((file) => file.name), ['slow.tif']);
  assert.deepEqual(hook.result.layerTimepointCounts, {});
  assert.deepEqual(hook.result.layerTimepointCountErrors, {});

  await act(async () => {
    resolveTimepointCount?.(7);
    await pendingUpload;
  });

  assert.equal(hook.result.layerTimepointCounts[volume.id], 7);
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
      setTracks: React.useState<TrackSetSource[]>([])[1],
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
      createChannelSource: (name, channelType = 'channel') => ({ id: `channel-generated-${name || 'empty'}`, name, volume: null, channelType }),
      createVolumeSource: (files) => ({ id: `layer-${layerCounter.current++}`, files, isSegmentation: false }),
      probeVolumeSourceMetadata: async () => ({ channels: 1, dataType: 'uint8' as const })
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

await (async () => {
  const hook = renderHook(() => {
    const [channels, setChannels] = React.useState([
      {
        id: 'channel-1',
        name: 'Channel 1',
        volume: null,
        channelType: 'channel' as const
      }
    ]);
    const [tracks, setTracks] = React.useState([
      {
        id: 'track-1',
        name: 'Track 1',
        boundChannelId: 'channel-2',
        timepointConvention: 'zero-based' as const,
        file: null,
        fileName: '',
        status: 'idle' as const,
        error: null,
        compiledHeader: null,
        loadCompiledCatalog: null,
        loadCompiledPayload: null
      }
    ]);
    const [layerTimepointCounts, setLayerTimepointCounts] = React.useState<Record<string, number>>({});
    const [layerTimepointCountErrors, setLayerTimepointCountErrors] = React.useState<Record<string, string>>({});
    const layerCounter = React.useRef(1);
    const channelCounter = React.useRef(1);

    const datasetSetup = useDatasetSetup({
      channels,
      setTracks,
      loadedLayers: [],
      layerSettings: {},
      setChannels,
      setLayerSettings: React.useState<Record<string, ReturnType<typeof createDefaultLayerSettings>>>({})[1],
      setLayerAutoThresholds: React.useState<Record<string, number>>({})[1],
      setLayerTimepointCounts,
      setLayerTimepointCountErrors,
      computeLayerTimepointCount: async (files) => files.length * 3,
      createChannelSource: (name, channelType = 'channel') => {
        channelCounter.current += 1;
        return {
          id: `channel-${channelCounter.current}`,
          name,
          volume: null,
          channelType
        };
      },
      createVolumeSource: (files) => ({ id: `layer-${layerCounter.current++}`, files, isSegmentation: false }),
      probeVolumeSourceMetadata: async () => ({ channels: 3, dataType: 'uint8' as const })
    });

    return {
      ...datasetSetup,
      channels,
      tracks,
      layerTimepointCounts,
      layerTimepointCountErrors
    };
  });

  const { act } = hook;
  const sourceFile = createFile('rgb-stack.tif');

  await act(async () => {
    await hook.result.handleChannelLayerFilesAdded('channel-1', [sourceFile]);
  });

  assert.equal(hook.result.channels.length, 3);
  assert.deepEqual(
    hook.result.channels.map((channel) => ({
      id: channel.id,
      componentIndex: channel.volume?.componentIndex,
      sourceChannels: channel.volume?.sourceChannels,
      ownerId: channel.volume?.multichannelOwnerChannelId ?? null
    })),
    [
      { id: 'channel-1', componentIndex: 0, sourceChannels: 3, ownerId: 'channel-1' },
      { id: 'channel-2', componentIndex: 1, sourceChannels: 3, ownerId: 'channel-1' },
      { id: 'channel-3', componentIndex: 2, sourceChannels: 3, ownerId: 'channel-1' }
    ]
  );
  assert.deepEqual(
    Object.values(hook.result.layerTimepointCounts).sort((left, right) => left - right),
    [3, 3, 3]
  );

  const ownerVolumeId = hook.result.channels[0]?.volume?.id ?? null;
  assert.ok(ownerVolumeId);

  await act(async () => {
    hook.result.handleChannelLayerRemove('channel-1', ownerVolumeId!);
  });

  assert.equal(hook.result.channels.length, 1);
  assert.equal(hook.result.channels[0]?.volume, null);
  assert.equal(hook.result.tracks[0]?.boundChannelId, null);
  assert.deepEqual(hook.result.layerTimepointCounts, {});
  assert.deepEqual(hook.result.layerTimepointCountErrors, {});
})();

await (async () => {
  const hook = renderHook(() => {
    const [channels, setChannels] = React.useState([
      {
        id: 'channel-1',
        name: 'Segmentation',
        volume: null,
        channelType: 'segmentation' as const
      }
    ]);

    const datasetSetup = useDatasetSetup({
      channels,
      setTracks: React.useState<TrackSetSource[]>([])[1],
      loadedLayers: [],
      layerSettings: {},
      setChannels,
      setLayerSettings: React.useState<Record<string, ReturnType<typeof createDefaultLayerSettings>>>({})[1],
      setLayerAutoThresholds: React.useState<Record<string, number>>({})[1],
      setLayerTimepointCounts: React.useState<Record<string, number>>({})[1],
      setLayerTimepointCountErrors: React.useState<Record<string, string>>({})[1],
      computeLayerTimepointCount: async (files) => files.length,
      createChannelSource: (name, channelType = 'channel') => ({ id: `channel-generated-${name || 'empty'}`, name, volume: null, channelType }),
      createVolumeSource: (files) => ({ id: 'seg-layer', files, isSegmentation: false }),
      probeVolumeSourceMetadata: async () => ({ channels: 2, dataType: 'uint8' as const })
    });

    return {
      ...datasetSetup,
      channels
    };
  });

  const { act } = hook;
  await act(async () => {
    await hook.result.handleChannelLayerFilesAdded('channel-1', [createFile('seg-multi.tif')]);
  });

  assert.equal(hook.result.channels[0]?.volume, null);
  assert.match(hook.result.datasetErrors.datasetError ?? '', /Segmentation channels require single-channel TIFF volumes/);
})();

console.log('useDatasetSetup tests passed');
