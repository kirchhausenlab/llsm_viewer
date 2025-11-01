import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import { useXRSession } from '../../src/renderer/useXRSession.ts';

type ListenerMap = Map<string, Set<EventListener>>;

afterEach(() => {
  cleanup();
});

describe('useXRSession', () => {
  const originalNavigatorXR = navigator.xr;

  beforeEach(() => {
    Object.defineProperty(navigator, 'xr', {
      configurable: true,
      value: undefined
    });
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'xr', {
      configurable: true,
      value: originalNavigatorXR
    });
  });

  it('requests and ends XR sessions while restoring renderer state', async () => {
    const renderer = new THREE.WebGLRenderer();
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(1, 2, 3);
    const controls = new OrbitControls(camera, renderer.domElement);

    const onSessionStarted = vi.fn();
    const onSessionEnded = vi.fn();

    const listeners: ListenerMap = new Map();
    const session = {
      addEventListener: vi.fn((type: string, listener: EventListener) => {
        const set = listeners.get(type) ?? new Set<EventListener>();
        set.add(listener);
        listeners.set(type, set);
      }),
      removeEventListener: vi.fn((type: string, listener: EventListener) => {
        const set = listeners.get(type);
        if (!set) {
          return;
        }
        set.delete(listener);
        if (set.size === 0) {
          listeners.delete(type);
        }
      }),
      end: vi.fn(async () => {
        const set = listeners.get('end');
        set?.forEach((listener) => listener(new Event('end')));
      })
    } as unknown as XRSession;

    const requestSession = vi.fn(async () => session);
    Object.defineProperty(navigator, 'xr', {
      configurable: true,
      value: { requestSession }
    });

    const rendererRef = { current: renderer as THREE.WebGLRenderer | null };
    const cameraRef = { current: camera as THREE.PerspectiveCamera | null };
    const controlsRef = { current: controls as OrbitControls | null };

    const { result } = renderHook(() =>
      useXRSession({
        renderer,
        camera,
        controls,
        rendererRef,
        cameraRef,
        controlsRef,
        onSessionStarted,
        onSessionEnded
      })
    );

    expect(result.current.isPresenting).toBe(false);

    await act(async () => {
      await result.current.requestSession();
    });

    expect(requestSession).toHaveBeenCalledWith('immersive-vr', {
      optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking']
    });
    expect(renderer.xr.setSession).toHaveBeenCalledWith(session);
    expect(controls.enabled).toBe(false);
    expect(result.current.isPresenting).toBe(true);
    expect(onSessionStarted).toHaveBeenCalled();

    await act(async () => {
      await result.current.endSession();
    });

    expect(session.end).toHaveBeenCalled();
    expect(onSessionEnded).toHaveBeenCalled();
    expect(controls.enabled).toBe(true);
    expect(result.current.isPresenting).toBe(false);
  });
});
