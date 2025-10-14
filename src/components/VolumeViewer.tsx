// @ts-nocheck
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { VRButton } from 'three/examples/jsm/webxr/VRButton';
import { Line2 } from 'three/examples/jsm/lines/Line2';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial';
import type { NormalizedVolume } from '../volumeProcessing';
import { VolumeRenderShader } from '../shaders/volumeRenderShader';
import { SliceRenderShader } from '../shaders/sliceRenderShader';
import { getCachedTextureData } from '../textureCache';
import './VolumeViewer.css';
import type { TrackColorMode, TrackDefinition } from '../types/tracks';
import { DEFAULT_LAYER_COLOR, normalizeHexColor } from '../layerColors';
import { createTrackColor } from '../trackColors';

type ViewerLayer = {
  key: string;
  label: string;
  volume: NormalizedVolume | null;
  visible: boolean;
  contrast: number;
  brightness: number;
  color: string;
  offsetX: number;
  offsetY: number;
  mode?: '3d' | 'slice';
  sliceIndex?: number;
};

type VolumeViewerProps = {
  layers: ViewerLayer[];
  timeIndex: number;
  totalTimepoints: number;
  isLoading: boolean;
  loadingProgress: number;
  loadedVolumes: number;
  expectedVolumes: number;
  onRegisterReset: (handler: (() => void) | null) => void;
  tracks: TrackDefinition[];
  trackVisibility: Record<string, boolean>;
  trackOpacityByChannel: Record<string, number>;
  trackLineWidthByChannel: Record<string, number>;
  channelTrackColorModes: Record<string, TrackColorMode>;
  channelTrackOffsets: Record<string, { x: number; y: number }>;
  followedTrackId: string | null;
  onTrackFollowRequest: (trackId: string) => void;
};

type VolumeResources = {
  mesh: THREE.Mesh;
  texture: THREE.Data3DTexture | THREE.DataTexture;
  dimensions: {
    width: number;
    height: number;
    depth: number;
  };
  channels: number;
  mode: '3d' | 'slice';
  sliceBuffer?: Uint8Array | null;
};

function getExpectedSliceBufferLength(volume: NormalizedVolume) {
  const pixelCount = volume.width * volume.height;
  return pixelCount * 4;
}

function prepareSliceTexture(volume: NormalizedVolume, sliceIndex: number, existingBuffer: Uint8Array | null) {
  const { width, height, depth, channels, normalized } = volume;
  const pixelCount = width * height;
  const targetLength = pixelCount * 4;

  let buffer = existingBuffer ?? null;
  if (!buffer || buffer.length !== targetLength) {
    buffer = new Uint8Array(targetLength);
  }

  const maxIndex = Math.max(0, depth - 1);
  const clampedIndex = Math.min(Math.max(sliceIndex, 0), maxIndex);
  const sliceStride = pixelCount * channels;
  const sliceOffset = clampedIndex * sliceStride;

  for (let i = 0; i < pixelCount; i++) {
    const sourceOffset = sliceOffset + i * channels;
    const targetOffset = i * 4;

    const red = normalized[sourceOffset] ?? 0;
    const green = channels > 1 ? normalized[sourceOffset + 1] ?? 0 : red;
    const blue = channels > 2 ? normalized[sourceOffset + 2] ?? 0 : green;
    const alpha = channels > 3 ? normalized[sourceOffset + 3] ?? 255 : 255;

    if (channels === 1) {
      buffer[targetOffset] = red;
      buffer[targetOffset + 1] = red;
      buffer[targetOffset + 2] = red;
      buffer[targetOffset + 3] = 255;
    } else if (channels === 2) {
      buffer[targetOffset] = red;
      buffer[targetOffset + 1] = green;
      buffer[targetOffset + 2] = 0;
      buffer[targetOffset + 3] = 255;
    } else if (channels === 3) {
      buffer[targetOffset] = red;
      buffer[targetOffset + 1] = green;
      buffer[targetOffset + 2] = blue;
      buffer[targetOffset + 3] = 255;
    } else {
      buffer[targetOffset] = red;
      buffer[targetOffset + 1] = green;
      buffer[targetOffset + 2] = blue;
      buffer[targetOffset + 3] = alpha;
    }
  }

  return { data: buffer, format: THREE.RGBAFormat };
}

type PointerState = {
  mode: 'pan' | 'dolly';
  pointerId: number;
  lastX: number;
  lastY: number;
  previousControlsEnabled: boolean;
  previousEnablePan: boolean | null;
};

type MovementState = {
  moveForward: boolean;
  moveBackward: boolean;
  moveLeft: boolean;
  moveRight: boolean;
  moveUp: boolean;
  moveDown: boolean;
};

type TrackLineResource = {
  line: Line2;
  outline: Line2;
  geometry: LineGeometry;
  material: LineMaterial;
  outlineMaterial: LineMaterial;
  times: number[];
  baseColor: THREE.Color;
  highlightColor: THREE.Color;
};

const DEFAULT_TRACK_OPACITY = 0.9;
const DEFAULT_TRACK_LINE_WIDTH = 1;

type RaycasterLike = {
  params: { Line?: { threshold: number } } & Record<string, unknown>;
  setFromCamera: (coords: THREE.Vector2, camera: THREE.PerspectiveCamera) => void;
  intersectObjects: (
    objects: THREE.Object3D[],
    recursive?: boolean
  ) => Array<{ object: THREE.Object3D }>;
};

const MOVEMENT_KEY_MAP: Record<string, keyof MovementState> = {
  KeyW: 'moveForward',
  KeyS: 'moveBackward',
  KeyA: 'moveLeft',
  KeyD: 'moveRight',
  KeyE: 'moveUp',
  KeyQ: 'moveDown'
};

