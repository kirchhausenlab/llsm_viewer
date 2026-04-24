import { useCallback, useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import * as THREE from 'three';

import type { DesktopViewerCamera } from '../../../hooks/useVolumeRenderSetup';
import type { ViewerPropsConfig } from '../VolumeViewer.types';
import type { ViewerProp } from '../../../types/viewerProps';
import {
  isViewerPropVisibleAtTimepoint,
  resolveViewerPropDisplayText,
  resolveViewerPropScalebarInfo,
  resolveViewerPropTypefaceStack,
} from '../viewer-shell/viewerPropDefaults';

type WorldPropTextureLayout = {
  worldWidth: number;
  worldHeight: number;
};

type WorldPropCanvasResource = {
  texture: THREE.CanvasTexture;
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  signature: string | null;
  layout: WorldPropTextureLayout;
};

type WorldPropScalebarResource = {
  barMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  labelMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  label: WorldPropCanvasResource;
};

type WorldPropResource = WorldPropCanvasResource & {
  kind: 'text' | 'scalebar';
  group: THREE.Group;
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  outline: THREE.LineLoop<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  scalebar: WorldPropScalebarResource | null;
};

type UseViewerPropsRenderingParams = {
  viewerPropsConfig?: ViewerPropsConfig;
  renderContextRevision: number;
  volumeRootGroupRef: MutableRefObject<THREE.Group | null>;
  rendererRef: MutableRefObject<THREE.WebGLRenderer | null>;
  cameraRef: MutableRefObject<DesktopViewerCamera | null>;
  hoverRaycasterRef: MutableRefObject<THREE.Raycaster | null>;
};

const WORLD_OUTLINE_COLOR = new THREE.Color(0xff5b5b);
const SELECTED_OUTLINE_COLOR = new THREE.Color(0xf7de6f);
const TEXTURE_BASE_FONT_SIZE = 200;
const TEXTURE_MAX_DIMENSION = 1024;
const TEXTURE_MIN_DIMENSION = 256;
const LOCAL_FORWARD_AXIS = new THREE.Vector3(0, 0, 1);

const scratchPointer = new THREE.Vector2();
const scratchCameraQuaternion = new THREE.Quaternion();
const scratchParentQuaternion = new THREE.Quaternion();
const scratchRollQuaternion = new THREE.Quaternion();
const scratchEuler = new THREE.Euler();
const scratchLocalRay = new THREE.Ray();
const scratchInverseMatrix = new THREE.Matrix4();
const scratchDragPlane = new THREE.Plane();
const scratchDragPoint = new THREE.Vector3();

function createOutlineGeometry() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [
        -0.5, -0.5, 0,
        0.5, -0.5, 0,
        0.5, 0.5, 0,
        -0.5, 0.5, 0,
      ],
      3
    )
  );
  return geometry;
}

function resolveTextLines(text: string): string[] {
  if (!text) {
    return [' '];
  }
  return text.split('\n').map((line) => (line.length > 0 ? line : ' '));
}

function resolveCanvasFont(prop: ViewerProp, fontSize: number, fontStack: string): string {
  return `${prop.italic ? 'italic ' : ''}${prop.bold ? '900 ' : '400 '}${fontSize}px ${fontStack}`;
}

function clearWorldPropCanvas(resource: WorldPropCanvasResource) {
  const { canvas, context, texture } = resource;
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.globalAlpha = 1;
  context.globalCompositeOperation = 'source-over';
  context.clearRect(0, 0, canvas.width, canvas.height);
  texture.needsUpdate = true;
}

function resizeWorldPropCanvas(resource: WorldPropCanvasResource, width: number, height: number) {
  const { canvas, context } = resource;
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.globalAlpha = 1;
  context.globalCompositeOperation = 'source-over';
  context.clearRect(0, 0, canvas.width, canvas.height);
}

