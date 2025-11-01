import type {
  BufferGeometry,
  CanvasTexture,
  Color,
  Data3DTexture,
  DataTexture,
  Group,
  Line,
  Material,
  Mesh,
  Object3D,
  PerspectiveCamera,
  Raycaster,
  Vector2,
  Vector3,
  WebXRManager
} from 'three';
import type { Line2 } from 'three/examples/jsm/lines/Line2';
import type { LineGeometry } from 'three/examples/jsm/lines/LineGeometry';
import type { LineMaterial } from 'three/examples/jsm/lines/LineMaterial';
import type { TrackColorMode, TrackDefinition } from '../../types/tracks';
import type { NormalizedVolume } from '../../volumeProcessing';

export type ViewerLayer = {
  key: string;
  label: string;
  volume: NormalizedVolume | null;
  visible: boolean;
  sliderRange: number;
  minSliderIndex: number;
  maxSliderIndex: number;
  brightnessSliderIndex: number;
  contrastSliderIndex: number;
  windowMin: number;
  windowMax: number;
  color: string;
  offsetX: number;
  offsetY: number;
  renderStyle: 0 | 1;
  invert: boolean;
  samplingMode: 'linear' | 'nearest';
  isSegmentation?: boolean;
  mode?: '3d' | 'slice';
  sliceIndex?: number;
};