function createColormapTexture(hexColor: string) {
  const normalized = normalizeHexColor(hexColor, DEFAULT_LAYER_COLOR);
  const red = parseInt(normalized.slice(1, 3), 16) / 255;
  const green = parseInt(normalized.slice(3, 5), 16) / 255;
  const blue = parseInt(normalized.slice(5, 7), 16) / 255;

  const size = 256;
  const data = new Uint8Array(size * 4);
  for (let i = 0; i < size; i++) {
    const intensity = i / (size - 1);
    data[i * 4 + 0] = Math.round(red * intensity * 255);
    data[i * 4 + 1] = Math.round(green * intensity * 255);
    data[i * 4 + 2] = Math.round(blue * intensity * 255);
    data[i * 4 + 3] = Math.round(intensity * 255);
  }
  const texture = new THREE.DataTexture(data, size, 1, THREE.RGBAFormat);
  texture.needsUpdate = true;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function ensureVolumeCameraUniformUpdater(mesh: THREE.Mesh, cameraUniform: THREE.Vector3) {
  const userData = mesh.userData ?? (mesh.userData = {});
  if (userData.__volumeCameraUniformUpdater) {
    return;
  }

  const worldPositionBuffer = new THREE.Vector3();
  const localPositionBuffer = new THREE.Vector3();
  const previousOnBeforeRender = typeof mesh.onBeforeRender === 'function' ? mesh.onBeforeRender : null;

  const handleBeforeRender = function (
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    renderCamera: THREE.Camera,
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    group: THREE.Group | null
  ) {
    if (renderCamera) {
      worldPositionBuffer.setFromMatrixPosition(renderCamera.matrixWorld);
      localPositionBuffer.copy(worldPositionBuffer);
      mesh.worldToLocal(localPositionBuffer);
      cameraUniform.copy(localPositionBuffer);
    }

    if (previousOnBeforeRender) {
      previousOnBeforeRender.call(mesh, renderer, scene, renderCamera, geometry, material, group);
    }
  };

  mesh.onBeforeRender = handleBeforeRender;
  userData.__volumeCameraUniformUpdater = {
    dispose: () => {
      mesh.onBeforeRender = previousOnBeforeRender ?? null;
    }
  };
}

function VolumeViewer({
  layers,
  isLoading,
  loadingProgress,
  loadedVolumes,
  expectedVolumes,
  timeIndex,
  totalTimepoints,
  isPlaying,
  onTogglePlayback,
  onTimeIndexChange,
  onRegisterReset,
  tracks,
  trackVisibility,
  trackOpacityByChannel,
  trackLineWidthByChannel,
  channelTrackColorModes,
  channelTrackOffsets,
  followedTrackId,
  onTrackFollowRequest
}: VolumeViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const controlsEnabledBeforeVRRef = useRef(true);
  const animationFrameRef = useRef<number | null>(null);
  const resourcesRef = useRef<Map<string, VolumeResources>>(new Map());
  const currentDimensionsRef = useRef<{ width: number; height: number; depth: number } | null>(null);
  const colormapCacheRef = useRef<Map<string, THREE.DataTexture>>(new Map());
  const rotationTargetRef = useRef(new THREE.Vector3());
  const defaultViewStateRef = useRef<{
    position: THREE.Vector3;
    target: THREE.Vector3;
  } | null>(null);
  const pointerStateRef = useRef<PointerState | null>(null);
  const movementStateRef = useRef<MovementState>({
    moveForward: false,
    moveBackward: false,
    moveLeft: false,
    moveRight: false,
    moveUp: false,
    moveDown: false
  });
  const volumeRootGroupRef = useRef<THREE.Group | null>(null);
  const volumeRootCenterOffsetRef = useRef(new THREE.Vector3());
  const trackGroupRef = useRef<THREE.Group | null>(null);
  const trackLinesRef = useRef<Map<string, TrackLineResource>>(new Map());
  const raycasterRef = useRef<RaycasterLike | null>(null);
  const timeIndexRef = useRef(0);
  const followedTrackIdRef = useRef<string | null>(null);
  const trackFollowOffsetRef = useRef<THREE.Vector3 | null>(null);
  const previousFollowedTrackIdRef = useRef<string | null>(null);
  const [hasMeasured, setHasMeasured] = useState(false);
  const [trackOverlayRevision, setTrackOverlayRevision] = useState(0);
  const [renderContextRevision, setRenderContextRevision] = useState(0);
  const hoveredTrackIdRef = useRef<string | null>(null);
  const [hoveredTrackId, setHoveredTrackId] = useState<string | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ x: number; y: number } | null>(null);
  const [containerNode, setContainerNode] = useState<HTMLDivElement | null>(null);
  const [vrButtonContainer, setVrButtonContainer] = useState<HTMLDivElement | null>(null);
  const [isVrPresenting, setIsVrPresenting] = useState(false);
  const vrUiGroupRef = useRef<THREE.Group | null>(null);
  const vrUiInteractablesRef = useRef<THREE.Object3D[]>([]);
  const vrHoverTargetRef = useRef<THREE.Object3D | null>(null);
  const vrControllerStateRef = useRef<
    Array<{
      controller: THREE.Group;
      line: THREE.Line;
      onSelectStart: () => void;
      onSelectEnd: () => void;
      onConnected: (event: unknown) => void;
      onDisconnected: (event: unknown) => void;
      connected: boolean;
    }>
  >([]);
  const vrRaycasterRef = useRef(new THREE.Raycaster());
  const vrUiElementsRef = useRef<{
    panel: THREE.Mesh | null;
    progressBackground: THREE.Mesh | null;
    progressFill: THREE.Mesh | null;
    playButton: THREE.Mesh | null;
    stepBackButton: THREE.Mesh | null;
    stepForwardButton: THREE.Mesh | null;
    playIcon: THREE.Sprite | null;
    stepBackIcon: THREE.Sprite | null;
    stepForwardIcon: THREE.Sprite | null;
    labelSprite: THREE.Sprite | null;
  }>({
    panel: null,
    progressBackground: null,
    progressFill: null,
    playButton: null,
    stepBackButton: null,
    stepForwardButton: null,
    playIcon: null,
    stepBackIcon: null,
    stepForwardIcon: null,
    labelSprite: null
  });
  const vrUiResourcesRef = useRef<{
    labelCanvas: HTMLCanvasElement | null;
    labelContext: CanvasRenderingContext2D | null;
    labelTexture: THREE.CanvasTexture | null;
    playIconCanvas: HTMLCanvasElement | null;
    playIconContext: CanvasRenderingContext2D | null;
    playIconTexture: THREE.CanvasTexture | null;
    stepBackTexture: THREE.CanvasTexture | null;
    stepForwardTexture: THREE.CanvasTexture | null;
  }>({
    labelCanvas: null,
    labelContext: null,
    labelTexture: null,
    playIconCanvas: null,
    playIconContext: null,
    playIconTexture: null,
    stepBackTexture: null,
    stepForwardTexture: null
  });

  const handleContainerRef = useCallback((node: HTMLDivElement | null) => {
    containerRef.current = node;
    setContainerNode(node);
  }, []);

  const handleVrButtonContainerRef = useCallback((node: HTMLDivElement | null) => {
    setVrButtonContainer(node);
  }, []);

  followedTrackIdRef.current = followedTrackId;

  const trackLookup = useMemo(() => {
    const map = new Map<string, TrackDefinition>();
    for (const track of tracks) {
      map.set(track.id, track);
    }
    return map;
  }, [tracks]);

  const resolveTrackColor = useCallback(
    (track: TrackDefinition) => {
      const mode = channelTrackColorModes[track.channelId];
      if (mode && mode.type === 'uniform') {
        return new THREE.Color(mode.color);
      }
      return createTrackColor(track.id);
    },
    [channelTrackColorModes]
  );

  const updateHoverState = useCallback(
    (trackId: string | null, position: { x: number; y: number } | null) => {
      if (hoveredTrackIdRef.current !== trackId) {
        hoveredTrackIdRef.current = trackId;
        setHoveredTrackId(trackId);
      }
      setTooltipPosition(position);
    },
    []
  );

  const clearHoverState = useCallback(() => {
    if (hoveredTrackIdRef.current !== null) {
      hoveredTrackIdRef.current = null;
      setHoveredTrackId(null);
    }
    setTooltipPosition(null);
  }, []);

  const applyVrHoverTarget = useCallback((object: THREE.Object3D | null) => {
    const target = object && object.userData && object.userData.disabled ? null : object;
    const previous = vrHoverTargetRef.current;
    if (previous === target) {
      return;
    }

    if (previous && previous.userData && previous.userData.baseColor !== undefined) {
      const previousMaterial = previous.material as THREE.Material & {
        color?: THREE.Color;
        opacity?: number;
      };
      if (previousMaterial && previousMaterial.color) {
        previousMaterial.color.setHex(previous.userData.baseColor);
      }
      if (
        typeof previous.userData.baseOpacity === 'number' &&
        typeof previousMaterial.opacity === 'number'
      ) {
        previousMaterial.opacity = previous.userData.baseOpacity;
      }
    }

    if (target && target.userData && target.userData.hoverColor !== undefined) {
      const material = target.material as THREE.Material & {
        color?: THREE.Color;
        opacity?: number;
      };
      if (material && material.color) {
        material.color.setHex(target.userData.hoverColor);
      }
      if (
        typeof target.userData.hoverOpacity === 'number' &&
        typeof material.opacity === 'number'
      ) {
        material.opacity = target.userData.hoverOpacity;
      }
    }

    vrHoverTargetRef.current = target;
  }, []);

  const handleVrUiAction = useCallback(
    (object: THREE.Object3D | null) => {
      if (!object || !object.userData) {
        return;
      }

      if (object.userData.disabled) {
        return;
      }

      const action = object.userData.action;
      if (!action) {
        return;
      }

      if (action === 'toggle-playback') {
        onTogglePlayback();
        return;
      }

      if (!Number.isFinite(totalTimepoints) || totalTimepoints <= 0) {
        return;
      }

      if (action === 'step-back') {
        if (!onTimeIndexChange) {
          return;
        }
        const nextIndex = Math.max(0, timeIndexRef.current - 1);
        if (nextIndex !== timeIndexRef.current) {
          onTimeIndexChange(nextIndex);
        }
        return;
      }

      if (action === 'step-forward') {
        if (!onTimeIndexChange) {
          return;
        }
        const maxIndex = Math.max(0, totalTimepoints - 1);
        const nextIndex = Math.min(maxIndex, timeIndexRef.current + 1);
        if (nextIndex !== timeIndexRef.current) {
          onTimeIndexChange(nextIndex);
        }
      }
    },
    [onTimeIndexChange, onTogglePlayback, totalTimepoints]
  );

  const applyVolumeRootTransform = useCallback(
    (dimensions: { width: number; height: number; depth: number } | null) => {
      const volumeRootGroup = volumeRootGroupRef.current;
      if (!volumeRootGroup) {
        return;
      }

      if (!dimensions) {
        volumeRootGroup.position.set(0, 0, 0);
        volumeRootGroup.scale.set(1, 1, 1);
        return;
      }

      const { width, height, depth } = dimensions;
      const maxDimension = Math.max(width, height, depth);
      if (!Number.isFinite(maxDimension) || maxDimension <= 0) {
        volumeRootGroup.position.set(0, 0, 0);
        volumeRootGroup.scale.set(1, 1, 1);
        return;
      }

      const scale = 1 / maxDimension;
      const centerOffset = volumeRootCenterOffsetRef.current;
      centerOffset
        .set(width / 2 - 0.5, height / 2 - 0.5, depth / 2 - 0.5)
        .multiplyScalar(scale);

      volumeRootGroup.scale.setScalar(scale);
      volumeRootGroup.position.set(-centerOffset.x, -centerOffset.y, -centerOffset.z);
      volumeRootGroup.updateMatrixWorld(true);
    },
    []
  );

  const applyTrackGroupTransform = useCallback(
    (dimensions: { width: number; height: number; depth: number } | null) => {
      const trackGroup = trackGroupRef.current;
      if (!trackGroup) {
        return;
      }

      if (!dimensions) {
        trackGroup.position.set(0, 0, 0);
        trackGroup.scale.set(1, 1, 1);
        trackGroup.matrixWorldNeedsUpdate = true;
        return;
      }

      const { width, height, depth } = dimensions;
      const maxDimension = Math.max(width, height, depth);
      if (!Number.isFinite(maxDimension) || maxDimension <= 0) {
        trackGroup.position.set(0, 0, 0);
        trackGroup.scale.set(1, 1, 1);
        trackGroup.matrixWorldNeedsUpdate = true;
        return;
      }

      // The volume root group already normalizes scale/position for all children,
      // so the track overlay should keep an identity transform to match the
      // volume data coordinates.
      trackGroup.position.set(0, 0, 0);
      trackGroup.scale.set(1, 1, 1);
      trackGroup.matrixWorldNeedsUpdate = true;
    },
    []
  );

  const getColormapTexture = useCallback((color: string) => {
    const normalized = normalizeHexColor(color, DEFAULT_LAYER_COLOR);
    const cache = colormapCacheRef.current;
    let texture = cache.get(normalized) ?? null;
    if (!texture) {
      texture = createColormapTexture(normalized);
      cache.set(normalized, texture);
    }
    return texture;
  }, []);

  const updateTrackDrawRanges = useCallback((targetTimeIndex: number) => {
    const lines = trackLinesRef.current;
    const maxVisibleTime = targetTimeIndex;

    for (const resource of lines.values()) {
      const { geometry, times } = resource;
      let visiblePoints = 0;
      for (let index = 0; index < times.length; index++) {
        if (times[index] <= maxVisibleTime) {
          visiblePoints = index + 1;
        } else {
          break;
        }
      }

      const totalSegments = Math.max(times.length - 1, 0);
      const visibleSegments = Math.min(Math.max(visiblePoints - 1, 0), totalSegments);
      geometry.instanceCount = visibleSegments;
    }
  }, []);

  const safeProgress = Math.min(1, Math.max(0, loadingProgress));
  const clampedLoadedVolumes = Math.max(0, loadedVolumes);
  const clampedExpectedVolumes = Math.max(0, expectedVolumes);
  const normalizedProgress =
    clampedExpectedVolumes > 0
      ? Math.min(1, clampedLoadedVolumes / clampedExpectedVolumes)
      : safeProgress;
  const hasStartedLoading = normalizedProgress > 0 || clampedLoadedVolumes > 0 || safeProgress > 0;
  const hasFinishedLoading =
    clampedExpectedVolumes > 0 ? clampedLoadedVolumes >= clampedExpectedVolumes : safeProgress >= 1;
  const showLoadingOverlay = isLoading || (hasStartedLoading && !hasFinishedLoading);
  const clampedTimeIndex = totalTimepoints === 0 ? 0 : Math.min(timeIndex, totalTimepoints - 1);
  timeIndexRef.current = clampedTimeIndex;
  const primaryVolume = useMemo(() => {
    for (const layer of layers) {
      if (layer.volume) {
        return layer.volume;
      }
    }
    return null;
  }, [layers]);
  const hasRenderableLayer = Boolean(primaryVolume);
  const hasActive3DLayer = useMemo(
    () =>
      layers.some((layer) => {
        if (!layer.volume) {
          return false;
        }
        const viewerMode =
          layer.mode === 'slice' || layer.mode === '3d'
            ? layer.mode
            : layer.volume.depth > 1
            ? '3d'
            : 'slice';
        return viewerMode === '3d';
      }),
    [layers]
  );
  const previouslyHad3DLayerRef = useRef(false);

  useEffect(() => {
    if (trackOverlayRevision === 0) {
      return;
    }

    const trackGroup = trackGroupRef.current;
    if (!trackGroup) {
      return;
    }

    const trackLines = trackLinesRef.current;
    const activeIds = new Set<string>();
    tracks.forEach((track) => {
      if (track.points.length > 0) {
        activeIds.add(track.id);
      }
    });

    for (const [id, resource] of Array.from(trackLines.entries())) {
      if (!activeIds.has(id)) {
        trackGroup.remove(resource.line);
        trackGroup.remove(resource.outline);
        resource.geometry.dispose();
        resource.material.dispose();
        resource.outlineMaterial.dispose();
        if (hoveredTrackIdRef.current === id) {
          clearHoverState();
        }
        trackLines.delete(id);
      }
    }

    for (const track of tracks) {
      if (track.points.length === 0) {
        continue;
      }

      let resource = trackLines.get(track.id) ?? null;
      const positions = new Float32Array(track.points.length * 3);
      const times = new Array<number>(track.points.length);
      const offset = channelTrackOffsets[track.channelId] ?? { x: 0, y: 0 };

      for (let index = 0; index < track.points.length; index++) {
        const point = track.points[index];
        positions[index * 3 + 0] = point.x + offset.x;
        positions[index * 3 + 1] = point.y + offset.y;
        positions[index * 3 + 2] = point.z;
        times[index] = point.time;
      }

      const baseColor = resolveTrackColor(track);
      const highlightColor = baseColor.clone().lerp(new THREE.Color(0xffffff), 0.4);

      if (!resource) {
        const geometry = new LineGeometry();
        geometry.setPositions(Array.from(positions));
        geometry.instanceCount = 0;
        const material = new LineMaterial({
          color: baseColor.clone(),
          linewidth: 1,
          transparent: true,
          opacity: 0.9,
          depthTest: false,
          depthWrite: false
        });
        const outlineMaterial = new LineMaterial({
          color: new THREE.Color(0xffffff),
          linewidth: 1,
          transparent: true,
          opacity: 0,
          depthTest: false,
          depthWrite: false
        });
        const containerNode = containerRef.current;
        if (containerNode) {
          const width = Math.max(containerNode.clientWidth, 1);
          const height = Math.max(containerNode.clientHeight, 1);
          material.resolution.set(width, height);
          outlineMaterial.resolution.set(width, height);
        } else {
          material.resolution.set(1, 1);
          outlineMaterial.resolution.set(1, 1);
        }

        const outline = new Line2(geometry, outlineMaterial);
        outline.computeLineDistances();
        outline.renderOrder = 999;
        outline.frustumCulled = false;
        outline.visible = false;

        const line = new Line2(geometry, material);
        line.computeLineDistances();
        line.renderOrder = 1000;
        line.frustumCulled = false;
        const lineWithUserData = line as unknown as { userData: Record<string, unknown> };
        lineWithUserData.userData.trackId = track.id;

        trackGroup.add(outline);
        trackGroup.add(line);
        resource = {
          line,
          outline,
          geometry,
          material,
          outlineMaterial,
          times,
          baseColor: baseColor.clone(),
          highlightColor: highlightColor.clone()
        };
        trackLines.set(track.id, resource);
      } else {
        const { geometry, line, outline } = resource;
        geometry.setPositions(Array.from(positions));
        line.computeLineDistances();
        outline.computeLineDistances();
        resource.times = times;
        resource.baseColor.copy(baseColor);
        resource.highlightColor.copy(highlightColor);
      }
    }

    updateTrackDrawRanges(timeIndexRef.current);
  }, [
    channelTrackColorModes,
    channelTrackOffsets,
    clearHoverState,
    resolveTrackColor,
    trackOverlayRevision,
    tracks,
    updateTrackDrawRanges
  ]);

  useEffect(() => {
    if (trackOverlayRevision === 0) {
      return;
    }

    const trackGroup = trackGroupRef.current;
    if (!trackGroup) {
      return;
    }

    let visibleCount = 0;

    for (const track of tracks) {
      const resource = trackLinesRef.current.get(track.id);
      if (!resource) {
        continue;
      }

      const { line, outline, material, outlineMaterial, baseColor, highlightColor } = resource;

      const isExplicitlyVisible = trackVisibility[track.id] ?? true;
      const isFollowed = followedTrackId === track.id;
      const isHovered = hoveredTrackId === track.id;
      const isHighlighted = isFollowed || isHovered;
      const shouldShow = isFollowed || isExplicitlyVisible;
      line.visible = shouldShow;
      outline.visible = shouldShow && isHighlighted;
      if (shouldShow) {
        visibleCount += 1;
      }

      const targetColor = isHighlighted ? highlightColor : baseColor;
      if (!material.color.equals(targetColor)) {
        material.color.copy(targetColor);
        material.needsUpdate = true;
      }

      const channelOpacity = trackOpacityByChannel[track.channelId] ?? DEFAULT_TRACK_OPACITY;
      const sanitizedOpacity = Math.min(1, Math.max(0, channelOpacity));
      const opacityBoost = isFollowed ? 0.15 : isHovered ? 0.12 : 0;
      const targetOpacity = Math.min(1, sanitizedOpacity + opacityBoost);
      if (material.opacity !== targetOpacity) {
        material.opacity = targetOpacity;
        material.needsUpdate = true;
      }

      const channelLineWidth = trackLineWidthByChannel[track.channelId] ?? DEFAULT_TRACK_LINE_WIDTH;
      const sanitizedLineWidth = Math.max(0.1, Math.min(10, channelLineWidth));
      const widthMultiplier = isFollowed ? 1.35 : isHovered ? 1.2 : 1;
      const targetWidth = sanitizedLineWidth * widthMultiplier;
      if (material.linewidth !== targetWidth) {
        material.linewidth = targetWidth;
        material.needsUpdate = true;
      }

      const outlineOpacity = isFollowed ? 0.75 : isHovered ? 0.9 : 0;
      if (outlineMaterial.opacity !== outlineOpacity) {
        outlineMaterial.opacity = outlineOpacity;
        outlineMaterial.needsUpdate = true;
      }

      const outlineWidth = targetWidth + Math.max(sanitizedLineWidth * 0.75, 0.4);
      if (outlineMaterial.linewidth !== outlineWidth) {
        outlineMaterial.linewidth = outlineWidth;
        outlineMaterial.needsUpdate = true;
      }
    }

    const followedTrackExists = followedTrackId !== null && trackLinesRef.current.has(followedTrackId);

    trackGroup.visible = visibleCount > 0 || followedTrackExists;

    if (hoveredTrackId !== null) {
      const hoveredResource = trackLinesRef.current.get(hoveredTrackId);
      if (!hoveredResource || !hoveredResource.line.visible) {
        clearHoverState();
      }
    }
  }, [
    clearHoverState,
    trackOverlayRevision,
    followedTrackId,
    hoveredTrackId,
    trackLineWidthByChannel,
    trackOpacityByChannel,
    trackVisibility,
    tracks
  ]);

  useEffect(() => {
    updateTrackDrawRanges(clampedTimeIndex);
  }, [clampedTimeIndex, updateTrackDrawRanges]);

  useEffect(() => {
    const previouslyHad3DLayer = previouslyHad3DLayerRef.current;
    previouslyHad3DLayerRef.current = hasActive3DLayer;

    if (!hasActive3DLayer || previouslyHad3DLayer === hasActive3DLayer) {
      return;
    }

    applyVolumeRootTransform(currentDimensionsRef.current);
    applyTrackGroupTransform(currentDimensionsRef.current);

    const trackGroup = trackGroupRef.current;
    if (trackGroup) {
      trackGroup.updateMatrixWorld(true);
    }

    setTrackOverlayRevision((revision) => revision + 1);
    updateTrackDrawRanges(timeIndexRef.current);
  }, [
    applyTrackGroupTransform,
    applyVolumeRootTransform,
    hasActive3DLayer,
    updateTrackDrawRanges
  ]);

  const computeTrackCentroid = useCallback(
    (trackId: string, targetTimeIndex: number) => {
      const track = trackLookup.get(trackId);
      if (!track || track.points.length === 0) {
        return null;
      }

      const maxVisibleTime = targetTimeIndex + 1;
      const epsilon = 1e-3;
      let latestTime = -Infinity;
      let count = 0;
      let sumX = 0;
      let sumY = 0;
      let sumZ = 0;
      const offset = channelTrackOffsets[track.channelId] ?? { x: 0, y: 0 };

      for (const point of track.points) {
        if (point.time - maxVisibleTime > epsilon) {
          break;
        }

        if (point.time > latestTime + epsilon) {
          latestTime = point.time;
          count = 1;
          sumX = point.x + offset.x;
          sumY = point.y + offset.y;
          sumZ = point.z;
        } else if (Math.abs(point.time - latestTime) <= epsilon) {
          count += 1;
          sumX += point.x + offset.x;
          sumY += point.y + offset.y;
          sumZ += point.z;
        }
      }

      if (count === 0) {
        return null;
      }

      const trackGroup = trackGroupRef.current;
      if (!trackGroup) {
        return null;
      }

      const centroidLocal = new THREE.Vector3(sumX / count, sumY / count, sumZ / count);
      trackGroup.updateMatrixWorld(true);
      return trackGroup.localToWorld(centroidLocal);
    },
    [channelTrackOffsets, trackLookup]
  );

  useEffect(() => {
    followedTrackIdRef.current = followedTrackId;
    if (followedTrackId === null) {
      trackFollowOffsetRef.current = null;
      previousFollowedTrackIdRef.current = null;
      return;
    }

    const movementState = movementStateRef.current;
    if (movementState) {
      movementState.moveForward = false;
      movementState.moveBackward = false;
      movementState.moveLeft = false;
      movementState.moveRight = false;
      movementState.moveUp = false;
      movementState.moveDown = false;
    }

    const camera = cameraRef.current;
    const controls = controlsRef.current;
    const rotationTarget = rotationTargetRef.current;

    if (!camera || !controls || !rotationTarget) {
      return;
    }

    const centroid = computeTrackCentroid(followedTrackId, clampedTimeIndex);
    if (!centroid) {
      return;
    }

    const previousTrackId = previousFollowedTrackIdRef.current;
    previousFollowedTrackIdRef.current = followedTrackId;

    let offset: THREE.Vector3;
    if (previousTrackId === followedTrackId && trackFollowOffsetRef.current) {
      offset = trackFollowOffsetRef.current.clone();
    } else {
      offset = camera.position.clone().sub(rotationTarget);
    }

    rotationTarget.copy(centroid);
    controls.target.copy(centroid);
    camera.position.copy(centroid).add(offset);
    controls.update();

    trackFollowOffsetRef.current = camera.position.clone().sub(rotationTarget);
  }, [
    clampedTimeIndex,
    computeTrackCentroid,
    followedTrackId,
    primaryVolume
  ]);

  const handleResetView = useCallback(() => {
    const controls = controlsRef.current;
    if (!controls) {
      return;
    }
    const camera = cameraRef.current;
    const defaultViewState = defaultViewStateRef.current;
    if (defaultViewState && camera) {
      camera.position.copy(defaultViewState.position);
      controls.target.copy(defaultViewState.target);
      rotationTargetRef.current.copy(defaultViewState.target);
      controls.update();
      return;
    }

    controls.reset();
    controls.target.copy(rotationTargetRef.current);
    controls.update();
  }, []);

  useEffect(() => {
    onRegisterReset(hasRenderableLayer ? handleResetView : null);
    return () => {
      onRegisterReset(null);
    };
  }, [handleResetView, hasRenderableLayer, onRegisterReset]);

  useEffect(() => {
    const container = containerNode;
    if (!container) {
      return;
    }

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.xr.enabled = true;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(container.clientWidth, container.clientHeight);
    const clearColor = 0x080a0d;
    renderer.setClearColor(clearColor, 1);

    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(clearColor);

    const volumeRootGroup = new THREE.Group();
    volumeRootGroup.name = 'VolumeRoot';
    scene.add(volumeRootGroup);
    volumeRootGroupRef.current = volumeRootGroup;
    applyVolumeRootTransform(currentDimensionsRef.current);

    const trackGroup = new THREE.Group();
    trackGroup.name = 'TrackingOverlay';
    trackGroup.visible = false;
    volumeRootGroup.add(trackGroup);
    trackGroupRef.current = trackGroup;

    const vrUiGroup = new THREE.Group();
    vrUiGroup.name = 'VrInterface';
    vrUiGroup.visible = false;
    scene.add(vrUiGroup);
    vrUiGroupRef.current = vrUiGroup;
    vrUiInteractablesRef.current = [];
    applyVrHoverTarget(null);

    const vrUiElements = vrUiElementsRef.current;
    vrUiElements.panel = null;
    vrUiElements.progressBackground = null;
    vrUiElements.progressFill = null;
    vrUiElements.playButton = null;
    vrUiElements.stepBackButton = null;
    vrUiElements.stepForwardButton = null;
    vrUiElements.playIcon = null;
    vrUiElements.stepBackIcon = null;
    vrUiElements.stepForwardIcon = null;
    vrUiElements.labelSprite = null;

    const vrUiResources = vrUiResourcesRef.current;
    if (vrUiResources.labelTexture) {
      vrUiResources.labelTexture.dispose();
    }
    if (vrUiResources.playIconTexture) {
      vrUiResources.playIconTexture.dispose();
    }
    if (vrUiResources.stepBackTexture) {
      vrUiResources.stepBackTexture.dispose();
    }
    if (vrUiResources.stepForwardTexture) {
      vrUiResources.stepForwardTexture.dispose();
    }
    vrUiResources.labelCanvas = null;
    vrUiResources.labelContext = null;
    vrUiResources.labelTexture = null;
    vrUiResources.playIconCanvas = null;
    vrUiResources.playIconContext = null;
    vrUiResources.playIconTexture = null;
    vrUiResources.stepBackTexture = null;
    vrUiResources.stepForwardTexture = null;

    const createButton = (
      action: string,
      width: number,
      height: number,
      position: THREE.Vector3,
      baseColor: number,
      hoverColor: number,
      baseOpacity = 0.95,
      hoverOpacity = 1
    ) => {
      const material = new THREE.MeshBasicMaterial({
        color: baseColor,
        transparent: true,
        opacity: baseOpacity
      });
      const geometry = new THREE.PlaneGeometry(width, height);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.copy(position);
      mesh.renderOrder = 20;
      mesh.userData = {
        action,
        baseColor,
        hoverColor,
        baseOpacity,
        hoverOpacity,
        defaultBaseColor: baseColor,
        defaultBaseOpacity: baseOpacity,
        disabled: false
      };
      vrUiGroup.add(mesh);
      vrUiInteractablesRef.current.push(mesh);
      return mesh;
    };

    const createIconTexture = (
      draw: (context: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => void
    ) => {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 256;
      const context = canvas.getContext('2d');
      if (context) {
        context.clearRect(0, 0, canvas.width, canvas.height);
        draw(context, canvas);
      }
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      return { canvas, context, texture };
    };

    const panelMaterial = new THREE.MeshBasicMaterial({
      color: 0x0c1018,
      transparent: true,
      opacity: 0.82
    });
    const panelGeometry = new THREE.PlaneGeometry(0.62, 0.36);
    const panelMesh = new THREE.Mesh(panelGeometry, panelMaterial);
    panelMesh.renderOrder = 5;
    vrUiGroup.add(panelMesh);
    vrUiElements.panel = panelMesh;

    const labelCanvas = document.createElement('canvas');
    labelCanvas.width = 512;
    labelCanvas.height = 256;
    const labelContext = labelCanvas.getContext('2d');
    const labelTexture = new THREE.CanvasTexture(labelCanvas);
    labelTexture.colorSpace = THREE.SRGBColorSpace;
    const labelSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: labelTexture, transparent: true })
    );
    labelSprite.scale.set(0.52, 0.22, 1);
    labelSprite.position.set(0, 0.06, 0.02);
    labelSprite.renderOrder = 25;
    vrUiGroup.add(labelSprite);
    vrUiElements.labelSprite = labelSprite;
    vrUiResources.labelCanvas = labelCanvas;
    vrUiResources.labelContext = labelContext;
    vrUiResources.labelTexture = labelTexture;

    const progressBackground = new THREE.Mesh(
      new THREE.PlaneGeometry(0.46, 0.05),
      new THREE.MeshBasicMaterial({ color: 0x151e2c, transparent: true, opacity: 0.85 })
    );
    progressBackground.position.set(0, -0.1, 0.015);
    progressBackground.renderOrder = 12;
    vrUiGroup.add(progressBackground);
    vrUiElements.progressBackground = progressBackground;

    const progressFillMaterial = new THREE.MeshBasicMaterial({
      color: 0x5b8cff,
      transparent: true,
      opacity: 0.9
    });
    const progressFill = new THREE.Mesh(
      new THREE.PlaneGeometry(0.46, 0.038),
      progressFillMaterial
    );
    progressFill.position.set(-0.23, -0.1, 0.02);
    progressFill.renderOrder = 14;
    progressFill.scale.x = 0.0001;
    progressFill.userData = {
      baseColor: 0x5b8cff,
      baseOpacity: 0.9
    };
    vrUiGroup.add(progressFill);
    vrUiElements.progressFill = progressFill;

    const playButton = createButton(
      'toggle-playback',
      0.14,
      0.14,
      new THREE.Vector3(-0.19, 0.1, 0.02),
      0x5b8cff,
      0x82aaff
    );
    vrUiElements.playButton = playButton;

    const stepBackButton = createButton(
      'step-back',
      0.12,
      0.12,
      new THREE.Vector3(-0.02, 0.1, 0.02),
      0x2a344a,
      0x3e4a64,
      0.9,
      0.98
    );
    vrUiElements.stepBackButton = stepBackButton;

    const stepForwardButton = createButton(
      'step-forward',
      0.12,
      0.12,
      new THREE.Vector3(0.15, 0.1, 0.02),
      0x2a344a,
      0x3e4a64,
      0.9,
      0.98
    );
    vrUiElements.stepForwardButton = stepForwardButton;

    const playIconResources = createIconTexture((context) => {
      context.fillStyle = 'rgba(255, 255, 255, 0.95)';
      const size = 180;
      context.beginPath();
      context.moveTo(90, 60);
      context.lineTo(90, 196);
      context.lineTo(206, 128);
      context.closePath();
      context.fill();
    });
    vrUiResources.playIconCanvas = playIconResources.canvas;
    vrUiResources.playIconContext = playIconResources.context;
    vrUiResources.playIconTexture = playIconResources.texture;
    const playIconSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: playIconResources.texture, transparent: true })
    );
    playIconSprite.scale.set(0.08, 0.08, 1);
    playIconSprite.position.copy(playButton.position).setZ(playButton.position.z + 0.01);
    playIconSprite.renderOrder = 30;
    vrUiGroup.add(playIconSprite);
    vrUiElements.playIcon = playIconSprite;

    const stepBackResources = createIconTexture((context) => {
      context.fillStyle = 'rgba(255, 255, 255, 0.9)';
      context.beginPath();
      context.moveTo(170, 64);
      context.lineTo(110, 128);
      context.lineTo(170, 192);
      context.closePath();
      context.fill();
      context.fillRect(98, 64, 28, 128);
    });
    vrUiResources.stepBackTexture = stepBackResources.texture;
    const stepBackIcon = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: stepBackResources.texture, transparent: true })
    );
    stepBackIcon.scale.set(0.07, 0.07, 1);
    stepBackIcon.position.copy(stepBackButton.position).setZ(stepBackButton.position.z + 0.01);
    stepBackIcon.renderOrder = 30;
    vrUiGroup.add(stepBackIcon);
    vrUiElements.stepBackIcon = stepBackIcon;

    const stepForwardResources = createIconTexture((context) => {
      context.fillStyle = 'rgba(255, 255, 255, 0.9)';
      context.beginPath();
      context.moveTo(86, 64);
      context.lineTo(86, 192);
      context.lineTo(206, 128);
      context.closePath();
      context.fill();
      context.fillRect(196, 64, 24, 128);
    });
    vrUiResources.stepForwardTexture = stepForwardResources.texture;
    const stepForwardIcon = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: stepForwardResources.texture, transparent: true })
    );
    stepForwardIcon.scale.set(0.07, 0.07, 1);
    stepForwardIcon.position.copy(stepForwardButton.position).setZ(stepForwardButton.position.z + 0.01);
    stepForwardIcon.renderOrder = 30;
    vrUiGroup.add(stepForwardIcon);
    vrUiElements.stepForwardIcon = stepForwardIcon;

    // If the volume dimensions were already resolved (e.g., when toggling
    // between 2D and 3D views), make sure the tracking overlay immediately
    // adopts the normalized transform. Otherwise the tracks momentarily render
    // in unnormalized dataset coordinates until another interaction triggers a
    // redraw.
    applyTrackGroupTransform(currentDimensionsRef.current);

    setTrackOverlayRevision((revision) => revision + 1);
    setRenderContextRevision((revision) => revision + 1);

    const camera = new THREE.PerspectiveCamera(
      38,
      container.clientWidth / container.clientHeight,
      0.0001,
      1000
    );
    camera.position.set(0, 0, 2.5);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    controls.dampingFactor = 0;
    controls.enablePan = false;
    controls.rotateSpeed = 0.65;
    controls.zoomSpeed = 0.7;
    controlsRef.current = controls;

    vrControllerStateRef.current = [];

    const controllerRayOrigin = new THREE.Vector3();
    const controllerRayDirection = new THREE.Vector3();
    const controllerMatrix = new THREE.Matrix4();

    const computeControllerIntersection = (controller: THREE.Group) => {
      controllerMatrix.identity().extractRotation(controller.matrixWorld);
      controllerRayDirection.set(0, 0, -1).applyMatrix4(controllerMatrix).normalize();
      controllerRayOrigin.setFromMatrixPosition(controller.matrixWorld);
      const raycaster = vrRaycasterRef.current;
      raycaster.set(controllerRayOrigin, controllerRayDirection);
      raycaster.far = 4;
      const interactables = vrUiInteractablesRef.current;
      if (!interactables || interactables.length === 0) {
        return null;
      }
      const intersections = raycaster.intersectObjects(interactables, false);
      if (!intersections || intersections.length === 0) {
        return null;
      }
      return intersections[0];
    };

    for (let index = 0; index < 2; index += 1) {
      const controller = renderer.xr.getController(index);
      controller.name = `vr-controller-${index}`;
      scene.add(controller);

      const lineGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, -1)
      ]);
      const lineMaterial = new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.85
      });
      const line = new THREE.Line(lineGeometry, lineMaterial);
      line.name = `vr-pointer-${index}`;
      line.scale.z = 1;
      line.visible = false;
      controller.add(line);

      const entry = {
        controller,
        line,
        onSelectStart: () => {},
        onSelectEnd: () => {},
        onConnected: () => {},
        onDisconnected: () => {},
        connected: false
      };

      const onSelectStart = () => {
        const intersection = computeControllerIntersection(controller);
        handleVrUiAction(intersection ? intersection.object : null);
      };

      const onSelectEnd = () => {
        applyVrHoverTarget(null);
      };

      const onConnected = () => {
        entry.connected = true;
        line.visible = true;
      };

      const onDisconnected = () => {
        entry.connected = false;
        applyVrHoverTarget(null);
        line.visible = false;
      };

      entry.onSelectStart = onSelectStart;
      entry.onSelectEnd = onSelectEnd;
      entry.onConnected = onConnected;
      entry.onDisconnected = onDisconnected;

      vrControllerStateRef.current.push(entry);

      controller.addEventListener('selectstart', onSelectStart);
      controller.addEventListener('selectend', onSelectEnd);
      controller.addEventListener('connected', onConnected);
      controller.addEventListener('disconnected', onDisconnected);
    }

    const domElement = renderer.domElement;

    const pointerVector = new THREE.Vector2();
    const raycaster = new (THREE as unknown as { Raycaster: new () => RaycasterLike }).Raycaster();
    raycaster.params.Line = { threshold: 0.02 };
    (raycaster.params as unknown as { Line2?: { threshold: number } }).Line2 = {
      threshold: 0.02
    };
    raycasterRef.current = raycaster;

    const performHoverHitTest = (event: PointerEvent): number | null => {
      const cameraInstance = cameraRef.current;
      const trackGroupInstance = trackGroupRef.current;
      const raycasterInstance = raycasterRef.current;
      if (!cameraInstance || !trackGroupInstance || !raycasterInstance || !trackGroupInstance.visible) {
        clearHoverState();
        return null;
      }

      const rect = domElement.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;
      if (width <= 0 || height <= 0) {
        clearHoverState();
        return null;
      }

      const offsetX = event.clientX - rect.left;
      const offsetY = event.clientY - rect.top;
      if (offsetX < 0 || offsetY < 0 || offsetX > width || offsetY > height) {
        clearHoverState();
        return null;
      }

      pointerVector.set((offsetX / width) * 2 - 1, -(offsetY / height) * 2 + 1);
      raycasterInstance.setFromCamera(pointerVector, cameraInstance);

      const visibleLines: Line2[] = [];
      for (const resource of trackLinesRef.current.values()) {
        if (resource.line.visible) {
          visibleLines.push(resource.line);
        }
      }

      if (visibleLines.length === 0) {
        clearHoverState();
        return null;
      }

      const intersections = raycasterInstance.intersectObjects(visibleLines, false);
      if (intersections.length === 0) {
        clearHoverState();
        return null;
      }

      const intersection = intersections[0];
      const hitObject = intersection.object as unknown as { userData: Record<string, unknown> };
      const trackId =
        typeof hitObject.userData.trackId === 'string'
          ? (hitObject.userData.trackId as string)
          : null;
      if (trackId === null) {
        clearHoverState();
        return null;
      }

      updateHoverState(trackId, { x: offsetX, y: offsetY });
      return trackId;
    };

    const handlePointerDown = (event: PointerEvent) => {
      const controls = controlsRef.current;
      const cameraInstance = cameraRef.current;
      if (!controls || !cameraInstance) {
        return;
      }

      if (event.button !== 0) {
        return;
      }

      const mode = event.ctrlKey ? 'dolly' : event.shiftKey ? 'pan' : null;

      if (!mode) {
        const hitTrackId = performHoverHitTest(event);
        if (hitTrackId !== null) {
          onTrackFollowRequest(hitTrackId);
        }
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const previousEnablePan = mode === 'pan' ? controls.enablePan : null;
      if (mode === 'pan') {
        controls.enablePan = true;
      }

      clearHoverState();

      pointerStateRef.current = {
        mode,
        pointerId: event.pointerId,
        lastX: event.clientX,
        lastY: event.clientY,
        previousControlsEnabled: controls.enabled,
        previousEnablePan
      };
      controls.enabled = false;

      try {
        domElement.setPointerCapture(event.pointerId);
      } catch (error) {
        // Ignore errors from unsupported pointer capture (e.g., Safari)
      }
    };

    const handlePointerMove = (event: PointerEvent) => {
      const state = pointerStateRef.current;
      if (!state || event.pointerId !== state.pointerId) {
        performHoverHitTest(event);
        return;
      }

      clearHoverState();

      const controls = controlsRef.current;
      const camera = cameraRef.current;
      if (!controls || !camera) {
        return;
      }

      const deltaX = event.clientX - state.lastX;
      const deltaY = event.clientY - state.lastY;

      if (state.mode === 'pan') {
        (controls as unknown as { pan: (dx: number, dy: number) => void }).pan(deltaX, deltaY);
        rotationTargetRef.current.copy(controls.target);
      } else {
        const rotationTarget = rotationTargetRef.current;
        camera.getWorldDirection(dollyDirection);
        const distance = rotationTarget.distanceTo(camera.position);
        const depthScale = Math.max(distance * 0.0025, 0.0006);
        const moveAmount = -deltaY * depthScale;
        dollyDirection.multiplyScalar(moveAmount);
        camera.position.add(dollyDirection);
        controls.target.copy(rotationTarget);
      }

      controls.update();
      state.lastX = event.clientX;
      state.lastY = event.clientY;
    };

    const handlePointerUp = (event: PointerEvent) => {
      const state = pointerStateRef.current;
      if (!state || event.pointerId !== state.pointerId) {
        performHoverHitTest(event);
        return;
      }

      const controls = controlsRef.current;
      if (controls) {
        controls.enabled = state.previousControlsEnabled;
        if (state.mode === 'pan' && state.previousEnablePan !== null) {
          controls.enablePan = state.previousEnablePan;
        }
      }

      try {
        domElement.releasePointerCapture(event.pointerId);
      } catch (error) {
        // Ignore errors from unsupported pointer capture (e.g., Safari)
      }

      pointerStateRef.current = null;
      performHoverHitTest(event);
    };

    const handlePointerLeave = () => {
      clearHoverState();
    };

    const pointerDownOptions: AddEventListenerOptions = { capture: true };

    domElement.addEventListener('pointerdown', handlePointerDown, pointerDownOptions);
    domElement.addEventListener('pointermove', handlePointerMove);
    domElement.addEventListener('pointerup', handlePointerUp);
    domElement.addEventListener('pointercancel', handlePointerUp);
    domElement.addEventListener('pointerleave', handlePointerLeave);

    rendererRef.current = renderer;
    sceneRef.current = scene;
    cameraRef.current = camera;

    const handleResize = (entries?: ResizeObserverEntry[]) => {
      const target = containerRef.current;
      if (!target || !rendererRef.current || !cameraRef.current) {
        return;
      }
      const width = target.clientWidth;
      const height = target.clientHeight;
      if (width > 0 && height > 0) {
        setHasMeasured(true);
      }
      rendererRef.current.setSize(width, height);
      if (width > 0 && height > 0) {
        for (const resource of trackLinesRef.current.values()) {
          resource.material.resolution.set(width, height);
          resource.material.needsUpdate = true;
          resource.outlineMaterial.resolution.set(width, height);
          resource.outlineMaterial.needsUpdate = true;
        }
      }
      cameraRef.current.aspect = width / height;
      cameraRef.current.updateProjectionMatrix();
    };

    const resizeObserver = new ResizeObserver((entries) => handleResize(entries));
    resizeObserver.observe(container);
    handleResize();

    const worldUp = new THREE.Vector3(0, 1, 0);
    const forwardVector = new THREE.Vector3();
    const horizontalForward = new THREE.Vector3();
    const rightVector = new THREE.Vector3();
    const movementVector = new THREE.Vector3();
    const dollyDirection = new THREE.Vector3();
    const activeCameraWorldPosition = new THREE.Vector3();
    const localCameraPosition = new THREE.Vector3();
    const vrUiTargetPosition = new THREE.Vector3();
    const vrUiDirection = new THREE.Vector3();
    const vrUiCameraQuaternion = new THREE.Quaternion();
    const vrUiQuaternionTarget = new THREE.Quaternion();
    const vrUiFlipQuaternion = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      Math.PI
    );

    const applyKeyboardMovement = () => {
      if (followedTrackIdRef.current !== null) {
        return;
      }
      const movementState = movementStateRef.current;
      if (
        !movementState ||
        (!movementState.moveForward &&
          !movementState.moveBackward &&
          !movementState.moveLeft &&
          !movementState.moveRight &&
          !movementState.moveUp &&
          !movementState.moveDown)
      ) {
        return;
      }

      const rotationTarget = rotationTargetRef.current;
      const distance = rotationTarget.distanceTo(camera.position);
      const movementScale = Math.max(distance * 0.0025, 0.0006);

      camera.getWorldDirection(forwardVector).normalize();
      horizontalForward.copy(forwardVector).projectOnPlane(worldUp);
      if (horizontalForward.lengthSq() < 1e-8) {
        horizontalForward.set(0, 0, forwardVector.z >= 0 ? 1 : -1);
      } else {
        horizontalForward.normalize();
      }

      rightVector.crossVectors(horizontalForward, worldUp);
      if (rightVector.lengthSq() < 1e-8) {
        rightVector.set(1, 0, 0);
      } else {
        rightVector.normalize();
      }

      movementVector.set(0, 0, 0);

      if (movementState.moveForward) {
        movementVector.addScaledVector(horizontalForward, movementScale);
      }
      if (movementState.moveBackward) {
        movementVector.addScaledVector(horizontalForward, -movementScale);
      }
      if (movementState.moveLeft) {
        movementVector.addScaledVector(rightVector, -movementScale);
      }
      if (movementState.moveRight) {
        movementVector.addScaledVector(rightVector, movementScale);
      }
      if (movementState.moveUp) {
        movementVector.addScaledVector(worldUp, movementScale);
      }
      if (movementState.moveDown) {
        movementVector.addScaledVector(worldUp, -movementScale);
      }

      if (movementVector.lengthSq() === 0) {
        return;
      }

      camera.position.add(movementVector);
      rotationTarget.add(movementVector);
      controls.target.copy(rotationTarget);
    };

    const renderLoop = () => {
      const isPresentingXR = renderer.xr.isPresenting;

      if (!isPresentingXR) {
        applyKeyboardMovement();
        controls.update();
      }

      const activeCamera = isPresentingXR
        ? (renderer.xr.getCamera(camera) as THREE.Camera)
        : camera;
      activeCamera.getWorldPosition(activeCameraWorldPosition);

      if (isPresentingXR) {
        const vrUiGroup = vrUiGroupRef.current;
        if (vrUiGroup) {
          activeCamera.getWorldDirection(vrUiDirection).normalize();
          vrUiTargetPosition
            .copy(activeCameraWorldPosition)
            .addScaledVector(vrUiDirection, 0.6)
            .addScaledVector(worldUp, 0.08);
          vrUiGroup.position.lerp(vrUiTargetPosition, 0.3);

          const arrayCamera = activeCamera as unknown as {
            isArrayCamera?: boolean;
            cameras?: THREE.PerspectiveCamera[];
          };
          if (arrayCamera.isArrayCamera && arrayCamera.cameras && arrayCamera.cameras.length > 0) {
            vrUiCameraQuaternion.copy(arrayCamera.cameras[0].quaternion);
          } else if (activeCamera.quaternion) {
            vrUiCameraQuaternion.copy(activeCamera.quaternion);
          } else {
            vrUiCameraQuaternion.copy(camera.quaternion);
          }

          vrUiQuaternionTarget.copy(vrUiCameraQuaternion);
          vrUiQuaternionTarget.multiply(vrUiFlipQuaternion);
          vrUiGroup.quaternion.slerp(vrUiQuaternionTarget, 0.3);
        }

        let hoveredObject: THREE.Object3D | null = null;
        let closestDistance = Number.POSITIVE_INFINITY;
        for (const controllerState of vrControllerStateRef.current) {
          const { controller, line, connected } = controllerState;
          if (line) {
            line.visible = connected;
          }
          if (!connected) {
            continue;
          }
          const intersection = computeControllerIntersection(controller);
          if (intersection) {
            if (line) {
              line.scale.z = Math.max(0.1, intersection.distance);
            }
            if (intersection.distance < closestDistance) {
              closestDistance = intersection.distance;
              hoveredObject = intersection.object;
            }
          } else if (line) {
            line.scale.z = 1.5;
          }
        }
        applyVrHoverTarget(hoveredObject);
      } else {
        for (const controllerState of vrControllerStateRef.current) {
          const { line } = controllerState;
          if (line) {
            line.visible = false;
          }
        }
        applyVrHoverTarget(null);
      }

      if (!isPresentingXR && followedTrackIdRef.current !== null) {
        const rotationTarget = rotationTargetRef.current;
        if (rotationTarget) {
          if (!trackFollowOffsetRef.current) {
            trackFollowOffsetRef.current = new THREE.Vector3();
          }
          trackFollowOffsetRef.current.copy(camera.position).sub(rotationTarget);
        }
      }

      const resources = resourcesRef.current;
      for (const resource of resources.values()) {
        const { mesh } = resource;
        mesh.updateMatrixWorld();

        if (resource.mode === '3d') {
          const material = mesh.material as { uniforms?: Record<string, { value: unknown }> };
          const cameraUniform = material.uniforms?.u_cameraPos?.value as
            | THREE.Vector3
            | undefined;
          if (cameraUniform) {
            localCameraPosition.copy(activeCameraWorldPosition);
            mesh.worldToLocal(localCameraPosition);
            cameraUniform.copy(localCameraPosition);
          }
        }
      }
      renderer.render(scene, activeCamera as THREE.Camera);
    };

    if (typeof renderer.setAnimationLoop === 'function') {
      renderer.setAnimationLoop(renderLoop);
    } else {
      const fallbackLoop = () => {
        renderLoop();
        animationFrameRef.current = requestAnimationFrame(fallbackLoop);
      };
      fallbackLoop();
    }

    return () => {
      const resources = resourcesRef.current;
      for (const resource of resources.values()) {
        scene.remove(resource.mesh);
        resource.mesh.geometry.dispose();
        resource.mesh.material.dispose();
        resource.texture.dispose();
      }
      resources.clear();

      for (const controllerState of vrControllerStateRef.current) {
        const { controller, line, onSelectStart, onSelectEnd, onConnected, onDisconnected } =
          controllerState;
        controller.removeEventListener('selectstart', onSelectStart);
        controller.removeEventListener('selectend', onSelectEnd);
        controller.removeEventListener('connected', onConnected);
        controller.removeEventListener('disconnected', onDisconnected);
        controllerState.connected = false;
        if (line.parent) {
          line.parent.remove(line);
        }
        if (line.geometry) {
          line.geometry.dispose();
        }
        if (line.material && typeof (line.material as THREE.Material).dispose === 'function') {
          (line.material as THREE.Material).dispose();
        }
        if (controller.parent) {
          controller.parent.remove(controller);
        }
      }
      vrControllerStateRef.current = [];

      const disposeMaterial = (material: unknown) => {
        if (!material) {
          return;
        }
        if (Array.isArray(material)) {
          material.forEach((entry) => disposeMaterial(entry));
          return;
        }
        const typed = material as THREE.Material & { map?: THREE.Texture | null };
        if (typed.map && typeof typed.map.dispose === 'function') {
          typed.map.dispose();
        }
        if (typeof typed.dispose === 'function') {
          typed.dispose();
        }
      };

      const disposeObject = (object: THREE.Object3D) => {
        const meshLike = object as unknown as {
          geometry?: { dispose?: () => void } | null;
          material?: THREE.Material | THREE.Material[] | null;
        };
        if (meshLike.geometry && typeof meshLike.geometry.dispose === 'function') {
          meshLike.geometry.dispose();
        }
        disposeMaterial(meshLike.material ?? null);
      };

      const vrUiGroup = vrUiGroupRef.current;
      if (vrUiGroup) {
        const children = [...vrUiGroup.children];
        for (const child of children) {
          vrUiGroup.remove(child);
          disposeObject(child);
        }
        if (vrUiGroup.parent) {
          vrUiGroup.parent.remove(vrUiGroup);
        }
      }
      vrUiGroupRef.current = null;
      vrUiInteractablesRef.current = [];
      vrHoverTargetRef.current = null;

      const vrUiResources = vrUiResourcesRef.current;
      if (vrUiResources.labelTexture) {
        vrUiResources.labelTexture.dispose();
      }
      if (vrUiResources.playIconTexture) {
        vrUiResources.playIconTexture.dispose();
      }
      if (vrUiResources.stepBackTexture) {
        vrUiResources.stepBackTexture.dispose();
      }
      if (vrUiResources.stepForwardTexture) {
        vrUiResources.stepForwardTexture.dispose();
      }
      vrUiResources.labelCanvas = null;
      vrUiResources.labelContext = null;
      vrUiResources.labelTexture = null;
      vrUiResources.playIconCanvas = null;
      vrUiResources.playIconContext = null;
      vrUiResources.playIconTexture = null;
      vrUiResources.stepBackTexture = null;
      vrUiResources.stepForwardTexture = null;

      const trackGroup = trackGroupRef.current;
      if (trackGroup) {
        for (const resource of trackLinesRef.current.values()) {
          trackGroup.remove(resource.line);
          trackGroup.remove(resource.outline);
          resource.geometry.dispose();
          resource.material.dispose();
          resource.outlineMaterial.dispose();
        }
        trackLinesRef.current.clear();
      }
      trackGroupRef.current = null;

      const volumeRootGroup = volumeRootGroupRef.current;
      if (volumeRootGroup) {
        if (trackGroup && trackGroup.parent === volumeRootGroup) {
          volumeRootGroup.remove(trackGroup);
        }
        volumeRootGroup.clear();
        if (volumeRootGroup.parent) {
          volumeRootGroup.parent.remove(volumeRootGroup);
        }
      }
      volumeRootGroupRef.current = null;
      clearHoverState();

      domElement.removeEventListener('pointerdown', handlePointerDown, pointerDownOptions);
      domElement.removeEventListener('pointermove', handlePointerMove);
      domElement.removeEventListener('pointerup', handlePointerUp);
      domElement.removeEventListener('pointercancel', handlePointerUp);
      domElement.removeEventListener('pointerleave', handlePointerLeave);

      const activePointerState = pointerStateRef.current;
      if (activePointerState && controlsRef.current) {
        controlsRef.current.enabled = activePointerState.previousControlsEnabled;
        if (activePointerState.mode === 'pan' && activePointerState.previousEnablePan !== null) {
          controlsRef.current.enablePan = activePointerState.previousEnablePan;
        }
      }
      pointerStateRef.current = null;

      raycasterRef.current = null;

      if (typeof renderer.setAnimationLoop === 'function') {
        renderer.setAnimationLoop(null);
      }
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      resizeObserver.disconnect();
      controls.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
    };
  }, [applyTrackGroupTransform, applyVolumeRootTransform, containerNode]);

  useEffect(() => {
    const vrUiElements = vrUiElementsRef.current;
    const vrUiResources = vrUiResourcesRef.current;

    if (vrUiResources.labelCanvas && vrUiResources.labelContext && vrUiResources.labelTexture) {
      const canvas = vrUiResources.labelCanvas;
      const context = vrUiResources.labelContext;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = 'rgba(12, 16, 24, 0)';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = 'rgba(255, 255, 255, 0.94)';
      context.textAlign = 'center';
      context.textBaseline = 'middle';

      const totalFrames = Math.max(totalTimepoints, 0);
      const currentFrame = totalTimepoints > 0 ? timeIndex + 1 : 0;
      const header = totalFrames > 0 ? `Timepoint ${currentFrame} / ${totalFrames}` : 'No frames loaded';
      context.font = '600 60px sans-serif';
      context.fillText(header, canvas.width / 2, canvas.height * 0.38);

      const status = isPlaying ? 'Playing' : 'Paused';
      context.font = '500 48px sans-serif';
      context.fillStyle = 'rgba(255, 255, 255, 0.82)';
      context.fillText(status, canvas.width / 2, canvas.height * 0.62);

      if (isLoading) {
        const progress = Math.round(Math.min(Math.max(loadingProgress, 0), 1) * 100);
        context.font = '400 40px sans-serif';
        context.fillStyle = 'rgba(255, 255, 255, 0.7)';
        context.fillText(`Loading… ${progress}%`, canvas.width / 2, canvas.height * 0.82);
      } else {
        const clampedLoaded = expectedVolumes > 0 ? Math.min(loadedVolumes, expectedVolumes) : loadedVolumes;
        const detailLine = expectedVolumes > 0
          ? `Volumes ${clampedLoaded}/${expectedVolumes} · Trigger: interact`
          : 'Trigger: interact · Grip: move';
        context.font = '400 36px sans-serif';
        context.fillStyle = 'rgba(255, 255, 255, 0.6)';
        context.fillText(detailLine, canvas.width / 2, canvas.height * 0.82);
      }

      vrUiResources.labelTexture.needsUpdate = true;
    }

    if (
      vrUiResources.playIconCanvas &&
      vrUiResources.playIconContext &&
      vrUiResources.playIconTexture
    ) {
      const canvas = vrUiResources.playIconCanvas;
      const context = vrUiResources.playIconContext;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = 'rgba(255, 255, 255, 0.95)';
      if (isPlaying) {
        const barWidth = canvas.width * 0.18;
        const barHeight = canvas.height * 0.5;
        const top = (canvas.height - barHeight) / 2;
        const leftBar = canvas.width * 0.32;
        const rightBar = canvas.width * 0.5;
        context.fillRect(leftBar, top, barWidth, barHeight);
        context.fillRect(rightBar, top, barWidth, barHeight);
      } else {
        context.beginPath();
        context.moveTo(canvas.width * 0.32, canvas.height * 0.26);
        context.lineTo(canvas.width * 0.32, canvas.height * 0.74);
        context.lineTo(canvas.width * 0.72, canvas.height * 0.5);
        context.closePath();
        context.fill();
      }
      vrUiResources.playIconTexture.needsUpdate = true;
    }

    const updateButtonState = (button: THREE.Mesh | null, disabled: boolean) => {
      if (!button) {
        return;
      }
      const material = button.material as THREE.MeshBasicMaterial;
      const baseColor =
        button.userData?.defaultBaseColor ?? button.userData?.baseColor ?? material.color?.getHex?.() ?? 0x5b8cff;
      const baseOpacity =
        button.userData?.defaultBaseOpacity ?? button.userData?.baseOpacity ?? material.opacity ?? 0.95;
      button.userData.disabled = disabled;
      const activeOpacity = disabled ? 0.35 : baseOpacity;
      material.opacity = activeOpacity;
      button.userData.baseOpacity = activeOpacity;
      button.userData.baseColor = baseColor;
      if (material.color) {
        material.color.setHex(baseColor);
      }
    };

    const totalFrames = Math.max(totalTimepoints, 0);
    updateButtonState(vrUiElements.stepBackButton, totalFrames <= 0 || timeIndex <= 0);
    updateButtonState(
      vrUiElements.stepForwardButton,
      totalFrames <= 0 || timeIndex >= Math.max(totalFrames - 1, 0)
    );
    updateButtonState(vrUiElements.playButton, totalFrames <= 0);

    if (vrUiElements.playIcon) {
      const spriteMaterial = vrUiElements.playIcon.material as THREE.SpriteMaterial;
      spriteMaterial.opacity = totalFrames > 0 ? 1 : 0.35;
    }

    const progressFill = vrUiElements.progressFill;
    const progressBackground = vrUiElements.progressBackground;
    if (progressBackground) {
      progressBackground.visible = totalFrames > 1;
    }
    if (progressFill) {
      if (totalFrames > 1) {
        const denominator = Math.max(totalFrames - 1, 1);
        const ratio = Math.min(Math.max(timeIndex / denominator, 0), 1);
        progressFill.visible = true;
        progressFill.scale.x = Math.max(ratio, 0.001);
        const halfWidth = 0.23;
        progressFill.position.x = -halfWidth + halfWidth * progressFill.scale.x;
      } else {
        progressFill.visible = false;
      }
    }
  }, [
    expectedVolumes,
    isLoading,
    isPlaying,
    loadingProgress,
    loadedVolumes,
    timeIndex,
    totalTimepoints
  ]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) {
      return;
    }

    const handleSessionStart = () => {
      const controls = controlsRef.current;
      const movementState = movementStateRef.current;
      const pointerState = pointerStateRef.current;

      if (pointerState) {
        try {
          renderer.domElement.releasePointerCapture(pointerState.pointerId);
        } catch (error) {
          // Ignore pointer capture release failures.
        }
        if (controls) {
          controls.enabled = pointerState.previousControlsEnabled;
          if (pointerState.mode === 'pan' && pointerState.previousEnablePan !== null) {
            controls.enablePan = pointerState.previousEnablePan;
          }
        }
        pointerStateRef.current = null;
      }

      if (controls) {
        controlsEnabledBeforeVRRef.current = controls.enabled;
        controls.enabled = false;
      }

      if (movementState) {
        movementState.moveForward = false;
        movementState.moveBackward = false;
        movementState.moveLeft = false;
        movementState.moveRight = false;
        movementState.moveUp = false;
        movementState.moveDown = false;
      }

      const vrUiGroup = vrUiGroupRef.current;
      if (vrUiGroup) {
        vrUiGroup.visible = true;
      }
      setIsVrPresenting(true);
      applyVrHoverTarget(null);
      clearHoverState();
    };

    const handleSessionEnd = () => {
      const controls = controlsRef.current;
      if (controls) {
        controls.enabled = controlsEnabledBeforeVRRef.current;
        controls.update();
      }
      const vrUiGroup = vrUiGroupRef.current;
      if (vrUiGroup) {
        vrUiGroup.visible = false;
      }
      applyVrHoverTarget(null);
      setIsVrPresenting(false);
    };

    renderer.xr.addEventListener('sessionstart', handleSessionStart);
    renderer.xr.addEventListener('sessionend', handleSessionEnd);

    return () => {
      renderer.xr.removeEventListener('sessionstart', handleSessionStart);
      renderer.xr.removeEventListener('sessionend', handleSessionEnd);
    };
  }, [applyVrHoverTarget, clearHoverState]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer || isVrPresenting) {
      return;
    }

    const targetContainer = vrButtonContainer ?? containerRef.current;
    if (!targetContainer) {
      return;
    }

    const button = VRButton.createButton(renderer);
    button.classList.add('viewer-vr-button');
    button.style.cssText = '';
    button.setAttribute('aria-label', 'Toggle VR session');
    button.setAttribute('title', 'Toggle VR session');
    targetContainer.appendChild(button);

    return () => {
      if (button.parentNode) {
        button.parentNode.removeChild(button);
      }
    };
  }, [isVrPresenting, renderContextRevision, vrButtonContainer]);

  useEffect(() => {
    const handleKeyChange = (event: KeyboardEvent, isPressed: boolean) => {
      const mappedKey = MOVEMENT_KEY_MAP[event.code];
      if (!mappedKey) {
        return;
      }

      const target = event.target as HTMLElement | null;
      if (target) {
        const tagName = target.tagName;
        const isEditable = target.isContentEditable;
        if (isEditable || tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') {
          return;
        }
      }

      event.preventDefault();

      if (followedTrackIdRef.current !== null) {
        return;
      }

      const movementState = movementStateRef.current;
      if (!movementState) {
        return;
      }

      movementState[mappedKey] = isPressed;
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      handleKeyChange(event, true);
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      handleKeyChange(event, false);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      const movementState = movementStateRef.current;
      if (movementState) {
        movementState.moveForward = false;
        movementState.moveBackward = false;
        movementState.moveLeft = false;
        movementState.moveRight = false;
        movementState.moveUp = false;
        movementState.moveDown = false;
      }
    };
  }, []);

  useEffect(() => {
    const removeResource = (key: string) => {
      const resource = resourcesRef.current.get(key);
      if (!resource) {
        return;
      }
      const updater = resource.mesh.userData?.__volumeCameraUniformUpdater;
      if (updater?.dispose) {
        updater.dispose();
      }
      if (resource.mesh.userData) {
        delete resource.mesh.userData.__volumeCameraUniformUpdater;
      }
      const parent = resource.mesh.parent;
      if (parent) {
        parent.remove(resource.mesh);
      } else {
        const activeScene = sceneRef.current;
        if (activeScene) {
          activeScene.remove(resource.mesh);
        }
      }
      resource.mesh.geometry.dispose();
      resource.mesh.material.dispose();
      resource.texture.dispose();
      resourcesRef.current.delete(key);
    };

    const removeAllResources = () => {
      for (const key of Array.from(resourcesRef.current.keys())) {
        removeResource(key);
      }
    };

    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!scene || !camera || !controls) {
      removeAllResources();
      currentDimensionsRef.current = null;
      applyVolumeRootTransform(null);
      return;
    }

    const referenceVolume = primaryVolume;

    if (!referenceVolume) {
      removeAllResources();
      currentDimensionsRef.current = null;
      rotationTargetRef.current.set(0, 0, 0);
      controls.target.set(0, 0, 0);
      controls.update();
      defaultViewStateRef.current = {
        position: camera.position.clone(),
        target: controls.target.clone()
      };
      const trackGroup = trackGroupRef.current;
      if (trackGroup) {
        trackGroup.visible = false;
      }
      applyTrackGroupTransform(null);
      applyVolumeRootTransform(null);
      return;
    }

    const { width, height, depth } = referenceVolume;
    const dimensionsChanged =
      !currentDimensionsRef.current ||
      currentDimensionsRef.current.width !== width ||
      currentDimensionsRef.current.height !== height ||
      currentDimensionsRef.current.depth !== depth;

    if (dimensionsChanged) {
      removeAllResources();
      currentDimensionsRef.current = { width, height, depth };

      const maxDimension = Math.max(width, height, depth);
      const scale = 1 / maxDimension;
      const boundingRadius = Math.sqrt(width * width + height * height + depth * depth) * scale * 0.5;
      const fovInRadians = THREE.MathUtils.degToRad(camera.fov * 0.5);
      const distance = boundingRadius / Math.sin(fovInRadians);
      const safeDistance = Number.isFinite(distance) ? distance * 1.2 : 2.5;
      const nearDistance = Math.max(0.0001, boundingRadius * 0.00025);
      const farDistance = Math.max(safeDistance * 5, boundingRadius * 10);
      if (camera.near !== nearDistance || camera.far !== farDistance) {
        camera.near = nearDistance;
        camera.far = farDistance;
        camera.updateProjectionMatrix();
      }
      camera.position.set(0, 0, safeDistance);
      const rotationTarget = rotationTargetRef.current;
      rotationTarget.set(0, 0, 0);
      controls.target.copy(rotationTarget);
      controls.update();
      defaultViewStateRef.current = {
        position: camera.position.clone(),
        target: controls.target.clone()
      };
      controls.saveState();

      applyTrackGroupTransform({ width, height, depth });
      applyVolumeRootTransform({ width, height, depth });
    }

    const seenKeys = new Set<string>();

    layers.forEach((layer, index) => {
      const volume = layer.volume;
      if (!volume) {
        removeResource(layer.key);
        return;
      }

      let cachedPreparation: ReturnType<typeof getCachedTextureData> | null = null;

      const isGrayscale = volume.channels === 1;
      const colormapTexture = getColormapTexture(
        isGrayscale ? layer.color : DEFAULT_LAYER_COLOR
      );

      let resources: VolumeResources | null = resourcesRef.current.get(layer.key) ?? null;

      const viewerMode = layer.mode === 'slice' || layer.mode === '3d'
        ? layer.mode
        : volume.depth > 1
        ? '3d'
        : 'slice';
      const zIndex = Number.isFinite(layer.sliceIndex)
        ? Number(layer.sliceIndex)
        : Math.floor(volume.depth / 2);

      if (viewerMode === '3d') {
        cachedPreparation = getCachedTextureData(volume);
        const { data: textureData, format: textureFormat } = cachedPreparation;

        const needsRebuild =
          !resources ||
          resources.mode !== viewerMode ||
          resources.dimensions.width !== volume.width ||
          resources.dimensions.height !== volume.height ||
          resources.dimensions.depth !== volume.depth ||
          resources.channels !== volume.channels ||
          !(resources.texture instanceof THREE.Data3DTexture) ||
          resources.texture.image.data.length !== textureData.length ||
          resources.texture.format !== textureFormat;

        if (needsRebuild) {
          removeResource(layer.key);

          const texture = new THREE.Data3DTexture(textureData, volume.width, volume.height, volume.depth);
          texture.format = textureFormat;
          texture.type = THREE.UnsignedByteType;
          texture.minFilter = THREE.LinearFilter;
          texture.magFilter = THREE.LinearFilter;
          texture.unpackAlignment = 1;
          texture.colorSpace = THREE.LinearSRGBColorSpace;
          texture.needsUpdate = true;

          const shader = VolumeRenderShader;
          const uniforms = THREE.UniformsUtils.clone(shader.uniforms);
          uniforms.u_data.value = texture;
          uniforms.u_size.value.set(volume.width, volume.height, volume.depth);
          uniforms.u_clim.value.set(0, 1);
          uniforms.u_renderstyle.value = 0;
          uniforms.u_renderthreshold.value = 0.5;
          uniforms.u_cmdata.value = colormapTexture;
          uniforms.u_channels.value = volume.channels;
          uniforms.u_contrast.value = layer.contrast;
          uniforms.u_brightness.value = layer.brightness;

          const material = new THREE.ShaderMaterial({
            uniforms,
            vertexShader: shader.vertexShader,
            fragmentShader: shader.fragmentShader,
            side: THREE.BackSide,
            transparent: true
          });
          const baseMaterial = material as unknown as { depthWrite: boolean };
          baseMaterial.depthWrite = false;

          const geometry = new THREE.BoxGeometry(volume.width, volume.height, volume.depth);
          geometry.translate(volume.width / 2 - 0.5, volume.height / 2 - 0.5, volume.depth / 2 - 0.5);

          const mesh = new THREE.Mesh(geometry, material);
          const meshObject = mesh as unknown as { visible: boolean; renderOrder: number };
          meshObject.visible = layer.visible;
          meshObject.renderOrder = index;
          mesh.position.set(layer.offsetX, layer.offsetY, 0);

          const volumeRootGroup = volumeRootGroupRef.current;
          if (volumeRootGroup) {
            volumeRootGroup.add(mesh);
          } else {
            scene.add(mesh);
          }
          mesh.updateMatrixWorld(true);

          const cameraUniform = mesh.material.uniforms.u_cameraPos.value;
          cameraUniform.copy(camera.position);
          mesh.worldToLocal(cameraUniform);
          ensureVolumeCameraUniformUpdater(mesh, cameraUniform);

          resourcesRef.current.set(layer.key, {
            mesh,
            texture,
            dimensions: { width: volume.width, height: volume.height, depth: volume.depth },
            channels: volume.channels,
            mode: viewerMode
          });
        }

        resources = resourcesRef.current.get(layer.key) ?? null;
      } else {
        const maxIndex = Math.max(0, volume.depth - 1);
        const clampedIndex = Math.min(Math.max(zIndex, 0), maxIndex);
        const expectedLength = getExpectedSliceBufferLength(volume);

        const needsRebuild =
          !resources ||
          resources.mode !== viewerMode ||
          resources.dimensions.width !== volume.width ||
          resources.dimensions.height !== volume.height ||
          resources.dimensions.depth !== volume.depth ||
          resources.channels !== volume.channels ||
          !(resources.texture instanceof THREE.DataTexture) ||
          (resources.sliceBuffer?.length ?? 0) !== expectedLength;

        if (needsRebuild) {
          removeResource(layer.key);

          const sliceInfo = prepareSliceTexture(volume, clampedIndex, null);
          const texture = new THREE.DataTexture(
            sliceInfo.data,
            volume.width,
            volume.height,
            sliceInfo.format
          );
          texture.type = THREE.UnsignedByteType;
          texture.minFilter = THREE.LinearFilter;
          texture.magFilter = THREE.LinearFilter;
          texture.unpackAlignment = 1;
          texture.colorSpace = THREE.LinearSRGBColorSpace;
          texture.needsUpdate = true;

          const shader = SliceRenderShader;
          const uniforms = THREE.UniformsUtils.clone(shader.uniforms);
          uniforms.u_slice.value = texture;
          uniforms.u_cmdata.value = colormapTexture;
          uniforms.u_channels.value = volume.channels;
          uniforms.u_contrast.value = layer.contrast;
          uniforms.u_brightness.value = layer.brightness;

          const material = new THREE.ShaderMaterial({
            uniforms,
            vertexShader: shader.vertexShader,
            fragmentShader: shader.fragmentShader,
            transparent: true,
            side: THREE.DoubleSide,
            depthTest: false,
            depthWrite: false
          });

          const geometry = new THREE.PlaneGeometry(volume.width, volume.height);
          geometry.translate(volume.width / 2 - 0.5, volume.height / 2 - 0.5, 0);

          const mesh = new THREE.Mesh(geometry, material);
          mesh.position.set(layer.offsetX, layer.offsetY, clampedIndex);
          const meshObject = mesh as unknown as { visible: boolean; renderOrder: number };
          meshObject.visible = layer.visible;
          meshObject.renderOrder = index;
          const volumeRootGroup = volumeRootGroupRef.current;
          if (volumeRootGroup) {
            volumeRootGroup.add(mesh);
          } else {
            scene.add(mesh);
          }

          resourcesRef.current.set(layer.key, {
            mesh,
            texture,
            dimensions: { width: volume.width, height: volume.height, depth: volume.depth },
            channels: volume.channels,
            mode: viewerMode,
            sliceBuffer: sliceInfo.data
          });
        }

        resources = resourcesRef.current.get(layer.key) ?? null;
      }

      if (resources) {
        const { mesh } = resources;
        const meshObject = mesh as unknown as { visible: boolean; renderOrder: number };
        meshObject.visible = layer.visible;
        meshObject.renderOrder = index;

        const materialUniforms = (mesh.material as THREE.ShaderMaterial).uniforms;
        materialUniforms.u_channels.value = volume.channels;
        materialUniforms.u_contrast.value = layer.contrast;
        materialUniforms.u_brightness.value = layer.brightness;
        materialUniforms.u_cmdata.value = colormapTexture;

        if (resources.mode === '3d') {
          const preparation = cachedPreparation ?? getCachedTextureData(volume);
          const dataTexture = resources.texture as THREE.Data3DTexture;
          dataTexture.image.data = preparation.data;
          dataTexture.format = preparation.format;
          dataTexture.needsUpdate = true;
          materialUniforms.u_data.value = dataTexture;

          const desiredX = layer.offsetX;
          const desiredY = layer.offsetY;
          if (mesh.position.x !== desiredX || mesh.position.y !== desiredY) {
            mesh.position.set(desiredX, desiredY, mesh.position.z);
            mesh.updateMatrixWorld();
          }

          const localCameraPosition = camera.position.clone();
          mesh.updateMatrixWorld();
          mesh.worldToLocal(localCameraPosition);
          materialUniforms.u_cameraPos.value.copy(localCameraPosition);
          ensureVolumeCameraUniformUpdater(mesh, materialUniforms.u_cameraPos.value);
        } else {
          const maxIndex = Math.max(0, volume.depth - 1);
          const clampedIndex = Math.min(Math.max(zIndex, 0), maxIndex);
          const existingBuffer = resources.sliceBuffer ?? null;
          const sliceInfo = prepareSliceTexture(volume, clampedIndex, existingBuffer);
          resources.sliceBuffer = sliceInfo.data;
          const dataTexture = resources.texture as THREE.DataTexture;
          dataTexture.image.data = sliceInfo.data;
          dataTexture.image.width = volume.width;
          dataTexture.image.height = volume.height;
          dataTexture.format = sliceInfo.format;
          dataTexture.needsUpdate = true;
          materialUniforms.u_slice.value = dataTexture;
          const desiredX = layer.offsetX;
          const desiredY = layer.offsetY;
          if (
            mesh.position.x !== desiredX ||
            mesh.position.y !== desiredY ||
            mesh.position.z !== clampedIndex
          ) {
            mesh.position.set(desiredX, desiredY, clampedIndex);
            mesh.updateMatrixWorld();
          }
        }

        const cameraUniform = materialUniforms.u_cameraPos?.value as THREE.Vector3 | undefined;
        if (cameraUniform) {
          const localCameraPosition = camera.position.clone();
          mesh.updateMatrixWorld();
          mesh.worldToLocal(localCameraPosition);
          cameraUniform.copy(localCameraPosition);
        }
      }

      seenKeys.add(layer.key);
    });

    for (const key of Array.from(resourcesRef.current.keys())) {
      if (!seenKeys.has(key)) {
        removeResource(key);
      }
    }

  }, [applyTrackGroupTransform, getColormapTexture, layers, renderContextRevision]);

  useEffect(() => {
    return () => {
      for (const texture of colormapCacheRef.current.values()) {
        texture.dispose();
      }
      colormapCacheRef.current.clear();
    };
  }, []);

  const hoveredTrackDefinition = hoveredTrackId ? trackLookup.get(hoveredTrackId) ?? null : null;
  const hoveredTrackLabel = hoveredTrackDefinition
    ? `${hoveredTrackDefinition.channelName} · Track #${hoveredTrackDefinition.trackNumber}`
    : null;

  const rootClassName = `volume-viewer${isVrPresenting ? ' is-vr-presenting' : ''}`;

  return (
    <div className={rootClassName}>
      <section className="viewer-surface">
        {!isVrPresenting && showLoadingOverlay && (
          <div className="overlay">
            <div className="loading-panel">
              <span className="loading-title">Loading dataset…</span>
            </div>
          </div>
        )}
        <div className={`render-surface${hasMeasured ? ' is-ready' : ''}`} ref={handleContainerRef}>
          {!isVrPresenting && hoveredTrackLabel && tooltipPosition ? (
            <div
              className="track-tooltip"
              style={{ left: `${tooltipPosition.x}px`, top: `${tooltipPosition.y}px` }}
              role="status"
              aria-live="polite"
            >
              {hoveredTrackLabel}
            </div>
          ) : null}
          {!isVrPresenting ? (
            <div className="vr-button-container" ref={handleVrButtonContainerRef} />
          ) : null}
        </div>
      </section>
    </div>
  );
}

export default VolumeViewer;