function measureCurrentFontText(context: CanvasRenderingContext2D, text: string) {
  const metrics = context.measureText(text);
  const measuredHeight = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
  return {
    width: Math.max(1, metrics.width),
    height: Number.isFinite(measuredHeight) && measuredHeight > 0 ? measuredHeight : TEXTURE_BASE_FONT_SIZE,
  };
}

function drawWorldTextPropTexture(
  resource: WorldPropCanvasResource,
  prop: ViewerProp,
  text: string
): WorldPropTextureLayout {
  const signature = `text__${text}__${prop.color}__${prop.world.fontSize}__${prop.typeface}__${prop.bold}__${prop.italic}__${prop.underline}`;
  if (resource.signature === signature) {
    return resource.layout;
  }

  resource.signature = signature;
  const { canvas, context, texture } = resource;
  const lines = resolveTextLines(text);
  const lineHeightPx = TEXTURE_BASE_FONT_SIZE * 1.18;
  const paddingXPx = TEXTURE_BASE_FONT_SIZE * 0.75;
  const paddingYPx = TEXTURE_BASE_FONT_SIZE * 0.55;

  const fontStack = resolveViewerPropTypefaceStack(prop.typeface);
  context.font = resolveCanvasFont(prop, TEXTURE_BASE_FONT_SIZE, fontStack);
  const maxLineWidthPx = Math.max(
    1,
    ...lines.map((line) => Math.max(1, context.measureText(line).width))
  );
  const layoutWidthPx = maxLineWidthPx + paddingXPx * 2;
  const layoutHeightPx = lineHeightPx * lines.length + paddingYPx * 2;

  const aspect = layoutWidthPx / layoutHeightPx;
  const nextCanvasWidth =
    aspect >= 1
      ? TEXTURE_MAX_DIMENSION
      : clampTextureDimension(TEXTURE_MAX_DIMENSION * aspect);
  const nextCanvasHeight =
    aspect >= 1
      ? clampTextureDimension(TEXTURE_MAX_DIMENSION / aspect)
      : TEXTURE_MAX_DIMENSION;

  resizeWorldPropCanvas(resource, nextCanvasWidth, nextCanvasHeight);

  const drawPaddingX = canvas.width * 0.1;
  const drawPaddingY = canvas.height * 0.12;
  const scale = Math.min(
    (canvas.width - drawPaddingX * 2) / layoutWidthPx,
    (canvas.height - drawPaddingY * 2) / layoutHeightPx
  );
  const fontSize = Math.max(24, Math.floor(TEXTURE_BASE_FONT_SIZE * scale));
  const drawLineHeight = fontSize * 1.18;
  const startY = canvas.height / 2 - ((lines.length - 1) * drawLineHeight) / 2;

  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = prop.color;
  context.strokeStyle = prop.color;
  context.font = resolveCanvasFont(prop, fontSize, fontStack);

  lines.forEach((line, index) => {
    const baselineY = startY + index * drawLineHeight;
    context.fillText(line, canvas.width / 2, baselineY);
    if (!prop.underline) {
      return;
    }

    const underlineWidth = Math.max(1, context.measureText(line).width);
    const underlineY = baselineY + fontSize * 0.46;
    context.lineWidth = Math.max(2, fontSize * 0.06);
    context.beginPath();
    context.moveTo(canvas.width / 2 - underlineWidth / 2, underlineY);
    context.lineTo(canvas.width / 2 + underlineWidth / 2, underlineY);
    context.stroke();
  });

  texture.needsUpdate = true;
  resource.layout = {
    worldWidth: Math.max(0.1, (layoutWidthPx / TEXTURE_BASE_FONT_SIZE) * prop.world.fontSize),
    worldHeight: Math.max(0.1, (layoutHeightPx / TEXTURE_BASE_FONT_SIZE) * prop.world.fontSize),
  };
  return resource.layout;
}

