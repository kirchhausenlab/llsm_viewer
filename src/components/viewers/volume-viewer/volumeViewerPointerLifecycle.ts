import type { MutableRefObject } from 'react';
import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

import { RENDER_STYLE_SLICED } from '../../../state/layerSettings';
import type {
  FollowedVoxelTarget,
  SlicePlaneUpdate,
  VolumeResources,
  VolumeViewerProps
} from '../VolumeViewer.types';
import type { HoveredVoxelInfo } from '../../../types/hover';

type PointerLookHandlers = {
  beginPointerLook: (event: PointerEvent) => void;
  updatePointerLook: (event: PointerEvent) => void;
  endPointerLook: (event?: PointerEvent) => void;
};

const SLICE_PLANE_DRAG_SENSITIVITY = 0.005;
const SLICE_PLANE_CROSSING_EPSILON = 1e-4;

type SliceLayerSelection = {
  layer: VolumeViewerProps['layers'][number];
  resource: VolumeResources;
  dimensions: { width: number; height: number; depth: number };
};

type RememberedSlicePlane = {
  point: THREE.Vector3;
  normal: THREE.Vector3;
};

type SlicePlaneDragState = {
  pointerId: number;
  layerKey: string;
  pivot: THREE.Vector3;
  normal: THREE.Vector3;
  lastClientX: number;
  lastClientY: number;
};

function firstPositiveDimension(...values: number[]): number {
  for (const value of values) {
    if (Number.isFinite(value) && value > 0) {
      return value;
    }
  }
  return 0;
}

function hasFiniteVector(
  value: { x: number; y: number; z: number } | null | undefined,
): value is { x: number; y: number; z: number } {
  if (!value) {
    return false;
  }
  return Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);
}

function resolveSliceLayerSelection(
  layers: VolumeViewerProps['layers'],
  resources: Map<string, VolumeResources>,
  activeSlicedLayerKey: string | null,
): SliceLayerSelection | null {
  const resolveCandidate = (layer: VolumeViewerProps['layers'][number]): SliceLayerSelection | null => {
    if (!layer.visible || layer.isHoverTarget === false || layer.renderStyle !== RENDER_STYLE_SLICED) {
      return null;
    }

    const resource = resources.get(layer.key) ?? null;
    if (!resource || resource.mode !== '3d') {
      return null;
    }

    const depth = firstPositiveDimension(
      resource.dimensions.depth,
      layer.volume?.depth ?? 0,
      layer.brickAtlas?.pageTable.volumeShape[0] ?? 0,
      layer.brickPageTable?.volumeShape[0] ?? 0,
      layer.fullResolutionDepth,
    );
    if (depth <= 1) {
      return null;
    }

    const mode =
      layer.mode === 'slice' || layer.mode === '3d'
        ? layer.mode
        : depth > 1
          ? '3d'
          : 'slice';
    if (mode !== '3d') {
      return null;
    }

    const width = firstPositiveDimension(
      resource.dimensions.width,
      layer.volume?.width ?? 0,
      layer.brickAtlas?.pageTable.volumeShape[2] ?? 0,
      layer.brickPageTable?.volumeShape[2] ?? 0,
      layer.fullResolutionWidth,
    );
    const height = firstPositiveDimension(
      resource.dimensions.height,
      layer.volume?.height ?? 0,
      layer.brickAtlas?.pageTable.volumeShape[1] ?? 0,
      layer.brickPageTable?.volumeShape[1] ?? 0,
      layer.fullResolutionHeight,
    );

    if (width <= 0 || height <= 0) {
      return null;
    }

    return {
      layer,
      resource,
      dimensions: { width, height, depth },
    };
  };

  if (activeSlicedLayerKey) {
    const activeLayer = layers.find((layer) => layer.key === activeSlicedLayerKey) ?? null;
    if (!activeLayer) {
      return null;
    }
    return resolveCandidate(activeLayer);
  }

  for (const layer of layers) {
    const candidate = resolveCandidate(layer);
    if (candidate) {
      return candidate;
    }
  }

  return null;
}

