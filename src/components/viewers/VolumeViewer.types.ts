import type * as THREE from 'three';
import type { Line2 } from 'three/examples/jsm/lines/Line2';
import type { LineGeometry } from 'three/examples/jsm/lines/LineGeometry';
import type { LineMaterial } from 'three/examples/jsm/lines/LineMaterial';

import type { NormalizedVolume } from '../../core/volumeProcessing';
import type { FollowedVoxelTarget } from '../../types/follow';
import type { HoveredVoxelInfo } from '../../types/hover';
import type { TrackColorMode, TrackDefinition } from '../../types/tracks';

export type ViewerLayer = {
  key: string;
  label: string;
  channelName: string;
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

export type VolumeViewerVrPanelLayerSettings = {
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

export type VolumeViewerVrPanelLayer = {
  key: string;
  label: string;
  hasData: boolean;
  isGrayscale: boolean;
  isSegmentation: boolean;
  defaultWindow: { windowMin: number; windowMax: number } | null;
  histogram: Uint32Array | null;
  settings: VolumeViewerVrPanelLayerSettings;
};

export type VolumeViewerVrChannelPanel = {
  id: string;
  name: string;
  visible: boolean;
  activeLayerKey: string | null;
  layers: VolumeViewerVrPanelLayer[];
};

export type VolumeViewerVrProps = {
  isVrPassthroughSupported: boolean;
  trackChannels: Array<{ id: string; name: string }>;
  activeTrackChannelId: string | null;
  onTrackChannelSelect: (channelId: string) => void;
  onTrackVisibilityToggle: (trackId: string) => void;
  onTrackVisibilityAllChange: (channelId: string, visible: boolean) => void;
  onTrackOpacityChange: (channelId: string, value: number) => void;
  onTrackLineWidthChange: (channelId: string, value: number) => void;
  onTrackColorSelect: (channelId: string, color: string) => void;
  onTrackColorReset: (channelId: string) => void;
  onStopTrackFollow: (channelId?: string) => void;
  channelPanels: VolumeViewerVrChannelPanel[];
  activeChannelPanelId: string | null;
  onChannelPanelSelect: (channelId: string) => void;
  onChannelVisibilityToggle: (channelId: string) => void;
  onChannelReset: (channelId: string) => void;
  onChannelLayerSelect: (channelId: string, layerKey: string) => void;
  onLayerSelect?: (layerKey: string) => void;
  onLayerSoloToggle?: (layerKey: string) => void;
  onLayerContrastChange: (layerKey: string, value: number) => void;
  onLayerBrightnessChange: (layerKey: string, value: number) => void;
  onLayerWindowMinChange: (layerKey: string, value: number) => void;
  onLayerWindowMaxChange: (layerKey: string, value: number) => void;
  onLayerAutoContrast: (layerKey: string) => void;
  onLayerOffsetChange: (layerKey: string, axis: 'x' | 'y', value: number) => void;
  onLayerColorChange: (layerKey: string, color: string) => void;
  onLayerRenderStyleToggle: (layerKey?: string) => void;
  onLayerSamplingModeToggle: (layerKey?: string) => void;
  onLayerInvertToggle: (layerKey: string) => void;
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

export type VolumeViewerProps = {
  layers: ViewerLayer[];
  timeIndex: number;
  totalTimepoints: number;
  isPlaying: boolean;
  playbackDisabled: boolean;
  playbackLabel: string;
  fps: number;
  blendingMode: 'alpha' | 'additive';
  isLoading: boolean;
  loadingProgress: number;
  loadedVolumes: number;
  expectedVolumes: number;
  onTogglePlayback: () => void;
  onTimeIndexChange: (nextIndex: number) => void;
  onFpsChange: (value: number) => void;
  onVolumeStepScaleChange?: (value: number) => void;
  onRegisterVolumeStepScaleChange?: (handler: ((value: number) => void) | null) => void;
  onRegisterReset: (handler: (() => void) | null) => void;
  trackScale: { x: number; y: number; z: number };
  tracks: TrackDefinition[];
  trackVisibility: Record<string, boolean>;
  trackOpacityByChannel: Record<string, number>;
  trackLineWidthByChannel: Record<string, number>;
  channelTrackColorModes: Record<string, TrackColorMode>;
  channelTrackOffsets: Record<string, { x: number; y: number }>;
  selectedTrackIds: ReadonlySet<string>;
  followedTrackId: string | null;
  followedVoxel: FollowedVoxelTarget | null;
  onTrackSelectionToggle: (trackId: string) => void;
  onTrackFollowRequest: (trackId: string) => void;
  onVoxelFollowRequest: (voxel: FollowedVoxelTarget) => void;
  onHoverVoxelChange?: (value: HoveredVoxelInfo | null) => void;
  vr?: VolumeViewerVrProps;
};

export type { FollowedVoxelTarget };

export type VolumeResources = {
  mesh: THREE.Mesh;
  texture: THREE.Data3DTexture | THREE.DataTexture;
  labelTexture?: THREE.Data3DTexture | null;
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

export type VrHistogramShape = {
  points: Array<{ x: number; y: number }>;
  isEmpty: boolean;
};

export type MovementState = {
  moveForward: boolean;
  moveBackward: boolean;
  moveLeft: boolean;
  moveRight: boolean;
  moveUp: boolean;
  moveDown: boolean;
  rollLeft: boolean;
  rollRight: boolean;
};

export type TrackLineResource = {
  line: Line2;
  outline: Line2;
  geometry: LineGeometry;
  material: LineMaterial;
  outlineMaterial: LineMaterial;
  endCap: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  endCapMaterial: THREE.MeshBasicMaterial;
  times: number[];
  positions: Float32Array;
  baseColor: THREE.Color;
  highlightColor: THREE.Color;
  channelId: string;
  baseLineWidth: number;
  targetLineWidth: number;
  outlineExtraWidth: number;
  targetOpacity: number;
  outlineBaseOpacity: number;
  endCapRadius: number;
  hasVisiblePoints: boolean;
  isFollowed: boolean;
  isSelected: boolean;
  isHovered: boolean;
  shouldShow: boolean;
  needsAppearanceUpdate: boolean;
};