function drawWorldScalebarLabelTexture(
  resource: WorldPropCanvasResource,
  prop: ViewerProp,
  text: string,
  targetTextHeightWorld: number
): WorldPropTextureLayout {
  const signature = [
    'scalebar-label',
    text,
    targetTextHeightWorld,
    prop.color,
    prop.typeface,
    prop.bold,
    prop.italic,
    prop.underline,
  ].join('__');
  if (resource.signature === signature) {
    return resource.layout;
  }

  resource.signature = signature;
  const { canvas, context, texture } = resource;
  const fontStack = resolveViewerPropTypefaceStack(prop.typeface);
  const baseFontSize = TEXTURE_BASE_FONT_SIZE;
  context.font = resolveCanvasFont(prop, baseFontSize, fontStack);
  const baseTextMetrics = measureCurrentFontText(context, text);
  const textPaddingXPx = baseFontSize * 0.3;
  const layoutWidthPx = baseTextMetrics.width + textPaddingXPx * 2;
  const layoutHeightPx = Math.max(1, baseTextMetrics.height);
  const aspect = layoutWidthPx / layoutHeightPx;
  const nextCanvasWidth =
    aspect >= 1
      ? TEXTURE_MAX_DIMENSION
      : clampTextureDimension(TEXTURE_MAX_DIMENSION * aspect);
  const nextCanvasHeight =
    aspect >= 1
      ? clampTextureDimension(TEXTURE_MAX_DIMENSION / aspect)
      : TEXTURE_MAX_DIMENSION;

  resizeWorldPropCanvas(resource, nextCanvasWidth, nextCanvasHeight);

  const nextAspect = canvas.width / canvas.height;
  const worldHeight = Math.max(0.1, targetTextHeightWorld);
  const worldWidth = Math.max(0.1, worldHeight * nextAspect);
  const drawPaddingX = canvas.width * 0.08;
  const targetTextHeightPx = canvas.height * 0.8;
  const fontSize = Math.max(
    24,
    Math.floor(baseFontSize * (targetTextHeightPx / Math.max(1, baseTextMetrics.height)))
  );
  context.font = resolveCanvasFont(prop, fontSize, fontStack);
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = prop.color;
  context.strokeStyle = prop.color;

  const finalMetrics = measureCurrentFontText(context, text);
  const horizontalCompression = Math.min(
    1,
    (canvas.width - drawPaddingX * 2) / Math.max(1, finalMetrics.width)
  );
  context.save();
  context.translate(canvas.width / 2, canvas.height / 2);
  context.scale(horizontalCompression, 1);
  context.fillText(text, 0, 0);
  if (prop.underline) {
    const underlineY = fontSize * 0.46;
    context.lineWidth = Math.max(2, fontSize * 0.06);
    context.beginPath();
    context.moveTo(-finalMetrics.width / 2, underlineY);
    context.lineTo(finalMetrics.width / 2, underlineY);
    context.stroke();
  }
  context.restore();

  texture.needsUpdate = true;
  resource.layout = {
    worldWidth,
    worldHeight,
  };
  return resource.layout;
}

function applyChildMeshBox(
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>,
  bounds: { centerX: number; centerY: number; width: number; height: number },
  containerWidth: number,
  containerHeight: number
) {
  mesh.position.set(bounds.centerX / containerWidth, bounds.centerY / containerHeight, 0);
  mesh.scale.set(bounds.width / containerWidth, bounds.height / containerHeight, 1);
}

