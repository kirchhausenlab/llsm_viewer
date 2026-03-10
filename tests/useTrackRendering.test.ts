import assert from 'node:assert/strict';
import * as THREE from 'three';

import { compileTrackEntries } from '../src/shared/utils/compiledTracks.ts';
import type { TrackRenderResource } from '../src/components/viewers/VolumeViewer.types.ts';
import { useTrackRendering } from '../src/components/viewers/volume-viewer/useTrackRendering.ts';
import { renderHook } from './hooks/renderHook.ts';

console.log('Starting useTrackRendering tests');

function createCompiledTrackSet(entries: string[][]) {
  return compileTrackEntries({
    trackSetId: 'track-set-0',
    trackSetName: 'Track set 0',
    channelId: 'channel-0',
    channelName: 'Channel 0',
    entries
  });
}

function createTrackHook(options?: {
  tracks?: ReturnType<typeof createCompiledTrackSet>['summary']['tracks'];
  payloadMap?: ReadonlyMap<string, ReturnType<typeof createCompiledTrackSet>['payload']>;
  trackOpacityByTrackSet?: Record<string, number>;
  selectedTrackIds?: ReadonlySet<string>;
  followedTrackId?: string | null;
  clampedTimeIndex?: number;
  isFullTrackTrailEnabled?: boolean;
  trackTrailLength?: number;
  hasActive3DLayer?: boolean;
  onRequireTrackPayloads?: (trackSetIds: Iterable<string>) => void;
}) {
  const trackGroupRef = { current: new THREE.Group() } as const;
  const trackLinesRef = { current: new Map<string, TrackRenderResource>() } as const;
  const hook = renderHook(() =>
    useTrackRendering({
      tracks: options?.tracks ?? [],
      compiledTrackPayloadByTrackSet: options?.payloadMap ?? new Map(),
      onRequireTrackPayloads: options?.onRequireTrackPayloads,
      trackSetStates: {},
      trackOpacityByTrackSet: options?.trackOpacityByTrackSet ?? {},
      trackLineWidthByTrackSet: {},
      trackColorModesByTrackSet: {},
      channelTrackOffsets: {},
      trackScale: {},
      isFullTrackTrailEnabled: options?.isFullTrackTrailEnabled ?? true,
      trackTrailLength: options?.trackTrailLength ?? 10,
      selectedTrackIds: options?.selectedTrackIds ?? new Set(),
      followedTrackId: options?.followedTrackId ?? null,
      clampedTimeIndex: options?.clampedTimeIndex ?? 0,
      trackGroupRef,
      trackLinesRef,
      containerRef: { current: null },
      rendererRef: { current: null },
      cameraRef: { current: null },
      hoverRaycasterRef: { current: null },
      currentDimensionsRef: { current: null },
      hasActive3DLayer: options?.hasActive3DLayer ?? true
    })
  );

  return { hook, trackGroupRef, trackLinesRef };
}

(() => {
  const compiled = createCompiledTrackSet([
    ['1', '0', '1', '0', '0', '0', '0', '0'],
    ['1', '1', '1', '1', '1', '0', '0', '0']
  ]);
  const trackId = compiled.summary.tracks[0]!.id;
  const { hook } = createTrackHook({
    tracks: compiled.summary.tracks,
    payloadMap: new Map([[compiled.summary.trackSetId, compiled.payload]]),
    trackOpacityByTrackSet: { 'track-set-0': 1 }
  });

  hook.act(() => hook.result.updateHoverState(trackId, { x: 1, y: 2 }, 'controller'));
  assert.strictEqual(hook.result.hoveredTrackId, trackId);
  assert.deepStrictEqual(hook.result.tooltipPosition, { x: 1, y: 2 });

  hook.act(() => hook.result.updateHoverState(trackId, { x: 3, y: 4 }, 'pointer'));
  assert.strictEqual(hook.result.hoveredTrackId, trackId);
  assert.deepStrictEqual(hook.result.tooltipPosition, { x: 3, y: 4 });

  hook.act(() => hook.result.clearHoverState('pointer'));
  assert.strictEqual(hook.result.hoveredTrackId, trackId);
  assert.deepStrictEqual(hook.result.tooltipPosition, { x: 1, y: 2 });

  hook.act(() => hook.result.clearHoverState());
  assert.strictEqual(hook.result.hoveredTrackId, null);
  assert.strictEqual(hook.result.tooltipPosition, null);
})();

