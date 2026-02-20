import assert from 'node:assert/strict';
import * as THREE from 'three';

import { attachVolumeViewerPointerLifecycle } from '../src/components/viewers/volume-viewer/volumeViewerPointerLifecycle.ts';
import type { VolumeResources, VolumeViewerProps } from '../src/components/viewers/VolumeViewer.types.ts';
import { RENDER_STYLE_SLICED } from '../src/state/layerSettings.ts';

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

function createSliceLayer(key: string): VolumeViewerProps['layers'][number] {
  return {
    key,
    label: key,
    channelName: key,
    fullResolutionWidth: 10,
    fullResolutionHeight: 10,
    fullResolutionDepth: 10,
    volume: null,
    visible: true,
    sliderRange: 1,
    minSliderIndex: 0,
    maxSliderIndex: 0,
    brightnessSliderIndex: 0,
    contrastSliderIndex: 0,
    windowMin: 0,
    windowMax: 1,
    color: '#ffffff',
    offsetX: 0,
    offsetY: 0,
    renderStyle: RENDER_STYLE_SLICED,
    blDensityScale: 1,
    blBackgroundCutoff: 0,
    blOpacityScale: 1,
    blEarlyExitAlpha: 0.98,
    invert: false,
    samplingMode: 'linear',
    mode: '3d',
    sliceIndex: 0,
    slicedPlanePoint: { x: 0, y: 0, z: 0 },
    slicedPlaneNormal: { x: 0, y: 0, z: 1 },
  };
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
    activeSlicedLayerKeyRef: { current: null },
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
  camera.position.set(4.5, 4.5, -25);
  camera.lookAt(4.5, 4.5, 4.5);
  camera.updateMatrixWorld(true);

  const layer = createSliceLayer('slice-layer');
  const texture = new THREE.DataTexture(new Uint8Array([0]), 1, 1, THREE.RedFormat);
  texture.needsUpdate = true;
  const geometry = new THREE.BoxGeometry(10, 10, 10);
  geometry.translate(4.5, 4.5, 4.5);
  const resource: VolumeResources = {
    mesh: new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()),
    texture,
    dimensions: { width: 10, height: 10, depth: 10 },
    channels: 1,
    mode: '3d',
    renderStyle: RENDER_STYLE_SLICED,
    samplingMode: 'nearest',
  };

  const paintCounters = { start: 0, end: 0 };
  const pointerLookCounters = { begin: 0 };
  const sliceUpdates: Array<{ layerKey: string; normal: { x: number; y: number; z: number } }> = [];

  const detach = attachVolumeViewerPointerLifecycle({
    domElement,
    camera,
    controls,
    layersRef: { current: [layer] },
    activeSlicedLayerKeyRef: { current: layer.key },
    resourcesRef: { current: new Map([[layer.key, resource]]) },
    volumeRootGroupRef: { current: null },
    paintbrushRef: {
      current: {
        enabled: true,
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
    onSlicePlaneChange: (update) => {
      sliceUpdates.push({ layerKey: update.layerKey, normal: update.normal });
    },
    beginPointerLook: () => {
      pointerLookCounters.begin += 1;
    },
    updatePointerLook: () => {},
    endPointerLook: () => {},
  });

  domElement.emitPointer('pointerdown', createPointerEvent({ shiftKey: true, pointerId: 7 }));
  domElement.emitPointer(
    'pointermove',
    createPointerEvent({ shiftKey: true, pointerId: 7, clientX: 140, clientY: 100 }),
  );
  domElement.emitPointer('pointerup', createPointerEvent({ shiftKey: true, pointerId: 7, clientX: 140 }));

  assert.equal(paintCounters.start, 0, 'SHIFT-only drag should not trigger paint');
  assert.equal(pointerLookCounters.begin, 0, 'SHIFT-only drag should not start pointer-look');
  assert.ok(sliceUpdates.length >= 1, 'SHIFT-only drag should emit slice plane updates');
  assert.equal(sliceUpdates[0]?.layerKey, layer.key);
  const latestNormal = sliceUpdates[sliceUpdates.length - 1]?.normal;
  assert.ok(latestNormal, 'expected a final slice plane normal');
  assert.ok(
    Math.abs((latestNormal?.x ?? 0)) > 1e-4 || Math.abs((latestNormal?.y ?? 0)) > 1e-4,
    'dragging should rotate the default +Z normal',
  );
  detach();
})();

console.log('volumeViewerPointerLifecycle tests passed');
