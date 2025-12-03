import assert from 'node:assert/strict';

import useChannelEditing from '../../../src/app/hooks/useChannelEditing.ts';
import type { ChannelSource } from '../../../src/hooks/useChannelSources.ts';
import { renderHook } from '../../hooks/renderHook.ts';

const createChannel = (id: string, name: string): ChannelSource => ({
  id,
  name,
  layers: [],
  trackFile: null,
  trackStatus: 'idle',
  trackError: null,
  trackEntries: []
});

console.log('Starting useChannelEditing tests');

(() => {
  let channels: ChannelSource[] = [];
  const hook = renderHook(() => useChannelEditing({ channels, isLaunchingViewer: false }));

  assert.strictEqual(hook.result.activeChannelId, null);

  channels = [createChannel('a', 'Alpha'), createChannel('b', 'Beta')];
  hook.rerender();

  assert.strictEqual(hook.result.activeChannelId, 'a');

  channels = [];
  hook.rerender();

  assert.strictEqual(hook.result.activeChannelId, null);
})();

(() => {
  const pendingChannel = createChannel('pending', 'Pending');
  let channels: ChannelSource[] = [];
  const hook = renderHook(() => useChannelEditing({ channels, isLaunchingViewer: false }));

  hook.result.queuePendingChannelFocus(pendingChannel.id, pendingChannel.name);

  channels = [pendingChannel];
  hook.rerender();

  assert.strictEqual(hook.result.activeChannelId, pendingChannel.id);
  assert.strictEqual(hook.result.editingChannelId, pendingChannel.id);
  assert.strictEqual(hook.result.editingChannelOriginalNameRef.current, pendingChannel.name);
})();

(() => {
  const channelA = createChannel('a', 'Alpha');
  const channelB = createChannel('b', 'Beta');
  const channelC = createChannel('c', 'Gamma');
  let channels: ChannelSource[] = [channelA, channelB, channelC];
  const hook = renderHook(() => useChannelEditing({ channels, isLaunchingViewer: false }));
  const { act } = hook;

  act(() => hook.result.setActiveChannelId(channelB.id));

  act(() =>
    hook.result.handleChannelRemoved({
      removedChannelId: channelB.id,
      previousChannels: channels,
      nextChannels: [channelA, channelC]
    })
  );

  channels = [channelA, channelC];
  hook.rerender();

  assert.strictEqual(hook.result.activeChannelId, channelA.id);

  channels = [channelC];
  hook.rerender();

  assert.strictEqual(hook.result.activeChannelId, channelC.id);
})();

(() => {
  const channel = createChannel('a', 'Alpha');
  let isLaunchingViewer = false;
  const channels: ChannelSource[] = [channel];
  const hook = renderHook(() => useChannelEditing({ channels, isLaunchingViewer }));
  const { act, rerender } = hook;

  let focused = false;
  let selected = false;

  hook.result.editingChannelInputRef.current = {
    focus() {
      focused = true;
    },
    select() {
      selected = true;
    }
  } as unknown as HTMLInputElement;

  act(() => hook.result.startEditingChannel(channel.id, channel.name));
  rerender();

  assert.strictEqual(hook.result.editingChannelId, channel.id);
  assert.strictEqual(focused, true);
  assert.strictEqual(selected, true);

  act(() => hook.result.setActiveChannelId('other'));
  rerender();

  assert.strictEqual(hook.result.editingChannelId, null);

  isLaunchingViewer = true;
  rerender();

  assert.strictEqual(hook.result.editingChannelId, null);
})();

console.log('useChannelEditing tests passed');
