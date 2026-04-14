import assert from 'node:assert/strict';

import React from 'react';

import useParsedTracks from '../src/hooks/tracks/useParsedTracks.ts';
import type { ChannelSource, TrackSetSource } from '../src/hooks/dataset/useChannelSources.ts';
import { renderHook } from './hooks/renderHook.ts';

console.log('Starting useParsedTracks tests');

const channels: ChannelSource[] = [
  {
    id: 'channel-1',
    name: 'Channel 1',
    channelType: 'channel',
    volume: null
  }
];

await (async () => {
  let nextTrackSetId = 0;

  const hook = renderHook(() => {
    const [tracks, setTracks] = React.useState<TrackSetSource[]>([]);

    const createTrackSetSource = React.useCallback((name: string, boundChannelId: string | null): TrackSetSource => {
      nextTrackSetId += 1;
      return {
        id: `track-set-${nextTrackSetId}`,
        name,
        boundChannelId,
        timepointConvention: 'zero-based',
        file: null,
        fileName: '',
        status: 'idle',
        error: null,
        compiledHeader: null,
        loadCompiledCatalog: null,
        loadCompiledPayload: null
      };
    }, []);

    const parsedTracks = useParsedTracks({
      tracks,
      setTracks,
      channels,
      createTrackSetSource,
      updateTrackSetIdCounter: () => undefined
    });

    return {
      tracks,
      ...parsedTracks
    };
  });

  const file = new File(
    [
      'track_id,start,t,x,y,z,A,track_length\n' +
        '1,1,1,0,0,0,0,2\n' +
        '1,1,2,1,1,1,0,2\n' +
        '2,13,1,2,2,2,0,2\n' +
        '2,13,2,3,3,3,0,2'
    ],
    'tracks.csv',
    { type: 'text/csv' }
  );

  hook.act(() => {
    hook.result.handleAddTrackSet();
  });

  assert.strictEqual(hook.result.tracks.length, 1);
  assert.strictEqual(hook.result.tracks[0]?.timepointConvention, 'zero-based');

  await hook.act(async () => {
    await hook.result.handleTrackFilesAdded('track-set-1', [file]);
    assert.strictEqual(hook.result.tracks[0]?.status, 'loaded');
    assert.strictEqual(hook.result.tracks[0]?.compiledHeader?.time.min, 2);
    assert.strictEqual(hook.result.tracks[0]?.compiledHeader?.time.max, 15);

    const originalConsoleError = console.error;
    console.error = () => undefined;
    try {
      await hook.result.handleTrackSetTimepointConventionChange('track-set-1', 'one-based');
    } finally {
      console.error = originalConsoleError;
    }
    assert.strictEqual(hook.result.tracks[0]?.timepointConvention, 'one-based');
    assert.strictEqual(hook.result.tracks[0]?.status, 'loaded');
    assert.strictEqual(hook.result.tracks[0]?.error, null);
    assert.strictEqual(hook.result.tracks[0]?.compiledHeader?.time.min, 1);
    assert.strictEqual(hook.result.tracks[0]?.compiledHeader?.time.max, 14);

    await hook.result.handleTrackSetTimepointConventionChange('track-set-1', 'zero-based');
    assert.strictEqual(hook.result.tracks[0]?.timepointConvention, 'zero-based');
    assert.strictEqual(hook.result.tracks[0]?.status, 'loaded');
    assert.strictEqual(hook.result.tracks[0]?.compiledHeader?.time.min, 2);
    assert.strictEqual(hook.result.tracks[0]?.compiledHeader?.time.max, 15);
  });

  hook.unmount();
})();

await (async () => {
  let nextTrackSetId = 0;

  const hook = renderHook(() => {
    const [tracks, setTracks] = React.useState<TrackSetSource[]>([]);

    const createTrackSetSource = React.useCallback((name: string, boundChannelId: string | null): TrackSetSource => {
      nextTrackSetId += 1;
      return {
        id: `track-set-${nextTrackSetId}`,
        name,
        boundChannelId,
        timepointConvention: 'zero-based',
        file: null,
        fileName: '',
        status: 'idle',
        error: null,
        compiledHeader: null,
        loadCompiledCatalog: null,
        loadCompiledPayload: null
      };
    }, []);

    const parsedTracks = useParsedTracks({
      tracks,
      setTracks,
      channels,
      createTrackSetSource,
      updateTrackSetIdCounter: () => undefined
    });

    return {
      tracks,
      ...parsedTracks
    };
  });

  const invalidFile = new File(
    [
      'track_id,start,t,x,y,z,A,track_length\n' +
        '1,0,0,0,0,0,0,2\n' +
        '1,0,NaN,1,1,1,0,2'
    ],
    'invalid-tracks.csv',
    { type: 'text/csv' }
  );

  hook.act(() => {
    hook.result.handleAddTrackSet();
  });

  const originalConsoleError = console.error;
  console.error = () => undefined;
  try {
    await hook.act(async () => {
      await hook.result.handleTrackFilesAdded('track-set-1', [invalidFile]);
    });
  } finally {
    console.error = originalConsoleError;
  }

  assert.strictEqual(hook.result.tracks[0]?.status, 'error');
  assert.match(hook.result.tracks[0]?.error ?? '', /invalid t value "NaN"/);
  assert.strictEqual(hook.result.tracks[0]?.compiledHeader, null);

  hook.unmount();
})();

console.log('useParsedTracks tests passed');
