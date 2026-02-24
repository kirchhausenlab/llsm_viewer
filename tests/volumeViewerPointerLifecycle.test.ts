import assert from 'node:assert/strict';
import * as THREE from 'three';

import { attachVolumeViewerPointerLifecycle } from '../src/components/viewers/volume-viewer/volumeViewerPointerLifecycle.ts';
import type { VolumeResources } from '../src/components/viewers/VolumeViewer.types.ts';

console.log('Starting volumeViewerPointerLifecycle tests');

type PointerListener = (event: PointerEvent) => void;
type MouseListener = (event: MouseEvent) => void;

type FakeCanvas = HTMLCanvasElement & {
  emitPointer: (type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointerleave', event: PointerEvent) => void;
  emitMouse: (type: 'dblclick', event: MouseEvent) => void;
  capturedPointers: Set<number>;
};

function createFakeCanvas(width = 200, height = 200): FakeCanvas {
  const pointerListeners = new Map<string, Set<PointerListener>>();
  const mouseListeners = new Map<string, Set<MouseListener>>();
  const capturedPointers = new Set<number>();

  const canvas = {
    addEventListener: ((type: string, handler: EventListenerOrEventListenerObject) => {
      if (type.startsWith('pointer')) {
        const listeners = pointerListeners.get(type) ?? new Set<PointerListener>();
        listeners.add(handler as PointerListener);
        pointerListeners.set(type, listeners);
        return;
      }
      const listeners = mouseListeners.get(type) ?? new Set<MouseListener>();
      listeners.add(handler as MouseListener);
      mouseListeners.set(type, listeners);
    }) as HTMLCanvasElement['addEventListener'],
    removeEventListener: ((type: string, handler: EventListenerOrEventListenerObject) => {
      if (type.startsWith('pointer')) {
        pointerListeners.get(type)?.delete(handler as PointerListener);
        return;
      }
      mouseListeners.get(type)?.delete(handler as MouseListener);
    }) as HTMLCanvasElement['removeEventListener'],
    setPointerCapture: (pointerId: number) => {
      capturedPointers.add(pointerId);
    },
    releasePointerCapture: (pointerId: number) => {
      capturedPointers.delete(pointerId);
    },
    getBoundingClientRect: () => ({
      width,
      height,
      top: 0,
      left: 0,
      right: width,
      bottom: height,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }),
  } as unknown as FakeCanvas;

  canvas.emitPointer = (type, event) => {
    for (const listener of pointerListeners.get(type) ?? []) {
      listener(event);
    }
  };
  canvas.emitMouse = (type, event) => {
    for (const listener of mouseListeners.get(type) ?? []) {
      listener(event);
    }
  };
  canvas.capturedPointers = capturedPointers;
  return canvas;
}

function createPointerEvent(
  overrides: Partial<PointerEvent> = {},
): PointerEvent & { prevented: boolean } {
  const event = {
    button: 0,
    pointerId: 1,
    clientX: 100,
    clientY: 100,
    shiftKey: false,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    prevented: false,
    preventDefault() {
      event.prevented = true;
    },
  } as PointerEvent & { prevented: boolean };
  Object.assign(event, overrides);
  return event;
}

(() => {
  const domElement = createFakeCanvas();
  const controls = { target: new THREE.Vector3() } as unknown as import('three/examples/jsm/controls/OrbitControls').OrbitControls;
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
  camera.position.set(0, 0, 30);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);

  const paintCounters = { start: 0, apply: 0, end: 0 };
  const pointerLookCounters = { begin: 0, move: 0, end: 0 };
  const paintbrushRef = {
    current: {
      enabled: true,
      onStrokeStart: () => {
        paintCounters.start += 1;
      },
      onStrokeApply: () => {
        paintCounters.apply += 1;
      },
      onStrokeEnd: () => {
        paintCounters.end += 1;
      },
    },
  };
  const hoverIntensityRef = {
    current: { intensity: '', coordinates: { x: 1, y: 2, z: 3 } },
  } as any;

  const detach = attachVolumeViewerPointerLifecycle({
    domElement,
    camera,
    controls,
    layersRef: { current: [] },
    resourcesRef: { current: new Map() },
    volumeRootGroupRef: { current: null },
    paintbrushRef,
    paintStrokePointerIdRef: { current: null },
    hoverIntensityRef,
    followTargetActiveRef: { current: false },
    followedTrackIdRef: { current: null },
    rotationTargetRef: { current: new THREE.Vector3() },
    updateVoxelHover: () => {},
    performHoverHitTest: () => null,
    clearHoverState: () => {},
    clearVoxelHover: () => {},
    resolveHoveredFollowTarget: () => null,
    onTrackSelectionToggle: () => {},
    onVoxelFollowRequest: () => {},
    beginPointerLook: () => {
      pointerLookCounters.begin += 1;
    },
    updatePointerLook: () => {
      pointerLookCounters.move += 1;
    },
    endPointerLook: () => {
      pointerLookCounters.end += 1;
    },
  });

  domElement.emitPointer('pointerdown', createPointerEvent({ ctrlKey: true }));
  domElement.emitPointer('pointermove', createPointerEvent({ ctrlKey: true, pointerId: 1, clientX: 110 }));
  domElement.emitPointer('pointerup', createPointerEvent({ ctrlKey: true, pointerId: 1, clientX: 115 }));

  assert.equal(paintCounters.start, 1, 'CTRL down should start paint stroke');
  assert.equal(paintCounters.end, 1, 'CTRL up should end paint stroke');
  assert.equal(paintCounters.apply, 3, 'paint should apply on down/move/up');
  assert.equal(pointerLookCounters.begin, 0, 'paint gesture should not start pointer-look');
  detach();
})();

