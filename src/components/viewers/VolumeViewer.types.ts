import type * as THREE from 'three';
import type { Line2 } from 'three/examples/jsm/lines/Line2';
import type { LineGeometry } from 'three/examples/jsm/lines/LineGeometry';
import type { LineMaterial } from 'three/examples/jsm/lines/LineMaterial';
import type { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2';
import type { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry';

import type {
  VolumeBackgroundMask,
  VolumeBrickAtlas,
  VolumeBrickPageTable,
  VolumeProviderDiagnostics
} from '../../core/volumeProvider';
import type { LODPolicyDiagnosticsSnapshot } from '../../core/lodPolicyDiagnostics';
import type { NormalizedVolume } from '../../core/volumeProcessing';
import type { ViewerLayer } from '../../ui/contracts/viewerLayer';
import type { FollowedVoxelTarget } from '../../types/follow';
import type { HoveredVoxelInfo, HoverSettings } from '../../types/hover';
import type { PaintbrushStrokeHandlers } from '../../types/paintbrush';
import type { RoiDefinition, RoiDimensionMode, RoiTool, SavedRoi } from '../../types/roi';
import type {
  CompiledTrackSetPayload,
  CompiledTrackSummary,
  TrackColorMode,
} from '../../types/tracks';
import type { ViewerProp } from '../../types/viewerProps';
import type { TemporalResolutionMetadata, VoxelResolutionValues } from '../../types/voxelResolution';
import type { RenderStyle, SamplingMode } from '../../state/layerSettings';
import type { TrackSetState } from '../../types/channelTracks';
import type { PlaybackIndexWindow } from '../../shared/utils';
import type { ResidencyDecision } from '../../ui/app/volume-loading/residencyPolicy';
import type {
  CameraWindowController,
  CameraWindowState,
} from '../../types/camera';
import type {
  DesktopViewState,
  DesktopViewStateMap,
  DesktopViewerCamera,
  ViewerCameraNavigationSample,
  ViewerProjectionMode,
} from '../../hooks/useVolumeRenderSetup';

export type InstancedLineGeometry = LineGeometry & { instanceCount: number };
export type InstancedLineSegmentsGeometry = LineSegmentsGeometry & { instanceCount: number };

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
  onLayerBlDensityScaleChange?: (layerKey: string, value: number) => void;
  onLayerBlBackgroundCutoffChange?: (layerKey: string, value: number) => void;
  onLayerBlOpacityScaleChange?: (layerKey: string, value: number) => void;
  onLayerBlEarlyExitAlphaChange?: (layerKey: string, value: number) => void;
  onLayerMipEarlyExitThresholdChange?: (layerKey: string, value: number) => void;
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

export type VolumeViewerCaptureTarget = {
  canvas: HTMLCanvasElement | null;
  captureImage?: () => Promise<Blob | null>;
};

export type DesktopViewerBackgroundMode = 'default' | 'custom';

export type DesktopViewerBackgroundSelection = {
  mode: DesktopViewerBackgroundMode;
  customBackgroundColor: string | null;
  floorEnabled: boolean;
  floorColor: string;
};

export type DesktopViewerBackgroundConfig = {
  clearColor: string | null;
  surfaceColor: string | null;
  floorEnabled: boolean;
  floorColor: string;
};

export type ViewerRoiConfig = {
  isDrawWindowOpen: boolean;
  tool: RoiTool;
  dimensionMode: RoiDimensionMode;
  selectedZIndex: number;
  twoDCurrentZEnabled: boolean;
  twoDStartZIndex: number;
  defaultColor: string;
  workingRoi: RoiDefinition | null;
  savedRois: SavedRoi[];
  activeSavedRoiId: string | null;
  editingSavedRoiId: string | null;
  showAllSavedRois: boolean;
  onWorkingRoiChange: (roi: RoiDefinition | null) => void;
  onSavedRoiActivate: (roiId: string) => void;
};

export type PlaybackWarmupFrame = {
  slotIndex: number;
  timeIndex: number;
  scaleSignature: string;
  layerResidencyDecisions: Record<string, ResidencyDecision | null>;
  layerVolumes: Record<string, NormalizedVolume | null>;
  layerPageTables: Record<string, VolumeBrickPageTable | null>;
  layerBrickAtlases: Record<string, VolumeBrickAtlas | null>;
  backgroundMasksByScale: Record<number, VolumeBackgroundMask | null>;
};

export type VolumeViewerProps = {
  layers: ViewerLayer[];
  playbackWarmupLayers?: ViewerLayer[];
  playbackWarmupFrames?: PlaybackWarmupFrame[];
  projectionMode?: ViewerProjectionMode;
  timeIndex: number;
  totalTimepoints: number;
  temporalResolution?: TemporalResolutionMetadata | null;
  voxelResolution?: VoxelResolutionValues | null;
  isPlaying: boolean;
  playbackDisabled: boolean;
  playbackLabel: string;
  fps: number;
  playbackBufferFrames: number;
  isPlaybackStartPending?: boolean;
  blendingMode: 'alpha' | 'additive';
  zClipFrontFraction?: number;
  isLoading: boolean;
  loadingProgress: number;
  loadedVolumes: number;
  expectedVolumes: number;
  runtimeDiagnostics?: VolumeProviderDiagnostics | null;
  lodPolicyDiagnostics?: LODPolicyDiagnosticsSnapshot | null;
  residencyDecisions?: Record<string, ResidencyDecision | null>;
  isDiagnosticsWindowOpen?: boolean;
  onCloseDiagnosticsWindow?: () => void;
  windowResetSignal?: number;
  onTogglePlayback: () => void;
  onTimeIndexChange: (nextIndex: number) => void;
  playbackWindow?: PlaybackIndexWindow | null;
  canAdvancePlayback?: (nextIndex: number) => boolean;
  onBufferedPlaybackStart?: () => void;
  onFpsChange: (value: number) => void;
  onVolumeStepScaleChange?: (value: number) => void;
  onRegisterVolumeStepScaleChange?: (handler: ((value: number) => void) | null) => void;
  onCameraNavigationSample?: (sample: ViewerCameraNavigationSample) => void;
  translationSpeedMultiplier?: number;
  rotationSpeedMultiplier?: number;
  rotationLocked?: boolean;
  onCameraWindowStateChange?: (state: CameraWindowState | null) => void;
  onRegisterCameraWindowController?: (controller: CameraWindowController | null) => void;
  onRegisterReset: (handler: (() => void) | null) => void;
  onRegisterCaptureTarget?: (
    target:
      | VolumeViewerCaptureTarget
      | HTMLCanvasElement
      | (() => VolumeViewerCaptureTarget | HTMLCanvasElement | null)
      | null,
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
  hoverSettings?: HoverSettings;
  background?: DesktopViewerBackgroundConfig;
  viewerPropsConfig?: ViewerPropsConfig;
  roiConfig?: ViewerRoiConfig;
  paintbrush?: PaintbrushStrokeHandlers;
  vr?: VolumeViewerVrProps;
};

export type { FollowedVoxelTarget };
export type { ViewerLayer } from '../../ui/contracts/viewerLayer';

export type VolumeResources = {
  mesh: THREE.Mesh;
  roiBlOcclusionAlphaMesh?: THREE.Mesh | null;
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
  projectionMode?: ViewerProjectionMode;
  samplingMode: 'linear' | 'nearest';
  sliceBuffer?: Uint8Array | Float32Array | null;
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
  brickAtlasSourceData?: Uint8Array | Uint16Array | Float32Array | null;
  brickAtlasSourceFormat?: THREE.Data3DTexture['format'] | null;
  brickAtlasSourcePageTable?: VolumeBrickPageTable | null;
  brickAtlasSlotGrid?: { x: number; y: number; z: number } | null;
  brickAtlasBuildVersion?: number;
  usesPrepackedPlaybackResidentAtlas?: boolean;
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
      | 'mismatched-page-table-source'
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
  updateGpuBrickResidencyForCamera?: ((
    viewPriority: {
      cameraWorldPosition: THREE.Vector3;
      projectionMode: ViewerProjectionMode;
      targetWorldPosition: THREE.Vector3;
      viewDirectionWorld: THREE.Vector3;
      zoom: number;
    }
  ) => void) | null;
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

export type { ViewerProjectionMode, DesktopViewerCamera, DesktopViewState, DesktopViewStateMap, ViewerCameraNavigationSample };

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

export type RoiRenderResource = {
  key: string;
  roiId: string;
  line: LineSegments2;
  geometry: InstancedLineSegmentsGeometry;
  material: LineMaterial;
  color: THREE.Color;
  baseOpacity: number;
  isActive: boolean;
  isInvalid: boolean;
  shouldBlink: boolean;
};
