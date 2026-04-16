import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { MutableRefObject } from 'react';
import * as THREE from 'three';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry';

import type { ViewerLayer } from '../VolumeViewer.types';
import type { RoiRenderResource, ViewerRoiConfig } from '../VolumeViewer.types';
import type { RoiDefinition, RoiDimensionMode, RoiPoint, RoiShape, SavedRoi } from '../../../types/roi';
import { buildRoiSegmentPositions } from './roiGeometry';
import { updateRoiAppearance as applyRoiAppearance } from './roiAppearance';
import { performRoiHoverHitTest } from './roiHitTesting';

type UseRoiRenderingParams = {
  roiConfig: ViewerRoiConfig | undefined;
  renderContextRevision: number;
  roiGroupRef: MutableRefObject<THREE.Group | null>;
  roiLinesRef: MutableRefObject<Map<string, RoiRenderResource>>;
  layersRef: MutableRefObject<ViewerLayer[]>;
  hoveredVoxelRef: MutableRefObject<{
    layerKey: string | null;
    normalizedPosition: THREE.Vector3 | null;
    segmentationLabel: number | null;
  }>;
  currentDimensionsRef: MutableRefObject<{ width: number; height: number; depth: number } | null>;
  containerRef: MutableRefObject<HTMLDivElement | null>;
  rendererRef: MutableRefObject<THREE.WebGLRenderer | null>;
  cameraRef: MutableRefObject<THREE.PerspectiveCamera | null>;
  volumeRootGroupRef: MutableRefObject<THREE.Group | null>;
};

type PreviewState = {
  pointerId: number;
  shape: RoiShape;
  mode: RoiDimensionMode;
  color: string;
  committedStart: RoiPoint;
  committedEnd: RoiPoint;
  previewStart: THREE.Vector3;
  previewEnd: THREE.Vector3;
  isValid: boolean;
};

type VisibleRoiSpec = {
  key: string;
  roiId: string;
  shape: RoiShape;
  mode: RoiDimensionMode;
  start: RoiPoint | THREE.Vector3;
  end: RoiPoint | THREE.Vector3;
  color: string;
  isInvalid: boolean;
  shouldBlink: boolean;
};

const ROI_LINE_WIDTH = 2;
const ROI_BASE_OPACITY = 0.92;
const ROI_WORKING_KEY = 'roi:working';
const LINE_RAYCAST_THRESHOLD = 0.02;
const tempPointer = new THREE.Vector2();
const tempInverseMatrix = new THREE.Matrix4();
const tempLocalRay = new THREE.Ray();
const tempRaycaster = new THREE.Raycaster();
const tempIntersectionPoint = new THREE.Vector3();
const tempPreviewPoint = new THREE.Vector3();
const tempBoxCenter = new THREE.Vector3();

function isDrawToolActive(roiConfig: ViewerRoiConfig | undefined): boolean {
  return Boolean(roiConfig?.isDrawWindowOpen && roiConfig.tool !== 'hand');
}

function setLineMaterialResolution(
  material: LineMaterial,
  containerNode: HTMLDivElement | null,
  renderer: THREE.WebGLRenderer | null
) {
  if (containerNode) {
    material.resolution.set(Math.max(containerNode.clientWidth, 1), Math.max(containerNode.clientHeight, 1));
    return;
  }

  if (renderer) {
    const rect = renderer.domElement.getBoundingClientRect();
    material.resolution.set(Math.max(rect.width, 1), Math.max(rect.height, 1));
    return;
  }

  material.resolution.set(1, 1);
}

function resolveVolumeBounds(dimensions: { width: number; height: number; depth: number } | null) {
  if (!dimensions) {
    return null;
  }

  return new THREE.Box3(
    new THREE.Vector3(-0.5, -0.5, -0.5),
    new THREE.Vector3(
      Math.max(-0.5, dimensions.width - 0.5),
      Math.max(-0.5, dimensions.height - 0.5),
      Math.max(-0.5, dimensions.depth - 0.5)
    )
  );
}