(() => {
  const domElement = createFakeCanvas();
  const controls = { target: new THREE.Vector3() } as unknown as import('three/examples/jsm/controls/OrbitControls').OrbitControls;
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
  const pointerLookCounters = { begin: 0, move: 0, end: 0 };
  const paintCounters = { start: 0, end: 0 };

  const detach = attachVolumeViewerPointerLifecycle({
    domElement,
    camera,
    controls,
    layersRef: { current: [] },
    resourcesRef: { current: new Map<string, VolumeResources>() },
    volumeRootGroupRef: { current: null },
    paintbrushRef: {
      current: {
        enabled: false,
        onStrokeStart: () => {
          paintCounters.start += 1;
        },
        onStrokeApply: () => {},
        onStrokeEnd: () => {
          paintCounters.end += 1;
        },
      },
    },
    paintStrokePointerIdRef: { current: null },
    hoverIntensityRef: { current: null },
    followTargetActiveRef: { current: false },
    followedTrackIdRef: { current: null },
    rotationTargetRef: { current: new THREE.Vector3() },
    updateVoxelHover: () => {},
    performHoverHitTest: () => null,
    clearHoverState: () => {},
    clearVoxelHover: () => {},
    resolveHoveredFollowTarget: () => null,
    onTrackSelectionToggle: () => {},
    onVoxelFollowRequest: () => {},
    beginPointerLook: () => {
      pointerLookCounters.begin += 1;
    },
    updatePointerLook: () => {
      pointerLookCounters.move += 1;
    },
    endPointerLook: () => {
      pointerLookCounters.end += 1;
    },
  });

  domElement.emitPointer('pointerdown', createPointerEvent({ shiftKey: true, pointerId: 7 }));
  domElement.emitPointer(
    'pointermove',
    createPointerEvent({ shiftKey: true, pointerId: 7, clientX: 140, clientY: 100 }),
  );
  domElement.emitPointer('pointerup', createPointerEvent({ shiftKey: true, pointerId: 7, clientX: 140 }));

  assert.equal(paintCounters.start, 0, 'SHIFT drag should not trigger paint when CTRL is not pressed');
  assert.equal(paintCounters.end, 0, 'SHIFT drag should not end paint when paint mode is disabled');
  assert.equal(pointerLookCounters.begin, 1, 'SHIFT drag should start pointer-look');
  assert.equal(pointerLookCounters.move, 1, 'SHIFT drag should update pointer-look');
  assert.equal(pointerLookCounters.end, 1, 'SHIFT drag should end pointer-look');
  detach();
})();

console.log('volumeViewerPointerLifecycle tests passed');
