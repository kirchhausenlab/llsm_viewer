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
  style: { cursor: string };
};

function createFakeCanvas(width = 200, height = 200): FakeCanvas {
  const pointerListeners = new Map<string, Set<PointerListener>>();
  const mouseListeners = new Map<string, Set<MouseListener>>();
  const capturedPointers = new Set<number>();

  const canvas = {
    style: { cursor: '' },
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
    buttons: 0,
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
    isRoiDrawToolActiveRef: { current: false },
    isRoiDrawPreviewActiveRef: { current: false },
    isRoiMoveInteractionActiveRef: { current: false },
    isRoiMoveActiveRef: { current: false },
    handleRoiPointerDown: () => {
      roiCounters.down += 1;
      return false;
    },
    handleRoiPointerMove: () => false,
    handleRoiPointerUp: () => false,
    handleRoiPointerLeave: () => false,
    performRoiHitTest: () => null,
    performPropHitTest: () => null,
    resolveWorldPropDragPosition: () => null,
    performHoverHitTest: () => null,
    clearHoverState: () => {},
    clearVoxelHover: () => {},
    resolveHoveredFollowTarget: () => null,
    onPropSelect: () => {},
    onWorldPropPositionChange: () => {},
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
    isRoiDrawToolActiveRef: { current: false },
    isRoiDrawPreviewActiveRef: { current: false },
    isRoiMoveInteractionActiveRef: { current: false },
    isRoiMoveActiveRef: { current: false },
    handleRoiPointerDown: () => false,
    handleRoiPointerMove: () => false,
    handleRoiPointerUp: () => false,
    handleRoiPointerLeave: () => false,
    performRoiHitTest: () => null,
    performPropHitTest: () => null,
    resolveWorldPropDragPosition: () => null,
    performHoverHitTest: () => null,
    clearHoverState: () => {},
    clearVoxelHover: () => {},
    resolveHoveredFollowTarget: () => null,
    onPropSelect: () => {},
    onWorldPropPositionChange: () => {},
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

(() => {
  const domElement = createFakeCanvas();
  const controls = { target: new THREE.Vector3() } as unknown as import('three/examples/jsm/controls/OrbitControls').OrbitControls;
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
  const roiMoveActiveRef = { current: false };
  const roiMoveInteractionActiveRef = { current: false };

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
        onStrokeStart: () => {},
        onStrokeApply: () => {},
        onStrokeEnd: () => {},
      },
    },
    paintStrokePointerIdRef: { current: null },
    hoverIntensityRef: { current: null },
    followTargetActiveRef: { current: false },
    followedTrackIdRef: { current: null },
    rotationTargetRef: { current: new THREE.Vector3() },
    updateVoxelHover: () => {},
    isRoiDrawToolActiveRef: { current: true },
    isRoiDrawPreviewActiveRef: { current: false },
    isRoiMoveInteractionActiveRef: roiMoveInteractionActiveRef,
    isRoiMoveActiveRef: roiMoveActiveRef,
    handleRoiPointerDown: () => false,
    handleRoiPointerMove: () => false,
    handleRoiPointerUp: () => false,
    handleRoiPointerLeave: () => false,
    performRoiHitTest: () => 'roi-hover',
    performPropHitTest: () => null,
    resolveWorldPropDragPosition: () => null,
    performHoverHitTest: () => null,
    clearHoverState: () => {},
    clearVoxelHover: () => {},
    resolveHoveredFollowTarget: () => null,
    onPropSelect: () => {},
    onWorldPropPositionChange: () => {},
    onTrackSelectionToggle: () => {},
    onVoxelFollowRequest: () => {},
    beginPointerLook: () => {},
    updatePointerLook: () => {},
    endPointerLook: () => {},
  });

  domElement.emitPointer('pointermove', createPointerEvent({ pointerId: 14 }));
  assert.equal(domElement.style.cursor, 'grab', 'hovering an ROI should use the grab cursor');

  roiMoveInteractionActiveRef.current = true;
  roiMoveActiveRef.current = true;
  domElement.emitPointer('pointermove', createPointerEvent({ pointerId: 14, buttons: 1 }));
  assert.equal(domElement.style.cursor, 'grabbing', 'dragging an ROI should use the grabbing cursor');

  domElement.emitPointer('pointerleave', createPointerEvent({ pointerId: 14 }));
  assert.equal(domElement.style.cursor, '', 'leaving the canvas should clear the ROI cursor');

  detach();
})();