(() => {
  const compiled = createCompiledTrackSet([
    ['1', '0', '0', '0.0', '0.0', '0.0', '1.0', '0.0'],
    ['1', '0', '1', '1.0', '1.0', '0.0', '2.0', '0.0']
  ]);
  const { hook, trackLinesRef } = createTrackHook({
    tracks: compiled.summary.tracks,
    payloadMap: new Map([['track-set-0', compiled.payload]]),
    trackOpacityByTrackSet: { 'track-set-0': 1 },
    clampedTimeIndex: 1
  });

  hook.act(() => hook.result.refreshTrackOverlay());

  const batchResource = trackLinesRef.current.get('batch:track-set-0');
  assert.ok(batchResource && batchResource.kind === 'batch', 'batch resource should be created');
  assert.strictEqual(batchResource.line.visible, true);
  assert.strictEqual(batchResource.segmentTrackIds.length, 1);
})();

(() => {
  const compiled = createCompiledTrackSet([
    ['1', '0', '0', '0.0', '0.0', '0.0', '1.0', '0.0'],
    ['1', '0', '1', '1.0', '1.0', '0.0', '2.0', '0.0']
  ]);
  let payloadMap = new Map<string, ReturnType<typeof createCompiledTrackSet>['payload']>();
  const trackGroupRef = { current: new THREE.Group() } as const;
  const trackLinesRef = { current: new Map<string, TrackRenderResource>() } as const;
  const hook = renderHook(() =>
    useTrackRendering({
      tracks: compiled.summary.tracks,
      compiledTrackPayloadByTrackSet: payloadMap,
      trackSetStates: {},
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
      hasActive3DLayer: true
    })
  );

  hook.act(() => hook.result.refreshTrackOverlay());
  assert.strictEqual(trackGroupRef.current.visible, false);

  hook.act(() => {
    payloadMap = new Map([['track-set-0', compiled.payload]]);
    hook.rerender();
  });

  const batchResource = trackLinesRef.current.get('batch:track-set-0');
  assert.ok(batchResource && batchResource.kind === 'batch', 'batch resource should be created after payload arrives');
  assert.strictEqual(trackGroupRef.current.visible, true);
})();

(() => {
  const compiled = createCompiledTrackSet([
    ['1', '0', '0', '0.0', '0.0', '0.0', '1.0', '0.0'],
    ['1', '0', '1', '1.0', '1.0', '0.0', '2.0', '0.0']
  ]);
  const trackId = compiled.summary.tracks[0]!.id;
  const { hook, trackLinesRef } = createTrackHook({
    tracks: compiled.summary.tracks,
    payloadMap: new Map([['track-set-0', compiled.payload]]),
    trackOpacityByTrackSet: { 'track-set-0': 0 },
    selectedTrackIds: new Set([trackId]),
    clampedTimeIndex: 1
  });

  hook.act(() => hook.result.refreshTrackOverlay());

  assert.strictEqual(trackLinesRef.current.has('batch:track-set-0'), false);
  const overlayResource = trackLinesRef.current.get(`track:${trackId}`);
  assert.ok(overlayResource && overlayResource.kind === 'overlay', 'selected track overlay should be created');
  assert.strictEqual(overlayResource.line.visible, true);
  assert.strictEqual(overlayResource.endCap.visible, true);
})();

(() => {
  const compiled = createCompiledTrackSet([
    ['1', '0', '0', '0.0', '0.0', '0.0', '1.0', '0.0'],
    ['1', '0', '1', '1.0', '1.0', '0.0', '2.0', '0.0']
  ]);
  const { hook, trackLinesRef } = createTrackHook({
    tracks: compiled.summary.tracks,
    payloadMap: new Map([['track-set-0', compiled.payload]]),
    trackOpacityByTrackSet: { 'track-set-0': 1 },
    hasActive3DLayer: false,
    clampedTimeIndex: 1
  });

  hook.act(() => hook.result.refreshTrackOverlay());
  assert.strictEqual(trackLinesRef.current.size, 0);
})();

