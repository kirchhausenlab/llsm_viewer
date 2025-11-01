// @ts-nocheck
import { MutableRefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { Line2 } from 'three/examples/jsm/lines/Line2';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial';
import { XRControllerModelFactory } from 'three/examples/jsm/webxr/XRControllerModelFactory';
import type { NormalizedVolume } from '../volumeProcessing';
import type {
  RaycasterLike,
  ViewerLayer,
  VolumeViewerProps,
  VrHistogramShape
} from '../renderer/types';
import './VolumeViewer.css';
export { VolumeScene } from '../renderer/VolumeScene';
import { useVolumeTextures } from '../renderer/useVolumeTextures';
import type { TrackColorMode, TrackDefinition } from '../types/tracks';
import { DEFAULT_LAYER_COLOR, GRAYSCALE_COLOR_SWATCHES, normalizeHexColor } from '../layerColors';
import {
  createTrackColor,
  DEFAULT_TRACK_COLOR,
  getTrackColorHex,
  normalizeTrackColor,
  TRACK_COLOR_SWATCHES
} from '../trackColors';
import {
  brightnessContrastModel,
  computeContrastMultiplier,
  formatContrastMultiplier,
  DEFAULT_WINDOW_MIN,
  DEFAULT_WINDOW_MAX
} from '../state/layerSettings';
import { HISTOGRAM_FIRST_VALID_BIN } from '../autoContrast';

const formatNormalizedIntensity = (value: number): string => {
  const fixed = value.toFixed(3);
  return fixed.replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '');
};

const clampValue = (value: number, min: number, max: number): number => {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
};

const VR_CHANNELS_HISTOGRAM_HEIGHT = 160;
const VR_CHANNELS_HISTOGRAM_RADIUS = 18;

const computeHistogramShape = (
  histogram: Uint32Array | null,
  width: number,
  height: number
): VrHistogramShape => {
  if (!histogram || histogram.length === 0) {
    return { points: [], isEmpty: true };
  }

  let maxCount = 0;
  for (let i = HISTOGRAM_FIRST_VALID_BIN; i < histogram.length; i++) {
    const value = histogram[i];
    if (value > maxCount) {
      maxCount = value;
    }
  }

  if (maxCount === 0) {
    return { points: [], isEmpty: true };
  }

  const bins = histogram.length;
  const span = bins > 1 ? bins - 1 : bins;
  const step = span > 0 ? width / span : width;
  const points: Array<{ x: number; y: number }> = [];

  for (let i = HISTOGRAM_FIRST_VALID_BIN; i < bins; i++) {
    const count = histogram[i];
    const normalized = count / maxCount;
    const x = step * i;
    const y = height - normalized * height;
    points.push({ x, y });
  }

  return { points, isEmpty: false };
};

const computeHistogramMappingPoints = (
  windowMin: number,
  windowMax: number,
  defaultMin: number,
  defaultMax: number,
  width: number,
  height: number
): Array<{ x: number; y: number }> => {
  const defaultRange = defaultMax - defaultMin;
  const windowWidth = windowMax - windowMin;

  if (!(defaultRange > 0) || !(windowWidth > 0)) {
    return [];
  }

  const lowerFraction = (windowMin - defaultMin) / defaultRange;
  const upperFraction = (windowMax - defaultMin) / defaultRange;
  const fractions: number[] = [0, 1];

  if (lowerFraction > 0 && lowerFraction < 1) {
    fractions.push(lowerFraction);
  }

  if (upperFraction > 0 && upperFraction < 1) {
    fractions.push(upperFraction);
  }

  fractions.sort((a, b) => a - b);

  const uniqueFractions: number[] = [];
  for (const fraction of fractions) {
    if (
      uniqueFractions.length === 0 ||
      Math.abs(fraction - uniqueFractions[uniqueFractions.length - 1]) > 1e-6
    ) {
      uniqueFractions.push(fraction);
    }
  }

  return uniqueFractions.map((fraction) => {
    const clampedFraction = clampValue(fraction, 0, 1);
    const x = clampedFraction * width;
    const value = defaultMin + clampedFraction * defaultRange;
    const normalized = clampValue((value - windowMin) / windowWidth, 0, 1);
    const y = (1 - normalized) * height;
    return { x, y };
  });
};

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
  channelId: string;
  baseLineWidth: number;
  targetLineWidth: number;
  outlineExtraWidth: number;
  targetOpacity: number;
  outlineBaseOpacity: number;
  isFollowed: boolean;
  isSelected: boolean;
  isHovered: boolean;
  shouldShow: boolean;
  needsAppearanceUpdate: boolean;
};

type VrUiTargetType =
  | 'playback-play-toggle'
  | 'playback-slider'
  | 'playback-fps-slider'
  | 'playback-reset-volume'
  | 'playback-reset-hud'
  | 'playback-exit-vr'
  | 'playback-toggle-mode'
  | 'playback-panel'
  | 'playback-panel-yaw'
  | 'playback-panel-pitch'
  | 'playback-panel-grab'
  | 'channels-panel'
  | 'channels-panel-grab'
  | 'channels-panel-yaw'
  | 'channels-panel-pitch'
  | 'channels-tab'
  | 'channels-visibility'
  | 'channels-reset'
  | 'channels-layer'
  | 'channels-slider'
  | 'channels-color'
  | 'channels-auto-contrast'
  | 'tracks-panel'
  | 'tracks-panel-grab'
  | 'tracks-panel-yaw'
  | 'tracks-panel-pitch'
  | 'tracks-tab'
  | 'tracks-stop-follow'
  | 'tracks-slider'
  | 'tracks-scroll'
  | 'tracks-color'
  | 'tracks-color-mode'
  | 'tracks-master-toggle'
  | 'tracks-toggle'
  | 'tracks-follow'
  | 'volume-translate-handle'
  | 'volume-scale-handle'
  | 'volume-yaw-handle'
  | 'volume-pitch-handle';

type VrUiTarget = { type: VrUiTargetType; object: THREE.Object3D; data?: unknown };

type VrPlaybackHud = {
  group: THREE.Group;
  panel: THREE.Mesh;
  panelTranslateHandle: THREE.Mesh;
  panelYawHandles: THREE.Mesh[];
  panelPitchHandle: THREE.Mesh;
  resetVolumeButton: THREE.Mesh;
  resetHudButton: THREE.Mesh;
  playButton: THREE.Mesh;
  playIcon: THREE.Object3D;
  pauseGroup: THREE.Object3D;
  exitButton: THREE.Mesh;
  exitIcon: THREE.Object3D;
  modeButton: THREE.Mesh;
  modeVrIcon: THREE.Object3D;
  modeArIcon: THREE.Object3D;
  playbackSliderGroup: THREE.Group;
  playbackSliderTrack: THREE.Mesh;
  playbackSliderFill: THREE.Mesh;
  playbackSliderKnob: THREE.Mesh;
  playbackSliderHitArea: THREE.Mesh;
  playbackSliderWidth: number;
  fpsSliderGroup: THREE.Group;
  fpsSliderTrack: THREE.Mesh;
  fpsSliderFill: THREE.Mesh;
  fpsSliderKnob: THREE.Mesh;
  fpsSliderHitArea: THREE.Mesh;
  fpsSliderWidth: number;
  labelMesh: THREE.Mesh;
  labelTexture: THREE.CanvasTexture;
  labelCanvas: HTMLCanvasElement | null;
  labelContext: CanvasRenderingContext2D | null;
  labelText: string;
  fpsLabelMesh: THREE.Mesh;
  fpsLabelTexture: THREE.CanvasTexture;
  fpsLabelCanvas: HTMLCanvasElement | null;
  fpsLabelContext: CanvasRenderingContext2D | null;
  fpsLabelText: string;
  interactables: THREE.Object3D[];
  resetVolumeButtonBaseColor: THREE.Color;
  resetHudButtonBaseColor: THREE.Color;
  playButtonBaseColor: THREE.Color;
  playbackSliderTrackBaseColor: THREE.Color;
  playbackSliderKnobBaseColor: THREE.Color;
  fpsSliderTrackBaseColor: THREE.Color;
  fpsSliderKnobBaseColor: THREE.Color;
  exitButtonBaseColor: THREE.Color;
  modeButtonBaseColor: THREE.Color;
  modeButtonActiveColor: THREE.Color;
  modeButtonDisabledColor: THREE.Color;
  hoverHighlightColor: THREE.Color;
  resetVolumeButtonRadius: number;
  resetHudButtonRadius: number;
  exitButtonRadius: number;
  modeButtonRadius: number;
  cachedPosition: THREE.Vector3;
  cachedYaw: number;
  cachedPitch: number;
  cacheDirty: boolean;
};

type VrChannelsSliderKey =
  | 'windowMin'
  | 'windowMax'
  | 'contrast'
  | 'brightness'
  | 'xOffset'
  | 'yOffset';

type VrChannelsSliderDefinition = {
  key: VrChannelsSliderKey;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  formatter: (value: number) => string;
  disabled: boolean;
  axis?: 'x' | 'y';
};

type VrChannelsInteractiveRegion = {
  targetType:
    | 'channels-tab'
    | 'channels-visibility'
    | 'channels-reset'
    | 'channels-layer'
    | 'channels-slider'
    | 'channels-color'
    | 'channels-render-style'
    | 'channels-sampling'
    | 'channels-invert'
    | 'channels-auto-contrast';
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
  background: THREE.Mesh;
  panel: THREE.Mesh;
  panelTranslateHandle: THREE.Mesh;
  panelYawHandles: THREE.Mesh[];
  panelPitchHandle: THREE.Mesh;
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
  cachedPosition: THREE.Vector3;
  cachedYaw: number;
  cachedPitch: number;
  cacheDirty: boolean;
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
        isSegmentation: boolean;
        defaultWindow: { windowMin: number; windowMax: number } | null;
        histogram: Uint32Array | null;
        settings: {
        sliderRange: number;
        minSliderIndex: number;
        maxSliderIndex: number;
        brightnessSliderIndex: number;
        contrastSliderIndex: number;
        windowMin: number;
        windowMax: number;
        color: string;
        xOffset: number;
        yOffset: number;
        renderStyle: 0 | 1;
        invert: boolean;
        samplingMode: 'linear' | 'nearest';
      };
    }>;
  }>;
  activeChannelId: string | null;
};

type VrTracksSliderKey = 'opacity' | 'lineWidth';

type VrTracksInteractiveRegion = {
  targetType:
    | 'tracks-tab'
    | 'tracks-stop-follow'
    | 'tracks-slider'
    | 'tracks-color'
    | 'tracks-color-mode'
    | 'tracks-master-toggle'
    | 'tracks-toggle'
    | 'tracks-follow';
  channelId: string;
  trackId?: string;
  sliderKey?: VrTracksSliderKey;
  color?: string;
  min?: number;
  max?: number;
  step?: number;
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  sliderTrack?: { minX: number; maxX: number; y: number };
  verticalSliderTrack?: {
    x: number;
    minY: number;
    maxY: number;
    inverted?: boolean;
    visibleRows?: number;
    totalRows?: number;
  };
  disabled?: boolean;
};

type VrTracksHud = {
  group: THREE.Group;
  panel: THREE.Mesh;
  panelTranslateHandle: THREE.Mesh;
  panelYawHandles: THREE.Mesh[];
  panelPitchHandle: THREE.Mesh;
  panelTexture: THREE.CanvasTexture;
  panelCanvas: HTMLCanvasElement | null;
  panelContext: CanvasRenderingContext2D | null;
  panelDisplayWidth: number;
  panelDisplayHeight: number;
  pixelRatio: number;
  interactables: THREE.Object3D[];
  regions: VrTracksInteractiveRegion[];
  width: number;
  height: number;
  hoverRegion: VrTracksInteractiveRegion | null;
  cachedPosition: THREE.Vector3;
  cachedYaw: number;
  cachedPitch: number;
  cacheDirty: boolean;
};