function resolveLayerDimensions(layer: ViewerLayer | undefined) {
  if (!layer) {
    return null;
  }

  const pageTable = layer.brickAtlas?.pageTable ?? layer.brickPageTable ?? null;
  const width = Math.max(
    0,
    Math.floor(layer.fullResolutionWidth || layer.volume?.width || pageTable?.volumeShape[2] || 0)
  );
  const height = Math.max(
    0,
    Math.floor(layer.fullResolutionHeight || layer.volume?.height || pageTable?.volumeShape[1] || 0)
  );
  const depth = Math.max(
    0,
    Math.floor(layer.fullResolutionDepth || layer.volume?.depth || pageTable?.volumeShape[0] || 0)
  );

  if (width <= 0 || height <= 0 || depth <= 0) {
    return null;
  }

  return { width, height, depth };
}

function resolveHoveredVoxelPoint(
  hoveredVoxelRef: UseRoiRenderingParams['hoveredVoxelRef'],
  layersRef: UseRoiRenderingParams['layersRef']
): RoiPoint | null {
  const hovered = hoveredVoxelRef.current;
  if (!hovered.layerKey || !hovered.normalizedPosition) {
    return null;
  }

  const layer = layersRef.current.find((entry) => entry.key === hovered.layerKey);
  const dimensions = resolveLayerDimensions(layer);
  if (!dimensions) {
    return null;
  }

  return {
    x: THREE.MathUtils.clamp(Math.round(hovered.normalizedPosition.x * dimensions.width), 0, dimensions.width - 1),
    y: THREE.MathUtils.clamp(Math.round(hovered.normalizedPosition.y * dimensions.height), 0, dimensions.height - 1),
    z: THREE.MathUtils.clamp(Math.round(hovered.normalizedPosition.z * dimensions.depth), 0, dimensions.depth - 1),
  };
}

function resolveLocalRay({
  event,
  renderer,
  camera,
  volumeRootGroup,
}: {
  event: PointerEvent;
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  volumeRootGroup: THREE.Group;
}) {
  const rect = renderer.domElement.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;
  if (width <= 0 || height <= 0) {
    return null;
  }

  const offsetX = event.clientX - rect.left;
  const offsetY = event.clientY - rect.top;
  if (offsetX < 0 || offsetY < 0 || offsetX > width || offsetY > height) {
    return null;
  }

  tempPointer.set((offsetX / width) * 2 - 1, -(offsetY / height) * 2 + 1);
  tempRaycaster.setFromCamera(tempPointer, camera);

  volumeRootGroup.updateMatrixWorld(true);
  tempInverseMatrix.copy(volumeRootGroup.matrixWorld).invert();
  tempLocalRay.copy(tempRaycaster.ray).applyMatrix4(tempInverseMatrix);
  return tempLocalRay;
}

function resolveNearestPointOnBounds(ray: THREE.Ray, bounds: THREE.Box3) {
  const targetPoint = tempPreviewPoint.copy(bounds.getCenter(tempBoxCenter));
  const direction = ray.direction;
  const denom = direction.lengthSq();
  const t = denom > 1e-8 ? targetPoint.sub(ray.origin).dot(direction) / denom : 0;
  return targetPoint.copy(ray.direction).multiplyScalar(Math.max(0, t)).add(ray.origin).clamp(bounds.min, bounds.max);
}

function resolve3dPreviewPoint(ray: THREE.Ray, bounds: THREE.Box3) {
  const hit = ray.intersectBox(bounds, tempIntersectionPoint);
  if (hit) {
    return {
      point: tempIntersectionPoint.clone(),
      isValid: true,
    };
  }

  return {
    point: resolveNearestPointOnBounds(ray, bounds).clone(),
    isValid: false,
  };
}

