import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import * as THREE from 'three';

import { useTrackOverlay } from '../../src/renderer/useTrackOverlay.ts';
import type { TrackDefinition } from '../../src/types/tracks.ts';

afterEach(() => {
  cleanup();
});

describe('useTrackOverlay', () => {
  const track: TrackDefinition = {
    id: 'track-1',
    channelId: 'channel-a',
    channelName: 'Channel A',
    trackNumber: 1,
    sourceTrackId: 1,
    points: [
      { time: 0, x: 0, y: 0, z: 0, amplitude: 1 },
      { time: 1, x: 1, y: 1, z: 0, amplitude: 1 }
    ]
  };

  it('creates line resources and toggles visibility based on track state', async () => {
    const trackGroup = new THREE.Group();
    const trackLinesRef = { current: new Map<string, any>() };
    const hoveredTrackIdRef = { current: null as string | null };
    const clearHoverState = vi.fn();
    const selected = new Set<string>(['track-1']);

    const { result, rerender } = renderHook(
      ({
        tracks,
        trackVisibility,
        selectedTrackIds
      }: {
        tracks: TrackDefinition[];
        trackVisibility: Record<string, boolean>;
        selectedTrackIds: ReadonlySet<string>;
      }) =>
        useTrackOverlay({
          trackGroup,
          trackLinesRef,
          tracks,
          trackOverlayRevision: 1,
          rendererSize: { width: 640, height: 480 },
          channelTrackOffsets: { 'channel-a': { x: 0, y: 0 } },
          resolveTrackColor: () => new THREE.Color('#ff0000'),
          hoveredTrackIdRef,
          clearHoverState,
          timeIndexRef: { current: 1 },
          defaultTrackOpacity: 0.9,
          defaultTrackLineWidth: 1,
          hoverLineWidthMultiplier: 1.2,
          followLineWidthMultiplier: 1.35,
          selectedLineWidthMultiplier: 1.5,
          trackVisibility,
          selectedTrackIds,
          hoveredTrackId: null,
          followedTrackId: null,
          trackOpacityByChannel: {},
          trackLineWidthByChannel: {}
        })
    , {
      initialProps: {
        tracks: [track],
        trackVisibility: { 'track-1': true },
        selectedTrackIds: selected as ReadonlySet<string>
      }
    });

    await waitFor(() => {
      expect(trackLinesRef.current.size).toBe(1);
    });

    const resource = trackLinesRef.current.get('track-1');
    expect(resource).toBeDefined();
    expect(resource!.line.visible).toBe(true);
    expect(resource!.outline.visible).toBe(true);
    expect(resource!.targetOpacity).toBeGreaterThan(0.9);
    expect(trackGroup.visible).toBe(true);

    act(() => {
      result.current.updateTrackDrawRanges(1);
    });
    expect(resource!.geometry.instanceCount).toBe(1);

    rerender({
      tracks: [track],
      trackVisibility: { 'track-1': false },
      selectedTrackIds: new Set<string>()
    });

    await waitFor(() => {
      expect(resource!.line.visible).toBe(false);
    });
    expect(trackGroup.visible).toBe(false);

    expect(clearHoverState).not.toHaveBeenCalled();
  });
});