function drawWorldScalebarTexture(
  resource: WorldPropResource,
  prop: ViewerProp,
  viewerPropsConfig: ViewerPropsConfig | undefined
): WorldPropTextureLayout | null {
  const scalebarInfo = resolveViewerPropScalebarInfo(
    prop,
    viewerPropsConfig?.voxelResolution ?? null
  );
  if (!scalebarInfo?.isRenderable) {
    resource.signature = null;
    if (resource.scalebar) {
      resource.scalebar.label.signature = null;
      clearWorldPropCanvas(resource.scalebar.label);
      resource.scalebar.barMesh.visible = false;
      resource.scalebar.labelMesh.visible = false;
    }
    return null;
  }

  const scalebar = resource.scalebar;
  if (!scalebar) {
    return null;
  }

  clearWorldPropCanvas(resource);

  const barWidthWorld = scalebarInfo.voxelLength;
  const barHeightWorld = Math.max(1, prop.world.fontSize);
  const showText = prop.scalebar.showText;
  const textPlacement = prop.scalebar.textPlacement;
  const textGapWorld = showText ? Math.max(0.5, barHeightWorld * 0.35) : 0;
  const paddingXWorld = Math.max(0.35, barHeightWorld * 0.2);
  const paddingYWorld = Math.max(0.35, barHeightWorld * 0.2);
  const labelLayout = showText
    ? drawWorldScalebarLabelTexture(
        scalebar.label,
        prop,
        scalebarInfo.label,
        barHeightWorld
      )
    : null;
  if (!showText) {
    scalebar.label.signature = null;
    clearWorldPropCanvas(scalebar.label);
  }

  let contentWidthWorld = barWidthWorld;
  let contentHeightWorld = barHeightWorld;
  if (showText) {
    if (textPlacement === 'right') {
      contentWidthWorld = barWidthWorld + textGapWorld + labelLayout!.worldWidth;
      contentHeightWorld = Math.max(barHeightWorld, labelLayout!.worldHeight);
    } else {
      contentWidthWorld = Math.max(barWidthWorld, labelLayout!.worldWidth);
      contentHeightWorld = barHeightWorld + textGapWorld + labelLayout!.worldHeight;
    }
  }

  const worldWidth = contentWidthWorld + paddingXWorld * 2;
  const worldHeight = contentHeightWorld + paddingYWorld * 2;
  resource.signature = [
    'scalebar',
    prop.scalebar.axis,
    prop.scalebar.length,
    prop.scalebar.unit,
    prop.color,
    prop.world.fontSize,
    showText,
    textPlacement,
    labelLayout?.worldWidth ?? 0,
    labelLayout?.worldHeight ?? 0,
  ].join('__');

  const leftEdge = -worldWidth / 2;
  const topEdge = worldHeight / 2;
  const contentLeft = leftEdge + paddingXWorld;
  const contentTop = topEdge - paddingYWorld;

  let barBounds = {
    centerX: contentLeft + barWidthWorld / 2,
    centerY: 0,
    width: barWidthWorld,
    height: barHeightWorld,
  };
  let labelBounds: { centerX: number; centerY: number; width: number; height: number } | null = null;

  if (!showText || !labelLayout) {
    barBounds.centerY = contentTop - contentHeightWorld / 2;
  } else if (textPlacement === 'right') {
    barBounds.centerY = contentTop - contentHeightWorld / 2;
    labelBounds = {
      centerX: contentLeft + barWidthWorld + textGapWorld + labelLayout.worldWidth / 2,
      centerY: contentTop - contentHeightWorld / 2,
      width: labelLayout.worldWidth,
      height: labelLayout.worldHeight,
    };
  } else if (textPlacement === 'above') {
    barBounds = {
      centerX: contentLeft + contentWidthWorld / 2,
      centerY:
        contentTop - labelLayout.worldHeight - textGapWorld - barHeightWorld / 2,
      width: barWidthWorld,
      height: barHeightWorld,
    };
    labelBounds = {
      centerX: contentLeft + contentWidthWorld / 2,
      centerY: contentTop - labelLayout.worldHeight / 2,
      width: labelLayout.worldWidth,
      height: labelLayout.worldHeight,
    };
  } else {
    barBounds = {
      centerX: contentLeft + contentWidthWorld / 2,
      centerY: contentTop - barHeightWorld / 2,
      width: barWidthWorld,
      height: barHeightWorld,
    };
    labelBounds = {
      centerX: contentLeft + contentWidthWorld / 2,
      centerY:
        contentTop - barHeightWorld - textGapWorld - labelLayout.worldHeight / 2,
      width: labelLayout.worldWidth,
      height: labelLayout.worldHeight,
    };
  }

  scalebar.barMesh.material.color.set(prop.color);
  applyChildMeshBox(scalebar.barMesh, barBounds, worldWidth, worldHeight);
  if (labelBounds) {
    applyChildMeshBox(scalebar.labelMesh, labelBounds, worldWidth, worldHeight);
  }

  resource.layout = {
    worldWidth: Math.max(0.1, worldWidth),
    worldHeight: Math.max(0.1, worldHeight),
  };
  return resource.layout;
}

