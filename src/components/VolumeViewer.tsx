import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { Line2 } from 'three/examples/jsm/lines/Line2';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial';
import type { NormalizedVolume } from '../volumeProcessing';
import type { HoveredVoxelInfo } from '../types/hover';
import { VolumeRenderShader } from '../shaders/volumeRenderShader';
import { SliceRenderShader } from '../shaders/sliceRenderShader';
import { getCachedTextureData } from '../textureCache';
import './VolumeViewer.css';
import type { TrackColorMode, TrackDefinition } from '../types/tracks';
import { createVolumeRenderContext } from '../hooks/useVolumeRenderSetup';
import type {
  MovementState,
  TrackLineResource,
  VolumeResources,
  VolumeViewerProps,
} from './VolumeViewer.types';
import type {
  UseVolumeViewerVrParams,
  UseVolumeViewerVrResult,
  VrUiTarget,
  VrUiTargetType,
} from './volume-viewer/useVolumeViewerVr';
import { VolumeViewerVrBridge } from './volume-viewer/VolumeViewerVrBridge';
import {
  DESKTOP_VOLUME_STEP_SCALE,
  VR_PLAYBACK_MAX_FPS,
  VR_PLAYBACK_MIN_FPS,
  VR_VOLUME_BASE_OFFSET,
} from './volume-viewer/vr/constants';
import { DEFAULT_LAYER_COLOR, normalizeHexColor } from '../layerColors';
import {
  createTrackColor,
  DEFAULT_TRACK_COLOR,
  getTrackColorHex,
  normalizeTrackColor,
} from '../trackColors';
import {
  brightnessContrastModel,
  computeContrastMultiplier,
  formatContrastMultiplier,
  DEFAULT_WINDOW_MIN,
  DEFAULT_WINDOW_MAX
} from '../state/layerSettings';
import { DEFAULT_TRACK_LINE_WIDTH, DEFAULT_TRACK_OPACITY } from './volume-viewer/constants';
import { formatChannelValuesDetailed } from '../utils/intensityFormatting';
import { sampleRawValuesAtPosition, sampleSegmentationLabel } from '../utils/hoverSampling';

type VrUiTargetDescriptor = { type: VrUiTargetType; data?: unknown };

function isVrUiTargetType(value: unknown): value is VrUiTargetType {
  if (typeof value !== 'string') {
    return false;
  }
  return (
    value.startsWith('playback-') ||
    value.startsWith('channels-') ||
    value.startsWith('tracks-') ||
    value.startsWith('volume-')
  );
}

function isVrUiTargetDescriptor(value: unknown): value is VrUiTargetDescriptor {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const descriptor = value as { type?: unknown };
  return isVrUiTargetType(descriptor.type);
}

function getTrackIdFromObject(object: THREE.Object3D): string | null {
  const trackId = object.userData?.trackId;
  return typeof trackId === 'string' ? trackId : null;
}

function disposeMaterial(material: THREE.Material | THREE.Material[] | null | undefined) {
  if (Array.isArray(material)) {
    material.forEach((entry) => entry?.dispose?.());
    return;
  }
  material?.dispose?.();
}
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

const SELECTED_TRACK_BLINK_PERIOD_MS = 1600;
const SELECTED_TRACK_BLINK_BASE = 0.85;
const SELECTED_TRACK_BLINK_RANGE = 0.15;
const TRACK_END_CAP_RADIUS_MULTIPLIER = 0.35;
const TRACK_END_CAP_MIN_RADIUS = 0.12;
const TRACK_LINE_WIDTH_MIN = 0.5;
const TRACK_LINE_WIDTH_MAX = 5;
const TRACK_END_CAP_RADIUS_AT_MIN_WIDTH = TRACK_LINE_WIDTH_MIN * TRACK_END_CAP_RADIUS_MULTIPLIER;
const TRACK_END_CAP_RADIUS_AT_MAX_WIDTH =
  TRACK_LINE_WIDTH_MAX * TRACK_END_CAP_RADIUS_MULTIPLIER * 0.5;
const TRACK_END_CAP_RADIUS_SLOPE =
  (TRACK_END_CAP_RADIUS_AT_MAX_WIDTH - TRACK_END_CAP_RADIUS_AT_MIN_WIDTH) /
  (TRACK_LINE_WIDTH_MAX - TRACK_LINE_WIDTH_MIN);
const TRACK_END_CAP_RADIUS_INTERCEPT =
  TRACK_END_CAP_RADIUS_AT_MIN_WIDTH - TRACK_END_CAP_RADIUS_SLOPE * TRACK_LINE_WIDTH_MIN;
const FOLLOWED_TRACK_LINE_WIDTH_MULTIPLIER = 1.35;
const SELECTED_TRACK_LINE_WIDTH_MULTIPLIER = 1.5;
const HOVERED_TRACK_LINE_WIDTH_MULTIPLIER = 1.2;
const MIP_MAX_STEPS = 887;
const MIP_REFINEMENT_STEPS = 4;
const HOVER_HIGHLIGHT_RADIUS_VOXELS = 1.5;
const HOVER_PULSE_SPEED = 0.009;

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const VIEWER_YAW_FORWARD_REFERENCE = new THREE.Vector3(0, 0, -1);
const VIEWER_YAW_RIGHT_REFERENCE = new THREE.Vector3(1, 0, 0);
const viewerYawQuaternionTemp = new THREE.Quaternion();
const viewerYawForwardTemp = new THREE.Vector3();
const hoverPointerVector = new THREE.Vector2();
const hoverInverseMatrix = new THREE.Matrix4();
const hoverStart = new THREE.Vector3();
const hoverEnd = new THREE.Vector3();
const hoverStep = new THREE.Vector3();
const hoverSample = new THREE.Vector3();
const hoverRefineStep = new THREE.Vector3();
const hoverMaxPosition = new THREE.Vector3();
const hoverStartNormalized = new THREE.Vector3();
const hoverVolumeSize = new THREE.Vector3();
const hoverEntryPoint = new THREE.Vector3();
const hoverExitPoint = new THREE.Vector3();
const hoverEntryOffset = new THREE.Vector3();
const hoverRayDirection = new THREE.Vector3();
const hoverLocalRay = new THREE.Ray();
const hoverExitRay = new THREE.Ray();
const hoverBoundingBox = new THREE.Box3();
const hoverLayerMatrix = new THREE.Matrix4();
const hoverLayerOffsetMatrix = new THREE.Matrix4();
const trackColorTemp = new THREE.Color();
const trackBlinkColorTemp = new THREE.Color();

function computeTrackEndCapRadius(lineWidth: number) {
  const linearRadius = TRACK_END_CAP_RADIUS_INTERCEPT + TRACK_END_CAP_RADIUS_SLOPE * lineWidth;
  return Math.max(linearRadius, TRACK_END_CAP_MIN_RADIUS);
}

function computeViewerYawBasis(
  renderer: THREE.WebGLRenderer | null,
  camera: THREE.PerspectiveCamera | null,
  outForward: THREE.Vector3,
  outRight: THREE.Vector3
) {
  outForward.copy(VIEWER_YAW_FORWARD_REFERENCE);
  outRight.copy(VIEWER_YAW_RIGHT_REFERENCE);
  if (!camera) {
    return;
  }

  const isPresenting = !!renderer?.xr?.isPresenting;
  const referenceCamera = isPresenting ? (renderer?.xr.getCamera() ?? camera) : camera;
  referenceCamera.getWorldQuaternion(viewerYawQuaternionTemp);

  viewerYawForwardTemp.set(0, 0, -1).applyQuaternion(viewerYawQuaternionTemp);
  viewerYawForwardTemp.y = 0;

  if (viewerYawForwardTemp.lengthSq() < 1e-6) {
    return;
  }

  viewerYawForwardTemp.normalize();
  outForward.copy(viewerYawForwardTemp);
  outRight.crossVectors(outForward, WORLD_UP);

  if (outRight.lengthSq() < 1e-6) {
    outForward.copy(VIEWER_YAW_FORWARD_REFERENCE);
    outRight.copy(VIEWER_YAW_RIGHT_REFERENCE);
    return;
  }

  outRight.normalize();
  outForward.copy(WORLD_UP).cross(outRight).normalize();
}

function computeYawAngleForBasis(
  vector: THREE.Vector3,
  basisForward: THREE.Vector3,
  basisRight: THREE.Vector3
) {
  const forwardComponent = vector.dot(basisForward);
  const rightComponent = vector.dot(basisRight);
  return Math.atan2(rightComponent, forwardComponent);
}

function resolveVrUiTarget(object: THREE.Object3D | null): VrUiTarget | null {
  let current: THREE.Object3D | null = object;
  while (current) {
    const target = current.userData?.vrUiTarget;
    if (isVrUiTargetDescriptor(target)) {
      return { type: target.type, object: current, data: target.data };
    }
    current = current.parent ?? null;
  }
  return null;
}

