import assert from 'node:assert/strict';

import {
  computeTrackLineWidthByChannel,
  computeTrackOpacityByChannel,
  computeTrackSummaryByChannel,
  computeTrackVisibility,
  deriveTrackChannelIds
} from '../src/trackSelectors.ts';
import {
  createDefaultChannelTrackState,
  type ChannelTrackState
} from '../src/channelTrackState.ts';
import type { TrackDefinition } from '../src/types/tracks.ts';

console.log('Starting collaboration track hydration tests');

try {
  const channels: { id: string }[] = [];
  const loadedChannelIds = ['remote-channel'];

  const remoteTrackState: ChannelTrackState = {
    opacity: 0.25,
    lineWidth: 2.5,
    visibility: {
      'remote-channel:track-1': false,
      'remote-channel:track-2': true
    },
    colorMode: { type: 'random' }
  };

  const channelTrackStates: Record<string, ChannelTrackState> = {
    'remote-channel': remoteTrackState
  };

  const tracksForChannel: TrackDefinition[] = [
    {
      id: 'remote-channel:track-1',
      channelId: 'remote-channel',
      channelName: 'Remote channel',
      trackNumber: 1,
      sourceTrackId: 1,
      points: []
    },
    {
      id: 'remote-channel:track-2',
      channelId: 'remote-channel',
      channelName: 'Remote channel',
      trackNumber: 2,
      sourceTrackId: 2,
      points: []
    }
  ];

  const parsedTracksByChannel = new Map<string, TrackDefinition[]>([
    ['remote-channel', tracksForChannel]
  ]);

  const derivedChannelIds = deriveTrackChannelIds(channels, loadedChannelIds, channelTrackStates);
  assert.deepEqual(derivedChannelIds, ['remote-channel']);

  const summary = computeTrackSummaryByChannel(
    derivedChannelIds,
    parsedTracksByChannel,
    channelTrackStates
  );
  const channelSummary = summary.get('remote-channel');
  assert.ok(channelSummary, 'channel summary should exist');
  assert.strictEqual(channelSummary.total, 2);
  assert.strictEqual(channelSummary.visible, 1);

  const visibility = computeTrackVisibility(
    derivedChannelIds,
    parsedTracksByChannel,
    channelTrackStates
  );
  assert.deepEqual(visibility, {
    'remote-channel:track-1': false,
    'remote-channel:track-2': true
  });

  const opacity = computeTrackOpacityByChannel(derivedChannelIds, channelTrackStates);
  assert.strictEqual(opacity['remote-channel'], 0.25);

  const lineWidth = computeTrackLineWidthByChannel(derivedChannelIds, channelTrackStates);
  assert.strictEqual(lineWidth['remote-channel'], 2.5);

  const fallbackSummary = computeTrackSummaryByChannel(
    ['missing-channel'],
    parsedTracksByChannel,
    {}
  );
  const defaultStateSummary = fallbackSummary.get('missing-channel');
  assert.ok(defaultStateSummary, 'default summary should exist');
  assert.strictEqual(defaultStateSummary.total, 0);
  assert.strictEqual(defaultStateSummary.visible, 0);

  const fallbackOpacity = computeTrackOpacityByChannel(['missing-channel'], {});
  assert.strictEqual(
    fallbackOpacity['missing-channel'],
    createDefaultChannelTrackState().opacity
  );

  const fallbackLineWidth = computeTrackLineWidthByChannel(['missing-channel'], {});
  assert.strictEqual(
    fallbackLineWidth['missing-channel'],
    createDefaultChannelTrackState().lineWidth
  );

  console.log('collaboration track hydration tests passed');
} catch (error) {
  console.error('collaboration track hydration tests failed');
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
}