function resolve2dPreviewPoint(ray: THREE.Ray, bounds: THREE.Box3, zIndex: number) {
  const planeZ = THREE.MathUtils.clamp(zIndex, 0, Math.max(0, Math.floor(bounds.max.z)));
  const denominator = ray.direction.z;
  const parameter = Math.abs(denominator) > 1e-8 ? (planeZ - ray.origin.z) / denominator : 0;
  const point = ray.direction.clone().multiplyScalar(Math.max(0, parameter)).add(ray.origin);
  const isWithinBounds =
    point.x >= bounds.min.x &&
    point.x <= bounds.max.x &&
    point.y >= bounds.min.y &&
    point.y <= bounds.max.y;

  return {
    point,
    isValid: isWithinBounds,
    voxelPoint: {
      x: THREE.MathUtils.clamp(Math.round(point.x), 0, Math.max(0, Math.floor(bounds.max.x))),
      y: THREE.MathUtils.clamp(Math.round(point.y), 0, Math.max(0, Math.floor(bounds.max.y))),
      z: planeZ,
    } satisfies RoiPoint,
  };
}

function toPoint3(value: RoiPoint | THREE.Vector3) {
  return {
    x: value.x,
    y: value.y,
    z: value.z,
  };
}

function buildVisibleRoiSpecs(
  roiConfig: ViewerRoiConfig | undefined,
  previewState: PreviewState | null
): VisibleRoiSpec[] {
  if (!roiConfig) {
    return [];
  }

  const visible: VisibleRoiSpec[] = [];
  const workingRepresentsActiveSaved =
    roiConfig.workingRoi !== null &&
    roiConfig.activeSavedRoiId !== null &&
    roiConfig.editingSavedRoiId === roiConfig.activeSavedRoiId;

  if (previewState) {
    visible.push({
      key: ROI_WORKING_KEY,
      roiId: ROI_WORKING_KEY,
      shape: previewState.shape,
      mode: previewState.mode,
      start: previewState.previewStart,
      end: previewState.previewEnd,
      color: previewState.color,
      isInvalid: !previewState.isValid,
      shouldBlink: roiConfig.activeSavedRoiId !== null && roiConfig.editingSavedRoiId === roiConfig.activeSavedRoiId,
    });
  } else if (roiConfig.workingRoi) {
    visible.push({
      key: ROI_WORKING_KEY,
      roiId: ROI_WORKING_KEY,
      shape: roiConfig.workingRoi.shape,
      mode: roiConfig.workingRoi.mode,
      start: roiConfig.workingRoi.start,
      end: roiConfig.workingRoi.end,
      color: roiConfig.workingRoi.color,
      isInvalid: false,
      shouldBlink: workingRepresentsActiveSaved,
    });
  }

  const shouldShowSavedRoi = (roi: SavedRoi) =>
    roiConfig.showAllSavedRois || (roiConfig.activeSavedRoiId !== null && roiConfig.activeSavedRoiId === roi.id);

  for (const roi of roiConfig.savedRois) {
    if (!shouldShowSavedRoi(roi)) {
      continue;
    }
    if ((previewState || roiConfig.workingRoi) && roi.id === roiConfig.editingSavedRoiId) {
      continue;
    }
    visible.push({
      key: `roi:saved:${roi.id}`,
      roiId: roi.id,
      shape: roi.shape,
      mode: roi.mode,
      start: roi.start,
      end: roi.end,
      color: roi.color,
      isInvalid: false,
      shouldBlink: roi.id === roiConfig.activeSavedRoiId,
    });
  }

  return visible;
}

