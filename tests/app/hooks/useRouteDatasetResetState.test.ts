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
  const layerSettings = { value: { 'layer-1': { color: '#ffffff' } } as Record<string, unknown> };
  const layerAutoThresholds = { value: { 'layer-1': 0.4 } };
  const currentLayerVolumes = { value: { 'layer-1': { width: 1 } } as Record<string, unknown> };
  const selectedIndex = { value: 9 };
  const zSliderValue = { value: 7 };
  const activeChannelTabId = { value: 'channel-1' as string | null };
  const isExperimentSetupStarted = { value: true };
  const hoveredVolumeVoxel = { value: { layerKey: 'layer-1' } as unknown };
  const lastHoveredVolumeVoxel = { value: { layerKey: 'layer-1' } as unknown };
  const followedVoxel = { value: { layerKey: 'layer-1' } as unknown };
  const viewerCameraSample = { value: { distance: 3 } as unknown };
  const resetViewHandler = { value: (() => {}) as (() => void) | null };
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
      setLayerSettings: createStateSetter(layerSettings),
      setLayerAutoThresholds: createStateSetter(layerAutoThresholds),
      setCurrentLayerVolumes: createStateSetter(currentLayerVolumes),
      setSelectedIndex: createStateSetter(selectedIndex),
      setZSliderValue: createStateSetter(zSliderValue),
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
      setHoveredVolumeVoxel: createStateSetter(hoveredVolumeVoxel),
      setLastHoveredVolumeVoxel: createStateSetter(lastHoveredVolumeVoxel),
      setFollowedVoxel: createStateSetter(followedVoxel),
      setViewerCameraSample: createStateSetter(viewerCameraSample),
      setResetViewHandler: createStateSetter(resetViewHandler),
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
  assert.deepStrictEqual(layerSettings.value, {});
  assert.deepStrictEqual(layerAutoThresholds.value, {});
  assert.deepStrictEqual(currentLayerVolumes.value, {});
  assert.strictEqual(selectedIndex.value, 0);
  assert.strictEqual(zSliderValue.value, 1);
  assert.strictEqual(activeChannelTabId.value, null);
  assert.strictEqual(isExperimentSetupStarted.value, false);
  assert.strictEqual(hoveredVolumeVoxel.value, null);
  assert.strictEqual(lastHoveredVolumeVoxel.value, null);
  assert.strictEqual(followedVoxel.value, null);
  assert.strictEqual(viewerCameraSample.value, null);
  assert.strictEqual(resetViewHandler.value, null);
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
