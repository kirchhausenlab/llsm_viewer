import assert from 'node:assert/strict';

import React from 'react';

import type { ChannelSource, TrackSetSource } from '../../../src/hooks/dataset/useChannelSources.ts';
import { useRouteDatasetSetupState } from '../../../src/ui/app/hooks/useRouteDatasetSetupState.ts';
import { renderHook } from '../../hooks/renderHook.ts';

console.log('Starting useRouteDatasetSetupState tests');

const createChannel = (
  id: string,
  name: string,
  volumeId: string | null = null,
  channelType: ChannelSource['channelType'] = 'channel'
): ChannelSource => ({
  id,
  name,
  channelType,
  volume: volumeId
    ? {
        id: volumeId,
        files: [new File(['data'], `${volumeId}.tif`)],
        isSegmentation: false
      }
    : null
});

const createTrackSet = (id: string, name: string, boundChannelId: string | null): TrackSetSource => ({
  id,
  name,
  boundChannelId,
  timepointConvention: 'zero-based',
  file: null,
  fileName: '',
  status: 'idle',
  error: null,
  compiledHeader: null,
  loadCompiledCatalog: null,
  loadCompiledPayload: null,
});

(() => {
  const createdChannelIds: string[] = [];
  const createdChannelTypes: Array<ChannelSource['channelType'] | undefined> = [];
  const queuedFocus: Array<{ channelId: string; originalName: string }> = [];
  const startedEditing: Array<{ channelId: string; originalName: string }> = [];
  let clearDatasetErrorCalls = 0;
  let resetPreprocessedStateCalls = 0;
  let resetEditingCalls = 0;
  let nextId = 2;

  const hook = renderHook(() => {
    const [channels, setChannels] = React.useState<ChannelSource[]>([createChannel('channel-1', 'Initial')]);
    const [tracks, setTracks] = React.useState<TrackSetSource[]>([]);
    const [isExperimentSetupStarted, setIsExperimentSetupStarted] = React.useState(false);
    const [layerTimepointCounts, setLayerTimepointCounts] = React.useState<Record<string, number>>({});
    const [layerTimepointCountErrors, setLayerTimepointCountErrors] = React.useState<Record<string, string>>({});

    const route = useRouteDatasetSetupState({
      channels,
      resetPreprocessedState: () => {
        resetPreprocessedStateCalls += 1;
      },
      setIsExperimentSetupStarted,
      resetChannelEditingState: () => {
        resetEditingCalls += 1;
      },
      clearDatasetError: () => {
        clearDatasetErrorCalls += 1;
      },
      setChannels,
      setTracks,
      createChannelSource: (name, channelType) => {
        const id = `channel-${nextId}`;
        nextId += 1;
        createdChannelIds.push(id);
        createdChannelTypes.push(channelType);
        return createChannel(id, name, null, channelType ?? 'channel');
      },
      queuePendingChannelFocus: (channelId, originalName) => {
        queuedFocus.push({ channelId, originalName });
      },
      startEditingChannel: (channelId, originalName) => {
        startedEditing.push({ channelId, originalName });
      },
      handleChannelRemoved: () => {},
      setLayerTimepointCounts,
      setLayerTimepointCountErrors,
    });

    return {
      ...route,
      channels,
      tracks,
      isExperimentSetupStarted,
      layerTimepointCounts,
      layerTimepointCountErrors,
    };
  });

  hook.act(() => {
    hook.result.handleStartExperimentSetup();
  });
  assert.strictEqual(hook.result.isExperimentSetupStarted, true);
  assert.strictEqual(resetPreprocessedStateCalls, 1);
  assert.strictEqual(resetEditingCalls, 1);
  assert.strictEqual(clearDatasetErrorCalls, 1);

  hook.act(() => {
    hook.result.handleAddChannel();
  });
  assert.deepStrictEqual(createdChannelIds, ['channel-2']);
  assert.deepStrictEqual(createdChannelTypes, ['channel']);
  assert.strictEqual(hook.result.channels.length, 2);
  assert.deepStrictEqual(queuedFocus, [{ channelId: 'channel-2', originalName: '' }]);
  assert.deepStrictEqual(startedEditing, [{ channelId: 'channel-2', originalName: '' }]);
  assert.strictEqual(clearDatasetErrorCalls, 2);

  hook.act(() => {
    hook.result.handleAddSegmentationChannel();
  });
  assert.deepStrictEqual(createdChannelIds, ['channel-2', 'channel-3']);
  assert.deepStrictEqual(createdChannelTypes, ['channel', 'segmentation']);
  assert.strictEqual(hook.result.channels.length, 3);
  assert.strictEqual(
    hook.result.channels.find((channel) => channel.id === 'channel-3')?.channelType,
    'segmentation',
  );

  hook.act(() => {
    hook.result.handleChannelNameChange('channel-2', 'Renamed');
  });
  assert.strictEqual(
    hook.result.channels.find((channel) => channel.id === 'channel-2')?.name,
    'Renamed',
  );

  hook.unmount();
})();