(() => {
  const domElement = createFakeCanvas();
  const controls = { target: new THREE.Vector3() } as unknown as import('three/examples/jsm/controls/OrbitControls').OrbitControls;
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
  const pointerLookCounters = { begin: 0, move: 0, end: 0 };
  let selectedPropId: string | null = null;

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
        onStrokeStart: () => {},
        onStrokeApply: () => {},
        onStrokeEnd: () => {},
      },
    },
    paintStrokePointerIdRef: { current: null },
    hoverIntensityRef: { current: null },
    followTargetActiveRef: { current: false },
    followedTrackIdRef: { current: null },
    rotationTargetRef: { current: new THREE.Vector3() },
    updateVoxelHover: () => {},
    isRoiDrawToolActiveRef: { current: false },
    isRoiDrawPreviewActiveRef: { current: false },
    isRoiMoveInteractionActiveRef: { current: false },
    isRoiMoveActiveRef: { current: false },
    handleRoiPointerDown: () => false,
    handleRoiPointerMove: () => false,
    handleRoiPointerUp: () => false,
    handleRoiPointerLeave: () => false,
    performRoiHitTest: () => null,
    performPropHitTest: () => 'viewer-prop-7',
    resolveWorldPropDragPosition: () => ({ x: 0, y: 0 }),
    performHoverHitTest: () => null,
    clearHoverState: () => {},
    clearVoxelHover: () => {},
    resolveHoveredFollowTarget: () => null,
    onPropSelect: (propId) => {
      selectedPropId = propId;
    },
    onWorldPropPositionChange: () => {},
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

  domElement.emitPointer('pointerdown', createPointerEvent({ pointerId: 3 }));

  assert.equal(selectedPropId, 'viewer-prop-7', '3D prop hit should select the prop');
  assert.equal(pointerLookCounters.begin, 0, '3D prop hit should suppress pointer-look');
  detach();
})();

(() => {
  const domElement = createFakeCanvas();
  const controls = { target: new THREE.Vector3() } as unknown as import('three/examples/jsm/controls/OrbitControls').OrbitControls;
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
  const pointerLookCounters = { begin: 0, move: 0, end: 0 };
  const draggedPositions: Array<{ x: number; y: number }> = [];

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
        onStrokeStart: () => {},
        onStrokeApply: () => {},
        onStrokeEnd: () => {},
      },
    },
    paintStrokePointerIdRef: { current: null },
    hoverIntensityRef: { current: null },
    followTargetActiveRef: { current: false },
    followedTrackIdRef: { current: null },
    rotationTargetRef: { current: new THREE.Vector3() },
    updateVoxelHover: () => {},
    isRoiDrawToolActiveRef: { current: false },
    isRoiDrawPreviewActiveRef: { current: false },
    isRoiMoveInteractionActiveRef: { current: false },
    isRoiMoveActiveRef: { current: false },
    handleRoiPointerDown: () => false,
    handleRoiPointerMove: () => false,
    handleRoiPointerUp: () => false,
    handleRoiPointerLeave: () => false,
    performRoiHitTest: () => null,
    performPropHitTest: () => 'viewer-prop-9',
    resolveWorldPropDragPosition: (_propId, event) => ({
      x: event.clientX / 10,
      y: event.clientY / 10,
    }),
    performHoverHitTest: () => null,
    clearHoverState: () => {},
    clearVoxelHover: () => {},
    resolveHoveredFollowTarget: () => null,
    onPropSelect: () => {},
    onWorldPropPositionChange: (_propId, nextPosition) => {
      draggedPositions.push(nextPosition);
    },
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

  domElement.emitPointer('pointerdown', createPointerEvent({ pointerId: 11, clientX: 80, clientY: 90 }));
  domElement.emitPointer('pointermove', createPointerEvent({ pointerId: 11, clientX: 100, clientY: 120 }));
  domElement.emitPointer('pointerup', createPointerEvent({ pointerId: 11, clientX: 110, clientY: 130 }));

  assert.deepEqual(
    draggedPositions,
    [{ x: 10, y: 12 }],
    '3D prop drag should emit world-space X/Y updates while dragging'
  );
  assert.equal(pointerLookCounters.begin, 0, '3D prop drag should suppress pointer-look start');
  assert.equal(pointerLookCounters.move, 0, '3D prop drag should suppress pointer-look updates');
  assert.equal(pointerLookCounters.end, 0, '3D prop drag should suppress pointer-look end');
  assert.equal(domElement.capturedPointers.has(11), false, '3D prop drag should release pointer capture');
  detach();
})();

