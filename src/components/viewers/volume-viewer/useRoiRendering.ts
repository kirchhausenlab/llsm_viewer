import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { MutableRefObject } from 'react';
import * as THREE from 'three';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry';

import type { DesktopViewerCamera } from '../../../hooks/useVolumeRenderSetup';
import type { ViewerLayer } from '../VolumeViewer.types';
import type { RoiRenderResource, ViewerRoiConfig } from '../VolumeViewer.types';
import type { RoiDefinition, RoiDimensionMode, RoiPoint, RoiShape, SavedRoi } from '../../../types/roi';
import { cloneRoiDefinition } from '../../../types/roi';
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
  cameraRef: MutableRefObject<DesktopViewerCamera | null>;
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

type MoveSession = {
  pointerId: number;
  roiId: string;
  sourceRoi: RoiDefinition;
  planeZ: number;
  anchorPoint: THREE.Vector3;
  originClientX: number;
  originClientY: number;
  previewStart: THREE.Vector3;
  previewEnd: THREE.Vector3;
  offsetX: number;
  offsetY: number;
  hasMoved: boolean;
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

type RoiBlOcclusionUniforms = {
  roiBlOcclusionEnabled: { value: number };
  roiBlAlphaTexture: { value: THREE.Texture };
  roiBlDepthTexture: { value: THREE.Texture };
  roiBlViewport: { value: THREE.Vector2 };
  roiBlDepthBias: { value: number };
};

const ROI_LINE_WIDTH = 2;
const ROI_BASE_OPACITY = 0.92;
const ROI_WORKING_KEY = 'roi:working';
const LINE_RAYCAST_THRESHOLD = 0.02;
const ROI_DRAG_START_DISTANCE_PX = 3;
const tempPointer = new THREE.Vector2();
const tempInverseMatrix = new THREE.Matrix4();
const tempLocalRay = new THREE.Ray();
const tempRaycaster = new THREE.Raycaster();
const tempDragPoint = new THREE.Vector3();
const ROI_BL_OCCLUSION_SHADER_KEY = 'roi-bl-occlusion-v1';
const ROI_BL_OCCLUSION_ALPHA_FALLBACK_TEXTURE = (() => {
  const texture = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat);
  texture.type = THREE.UnsignedByteType;
  texture.needsUpdate = true;
  return texture;
})();
const ROI_BL_OCCLUSION_DEPTH_FALLBACK_TEXTURE = (() => {
  const texture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat);
  texture.type = THREE.UnsignedByteType;
  texture.needsUpdate = true;
  return texture;
})();

