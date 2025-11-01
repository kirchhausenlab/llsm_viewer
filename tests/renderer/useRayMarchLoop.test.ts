import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook } from '@testing-library/react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import { useRayMarchLoop } from '../../src/renderer/useRayMarchLoop.ts';
import type { TrackLineResource } from '../../src/renderer/useTrackOverlay.ts';
import type { VolumeResources } from '../../src/renderer/types.ts';

afterEach(() => {
  cleanup();
});

describe('useRayMarchLoop', () => {
  it('configures the renderer animation loop and updates track resources', () => {
    const renderer = new THREE.WebGLRenderer();
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const controls = new OrbitControls(camera, renderer.domElement);
    const updateTrackOverlayDrawRanges = vi.fn();
    const updateTrackOverlayState = vi.fn();
    const onEarlyTerminationChange = vi.fn();
    const onTimeIndexChange = vi.fn();

    const trackResource: TrackLineResource = {
      line: { visible: false } as unknown as TrackLineResource['line'],
      outline: { visible: false } as unknown as TrackLineResource['outline'],
      geometry: { instanceCount: 0 } as unknown as TrackLineResource['geometry'],
      material: {
        color: new THREE.Color('#000000'),
        needsUpdate: false,
        opacity: 0,
        linewidth: 0
      } as unknown as TrackLineResource['material'],
      outlineMaterial: {
        opacity: 0,
        linewidth: 0,
        needsUpdate: false
      } as unknown as TrackLineResource['outlineMaterial'],
      times: [0, 1, 2],
      baseColor: new THREE.Color('#000000'),
      highlightColor: new THREE.Color('#ffffff'),
      channelId: 'channel-1',
      baseLineWidth: 1,
      targetLineWidth: 1,
      outlineExtraWidth: 0.5,
      targetOpacity: 0.4,
      outlineBaseOpacity: 0.2,
      isFollowed: false,
      isSelected: true,
      isHovered: false,
      shouldShow: true,
      needsAppearanceUpdate: true
    };

    const trackLinesRef = { current: new Map([[ 'track-1', trackResource ]]) };

    const mesh = new THREE.Mesh();
    mesh.updateMatrixWorld = vi.fn();
    const resourcesRef = {
      current: new Map<string, VolumeResources>([
        [
          'layer-1',
          {
            mesh: mesh as unknown as VolumeResources['mesh'],
            texture: new THREE.Data3DTexture(new Uint8Array(8), 2, 2, 2),
            dimensions: { width: 2, height: 2, depth: 2 },
            channels: 1,
            mode: '3d',
            samplingMode: 'linear',
            colormapKey: '#ffffff'
          }
        ]
      ])
    };

    const playbackStateRef = {
      current: {
        isPlaying: true,
        playbackDisabled: false,
        playbackLabel: '1 / 3',
        fps: 2,
        timeIndex: 0,
        totalTimepoints: 3,
        onTimeIndexChange
      }
    };

    const { result } = renderHook(() =>
      useRayMarchLoop({
        renderer,
        controls: controls as unknown as typeof controls,
        scene,
        camera,
        rotationTargetRef: { current: new THREE.Vector3() },
        movementStateRef: {
          current: {
            moveForward: false,
            moveBackward: false,
            moveLeft: false,
            moveRight: false,
            moveUp: false,
            moveDown: false
          }
        },
        followedTrackIdRef: { current: null },
        trackFollowOffsetRef: { current: null },
        trackLinesRef,
        resourcesRef,
        playbackLoopRef: { current: { lastTimestamp: null, accumulator: 0 } },
        playbackStateRef,
        vrHoverStateRef: { current: { playbackSliderActive: false } },
        controllersRef: { current: [{ hoverTrackId: null }] },
        timeIndexRef: { current: 0 },
        updateVrPlaybackHud: vi.fn(),
        refreshVrHudPlacements: vi.fn(),
        updateControllerRays: vi.fn(),
        vrLog: vi.fn(),
        playbackFpsLimits: { min: 1, max: 60 },
        trackBlinkSettings: { periodMs: 1000, base: 0.8, range: 0.2 },
        revision: 1,
        onEarlyTerminationChange,
        updateTrackOverlayDrawRanges,
        updateTrackOverlayState
      })
    );

    expect(renderer.setAnimationLoop).toHaveBeenCalledTimes(1);
    const callback = (renderer.setAnimationLoop as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callback).toBeTypeOf('function');

    callback(0);
    callback(800);

    expect(updateTrackOverlayState).toHaveBeenCalled();
    expect(trackResource.line.visible).toBe(true);
    expect(trackResource.outline.visible).toBe(true);
    const blinkPhase = ((800 % 1000) / 1000) * Math.PI * 2;
    const blinkScale = 0.8 + 0.2 * Math.sin(blinkPhase);
    expect(trackResource.material.opacity).toBeCloseTo(trackResource.targetOpacity * blinkScale);
    expect(trackResource.outlineMaterial.opacity).toBeCloseTo(
      trackResource.outlineBaseOpacity * blinkScale
    );
    expect(trackResource.outlineMaterial.linewidth).toBeCloseTo(1.5);
    expect(mesh.updateMatrixWorld).toHaveBeenCalled();
    expect(onTimeIndexChange).toHaveBeenCalled();
    expect(updateTrackOverlayDrawRanges).toHaveBeenCalledWith(playbackStateRef.current.timeIndex);

    result.current.stopLoop();
    expect(renderer.setAnimationLoop).toHaveBeenCalledWith(null);

    result.current.setEarlyRayTerminationEnabled(false);
    expect(onEarlyTerminationChange).toHaveBeenCalledWith(false);

    result.current.setEarlyRayTerminationEnabled(false);
    expect(onEarlyTerminationChange).toHaveBeenCalledTimes(1);
  });
});
