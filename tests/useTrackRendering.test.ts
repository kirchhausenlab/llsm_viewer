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

console.log('useTrackRendering tests passed');