function getHudCategoryFromTarget(type: VrUiTargetType | null): 'playback' | 'channels' | 'tracks' | null {
  if (!type) {
    return null;
  }
  if (type.startsWith('playback-')) {
    return 'playback';
  }
  if (type.startsWith('channels-')) {
    return 'channels';
  }
  if (type.startsWith('tracks-')) {
    return 'tracks';
  }
  return null;
}

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

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
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
  playbackDisabled,
  playbackLabel,
  fps,
  blendingMode,
  onTogglePlayback,
  onTimeIndexChange,
  onFpsChange,
  onRegisterVolumeStepScaleChange,
  onRegisterReset,
  trackScale,
  tracks,
  trackVisibility,
  trackOpacityByChannel,
  trackLineWidthByChannel,
  channelTrackColorModes,
  channelTrackOffsets,
  selectedTrackIds,
  followedTrackId,
  onTrackSelectionToggle,
  onTrackFollowRequest,
  onHoverVoxelChange,
  vr
}: VolumeViewerProps) {
  const vrLog = (...args: Parameters<typeof console.debug>) => {
    if (import.meta.env?.DEV) {
      console.debug(...args);
    }
  };

  const isVrPassthroughSupported = vr?.isVrPassthroughSupported ?? false;
  const trackChannels = vr?.trackChannels ?? [];
  const activeTrackChannelId = vr?.activeTrackChannelId ?? null;
  const channelPanels = vr?.channelPanels ?? [];
  const activeChannelPanelId = vr?.activeChannelPanelId ?? null;
  const onTrackChannelSelect = vr?.onTrackChannelSelect;
  const onTrackVisibilityToggle = vr?.onTrackVisibilityToggle;
  const onTrackVisibilityAllChange = vr?.onTrackVisibilityAllChange;
  const onTrackOpacityChange = vr?.onTrackOpacityChange;
  const onTrackLineWidthChange = vr?.onTrackLineWidthChange;
  const onTrackColorSelect = vr?.onTrackColorSelect;
  const onTrackColorReset = vr?.onTrackColorReset;
  const onStopTrackFollow = vr?.onStopTrackFollow;
  const onChannelPanelSelect = vr?.onChannelPanelSelect;
  const onChannelVisibilityToggle = vr?.onChannelVisibilityToggle;
  const onChannelReset = vr?.onChannelReset;
  const onChannelLayerSelect = vr?.onChannelLayerSelect;
  const onLayerContrastChange = vr?.onLayerContrastChange;
  const onLayerBrightnessChange = vr?.onLayerBrightnessChange;
  const onLayerWindowMinChange = vr?.onLayerWindowMinChange;
  const onLayerWindowMaxChange = vr?.onLayerWindowMaxChange;
  const onLayerAutoContrast = vr?.onLayerAutoContrast;
  const onLayerOffsetChange = vr?.onLayerOffsetChange;
  const onLayerColorChange = vr?.onLayerColorChange;
  const onLayerRenderStyleToggle = vr?.onLayerRenderStyleToggle;
  const onLayerSamplingModeToggle = vr?.onLayerSamplingModeToggle;
  const onLayerInvertToggle = vr?.onLayerInvertToggle;
  const onRegisterVrSession = vr?.onRegisterVrSession;

  const trackScaleX = trackScale.x ?? 1;
  const trackScaleY = trackScale.y ?? 1;
  const trackScaleZ = trackScale.z ?? 1;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const hoverRaycasterRef = useRef<THREE.Raycaster | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const resourcesRef = useRef<Map<string, VolumeResources>>(new Map());
  const hoverTeardownRef = useRef(false);
  const hoverInitializationFailedRef = useRef(false);
  const hoverSystemReadyRef = useRef(false);
  const pendingHoverEventRef = useRef<PointerEvent | null>(null);
  const hoverRetryFrameRef = useRef<number | null>(null);
  const updateVoxelHoverRef = useRef<(event: PointerEvent) => void>(() => {});
  const endPointerLookRef = useRef<(event?: PointerEvent) => void>(() => {});
  const currentDimensionsRef = useRef<{ width: number; height: number; depth: number } | null>(null);
  const colormapCacheRef = useRef<Map<string, THREE.DataTexture>>(new Map());
  const rotationTargetRef = useRef(new THREE.Vector3());
  const defaultViewStateRef = useRef<{
    position: THREE.Vector3;
    target: THREE.Vector3;
  } | null>(null);
  const movementStateRef = useRef<MovementState>({
    moveForward: false,
    moveBackward: false,
    moveLeft: false,
    moveRight: false,
    moveUp: false,
    moveDown: false
  });
  const volumeRootGroupRef = useRef<THREE.Group | null>(null);
  const volumeRootBaseOffsetRef = useRef(new THREE.Vector3());
  const volumeRootCenterOffsetRef = useRef(new THREE.Vector3());
  const volumeRootCenterUnscaledRef = useRef(new THREE.Vector3());
  const volumeRootHalfExtentsRef = useRef(new THREE.Vector3());
  const volumeNormalizationScaleRef = useRef(1);
  const volumeUserScaleRef = useRef(1);
  const volumeStepScaleRef = useRef(DESKTOP_VOLUME_STEP_SCALE);
  const volumeYawRef = useRef(0);
  const volumePitchRef = useRef(0);
  const volumeRootRotatedCenterTempRef = useRef(new THREE.Vector3());
  const trackGroupRef = useRef<THREE.Group | null>(null);
  const trackLinesRef = useRef<Map<string, TrackLineResource>>(new Map());
  const timeIndexRef = useRef(0);
  const followedTrackIdRef = useRef<string | null>(null);
  const trackFollowOffsetRef = useRef<THREE.Vector3 | null>(null);
  const previousFollowedTrackIdRef = useRef<string | null>(null);
  const hasActive3DLayerRef = useRef(false);
  const [hasMeasured, setHasMeasured] = useState(false);
  const [trackOverlayRevision, setTrackOverlayRevision] = useState(0);
  const [renderContextRevision, setRenderContextRevision] = useState(0);
  const hoveredTrackIdRef = useRef<string | null>(null);
  const [hoveredTrackId, setHoveredTrackId] = useState<string | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ x: number; y: number } | null>(null);
  const hoverSourcesRef = useRef({
    pointer: { trackId: null as string | null, position: null as { x: number; y: number } | null },
    controller: { trackId: null as string | null, position: null as { x: number; y: number } | null }
  });
  const layersRef = useRef(layers);
  const hoverIntensityRef = useRef<HoveredVoxelInfo | null>(null);
  const hoveredVoxelRef = useRef<{
    layerKey: string | null;
    normalizedPosition: THREE.Vector3 | null;
    segmentationLabel: number | null;
  }>({
    layerKey: null,
    normalizedPosition: null,
    segmentationLabel: null
  });
  const voxelHoverDebugRef = useRef<string | null>(null);
  const [voxelHoverDebug, setVoxelHoverDebug] = useState<string | null>(null);
  const isDevMode = Boolean(import.meta.env?.DEV);
  const [containerNode, setContainerNode] = useState<HTMLDivElement | null>(null);
  const resetVolumeCallbackRef = useRef<() => void>(() => {});
  const resetHudPlacementCallbackRef = useRef<() => void>(() => {});
  const trackFollowRequestCallbackRef = useRef<(trackId: string) => void>(() => {});
  trackFollowRequestCallbackRef.current = onTrackFollowRequest;

  const [vrIntegration, setVrIntegration] = useState<UseVolumeViewerVrResult | null>(null);

  useEffect(() => {
    if (!vr) {
      setVrIntegration(null);
    }
  }, [vr]);

  const requestVolumeReset = useCallback(() => {
    resetVolumeCallbackRef.current?.();
  }, []);

  const requestHudPlacementReset = useCallback(() => {
    resetHudPlacementCallbackRef.current?.();
  }, []);

  const handleTrackFollowRequest = useCallback((trackId: string) => {
    trackFollowRequestCallbackRef.current?.(trackId);
  }, []);

  const isAdditiveBlending = blendingMode === 'additive';

  const handleResize = useCallback(() => {
    const target = containerRef.current;
    const rendererInstance = rendererRef.current;
    const cameraInstance = cameraRef.current;
    if (!target || !rendererInstance || !cameraInstance) {
      return;
    }
    if (rendererInstance.xr?.isPresenting) {
      return;
    }
    const width = target.clientWidth;
    const height = target.clientHeight;
    if (width > 0 && height > 0) {
      setHasMeasured(true);
    }
    rendererInstance.setSize(width, height);
    if (width > 0 && height > 0) {
      for (const resource of trackLinesRef.current.values()) {
        resource.material.resolution.set(width, height);
        resource.material.needsUpdate = true;
        resource.outlineMaterial.resolution.set(width, height);
        resource.outlineMaterial.needsUpdate = true;
      }
    }
    cameraInstance.aspect = width / height;
    cameraInstance.updateProjectionMatrix();
  }, [setHasMeasured]);

  const applyHoverState = useCallback(() => {
    const pointerState = hoverSourcesRef.current.pointer;
    const controllerState = hoverSourcesRef.current.controller;
    const nextState =
      pointerState.trackId !== null
        ? pointerState
        : controllerState.trackId !== null
        ? controllerState
        : { trackId: null as string | null, position: null as { x: number; y: number } | null };
    if (hoveredTrackIdRef.current !== nextState.trackId) {
      hoveredTrackIdRef.current = nextState.trackId;
      setHoveredTrackId(nextState.trackId);
    }
    setTooltipPosition(nextState.position);
  }, []);

  const updateHoverState = useCallback(
    (
      trackId: string | null,
      position: { x: number; y: number } | null,
      source: 'pointer' | 'controller' = 'pointer'
    ) => {
      hoverSourcesRef.current[source] = { trackId, position };
      applyHoverState();
    },
    [applyHoverState]
  );

  const clearHoverState = useCallback(
    (source?: 'pointer' | 'controller') => {
      if (source) {
        hoverSourcesRef.current[source] = { trackId: null, position: null };
      } else {
        hoverSourcesRef.current.pointer = { trackId: null, position: null };
        hoverSourcesRef.current.controller = { trackId: null, position: null };
      }
      applyHoverState();
    },
    [applyHoverState]
  );

  useEffect(() => {
    layersRef.current = layers;
  }, [layers]);

  const applyHoverHighlightToResources = useCallback(() => {
    const { layerKey, normalizedPosition, segmentationLabel } = hoveredVoxelRef.current;
    const layersByKey = new Map(layersRef.current.map((layer) => [layer.key, layer]));
    for (const [key, resource] of resourcesRef.current.entries()) {
      if (resource.mode !== '3d') {
        continue;
      }
      const uniforms = (resource.mesh.material as THREE.ShaderMaterial).uniforms;
      const layer = layersByKey.get(key);
      const isSegmentationLayer = Boolean(layer?.isSegmentation);
      const hasHoverLabel = Number.isFinite(segmentationLabel);
      const isActive = Boolean(layerKey && normalizedPosition && layerKey === key);
      if (uniforms.u_hoverActive) {
        uniforms.u_hoverActive.value = isActive ? 1 : 0;
      }
      if (uniforms.u_hoverSegmentationMode) {
        uniforms.u_hoverSegmentationMode.value = isActive && isSegmentationLayer && hasHoverLabel ? 1 : 0;
      }
      if (uniforms.u_hoverLabel) {
        uniforms.u_hoverLabel.value = hasHoverLabel ? (segmentationLabel as number) : 0;
      }
      if (uniforms.u_segmentationLabels) {
        uniforms.u_segmentationLabels.value = resource.labelTexture ?? null;
      }
      if (
        isActive &&
        normalizedPosition &&
        uniforms.u_hoverPos &&
        uniforms.u_hoverRadius &&
        uniforms.u_hoverScale
      ) {
        uniforms.u_hoverPos.value.copy(normalizedPosition);
        uniforms.u_hoverScale.value.set(
          resource.dimensions.width,
          resource.dimensions.height,
          resource.dimensions.depth,
        );
        uniforms.u_hoverRadius.value = HOVER_HIGHLIGHT_RADIUS_VOXELS;
      } else {
        if (uniforms.u_hoverRadius) {
          uniforms.u_hoverRadius.value = 0;
        }
        if (uniforms.u_hoverScale) {
          uniforms.u_hoverScale.value.set(0, 0, 0);
        }
      }
    }
  }, []);

  const areHoverComponentsEqual = useCallback(
    (
      a: HoveredVoxelInfo['components'] | undefined,
      b: HoveredVoxelInfo['components'] | undefined,
    ) => {
      const left = a ?? [];
      const right = b ?? [];
      if (left.length !== right.length) {
        return false;
      }
      for (let i = 0; i < left.length; i++) {
        if (left[i].text !== right[i].text || left[i].color !== right[i].color) {
          return false;
        }
      }
      return true;
    },
    [],
  );

  const emitHoverVoxel = useCallback(
    (value: HoveredVoxelInfo | null) => {
      const previous = hoverIntensityRef.current;
      const isSame =
        (previous === null && value === null) ||
        (previous !== null &&
          value !== null &&
          previous.intensity === value.intensity &&
          previous.coordinates.x === value.coordinates.x &&
          previous.coordinates.y === value.coordinates.y &&
          previous.coordinates.z === value.coordinates.z &&
          areHoverComponentsEqual(previous.components, value.components));

      if (isSame) {
        return;
      }
      hoverIntensityRef.current = value;
      onHoverVoxelChange?.(value);
    },
    [areHoverComponentsEqual, onHoverVoxelChange]
  );

  const clearVoxelHover = useCallback(() => {
    emitHoverVoxel(null);
    hoveredVoxelRef.current = { layerKey: null, normalizedPosition: null, segmentationLabel: null };
    applyHoverHighlightToResources();
  }, [applyHoverHighlightToResources, emitHoverVoxel]);

  const reportVoxelHoverAbort = useCallback(
    (reason: string) => {
      if (voxelHoverDebugRef.current !== reason && isDevMode) {
        console.debug('[voxel-hover]', reason);
      }
      if (isDevMode) {
        voxelHoverDebugRef.current = reason;
        setVoxelHoverDebug(reason);
      } else {
        voxelHoverDebugRef.current = null;
        setVoxelHoverDebug(null);
      }
      clearVoxelHover();
    },
    [clearVoxelHover, isDevMode],
  );

  const clearVoxelHoverDebug = useCallback(() => {
    voxelHoverDebugRef.current = null;
    if (isDevMode) {
      setVoxelHoverDebug(null);
    }
  }, [isDevMode]);

  const setHoverNotReady = useCallback(
    (reason: string) => {
      reportVoxelHoverAbort(reason);
    },
    [reportVoxelHoverAbort],
  );

  const playbackStateForVr = useMemo(
    () => ({
      isPlaying,
      playbackDisabled,
      playbackLabel,
      fps,
      timeIndex,
      totalTimepoints,
      onTogglePlayback,
      onTimeIndexChange,
      onFpsChange,
    }),
    [
      isPlaying,
      playbackDisabled,
      playbackLabel,
      fps,
      timeIndex,
      totalTimepoints,
      onTogglePlayback,
      onTimeIndexChange,
      onFpsChange,
    ],
  );

  const vrParams = useMemo<UseVolumeViewerVrParams | null>(
    () =>
      vr
        ? {
            vrProps: vr,
            containerRef,
            rendererRef,
            cameraRef,
            controlsRef,
            sceneRef,
            volumeRootGroupRef,
            currentDimensionsRef,
            volumeRootBaseOffsetRef,
            volumeRootCenterOffsetRef,
            volumeRootCenterUnscaledRef,
            volumeRootHalfExtentsRef,
            volumeNormalizationScaleRef,
            volumeUserScaleRef,
            volumeRootRotatedCenterTempRef,
            volumeStepScaleRef,
            volumeYawRef,
            volumePitchRef,
            trackGroupRef,
            resourcesRef,
            timeIndexRef,
            movementStateRef,
            trackLinesRef,
            trackFollowOffsetRef,
            hasActive3DLayerRef,
            playbackState: playbackStateForVr,
            isVrPassthroughSupported,
            channelPanels,
            activeChannelPanelId,
            trackChannels,
            activeTrackChannelId,
            tracks,
            trackVisibility,
            trackOpacityByChannel,
            trackLineWidthByChannel,
            channelTrackColorModes,
            selectedTrackIds,
            followedTrackId,
            updateHoverState,
            clearHoverState,
            onResetVolume: requestVolumeReset,
            onResetHudPlacement: requestHudPlacementReset,
            onTrackFollowRequest: handleTrackFollowRequest,
            vrLog,
            onAfterSessionEnd: handleResize,
          }
        : null,
    [
      vr,
      containerRef,
      rendererRef,
      cameraRef,
      controlsRef,
      sceneRef,
      volumeRootGroupRef,
      currentDimensionsRef,
      volumeRootBaseOffsetRef,
      volumeRootCenterOffsetRef,
      volumeRootCenterUnscaledRef,
      volumeRootHalfExtentsRef,
      volumeNormalizationScaleRef,
      volumeUserScaleRef,
      volumeRootRotatedCenterTempRef,
      volumeStepScaleRef,
      volumeYawRef,
      volumePitchRef,
      trackGroupRef,
      resourcesRef,
      timeIndexRef,
      movementStateRef,
      trackLinesRef,
      trackFollowOffsetRef,
      hasActive3DLayerRef,
      playbackStateForVr,
      isVrPassthroughSupported,
      channelPanels,
      activeChannelPanelId,
      trackChannels,
      activeTrackChannelId,
      tracks,
      trackVisibility,
      trackOpacityByChannel,
      trackLineWidthByChannel,
      channelTrackColorModes,
      selectedTrackIds,
      followedTrackId,
      updateHoverState,
      clearHoverState,
      requestVolumeReset,
      requestHudPlacementReset,
      handleTrackFollowRequest,
      vrLog,
      handleResize,
    ],
  );
  const createMutableRef = <T,>(value: T): MutableRefObject<T> => ({ current: value });
  const vrFallback = useMemo<UseVolumeViewerVrResult>(() => {
    const rejectSession = async () => {
      throw new Error('VR session is not available.');
    };
    return {
      callOnRegisterVrSession: () => {},
      requestVrSession: rejectSession,
      endVrSession: async () => {},
      vrPlaybackHudRef: createMutableRef(null),
      vrChannelsHudRef: createMutableRef(null),
      vrTracksHudRef: createMutableRef(null),
      vrPlaybackHudPlacementRef: createMutableRef(null),
      vrChannelsHudPlacementRef: createMutableRef(null),
      vrTracksHudPlacementRef: createMutableRef(null),
      vrTranslationHandleRef: createMutableRef(null),
      vrVolumeScaleHandleRef: createMutableRef(null),
      vrVolumeYawHandlesRef: createMutableRef([]),
      vrVolumePitchHandleRef: createMutableRef(null),
      playbackStateRef: createMutableRef({
        isPlaying: false,
        playbackDisabled: true,
        playbackLabel: '',
        fps: 0,
        timeIndex: 0,
        totalTimepoints: 0,
        onTogglePlayback: () => {},
        onTimeIndexChange: () => {},
        onFpsChange: () => {},
        passthroughSupported: false,
        preferredSessionMode: 'immersive-vr',
        currentSessionMode: null,
      }),
      playbackLoopRef: createMutableRef({ lastTimestamp: null, accumulator: 0 }),
      vrHoverStateRef: createMutableRef({
        play: false,
        playbackSlider: false,
        playbackSliderActive: false,
        fpsSlider: false,
        fpsSliderActive: false,
        resetVolume: false,
        resetHud: false,
        exit: false,
        mode: false,
      }),
      controllersRef: createMutableRef([]),
      setControllerVisibility: () => {},
      raycasterRef: createMutableRef(null),
      xrSessionRef: createMutableRef(null),
      sessionCleanupRef: createMutableRef(null),
      applyVrPlaybackHoverState: () => {},
      updateVrPlaybackHud: () => {},
      createVrPlaybackHud: () => null,
      createVrChannelsHud: () => null,
      createVrTracksHud: () => null,
      updateVrChannelsHud: () => {},
      updateVrTracksHud: () => {},
      updateVolumeHandles: () => {},
      updateHudGroupFromPlacement: () => {},
      resetVrPlaybackHudPlacement: () => {},
      resetVrChannelsHudPlacement: () => {},
      resetVrTracksHudPlacement: () => {},
      applyVolumeRootTransform: () => {},
      applyVolumeStepScaleToResources: () => {},
      restoreVrFoveation: () => {},
      onRendererInitialized: () => {},
      endVrSessionRequestRef: createMutableRef(null),
      updateControllerRays: () => {},
    };
  }, []);
  const vrApi = vrIntegration ?? vrFallback;
  const {
    callOnRegisterVrSession,
    requestVrSession,
    endVrSession,
    vrPlaybackHudRef,
    vrChannelsHudRef,
    vrTracksHudRef,
    vrPlaybackHudPlacementRef,
    vrChannelsHudPlacementRef,
    vrTracksHudPlacementRef,
    vrTranslationHandleRef,
    vrVolumeScaleHandleRef,
    vrVolumeYawHandlesRef,
    vrVolumePitchHandleRef,
    playbackStateRef,
    playbackLoopRef,
    vrHoverStateRef,
    controllersRef,
    setControllerVisibility,
    raycasterRef,
    xrSessionRef,
    sessionCleanupRef,
    applyVrPlaybackHoverState,
    updateVrPlaybackHud,
    createVrPlaybackHud,
    createVrChannelsHud,
    createVrTracksHud,
    updateVrChannelsHud,
    updateVrTracksHud,
    updateVolumeHandles,
    updateHudGroupFromPlacement,
    resetVrPlaybackHudPlacement,
    resetVrChannelsHudPlacement,
    resetVrTracksHudPlacement,
    applyVolumeRootTransform,
    applyVolumeStepScaleToResources,
    restoreVrFoveation,
    onRendererInitialized,
    endVrSessionRequestRef,
    updateControllerRays,
  } = vrApi;

  useEffect(() => {
    if (!onRegisterVrSession) {
      callOnRegisterVrSession(null);
      return;
    }
    callOnRegisterVrSession({
      requestSession: () => requestVrSession(),
      endSession: () => endVrSession(),
    });
    return () => {
      callOnRegisterVrSession(null);
    };
  }, [callOnRegisterVrSession, endVrSession, onRegisterVrSession, requestVrSession]);


  const refreshVrHudPlacements = useCallback(() => {
    updateHudGroupFromPlacement(
      vrPlaybackHudRef.current,
      vrPlaybackHudPlacementRef.current ?? null
    );
    updateHudGroupFromPlacement(
      vrChannelsHudRef.current,
      vrChannelsHudPlacementRef.current ?? null
    );
    updateHudGroupFromPlacement(
      vrTracksHudRef.current,
      vrTracksHudPlacementRef.current ?? null
    );
  }, [updateHudGroupFromPlacement]);

  const handleContainerRef = useCallback((node: HTMLDivElement | null) => {
    containerRef.current = node;
    if (!node) {
      return;
    }
    setContainerNode((current) => (current === node ? current : node));
  }, []);

  useEffect(() => {
    const activeContainer = containerNode ?? containerRef.current;
    if (!activeContainer) {
      setHoverNotReady('Hover inactive: viewer container unavailable.');
      return;
    }
    if (!containerNode && activeContainer) {
      setContainerNode(activeContainer);
    }
  }, [containerNode, setHoverNotReady]);

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
      const { geometry, times, positions, endCap } = resource;
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
      const hasVisiblePoints = visiblePoints > 0;
      resource.hasVisiblePoints = hasVisiblePoints;
      if (hasVisiblePoints) {
        const lastPointIndex = visiblePoints - 1;
        const baseIndex = lastPointIndex * 3;
        endCap.position.set(
          positions[baseIndex] ?? 0,
          positions[baseIndex + 1] ?? 0,
          positions[baseIndex + 2] ?? 0
        );
      }
      endCap.visible = resource.shouldShow && hasVisiblePoints;
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
  useEffect(() => {
    if (vrIntegration) {
      return;
    }
    const state = playbackStateRef.current;
    state.isPlaying = isPlaying;
    state.playbackDisabled = playbackDisabled;
    state.playbackLabel = playbackLabel;
    state.fps = fps;
    state.timeIndex = clampedTimeIndex;
    state.totalTimepoints = totalTimepoints;
    state.onTogglePlayback = onTogglePlayback;
    state.onTimeIndexChange = onTimeIndexChange;
    state.onFpsChange = onFpsChange;
  }, [
    clampedTimeIndex,
    fps,
    isPlaying,
    onFpsChange,
    onTimeIndexChange,
    onTogglePlayback,
    playbackDisabled,
    playbackLabel,
    playbackStateRef,
    totalTimepoints,
    vrIntegration,
  ]);
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
  useEffect(() => {
    hasActive3DLayerRef.current = hasActive3DLayer;
    updateVolumeHandles();
  }, [hasActive3DLayer, updateVolumeHandles]);
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
        trackGroup.remove(resource.endCap);
        resource.geometry.dispose();
        resource.material.dispose();
        resource.outlineMaterial.dispose();
        resource.endCap.geometry.dispose();
        resource.endCapMaterial.dispose();
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
      const scaledOffsetX = offset.x * trackScaleX;
      const scaledOffsetY = offset.y * trackScaleY;

      for (let index = 0; index < track.points.length; index++) {
        const point = track.points[index];
        const resolvedZ = Number.isFinite(point.z) ? point.z : 0;
        positions[index * 3 + 0] = point.x * trackScaleX + scaledOffsetX;
        positions[index * 3 + 1] = point.y * trackScaleY + scaledOffsetY;
        positions[index * 3 + 2] = resolvedZ * trackScaleZ;
        times[index] = point.time;
      }

      const baseColor = resolveTrackColor(track);
      const highlightColor = baseColor.clone().lerp(new THREE.Color(0xffffff), 0.4);

      if (!resource) {
        const geometry = new LineGeometry();
        geometry.setPositions(positions);
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
        line.userData.trackId = track.id;

        trackGroup.add(outline);
        trackGroup.add(line);

        const endCapMaterial = new THREE.MeshBasicMaterial({
          color: baseColor.clone(),
          transparent: true,
          opacity: DEFAULT_TRACK_OPACITY,
          depthTest: false,
          depthWrite: false
        });
        const endCapGeometry = new THREE.SphereGeometry(1, 18, 14);
        const endCap = new THREE.Mesh(endCapGeometry, endCapMaterial);
        endCap.renderOrder = 1001;
        endCap.frustumCulled = false;
        endCap.visible = false;
        endCap.userData.trackId = track.id;

        trackGroup.add(endCap);
        resource = {
          line,
          outline,
          geometry,
          material,
          outlineMaterial,
          endCap,
          endCapMaterial,
          times,
          positions,
          baseColor: baseColor.clone(),
          highlightColor: highlightColor.clone(),
          channelId: track.channelId,
          baseLineWidth: DEFAULT_TRACK_LINE_WIDTH,
          targetLineWidth: DEFAULT_TRACK_LINE_WIDTH,
          outlineExtraWidth: Math.max(DEFAULT_TRACK_LINE_WIDTH * 0.75, 0.4),
          targetOpacity: DEFAULT_TRACK_OPACITY,
          outlineBaseOpacity: 0,
          endCapRadius: computeTrackEndCapRadius(DEFAULT_TRACK_LINE_WIDTH),
          hasVisiblePoints: false,
          isFollowed: false,
          isSelected: false,
          isHovered: false,
          shouldShow: false,
          needsAppearanceUpdate: true
        };
        trackLines.set(track.id, resource);
      } else {
        const { geometry, line, outline } = resource;
        geometry.setPositions(positions);
        line.computeLineDistances();
        outline.computeLineDistances();
        resource.times = times;
        resource.positions = positions;
        resource.baseColor.copy(baseColor);
        resource.highlightColor.copy(highlightColor);
        resource.endCapMaterial.color.copy(baseColor);
        resource.endCap.userData.trackId = track.id;
        resource.endCapRadius = computeTrackEndCapRadius(resource.baseLineWidth);
        resource.channelId = track.channelId;
        resource.needsAppearanceUpdate = true;
      }
    }

    updateTrackDrawRanges(timeIndexRef.current);
  }, [
    channelTrackColorModes,
    channelTrackOffsets,
    clearHoverState,
    resolveTrackColor,
    trackScaleX,
    trackScaleY,
    trackScaleZ,
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

      const { line, outline, endCap } = resource;

      const isExplicitlyVisible = trackVisibility[track.id] ?? true;
      const isFollowed = followedTrackId === track.id;
      const isHovered = hoveredTrackId === track.id;
      const isSelected = selectedTrackIds.has(track.id);
      const isHighlighted = isFollowed || isHovered || isSelected;
      const shouldShow = isFollowed || isExplicitlyVisible || isSelected;

      resource.channelId = track.channelId;
      resource.isFollowed = isFollowed;
      resource.isHovered = isHovered;
      resource.isSelected = isSelected;
      resource.shouldShow = shouldShow;
      resource.needsAppearanceUpdate = true;

      line.visible = shouldShow;
      outline.visible = shouldShow && isHighlighted;
      endCap.visible = shouldShow && resource.hasVisiblePoints;
      if (shouldShow) {
        visibleCount += 1;
      }

      const channelOpacity = trackOpacityByChannel[track.channelId] ?? DEFAULT_TRACK_OPACITY;
      const sanitizedOpacity = Math.min(1, Math.max(0, channelOpacity));
      const opacityBoost = isFollowed || isSelected ? 0.15 : isHovered ? 0.12 : 0;
      resource.targetOpacity = Math.min(1, sanitizedOpacity + opacityBoost);

      const channelLineWidth = trackLineWidthByChannel[track.channelId] ?? DEFAULT_TRACK_LINE_WIDTH;
      const sanitizedLineWidth = Math.max(0.1, Math.min(10, channelLineWidth));
      resource.baseLineWidth = sanitizedLineWidth;
      let widthMultiplier = 1;
      if (isHovered) {
        widthMultiplier = Math.max(widthMultiplier, HOVERED_TRACK_LINE_WIDTH_MULTIPLIER);
      }
      if (isFollowed) {
        widthMultiplier = Math.max(widthMultiplier, FOLLOWED_TRACK_LINE_WIDTH_MULTIPLIER);
      }
      if (isSelected) {
        widthMultiplier = Math.max(widthMultiplier, SELECTED_TRACK_LINE_WIDTH_MULTIPLIER);
      }
      resource.targetLineWidth = sanitizedLineWidth * widthMultiplier;
      resource.outlineExtraWidth = Math.max(sanitizedLineWidth * 0.75, 0.4);

      resource.endCapRadius = computeTrackEndCapRadius(resource.targetLineWidth);

      resource.outlineBaseOpacity = isFollowed || isSelected ? 0.75 : isHovered ? 0.9 : 0;
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
    selectedTrackIds,
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

    applyVolumeRootTransformRef.current?.(currentDimensionsRef.current);
    applyTrackGroupTransformRef.current?.(currentDimensionsRef.current);

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
      const scaledOffsetX = offset.x * trackScaleX;
      const scaledOffsetY = offset.y * trackScaleY;

      for (const point of track.points) {
        if (point.time - maxVisibleTime > epsilon) {
          break;
        }

        if (point.time > latestTime + epsilon) {
          latestTime = point.time;
          count = 1;
          sumX = point.x * trackScaleX + scaledOffsetX;
          sumY = point.y * trackScaleY + scaledOffsetY;
          sumZ = (Number.isFinite(point.z) ? point.z : 0) * trackScaleZ;
        } else if (Math.abs(point.time - latestTime) <= epsilon) {
          count += 1;
          sumX += point.x * trackScaleX + scaledOffsetX;
          sumY += point.y * trackScaleY + scaledOffsetY;
          sumZ += (Number.isFinite(point.z) ? point.z : 0) * trackScaleZ;
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
    [channelTrackOffsets, trackLookup, trackScaleX, trackScaleY, trackScaleZ]
  );

  const retryPendingVoxelHover = useCallback(() => {
    const pendingEvent = pendingHoverEventRef.current;
    if (!pendingEvent) {
      return;
    }

    if (hoverTeardownRef.current) {
      pendingHoverEventRef.current = null;
      return;
    }

    if (hoverInitializationFailedRef.current) {
      pendingHoverEventRef.current = null;
      setHoverNotReady('Hover inactive: renderer not initialized.');
      return;
    }

    const renderer = rendererRef.current;
    const cameraInstance = cameraRef.current;
    const raycasterInstance = hoverRaycasterRef.current;
    const hasHoverRefs = renderer !== null && cameraInstance !== null && raycasterInstance !== null;

    if (!hoverSystemReadyRef.current || !hasHoverRefs) {
      if (!hoverSystemReadyRef.current) {
        setHoverNotReady('Hover inactive: renderer not initialized.');
      } else if (!hasHoverRefs) {
        setHoverNotReady('Hover inactive: hover dependencies missing.');
      }

      if (hoverRetryFrameRef.current !== null) {
        cancelAnimationFrame(hoverRetryFrameRef.current);
      }

      hoverRetryFrameRef.current = requestAnimationFrame(() => {
        hoverRetryFrameRef.current = null;
        if (hoverTeardownRef.current) {
          return;
        }
        retryPendingVoxelHover();
      });
      return;
    }

    if (hoverRetryFrameRef.current !== null) {
      cancelAnimationFrame(hoverRetryFrameRef.current);
      hoverRetryFrameRef.current = null;
    }

    pendingHoverEventRef.current = null;
    updateVoxelHoverRef.current(pendingEvent);
  }, [setHoverNotReady]);

  const updateVoxelHover = useCallback(
    (event: PointerEvent) => {
      if (hoverTeardownRef.current) {
        pendingHoverEventRef.current = null;
        return;
      }

      if (!hoverSystemReadyRef.current) {
        if (hoverInitializationFailedRef.current) {
          pendingHoverEventRef.current = null;
          setHoverNotReady('Hover inactive: renderer not initialized.');
        } else {
          pendingHoverEventRef.current = event;
          setHoverNotReady('Hover inactive: renderer not initialized.');
          retryPendingVoxelHover();
        }
        return;
      }

      const renderer = rendererRef.current;
      const cameraInstance = cameraRef.current;
      const raycasterInstance = hoverRaycasterRef.current;
      if (!renderer || !cameraInstance || !raycasterInstance) {
        pendingHoverEventRef.current = event;
        setHoverNotReady('Hover inactive: hover dependencies missing.');
        retryPendingVoxelHover();
        return;
      }

      if (renderer.xr?.isPresenting) {
        reportVoxelHoverAbort('Hover sampling disabled while XR session is active.');
        return;
      }

      const domElement = renderer.domElement;
      const rect = domElement.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;
      if (width <= 0 || height <= 0) {
        reportVoxelHoverAbort('Render surface has no measurable area.');
        return;
      }

      const offsetX = event.clientX - rect.left;
      const offsetY = event.clientY - rect.top;
      if (offsetX < 0 || offsetY < 0 || offsetX > width || offsetY > height) {
        clearVoxelHoverDebug();
        clearVoxelHover();
        return;
      }

      const layersSnapshot = layersRef.current;
      const hoverableLayers: (typeof layersSnapshot)[number][] = [];
      let targetLayer: (typeof layersSnapshot)[number] | null = null;
      let resource: VolumeResources | null = null;
      let cpuFallbackLayer: (typeof layersSnapshot)[number] | null = null;

      for (const layer of layersSnapshot) {
        const volume = layer.volume;
        if (!volume || !layer.visible) {
          continue;
        }

        const hasVolumeDepth = volume.depth > 1;
        const viewerMode =
          layer.mode === 'slice' || layer.mode === '3d'
            ? layer.mode
            : hasVolumeDepth
            ? '3d'
            : 'slice';

        const canSampleLayer = viewerMode === '3d' || hasVolumeDepth;

        if (!canSampleLayer) {
          continue;
        }

        hoverableLayers.push(layer);

        const candidate = resourcesRef.current.get(layer.key) ?? null;
        const isSliceResource = candidate?.mode === 'slice' && hasVolumeDepth;
        const has3dResource = candidate?.mode === '3d';

        if (has3dResource && (!resource || resource.mode !== '3d')) {
          targetLayer = layer;
          resource = candidate;
        } else if (isSliceResource && (!resource || resource.mode !== '3d') && !targetLayer) {
          targetLayer = layer;
          resource = candidate;
        } else if (!cpuFallbackLayer) {
          cpuFallbackLayer = layer;
        }
      }

      if (!targetLayer && cpuFallbackLayer) {
        targetLayer = cpuFallbackLayer;
      }

      if (!targetLayer || !targetLayer.volume) {
        reportVoxelHoverAbort('No visible 3D-capable volume layer is available.');
        return;
      }

      const volume = targetLayer.volume;
      hoverVolumeSize.set(volume.width, volume.height, volume.depth);

      const useGpuHover = resource?.mode === '3d';
      const useSliceResource = resource?.mode === 'slice' && volume.depth > 1;
      let boundingBox: THREE.Box3 | null = null;

      if (useGpuHover && resource) {
        const geometry = resource.mesh.geometry as THREE.BufferGeometry;
        if (!geometry.boundingBox) {
          geometry.computeBoundingBox();
        }

        boundingBox = geometry.boundingBox ?? null;
        resource.mesh.updateMatrixWorld(true);
        hoverInverseMatrix.copy(resource.mesh.matrixWorld).invert();
      } else if (useSliceResource && resource) {
        const geometry = resource.mesh.geometry as THREE.BufferGeometry;
        if (!geometry.boundingBox) {
          geometry.computeBoundingBox();
        }

        boundingBox = geometry.boundingBox ?? null;
        resource.mesh.updateMatrixWorld(true);
        hoverInverseMatrix.copy(resource.mesh.matrixWorld).invert();
      } else {
        hoverBoundingBox.min.set(-0.5, -0.5, -0.5);
        hoverBoundingBox.max.set(
          volume.width - 0.5,
          volume.height - 0.5,
          volume.depth - 0.5,
        );
        boundingBox = hoverBoundingBox;

        const volumeRootGroup = volumeRootGroupRef.current;
        hoverLayerMatrix.identity();
        if (volumeRootGroup) {
          volumeRootGroup.updateMatrixWorld(true);
          hoverLayerMatrix.copy(volumeRootGroup.matrixWorld);
        }
        hoverLayerOffsetMatrix.makeTranslation(targetLayer.offsetX, targetLayer.offsetY, 0);
        hoverLayerMatrix.multiply(hoverLayerOffsetMatrix);
        hoverInverseMatrix.copy(hoverLayerMatrix).invert();
      }

      if (!boundingBox) {
        reportVoxelHoverAbort('Unable to compute a bounding box for hover sampling.');
        return;
      }

      hoverPointerVector.set((offsetX / width) * 2 - 1, -(offsetY / height) * 2 + 1);
      raycasterInstance.setFromCamera(hoverPointerVector, cameraInstance);
      hoverLocalRay.copy(raycasterInstance.ray).applyMatrix4(hoverInverseMatrix);

      const isInsideBoundingBox = boundingBox.containsPoint(hoverLocalRay.origin);
      let hasEntry = false;
      if (isInsideBoundingBox) {
        hoverEntryPoint.copy(hoverLocalRay.origin);
        hasEntry = true;
      } else {
        const entryHit = hoverLocalRay.intersectBox(boundingBox, hoverEntryPoint);
        hasEntry = entryHit !== null;
      }

      hoverRayDirection.copy(hoverLocalRay.direction).normalize();
      hoverEntryOffset.copy(hoverRayDirection).multiplyScalar(1e-4);
      hoverExitRay.origin.copy(isInsideBoundingBox ? hoverLocalRay.origin : hoverEntryPoint);
      hoverExitRay.origin.add(hoverEntryOffset);
      hoverExitRay.direction.copy(hoverRayDirection);
      const exitHit = hoverExitRay.intersectBox(boundingBox, hoverExitPoint);
      const hasExit = exitHit !== null;

      if (!hasEntry || !hasExit) {
        reportVoxelHoverAbort('Ray does not intersect the target volume.');
        return;
      }

      const entryDistance = hoverLocalRay.origin.distanceTo(hoverEntryPoint);
      const exitDistance = hoverLocalRay.origin.distanceTo(hoverExitPoint);
      hoverStart.copy(entryDistance <= exitDistance ? hoverEntryPoint : hoverExitPoint);
      hoverEnd.copy(entryDistance <= exitDistance ? hoverExitPoint : hoverEntryPoint);

      const safeStepScale = Math.max(volumeStepScaleRef.current, 1e-3);
      const travelDistance = hoverEnd.distanceTo(hoverStart);
      let nsteps = Math.round(travelDistance * safeStepScale);
      nsteps = clampValue(nsteps, 1, MIP_MAX_STEPS);

      hoverStartNormalized.copy(hoverStart).divide(hoverVolumeSize);
      hoverStep.copy(hoverEnd).sub(hoverStart).divide(hoverVolumeSize).divideScalar(nsteps);
      hoverSample.copy(hoverStartNormalized);

      const channels = Math.max(1, volume.channels);
      const sliceStride = volume.width * volume.height * channels;
      const rowStride = volume.width * channels;

      const sampleVolume = (coords: THREE.Vector3) => {
        const x = clampValue(coords.x * volume.width, 0, volume.width - 1);
        const y = clampValue(coords.y * volume.height, 0, volume.height - 1);
        const z = clampValue(coords.z * volume.depth, 0, volume.depth - 1);

        const leftX = Math.floor(x);
        const rightX = Math.min(volume.width - 1, leftX + 1);
        const topY = Math.floor(y);
        const bottomY = Math.min(volume.height - 1, topY + 1);
        const frontZ = Math.floor(z);
        const backZ = Math.min(volume.depth - 1, frontZ + 1);

        const tX = x - leftX;
        const tY = y - topY;
        const tZ = z - frontZ;
        const invTX = 1 - tX;
        const invTY = 1 - tY;
        const invTZ = 1 - tZ;

        const weight000 = invTX * invTY * invTZ;
        const weight100 = tX * invTY * invTZ;
        const weight010 = invTX * tY * invTZ;
        const weight110 = tX * tY * invTZ;
        const weight001 = invTX * invTY * tZ;
        const weight101 = tX * invTY * tZ;
        const weight011 = invTX * tY * tZ;
        const weight111 = tX * tY * tZ;

        const frontOffset = frontZ * sliceStride;
        const backOffset = backZ * sliceStride;
        const topFrontOffset = frontOffset + topY * rowStride;
        const bottomFrontOffset = frontOffset + bottomY * rowStride;
        const topBackOffset = backOffset + topY * rowStride;
        const bottomBackOffset = backOffset + bottomY * rowStride;

        const normalizedValues: number[] = [];
        const rawValues: number[] = [];

        for (let channelIndex = 0; channelIndex < channels; channelIndex++) {
          const baseChannelOffset = channelIndex;
          const topLeftFront = volume.normalized[topFrontOffset + leftX * channels + baseChannelOffset] ?? 0;
          const topRightFront = volume.normalized[topFrontOffset + rightX * channels + baseChannelOffset] ?? 0;
          const bottomLeftFront = volume.normalized[bottomFrontOffset + leftX * channels + baseChannelOffset] ?? 0;
          const bottomRightFront = volume.normalized[bottomFrontOffset + rightX * channels + baseChannelOffset] ?? 0;

          const topLeftBack = volume.normalized[topBackOffset + leftX * channels + baseChannelOffset] ?? 0;
          const topRightBack = volume.normalized[topBackOffset + rightX * channels + baseChannelOffset] ?? 0;
          const bottomLeftBack = volume.normalized[bottomBackOffset + leftX * channels + baseChannelOffset] ?? 0;
          const bottomRightBack = volume.normalized[bottomBackOffset + rightX * channels + baseChannelOffset] ?? 0;

          const interpolated =
            topLeftFront * weight000 +
            topRightFront * weight100 +
            bottomLeftFront * weight010 +
            bottomRightFront * weight110 +
            topLeftBack * weight001 +
            topRightBack * weight101 +
            bottomLeftBack * weight011 +
            bottomRightBack * weight111;

          normalizedValues.push(interpolated / 255);
          rawValues.push(denormalizeValue(interpolated, volume));
        }

        return { normalizedValues, rawValues };
      };

      const computeLuminance = (values: number[]) => {
        if (channels === 1) {
          return values[0] ?? 0;
        }
        if (channels === 2) {
          return 0.5 * ((values[0] ?? 0) + (values[1] ?? 0));
        }
        if (channels === 3) {
          return 0.2126 * (values[0] ?? 0) + 0.7152 * (values[1] ?? 0) + 0.0722 * (values[2] ?? 0);
        }
        return Math.max(...values, 0);
      };

      const adjustIntensity = (value: number) => {
        const range = Math.max(targetLayer.windowMax - targetLayer.windowMin, 1e-5);
        const normalized = clampValue((value - targetLayer.windowMin) / range, 0, 1);
        return targetLayer.invert ? 1 - normalized : normalized;
      };

      let maxValue = -Infinity;
      let maxIndex = 0;
      hoverMaxPosition.copy(hoverSample);
      let maxRawValues: number[] = [];
      let maxNormalizedValues: number[] = [];

      const highWaterMark = targetLayer.invert ? 0.001 : 0.999;

      for (let i = 0; i < nsteps; i++) {
        const sample = sampleVolume(hoverSample);
        const luminance = computeLuminance(sample.normalizedValues);
        const adjusted = adjustIntensity(luminance);
        if (adjusted > maxValue) {
          maxValue = adjusted;
          maxIndex = i;
          hoverMaxPosition.copy(hoverSample);
          maxRawValues = sample.rawValues;
          maxNormalizedValues = sample.normalizedValues;

          if ((!targetLayer.invert && maxValue >= highWaterMark) || (targetLayer.invert && maxValue <= highWaterMark)) {
            break;
          }
        }

        hoverSample.add(hoverStep);
      }

      hoverSample.copy(hoverStartNormalized).addScaledVector(hoverStep, maxIndex - 0.5);
      hoverRefineStep.copy(hoverStep).divideScalar(MIP_REFINEMENT_STEPS);

      for (let i = 0; i < MIP_REFINEMENT_STEPS; i++) {
        const sample = sampleVolume(hoverSample);
        const luminance = computeLuminance(sample.normalizedValues);
        const adjusted = adjustIntensity(luminance);
        if (adjusted > maxValue) {
          maxValue = adjusted;
          hoverMaxPosition.copy(hoverSample);
          maxRawValues = sample.rawValues;
          maxNormalizedValues = sample.normalizedValues;
        }
        hoverSample.add(hoverRefineStep);
      }

      if (!Number.isFinite(maxValue) || maxRawValues.length === 0) {
        reportVoxelHoverAbort('No finite intensity was found along the hover ray.');
        return;
      }

      hoverMaxPosition.set(
        clampValue(hoverMaxPosition.x, 0, 1),
        clampValue(hoverMaxPosition.y, 0, 1),
        clampValue(hoverMaxPosition.z, 0, 1),
      );

      const hoveredSegmentationLabel =
        targetLayer.isSegmentation && targetLayer.volume?.segmentationLabels
          ? sampleSegmentationLabel(targetLayer.volume, hoverMaxPosition)
          : null;

      const displayLayers = isAdditiveBlending && hoverableLayers.length > 0 ? hoverableLayers : [targetLayer];
      const useLayerLabels = isAdditiveBlending && displayLayers.length > 1;
      const samples: Array<{
        values: number[];
        type: NormalizedVolume['dataType'];
        label: string | null;
        color: string;
      }> = [];

      for (const layer of displayLayers) {
        const layerVolume = layer.volume;
        if (!layerVolume) {
          continue;
        }

        let displayValues: number[] | null = null;

        if (layer.isSegmentation && layerVolume.segmentationLabels) {
          const labelValue =
            layer.key === targetLayer.key && hoveredSegmentationLabel !== null
              ? hoveredSegmentationLabel
              : sampleSegmentationLabel(layerVolume, hoverMaxPosition);
          if (labelValue !== null) {
            displayValues = [labelValue];
          }
        }

        if (!displayValues) {
          displayValues = layer.key === targetLayer.key
            ? maxRawValues
            : sampleRawValuesAtPosition(layerVolume, hoverMaxPosition);
        }

        if (!displayValues || displayValues.length === 0) {
          continue;
        }

        const channelLabel = layer.channelName?.trim() || layer.label?.trim() || null;
        samples.push({
          values: displayValues,
          type: layerVolume.dataType,
          label: useLayerLabels ? channelLabel : null,
          color: layer.color,
        });
      }

      const totalValues = samples.reduce((sum, sample) => sum + sample.values.length, 0);
      if (totalValues === 0) {
        reportVoxelHoverAbort('Unable to format hover intensity for display.');
        return;
      }

      const includeLabel = totalValues > 1;
      const intensityParts = samples.flatMap((sample) =>
        formatChannelValuesDetailed(sample.values, sample.type, sample.label, includeLabel).map((entry) => ({
          text: entry.text,
          color: sample.color,
        })),
      );

      if (intensityParts.length === 0) {
        reportVoxelHoverAbort('Unable to format hover intensity for display.');
        return;
      }

      clearVoxelHoverDebug();

      const hoveredVoxel = {
        intensity: intensityParts.map((entry) => entry.text).join(' · '),
        components: intensityParts.map((entry) => ({ text: entry.text, color: entry.color })),
        coordinates: {
          x: Math.round(clampValue(hoverMaxPosition.x * volume.width, 0, volume.width - 1)),
          y: Math.round(clampValue(hoverMaxPosition.y * volume.height, 0, volume.height - 1)),
          z: Math.round(clampValue(hoverMaxPosition.z * volume.depth, 0, volume.depth - 1))
        }
      } satisfies HoveredVoxelInfo;

      emitHoverVoxel(hoveredVoxel);
      hoveredVoxelRef.current = {
        layerKey: targetLayer.key,
        normalizedPosition: hoverMaxPosition.clone(),
        segmentationLabel: hoveredSegmentationLabel,
      };
      applyHoverHighlightToResources();
    },
    [
      applyHoverHighlightToResources,
      clearVoxelHover,
      clearVoxelHoverDebug,
      emitHoverVoxel,
      setHoverNotReady,
      retryPendingVoxelHover,
      reportVoxelHoverAbort
    ],
  );
  updateVoxelHoverRef.current = updateVoxelHover;

  useEffect(() => {
    const controls = controlsRef.current;
    if (controls) {
      controls.enableRotate = followedTrackId !== null;
    }

    const wasFollowingTrack = followedTrackIdRef.current !== null;
    followedTrackIdRef.current = followedTrackId;

    if (followedTrackId === null) {
      trackFollowOffsetRef.current = null;
      previousFollowedTrackIdRef.current = null;
      if (wasFollowingTrack) {
        endPointerLookRef.current?.();
      }
    }
  }, [followedTrackId]);

  useEffect(() => {
    if (followedTrackId === null) {
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

    const controls = controlsRef.current;
    const camera = cameraRef.current;
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
  }, [clampedTimeIndex, computeTrackCentroid, followedTrackId, primaryVolume]);

  const handleResetHudPlacement = useCallback(() => {
    const renderer = rendererRef.current;
    const isVrPresenting = renderer?.xr?.isPresenting ?? false;
    if (!isVrPresenting) {
      return;
    }
    resetVrPlaybackHudPlacement();
    resetVrChannelsHudPlacement();
    resetVrTracksHudPlacement();
  }, [
    resetVrChannelsHudPlacement,
    resetVrPlaybackHudPlacement,
    resetVrTracksHudPlacement
  ]);
  resetHudPlacementCallbackRef.current = handleResetHudPlacement;

  const handleResetVolume = useCallback(() => {
    const renderer = rendererRef.current;
    const isVrPresenting = renderer?.xr?.isPresenting ?? false;
    if (isVrPresenting) {
      volumeRootBaseOffsetRef.current.copy(VR_VOLUME_BASE_OFFSET);
    } else {
      volumeRootBaseOffsetRef.current.set(0, 0, 0);
    }
    volumeYawRef.current = 0;
    volumePitchRef.current = 0;
    volumeUserScaleRef.current = 1;
    applyVolumeRootTransformRef.current?.(currentDimensionsRef.current);

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
  }, [applyVolumeRootTransform]);
  resetVolumeCallbackRef.current = handleResetVolume;

  const handleResetView = useCallback(() => {
    handleResetVolume();
    handleResetHudPlacement();
  }, [handleResetHudPlacement, handleResetVolume]);

  const handleVolumeStepScaleChange = useCallback(
    (stepScale: number) => {
      const clampedStepScale = Math.max(stepScale, 1e-3);
      volumeStepScaleRef.current = clampedStepScale;
      applyVolumeStepScaleToResources(clampedStepScale);
    },
    [applyVolumeStepScaleToResources],
  );

  useEffect(() => {
    if (!onRegisterVolumeStepScaleChange) {
      return undefined;
    }

    onRegisterVolumeStepScaleChange(handleVolumeStepScaleChange);
    return () => {
      onRegisterVolumeStepScaleChange(null);
    };
  }, [handleVolumeStepScaleChange, onRegisterVolumeStepScaleChange]);

  useEffect(() => {
    onRegisterReset(hasRenderableLayer ? handleResetView : null);
    return () => {
      onRegisterReset(null);
    };
  }, [handleResetView, hasRenderableLayer, onRegisterReset]);

  const applyVolumeRootTransformRef = useRef(applyVolumeRootTransform);
  const applyTrackGroupTransformRef = useRef(applyTrackGroupTransform);
  const updateVolumeHandlesRef = useRef(updateVolumeHandles);
  const refreshVrHudPlacementsRef = useRef(refreshVrHudPlacements);

  useEffect(() => {
    applyVolumeRootTransformRef.current = applyVolumeRootTransform;
    applyTrackGroupTransformRef.current = applyTrackGroupTransform;
    updateVolumeHandlesRef.current = updateVolumeHandles;
    refreshVrHudPlacementsRef.current = refreshVrHudPlacements;
  }, [
    applyTrackGroupTransform,
    applyVolumeRootTransform,
    refreshVrHudPlacements,
    updateVolumeHandles
  ]);

  useEffect(() => {
    applyVolumeRootTransformRef.current?.(currentDimensionsRef.current);
    applyTrackGroupTransformRef.current?.(currentDimensionsRef.current);
  }, [applyTrackGroupTransform, applyVolumeRootTransform]);

  useEffect(() => {
    hoverTeardownRef.current = false;
    hoverInitializationFailedRef.current = false;
    hoverSystemReadyRef.current = false;
    setHoverNotReady('Hover inactive: renderer not initialized.');

    const container = containerNode;
    if (!container) {
      hoverInitializationFailedRef.current = true;
      return;
    }

    let renderContext: ReturnType<typeof createVolumeRenderContext>;
    try {
      renderContext = createVolumeRenderContext(container);
    } catch (error) {
      hoverInitializationFailedRef.current = true;
      setHoverNotReady('Hover inactive: renderer not initialized.');
      return;
    }

    const { renderer, scene, camera, controls } = renderContext;

    const volumeRootGroup = new THREE.Group();
    volumeRootGroup.name = 'VolumeRoot';
    scene.add(volumeRootGroup);
    volumeRootGroupRef.current = volumeRootGroup;
    const translationHandleMaterial = new THREE.MeshBasicMaterial({
      color: 0x4d9dff,
      transparent: true,
      opacity: 0.75,
      depthWrite: false
    });
    translationHandleMaterial.depthTest = false;
    const translationHandle = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 32), translationHandleMaterial);
    translationHandle.name = 'VolumeTranslateHandle';
    translationHandle.visible = false;
    volumeRootGroup.add(translationHandle);
    vrTranslationHandleRef.current = translationHandle;

    const scaleHandleMaterial = new THREE.MeshBasicMaterial({
      color: 0xc84dff,
      transparent: true,
      opacity: 0.8,
      depthWrite: false
    });
    scaleHandleMaterial.depthTest = false;
    const scaleHandle = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 32), scaleHandleMaterial);
    scaleHandle.name = 'VolumeScaleHandle';
    scaleHandle.visible = false;
    volumeRootGroup.add(scaleHandle);
    vrVolumeScaleHandleRef.current = scaleHandle;

    const rotationHandleMaterial = new THREE.MeshBasicMaterial({
      color: 0xffb347,
      transparent: true,
      opacity: 0.85,
      depthWrite: false
    });
    rotationHandleMaterial.depthTest = false;
    const yawHandles: THREE.Mesh[] = [];
    for (const direction of [1, -1] as const) {
      const yawHandle = new THREE.Mesh(
        new THREE.SphereGeometry(1, 32, 32),
        rotationHandleMaterial.clone()
      );
      yawHandle.name = direction > 0 ? 'VolumeYawHandleRight' : 'VolumeYawHandleLeft';
      yawHandle.visible = false;
      volumeRootGroup.add(yawHandle);
      yawHandles.push(yawHandle);
    }
    vrVolumeYawHandlesRef.current = yawHandles;

    const pitchHandle = new THREE.Mesh(
      new THREE.SphereGeometry(1, 32, 32),
      rotationHandleMaterial.clone()
    );
    pitchHandle.name = 'VolumePitchHandle';
    pitchHandle.visible = false;
    volumeRootGroup.add(pitchHandle);
    vrVolumePitchHandleRef.current = pitchHandle;

    applyVolumeRootTransformRef.current?.(currentDimensionsRef.current);

    const trackGroup = new THREE.Group();
    trackGroup.name = 'TrackingOverlay';
    trackGroup.visible = false;
    volumeRootGroup.add(trackGroup);
    trackGroupRef.current = trackGroup;

    // If the volume dimensions were already resolved (e.g., when toggling
    // between 2D and 3D views), make sure the tracking overlay immediately
    // adopts the normalized transform. Otherwise the tracks momentarily render
    // in unnormalized dataset coordinates until another interaction triggers a
    // redraw.
    applyTrackGroupTransformRef.current?.(currentDimensionsRef.current);
    setTrackOverlayRevision((revision) => revision + 1);
    setRenderContextRevision((revision) => revision + 1);

    cameraRef.current = camera;
    controlsRef.current = controls;

    const hud = createVrPlaybackHud();
    if (hud) {
      hud.group.visible = false;
      scene.add(hud.group);
      vrPlaybackHudRef.current = hud;
      resetVrPlaybackHudPlacement();
      updateVrPlaybackHud();
      applyVrPlaybackHoverState(false, false, false, false, false, false, false, false, false);
    } else {
      vrPlaybackHudRef.current = null;
    }

    const channelsHud = createVrChannelsHud();
    if (channelsHud) {
      channelsHud.group.visible = false;
      scene.add(channelsHud.group);
      vrChannelsHudRef.current = channelsHud;
      resetVrChannelsHudPlacement();
      updateVrChannelsHud();
    } else {
      vrChannelsHudRef.current = null;
    }

    const tracksHud = createVrTracksHud();
    if (tracksHud) {
      tracksHud.group.visible = false;
      scene.add(tracksHud.group);
      vrTracksHudRef.current = tracksHud;
      resetVrTracksHudPlacement();
      updateVrTracksHud();
    } else {
      vrTracksHudRef.current = null;
    }

    const domElement = renderer.domElement;
    const pointerTarget = domElement.parentElement ?? domElement;

    const pointerVector = new THREE.Vector2();
    const raycaster = new THREE.Raycaster();
    raycaster.params.Line = { threshold: 0.02 };
    raycaster.params.Line2 = { threshold: 0.02 };

    const pointerLookState = {
      activePointerId: null as number | null,
      yaw: 0,
      pitch: 0,
      lastClientX: 0,
      lastClientY: 0
    };
    const cameraEuler = new THREE.Euler(0, 0, 0, 'YXZ');
    const lookDirection = new THREE.Vector3();

    const LOOK_SENSITIVITY = 0.0025;
    const MAX_LOOK_PITCH = Math.PI / 2 - 0.001;

    const beginPointerLook = (event: PointerEvent) => {
      if (renderer.xr.isPresenting) {
        return;
      }

      pointerLookState.activePointerId = event.pointerId;
      pointerLookState.lastClientX = event.clientX;
      pointerLookState.lastClientY = event.clientY;

      cameraEuler.setFromQuaternion(camera.quaternion, 'YXZ');
      pointerLookState.yaw = cameraEuler.y;
      pointerLookState.pitch = cameraEuler.x;

      domElement.setPointerCapture(event.pointerId);
    };

    const updatePointerLook = (event: PointerEvent) => {
      if (pointerLookState.activePointerId !== event.pointerId) {
        return;
      }

      const deltaX = event.clientX - pointerLookState.lastClientX;
      const deltaY = event.clientY - pointerLookState.lastClientY;
      pointerLookState.lastClientX = event.clientX;
      pointerLookState.lastClientY = event.clientY;

      pointerLookState.yaw -= deltaX * LOOK_SENSITIVITY;
      pointerLookState.pitch -= deltaY * LOOK_SENSITIVITY;
      pointerLookState.pitch = THREE.MathUtils.clamp(pointerLookState.pitch, -MAX_LOOK_PITCH, MAX_LOOK_PITCH);

      cameraEuler.set(pointerLookState.pitch, pointerLookState.yaw, 0, 'YXZ');
      camera.quaternion.setFromEuler(cameraEuler);

      const targetDistance = Math.max(camera.position.distanceTo(rotationTargetRef.current), 0.0001);
      lookDirection.set(0, 0, -1).applyQuaternion(camera.quaternion);
      rotationTargetRef.current.copy(camera.position).addScaledVector(lookDirection, targetDistance);
      controls.target.copy(rotationTargetRef.current);
      controls.update();
    };

    const endPointerLook = (event?: PointerEvent) => {
      const activePointerId = pointerLookState.activePointerId;
      if (activePointerId === null) {
        return;
      }

      pointerLookState.activePointerId = null;

      if (event && domElement.hasPointerCapture(activePointerId)) {
        domElement.releasePointerCapture(activePointerId);
      }
    };

    endPointerLookRef.current = endPointerLook;

    rendererRef.current = renderer;
    sceneRef.current = scene;
    cameraRef.current = camera;
    raycasterRef.current = raycaster;
    hoverRaycasterRef.current = raycaster;
    clearVoxelHoverDebug();
    hoverSystemReadyRef.current = true;
    retryPendingVoxelHover();

    const performHoverHitTest = (event: PointerEvent): string | null => {
      const cameraInstance = cameraRef.current;
      const trackGroupInstance = trackGroupRef.current;
      const raycasterInstance = hoverRaycasterRef.current;
      if (!cameraInstance || !trackGroupInstance || !raycasterInstance || !trackGroupInstance.visible) {
        clearHoverState('pointer');
        return null;
      }

      const rect = domElement.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;
      if (width <= 0 || height <= 0) {
        clearHoverState('pointer');
        return null;
      }

      const offsetX = event.clientX - rect.left;
      const offsetY = event.clientY - rect.top;
      if (offsetX < 0 || offsetY < 0 || offsetX > width || offsetY > height) {
        clearHoverState('pointer');
        return null;
      }

      pointerVector.set((offsetX / width) * 2 - 1, -(offsetY / height) * 2 + 1);
      raycasterInstance.setFromCamera(pointerVector, cameraInstance);

      const visibleObjects: THREE.Object3D[] = [];
      for (const resource of trackLinesRef.current.values()) {
        if (resource.line.visible) {
          visibleObjects.push(resource.line);
        }
        if (resource.endCap.visible) {
          visibleObjects.push(resource.endCap);
        }
      }

      if (visibleObjects.length === 0) {
        clearHoverState('pointer');
        return null;
      }

      const intersections = raycasterInstance.intersectObjects(visibleObjects, false);
      if (intersections.length === 0) {
        clearHoverState('pointer');
        return null;
      }

      const intersection = intersections[0];
      const trackId = getTrackIdFromObject(intersection.object);
      if (trackId === null) {
        clearHoverState('pointer');
        return null;
      }

      updateHoverState(trackId, { x: offsetX, y: offsetY });
      return trackId;
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0) {
        return;
      }

      const shouldUsePointerLook = followedTrackIdRef.current === null;
      if (shouldUsePointerLook) {
        beginPointerLook(event);
      } else {
        endPointerLook();
      }

      if (hoverSystemReadyRef.current) {
        updateVoxelHover(event);
      } else {
        pendingHoverEventRef.current = event;
        retryPendingVoxelHover();
      }
      const hitTrackId = performHoverHitTest(event);
      if (hitTrackId !== null) {
        onTrackSelectionToggle(hitTrackId);
      }
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (followedTrackIdRef.current === null) {
        updatePointerLook(event);
      }

      if (hoverSystemReadyRef.current) {
        updateVoxelHover(event);
      } else {
        pendingHoverEventRef.current = event;
        retryPendingVoxelHover();
      }
      performHoverHitTest(event);
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (hoverSystemReadyRef.current) {
        updateVoxelHover(event);
      } else {
        pendingHoverEventRef.current = event;
        retryPendingVoxelHover();
      }
      performHoverHitTest(event);

      endPointerLook(event);
    };

    const handlePointerLeave = (event: PointerEvent) => {
      clearHoverState('pointer');
      clearVoxelHover();
      endPointerLook(event);
    };

    const pointerDownOptions: AddEventListenerOptions = { capture: true };

    domElement.addEventListener('pointerdown', handlePointerDown, pointerDownOptions);
    pointerTarget.addEventListener('pointermove', handlePointerMove);
    pointerTarget.addEventListener('pointerup', handlePointerUp);
    pointerTarget.addEventListener('pointercancel', handlePointerUp);
    pointerTarget.addEventListener('pointerleave', handlePointerLeave);

    resetVrPlaybackHudPlacement();
    resetVrChannelsHudPlacement();
    resetVrTracksHudPlacement();
    onRendererInitialized();

    const resizeObserver = new ResizeObserver(() => handleResize());
    resizeObserver.observe(container);
    handleResize();

    const worldUp = new THREE.Vector3(0, 1, 0);
    const forwardVector = new THREE.Vector3();
    const horizontalForward = new THREE.Vector3();
    const rightVector = new THREE.Vector3();
    const movementVector = new THREE.Vector3();

    const applyKeyboardMovement = () => {
      if (renderer.xr.isPresenting) {
        return;
      }
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

    let lastRenderTickSummary: { presenting: boolean; hoveredByController: string | null } | null = null;

    const renderLoop = (timestamp: number) => {
      applyKeyboardMovement();
      controls.update();
      rotationTargetRef.current.copy(controls.target);

      const blinkPhase = (timestamp % SELECTED_TRACK_BLINK_PERIOD_MS) / SELECTED_TRACK_BLINK_PERIOD_MS;
      const blinkAngle = blinkPhase * Math.PI * 2;
      const blinkWave = Math.sin(blinkAngle);
      const blinkScale = SELECTED_TRACK_BLINK_BASE + SELECTED_TRACK_BLINK_RANGE * blinkWave;
      const blinkColorMix = 0.5 + 0.5 * blinkWave;

      for (const resource of trackLinesRef.current.values()) {
        const {
          line,
          outline,
          endCap,
          material,
          outlineMaterial,
          endCapMaterial,
          baseColor,
          highlightColor
        } = resource;
        const shouldShow = resource.shouldShow;
        if (line.visible !== shouldShow) {
          line.visible = shouldShow;
        }
        const isHighlighted = resource.isFollowed || resource.isHovered || resource.isSelected;
        const outlineVisible = shouldShow && isHighlighted;
        if (outline.visible !== outlineVisible) {
          outline.visible = outlineVisible;
        }

        const endCapVisible = shouldShow && resource.hasVisiblePoints;
        if (endCap.visible !== endCapVisible) {
          endCap.visible = endCapVisible;
        }

        const targetColor = resource.isSelected
          ? trackBlinkColorTemp.copy(baseColor).lerp(highlightColor, blinkColorMix)
          : isHighlighted
            ? highlightColor
            : baseColor;
        if (!material.color.equals(targetColor)) {
          material.color.copy(targetColor);
          material.needsUpdate = true;
        }
        if (!endCapMaterial.color.equals(targetColor)) {
          endCapMaterial.color.copy(targetColor);
          endCapMaterial.needsUpdate = true;
        }

        const blinkMultiplier = resource.isSelected ? blinkScale : 1;
        const targetOpacity = resource.targetOpacity * blinkMultiplier;
        if (material.opacity !== targetOpacity) {
          material.opacity = targetOpacity;
          material.needsUpdate = true;
        }
        if (endCapMaterial.opacity !== targetOpacity) {
          endCapMaterial.opacity = targetOpacity;
          endCapMaterial.needsUpdate = true;
        }

        if (material.linewidth !== resource.targetLineWidth) {
          material.linewidth = resource.targetLineWidth;
          material.needsUpdate = true;
        }

        const outlineBlinkMultiplier = resource.isSelected ? blinkScale : 1;
        const targetOutlineOpacity = resource.outlineBaseOpacity * outlineBlinkMultiplier;
        if (outlineMaterial.opacity !== targetOutlineOpacity) {
          outlineMaterial.opacity = targetOutlineOpacity;
          outlineMaterial.needsUpdate = true;
        }

        const outlineWidth = resource.targetLineWidth + resource.outlineExtraWidth;
        if (outlineMaterial.linewidth !== outlineWidth) {
          outlineMaterial.linewidth = outlineWidth;
          outlineMaterial.needsUpdate = true;
        }

        if (resource.needsAppearanceUpdate) {
          const currentCapScale = endCap.scale.x;
          if (currentCapScale !== resource.endCapRadius) {
            endCap.scale.setScalar(resource.endCapRadius);
          }
        }

        if (resource.needsAppearanceUpdate) {
          resource.needsAppearanceUpdate = false;
        }
      }

      if (followedTrackIdRef.current !== null) {
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
      }

      const hoverPulse = 0.5 + 0.5 * Math.sin(timestamp * HOVER_PULSE_SPEED);
      for (const resource of resources.values()) {
        if (resource.mode !== '3d') {
          continue;
        }
        const uniforms = (resource.mesh.material as THREE.ShaderMaterial).uniforms;
        if (uniforms.u_hoverPulse) {
          uniforms.u_hoverPulse.value = hoverPulse;
        }
      }

      const playbackLoopState = playbackLoopRef.current;
      const playbackState = playbackStateRef.current;
      const playbackSliderActive = vrHoverStateRef.current.playbackSliderActive;
      const shouldAdvancePlayback =
        playbackState.isPlaying &&
        !playbackState.playbackDisabled &&
        playbackState.totalTimepoints > 1 &&
        !playbackSliderActive &&
        typeof playbackState.onTimeIndexChange === 'function';

      if (shouldAdvancePlayback) {
        const minFps = VR_PLAYBACK_MIN_FPS;
        const maxFps = VR_PLAYBACK_MAX_FPS;
        const requestedFps = playbackState.fps ?? minFps;
        const clampedFps = Math.min(Math.max(requestedFps, minFps), maxFps);
        const frameDuration = clampedFps > 0 ? 1000 / clampedFps : 0;

        if (frameDuration > 0) {
          if (playbackLoopState.lastTimestamp === null) {
            playbackLoopState.lastTimestamp = timestamp;
            playbackLoopState.accumulator = 0;
          } else {
            const delta = Math.max(0, Math.min(timestamp - playbackLoopState.lastTimestamp, 1000));
            playbackLoopState.accumulator += delta;
            playbackLoopState.lastTimestamp = timestamp;

            const maxIndex = Math.max(0, playbackState.totalTimepoints - 1);
            let didAdvance = false;

            while (playbackLoopState.accumulator >= frameDuration) {
              playbackLoopState.accumulator -= frameDuration;
              let nextIndex = playbackState.timeIndex + 1;
              if (nextIndex > maxIndex) {
                nextIndex = 0;
              }
              if (nextIndex === playbackState.timeIndex) {
                break;
              }

              playbackState.timeIndex = nextIndex;
              timeIndexRef.current = nextIndex;

              const total = Math.max(0, playbackState.totalTimepoints);
              const labelCurrent = total > 0 ? Math.min(nextIndex + 1, total) : 0;
              playbackState.playbackLabel = `${labelCurrent} / ${total}`;
              playbackState.onTimeIndexChange?.(nextIndex);
              didAdvance = true;
            }

            if (didAdvance) {
              updateVrPlaybackHud();
            }
          }
        }
      } else {
        playbackLoopState.lastTimestamp = null;
        playbackLoopState.accumulator = 0;
      }

      refreshVrHudPlacementsRef.current?.();

      updateControllerRays();
      const hoveredEntry = controllersRef.current.find((entry) => entry.hoverTrackId);
      const renderSummary = {
        presenting: renderer.xr.isPresenting,
        hoveredByController: hoveredEntry?.hoverTrackId ?? null
      };
      if (
        !lastRenderTickSummary ||
        renderSummary.presenting !== lastRenderTickSummary.presenting ||
        renderSummary.hoveredByController !== lastRenderTickSummary.hoveredByController
      ) {
        vrLog('[VR] render tick', renderSummary);
      }
      lastRenderTickSummary = renderSummary;
      renderer.render(scene, camera);
    };
    renderer.setAnimationLoop(renderLoop);

    return () => {
      hoverTeardownRef.current = true;
      hoverSystemReadyRef.current = false;
      pendingHoverEventRef.current = null;

      restoreVrFoveation();
      applyVolumeStepScaleToResources(DESKTOP_VOLUME_STEP_SCALE);
      renderer.setAnimationLoop(null);

      const activeSession = xrSessionRef.current;
      if (activeSession) {
        try {
          sessionCleanupRef.current?.();
        } finally {
          activeSession.end().catch(() => undefined);
        }
      }
      xrSessionRef.current = null;
      sessionCleanupRef.current = null;
      setControllerVisibility(false);
      const hud = vrPlaybackHudRef.current;
      if (hud) {
        if (hud.group.parent) {
          hud.group.parent.remove(hud.group);
        }
        hud.group.traverse((object) => {
          if ((object as THREE.Mesh).isMesh) {
            const mesh = object as THREE.Mesh;
            if (mesh.geometry) {
              mesh.geometry.dispose?.();
            }
            disposeMaterial(mesh.material);
          }
        });
        hud.labelTexture.dispose();
        vrPlaybackHudRef.current = null;
        vrPlaybackHudPlacementRef.current = null;
      }

      const channelsHud = vrChannelsHudRef.current;
      if (channelsHud) {
        if (channelsHud.group.parent) {
          channelsHud.group.parent.remove(channelsHud.group);
        }
        channelsHud.group.traverse((object) => {
          if ((object as THREE.Mesh).isMesh) {
            const mesh = object as THREE.Mesh;
            if (mesh.geometry) {
              mesh.geometry.dispose?.();
            }
            disposeMaterial(mesh.material);
          }
        });
        channelsHud.panelTexture.dispose();
        vrChannelsHudRef.current = null;
        vrChannelsHudPlacementRef.current = null;
      }

      const tracksHud = vrTracksHudRef.current;
      if (tracksHud) {
        if (tracksHud.group.parent) {
          tracksHud.group.parent.remove(tracksHud.group);
        }
        tracksHud.group.traverse((object) => {
          if ((object as THREE.Mesh).isMesh) {
            const mesh = object as THREE.Mesh;
            if (mesh.geometry) {
              mesh.geometry.dispose?.();
            }
            disposeMaterial(mesh.material);
          }
        });
        tracksHud.panelTexture.dispose();
        vrTracksHudRef.current = null;
        vrTracksHudPlacementRef.current = null;
      }

      const resources = resourcesRef.current;
      for (const resource of resources.values()) {
        scene.remove(resource.mesh);
        resource.mesh.geometry.dispose();
        disposeMaterial(resource.mesh.material);
        resource.texture.dispose();
      }
      resources.clear();

      const trackGroup = trackGroupRef.current;
      if (trackGroup) {
        for (const resource of trackLinesRef.current.values()) {
          trackGroup.remove(resource.line);
          trackGroup.remove(resource.outline);
          trackGroup.remove(resource.endCap);
          resource.geometry.dispose();
          resource.material.dispose();
          resource.outlineMaterial.dispose();
          resource.endCap.geometry.dispose();
          resource.endCapMaterial.dispose();
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
      vrTranslationHandleRef.current = null;
      vrVolumeScaleHandleRef.current = null;
      vrVolumeYawHandlesRef.current = [];
      vrVolumePitchHandleRef.current = null;
      volumeRootGroupRef.current = null;
      clearHoverState();

      domElement.removeEventListener('pointerdown', handlePointerDown, pointerDownOptions);
      pointerTarget.removeEventListener('pointermove', handlePointerMove);
      pointerTarget.removeEventListener('pointerup', handlePointerUp);
      pointerTarget.removeEventListener('pointercancel', handlePointerUp);
      pointerTarget.removeEventListener('pointerleave', handlePointerLeave);

      raycasterRef.current = null;
      hoverRaycasterRef.current = null;
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
      if (hoverRetryFrameRef.current !== null) {
        cancelAnimationFrame(hoverRetryFrameRef.current);
        hoverRetryFrameRef.current = null;
      }
      endVrSessionRequestRef.current = null;
    };
  }, [
    applyVrPlaybackHoverState,
    applyVolumeStepScaleToResources,
    containerNode,
    controllersRef,
    createVrChannelsHud,
    createVrPlaybackHud,
    createVrTracksHud,
    clearVoxelHoverDebug,
    endVrSessionRequestRef,
    onRendererInitialized,
    playbackLoopRef,
    playbackStateRef,
    raycasterRef,
    hoverRaycasterRef,
    resetVrChannelsHudPlacement,
    resetVrPlaybackHudPlacement,
    resetVrTracksHudPlacement,
    retryPendingVoxelHover,
    restoreVrFoveation,
    sessionCleanupRef,
    setHoverNotReady,
    setControllerVisibility,
    updateControllerRays,
    updateVrChannelsHud,
    updateVrPlaybackHud,
    updateVrTracksHud,
    vrChannelsHudPlacementRef,
    vrChannelsHudRef,
    vrHoverStateRef,
    vrPlaybackHudPlacementRef,
    vrPlaybackHudRef,
    vrTracksHudPlacementRef,
    vrTracksHudRef,
    vrTranslationHandleRef,
    vrVolumePitchHandleRef,
    vrVolumeScaleHandleRef,
    vrVolumeYawHandlesRef,
    xrSessionRef,
  ]);

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
      disposeMaterial(resource.mesh.material);
      resource.texture.dispose();
      resource.labelTexture?.dispose();
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
      volumeUserScaleRef.current = 1;

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
    const materialBlending = isAdditiveBlending ? THREE.AdditiveBlending : THREE.NormalBlending;

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

        let labelTexture: THREE.Data3DTexture | null = null;
        if (layer.isSegmentation && volume.segmentationLabels) {
          const labelData = new Float32Array(volume.segmentationLabels.length);
          labelData.set(volume.segmentationLabels);
          labelTexture = new THREE.Data3DTexture(
            labelData,
            volume.width,
            volume.height,
            volume.depth
          );
          labelTexture.format = THREE.RedFormat;
          labelTexture.type = THREE.FloatType;
          labelTexture.minFilter = THREE.NearestFilter;
          labelTexture.magFilter = THREE.NearestFilter;
          labelTexture.unpackAlignment = 1;
          labelTexture.needsUpdate = true;
        }

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
          const samplingFilter =
            layer.samplingMode === 'nearest' ? THREE.NearestFilter : THREE.LinearFilter;
          texture.minFilter = samplingFilter;
          texture.magFilter = samplingFilter;
          texture.unpackAlignment = 1;
          texture.colorSpace = THREE.LinearSRGBColorSpace;
          texture.needsUpdate = true;

          const shader = VolumeRenderShader;
          const uniforms = THREE.UniformsUtils.clone(shader.uniforms);
          uniforms.u_data.value = texture;
          uniforms.u_size.value.set(volume.width, volume.height, volume.depth);
          uniforms.u_clim.value.set(0, 1);
          uniforms.u_renderstyle.value = layer.renderStyle;
          uniforms.u_renderthreshold.value = 0.5;
          uniforms.u_cmdata.value = colormapTexture;
          uniforms.u_channels.value = volume.channels;
          uniforms.u_windowMin.value = layer.windowMin;
          uniforms.u_windowMax.value = layer.windowMax;
          uniforms.u_invert.value = layer.invert ? 1 : 0;
          uniforms.u_stepScale.value = volumeStepScaleRef.current;
          uniforms.u_nearestSampling.value = layer.samplingMode === 'nearest' ? 1 : 0;
          if (uniforms.u_segmentationLabels) {
            uniforms.u_segmentationLabels.value = labelTexture;
          }
          if (uniforms.u_additive) {
            uniforms.u_additive.value = isAdditiveBlending ? 1 : 0;
          }

          const material = new THREE.ShaderMaterial({
            uniforms,
            vertexShader: shader.vertexShader,
            fragmentShader: shader.fragmentShader,
            side: THREE.BackSide,
            transparent: true,
            blending: materialBlending
          });
          material.depthWrite = false;

          const geometry = new THREE.BoxGeometry(volume.width, volume.height, volume.depth);
          geometry.translate(volume.width / 2 - 0.5, volume.height / 2 - 0.5, volume.depth / 2 - 0.5);

          const mesh = new THREE.Mesh(geometry, material);
          mesh.visible = layer.visible;
          mesh.renderOrder = index;
          mesh.position.set(layer.offsetX, layer.offsetY, 0);

          const worldCameraPosition = new THREE.Vector3();
          const localCameraPosition = new THREE.Vector3();
          mesh.onBeforeRender = (_renderer, _scene, renderCamera) => {
            const shaderMaterial = mesh.material as THREE.ShaderMaterial;
            const cameraUniform = shaderMaterial.uniforms?.u_cameraPos?.value as
              | THREE.Vector3
              | undefined;
            if (!cameraUniform) {
              return;
            }

            worldCameraPosition.setFromMatrixPosition(renderCamera.matrixWorld);
            localCameraPosition.copy(worldCameraPosition);
            mesh.worldToLocal(localCameraPosition);
            cameraUniform.copy(localCameraPosition);
          };

          const volumeRootGroup = volumeRootGroupRef.current;
          if (volumeRootGroup) {
            volumeRootGroup.add(mesh);
          } else {
            scene.add(mesh);
          }
          mesh.updateMatrixWorld(true);

          resourcesRef.current.set(layer.key, {
            mesh,
            texture,
            labelTexture,
            dimensions: { width: volume.width, height: volume.height, depth: volume.depth },
            channels: volume.channels,
            mode: viewerMode,
            samplingMode: layer.samplingMode
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
          uniforms.u_windowMin.value = layer.windowMin;
          uniforms.u_windowMax.value = layer.windowMax;
          uniforms.u_invert.value = layer.invert ? 1 : 0;
          if (uniforms.u_additive) {
            uniforms.u_additive.value = isAdditiveBlending ? 1 : 0;
          }

          const material = new THREE.ShaderMaterial({
            uniforms,
            vertexShader: shader.vertexShader,
            fragmentShader: shader.fragmentShader,
            transparent: true,
            side: THREE.DoubleSide,
            depthTest: false,
            depthWrite: false,
            blending: materialBlending
          });

          const geometry = new THREE.PlaneGeometry(volume.width, volume.height);
          geometry.translate(volume.width / 2 - 0.5, volume.height / 2 - 0.5, 0);

          const mesh = new THREE.Mesh(geometry, material);
          mesh.position.set(layer.offsetX, layer.offsetY, clampedIndex);
          mesh.visible = layer.visible;
          mesh.renderOrder = index;
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
            samplingMode: layer.samplingMode,
            sliceBuffer: sliceInfo.data
          });
        }

        resources = resourcesRef.current.get(layer.key) ?? null;
      }

      if (resources) {
        const { mesh } = resources;
        mesh.visible = layer.visible;
        mesh.renderOrder = index;

        const materialUniforms = (mesh.material as THREE.ShaderMaterial).uniforms;
        materialUniforms.u_channels.value = volume.channels;
        materialUniforms.u_windowMin.value = layer.windowMin;
        materialUniforms.u_windowMax.value = layer.windowMax;
        materialUniforms.u_invert.value = layer.invert ? 1 : 0;
        materialUniforms.u_cmdata.value = colormapTexture;
        if (materialUniforms.u_additive) {
          materialUniforms.u_additive.value = isAdditiveBlending ? 1 : 0;
        }
        const shaderMaterial = mesh.material as THREE.ShaderMaterial;
        const desiredBlending = materialBlending;
        if (shaderMaterial.blending !== desiredBlending) {
          shaderMaterial.blending = desiredBlending;
          shaderMaterial.needsUpdate = true;
        }
        if (materialUniforms.u_stepScale) {
          materialUniforms.u_stepScale.value = volumeStepScaleRef.current;
        }
        if (materialUniforms.u_nearestSampling) {
          materialUniforms.u_nearestSampling.value =
            layer.samplingMode === 'nearest' ? 1 : 0;
        }

        if (resources.mode === '3d') {
          const preparation = cachedPreparation ?? getCachedTextureData(volume);
          const dataTexture = resources.texture as THREE.Data3DTexture;
          if (resources.samplingMode !== layer.samplingMode) {
            const samplingFilter =
              layer.samplingMode === 'nearest' ? THREE.NearestFilter : THREE.LinearFilter;
            dataTexture.minFilter = samplingFilter;
            dataTexture.magFilter = samplingFilter;
            dataTexture.needsUpdate = true;
            resources.samplingMode = layer.samplingMode;
          }
          dataTexture.image.data = preparation.data;
          dataTexture.format = preparation.format;
          dataTexture.needsUpdate = true;
          materialUniforms.u_data.value = dataTexture;
          if (layer.isSegmentation && volume.segmentationLabels) {
            const expectedLength = volume.segmentationLabels.length;
            let labelTexture = resources.labelTexture ?? null;
            const needsLabelTextureRebuild =
              !labelTexture ||
              !(labelTexture.image?.data instanceof Float32Array) ||
              labelTexture.image.data.length !== expectedLength;

            if (needsLabelTextureRebuild) {
              labelTexture?.dispose();
              const labelData = new Float32Array(volume.segmentationLabels.length);
              labelData.set(volume.segmentationLabels);
              labelTexture = new THREE.Data3DTexture(
                labelData,
                volume.width,
                volume.height,
                volume.depth
              );
              labelTexture.format = THREE.RedFormat;
              labelTexture.type = THREE.FloatType;
              labelTexture.minFilter = THREE.NearestFilter;
              labelTexture.magFilter = THREE.NearestFilter;
              labelTexture.unpackAlignment = 1;
              labelTexture.needsUpdate = true;
            } else if (labelTexture) {
              const labelData = labelTexture.image.data as Float32Array;
              labelData.set(volume.segmentationLabels);
              labelTexture.needsUpdate = true;
            }
            resources.labelTexture = labelTexture;
            if (materialUniforms.u_segmentationLabels) {
              materialUniforms.u_segmentationLabels.value = labelTexture;
            }
          } else if (materialUniforms.u_segmentationLabels) {
            materialUniforms.u_segmentationLabels.value = null;
            resources.labelTexture = null;
          }
          if (materialUniforms.u_renderstyle) {
            materialUniforms.u_renderstyle.value = layer.renderStyle;
          }

          const desiredX = layer.offsetX;
          const desiredY = layer.offsetY;
          if (mesh.position.x !== desiredX || mesh.position.y !== desiredY) {
            mesh.position.set(desiredX, desiredY, mesh.position.z);
            mesh.updateMatrixWorld();
          }
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
      }

      seenKeys.add(layer.key);
    });

    for (const key of Array.from(resourcesRef.current.keys())) {
      if (!seenKeys.has(key)) {
        removeResource(key);
      }
    }

    applyHoverHighlightToResources();

  }, [
    applyTrackGroupTransform,
    applyVolumeStepScaleToResources,
    getColormapTexture,
    layers,
    renderContextRevision,
    applyHoverHighlightToResources,
    isAdditiveBlending
  ]);

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

  useEffect(() => {
    return () => {
      emitHoverVoxel(null);
    };
  }, [emitHoverVoxel]);

  return (
    <div className="volume-viewer">
      {vrParams ? (
        <Suspense fallback={null}>
          <VolumeViewerVrBridge params={vrParams} onValue={setVrIntegration} />
        </Suspense>
      ) : null}
      <section className="viewer-surface">
        {showLoadingOverlay && (
          <div className="overlay">
            <div className="loading-panel">
              <span className="loading-title">Loading dataset…</span>
            </div>
          </div>
        )}
        <div className={`render-surface${hasMeasured ? ' is-ready' : ''}`} ref={handleContainerRef}>
          {hoveredTrackLabel && tooltipPosition ? (
            <div
              className="track-tooltip"
              style={{ left: `${tooltipPosition.x}px`, top: `${tooltipPosition.y}px` }}
              role="status"
              aria-live="polite"
            >
              {hoveredTrackLabel}
            </div>
          ) : null}
          {isDevMode && voxelHoverDebug ? (
            <div className="hover-debug" role="status" aria-live="polite">
              Hover sampling unavailable: {voxelHoverDebug}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

export default VolumeViewer;