function clampTextureDimension(value: number) {
  return Math.max(TEXTURE_MIN_DIMENSION, Math.min(TEXTURE_MAX_DIMENSION, Math.round(value)));
}

function resolveWorldPropKind(prop: ViewerProp): WorldPropResource['kind'] {
  return prop.type === 'scalebar' ? 'scalebar' : 'text';
}

function updatePointerRay(
  event: PointerEvent,
  renderer: THREE.WebGLRenderer,
  camera: THREE.Camera,
  raycaster: THREE.Raycaster
) {
  const rect = renderer.domElement.getBoundingClientRect();
  if (!(rect.width > 0) || !(rect.height > 0)) {
    return false;
  }

  scratchPointer.set(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1
  );
  raycaster.setFromCamera(scratchPointer, camera);
  return true;
}

function resolveWorldPropDragPosition(
  resource: WorldPropResource,
  raycaster: THREE.Raycaster
): { x: number; y: number } | null {
  const parent = resource.group.parent;
  if (!parent) {
    return null;
  }

  scratchInverseMatrix.copy(parent.matrixWorld).invert();
  scratchLocalRay.copy(raycaster.ray).applyMatrix4(scratchInverseMatrix);
  scratchDragPlane.setComponents(0, 0, 1, -resource.group.position.z);
  const hit = scratchLocalRay.intersectPlane(scratchDragPlane, scratchDragPoint);
  if (!hit) {
    return null;
  }

  return {
    x: hit.x,
    y: hit.y,
  };
}

function applyFixedTransform(resource: WorldPropResource, prop: ViewerProp) {
  scratchEuler.set(
    THREE.MathUtils.degToRad(prop.world.pitch),
    THREE.MathUtils.degToRad(prop.world.yaw),
    THREE.MathUtils.degToRad(prop.world.roll),
    'YXZ'
  );
  resource.group.quaternion.setFromEuler(scratchEuler);
}

function applyBillboardTransform(resource: WorldPropResource, camera: THREE.Camera, rollDegrees: number) {
  const parent = resource.group.parent;
  if (!parent) {
    return;
  }

  camera.getWorldQuaternion(scratchCameraQuaternion);
  parent.getWorldQuaternion(scratchParentQuaternion);
  scratchParentQuaternion.invert();
  resource.group.quaternion.copy(scratchParentQuaternion.multiply(scratchCameraQuaternion));
  scratchRollQuaternion.setFromAxisAngle(
    LOCAL_FORWARD_AXIS,
    THREE.MathUtils.degToRad(rollDegrees)
  );
  resource.group.quaternion.multiply(scratchRollQuaternion);
}

function disposeWorldPropResource(resource: WorldPropResource) {
  if (resource.group.parent) {
    resource.group.parent.remove(resource.group);
  }
  if (resource.scalebar) {
    resource.scalebar.barMesh.geometry.dispose();
    resource.scalebar.barMesh.material.dispose();
    resource.scalebar.labelMesh.geometry.dispose();
    resource.scalebar.labelMesh.material.dispose();
    resource.scalebar.label.texture.dispose();
  }
  resource.mesh.geometry.dispose();
  resource.mesh.material.dispose();
  resource.outline.geometry.dispose();
  resource.outline.material.dispose();
  resource.texture.dispose();
}

