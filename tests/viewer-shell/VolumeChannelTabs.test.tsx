import assert from 'node:assert/strict';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

import VolumeChannelTabs from '../../src/components/viewers/viewer-shell/VolumeChannelTabs.tsx';

console.log('Starting VolumeChannelTabs tests');

function createProps(overrides: Partial<React.ComponentProps<typeof VolumeChannelTabs>> = {}) {
  return {
    loadedChannelIds: ['channel-a', 'channel-b'],
    channelNameMap: new Map([
      ['channel-a', '1234567890123456789012345'],
      ['channel-b', 'Visible B'],
    ]),
    channelVisibility: {
      'channel-a': false,
      'channel-b': true,
    },
    channelTintMap: new Map([
      ['channel-a', '#ffffff'],
      ['channel-b', '#ffffff'],
    ]),
    activeChannelId: 'channel-b',
    onChannelTabSelect: () => {},
    onChannelVisibilityToggle: () => {},
    ...overrides,
  };
}

(() => {
  const renderer = TestRenderer.create(
    <VolumeChannelTabs {...(createProps() as any)} />
  );

  const hiddenTab = renderer.root.findByProps({ id: 'channel-tab-channel-a' });
  const visibleTab = renderer.root.findByProps({ id: 'channel-tab-channel-b' });
  const hiddenLabel = hiddenTab.children[0];

  assert.equal(hiddenLabel.children.join(''), '123456...');
  assert.equal(visibleTab.children[0].children.join(''), 'Visible B');

  renderer.unmount();
})();

(() => {
  const visibilityCalls: string[] = [];
  const selectionCalls: string[] = [];
  let prevented = false;
  const renderer = TestRenderer.create(
    <VolumeChannelTabs
      {...(createProps({
        onChannelVisibilityToggle: (channelId) => {
          visibilityCalls.push(channelId);
        },
        onChannelTabSelect: (channelId) => {
          selectionCalls.push(channelId);
        },
      }) as any)}
    />
  );

  const hiddenTab = renderer.root.findByProps({ id: 'channel-tab-channel-a' });
  const visibleTab = renderer.root.findByProps({ id: 'channel-tab-channel-b' });

  act(() => {
    hiddenTab.props.onAuxClick({
      button: 1,
      preventDefault() {
        prevented = true;
      },
    });
  });
  assert.equal(prevented, true);
  assert.deepEqual(visibilityCalls, ['channel-a']);
  assert.deepEqual(selectionCalls, ['channel-a']);

  act(() => {
    visibleTab.props.onAuxClick({
      button: 1,
      preventDefault() {},
    });
  });
  assert.deepEqual(visibilityCalls, ['channel-a', 'channel-b']);
  assert.deepEqual(selectionCalls, ['channel-a']);

  renderer.unmount();
})();

console.log('VolumeChannelTabs tests passed');