(() => {
  const domElement = createFakeCanvas();
  const controls = { target: new THREE.Vector3() } as unknown as import('three/examples/jsm/controls/OrbitControls').OrbitControls;
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
  const pointerLookCounters = { begin: 0, move: 0, end: 0 };
  const roiCounters = { down: 0, move: 0, up: 0 };

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
        onStrokeStart: () => {},
        onStrokeApply: () => {},
        onStrokeEnd: () => {},
      },
    },
    paintStrokePointerIdRef: { current: null },
    hoverIntensityRef: { current: null },
    followTargetActiveRef: { current: false },
    followedTrackIdRef: { current: null },
    rotationTargetRef: { current: new THREE.Vector3() },
    updateVoxelHover: () => {},
    isRoiDrawToolActiveRef: { current: true },
    isRoiDrawPreviewActiveRef: { current: false },
    isRoiMoveInteractionActiveRef: { current: false },
    isRoiMoveActiveRef: { current: false },
    handleRoiPointerDown: () => false,
    handleRoiPointerMove: () => {
      roiCounters.move += 1;
      return true;
    },
    handleRoiPointerUp: () => {
      roiCounters.up += 1;
      return true;
    },
    handleRoiPointerLeave: () => false,
    performRoiHitTest: () => null,
    performPropHitTest: () => null,
    resolveWorldPropDragPosition: () => null,
    performHoverHitTest: () => null,
    clearHoverState: () => {},
    clearVoxelHover: () => {},
    resolveHoveredFollowTarget: () => null,
    onPropSelect: () => {},
    onWorldPropPositionChange: () => {},
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

  domElement.emitPointer('pointerdown', createPointerEvent({ pointerId: 18 }));
  domElement.emitPointer('pointermove', createPointerEvent({ pointerId: 18, clientX: 118 }));
  domElement.emitPointer('pointerup', createPointerEvent({ pointerId: 18, clientX: 122 }));

  assert.deepEqual(roiCounters, { down: 0, move: 0, up: 0 });
  assert.equal(pointerLookCounters.begin, 1, 'plain drag should still start pointer-look while ROI drawing is available');
  assert.equal(pointerLookCounters.move, 1, 'plain drag should still update pointer-look while ROI drawing is available');
  assert.equal(pointerLookCounters.end, 1, 'plain drag should still end pointer-look while ROI drawing is available');

  detach();
})();

(() => {
  const domElement = createFakeCanvas();
  const controls = { target: new THREE.Vector3() } as unknown as import('three/examples/jsm/controls/OrbitControls').OrbitControls;
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
  const pointerLookCounters = { begin: 0, move: 0, end: 0 };
  const roiCounters = { down: 0, move: 0, up: 0, leave: 0 };
  let hoverUpdates = 0;
  let propHitTests = 0;
  let trackSelections = 0;
  const roiPreviewActiveRef = { current: false };

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
        onStrokeStart: () => {},
        onStrokeApply: () => {},
        onStrokeEnd: () => {},
      },
    },
    paintStrokePointerIdRef: { current: null },
    hoverIntensityRef: { current: null },
    followTargetActiveRef: { current: false },
    followedTrackIdRef: { current: null },
    rotationTargetRef: { current: new THREE.Vector3() },
    updateVoxelHover: () => {
      hoverUpdates += 1;
    },
    isRoiDrawToolActiveRef: { current: true },
    isRoiDrawPreviewActiveRef: roiPreviewActiveRef,
    isRoiMoveInteractionActiveRef: roiPreviewActiveRef,
    isRoiMoveActiveRef: { current: false },
    handleRoiPointerDown: () => {
      roiCounters.down += 1;
      roiPreviewActiveRef.current = true;
      return true;
    },
    handleRoiPointerMove: () => {
      roiCounters.move += 1;
      return true;
    },
    handleRoiPointerUp: () => {
      roiCounters.up += 1;
      roiPreviewActiveRef.current = false;
      return true;
    },
    handleRoiPointerLeave: () => {
      roiCounters.leave += 1;
      roiPreviewActiveRef.current = false;
      return true;
    },
    performRoiHitTest: () => 'roi-drag',
    performPropHitTest: () => {
      propHitTests += 1;
      return 'viewer-prop-12';
    },
    resolveWorldPropDragPosition: () => null,
    performHoverHitTest: () => null,
    clearHoverState: () => {},
    clearVoxelHover: () => {},
    resolveHoveredFollowTarget: () => null,
    onPropSelect: () => {},
    onWorldPropPositionChange: () => {},
    onTrackSelectionToggle: () => {
      trackSelections += 1;
    },
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

  domElement.emitPointer('pointerdown', createPointerEvent({ pointerId: 21, shiftKey: true }));
  domElement.emitPointer('pointermove', createPointerEvent({ pointerId: 21, clientX: 120 }));
  domElement.emitPointer('pointerup', createPointerEvent({ pointerId: 21, clientX: 135 }));
  assert.deepEqual(roiCounters, { down: 1, move: 1, up: 1, leave: 0 });
  assert.equal(hoverUpdates, 3, 'ROI draw mode should refresh voxel hover on down, move, and up');
  assert.equal(propHitTests, 0, 'ROI draw mode should suppress prop hit tests');
  assert.equal(trackSelections, 0, 'ROI draw mode should suppress track selection');
  assert.equal(pointerLookCounters.begin, 0, 'ROI draw mode should suppress pointer-look start');
  assert.equal(pointerLookCounters.move, 0, 'ROI draw mode should suppress pointer-look updates');
  assert.equal(pointerLookCounters.end, 0, 'ROI draw mode should suppress pointer-look end');

  detach();
})();

console.log('volumeViewerPointerLifecycle tests passed');
