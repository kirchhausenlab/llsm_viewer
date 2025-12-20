import assert from 'node:assert/strict';
import * as THREE from 'three';

import { useTrackRendering } from '../src/components/viewers/volume-viewer/useTrackRendering.ts';
import { renderHook } from './hooks/renderHook.ts';

console.log('Starting useTrackRendering tests');

(() => {
  const hook = renderHook(() =>
    useTrackRendering({
      tracks: [],
      trackVisibility: {},
      trackOpacityByChannel: {},
      trackLineWidthByChannel: {},
      channelTrackColorModes: {},
      channelTrackOffsets: {},
      trackScale: {},
      isFullTrackTrailEnabled: true,
      trackTrailLength: 10,
      selectedTrackIds: new Set(),
      followedTrackId: null,
      clampedTimeIndex: 0,
      trackGroupRef: { current: new THREE.Group() },
      trackLinesRef: { current: new Map() },
      containerRef: { current: null },
      rendererRef: { current: null },
      cameraRef: { current: null },
      hoverRaycasterRef: { current: null },
      currentDimensionsRef: { current: null },
      hasActive3DLayer: false,
    }),
  );

  const { act } = hook;

  act(() => hook.result.updateHoverState('controller-track', { x: 1, y: 2 }, 'controller'));
  assert.strictEqual(hook.result.hoveredTrackId, 'controller-track');
  assert.deepStrictEqual(hook.result.tooltipPosition, { x: 1, y: 2 });

  act(() => hook.result.updateHoverState('pointer-track', { x: 3, y: 4 }, 'pointer'));
  assert.strictEqual(hook.result.hoveredTrackId, 'pointer-track');
  assert.deepStrictEqual(hook.result.tooltipPosition, { x: 3, y: 4 });

  act(() => hook.result.clearHoverState('pointer'));
  assert.strictEqual(hook.result.hoveredTrackId, 'controller-track');
  assert.deepStrictEqual(hook.result.tooltipPosition, { x: 1, y: 2 });

  act(() => hook.result.clearHoverState());
  assert.strictEqual(hook.result.hoveredTrackId, null);
  assert.strictEqual(hook.result.tooltipPosition, null);
})();

(() => {
  const trackGroupRef = { current: new THREE.Group() } as const;
  const trackLinesRef = { current: new Map() } as const;
  const track = {
    id: 'track-0',
    channelId: 'channel-0',
    channelName: 'Channel 0',
    trackNumber: 1,
    points: [
      { x: 0, y: 0, z: 0, time: 0 },
      { x: 1, y: 1, z: 0, time: 1 },
    ],
  };

  let trackOpacityByChannel: Record<string, number> = { 'channel-0': 1 };

  const hook = renderHook(() =>
    useTrackRendering({
      tracks: [track],
      trackVisibility: {},
      trackOpacityByChannel,
      trackLineWidthByChannel: {},
      channelTrackColorModes: {},
      channelTrackOffsets: {},
      trackScale: {},
      isFullTrackTrailEnabled: true,
      trackTrailLength: 10,
      selectedTrackIds: new Set(),
      followedTrackId: null,
      clampedTimeIndex: 1,
      trackGroupRef,
      trackLinesRef,
      containerRef: { current: null },
      rendererRef: { current: null },
      cameraRef: { current: null },
      hoverRaycasterRef: { current: null },
      currentDimensionsRef: { current: null },
      hasActive3DLayer: true,
    }),
  );

  const { act } = hook;

  act(() => hook.result.refreshTrackOverlay());

  const resource = trackLinesRef.current.get('track-0');
  assert.ok(resource, 'resource should be created');
  assert.strictEqual(resource.line.visible, true);
  assert.strictEqual(resource.endCap.visible, true);

  act(() => hook.result.updateHoverState('track-0', { x: 2, y: 3 }, 'pointer'));
  assert.strictEqual(hook.result.hoveredTrackId, 'track-0');

  act(() => {
    trackOpacityByChannel = { 'channel-0': 0 };
    hook.rerender();
  });

  assert.strictEqual(resource.line.visible, false);
  assert.strictEqual(resource.endCap.visible, false);
  assert.strictEqual(hook.result.hoveredTrackId, null);
})();

console.log('useTrackRendering tests passed');
