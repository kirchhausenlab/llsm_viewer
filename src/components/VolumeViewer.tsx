import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { Line2 } from 'three/examples/jsm/lines/Line2';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial';
import type { NormalizedVolume } from '../volumeProcessing';
import { VolumeRenderShader } from '../shaders/volumeRenderShader';
import { SliceRenderShader } from '../shaders/sliceRenderShader';
import { getCachedTextureData } from '../textureCache';
import './VolumeViewer.css';
import type { TrackColorMode, TrackDefinition } from '../types/tracks';
import type {
  MovementState,
  PointerState,
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

const getOrbitControlsPan = (
  controls: OrbitControls,
): ((deltaX: number, deltaY: number) => void) | null => {
  const candidate = (controls as { pan?: (dx: number, dy: number) => void }).pan;
  return typeof candidate === 'function' ? candidate.bind(controls) : null;
};

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

const clampValue = (value: number, min: number, max: number): number => {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
};

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

type UseVolumeViewerVrBridgeProps = {
  params: UseVolumeViewerVrParams;
  onValue: Dispatch<SetStateAction<UseVolumeViewerVrResult | null>>;
};

const UseVolumeViewerVrBridge = lazy(async () => {
  const module = await import('./volume-viewer/useVolumeViewerVr');
  const Bridge = ({ params, onValue }: UseVolumeViewerVrBridgeProps) => {
    const api = module.useVolumeViewerVr(params);
    useEffect(() => {
      onValue((previous) =>
        previous?.playbackLoopRef === api.playbackLoopRef ? previous : api,
      );
    }, [api, onValue]);
    useEffect(
      () => () => {
        onValue(null);
      },
      [onValue],
    );
    return null;
  };
  return { default: Bridge };
});


const SELECTED_TRACK_BLINK_PERIOD_MS = 1600;
const SELECTED_TRACK_BLINK_BASE = 0.85;
const SELECTED_TRACK_BLINK_RANGE = 0.15;
const FOLLOWED_TRACK_LINE_WIDTH_MULTIPLIER = 1.35;
const SELECTED_TRACK_LINE_WIDTH_MULTIPLIER = 1.5;
const HOVERED_TRACK_LINE_WIDTH_MULTIPLIER = 1.2;

const MAX_RENDERER_PIXEL_RATIO = 2;
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const VIEWER_YAW_FORWARD_REFERENCE = new THREE.Vector3(0, 0, -1);
const VIEWER_YAW_RIGHT_REFERENCE = new THREE.Vector3(1, 0, 0);
const viewerYawQuaternionTemp = new THREE.Quaternion();
const viewerYawForwardTemp = new THREE.Vector3();

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
  onTogglePlayback,
  onTimeIndexChange,
  onFpsChange,
  onRegisterReset,
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

  const containerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const resourcesRef = useRef<Map<string, VolumeResources>>(new Map());
  const currentDimensionsRef = useRef<{ width: number; height: number; depth: number } | null>(null);
  const colormapCacheRef = useRef<Map<string, THREE.DataTexture>>(new Map());
  const rotationTargetRef = useRef(new THREE.Vector3());
  const rotationAnchorRef = useRef(new THREE.Vector3());
  const defaultRotationAnchorRef = useRef(new THREE.Vector3());
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
            pointerStateRef,
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
      pointerStateRef,
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
        resource = {
          line,
          outline,
          geometry,
          material,
          outlineMaterial,
          times,
          baseColor: baseColor.clone(),
          highlightColor: highlightColor.clone(),
          channelId: track.channelId,
          baseLineWidth: DEFAULT_TRACK_LINE_WIDTH,
          targetLineWidth: DEFAULT_TRACK_LINE_WIDTH,
          outlineExtraWidth: Math.max(DEFAULT_TRACK_LINE_WIDTH * 0.75, 0.4),
          targetOpacity: DEFAULT_TRACK_OPACITY,
          outlineBaseOpacity: 0,
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
        resource.baseColor.copy(baseColor);
        resource.highlightColor.copy(highlightColor);
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

      const { line, outline } = resource;

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
      rotationAnchorRef.current.copy(defaultRotationAnchorRef.current);
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

    rotationAnchorRef.current.copy(centroid);

    trackFollowOffsetRef.current = camera.position.clone().sub(rotationTarget);
  }, [
    clampedTimeIndex,
    computeTrackCentroid,
    followedTrackId,
    primaryVolume
  ]);

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
      rotationAnchorRef.current.copy(defaultViewState.target);
      defaultRotationAnchorRef.current.copy(defaultViewState.target);
      controls.update();
      return;
    }

    controls.reset();
    controls.target.copy(rotationTargetRef.current);
    controls.update();
    rotationAnchorRef.current.copy(rotationTargetRef.current);
    defaultRotationAnchorRef.current.copy(rotationTargetRef.current);
  }, [applyVolumeRootTransform]);
  resetVolumeCallbackRef.current = handleResetVolume;

  const handleResetView = useCallback(() => {
    handleResetVolume();
    handleResetHudPlacement();
  }, [handleResetHudPlacement, handleResetVolume]);

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
    const container = containerNode;
    if (!container) {
      return;
    }

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const pixelRatio =
      typeof window === 'undefined'
        ? 1
        : Math.min(window.devicePixelRatio ?? 1, MAX_RENDERER_PIXEL_RATIO);
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.background = 'transparent';
    renderer.xr.enabled = true;
    renderer.xr.setReferenceSpaceType?.('local-floor');

    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();

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

    const camera = new THREE.PerspectiveCamera(
      38,
      container.clientWidth / container.clientHeight,
      0.0001,
      1000
    );
    camera.position.set(0, 0, 2.5);

    scene.add(camera);
    cameraRef.current = camera;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    controls.dampingFactor = 0;
    controls.enablePan = false;
    controls.enableRotate = false;
    controls.rotateSpeed = 0.65;
    controls.zoomSpeed = 0.7;
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

    const pointerVector = new THREE.Vector2();
    const raycaster = new THREE.Raycaster();
    raycaster.params.Line = { threshold: 0.02 };
    raycaster.params.Line2 = { threshold: 0.02 };
    raycasterRef.current = raycaster;

    const performHoverHitTest = (event: PointerEvent): string | null => {
      const cameraInstance = cameraRef.current;
      const trackGroupInstance = trackGroupRef.current;
      const raycasterInstance = raycasterRef.current;
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

      const visibleLines: Line2[] = [];
      for (const resource of trackLinesRef.current.values()) {
        if (resource.line.visible) {
          visibleLines.push(resource.line);
        }
      }

      if (visibleLines.length === 0) {
        clearHoverState('pointer');
        return null;
      }

      const intersections = raycasterInstance.intersectObjects(visibleLines, false);
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
      const controls = controlsRef.current;
      const cameraInstance = cameraRef.current;
      if (!controls || !cameraInstance) {
        return;
      }

      if (event.button !== 0 || !event.isPrimary) {
        return;
      }

      let mode: PointerState['mode'] | null = null;
      if (event.ctrlKey) {
        mode = 'dolly';
      } else if (event.shiftKey) {
        mode = 'pan';
      } else {
        mode = 'rotate';
      }

      if (mode === 'rotate') {
        const hitTrackId = performHoverHitTest(event);
        if (hitTrackId !== null) {
          onTrackSelectionToggle(hitTrackId);
          return;
        }
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const previousEnablePan = mode === 'pan' ? controls.enablePan : null;
      if (mode === 'pan') {
        controls.enablePan = true;
      }

      clearHoverState('pointer');

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

      clearHoverState('pointer');

      const controls = controlsRef.current;
      const camera = cameraRef.current;
      if (!controls || !camera) {
        return;
      }

      const deltaX = event.clientX - state.lastX;
      const deltaY = event.clientY - state.lastY;

      if (state.mode === 'pan') {
        const panControls = getOrbitControlsPan(controls);
        panControls?.(deltaX, deltaY);
        rotationTargetRef.current.copy(controls.target);
      } else if (state.mode === 'dolly') {
        const rotationTarget = rotationTargetRef.current;
        camera.getWorldDirection(dollyDirection);
        const distance = rotationTarget.distanceTo(camera.position);
        const depthScale = Math.max(distance * 0.0025, 0.0006);
        const moveAmount = -deltaY * depthScale;
        dollyDirection.multiplyScalar(moveAmount);
        camera.position.add(dollyDirection);
        controls.target.copy(rotationTarget);
      } else {
        rotateCameraAroundAnchor(deltaX, deltaY);
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
      clearHoverState('pointer');
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
    const dollyDirection = new THREE.Vector3();
    const orbitRotationOffset = new THREE.Vector3();
    const orbitTranslationOffset = new THREE.Vector3();
    const orbitSpherical = new THREE.Spherical();

    const rotateCameraAroundAnchor = (deltaX: number, deltaY: number) => {
      const cameraInstance = cameraRef.current;
      const controlsInstance = controlsRef.current;
      if (!cameraInstance || !controlsInstance) {
        return;
      }

      const rotationTarget = rotationTargetRef.current;
      const rotationAnchor = rotationAnchorRef.current;
      if (!rotationTarget || !rotationAnchor) {
        return;
      }

      const elementWidth = domElement.clientWidth;
      const elementHeight = domElement.clientHeight;
      const minDimension = Math.min(elementWidth, elementHeight);
      const safeDimension = minDimension > 0 ? minDimension : 1;
      const rotationSpeed = controlsInstance.rotateSpeed ?? 1;

      orbitTranslationOffset.copy(rotationTarget).sub(rotationAnchor);
      orbitRotationOffset.copy(cameraInstance.position).sub(rotationTarget);
      orbitSpherical.setFromVector3(orbitRotationOffset);

      const azimuthDelta = (2 * Math.PI * deltaX * rotationSpeed) / safeDimension;
      const polarDelta = (Math.PI * deltaY * rotationSpeed) / safeDimension;

      orbitSpherical.theta -= azimuthDelta;
      orbitSpherical.phi -= polarDelta;

      const EPS = 1e-4;
      orbitSpherical.phi = Math.max(EPS, Math.min(Math.PI - EPS, orbitSpherical.phi));
      orbitSpherical.makeSafe();

      orbitRotationOffset.setFromSpherical(orbitSpherical);

      cameraInstance.position
        .copy(rotationAnchor)
        .add(orbitTranslationOffset)
        .add(orbitRotationOffset);

      controlsInstance.target.copy(rotationTarget);
    };

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

      const blinkPhase = (timestamp % SELECTED_TRACK_BLINK_PERIOD_MS) / SELECTED_TRACK_BLINK_PERIOD_MS;
      const blinkScale =
        SELECTED_TRACK_BLINK_BASE + SELECTED_TRACK_BLINK_RANGE * Math.sin(blinkPhase * Math.PI * 2);

      for (const resource of trackLinesRef.current.values()) {
        const { line, outline, material, outlineMaterial, baseColor, highlightColor } = resource;
        const shouldShow = resource.shouldShow;
        if (line.visible !== shouldShow) {
          line.visible = shouldShow;
        }
        const isHighlighted = resource.isFollowed || resource.isHovered || resource.isSelected;
        const outlineVisible = shouldShow && isHighlighted;
        if (outline.visible !== outlineVisible) {
          outline.visible = outlineVisible;
        }

        if (resource.needsAppearanceUpdate) {
          const targetColor = isHighlighted ? highlightColor : baseColor;
          if (!material.color.equals(targetColor)) {
            material.color.copy(targetColor);
            material.needsUpdate = true;
          }
        }

        const blinkMultiplier = resource.isSelected ? blinkScale : 1;
        const targetOpacity = resource.targetOpacity * blinkMultiplier;
        if (material.opacity !== targetOpacity) {
          material.opacity = targetOpacity;
          material.needsUpdate = true;
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
      vrTranslationHandleRef.current = null;
      vrVolumeScaleHandleRef.current = null;
      vrVolumeYawHandlesRef.current = [];
      vrVolumePitchHandleRef.current = null;
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
    endVrSessionRequestRef,
    onRendererInitialized,
    playbackLoopRef,
    playbackStateRef,
    raycasterRef,
    resetVrChannelsHudPlacement,
    resetVrPlaybackHudPlacement,
    resetVrTracksHudPlacement,
    restoreVrFoveation,
    sessionCleanupRef,
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
      rotationAnchorRef.current.set(0, 0, 0);
      defaultRotationAnchorRef.current.set(0, 0, 0);
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
      rotationAnchorRef.current.copy(rotationTarget);
      defaultRotationAnchorRef.current.copy(rotationTarget);
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

          const material = new THREE.ShaderMaterial({
            uniforms,
            vertexShader: shader.vertexShader,
            fragmentShader: shader.fragmentShader,
            side: THREE.BackSide,
            transparent: true
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
        if (materialUniforms.u_stepScale) {
          materialUniforms.u_stepScale.value = volumeStepScaleRef.current;
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

  }, [
    applyTrackGroupTransform,
    applyVolumeStepScaleToResources,
    getColormapTexture,
    layers,
    renderContextRevision
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

  return (
    <div className="volume-viewer">
      {vrParams ? (
        <Suspense fallback={null}>
          <UseVolumeViewerVrBridge params={vrParams} onValue={setVrIntegration} />
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
        </div>
      </section>
    </div>
  );
}

export default VolumeViewer;
