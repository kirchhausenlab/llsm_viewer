import type * as THREE from 'three';

import type { TrackColorMode } from '../../../types/tracks';

export type VrUiTargetType =
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
  | 'channels-render-style'
  | 'channels-sampling'
  | 'channels-invert'
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

export type VrUiTarget = { type: VrUiTargetType; object: THREE.Object3D; data?: unknown };

export type PlaybackState = {
  isPlaying: boolean;
  playbackDisabled: boolean;
  playbackLabel: string;
  fps: number;
  timeIndex: number;
  totalTimepoints: number;
  onTogglePlayback: () => void;
  onTimeIndexChange: (nextIndex: number) => void;
  onFpsChange: (value: number) => void;
  passthroughSupported: boolean;
  preferredSessionMode: 'immersive-vr' | 'immersive-ar';
  currentSessionMode: 'immersive-vr' | 'immersive-ar' | null;
};

export type PlaybackLoopState = { lastTimestamp: number | null; accumulator: number };

export type VrHoverState = {
  play: boolean;
  playbackSlider: boolean;
  playbackSliderActive: boolean;
  fpsSlider: boolean;
  fpsSliderActive: boolean;
  resetVolume: boolean;
  resetHud: boolean;
  exit: boolean;
  mode: boolean;
};

export type VrPlaybackHud = {
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

export type VrChannelsSliderKey =
  | 'windowMin'
  | 'windowMax'
  | 'contrast'
  | 'brightness'
  | 'xOffset'
  | 'yOffset';

export type VrChannelsSliderDefinition = {
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

export type VrChannelsInteractiveRegion = {
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

export type VrChannelsHud = {
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

export type VolumeHudFrame = {
  center: THREE.Vector3;
  forward: THREE.Vector3;
  right: THREE.Vector3;
  up: THREE.Vector3;
  yaw: number;
  pitch: number;
};

export type VrChannelsState = {
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

export type VrTracksSliderKey = 'opacity' | 'lineWidth';

export type VrTracksInteractiveRegion = {
  targetType:
    | 'tracks-tab'
    | 'tracks-stop-follow'
    | 'tracks-slider'
    | 'tracks-scroll'
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

export type VrTracksHud = {
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

export type VrTracksState = {
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

export type VolumeScaleState = {
  baseLength: number;
  direction: THREE.Vector3;
};

export type ControllerEntry = {
  controller: THREE.Group;
  grip: THREE.Group;
  ray: THREE.Line;
  rayGeometry: THREE.BufferGeometry;
  rayMaterial: THREE.Material;
  touchIndicator: THREE.Mesh;
  raycaster: THREE.Raycaster;
  onConnected: (event: { data?: { targetRayMode?: string; gamepad?: Gamepad } }) => void;
  onDisconnected: (event: XRInputSourceEvent) => void;
  onSelectStart: (event: XRInputSourceEvent) => void;
  onSelectEnd: (event: XRInputSourceEvent) => void;
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

export type VrHudPlacement = { position: THREE.Vector3; yaw: number; pitch: number };

export type WebXRFoveationManager = THREE.WebXRManager & {
  getFoveation?: () => number | undefined;
  setFoveation?: (value: number) => void;
};

export type RaycasterLike = {
  params: { Line?: { threshold: number } } & Record<string, unknown>;
  setFromCamera: (coords: THREE.Vector2, camera: THREE.PerspectiveCamera) => void;
  intersectObjects: (objects: THREE.Object3D[], recursive?: boolean) => Array<{ object: THREE.Object3D }>;
};
