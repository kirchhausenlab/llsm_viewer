import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createInitialChannelVisibility } from '../../src/hooks/dataset/channelVisibility.ts';

test('createInitialChannelVisibility shows only the first distinct channel on initial load', () => {
  const visibility = createInitialChannelVisibility([
    { channelId: 'channel-a' },
    { channelId: 'channel-a' },
    { channelId: 'channel-b' },
    { channelId: 'channel-c' }
  ]);

  assert.deepEqual(visibility, {
    'channel-a': true,
    'channel-b': false,
    'channel-c': false
  });
});

test('createInitialChannelVisibility returns an empty map when there are no channels', () => {
  assert.deepEqual(createInitialChannelVisibility([]), {});
});