export type VolumeViewerProps = {
  layers: ViewerLayer[];
  timeIndex: number;
  totalTimepoints: number;
  isPlaying: boolean;
  playbackDisabled: boolean;
  playbackLabel: string;
  fps: number;
  isLoading: boolean;
  loadingProgress: number;
  loadedVolumes: number;
  expectedVolumes: number;
  onTogglePlayback: () => void;
  onTimeIndexChange: (nextIndex: number) => void;
  onFpsChange: (value: number) => void;
  onRegisterReset: (handler: (() => void) | null) => void;
  isVrPassthroughSupported: boolean;
  tracks: TrackDefinition[];
  trackChannels: Array<{ id: string; name: string }>;
  trackVisibility: Record<string, boolean>;
  trackOpacityByChannel: Record<string, number>;
  trackLineWidthByChannel: Record<string, number>;
  channelTrackColorModes: Record<string, TrackColorMode>;
  channelTrackOffsets: Record<string, { x: number; y: number }>;
  selectedTrackIds: ReadonlySet<string>;
  activeTrackChannelId: string | null;
  onTrackChannelSelect: (channelId: string) => void;
  onTrackVisibilityToggle: (trackId: string) => void;
  onTrackVisibilityAllChange: (channelId: string, visible: boolean) => void;
  onTrackOpacityChange: (channelId: string, value: number) => void;
  onTrackLineWidthChange: (channelId: string, value: number) => void;
  onTrackColorSelect: (channelId: string, color: string) => void;
  onTrackColorReset: (channelId: string) => void;
  onStopTrackFollow: (channelId?: string) => void;
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
  activeChannelPanelId: string | null;
  onChannelPanelSelect: (channelId: string) => void;
  onChannelVisibilityToggle: (channelId: string) => void;
  onChannelReset: (channelId: string) => void;
  onChannelLayerSelect: (channelId: string, layerKey: string) => void;
  onLayerContrastChange: (layerKey: string, value: number) => void;
  onLayerBrightnessChange: (layerKey: string, value: number) => void;
  onLayerWindowMinChange: (layerKey: string, value: number) => void;
  onLayerWindowMaxChange: (layerKey: string, value: number) => void;
  onLayerAutoContrast: (layerKey: string) => void;
  onLayerOffsetChange: (layerKey: string, axis: 'x' | 'y', value: number) => void;
  onLayerColorChange: (layerKey: string, color: string) => void;
  onLayerRenderStyleToggle: (layerKey: string) => void;
  onLayerSamplingModeToggle: (layerKey: string) => void;
  onLayerInvertToggle: (layerKey: string) => void;
  followedTrackId: string | null;
  onTrackSelectionToggle: (trackId: string) => void;
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

export type VolumeResources = {
  mesh: Mesh;
  texture: Data3DTexture | DataTexture;
  dimensions: {
    width: number;
    height: number;
    depth: number;
  };
  channels: number;
  mode: '3d' | 'slice';
  samplingMode: 'linear' | 'nearest';
  sliceBuffer?: Uint8Array | null;
};

export type PointerState = {
  mode: 'pan' | 'dolly';
  pointerId: number;
  lastX: number;
  lastY: number;
  previousControlsEnabled: boolean;
  previousEnablePan: boolean | null;
};

export type MovementState = {
  moveForward: boolean;
  moveBackward: boolean;
  moveLeft: boolean;
  moveRight: boolean;
  moveUp: boolean;
  moveDown: boolean;
};

export type TrackLineResource = {
  line: Line2;
  outline: Line2;
  geometry: LineGeometry;
  material: LineMaterial;
  outlineMaterial: LineMaterial;
  times: number[];
  baseColor: Color;
  highlightColor: Color;
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

export type VrUiTarget = { type: VrUiTargetType; object: Object3D; data?: unknown };

export type VrPlaybackHud = {
  group: Group;
  panel: Mesh;
  panelTranslateHandle: Mesh;
  panelYawHandles: Mesh[];
  panelPitchHandle: Mesh;
  resetVolumeButton: Mesh;
  resetHudButton: Mesh;
  playButton: Mesh;
  playIcon: Object3D;
  pauseGroup: Object3D;
  exitButton: Mesh;
  exitIcon: Object3D;
  modeButton: Mesh;
  modeVrIcon: Object3D;
  modeArIcon: Object3D;
  playbackSliderGroup: Group;
  playbackSliderTrack: Mesh;
  playbackSliderFill: Mesh;
  playbackSliderKnob: Mesh;
  playbackSliderHitArea: Mesh;
  playbackSliderWidth: number;
  fpsSliderGroup: Group;
  fpsSliderTrack: Mesh;
  fpsSliderFill: Mesh;
  fpsSliderKnob: Mesh;
  fpsSliderHitArea: Mesh;
  fpsSliderWidth: number;
  labelMesh: Mesh;
  labelTexture: CanvasTexture;
  labelCanvas: HTMLCanvasElement | null;
  labelContext: CanvasRenderingContext2D | null;
  labelText: string;
  fpsLabelMesh: Mesh;
  fpsLabelTexture: CanvasTexture;
  fpsLabelCanvas: HTMLCanvasElement | null;
  fpsLabelContext: CanvasRenderingContext2D | null;
  fpsLabelText: string;
  interactables: Object3D[];
  resetVolumeButtonBaseColor: Color;
  resetHudButtonBaseColor: Color;
  playButtonBaseColor: Color;
  playbackSliderTrackBaseColor: Color;
  playbackSliderKnobBaseColor: Color;
  fpsSliderTrackBaseColor: Color;
  fpsSliderKnobBaseColor: Color;
  exitButtonBaseColor: Color;
  modeButtonBaseColor: Color;
  modeButtonActiveColor: Color;
  modeButtonDisabledColor: Color;
  hoverHighlightColor: Color;
  resetVolumeButtonRadius: number;
  resetHudButtonRadius: number;
  exitButtonRadius: number;
  modeButtonRadius: number;
  cachedPosition: Vector3;
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
  group: Group;
  background: Mesh;
  panel: Mesh;
  panelTranslateHandle: Mesh;
  panelYawHandles: Mesh[];
  panelPitchHandle: Mesh;
  panelTexture: CanvasTexture;
  panelCanvas: HTMLCanvasElement | null;
  panelContext: CanvasRenderingContext2D | null;
  panelDisplayWidth: number;
  panelDisplayHeight: number;
  pixelRatio: number;
  interactables: Object3D[];
  regions: VrChannelsInteractiveRegion[];
  width: number;
  height: number;
  hoverRegion: VrChannelsInteractiveRegion | null;
  cachedPosition: Vector3;
  cachedYaw: number;
  cachedPitch: number;
  cacheDirty: boolean;
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
  group: Group;
  panel: Mesh;
  panelTranslateHandle: Mesh;
  panelYawHandles: Mesh[];
  panelPitchHandle: Mesh;
  panelTexture: CanvasTexture;
  panelCanvas: HTMLCanvasElement | null;
  panelContext: CanvasRenderingContext2D | null;
  panelDisplayWidth: number;
  panelDisplayHeight: number;
  pixelRatio: number;
  interactables: Object3D[];
  regions: VrTracksInteractiveRegion[];
  width: number;
  height: number;
  hoverRegion: VrTracksInteractiveRegion | null;
  cachedPosition: Vector3;
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
  direction: Vector3;
};

export type ControllerEntry = {
  controller: Group;
  grip: Group;
  ray: Line;
  rayGeometry: BufferGeometry;
  rayMaterial: Material;
  touchIndicator: Mesh;
  raycaster: Raycaster;
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
  hoverUiPoint: Vector3;
  hasHoverUiPoint: boolean;
  hoverPoint: Vector3;
  rayOrigin: Vector3;
  rayDirection: Vector3;
  rayLength: number;
  isSelecting: boolean;
  hudGrabOffsets: { playback: Vector3 | null; channels: Vector3 | null; tracks: Vector3 | null };
  translateGrabOffset: Vector3 | null;
  scaleGrabOffset: Vector3 | null;
  volumeScaleState: VolumeScaleState | null;
  volumeRotationState:
    | {
        mode: 'yaw';
        initialYaw: number;
        initialAngle: number;
        basisForward: Vector3;
        basisRight: Vector3;
      }
    | {
        mode: 'pitch';
        initialPitch: number;
        initialAngle: number;
        basisForward: Vector3;
      }
    | null;
  hudRotationState:
    | {
        hud: 'playback' | 'channels' | 'tracks';
        mode: 'yaw';
        initialYaw: number;
        initialAngle: number;
        basisForward: Vector3;
        basisRight: Vector3;
      }
    | {
        hud: 'playback' | 'channels' | 'tracks';
        mode: 'pitch';
        initialPitch: number;
        initialAngle: number;
        basisForward: Vector3;
      }
    | null;
};

export type VrHudPlacement = { position: Vector3; yaw: number; pitch: number };

export type WebXRFoveationManager = WebXRManager & {
  getFoveation?: () => number | undefined;
  setFoveation?: (value: number) => void;
};

export type RaycasterLike = {
  params: { Line?: { threshold: number } } & Record<string, unknown>;
  setFromCamera: (coords: Vector2, camera: PerspectiveCamera) => void;
  intersectObjects: (objects: Object3D[], recursive?: boolean) => Array<{ object: Object3D }>;
};
