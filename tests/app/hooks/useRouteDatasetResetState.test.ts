import assert from 'node:assert/strict';
import type { SetStateAction } from 'react';

import { useRouteDatasetResetState } from '../../../src/ui/app/hooks/useRouteDatasetResetState.ts';
import { renderHook } from '../../hooks/renderHook.ts';

console.log('Starting useRouteDatasetResetState tests');

const createStateSetter = <T>(state: { value: T }) => (next: SetStateAction<T>) => {
  state.value = typeof next === 'function' ? (next as (current: T) => T)(state.value) : next;
};

(() => {
  let resetPreprocessedStateCalls = 0;
  let resetChannelEditingStateCalls = 0;
  let resetTrackStateCalls = 0;
  let resetLaunchStateCalls = 0;
  let clearDatasetErrorCalls = 0;

  const preprocessedExperiment = { value: { id: 'staged' } as unknown };
  const channels = { value: [{ id: 'channel-1' }] as unknown };
  const tracks = { value: [{ id: 'track-set-1' }] as unknown };
  const channelVisibility = { value: { 'channel-1': true } };
  const channelActiveLayer = { value: { 'channel-1': 'layer-1' } };
  const layerSettings = { value: { 'layer-1': { color: '#ffffff' } } as Record<string, unknown> };
  const layerAutoThresholds = { value: { 'layer-1': 0.4 } };
  const currentLayerVolumes = { value: { 'layer-1': { width: 1 } } as Record<string, unknown> };
  const selectedIndex = { value: 9 };
  const activeChannelTabId = { value: 'channel-1' as string | null };
  const isExperimentSetupStarted = { value: true };
  const channelIdRef = { current: 5 };
  const layerIdRef = { current: 8 };
  const trackSetIdRef = { current: 3 };

  const hook = renderHook(() =>
    useRouteDatasetResetState({
      resetPreprocessedState: () => {
        resetPreprocessedStateCalls += 1;
      },
      setPreprocessedExperiment: createStateSetter(preprocessedExperiment),
      setChannels: createStateSetter(channels),
      setTracks: createStateSetter(tracks),
      setChannelVisibility: createStateSetter(channelVisibility),
      setChannelActiveLayer: createStateSetter(channelActiveLayer),
      setLayerSettings: createStateSetter(layerSettings),
      setLayerAutoThresholds: createStateSetter(layerAutoThresholds),
      setCurrentLayerVolumes: createStateSetter(currentLayerVolumes),
      setSelectedIndex: createStateSetter(selectedIndex),
      resetChannelEditingState: () => {
        resetChannelEditingStateCalls += 1;
      },
      setActiveChannelTabId: createStateSetter(activeChannelTabId),
      resetTrackState: () => {
        resetTrackStateCalls += 1;
      },
      resetLaunchState: () => {
        resetLaunchStateCalls += 1;
      },
      setIsExperimentSetupStarted: createStateSetter(isExperimentSetupStarted),
      channelIdRef,
      layerIdRef,
      trackSetIdRef,
      clearDatasetError: () => {
        clearDatasetErrorCalls += 1;
      },
    }),
  );

  hook.act(() => {
    hook.result.handleDiscardPreprocessedExperiment();
  });

  assert.strictEqual(resetPreprocessedStateCalls, 1);
  assert.strictEqual(resetChannelEditingStateCalls, 1);
  assert.strictEqual(resetTrackStateCalls, 1);
  assert.strictEqual(resetLaunchStateCalls, 1);
  assert.strictEqual(clearDatasetErrorCalls, 1);
  assert.strictEqual(preprocessedExperiment.value, null);
  assert.deepStrictEqual(channels.value, []);
  assert.deepStrictEqual(tracks.value, []);
  assert.deepStrictEqual(channelVisibility.value, {});
  assert.deepStrictEqual(channelActiveLayer.value, {});
  assert.deepStrictEqual(layerSettings.value, {});
  assert.deepStrictEqual(layerAutoThresholds.value, {});
  assert.deepStrictEqual(currentLayerVolumes.value, {});
  assert.strictEqual(selectedIndex.value, 0);
  assert.strictEqual(activeChannelTabId.value, null);
  assert.strictEqual(isExperimentSetupStarted.value, false);
  assert.strictEqual(channelIdRef.current, 0);
  assert.strictEqual(layerIdRef.current, 0);
  assert.strictEqual(trackSetIdRef.current, 0);

  hook.act(() => {
    hook.result.handleReturnToFrontPage();
  });
  assert.strictEqual(resetPreprocessedStateCalls, 2);
  assert.strictEqual(resetLaunchStateCalls, 2);
  hook.unmount();
})();

console.log('useRouteDatasetResetState tests passed');