export function createRoiResource(
  spec: VisibleRoiSpec,
  containerRef: UseRoiRenderingParams['containerRef'],
  rendererRef: UseRoiRenderingParams['rendererRef']
): RoiRenderResource {
  const geometry = new LineSegmentsGeometry() as unknown as RoiRenderResource['geometry'];
  const positions = buildRoiSegmentPositions({
    shape: spec.shape,
    mode: spec.mode,
    start: toPoint3(spec.start),
    end: toPoint3(spec.end),
  });
  geometry.setPositions(positions);
  geometry.instanceCount = positions.length / 6;

  const material = new LineMaterial({
    color: new THREE.Color(spec.color),
    linewidth: ROI_LINE_WIDTH,
    transparent: true,
    opacity: ROI_BASE_OPACITY,
    depthTest: false,
    depthWrite: false,
  });
  setLineMaterialResolution(material, containerRef.current, rendererRef.current);

  const line = new LineSegments2(geometry, material);
  line.computeLineDistances();
  line.renderOrder = 1002;
  line.frustumCulled = false;
  line.visible = true;
  line.userData.resourceKey = spec.key;
  line.userData.roiId = spec.roiId;

  return {
    key: spec.key,
    roiId: spec.roiId,
    line,
    geometry,
    material,
    color: new THREE.Color(spec.color),
    baseOpacity: ROI_BASE_OPACITY,
    isActive: spec.shouldBlink,
    isInvalid: spec.isInvalid,
    shouldBlink: spec.shouldBlink,
  };
}

function disposeRoiResource(roiGroup: THREE.Group, resource: RoiRenderResource) {
  roiGroup.remove(resource.line);
  resource.geometry.dispose();
  resource.material.dispose();
}