type VrTracksState = {
  channels: Array<{
    id: string;
    name: string;
    opacity: number;
    lineWidth: number;
    colorMode: TrackColorMode;
    totalTracks: number;
    visibleTracks: number;
    followedTrackId: string | null;
    scrollOffset: number;
    tracks: Array<{
      id: string;
      trackNumber: number;
      label: string;
      color: string;
      explicitVisible: boolean;
      visible: boolean;
      isFollowed: boolean;
      isSelected: boolean;
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
  touchIndicator: THREE.Mesh;
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
  hudGrabOffsets: { playback: THREE.Vector3 | null; channels: THREE.Vector3 | null; tracks: THREE.Vector3 | null };
  translateGrabOffset: THREE.Vector3 | null;
  scaleGrabOffset: THREE.Vector3 | null;
  volumeScaleState: VolumeScaleState | null;
  volumeRotationState:
    | {
        mode: 'yaw';
        initialYaw: number;
        initialAngle: number;
        basisForward: THREE.Vector3;
        basisRight: THREE.Vector3;
      }
    | {
        mode: 'pitch';
        initialPitch: number;
        initialAngle: number;
        basisForward: THREE.Vector3;
      }
    | null;
  hudRotationState:
    | {
        hud: 'playback' | 'channels' | 'tracks';
        mode: 'yaw';
        initialYaw: number;
        initialAngle: number;
        basisForward: THREE.Vector3;
        basisRight: THREE.Vector3;
      }
    | {
        hud: 'playback' | 'channels' | 'tracks';
        mode: 'pitch';
        initialPitch: number;
        initialAngle: number;
        basisForward: THREE.Vector3;
      }
    | null;
};

type VolumeScaleState = {
  baseLength: number;
  direction: THREE.Vector3;
};

type VrHudPlacement = { position: THREE.Vector3; yaw: number; pitch: number };

type WebXRFoveationManager = THREE.WebXRManager & {
  getFoveation?: () => number | undefined;
  setFoveation?: (value: number) => void;
};

const DEFAULT_TRACK_OPACITY = 0.9;
const DEFAULT_TRACK_LINE_WIDTH = 1;
const SELECTED_TRACK_BLINK_PERIOD_MS = 1600;
const SELECTED_TRACK_BLINK_BASE = 0.85;
const SELECTED_TRACK_BLINK_RANGE = 0.15;
const FOLLOWED_TRACK_LINE_WIDTH_MULTIPLIER = 1.35;
const SELECTED_TRACK_LINE_WIDTH_MULTIPLIER = 1.5;
const HOVERED_TRACK_LINE_WIDTH_MULTIPLIER = 1.2;

const VR_PLAYBACK_PANEL_WIDTH = 0.54;
const VR_PLAYBACK_PANEL_HEIGHT = 0.36;
const VR_PLAYBACK_MIN_FPS = 1;
const VR_PLAYBACK_MAX_FPS = 60;
const VR_PLAYBACK_VERTICAL_OFFSET = 0;
const VR_PLAYBACK_CAMERA_ANCHOR_OFFSET = new THREE.Vector3(0, -0.18, -0.65);
const VR_CHANNELS_PANEL_WIDTH = 0.6;
const VR_CHANNELS_PANEL_HEIGHT = 0.6;
const VR_CHANNELS_VERTICAL_OFFSET = 0;
const VR_CHANNELS_CAMERA_ANCHOR_OFFSET = new THREE.Vector3(0.4, -0.18, -0.65);
const VR_CHANNELS_CANVAS_WIDTH = 1184;
const VR_CHANNELS_CANVAS_MIN_HEIGHT = 1184;
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
const VR_TRACKS_PANEL_WIDTH = 0.58;
const VR_TRACKS_PANEL_HEIGHT = 0.64;
const VR_TRACKS_VERTICAL_OFFSET = -0.12;
const VR_TRACKS_CAMERA_ANCHOR_OFFSET = new THREE.Vector3(0.7, -0.22, -0.7);
const VR_TRACKS_CANVAS_WIDTH = 1180;
const VR_TRACKS_CANVAS_HEIGHT = 1320;
const VR_TRACKS_FONT_FAMILY = VR_CHANNELS_FONT_FAMILY;
const vrTracksFont = (weight: string, size: number) => `${weight} ${size}px ${VR_TRACKS_FONT_FAMILY}`;
const VR_TRACKS_FONT_SIZES = {
  heading: 52,
  emptyState: 32,
  tab: 32,
  body: 32,
  label: 30,
  value: 32,
  button: 30,
  track: 30,
  small: 26
} as const;
const VR_HUD_MIN_HEIGHT = 0;
const VR_HUD_FRONT_MARGIN = 0.24;
const VR_HUD_LATERAL_MARGIN = 0.1;
const VR_HUD_PLACEMENT_EPSILON = 1e-4;
const VR_VOLUME_BASE_OFFSET = new THREE.Vector3(0, 1.2, -0.3);
const VR_UI_TOUCH_DISTANCE = 0.08;
const VR_UI_TOUCH_SURFACE_MARGIN = 0.04;
const VR_CONTROLLER_TOUCH_RADIUS = 0.015;
const VR_TRANSLATION_HANDLE_RADIUS = 0.03;
const VR_SCALE_HANDLE_RADIUS = VR_TRANSLATION_HANDLE_RADIUS;
const VR_TRANSLATION_HANDLE_OFFSET = 0.04;
const VR_ROTATION_HANDLE_RADIUS = VR_TRANSLATION_HANDLE_RADIUS;
const VR_ROTATION_HANDLE_OFFSET = 0.03;
const VR_PITCH_HANDLE_FORWARD_OFFSET = VR_ROTATION_HANDLE_OFFSET;
const VR_SCALE_HANDLE_OFFSET = 0.04;
const VR_VOLUME_MIN_SCALE = 0.2;
const VR_VOLUME_MAX_SCALE = 5;
const DESKTOP_VOLUME_STEP_SCALE = 1;
const VR_VOLUME_STEP_SCALE = 1;
const VR_HUD_TRANSLATE_HANDLE_RADIUS = 0.018;
const VR_HUD_TRANSLATE_HANDLE_OFFSET = VR_HUD_TRANSLATE_HANDLE_RADIUS;
const VR_HUD_YAW_HANDLE_RADIUS = 0.016;
const VR_HUD_YAW_HANDLE_OFFSET = 0.03;
const VR_HUD_TRANSLATE_HANDLE_COLOR = 0x4d9dff;
const VR_HUD_YAW_HANDLE_COLOR = 0xffb347;
const VR_HUD_SURFACE_OFFSET = 0.0015;
const MAX_RENDERER_PIXEL_RATIO = 2;
const XR_TARGET_FOVEATION = 0.6;
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
  const referenceCamera = isPresenting ? (renderer?.xr.getCamera(camera) as THREE.Camera) : camera;
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

function setVrPlaybackProgressFraction(hud: VrPlaybackHud, fraction: number) {
  const clamped = Math.min(Math.max(fraction, 0), 1);
  const knobX = -hud.playbackSliderWidth / 2 + clamped * hud.playbackSliderWidth;
  hud.playbackSliderKnob.position.x = knobX;
  hud.playbackSliderFill.scale.x = Math.max(clamped, 0.0001);
  hud.playbackSliderFill.position.x =
    -hud.playbackSliderWidth / 2 + (hud.playbackSliderWidth * Math.max(clamped, 0.0001)) / 2;
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

function setVrPlaybackFpsFraction(hud: VrPlaybackHud, fraction: number) {
  const clamped = Math.min(Math.max(fraction, 0), 1);
  const knobX = -hud.fpsSliderWidth / 2 + clamped * hud.fpsSliderWidth;
  hud.fpsSliderKnob.position.x = knobX;
  hud.fpsSliderFill.scale.x = Math.max(clamped, 0.0001);
  hud.fpsSliderFill.position.x =
    -hud.fpsSliderWidth / 2 + (hud.fpsSliderWidth * Math.max(clamped, 0.0001)) / 2;
}

function setVrPlaybackFpsLabel(hud: VrPlaybackHud, text: string) {
  if (!hud.fpsLabelCanvas || !hud.fpsLabelContext) {
    hud.fpsLabelText = text;
    return;
  }
  if (hud.fpsLabelText === text) {
    return;
  }
  hud.fpsLabelText = text;
  const ctx = hud.fpsLabelContext;
  const width = hud.fpsLabelCanvas.width;
  const height = hud.fpsLabelCanvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = 'rgba(0, 0, 0, 0)';
  ctx.fillRect(0, 0, width, height);
  ctx.font = '500 32px "Inter", "Helvetica Neue", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, width / 2, height / 2 + 4);
  hud.fpsLabelTexture.needsUpdate = true;
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
          target.type === 'playback-reset-volume' ||
          target.type === 'playback-reset-hud' ||
          target.type === 'playback-exit-vr' ||
          target.type === 'playback-panel' ||
          target.type === 'playback-panel-grab' ||
          target.type === 'playback-panel-yaw' ||
          target.type === 'playback-panel-pitch' ||
          target.type === 'channels-panel' ||
          target.type === 'channels-panel-grab' ||
          target.type === 'channels-panel-yaw' ||
          target.type === 'channels-panel-pitch' ||
          target.type === 'channels-tab' ||
          target.type === 'channels-visibility' ||
          target.type === 'channels-reset' ||
          target.type === 'channels-layer' ||
          target.type === 'channels-slider' ||
          target.type === 'channels-color' ||
          target.type === 'tracks-panel' ||
          target.type === 'tracks-panel-grab' ||
          target.type === 'tracks-panel-yaw' ||
          target.type === 'tracks-panel-pitch' ||
          target.type === 'tracks-tab' ||
          target.type === 'tracks-stop-follow' ||
          target.type === 'tracks-slider' ||
          target.type === 'tracks-color' ||
          target.type === 'tracks-color-mode' ||
          target.type === 'tracks-master-toggle' ||
          target.type === 'tracks-toggle' ||
          target.type === 'tracks-follow' ||
          target.type === 'volume-yaw-handle' ||
          target.type === 'volume-pitch-handle')
      ) {
        return { type: target.type, object: current, data: target.data };
      }
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
  isVrPassthroughSupported,
  tracks,
  trackChannels,
  trackVisibility,
  trackOpacityByChannel,
  trackLineWidthByChannel,
  channelTrackColorModes,
  channelTrackOffsets,
  selectedTrackIds,
  activeTrackChannelId,
  onTrackChannelSelect,
  onTrackVisibilityToggle,
  onTrackVisibilityAllChange,
  onTrackOpacityChange,
  onTrackLineWidthChange,
  onTrackColorSelect,
  onTrackColorReset,
  onStopTrackFollow,
  channelPanels,
  activeChannelPanelId,
  onChannelPanelSelect,
  onChannelVisibilityToggle,
  onChannelReset,
  onChannelLayerSelect,
  onLayerContrastChange,
  onLayerBrightnessChange,
  onLayerWindowMinChange,
  onLayerWindowMaxChange,
  onLayerAutoContrast,
  onLayerOffsetChange,
  onLayerColorChange,
  onLayerRenderStyleToggle,
  onLayerSamplingModeToggle,
  onLayerInvertToggle,
  followedTrackId,
  onTrackSelectionToggle,
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
  const {
    resourcesRef,
    currentDimensionsRef,
    upsertLayer: upsertVolumeLayer,
    removeLayer: removeVolumeLayer,
    removeAllLayers: removeAllVolumeLayers,
    clearColormap
  } = useVolumeTextures({
    scene: sceneRef.current,
    volumeRoot: volumeRootGroupRef.current,
    volumeStepScaleRef
  });
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
  const hasActive3DLayerRef = useRef(false);
  const vrTranslationHandleRef = useRef<THREE.Mesh | null>(null);
  const vrVolumeScaleHandleRef = useRef<THREE.Mesh | null>(null);
  const vrVolumeYawHandlesRef = useRef<THREE.Mesh[]>([]);
  const vrVolumePitchHandleRef = useRef<THREE.Mesh | null>(null);
  const vrHandleLocalPointRef = useRef(new THREE.Vector3());
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
  const vrTracksHudRef = useRef<VrTracksHud | null>(null);
  const vrPlaybackHudPlacementRef = useRef<VrHudPlacement | null>(null);
  const vrChannelsHudPlacementRef = useRef<VrHudPlacement | null>(null);
  const vrTracksHudPlacementRef = useRef<VrHudPlacement | null>(null);
  const vrHudPlaneRef = useRef(new THREE.Plane());
  const vrHudPlanePointRef = useRef(new THREE.Vector3());
  const vrPlaybackHudDragTargetRef = useRef(new THREE.Vector3());
  const vrChannelsHudDragTargetRef = useRef(new THREE.Vector3());
  const vrTracksHudDragTargetRef = useRef(new THREE.Vector3());
  const vrHudOffsetTempRef = useRef(new THREE.Vector3());
  const vrHudIntersectionRef = useRef(new THREE.Vector3());
  const vrChannelsLocalPointRef = useRef(new THREE.Vector3());
  const vrTracksLocalPointRef = useRef(new THREE.Vector3());
  const vrHudForwardRef = useRef(new THREE.Vector3(0, 0, 1));
  const vrHudYawEulerRef = useRef(new THREE.Euler(0, 0, 0, 'YXZ'));
  const vrHudYawQuaternionRef = useRef(new THREE.Quaternion());
  const vrHudYawVectorRef = useRef(new THREE.Vector3());
  const vrHudPitchVectorRef = useRef(new THREE.Vector3());
  const vrHandleWorldPointRef = useRef(new THREE.Vector3());
  const vrHandleSecondaryPointRef = useRef(new THREE.Vector3());
  const vrHandleQuaternionTempRef = useRef(new THREE.Quaternion());
  const vrHandleQuaternionTemp2Ref = useRef(new THREE.Quaternion());
  const xrPreferredSessionModeRef = useRef<'immersive-vr' | 'immersive-ar'>('immersive-vr');
  const xrCurrentSessionModeRef = useRef<'immersive-vr' | 'immersive-ar' | null>(null);
  const xrPendingModeSwitchRef = useRef<'immersive-vr' | 'immersive-ar' | null>(null);
  const xrPassthroughSupportedRef = useRef(isVrPassthroughSupported);
  const xrFoveationAppliedRef = useRef(false);
  const xrPreviousFoveationRef = useRef<number | undefined>(undefined);
  const playbackStateRef = useRef({
    isPlaying,
    playbackDisabled,
    playbackLabel,
    fps,
    timeIndex,
    totalTimepoints,
    onTogglePlayback,
    onTimeIndexChange,
    onFpsChange,
    passthroughSupported: isVrPassthroughSupported,
    preferredSessionMode: 'immersive-vr',
    currentSessionMode: null
  });
  const playbackLoopRef = useRef<{ lastTimestamp: number | null; accumulator: number }>(
    {
      lastTimestamp: null,
      accumulator: 0
    }
  );
  const vrHoverStateRef = useRef({
    play: false,
    playbackSlider: false,
    playbackSliderActive: false,
    fpsSlider: false,
    fpsSliderActive: false,
    resetVolume: false,
    resetHud: false,
    exit: false,
    mode: false
  });
  const vrChannelsStateRef = useRef<VrChannelsState>({ channels: [], activeChannelId: null });
  const vrTracksStateRef = useRef<VrTracksState>({ channels: [], activeChannelId: null });
  const sliderLocalPointRef = useRef(new THREE.Vector3());

  const updateVolumeHandles = useCallback(() => {
    const translationHandle = vrTranslationHandleRef.current;
    const scaleHandle = vrVolumeScaleHandleRef.current;
    const yawHandles = vrVolumeYawHandlesRef.current;
    const pitchHandle = vrVolumePitchHandleRef.current;
    if (!translationHandle && !scaleHandle && yawHandles.length === 0 && !pitchHandle) {
      return;
    }

    const renderer = rendererRef.current;
    const volumeRootGroup = volumeRootGroupRef.current;
    const dimensions = currentDimensionsRef.current;
    const has3D = hasActive3DLayerRef.current;
    const presenting = renderer?.xr?.isPresenting ?? false;

    const hideHandles = () => {
      if (translationHandle) {
        translationHandle.visible = false;
      }
      if (scaleHandle) {
        scaleHandle.visible = false;
      }
      yawHandles.forEach((handle) => {
        handle.visible = false;
      });
      if (pitchHandle) {
        pitchHandle.visible = false;
      }
    };

    if (!presenting || !has3D || !dimensions || !volumeRootGroup || dimensions.depth <= 1) {
      hideHandles();
      return;
    }

    const { width, height, depth } = dimensions;
    const maxDimension = Math.max(width, height, depth);
    if (!Number.isFinite(maxDimension) || maxDimension <= 0) {
      hideHandles();
      return;
    }

    const scale = 1 / maxDimension;
    const userScale = volumeUserScaleRef.current;
    const totalScale = scale * userScale;
    const safeScale = totalScale > 1e-6 ? totalScale : 1e-6;
    const centerUnscaled = volumeRootCenterUnscaledRef.current;
    const halfExtents = volumeRootHalfExtentsRef.current;
    const translationLocal = vrHandleLocalPointRef.current;

    translationLocal.set(
      centerUnscaled.x,
      centerUnscaled.y + (halfExtents.y + VR_TRANSLATION_HANDLE_OFFSET) / scale,
      centerUnscaled.z
    );
    if (translationHandle) {
      translationHandle.position.copy(translationLocal);
      translationHandle.scale.setScalar(VR_TRANSLATION_HANDLE_RADIUS / safeScale);
      translationHandle.visible = true;
    }

    const lateralOffset = (halfExtents.x + VR_ROTATION_HANDLE_OFFSET) / scale;
    const verticalOffset = -(halfExtents.y + VR_ROTATION_HANDLE_OFFSET) / scale;
    const forwardOffset = (halfExtents.z + VR_PITCH_HANDLE_FORWARD_OFFSET) / scale;
    const handleScale = VR_ROTATION_HANDLE_RADIUS / safeScale;

    yawHandles.forEach((handle, index) => {
      if (!handle) {
        return;
      }
      const direction = index === 0 ? 1 : -1;
      handle.position.set(
        centerUnscaled.x + direction * lateralOffset,
        centerUnscaled.y,
        centerUnscaled.z
      );
      handle.scale.setScalar(handleScale);
      handle.visible = true;
    });

    if (pitchHandle) {
      pitchHandle.position.set(
        centerUnscaled.x,
        centerUnscaled.y + verticalOffset,
        centerUnscaled.z - forwardOffset
      );
      pitchHandle.scale.setScalar(handleScale);
      pitchHandle.visible = true;
    }

    if (scaleHandle) {
      scaleHandle.position.set(
        centerUnscaled.x + (halfExtents.x + VR_SCALE_HANDLE_OFFSET) / scale,
        centerUnscaled.y + (halfExtents.y + VR_SCALE_HANDLE_OFFSET) / scale,
        centerUnscaled.z
      );
      scaleHandle.scale.setScalar(VR_SCALE_HANDLE_RADIUS / safeScale);
      scaleHandle.visible = true;
    }
  }, [
    currentDimensionsRef,
    hasActive3DLayerRef,
    rendererRef,
    vrHandleLocalPointRef,
    vrVolumeScaleHandleRef,
    vrTranslationHandleRef,
    vrVolumePitchHandleRef,
    vrVolumeYawHandlesRef,
    volumeRootCenterUnscaledRef,
    volumeRootGroupRef,
    volumeRootHalfExtentsRef
  ]);

  const applyVolumeStepScaleToResources = useCallback(
    (stepScale: number) => {
      volumeStepScaleRef.current = stepScale;
      for (const resource of resourcesRef.current.values()) {
        resource.rayMarchMaterial?.setStepScale(stepScale);
      }
    },
    [resourcesRef, volumeStepScaleRef]
  );

  const applyVolumeYawPitch = useCallback(
    (yaw: number, pitch: number) => {
      const volumeRootGroup = volumeRootGroupRef.current;
      if (!volumeRootGroup) {
        return;
      }
      volumeYawRef.current = yaw;
      volumePitchRef.current = pitch;
      const euler = vrHudYawEulerRef.current;
      const quaternion = vrHandleQuaternionTempRef.current;
      euler.set(pitch, yaw, 0, 'YXZ');
      quaternion.setFromEuler(euler);
      volumeRootGroup.quaternion.copy(quaternion);
      const baseOffset = volumeRootBaseOffsetRef.current;
      const centerOffset = volumeRootCenterOffsetRef.current;
      const rotatedCenter = volumeRootRotatedCenterTempRef.current;
      const userScale = volumeUserScaleRef.current;
      rotatedCenter
        .copy(centerOffset)
        .multiplyScalar(userScale)
        .applyQuaternion(volumeRootGroup.quaternion);
      volumeRootGroup.position.set(
        baseOffset.x - rotatedCenter.x,
        baseOffset.y - rotatedCenter.y,
        baseOffset.z - rotatedCenter.z
      );
      volumeRootGroup.updateMatrixWorld(true);
      updateVolumeHandles();
    },
    [updateVolumeHandles]
  );

  const constrainHudPlacementPosition = useCallback((target: THREE.Vector3) => {
    target.y = Math.max(target.y, VR_HUD_MIN_HEIGHT);
  }, []);

  const renderVrTracksHud = useCallback((hud: VrTracksHud, state: VrTracksState) => {
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
    ctx.fillStyle = 'rgba(16, 22, 29, 1)';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    const toPanelX = (x: number) => (x / canvasWidth - 0.5) * hud.width;
    const toPanelY = (y: number) => (0.5 - y / canvasHeight) * hud.height;
    const regions: VrTracksInteractiveRegion[] = [];

    const paddingX = 72;
    const paddingTop = 48;

    ctx.save();
    ctx.fillStyle = '#dce7f7';
    ctx.font = vrTracksFont('600', VR_TRACKS_FONT_SIZES.heading);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
    ctx.shadowBlur = 18;
    ctx.fillText('Tracks', paddingX, paddingTop);
    ctx.restore();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    let currentY = paddingTop + 84;

    const channels = state.channels ?? [];
    if (channels.length === 0) {
      ctx.fillStyle = '#9fb2c8';
      ctx.font = vrTracksFont('500', VR_TRACKS_FONT_SIZES.emptyState);
      ctx.fillText('Add a channel to manage tracks.', paddingX, currentY + 20);
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
    const tabSpacingX = 18;
    const tabSpacingY = 18;
    const minTabWidth = 160;
    const maxTabWidth = 260;
    let columns = Math.min(3, channels.length);
    while (columns > 1) {
      const candidateWidth = (tabAreaWidth - (columns - 1) * tabSpacingX) / columns;
      if (candidateWidth >= minTabWidth) {
        break;
      }
      columns -= 1;
    }
    columns = Math.max(1, columns);
    const tabWidth = Math.max(
      minTabWidth,
      Math.min(maxTabWidth, (tabAreaWidth - (columns - 1) * tabSpacingX) / columns)
    );
    const tabHeight = 82;
    const totalRows = Math.ceil(channels.length / columns);

    ctx.font = vrTracksFont('600', VR_TRACKS_FONT_SIZES.tab);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let index = 0; index < channels.length; index += 1) {
      const channel = channels[index];
      const rowIndex = Math.floor(index / columns);
      const rowStartIndex = rowIndex * columns;
      const itemsInRow = Math.min(columns, channels.length - rowStartIndex);
      const rowWidth = itemsInRow * tabWidth + Math.max(0, itemsInRow - 1) * tabSpacingX;
      const rowStartX = paddingX + Math.max(0, (tabAreaWidth - rowWidth) / 2);
      const columnIndex = index - rowStartIndex;
      const x = rowStartX + columnIndex * (tabWidth + tabSpacingX);
      const y = currentY + rowIndex * (tabHeight + tabSpacingY);
      const isActive = channel.id === activeChannelId;
      const hasTracks = channel.totalTracks > 0;

      drawRoundedRect(ctx, x, y, tabWidth, tabHeight, 20);
      ctx.fillStyle = hasTracks ? (isActive ? '#2b5fa6' : '#1d2734') : '#1a202b';
      ctx.fill();
      if (hud.hoverRegion && hud.hoverRegion.targetType === 'tracks-tab' && hud.hoverRegion.channelId === channel.id) {
        ctx.save();
        drawRoundedRect(ctx, x, y, tabWidth, tabHeight, 20);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
        ctx.fill();
        ctx.restore();
      }
      ctx.save();
      ctx.beginPath();
      ctx.rect(x + 12, y + 12, tabWidth - 24, tabHeight - 24);
      ctx.clip();
      ctx.fillStyle = '#f3f6fc';
      ctx.fillText(channel.name, x + tabWidth / 2, y + tabHeight / 2);
      ctx.restore();

      const rectBounds = {
        minX: toPanelX(x),
        maxX: toPanelX(x + tabWidth),
        minY: Math.min(toPanelY(y), toPanelY(y + tabHeight)),
        maxY: Math.max(toPanelY(y), toPanelY(y + tabHeight))
      };
      regions.push({ targetType: 'tracks-tab', channelId: channel.id, bounds: rectBounds });
    }

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const totalTabHeight = totalRows * tabHeight + Math.max(0, totalRows - 1) * tabSpacingY;
    currentY += totalTabHeight + 36;

    ctx.fillStyle = '#9fb2c8';
    ctx.font = vrTracksFont('500', VR_TRACKS_FONT_SIZES.body);
    ctx.fillText(
      `Visible ${Math.min(activeChannel.visibleTracks, activeChannel.totalTracks)} / ${activeChannel.totalTracks} tracks`,
      paddingX,
      currentY
    );
    currentY += 42;

    const stopWidth = 220;
    const stopHeight = 56;
    const stopX = paddingX;
    const stopY = currentY;
    const stopDisabled = !activeChannel.followedTrackId;
    drawRoundedRect(ctx, stopX, stopY, stopWidth, stopHeight, 16);
    ctx.fillStyle = stopDisabled ? 'rgba(45, 60, 74, 0.6)' : '#2b3340';
    if (!stopDisabled && activeChannel.followedTrackId) {
      ctx.fillStyle = '#2b5fa6';
    }
    ctx.fill();
    if (
      hud.hoverRegion &&
      hud.hoverRegion.targetType === 'tracks-stop-follow' &&
      hud.hoverRegion.channelId === activeChannel.id
    ) {
      ctx.save();
      drawRoundedRect(ctx, stopX, stopY, stopWidth, stopHeight, 16);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = stopDisabled ? '#7b8795' : '#f3f6fc';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = vrTracksFont('600', VR_TRACKS_FONT_SIZES.button);
    ctx.fillText('Stop following', stopX + stopWidth / 2, stopY + stopHeight / 2);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    const stopBounds = {
      minX: toPanelX(stopX),
      maxX: toPanelX(stopX + stopWidth),
      minY: Math.min(toPanelY(stopY), toPanelY(stopY + stopHeight)),
      maxY: Math.max(toPanelY(stopY), toPanelY(stopY + stopHeight))
    };
    regions.push({
      targetType: 'tracks-stop-follow',
      channelId: activeChannel.id,
      bounds: stopBounds,
      disabled: stopDisabled
    });

    currentY += stopHeight + 32;

    const drawTrackSlider = (
      label: string,
      valueLabel: string,
      sliderKey: VrTracksSliderKey,
      value: number,
      min: number,
      max: number,
      step: number
    ) => {
      ctx.fillStyle = '#9fb2c8';
      ctx.font = vrTracksFont('500', VR_TRACKS_FONT_SIZES.label);
      ctx.fillText(label, paddingX, currentY);
      ctx.fillStyle = '#dce3f1';
      ctx.font = vrTracksFont('600', VR_TRACKS_FONT_SIZES.value);
      ctx.fillText(valueLabel, paddingX + 240, currentY);
      ctx.font = vrTracksFont('500', VR_TRACKS_FONT_SIZES.body);

      const sliderX = paddingX;
      const sliderY = currentY + 34;
      const sliderWidth = canvasWidth - paddingX * 2;
      const sliderHeight = 26;
      const sliderRadius = 14;
      const disabled = activeChannel.totalTracks === 0;

      drawRoundedRect(ctx, sliderX, sliderY, sliderWidth, sliderHeight, sliderRadius);
      ctx.fillStyle = disabled ? 'rgba(45, 60, 74, 0.6)' : '#1f2733';
      ctx.fill();

      const ratio = Math.min(Math.max((value - min) / Math.max(max - min, 1e-5), 0), 1);
      const knobX = sliderX + ratio * sliderWidth;
      const knobY = sliderY + sliderHeight / 2;
      ctx.beginPath();
      ctx.arc(knobX, knobY, 18, 0, Math.PI * 2);
      ctx.fillStyle = disabled ? '#45515f' : '#f3f6fc';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = disabled ? 'rgba(0, 0, 0, 0.45)' : 'rgba(0, 0, 0, 0.3)';
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(knobX, knobY, 10, 0, Math.PI * 2);
      ctx.fillStyle = disabled ? '#2a313c' : '#2b5fa6';
      ctx.fill();

      const isHovered =
        hud.hoverRegion &&
        hud.hoverRegion.targetType === 'tracks-slider' &&
        hud.hoverRegion.channelId === activeChannel.id &&
        hud.hoverRegion.sliderKey === sliderKey;
      if (isHovered) {
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
        targetType: 'tracks-slider',
        channelId: activeChannel.id,
        sliderKey,
        min,
        max,
        step,
        bounds: sliderBounds,
        sliderTrack: {
          minX: toPanelX(sliderX),
          maxX: toPanelX(sliderX + sliderWidth),
          y: toPanelY(sliderY + sliderHeight / 2)
        },
        disabled
      });

      currentY += sliderHeight + 56;
    };

    drawTrackSlider('Opacity', `${Math.round(activeChannel.opacity * 100)}%`, 'opacity', activeChannel.opacity, 0, 1, 0.05);
    drawTrackSlider(
      'Thickness',
      `${activeChannel.lineWidth.toFixed(1)}`,
      'lineWidth',
      activeChannel.lineWidth,
      0.5,
      5,
      0.1
    );

    ctx.fillStyle = '#9fb2c8';
    ctx.font = vrTracksFont('500', VR_TRACKS_FONT_SIZES.body);
    ctx.fillText('Preset colors', paddingX, currentY);
    const colorLabel =
      activeChannel.colorMode.type === 'uniform'
        ? normalizeTrackColor(activeChannel.colorMode.color, DEFAULT_TRACK_COLOR)
        : 'Sorted';
    ctx.fillStyle = '#dce3f1';
    ctx.font = vrTracksFont('600', VR_TRACKS_FONT_SIZES.value);
    ctx.fillText(colorLabel, paddingX + 260, currentY);
    ctx.font = vrTracksFont('500', VR_TRACKS_FONT_SIZES.body);
    currentY += 40;

    const swatchSize = 54;
    const swatchSpacing = 20;
    let swatchX = paddingX;
    const swatchY = currentY;
    const uniformColor =
      activeChannel.colorMode.type === 'uniform'
        ? normalizeTrackColor(activeChannel.colorMode.color, DEFAULT_TRACK_COLOR)
        : null;

    for (const swatch of TRACK_COLOR_SWATCHES) {
      const normalized = normalizeTrackColor(swatch.value, DEFAULT_TRACK_COLOR);
      const isSelected = uniformColor === normalized;
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(swatchX, swatchY, swatchSize, swatchSize, 14);
      } else {
        drawRoundedRect(ctx, swatchX, swatchY, swatchSize, swatchSize, 14);
      }
      ctx.fillStyle = normalized;
      ctx.fill();
      ctx.lineWidth = isSelected ? 4 : 2;
      ctx.strokeStyle = isSelected ? '#ffffff' : 'rgba(255, 255, 255, 0.45)';
      ctx.stroke();
      const isHovered =
        hud.hoverRegion &&
        hud.hoverRegion.targetType === 'tracks-color' &&
        hud.hoverRegion.channelId === activeChannel.id &&
        hud.hoverRegion.color === normalized;
      if (isHovered) {
        ctx.save();
        if (ctx.roundRect) {
          ctx.roundRect(swatchX, swatchY, swatchSize, swatchSize, 14);
        } else {
          drawRoundedRect(ctx, swatchX, swatchY, swatchSize, swatchSize, 14);
        }
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
        targetType: 'tracks-color',
        channelId: activeChannel.id,
        color: normalized,
        bounds: colorBounds,
        disabled: activeChannel.totalTracks === 0
      });

      swatchX += swatchSize + swatchSpacing;
    }

    const modeWidth = 120;
    const modeHeight = swatchSize;
    const modeX = canvasWidth - paddingX - modeWidth;
    const modeY = swatchY;
    const isSortedMode = activeChannel.colorMode.type === 'random';
    drawRoundedRect(ctx, modeX, modeY, modeWidth, modeHeight, 16);
    ctx.fillStyle = isSortedMode ? '#2b5fa6' : '#1f2735';
    if (activeChannel.totalTracks === 0) {
      ctx.fillStyle = 'rgba(45, 60, 74, 0.6)';
    }
    ctx.fill();
    if (
      hud.hoverRegion &&
      hud.hoverRegion.targetType === 'tracks-color-mode' &&
      hud.hoverRegion.channelId === activeChannel.id
    ) {
      ctx.save();
      drawRoundedRect(ctx, modeX, modeY, modeWidth, modeHeight, 16);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = activeChannel.totalTracks === 0 ? '#7b8795' : '#f3f6fc';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = vrTracksFont('600', VR_TRACKS_FONT_SIZES.button);
    ctx.fillText('Sorted', modeX + modeWidth / 2, modeY + modeHeight / 2);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    const modeBounds = {
      minX: toPanelX(modeX),
      maxX: toPanelX(modeX + modeWidth),
      minY: Math.min(toPanelY(modeY), toPanelY(modeY + modeHeight)),
      maxY: Math.max(toPanelY(modeY), toPanelY(modeY + modeHeight))
    };
    regions.push({
      targetType: 'tracks-color-mode',
      channelId: activeChannel.id,
      bounds: modeBounds,
      disabled: activeChannel.totalTracks === 0
    });

    currentY += swatchSize + 36;

    const masterWidth = canvasWidth - paddingX * 2;
    const masterHeight = 54;
    const masterX = paddingX;
    const masterY = currentY;
    const allVisible =
      activeChannel.totalTracks > 0 && activeChannel.visibleTracks === activeChannel.totalTracks;
    const someVisible =
      activeChannel.totalTracks > 0 &&
      activeChannel.visibleTracks > 0 &&
      activeChannel.visibleTracks < activeChannel.totalTracks;
    drawRoundedRect(ctx, masterX, masterY, masterWidth, masterHeight, 16);
    ctx.fillStyle = activeChannel.totalTracks === 0 ? 'rgba(45, 60, 74, 0.6)' : '#1f2735';
    ctx.fill();
    if (
      hud.hoverRegion &&
      hud.hoverRegion.targetType === 'tracks-master-toggle' &&
      hud.hoverRegion.channelId === activeChannel.id
    ) {
      ctx.save();
      drawRoundedRect(ctx, masterX, masterY, masterWidth, masterHeight, 16);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
      ctx.fill();
      ctx.restore();
    }
    const boxSize = 36;
    const boxX = masterX + 18;
    const boxY = masterY + (masterHeight - boxSize) / 2;
    drawRoundedRect(ctx, boxX, boxY, boxSize, boxSize, 10);
    ctx.fillStyle = allVisible ? '#2b5fa6' : '#2a313c';
    if (activeChannel.totalTracks === 0) {
      ctx.fillStyle = 'rgba(53, 64, 78, 0.8)';
    }
    ctx.fill();
    if (allVisible || someVisible) {
      ctx.strokeStyle = '#f3f6fc';
      ctx.lineWidth = 4;
      if (someVisible && !allVisible) {
        ctx.beginPath();
        ctx.moveTo(boxX + 8, boxY + boxSize / 2);
        ctx.lineTo(boxX + boxSize - 8, boxY + boxSize / 2);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(boxX + 9, boxY + boxSize / 2);
        ctx.lineTo(boxX + boxSize / 2 - 2, boxY + boxSize - 9);
        ctx.lineTo(boxX + boxSize - 9, boxY + 9);
        ctx.stroke();
      }
    }
    ctx.fillStyle = activeChannel.totalTracks === 0 ? '#7b8795' : '#dce3f1';
    ctx.font = vrTracksFont('600', VR_TRACKS_FONT_SIZES.body);
    ctx.fillText('Show all tracks', boxX + boxSize + 18, masterY + (masterHeight - 32) / 2);

    const masterBounds = {
      minX: toPanelX(masterX),
      maxX: toPanelX(masterX + masterWidth),
      minY: Math.min(toPanelY(masterY), toPanelY(masterY + masterHeight)),
      maxY: Math.max(toPanelY(masterY), toPanelY(masterY + masterHeight))
    };
    regions.push({
      targetType: 'tracks-master-toggle',
      channelId: activeChannel.id,
      bounds: masterBounds,
      disabled: activeChannel.totalTracks === 0
    });

    currentY += masterHeight + 32;

    if (activeChannel.totalTracks === 0) {
      ctx.fillStyle = '#9fb2c8';
      ctx.font = vrTracksFont('500', VR_TRACKS_FONT_SIZES.emptyState);
      ctx.fillText('Load a tracks file to toggle individual trajectories.', paddingX, currentY + 12);
    } else {
      const listTop = currentY;
      const listPaddingBottom = 64;
      const availableHeight = Math.max(canvasHeight - listPaddingBottom - listTop, 120);
      const rowHeight = 68;
      const totalTracks = activeChannel.tracks.length;
      const visibleRows = Math.max(1, Math.floor(availableHeight / rowHeight));
      const maxScrollIndex = Math.max(totalTracks - visibleRows, 0);
      const clampedScrollOffset = Math.min(Math.max(activeChannel.scrollOffset ?? 0, 0), 1);
      const startIndex = Math.min(
        Math.floor(clampedScrollOffset * maxScrollIndex + 1e-6),
        maxScrollIndex
      );
      const endIndex = Math.min(startIndex + visibleRows, totalTracks);
      const rowsToRender = Math.max(0, endIndex - startIndex);
      const trackAreaWidth = canvasWidth - paddingX * 2;
      const scrollBarWidth = 26;
      const scrollBarSpacing = 18;
      const needsScroll = totalTracks > visibleRows;
      const trackContentWidth = needsScroll ? trackAreaWidth - scrollBarWidth - scrollBarSpacing : trackAreaWidth;

      for (let index = 0; index < rowsToRender; index += 1) {
        const track = activeChannel.tracks[startIndex + index];
        if (!track) {
          continue;
        }
        const rowY = listTop + index * rowHeight;
        const rowRadius = 16;
        drawRoundedRect(ctx, paddingX, rowY, trackContentWidth, rowHeight - 8, rowRadius);
        const isHoveredRow =
          hud.hoverRegion &&
          (hud.hoverRegion.targetType === 'tracks-toggle' || hud.hoverRegion.targetType === 'tracks-follow') &&
          hud.hoverRegion.channelId === activeChannel.id &&
          hud.hoverRegion.trackId === track.id;
        ctx.fillStyle = track.isFollowed ? '#2b3340' : '#1d2734';
        if (isHoveredRow) {
          ctx.fillStyle = '#334157';
        }
        ctx.fill();

        const toggleBoxSize = 34;
        const toggleBoxX = paddingX + 18;
        const toggleBoxY = rowY + (rowHeight - 8 - toggleBoxSize) / 2;
        drawRoundedRect(ctx, toggleBoxX, toggleBoxY, toggleBoxSize, toggleBoxSize, 10);
        ctx.fillStyle = track.visible ? '#2b5fa6' : '#2a313c';
        ctx.fill();
        if (track.visible) {
          ctx.strokeStyle = '#f3f6fc';
          ctx.lineWidth = 3.5;
          ctx.beginPath();
          ctx.moveTo(toggleBoxX + 8, toggleBoxY + toggleBoxSize / 2);
          ctx.lineTo(toggleBoxX + toggleBoxSize / 2 - 3, toggleBoxY + toggleBoxSize - 9);
          ctx.lineTo(toggleBoxX + toggleBoxSize - 7, toggleBoxY + 10);
          ctx.stroke();
        }
        const toggleBounds = {
          minX: toPanelX(toggleBoxX),
          maxX: toPanelX(toggleBoxX + toggleBoxSize),
          minY: Math.min(toPanelY(toggleBoxY), toPanelY(toggleBoxY + toggleBoxSize)),
          maxY: Math.max(toPanelY(toggleBoxY), toPanelY(toggleBoxY + toggleBoxSize))
        };
        regions.push({
          targetType: 'tracks-toggle',
          channelId: activeChannel.id,
          trackId: track.id,
          bounds: toggleBounds,
          disabled: false
        });

        const swatchRadius = 10;
        const swatchCenterX = toggleBoxX + toggleBoxSize + 26;
        const swatchCenterY = toggleBoxY + toggleBoxSize / 2;
        ctx.beginPath();
        ctx.arc(swatchCenterX, swatchCenterY, swatchRadius, 0, Math.PI * 2);
        ctx.fillStyle = track.color;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#0b0f14';
        ctx.stroke();

        ctx.fillStyle = track.isFollowed ? '#f6fbff' : '#dce3f1';
        ctx.font = vrTracksFont('600', VR_TRACKS_FONT_SIZES.track);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(track.label, swatchCenterX + 18, swatchCenterY);

        const followWidth = 140;
        const followHeight = rowHeight - 20;
        const followX = paddingX + trackContentWidth - followWidth - 18;
        const followY = rowY + (rowHeight - 8 - followHeight) / 2;
        drawRoundedRect(ctx, followX, followY, followWidth, followHeight, 14);
        ctx.fillStyle = track.isFollowed ? '#2b5fa6' : '#2b3340';
        if (isHoveredRow && hud.hoverRegion?.targetType === 'tracks-follow') {
          ctx.fillStyle = '#336cd1';
        }
        ctx.fill();
        ctx.fillStyle = '#f3f6fc';
        ctx.font = vrTracksFont('600', VR_TRACKS_FONT_SIZES.button);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(track.isFollowed ? 'Following' : 'Follow', followX + followWidth / 2, followY + followHeight / 2);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';

        const followBounds = {
          minX: toPanelX(followX),
          maxX: toPanelX(followX + followWidth),
          minY: Math.min(toPanelY(followY), toPanelY(followY + followHeight)),
          maxY: Math.max(toPanelY(followY), toPanelY(followY + followHeight))
        };
        regions.push({
          targetType: 'tracks-follow',
          channelId: activeChannel.id,
          trackId: track.id,
          bounds: followBounds,
          disabled: false
        });
      }

      if (needsScroll && rowsToRender > 0) {
        const scrollTrackTop = listTop;
        const scrollTrackHeight = Math.max(rowHeight * visibleRows - 8, rowHeight - 8);
        const scrollTrackX = paddingX + trackContentWidth + scrollBarSpacing;
        const scrollRadius = scrollBarWidth / 2;
        drawRoundedRect(ctx, scrollTrackX, scrollTrackTop, scrollBarWidth, scrollTrackHeight, scrollRadius);
        ctx.fillStyle = '#141b25';
        ctx.fill();

        const handleRatio = Math.min(Math.max(clampedScrollOffset, 0), 1);
        const handleHeight = Math.max(40, scrollTrackHeight * Math.min(visibleRows / totalTracks, 1));
        const handleTravel = Math.max(scrollTrackHeight - handleHeight, 1e-5);
        const handleOffset = handleTravel * handleRatio;
        const handleY = scrollTrackTop + handleOffset;
        drawRoundedRect(ctx, scrollTrackX, handleY, scrollBarWidth, handleHeight, scrollRadius);
        const isScrollHovered =
          hud.hoverRegion &&
          hud.hoverRegion.targetType === 'tracks-scroll' &&
          hud.hoverRegion.channelId === activeChannel.id;
        ctx.fillStyle = isScrollHovered ? '#3a73d1' : '#2b5fa6';
        ctx.fill();

        const sliderTopPanel = toPanelY(scrollTrackTop);
        const sliderBottomPanel = toPanelY(scrollTrackTop + scrollTrackHeight);
        const sliderMin = Math.min(sliderTopPanel, sliderBottomPanel);
        const sliderMax = Math.max(sliderTopPanel, sliderBottomPanel);
        const scrollBounds = {
          minX: toPanelX(scrollTrackX),
          maxX: toPanelX(scrollTrackX + scrollBarWidth),
          minY: Math.min(toPanelY(scrollTrackTop), toPanelY(scrollTrackTop + scrollTrackHeight)),
          maxY: Math.max(toPanelY(scrollTrackTop), toPanelY(scrollTrackTop + scrollTrackHeight))
        };
        regions.push({
          targetType: 'tracks-scroll',
          channelId: activeChannel.id,
          bounds: scrollBounds,
          verticalSliderTrack: {
            x: toPanelX(scrollTrackX + scrollBarWidth / 2),
            minY: sliderMin,
            maxY: sliderMax,
            inverted: sliderTopPanel > sliderBottomPanel,
            visibleRows,
            totalRows: totalTracks
          }
        });
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
        if (region.trackId !== hud.hoverRegion.trackId) {
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

  const getHudQuaternionFromAngles = useCallback((yaw: number, pitch: number) => {
    const yawQuaternion = vrHudYawQuaternionRef.current;
    const yawEuler = vrHudYawEulerRef.current;
    yawEuler.set(pitch, yaw, 0, 'YXZ');
    yawQuaternion.setFromEuler(yawEuler);
    return yawQuaternion;
  }, []);

  const updateHudGroupFromPlacement = useCallback(
    (
      hud: VrPlaybackHud | VrChannelsHud | VrTracksHud | null,
      placement: VrHudPlacement | null
    ) => {
      if (!hud || !placement) {
        return;
      }
      const positionChanged =
        hud.cacheDirty ||
        Math.abs(hud.cachedPosition.x - placement.position.x) > VR_HUD_PLACEMENT_EPSILON ||
        Math.abs(hud.cachedPosition.y - placement.position.y) > VR_HUD_PLACEMENT_EPSILON ||
        Math.abs(hud.cachedPosition.z - placement.position.z) > VR_HUD_PLACEMENT_EPSILON;
      const yawChanged =
        hud.cacheDirty || Math.abs(hud.cachedYaw - placement.yaw) > VR_HUD_PLACEMENT_EPSILON;
      const pitchChanged =
        hud.cacheDirty || Math.abs(hud.cachedPitch - placement.pitch) > VR_HUD_PLACEMENT_EPSILON;
      if (!positionChanged && !yawChanged && !pitchChanged) {
        return;
      }
      hud.group.position.copy(placement.position);
      if (yawChanged || pitchChanged || hud.cacheDirty) {
        const quaternion = getHudQuaternionFromAngles(placement.yaw + Math.PI, placement.pitch);
        hud.group.quaternion.copy(quaternion);
      }
      hud.group.updateMatrixWorld(true);
      hud.cachedPosition.copy(placement.position);
      hud.cachedYaw = placement.yaw;
      hud.cachedPitch = placement.pitch;
      hud.cacheDirty = false;
    },
    [getHudQuaternionFromAngles]
  );

  const setVrPlaybackHudPlacementPosition = useCallback(
    (nextPosition: THREE.Vector3) => {
      const placement =
        vrPlaybackHudPlacementRef.current ??
        ({ position: new THREE.Vector3(), yaw: 0, pitch: 0 } satisfies VrHudPlacement);
      const prevX = placement.position.x;
      const prevY = placement.position.y;
      const prevZ = placement.position.z;
      placement.position.copy(nextPosition);
      constrainHudPlacementPosition(placement.position);
      const positionChanged =
        Math.abs(prevX - placement.position.x) > VR_HUD_PLACEMENT_EPSILON ||
        Math.abs(prevY - placement.position.y) > VR_HUD_PLACEMENT_EPSILON ||
        Math.abs(prevZ - placement.position.z) > VR_HUD_PLACEMENT_EPSILON;
      vrPlaybackHudPlacementRef.current = placement;
      vrPlaybackHudDragTargetRef.current.copy(placement.position);
      if (positionChanged && vrPlaybackHudRef.current) {
        vrPlaybackHudRef.current.cacheDirty = true;
      }
      updateHudGroupFromPlacement(vrPlaybackHudRef.current, placement);
    },
    [constrainHudPlacementPosition, updateHudGroupFromPlacement]
  );

  const setVrChannelsHudPlacementPosition = useCallback(
    (nextPosition: THREE.Vector3) => {
      const placement =
        vrChannelsHudPlacementRef.current ??
        ({ position: new THREE.Vector3(), yaw: 0, pitch: 0 } satisfies VrHudPlacement);
      const prevX = placement.position.x;
      const prevY = placement.position.y;
      const prevZ = placement.position.z;
      placement.position.copy(nextPosition);
      constrainHudPlacementPosition(placement.position);
      const positionChanged =
        Math.abs(prevX - placement.position.x) > VR_HUD_PLACEMENT_EPSILON ||
        Math.abs(prevY - placement.position.y) > VR_HUD_PLACEMENT_EPSILON ||
        Math.abs(prevZ - placement.position.z) > VR_HUD_PLACEMENT_EPSILON;
      vrChannelsHudPlacementRef.current = placement;
      vrChannelsHudDragTargetRef.current.copy(placement.position);
      if (positionChanged && vrChannelsHudRef.current) {
        vrChannelsHudRef.current.cacheDirty = true;
      }
      updateHudGroupFromPlacement(vrChannelsHudRef.current, placement);
    },
    [constrainHudPlacementPosition, updateHudGroupFromPlacement]
  );

  const setVrTracksHudPlacementPosition = useCallback(
    (nextPosition: THREE.Vector3) => {
      const placement =
        vrTracksHudPlacementRef.current ??
        ({ position: new THREE.Vector3(), yaw: 0, pitch: 0 } satisfies VrHudPlacement);
      const prevX = placement.position.x;
      const prevY = placement.position.y;
      const prevZ = placement.position.z;
      placement.position.copy(nextPosition);
      constrainHudPlacementPosition(placement.position);
      const positionChanged =
        Math.abs(prevX - placement.position.x) > VR_HUD_PLACEMENT_EPSILON ||
        Math.abs(prevY - placement.position.y) > VR_HUD_PLACEMENT_EPSILON ||
        Math.abs(prevZ - placement.position.z) > VR_HUD_PLACEMENT_EPSILON;
      vrTracksHudPlacementRef.current = placement;
      vrTracksHudDragTargetRef.current.copy(placement.position);
      if (positionChanged && vrTracksHudRef.current) {
        vrTracksHudRef.current.cacheDirty = true;
      }
      updateHudGroupFromPlacement(vrTracksHudRef.current, placement);
    },
    [constrainHudPlacementPosition, updateHudGroupFromPlacement]
  );

  const setVrPlaybackHudPlacementYaw = useCallback(
    (nextYaw: number) => {
      const placement =
        vrPlaybackHudPlacementRef.current ??
        ({ position: new THREE.Vector3(), yaw: 0, pitch: 0 } satisfies VrHudPlacement);
      const prevYaw = placement.yaw;
      placement.yaw = nextYaw;
      const yawChanged = Math.abs(prevYaw - placement.yaw) > VR_HUD_PLACEMENT_EPSILON;
      vrPlaybackHudPlacementRef.current = placement;
      if (yawChanged && vrPlaybackHudRef.current) {
        vrPlaybackHudRef.current.cacheDirty = true;
      }
      updateHudGroupFromPlacement(vrPlaybackHudRef.current, placement);
    },
    [updateHudGroupFromPlacement]
  );

  const setVrChannelsHudPlacementYaw = useCallback(
    (nextYaw: number) => {
      const placement =
        vrChannelsHudPlacementRef.current ??
        ({ position: new THREE.Vector3(), yaw: 0, pitch: 0 } satisfies VrHudPlacement);
      const prevYaw = placement.yaw;
      placement.yaw = nextYaw;
      const yawChanged = Math.abs(prevYaw - placement.yaw) > VR_HUD_PLACEMENT_EPSILON;
      vrChannelsHudPlacementRef.current = placement;
      if (yawChanged && vrChannelsHudRef.current) {
        vrChannelsHudRef.current.cacheDirty = true;
      }
      updateHudGroupFromPlacement(vrChannelsHudRef.current, placement);
    },
    [updateHudGroupFromPlacement]
  );

  const setVrTracksHudPlacementYaw = useCallback(
    (nextYaw: number) => {
      const placement =
        vrTracksHudPlacementRef.current ??
        ({ position: new THREE.Vector3(), yaw: 0, pitch: 0 } satisfies VrHudPlacement);
      const prevYaw = placement.yaw;
      placement.yaw = nextYaw;
      const yawChanged = Math.abs(prevYaw - placement.yaw) > VR_HUD_PLACEMENT_EPSILON;
      vrTracksHudPlacementRef.current = placement;
      if (yawChanged && vrTracksHudRef.current) {
        vrTracksHudRef.current.cacheDirty = true;
      }
      updateHudGroupFromPlacement(vrTracksHudRef.current, placement);
    },
    [updateHudGroupFromPlacement]
  );

  const setVrPlaybackHudPlacementPitch = useCallback(
    (nextPitch: number) => {
      const placement =
        vrPlaybackHudPlacementRef.current ??
        ({ position: new THREE.Vector3(), yaw: 0, pitch: 0 } satisfies VrHudPlacement);
      const prevPitch = placement.pitch;
      placement.pitch = nextPitch;
      const pitchChanged = Math.abs(prevPitch - placement.pitch) > VR_HUD_PLACEMENT_EPSILON;
      vrPlaybackHudPlacementRef.current = placement;
      if (pitchChanged && vrPlaybackHudRef.current) {
        vrPlaybackHudRef.current.cacheDirty = true;
      }
      updateHudGroupFromPlacement(vrPlaybackHudRef.current, placement);
    },
    [updateHudGroupFromPlacement]
  );

  const setVrChannelsHudPlacementPitch = useCallback(
    (nextPitch: number) => {
      const placement =
        vrChannelsHudPlacementRef.current ??
        ({ position: new THREE.Vector3(), yaw: 0, pitch: 0 } satisfies VrHudPlacement);
      const prevPitch = placement.pitch;
      placement.pitch = nextPitch;
      const pitchChanged = Math.abs(prevPitch - placement.pitch) > VR_HUD_PLACEMENT_EPSILON;
      vrChannelsHudPlacementRef.current = placement;
      if (pitchChanged && vrChannelsHudRef.current) {
        vrChannelsHudRef.current.cacheDirty = true;
      }
      updateHudGroupFromPlacement(vrChannelsHudRef.current, placement);
    },
    [updateHudGroupFromPlacement]
  );

  const setVrTracksHudPlacementPitch = useCallback(
    (nextPitch: number) => {
      const placement =
        vrTracksHudPlacementRef.current ??
        ({ position: new THREE.Vector3(), yaw: 0, pitch: 0 } satisfies VrHudPlacement);
      const prevPitch = placement.pitch;
      placement.pitch = nextPitch;
      const pitchChanged = Math.abs(prevPitch - placement.pitch) > VR_HUD_PLACEMENT_EPSILON;
      vrTracksHudPlacementRef.current = placement;
      if (pitchChanged && vrTracksHudRef.current) {
        vrTracksHudRef.current.cacheDirty = true;
      }
      updateHudGroupFromPlacement(vrTracksHudRef.current, placement);
    },
    [updateHudGroupFromPlacement]
  );

  const setHudPlacement = useCallback(
    (
      placementRef: MutableRefObject<VrHudPlacement | null>,
      dragTargetRef: MutableRefObject<THREE.Vector3>,
      hudRef: MutableRefObject<VrPlaybackHud | VrChannelsHud | VrTracksHud | null>,
      position: THREE.Vector3,
      yaw: number,
      pitch: number
    ) => {
      const placement =
        placementRef.current ?? ({ position: new THREE.Vector3(), yaw: 0, pitch: 0 } satisfies VrHudPlacement);
      const prevX = placement.position.x;
      const prevY = placement.position.y;
      const prevZ = placement.position.z;
      const prevYaw = placement.yaw;
      const prevPitch = placement.pitch;
      placement.position.copy(position);
      constrainHudPlacementPosition(placement.position);
      placement.yaw = yaw;
      placement.pitch = pitch;
      const positionChanged =
        Math.abs(prevX - placement.position.x) > VR_HUD_PLACEMENT_EPSILON ||
        Math.abs(prevY - placement.position.y) > VR_HUD_PLACEMENT_EPSILON ||
        Math.abs(prevZ - placement.position.z) > VR_HUD_PLACEMENT_EPSILON;
      const yawChanged = Math.abs(prevYaw - placement.yaw) > VR_HUD_PLACEMENT_EPSILON;
      const pitchChanged = Math.abs(prevPitch - placement.pitch) > VR_HUD_PLACEMENT_EPSILON;
      placementRef.current = placement;
      dragTargetRef.current.copy(placement.position);
      const hud = hudRef.current;
      if (hud && (positionChanged || yawChanged || pitchChanged)) {
        hud.cacheDirty = true;
      }
      updateHudGroupFromPlacement(hud, placement);
    },
    [constrainHudPlacementPosition, updateHudGroupFromPlacement]
  );

  const computeVolumeHudFrame = useCallback(() => {
    const baseOffset = volumeRootBaseOffsetRef.current;
    const volumeRootGroup = volumeRootGroupRef.current;
    const halfExtents = volumeRootHalfExtentsRef.current;
    if (!volumeRootGroup || baseOffset.lengthSq() <= 1e-6) {
      return null;
    }
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(volumeRootGroup.quaternion);
    if (forward.lengthSq() <= 1e-8) {
      forward.set(0, 0, -1);
    } else {
      forward.normalize();
    }
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(volumeRootGroup.quaternion);
    if (right.lengthSq() <= 1e-8) {
      right.set(1, 0, 0);
    } else {
      right.normalize();
    }
    const up = new THREE.Vector3(0, 1, 0);
    const frontDistance = (halfExtents ? halfExtents.z : 0) + VR_HUD_FRONT_MARGIN;
    const center = new THREE.Vector3().copy(baseOffset).addScaledVector(forward, -frontDistance);
    const horizontalForward = new THREE.Vector3(forward.x, 0, forward.z);
    if (horizontalForward.lengthSq() <= 1e-8) {
      horizontalForward.set(0, 0, -1);
    } else {
      horizontalForward.normalize();
    }
    const yaw = Math.atan2(horizontalForward.x, horizontalForward.z);
    const pitch = 0;
    return { center, forward, right, up, yaw, pitch };
  }, []);

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
    setContainerNode(node);
  }, []);

  const applyVrPlaybackHoverState = useCallback(
    (
      playHovered: boolean,
      playbackSliderHovered: boolean,
      playbackSliderActive: boolean,
      fpsSliderHovered: boolean,
      fpsSliderActive: boolean,
      resetVolumeHovered: boolean,
      resetHudHovered: boolean,
      exitHovered: boolean,
      modeHovered: boolean
    ) => {
      vrHoverStateRef.current = {
        play: playHovered,
        playbackSlider: playbackSliderHovered,
        playbackSliderActive,
        fpsSlider: fpsSliderHovered,
        fpsSliderActive,
        resetVolume: resetVolumeHovered,
        resetHud: resetHudHovered,
        exit: exitHovered,
        mode: modeHovered
      };
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
      const playbackSliderTrackMaterial = hud.playbackSliderTrack
        .material as THREE.MeshBasicMaterial;
      playbackSliderTrackMaterial.color.copy(hud.playbackSliderTrackBaseColor);
      if ((playbackSliderHovered || playbackSliderActive) && !state.playbackDisabled) {
        playbackSliderTrackMaterial.color.lerp(hud.hoverHighlightColor, 0.22);
      }
      const playbackKnobMaterial = hud.playbackSliderKnob.material as THREE.MeshBasicMaterial;
      playbackKnobMaterial.color.copy(hud.playbackSliderKnobBaseColor);
      if ((playbackSliderHovered || playbackSliderActive) && !state.playbackDisabled) {
        playbackKnobMaterial.color.lerp(hud.hoverHighlightColor, 0.35);
      }
      const fpsDisabled = state.totalTimepoints <= 1;
      const fpsSliderTrackMaterial = hud.fpsSliderTrack.material as THREE.MeshBasicMaterial;
      fpsSliderTrackMaterial.color.copy(hud.fpsSliderTrackBaseColor);
      if ((fpsSliderHovered || fpsSliderActive) && !fpsDisabled) {
        fpsSliderTrackMaterial.color.lerp(hud.hoverHighlightColor, 0.22);
      }
      const fpsKnobMaterial = hud.fpsSliderKnob.material as THREE.MeshBasicMaterial;
      fpsKnobMaterial.color.copy(hud.fpsSliderKnobBaseColor);
      if ((fpsSliderHovered || fpsSliderActive) && !fpsDisabled) {
        fpsKnobMaterial.color.lerp(hud.hoverHighlightColor, 0.35);
      }
      const resetVolumeMaterial = hud.resetVolumeButton.material as THREE.MeshBasicMaterial;
      resetVolumeMaterial.color.copy(hud.resetVolumeButtonBaseColor);
      if (resetVolumeHovered) {
        resetVolumeMaterial.color.lerp(hud.hoverHighlightColor, 0.35);
      }
      const resetHudMaterial = hud.resetHudButton.material as THREE.MeshBasicMaterial;
      resetHudMaterial.color.copy(hud.resetHudButtonBaseColor);
      if (resetHudHovered) {
        resetHudMaterial.color.lerp(hud.hoverHighlightColor, 0.35);
      }
      const exitMaterial = hud.exitButton.material as THREE.MeshBasicMaterial;
      exitMaterial.color.copy(hud.exitButtonBaseColor);
      if (exitHovered) {
        exitMaterial.color.lerp(hud.hoverHighlightColor, 0.35);
      }
      if (hud.modeButton.visible) {
        const modeMaterial = hud.modeButton.material as THREE.MeshBasicMaterial;
        modeMaterial.color.copy(hud.modeButtonBaseColor);
        if (modeHovered) {
          modeMaterial.color.lerp(hud.hoverHighlightColor, 0.35);
        }
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
    const playbackSliderTrackMaterial = hud.playbackSliderTrack.material as THREE.MeshBasicMaterial;
    const playbackSliderFillMaterial = hud.playbackSliderFill.material as THREE.MeshBasicMaterial;
    const playbackKnobMaterial = hud.playbackSliderKnob.material as THREE.MeshBasicMaterial;
    const fpsSliderTrackMaterial = hud.fpsSliderTrack.material as THREE.MeshBasicMaterial;
    const fpsSliderFillMaterial = hud.fpsSliderFill.material as THREE.MeshBasicMaterial;
    const fpsKnobMaterial = hud.fpsSliderKnob.material as THREE.MeshBasicMaterial;
    const modeMaterial = hud.modeButton.material as THREE.MeshBasicMaterial;

    if (state.playbackDisabled) {
      hud.playButtonBaseColor.set(0x3a414d);
      hud.playbackSliderTrackBaseColor.set(0x2f333b);
      hud.playbackSliderKnobBaseColor.set(0xcad0da);
      playbackSliderFillMaterial.color.set(0x5a6473);
      playbackSliderFillMaterial.opacity = 0.35;
    } else if (state.isPlaying) {
      hud.playButtonBaseColor.set(0x1f6f3f);
      hud.playbackSliderTrackBaseColor.set(0x3b414d);
      hud.playbackSliderKnobBaseColor.set(0xffffff);
      playbackSliderFillMaterial.color.set(0x45c16b);
      playbackSliderFillMaterial.opacity = 0.85;
    } else {
      hud.playButtonBaseColor.set(0x2b5fa6);
      hud.playbackSliderTrackBaseColor.set(0x3b414d);
      hud.playbackSliderKnobBaseColor.set(0xffffff);
      playbackSliderFillMaterial.color.set(0x68a7ff);
      playbackSliderFillMaterial.opacity = 0.85;
    }

    playMaterial.color.copy(hud.playButtonBaseColor);
    playbackSliderTrackMaterial.color.copy(hud.playbackSliderTrackBaseColor);
    playbackKnobMaterial.color.copy(hud.playbackSliderKnobBaseColor);

    const fpsDisabled = state.totalTimepoints <= 1;
    if (fpsDisabled) {
      hud.fpsSliderTrackBaseColor.set(0x2f333b);
      hud.fpsSliderKnobBaseColor.set(0xcad0da);
      fpsSliderFillMaterial.color.set(0x5a6473);
      fpsSliderFillMaterial.opacity = 0.35;
    } else {
      hud.fpsSliderTrackBaseColor.set(0x3b414d);
      hud.fpsSliderKnobBaseColor.set(0xffffff);
      fpsSliderFillMaterial.color.set(0x68a7ff);
      fpsSliderFillMaterial.opacity = 0.85;
    }

    fpsSliderTrackMaterial.color.copy(hud.fpsSliderTrackBaseColor);
    fpsKnobMaterial.color.copy(hud.fpsSliderKnobBaseColor);

    const passthroughSupported = Boolean(state.passthroughSupported);
    if (!passthroughSupported) {
      hud.modeButton.visible = false;
      hud.modeVrIcon.visible = false;
      hud.modeArIcon.visible = false;
      hud.modeButtonBaseColor.copy(hud.modeButtonDisabledColor);
      modeMaterial.color.copy(hud.modeButtonBaseColor);
    } else {
      hud.modeButton.visible = true;
      const preferredMode = state.preferredSessionMode === 'immersive-ar' ? 'immersive-ar' : 'immersive-vr';
      if (preferredMode === 'immersive-ar') {
        hud.modeButtonBaseColor.copy(hud.modeButtonActiveColor);
        hud.modeVrIcon.visible = false;
        hud.modeArIcon.visible = true;
      } else {
        hud.modeButtonBaseColor.set(0x2b3340);
        hud.modeVrIcon.visible = true;
        hud.modeArIcon.visible = false;
      }
      modeMaterial.color.copy(hud.modeButtonBaseColor);
    }

    hud.playIcon.visible = !state.isPlaying;
    hud.pauseGroup.visible = state.isPlaying;

    const maxIndex = Math.max(0, state.totalTimepoints - 1);
    const fraction = maxIndex > 0 ? Math.min(Math.max(state.timeIndex / maxIndex, 0), 1) : 0;
    setVrPlaybackProgressFraction(hud, fraction);
    setVrPlaybackLabel(hud, state.playbackLabel ?? '');
    const fpsRange = VR_PLAYBACK_MAX_FPS - VR_PLAYBACK_MIN_FPS;
    const fpsValue = Math.min(
      VR_PLAYBACK_MAX_FPS,
      Math.max(VR_PLAYBACK_MIN_FPS, state.fps ?? VR_PLAYBACK_MIN_FPS)
    );
    const fpsFraction =
      fpsRange > 0
        ? (Math.min(Math.max(fpsValue, VR_PLAYBACK_MIN_FPS), VR_PLAYBACK_MAX_FPS) - VR_PLAYBACK_MIN_FPS) /
          fpsRange
        : 0;
    setVrPlaybackFpsFraction(hud, fpsFraction);
    const fpsLabelText = fpsDisabled ? 'frames per second —' : `frames per second ${fpsValue}`;
    setVrPlaybackFpsLabel(hud, fpsLabelText);
    applyVrPlaybackHoverState(
      vrHoverStateRef.current.play,
      vrHoverStateRef.current.playbackSlider,
      vrHoverStateRef.current.playbackSliderActive,
      vrHoverStateRef.current.fpsSlider,
      vrHoverStateRef.current.fpsSliderActive,
      vrHoverStateRef.current.resetVolume,
      vrHoverStateRef.current.resetHud,
      vrHoverStateRef.current.exit,
      vrHoverStateRef.current.mode
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
        applyVrPlaybackHoverState(false, false, false, false, false, false, false, false, false);
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

  const setVrTracksHudVisible = useCallback((visible: boolean) => {
    const hud = vrTracksHudRef.current;
    if (!hud) {
      return;
    }
    hud.group.visible = visible;
    if (!visible) {
      hud.hoverRegion = null;
    }
  }, []);

  const setPreferredXrSessionMode = useCallback(
    (mode: 'immersive-vr' | 'immersive-ar') => {
      xrPreferredSessionModeRef.current = mode;
      playbackStateRef.current.preferredSessionMode = mode;
      updateVrPlaybackHud();
    },
    [updateVrPlaybackHud]
  );

  const toggleXrSessionMode = useCallback(() => {
    if (!xrPassthroughSupportedRef.current) {
      return;
    }
    const nextMode = xrPreferredSessionModeRef.current === 'immersive-ar' ? 'immersive-vr' : 'immersive-ar';
    setPreferredXrSessionMode(nextMode);
    const session = xrSessionRef.current;
    if (session) {
      if (xrCurrentSessionModeRef.current === nextMode) {
        return;
      }
      xrPendingModeSwitchRef.current = nextMode;
      session.end().catch((error) => {
        console.warn('Failed to switch XR session mode', error);
        xrPendingModeSwitchRef.current = null;
      });
    }
  }, [setPreferredXrSessionMode]);

  const applyPlaybackSliderFromWorldPoint = useCallback(
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
      hud.playbackSliderTrack.worldToLocal(sliderLocalPointRef.current);
      const rawRatio =
        (sliderLocalPointRef.current.x + hud.playbackSliderWidth / 2) /
        Math.max(hud.playbackSliderWidth, 1e-5);
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
      setVrPlaybackProgressFraction(hud, fraction);
      setVrPlaybackLabel(hud, label);
    },
    []
  );

  const applyFpsSliderFromWorldPoint = useCallback(
    (worldPoint: THREE.Vector3) => {
      const hud = vrPlaybackHudRef.current;
      if (!hud) {
        return;
      }
      const state = playbackStateRef.current;
      if (state.totalTimepoints <= 1) {
        return;
      }
      sliderLocalPointRef.current.copy(worldPoint);
      hud.fpsSliderTrack.worldToLocal(sliderLocalPointRef.current);
      const rawRatio =
        (sliderLocalPointRef.current.x + hud.fpsSliderWidth / 2) / Math.max(hud.fpsSliderWidth, 1e-5);
      const clampedRatio = Math.min(Math.max(rawRatio, 0), 1);
      const fpsRange = VR_PLAYBACK_MAX_FPS - VR_PLAYBACK_MIN_FPS;
      const tentativeFps = Math.round(VR_PLAYBACK_MIN_FPS + clampedRatio * fpsRange);
      const boundedFps = Math.min(
        VR_PLAYBACK_MAX_FPS,
        Math.max(VR_PLAYBACK_MIN_FPS, tentativeFps)
      );
      if (boundedFps !== state.fps) {
        state.onFpsChange?.(boundedFps);
        state.fps = boundedFps;
      }
      const fpsFraction =
        fpsRange > 0
          ? (Math.min(Math.max(boundedFps, VR_PLAYBACK_MIN_FPS), VR_PLAYBACK_MAX_FPS) - VR_PLAYBACK_MIN_FPS) /
            fpsRange
          : 0;
      setVrPlaybackFpsFraction(hud, fpsFraction);
      const fpsLabelText = `frames per second ${boundedFps}`;
      setVrPlaybackFpsLabel(hud, fpsLabelText);
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
      transparent: false,
      opacity: 1,
      side: THREE.DoubleSide
    });
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(VR_PLAYBACK_PANEL_WIDTH, VR_PLAYBACK_PANEL_HEIGHT),
      panelMaterial
    );
    panel.position.set(0, 0, 0);
    panel.userData.vrUiTarget = { type: 'playback-panel' } satisfies { type: VrUiTargetType };
    group.add(panel);

    const buttonRowY = 0.11;
    const fpsLabelRowY = 0.07;
    const fpsSliderRowY = 0.025;
    const playbackLabelRowY = -0.03;
    const playbackSliderRowY = -0.075;
    const playButtonRowY = -0.14;
    const topButtons: THREE.Mesh[] = [];

    const translateHandleMaterial = new THREE.MeshBasicMaterial({
      color: VR_HUD_TRANSLATE_HANDLE_COLOR,
      transparent: true,
      opacity: 0.75,
      depthWrite: false
    });
    translateHandleMaterial.depthTest = false;
    const panelTranslateHandle = new THREE.Mesh(
      new THREE.SphereGeometry(VR_HUD_TRANSLATE_HANDLE_RADIUS, 32, 32),
      translateHandleMaterial
    );
    panelTranslateHandle.position.set(
      0,
      VR_PLAYBACK_PANEL_HEIGHT / 2 + VR_HUD_TRANSLATE_HANDLE_OFFSET,
      0
    );
    panelTranslateHandle.userData.vrUiTarget = { type: 'playback-panel-grab' } satisfies {
      type: VrUiTargetType;
    };
    group.add(panelTranslateHandle);

    const yawHandleMaterial = new THREE.MeshBasicMaterial({
      color: VR_HUD_YAW_HANDLE_COLOR,
      transparent: true,
      opacity: 0.85,
      depthWrite: false
    });
    yawHandleMaterial.depthTest = false;
    const panelYawHandles: THREE.Mesh[] = [];
    const yawOffsets = [1, -1] as const;
    for (const direction of yawOffsets) {
      const handle = new THREE.Mesh(
        new THREE.SphereGeometry(VR_HUD_YAW_HANDLE_RADIUS, 32, 32),
        yawHandleMaterial.clone()
      );
      handle.position.set(
        direction * (VR_PLAYBACK_PANEL_WIDTH / 2 + VR_HUD_YAW_HANDLE_OFFSET),
        0,
        0
      );
      handle.userData.vrUiTarget = { type: 'playback-panel-yaw' } satisfies {
        type: VrUiTargetType;
      };
      group.add(handle);
      panelYawHandles.push(handle);
    }

    const panelPitchHandle = new THREE.Mesh(
      new THREE.SphereGeometry(VR_HUD_YAW_HANDLE_RADIUS, 32, 32),
      yawHandleMaterial.clone()
    );
    panelPitchHandle.position.set(
      0,
      -(VR_PLAYBACK_PANEL_HEIGHT / 2 + VR_HUD_YAW_HANDLE_OFFSET),
      0
    );
    panelPitchHandle.userData.vrUiTarget = { type: 'playback-panel-pitch' } satisfies {
      type: VrUiTargetType;
    };
    group.add(panelPitchHandle);

    const sideButtonRadius = 0.032;
    const sideButtonMargin = 0.02;

    const resetVolumeButtonMaterial = new THREE.MeshBasicMaterial({ color: 0x2b3340, side: THREE.DoubleSide });
    const resetVolumeButton = new THREE.Mesh(
      new THREE.CircleGeometry(sideButtonRadius, 48),
      resetVolumeButtonMaterial
    );
    resetVolumeButton.userData.vrUiTarget = { type: 'playback-reset-volume' } satisfies {
      type: VrUiTargetType;
    };
    topButtons.push(resetVolumeButton);
    const resetVolumeIconMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    const resetVolumeIconGroup = new THREE.Group();
    const resetArc = new THREE.Mesh(
      new THREE.RingGeometry(0.012, 0.02, 24, 1, Math.PI * 0.25, Math.PI * 1.4),
      resetVolumeIconMaterial
    );
    resetArc.position.set(0, 0, 0.0006);
    const resetArrowShape = new THREE.Shape();
    resetArrowShape.moveTo(0.014, 0.01);
    resetArrowShape.lineTo(0.028, 0.002);
    resetArrowShape.lineTo(0.014, -0.006);
    resetArrowShape.lineTo(0.014, 0.01);
    const resetArrow = new THREE.Mesh(
      new THREE.ShapeGeometry(resetArrowShape),
      resetVolumeIconMaterial.clone()
    );
    resetArrow.position.set(0, 0, 0.001);
    resetVolumeIconGroup.add(resetArc);
    resetVolumeIconGroup.add(resetArrow);
    resetVolumeButton.add(resetVolumeIconGroup);
    group.add(resetVolumeButton);

    const resetHudButtonMaterial = new THREE.MeshBasicMaterial({ color: 0x2b3340, side: THREE.DoubleSide });
    const resetHudButton = new THREE.Mesh(
      new THREE.CircleGeometry(sideButtonRadius, 48),
      resetHudButtonMaterial
    );
    resetHudButton.userData.vrUiTarget = { type: 'playback-reset-hud' } satisfies {
      type: VrUiTargetType;
    };
    topButtons.push(resetHudButton);
    const resetHudIconMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    const resetHudIconGroup = new THREE.Group();
    const windowPrimaryOuter = new THREE.Mesh(
      new THREE.PlaneGeometry(0.048, 0.034),
      resetHudIconMaterial.clone()
    );
    windowPrimaryOuter.position.set(-0.01, 0.008, 0.0006);
    const windowPrimaryInner = new THREE.Mesh(
      new THREE.PlaneGeometry(0.036, 0.024),
      new THREE.MeshBasicMaterial({ color: 0x10161d, side: THREE.DoubleSide })
    );
    windowPrimaryInner.position.set(-0.01, 0.008, 0.0008);
    const windowSecondaryOuter = new THREE.Mesh(
      new THREE.PlaneGeometry(0.034, 0.026),
      resetHudIconMaterial.clone()
    );
    windowSecondaryOuter.position.set(0.015, -0.012, 0.0006);
    const windowSecondaryInner = new THREE.Mesh(
      new THREE.PlaneGeometry(0.024, 0.018),
      new THREE.MeshBasicMaterial({ color: 0x10161d, side: THREE.DoubleSide })
    );
    windowSecondaryInner.position.set(0.015, -0.012, 0.0008);
    resetHudIconGroup.add(windowPrimaryOuter);
    resetHudIconGroup.add(windowPrimaryInner);
    resetHudIconGroup.add(windowSecondaryOuter);
    resetHudIconGroup.add(windowSecondaryInner);
    resetHudButton.add(resetHudIconGroup);
    group.add(resetHudButton);

    const playButtonMaterial = new THREE.MeshBasicMaterial({ color: 0x2b3340, side: THREE.DoubleSide });
    const playButton = new THREE.Mesh(new THREE.CircleGeometry(0.045, 48), playButtonMaterial);
    playButton.position.set(0, playButtonRowY, VR_HUD_SURFACE_OFFSET);
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
    playIcon.position.set(0, 0, 0.0008);
    playButton.add(playIcon);

    const pauseGroup = new THREE.Group();
    const pauseMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    const pauseGeom = new THREE.PlaneGeometry(0.014, 0.045);
    const pauseLeft = new THREE.Mesh(pauseGeom, pauseMaterial);
    pauseLeft.position.set(-0.012, 0, 0.0008);
    const pauseRight = new THREE.Mesh(pauseGeom.clone(), pauseMaterial.clone());
    pauseRight.position.set(0.012, 0, 0.0008);
    pauseGroup.add(pauseLeft);
    pauseGroup.add(pauseRight);
    pauseGroup.visible = false;
    playButton.add(pauseGroup);

    const modeButtonMaterial = new THREE.MeshBasicMaterial({ color: 0x2b3340, side: THREE.DoubleSide });
    const modeButton = new THREE.Mesh(new THREE.CircleGeometry(sideButtonRadius, 48), modeButtonMaterial);
    modeButton.userData.vrUiTarget = { type: 'playback-toggle-mode' } satisfies {
      type: VrUiTargetType;
    };
    topButtons.push(modeButton);
    const modeIconMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    const modeVrIcon = new THREE.Group();
    const vrStrap = new THREE.Mesh(new THREE.PlaneGeometry(0.048, 0.006), modeIconMaterial.clone());
    vrStrap.position.set(0, 0.016, 0.0008);
    const vrLeftLens = new THREE.Mesh(new THREE.CircleGeometry(0.012, 32), modeIconMaterial.clone());
    vrLeftLens.position.set(-0.014, -0.002, 0.001);
    const vrRightLens = new THREE.Mesh(new THREE.CircleGeometry(0.012, 32), modeIconMaterial.clone());
    vrRightLens.position.set(0.014, -0.002, 0.001);
    modeVrIcon.add(vrStrap);
    modeVrIcon.add(vrLeftLens);
    modeVrIcon.add(vrRightLens);
    modeButton.add(modeVrIcon);
    const modeArIcon = new THREE.Group();
    const arOuter = new THREE.Mesh(new THREE.PlaneGeometry(0.048, 0.032), modeIconMaterial.clone());
    arOuter.position.set(0, 0, 0.0008);
    const arInner = new THREE.Mesh(
      new THREE.PlaneGeometry(0.042, 0.026),
      new THREE.MeshBasicMaterial({ color: 0x10161d, side: THREE.DoubleSide })
    );
    arInner.position.set(0, 0, 0.001);
    const arSlash = new THREE.Mesh(new THREE.PlaneGeometry(0.006, 0.036), modeIconMaterial.clone());
    arSlash.position.set(0, 0, 0.0012);
    arSlash.rotation.z = Math.PI / 6;
    const arFocus = new THREE.Mesh(new THREE.CircleGeometry(0.006, 24), modeIconMaterial.clone());
    arFocus.position.set(0.012, -0.004, 0.0014);
    modeArIcon.add(arOuter);
    modeArIcon.add(arInner);
    modeArIcon.add(arSlash);
    modeArIcon.add(arFocus);
    modeArIcon.visible = false;
    modeButton.add(modeArIcon);
    group.add(modeButton);

    const exitButtonMaterial = new THREE.MeshBasicMaterial({ color: 0x512b2b, side: THREE.DoubleSide });
    const exitButton = new THREE.Mesh(new THREE.CircleGeometry(sideButtonRadius, 48), exitButtonMaterial);
    exitButton.userData.vrUiTarget = { type: 'playback-exit-vr' } satisfies {
      type: VrUiTargetType;
    };
    topButtons.push(exitButton);
    const exitIconMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    const exitIconGroup = new THREE.Group();
    const exitBarGeometry = new THREE.PlaneGeometry(0.03, 0.006);
    const exitBarA = new THREE.Mesh(exitBarGeometry, exitIconMaterial);
    exitBarA.position.set(0, 0, 0.001);
    exitBarA.rotation.z = Math.PI / 4;
    const exitBarB = new THREE.Mesh(exitBarGeometry.clone(), exitIconMaterial.clone());
    exitBarB.position.set(0, 0, 0.001);
    exitBarB.rotation.z = -Math.PI / 4;
    exitIconGroup.add(exitBarA);
    exitIconGroup.add(exitBarB);
    exitButton.add(exitIconGroup);
    group.add(exitButton);

    const buttonSpacing = sideButtonRadius * 2 + sideButtonMargin;
    const firstButtonX = -((topButtons.length - 1) * buttonSpacing) / 2;
    topButtons.forEach((button, index) => {
      button.position.set(firstButtonX + index * buttonSpacing, buttonRowY, VR_HUD_SURFACE_OFFSET);
    });

    const fpsSliderGroup = new THREE.Group();
    fpsSliderGroup.position.set(0, fpsSliderRowY, VR_HUD_SURFACE_OFFSET);
    group.add(fpsSliderGroup);

    const fpsSliderWidth = 0.32;
    const fpsSliderTrackMaterial = new THREE.MeshBasicMaterial({ color: 0x3b414d, side: THREE.DoubleSide });
    const fpsSliderTrack = new THREE.Mesh(new THREE.PlaneGeometry(fpsSliderWidth, 0.012), fpsSliderTrackMaterial);
    fpsSliderTrack.position.set(0, 0, 0);
    fpsSliderGroup.add(fpsSliderTrack);

    const fpsSliderFillMaterial = new THREE.MeshBasicMaterial({
      color: 0x68a7ff,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide
    });
    const fpsSliderFill = new THREE.Mesh(new THREE.PlaneGeometry(fpsSliderWidth, 0.012), fpsSliderFillMaterial);
    fpsSliderFill.position.set(0, 0, 0.0005);
    fpsSliderGroup.add(fpsSliderFill);

    const fpsSliderKnobMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    const fpsSliderKnob = new THREE.Mesh(new THREE.CircleGeometry(0.017, 32), fpsSliderKnobMaterial);
    fpsSliderKnob.position.set(-fpsSliderWidth / 2, 0, 0.001);
    fpsSliderKnob.userData.vrUiTarget = { type: 'playback-fps-slider' } satisfies {
      type: VrUiTargetType;
    };
    fpsSliderGroup.add(fpsSliderKnob);

    const fpsSliderHitMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      opacity: 0.01,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const fpsSliderHitArea = new THREE.Mesh(
      new THREE.PlaneGeometry(fpsSliderWidth + 0.04, 0.08),
      fpsSliderHitMaterial
    );
    fpsSliderHitArea.position.set(0, 0, 0.0002);
    fpsSliderHitArea.userData.vrUiTarget = { type: 'playback-fps-slider' } satisfies {
      type: VrUiTargetType;
    };
    fpsSliderGroup.add(fpsSliderHitArea);

    const fpsLabelCanvas = document.createElement('canvas');
    fpsLabelCanvas.width = 256;
    fpsLabelCanvas.height = 64;
    const fpsLabelContext = fpsLabelCanvas.getContext('2d');
    const fpsLabelTexture = new THREE.CanvasTexture(fpsLabelCanvas);
    fpsLabelTexture.colorSpace = THREE.SRGBColorSpace;
    fpsLabelTexture.minFilter = THREE.LinearFilter;
    fpsLabelTexture.magFilter = THREE.LinearFilter;
    const fpsLabelMaterial = new THREE.MeshBasicMaterial({
      map: fpsLabelTexture,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide
    });
    const fpsLabelMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.05), fpsLabelMaterial);
    fpsLabelMesh.position.set(0, fpsLabelRowY, VR_HUD_SURFACE_OFFSET + 0.0005);
    group.add(fpsLabelMesh);

    const playbackSliderGroup = new THREE.Group();
    playbackSliderGroup.position.set(0, playbackSliderRowY, VR_HUD_SURFACE_OFFSET);
    group.add(playbackSliderGroup);

    const playbackSliderWidth = 0.32;
    const playbackSliderTrackMaterial = new THREE.MeshBasicMaterial({
      color: 0x3b414d,
      side: THREE.DoubleSide
    });
    const playbackSliderTrack = new THREE.Mesh(
      new THREE.PlaneGeometry(playbackSliderWidth, 0.012),
      playbackSliderTrackMaterial
    );
    playbackSliderTrack.position.set(0, 0, 0);
    playbackSliderGroup.add(playbackSliderTrack);

    const playbackSliderFillMaterial = new THREE.MeshBasicMaterial({
      color: 0x68a7ff,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide
    });
    const playbackSliderFill = new THREE.Mesh(
      new THREE.PlaneGeometry(playbackSliderWidth, 0.012),
      playbackSliderFillMaterial
    );
    playbackSliderFill.position.set(0, 0, 0.0005);
    playbackSliderGroup.add(playbackSliderFill);

    const playbackSliderKnobMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    const playbackSliderKnob = new THREE.Mesh(
      new THREE.CircleGeometry(0.017, 32),
      playbackSliderKnobMaterial
    );
    playbackSliderKnob.position.set(-playbackSliderWidth / 2, 0, 0.001);
    playbackSliderKnob.userData.vrUiTarget = { type: 'playback-slider' } satisfies {
      type: VrUiTargetType;
    };
    playbackSliderGroup.add(playbackSliderKnob);

    const playbackSliderHitMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      opacity: 0.01,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const playbackSliderHitArea = new THREE.Mesh(
      new THREE.PlaneGeometry(playbackSliderWidth + 0.04, 0.08),
      playbackSliderHitMaterial
    );
    playbackSliderHitArea.position.set(0, 0, 0.0002);
    playbackSliderHitArea.userData.vrUiTarget = { type: 'playback-slider' } satisfies {
      type: VrUiTargetType;
    };
    playbackSliderGroup.add(playbackSliderHitArea);

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
    labelMesh.position.set(0, playbackLabelRowY, VR_HUD_SURFACE_OFFSET + 0.0005);
    group.add(labelMesh);

    const hud: VrPlaybackHud = {
      group,
      panel,
      panelTranslateHandle,
      panelYawHandles,
      panelPitchHandle,
      resetVolumeButton,
      resetHudButton,
      playButton,
      playIcon,
      pauseGroup,
      exitButton,
      exitIcon: exitIconGroup,
      playbackSliderGroup,
      playbackSliderTrack,
      playbackSliderFill,
      playbackSliderKnob,
      playbackSliderHitArea,
      playbackSliderWidth,
      fpsSliderGroup,
      fpsSliderTrack,
      fpsSliderFill,
      fpsSliderKnob,
      fpsSliderHitArea,
      fpsSliderWidth,
      labelMesh,
      labelTexture,
      labelCanvas,
      labelContext,
      labelText: '',
      fpsLabelMesh,
      fpsLabelTexture,
      fpsLabelCanvas,
      fpsLabelContext,
      fpsLabelText: '',
      interactables: [
        panelTranslateHandle,
        ...panelYawHandles,
        panelPitchHandle,
        resetVolumeButton,
        resetHudButton,
        playButton,
        modeButton,
        exitButton,
        playbackSliderHitArea,
        playbackSliderKnob,
        fpsSliderHitArea,
        fpsSliderKnob
      ],
      resetVolumeButtonBaseColor: new THREE.Color(0x2b3340),
      resetHudButtonBaseColor: new THREE.Color(0x2b3340),
      playButtonBaseColor: new THREE.Color(0x2b3340),
      playbackSliderTrackBaseColor: new THREE.Color(0x3b414d),
      playbackSliderKnobBaseColor: new THREE.Color(0xffffff),
      fpsSliderTrackBaseColor: new THREE.Color(0x3b414d),
      fpsSliderKnobBaseColor: new THREE.Color(0xffffff),
      exitButtonBaseColor: new THREE.Color(0x512b2b),
      modeButtonBaseColor: new THREE.Color(0x2b3340),
      modeButtonActiveColor: new THREE.Color(0x1f6f3f),
      modeButtonDisabledColor: new THREE.Color(0x3a414d),
      hoverHighlightColor: new THREE.Color(0xffffff),
      resetVolumeButtonRadius: sideButtonRadius,
      resetHudButtonRadius: sideButtonRadius,
      exitButtonRadius: sideButtonRadius,
      modeButtonRadius: sideButtonRadius,
      modeButton,
      modeVrIcon,
      modeArIcon,
      cachedPosition: new THREE.Vector3(NaN, NaN, NaN),
      cachedYaw: NaN,
      cachedPitch: NaN,
      cacheDirty: true
    };

    const state = playbackStateRef.current;
    const maxIndex = Math.max(0, state.totalTimepoints - 1);
    const fraction = maxIndex > 0 ? Math.min(Math.max(state.timeIndex / maxIndex, 0), 1) : 0;
    setVrPlaybackProgressFraction(hud, fraction);
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
      transparent: false,
      opacity: 1,
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
    const panelDisplayHeight = VR_CHANNELS_CANVAS_MIN_HEIGHT;
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

    const channelsTranslateMaterial = new THREE.MeshBasicMaterial({
      color: VR_HUD_TRANSLATE_HANDLE_COLOR,
      transparent: true,
      opacity: 0.75,
      depthWrite: false
    });
    channelsTranslateMaterial.depthTest = false;
    const panelTranslateHandle = new THREE.Mesh(
      new THREE.SphereGeometry(VR_HUD_TRANSLATE_HANDLE_RADIUS, 32, 32),
      channelsTranslateMaterial
    );
    panelTranslateHandle.position.set(
      0,
      VR_CHANNELS_PANEL_HEIGHT / 2 + VR_HUD_TRANSLATE_HANDLE_OFFSET,
      0
    );
    panelTranslateHandle.userData.vrUiTarget = { type: 'channels-panel-grab' } satisfies {
      type: VrUiTargetType;
    };
    group.add(panelTranslateHandle);

    const channelsYawMaterial = new THREE.MeshBasicMaterial({
      color: VR_HUD_YAW_HANDLE_COLOR,
      transparent: true,
      opacity: 0.85,
      depthWrite: false
    });
    channelsYawMaterial.depthTest = false;
    const panelYawHandles: THREE.Mesh[] = [];
    for (const direction of [1, -1] as const) {
      const handle = new THREE.Mesh(
        new THREE.SphereGeometry(VR_HUD_YAW_HANDLE_RADIUS, 32, 32),
        channelsYawMaterial.clone()
      );
      handle.position.set(
        direction * (VR_CHANNELS_PANEL_WIDTH / 2 + VR_HUD_YAW_HANDLE_OFFSET),
        0,
        0
      );
      handle.userData.vrUiTarget = { type: 'channels-panel-yaw' } satisfies {
        type: VrUiTargetType;
      };
      group.add(handle);
      panelYawHandles.push(handle);
    }

    const panelPitchHandle = new THREE.Mesh(
      new THREE.SphereGeometry(VR_HUD_YAW_HANDLE_RADIUS, 32, 32),
      channelsYawMaterial.clone()
    );
    panelPitchHandle.position.set(
      0,
      -(VR_CHANNELS_PANEL_HEIGHT / 2 + VR_HUD_YAW_HANDLE_OFFSET),
      0
    );
    panelPitchHandle.userData.vrUiTarget = { type: 'channels-panel-pitch' } satisfies {
      type: VrUiTargetType;
    };
    group.add(panelPitchHandle);

    const hud: VrChannelsHud = {
      group,
      background,
      panel,
      panelTranslateHandle,
      panelYawHandles,
      panelPitchHandle,
      panelTexture,
      panelCanvas,
      panelContext,
      panelDisplayWidth,
      panelDisplayHeight,
      pixelRatio,
      interactables: [panelTranslateHandle, ...panelYawHandles, panelPitchHandle, panel],
      regions: [],
      width: VR_CHANNELS_PANEL_WIDTH,
      height: VR_CHANNELS_PANEL_HEIGHT,
      hoverRegion: null,
      cachedPosition: new THREE.Vector3(NaN, NaN, NaN),
      cachedYaw: NaN,
      cachedPitch: NaN,
      cacheDirty: true
    };

    return hud;
  }, []);

  const resizeVrChannelsHud = useCallback((hud: VrChannelsHud, displayHeight: number) => {
    if (!hud.panelCanvas) {
      return;
    }

    const pixelRatio = hud.pixelRatio || 1;
    hud.panelDisplayHeight = displayHeight;
    hud.panelCanvas.width = Math.round(hud.panelDisplayWidth * pixelRatio);
    hud.panelCanvas.height = Math.round(displayHeight * pixelRatio);

    const newPanelHeight = (hud.width / hud.panelDisplayWidth) * displayHeight;
    hud.height = newPanelHeight;

    const panelGeometry = new THREE.PlaneGeometry(hud.width, newPanelHeight);
    hud.panel.geometry.dispose();
    hud.panel.geometry = panelGeometry;

    const backgroundGeometry = new THREE.PlaneGeometry(hud.width, newPanelHeight);
    hud.background.geometry.dispose();
    hud.background.geometry = backgroundGeometry;

    const halfHeight = newPanelHeight / 2;
    hud.panelTranslateHandle.position.setY(halfHeight + VR_HUD_TRANSLATE_HANDLE_OFFSET);
    hud.panelPitchHandle.position.setY(-(halfHeight + VR_HUD_YAW_HANDLE_OFFSET));
    hud.panelTranslateHandle.updateMatrixWorld();
    hud.panelPitchHandle.updateMatrixWorld();

    hud.cacheDirty = true;
  }, []);

  const createVrTracksHud = useCallback(() => {
    if (typeof document === 'undefined') {
      return null;
    }
    const group = new THREE.Group();
    group.name = 'VrTracksHud';

    const backgroundMaterial = new THREE.MeshBasicMaterial({
      color: 0x10161d,
      transparent: false,
      opacity: 1,
      side: THREE.DoubleSide
    });
    const background = new THREE.Mesh(
      new THREE.PlaneGeometry(VR_TRACKS_PANEL_WIDTH, VR_TRACKS_PANEL_HEIGHT),
      backgroundMaterial
    );
    background.position.set(0, 0, 0);
    group.add(background);

    const panelCanvas = document.createElement('canvas');
    const panelDisplayWidth = VR_TRACKS_CANVAS_WIDTH;
    const panelDisplayHeight = VR_TRACKS_CANVAS_HEIGHT;
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
      new THREE.PlaneGeometry(VR_TRACKS_PANEL_WIDTH, VR_TRACKS_PANEL_HEIGHT),
      panelMaterial
    );
    panel.position.set(0, 0, 0.001);
    panel.userData.vrUiTarget = { type: 'tracks-panel' } satisfies { type: VrUiTargetType };
    group.add(panel);

    const tracksTranslateMaterial = new THREE.MeshBasicMaterial({
      color: VR_HUD_TRANSLATE_HANDLE_COLOR,
      transparent: true,
      opacity: 0.75,
      depthWrite: false
    });
    tracksTranslateMaterial.depthTest = false;
    const panelTranslateHandle = new THREE.Mesh(
      new THREE.SphereGeometry(VR_HUD_TRANSLATE_HANDLE_RADIUS, 32, 32),
      tracksTranslateMaterial
    );
    panelTranslateHandle.position.set(
      0,
      VR_TRACKS_PANEL_HEIGHT / 2 + VR_HUD_TRANSLATE_HANDLE_OFFSET,
      0
    );
    panelTranslateHandle.userData.vrUiTarget = { type: 'tracks-panel-grab' } satisfies { type: VrUiTargetType };
    group.add(panelTranslateHandle);

    const tracksYawMaterial = new THREE.MeshBasicMaterial({
      color: VR_HUD_YAW_HANDLE_COLOR,
      transparent: true,
      opacity: 0.85,
      depthWrite: false
    });
    tracksYawMaterial.depthTest = false;
    const panelYawHandles: THREE.Mesh[] = [];
    for (const direction of [1, -1] as const) {
      const handle = new THREE.Mesh(
        new THREE.SphereGeometry(VR_HUD_YAW_HANDLE_RADIUS, 32, 32),
        tracksYawMaterial.clone()
      );
      handle.position.set(
        direction * (VR_TRACKS_PANEL_WIDTH / 2 + VR_HUD_YAW_HANDLE_OFFSET),
        0,
        0
      );
      handle.userData.vrUiTarget = { type: 'tracks-panel-yaw' } satisfies { type: VrUiTargetType };
      group.add(handle);
      panelYawHandles.push(handle);
    }

    const panelPitchHandle = new THREE.Mesh(
      new THREE.SphereGeometry(VR_HUD_YAW_HANDLE_RADIUS, 32, 32),
      tracksYawMaterial.clone()
    );
    panelPitchHandle.position.set(
      0,
      -(VR_TRACKS_PANEL_HEIGHT / 2 + VR_HUD_YAW_HANDLE_OFFSET),
      0
    );
    panelPitchHandle.userData.vrUiTarget = { type: 'tracks-panel-pitch' } satisfies { type: VrUiTargetType };
    group.add(panelPitchHandle);

    const hud: VrTracksHud = {
      group,
      panel,
      panelTranslateHandle,
      panelYawHandles,
      panelPitchHandle,
      panelTexture,
      panelCanvas,
      panelContext,
      panelDisplayWidth,
      panelDisplayHeight,
      pixelRatio,
      interactables: [panelTranslateHandle, ...panelYawHandles, panelPitchHandle, panel],
      regions: [],
      width: VR_TRACKS_PANEL_WIDTH,
      height: VR_TRACKS_PANEL_HEIGHT,
      hoverRegion: null,
      cachedPosition: new THREE.Vector3(NaN, NaN, NaN),
      cachedYaw: NaN,
      cachedPitch: NaN,
      cacheDirty: true
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
    ctx.fillStyle = 'rgba(16, 22, 29, 1)';
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

      const contentBottom = Math.ceil(currentY + 140);
      ctx.restore();

      const desiredDisplayHeight = Math.max(VR_CHANNELS_CANVAS_MIN_HEIGHT, contentBottom);
      if (Math.abs(desiredDisplayHeight - hud.panelDisplayHeight) > 1) {
        resizeVrChannelsHud(hud, desiredDisplayHeight);
        renderVrChannelsHud(hud, state);
        return;
      }

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
    const tabSpacingX = 18;
    const tabSpacingY = 18;
    const minTabWidth = 160;
    const maxTabWidth = 260;
    let columns = Math.min(3, channels.length);
    while (columns > 1) {
      const candidateWidth = (tabAreaWidth - (columns - 1) * tabSpacingX) / columns;
      if (candidateWidth >= minTabWidth) {
        break;
      }
      columns -= 1;
    }
    columns = Math.max(1, columns);
    const tabWidth = Math.max(
      minTabWidth,
      Math.min(maxTabWidth, (tabAreaWidth - (columns - 1) * tabSpacingX) / columns)
    );
    const tabHeight = 82;
    const totalRows = Math.ceil(channels.length / columns);

    ctx.font = vrChannelsFont('600', VR_CHANNELS_FONT_SIZES.tab);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let index = 0; index < channels.length; index += 1) {
      const channel = channels[index];
      const rowIndex = Math.floor(index / columns);
      const rowStartIndex = rowIndex * columns;
      const itemsInRow = Math.min(columns, channels.length - rowStartIndex);
      const rowWidth = itemsInRow * tabWidth + Math.max(0, itemsInRow - 1) * tabSpacingX;
      const rowStartX = paddingX + Math.max(0, (tabAreaWidth - rowWidth) / 2);
      const columnIndex = index - rowStartIndex;
      const x = rowStartX + columnIndex * (tabWidth + tabSpacingX);
      const y = currentY + rowIndex * (tabHeight + tabSpacingY);
      const isActive = channel.id === activeChannelId;

      drawRoundedRect(ctx, x, y, tabWidth, tabHeight, 20);
      ctx.fillStyle = isActive ? '#2b5fa6' : '#1d2734';
      ctx.fill();
      if (hud.hoverRegion && hud.hoverRegion.targetType === 'channels-tab' && hud.hoverRegion.channelId === channel.id) {
        ctx.save();
        drawRoundedRect(ctx, x, y, tabWidth, tabHeight, 20);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
        ctx.fill();
        ctx.restore();
      }
      ctx.save();
      ctx.beginPath();
      ctx.rect(x + 12, y + 12, tabWidth - 24, tabHeight - 24);
      ctx.clip();
      const labelMetrics = ctx.measureText(channel.name);
      const labelWidth = Math.min(labelMetrics.width + 20, tabWidth - 24);
      const labelHeight = VR_CHANNELS_FONT_SIZES.tab * 1.25;
      const labelCenterX = x + tabWidth / 2;
      const labelCenterY = y + tabHeight / 2;
      const labelMinX = labelCenterX - labelWidth / 2;
      const labelMaxX = labelCenterX + labelWidth / 2;
      const labelMinY = labelCenterY - labelHeight / 2;
      const labelMaxY = labelCenterY + labelHeight / 2;
      const isLabelHover =
        hud.hoverRegion &&
        hud.hoverRegion.targetType === 'channels-visibility' &&
        hud.hoverRegion.channelId === channel.id;

      ctx.fillStyle = channel.visible ? '#f3f6fc' : 'rgba(243, 246, 252, 0.6)';
      if (isLabelHover) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
      }
      ctx.fillText(channel.name, labelCenterX, labelCenterY);
      ctx.restore();

      if (!channel.visible) {
        ctx.save();
        ctx.strokeStyle = 'rgba(243, 246, 252, 0.7)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(labelMinX, labelCenterY);
        ctx.lineTo(labelMaxX, labelCenterY);
        ctx.stroke();
        ctx.restore();
      }

      const labelBounds = {
        minX: toPanelX(labelMinX),
        maxX: toPanelX(labelMaxX),
        minY: Math.min(toPanelY(labelMinY), toPanelY(labelMaxY)),
        maxY: Math.max(toPanelY(labelMinY), toPanelY(labelMaxY))
      };
      regions.push({ targetType: 'channels-visibility', channelId: channel.id, bounds: labelBounds });

      const rectBounds = {
        minX: toPanelX(x),
        maxX: toPanelX(x + tabWidth),
        minY: Math.min(toPanelY(y), toPanelY(y + tabHeight)),
        maxY: Math.max(toPanelY(y), toPanelY(y + tabHeight))
      };
      regions.push({ targetType: 'channels-tab', channelId: channel.id, bounds: rectBounds });
    }

    const totalTabHeight = totalRows * tabHeight + Math.max(0, totalRows - 1) * tabSpacingY;
    currentY += totalTabHeight + 36;

    const selectedLayer =
      activeChannel.layers.find((layer) => layer.key === activeChannel.activeLayerKey) ??
      activeChannel.layers[0] ??
      null;

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    if (selectedLayer) {
      const renderStyleDisabled = !selectedLayer.hasData;
      const invertDisabled = !selectedLayer.hasData || selectedLayer.isSegmentation;
      const renderStyleActive = selectedLayer.settings.renderStyle === 1;
      const samplingDisabled = renderStyleDisabled;
      const samplingActive = selectedLayer.settings.samplingMode === 'nearest';
      const invertActive = selectedLayer.settings.invert;
      const autoContrastDisabled = !selectedLayer.hasData;
      const resetDisabled = activeChannel.layers.length === 0;
      const actionButtonHeight = 60;
      const actionButtonRadius = 16;
      const actionSpacing = 24;
      const availableRowWidth = canvasWidth - paddingX * 2;
      const maxActionButtonWidth = 280;
      const renderSamplingWidth = Math.max(
        0,
        Math.min(maxActionButtonWidth, (availableRowWidth - actionSpacing) / 2)
      );
      const renderRowY = currentY;
      const renderX = paddingX;
      const samplingX = renderX + renderSamplingWidth + actionSpacing;

      drawRoundedRect(ctx, renderX, renderRowY, renderSamplingWidth, actionButtonHeight, actionButtonRadius);
      ctx.fillStyle = renderStyleDisabled ? 'rgba(45, 60, 74, 0.6)' : renderStyleActive ? '#2b5fa6' : '#2b3340';
      ctx.fill();
      if (
        hud.hoverRegion &&
        hud.hoverRegion.targetType === 'channels-render-style' &&
        hud.hoverRegion.channelId === activeChannel.id &&
        hud.hoverRegion.layerKey === selectedLayer.key
      ) {
        ctx.save();
        drawRoundedRect(ctx, renderX, renderRowY, renderSamplingWidth, actionButtonHeight, actionButtonRadius);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
        ctx.fill();
        ctx.restore();
      }

      drawRoundedRect(ctx, samplingX, renderRowY, renderSamplingWidth, actionButtonHeight, actionButtonRadius);
      ctx.fillStyle = samplingDisabled ? 'rgba(45, 60, 74, 0.6)' : samplingActive ? '#2b5fa6' : '#2b3340';
      ctx.fill();
      if (
        hud.hoverRegion &&
        hud.hoverRegion.targetType === 'channels-sampling' &&
        hud.hoverRegion.channelId === activeChannel.id &&
        hud.hoverRegion.layerKey === selectedLayer.key
      ) {
        ctx.save();
        drawRoundedRect(ctx, samplingX, renderRowY, renderSamplingWidth, actionButtonHeight, actionButtonRadius);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
        ctx.fill();
        ctx.restore();
      }

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = vrChannelsFont('600', VR_CHANNELS_FONT_SIZES.small);
      ctx.fillStyle = renderStyleDisabled ? '#7b8795' : '#f3f6fc';
      ctx.fillText('Render style', renderX + renderSamplingWidth / 2, renderRowY + actionButtonHeight / 2);
      ctx.fillStyle = samplingDisabled ? '#7b8795' : '#f3f6fc';
      ctx.fillText('Sampling mode', samplingX + renderSamplingWidth / 2, renderRowY + actionButtonHeight / 2);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';

      const renderBounds = {
        minX: toPanelX(renderX),
        maxX: toPanelX(renderX + renderSamplingWidth),
        minY: Math.min(toPanelY(renderRowY), toPanelY(renderRowY + actionButtonHeight)),
        maxY: Math.max(toPanelY(renderRowY), toPanelY(renderRowY + actionButtonHeight))
      };
      regions.push({
        targetType: 'channels-render-style',
        channelId: activeChannel.id,
        layerKey: selectedLayer.key,
        bounds: renderBounds,
        disabled: renderStyleDisabled
      });

      const samplingBounds = {
        minX: toPanelX(samplingX),
        maxX: toPanelX(samplingX + renderSamplingWidth),
        minY: Math.min(toPanelY(renderRowY), toPanelY(renderRowY + actionButtonHeight)),
        maxY: Math.max(toPanelY(renderRowY), toPanelY(renderRowY + actionButtonHeight))
      };
      regions.push({
        targetType: 'channels-sampling',
        channelId: activeChannel.id,
        layerKey: selectedLayer.key,
        bounds: samplingBounds,
        disabled: samplingDisabled
      });

      const renderRowBottom = renderRowY + actionButtonHeight;
      currentY = renderRowBottom + 32;

      const histogramWidth = canvasWidth - paddingX * 2;
      const histogramHeight = VR_CHANNELS_HISTOGRAM_HEIGHT;
      const histogramX = paddingX;
      const histogramY = currentY;
      const histogramShape = computeHistogramShape(
        selectedLayer.histogram ?? null,
        histogramWidth,
        histogramHeight
      );

      ctx.save();
      drawRoundedRect(ctx, histogramX, histogramY, histogramWidth, histogramHeight, VR_CHANNELS_HISTOGRAM_RADIUS);
      ctx.fillStyle = histogramShape.isEmpty ? 'rgba(17, 23, 34, 0.55)' : 'rgba(17, 23, 34, 0.85)';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.stroke();
      ctx.restore();

      if (!histogramShape.isEmpty) {
        ctx.save();
        drawRoundedRect(
          ctx,
          histogramX,
          histogramY,
          histogramWidth,
          histogramHeight,
          VR_CHANNELS_HISTOGRAM_RADIUS
        );
        ctx.clip();
        ctx.beginPath();
        ctx.moveTo(histogramX, histogramY + histogramHeight);
        for (const point of histogramShape.points) {
          ctx.lineTo(histogramX + point.x, histogramY + point.y);
        }
        ctx.lineTo(histogramX + histogramWidth, histogramY + histogramHeight);
        ctx.closePath();
        ctx.fillStyle = 'rgba(91, 140, 255, 0.35)';
        ctx.strokeStyle = 'rgba(91, 140, 255, 0.9)';
        ctx.lineWidth = 2.4;
        ctx.fill();
        ctx.stroke();

        const mappingPoints = computeHistogramMappingPoints(
          selectedLayer.settings.windowMin,
          selectedLayer.settings.windowMax,
          DEFAULT_WINDOW_MIN,
          DEFAULT_WINDOW_MAX,
          histogramWidth,
          histogramHeight
        );

        if (mappingPoints.length > 1) {
          ctx.beginPath();
          mappingPoints.forEach((point, index) => {
            const px = histogramX + point.x;
            const py = histogramY + point.y;
            if (index === 0) {
              ctx.moveTo(px, py);
            } else {
              ctx.lineTo(px, py);
            }
          });
          ctx.strokeStyle = '#f5f7ff';
          ctx.lineWidth = 3;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.stroke();
        }

        ctx.restore();
      }

      currentY += histogramHeight + 48;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';

      const sliderDefs: VrChannelsSliderDefinition[] = [
        {
          key: 'windowMin',
          label: 'Minimum',
          value: selectedLayer.settings.windowMin,
          min: DEFAULT_WINDOW_MIN,
          max: DEFAULT_WINDOW_MAX,
          step: 0.001,
          formatter: (value: number) => formatNormalizedIntensity(value),
          disabled: !selectedLayer.hasData
        },
        {
          key: 'windowMax',
          label: 'Maximum',
          value: selectedLayer.settings.windowMax,
          min: DEFAULT_WINDOW_MIN,
          max: DEFAULT_WINDOW_MAX,
          step: 0.001,
          formatter: (value: number) => formatNormalizedIntensity(value),
          disabled: !selectedLayer.hasData
        },
        {
          key: 'contrast',
          label: 'Contrast',
          value: selectedLayer.settings.contrastSliderIndex,
          min: 0,
          max: selectedLayer.settings.sliderRange,
          step: 1,
          formatter: (value: number) => {
            const preview = brightnessContrastModel.applyContrast(selectedLayer.settings, value);
            const multiplier = computeContrastMultiplier(preview.windowMin, preview.windowMax);
            return `${formatContrastMultiplier(multiplier)}×`;
          },
          disabled: !selectedLayer.hasData
        },
        {
          key: 'brightness',
          label: 'Brightness',
          value: selectedLayer.settings.brightnessSliderIndex,
          min: 0,
          max: selectedLayer.settings.sliderRange,
          step: 1,
          formatter: (value: number) => {
            const preview = brightnessContrastModel.applyBrightness(selectedLayer.settings, value);
            const center = preview.windowMin + (preview.windowMax - preview.windowMin) / 2;
            return formatNormalizedIntensity(center);
          },
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

      const sliderByKey = new Map(sliderDefs.map((entry) => [entry.key, entry]));

      const drawSliderControl = (
        slider: VrChannelsSliderDefinition,
        x: number,
        width: number,
        top: number
      ): number => {
        ctx.font = vrChannelsFont('500', VR_CHANNELS_FONT_SIZES.body);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillStyle = '#9fb2c8';
        ctx.fillText(slider.label, x, top);
        const valueLabel = slider.formatter(slider.value);
        ctx.textAlign = 'right';
        ctx.fillStyle = '#dce3f1';
        ctx.font = vrChannelsFont('600', VR_CHANNELS_FONT_SIZES.value);
        ctx.fillText(valueLabel, x + width, top);
        ctx.textAlign = 'left';
        ctx.font = vrChannelsFont('500', VR_CHANNELS_FONT_SIZES.body);
        ctx.fillStyle = '#9fb2c8';

        const sliderY = top + 36;
        const sliderHeight = 26;
        const sliderRadius = 14;
        drawRoundedRect(ctx, x, sliderY, width, sliderHeight, sliderRadius);
        ctx.fillStyle = slider.disabled ? 'rgba(45, 60, 74, 0.6)' : '#1f2733';
        ctx.fill();

        const rangeSpan = slider.max - slider.min;
        const knobFraction = rangeSpan <= 1e-5 ? 0 : (slider.value - slider.min) / rangeSpan;
        const clampedFraction = Math.min(Math.max(knobFraction, 0), 1);
        const knobX = x + clampedFraction * width;
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
          drawRoundedRect(ctx, x, sliderY, width, sliderHeight, sliderRadius);
          ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
          ctx.fill();
          ctx.restore();
        }

        const sliderBounds = {
          minX: toPanelX(x),
          maxX: toPanelX(x + width),
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
            minX: toPanelX(x),
            maxX: toPanelX(x + width),
            y: toPanelY(sliderY + sliderHeight / 2)
          },
          disabled: slider.disabled
        });

        return sliderY + sliderHeight;
      };

      const sliderColumnSpacing = 24;
      const sliderColumnWidth = Math.max(
        0,
        (availableRowWidth - sliderColumnSpacing) / 2
      );

      const minSlider = sliderByKey.get('windowMin');
      const maxSlider = sliderByKey.get('windowMax');
      if (minSlider && maxSlider) {
        const rowTop = currentY;
        const minBottom = drawSliderControl(minSlider, paddingX, sliderColumnWidth, rowTop);
        const maxBottom = drawSliderControl(
          maxSlider,
          paddingX + sliderColumnWidth + sliderColumnSpacing,
          sliderColumnWidth,
          rowTop
        );
        currentY = Math.max(minBottom, maxBottom) + 64;
      }

      const brightnessSlider = sliderByKey.get('brightness');
      const contrastSlider = sliderByKey.get('contrast');
      if (brightnessSlider && contrastSlider) {
        const rowTop = currentY;
        const brightnessBottom = drawSliderControl(
          brightnessSlider,
          paddingX,
          sliderColumnWidth,
          rowTop
        );
        const contrastBottom = drawSliderControl(
          contrastSlider,
          paddingX + sliderColumnWidth + sliderColumnSpacing,
          sliderColumnWidth,
          rowTop
        );
        currentY = Math.max(brightnessBottom, contrastBottom) + 64;
      }

      const tripleButtonSpacing = actionSpacing;
      const tripleButtonWidth = Math.max(
        0,
        Math.min(maxActionButtonWidth, (availableRowWidth - tripleButtonSpacing * 2) / 3)
      );
      const resetRowY = currentY;
      const resetX = paddingX;
      const invertX = resetX + tripleButtonWidth + tripleButtonSpacing;
      const autoX = invertX + tripleButtonWidth + tripleButtonSpacing;

      drawRoundedRect(ctx, resetX, resetRowY, tripleButtonWidth, actionButtonHeight, actionButtonRadius);
      ctx.fillStyle = resetDisabled ? 'rgba(45, 60, 74, 0.6)' : '#2b3340';
      ctx.fill();
      if (
        hud.hoverRegion &&
        hud.hoverRegion.targetType === 'channels-reset' &&
        hud.hoverRegion.channelId === activeChannel.id
      ) {
        ctx.save();
        drawRoundedRect(ctx, resetX, resetRowY, tripleButtonWidth, actionButtonHeight, actionButtonRadius);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
        ctx.fill();
        ctx.restore();
      }

      drawRoundedRect(ctx, invertX, resetRowY, tripleButtonWidth, actionButtonHeight, actionButtonRadius);
      ctx.fillStyle = invertDisabled ? 'rgba(45, 60, 74, 0.6)' : invertActive ? '#2b5fa6' : '#2b3340';
      ctx.fill();
      if (
        hud.hoverRegion &&
        hud.hoverRegion.targetType === 'channels-invert' &&
        hud.hoverRegion.channelId === activeChannel.id &&
        hud.hoverRegion.layerKey === selectedLayer.key
      ) {
        ctx.save();
        drawRoundedRect(ctx, invertX, resetRowY, tripleButtonWidth, actionButtonHeight, actionButtonRadius);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
        ctx.fill();
        ctx.restore();
      }

      drawRoundedRect(ctx, autoX, resetRowY, tripleButtonWidth, actionButtonHeight, actionButtonRadius);
      ctx.fillStyle = autoContrastDisabled ? 'rgba(45, 60, 74, 0.6)' : '#2b3340';
      ctx.fill();
      if (
        hud.hoverRegion &&
        hud.hoverRegion.targetType === 'channels-auto-contrast' &&
        hud.hoverRegion.channelId === activeChannel.id &&
        hud.hoverRegion.layerKey === selectedLayer.key
      ) {
        ctx.save();
        drawRoundedRect(ctx, autoX, resetRowY, tripleButtonWidth, actionButtonHeight, actionButtonRadius);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
        ctx.fill();
        ctx.restore();
      }

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = vrChannelsFont('600', VR_CHANNELS_FONT_SIZES.small);
      ctx.fillStyle = resetDisabled ? '#7b8795' : '#f3f6fc';
      ctx.fillText('Reset', resetX + tripleButtonWidth / 2, resetRowY + actionButtonHeight / 2);
      ctx.fillStyle = invertDisabled ? '#7b8795' : '#f3f6fc';
      ctx.fillText('Invert', invertX + tripleButtonWidth / 2, resetRowY + actionButtonHeight / 2);
      ctx.fillStyle = autoContrastDisabled ? '#7b8795' : '#f3f6fc';
      ctx.fillText('Auto', autoX + tripleButtonWidth / 2, resetRowY + actionButtonHeight / 2);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';

      const resetBounds = {
        minX: toPanelX(resetX),
        maxX: toPanelX(resetX + tripleButtonWidth),
        minY: Math.min(toPanelY(resetRowY), toPanelY(resetRowY + actionButtonHeight)),
        maxY: Math.max(toPanelY(resetRowY), toPanelY(resetRowY + actionButtonHeight))
      };
      regions.push({
        targetType: 'channels-reset',
        channelId: activeChannel.id,
        bounds: resetBounds,
        disabled: resetDisabled
      });

      const invertBounds = {
        minX: toPanelX(invertX),
        maxX: toPanelX(invertX + tripleButtonWidth),
        minY: Math.min(toPanelY(resetRowY), toPanelY(resetRowY + actionButtonHeight)),
        maxY: Math.max(toPanelY(resetRowY), toPanelY(resetRowY + actionButtonHeight))
      };
      regions.push({
        targetType: 'channels-invert',
        channelId: activeChannel.id,
        layerKey: selectedLayer.key,
        bounds: invertBounds,
        disabled: invertDisabled
      });

      const autoContrastBounds = {
        minX: toPanelX(autoX),
        maxX: toPanelX(autoX + tripleButtonWidth),
        minY: Math.min(toPanelY(resetRowY), toPanelY(resetRowY + actionButtonHeight)),
        maxY: Math.max(toPanelY(resetRowY), toPanelY(resetRowY + actionButtonHeight))
      };
      regions.push({
        targetType: 'channels-auto-contrast',
        channelId: activeChannel.id,
        layerKey: selectedLayer.key,
        bounds: autoContrastBounds,
        disabled: autoContrastDisabled
      });

      const resetRowBottom = resetRowY + actionButtonHeight;
      currentY = resetRowBottom + 48;

      const xOffsetSlider = sliderByKey.get('xOffset');
      if (xOffsetSlider) {
        const sliderBottom = drawSliderControl(xOffsetSlider, paddingX, availableRowWidth, currentY);
        currentY = sliderBottom + 64;
      }

      const yOffsetSlider = sliderByKey.get('yOffset');
      if (yOffsetSlider) {
        const sliderBottom = drawSliderControl(yOffsetSlider, paddingX, availableRowWidth, currentY);
        currentY = sliderBottom + 64;
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

    const paddingBottom = 72;
    const contentBottom = Math.ceil(currentY + paddingBottom);
    ctx.restore();

    const desiredDisplayHeight = Math.max(VR_CHANNELS_CANVAS_MIN_HEIGHT, contentBottom);
    if (Math.abs(desiredDisplayHeight - hud.panelDisplayHeight) > 1) {
      resizeVrChannelsHud(hud, desiredDisplayHeight);
      renderVrChannelsHud(hud, state);
      return;
    }

    hud.panelTexture.needsUpdate = true;
  }, [resizeVrChannelsHud]);

  const updateVrTracksHud = useCallback(() => {
    const hud = vrTracksHudRef.current;
    if (!hud) {
      return;
    }
    const state = vrTracksStateRef.current;
    renderVrTracksHud(hud, state);
  }, [renderVrTracksHud]);

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

  const resolveTracksRegionFromPoint = useCallback(
    (hud: VrTracksHud, worldPoint: THREE.Vector3): VrTracksInteractiveRegion | null => {
      if (!hud || hud.regions.length === 0) {
        return null;
      }
      vrTracksLocalPointRef.current.copy(worldPoint);
      hud.panel.worldToLocal(vrTracksLocalPointRef.current);
      const localX = vrTracksLocalPointRef.current.x;
      const localY = vrTracksLocalPointRef.current.y;
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

      if (region.sliderKey === 'windowMin') {
        const updated = brightnessContrastModel.applyWindow(
          snappedValue,
          layerState.settings.windowMax
        );
        layerState.settings.windowMin = updated.windowMin;
        layerState.settings.windowMax = updated.windowMax;
        layerState.settings.sliderRange = updated.sliderRange;
        layerState.settings.minSliderIndex = updated.minSliderIndex;
        layerState.settings.maxSliderIndex = updated.maxSliderIndex;
        layerState.settings.brightnessSliderIndex = updated.brightnessSliderIndex;
        layerState.settings.contrastSliderIndex = updated.contrastSliderIndex;
        onLayerWindowMinChange(region.layerKey, updated.windowMin);
      } else if (region.sliderKey === 'windowMax') {
        const updated = brightnessContrastModel.applyWindow(
          layerState.settings.windowMin,
          snappedValue
        );
        layerState.settings.windowMin = updated.windowMin;
        layerState.settings.windowMax = updated.windowMax;
        layerState.settings.sliderRange = updated.sliderRange;
        layerState.settings.minSliderIndex = updated.minSliderIndex;
        layerState.settings.maxSliderIndex = updated.maxSliderIndex;
        layerState.settings.brightnessSliderIndex = updated.brightnessSliderIndex;
        layerState.settings.contrastSliderIndex = updated.contrastSliderIndex;
        onLayerWindowMaxChange(region.layerKey, updated.windowMax);
      } else if (region.sliderKey === 'contrast') {
        const sliderIndex = Math.round(snappedValue);
        const updated = brightnessContrastModel.applyContrast(layerState.settings, sliderIndex);
        layerState.settings.windowMin = updated.windowMin;
        layerState.settings.windowMax = updated.windowMax;
        layerState.settings.sliderRange = updated.sliderRange;
        layerState.settings.minSliderIndex = updated.minSliderIndex;
        layerState.settings.maxSliderIndex = updated.maxSliderIndex;
        layerState.settings.brightnessSliderIndex = updated.brightnessSliderIndex;
        layerState.settings.contrastSliderIndex = updated.contrastSliderIndex;
        onLayerContrastChange(region.layerKey, updated.contrastSliderIndex);
      } else if (region.sliderKey === 'brightness') {
        const sliderIndex = Math.round(snappedValue);
        const updated = brightnessContrastModel.applyBrightness(layerState.settings, sliderIndex);
        layerState.settings.windowMin = updated.windowMin;
        layerState.settings.windowMax = updated.windowMax;
        layerState.settings.sliderRange = updated.sliderRange;
        layerState.settings.minSliderIndex = updated.minSliderIndex;
        layerState.settings.maxSliderIndex = updated.maxSliderIndex;
        layerState.settings.brightnessSliderIndex = updated.brightnessSliderIndex;
        layerState.settings.contrastSliderIndex = updated.contrastSliderIndex;
        onLayerBrightnessChange(region.layerKey, updated.brightnessSliderIndex);
      } else if (region.sliderKey === 'xOffset') {
        layerState.settings.xOffset = snappedValue;
        onLayerOffsetChange(region.layerKey, 'x', snappedValue);
      } else if (region.sliderKey === 'yOffset') {
        layerState.settings.yOffset = snappedValue;
        onLayerOffsetChange(region.layerKey, 'y', snappedValue);
      }

      renderVrChannelsHud(hud, state);
    },
    [
      onLayerWindowMinChange,
      onLayerWindowMaxChange,
      onLayerContrastChange,
      onLayerBrightnessChange,
      onLayerOffsetChange,
      renderVrChannelsHud
    ]
  );

  const applyVrTracksSliderFromPoint = useCallback(
    (region: VrTracksInteractiveRegion, worldPoint: THREE.Vector3) => {
      if (!region || region.disabled || region.targetType !== 'tracks-slider' || !region.sliderTrack) {
        return;
      }
      const hud = vrTracksHudRef.current;
      if (!hud) {
        return;
      }
      sliderLocalPointRef.current.copy(worldPoint);
      hud.panel.worldToLocal(sliderLocalPointRef.current);
      const localX = sliderLocalPointRef.current.x;
      const trackMin = region.sliderTrack.minX;
      const trackMax = region.sliderTrack.maxX;
      const ratio = (localX - trackMin) / Math.max(trackMax - trackMin, 1e-5);
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

      const state = vrTracksStateRef.current;
      const channelState = state.channels.find((entry) => entry.id === region.channelId);
      if (!channelState) {
        return;
      }

      if (region.sliderKey === 'opacity') {
        channelState.opacity = snappedValue;
        onTrackOpacityChange(region.channelId, snappedValue);
      } else if (region.sliderKey === 'lineWidth') {
        channelState.lineWidth = snappedValue;
        onTrackLineWidthChange(region.channelId, snappedValue);
      }

      renderVrTracksHud(hud, state);
    },
    [onTrackLineWidthChange, onTrackOpacityChange, renderVrTracksHud]
  );

  const applyVrTracksScrollFromPoint = useCallback(
    (region: VrTracksInteractiveRegion, worldPoint: THREE.Vector3) => {
      if (
        !region ||
        region.disabled ||
        region.targetType !== 'tracks-scroll' ||
        !region.verticalSliderTrack
      ) {
        return;
      }
      const hud = vrTracksHudRef.current;
      if (!hud) {
        return;
      }
      sliderLocalPointRef.current.copy(worldPoint);
      hud.panel.worldToLocal(sliderLocalPointRef.current);
      const localY = sliderLocalPointRef.current.y;
      const track = region.verticalSliderTrack;
      const trackMin = Math.min(track.minY, track.maxY);
      const trackMax = Math.max(track.minY, track.maxY);
      if (trackMax - trackMin <= 1e-5) {
        return;
      }
      const rawRatio = (localY - trackMin) / (trackMax - trackMin);
      let clampedRatio = Math.min(Math.max(rawRatio, 0), 1);
      if (track.inverted) {
        clampedRatio = 1 - clampedRatio;
      }

      const state = vrTracksStateRef.current;
      const channelState = state.channels.find((entry) => entry.id === region.channelId);
      if (!channelState) {
        return;
      }

      const visibleRows = Math.max(track.visibleRows ?? 0, 1);
      const totalRows = Math.max(track.totalRows ?? 0, 0);
      const maxScrollIndex = Math.max(totalRows - visibleRows, 0);
      let snappedRatio = clampedRatio;
      if (maxScrollIndex > 0) {
        const step = 1 / maxScrollIndex;
        snappedRatio = Math.round(clampedRatio / step) * step;
        snappedRatio = Math.min(Math.max(snappedRatio, 0), 1);
      } else {
        snappedRatio = 0;
      }

      if (Math.abs((channelState.scrollOffset ?? 0) - snappedRatio) <= 1e-4) {
        return;
      }
      channelState.scrollOffset = snappedRatio;
      renderVrTracksHud(hud, state);
    },
    [renderVrTracksHud]
  );

  followedTrackIdRef.current = followedTrackId;

  useEffect(() => {
    playbackStateRef.current.isPlaying = isPlaying;
    playbackStateRef.current.playbackDisabled = playbackDisabled;
    playbackStateRef.current.playbackLabel = playbackLabel;
    playbackStateRef.current.fps = fps;
    playbackStateRef.current.timeIndex = timeIndex;
    playbackStateRef.current.totalTimepoints = totalTimepoints;
    playbackStateRef.current.onTogglePlayback = onTogglePlayback;
    playbackStateRef.current.onTimeIndexChange = onTimeIndexChange;
    playbackStateRef.current.onFpsChange = onFpsChange;
    playbackStateRef.current.passthroughSupported = isVrPassthroughSupported;
    updateVrPlaybackHud();
  }, [
    isPlaying,
    fps,
    onTimeIndexChange,
    onTogglePlayback,
    onFpsChange,
    playbackDisabled,
    playbackLabel,
    timeIndex,
    totalTimepoints,
    isVrPassthroughSupported,
    updateVrPlaybackHud
  ]);

  useEffect(() => {
    xrPassthroughSupportedRef.current = isVrPassthroughSupported;
    playbackStateRef.current.passthroughSupported = isVrPassthroughSupported;
    if (!isVrPassthroughSupported && xrPreferredSessionModeRef.current === 'immersive-ar') {
      setPreferredXrSessionMode('immersive-vr');
    } else {
      updateVrPlaybackHud();
    }
  }, [isVrPassthroughSupported, setPreferredXrSessionMode, updateVrPlaybackHud]);

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
        isSegmentation: layer.isSegmentation,
        defaultWindow: layer.defaultWindow,
        histogram: layer.histogram ?? null,
        settings: {
          sliderRange: layer.settings.sliderRange,
          minSliderIndex: layer.settings.minSliderIndex,
          maxSliderIndex: layer.settings.maxSliderIndex,
          brightnessSliderIndex: layer.settings.brightnessSliderIndex,
          contrastSliderIndex: layer.settings.contrastSliderIndex,
          windowMin: layer.settings.windowMin,
          windowMax: layer.settings.windowMax,
          color: normalizeHexColor(layer.settings.color, DEFAULT_LAYER_COLOR),
          xOffset: layer.settings.xOffset,
          yOffset: layer.settings.yOffset,
          renderStyle: layer.settings.renderStyle,
          invert: layer.settings.invert,
          samplingMode: layer.settings.samplingMode ?? 'linear'
        }
      }))
    }));
    vrChannelsStateRef.current = {
      channels: nextChannels,
      activeChannelId: activeChannelPanelId
    };
    updateVrChannelsHud();
  }, [activeChannelPanelId, channelPanels, updateVrChannelsHud]);

  const tracksByChannel = useMemo(() => {
    const map = new Map<string, TrackDefinition[]>();
    for (const track of tracks) {
      const existing = map.get(track.channelId);
      if (existing) {
        existing.push(track);
      } else {
        map.set(track.channelId, [track]);
      }
    }
    return map;
  }, [tracks]);

  useEffect(() => {
    const previousChannels = new Map(vrTracksStateRef.current.channels.map((channel) => [channel.id, channel]));
    const nextChannels = trackChannels.map((channel) => {
      const tracksForChannel = tracksByChannel.get(channel.id) ?? [];
      const colorMode = channelTrackColorModes[channel.id] ?? { type: 'random' };
      const opacity = trackOpacityByChannel[channel.id] ?? DEFAULT_TRACK_OPACITY;
      const lineWidth = trackLineWidthByChannel[channel.id] ?? DEFAULT_TRACK_LINE_WIDTH;
      let visibleTracks = 0;
      const trackEntries = tracksForChannel.map((track) => {
        const explicitVisible = trackVisibility[track.id] ?? true;
        const isFollowed = followedTrackId === track.id;
        const isSelected = selectedTrackIds.has(track.id);
        if (explicitVisible || isFollowed || isSelected) {
          visibleTracks += 1;
        }
        const color =
          colorMode.type === 'uniform'
            ? normalizeTrackColor(colorMode.color, DEFAULT_TRACK_COLOR)
            : getTrackColorHex(track.id);
        return {
          id: track.id,
          trackNumber: track.trackNumber,
          label: `Track #${track.trackNumber}`,
          color,
          explicitVisible,
          visible: isFollowed || explicitVisible || isSelected,
          isFollowed,
          isSelected
        };
      });
      const followedEntry = trackEntries.find((entry) => entry.isFollowed) ?? null;
      const previous = previousChannels.get(channel.id);
      return {
        id: channel.id,
        name: channel.name,
        opacity,
        lineWidth,
        colorMode,
        totalTracks: tracksForChannel.length,
        visibleTracks,
        followedTrackId: followedEntry ? followedEntry.id : null,
        scrollOffset: Math.min(Math.max(previous?.scrollOffset ?? 0, 0), 1),
        tracks: trackEntries
      };
    });
    const nextState: VrTracksState = {
      channels: nextChannels,
      activeChannelId: activeTrackChannelId
    };
    if (!nextState.activeChannelId || !nextChannels.some((channel) => channel.id === nextState.activeChannelId)) {
      nextState.activeChannelId = nextChannels[0]?.id ?? null;
    }
    vrTracksStateRef.current = nextState;
    updateVrTracksHud();
  }, [
    activeTrackChannelId,
    channelTrackColorModes,
    trackChannels,
    trackLineWidthByChannel,
    trackOpacityByChannel,
    trackVisibility,
    tracksByChannel,
    followedTrackId,
    selectedTrackIds,
    updateVrTracksHud
  ]);

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
    const frame = computeVolumeHudFrame();
    const target = vrHudOffsetTempRef.current;
    if (frame) {
      target.copy(frame.center).addScaledVector(frame.up, VR_PLAYBACK_VERTICAL_OFFSET);
      setHudPlacement(
        vrPlaybackHudPlacementRef,
        vrPlaybackHudDragTargetRef,
        vrPlaybackHudRef,
        target,
        frame.yaw,
        frame.pitch
      );
      return;
    }
    target.copy(VR_PLAYBACK_CAMERA_ANCHOR_OFFSET);
    const q = camera.quaternion;
    const sinYaw = 2 * (q.w * q.y + q.x * q.z);
    const cosYaw = 1 - 2 * (q.y * q.y + q.z * q.z);
    const yaw = Math.atan2(sinYaw, cosYaw);
    const cosValue = Math.cos(yaw);
    const sinValue = Math.sin(yaw);
    const rotatedX = target.x * cosValue - target.z * sinValue;
    const rotatedZ = target.x * sinValue + target.z * cosValue;
    target.set(rotatedX, target.y, rotatedZ);
    target.add(camera.position);
    setHudPlacement(
      vrPlaybackHudPlacementRef,
      vrPlaybackHudDragTargetRef,
      vrPlaybackHudRef,
      target,
      yaw,
      0
    );
  }, [
    cameraRef,
    computeVolumeHudFrame,
    setHudPlacement,
    vrPlaybackHudDragTargetRef,
    vrPlaybackHudPlacementRef,
    vrPlaybackHudRef
  ]);

  const resetVrChannelsHudPlacement = useCallback(() => {
    const camera = cameraRef.current;
    const hud = vrChannelsHudRef.current;
    if (!camera || !hud) {
      return;
    }
    const frame = computeVolumeHudFrame();
    const target = vrHudOffsetTempRef.current;
    if (frame) {
      const lateralDistance =
        VR_PLAYBACK_PANEL_WIDTH / 2 + VR_HUD_LATERAL_MARGIN + VR_CHANNELS_PANEL_WIDTH / 2;
      target
        .copy(frame.center)
        .addScaledVector(frame.right, lateralDistance)
        .addScaledVector(frame.up, VR_CHANNELS_VERTICAL_OFFSET);
      setHudPlacement(
        vrChannelsHudPlacementRef,
        vrChannelsHudDragTargetRef,
        vrChannelsHudRef,
        target,
        frame.yaw,
        frame.pitch
      );
      return;
    }
    target.copy(VR_CHANNELS_CAMERA_ANCHOR_OFFSET);
    const q = camera.quaternion;
    const sinYaw = 2 * (q.w * q.y + q.x * q.z);
    const cosYaw = 1 - 2 * (q.y * q.y + q.z * q.z);
    const yaw = Math.atan2(sinYaw, cosYaw);
    const cosValue = Math.cos(yaw);
    const sinValue = Math.sin(yaw);
    const rotatedX = target.x * cosValue - target.z * sinValue;
    const rotatedZ = target.x * sinValue + target.z * cosValue;
    target.set(rotatedX, target.y, rotatedZ);
    target.add(camera.position);
    setHudPlacement(
      vrChannelsHudPlacementRef,
      vrChannelsHudDragTargetRef,
      vrChannelsHudRef,
      target,
      yaw,
      0
    );
  }, [
    cameraRef,
    computeVolumeHudFrame,
    setHudPlacement,
    vrChannelsHudDragTargetRef,
    vrChannelsHudPlacementRef,
    vrChannelsHudRef
  ]);

  const resetVrTracksHudPlacement = useCallback(() => {
    const camera = cameraRef.current;
    const hud = vrTracksHudRef.current;
    if (!camera || !hud) {
      return;
    }
    const frame = computeVolumeHudFrame();
    const target = vrHudOffsetTempRef.current;
    if (frame) {
      const lateralDistance =
        VR_PLAYBACK_PANEL_WIDTH / 2 + VR_HUD_LATERAL_MARGIN + VR_TRACKS_PANEL_WIDTH / 2;
      target
        .copy(frame.center)
        .addScaledVector(frame.right, -lateralDistance)
        .addScaledVector(frame.up, VR_TRACKS_VERTICAL_OFFSET);
      setHudPlacement(
        vrTracksHudPlacementRef,
        vrTracksHudDragTargetRef,
        vrTracksHudRef,
        target,
        frame.yaw,
        frame.pitch
      );
      return;
    }
    target.copy(VR_TRACKS_CAMERA_ANCHOR_OFFSET);
    const q = camera.quaternion;
    const sinYaw = 2 * (q.w * q.y + q.x * q.z);
    const cosYaw = 1 - 2 * (q.y * q.y + q.z * q.z);
    const yaw = Math.atan2(sinYaw, cosYaw);
    const cosValue = Math.cos(yaw);
    const sinValue = Math.sin(yaw);
    const rotatedX = target.x * cosValue - target.z * sinValue;
    const rotatedZ = target.x * sinValue + target.z * cosValue;
    target.set(rotatedX, target.y, rotatedZ);
    target.add(camera.position);
    setHudPlacement(
      vrTracksHudPlacementRef,
      vrTracksHudDragTargetRef,
      vrTracksHudRef,
      target,
      yaw,
      0
    );
  }, [
    cameraRef,
    computeVolumeHudFrame,
    setHudPlacement,
    vrTracksHudDragTargetRef,
    vrTracksHudPlacementRef,
    vrTracksHudRef
  ]);

  const applyVolumeRootTransform = useCallback(
    (dimensions: { width: number; height: number; depth: number } | null) => {
      const volumeRootGroup = volumeRootGroupRef.current;
      if (!volumeRootGroup) {
        return;
      }

      if (!dimensions) {
        volumeRootCenterOffsetRef.current.set(0, 0, 0);
        volumeRootCenterUnscaledRef.current.set(0, 0, 0);
        volumeRootHalfExtentsRef.current.set(0, 0, 0);
        volumeNormalizationScaleRef.current = 1;
        volumeUserScaleRef.current = 1;
        volumeRootGroup.scale.set(1, 1, 1);
        volumeYawRef.current = 0;
        volumePitchRef.current = 0;
        applyVolumeYawPitch(0, 0);
        return;
      }

      const { width, height, depth } = dimensions;
      const maxDimension = Math.max(width, height, depth);
      if (!Number.isFinite(maxDimension) || maxDimension <= 0) {
        volumeRootCenterOffsetRef.current.set(0, 0, 0);
        volumeRootCenterUnscaledRef.current.set(0, 0, 0);
        volumeRootHalfExtentsRef.current.set(0, 0, 0);
        volumeNormalizationScaleRef.current = 1;
        volumeUserScaleRef.current = 1;
        volumeRootGroup.scale.set(1, 1, 1);
        volumeYawRef.current = 0;
        volumePitchRef.current = 0;
        applyVolumeYawPitch(0, 0);
        return;
      }

      const scale = 1 / maxDimension;
      volumeNormalizationScaleRef.current = scale;
      const clampedUserScale = Math.min(
        VR_VOLUME_MAX_SCALE,
        Math.max(VR_VOLUME_MIN_SCALE, volumeUserScaleRef.current)
      );
      volumeUserScaleRef.current = clampedUserScale;
      const centerUnscaled = volumeRootCenterUnscaledRef.current;
      centerUnscaled.set(width / 2 - 0.5, height / 2 - 0.5, depth / 2 - 0.5);
      const centerOffset = volumeRootCenterOffsetRef.current;
      centerOffset.copy(centerUnscaled).multiplyScalar(scale);
      const halfExtents = volumeRootHalfExtentsRef.current;
      halfExtents.set(
        ((width - 1) / 2) * scale,
        ((height - 1) / 2) * scale,
        ((depth - 1) / 2) * scale
      );

      volumeRootGroup.scale.setScalar(scale * clampedUserScale);
      applyVolumeYawPitch(volumeYawRef.current, volumePitchRef.current);
    },
    [applyVolumeYawPitch, volumeNormalizationScaleRef]
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
    applyVolumeRootTransform(currentDimensionsRef.current);

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

  useEffect(() => {
    const container = containerNode;
    if (!container) {
      return;
    }

    let isDisposed = false;
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

    const applyVrFoveation = (target: number = XR_TARGET_FOVEATION) => {
      const xrManager = renderer.xr as WebXRFoveationManager;
      const setFoveation = xrManager.setFoveation;
      if (typeof setFoveation !== 'function') {
        return;
      }
      if (!xrFoveationAppliedRef.current) {
        const getFoveation = xrManager.getFoveation;
        xrPreviousFoveationRef.current =
          typeof getFoveation === 'function' ? getFoveation() : undefined;
      }
      setFoveation(target);
      xrFoveationAppliedRef.current = true;
    };

    const restoreVrFoveation = () => {
      if (!xrFoveationAppliedRef.current) {
        return;
      }
      const xrManager = renderer.xr as WebXRFoveationManager;
      const setFoveation = xrManager.setFoveation;
      if (typeof setFoveation !== 'function') {
        xrFoveationAppliedRef.current = false;
        xrPreviousFoveationRef.current = undefined;
        return;
      }
      const previous = xrPreviousFoveationRef.current;
      xrFoveationAppliedRef.current = false;
      xrPreviousFoveationRef.current = undefined;
      if (typeof previous === 'number') {
        setFoveation(previous);
      } else {
        setFoveation(0);
      }
    };

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
        entry.touchIndicator.visible = visible;
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
          entry.hudGrabOffsets.tracks = null;
          entry.translateGrabOffset = null;
          entry.volumeRotationState = null;
          entry.hudRotationState = null;
        } else {
          anyVisible = true;
        }
      });
      if (import.meta.env?.DEV) {
        vrLog('[VR] controller visibility', { shouldShow, visibilitySnapshot });
      }
      if (!anyVisible) {
        clearHoverState('controller');
        applyVrPlaybackHoverState(false, false, false, false, false, false, false, false, false);
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

      const touchIndicatorMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.2,
        depthWrite: false
      });
      touchIndicatorMaterial.depthTest = false;
      const touchIndicator = new THREE.Mesh(
        new THREE.SphereGeometry(VR_CONTROLLER_TOUCH_RADIUS, 16, 16),
        touchIndicatorMaterial
      );
      touchIndicator.visible = false;
      controller.add(touchIndicator);

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
        touchIndicator,
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
        hudGrabOffsets: { playback: null, channels: null, tracks: null },
        translateGrabOffset: null,
        scaleGrabOffset: null,
        volumeScaleState: null,
        volumeRotationState: null,
        hudRotationState: null
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
        entry.hudGrabOffsets.tracks = null;
        entry.translateGrabOffset = null;
        entry.scaleGrabOffset = null;
        entry.volumeScaleState = null;
        entry.volumeRotationState = null;
        entry.hudRotationState = null;
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
        entry.hudGrabOffsets.tracks = null;
        entry.translateGrabOffset = null;
        entry.scaleGrabOffset = null;
        entry.volumeScaleState = null;
        entry.volumeRotationState = null;
        entry.hudRotationState = null;
        entry.touchIndicator.visible = false;
        vrLog('[VR] controller disconnected', index);
        refreshControllerVisibility();
        clearHoverState('controller');
      };

      entry.onSelectStart = () => {
        entry.isSelecting = true;
        entry.activeUiTarget = entry.hoverUiTarget;
        entry.hudRotationState = null;
        entry.volumeRotationState = null;
        const activeType = entry.activeUiTarget?.type ?? null;
        const hudCategory = getHudCategoryFromTarget(activeType);
        const renderer = rendererRef.current;
        const camera = cameraRef.current;
        if (
          activeType === 'playback-panel-yaw' ||
          activeType === 'channels-panel-yaw' ||
          activeType === 'tracks-panel-yaw' ||
          activeType === 'playback-panel-pitch' ||
          activeType === 'channels-panel-pitch' ||
          activeType === 'tracks-panel-pitch'
        ) {
          let placement: VrHudPlacement | null = null;
          if (activeType === 'playback-panel-yaw' || activeType === 'playback-panel-pitch') {
            placement = vrPlaybackHudPlacementRef.current;
          } else if (activeType === 'channels-panel-yaw' || activeType === 'channels-panel-pitch') {
            placement = vrChannelsHudPlacementRef.current;
          } else if (activeType === 'tracks-panel-yaw' || activeType === 'tracks-panel-pitch') {
            placement = vrTracksHudPlacementRef.current;
          }
          if (placement && hudCategory) {
            if (
              activeType === 'playback-panel-yaw' ||
              activeType === 'channels-panel-yaw' ||
              activeType === 'tracks-panel-yaw'
            ) {
              const yawVector = vrHudYawVectorRef.current;
              yawVector.copy(entry.rayOrigin).sub(placement.position);
              yawVector.y = 0;
              let initialAngle = placement.yaw;
              const yawBasisForward = new THREE.Vector3();
              const yawBasisRight = new THREE.Vector3();
              computeViewerYawBasis(renderer, camera, yawBasisForward, yawBasisRight);
              if (yawVector.lengthSq() > 1e-6) {
                initialAngle = computeYawAngleForBasis(yawVector, yawBasisForward, yawBasisRight);
              }
              entry.hudRotationState = {
                hud: hudCategory,
                mode: 'yaw',
                initialYaw: placement.yaw,
                initialAngle,
                basisForward: yawBasisForward,
                basisRight: yawBasisRight
              };
            } else {
              const pitchVector = vrHudPitchVectorRef.current;
              pitchVector.copy(entry.rayOrigin).sub(placement.position);
              pitchVector.x = 0;
              let initialAngle = placement.pitch ?? 0;
              const pitchBasisForward = new THREE.Vector3();
              const pitchBasisRight = new THREE.Vector3();
              computeViewerYawBasis(renderer, camera, pitchBasisForward, pitchBasisRight);
              if (pitchVector.lengthSq() > 1e-6) {
                const forwardComponent = pitchVector.dot(pitchBasisForward);
                initialAngle = Math.atan2(pitchVector.y, forwardComponent);
              }
              entry.hudRotationState = {
                hud: hudCategory,
                mode: 'pitch',
                initialPitch: placement.pitch ?? 0,
                initialAngle,
                basisForward: pitchBasisForward
              };
            }
          } else {
            entry.activeUiTarget = null;
          }
        }
        const playbackState = playbackStateRef.current;
        if (entry.activeUiTarget?.type === 'playback-play-toggle' && playbackState.playbackDisabled) {
          entry.activeUiTarget = null;
        }
        if (
          entry.activeUiTarget?.type === 'playback-slider' &&
          entry.hasHoverUiPoint &&
          !playbackState.playbackDisabled
        ) {
          applyPlaybackSliderFromWorldPoint(entry.hoverUiPoint);
        }
        if (
          entry.activeUiTarget?.type === 'playback-fps-slider' &&
          entry.hasHoverUiPoint &&
          playbackState.totalTimepoints > 1
        ) {
          applyFpsSliderFromWorldPoint(entry.hoverUiPoint);
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
            entry.hudGrabOffsets.playback.copy(referencePosition).sub(entry.rayOrigin);
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
            entry.hudGrabOffsets.channels.copy(referencePosition).sub(entry.rayOrigin);
          }
        }
        if (
          entry.activeUiTarget &&
          (entry.activeUiTarget.type === 'tracks-slider' || entry.activeUiTarget.type === 'tracks-scroll') &&
          entry.hasHoverUiPoint &&
          entry.activeUiTarget.data &&
          !(entry.activeUiTarget.data as VrTracksInteractiveRegion).disabled
        ) {
          const region = entry.activeUiTarget.data as VrTracksInteractiveRegion;
          if (entry.activeUiTarget.type === 'tracks-slider') {
            applyVrTracksSliderFromPoint(region, entry.hoverUiPoint);
          } else {
            applyVrTracksScrollFromPoint(region, entry.hoverUiPoint);
          }
        }
        if (entry.activeUiTarget?.type === 'tracks-panel-grab') {
          const hud = vrTracksHudRef.current;
          if (hud) {
            const placement = vrTracksHudPlacementRef.current;
            const referencePosition = vrTracksHudDragTargetRef.current;
            referencePosition.copy(placement?.position ?? hud.group.position);
            if (!entry.hasHoverUiPoint) {
              entry.hoverUiPoint.copy(referencePosition);
              entry.hasHoverUiPoint = true;
            }
            if (!entry.hudGrabOffsets.tracks) {
              entry.hudGrabOffsets.tracks = new THREE.Vector3();
            }
            entry.hudGrabOffsets.tracks.copy(referencePosition).sub(entry.rayOrigin);
          }
        }
        if (entry.activeUiTarget?.type === 'volume-translate-handle') {
          const handle = vrTranslationHandleRef.current;
          if (handle) {
            handle.getWorldPosition(translationHandleWorldPoint);
            if (!entry.translateGrabOffset) {
              entry.translateGrabOffset = new THREE.Vector3();
            }
            entry.translateGrabOffset.copy(translationHandleWorldPoint).sub(entry.rayOrigin);
          }
        } else if (entry.activeUiTarget?.type === 'volume-scale-handle') {
          const handle = vrVolumeScaleHandleRef.current;
          const volumeRootGroup = volumeRootGroupRef.current;
          if (handle && volumeRootGroup) {
            handle.getWorldPosition(scaleHandleWorldPoint);
            if (!entry.scaleGrabOffset) {
              entry.scaleGrabOffset = new THREE.Vector3();
            }
            entry.scaleGrabOffset.copy(scaleHandleWorldPoint).sub(entry.rayOrigin);
            rotationCenterWorldPoint.copy(volumeRootCenterUnscaledRef.current);
            volumeRootGroup.localToWorld(rotationCenterWorldPoint);
            scaleDirectionTemp.copy(scaleHandleWorldPoint).sub(rotationCenterWorldPoint);
            const directionLength = scaleDirectionTemp.length();
            if (directionLength > 1e-6) {
              scaleDirectionTemp.divideScalar(directionLength);
              const userScale = Math.max(volumeUserScaleRef.current, 1e-6);
              const baseLength = directionLength / userScale;
              entry.volumeScaleState = {
                direction: scaleDirectionTemp.clone(),
                baseLength
              };
            } else {
              entry.volumeScaleState = null;
              entry.activeUiTarget = null;
            }
          } else {
            entry.volumeScaleState = null;
            entry.activeUiTarget = null;
          }
        }
        if (
          entry.activeUiTarget?.type === 'volume-yaw-handle' ||
          entry.activeUiTarget?.type === 'volume-pitch-handle'
        ) {
          const volumeRootGroup = volumeRootGroupRef.current;
          if (volumeRootGroup) {
            rotationCenterWorldPoint.copy(volumeRootCenterUnscaledRef.current);
            volumeRootGroup.localToWorld(rotationCenterWorldPoint);
            rotationDirectionTemp.copy(entry.rayOrigin).sub(rotationCenterWorldPoint);
            if (entry.activeUiTarget.type === 'volume-yaw-handle') {
              rotationDirectionTemp.y = 0;
              let initialAngle = volumeYawRef.current;
              const yawBasisForward = new THREE.Vector3();
              const yawBasisRight = new THREE.Vector3();
              computeViewerYawBasis(renderer, camera, yawBasisForward, yawBasisRight);
              if (rotationDirectionTemp.lengthSq() > 1e-6) {
                initialAngle = computeYawAngleForBasis(
                  rotationDirectionTemp,
                  yawBasisForward,
                  yawBasisRight
                );
              }
              entry.volumeRotationState = {
                mode: 'yaw',
                initialYaw: volumeYawRef.current,
                initialAngle,
                basisForward: yawBasisForward,
                basisRight: yawBasisRight
              };
            } else {
              rotationDirectionTemp.x = 0;
              let initialAngle = volumePitchRef.current;
              const pitchBasisForward = new THREE.Vector3();
              const pitchBasisRight = new THREE.Vector3();
              computeViewerYawBasis(renderer, camera, pitchBasisForward, pitchBasisRight);
              if (rotationDirectionTemp.lengthSq() > 1e-6) {
                const forwardComponent = rotationDirectionTemp.dot(pitchBasisForward);
                initialAngle = Math.atan2(rotationDirectionTemp.y, forwardComponent);
              }
              entry.volumeRotationState = {
                mode: 'pitch',
                initialPitch: volumePitchRef.current,
                initialAngle,
                basisForward: pitchBasisForward
              };
            }
          } else {
            entry.activeUiTarget = null;
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
        } else if (activeTarget?.type === 'playback-reset-volume') {
          handleResetVolume();
        } else if (activeTarget?.type === 'playback-reset-hud') {
          handleResetHudPlacement();
        } else if (activeTarget?.type === 'playback-exit-vr') {
          void endVrSession();
        } else if (activeTarget?.type === 'playback-toggle-mode') {
          toggleXrSessionMode();
        } else if (activeTarget?.type === 'playback-slider') {
          if (entry.hasHoverUiPoint && !playbackState.playbackDisabled) {
            applyPlaybackSliderFromWorldPoint(entry.hoverUiPoint);
          }
        } else if (activeTarget?.type === 'playback-fps-slider') {
          if (entry.hasHoverUiPoint && playbackState.totalTimepoints > 1) {
            applyFpsSliderFromWorldPoint(entry.hoverUiPoint);
          }
        } else if (activeTarget?.type === 'playback-panel-grab') {
          entry.hudGrabOffsets.playback = null;
          entry.hudRotationState = null;
        } else if (
          activeTarget?.type === 'playback-panel-yaw' ||
          activeTarget?.type === 'playback-panel-pitch'
        ) {
          entry.hudRotationState = null;
        } else if (activeTarget?.type === 'channels-panel-grab') {
          entry.hudGrabOffsets.channels = null;
          entry.hudRotationState = null;
        } else if (
          activeTarget?.type === 'channels-panel-yaw' ||
          activeTarget?.type === 'channels-panel-pitch'
        ) {
          entry.hudRotationState = null;
        } else if (activeTarget?.type === 'tracks-panel-grab') {
          entry.hudGrabOffsets.tracks = null;
          entry.hudRotationState = null;
        } else if (
          activeTarget?.type === 'tracks-panel-yaw' ||
          activeTarget?.type === 'tracks-panel-pitch'
        ) {
          entry.hudRotationState = null;
        } else if (activeTarget?.type === 'volume-translate-handle') {
          entry.translateGrabOffset = null;
        } else if (activeTarget?.type === 'volume-scale-handle') {
          entry.scaleGrabOffset = null;
          entry.volumeScaleState = null;
        } else if (
          activeTarget?.type === 'volume-yaw-handle' ||
          activeTarget?.type === 'volume-pitch-handle'
        ) {
          entry.volumeRotationState = null;
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
        } else if (
          activeTarget &&
          (activeTarget.type === 'tracks-slider' || activeTarget.type === 'tracks-scroll') &&
          activeTarget.data &&
          !(activeTarget.data as VrTracksInteractiveRegion).disabled &&
          entry.hasHoverUiPoint
        ) {
          const region = activeTarget.data as VrTracksInteractiveRegion;
          if (activeTarget.type === 'tracks-slider') {
            applyVrTracksSliderFromPoint(region, entry.hoverUiPoint);
          } else {
            applyVrTracksScrollFromPoint(region, entry.hoverUiPoint);
          }
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
                  const defaultState = brightnessContrastModel.createState(
                    layer.defaultWindow?.windowMin,
                    layer.defaultWindow?.windowMax
                  );
                  layer.settings.sliderRange = defaultState.sliderRange;
                  layer.settings.minSliderIndex = defaultState.minSliderIndex;
                  layer.settings.maxSliderIndex = defaultState.maxSliderIndex;
                  layer.settings.brightnessSliderIndex = defaultState.brightnessSliderIndex;
                  layer.settings.contrastSliderIndex = defaultState.contrastSliderIndex;
                  layer.settings.windowMin = defaultState.windowMin;
                  layer.settings.windowMax = defaultState.windowMax;
                  layer.settings.xOffset = 0;
                  layer.settings.yOffset = 0;
                  layer.settings.renderStyle = 0;
                  layer.settings.invert = false;
                  layer.settings.samplingMode = 'linear';
                }
              }
              onChannelReset(region.channelId);
            } else if (activeTarget.type === 'channels-layer' && region.layerKey) {
              const channelState = state.channels.find((channel) => channel.id === region.channelId);
              if (channelState) {
                channelState.activeLayerKey = region.layerKey;
              }
              onChannelLayerSelect(region.channelId, region.layerKey);
            } else if (activeTarget.type === 'channels-render-style' && region.layerKey) {
              if (!region.disabled) {
                const channelState = state.channels.find((channel) => channel.id === region.channelId);
                const layerState = channelState?.layers.find((layer) => layer.key === region.layerKey);
                if (layerState) {
                  layerState.settings.renderStyle = layerState.settings.renderStyle === 1 ? 0 : 1;
                }
                onLayerRenderStyleToggle(region.layerKey);
              }
            } else if (activeTarget.type === 'channels-sampling' && region.layerKey) {
              if (!region.disabled) {
                const channelState = state.channels.find((channel) => channel.id === region.channelId);
                const layerState = channelState?.layers.find((layer) => layer.key === region.layerKey);
                if (layerState) {
                  layerState.settings.samplingMode =
                    layerState.settings.samplingMode === 'nearest' ? 'linear' : 'nearest';
                }
                onLayerSamplingModeToggle(region.layerKey);
              }
            } else if (activeTarget.type === 'channels-invert' && region.layerKey) {
              if (!region.disabled) {
                const channelState = state.channels.find((channel) => channel.id === region.channelId);
                const layerState = channelState?.layers.find((layer) => layer.key === region.layerKey);
                if (layerState) {
                  layerState.settings.invert = !layerState.settings.invert;
                }
                onLayerInvertToggle(region.layerKey);
              }
            } else if (activeTarget.type === 'channels-auto-contrast' && region.layerKey) {
              if (!region.disabled) {
                onLayerAutoContrast(region.layerKey);
              }
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
        } else if (
          activeTarget &&
          (activeTarget.type === 'tracks-tab' ||
            activeTarget.type === 'tracks-stop-follow' ||
            activeTarget.type === 'tracks-color' ||
            activeTarget.type === 'tracks-color-mode' ||
            activeTarget.type === 'tracks-master-toggle' ||
            activeTarget.type === 'tracks-toggle' ||
            activeTarget.type === 'tracks-follow')
        ) {
          const region = activeTarget.data as VrTracksInteractiveRegion | undefined;
          const hud = vrTracksHudRef.current;
          const state = vrTracksStateRef.current;
          let visibilityAllTarget: boolean | null = null;
          let didMutate = false;
          if (region && hud) {
            const channelState = state.channels.find((channel) => channel.id === region.channelId);
            if (channelState) {
              switch (activeTarget.type) {
                case 'tracks-tab': {
                  if (state.activeChannelId !== region.channelId) {
                    state.activeChannelId = region.channelId;
                  }
                  didMutate = true;
                  break;
                }
                case 'tracks-stop-follow': {
                  if (!region.disabled) {
                    let changed = channelState.followedTrackId !== null;
                    channelState.followedTrackId = null;
                    for (const trackEntry of channelState.tracks) {
                      if (trackEntry.isFollowed) {
                        changed = true;
                      }
                      trackEntry.isFollowed = false;
                      const nextVisible = trackEntry.explicitVisible;
                      if (trackEntry.visible !== nextVisible) {
                        trackEntry.visible = nextVisible;
                        changed = true;
                      } else {
                        trackEntry.visible = nextVisible;
                      }
                    }
                    if (changed) {
                      didMutate = true;
                    }
                  }
                  break;
                }
                case 'tracks-color': {
                  if (!region.disabled && region.color) {
                    const normalizedColor = normalizeTrackColor(region.color, DEFAULT_TRACK_COLOR);
                    if (
                      channelState.colorMode.type !== 'uniform' ||
                      normalizeTrackColor(channelState.colorMode.color, DEFAULT_TRACK_COLOR) !== normalizedColor
                    ) {
                      channelState.colorMode = { type: 'uniform', color: normalizedColor };
                      didMutate = true;
                    }
                    for (const trackEntry of channelState.tracks) {
                      if (trackEntry.color !== normalizedColor) {
                        trackEntry.color = normalizedColor;
                        didMutate = true;
                      }
                    }
                  }
                  break;
                }
                case 'tracks-color-mode': {
                  if (!region.disabled) {
                    if (channelState.colorMode.type !== 'random') {
                      channelState.colorMode = { type: 'random' };
                      didMutate = true;
                    }
                    for (const trackEntry of channelState.tracks) {
                      const nextColor = getTrackColorHex(trackEntry.id);
                      if (trackEntry.color !== nextColor) {
                        trackEntry.color = nextColor;
                        didMutate = true;
                      }
                    }
                  }
                  break;
                }
                case 'tracks-master-toggle': {
                  if (!region.disabled) {
                    const trackCount = channelState.tracks.length;
                    const enableAll = trackCount > 0 && channelState.visibleTracks < trackCount;
                    visibilityAllTarget = enableAll;
                    channelState.visibleTracks = enableAll ? trackCount : 0;
                    for (const trackEntry of channelState.tracks) {
                      trackEntry.explicitVisible = enableAll;
                      const nextVisible = enableAll || trackEntry.isFollowed;
                      if (trackEntry.visible !== nextVisible) {
                        trackEntry.visible = nextVisible;
                        didMutate = true;
                      } else {
                        trackEntry.visible = nextVisible;
                      }
                    }
                    didMutate = true;
                  }
                  break;
                }
                case 'tracks-toggle': {
                  if (region.trackId) {
                    const trackEntry = channelState.tracks.find((entry) => entry.id === region.trackId);
                    if (trackEntry) {
                      const nextExplicit = !trackEntry.explicitVisible;
                      trackEntry.explicitVisible = nextExplicit;
                      const nextVisible = nextExplicit || trackEntry.isFollowed;
                      if (trackEntry.visible !== nextVisible) {
                        trackEntry.visible = nextVisible;
                      } else {
                        trackEntry.visible = nextVisible;
                      }
                      channelState.visibleTracks = channelState.tracks.reduce(
                        (count, entry) => count + (entry.explicitVisible ? 1 : 0),
                        0
                      );
                      didMutate = true;
                    }
                  }
                  break;
                }
                case 'tracks-follow': {
                  if (region.trackId) {
                    const targetId = region.trackId;
                    let changed = false;
                    for (const channelEntry of state.channels) {
                      let channelFollow: string | null = null;
                      for (const trackEntry of channelEntry.tracks) {
                        const isTarget = trackEntry.id === targetId;
                        if (trackEntry.isFollowed !== isTarget) {
                          trackEntry.isFollowed = isTarget;
                          changed = true;
                        }
                        const nextVisible = trackEntry.explicitVisible || isTarget;
                        if (trackEntry.visible !== nextVisible) {
                          trackEntry.visible = nextVisible;
                          changed = true;
                        } else {
                          trackEntry.visible = nextVisible;
                        }
                        if (isTarget) {
                          channelFollow = trackEntry.id;
                        }
                      }
                      if (channelEntry.followedTrackId !== channelFollow) {
                        channelEntry.followedTrackId = channelFollow;
                        changed = true;
                      }
                    }
                    if (state.activeChannelId !== region.channelId) {
                      state.activeChannelId = region.channelId;
                      changed = true;
                    }
                    if (changed) {
                      didMutate = true;
                    }
                  }
                  break;
                }
                default:
                  break;
              }
              if (didMutate) {
                renderVrTracksHud(hud, state);
              }
            }
          }

          const invokeTrackCallback = () => {
            if (!region) {
              return;
            }
            switch (activeTarget.type) {
              case 'tracks-tab':
                onTrackChannelSelect(region.channelId);
                break;
              case 'tracks-stop-follow':
                if (!region.disabled) {
                  onStopTrackFollow(region.channelId);
                }
                break;
              case 'tracks-color':
                if (!region.disabled && region.color) {
                  onTrackColorSelect(region.channelId, region.color);
                }
                break;
              case 'tracks-color-mode':
                if (!region.disabled) {
                  onTrackColorReset(region.channelId);
                }
                break;
              case 'tracks-master-toggle':
                if (visibilityAllTarget !== null) {
                  onTrackVisibilityAllChange(region.channelId, visibilityAllTarget);
                }
                break;
              case 'tracks-toggle':
                if (region.trackId) {
                  onTrackVisibilityToggle(region.trackId);
                }
                break;
              case 'tracks-follow':
                if (region.trackId) {
                  onTrackFollowRequest(region.trackId);
                }
                break;
              default:
                break;
            }
          };

          invokeTrackCallback();
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
          onTrackSelectionToggle(hitTrackId);
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
    const playbackTouchPoint = new THREE.Vector3();
    const playbackLocalPoint = new THREE.Vector3();
    const playbackPlaneNormal = new THREE.Vector3();
    const playbackSliderPoint = new THREE.Vector3();
    const fpsSliderPoint = new THREE.Vector3();
    const channelsTouchPoint = new THREE.Vector3();
    const channelsLocalPoint = new THREE.Vector3();
    const tracksTouchPoint = new THREE.Vector3();
    const tracksLocalPoint = new THREE.Vector3();
    const translationHandleWorldPoint = new THREE.Vector3();
    const rotationCenterWorldPoint = new THREE.Vector3();
    const rotationDirectionTemp = new THREE.Vector3();
    const rotationHandleWorldPoint = new THREE.Vector3();
    const scaleHandleWorldPoint = new THREE.Vector3();
    const scaleDirectionTemp = new THREE.Vector3();
    const scaleTargetWorldPoint = new THREE.Vector3();

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
        applyVrPlaybackHoverState(false, false, false, false, false, false, false, false, false);
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
      let playbackSliderHoveredAny = false;
      let playbackSliderActiveAny = false;
      let fpsSliderHoveredAny = false;
      let fpsSliderActiveAny = false;
      let resetVolumeHoveredAny = false;
      let resetHudHoveredAny = false;
      let exitHoveredAny = false;
      let modeHoveredAny = false;
      let nextChannelsHoverRegion: VrChannelsInteractiveRegion | null = null;
      let nextTracksHoverRegion: VrTracksInteractiveRegion | null = null;
      let rotationHandleHovered = false;
      let rotationHandleActive = false;

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
        const tracksHudInstance = vrTracksHudRef.current;
        const translationHandleInstance = vrTranslationHandleRef.current;
        const scaleHandleInstance = vrVolumeScaleHandleRef.current;
        const yawHandleInstances = vrVolumeYawHandlesRef.current;
        const pitchHandleInstance = vrVolumePitchHandleRef.current;

        const isActiveTranslate = entry.activeUiTarget?.type === 'volume-translate-handle';
        const isActiveScale = entry.activeUiTarget?.type === 'volume-scale-handle';
        const isActiveYaw = entry.activeUiTarget?.type === 'volume-yaw-handle';
        const isActivePitch = entry.activeUiTarget?.type === 'volume-pitch-handle';
        if (isActiveYaw || isActivePitch) {
          rotationHandleActive = true;
        }

        let handleCandidate: { target: VrUiTarget; point: THREE.Vector3; distance: number } | null = null;

        const considerHandleCandidate = (
          candidate: { target: VrUiTarget; point: THREE.Vector3; distance: number }
        ) => {
          if (!handleCandidate || candidate.distance < handleCandidate.distance) {
            handleCandidate = candidate;
          }
        };

        if (translationHandleInstance && translationHandleInstance.visible) {
          translationHandleInstance.getWorldPosition(translationHandleWorldPoint);
          const distance = translationHandleWorldPoint.distanceTo(entry.rayOrigin);
          if (isActiveTranslate || distance <= VR_UI_TOUCH_DISTANCE) {
            considerHandleCandidate({
              target: { type: 'volume-translate-handle', object: translationHandleInstance },
              point: translationHandleWorldPoint.clone(),
              distance
            });
          }
        }

        if (scaleHandleInstance && scaleHandleInstance.visible) {
          scaleHandleInstance.getWorldPosition(scaleHandleWorldPoint);
          const distance = scaleHandleWorldPoint.distanceTo(entry.rayOrigin);
          if (isActiveScale || distance <= VR_UI_TOUCH_DISTANCE) {
            considerHandleCandidate({
              target: { type: 'volume-scale-handle', object: scaleHandleInstance },
              point: scaleHandleWorldPoint.clone(),
              distance
            });
          }
        }

        if (yawHandleInstances.length > 0) {
          const activeYawObject = isActiveYaw
            ? (entry.activeUiTarget?.object as THREE.Object3D | null)
            : null;
          for (const yawHandle of yawHandleInstances) {
            if (!yawHandle.visible) {
              continue;
            }
            const isActiveHandle = activeYawObject === yawHandle;
            if (!isActiveHandle && activeYawObject) {
              continue;
            }
            yawHandle.getWorldPosition(rotationHandleWorldPoint);
            const distance = rotationHandleWorldPoint.distanceTo(entry.rayOrigin);
            if (distance <= VR_UI_TOUCH_DISTANCE) {
              rotationHandleHovered = true;
            }
            if (isActiveHandle || distance <= VR_UI_TOUCH_DISTANCE) {
              considerHandleCandidate({
                target: { type: 'volume-yaw-handle', object: yawHandle },
                point: rotationHandleWorldPoint.clone(),
                distance
              });
            }
          }
        }

        if (pitchHandleInstance && pitchHandleInstance.visible) {
          pitchHandleInstance.getWorldPosition(rotationHandleWorldPoint);
          const distance = rotationHandleWorldPoint.distanceTo(entry.rayOrigin);
          if (distance <= VR_UI_TOUCH_DISTANCE) {
            rotationHandleHovered = true;
          }
          const isActiveHandle = isActivePitch && entry.activeUiTarget?.object === pitchHandleInstance;
          if (isActiveHandle || (!isActivePitch && distance <= VR_UI_TOUCH_DISTANCE)) {
            considerHandleCandidate({
              target: { type: 'volume-pitch-handle', object: pitchHandleInstance },
              point: rotationHandleWorldPoint.clone(),
              distance
            });
          }
        }

        if (entry.isSelecting && isActiveTranslate) {
          const handle = vrTranslationHandleRef.current;
          const volumeRootGroup = volumeRootGroupRef.current;
          if (handle && volumeRootGroup) {
            const desiredPosition = rotationHandleWorldPoint;
            desiredPosition.copy(entry.rayOrigin);
            if (entry.translateGrabOffset) {
              desiredPosition.add(entry.translateGrabOffset);
            }
            handle.getWorldPosition(translationHandleWorldPoint);
            rotationDirectionTemp.copy(desiredPosition).sub(translationHandleWorldPoint);
            if (rotationDirectionTemp.lengthSq() > 1e-10) {
              volumeRootGroup.position.add(rotationDirectionTemp);
              volumeRootBaseOffsetRef.current.add(rotationDirectionTemp);
              volumeRootGroup.updateMatrixWorld(true);
            }
            handle.getWorldPosition(translationHandleWorldPoint);
            entry.hoverUiPoint.copy(translationHandleWorldPoint);
            entry.hasHoverUiPoint = true;
            const distance = entry.rayOrigin.distanceTo(translationHandleWorldPoint);
            rayLength = Math.min(rayLength, Math.max(0.12, Math.min(distance, 8)));
            if (handleCandidate?.target.type === 'volume-translate-handle') {
              handleCandidate.point = translationHandleWorldPoint.clone();
              handleCandidate.distance = distance;
            }
          }
        }

        if (entry.isSelecting && isActiveScale) {
          const handle = vrVolumeScaleHandleRef.current;
          const volumeRootGroup = volumeRootGroupRef.current;
          const scaleState = entry.volumeScaleState;
          if (!handle || !volumeRootGroup || !scaleState) {
            entry.volumeScaleState = null;
          } else {
            const desiredPosition = scaleTargetWorldPoint;
            desiredPosition.copy(entry.rayOrigin);
            if (entry.scaleGrabOffset) {
              desiredPosition.add(entry.scaleGrabOffset);
            }
            rotationCenterWorldPoint.copy(volumeRootCenterUnscaledRef.current);
            volumeRootGroup.localToWorld(rotationCenterWorldPoint);
            scaleDirectionTemp.copy(desiredPosition).sub(rotationCenterWorldPoint);
            const projection = scaleDirectionTemp.dot(scaleState.direction);
            const minLength = scaleState.baseLength * VR_VOLUME_MIN_SCALE;
            const maxLength = scaleState.baseLength * VR_VOLUME_MAX_SCALE;
            const clampedLength = Math.min(Math.max(projection, minLength), maxLength);
            const safeBaseLength = Math.max(scaleState.baseLength, 1e-6);
            const unclampedScale = clampedLength / safeBaseLength;
            const nextUserScale = Math.min(
              VR_VOLUME_MAX_SCALE,
              Math.max(VR_VOLUME_MIN_SCALE, unclampedScale)
            );
            volumeUserScaleRef.current = nextUserScale;
            const baseScale = volumeNormalizationScaleRef.current;
            volumeRootGroup.scale.setScalar(baseScale * nextUserScale);
            applyVolumeYawPitch(volumeYawRef.current, volumePitchRef.current);
            handle.getWorldPosition(scaleHandleWorldPoint);
            entry.hoverUiPoint.copy(scaleHandleWorldPoint);
            entry.hasHoverUiPoint = true;
            const distance = entry.rayOrigin.distanceTo(scaleHandleWorldPoint);
            rayLength = Math.min(rayLength, Math.max(0.12, Math.min(distance, 8)));
            if (handleCandidate?.target.type === 'volume-scale-handle') {
              handleCandidate.point = scaleHandleWorldPoint.clone();
              handleCandidate.distance = distance;
            }
          }
        }

        if (entry.isSelecting && (isActiveYaw || isActivePitch)) {
          const volumeRootGroup = volumeRootGroupRef.current;
          const rotationState = entry.volumeRotationState;
          if (!volumeRootGroup || !rotationState) {
            entry.volumeRotationState = null;
          } else {
            rotationCenterWorldPoint.copy(volumeRootCenterUnscaledRef.current);
            volumeRootGroup.localToWorld(rotationCenterWorldPoint);
            rotationDirectionTemp.copy(entry.rayOrigin).sub(rotationCenterWorldPoint);
            const tau = Math.PI * 2;
            if (rotationState.mode === 'yaw') {
              rotationDirectionTemp.y = 0;
              if (rotationDirectionTemp.lengthSq() > 1e-8) {
                const currentAngle = computeYawAngleForBasis(
                  rotationDirectionTemp,
                  rotationState.basisForward,
                  rotationState.basisRight
                );
                let delta = currentAngle - rotationState.initialAngle;
                if (delta > Math.PI) {
                  delta -= tau;
                } else if (delta < -Math.PI) {
                  delta += tau;
                }
                const nextYaw = rotationState.initialYaw - delta;
                applyVolumeYawPitch(nextYaw, volumePitchRef.current);
              }
            } else if (rotationState.mode === 'pitch') {
              rotationDirectionTemp.x = 0;
              if (rotationDirectionTemp.lengthSq() > 1e-8) {
                const forwardComponent = rotationDirectionTemp.dot(rotationState.basisForward);
                const currentAngle = Math.atan2(rotationDirectionTemp.y, forwardComponent);
                let delta = currentAngle - rotationState.initialAngle;
                if (delta > Math.PI) {
                  delta -= tau;
                } else if (delta < -Math.PI) {
                  delta += tau;
                }
                const pitchLimit = Math.PI / 2 - 0.05;
                const nextPitch = Math.max(
                  -pitchLimit,
                  Math.min(pitchLimit, rotationState.initialPitch + delta)
                );
                applyVolumeYawPitch(volumeYawRef.current, nextPitch);
              }
            }
            const activeHandle = entry.activeUiTarget?.object as THREE.Object3D | null;
            if (activeHandle) {
              activeHandle.getWorldPosition(rotationHandleWorldPoint);
              entry.hoverUiPoint.copy(rotationHandleWorldPoint);
              entry.hasHoverUiPoint = true;
              const distance = entry.rayOrigin.distanceTo(rotationHandleWorldPoint);
              rayLength = Math.min(rayLength, Math.max(0.12, Math.min(distance, 8)));
              if (
                handleCandidate?.target.type === 'volume-yaw-handle' ||
                handleCandidate?.target.type === 'volume-pitch-handle'
              ) {
                handleCandidate.point = rotationHandleWorldPoint.clone();
                handleCandidate.distance = distance;
              }
            }
          }
        }

        if (handleCandidate) {
          entry.hoverUiTarget = handleCandidate.target;
          entry.hasHoverUiPoint = true;
          entry.hoverUiPoint.copy(handleCandidate.point);
          const candidateDistance = Math.max(0.12, Math.min(handleCandidate.distance, 8));
          rayLength = Math.min(rayLength, candidateDistance);
          hoverTrackId = null;
          if (
            handleCandidate.target.type === 'volume-yaw-handle' ||
            handleCandidate.target.type === 'volume-pitch-handle'
          ) {
            rotationHandleHovered = true;
          }
          nextChannelsHoverRegion = null;
        } else {
          let playbackCandidate: {
            target: VrUiTarget;
            point: THREE.Vector3;
            distance: number;
            region?: null;
          } | null = null;
          let channelsCandidate: {
            target: VrUiTarget;
            point: THREE.Vector3;
            distance: number;
            region: VrChannelsInteractiveRegion | null;
          } | null = null;
          let tracksCandidate: {
            target: VrUiTarget;
            point: THREE.Vector3;
            distance: number;
            region: VrTracksInteractiveRegion | null;
          } | null = null;

          const considerPlaybackCandidate = (
            candidate: { target: VrUiTarget; point: THREE.Vector3; distance: number; region?: null },
            rayDistance: number
          ) => {
            const clampedDistance = Math.max(0.12, Math.min(rayDistance, 8));
            const shouldReplace = !playbackCandidate || candidate.distance < playbackCandidate.distance;
            if (shouldReplace) {
              playbackCandidate = candidate;
              uiRayLength = uiRayLength === null ? clampedDistance : Math.min(uiRayLength, clampedDistance);
            }
            return shouldReplace;
          };

          const considerChannelsCandidate = (
            candidate: {
              target: VrUiTarget;
              point: THREE.Vector3;
              distance: number;
              region: VrChannelsInteractiveRegion | null;
            },
            rayDistance: number
          ) => {
            const clampedDistance = Math.max(0.12, Math.min(rayDistance, 8));
            const shouldReplace = !channelsCandidate || candidate.distance < channelsCandidate.distance;
            if (shouldReplace) {
              channelsCandidate = candidate;
              uiRayLength = uiRayLength === null ? clampedDistance : Math.min(uiRayLength, clampedDistance);
            }
            return shouldReplace;
          };

          const considerTracksCandidate = (
            candidate: {
              target: VrUiTarget;
              point: THREE.Vector3;
              distance: number;
              region: VrTracksInteractiveRegion | null;
            },
            rayDistance: number
          ) => {
            const clampedDistance = Math.max(0.12, Math.min(rayDistance, 8));
            const shouldReplace = !tracksCandidate || candidate.distance < tracksCandidate.distance;
            if (shouldReplace) {
              tracksCandidate = candidate;
              uiRayLength = uiRayLength === null ? clampedDistance : Math.min(uiRayLength, clampedDistance);
            }
            return shouldReplace;
          };

          if (playbackHudInstance && playbackHudInstance.group.visible) {
            const plane = vrHudPlaneRef.current;
            const planePoint = vrHudPlanePointRef.current;
            playbackHudInstance.panel.getWorldPosition(planePoint);
            const planeNormal = vrHudForwardRef.current;
            planeNormal.set(0, 0, 1).applyQuaternion(playbackHudInstance.group.quaternion).normalize();
            plane.setFromNormalAndCoplanarPoint(planeNormal, planePoint);
            const activeType = entry.activeUiTarget?.type ?? null;
            const activePlayback = activeType ? activeType.startsWith('playback-') : false;
            const playbackSliderActive = activeType === 'playback-slider';
            const fpsSliderActive = activeType === 'playback-fps-slider';
            const playbackSliderLocked = playbackSliderActive && entry.isSelecting;
            const fpsSliderLocked = fpsSliderActive && entry.isSelecting;
            const translateHandle = playbackHudInstance.panelTranslateHandle;
            const yawHandles = playbackHudInstance.panelYawHandles;
            const pitchHandle = playbackHudInstance.panelPitchHandle;
            const handleWorldPoint = vrHandleWorldPointRef.current;
            const handleSecondaryPoint = vrHandleSecondaryPointRef.current;

            if (translateHandle && !playbackSliderLocked && !fpsSliderLocked) {
              translateHandle.getWorldPosition(handleWorldPoint);
              const distance = handleWorldPoint.distanceTo(entry.rayOrigin);
              if (activeType === 'playback-panel-grab' || distance <= VR_UI_TOUCH_DISTANCE) {
                considerPlaybackCandidate(
                  {
                    target: { type: 'playback-panel-grab', object: translateHandle },
                    point: handleWorldPoint.clone(),
                    distance,
                    region: null
                  },
                  distance
                );
              }
            }

            if (yawHandles.length > 0 && !playbackSliderLocked && !fpsSliderLocked) {
              const activeYawObject =
                activeType === 'playback-panel-yaw' ? (entry.activeUiTarget?.object as THREE.Object3D | null) : null;
              for (const yawHandle of yawHandles) {
                const isActiveHandle = activeYawObject === yawHandle;
                if (!isActiveHandle && activeYawObject && activeType === 'playback-panel-yaw') {
                  continue;
                }
                yawHandle.getWorldPosition(handleSecondaryPoint);
                const distance = handleSecondaryPoint.distanceTo(entry.rayOrigin);
                if (isActiveHandle || distance <= VR_UI_TOUCH_DISTANCE) {
                  considerPlaybackCandidate(
                    {
                      target: { type: 'playback-panel-yaw', object: yawHandle },
                      point: handleSecondaryPoint.clone(),
                      distance,
                      region: null
                    },
                    distance
                  );
                }
              }
            }

            if (pitchHandle && !playbackSliderLocked && !fpsSliderLocked) {
              pitchHandle.getWorldPosition(handleSecondaryPoint);
              const distance = handleSecondaryPoint.distanceTo(entry.rayOrigin);
              if (
                (activeType === 'playback-panel-pitch' && entry.activeUiTarget?.object === pitchHandle) ||
                (activeType !== 'playback-panel-pitch' && distance <= VR_UI_TOUCH_DISTANCE)
              ) {
                considerPlaybackCandidate(
                  {
                    target: { type: 'playback-panel-pitch', object: pitchHandle },
                    point: handleSecondaryPoint.clone(),
                    distance,
                    region: null
                  },
                  distance
                );
              }
            }

            const denominator = planeNormal.dot(entry.rayDirection);
            if (Math.abs(denominator) > 1e-5) {
              const signedDistance = plane.distanceToPoint(entry.rayOrigin);
              const distanceAlongRay = -signedDistance / denominator;
              if (distanceAlongRay >= 0 && Number.isFinite(distanceAlongRay)) {
                playbackTouchPoint
                  .copy(entry.rayDirection)
                  .multiplyScalar(distanceAlongRay)
                  .add(entry.rayOrigin);
                playbackPlaneNormal.copy(planeNormal);
                playbackLocalPoint.copy(playbackTouchPoint);
                playbackHudInstance.group.worldToLocal(playbackLocalPoint);
                const surfaceMargin = activePlayback
                  ? VR_UI_TOUCH_SURFACE_MARGIN * 1.5
                  : VR_UI_TOUCH_SURFACE_MARGIN;
                const halfWidth = VR_PLAYBACK_PANEL_WIDTH / 2 + surfaceMargin;
                const halfHeight = VR_PLAYBACK_PANEL_HEIGHT / 2 + surfaceMargin;
                if (
                  playbackLocalPoint.x >= -halfWidth &&
                  playbackLocalPoint.x <= halfWidth &&
                  playbackLocalPoint.y >= -halfHeight &&
                  playbackLocalPoint.y <= halfHeight
                ) {
                  const rawDistance = distanceAlongRay;
                  const playbackSliderActive = activeType === 'playback-slider';
                  const fpsSliderActive = activeType === 'playback-fps-slider';
                  const playbackSliderLocked = playbackSliderActive && entry.isSelecting;
                  const fpsSliderLocked = fpsSliderActive && entry.isSelecting;
                  const playbackSliderMargin = playbackSliderActive
                    ? VR_UI_TOUCH_SURFACE_MARGIN * 1.5
                    : VR_UI_TOUCH_SURFACE_MARGIN;
                  const fpsSliderMargin = fpsSliderActive
                    ? VR_UI_TOUCH_SURFACE_MARGIN * 1.5
                    : VR_UI_TOUCH_SURFACE_MARGIN;
                  const playbackSliderHalfWidth =
                    (playbackHudInstance.playbackSliderWidth + 0.04) / 2 + playbackSliderMargin;
                  const playbackSliderHalfHeight = 0.08 / 2 + playbackSliderMargin;
                  const playbackSliderLocalX =
                    playbackLocalPoint.x - playbackHudInstance.playbackSliderGroup.position.x;
                  const playbackSliderLocalY =
                    playbackLocalPoint.y - playbackHudInstance.playbackSliderGroup.position.y;
                  const inPlaybackSliderArea =
                    playbackSliderLocalX >= -playbackSliderHalfWidth &&
                    playbackSliderLocalX <= playbackSliderHalfWidth &&
                    playbackSliderLocalY >= -playbackSliderHalfHeight &&
                    playbackSliderLocalY <= playbackSliderHalfHeight;

                  const fpsSliderHalfWidth =
                    (playbackHudInstance.fpsSliderWidth + 0.04) / 2 + fpsSliderMargin;
                  const fpsSliderHalfHeight = 0.08 / 2 + fpsSliderMargin;
                  const fpsSliderLocalX = playbackLocalPoint.x - playbackHudInstance.fpsSliderGroup.position.x;
                  const fpsSliderLocalY = playbackLocalPoint.y - playbackHudInstance.fpsSliderGroup.position.y;
                  const inFpsSliderArea =
                    fpsSliderLocalX >= -fpsSliderHalfWidth &&
                    fpsSliderLocalX <= fpsSliderHalfWidth &&
                    fpsSliderLocalY >= -fpsSliderHalfHeight &&
                    fpsSliderLocalY <= fpsSliderHalfHeight;
                  const fpsSliderEnabled = playbackStateRef.current.totalTimepoints > 1;

                  const playCenter = playbackHudInstance.playButton.position;
                  const playRadius = 0.045 + surfaceMargin;
                  const playDeltaX = playbackLocalPoint.x - playCenter.x;
                  const playDeltaY = playbackLocalPoint.y - playCenter.y;
                  const inPlayButton =
                    playDeltaX * playDeltaX + playDeltaY * playDeltaY <= playRadius * playRadius;

                  const resetVolumeCenter = playbackHudInstance.resetVolumeButton.position;
                  const resetVolumeRadius = playbackHudInstance.resetVolumeButtonRadius + surfaceMargin;
                  const resetVolumeDeltaX = playbackLocalPoint.x - resetVolumeCenter.x;
                  const resetVolumeDeltaY = playbackLocalPoint.y - resetVolumeCenter.y;
                  const inResetVolumeButton =
                    resetVolumeDeltaX * resetVolumeDeltaX +
                      resetVolumeDeltaY * resetVolumeDeltaY <=
                    resetVolumeRadius * resetVolumeRadius;

                  const resetHudCenter = playbackHudInstance.resetHudButton.position;
                  const resetHudRadius = playbackHudInstance.resetHudButtonRadius + surfaceMargin;
                  const resetHudDeltaX = playbackLocalPoint.x - resetHudCenter.x;
                  const resetHudDeltaY = playbackLocalPoint.y - resetHudCenter.y;
                  const inResetHudButton =
                    resetHudDeltaX * resetHudDeltaX + resetHudDeltaY * resetHudDeltaY <=
                    resetHudRadius * resetHudRadius;

                  const exitCenter = playbackHudInstance.exitButton.position;
                  const exitRadius = playbackHudInstance.exitButtonRadius + surfaceMargin;
                  const exitDeltaX = playbackLocalPoint.x - exitCenter.x;
                  const exitDeltaY = playbackLocalPoint.y - exitCenter.y;
                  const inExitButton =
                    exitDeltaX * exitDeltaX + exitDeltaY * exitDeltaY <= exitRadius * exitRadius;

                  const modeCenter = playbackHudInstance.modeButton.position;
                  const modeRadius = playbackHudInstance.modeButtonRadius + surfaceMargin;
                  const modeDeltaX = playbackLocalPoint.x - modeCenter.x;
                  const modeDeltaY = playbackLocalPoint.y - modeCenter.y;
                  const inModeButton =
                    playbackHudInstance.modeButton.visible &&
                    modeDeltaX * modeDeltaX + modeDeltaY * modeDeltaY <= modeRadius * modeRadius;

                  if (!playbackSliderLocked && !fpsSliderLocked && inResetVolumeButton) {
                    considerPlaybackCandidate(
                      {
                        target: { type: 'playback-reset-volume', object: playbackHudInstance.resetVolumeButton },
                        point: playbackTouchPoint.clone(),
                        distance: rawDistance,
                        region: null
                      },
                      rawDistance
                    );
                  } else if (!playbackSliderLocked && !fpsSliderLocked && inResetHudButton) {
                    considerPlaybackCandidate(
                      {
                        target: { type: 'playback-reset-hud', object: playbackHudInstance.resetHudButton },
                        point: playbackTouchPoint.clone(),
                        distance: rawDistance,
                        region: null
                      },
                      rawDistance
                    );
                  } else if (!playbackSliderLocked && !fpsSliderLocked && inExitButton) {
                    considerPlaybackCandidate(
                      {
                        target: { type: 'playback-exit-vr', object: playbackHudInstance.exitButton },
                        point: playbackTouchPoint.clone(),
                        distance: rawDistance,
                        region: null
                      },
                      rawDistance
                    );
                  } else if (!playbackSliderLocked && !fpsSliderLocked && inModeButton) {
                    considerPlaybackCandidate(
                      {
                        target: { type: 'playback-toggle-mode', object: playbackHudInstance.modeButton },
                        point: playbackTouchPoint.clone(),
                        distance: rawDistance,
                        region: null
                      },
                      rawDistance
                    );
                  } else if (!playbackSliderLocked && !fpsSliderLocked && inPlayButton) {
                    considerPlaybackCandidate(
                      {
                        target: { type: 'playback-play-toggle', object: playbackHudInstance.playButton },
                        point: playbackTouchPoint.clone(),
                        distance: rawDistance,
                        region: null
                      },
                      rawDistance
                    );
                  }

                  if (playbackSliderLocked || inPlaybackSliderArea) {
                    const sliderDepth =
                      playbackHudInstance.playbackSliderGroup.position.z +
                      playbackHudInstance.playbackSliderHitArea.position.z;
                    playbackSliderPoint
                      .copy(playbackTouchPoint)
                      .addScaledVector(playbackPlaneNormal, sliderDepth);
                    considerPlaybackCandidate(
                      {
                        target: {
                          type: 'playback-slider',
                          object: playbackHudInstance.playbackSliderHitArea
                        },
                        point: playbackSliderPoint.clone(),
                        distance: rawDistance,
                        region: null
                      },
                      rawDistance
                    );
                    if (playbackSliderActive && !playbackStateRef.current.playbackDisabled) {
                      applyPlaybackSliderFromWorldPoint(playbackSliderPoint);
                    }
                  }

                  if (fpsSliderEnabled && (fpsSliderLocked || inFpsSliderArea)) {
                    const fpsDepth =
                      playbackHudInstance.fpsSliderGroup.position.z +
                      playbackHudInstance.fpsSliderHitArea.position.z;
                    fpsSliderPoint
                      .copy(playbackTouchPoint)
                      .addScaledVector(playbackPlaneNormal, fpsDepth);
                    considerPlaybackCandidate(
                      {
                        target: { type: 'playback-fps-slider', object: playbackHudInstance.fpsSliderHitArea },
                        point: fpsSliderPoint.clone(),
                        distance: rawDistance,
                        region: null
                      },
                      rawDistance
                    );
                    if (fpsSliderActive) {
                      applyFpsSliderFromWorldPoint(fpsSliderPoint);
                    }
                  }

                  if (!playbackSliderLocked) {
                    considerPlaybackCandidate(
                      {
                        target: { type: 'playback-panel', object: playbackHudInstance.panel },
                        point: playbackTouchPoint.clone(),
                        distance: rawDistance,
                        region: null
                      },
                      rawDistance
                    );
                  }
                }
              }
            }
          }

          if (channelsHudInstance && channelsHudInstance.group.visible) {
            nextChannelsHoverRegion = null;
            const plane = vrHudPlaneRef.current;
            const planePoint = vrHudPlanePointRef.current;
            channelsHudInstance.panel.getWorldPosition(planePoint);
            const planeNormal = vrHudForwardRef.current;
            planeNormal.set(0, 0, 1).applyQuaternion(channelsHudInstance.group.quaternion).normalize();
            plane.setFromNormalAndCoplanarPoint(planeNormal, planePoint);
            const activeType = entry.activeUiTarget?.type ?? null;
            const activeChannels = activeType ? activeType.startsWith('channels-') : false;
            const channelsSliderActive = activeType === 'channels-slider';
            const activeChannelsSliderRegion =
              channelsSliderActive &&
              entry.isSelecting &&
              entry.activeUiTarget?.data &&
              !(entry.activeUiTarget.data as VrChannelsInteractiveRegion).disabled
                ? (entry.activeUiTarget.data as VrChannelsInteractiveRegion)
                : null;
            const channelsSliderLocked = Boolean(activeChannelsSliderRegion);
            const translateHandle = channelsHudInstance.panelTranslateHandle;
            const yawHandles = channelsHudInstance.panelYawHandles;
            const pitchHandle = channelsHudInstance.panelPitchHandle;
            const handleWorldPoint = vrHandleWorldPointRef.current;
            const handleSecondaryPoint = vrHandleSecondaryPointRef.current;

            if (translateHandle && !channelsSliderLocked) {
              translateHandle.getWorldPosition(handleWorldPoint);
              const distance = handleWorldPoint.distanceTo(entry.rayOrigin);
              if (activeType === 'channels-panel-grab' || distance <= VR_UI_TOUCH_DISTANCE) {
                const replaced = considerChannelsCandidate(
                  {
                    target: { type: 'channels-panel-grab', object: translateHandle },
                    point: handleWorldPoint.clone(),
                    distance,
                    region: null
                  },
                  distance
                );
                if (replaced) {
                  nextChannelsHoverRegion = null;
                }
              }
            }

            if (yawHandles.length > 0 && !channelsSliderLocked) {
              const activeYawObject =
                activeType === 'channels-panel-yaw' ? (entry.activeUiTarget?.object as THREE.Object3D | null) : null;
              for (const yawHandle of yawHandles) {
                const isActiveHandle = activeYawObject === yawHandle;
                if (!isActiveHandle && activeYawObject && activeType === 'channels-panel-yaw') {
                  continue;
                }
                yawHandle.getWorldPosition(handleSecondaryPoint);
                const distance = handleSecondaryPoint.distanceTo(entry.rayOrigin);
                if (isActiveHandle || distance <= VR_UI_TOUCH_DISTANCE) {
                  const replaced = considerChannelsCandidate(
                    {
                      target: { type: 'channels-panel-yaw', object: yawHandle },
                      point: handleSecondaryPoint.clone(),
                      distance,
                      region: null
                    },
                    distance
                  );
                  if (replaced) {
                    nextChannelsHoverRegion = null;
                  }
                }
              }
            }

            if (pitchHandle && !channelsSliderLocked) {
              pitchHandle.getWorldPosition(handleSecondaryPoint);
              const distance = handleSecondaryPoint.distanceTo(entry.rayOrigin);
              const isActivePitch =
                activeType === 'channels-panel-pitch' && entry.activeUiTarget?.object === pitchHandle;
              if (isActivePitch || (activeType !== 'channels-panel-pitch' && distance <= VR_UI_TOUCH_DISTANCE)) {
                const replaced = considerChannelsCandidate(
                  {
                    target: { type: 'channels-panel-pitch', object: pitchHandle },
                    point: handleSecondaryPoint.clone(),
                    distance,
                    region: null
                  },
                  distance
                );
                if (replaced) {
                  nextChannelsHoverRegion = null;
                }
              }
            }

            const denominator = planeNormal.dot(entry.rayDirection);
            if (Math.abs(denominator) > 1e-5) {
              const signedDistance = plane.distanceToPoint(entry.rayOrigin);
              const distanceAlongRay = -signedDistance / denominator;
              if (distanceAlongRay >= 0 && Number.isFinite(distanceAlongRay)) {
                channelsTouchPoint
                  .copy(entry.rayDirection)
                  .multiplyScalar(distanceAlongRay)
                  .add(entry.rayOrigin);
                channelsLocalPoint.copy(channelsTouchPoint);
                channelsHudInstance.group.worldToLocal(channelsLocalPoint);
                const surfaceMargin = activeChannels
                  ? VR_UI_TOUCH_SURFACE_MARGIN * 1.5
                  : VR_UI_TOUCH_SURFACE_MARGIN;
                const halfWidth = channelsHudInstance.width / 2 + surfaceMargin;
                const halfHeight = channelsHudInstance.height / 2 + surfaceMargin;
                if (
                  channelsLocalPoint.x >= -halfWidth &&
                  channelsLocalPoint.x <= halfWidth &&
                  channelsLocalPoint.y >= -halfHeight &&
                  channelsLocalPoint.y <= halfHeight
                ) {
                  const rawDistance = distanceAlongRay;
                  let region = resolveChannelsRegionFromPoint(channelsHudInstance, channelsTouchPoint);
                  if (region?.disabled) {
                    region = null;
                  }
                  const isActiveSliderRegion =
                    region &&
                    activeChannelsSliderRegion &&
                    region.targetType === 'channels-slider' &&
                    region === activeChannelsSliderRegion;
                  if (region && (!channelsSliderLocked || isActiveSliderRegion)) {
                    const replaced = considerChannelsCandidate(
                      {
                        target: { type: region.targetType, object: channelsHudInstance.panel, data: region },
                        point: channelsTouchPoint.clone(),
                        distance: rawDistance,
                        region
                      },
                      rawDistance
                    );
                    if (replaced) {
                      nextChannelsHoverRegion = region;
                    }
                    if (channelsSliderActive && region.targetType === 'channels-slider' && isActiveSliderRegion) {
                      applyVrChannelsSliderFromPoint(region, channelsTouchPoint);
                    }
                  }

                  if (channelsSliderLocked && activeChannelsSliderRegion) {
                    const replaced = considerChannelsCandidate(
                      {
                        target: {
                          type: 'channels-slider',
                          object: channelsHudInstance.panel,
                          data: activeChannelsSliderRegion
                        },
                        point: channelsTouchPoint.clone(),
                        distance: rawDistance,
                        region: activeChannelsSliderRegion
                      },
                      rawDistance
                    );
                    if (replaced) {
                      nextChannelsHoverRegion = activeChannelsSliderRegion;
                    }
                    applyVrChannelsSliderFromPoint(activeChannelsSliderRegion, channelsTouchPoint);
                  }

                  if (!channelsSliderLocked) {
                    const replacedPanel = considerChannelsCandidate(
                      {
                        target: { type: 'channels-panel', object: channelsHudInstance.panel },
                        point: channelsTouchPoint.clone(),
                        distance: rawDistance,
                        region: null
                      },
                      rawDistance
                    );
                    if (replacedPanel) {
                      nextChannelsHoverRegion = null;
                    }
                  }
                }
              }
            }
          }

          if (tracksHudInstance && tracksHudInstance.group.visible) {
            nextTracksHoverRegion = null;
            const plane = vrHudPlaneRef.current;
            const planePoint = vrHudPlanePointRef.current;
            tracksHudInstance.panel.getWorldPosition(planePoint);
            const planeNormal = vrHudForwardRef.current;
            planeNormal.set(0, 0, 1).applyQuaternion(tracksHudInstance.group.quaternion).normalize();
            plane.setFromNormalAndCoplanarPoint(planeNormal, planePoint);
            const activeType = entry.activeUiTarget?.type ?? null;
            const activeTracks = activeType ? activeType.startsWith('tracks-') : false;
            const tracksSliderActive = activeType === 'tracks-slider';
            const activeTracksSliderRegion =
              tracksSliderActive &&
              entry.isSelecting &&
              entry.activeUiTarget?.data &&
              !(entry.activeUiTarget.data as VrTracksInteractiveRegion).disabled
                ? (entry.activeUiTarget.data as VrTracksInteractiveRegion)
                : null;
            const tracksSliderLocked = Boolean(activeTracksSliderRegion);
            const translateHandle = tracksHudInstance.panelTranslateHandle;
            const yawHandles = tracksHudInstance.panelYawHandles;
            const pitchHandle = tracksHudInstance.panelPitchHandle;
            const handleWorldPoint = vrHandleWorldPointRef.current;
            const handleSecondaryPoint = vrHandleSecondaryPointRef.current;

            if (translateHandle && !tracksSliderLocked) {
              translateHandle.getWorldPosition(handleWorldPoint);
              const distance = handleWorldPoint.distanceTo(entry.rayOrigin);
              if (activeType === 'tracks-panel-grab' || distance <= VR_UI_TOUCH_DISTANCE) {
                const replaced = considerTracksCandidate(
                  {
                    target: { type: 'tracks-panel-grab', object: translateHandle },
                    point: handleWorldPoint.clone(),
                    distance,
                    region: null
                  },
                  distance
                );
                if (replaced) {
                  nextTracksHoverRegion = null;
                }
              }
            }

            if (yawHandles.length > 0 && !tracksSliderLocked) {
              const activeYawObject =
                activeType === 'tracks-panel-yaw' ? (entry.activeUiTarget?.object as THREE.Object3D | null) : null;
              for (const yawHandle of yawHandles) {
                const isActiveHandle = activeYawObject === yawHandle;
                if (!isActiveHandle && activeYawObject && activeType === 'tracks-panel-yaw') {
                  continue;
                }
                yawHandle.getWorldPosition(handleSecondaryPoint);
                const distance = handleSecondaryPoint.distanceTo(entry.rayOrigin);
                if (isActiveHandle || distance <= VR_UI_TOUCH_DISTANCE) {
                  const replaced = considerTracksCandidate(
                    {
                      target: { type: 'tracks-panel-yaw', object: yawHandle },
                      point: handleSecondaryPoint.clone(),
                      distance,
                      region: null
                    },
                    distance
                  );
                  if (replaced) {
                    nextTracksHoverRegion = null;
                  }
                }
              }
            }

            if (pitchHandle && !tracksSliderLocked) {
              pitchHandle.getWorldPosition(handleSecondaryPoint);
              const distance = handleSecondaryPoint.distanceTo(entry.rayOrigin);
              const isActivePitch =
                activeType === 'tracks-panel-pitch' && entry.activeUiTarget?.object === pitchHandle;
              if (isActivePitch || (activeType !== 'tracks-panel-pitch' && distance <= VR_UI_TOUCH_DISTANCE)) {
                const replaced = considerTracksCandidate(
                  {
                    target: { type: 'tracks-panel-pitch', object: pitchHandle },
                    point: handleSecondaryPoint.clone(),
                    distance,
                    region: null
                  },
                  distance
                );
                if (replaced) {
                  nextTracksHoverRegion = null;
                }
              }
            }

            const denominator = planeNormal.dot(entry.rayDirection);
            if (Math.abs(denominator) > 1e-5) {
              const signedDistance = plane.distanceToPoint(entry.rayOrigin);
              const distanceAlongRay = -signedDistance / denominator;
              if (distanceAlongRay >= 0 && Number.isFinite(distanceAlongRay)) {
                tracksTouchPoint
                  .copy(entry.rayDirection)
                  .multiplyScalar(distanceAlongRay)
                  .add(entry.rayOrigin);
                tracksLocalPoint.copy(tracksTouchPoint);
                tracksHudInstance.group.worldToLocal(tracksLocalPoint);
                const surfaceMargin = activeTracks
                  ? VR_UI_TOUCH_SURFACE_MARGIN * 1.5
                  : VR_UI_TOUCH_SURFACE_MARGIN;
                const halfWidth = tracksHudInstance.width / 2 + surfaceMargin;
                const halfHeight = tracksHudInstance.height / 2 + surfaceMargin;
                if (
                  tracksLocalPoint.x >= -halfWidth &&
                  tracksLocalPoint.x <= halfWidth &&
                  tracksLocalPoint.y >= -halfHeight &&
                  tracksLocalPoint.y <= halfHeight
                ) {
                  const rawDistance = distanceAlongRay;
                  const region = resolveTracksRegionFromPoint(tracksHudInstance, tracksTouchPoint);
                  const isActiveSliderRegion =
                    region &&
                    activeTracksSliderRegion &&
                    region.targetType === 'tracks-slider' &&
                    region === activeTracksSliderRegion;
                  if (region && (!tracksSliderLocked || isActiveSliderRegion)) {
                    const replaced = considerTracksCandidate(
                      {
                        target: { type: region.targetType, object: tracksHudInstance.panel, data: region },
                        point: tracksTouchPoint.clone(),
                        distance: rawDistance,
                        region
                      },
                      rawDistance
                    );
                    if (replaced) {
                      nextTracksHoverRegion = region;
                    }
                    if (entry.isSelecting && entry.activeUiTarget) {
                      if (
                        entry.activeUiTarget.type === 'tracks-slider' &&
                        region.targetType === 'tracks-slider' &&
                        isActiveSliderRegion
                      ) {
                        applyVrTracksSliderFromPoint(region, tracksTouchPoint);
                      } else if (
                        entry.activeUiTarget.type === 'tracks-scroll' &&
                        region.targetType === 'tracks-scroll'
                      ) {
                        applyVrTracksScrollFromPoint(region, tracksTouchPoint);
                      }
                    }
                  }

                  if (tracksSliderLocked && activeTracksSliderRegion) {
                    const replaced = considerTracksCandidate(
                      {
                        target: {
                          type: 'tracks-slider',
                          object: tracksHudInstance.panel,
                          data: activeTracksSliderRegion
                        },
                        point: tracksTouchPoint.clone(),
                        distance: rawDistance,
                        region: activeTracksSliderRegion
                      },
                      rawDistance
                    );
                    if (replaced) {
                      nextTracksHoverRegion = activeTracksSliderRegion;
                    }
                    applyVrTracksSliderFromPoint(activeTracksSliderRegion, tracksTouchPoint);
                  } else if (
                    entry.isSelecting &&
                    entry.activeUiTarget?.type === 'tracks-scroll' &&
                    entry.activeUiTarget.data &&
                    !(entry.activeUiTarget.data as VrTracksInteractiveRegion).disabled
                  ) {
                    const activeRegion = entry.activeUiTarget.data as VrTracksInteractiveRegion;
                    const replaced = considerTracksCandidate(
                      {
                        target: {
                          type: 'tracks-scroll',
                          object: tracksHudInstance.panel,
                          data: activeRegion
                        },
                        point: tracksTouchPoint.clone(),
                        distance: rawDistance,
                        region: activeRegion
                      },
                      rawDistance
                    );
                    if (replaced) {
                      nextTracksHoverRegion = activeRegion;
                    }
                    applyVrTracksScrollFromPoint(activeRegion, tracksTouchPoint);
                  }

                  if (!tracksSliderLocked) {
                    const replacedPanel = considerTracksCandidate(
                      {
                        target: { type: 'tracks-panel', object: tracksHudInstance.panel },
                        point: tracksTouchPoint.clone(),
                        distance: rawDistance,
                        region: null
                      },
                      rawDistance
                    );
                    if (replacedPanel) {
                      nextTracksHoverRegion = null;
                    }
                  }
                }
              }
            }
          }

          let chosenCandidate: {
            target: VrUiTarget;
            point: THREE.Vector3;
            distance: number;
            region?: VrChannelsInteractiveRegion | VrTracksInteractiveRegion | null;
          } | null = null;
          const candidateList: Array<{
            target: VrUiTarget;
            point: THREE.Vector3;
            distance: number;
            region?: VrChannelsInteractiveRegion | VrTracksInteractiveRegion | null;
          }> = [];
          if (playbackCandidate) {
            candidateList.push(playbackCandidate);
          }
          if (channelsCandidate) {
            candidateList.push(channelsCandidate);
          }
          if (tracksCandidate) {
            candidateList.push(tracksCandidate);
          }
          if (candidateList.length > 0) {
            chosenCandidate = candidateList.reduce((best, current) =>
              current.distance < best.distance ? current : best
            );
          }

          if (chosenCandidate) {
            entry.hoverUiTarget = chosenCandidate.target;
            entry.hasHoverUiPoint = true;
            entry.hoverUiPoint.copy(chosenCandidate.point);
            const candidateDistance = Math.max(0.12, Math.min(chosenCandidate.distance, 8));
            uiRayLength =
              uiRayLength === null ? candidateDistance : Math.min(uiRayLength, candidateDistance);
            if (
              chosenCandidate.target.type.startsWith('channels-') &&
              chosenCandidate.region
            ) {
              nextChannelsHoverRegion = chosenCandidate.region;
            } else if (
              chosenCandidate.target.type.startsWith('tracks-') &&
              chosenCandidate.region
            ) {
              nextTracksHoverRegion = chosenCandidate.region as VrTracksInteractiveRegion;
            }
          }
        }

        const uiType = entry.hoverUiTarget ? entry.hoverUiTarget.type : null;
        if (uiType === 'playback-play-toggle') {
          playHoveredAny = true;
          hoverTrackId = null;
        } else if (uiType === 'playback-slider') {
          playbackSliderHoveredAny = true;
        } else if (uiType === 'playback-fps-slider') {
          fpsSliderHoveredAny = true;
        } else if (
          uiType === 'playback-panel-grab' ||
          uiType === 'playback-panel' ||
          uiType === 'playback-panel-yaw' ||
          uiType === 'playback-panel-pitch'
        ) {
          hoverTrackId = null;
        } else if (uiType === 'playback-reset-volume') {
          resetVolumeHoveredAny = true;
          hoverTrackId = null;
        } else if (uiType === 'playback-reset-hud') {
          resetHudHoveredAny = true;
          hoverTrackId = null;
        } else if (uiType === 'playback-exit-vr') {
          exitHoveredAny = true;
          hoverTrackId = null;
        } else if (uiType === 'playback-toggle-mode') {
          modeHoveredAny = true;
          hoverTrackId = null;
        } else if (
          uiType === 'volume-translate-handle' ||
          uiType === 'volume-scale-handle' ||
          uiType === 'volume-yaw-handle' ||
          uiType === 'volume-pitch-handle'
        ) {
          hoverTrackId = null;
        } else if (uiType && uiType.startsWith('tracks-')) {
          hoverTrackId = null;
        }
        if (entry.activeUiTarget?.type === 'playback-slider') {
          playbackSliderActiveAny = true;
          hoverTrackId = null;
        } else if (entry.activeUiTarget?.type === 'playback-fps-slider') {
          fpsSliderActiveAny = true;
          hoverTrackId = null;
        } else if (entry.activeUiTarget?.type === 'playback-reset-volume') {
          resetVolumeHoveredAny = true;
          hoverTrackId = null;
        } else if (entry.activeUiTarget?.type === 'playback-reset-hud') {
          resetHudHoveredAny = true;
          hoverTrackId = null;
        } else if (entry.activeUiTarget?.type === 'playback-exit-vr') {
          exitHoveredAny = true;
          hoverTrackId = null;
        } else if (entry.activeUiTarget?.type === 'playback-toggle-mode') {
          modeHoveredAny = true;
          hoverTrackId = null;
        }
        if (
          entry.activeUiTarget?.type === 'playback-panel-grab' ||
          entry.activeUiTarget?.type === 'playback-panel-yaw' ||
          entry.activeUiTarget?.type === 'playback-panel-pitch' ||
          entry.activeUiTarget?.type === 'channels-panel-grab' ||
          entry.activeUiTarget?.type === 'channels-panel-yaw' ||
          entry.activeUiTarget?.type === 'channels-panel-pitch' ||
          entry.activeUiTarget?.type === 'tracks-panel-grab' ||
          entry.activeUiTarget?.type === 'tracks-panel-yaw' ||
          entry.activeUiTarget?.type === 'tracks-panel-pitch'
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
          newPosition.copy(entry.rayOrigin);
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
          newPosition.copy(entry.rayOrigin);
          if (entry.hudGrabOffsets.channels) {
            newPosition.add(entry.hudGrabOffsets.channels);
          }
          setVrChannelsHudPlacementPosition(newPosition);
        }

        if (
          entry.isSelecting &&
          entry.activeUiTarget?.type === 'tracks-panel-grab' &&
          tracksHudInstance &&
          entry.hasHoverUiPoint
        ) {
          const newPosition = vrTracksHudDragTargetRef.current;
          newPosition.copy(entry.rayOrigin);
          if (entry.hudGrabOffsets.tracks) {
            newPosition.add(entry.hudGrabOffsets.tracks);
          }
          setVrTracksHudPlacementPosition(newPosition);
        }

        if (entry.isSelecting && entry.hudRotationState) {
          const rotationState = entry.hudRotationState;
          const expectedTargetType = `${rotationState.hud}-panel-${rotationState.mode}` as VrUiTargetType;
          if (entry.activeUiTarget?.type !== expectedTargetType) {
            entry.hudRotationState = null;
          } else {
            let placement: VrHudPlacement | null = null;
            let applyYaw: ((nextYaw: number) => void) | null = null;
            let applyPitch: ((nextPitch: number) => void) | null = null;
            if (rotationState.hud === 'playback') {
              placement = vrPlaybackHudPlacementRef.current;
              if (rotationState.mode === 'yaw') {
                applyYaw = setVrPlaybackHudPlacementYaw;
              } else {
                applyPitch = setVrPlaybackHudPlacementPitch;
              }
            } else if (rotationState.hud === 'channels') {
              placement = vrChannelsHudPlacementRef.current;
              if (rotationState.mode === 'yaw') {
                applyYaw = setVrChannelsHudPlacementYaw;
              } else {
                applyPitch = setVrChannelsHudPlacementPitch;
              }
            } else if (rotationState.hud === 'tracks') {
              placement = vrTracksHudPlacementRef.current;
              if (rotationState.mode === 'yaw') {
                applyYaw = setVrTracksHudPlacementYaw;
              } else {
                applyPitch = setVrTracksHudPlacementPitch;
              }
            }
            if (placement && (applyYaw || applyPitch)) {
              if (rotationState.mode === 'yaw' && applyYaw) {
                const yawVector = vrHudYawVectorRef.current;
                yawVector.copy(entry.rayOrigin).sub(placement.position);
                yawVector.y = 0;
                if (yawVector.lengthSq() > 1e-6) {
                  const currentAngle = computeYawAngleForBasis(
                    yawVector,
                    rotationState.basisForward,
                    rotationState.basisRight
                  );
                  let delta = currentAngle - rotationState.initialAngle;
                  const tau = Math.PI * 2;
                  if (delta > Math.PI) {
                    delta -= tau;
                  } else if (delta < -Math.PI) {
                    delta += tau;
                  }
                  const nextYaw = rotationState.initialYaw - delta;
                  applyYaw(nextYaw);
                }
              } else if (rotationState.mode === 'pitch' && applyPitch) {
                const pitchVector = vrHudPitchVectorRef.current;
                pitchVector.copy(entry.rayOrigin).sub(placement.position);
                pitchVector.x = 0;
                if (pitchVector.lengthSq() > 1e-6) {
                  const forwardComponent = pitchVector.dot(rotationState.basisForward);
                  const currentAngle = Math.atan2(pitchVector.y, forwardComponent);
                  let delta = currentAngle - rotationState.initialAngle;
                  const tau = Math.PI * 2;
                  if (delta > Math.PI) {
                    delta -= tau;
                  } else if (delta < -Math.PI) {
                    delta += tau;
                  }
                  const pitchLimit = Math.PI / 2 - 0.05;
                  const nextPitch = Math.max(
                    -pitchLimit,
                    Math.min(pitchLimit, rotationState.initialPitch + delta)
                  );
                  applyPitch(nextPitch);
                }
              }
            } else {
              entry.hudRotationState = null;
            }
          }
        }

        if (visibleLines.length > 0 && cameraInstance) {
          const raycastCamera = renderer.xr.isPresenting
            ? renderer.xr.getCamera(cameraInstance)
            : cameraInstance;
          entry.raycaster.camera = raycastCamera as unknown as THREE.Camera;
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

      applyVrPlaybackHoverState(
        playHoveredAny,
        playbackSliderHoveredAny,
        playbackSliderActiveAny,
        fpsSliderHoveredAny,
        fpsSliderActiveAny,
        resetVolumeHoveredAny,
        resetHudHoveredAny,
        exitHoveredAny,
        modeHoveredAny
      );

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

      const tracksHudInstance = vrTracksHudRef.current;
      const isSameTracksRegion = (
        a: VrTracksInteractiveRegion | null,
        b: VrTracksInteractiveRegion | null
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
          a.trackId === b.trackId &&
          a.sliderKey === b.sliderKey &&
          a.color === b.color
        );
      };
      if (tracksHudInstance && !isSameTracksRegion(tracksHudInstance.hoverRegion, nextTracksHoverRegion)) {
        tracksHudInstance.hoverRegion = nextTracksHoverRegion;
        renderVrTracksHud(tracksHudInstance, vrTracksStateRef.current);
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
      applyVrFoveation();
      applyVolumeStepScaleToResources(VR_VOLUME_STEP_SCALE);
      volumeRootBaseOffsetRef.current.copy(VR_VOLUME_BASE_OFFSET);
      applyVolumeRootTransform(currentDimensionsRef.current);
      refreshControllerVisibility();
      setVrPlaybackHudVisible(true);
      setVrChannelsHudVisible(true);
      setVrTracksHudVisible(true);
      resetVrPlaybackHudPlacement();
      resetVrChannelsHudPlacement();
      resetVrTracksHudPlacement();
      updateVrPlaybackHud();
      updateVrChannelsHud();
      updateVrTracksHud();
      updateControllerRays();
      updateVolumeHandles();
      handleResize();
    };

    const handleXrManagerSessionEnd = () => {
      vrLog('[VR] sessionend event', {
        presenting: renderer.xr.isPresenting,
        visibilityState: xrSessionRef.current?.visibilityState ?? null
      });
      restoreVrFoveation();
      applyVolumeStepScaleToResources(DESKTOP_VOLUME_STEP_SCALE);
      volumeRootBaseOffsetRef.current.set(0, 0, 0);
      applyVolumeRootTransform(currentDimensionsRef.current);
      refreshControllerVisibility();
      setVrPlaybackHudVisible(false);
      setVrChannelsHudVisible(false);
      setVrTracksHudVisible(false);
      updateVolumeHandles();
      handleResize();
    };

    renderer.xr.addEventListener('sessionstart', handleXrManagerSessionStart);
    renderer.xr.addEventListener('sessionend', handleXrManagerSessionEnd);

    rendererRef.current = renderer;
    sceneRef.current = scene;
    cameraRef.current = camera;
    resetVrPlaybackHudPlacement();
    resetVrChannelsHudPlacement();
    resetVrTracksHudPlacement();

    const handleSessionEnd = () => {
      vrLog('[VR] handleSessionEnd', {
        presenting: renderer.xr.isPresenting,
        visibilityState: xrSessionRef.current?.visibilityState ?? null
      });
      restoreVrFoveation();
      applyVolumeStepScaleToResources(DESKTOP_VOLUME_STEP_SCALE);
      sessionCleanupRef.current = null;
      xrSessionRef.current = null;
      xrCurrentSessionModeRef.current = null;
      playbackStateRef.current.currentSessionMode = null;
      updateVrPlaybackHud();
      volumeRootBaseOffsetRef.current.set(0, 0, 0);
      applyVolumeRootTransform(currentDimensionsRef.current);
      setControllerVisibility(false);
      setVrPlaybackHudVisible(false);
      setVrChannelsHudVisible(false);
      setVrTracksHudVisible(false);
      applyVrPlaybackHoverState(false, false, false, false, false, false, false, false, false);
      for (const entry of controllersRef.current) {
        entry.ray.scale.set(1, 1, 1);
        entry.hudGrabOffsets.playback = null;
        entry.hudGrabOffsets.channels = null;
        entry.hudGrabOffsets.tracks = null;
        entry.translateGrabOffset = null;
        entry.scaleGrabOffset = null;
        entry.volumeScaleState = null;
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
      const pendingMode = xrPendingModeSwitchRef.current;
      xrPendingModeSwitchRef.current = null;
      if (!isDisposed) {
        onVrSessionEnded?.();
        if (pendingMode) {
          vrLog('[VR] restarting session to honor pending mode switch', { mode: pendingMode });
          void requestVrSession().catch((error) => {
            console.error('Failed to restart XR session after mode switch', error);
          });
        }
      }
    };

    const requestVrSession = async () => {
      if (xrSessionRef.current) {
        return xrSessionRef.current;
      }
      if (typeof navigator === 'undefined' || !navigator.xr) {
        throw new Error('WebXR not available');
      }
      const preferredMode = xrPreferredSessionModeRef.current;
      const attemptedModes: Array<'immersive-vr' | 'immersive-ar'> = [];
      if (preferredMode === 'immersive-ar' && xrPassthroughSupportedRef.current) {
        attemptedModes.push('immersive-ar');
      }
      attemptedModes.push('immersive-vr');
      if (!attemptedModes.includes('immersive-ar') && xrPassthroughSupportedRef.current) {
        attemptedModes.push('immersive-ar');
      }

      let session: XRSession | null = null;
      let resolvedMode: 'immersive-vr' | 'immersive-ar' | null = null;
      let lastError: unknown = null;
      for (const mode of attemptedModes) {
        try {
          vrLog('[VR] requestSession → navigator.xr.requestSession', { mode });
          const requestedSession = await navigator.xr.requestSession(mode, {
            optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking']
          });
          session = requestedSession;
          resolvedMode = mode;
          break;
        } catch (error) {
          lastError = error;
          if (mode === 'immersive-ar') {
            console.warn('Failed to start immersive-ar session; falling back to immersive-vr.', error);
            setPreferredXrSessionMode('immersive-vr');
          } else {
            console.warn('Failed to start immersive-vr session', error);
          }
        }
      }

      if (!session || !resolvedMode) {
        throw lastError ?? new Error('Failed to start XR session');
      }

      vrLog('[VR] requestSession resolved', {
        presenting: renderer.xr.isPresenting,
        visibilityState: session.visibilityState,
        mode: resolvedMode
      });
      xrSessionRef.current = session;
      xrCurrentSessionModeRef.current = resolvedMode;
      playbackStateRef.current.currentSessionMode = resolvedMode;
      if (resolvedMode !== xrPreferredSessionModeRef.current) {
        setPreferredXrSessionMode(resolvedMode);
      } else {
        updateVrPlaybackHud();
      }
      xrPendingModeSwitchRef.current = null;

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
      applyVrFoveation();
      volumeRootBaseOffsetRef.current.copy(VR_VOLUME_BASE_OFFSET);
      applyVolumeRootTransform(currentDimensionsRef.current);
      setVrPlaybackHudVisible(true);
      setVrChannelsHudVisible(true);
      setVrTracksHudVisible(true);
      updateVrPlaybackHud();
      updateVrChannelsHud();
      updateVrTracksHud();
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

      refreshVrHudPlacements();

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
      restoreVrFoveation();
      applyVolumeStepScaleToResources(DESKTOP_VOLUME_STEP_SCALE);
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
            if (Array.isArray(mesh.material)) {
              mesh.material.forEach((material) => material?.dispose?.());
            } else if (mesh.material) {
              mesh.material.dispose?.();
            }
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
        entry.controller.remove(entry.touchIndicator);
        entry.touchIndicator.geometry?.dispose?.();
        (entry.touchIndicator.material as THREE.Material)?.dispose?.();
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
    };
  }, [
    applyTrackGroupTransform,
    applyVolumeRootTransform,
    containerNode,
    onRegisterVrSession,
    onVrSessionEnded,
    onVrSessionStarted,
    updateVolumeHandles,
    refreshVrHudPlacements,
    toggleXrSessionMode
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
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!scene || !camera || !controls) {
      removeAllVolumeLayers();
      currentDimensionsRef.current = null;
      applyVolumeRootTransform(null);
      return;
    }

    const referenceVolume = primaryVolume;

    if (!referenceVolume) {
      removeAllVolumeLayers();
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
      removeAllVolumeLayers();
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

    layers.forEach((layer, index) => {
      const resource = upsertVolumeLayer({ layer, index });
      if (resource) {
        seenKeys.add(layer.key);
      }
    });

    for (const key of Array.from(resourcesRef.current.keys())) {
      if (!seenKeys.has(key)) {
        removeVolumeLayer(key);
      }
    }

  }, [
    applyTrackGroupTransform,
    applyVolumeStepScaleToResources,
    removeAllVolumeLayers,
    removeVolumeLayer,
    upsertVolumeLayer,
    layers,
    renderContextRevision
  ]);

  useEffect(() => {
    return () => {
      clearColormap();
    };
  }, [clearColormap]);

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
