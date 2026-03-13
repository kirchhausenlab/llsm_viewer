import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

import VolumeChannelTabs from '../../src/components/viewers/viewer-shell/VolumeChannelTabs.tsx';

function createProps(overrides: Partial<React.ComponentProps<typeof VolumeChannelTabs>> = {}) {
  return {
    loadedChannelIds: ['channel-a', 'channel-b'],
    channelNameMap: new Map([
      ['channel-a', '1234567890123456789012345'],
      ['channel-b', 'Visible B']
    ]),
    channelVisibility: {
      'channel-a': false,
      'channel-b': true
    },
    channelTintMap: new Map([
      ['channel-a', '#ffffff'],
      ['channel-b', '#ffffff']
    ]),
    segmentationChannelIds: new Set<string>(),
    activeChannelId: 'channel-b',
    onChannelTabSelect: () => {},
    onChannelVisibilityToggle: () => {},
    ...overrides
  };
}

test('channel tabs truncate long labels and keep hidden styling', () => {
  const renderer = TestRenderer.create(<VolumeChannelTabs {...createProps()} />);

  const hiddenTab = renderer.root.findByProps({ id: 'channel-tab-channel-a' });
  const visibleTab = renderer.root.findByProps({ id: 'channel-tab-channel-b' });
  const hiddenLabel = hiddenTab.children[0];

  assert.equal(hiddenLabel.children.join(''), '12345678901');
  assert.equal(visibleTab.children[0].children.join(''), 'Visible B');

  renderer.unmount();
});

test('channel tabs middle-click toggles visibility and reselects hidden channels', () => {
  const visibilityCalls: string[] = [];
  const selectionCalls: string[] = [];
  let prevented = false;
  const renderer = TestRenderer.create(
    <VolumeChannelTabs
      {...createProps({
        onChannelVisibilityToggle: (channelId) => {
          visibilityCalls.push(channelId);
        },
        onChannelTabSelect: (channelId) => {
          selectionCalls.push(channelId);
        }
      })}
    />
  );

  const hiddenTab = renderer.root.findByProps({ id: 'channel-tab-channel-a' });
  const visibleTab = renderer.root.findByProps({ id: 'channel-tab-channel-b' });

  act(() => {
    hiddenTab.props.onAuxClick({
      button: 1,
      preventDefault() {
        prevented = true;
      }
    });
  });
  assert.equal(prevented, true);
  assert.deepEqual(visibilityCalls, ['channel-a']);
  assert.deepEqual(selectionCalls, ['channel-a']);

  act(() => {
    visibleTab.props.onAuxClick({
      button: 1,
      preventDefault() {}
    });
  });
  assert.deepEqual(visibilityCalls, ['channel-a', 'channel-b']);
  assert.deepEqual(selectionCalls, ['channel-a']);

  renderer.unmount();
});

test('channel tabs keep a four-tab viewport and scroll to the active tab', () => {
  const renderer = TestRenderer.create(
    <VolumeChannelTabs
      {...createProps({
        loadedChannelIds: ['channel-a', 'channel-b', 'channel-c', 'channel-d', 'channel-e'],
        channelNameMap: new Map([
          ['channel-a', 'Channel A'],
          ['channel-b', 'Channel B'],
          ['channel-c', 'Channel C'],
          ['channel-d', 'Channel D'],
          ['channel-e', 'Channel E']
        ]),
        channelVisibility: {
          'channel-a': true,
          'channel-b': true,
          'channel-c': true,
          'channel-d': true,
          'channel-e': true
        },
        channelTintMap: new Map([
          ['channel-a', '#ffffff'],
          ['channel-b', '#ffffff'],
          ['channel-c', '#ffffff'],
          ['channel-d', '#ffffff'],
          ['channel-e', '#ffffff']
        ]),
        activeChannelId: 'channel-e'
      })}
    />
  );

  const visibleTabs = renderer.root.findAll(
    (node) => node.type === 'button' && node.props.role === 'tab'
  );
  const visibleTabIds = visibleTabs.map((node) => String(node.props.id));
  const previousButton = renderer.root.findByProps({ 'aria-label': 'Show previous channel tabs' });
  const nextButton = renderer.root.findByProps({ 'aria-label': 'Show next channel tabs' });

  assert.deepEqual(visibleTabIds, [
    'channel-tab-channel-b',
    'channel-tab-channel-c',
    'channel-tab-channel-d',
    'channel-tab-channel-e'
  ]);
  assert.doesNotMatch(String(previousButton.props.className), /\bis-hidden\b/);
  assert.match(String(nextButton.props.className), /\bis-hidden\b/);

  renderer.unmount();
});
