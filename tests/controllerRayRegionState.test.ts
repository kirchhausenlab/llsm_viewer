import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  isSameChannelsRegion,
  isSameTracksRegion,
  shouldLogControllerRaySummary
} from '../src/components/viewers/volume-viewer/vr/controllerRayRegionState.ts';
import type {
  VrChannelsInteractiveRegion,
  VrTracksInteractiveRegion
} from '../src/components/viewers/volume-viewer/vr/types.ts';

const channelsRegion = (overrides: Partial<VrChannelsInteractiveRegion> = {}): VrChannelsInteractiveRegion => ({
  targetType: 'channels-slider',
  channelId: 'channel-1',
  layerKey: 'layer-1',
  sliderKey: 'windowMin',
  color: '#ffffff',
  bounds: { minX: 0, maxX: 1, minY: 0, maxY: 1 },
  ...overrides
});

const tracksRegion = (overrides: Partial<VrTracksInteractiveRegion> = {}): VrTracksInteractiveRegion => ({
  targetType: 'tracks-slider',
  channelId: 'channel-1',
  trackId: 'track-1',
  sliderKey: 'opacity',
  color: '#ffffff',
  bounds: { minX: 0, maxX: 1, minY: 0, maxY: 1 },
  ...overrides
});

test('isSameChannelsRegion compares semantic identity fields', () => {
  assert.equal(isSameChannelsRegion(channelsRegion(), channelsRegion()), true);
  assert.equal(
    isSameChannelsRegion(channelsRegion(), channelsRegion({ sliderKey: 'windowMax' })),
    false
  );
});

test('isSameTracksRegion compares semantic identity fields', () => {
  assert.equal(isSameTracksRegion(tracksRegion(), tracksRegion()), true);
  assert.equal(isSameTracksRegion(tracksRegion(), tracksRegion({ trackId: 'track-2' })), false);
});

test('shouldLogControllerRaySummary logs on meaningful changes only', () => {
  const base = {
    presenting: true,
    visibleLines: 2,
    hoverTrackIds: ['a', null]
  };

  assert.equal(shouldLogControllerRaySummary(null, base), true);
  assert.equal(shouldLogControllerRaySummary(base, { ...base }), false);
  assert.equal(shouldLogControllerRaySummary(base, { ...base, visibleLines: 3 }), true);
  assert.equal(shouldLogControllerRaySummary(base, { ...base, hoverTrackIds: ['a', 'b'] }), true);
});