function refreshWorldPropResource(
  resource: WorldPropResource,
  prop: ViewerProp,
  viewerPropsConfig: ViewerPropsConfig | undefined,
  camera: THREE.Camera | null
) {
  const layout =
    prop.type === 'scalebar'
      ? drawWorldScalebarTexture(resource, prop, viewerPropsConfig)
      : drawWorldTextPropTexture(
          resource,
          prop,
          resolveViewerPropDisplayText(
            prop,
            viewerPropsConfig?.currentTimepoint ?? 1,
            viewerPropsConfig?.totalTimepoints ?? 1,
            viewerPropsConfig?.temporalResolution ?? null
          )
        );
  if (!layout) {
    clearWorldPropCanvas(resource);
    resource.layout = { worldWidth: 1, worldHeight: 1 };
    resource.mesh.visible = false;
    resource.outline.visible = false;
    if (resource.scalebar) {
      resource.scalebar.barMesh.visible = false;
      resource.scalebar.labelMesh.visible = false;
    }
    return;
  }
  const isVisibleAtCurrentTimepoint = isViewerPropVisibleAtTimepoint(
    prop,
    viewerPropsConfig?.currentTimepoint ?? 1,
    viewerPropsConfig?.totalTimepoints ?? 1
  );
  const shouldShowContent = prop.visible && isVisibleAtCurrentTimepoint;
  const shouldShowEditingOutline = Boolean(viewerPropsConfig?.isEditing);
  const flipY =
    prop.world.facingMode === 'billboard'
      ? prop.world.flipY
        ? 1
        : -1
      : prop.world.flipY
        ? -1
        : 1;

  resource.group.position.set(prop.world.x, prop.world.y, prop.world.z);
  resource.group.scale.set(
    layout.worldWidth * (prop.world.flipX ? -1 : 1),
    layout.worldHeight * flipY,
    prop.world.flipZ ? -1 : 1
  );

  if (prop.world.facingMode === 'fixed') {
    applyFixedTransform(resource, prop);
  } else if (camera) {
    applyBillboardTransform(resource, camera, prop.world.roll);
  }

  resource.mesh.visible =
    prop.type === 'scalebar'
      ? shouldShowEditingOutline
      : shouldShowContent || shouldShowEditingOutline;
  resource.outline.visible = shouldShowEditingOutline;
  resource.mesh.renderOrder = 29;
  resource.outline.renderOrder = 31;
  resource.mesh.material.depthTest = false;
  resource.outline.material.depthTest = false;
  resource.mesh.material.opacity = prop.type === 'scalebar' ? 0 : shouldShowContent ? 1 : 0;
  resource.outline.material.opacity = viewerPropsConfig?.isEditing ? 0.95 : 0;
  resource.outline.material.color.copy(
    prop.id === viewerPropsConfig?.selectedPropId ? SELECTED_OUTLINE_COLOR : WORLD_OUTLINE_COLOR
  );
  if (resource.scalebar) {
    resource.scalebar.barMesh.visible = shouldShowContent;
    resource.scalebar.barMesh.renderOrder = 30;
    resource.scalebar.barMesh.material.depthTest = false;
    resource.scalebar.barMesh.material.opacity = shouldShowContent ? 1 : 0;
    resource.scalebar.labelMesh.visible = shouldShowContent && prop.scalebar.showText;
    resource.scalebar.labelMesh.renderOrder = 30;
    resource.scalebar.labelMesh.material.depthTest = false;
    resource.scalebar.labelMesh.material.opacity =
      shouldShowContent && prop.scalebar.showText ? 1 : 0;
  }
}