(() => {
  const compiled = createCompiledTrackSet([
    ['1', '0', '10', '10.0', '0.0', '0.0', '1.0', '0.0'],
    ['1', '0', '11', '11.0', '0.0', '0.0', '1.0', '0.0'],
    ['1', '0', '12', '12.0', '0.0', '0.0', '1.0', '0.0'],
    ['1', '0', '13', '13.0', '0.0', '0.0', '1.0', '0.0']
  ]);
  let clampedTimeIndex = 12;
  const trackGroupRef = { current: new THREE.Group() } as const;
  const trackLinesRef = { current: new Map<string, TrackRenderResource>() } as const;
  const payloadMap = new Map([['track-set-0', compiled.payload]]);
  const trackSetStates = {};
  const trackOpacityByTrackSet = { 'track-set-0': 1 };
  const trackLineWidthByTrackSet = {};
  const trackColorModesByTrackSet = {};
  const channelTrackOffsets = {};
  const trackScale = {};
  const selectedTrackIds = new Set<string>();
  const containerRef = { current: null } as const;
  const rendererRef = { current: null } as const;
  const cameraRef = { current: null } as const;
  const hoverRaycasterRef = { current: null } as const;
  const currentDimensionsRef = { current: null } as const;
  const hook = renderHook(() =>
    useTrackRendering({
      tracks: compiled.summary.tracks,
      compiledTrackPayloadByTrackSet: payloadMap,
      trackSetStates,
      trackOpacityByTrackSet,
      trackLineWidthByTrackSet,
      trackColorModesByTrackSet,
      channelTrackOffsets,
      trackScale,
      isFullTrackTrailEnabled: false,
      trackTrailLength: 1,
      selectedTrackIds,
      followedTrackId: null,
      clampedTimeIndex,
      trackGroupRef,
      trackLinesRef,
      containerRef,
      rendererRef,
      cameraRef,
      hoverRaycasterRef,
      currentDimensionsRef,
      hasActive3DLayer: true
    })
  );

  hook.act(() => hook.result.refreshTrackOverlay());
  hook.act(() => {});

  const batchResource = trackLinesRef.current.get('batch:track-set-0');
  assert.ok(batchResource && batchResource.kind === 'batch');
  const originalSetPositions = batchResource.geometry.setPositions.bind(batchResource.geometry);
  let setPositionsCalls = 0;
  batchResource.geometry.setPositions = ((positions: number[] | Float32Array) => {
    setPositionsCalls += 1;
    return originalSetPositions(positions);
  }) as typeof batchResource.geometry.setPositions;

  hook.act(() => {
    clampedTimeIndex = 13;
    hook.rerender();
  });

  assert.strictEqual(setPositionsCalls, 0, 'playback window updates must not mutate batch geometry');
  assert.ok(batchResource.visibleTimeMin <= 12);
  assert.ok(batchResource.visibleTimeMax >= 13);
})();

(() => {
  const compiled = createCompiledTrackSet([
    ['1', '0', '0', '0.0', '0.0', '0.0', '1.0', '0.0'],
    ['1', '0', '1', '1.0', '1.0', '0.0', '2.0', '0.0']
  ]);
  const { hook, trackGroupRef, trackLinesRef } = createTrackHook({
    tracks: compiled.summary.tracks,
    payloadMap: new Map([['track-set-0', compiled.payload]]),
    trackOpacityByTrackSet: { 'track-set-0': 1 },
    selectedTrackIds: new Set([compiled.summary.tracks[0]!.id]),
    clampedTimeIndex: 1
  });

  hook.act(() => hook.result.refreshTrackOverlay());
  assert.ok(trackLinesRef.current.size >= 2);
  assert.ok(trackGroupRef.current.children.length >= 4);

  hook.act(() => hook.result.disposeTrackResources());
  assert.strictEqual(trackLinesRef.current.size, 0);
  assert.strictEqual(trackGroupRef.current.children.length, 0);
})();

console.log('useTrackRendering tests passed');