export function useRoiRendering({
  roiConfig,
  renderContextRevision,
  roiGroupRef,
  roiLinesRef,
  layersRef,
  hoveredVoxelRef,
  currentDimensionsRef,
  containerRef,
  rendererRef,
  cameraRef,
  volumeRootGroupRef,
}: UseRoiRenderingParams) {
  const roiConfigRef = useRef(roiConfig);
  roiConfigRef.current = roiConfig;
  const previewStateRef = useRef<PreviewState | null>(null);
  const isDrawToolActiveRef = useRef(isDrawToolActive(roiConfig));
  isDrawToolActiveRef.current = isDrawToolActive(roiConfig);

  const syncRoiResources = useCallback(() => {
    const roiGroup = roiGroupRef.current;
    if (!roiGroup) {
      return;
    }

    const visibleSpecs = buildVisibleRoiSpecs(roiConfigRef.current, previewStateRef.current);
    const nextKeys = new Set<string>();

    for (const spec of visibleSpecs) {
      nextKeys.add(spec.key);
      let resource = roiLinesRef.current.get(spec.key);
      if (!resource) {
        resource = createRoiResource(spec, containerRef, rendererRef);
        roiGroup.add(resource.line);
        roiLinesRef.current.set(spec.key, resource);
      } else {
        const positions = buildRoiSegmentPositions({
          shape: spec.shape,
          mode: spec.mode,
          start: toPoint3(spec.start),
          end: toPoint3(spec.end),
        });
        resource.geometry.setPositions(positions);
        resource.geometry.instanceCount = positions.length / 6;
        resource.line.computeLineDistances();
        resource.color.set(spec.color);
        resource.isInvalid = spec.isInvalid;
        resource.shouldBlink = spec.shouldBlink;
        resource.isActive = spec.shouldBlink;
        resource.line.visible = true;
      }
    }

    for (const [key, resource] of Array.from(roiLinesRef.current.entries())) {
      if (nextKeys.has(key)) {
        continue;
      }
      disposeRoiResource(roiGroup, resource);
      roiLinesRef.current.delete(key);
    }

    roiGroup.visible = roiLinesRef.current.size > 0;
  }, [containerRef, rendererRef, roiGroupRef, roiLinesRef]);

  const clearPreview = useCallback(() => {
    previewStateRef.current = null;
    syncRoiResources();
  }, [syncRoiResources]);

  useEffect(() => {
    syncRoiResources();
  }, [renderContextRevision, roiConfig, syncRoiResources]);

  useEffect(() => {
    if (isDrawToolActive(roiConfig)) {
      return;
    }
    if (previewStateRef.current) {
      clearPreview();
    }
  }, [clearPreview, roiConfig]);

  const updateRoiAppearance = useCallback(
    (timestamp: number) => {
      if (roiLinesRef.current.size === 0) {
        return;
      }
      applyRoiAppearance(roiLinesRef.current.values(), timestamp);
    },
    [roiLinesRef]
  );

  const performHoverHitTest = useCallback(
    (event: PointerEvent) => {
      if (!isDrawToolActiveRef.current) {
        return null;
      }
      const raycaster = tempRaycaster;
      raycaster.params.Line = { threshold: LINE_RAYCAST_THRESHOLD };
      raycaster.params.Line2 = { threshold: LINE_RAYCAST_THRESHOLD };
      return performRoiHoverHitTest({
        event,
        camera: cameraRef.current,
        roiGroup: roiGroupRef.current,
        raycaster,
        renderer: rendererRef.current,
        roiResources: roiLinesRef.current,
      });
    },
    [cameraRef, rendererRef, roiGroupRef, roiLinesRef]
  );

  const commitPreviewRoi = useCallback(
    (nextWorkingRoi: RoiDefinition | null) => {
      roiConfigRef.current?.onWorkingRoiChange(nextWorkingRoi);
    },
    []
  );

  const beginDrawing = useCallback(
    (event: PointerEvent, domElement: HTMLCanvasElement) => {
      const config = roiConfigRef.current;
      const renderer = rendererRef.current;
      const camera = cameraRef.current;
      const volumeRootGroup = volumeRootGroupRef.current;
      const dimensions = currentDimensionsRef.current;
      if (!config || !renderer || !camera || !volumeRootGroup || !dimensions) {
        return false;
      }
      if (!isDrawToolActive(config)) {
        return false;
      }

      const localRay = resolveLocalRay({ event, renderer, camera, volumeRootGroup });
      const bounds = resolveVolumeBounds(dimensions);
      if (!localRay || !bounds) {
        return true;
      }

      let committedStart: RoiPoint | null = null;
      let previewStart: THREE.Vector3 | null = null;
      let previewEnd: THREE.Vector3 | null = null;
      let previewValid = false;
      let lockedMode: RoiDimensionMode = config.dimensionMode;

      if (config.dimensionMode === '3d') {
        const hoveredPoint = resolveHoveredVoxelPoint(hoveredVoxelRef, layersRef);
        if (!hoveredPoint) {
          return true;
        }
        const preview = resolve3dPreviewPoint(localRay, bounds);
        committedStart = hoveredPoint;
        previewStart = preview.point.clone();
        previewEnd = preview.point.clone();
        previewValid = true;
      } else {
        const preview = resolve2dPreviewPoint(localRay, bounds, config.selectedZIndex);
        if (!preview.isValid) {
          return true;
        }
        committedStart = preview.voxelPoint;
        previewStart = preview.point.clone();
        previewEnd = preview.point.clone();
        previewValid = true;
        lockedMode = '2d';
      }

      if (!committedStart || !previewStart || !previewEnd) {
        return true;
      }

      previewStateRef.current = {
        pointerId: event.pointerId,
        shape: config.tool as RoiShape,
        mode: lockedMode,
        color: config.defaultColor,
        committedStart,
        committedEnd: { ...committedStart },
        previewStart,
        previewEnd,
        isValid: previewValid,
      };
      syncRoiResources();

      try {
        domElement.setPointerCapture(event.pointerId);
      } catch {
        // Ignore capture failures on unsupported platforms.
      }

      return true;
    },
    [
      currentDimensionsRef,
      hoveredVoxelRef,
      layersRef,
      rendererRef,
      cameraRef,
      syncRoiResources,
      volumeRootGroupRef,
    ]
  );

  const updateDrawing = useCallback(
    (event: PointerEvent) => {
      const session = previewStateRef.current;
      const renderer = rendererRef.current;
      const camera = cameraRef.current;
      const volumeRootGroup = volumeRootGroupRef.current;
      const dimensions = currentDimensionsRef.current;
      if (!session || session.pointerId !== event.pointerId || !renderer || !camera || !volumeRootGroup || !dimensions) {
        return false;
      }

      const localRay = resolveLocalRay({ event, renderer, camera, volumeRootGroup });
      const bounds = resolveVolumeBounds(dimensions);
      if (!localRay || !bounds) {
        return true;
      }

      if (session.mode === '3d') {
        const preview = resolve3dPreviewPoint(localRay, bounds);
        const hoveredPoint = resolveHoveredVoxelPoint(hoveredVoxelRef, layersRef);
        session.previewEnd.copy(preview.point);
        session.isValid = hoveredPoint !== null;
        if (hoveredPoint) {
          session.committedEnd = hoveredPoint;
        }
      } else {
        const preview = resolve2dPreviewPoint(localRay, bounds, session.committedStart.z);
        session.previewEnd.copy(preview.point);
        session.isValid = preview.isValid;
        if (preview.isValid) {
          session.committedEnd = preview.voxelPoint;
        }
      }

      syncRoiResources();
      return true;
    },
    [cameraRef, currentDimensionsRef, hoveredVoxelRef, layersRef, rendererRef, syncRoiResources, volumeRootGroupRef]
  );

  const endDrawing = useCallback(
    (event: PointerEvent | undefined, domElement: HTMLCanvasElement | null) => {
      const session = previewStateRef.current;
      if (!session) {
        return false;
      }

      if (event && session.pointerId !== event.pointerId) {
        return false;
      }

      const nextWorkingRoi = session.isValid
        ? {
            shape: session.shape,
            mode: session.mode,
            start: { ...session.committedStart },
            end: session.mode === '2d'
              ? {
                  ...session.committedEnd,
                  z: session.committedStart.z,
                }
              : { ...session.committedEnd },
            color: session.color,
          }
        : null;

      previewStateRef.current = null;
      commitPreviewRoi(nextWorkingRoi);

      if (event && domElement && domElement.hasPointerCapture(event.pointerId)) {
        try {
          domElement.releasePointerCapture(event.pointerId);
        } catch {
          // Ignore.
        }
      }

      return true;
    },
    [commitPreviewRoi, syncRoiResources]
  );

  const handlePointerDown = useCallback(
    (event: PointerEvent, domElement: HTMLCanvasElement) => {
      if (!isDrawToolActiveRef.current) {
        return false;
      }

      const hitRoiId = performHoverHitTest(event);
      if (hitRoiId) {
        return true;
      }

      return beginDrawing(event, domElement);
    },
    [beginDrawing, performHoverHitTest]
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent) => {
      if (!isDrawToolActiveRef.current && !previewStateRef.current) {
        return false;
      }
      if (!previewStateRef.current) {
        return false;
      }
      return updateDrawing(event);
    },
    [updateDrawing]
  );

  const handlePointerUp = useCallback(
    (event: PointerEvent, domElement: HTMLCanvasElement) => endDrawing(event, domElement),
    [endDrawing]
  );

  const handlePointerLeave = useCallback(
    (_event: PointerEvent | undefined, _domElement: HTMLCanvasElement | null) => {
      const session = previewStateRef.current;
      if (!session) {
        return false;
      }
      session.isValid = false;
      syncRoiResources();
      return true;
    },
    [syncRoiResources]
  );

  const disposeRoiResources = useCallback(() => {
    const roiGroup = roiGroupRef.current;
    if (roiGroup) {
      for (const resource of roiLinesRef.current.values()) {
        disposeRoiResource(roiGroup, resource);
      }
    }
    roiLinesRef.current.clear();
    previewStateRef.current = null;
  }, [roiGroupRef, roiLinesRef]);

  return useMemo(
    () => ({
      isDrawToolActiveRef,
      performHoverHitTest,
      updateRoiAppearance,
      handlePointerDown,
      handlePointerMove,
      handlePointerUp,
      handlePointerLeave,
      disposeRoiResources,
      clearPreview,
    }),
    [
      clearPreview,
      disposeRoiResources,
      handlePointerDown,
      handlePointerLeave,
      handlePointerMove,
      handlePointerUp,
      performHoverHitTest,
      updateRoiAppearance,
    ]
  );
}
