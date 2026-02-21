import assert from 'node:assert/strict';

import React from 'react';

import type { ChannelSource, TrackSetSource } from '../../../src/hooks/dataset/useChannelSources.ts';
import { useRouteDatasetSetupState } from '../../../src/ui/app/hooks/useRouteDatasetSetupState.ts';
import { renderHook } from '../../hooks/renderHook.ts';

console.log('Starting useRouteDatasetSetupState tests');

const createChannel = (
  id: string,
  name: string,
  layerIds: string[] = [],
  channelType: ChannelSource['channelType'] = 'channel'
): ChannelSource => ({
  id,
  name,
  channelType,
  layers: layerIds.map((layerId) => ({
    id: layerId,
    files: [new File(['data'], `${layerId}.tif`)],
    isSegmentation: false,
  })),
});

const createTrackSet = (id: string, name: string, boundChannelId: string | null): TrackSetSource => ({
  id,
  name,
  boundChannelId,
  file: null,
  fileName: '',
  status: 'idle',
  error: null,
  entries: [],
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

    const route = useRouteDatasetSetupState({
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
        return createChannel(id, name, [], channelType ?? 'channel');
      },
      queuePendingChannelFocus: (channelId, originalName) => {
        queuedFocus.push({ channelId, originalName });
      },
      startEditingChannel: (channelId, originalName) => {
        startedEditing.push({ channelId, originalName });
      },
      handleChannelRemoved: () => {},
      setLayerTimepointCounts,
    });

    return {
      ...route,
      channels,
      tracks,
      isExperimentSetupStarted,
      layerTimepointCounts,
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
      createChannel('channel-1', 'First', ['layer-1', 'layer-2']),
      createChannel('channel-2', 'Second', ['layer-3']),
    ]);
    const [tracks, setTracks] = React.useState<TrackSetSource[]>([
      createTrackSet('track-set-1', 'Track 1', 'channel-1'),
      createTrackSet('track-set-2', 'Track 2', 'channel-2'),
      createTrackSet('track-set-3', 'Track 3', null),
    ]);
    const [layerTimepointCounts, setLayerTimepointCounts] = React.useState<Record<string, number>>({
      'layer-1': 5,
      'layer-2': 5,
      'layer-3': 7,
    });

    const route = useRouteDatasetSetupState({
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
    });

    return {
      ...route,
      channels,
      tracks,
      layerTimepointCounts,
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

console.log('useRouteDatasetSetupState tests passed');
