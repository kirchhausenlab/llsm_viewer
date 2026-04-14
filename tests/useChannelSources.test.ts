import assert from 'node:assert/strict';

import { useChannelSources } from '../src/hooks/dataset/useChannelSources.ts';
import { renderHook } from './hooks/renderHook.ts';

console.log('Starting useChannelSources tests');

(() => {
  const hook = renderHook(() => useChannelSources());
  const file = new File(['data'], 'layer-a.tif');

  hook.act(() => {
    const channel = hook.result.createChannelSource('Channel A');
    const volume = hook.result.createVolumeSource([file]);
    hook.result.setChannels([{ ...channel, volume }]);
    hook.result.setLayerTimepointCountErrors({
      [volume.id]: 'Failed to read TIFF timepoint count: Decoder exploded.'
    });
  });

  const validation = hook.result.channelValidationMap.get('channel-1');
  assert.ok(validation);
  assert.deepStrictEqual(validation.errors, ['Failed to read TIFF timepoint count: Decoder exploded.']);
  assert.deepStrictEqual(validation.warnings, []);
  assert.strictEqual(hook.result.allChannelsValid, false);
  assert.strictEqual(hook.result.hasGlobalTimepointMismatch, false);
})();

console.log('useChannelSources tests passed');
