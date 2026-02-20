import assert from 'node:assert/strict';

import { buildTracksFromCsvEntries } from '../src/shared/utils/trackCsvParsing.ts';

console.log('Starting trackCsvParsing tests');

(() => {
  const tracks = buildTracksFromCsvEntries({
    trackSetId: 'track-set-1',
    trackSetName: 'Set 1',
    channelId: 'channel-0',
    channelName: 'Channel 0',
    entries: [
      ['36', '1.0', '50.0', '305.779096', '326.565542', '38.697693', '0', '57'],
      ['36', '1.0', '', '', '', '', '0', '57'],
      ['36', '1.0', '13.0', '327.944334', '319.266013', '33.21774', '0', '57'],
    ],
  });

  assert.strictEqual(tracks.length, 2);

  const [first, second] = tracks;
  assert.strictEqual(first.id, 'track-set-1:channel-0:36');
  assert.strictEqual(first.trackSetId, 'track-set-1');
  assert.strictEqual(first.trackSetName, 'Set 1');
  assert.strictEqual(first.displayTrackNumber, '36');
  assert.strictEqual(first.parentTrackId, null);
  assert.strictEqual(first.points.length, 1);
  assert.strictEqual(first.points[0]?.x, 305.779096);
  assert.strictEqual(first.points[0]?.time, 50);

  assert.strictEqual(second.id, 'track-set-1:channel-0:36-1');
  assert.strictEqual(second.displayTrackNumber, '36-1');
  assert.strictEqual(second.parentTrackId, 'track-set-1:channel-0:36');
  assert.strictEqual(second.points.length, 1);
  assert.strictEqual(second.points[0]?.x, 327.944334);
  assert.strictEqual(second.points[0]?.time, 13);

  assert.ok(typeof first.internalTrackId === 'number');
  assert.ok(typeof second.internalTrackId === 'number');
  assert.strictEqual(second.parentInternalTrackId, first.internalTrackId);
})();

(() => {
  const tracks = buildTracksFromCsvEntries({
    trackSetId: 'track-set-1',
    trackSetName: 'Set 1',
    channelId: 'channel-0',
    channelName: 'Channel 0',
    entries: [
      ['36', '1.0', '50.0', '305.779096', '326.565542', '38.697693', '0', '57'],
      ['36', '1.0', 'NaN', 'NaN', 'NaN', 'NaN', '0', '57'],
      ['36', '1.0', '13.0', '327.944334', '319.266013', '33.21774', '0', '57'],
    ],
  });

  assert.strictEqual(tracks.length, 2);
  assert.deepStrictEqual(
    tracks.map((track) => track.displayTrackNumber),
    ['36', '36-1'],
  );
  assert.deepStrictEqual(
    tracks.map((track) => track.points[0]?.time),
    [50, 13],
  );
})();

(() => {
  const tracks = buildTracksFromCsvEntries({
    trackSetId: 'track-set-1',
    trackSetName: 'Set 1',
    channelId: 'c',
    channelName: 'C',
    entries: [
      ['1', '0', '0', '0', '0', '0', '0', '0'],
      ['1', '0', '', '', '', '', '0', '0'],
      ['1', '0', '', '', '', '', '0', '0'],
      ['1', '0', '1', '1', '1', '1', '0', '0'],
      ['1', '0', '', '', '', '', '0', '0'],
      ['1', '0', '2', '2', '2', '2', '0', '0'],
    ],
  });

  assert.deepStrictEqual(
    tracks.map((track) => track.displayTrackNumber),
    ['1', '1-1', '1-2'],
  );
  assert.deepStrictEqual(
    tracks.map((track) => track.points.length),
    [1, 1, 1],
  );
  assert.strictEqual(tracks[1]?.parentTrackId, 'track-set-1:c:1');
  assert.strictEqual(tracks[2]?.parentTrackId, 'track-set-1:c:1-1');
})();

(() => {
  const tracks = buildTracksFromCsvEntries({
    trackSetId: 'track-set-1',
    trackSetName: 'Set 1',
    channelId: 'c',
    channelName: 'C',
    entries: [
      ['1', '0', '0', '0', '0', '0', '0', '0'],
      ['1', '999', '0', '1', '1', '1', '0', '0'],
    ],
  });

  assert.strictEqual(tracks.length, 1);
  assert.deepStrictEqual(
    tracks[0]?.points.map((point) => point.time),
    [0, 0],
  );
})();

console.log('trackCsvParsing tests passed');