(() => {
  const removedContexts: Array<{ removedChannelId: string; previousCount: number; nextCount: number }> = [];
  let clearDatasetErrorCalls = 0;

  const hook = renderHook(() => {
    const [channels, setChannels] = React.useState<ChannelSource[]>([
      createChannel('channel-1', 'First', 'layer-1'),
      createChannel('channel-2', 'Second', 'layer-3'),
    ]);
    const [tracks, setTracks] = React.useState<TrackSetSource[]>([
      createTrackSet('track-set-1', 'Track 1', 'channel-1'),
      createTrackSet('track-set-2', 'Track 2', 'channel-2'),
      createTrackSet('track-set-3', 'Track 3', null),
    ]);
    const [layerTimepointCounts, setLayerTimepointCounts] = React.useState<Record<string, number>>({
      'layer-1': 5,
      'layer-3': 7,
    });
    const [layerTimepointCountErrors, setLayerTimepointCountErrors] = React.useState<Record<string, string>>({
      'layer-1': 'Failed to read TIFF timepoint count.'
    });

    const route = useRouteDatasetSetupState({
      channels,
      resetPreprocessedState: () => {},
      setIsExperimentSetupStarted: (value) => {
        void value;
      },
      resetChannelEditingState: () => {},
      clearDatasetError: () => {
        clearDatasetErrorCalls += 1;
      },
      setChannels,
      setTracks,
      createChannelSource: () => createChannel('channel-x', ''),
      queuePendingChannelFocus: () => {},
      startEditingChannel: () => {},
      handleChannelRemoved: ({ removedChannelId, previousChannels, nextChannels }) => {
        removedContexts.push({
          removedChannelId,
          previousCount: previousChannels.length,
          nextCount: nextChannels.length,
        });
      },
      setLayerTimepointCounts,
      setLayerTimepointCountErrors,
    });

    return {
      ...route,
      channels,
      tracks,
      layerTimepointCounts,
      layerTimepointCountErrors,
    };
  });

  hook.act(() => {
    hook.result.handleRemoveChannel('channel-1');
  });

  assert.deepStrictEqual(removedContexts, [
    { removedChannelId: 'channel-1', previousCount: 2, nextCount: 1 },
  ]);
  assert.strictEqual(hook.result.channels.length, 1);
  assert.deepStrictEqual(hook.result.layerTimepointCounts, { 'layer-3': 7 });
  assert.deepStrictEqual(hook.result.layerTimepointCountErrors, {});
  assert.deepStrictEqual(
    hook.result.tracks.map((track) => ({ id: track.id, boundChannelId: track.boundChannelId })),
    [
      { id: 'track-set-1', boundChannelId: null },
      { id: 'track-set-2', boundChannelId: 'channel-2' },
      { id: 'track-set-3', boundChannelId: null },
    ],
  );
  assert.strictEqual(clearDatasetErrorCalls, 1);
  hook.unmount();
})();

(() => {
  const removedContexts: Array<{ removedChannelId: string; previousCount: number; nextCount: number }> = [];

  const hook = renderHook(() => {
    const [channels, setChannels] = React.useState<ChannelSource[]>([
      {
        id: 'channel-1',
        name: 'Owner',
        channelType: 'channel',
        volume: {
          id: 'layer-1',
          files: [new File(['data'], 'owner.tif')],
          isSegmentation: false,
          sourceChannels: 3,
          componentIndex: 0,
          multichannelOwnerChannelId: 'channel-1'
        }
      },
      {
        id: 'channel-2',
        name: 'Derived 2',
        channelType: 'channel',
        volume: {
          id: 'layer-2',
          files: [new File(['data'], 'owner.tif')],
          isSegmentation: false,
          sourceChannels: 3,
          componentIndex: 1,
          multichannelOwnerChannelId: 'channel-1'
        }
      },
      {
        id: 'channel-3',
        name: 'Derived 3',
        channelType: 'channel',
        volume: {
          id: 'layer-3',
          files: [new File(['data'], 'owner.tif')],
          isSegmentation: false,
          sourceChannels: 3,
          componentIndex: 2,
          multichannelOwnerChannelId: 'channel-1'
        }
      },
      createChannel('channel-4', 'Standalone', 'layer-4'),
    ]);
    const [tracks, setTracks] = React.useState<TrackSetSource[]>([
      createTrackSet('track-set-1', 'Track 1', 'channel-2'),
      createTrackSet('track-set-2', 'Track 2', 'channel-4'),
    ]);
    const [layerTimepointCounts, setLayerTimepointCounts] = React.useState<Record<string, number>>({
      'layer-1': 5,
      'layer-2': 5,
      'layer-3': 5,
      'layer-4': 7,
    });
    const [layerTimepointCountErrors, setLayerTimepointCountErrors] = React.useState<Record<string, string>>({});

    const route = useRouteDatasetSetupState({
      channels,
      resetPreprocessedState: () => {},
      setIsExperimentSetupStarted: (value) => {
        void value;
      },
      resetChannelEditingState: () => {},
      clearDatasetError: () => {},
      setChannels,
      setTracks,
      createChannelSource: () => createChannel('channel-x', ''),
      queuePendingChannelFocus: () => {},
      startEditingChannel: () => {},
      handleChannelRemoved: ({ removedChannelId, previousChannels, nextChannels }) => {
        removedContexts.push({
          removedChannelId,
          previousCount: previousChannels.length,
          nextCount: nextChannels.length,
        });
      },
      setLayerTimepointCounts,
      setLayerTimepointCountErrors,
    });

    return {
      ...route,
      channels,
      tracks,
      layerTimepointCounts,
      layerTimepointCountErrors,
    };
  });

  hook.act(() => {
    hook.result.handleRemoveChannel('channel-1');
  });

  assert.deepStrictEqual(removedContexts, [
    { removedChannelId: 'channel-1', previousCount: 4, nextCount: 1 },
  ]);
  assert.deepStrictEqual(hook.result.channels.map((channel) => channel.id), ['channel-4']);
  assert.deepStrictEqual(hook.result.layerTimepointCounts, { 'layer-4': 7 });
  assert.deepStrictEqual(
    hook.result.tracks.map((track) => ({ id: track.id, boundChannelId: track.boundChannelId })),
    [
      { id: 'track-set-1', boundChannelId: null },
      { id: 'track-set-2', boundChannelId: 'channel-4' },
    ],
  );

  hook.unmount();
})();

console.log('useRouteDatasetSetupState tests passed');
