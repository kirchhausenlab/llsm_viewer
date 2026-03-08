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
      trackOpacityByTrackSet: {},
      trackLineWidthByTrackSet: {},
      trackColorModesByTrackSet: {},
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
    trackSetId: 'track-set-0',
    trackSetName: 'Track set 0',
    channelId: 'channel-0',
    channelName: 'Channel 0',
    trackNumber: 1,
    sourceTrackId: 1,
    points: [
      { x: 0, y: 0, z: 0, time: 0, amplitude: 0 },
      { x: 1, y: 1, z: 0, time: 1, amplitude: 0 },
    ],
  };

  let trackOpacityByTrackSet: Record<string, number> = { 'track-set-0': 1 };

  const hook = renderHook(() =>
    useTrackRendering({
      tracks: [track],
      trackVisibility: {},
      trackOpacityByTrackSet,
      trackLineWidthByTrackSet: {},
      trackColorModesByTrackSet: {},
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
    trackOpacityByTrackSet = { 'track-set-0': 0 };
    hook.rerender();
  });

  assert.strictEqual(trackLinesRef.current.has('track-0'), false);
  assert.strictEqual(hook.result.hoveredTrackId, null);
})();

(() => {
  const trackGroupRef = { current: new THREE.Group() } as const;
  const trackLinesRef = { current: new Map() } as const;
  const track = {
    id: 'track-hidden',
    trackSetId: 'track-set-0',
    trackSetName: 'Track set 0',
    channelId: 'channel-0',
    channelName: 'Channel 0',
    trackNumber: 1,
    sourceTrackId: 1,
    points: [
      { x: 0, y: 0, z: 0, time: 0, amplitude: 0 },
      { x: 1, y: 1, z: 0, time: 1, amplitude: 0 },
    ],
  };

  const hook = renderHook(() =>
    useTrackRendering({
      tracks: [track],
      trackVisibility: {},
      trackOpacityByTrackSet: { 'track-set-0': 0 },
      trackLineWidthByTrackSet: {},
      trackColorModesByTrackSet: {},
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

  assert.strictEqual(trackLinesRef.current.size, 0);
  assert.strictEqual(trackGroupRef.current.visible, false);
})();

(() => {
  const trackGroupRef = { current: new THREE.Group() } as const;
  const trackLinesRef = { current: new Map() } as const;
  const track = {
    id: 'track-no-3d',
    trackSetId: 'track-set-0',
    trackSetName: 'Track set 0',
    channelId: 'channel-0',
    channelName: 'Channel 0',
    trackNumber: 1,
    sourceTrackId: 1,
    points: [
      { x: 0, y: 0, z: 0, time: 0, amplitude: 0 },
      { x: 1, y: 1, z: 0, time: 1, amplitude: 0 },
    ],
  };

  const hook = renderHook(() =>
    useTrackRendering({
      tracks: [track],
      trackVisibility: {},
      trackOpacityByTrackSet: { 'track-set-0': 1 },
      trackLineWidthByTrackSet: {},
      trackColorModesByTrackSet: {},
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
      hasActive3DLayer: false,
    }),
  );

  const { act } = hook;

  act(() => hook.result.refreshTrackOverlay());

  assert.strictEqual(trackLinesRef.current.size, 0);
})();

(() => {
  const trackGroupRef = { current: new THREE.Group() } as const;
  const trackLinesRef = { current: new Map() } as const;
  const track = {
    id: 'track-cached-geometry',
    trackSetId: 'track-set-0',
    trackSetName: 'Track set 0',
    channelId: 'channel-0',
    channelName: 'Channel 0',
    trackNumber: 1,
    sourceTrackId: 1,
    points: [
      { x: 0, y: 0, z: 0, time: 0, amplitude: 0 },
      { x: 1, y: 1, z: 0, time: 1, amplitude: 0 },
      { x: 2, y: 2, z: 0, time: 2, amplitude: 0 },
    ],
  };

  const hook = renderHook(() =>
    useTrackRendering({
      tracks: [track],
      trackVisibility: {},
      trackOpacityByTrackSet: { 'track-set-0': 1 },
      trackLineWidthByTrackSet: {},
      trackColorModesByTrackSet: {},
      channelTrackOffsets: {},
      trackScale: {},
      isFullTrackTrailEnabled: true,
      trackTrailLength: 10,
      selectedTrackIds: new Set(),
      followedTrackId: null,
      clampedTimeIndex: 2,
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

  const resource = trackLinesRef.current.get('track-cached-geometry');
  assert.ok(resource, 'resource should be created');

  const originalSetPositions = resource.geometry.setPositions.bind(resource.geometry);
  let setPositionsCalls = 0;
  resource.geometry.setPositions = ((positions: number[] | Float32Array) => {
    setPositionsCalls += 1;
    return originalSetPositions(positions);
  }) as typeof resource.geometry.setPositions;

  act(() => hook.result.refreshTrackOverlay());

  assert.strictEqual(setPositionsCalls, 0);
})();

(() => {
  const trackGroupRef = { current: new THREE.Group() } as const;
  const trackLinesRef = { current: new Map() } as const;
  const track = {
    id: 'track-dispose',
    trackSetId: 'track-set-0',
    trackSetName: 'Track set 0',
    channelId: 'channel-0',
    channelName: 'Channel 0',
    trackNumber: 1,
    sourceTrackId: 1,
    points: [
      { x: 0, y: 0, z: 0, time: 0, amplitude: 0 },
      { x: 1, y: 1, z: 0, time: 1, amplitude: 0 },
    ],
  };

  let tracks = [track];

  const hook = renderHook(() =>
    useTrackRendering({
      tracks,
      trackVisibility: {},
      trackOpacityByTrackSet: { 'track-set-0': 1 },
      trackLineWidthByTrackSet: {},
      trackColorModesByTrackSet: {},
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
  assert.strictEqual(trackLinesRef.current.size, 1);
  assert.strictEqual(trackGroupRef.current.children.length, 3);

  act(() => {
    tracks = [];
    hook.rerender();
  });

  assert.strictEqual(trackLinesRef.current.size, 0);
  assert.strictEqual(trackGroupRef.current.children.length, 0);
})();

(() => {
  const trackGroupRef = { current: new THREE.Group() } as const;
  const trackLinesRef = { current: new Map() } as const;

  const points = Array.from({ length: 11 }, (_, index) => {
    const time = 10 + index;
    return { x: time, y: 0, z: 0, time, amplitude: 0 };
  });

  const track = {
    id: 'track-windowed',
    trackSetId: 'track-set-0',
    trackSetName: 'Track set 0',
    channelId: 'channel-0',
    channelName: 'Channel 0',
    trackNumber: 1,
    sourceTrackId: 1,
    points,
  };

  let clampedTimeIndex = 15;

  const hook = renderHook(() =>
    useTrackRendering({
      tracks: [track],
      trackVisibility: {},
      trackOpacityByTrackSet: { 'track-set-0': 1 },
      trackLineWidthByTrackSet: {},
      trackColorModesByTrackSet: {},
      channelTrackOffsets: {},
      trackScale: {},
      isFullTrackTrailEnabled: false,
      trackTrailLength: 5,
      selectedTrackIds: new Set(),
      followedTrackId: null,
      clampedTimeIndex,
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

  const resource = trackLinesRef.current.get('track-windowed');
  assert.ok(resource, 'resource should be created');

  const readFirstSegmentStartX = () => {
    const attribute = resource.geometry.getAttribute('instanceStart') as unknown as {
      data: { array: Float32Array; stride: number };
      offset: number;
    };
    return attribute.data.array[attribute.offset];
  };

  assert.strictEqual(readFirstSegmentStartX(), 10);

  act(() => {
    clampedTimeIndex = 16;
    hook.rerender();
  });

  assert.strictEqual(readFirstSegmentStartX(), 11);

  act(() => {
    clampedTimeIndex = 30;
    hook.rerender();
  });

  assert.strictEqual(resource.hasVisiblePoints, false);
})();

console.log('useTrackRendering tests passed');
