import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';

import { useCameraControls } from '../src/components/viewers/volume-viewer/useCameraControls.ts';
import { renderHook } from './hooks/renderHook.ts';

type KeyboardListener = (event: KeyboardEvent) => void;

function createWindowMock() {
  const listeners = new Map<string, Set<KeyboardListener>>();

  return {
    addEventListener(type: string, listener: KeyboardListener) {
      const handlers = listeners.get(type) ?? new Set<KeyboardListener>();
      handlers.add(listener);
      listeners.set(type, handlers);
    },
    removeEventListener(type: string, listener: KeyboardListener) {
      listeners.get(type)?.delete(listener);
    },
    dispatchEvent(event: KeyboardEvent) {
      listeners.get(event.type)?.forEach((listener) => listener(event));
      return true;
    },
  };
}

function withWindowMock(run: (windowMock: ReturnType<typeof createWindowMock>) => void) {
  const previousWindow = globalThis.window;
  const windowMock = createWindowMock();
  (globalThis as typeof globalThis & { window: typeof windowMock }).window = windowMock;

  try {
    run(windowMock);
  } finally {
    (globalThis as typeof globalThis & { window?: Window & typeof globalThis }).window = previousWindow;
  }
}

function createKeyboardEvent(type: 'keydown' | 'keyup', code: string) {
  let defaultPrevented = false;

  return {
    event: {
      type,
      code,
      target: null,
      preventDefault() {
        defaultPrevented = true;
      },
    } as unknown as KeyboardEvent,
    wasPrevented: () => defaultPrevented,
  };
}

function assertNearlyEqual(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `Expected ${actual} to equal ${expected}`);
}

test('keyboard movement defaults to the old shift speed and ignores shift key presses', () => {
  withWindowMock((windowMock) => {
    const hook = renderHook(() =>
      useCameraControls({
        trackLinesRef: { current: new Map() },
        roiLinesRef: { current: new Map() },
        followTargetActiveRef: { current: false },
        setHasMeasured: () => {},
      }),
    );

    const renderer = { xr: { isPresenting: false } } as THREE.WebGLRenderer;
    const camera = new THREE.PerspectiveCamera();
    const controls = { target: new THREE.Vector3() } as any;

    hook.result.rotationTargetRef.current.set(0, 0, 0);
    camera.position.set(0, 0, 10);

    const moveForward = createKeyboardEvent('keydown', 'KeyW');
    hook.act(() => {
      windowMock.dispatchEvent(moveForward.event);
    });

    hook.result.applyKeyboardMovement(renderer, camera, controls);

    assert.equal(moveForward.wasPrevented(), true);
    assertNearlyEqual(camera.position.z, 9.95);
    assertNearlyEqual(controls.target.z, -0.05);

    hook.act(() => {
      windowMock.dispatchEvent(createKeyboardEvent('keyup', 'KeyW').event);
    });

    hook.result.rotationTargetRef.current.set(0, 0, 0);
    camera.position.set(0, 0, 10);
    controls.target.set(0, 0, 0);

    const shiftDown = createKeyboardEvent('keydown', 'ShiftLeft');
    const moveForwardWithShift = createKeyboardEvent('keydown', 'KeyW');
    hook.act(() => {
      windowMock.dispatchEvent(shiftDown.event);
      windowMock.dispatchEvent(moveForwardWithShift.event);
    });

    hook.result.applyKeyboardMovement(renderer, camera, controls);

    assert.equal(shiftDown.wasPrevented(), false);
    assert.equal(moveForwardWithShift.wasPrevented(), true);
    assertNearlyEqual(camera.position.z, 9.95);
    assertNearlyEqual(controls.target.z, -0.05);

    hook.unmount();
  });
});