function resolveCurrentSlicePlane(
  selection: SliceLayerSelection,
  rememberedPlane: RememberedSlicePlane | undefined,
  pointOut: THREE.Vector3,
  normalOut: THREE.Vector3,
): void {
  const { layer, dimensions } = selection;
  const explicitPlanePoint = layer.slicedPlanePoint ?? null;

  if (hasFiniteVector(explicitPlanePoint)) {
    pointOut.set(explicitPlanePoint.x, explicitPlanePoint.y, explicitPlanePoint.z);
  } else if (rememberedPlane) {
    pointOut.copy(rememberedPlane.point);
  } else {
    const sliceIndex = Number.isFinite(layer.sliceIndex)
      ? Number(layer.sliceIndex)
      : Math.floor(dimensions.depth / 2);
    const clampedSliceIndex = Math.max(0, Math.min(dimensions.depth - 1, sliceIndex));
    pointOut.set(0, 0, clampedSliceIndex);
  }

  const explicitPlaneNormal = layer.slicedPlaneNormal ?? null;
  if (hasFiniteVector(explicitPlaneNormal)) {
    normalOut.set(explicitPlaneNormal.x, explicitPlaneNormal.y, explicitPlaneNormal.z);
  } else if (rememberedPlane) {
    normalOut.copy(rememberedPlane.normal);
  } else {
    normalOut.set(0, 0, 1);
  }

  if (normalOut.lengthSq() < 1e-8) {
    normalOut.set(0, 0, 1);
  } else {
    normalOut.normalize();
  }
}

type AttachVolumeViewerPointerLifecycleParams = PointerLookHandlers & {
  domElement: HTMLCanvasElement;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  layersRef: MutableRefObject<VolumeViewerProps['layers']>;
  activeSlicedLayerKeyRef: MutableRefObject<VolumeViewerProps['activeSlicedLayerKey']>;
  resourcesRef: MutableRefObject<Map<string, VolumeResources>>;
  volumeRootGroupRef: MutableRefObject<THREE.Group | null>;
  paintbrushRef: MutableRefObject<VolumeViewerProps['paintbrush']>;
  paintStrokePointerIdRef: MutableRefObject<number | null>;
  hoverIntensityRef: MutableRefObject<HoveredVoxelInfo | null>;
  followTargetActiveRef: MutableRefObject<boolean>;
  followedTrackIdRef: MutableRefObject<string | null>;
  rotationTargetRef: MutableRefObject<THREE.Vector3>;
  updateVoxelHover: (event: PointerEvent | MouseEvent) => void;
  performHoverHitTest: (event: PointerEvent) => string | null;
  clearHoverState: (source?: 'pointer' | 'controller') => void;
  clearVoxelHover: () => void;
  resolveHoveredFollowTarget: () => FollowedVoxelTarget | null;
  onTrackSelectionToggle: (trackId: string) => void;
  onVoxelFollowRequest: (target: FollowedVoxelTarget) => void;
  onSlicePlaneChange?: (update: SlicePlaneUpdate) => void;
};

