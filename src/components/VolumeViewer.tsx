// @ts-nocheck
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { Line2 } from 'three/examples/jsm/lines/Line2';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial';
import { XRControllerModelFactory } from 'three/examples/jsm/webxr/XRControllerModelFactory';
import type { NormalizedVolume } from '../volumeProcessing';
import { VolumeRenderShader } from '../shaders/volumeRenderShader';
import { SliceRenderShader } from '../shaders/sliceRenderShader';
import { getCachedTextureData } from '../textureCache';
import './VolumeViewer.css';
import type { TrackColorMode, TrackDefinition } from '../types/tracks';
import { DEFAULT_LAYER_COLOR, GRAYSCALE_COLOR_SWATCHES, normalizeHexColor } from '../layerColors';
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
  isPlaying: boolean;
  playbackDisabled: boolean;
  playbackLabel: string;
  isLoading: boolean;
  loadingProgress: number;
  loadedVolumes: number;
  expectedVolumes: number;
  onTogglePlayback: () => void;
  onTimeIndexChange: (nextIndex: number) => void;
  onRegisterReset: (handler: (() => void) | null) => void;
  tracks: TrackDefinition[];
  trackVisibility: Record<string, boolean>;
  trackOpacityByChannel: Record<string, number>;
  trackLineWidthByChannel: Record<string, number>;
  channelTrackColorModes: Record<string, TrackColorMode>;
  channelTrackOffsets: Record<string, { x: number; y: number }>;
  channelPanels: Array<{
    id: string;
    name: string;
    visible: boolean;
    activeLayerKey: string | null;
    layers: Array<{
      key: string;
      label: string;
      hasData: boolean;
      isGrayscale: boolean;
      settings: {
        contrast: number;
        brightness: number;
        color: string;
        xOffset: number;
        yOffset: number;
      };
    }>;
  }>;
  activeChannelPanelId: string | null;
  onChannelPanelSelect: (channelId: string) => void;
  onChannelVisibilityToggle: (channelId: string) => void;
  onChannelReset: (channelId: string) => void;
  onChannelLayerSelect: (channelId: string, layerKey: string) => void;
  onLayerContrastChange: (layerKey: string, value: number) => void;
  onLayerBrightnessChange: (layerKey: string, value: number) => void;
  onLayerOffsetChange: (layerKey: string, axis: 'x' | 'y', value: number) => void;
  onLayerColorChange: (layerKey: string, color: string) => void;
  followedTrackId: string | null;
  onTrackFollowRequest: (trackId: string) => void;
  onRegisterVrSession?: (
    handlers:
      | {
          requestSession: () => Promise<XRSession | null>;
          endSession: () => Promise<void> | void;
        }
      | null
  ) => void;
  onVrSessionStarted?: () => void;
  onVrSessionEnded?: () => void;
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

type VrUiTargetType =
  | 'playback-play-toggle'
  | 'playback-slider'
  | 'playback-panel-grab'
  | 'channels-panel'
  | 'channels-panel-grab'
  | 'channels-tab'
  | 'channels-visibility'
  | 'channels-reset'
  | 'channels-layer'
  | 'channels-slider'
  | 'channels-color';

type VrUiTarget = { type: VrUiTargetType; object: THREE.Object3D; data?: unknown };

type VrPlaybackHud = {
  group: THREE.Group;
  panel: THREE.Mesh;
  panelGrabHandle: THREE.Mesh;
  playButton: THREE.Mesh;
  playIcon: THREE.Object3D;
  pauseGroup: THREE.Object3D;
  sliderGroup: THREE.Group;
  sliderTrack: THREE.Mesh;
  sliderFill: THREE.Mesh;
  sliderKnob: THREE.Mesh;
  sliderHitArea: THREE.Mesh;
  sliderWidth: number;
  labelMesh: THREE.Mesh;
  labelTexture: THREE.CanvasTexture;
  labelCanvas: HTMLCanvasElement | null;
  labelContext: CanvasRenderingContext2D | null;
  labelText: string;
  interactables: THREE.Object3D[];
  playButtonBaseColor: THREE.Color;
  sliderTrackBaseColor: THREE.Color;
  sliderKnobBaseColor: THREE.Color;
  hoverHighlightColor: THREE.Color;
};

type VrChannelsSliderKey = 'contrast' | 'brightness' | 'xOffset' | 'yOffset';

type VrChannelsInteractiveRegion = {
  targetType:
    | 'channels-tab'
    | 'channels-visibility'
    | 'channels-reset'
    | 'channels-layer'
    | 'channels-slider'
    | 'channels-color';
  channelId: string;
  layerKey?: string;
  sliderKey?: VrChannelsSliderKey;
  color?: string;
  min?: number;
  max?: number;
  step?: number;
  axis?: 'x' | 'y';
  disabled?: boolean;
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  sliderTrack?: { minX: number; maxX: number; y: number };
};

type VrChannelsHud = {
  group: THREE.Group;
  panel: THREE.Mesh;
  panelGrabHandle: THREE.Mesh;
  panelTexture: THREE.CanvasTexture;
  panelCanvas: HTMLCanvasElement | null;
  panelContext: CanvasRenderingContext2D | null;
  panelDisplayWidth: number;
  panelDisplayHeight: number;
  pixelRatio: number;
  interactables: THREE.Object3D[];
  regions: VrChannelsInteractiveRegion[];
  width: number;
  height: number;
  hoverRegion: VrChannelsInteractiveRegion | null;
};

type VrChannelsState = {
  channels: Array<{
    id: string;
    name: string;
    visible: boolean;
    activeLayerKey: string | null;
    layers: Array<{
      key: string;
      label: string;
      hasData: boolean;
      isGrayscale: boolean;
      settings: {
        contrast: number;
        brightness: number;
        color: string;
        xOffset: number;
        yOffset: number;
      };
    }>;
  }>;
  activeChannelId: string | null;
};

type ControllerEntry = {
  controller: THREE.Group;
  grip: THREE.Group;
  ray: THREE.Line;
  rayGeometry: THREE.BufferGeometry;
  rayMaterial: THREE.Material;
  raycaster: THREE.Raycaster;
  onConnected: (event: { data?: { targetRayMode?: string; gamepad?: Gamepad } }) => void;
  onDisconnected: () => void;
  onSelectStart: () => void;
  onSelectEnd: () => void;
  isConnected: boolean;
  targetRayMode: string | null;
  gamepad: Gamepad | null;
  hoverTrackId: string | null;
  hoverUiTarget: VrUiTarget | null;
  activeUiTarget: VrUiTarget | null;
  hoverUiPoint: THREE.Vector3;
  hasHoverUiPoint: boolean;
  hoverPoint: THREE.Vector3;
  rayOrigin: THREE.Vector3;
  rayDirection: THREE.Vector3;
  rayLength: number;
  isSelecting: boolean;
  hudGrabOffsets: { playback: THREE.Vector3 | null; channels: THREE.Vector3 | null };
};

const DEFAULT_TRACK_OPACITY = 0.9;
const DEFAULT_TRACK_LINE_WIDTH = 1;

const VR_PLAYBACK_PANEL_WIDTH = 0.54;
const VR_PLAYBACK_PANEL_HEIGHT = 0.24;
const VR_PLAYBACK_VOLUME_MARGIN = 0.12;
const VR_PLAYBACK_FALLBACK_HORIZONTAL_OFFSET = -0.6;
const VR_PLAYBACK_VERTICAL_OFFSET = 0;
const VR_PLAYBACK_DEPTH_OFFSET = 0;
const VR_PLAYBACK_CAMERA_ANCHOR_OFFSET = new THREE.Vector3(0, -0.18, -0.65);
const VR_CHANNELS_PANEL_WIDTH = 0.52;
const VR_CHANNELS_PANEL_HEIGHT = 0.52;
const VR_CHANNELS_VOLUME_MARGIN = 0.12;
const VR_CHANNELS_FALLBACK_HORIZONTAL_OFFSET = 0.6;
const VR_CHANNELS_VERTICAL_OFFSET = 0;
const VR_CHANNELS_DEPTH_OFFSET = 0;
const VR_CHANNELS_CAMERA_ANCHOR_OFFSET = new THREE.Vector3(0.4, -0.18, -0.65);
const VR_CHANNELS_CANVAS_WIDTH = 1024;
const VR_CHANNELS_CANVAS_HEIGHT = 1024;
const VR_CHANNELS_FONT_FAMILY = '"Inter", "Helvetica Neue", Arial, sans-serif';
const vrChannelsFont = (weight: string, size: number) => `${weight} ${size}px ${VR_CHANNELS_FONT_FAMILY}`;
const VR_CHANNELS_FONT_SIZES = {
  heading: 52,
  emptyState: 32,
  tab: 32,
  body: 34,
  label: 32,
  value: 34,
  small: 28
} as const;
const VR_HUD_CYLINDER_RADIUS = 1;
const VR_HUD_CYLINDER_MIN_HEIGHT = 0;
const VR_HUD_CYLINDER_MAX_HEIGHT = 2;
const VR_HUD_CYLINDER_EPSILON = 1e-6;
const VR_VOLUME_BASE_OFFSET = new THREE.Vector3(0, 1.2, -0.3);

function setVrPlaybackSliderFraction(hud: VrPlaybackHud, fraction: number) {
  const clamped = Math.min(Math.max(fraction, 0), 1);
  const knobX = -hud.sliderWidth / 2 + clamped * hud.sliderWidth;
  hud.sliderKnob.position.x = knobX;
  hud.sliderFill.scale.x = Math.max(clamped, 0.0001);
  hud.sliderFill.position.x = -hud.sliderWidth / 2 + (hud.sliderWidth * Math.max(clamped, 0.0001)) / 2;
}

function setVrPlaybackLabel(hud: VrPlaybackHud, text: string) {
  if (!hud.labelCanvas || !hud.labelContext) {
    hud.labelText = text;
    return;
  }
  if (hud.labelText === text) {
    return;
  }
  hud.labelText = text;
  const ctx = hud.labelContext;
  const width = hud.labelCanvas.width;
  const height = hud.labelCanvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = 'rgba(0, 0, 0, 0)';
  ctx.fillRect(0, 0, width, height);
  ctx.font = '600 36px "Inter", "Helvetica Neue", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, width / 2, height / 2 + 4);
  hud.labelTexture.needsUpdate = true;
}

