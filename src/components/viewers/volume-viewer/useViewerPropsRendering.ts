import { useCallback, useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import * as THREE from 'three';

import type { ViewerPropsConfig } from '../VolumeViewer.types';
import type { ViewerProp } from '../../../types/viewerProps';

type WorldPropTextureLayout = {
  worldWidth: number;
  worldHeight: number;
};

type WorldPropResource = {
  group: THREE.Group;
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  outline: THREE.LineLoop<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  texture: THREE.CanvasTexture;
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  signature: string | null;
  layout: WorldPropTextureLayout;
};

type UseViewerPropsRenderingParams = {
  viewerPropsConfig?: ViewerPropsConfig;
  renderContextRevision: number;
  volumeRootGroupRef: MutableRefObject<THREE.Group | null>;
  rendererRef: MutableRefObject<THREE.WebGLRenderer | null>;
  cameraRef: MutableRefObject<THREE.PerspectiveCamera | null>;
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

function drawWorldPropTexture(resource: WorldPropResource, prop: ViewerProp): WorldPropTextureLayout {
  const signature = `${prop.text}__${prop.color}__${prop.world.fontSize}`;
  if (resource.signature === signature) {
    return resource.layout;
  }

  resource.signature = signature;
  const { canvas, context, texture } = resource;
  const lines = resolveTextLines(prop.text);
  const lineHeightPx = TEXTURE_BASE_FONT_SIZE * 1.18;
  const paddingXPx = TEXTURE_BASE_FONT_SIZE * 0.75;
  const paddingYPx = TEXTURE_BASE_FONT_SIZE * 0.55;

  context.font = `600 ${TEXTURE_BASE_FONT_SIZE}px Inter, sans-serif`;
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

  if (canvas.width !== nextCanvasWidth || canvas.height !== nextCanvasHeight) {
    canvas.width = nextCanvasWidth;
    canvas.height = nextCanvasHeight;
  }

  const drawPaddingX = canvas.width * 0.1;
  const drawPaddingY = canvas.height * 0.12;
  const scale = Math.min(
    (canvas.width - drawPaddingX * 2) / layoutWidthPx,
    (canvas.height - drawPaddingY * 2) / layoutHeightPx
  );
  const fontSize = Math.max(24, Math.floor(TEXTURE_BASE_FONT_SIZE * scale));
  const drawLineHeight = fontSize * 1.18;
  const startY = canvas.height / 2 - ((lines.length - 1) * drawLineHeight) / 2;

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = prop.color;
  context.font = `600 ${fontSize}px Inter, sans-serif`;

  lines.forEach((line, index) => {
    context.fillText(line, canvas.width / 2, startY + index * drawLineHeight);
  });

  texture.needsUpdate = true;
  resource.layout = {
    worldWidth: Math.max(0.1, (layoutWidthPx / TEXTURE_BASE_FONT_SIZE) * prop.world.fontSize),
    worldHeight: Math.max(0.1, (layoutHeightPx / TEXTURE_BASE_FONT_SIZE) * prop.world.fontSize),
  };
  return resource.layout;
}

function clampTextureDimension(value: number) {
  return Math.max(TEXTURE_MIN_DIMENSION, Math.min(TEXTURE_MAX_DIMENSION, Math.round(value)));
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
  resource.mesh.geometry.dispose();
  resource.mesh.material.dispose();
  resource.outline.geometry.dispose();
  resource.outline.material.dispose();
  resource.texture.dispose();
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
      (prop) => prop.dimension === '3d'
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
        group.add(outline);
        propsGroup.add(group);

        resource = {
          group,
          mesh,
          outline,
          texture,
          canvas,
          context,
          signature: null,
          layout: { worldWidth: 1, worldHeight: 1 },
        };
        resourcesRef.current.set(prop.id, resource);
      }

      const layout = drawWorldPropTexture(resource, prop);
      // Billboard text inherits a mirrored vertical basis from the camera alignment,
      // so compensate here to keep billboard and fixed modes visually consistent.
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
      } else if (cameraRef.current) {
        applyBillboardTransform(resource, cameraRef.current, prop.world.roll);
      }

      resource.mesh.visible = prop.visible;
      resource.outline.visible = Boolean(prop.visible && viewerPropsConfig?.isEditing);
      resource.mesh.renderOrder = 30;
      resource.outline.renderOrder = 31;
      resource.mesh.material.depthTest = false;
      resource.outline.material.depthTest = false;
      resource.mesh.material.opacity = 1;
      resource.outline.material.opacity = viewerPropsConfig?.isEditing ? 0.95 : 0;
      resource.outline.material.color.copy(
        prop.id === viewerPropsConfig?.selectedPropId ? SELECTED_OUTLINE_COLOR : WORLD_OUTLINE_COLOR
      );

      const handleBeforeRender = (
        _renderer: THREE.WebGLRenderer,
        _scene: THREE.Scene,
        camera: THREE.Camera
      ) => {
        if (prop.world.facingMode === 'billboard') {
          applyBillboardTransform(resource!, camera, prop.world.roll);
        }
        resource!.outline.material.opacity = viewerPropsConfig?.isEditing ? 0.95 : 0;
      };

      resource.mesh.onBeforeRender = handleBeforeRender;
      resource.outline.onBeforeRender = handleBeforeRender;
    }
  }, [
    cameraRef,
    renderContextRevision,
    viewerPropsConfig,
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

      const rect = renderer.domElement.getBoundingClientRect();
      if (!(rect.width > 0) || !(rect.height > 0)) {
        return null;
      }

      scratchPointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      );
      raycaster.setFromCamera(scratchPointer, camera);
      const [hit] = raycaster.intersectObjects(visibleMeshes, false);
      const hitId = hit?.object?.userData?.viewerPropId;
      return typeof hitId === 'string' ? hitId : null;
    },
    [cameraRef, hoverRaycasterRef, rendererRef, viewerPropsConfig?.isEditing]
  );

  return {
    performPropHitTest,
  } as const;
}