function isDrawToolActive(roiConfig: ViewerRoiConfig | undefined): boolean {
  return Boolean(roiConfig?.isDrawWindowOpen);
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

function ensureRoiBlOcclusionShader(material: LineMaterial, uniforms: RoiBlOcclusionUniforms): void {
  material.transparent = true;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.roiBlOcclusionEnabled = uniforms.roiBlOcclusionEnabled;
    shader.uniforms.roiBlAlphaTexture = uniforms.roiBlAlphaTexture;
    shader.uniforms.roiBlDepthTexture = uniforms.roiBlDepthTexture;
    shader.uniforms.roiBlViewport = uniforms.roiBlViewport;
    shader.uniforms.roiBlDepthBias = uniforms.roiBlDepthBias;
    shader.fragmentShader = shader.fragmentShader
      .replace(
        'uniform float linewidth;\n',
        'uniform float linewidth;\nuniform float roiBlOcclusionEnabled;\nuniform sampler2D roiBlAlphaTexture;\nuniform sampler2D roiBlDepthTexture;\nuniform vec2 roiBlViewport;\nuniform float roiBlDepthBias;\n'
      )
      .replace(
        'float alpha = opacity;\n',
        `float alpha = opacity;
			if (roiBlOcclusionEnabled > 0.5 && roiBlViewport.x > 0.0 && roiBlViewport.y > 0.0) {
				vec2 roiBlUv = clamp(gl_FragCoord.xy / roiBlViewport, vec2(0.0), vec2(1.0));
				float roiBlFrontDepth = texture2D(roiBlDepthTexture, roiBlUv).r;
				float roiBlAlpha = texture2D(roiBlAlphaTexture, roiBlUv).a;
				if (roiBlAlpha > 1e-4 && roiBlFrontDepth < 0.999999 && gl_FragCoord.z > roiBlFrontDepth + roiBlDepthBias) {
					alpha *= max(0.0, 1.0 - roiBlAlpha);
				}
			}\n`
      );
  };
  material.customProgramCacheKey = () => ROI_BL_OCCLUSION_SHADER_KEY;
  material.needsUpdate = true;
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

function resolveHoveredVoxelPreviewPoint(
  hoveredVoxelRef: UseRoiRenderingParams['hoveredVoxelRef'],
  layersRef: UseRoiRenderingParams['layersRef']
): { point: THREE.Vector3; dimensions: { width: number; height: number; depth: number } } | null {
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
    point: new THREE.Vector3(
      THREE.MathUtils.clamp(hovered.normalizedPosition.x * dimensions.width, 0, dimensions.width - 1),
      THREE.MathUtils.clamp(hovered.normalizedPosition.y * dimensions.height, 0, dimensions.height - 1),
      THREE.MathUtils.clamp(hovered.normalizedPosition.z * dimensions.depth, 0, dimensions.depth - 1),
    ),
    dimensions,
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
  camera: THREE.Camera;
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

function resolvePlanePoint(ray: THREE.Ray, planeZ: number) {
  const denominator = ray.direction.z;
  const parameter = Math.abs(denominator) > 1e-8 ? (planeZ - ray.origin.z) / denominator : 0;
  return tempDragPoint.copy(ray.direction).multiplyScalar(Math.max(0, parameter)).add(ray.origin);
}

function clampRoiTranslationDelta(
  roi: RoiDefinition,
  offsetX: number,
  offsetY: number,
  dimensions: { width: number; height: number; depth: number }
) {
  const minX = Math.min(roi.start.x, roi.end.x);
  const maxX = Math.max(roi.start.x, roi.end.x);
  const minY = Math.min(roi.start.y, roi.end.y);
  const maxY = Math.max(roi.start.y, roi.end.y);
  const maxWidth = Math.max(0, dimensions.width - 1);
  const maxHeight = Math.max(0, dimensions.height - 1);

  return {
    x: THREE.MathUtils.clamp(offsetX, -minX, maxWidth - maxX),
    y: THREE.MathUtils.clamp(offsetY, -minY, maxHeight - maxY),
  };
}

function translateRoiByOffset(roi: RoiDefinition, offsetX: number, offsetY: number) {
  return {
    ...roi,
    start: {
      x: roi.start.x + offsetX,
      y: roi.start.y + offsetY,
      z: roi.start.z,
    },
    end: {
      x: roi.end.x + offsetX,
      y: roi.end.y + offsetY,
      z: roi.end.z,
    },
  };
}

function resolveRoiDragPlaneZ(roi: RoiDefinition) {
  if (roi.mode === '2d') {
    return roi.start.z;
  }
  return (roi.start.z + roi.end.z) / 2;
}

function toPoint3(value: RoiPoint | THREE.Vector3) {
  return {
    x: value.x,
    y: value.y,
    z: value.z,
  };
}

function buildRoiLineGeometry(spec: VisibleRoiSpec): RoiRenderResource['geometry'] {
  const geometry = new LineSegmentsGeometry() as unknown as RoiRenderResource['geometry'];
  const positions = buildRoiSegmentPositions({
    shape: spec.shape,
    mode: spec.mode,
    start: toPoint3(spec.start),
    end: toPoint3(spec.end),
  });
  geometry.setPositions(positions);
  geometry.instanceCount = positions.length / 6;
  return geometry;
}

export function updateRoiResourceGeometry(resource: RoiRenderResource, spec: VisibleRoiSpec) {
  const nextGeometry = buildRoiLineGeometry(spec);
  resource.line.geometry.dispose();
  resource.line.geometry = nextGeometry;
  resource.geometry = nextGeometry;
  resource.line.computeLineDistances();
}

function buildVisibleRoiSpecs(
  roiConfig: ViewerRoiConfig | undefined,
  previewState: PreviewState | null,
  moveSession: MoveSession | null
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
  } else if (moveSession?.hasMoved) {
    visible.push({
      key: ROI_WORKING_KEY,
      roiId: ROI_WORKING_KEY,
      shape: moveSession.sourceRoi.shape,
      mode: moveSession.sourceRoi.mode,
      start: moveSession.previewStart,
      end: moveSession.previewEnd,
      color: moveSession.sourceRoi.color,
      isInvalid: false,
      shouldBlink: workingRepresentsActiveSaved,
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
    if ((previewState || moveSession?.hasMoved || roiConfig.workingRoi) && roi.id === roiConfig.editingSavedRoiId) {
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
  rendererRef: UseRoiRenderingParams['rendererRef'],
  blOcclusionUniforms: RoiBlOcclusionUniforms,
): RoiRenderResource {
  const geometry = buildRoiLineGeometry(spec);

  const material = new LineMaterial({
    color: new THREE.Color(spec.color),
    linewidth: ROI_LINE_WIDTH,
    transparent: true,
    opacity: ROI_BASE_OPACITY,
    depthTest: false,
    depthWrite: false,
  });
  setLineMaterialResolution(material, containerRef.current, rendererRef.current);
  ensureRoiBlOcclusionShader(material, blOcclusionUniforms);

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
  const blOcclusionUniformsRef = useRef<RoiBlOcclusionUniforms>({
    roiBlOcclusionEnabled: { value: 0 },
    roiBlAlphaTexture: { value: ROI_BL_OCCLUSION_ALPHA_FALLBACK_TEXTURE },
    roiBlDepthTexture: { value: ROI_BL_OCCLUSION_DEPTH_FALLBACK_TEXTURE },
    roiBlViewport: { value: new THREE.Vector2(1, 1) },
    roiBlDepthBias: { value: 0.0005 },
  });
  const roiConfigRef = useRef(roiConfig);
  roiConfigRef.current = roiConfig;
  const previewStateRef = useRef<PreviewState | null>(null);
  const isDrawToolActiveRef = useRef(isDrawToolActive(roiConfig));
  isDrawToolActiveRef.current = isDrawToolActive(roiConfig);
  const moveSessionRef = useRef<MoveSession | null>(null);
  const isDrawPreviewActiveRef = useRef(false);
  const isRoiMoveInteractionActiveRef = useRef(false);
  const isRoiMoveActiveRef = useRef(false);

  const syncRoiResources = useCallback(() => {
    const roiGroup = roiGroupRef.current;
    if (!roiGroup) {
      return;
    }

    const visibleSpecs = buildVisibleRoiSpecs(roiConfigRef.current, previewStateRef.current, moveSessionRef.current);
    const nextKeys = new Set<string>();

    for (const spec of visibleSpecs) {
      nextKeys.add(spec.key);
      let resource = roiLinesRef.current.get(spec.key);
      if (!resource) {
        resource = createRoiResource(spec, containerRef, rendererRef, blOcclusionUniformsRef.current);
        roiGroup.add(resource.line);
        roiLinesRef.current.set(spec.key, resource);
      } else {
        updateRoiResourceGeometry(resource, spec);
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
    moveSessionRef.current = null;
    isDrawPreviewActiveRef.current = false;
    isRoiMoveInteractionActiveRef.current = false;
    isRoiMoveActiveRef.current = false;
    syncRoiResources();
  }, [syncRoiResources]);

  useEffect(() => {
    syncRoiResources();
  }, [renderContextRevision, roiConfig, syncRoiResources]);

  useEffect(() => {
    if (isDrawToolActive(roiConfig)) {
      return;
    }
    if (previewStateRef.current || moveSessionRef.current) {
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

  const setBlOcclusionState = useCallback(
    ({
      enabled,
      alphaTexture,
      depthTexture,
      viewport,
    }: {
      enabled: boolean;
      alphaTexture?: THREE.Texture | null;
      depthTexture?: THREE.Texture | null;
      viewport?: { width: number; height: number } | null;
    }) => {
      blOcclusionUniformsRef.current.roiBlOcclusionEnabled.value = enabled ? 1 : 0;
      blOcclusionUniformsRef.current.roiBlAlphaTexture.value =
        alphaTexture ?? ROI_BL_OCCLUSION_ALPHA_FALLBACK_TEXTURE;
      blOcclusionUniformsRef.current.roiBlDepthTexture.value =
        depthTexture ?? ROI_BL_OCCLUSION_DEPTH_FALLBACK_TEXTURE;
      const viewportWidth = viewport?.width ?? 1;
      const viewportHeight = viewport?.height ?? 1;
      blOcclusionUniformsRef.current.roiBlViewport.value.set(
        Math.max(1, viewportWidth),
        Math.max(1, viewportHeight)
      );
    },
    []
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

  const resolveSourceRoi = useCallback((roiId: string, config: ViewerRoiConfig) => {
    if (roiId === ROI_WORKING_KEY) {
      return config.workingRoi ? cloneRoiDefinition(config.workingRoi) : null;
    }

    const savedRoi = config.savedRois.find((roi) => roi.id === roiId);
    return savedRoi ? cloneRoiDefinition(savedRoi) : null;
  }, []);

  const beginMoveInteraction = useCallback(
    (event: PointerEvent, domElement: HTMLCanvasElement, roiId: string) => {
      const config = roiConfigRef.current;
      const renderer = rendererRef.current;
      const camera = cameraRef.current;
      const volumeRootGroup = volumeRootGroupRef.current;
      const dimensions = currentDimensionsRef.current;
      if (!config || !renderer || !camera || !volumeRootGroup || !dimensions) {
        return false;
      }

      const sourceRoi = resolveSourceRoi(roiId, config);
      if (!sourceRoi) {
        return false;
      }

      if (roiId !== ROI_WORKING_KEY) {
        config.onSavedRoiActivate(roiId);
      }

      const localRay = resolveLocalRay({ event, renderer, camera, volumeRootGroup });
      if (!localRay) {
        return true;
      }

      const planeZ = resolveRoiDragPlaneZ(sourceRoi);
      const anchorPoint = resolvePlanePoint(localRay, planeZ).clone();
      moveSessionRef.current = {
        pointerId: event.pointerId,
        roiId,
        sourceRoi,
        planeZ,
        anchorPoint,
        originClientX: event.clientX,
        originClientY: event.clientY,
        previewStart: new THREE.Vector3(sourceRoi.start.x, sourceRoi.start.y, sourceRoi.start.z),
        previewEnd: new THREE.Vector3(sourceRoi.end.x, sourceRoi.end.y, sourceRoi.end.z),
        offsetX: 0,
        offsetY: 0,
        hasMoved: false,
      };
      isDrawPreviewActiveRef.current = true;
      isRoiMoveInteractionActiveRef.current = true;
      isRoiMoveActiveRef.current = false;

      try {
        domElement.setPointerCapture(event.pointerId);
      } catch {
        // Ignore capture failures on unsupported platforms.
      }

      return true;
    },
    [cameraRef, currentDimensionsRef, rendererRef, resolveSourceRoi, volumeRootGroupRef]
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

      let committedStart: RoiPoint | null = null;
      let previewStart: THREE.Vector3 | null = null;
      let previewEnd: THREE.Vector3 | null = null;
      let previewValid = false;
      let lockedMode: RoiDimensionMode = config.dimensionMode;

      if (config.dimensionMode === '3d') {
        const hoveredPreview = resolveHoveredVoxelPreviewPoint(hoveredVoxelRef, layersRef);
        if (!hoveredPreview) {
          return true;
        }
        committedStart = {
          x: THREE.MathUtils.clamp(Math.round(hoveredPreview.point.x), 0, hoveredPreview.dimensions.width - 1),
          y: THREE.MathUtils.clamp(Math.round(hoveredPreview.point.y), 0, hoveredPreview.dimensions.height - 1),
          z: THREE.MathUtils.clamp(Math.round(hoveredPreview.point.z), 0, hoveredPreview.dimensions.depth - 1),
        };
        previewStart = hoveredPreview.point.clone();
        previewEnd = hoveredPreview.point.clone();
        previewValid = true;
      } else {
        const localRay = resolveLocalRay({ event, renderer, camera, volumeRootGroup });
        const bounds = resolveVolumeBounds(dimensions);
        if (!localRay || !bounds) {
          return true;
        }
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
        shape: config.tool,
        mode: lockedMode,
        color: config.defaultColor,
        committedStart,
        committedEnd: { ...committedStart },
        previewStart,
        previewEnd,
        isValid: previewValid,
      };
      isDrawPreviewActiveRef.current = true;
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

      if (session.mode === '3d') {
        const hoveredPreview = resolveHoveredVoxelPreviewPoint(hoveredVoxelRef, layersRef);
        session.isValid = hoveredPreview !== null;
        if (hoveredPreview) {
          session.previewEnd.copy(hoveredPreview.point);
          session.committedEnd = {
            x: THREE.MathUtils.clamp(Math.round(hoveredPreview.point.x), 0, hoveredPreview.dimensions.width - 1),
            y: THREE.MathUtils.clamp(Math.round(hoveredPreview.point.y), 0, hoveredPreview.dimensions.height - 1),
            z: THREE.MathUtils.clamp(Math.round(hoveredPreview.point.z), 0, hoveredPreview.dimensions.depth - 1),
          };
        }
      } else {
        const localRay = resolveLocalRay({ event, renderer, camera, volumeRootGroup });
        const bounds = resolveVolumeBounds(dimensions);
        if (!localRay || !bounds) {
          return true;
        }
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

  const updateMoveInteraction = useCallback(
    (event: PointerEvent) => {
      const session = moveSessionRef.current;
      const renderer = rendererRef.current;
      const camera = cameraRef.current;
      const volumeRootGroup = volumeRootGroupRef.current;
      const dimensions = currentDimensionsRef.current;
      if (!session || session.pointerId !== event.pointerId || !renderer || !camera || !volumeRootGroup || !dimensions) {
        return false;
      }

      const distance = Math.hypot(event.clientX - session.originClientX, event.clientY - session.originClientY);
      if (!session.hasMoved && distance < ROI_DRAG_START_DISTANCE_PX) {
        return true;
      }

      const localRay = resolveLocalRay({ event, renderer, camera, volumeRootGroup });
      if (!localRay) {
        return true;
      }

      const dragPoint = resolvePlanePoint(localRay, session.planeZ);
      const clampedOffset = clampRoiTranslationDelta(
        session.sourceRoi,
        dragPoint.x - session.anchorPoint.x,
        dragPoint.y - session.anchorPoint.y,
        dimensions
      );

      session.offsetX = clampedOffset.x;
      session.offsetY = clampedOffset.y;
      session.previewStart.set(
        session.sourceRoi.start.x + clampedOffset.x,
        session.sourceRoi.start.y + clampedOffset.y,
        session.sourceRoi.start.z,
      );
      session.previewEnd.set(
        session.sourceRoi.end.x + clampedOffset.x,
        session.sourceRoi.end.y + clampedOffset.y,
        session.sourceRoi.end.z,
      );
      session.hasMoved = true;
      isRoiMoveActiveRef.current = true;
      syncRoiResources();
      return true;
    },
    [cameraRef, currentDimensionsRef, rendererRef, syncRoiResources, volumeRootGroupRef]
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
      isDrawPreviewActiveRef.current = false;
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

  const endMoveInteraction = useCallback(
    (event: PointerEvent | undefined, domElement: HTMLCanvasElement | null) => {
      const session = moveSessionRef.current;
      const dimensions = currentDimensionsRef.current;
      if (!session) {
        return false;
      }

      if (event && session.pointerId !== event.pointerId) {
        return false;
      }

      if (session.hasMoved && dimensions) {
        const roundedOffset = clampRoiTranslationDelta(
          session.sourceRoi,
          Math.round(session.offsetX),
          Math.round(session.offsetY),
          dimensions
        );
        commitPreviewRoi(translateRoiByOffset(session.sourceRoi, roundedOffset.x, roundedOffset.y));
      }

      moveSessionRef.current = null;
      isDrawPreviewActiveRef.current = false;
      isRoiMoveInteractionActiveRef.current = false;
      isRoiMoveActiveRef.current = false;
      syncRoiResources();

      if (event && domElement && domElement.hasPointerCapture(event.pointerId)) {
        try {
          domElement.releasePointerCapture(event.pointerId);
        } catch {
          // Ignore.
        }
      }

      return true;
    },
    [commitPreviewRoi, currentDimensionsRef, syncRoiResources]
  );

  const handlePointerDown = useCallback(
    (event: PointerEvent, domElement: HTMLCanvasElement) => {
      if (!isDrawToolActiveRef.current) {
        return false;
      }

      const hitRoiId = performHoverHitTest(event);
      if (hitRoiId) {
        return beginMoveInteraction(event, domElement, hitRoiId);
      }

      return beginDrawing(event, domElement);
    },
    [beginDrawing, beginMoveInteraction, performHoverHitTest]
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent) => {
      if (!isDrawToolActiveRef.current && !previewStateRef.current && !moveSessionRef.current) {
        return false;
      }
      if (moveSessionRef.current) {
        return updateMoveInteraction(event);
      }
      if (!previewStateRef.current) {
        return false;
      }
      return updateDrawing(event);
    },
    [updateDrawing, updateMoveInteraction]
  );

  const handlePointerUp = useCallback(
    (event: PointerEvent, domElement: HTMLCanvasElement) => {
      if (moveSessionRef.current) {
        return endMoveInteraction(event, domElement);
      }
      return endDrawing(event, domElement);
    },
    [endDrawing, endMoveInteraction]
  );

  const handlePointerLeave = useCallback(
    (_event: PointerEvent | undefined, _domElement: HTMLCanvasElement | null) => {
      if (moveSessionRef.current) {
        return true;
      }
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
    moveSessionRef.current = null;
    isDrawPreviewActiveRef.current = false;
    isRoiMoveInteractionActiveRef.current = false;
    isRoiMoveActiveRef.current = false;
  }, [roiGroupRef, roiLinesRef]);

  return useMemo(
    () => ({
      isDrawToolActiveRef,
      isDrawPreviewActiveRef,
      isRoiMoveInteractionActiveRef,
      isRoiMoveActiveRef,
      performHoverHitTest,
      updateRoiAppearance,
      setBlOcclusionState,
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
      isDrawPreviewActiveRef,
      isRoiMoveActiveRef,
      isRoiMoveInteractionActiveRef,
      performHoverHitTest,
      updateRoiAppearance,
      setBlOcclusionState,
    ]
  );
}