function resolveVrUiTarget(object: THREE.Object3D | null): VrUiTarget | null {
  let current: THREE.Object3D | null = object;
  while (current) {
    const userData = current.userData ?? {};
    if (userData && typeof userData.vrUiTarget === 'object' && userData.vrUiTarget) {
      const target = userData.vrUiTarget as { type?: VrUiTargetType; data?: unknown };
      if (
        target &&
        (target.type === 'playback-play-toggle' ||
          target.type === 'playback-slider' ||
          target.type === 'playback-panel-grab' ||
          target.type === 'channels-panel' ||
          target.type === 'channels-panel-grab' ||
          target.type === 'channels-tab' ||
          target.type === 'channels-visibility' ||
          target.type === 'channels-reset' ||
          target.type === 'channels-layer' ||
          target.type === 'channels-slider' ||
          target.type === 'channels-color')
      ) {
        return { type: target.type, object: current, data: target.data };
      }
    }
    current = current.parent ?? null;
  }
  return null;
}

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
  onTogglePlayback,
  onTimeIndexChange,
  onRegisterReset,
  tracks,
  trackVisibility,
  trackOpacityByChannel,
  trackLineWidthByChannel,
  channelTrackColorModes,
  channelTrackOffsets,
  channelPanels,
  activeChannelPanelId,
  onChannelPanelSelect,
  onChannelVisibilityToggle,
  onChannelReset,
  onChannelLayerSelect,
  onLayerContrastChange,
  onLayerBrightnessChange,
  onLayerOffsetChange,
  onLayerColorChange,
  followedTrackId,
  onTrackFollowRequest,
  onRegisterVrSession,
  onVrSessionStarted,
  onVrSessionEnded
}: VolumeViewerProps) {
  const vrLog = (...args: Parameters<typeof console.debug>) => {
    if (import.meta.env?.DEV) {
      console.debug(...args);
    }
  };

  const containerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
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
  const volumeRootBaseOffsetRef = useRef(new THREE.Vector3());
  const volumeRootCenterOffsetRef = useRef(new THREE.Vector3());
  const trackGroupRef = useRef<THREE.Group | null>(null);
  const trackLinesRef = useRef<Map<string, TrackLineResource>>(new Map());
  const controllersRef = useRef<ControllerEntry[]>([]);
  const raycasterRef = useRef<RaycasterLike | null>(null);
  const timeIndexRef = useRef(0);
  const followedTrackIdRef = useRef<string | null>(null);
  const trackFollowOffsetRef = useRef<THREE.Vector3 | null>(null);
  const previousFollowedTrackIdRef = useRef<string | null>(null);
  const xrSessionRef = useRef<XRSession | null>(null);
  const sessionCleanupRef = useRef<(() => void) | null>(null);
  const preVrCameraStateRef = useRef<{
    position: THREE.Vector3;
    quaternion: THREE.Quaternion;
    target: THREE.Vector3;
  } | null>(null);
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
  const vrPlaybackHudRef = useRef<VrPlaybackHud | null>(null);
  const vrChannelsHudRef = useRef<VrChannelsHud | null>(null);
  const vrPlaybackHudPlacementRef = useRef<{ position: THREE.Vector3 } | null>(null);
  const vrChannelsHudPlacementRef = useRef<{ position: THREE.Vector3 } | null>(null);
  const vrHudPlaneRef = useRef(new THREE.Plane());
  const vrHudPlanePointRef = useRef(new THREE.Vector3());
  const vrPlaybackHudDragTargetRef = useRef(new THREE.Vector3());
  const vrChannelsHudDragTargetRef = useRef(new THREE.Vector3());
  const vrHudOffsetTempRef = useRef(new THREE.Vector3());
  const vrHudIntersectionRef = useRef(new THREE.Vector3());
  const vrChannelsLocalPointRef = useRef(new THREE.Vector3());
  const vrHudForwardRef = useRef(new THREE.Vector3(0, 0, 1));
  const vrHudYawEulerRef = useRef(new THREE.Euler(0, 0, 0, 'YXZ'));
  const vrHudYawQuaternionRef = useRef(new THREE.Quaternion());
  const playbackStateRef = useRef({
    isPlaying,
    playbackDisabled,
    playbackLabel,
    timeIndex,
    totalTimepoints,
    onTogglePlayback,
    onTimeIndexChange
  });
  const vrHoverStateRef = useRef({ play: false, slider: false, sliderActive: false });
  const vrChannelsStateRef = useRef<VrChannelsState>({ channels: [], activeChannelId: null });
  const sliderLocalPointRef = useRef(new THREE.Vector3());

  const constrainVectorToHudCylinder = useCallback((target: THREE.Vector3) => {
    const horizontalLengthSq = target.x * target.x + target.z * target.z;
    if (horizontalLengthSq < VR_HUD_CYLINDER_EPSILON) {
      target.set(VR_HUD_CYLINDER_RADIUS, target.y, 0);
    } else {
      const scale = VR_HUD_CYLINDER_RADIUS / Math.sqrt(horizontalLengthSq);
      target.x *= scale;
      target.z *= scale;
    }
    target.y = Math.min(Math.max(target.y, VR_HUD_CYLINDER_MIN_HEIGHT), VR_HUD_CYLINDER_MAX_HEIGHT);
  }, []);

  const getHudFacingQuaternion = useCallback((position: THREE.Vector3) => {
    const yawQuaternion = vrHudYawQuaternionRef.current;
    const yawEuler = vrHudYawEulerRef.current;
    const yaw = Math.atan2(-position.x, -position.z);
    yawEuler.set(0, yaw, 0, 'YXZ');
    yawQuaternion.setFromEuler(yawEuler);
    return yawQuaternion;
  }, []);

  const updateHudGroupFromPlacement = useCallback(
    (hud: VrPlaybackHud | VrChannelsHud | null, placement: { position: THREE.Vector3 } | null) => {
      if (!hud || !placement) {
        return;
      }
      hud.group.position.copy(placement.position);
      const quaternion = getHudFacingQuaternion(placement.position);
      hud.group.quaternion.copy(quaternion);
      hud.group.updateMatrixWorld(true);
    },
    [getHudFacingQuaternion]
  );

  const setVrPlaybackHudPlacementPosition = useCallback(
    (nextPosition: THREE.Vector3) => {
      const placement = vrPlaybackHudPlacementRef.current ?? { position: new THREE.Vector3() };
      placement.position.copy(nextPosition);
      constrainVectorToHudCylinder(placement.position);
      vrPlaybackHudPlacementRef.current = placement;
      vrPlaybackHudDragTargetRef.current.copy(placement.position);
      updateHudGroupFromPlacement(vrPlaybackHudRef.current, placement);
    },
    [constrainVectorToHudCylinder, updateHudGroupFromPlacement]
  );

  const setVrChannelsHudPlacementPosition = useCallback(
    (nextPosition: THREE.Vector3) => {
      const placement = vrChannelsHudPlacementRef.current ?? { position: new THREE.Vector3() };
      placement.position.copy(nextPosition);
      constrainVectorToHudCylinder(placement.position);
      vrChannelsHudPlacementRef.current = placement;
      vrChannelsHudDragTargetRef.current.copy(placement.position);
      updateHudGroupFromPlacement(vrChannelsHudRef.current, placement);
    },
    [constrainVectorToHudCylinder, updateHudGroupFromPlacement]
  );

  const handleContainerRef = useCallback((node: HTMLDivElement | null) => {
    containerRef.current = node;
    setContainerNode(node);
  }, []);

  const applyVrPlaybackHoverState = useCallback(
    (playHovered: boolean, sliderHovered: boolean, sliderActive: boolean) => {
      vrHoverStateRef.current = { play: playHovered, slider: sliderHovered, sliderActive };
      const hud = vrPlaybackHudRef.current;
      if (!hud) {
        return;
      }
      const state = playbackStateRef.current;
      const playMaterial = hud.playButton.material as THREE.MeshBasicMaterial;
      playMaterial.color.copy(hud.playButtonBaseColor);
      if (playHovered && !state.playbackDisabled) {
        playMaterial.color.lerp(hud.hoverHighlightColor, 0.35);
      }
      const sliderTrackMaterial = hud.sliderTrack.material as THREE.MeshBasicMaterial;
      sliderTrackMaterial.color.copy(hud.sliderTrackBaseColor);
      if ((sliderHovered || sliderActive) && !state.playbackDisabled) {
        sliderTrackMaterial.color.lerp(hud.hoverHighlightColor, 0.22);
      }
      const knobMaterial = hud.sliderKnob.material as THREE.MeshBasicMaterial;
      knobMaterial.color.copy(hud.sliderKnobBaseColor);
      if ((sliderHovered || sliderActive) && !state.playbackDisabled) {
        knobMaterial.color.lerp(hud.hoverHighlightColor, 0.35);
      }
    },
    []
  );

  const updateVrPlaybackHud = useCallback(() => {
    const hud = vrPlaybackHudRef.current;
    if (!hud) {
      return;
    }
    const state = playbackStateRef.current;
    const playMaterial = hud.playButton.material as THREE.MeshBasicMaterial;
    const sliderTrackMaterial = hud.sliderTrack.material as THREE.MeshBasicMaterial;
    const sliderFillMaterial = hud.sliderFill.material as THREE.MeshBasicMaterial;
    const knobMaterial = hud.sliderKnob.material as THREE.MeshBasicMaterial;

    if (state.playbackDisabled) {
      hud.playButtonBaseColor.set(0x3a414d);
      hud.sliderTrackBaseColor.set(0x2f333b);
      hud.sliderKnobBaseColor.set(0xcad0da);
      sliderFillMaterial.color.set(0x5a6473);
      sliderFillMaterial.opacity = 0.35;
    } else if (state.isPlaying) {
      hud.playButtonBaseColor.set(0x1f6f3f);
      hud.sliderTrackBaseColor.set(0x3b414d);
      hud.sliderKnobBaseColor.set(0xffffff);
      sliderFillMaterial.color.set(0x45c16b);
      sliderFillMaterial.opacity = 0.85;
    } else {
      hud.playButtonBaseColor.set(0x2b5fa6);
      hud.sliderTrackBaseColor.set(0x3b414d);
      hud.sliderKnobBaseColor.set(0xffffff);
      sliderFillMaterial.color.set(0x68a7ff);
      sliderFillMaterial.opacity = 0.85;
    }

    playMaterial.color.copy(hud.playButtonBaseColor);
    sliderTrackMaterial.color.copy(hud.sliderTrackBaseColor);
    knobMaterial.color.copy(hud.sliderKnobBaseColor);

    hud.playIcon.visible = !state.isPlaying;
    hud.pauseGroup.visible = state.isPlaying;

    const maxIndex = Math.max(0, state.totalTimepoints - 1);
    const fraction = maxIndex > 0 ? Math.min(Math.max(state.timeIndex / maxIndex, 0), 1) : 0;
    setVrPlaybackSliderFraction(hud, fraction);
    setVrPlaybackLabel(hud, state.playbackLabel ?? '');
    applyVrPlaybackHoverState(
      vrHoverStateRef.current.play,
      vrHoverStateRef.current.slider,
      vrHoverStateRef.current.sliderActive
    );
  }, [applyVrPlaybackHoverState]);

  const setVrPlaybackHudVisible = useCallback(
    (visible: boolean) => {
      const hud = vrPlaybackHudRef.current;
      if (!hud) {
        return;
      }
      hud.group.visible = visible;
      if (!visible) {
        applyVrPlaybackHoverState(false, false, false);
      }
    },
    [applyVrPlaybackHoverState]
  );

  const setVrChannelsHudVisible = useCallback((visible: boolean) => {
    const hud = vrChannelsHudRef.current;
    if (!hud) {
      return;
    }
    hud.group.visible = visible;
    if (!visible) {
      hud.hoverRegion = null;
    }
  }, []);

  const applySliderFromWorldPoint = useCallback(
    (worldPoint: THREE.Vector3) => {
      const hud = vrPlaybackHudRef.current;
      if (!hud) {
        return;
      }
      const state = playbackStateRef.current;
      if (state.totalTimepoints <= 0 || state.playbackDisabled) {
        return;
      }
      sliderLocalPointRef.current.copy(worldPoint);
      hud.sliderTrack.worldToLocal(sliderLocalPointRef.current);
      const rawRatio =
        (sliderLocalPointRef.current.x + hud.sliderWidth / 2) / Math.max(hud.sliderWidth, 1e-5);
      const clampedRatio = Math.min(Math.max(rawRatio, 0), 1);
      const maxIndex = Math.max(0, state.totalTimepoints - 1);
      const tentativeIndex = Math.round(clampedRatio * maxIndex);
      const boundedIndex = Math.min(Math.max(tentativeIndex, 0), maxIndex);
      const fraction = maxIndex > 0 ? boundedIndex / maxIndex : 0;
      if (boundedIndex !== state.timeIndex) {
        state.onTimeIndexChange?.(boundedIndex);
        state.timeIndex = boundedIndex;
      }
      const total = Math.max(0, state.totalTimepoints);
      const labelCurrent = total > 0 ? Math.min(boundedIndex + 1, total) : 0;
      const label = `${labelCurrent} / ${total}`;
      state.playbackLabel = label;
      setVrPlaybackSliderFraction(hud, fraction);
      setVrPlaybackLabel(hud, label);
    },
    []
  );

  const createVrPlaybackHud = useCallback(() => {
    if (typeof document === 'undefined') {
      return null;
    }
    const group = new THREE.Group();
    group.name = 'VrPlaybackHud';

    const panelMaterial = new THREE.MeshBasicMaterial({
      color: 0x10161d,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide
    });
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(VR_PLAYBACK_PANEL_WIDTH, VR_PLAYBACK_PANEL_HEIGHT),
      panelMaterial
    );
    panel.position.set(0, 0, 0);
    group.add(panel);

    const panelGrabMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      opacity: 0.01,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const panelGrabHandle = new THREE.Mesh(
      new THREE.PlaneGeometry(VR_PLAYBACK_PANEL_WIDTH, 0.06),
      panelGrabMaterial
    );
    panelGrabHandle.position.set(0, VR_PLAYBACK_PANEL_HEIGHT / 2 - 0.03, 0.0025);
    panelGrabHandle.userData.vrUiTarget = { type: 'playback-panel-grab' } satisfies {
      type: VrUiTargetType;
    };
    group.add(panelGrabHandle);

    const playButtonMaterial = new THREE.MeshBasicMaterial({ color: 0x2b3340, side: THREE.DoubleSide });
    const playButton = new THREE.Mesh(new THREE.CircleGeometry(0.045, 48), playButtonMaterial);
    playButton.position.set(-VR_PLAYBACK_PANEL_WIDTH * 0.28, 0, 0.01);
    playButton.userData.vrUiTarget = { type: 'playback-play-toggle' } satisfies {
      type: VrUiTargetType;
    };
    group.add(playButton);

    const playShape = new THREE.Shape();
    playShape.moveTo(-0.018, -0.022);
    playShape.lineTo(0.026, 0);
    playShape.lineTo(-0.018, 0.022);
    playShape.lineTo(-0.018, -0.022);
    const playIcon = new THREE.Mesh(
      new THREE.ShapeGeometry(playShape),
      new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })
    );
    playIcon.position.set(0, 0, 0.002);
    playButton.add(playIcon);

    const pauseGroup = new THREE.Group();
    const pauseMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    const pauseGeom = new THREE.PlaneGeometry(0.014, 0.045);
    const pauseLeft = new THREE.Mesh(pauseGeom, pauseMaterial);
    pauseLeft.position.set(-0.012, 0, 0.002);
    const pauseRight = new THREE.Mesh(pauseGeom.clone(), pauseMaterial.clone());
    pauseRight.position.set(0.012, 0, 0.002);
    pauseGroup.add(pauseLeft);
    pauseGroup.add(pauseRight);
    pauseGroup.visible = false;
    playButton.add(pauseGroup);

    const sliderGroup = new THREE.Group();
    sliderGroup.position.set(0.08, 0, 0.01);
    group.add(sliderGroup);

    const sliderWidth = 0.32;
    const sliderTrackMaterial = new THREE.MeshBasicMaterial({ color: 0x3b414d, side: THREE.DoubleSide });
    const sliderTrack = new THREE.Mesh(new THREE.PlaneGeometry(sliderWidth, 0.012), sliderTrackMaterial);
    sliderTrack.position.set(0, 0, 0);
    sliderGroup.add(sliderTrack);

    const sliderFillMaterial = new THREE.MeshBasicMaterial({
      color: 0x68a7ff,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide
    });
    const sliderFill = new THREE.Mesh(new THREE.PlaneGeometry(sliderWidth, 0.012), sliderFillMaterial);
    sliderFill.position.set(0, 0, 0.0015);
    sliderGroup.add(sliderFill);

    const sliderKnobMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    const sliderKnob = new THREE.Mesh(new THREE.CircleGeometry(0.017, 32), sliderKnobMaterial);
    sliderKnob.position.set(-sliderWidth / 2, 0, 0.003);
    sliderKnob.userData.vrUiTarget = { type: 'playback-slider' } satisfies {
      type: VrUiTargetType;
    };
    sliderGroup.add(sliderKnob);

    const sliderHitMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      opacity: 0.01,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const sliderHitArea = new THREE.Mesh(
      new THREE.PlaneGeometry(sliderWidth + 0.04, 0.08),
      sliderHitMaterial
    );
    sliderHitArea.position.set(0, 0, 0.0005);
    sliderHitArea.userData.vrUiTarget = { type: 'playback-slider' } satisfies {
      type: VrUiTargetType;
    };
    sliderGroup.add(sliderHitArea);

    const labelCanvas = document.createElement('canvas');
    labelCanvas.width = 256;
    labelCanvas.height = 64;
    const labelContext = labelCanvas.getContext('2d');
    const labelTexture = new THREE.CanvasTexture(labelCanvas);
    labelTexture.colorSpace = THREE.SRGBColorSpace;
    labelTexture.minFilter = THREE.LinearFilter;
    labelTexture.magFilter = THREE.LinearFilter;
    const labelMaterial = new THREE.MeshBasicMaterial({
      map: labelTexture,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide
    });
    const labelMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.06), labelMaterial);
    labelMesh.position.set(0.08, -0.085, 0.002);
    group.add(labelMesh);

    const hud: VrPlaybackHud = {
      group,
      panel,
      panelGrabHandle,
      playButton,
      playIcon,
      pauseGroup,
      sliderGroup,
      sliderTrack,
      sliderFill,
      sliderKnob,
      sliderHitArea,
      sliderWidth,
      labelMesh,
      labelTexture,
      labelCanvas,
      labelContext,
      labelText: '',
      interactables: [panelGrabHandle, playButton, sliderHitArea, sliderKnob],
      playButtonBaseColor: new THREE.Color(0x2b3340),
      sliderTrackBaseColor: new THREE.Color(0x3b414d),
      sliderKnobBaseColor: new THREE.Color(0xffffff),
      hoverHighlightColor: new THREE.Color(0xffffff)
    };

    const state = playbackStateRef.current;
    const maxIndex = Math.max(0, state.totalTimepoints - 1);
    const fraction = maxIndex > 0 ? Math.min(Math.max(state.timeIndex / maxIndex, 0), 1) : 0;
    setVrPlaybackSliderFraction(hud, fraction);
    setVrPlaybackLabel(hud, state.playbackLabel ?? '');

    return hud;
  }, []);

  const createVrChannelsHud = useCallback(() => {
    if (typeof document === 'undefined') {
      return null;
    }
    const group = new THREE.Group();
    group.name = 'VrChannelsHud';

    const backgroundMaterial = new THREE.MeshBasicMaterial({
      color: 0x10161d,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide
    });
    const background = new THREE.Mesh(
      new THREE.PlaneGeometry(VR_CHANNELS_PANEL_WIDTH, VR_CHANNELS_PANEL_HEIGHT),
      backgroundMaterial
    );
    background.position.set(0, 0, 0);
    group.add(background);

    const panelCanvas = document.createElement('canvas');
    const panelDisplayWidth = VR_CHANNELS_CANVAS_WIDTH;
    const panelDisplayHeight = VR_CHANNELS_CANVAS_HEIGHT;
    const pixelRatio = typeof window !== 'undefined' ? Math.min(2, window.devicePixelRatio || 1) : 1;
    panelCanvas.width = Math.round(panelDisplayWidth * pixelRatio);
    panelCanvas.height = Math.round(panelDisplayHeight * pixelRatio);
    const panelContext = panelCanvas.getContext('2d');
    if (!panelContext) {
      return null;
    }
    panelContext.imageSmoothingEnabled = true;
    panelContext.imageSmoothingQuality = 'high';
    const panelTexture = new THREE.CanvasTexture(panelCanvas);
    panelTexture.colorSpace = THREE.SRGBColorSpace;
    panelTexture.minFilter = THREE.LinearFilter;
    panelTexture.magFilter = THREE.LinearFilter;
    const panelMaterial = new THREE.MeshBasicMaterial({
      map: panelTexture,
      transparent: true,
      opacity: 1,
      side: THREE.DoubleSide
    });
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(VR_CHANNELS_PANEL_WIDTH, VR_CHANNELS_PANEL_HEIGHT),
      panelMaterial
    );
    panel.position.set(0, 0, 0.001);
    panel.userData.vrUiTarget = { type: 'channels-panel' } satisfies { type: VrUiTargetType };
    group.add(panel);

    const panelGrabMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      opacity: 0.01,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const panelGrabHandle = new THREE.Mesh(
      new THREE.PlaneGeometry(VR_CHANNELS_PANEL_WIDTH, 0.06),
      panelGrabMaterial
    );
    panelGrabHandle.position.set(0, VR_CHANNELS_PANEL_HEIGHT / 2 - 0.03, 0.0025);
    panelGrabHandle.userData.vrUiTarget = { type: 'channels-panel-grab' } satisfies {
      type: VrUiTargetType;
    };
    group.add(panelGrabHandle);

    const hud: VrChannelsHud = {
      group,
      panel,
      panelGrabHandle,
      panelTexture,
      panelCanvas,
      panelContext,
      panelDisplayWidth,
      panelDisplayHeight,
      pixelRatio,
      interactables: [panelGrabHandle, panel],
      regions: [],
      width: VR_CHANNELS_PANEL_WIDTH,
      height: VR_CHANNELS_PANEL_HEIGHT,
      hoverRegion: null
    };

    return hud;
  }, []);

  const renderVrChannelsHud = useCallback((hud: VrChannelsHud, state: VrChannelsState) => {
    if (!hud.panelCanvas || !hud.panelContext) {
      hud.regions = [];
      return;
    }
    const ctx = hud.panelContext;
    const canvasWidth = hud.panelDisplayWidth;
    const canvasHeight = hud.panelDisplayHeight;
    const targetPixelRatio =
      typeof window !== 'undefined' ? Math.min(2, window.devicePixelRatio || 1) : hud.pixelRatio;
    if (targetPixelRatio && Math.abs(targetPixelRatio - hud.pixelRatio) > 0.01 && hud.panelCanvas) {
      hud.pixelRatio = targetPixelRatio;
      hud.panelCanvas.width = Math.round(canvasWidth * hud.pixelRatio);
      hud.panelCanvas.height = Math.round(canvasHeight * hud.pixelRatio);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
    }
    const pixelRatio = hud.pixelRatio ?? 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, hud.panelCanvas.width, hud.panelCanvas.height);
    ctx.save();
    ctx.scale(pixelRatio, pixelRatio);
    ctx.fillStyle = 'rgba(16, 22, 29, 0.95)';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    const toPanelX = (x: number) => (x / canvasWidth - 0.5) * hud.width;
    const toPanelY = (y: number) => (0.5 - y / canvasHeight) * hud.height;
    const regions: VrChannelsInteractiveRegion[] = [];

    const paddingX = 68;
    const paddingTop = 48;

    ctx.save();
    ctx.fillStyle = '#dce7f7';
    ctx.font = vrChannelsFont('600', VR_CHANNELS_FONT_SIZES.heading);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
    ctx.shadowBlur = 18;
    ctx.fillText('Channels', paddingX, paddingTop);
    ctx.restore();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    let currentY = paddingTop + 84;

    const channels = state.channels ?? [];
    if (channels.length === 0) {
      ctx.fillStyle = '#9fb2c8';
      ctx.font = vrChannelsFont('500', VR_CHANNELS_FONT_SIZES.emptyState);
      ctx.fillText('Load a volume to configure channel properties.', paddingX, currentY + 20);
      hud.regions = [];
      hud.hoverRegion = null;
      ctx.restore();
      hud.panelTexture.needsUpdate = true;
      return;
    }

    let activeChannelId = state.activeChannelId;
    if (!activeChannelId || !channels.some((channel) => channel.id === activeChannelId)) {
      activeChannelId = channels[0].id;
      state.activeChannelId = activeChannelId;
    }
    const activeChannel = channels.find((channel) => channel.id === activeChannelId) ?? channels[0];

    const tabAreaWidth = canvasWidth - paddingX * 2;
    const tabSpacing = 18;
    const baseTabWidth = Math.max(160, Math.min(260, (tabAreaWidth - (channels.length - 1) * tabSpacing) / channels.length));
    const totalTabWidth = channels.length * baseTabWidth + Math.max(0, channels.length - 1) * tabSpacing;
    let tabStartX = paddingX + Math.max(0, (tabAreaWidth - totalTabWidth) / 2);
    const tabHeight = 82;

    ctx.font = vrChannelsFont('600', VR_CHANNELS_FONT_SIZES.tab);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const channel of channels) {
      const isActive = channel.id === activeChannelId;
      const x = tabStartX;
      const y = currentY;
      drawRoundedRect(ctx, x, y, baseTabWidth, tabHeight, 20);
      ctx.fillStyle = isActive ? '#2b5fa6' : '#1d2734';
      ctx.fill();
      if (hud.hoverRegion && hud.hoverRegion.targetType === 'channels-tab' && hud.hoverRegion.channelId === channel.id) {
        ctx.save();
        drawRoundedRect(ctx, x, y, baseTabWidth, tabHeight, 20);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
        ctx.fill();
        ctx.restore();
      }
      ctx.save();
      ctx.beginPath();
      ctx.rect(x + 12, y + 12, baseTabWidth - 24, tabHeight - 24);
      ctx.clip();
      ctx.fillStyle = '#f3f6fc';
      ctx.fillText(channel.name, x + baseTabWidth / 2, y + tabHeight / 2);
      ctx.restore();

      const rectBounds = {
        minX: toPanelX(x),
        maxX: toPanelX(x + baseTabWidth),
        minY: Math.min(toPanelY(y), toPanelY(y + tabHeight)),
        maxY: Math.max(toPanelY(y), toPanelY(y + tabHeight))
      };
      regions.push({ targetType: 'channels-tab', channelId: channel.id, bounds: rectBounds });

      tabStartX += baseTabWidth + tabSpacing;
    }

    currentY += tabHeight + 36;

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    const toggleSize = 44;
    const toggleX = paddingX;
    const toggleY = currentY;
    drawRoundedRect(ctx, toggleX, toggleY, toggleSize, toggleSize, 10);
    ctx.fillStyle = activeChannel.visible ? '#2b5fa6' : '#1d2734';
    ctx.fill();
    if (activeChannel.visible) {
      ctx.strokeStyle = '#f3f6fc';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(toggleX + 10, toggleY + toggleSize / 2);
      ctx.lineTo(toggleX + toggleSize / 2 - 4, toggleY + toggleSize - 10);
      ctx.lineTo(toggleX + toggleSize - 8, toggleY + 12);
      ctx.stroke();
    }
    if (hud.hoverRegion && hud.hoverRegion.targetType === 'channels-visibility' && hud.hoverRegion.channelId === activeChannel.id) {
      ctx.save();
      drawRoundedRect(ctx, toggleX, toggleY, toggleSize, toggleSize, 10);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = '#dce3f1';
    ctx.font = vrChannelsFont('500', VR_CHANNELS_FONT_SIZES.label);
    ctx.fillText('Show channel', toggleX + toggleSize + 20, toggleY + 4);

    const visibilityBounds = {
      minX: toPanelX(toggleX),
      maxX: toPanelX(toggleX + toggleSize),
      minY: Math.min(toPanelY(toggleY), toPanelY(toggleY + toggleSize)),
      maxY: Math.max(toPanelY(toggleY), toPanelY(toggleY + toggleSize))
    };
    regions.push({
      targetType: 'channels-visibility',
      channelId: activeChannel.id,
      bounds: visibilityBounds,
      disabled: false
    });

    const resetWidth = 180;
    const resetHeight = 52;
    const resetX = canvasWidth - paddingX - resetWidth;
    const resetY = toggleY - 4;
    drawRoundedRect(ctx, resetX, resetY, resetWidth, resetHeight, 14);
    const resetDisabled = activeChannel.layers.length === 0;
    ctx.fillStyle = resetDisabled ? 'rgba(45, 60, 74, 0.6)' : '#2b3340';
    ctx.fill();
    if (hud.hoverRegion && hud.hoverRegion.targetType === 'channels-reset' && hud.hoverRegion.channelId === activeChannel.id) {
      ctx.save();
      drawRoundedRect(ctx, resetX, resetY, resetWidth, resetHeight, 14);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = resetDisabled ? '#7b8795' : '#f3f6fc';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = vrChannelsFont('600', VR_CHANNELS_FONT_SIZES.small);
    ctx.fillText('Reset sliders', resetX + resetWidth / 2, resetY + resetHeight / 2);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    const resetBounds = {
      minX: toPanelX(resetX),
      maxX: toPanelX(resetX + resetWidth),
      minY: Math.min(toPanelY(resetY), toPanelY(resetY + resetHeight)),
      maxY: Math.max(toPanelY(resetY), toPanelY(resetY + resetHeight))
    };
    regions.push({
      targetType: 'channels-reset',
      channelId: activeChannel.id,
      bounds: resetBounds,
      disabled: resetDisabled
    });

    currentY += toggleSize + 32;

    ctx.fillStyle = '#9fb2c8';
    ctx.font = vrChannelsFont('500', VR_CHANNELS_FONT_SIZES.label);
    ctx.fillText('Layers', paddingX, currentY);
    currentY += 40;

    const layerButtonHeight = 60;
    const layerButtonWidth = canvasWidth - paddingX * 2;
    ctx.font = vrChannelsFont('600', VR_CHANNELS_FONT_SIZES.label);

    for (const layer of activeChannel.layers) {
      const isSelected = layer.key === (activeChannel.activeLayerKey ?? layer.key);
      const x = paddingX;
      const y = currentY;
      drawRoundedRect(ctx, x, y, layerButtonWidth, layerButtonHeight, 16);
      ctx.fillStyle = isSelected ? '#2b5fa6' : '#1f2735';
      ctx.fill();
      if (hud.hoverRegion && hud.hoverRegion.targetType === 'channels-layer' && hud.hoverRegion.layerKey === layer.key) {
        ctx.save();
        drawRoundedRect(ctx, x, y, layerButtonWidth, layerButtonHeight, 16);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
        ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = '#f3f6fc';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(layer.label, x + 24, y + layerButtonHeight / 2);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';

      const layerBounds = {
        minX: toPanelX(x),
        maxX: toPanelX(x + layerButtonWidth),
        minY: Math.min(toPanelY(y), toPanelY(y + layerButtonHeight)),
        maxY: Math.max(toPanelY(y), toPanelY(y + layerButtonHeight))
      };
      regions.push({
        targetType: 'channels-layer',
        channelId: activeChannel.id,
        layerKey: layer.key,
        bounds: layerBounds,
        disabled: false
      });

      currentY += layerButtonHeight + 18;
    }

    const selectedLayer = activeChannel.layers.find((layer) => layer.key === activeChannel.activeLayerKey) ?? activeChannel.layers[0] ?? null;

    if (selectedLayer) {
      const sliderDefs: Array<{
        key: VrChannelsSliderKey;
        label: string;
        value: number;
        min: number;
        max: number;
        step: number;
        formatter: (value: number) => string;
        disabled: boolean;
        axis?: 'x' | 'y';
      }> = [
        {
          key: 'contrast',
          label: 'Contrast',
          value: selectedLayer.settings.contrast,
          min: 0.2,
          max: 3,
          step: 0.05,
          formatter: (value: number) => `${value.toFixed(2)}×`,
          disabled: !selectedLayer.hasData
        },
        {
          key: 'brightness',
          label: 'Brightness',
          value: selectedLayer.settings.brightness,
          min: -0.5,
          max: 0.5,
          step: 0.01,
          formatter: (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}`,
          disabled: !selectedLayer.hasData
        },
        {
          key: 'xOffset',
          label: 'X shift',
          value: selectedLayer.settings.xOffset,
          min: -10,
          max: 10,
          step: 0.1,
          formatter: (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(2)} px`,
          disabled: !selectedLayer.hasData || activeChannel.id !== activeChannelId,
          axis: 'x'
        },
        {
          key: 'yOffset',
          label: 'Y shift',
          value: selectedLayer.settings.yOffset,
          min: -10,
          max: 10,
          step: 0.1,
          formatter: (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(2)} px`,
          disabled: !selectedLayer.hasData || activeChannel.id !== activeChannelId,
          axis: 'y'
        }
      ];

      ctx.font = vrChannelsFont('500', VR_CHANNELS_FONT_SIZES.body);
      for (const slider of sliderDefs) {
        const labelY = currentY;
        ctx.fillStyle = '#9fb2c8';
        ctx.fillText(slider.label, paddingX, labelY);
        ctx.fillStyle = '#dce3f1';
        ctx.font = vrChannelsFont('600', VR_CHANNELS_FONT_SIZES.value);
        ctx.fillText(slider.formatter(slider.value), paddingX + 220, labelY);
        ctx.font = vrChannelsFont('500', VR_CHANNELS_FONT_SIZES.body);

        const sliderX = paddingX;
        const sliderY = labelY + 36;
        const sliderWidth = canvasWidth - paddingX * 2;
        const sliderHeight = 26;
        const sliderRadius = 14;

        drawRoundedRect(ctx, sliderX, sliderY, sliderWidth, sliderHeight, sliderRadius);
        ctx.fillStyle = slider.disabled ? 'rgba(45, 60, 74, 0.6)' : '#1f2733';
        ctx.fill();

        const knobFraction = (slider.value - slider.min) / (slider.max - slider.min);
        const clampedFraction = Math.min(Math.max(knobFraction, 0), 1);
        const knobX = sliderX + clampedFraction * sliderWidth;
        const knobY = sliderY + sliderHeight / 2;
        ctx.beginPath();
        ctx.arc(knobX, knobY, 18, 0, Math.PI * 2);
        ctx.fillStyle = slider.disabled ? '#45515f' : '#f3f6fc';
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = slider.disabled ? 'rgba(0, 0, 0, 0.45)' : 'rgba(0, 0, 0, 0.3)';
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(knobX, knobY, 10, 0, Math.PI * 2);
        ctx.fillStyle = slider.disabled ? '#2a313c' : '#2b5fa6';
        ctx.fill();

        if (
          hud.hoverRegion &&
          hud.hoverRegion.targetType === 'channels-slider' &&
          hud.hoverRegion.sliderKey === slider.key
        ) {
          ctx.save();
          drawRoundedRect(ctx, sliderX, sliderY, sliderWidth, sliderHeight, sliderRadius);
          ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
          ctx.fill();
          ctx.restore();
        }

        const sliderBounds = {
          minX: toPanelX(sliderX),
          maxX: toPanelX(sliderX + sliderWidth),
          minY: Math.min(toPanelY(sliderY - 10), toPanelY(sliderY + sliderHeight + 10)),
          maxY: Math.max(toPanelY(sliderY - 10), toPanelY(sliderY + sliderHeight + 10))
        };
        regions.push({
          targetType: 'channels-slider',
          channelId: activeChannel.id,
          layerKey: selectedLayer.key,
          sliderKey: slider.key,
          min: slider.min,
          max: slider.max,
          step: slider.step,
          axis: slider.axis,
          bounds: sliderBounds,
          sliderTrack: {
            minX: toPanelX(sliderX),
            maxX: toPanelX(sliderX + sliderWidth),
            y: toPanelY(sliderY + sliderHeight / 2)
          },
          disabled: slider.disabled
        });

        currentY += sliderHeight + 64;
      }

      if (selectedLayer.isGrayscale) {
        ctx.fillStyle = '#9fb2c8';
        ctx.font = vrChannelsFont('500', VR_CHANNELS_FONT_SIZES.body);
        ctx.fillText('Tint color', paddingX, currentY);
        ctx.fillStyle = '#dce3f1';
        const displayColor = normalizeHexColor(selectedLayer.settings.color, DEFAULT_LAYER_COLOR).toUpperCase();
        ctx.font = vrChannelsFont('600', VR_CHANNELS_FONT_SIZES.value);
        ctx.fillText(displayColor, paddingX + 240, currentY);
        ctx.font = vrChannelsFont('500', VR_CHANNELS_FONT_SIZES.body);
        currentY += 42;

        const swatchSize = 54;
        const swatchSpacing = 20;
        let swatchX = paddingX;
        const swatchY = currentY;
        for (const swatch of GRAYSCALE_COLOR_SWATCHES) {
          const normalized = normalizeHexColor(swatch.value, DEFAULT_LAYER_COLOR);
          const isSelected = normalized === normalizeHexColor(selectedLayer.settings.color, DEFAULT_LAYER_COLOR);
          ctx.beginPath();
          ctx.roundRect?.(swatchX, swatchY, swatchSize, swatchSize, 14);
          if (!ctx.roundRect) {
            drawRoundedRect(ctx, swatchX, swatchY, swatchSize, swatchSize, 14);
          }
          ctx.fillStyle = normalized;
          ctx.fill();
          ctx.strokeStyle = isSelected ? '#ffffff' : 'rgba(255, 255, 255, 0.45)';
          ctx.lineWidth = isSelected ? 4 : 2;
          ctx.stroke();

          if (
            hud.hoverRegion &&
            hud.hoverRegion.targetType === 'channels-color' &&
            hud.hoverRegion.color === normalized
          ) {
            ctx.save();
            drawRoundedRect(ctx, swatchX, swatchY, swatchSize, swatchSize, 14);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
            ctx.fill();
            ctx.restore();
          }

          const colorBounds = {
            minX: toPanelX(swatchX),
            maxX: toPanelX(swatchX + swatchSize),
            minY: Math.min(toPanelY(swatchY), toPanelY(swatchY + swatchSize)),
            maxY: Math.max(toPanelY(swatchY), toPanelY(swatchY + swatchSize))
          };
          regions.push({
            targetType: 'channels-color',
            channelId: activeChannel.id,
            layerKey: selectedLayer.key,
            bounds: colorBounds,
            color: normalized,
            disabled: !selectedLayer.hasData
          });

          swatchX += swatchSize + swatchSpacing;
        }
        currentY += swatchSize + 30;
      }
    }

    if (hud.hoverRegion) {
      const stillValid = regions.some((region) => {
        if (region.targetType !== hud.hoverRegion?.targetType) {
          return false;
        }
        if (region.channelId !== hud.hoverRegion.channelId) {
          return false;
        }
        if (region.layerKey !== hud.hoverRegion.layerKey) {
          return false;
        }
        if (region.sliderKey !== hud.hoverRegion.sliderKey) {
          return false;
        }
        if (region.color !== hud.hoverRegion.color) {
          return false;
        }
        return true;
      });
      if (!stillValid) {
        hud.hoverRegion = null;
      }
    }

    hud.regions = regions;
    ctx.restore();
    hud.panelTexture.needsUpdate = true;
  }, []);

  const updateVrChannelsHud = useCallback(() => {
    const hud = vrChannelsHudRef.current;
    if (!hud) {
      return;
    }
    const state = vrChannelsStateRef.current;
    renderVrChannelsHud(hud, state);
  }, [renderVrChannelsHud]);

  const resolveChannelsRegionFromPoint = useCallback(
    (hud: VrChannelsHud, worldPoint: THREE.Vector3): VrChannelsInteractiveRegion | null => {
      if (!hud || hud.regions.length === 0) {
        return null;
      }
      vrChannelsLocalPointRef.current.copy(worldPoint);
      hud.panel.worldToLocal(vrChannelsLocalPointRef.current);
      const localX = vrChannelsLocalPointRef.current.x;
      const localY = vrChannelsLocalPointRef.current.y;
      for (const region of hud.regions) {
        const { minX, maxX, minY, maxY } = region.bounds;
        const minBoundX = Math.min(minX, maxX);
        const maxBoundX = Math.max(minX, maxX);
        const minBoundY = Math.min(minY, maxY);
        const maxBoundY = Math.max(minY, maxY);
        if (localX >= minBoundX && localX <= maxBoundX && localY >= minBoundY && localY <= maxBoundY) {
          return region;
        }
      }
      return null;
    },
    []
  );

  const applyVrChannelsSliderFromPoint = useCallback(
    (region: VrChannelsInteractiveRegion, worldPoint: THREE.Vector3) => {
      if (!region || region.disabled || region.targetType !== 'channels-slider' || !region.layerKey) {
        return;
      }
      const hud = vrChannelsHudRef.current;
      if (!hud || !hud.panel || !region.sliderTrack) {
        return;
      }
      sliderLocalPointRef.current.copy(worldPoint);
      hud.panel.worldToLocal(sliderLocalPointRef.current);
      const localX = sliderLocalPointRef.current.x;
      const trackMin = region.sliderTrack.minX;
      const trackMax = region.sliderTrack.maxX;
      const trackSpan = Math.max(trackMax - trackMin, 1e-5);
      const ratio = (localX - trackMin) / trackSpan;
      const clampedRatio = Math.min(Math.max(ratio, 0), 1);
      const minValue = region.min ?? 0;
      const maxValue = region.max ?? 1;
      const rawValue = minValue + clampedRatio * (maxValue - minValue);
      const step = region.step ?? 0;
      let snappedValue = rawValue;
      if (step > 0) {
        const steps = Math.round((rawValue - minValue) / step);
        snappedValue = minValue + steps * step;
      }
      snappedValue = Math.min(Math.max(snappedValue, minValue), maxValue);

      const state = vrChannelsStateRef.current;
      const channelState = state.channels.find((entry) => entry.id === region.channelId);
      const layerState = channelState?.layers.find((entry) => entry.key === region.layerKey);
      if (!layerState) {
        return;
      }

      if (region.sliderKey === 'contrast') {
        layerState.settings.contrast = snappedValue;
        onLayerContrastChange(region.layerKey, snappedValue);
      } else if (region.sliderKey === 'brightness') {
        layerState.settings.brightness = snappedValue;
        onLayerBrightnessChange(region.layerKey, snappedValue);
      } else if (region.sliderKey === 'xOffset') {
        layerState.settings.xOffset = snappedValue;
        onLayerOffsetChange(region.layerKey, 'x', snappedValue);
      } else if (region.sliderKey === 'yOffset') {
        layerState.settings.yOffset = snappedValue;
        onLayerOffsetChange(region.layerKey, 'y', snappedValue);
      }

      renderVrChannelsHud(hud, state);
    },
    [onLayerBrightnessChange, onLayerContrastChange, onLayerOffsetChange, renderVrChannelsHud]
  );

  followedTrackIdRef.current = followedTrackId;

  useEffect(() => {
    playbackStateRef.current = {
      isPlaying,
      playbackDisabled,
      playbackLabel,
      timeIndex,
      totalTimepoints,
      onTogglePlayback,
      onTimeIndexChange
    };
    updateVrPlaybackHud();
  }, [
    isPlaying,
    onTimeIndexChange,
    onTogglePlayback,
    playbackDisabled,
    playbackLabel,
    timeIndex,
    totalTimepoints,
    updateVrPlaybackHud
  ]);

  useEffect(() => {
    const nextChannels = channelPanels.map((panel) => ({
      id: panel.id,
      name: panel.name,
      visible: panel.visible,
      activeLayerKey: panel.activeLayerKey,
      layers: panel.layers.map((layer) => ({
        key: layer.key,
        label: layer.label,
        hasData: layer.hasData,
        isGrayscale: layer.isGrayscale,
        settings: {
          contrast: layer.settings.contrast,
          brightness: layer.settings.brightness,
          color: normalizeHexColor(layer.settings.color, DEFAULT_LAYER_COLOR),
          xOffset: layer.settings.xOffset,
          yOffset: layer.settings.yOffset
        }
      }))
    }));
    vrChannelsStateRef.current = {
      channels: nextChannels,
      activeChannelId: activeChannelPanelId
    };
    updateVrChannelsHud();
  }, [activeChannelPanelId, channelPanels, updateVrChannelsHud]);

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

  const resetVrPlaybackHudPlacement = useCallback(() => {
    const camera = cameraRef.current;
    const hud = vrPlaybackHudRef.current;
    if (!camera || !hud) {
      return;
    }
    const offset = vrHudOffsetTempRef.current;
    const target = vrPlaybackHudDragTargetRef.current;
    const baseOffset = volumeRootBaseOffsetRef.current;
    const dimensions = currentDimensionsRef.current;
    if (baseOffset.lengthSq() > 1e-6) {
      let horizontalOffset = VR_PLAYBACK_FALLBACK_HORIZONTAL_OFFSET;
      if (dimensions) {
        const { width, height, depth } = dimensions;
        const maxDimension = Math.max(width, height, depth);
        if (Number.isFinite(maxDimension) && maxDimension > 0) {
          const scale = 1 / maxDimension;
          horizontalOffset = -(width * scale) / 2 - VR_PLAYBACK_VOLUME_MARGIN;
        }
      }
      offset.set(horizontalOffset, VR_PLAYBACK_VERTICAL_OFFSET, VR_PLAYBACK_DEPTH_OFFSET);
      target.set(
        baseOffset.x + offset.x,
        baseOffset.y + offset.y,
        baseOffset.z + offset.z
      );
    } else {
      offset.copy(VR_PLAYBACK_CAMERA_ANCHOR_OFFSET);
      const q = camera.quaternion;
      const sinYaw = 2 * (q.w * q.y + q.x * q.z);
      const cosYaw = 1 - 2 * (q.y * q.y + q.z * q.z);
      const yaw = Math.atan2(sinYaw, cosYaw);
      const cosValue = Math.cos(yaw);
      const sinValue = Math.sin(yaw);
      const rotatedX = offset.x * cosValue - offset.z * sinValue;
      const rotatedZ = offset.x * sinValue + offset.z * cosValue;
      offset.set(rotatedX, offset.y, rotatedZ);
      target.copy(camera.position).add(offset);
    }
    setVrPlaybackHudPlacementPosition(target);
  }, [setVrPlaybackHudPlacementPosition]);

  const resetVrChannelsHudPlacement = useCallback(() => {
    const camera = cameraRef.current;
    const hud = vrChannelsHudRef.current;
    if (!camera || !hud) {
      return;
    }
    const offset = vrHudOffsetTempRef.current;
    const target = vrChannelsHudDragTargetRef.current;
    const baseOffset = volumeRootBaseOffsetRef.current;
    const dimensions = currentDimensionsRef.current;
    if (baseOffset.lengthSq() > 1e-6) {
      let horizontalOffset = VR_CHANNELS_FALLBACK_HORIZONTAL_OFFSET;
      if (dimensions) {
        const { width, height, depth } = dimensions;
        const maxDimension = Math.max(width, height, depth);
        if (Number.isFinite(maxDimension) && maxDimension > 0) {
          const scale = 1 / maxDimension;
          horizontalOffset = (width * scale) / 2 + VR_CHANNELS_VOLUME_MARGIN;
        }
      }
      offset.set(horizontalOffset, VR_CHANNELS_VERTICAL_OFFSET, VR_CHANNELS_DEPTH_OFFSET);
      target.set(
        baseOffset.x + offset.x,
        baseOffset.y + offset.y,
        baseOffset.z + offset.z
      );
    } else {
      offset.copy(VR_CHANNELS_CAMERA_ANCHOR_OFFSET);
      const q = camera.quaternion;
      const sinYaw = 2 * (q.w * q.y + q.x * q.z);
      const cosYaw = 1 - 2 * (q.y * q.y + q.z * q.z);
      const yaw = Math.atan2(sinYaw, cosYaw);
      const cosValue = Math.cos(yaw);
      const sinValue = Math.sin(yaw);
      const rotatedX = offset.x * cosValue - offset.z * sinValue;
      const rotatedZ = offset.x * sinValue + offset.z * cosValue;
      offset.set(rotatedX, offset.y, rotatedZ);
      target.copy(camera.position).add(offset);
    }
    setVrChannelsHudPlacementPosition(target);
  }, [setVrChannelsHudPlacementPosition]);

  const applyVolumeRootTransform = useCallback(
    (dimensions: { width: number; height: number; depth: number } | null) => {
      const volumeRootGroup = volumeRootGroupRef.current;
      if (!volumeRootGroup) {
        return;
      }

      if (!dimensions) {
        const baseOffset = volumeRootBaseOffsetRef.current;
        volumeRootGroup.position.set(baseOffset.x, baseOffset.y, baseOffset.z);
        volumeRootGroup.scale.set(1, 1, 1);
        return;
      }

      const { width, height, depth } = dimensions;
      const maxDimension = Math.max(width, height, depth);
      if (!Number.isFinite(maxDimension) || maxDimension <= 0) {
        const baseOffset = volumeRootBaseOffsetRef.current;
        volumeRootGroup.position.set(baseOffset.x, baseOffset.y, baseOffset.z);
        volumeRootGroup.scale.set(1, 1, 1);
        return;
      }

      const scale = 1 / maxDimension;
      const centerOffset = volumeRootCenterOffsetRef.current;
      centerOffset
        .set(width / 2 - 0.5, height / 2 - 0.5, depth / 2 - 0.5)
        .multiplyScalar(scale);

      volumeRootGroup.scale.setScalar(scale);
      const baseOffset = volumeRootBaseOffsetRef.current;
      volumeRootGroup.position.set(
        -centerOffset.x + baseOffset.x,
        -centerOffset.y + baseOffset.y,
        -centerOffset.z + baseOffset.z
      );
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

    let isDisposed = false;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(container.clientWidth, container.clientHeight);
    const clearColor = 0x080a0d;
    renderer.setClearColor(clearColor, 1);
    renderer.xr.enabled = true;
    renderer.xr.setReferenceSpaceType?.('local-floor');

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

    // If the volume dimensions were already resolved (e.g., when toggling
    // between 2D and 3D views), make sure the tracking overlay immediately
    // adopts the normalized transform. Otherwise the tracks momentarily render
    // in unnormalized dataset coordinates until another interaction triggers a
    // redraw.
    applyTrackGroupTransform(currentDimensionsRef.current);

    setTrackOverlayRevision((revision) => revision + 1);
    setRenderContextRevision((revision) => revision + 1);

    controllersRef.current = [];
    const controllerModelFactory = new XRControllerModelFactory();

    const setControllerVisibility = (shouldShow: boolean) => {
      let anyVisible = false;
      const visibilitySnapshot: Array<{
        index: number;
        visible: boolean;
        isConnected: boolean;
        targetRayMode: string | null;
      }> = [];
      controllersRef.current.forEach((entry, index) => {
        const visible = shouldShow && entry.isConnected && entry.targetRayMode !== 'tracked-hand';
        entry.controller.visible = visible;
        entry.grip.visible = visible;
        entry.ray.visible = visible;
        visibilitySnapshot.push({
          index,
          visible,
          isConnected: entry.isConnected,
          targetRayMode: entry.targetRayMode
        });
        if (!visible) {
          entry.hoverTrackId = null;
        entry.hoverUiTarget = null;
        entry.activeUiTarget = null;
        entry.hasHoverUiPoint = false;
        entry.hudGrabOffsets.playback = null;
        entry.hudGrabOffsets.channels = null;
      } else {
        anyVisible = true;
      }
      });
      if (import.meta.env?.DEV) {
        vrLog('[VR] controller visibility', { shouldShow, visibilitySnapshot });
      }
      if (!anyVisible) {
        clearHoverState('controller');
        applyVrPlaybackHoverState(false, false, false);
      }
    };

    const refreshControllerVisibility = () => {
      setControllerVisibility(renderer.xr.isPresenting);
    };

    for (let index = 0; index < 2; index++) {
      const controller = renderer.xr.getController(index);
      controller.visible = false;

      const grip = renderer.xr.getControllerGrip(index);
      grip.visible = false;

      const rayGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, -1)
      ]);
      const rayMaterial = new THREE.LineBasicMaterial({ color: 0xffffff });
      const ray = new THREE.Line(rayGeometry, rayMaterial);
      ray.visible = false;
      controller.add(ray);

      const model = controllerModelFactory.createControllerModel(grip);
      grip.add(model);

      const controllerRaycaster = new THREE.Raycaster();
      controllerRaycaster.params.Line = { threshold: 0.02 };
      (controllerRaycaster.params as unknown as { Line2?: { threshold: number } }).Line2 = {
        threshold: 0.02
      };
      controllerRaycaster.far = 10;

      const entry: ControllerEntry = {
        controller,
        grip,
        ray,
        rayGeometry,
        rayMaterial,
        raycaster: controllerRaycaster,
        onConnected: () => undefined,
        onDisconnected: () => undefined,
        onSelectStart: () => undefined,
        onSelectEnd: () => undefined,
        isConnected: false,
        targetRayMode: null,
        gamepad: null,
        hoverTrackId: null,
        hoverUiTarget: null,
        activeUiTarget: null,
        hoverUiPoint: new THREE.Vector3(),
        hasHoverUiPoint: false,
        hoverPoint: new THREE.Vector3(),
        rayOrigin: new THREE.Vector3(),
        rayDirection: new THREE.Vector3(0, 0, -1),
        rayLength: 3,
        isSelecting: false,
        hudGrabOffsets: { playback: null, channels: null }
      };

      entry.onConnected = (event) => {
        entry.isConnected = true;
        entry.targetRayMode = event?.data?.targetRayMode ?? null;
        entry.gamepad = event?.data?.gamepad ?? null;
        entry.hoverTrackId = null;
        entry.hoverUiTarget = null;
        entry.activeUiTarget = null;
        entry.hasHoverUiPoint = false;
        entry.hudGrabOffsets.playback = null;
        entry.hudGrabOffsets.channels = null;
        entry.rayLength = 3;
        vrLog('[VR] controller connected', index, {
          targetRayMode: entry.targetRayMode,
          hasGamepad: Boolean(entry.gamepad)
        });
        refreshControllerVisibility();
      };

      entry.onDisconnected = () => {
        entry.isConnected = false;
        entry.targetRayMode = null;
        entry.gamepad = null;
        entry.hoverTrackId = null;
        entry.hoverUiTarget = null;
        entry.activeUiTarget = null;
        entry.hasHoverUiPoint = false;
        entry.rayLength = 3;
        entry.isSelecting = false;
        entry.ray.scale.set(1, 1, entry.rayLength);
        entry.hudGrabOffsets.playback = null;
        entry.hudGrabOffsets.channels = null;
        vrLog('[VR] controller disconnected', index);
        refreshControllerVisibility();
        clearHoverState('controller');
      };

      entry.onSelectStart = () => {
        entry.isSelecting = true;
        entry.activeUiTarget = entry.hoverUiTarget;
        const playbackState = playbackStateRef.current;
        if (entry.activeUiTarget?.type === 'playback-play-toggle' && playbackState.playbackDisabled) {
          entry.activeUiTarget = null;
        }
        if (
          entry.activeUiTarget?.type === 'playback-slider' &&
          entry.hasHoverUiPoint &&
          !playbackState.playbackDisabled
        ) {
          applySliderFromWorldPoint(entry.hoverUiPoint);
        }
        if (entry.activeUiTarget?.type === 'playback-panel-grab') {
          const hud = vrPlaybackHudRef.current;
          if (hud) {
            const placement = vrPlaybackHudPlacementRef.current;
            const referencePosition = vrPlaybackHudDragTargetRef.current;
            referencePosition.copy(placement?.position ?? hud.group.position);
            if (!entry.hasHoverUiPoint) {
              entry.hoverUiPoint.copy(referencePosition);
              entry.hasHoverUiPoint = true;
            }
            if (!entry.hudGrabOffsets.playback) {
              entry.hudGrabOffsets.playback = new THREE.Vector3();
            }
            entry.hudGrabOffsets.playback.copy(referencePosition).sub(entry.hoverUiPoint);
          }
        }
        if (
          entry.activeUiTarget?.type === 'channels-slider' &&
          entry.hasHoverUiPoint &&
          entry.activeUiTarget.data &&
          !(entry.activeUiTarget.data as VrChannelsInteractiveRegion).disabled
        ) {
          applyVrChannelsSliderFromPoint(
            entry.activeUiTarget.data as VrChannelsInteractiveRegion,
            entry.hoverUiPoint
          );
        }
        if (entry.activeUiTarget?.type === 'channels-panel-grab') {
          const hud = vrChannelsHudRef.current;
          if (hud) {
            const placement = vrChannelsHudPlacementRef.current;
            const referencePosition = vrChannelsHudDragTargetRef.current;
            referencePosition.copy(placement?.position ?? hud.group.position);
            if (!entry.hasHoverUiPoint) {
              entry.hoverUiPoint.copy(referencePosition);
              entry.hasHoverUiPoint = true;
            }
            if (!entry.hudGrabOffsets.channels) {
              entry.hudGrabOffsets.channels = new THREE.Vector3();
            }
            entry.hudGrabOffsets.channels.copy(referencePosition).sub(entry.hoverUiPoint);
          }
        }
        vrLog('[VR] selectstart', index, {
          hoverTrackId: entry.hoverTrackId,
          uiTarget: entry.activeUiTarget?.type ?? null
        });
      };

      entry.onSelectEnd = () => {
        entry.isSelecting = false;
        const activeTarget = entry.activeUiTarget;
        entry.activeUiTarget = null;
        const playbackState = playbackStateRef.current;
        if (activeTarget?.type === 'playback-play-toggle') {
          if (!playbackState.playbackDisabled) {
            playbackState.onTogglePlayback?.();
          }
        } else if (activeTarget?.type === 'playback-slider') {
          if (entry.hasHoverUiPoint && !playbackState.playbackDisabled) {
            applySliderFromWorldPoint(entry.hoverUiPoint);
          }
        } else if (activeTarget?.type === 'playback-panel-grab') {
          entry.hudGrabOffsets.playback = null;
        } else if (activeTarget?.type === 'channels-panel-grab') {
          entry.hudGrabOffsets.channels = null;
        } else if (
          activeTarget?.type === 'channels-slider' &&
          activeTarget.data &&
          !(activeTarget.data as VrChannelsInteractiveRegion).disabled &&
          entry.hasHoverUiPoint
        ) {
          applyVrChannelsSliderFromPoint(
            activeTarget.data as VrChannelsInteractiveRegion,
            entry.hoverUiPoint
          );
        } else if (activeTarget && activeTarget.type.startsWith('channels-')) {
          const region = activeTarget.data as VrChannelsInteractiveRegion | undefined;
          if (region) {
            const state = vrChannelsStateRef.current;
            if (activeTarget.type === 'channels-tab') {
              state.activeChannelId = region.channelId;
              onChannelPanelSelect(region.channelId);
            } else if (activeTarget.type === 'channels-visibility') {
              const channelState = state.channels.find((channel) => channel.id === region.channelId);
              if (channelState) {
                channelState.visible = !channelState.visible;
              }
              onChannelVisibilityToggle(region.channelId);
            } else if (activeTarget.type === 'channels-reset') {
              const channelState = state.channels.find((channel) => channel.id === region.channelId);
              if (channelState) {
                for (const layer of channelState.layers) {
                  layer.settings.contrast = 1;
                  layer.settings.brightness = 0;
                  layer.settings.xOffset = 0;
                  layer.settings.yOffset = 0;
                }
              }
              onChannelReset(region.channelId);
            } else if (activeTarget.type === 'channels-layer' && region.layerKey) {
              const channelState = state.channels.find((channel) => channel.id === region.channelId);
              if (channelState) {
                channelState.activeLayerKey = region.layerKey;
              }
              onChannelLayerSelect(region.channelId, region.layerKey);
            } else if (activeTarget.type === 'channels-color' && region.layerKey && region.color) {
              const channelState = state.channels.find((channel) => channel.id === region.channelId);
              const layerState = channelState?.layers.find((layer) => layer.key === region.layerKey);
              if (layerState) {
                layerState.settings.color = region.color;
              }
              onLayerColorChange(region.layerKey, region.color);
            }
            updateVrChannelsHud();
          }
        } else if (entry.hoverTrackId) {
          onTrackFollowRequest(entry.hoverTrackId);
        }
        vrLog('[VR] selectend', index, {
          hoverTrackId: entry.hoverTrackId,
          uiTarget: activeTarget?.type ?? null
        });
      };

      controller.addEventListener('connected', entry.onConnected);
      controller.addEventListener('disconnected', entry.onDisconnected);
      controller.addEventListener('selectstart', entry.onSelectStart);
      controller.addEventListener('selectend', entry.onSelectEnd);

      scene.add(controller);
      scene.add(grip);

      controllersRef.current.push(entry);
    }

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
      applyVrPlaybackHoverState(false, false, false);
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
      const hitObject = intersection.object as unknown as { userData: Record<string, unknown> };
      const trackId =
        typeof hitObject.userData.trackId === 'string'
          ? (hitObject.userData.trackId as string)
          : null;
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
      clearHoverState('pointer');
    };

    const pointerDownOptions: AddEventListenerOptions = { capture: true };

    domElement.addEventListener('pointerdown', handlePointerDown, pointerDownOptions);
    domElement.addEventListener('pointermove', handlePointerMove);
    domElement.addEventListener('pointerup', handlePointerUp);
    domElement.addEventListener('pointercancel', handlePointerUp);
    domElement.addEventListener('pointerleave', handlePointerLeave);

    const controllerTempMatrix = new THREE.Matrix4();
    const controllerProjectedPoint = new THREE.Vector3();

    let lastControllerRaySummary:
      | {
          presenting: boolean;
          visibleLines: number;
          hoverTrackIds: Array<string | null>;
        }
      | null = null;

    const updateControllerRays = () => {
      if (!renderer.xr.isPresenting) {
        if (!lastControllerRaySummary || lastControllerRaySummary.presenting !== false) {
          vrLog('[VR] skipping controller rays – not presenting');
        }
        lastControllerRaySummary = {
          presenting: false,
          visibleLines: 0,
          hoverTrackIds: controllersRef.current.map((entry) => entry.hoverTrackId)
        };
        clearHoverState('controller');
        applyVrPlaybackHoverState(false, false, false);
        return;
      }

      const cameraInstance = cameraRef.current;
      const trackGroupInstance = trackGroupRef.current;
      const containerInstance = containerRef.current;

      const visibleLines: Line2[] = [];
      if (trackGroupInstance && trackGroupInstance.visible) {
        for (const resource of trackLinesRef.current.values()) {
          if (resource.line.visible) {
            visibleLines.push(resource.line);
          }
        }
      }

      let hoveredByController: { trackId: string; position: { x: number; y: number } | null } | null = null;
      let playHoveredAny = false;
      let sliderHoveredAny = false;
      let sliderActiveAny = false;
      let nextChannelsHoverRegion: VrChannelsInteractiveRegion | null = null;

      for (let index = 0; index < controllersRef.current.length; index++) {
        const entry = controllersRef.current[index];
        const previousHoverTrackId = entry.hoverTrackId;
        const previousUiType = entry.hoverUiTarget ? entry.hoverUiTarget.type : null;
        if (!entry.controller.visible) {
          entry.hoverTrackId = null;
          entry.hoverUiTarget = null;
          entry.activeUiTarget = null;
          entry.hasHoverUiPoint = false;
          entry.rayLength = 3;
          entry.ray.scale.set(1, 1, entry.rayLength);
          if (previousHoverTrackId !== entry.hoverTrackId || previousUiType !== null) {
            vrLog('[VR] controller hover cleared', index);
          }
          continue;
        }

        controllerTempMatrix.identity().extractRotation(entry.controller.matrixWorld);
        entry.rayOrigin.setFromMatrixPosition(entry.controller.matrixWorld);
        entry.rayDirection.set(0, 0, -1).applyMatrix4(controllerTempMatrix).normalize();
        entry.raycaster.ray.origin.copy(entry.rayOrigin);
        entry.raycaster.ray.direction.copy(entry.rayDirection);

        let rayLength = 3;
        let hoverTrackId: string | null = null;
        let hoverPosition: { x: number; y: number } | null = null;
        entry.hoverUiTarget = null;
        entry.hasHoverUiPoint = false;

        let uiRayLength: number | null = null;
        const playbackHudInstance = vrPlaybackHudRef.current;
        const channelsHudInstance = vrChannelsHudRef.current;
        let playbackCandidate: {
          target: VrUiTarget;
          point: THREE.Vector3;
          distance: number;
        } | null = null;
        let channelsCandidate: {
          target: VrUiTarget;
          point: THREE.Vector3;
          distance: number;
          region: VrChannelsInteractiveRegion | null;
        } | null = null;

        if (playbackHudInstance && playbackHudInstance.interactables.length > 0) {
          const uiIntersections = entry.raycaster.intersectObjects(
            playbackHudInstance.interactables,
            true
          ) as Array<{ object: THREE.Object3D; distance: number; point: THREE.Vector3 }>;
          if (uiIntersections.length > 0) {
            const resolvedTarget = resolveVrUiTarget(uiIntersections[0].object);
            if (resolvedTarget) {
              playbackCandidate = {
                target: resolvedTarget,
                point: uiIntersections[0].point.clone(),
                distance: uiIntersections[0].distance
              };
              uiRayLength = Math.max(0.12, Math.min(uiIntersections[0].distance, 8));
            }
          }
        }

        if (entry.isSelecting && entry.activeUiTarget?.type === 'playback-slider' && playbackHudInstance) {
          const sliderIntersections = entry.raycaster.intersectObject(
            playbackHudInstance.sliderHitArea,
            false
          ) as Array<{ distance: number; point: THREE.Vector3 }>;
          if (sliderIntersections.length > 0) {
            const sliderDistance = Math.max(0.12, Math.min(sliderIntersections[0].distance, 8));
            uiRayLength =
              uiRayLength === null ? sliderDistance : Math.min(uiRayLength, sliderDistance);
            playbackCandidate = {
              target: { type: 'playback-slider', object: playbackHudInstance.sliderHitArea },
              point: sliderIntersections[0].point.clone(),
              distance: sliderIntersections[0].distance
            };
            if (!playbackStateRef.current.playbackDisabled) {
              applySliderFromWorldPoint(sliderIntersections[0].point);
            }
          }
        }

        if (entry.isSelecting && entry.activeUiTarget?.type === 'playback-panel-grab' && playbackHudInstance) {
          const handleIntersections = entry.raycaster.intersectObject(
            playbackHudInstance.panelGrabHandle,
            false
          ) as Array<{ distance: number; point: THREE.Vector3 }>;
          let grabPoint: THREE.Vector3 | null = null;
          if (handleIntersections.length > 0) {
            grabPoint = handleIntersections[0].point;
            const handleDistance = Math.max(0.12, Math.min(handleIntersections[0].distance, 8));
            uiRayLength =
              uiRayLength === null ? handleDistance : Math.min(uiRayLength, handleDistance);
          } else {
            const plane = vrHudPlaneRef.current;
            const planePoint = vrHudPlanePointRef.current;
            playbackHudInstance.panelGrabHandle.getWorldPosition(planePoint);
            const planeNormal = vrHudForwardRef.current;
            planeNormal.set(0, 0, 1).applyQuaternion(playbackHudInstance.group.quaternion).normalize();
            plane.setFromNormalAndCoplanarPoint(planeNormal, planePoint);
            const planeIntersection = vrHudIntersectionRef.current;
            if (entry.raycaster.ray.intersectPlane(plane, planeIntersection)) {
              grabPoint = planeIntersection.clone();
            }
          }
          if (grabPoint) {
            const grabDistance = Math.max(
              0.12,
              Math.min(entry.rayOrigin.distanceTo(grabPoint), 8)
            );
            uiRayLength = uiRayLength === null ? grabDistance : Math.min(uiRayLength, grabDistance);
            playbackCandidate = {
              target: { type: 'playback-panel-grab', object: playbackHudInstance.panelGrabHandle },
              point: grabPoint.clone(),
              distance: entry.rayOrigin.distanceTo(grabPoint)
            };
          }
        }

        if (channelsHudInstance && channelsHudInstance.interactables.length > 0) {
          const channelIntersections = entry.raycaster.intersectObjects(
            channelsHudInstance.interactables,
            true
          ) as Array<{ object: THREE.Object3D; distance: number; point: THREE.Vector3 }>;
          if (channelIntersections.length > 0) {
            let resolvedTarget = resolveVrUiTarget(channelIntersections[0].object);
            let region: VrChannelsInteractiveRegion | null = null;
            if (resolvedTarget?.type === 'channels-panel') {
              region = resolveChannelsRegionFromPoint(channelsHudInstance, channelIntersections[0].point);
              if (region?.disabled) {
                region = null;
                resolvedTarget = null;
              } else if (region) {
                resolvedTarget = {
                  type: region.targetType,
                  object: channelsHudInstance.panel,
                  data: region
                };
              }
            } else if (resolvedTarget && resolvedTarget.type.startsWith('channels-')) {
              region = (resolvedTarget.data as VrChannelsInteractiveRegion) ?? null;
              if (region?.disabled) {
                resolvedTarget = null;
                region = null;
              }
            }
            if (resolvedTarget) {
              channelsCandidate = {
                target: resolvedTarget,
                point: channelIntersections[0].point.clone(),
                distance: channelIntersections[0].distance,
                region: region ?? null
              };
              const channelDistance = Math.max(0.12, Math.min(channelIntersections[0].distance, 8));
              uiRayLength =
                uiRayLength === null ? channelDistance : Math.min(uiRayLength, channelDistance);
              if (region) {
                nextChannelsHoverRegion = region;
              }
            }
          }
        }

        if (
          entry.isSelecting &&
          entry.activeUiTarget?.type === 'channels-slider' &&
          channelsHudInstance &&
          entry.activeUiTarget.data &&
          !(entry.activeUiTarget.data as VrChannelsInteractiveRegion).disabled
        ) {
          const region = entry.activeUiTarget.data as VrChannelsInteractiveRegion;
          const panelIntersections = entry.raycaster.intersectObject(
            channelsHudInstance.panel,
            false
          ) as Array<{ distance: number; point: THREE.Vector3 }>;
          if (panelIntersections.length > 0) {
            const sliderDistance = Math.max(0.12, Math.min(panelIntersections[0].distance, 8));
            uiRayLength =
              uiRayLength === null ? sliderDistance : Math.min(uiRayLength, sliderDistance);
            channelsCandidate = {
              target: { type: 'channels-slider', object: channelsHudInstance.panel, data: region },
              point: panelIntersections[0].point.clone(),
              distance: panelIntersections[0].distance,
              region
            };
            entry.hoverUiPoint.copy(panelIntersections[0].point);
            entry.hasHoverUiPoint = true;
            applyVrChannelsSliderFromPoint(region, panelIntersections[0].point);
            nextChannelsHoverRegion = region;
          }
        }

        if (entry.isSelecting && entry.activeUiTarget?.type === 'channels-panel-grab' && channelsHudInstance) {
          const handleIntersections = entry.raycaster.intersectObject(
            channelsHudInstance.panelGrabHandle,
            false
          ) as Array<{ distance: number; point: THREE.Vector3 }>;
          let grabPoint: THREE.Vector3 | null = null;
          if (handleIntersections.length > 0) {
            grabPoint = handleIntersections[0].point;
            const handleDistance = Math.max(0.12, Math.min(handleIntersections[0].distance, 8));
            uiRayLength =
              uiRayLength === null ? handleDistance : Math.min(uiRayLength, handleDistance);
          } else {
            const plane = vrHudPlaneRef.current;
            const planePoint = vrHudPlanePointRef.current;
            channelsHudInstance.panelGrabHandle.getWorldPosition(planePoint);
            const planeNormal = vrHudForwardRef.current;
            planeNormal.set(0, 0, 1).applyQuaternion(channelsHudInstance.group.quaternion).normalize();
            plane.setFromNormalAndCoplanarPoint(planeNormal, planePoint);
            const planeIntersection = vrHudIntersectionRef.current;
            if (entry.raycaster.ray.intersectPlane(plane, planeIntersection)) {
              grabPoint = planeIntersection.clone();
            }
          }
          if (grabPoint) {
            const grabDistance = Math.max(
              0.12,
              Math.min(entry.rayOrigin.distanceTo(grabPoint), 8)
            );
            uiRayLength = uiRayLength === null ? grabDistance : Math.min(uiRayLength, grabDistance);
            channelsCandidate = {
              target: { type: 'channels-panel-grab', object: channelsHudInstance.panelGrabHandle },
              point: grabPoint.clone(),
              distance: entry.rayOrigin.distanceTo(grabPoint),
              region: null
            };
          }
        }

        let chosenCandidate: {
          target: VrUiTarget;
          point: THREE.Vector3;
          distance: number;
          region?: VrChannelsInteractiveRegion | null;
        } | null = null;
        if (playbackCandidate && channelsCandidate) {
          chosenCandidate =
            playbackCandidate.distance <= channelsCandidate.distance
              ? playbackCandidate
              : channelsCandidate;
        } else {
          chosenCandidate = playbackCandidate ?? channelsCandidate ?? null;
        }

        if (chosenCandidate) {
          entry.hoverUiTarget = chosenCandidate.target;
          entry.hasHoverUiPoint = true;
          entry.hoverUiPoint.copy(chosenCandidate.point);
          const candidateDistance = Math.max(0.12, Math.min(chosenCandidate.distance, 8));
          uiRayLength = uiRayLength === null ? candidateDistance : Math.min(uiRayLength, candidateDistance);
          if (
            chosenCandidate.target.type.startsWith('channels-') &&
            chosenCandidate.region
          ) {
            nextChannelsHoverRegion = chosenCandidate.region;
          }
        }

        const uiType = entry.hoverUiTarget ? entry.hoverUiTarget.type : null;
        if (uiType === 'playback-play-toggle') {
          playHoveredAny = true;
        } else if (uiType === 'playback-slider') {
          sliderHoveredAny = true;
        } else if (uiType === 'playback-panel-grab') {
          hoverTrackId = null;
        }
        if (entry.activeUiTarget?.type === 'playback-slider') {
          sliderActiveAny = true;
          hoverTrackId = null;
        }
        if (
          entry.activeUiTarget?.type === 'playback-panel-grab' ||
          entry.activeUiTarget?.type === 'channels-panel-grab'
        ) {
          hoverTrackId = null;
        }

        if (uiRayLength !== null && Number.isFinite(uiRayLength)) {
          rayLength = Math.min(rayLength, uiRayLength);
        }

        if (
          entry.isSelecting &&
          entry.activeUiTarget?.type === 'playback-panel-grab' &&
          playbackHudInstance &&
          entry.hasHoverUiPoint
        ) {
          const newPosition = vrPlaybackHudDragTargetRef.current;
          newPosition.copy(entry.hoverUiPoint);
          if (entry.hudGrabOffsets.playback) {
            newPosition.add(entry.hudGrabOffsets.playback);
          }
          setVrPlaybackHudPlacementPosition(newPosition);
        }

        if (
          entry.isSelecting &&
          entry.activeUiTarget?.type === 'channels-panel-grab' &&
          channelsHudInstance &&
          entry.hasHoverUiPoint
        ) {
          const newPosition = vrChannelsHudDragTargetRef.current;
          newPosition.copy(entry.hoverUiPoint);
          if (entry.hudGrabOffsets.channels) {
            newPosition.add(entry.hudGrabOffsets.channels);
          }
          setVrChannelsHudPlacementPosition(newPosition);
        }

        if (visibleLines.length > 0 && cameraInstance) {
          const intersections = entry.raycaster.intersectObjects(visibleLines, false) as Array<{
            object: THREE.Object3D & { userData?: Record<string, unknown> };
            distance: number;
            point: THREE.Vector3;
          }>;

          if (intersections.length > 0) {
            const intersection = intersections[0];
            const trackId =
              intersection.object.userData && typeof intersection.object.userData.trackId === 'string'
                ? (intersection.object.userData.trackId as string)
                : null;

            if (trackId) {
              hoverTrackId = entry.hoverUiTarget ? null : trackId;
              entry.hoverPoint.copy(intersection.point);
              const distance = Math.max(0.15, Math.min(intersection.distance, 8));
              rayLength = Math.min(rayLength, distance);
              if (containerInstance) {
                const width = containerInstance.clientWidth;
                const height = containerInstance.clientHeight;
                if (width > 0 && height > 0) {
                  controllerProjectedPoint.copy(intersection.point).project(cameraInstance);
                  if (
                    Number.isFinite(controllerProjectedPoint.x) &&
                    Number.isFinite(controllerProjectedPoint.y)
                  ) {
                    hoverPosition = {
                      x: (controllerProjectedPoint.x * 0.5 + 0.5) * width,
                      y: (-controllerProjectedPoint.y * 0.5 + 0.5) * height
                    };
                  }
                }
              }
            }
          }
        }

        entry.hoverTrackId = hoverTrackId;
        const currentUiType = entry.hoverUiTarget ? entry.hoverUiTarget.type : null;
        if (previousHoverTrackId !== hoverTrackId || previousUiType !== currentUiType) {
          vrLog('[VR] controller hover update', index, {
            hoverTrackId,
            hoverPosition,
            uiTarget: currentUiType
          });
        }
        entry.rayLength = rayLength;
        entry.ray.scale.set(1, 1, rayLength);

        if (!hoveredByController && hoverTrackId) {
          hoveredByController = { trackId: hoverTrackId, position: hoverPosition };
        }
      }

      applyVrPlaybackHoverState(playHoveredAny, sliderHoveredAny, sliderActiveAny);

      const channelsHudInstance = vrChannelsHudRef.current;
      const isSameRegion = (
        a: VrChannelsInteractiveRegion | null,
        b: VrChannelsInteractiveRegion | null
      ) => {
        if (a === b) {
          return true;
        }
        if (!a || !b) {
          return false;
        }
        return (
          a.targetType === b.targetType &&
          a.channelId === b.channelId &&
          a.layerKey === b.layerKey &&
          a.sliderKey === b.sliderKey &&
          a.color === b.color
        );
      };
      if (channelsHudInstance && !isSameRegion(channelsHudInstance.hoverRegion, nextChannelsHoverRegion)) {
        channelsHudInstance.hoverRegion = nextChannelsHoverRegion;
        renderVrChannelsHud(channelsHudInstance, vrChannelsStateRef.current);
      }

      const summary = {
        presenting: true,
        visibleLines: visibleLines.length,
        hoverTrackIds: controllersRef.current.map((entry) => entry.hoverTrackId)
      };
      if (
        !lastControllerRaySummary ||
        summary.visibleLines !== lastControllerRaySummary.visibleLines ||
        summary.hoverTrackIds.length !== lastControllerRaySummary.hoverTrackIds.length ||
        summary.hoverTrackIds.some((id, hoverIndex) => id !== lastControllerRaySummary?.hoverTrackIds[hoverIndex])
      ) {
        vrLog('[VR] ray pass', summary);
      }
      lastControllerRaySummary = summary;

      if (hoveredByController) {
        updateHoverState(hoveredByController.trackId, hoveredByController.position, 'controller');
      } else {
        clearHoverState('controller');
      }
    };

    const handleXrManagerSessionStart = () => {
      vrLog('[VR] sessionstart event', {
        presenting: renderer.xr.isPresenting,
        visibilityState: xrSessionRef.current?.visibilityState ?? null
      });
      volumeRootBaseOffsetRef.current.copy(VR_VOLUME_BASE_OFFSET);
      applyVolumeRootTransform(currentDimensionsRef.current);
      refreshControllerVisibility();
      setVrPlaybackHudVisible(true);
      setVrChannelsHudVisible(true);
      resetVrPlaybackHudPlacement();
      resetVrChannelsHudPlacement();
      updateVrPlaybackHud();
      updateVrChannelsHud();
      updateControllerRays();
      handleResize();
    };

    const handleXrManagerSessionEnd = () => {
      vrLog('[VR] sessionend event', {
        presenting: renderer.xr.isPresenting,
        visibilityState: xrSessionRef.current?.visibilityState ?? null
      });
      volumeRootBaseOffsetRef.current.set(0, 0, 0);
      applyVolumeRootTransform(currentDimensionsRef.current);
      refreshControllerVisibility();
      setVrPlaybackHudVisible(false);
      setVrChannelsHudVisible(false);
      handleResize();
    };

    renderer.xr.addEventListener('sessionstart', handleXrManagerSessionStart);
    renderer.xr.addEventListener('sessionend', handleXrManagerSessionEnd);

    rendererRef.current = renderer;
    sceneRef.current = scene;
    cameraRef.current = camera;
    resetVrPlaybackHudPlacement();
    resetVrChannelsHudPlacement();

    const handleSessionEnd = () => {
      vrLog('[VR] handleSessionEnd', {
        presenting: renderer.xr.isPresenting,
        visibilityState: xrSessionRef.current?.visibilityState ?? null
      });
      sessionCleanupRef.current = null;
      xrSessionRef.current = null;
      volumeRootBaseOffsetRef.current.set(0, 0, 0);
      applyVolumeRootTransform(currentDimensionsRef.current);
      setControllerVisibility(false);
      setVrPlaybackHudVisible(false);
      setVrChannelsHudVisible(false);
      applyVrPlaybackHoverState(false, false, false);
      for (const entry of controllersRef.current) {
        entry.ray.scale.set(1, 1, 1);
        entry.hudGrabOffsets.playback = null;
        entry.hudGrabOffsets.channels = null;
      }
      const controlsInstance = controlsRef.current;
      if (controlsInstance) {
        controlsInstance.enabled = true;
      }
      const stored = preVrCameraStateRef.current;
      const cameraInstance = cameraRef.current;
      if (stored && cameraInstance && controlsInstance) {
        cameraInstance.position.copy(stored.position);
        cameraInstance.quaternion.copy(stored.quaternion);
        cameraInstance.updateMatrixWorld(true);
        controlsInstance.target.copy(stored.target);
        controlsInstance.update();
      }
      preVrCameraStateRef.current = null;
      refreshControllerVisibility();
      handleResize();
      renderer.setAnimationLoop(renderLoop);
      if (!isDisposed) {
        onVrSessionEnded?.();
      }
    };

    const requestVrSession = async () => {
      if (xrSessionRef.current) {
        return xrSessionRef.current;
      }
      if (typeof navigator === 'undefined' || !navigator.xr) {
        throw new Error('WebXR not available');
      }
      vrLog('[VR] requestSession → navigator.xr.requestSession');
      const session = await navigator.xr.requestSession('immersive-vr', {
        optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking']
      });
      vrLog('[VR] requestSession resolved', {
        presenting: renderer.xr.isPresenting,
        visibilityState: session.visibilityState
      });
      xrSessionRef.current = session;

      const controlsInstance = controlsRef.current;
      if (controlsInstance) {
        controlsInstance.enabled = false;
      }
      const cameraInstance = cameraRef.current;
      if (cameraInstance && controlsInstance) {
        preVrCameraStateRef.current = {
          position: cameraInstance.position.clone(),
          quaternion: cameraInstance.quaternion.clone(),
          target: controlsInstance.target.clone()
        };
      } else {
        preVrCameraStateRef.current = null;
      }

      const onSessionEnd = () => {
        session.removeEventListener('end', onSessionEnd);
        handleSessionEnd();
      };
      session.addEventListener('end', onSessionEnd);
      sessionCleanupRef.current = () => {
        session.removeEventListener('end', onSessionEnd);
      };

      renderer.xr.setSession(session);
      vrLog('[VR] setSession', {
        presenting: renderer.xr.isPresenting,
        visibilityState: session.visibilityState
      });
      volumeRootBaseOffsetRef.current.copy(VR_VOLUME_BASE_OFFSET);
      applyVolumeRootTransform(currentDimensionsRef.current);
      setVrPlaybackHudVisible(true);
      updateVrPlaybackHud();
      refreshControllerVisibility();
      updateControllerRays();

      if (!isDisposed) {
        onVrSessionStarted?.();
      }

      return session;
    };

    const endVrSession = async () => {
      const session = xrSessionRef.current;
      if (!session) {
        return;
      }
      await session.end();
    };

    onRegisterVrSession?.({
      requestSession: requestVrSession,
      endSession: endVrSession
    });

    const handleResize = (entries?: ResizeObserverEntry[]) => {
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

    const renderLoop = () => {
      applyKeyboardMovement();
      controls.update();

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

      updateHudGroupFromPlacement();

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
      isDisposed = true;
      onRegisterVrSession?.(null);
      renderer.xr.removeEventListener('sessionstart', handleXrManagerSessionStart);
      renderer.xr.removeEventListener('sessionend', handleXrManagerSessionEnd);
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
      preVrCameraStateRef.current = null;
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
            if (Array.isArray(mesh.material)) {
              mesh.material.forEach((material) => material?.dispose?.());
            } else if (mesh.material) {
              mesh.material.dispose?.();
            }
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
            if (Array.isArray(mesh.material)) {
              mesh.material.forEach((material) => material?.dispose?.());
            } else if (mesh.material) {
              mesh.material.dispose?.();
            }
          }
        });
        channelsHud.panelTexture.dispose();
        vrChannelsHudRef.current = null;
        vrChannelsHudPlacementRef.current = null;
      }

      const resources = resourcesRef.current;
      for (const resource of resources.values()) {
        scene.remove(resource.mesh);
        resource.mesh.geometry.dispose();
        resource.mesh.material.dispose();
        resource.texture.dispose();
      }
      resources.clear();

      for (const entry of controllersRef.current) {
        entry.controller.removeEventListener('connected', entry.onConnected);
        entry.controller.removeEventListener('disconnected', entry.onDisconnected);
        entry.controller.removeEventListener('selectstart', entry.onSelectStart);
        entry.controller.removeEventListener('selectend', entry.onSelectEnd);
        entry.controller.remove(entry.ray);
        scene.remove(entry.controller);
        scene.remove(entry.grip);
        entry.rayGeometry.dispose();
        entry.rayMaterial.dispose();
      }
      controllersRef.current = [];

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
  }, [
    applyTrackGroupTransform,
    applyVolumeRootTransform,
    containerNode,
    onRegisterVrSession,
    onVrSessionEnded,
    onVrSessionStarted
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

  return (
    <div className="volume-viewer">
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
