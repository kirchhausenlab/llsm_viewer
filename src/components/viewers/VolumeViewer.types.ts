import type * as THREE from 'three';
import type { Line2 } from 'three/examples/jsm/lines/Line2';
import type { LineGeometry } from 'three/examples/jsm/lines/LineGeometry';
import type { LineMaterial } from 'three/examples/jsm/lines/LineMaterial';
import type { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry';

import type { NormalizedVolume } from '../../core/volumeProcessing';
import type {
  VolumeBackgroundMask,
  VolumeBrickAtlas,
  VolumeBrickPageTable,
  VolumeProviderDiagnostics
} from '../../core/volumeProvider';
import type { LODPolicyDiagnosticsSnapshot } from '../../core/lodPolicyDiagnostics';
import type { FollowedVoxelTarget } from '../../types/follow';
import type { HoveredVoxelInfo } from '../../types/hover';
import type { PaintbrushStrokeHandlers } from '../../types/paintbrush';
import type {
  CompiledTrackSetPayload,
  CompiledTrackSummary,
  TrackColorMode,
} from '../../types/tracks';
import type { VolumeDataType } from '../../types/volume';
import type { ViewerProp } from '../../types/viewerProps';
import type { TemporalResolutionMetadata, VoxelResolutionValues } from '../../types/voxelResolution';
import type { RenderStyle, SamplingMode } from '../../state/layerSettings';
import type { TrackSetState } from '../../types/channelTracks';
import type { PlaybackIndexWindow } from '../../shared/utils';

export type InstancedLineGeometry = LineGeometry & { instanceCount: number };
export type InstancedLineSegmentsGeometry = LineSegmentsGeometry & { instanceCount: number };

export type ViewerLayer = {
  key: string;
  label: string;
  channelName: string;
  fullResolutionWidth: number;
  fullResolutionHeight: number;
  fullResolutionDepth: number;
  volume: NormalizedVolume | null;
  channels?: number;
  dataType?: VolumeDataType;
  min?: number;
  max?: number;
  visible: boolean;
  isHoverTarget?: boolean;
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
  renderStyle: RenderStyle;
  blDensityScale: number;
  blBackgroundCutoff: number;
  blOpacityScale: number;
  blEarlyExitAlpha: number;
  mipEarlyExitThreshold: number;
  invert: boolean;
  samplingMode: SamplingMode;
  isSegmentation?: boolean;
  mode?: '3d' | 'slice';
  sliceIndex?: number;
  scaleLevel?: number;
  brickPageTable?: VolumeBrickPageTable | null;
  brickAtlas?: VolumeBrickAtlas | null;
  backgroundMask?: VolumeBackgroundMask | null;
  playbackWarmupForLayerKey?: string;
  playbackWarmupTimeIndex?: number;
  playbackRole?: 'active' | 'warmup';
  playbackSlotIndex?: number;
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
  renderStyle: RenderStyle;
  blDensityScale: number;
  blBackgroundCutoff: number;
  blOpacityScale: number;
  blEarlyExitAlpha: number;
  mipEarlyExitThreshold: number;
  invert: boolean;
  samplingMode: SamplingMode;
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
  isVrActive: boolean;
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

export type ViewerPropsConfig = {
  props: ViewerProp[];
  selectedPropId: string | null;
  isEditing: boolean;
  currentTimepoint: number;
  totalTimepoints: number;
  temporalResolution?: TemporalResolutionMetadata | null;
  voxelResolution?: VoxelResolutionValues | null;
  onSelectProp: (propId: string) => void;
  onUpdateScreenPosition: (propId: string, nextPosition: { x: number; y: number }) => void;
  onUpdateWorldPosition: (propId: string, nextPosition: { x: number; y: number }) => void;
};

export type VolumeViewerProps = {
  layers: ViewerLayer[];
  playbackWarmupLayers?: ViewerLayer[];
  timeIndex: number;
  totalTimepoints: number;
  temporalResolution?: TemporalResolutionMetadata | null;
  voxelResolution?: VoxelResolutionValues | null;
  isPlaying: boolean;
  playbackDisabled: boolean;
  playbackLabel: string;
  fps: number;
  blendingMode: 'alpha' | 'additive';
  zClipFrontFraction?: number;
  isLoading: boolean;
  loadingProgress: number;
  loadedVolumes: number;
  expectedVolumes: number;
  runtimeDiagnostics?: VolumeProviderDiagnostics | null;
  lodPolicyDiagnostics?: LODPolicyDiagnosticsSnapshot | null;
  isDiagnosticsWindowOpen?: boolean;
  onCloseDiagnosticsWindow?: () => void;
  windowResetSignal?: number;
  onTogglePlayback: () => void;
  onTimeIndexChange: (nextIndex: number) => void;
  playbackWindow?: PlaybackIndexWindow | null;
  canAdvancePlayback?: (nextIndex: number) => boolean;
  onFpsChange: (value: number) => void;
  onVolumeStepScaleChange?: (value: number) => void;
  onRegisterVolumeStepScaleChange?: (handler: ((value: number) => void) | null) => void;
  onCameraNavigationSample?: (sample: {
    distanceToTarget: number;
    isMoving: boolean;
    capturedAtMs: number;
  }) => void;
  onRegisterReset: (handler: (() => void) | null) => void;
  onRegisterCaptureTarget?: (
    target: HTMLCanvasElement | (() => HTMLCanvasElement | null) | null,
  ) => void;
  trackScale: { x: number; y: number; z: number };
  tracks: CompiledTrackSummary[];
  compiledTrackPayloadByTrackSet: ReadonlyMap<string, CompiledTrackSetPayload>;
  onRequireTrackPayloads?: (trackSetIds: Iterable<string>) => void;
  trackSetStates: Record<string, TrackSetState>;
  trackOpacityByTrackSet: Record<string, number>;
  trackLineWidthByTrackSet: Record<string, number>;
  trackColorModesByTrackSet: Record<string, TrackColorMode>;
  channelTrackOffsets: Record<string, { x: number; y: number }>;
  isFullTrackTrailEnabled: boolean;
  trackTrailLength: number;
  selectedTrackIds: ReadonlySet<string>;
  followedTrackId: string | null;
  followedVoxel: FollowedVoxelTarget | null;
  onTrackSelectionToggle: (trackId: string) => void;
  onTrackFollowRequest: (trackId: string) => void;
  onVoxelFollowRequest: (voxel: FollowedVoxelTarget) => void;
  onHoverVoxelChange?: (value: HoveredVoxelInfo | null) => void;
  viewerPropsConfig?: ViewerPropsConfig;
  paintbrush?: PaintbrushStrokeHandlers;
  vr?: VolumeViewerVrProps;
};

export type { FollowedVoxelTarget };

export type VolumeResources = {
  mesh: THREE.Mesh;
  texture: THREE.Data3DTexture | THREE.DataTexture;
  labelTexture?: THREE.Data3DTexture | null;
  paletteTexture?: THREE.DataTexture | null;
  dimensions: {
    width: number;
    height: number;
    depth: number;
  };
  channels: number;
  mode: '3d' | 'slice';
  renderStyle?: RenderStyle;
  samplingMode: 'linear' | 'nearest';
  sliceBuffer?: Uint8Array | null;
  brickPageTable?: VolumeBrickPageTable | null;
  brickOccupancyTexture?: THREE.Data3DTexture | null;
  brickMinTexture?: THREE.Data3DTexture | null;
  brickMaxTexture?: THREE.Data3DTexture | null;
  brickAtlasIndexTexture?: THREE.Data3DTexture | null;
  brickAtlasBaseTexture?: THREE.Data3DTexture | null;
  brickAtlasDataTexture?: THREE.Data3DTexture | null;
  backgroundMaskTexture?: THREE.Data3DTexture | null;
  brickSubcellTexture?: THREE.Data3DTexture | null;
  skipHierarchyTexture?: THREE.Data3DTexture | null;
  skipHierarchySourcePageTable?: VolumeBrickPageTable | null;
  skipHierarchyLevelCount?: number;
  brickMetadataSourcePageTable?: VolumeBrickPageTable | null;
  brickAtlasIndexSourcePageTable?: VolumeBrickPageTable | null;
  brickAtlasBaseSourcePageTable?: VolumeBrickPageTable | null;
  brickAtlasBaseSourceSignature?: string | null;
  brickSubcellSourcePageTable?: VolumeBrickPageTable | null;
  brickSubcellSourceToken?: object | Uint8Array | null;
  brickSubcellGrid?: { x: number; y: number; z: number } | null;
  brickAtlasSourceToken?: object | null;
  brickAtlasSourceData?: Uint8Array | Uint16Array | null;
  brickAtlasSourceFormat?: THREE.Data3DTexture['format'] | null;
  brickAtlasSourcePageTable?: VolumeBrickPageTable | null;
  brickAtlasSlotGrid?: { x: number; y: number; z: number } | null;
  brickAtlasBuildVersion?: number;
  backgroundMaskSourceToken?: object | null;
  proxyGeometrySignature?: string | null;
  playbackWarmupForLayerKey?: string | null;
  playbackWarmupTimeIndex?: number | null;
  preferIncrementalResidency?: boolean;
  playbackPinnedResidency?: boolean;
  playbackWarmupReady?: boolean | null;
  gpuBrickResidencyMetrics?: {
    layerKey: string;
    timepoint: number;
    scaleLevel: number;
    residentBricks: number;
    totalBricks: number;
    residentBytes: number;
    budgetBytes: number;
    uploads: number;
    evictions: number;
    pendingBricks: number;
    prioritizedBricks: number;
    scheduledUploads: number;
    lastCameraDistance: number | null;
  } | null;
  brickSkipDiagnostics?: {
    enabled: boolean;
    reason:
      | 'enabled'
      | 'disabled-for-direct-volume-linear'
      | 'missing-page-table'
      | 'invalid-page-table'
      | 'invalid-min-max-range'
      | 'invalid-hierarchy-shape'
      | 'invalid-hierarchy-level-order';
    totalBricks: number;
    emptyBricks: number;
    occupiedBricks: number;
    occupiedBricksMissingFromAtlas: number;
    invalidRangeBricks: number;
    occupancyMetadataMismatchBricks: number;
  } | null;
  updateGpuBrickResidencyForCamera?: ((cameraWorldPosition: THREE.Vector3) => void) | null;
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
  kind: 'overlay';
  key: string;
  trackId: string;
  line: Line2;
  outline: Line2;
  geometry: InstancedLineGeometry;
  material: LineMaterial;
  outlineMaterial: LineMaterial;
  endCap: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  endCapMaterial: THREE.MeshBasicMaterial;
  times: ArrayLike<number>;
  positions: Float32Array;
  geometryPointStartIndex: number | null;
  geometryPointEndIndex: number | null;
  baseColor: THREE.Color;
  highlightColor: THREE.Color;
  channelId: string | null;
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

export type TrackBatchResource = {
  kind: 'batch';
  key: string;
  trackSetId: string;
  line: Line2;
  geometry: InstancedLineSegmentsGeometry;
  material: LineMaterial;
  segmentTrackIds: string[];
  segmentTimes: Float32Array;
  visibleTimeMin: number;
  visibleTimeMax: number;
};

export type TrackRenderResource = TrackLineResource | TrackBatchResource;
