import type * as THREE from 'three';
import type { TrackColorMode, TrackDefinition } from '../types/tracks';
import type { NormalizedVolume } from '../volumeProcessing';
import type { RayMarchMaterialControls } from './useRayMarchMaterial';

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
  mesh: THREE.Mesh;
  texture: THREE.Data3DTexture | THREE.DataTexture;
  dimensions: {
    width: number;
    height: number;
    depth: number;
  };
  channels: number;
  mode: '3d' | 'slice';
  samplingMode: 'linear' | 'nearest';
  colormapKey: string;
  rayMarchMaterial?: RayMarchMaterialControls;
  sliceBuffer?: Uint8Array | null;
};

export type VrHistogramShape = {
  points: Array<{ x: number; y: number }>;
  isEmpty: boolean;
};

export type RaycasterLike = {
  params: { Line?: { threshold: number } } & Record<string, unknown>;
  setFromCamera: (coords: THREE.Vector2, camera: THREE.PerspectiveCamera) => void;
  intersectObjects: (
    objects: THREE.Object3D[],
    recursive?: boolean
  ) => Array<{ object: THREE.Object3D }>;
};