export function attachVolumeViewerPointerLifecycle({
  domElement,
  camera,
  controls,
  layersRef,
  activeSlicedLayerKeyRef,
  resourcesRef,
  volumeRootGroupRef: _volumeRootGroupRef,
  paintbrushRef,
  paintStrokePointerIdRef,
  hoverIntensityRef,
  followTargetActiveRef,
  followedTrackIdRef,
  rotationTargetRef,
  updateVoxelHover,
  performHoverHitTest,
  clearHoverState,
  clearVoxelHover,
  resolveHoveredFollowTarget,
  onTrackSelectionToggle,
  onVoxelFollowRequest,
  onSlicePlaneChange,
  beginPointerLook,
  updatePointerLook,
  endPointerLook
}: AttachVolumeViewerPointerLifecycleParams): () => void {
  const pointerVector = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();
  const worldToLayerMatrix = new THREE.Matrix4();
  const localRay = new THREE.Ray();
  const localExitRay = new THREE.Ray();
  const slicePlane = new THREE.Plane();
  const planePoint = new THREE.Vector3();
  const planeNormal = new THREE.Vector3();
  const boxBounds = new THREE.Box3();
  const entryPoint = new THREE.Vector3();
  const exitPoint = new THREE.Vector3();
  const pivotPoint = new THREE.Vector3();
  const rayDirection = new THREE.Vector3();
  const cameraRightWorld = new THREE.Vector3();
  const cameraUpWorld = new THREE.Vector3();
  const cameraRightLocal = new THREE.Vector3();
  const cameraUpLocal = new THREE.Vector3();
  const rotateHorizontal = new THREE.Quaternion();
  const rotateVertical = new THREE.Quaternion();
  const slicePlaneStateByLayer = new Map<string, RememberedSlicePlane>();
  let slicePlaneDragState: SlicePlaneDragState | null = null;

  const isShiftOnlyDragGesture = (event: PointerEvent): boolean =>
    event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey;

  const updateLayerInverseMatrix = (mesh: THREE.Mesh) => {
    mesh.updateMatrixWorld(true);
    worldToLayerMatrix.copy(mesh.matrixWorld).invert();
  };

  const stopSlicePlaneDrag = (pointerId: number): boolean => {
    if (!slicePlaneDragState || slicePlaneDragState.pointerId !== pointerId) {
      return false;
    }

    slicePlaneDragState = null;
    try {
      domElement.releasePointerCapture(pointerId);
    } catch {
      // Ignore.
    }
    return true;
  };

  const tryBeginSlicePlaneDrag = (event: PointerEvent): boolean => {
    if (!isShiftOnlyDragGesture(event)) {
      return false;
    }

    const selection = resolveSliceLayerSelection(
      layersRef.current,
      resourcesRef.current,
      activeSlicedLayerKeyRef.current ?? null,
    );
    if (!selection) {
      return false;
    }

    const rect = domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return false;
    }

    const offsetX = event.clientX - rect.left;
    const offsetY = event.clientY - rect.top;
    if (offsetX < 0 || offsetX > rect.width || offsetY < 0 || offsetY > rect.height) {
      return false;
    }

    updateLayerInverseMatrix(selection.resource.mesh);
    camera.updateMatrixWorld(true);
    pointerVector.set((offsetX / rect.width) * 2 - 1, -(offsetY / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointerVector, camera);
    localRay.copy(raycaster.ray).applyMatrix4(worldToLayerMatrix);

    const rememberedPlane = slicePlaneStateByLayer.get(selection.layer.key);
    resolveCurrentSlicePlane(selection, rememberedPlane, planePoint, planeNormal);
    slicePlane.setFromNormalAndCoplanarPoint(planeNormal, planePoint);

    boxBounds.min.set(-0.5, -0.5, -0.5);
    boxBounds.max.set(
      selection.dimensions.width - 0.5,
      selection.dimensions.height - 0.5,
      selection.dimensions.depth - 0.5,
    );

    if (boxBounds.containsPoint(localRay.origin)) {
      entryPoint.copy(localRay.origin);
    } else if (!localRay.intersectBox(boxBounds, entryPoint)) {
      return false;
    }

    rayDirection.copy(localRay.direction).normalize();
    localExitRay.origin.copy(entryPoint).addScaledVector(rayDirection, 1e-4);
    localExitRay.direction.copy(rayDirection);
    if (!localExitRay.intersectBox(boxBounds, exitPoint)) {
      return false;
    }

    const signedEntry = slicePlane.distanceToPoint(entryPoint);
    const signedExit = slicePlane.distanceToPoint(exitPoint);
    if (signedEntry >= -SLICE_PLANE_CROSSING_EPSILON || signedExit <= SLICE_PLANE_CROSSING_EPSILON) {
      // Drag must start on the current cut face (outside -> inside crossing).
      return false;
    }

    const denom = signedEntry - signedExit;
    if (Math.abs(denom) <= 1e-8) {
      return false;
    }

    const crossingT = THREE.MathUtils.clamp(signedEntry / denom, 0, 1);
    pivotPoint.copy(entryPoint).lerp(exitPoint, crossingT);

    slicePlaneDragState = {
      pointerId: event.pointerId,
      layerKey: selection.layer.key,
      pivot: pivotPoint.clone(),
      normal: planeNormal.clone(),
      lastClientX: event.clientX,
      lastClientY: event.clientY,
    };
    slicePlaneStateByLayer.set(selection.layer.key, {
      point: pivotPoint.clone(),
      normal: planeNormal.clone(),
    });

    try {
      domElement.setPointerCapture(event.pointerId);
    } catch {
      // Ignore: some platforms may reject capture.
    }
    event.preventDefault();
    return true;
  };

  const tryUpdateSlicePlaneDrag = (event: PointerEvent): boolean => {
    const dragState = slicePlaneDragState;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return false;
    }

    const deltaX = event.clientX - dragState.lastClientX;
    const deltaY = event.clientY - dragState.lastClientY;
    dragState.lastClientX = event.clientX;
    dragState.lastClientY = event.clientY;

    if (deltaX === 0 && deltaY === 0) {
      return true;
    }

    const layer = layersRef.current.find((entry) => entry.key === dragState.layerKey) ?? null;
    const mesh = layer ? resourcesRef.current.get(layer.key)?.mesh ?? null : null;
    if (!mesh) {
      stopSlicePlaneDrag(event.pointerId);
      return true;
    }

    updateLayerInverseMatrix(mesh);
    cameraRightWorld.set(1, 0, 0).applyQuaternion(camera.quaternion).normalize();
    cameraUpWorld.set(0, 1, 0).applyQuaternion(camera.quaternion).normalize();
    cameraRightLocal.copy(cameraRightWorld).transformDirection(worldToLayerMatrix);
    cameraUpLocal.copy(cameraUpWorld).transformDirection(worldToLayerMatrix);

    if (cameraRightLocal.lengthSq() < 1e-8) {
      cameraRightLocal.set(1, 0, 0);
    }
    if (cameraUpLocal.lengthSq() < 1e-8) {
      cameraUpLocal.set(0, 1, 0);
    }

    rotateHorizontal.setFromAxisAngle(cameraUpLocal, -deltaX * SLICE_PLANE_DRAG_SENSITIVITY);
    rotateVertical.setFromAxisAngle(cameraRightLocal, -deltaY * SLICE_PLANE_DRAG_SENSITIVITY);
    dragState.normal.applyQuaternion(rotateHorizontal).applyQuaternion(rotateVertical).normalize();
    if (dragState.normal.lengthSq() < 1e-8) {
      dragState.normal.set(0, 0, 1);
    }

    slicePlaneStateByLayer.set(dragState.layerKey, {
      point: dragState.pivot.clone(),
      normal: dragState.normal.clone(),
    });
    onSlicePlaneChange?.({
      layerKey: dragState.layerKey,
      point: {
        x: dragState.pivot.x,
        y: dragState.pivot.y,
        z: dragState.pivot.z,
      },
      normal: {
        x: dragState.normal.x,
        y: dragState.normal.y,
        z: dragState.normal.z,
      },
    });
    event.preventDefault();
    return true;
  };

  const handlePointerDown = (event: PointerEvent) => {
    if (event.button !== 0) {
      return;
    }

    if (isShiftOnlyDragGesture(event)) {
      if (tryBeginSlicePlaneDrag(event)) {
        return;
      }
      // Reserve SHIFT-only drag for slice interaction.
      updateVoxelHover(event);
      performHoverHitTest(event);
      return;
    }

    const paint = paintbrushRef.current;
    const shouldPaint = Boolean(paint?.enabled && event.ctrlKey);
    if (shouldPaint && paint) {
      paintStrokePointerIdRef.current = event.pointerId;
      try {
        domElement.setPointerCapture(event.pointerId);
      } catch {
        // Ignore: some platforms may reject capture.
      }
      paint.onStrokeStart();
      updateVoxelHover(event);
      const hovered = hoverIntensityRef.current;
      if (hovered) {
        paint.onStrokeApply(hovered.coordinates);
      }
      return;
    }

    rotationTargetRef.current.copy(controls.target);
    if (!followTargetActiveRef.current) {
      beginPointerLook(event);
    }

    updateVoxelHover(event);
    const hitTrackId = performHoverHitTest(event);
    if (hitTrackId !== null) {
      onTrackSelectionToggle(hitTrackId);
    }
  };

  const handlePointerMove = (event: PointerEvent) => {
    if (tryUpdateSlicePlaneDrag(event)) {
      return;
    }

    const paint = paintbrushRef.current;
    const isPainting = paintStrokePointerIdRef.current !== null;
    if (paint && isPainting && paintStrokePointerIdRef.current === event.pointerId) {
      updateVoxelHover(event);
      const hovered = hoverIntensityRef.current;
      if (hovered) {
        paint.onStrokeApply(hovered.coordinates);
      }
      return;
    }

    if (followTargetActiveRef.current) {
      rotationTargetRef.current.copy(controls.target);
    }

    if (!followTargetActiveRef.current) {
      updatePointerLook(event);
    }

    updateVoxelHover(event);
    performHoverHitTest(event);
  };

  const handlePointerUp = (event: PointerEvent) => {
    if (stopSlicePlaneDrag(event.pointerId)) {
      return;
    }

    const paint = paintbrushRef.current;
    const activePointerId = paintStrokePointerIdRef.current;
    if (paint && activePointerId !== null && activePointerId === event.pointerId) {
      updateVoxelHover(event);
      const hovered = hoverIntensityRef.current;
      if (hovered) {
        paint.onStrokeApply(hovered.coordinates);
      }
      paint.onStrokeEnd();
      paintStrokePointerIdRef.current = null;
      try {
        domElement.releasePointerCapture(event.pointerId);
      } catch {
        // Ignore.
      }
      return;
    }

    updateVoxelHover(event);
    performHoverHitTest(event);

    if (!followTargetActiveRef.current) {
      endPointerLook(event);
    }
  };

  const handlePointerLeave = (event: PointerEvent) => {
    stopSlicePlaneDrag(event.pointerId);

    const paint = paintbrushRef.current;
    const activePointerId = paintStrokePointerIdRef.current;
    if (paint && activePointerId !== null && activePointerId === event.pointerId) {
      paint.onStrokeEnd();
      paintStrokePointerIdRef.current = null;
    }
    clearHoverState('pointer');
    clearVoxelHover();
    if (!followTargetActiveRef.current) {
      endPointerLook(event);
    }
  };

  const handleDoubleClick = (event: MouseEvent) => {
    updateVoxelHover(event);

    if (followedTrackIdRef.current !== null) {
      return;
    }

    const hoveredTarget = resolveHoveredFollowTarget();
    if (hoveredTarget) {
      onVoxelFollowRequest(hoveredTarget);
    }
  };

  const pointerDownOptions: AddEventListenerOptions = { capture: true };
  domElement.addEventListener('pointerdown', handlePointerDown, pointerDownOptions);
  domElement.addEventListener('pointermove', handlePointerMove);
  domElement.addEventListener('pointerup', handlePointerUp);
  domElement.addEventListener('pointercancel', handlePointerUp);
  domElement.addEventListener('pointerleave', handlePointerLeave);
  domElement.addEventListener('dblclick', handleDoubleClick);

  return () => {
    domElement.removeEventListener('pointerdown', handlePointerDown, pointerDownOptions);
    domElement.removeEventListener('pointermove', handlePointerMove);
    domElement.removeEventListener('pointerup', handlePointerUp);
    domElement.removeEventListener('pointercancel', handlePointerUp);
    domElement.removeEventListener('pointerleave', handlePointerLeave);
    domElement.removeEventListener('dblclick', handleDoubleClick);
  };
}