export function useViewerPropsRendering({
  viewerPropsConfig,
  renderContextRevision,
  volumeRootGroupRef,
  rendererRef,
  cameraRef,
  hoverRaycasterRef,
}: UseViewerPropsRenderingParams) {
  const propsGroupRef = useRef<THREE.Group | null>(null);
  const resourcesRef = useRef<Map<string, WorldPropResource>>(new Map());
  const viewerPropsConfigRef = useRef(viewerPropsConfig);
  viewerPropsConfigRef.current = viewerPropsConfig;

  const refreshWorldProps = useCallback(() => {
    const currentViewerPropsConfig = viewerPropsConfigRef.current;
    const currentCamera = cameraRef.current;
    const currentProps = currentViewerPropsConfig?.props ?? [];
    const propsById = new Map(
      currentProps
        .filter((prop) => prop.dimension === '3d' && prop.type !== 'timestamp')
        .map((prop) => [prop.id, prop] as const)
    );

    for (const [propId, resource] of resourcesRef.current.entries()) {
      const prop = propsById.get(propId);
      if (!prop) {
        resource.mesh.visible = false;
        resource.outline.visible = false;
        if (resource.scalebar) {
          resource.scalebar.barMesh.visible = false;
          resource.scalebar.labelMesh.visible = false;
        }
        continue;
      }
      refreshWorldPropResource(resource, prop, currentViewerPropsConfig, currentCamera);
    }
  }, [cameraRef]);

  useEffect(() => {
    const volumeRootGroup = volumeRootGroupRef.current;
    if (!volumeRootGroup) {
      return undefined;
    }

    const propsGroup = new THREE.Group();
    propsGroup.name = 'ViewerProps';
    volumeRootGroup.add(propsGroup);
    propsGroupRef.current = propsGroup;

    return () => {
      for (const resource of resourcesRef.current.values()) {
        disposeWorldPropResource(resource);
      }
      resourcesRef.current.clear();
      if (propsGroup.parent) {
        propsGroup.parent.remove(propsGroup);
      }
      if (propsGroupRef.current === propsGroup) {
        propsGroupRef.current = null;
      }
    };
  }, [renderContextRevision, volumeRootGroupRef]);

  useEffect(() => {
    const propsGroup = propsGroupRef.current;
    if (!propsGroup || typeof document === 'undefined') {
      return;
    }

    const activeProps = (viewerPropsConfig?.props ?? []).filter(
      (prop) => prop.dimension === '3d' && prop.type !== 'timestamp'
    );
    const activeIds = new Set(activeProps.map((prop) => prop.id));

    for (const [propId, resource] of resourcesRef.current.entries()) {
      if (!activeIds.has(propId)) {
        disposeWorldPropResource(resource);
        resourcesRef.current.delete(propId);
      }
    }

    for (const prop of activeProps) {
      let resource = resourcesRef.current.get(prop.id);
      const nextKind = resolveWorldPropKind(prop);
      if (resource && resource.kind !== nextKind) {
        disposeWorldPropResource(resource);
        resourcesRef.current.delete(prop.id);
        resource = undefined;
      }
      if (!resource) {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) {
          continue;
        }

        const texture = new THREE.CanvasTexture(canvas);
	        texture.colorSpace = THREE.SRGBColorSpace;
	        texture.minFilter = THREE.LinearFilter;
	        texture.magFilter = THREE.LinearFilter;
	        texture.generateMipmaps = false;

        const mesh = new THREE.Mesh(
          new THREE.PlaneGeometry(1, 1),
          new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: false,
            toneMapped: false,
          })
        );
        mesh.userData.viewerPropId = prop.id;

        const outline = new THREE.LineLoop(
          createOutlineGeometry(),
          new THREE.LineBasicMaterial({
            color: WORLD_OUTLINE_COLOR.clone(),
            transparent: true,
            opacity: 0.95,
            depthWrite: false,
            toneMapped: false,
          })
        );

        const group = new THREE.Group();
        group.name = `ViewerProp:${prop.id}`;
        group.add(mesh);
        let scalebar: WorldPropScalebarResource | null = null;
        if (nextKind === 'scalebar') {
          const barMesh = new THREE.Mesh(
            new THREE.PlaneGeometry(1, 1),
            new THREE.MeshBasicMaterial({
              color: new THREE.Color(prop.color),
              transparent: true,
              side: THREE.DoubleSide,
              depthWrite: false,
              toneMapped: false,
            })
          );

          const labelCanvas = document.createElement('canvas');
          const labelContext = labelCanvas.getContext('2d');
          if (!labelContext) {
            barMesh.geometry.dispose();
            barMesh.material.dispose();
            mesh.geometry.dispose();
            mesh.material.dispose();
            outline.geometry.dispose();
            outline.material.dispose();
            texture.dispose();
            continue;
          }
	          const labelTexture = new THREE.CanvasTexture(labelCanvas);
	          labelTexture.colorSpace = THREE.SRGBColorSpace;
	          labelTexture.minFilter = THREE.LinearFilter;
	          labelTexture.magFilter = THREE.LinearFilter;
	          labelTexture.generateMipmaps = false;
          const labelMesh = new THREE.Mesh(
            new THREE.PlaneGeometry(1, 1),
            new THREE.MeshBasicMaterial({
              map: labelTexture,
              transparent: true,
              side: THREE.DoubleSide,
              depthWrite: false,
              toneMapped: false,
            })
          );
          scalebar = {
            barMesh,
            labelMesh,
            label: {
              texture: labelTexture,
              canvas: labelCanvas,
              context: labelContext,
              signature: null,
              layout: { worldWidth: 1, worldHeight: 1 },
            },
          };
          group.add(barMesh);
          group.add(labelMesh);
        }
        group.add(outline);
        propsGroup.add(group);

        const createdResource: WorldPropResource = {
          kind: nextKind,
          group,
          mesh,
          outline,
          texture,
          canvas,
          context,
          signature: null,
          layout: { worldWidth: 1, worldHeight: 1 },
          scalebar,
        };
        resource = createdResource;
        resourcesRef.current.set(prop.id, createdResource);
      }
    }

    refreshWorldProps();
  }, [
    renderContextRevision,
    refreshWorldProps,
    viewerPropsConfig?.props,
  ]);

  const performPropHitTest = useCallback(
    (event: PointerEvent) => {
      if (!viewerPropsConfig?.isEditing) {
        return null;
      }

      const renderer = rendererRef.current;
      const camera = cameraRef.current;
      const raycaster = hoverRaycasterRef.current;
      if (!renderer || !camera || !raycaster) {
        return null;
      }

      const visibleMeshes = Array.from(resourcesRef.current.values())
        .filter((resource) => resource.mesh.visible)
        .map((resource) => resource.mesh);
      if (visibleMeshes.length === 0) {
        return null;
      }

      if (!updatePointerRay(event, renderer, camera, raycaster)) {
        return null;
      }
      const [hit] = raycaster.intersectObjects(visibleMeshes, false);
      const hitId = hit?.object?.userData?.viewerPropId;
      return typeof hitId === 'string' ? hitId : null;
    },
    [cameraRef, hoverRaycasterRef, rendererRef, viewerPropsConfig?.isEditing]
  );

  const resolvePropDragPosition = useCallback(
    (propId: string, event: PointerEvent) => {
      if (!viewerPropsConfig?.isEditing) {
        return null;
      }

      const resource = resourcesRef.current.get(propId);
      const renderer = rendererRef.current;
      const camera = cameraRef.current;
      const raycaster = hoverRaycasterRef.current;
      if (!resource || !resource.mesh.visible || !renderer || !camera || !raycaster) {
        return null;
      }

      if (!updatePointerRay(event, renderer, camera, raycaster)) {
        return null;
      }

      return resolveWorldPropDragPosition(resource, raycaster);
    },
    [cameraRef, hoverRaycasterRef, rendererRef, viewerPropsConfig?.isEditing]
  );

  return {
    performPropHitTest,
    resolvePropDragPosition,
    refreshWorldProps,
  } as const;
}
