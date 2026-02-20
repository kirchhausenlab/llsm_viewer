import type { NormalizedVolume } from '../../../core/volumeProcessing';
import type { VolumeBrickAtlas, VolumeBrickPageTable } from '../../../core/volumeProvider';
import type { PaintbrushStrokeHandlers } from '../../../types/paintbrush';
import type { TrackColorMode, TrackDefinition } from '../../../types/tracks';
import type { VolumeDataType } from '../../../types/volume';
import type { RenderStyle } from '../../../state/layerSettings';

export type ViewerLayer = {
  key: string;
  label: string;
  channelId: string;
  channelName: string;
  fullResolutionWidth?: number;
  fullResolutionHeight?: number;
  fullResolutionDepth?: number;
  volume: NormalizedVolume | null;
  channels?: number;
  dataType?: VolumeDataType;
  min?: number;
  max?: number;
  visible: boolean;
  isHoverTarget?: boolean;
  minAlpha?: number;
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
  blDensityScale?: number;
  blBackgroundCutoff?: number;
  blOpacityScale?: number;
  blEarlyExitAlpha?: number;
  invert: boolean;
  samplingMode?: 'linear' | 'nearest';
  isSegmentation: boolean;
  mode?: '3d' | 'slice';
  sliceIndex?: number;
  scaleLevel?: number;
  brickPageTable?: VolumeBrickPageTable | null;
  brickAtlas?: VolumeBrickAtlas | null;
};

export type SliceData = {
  width: number;
  height: number;
  buffer: Uint8ClampedArray;
  hasLayer: boolean;
};

export type ViewState = {
  scale: number;
  offsetX: number;
  offsetY: number;
  rotation: number;
};

export type PlanarLayoutView = {
  width: number;
  height: number;
  originX: number;
  originY: number;
  centerX: number;
  centerY: number;
};

export type PlanarLayout = {
  blockWidth: number;
  blockHeight: number;
  xy: PlanarLayoutView | null;
};

export type TrackRenderEntry = {
  id: string;
  trackSetId: string;
  trackSetName: string;
  channelId: string;
  channelName: string;
  trackNumber: number;
  xyPoints: { x: number; y: number }[];
  baseColor: { r: number; g: number; b: number };
  highlightColor: { r: number; g: number; b: number };
};

export type HoveredIntensityInfo = {
  intensity: string;
  components: { text: string; color: string }[];
};

export type PlanarViewerProps = {
  layers: ViewerLayer[];
  isLoading: boolean;
  loadingProgress: number;
  loadedVolumes: number;
  expectedVolumes: number;
  timeIndex: number;
  totalTimepoints: number;
  onRegisterReset: (handler: (() => void) | null) => void;
  onRegisterCaptureTarget?: (
    target: HTMLCanvasElement | (() => HTMLCanvasElement | null) | null,
  ) => void;
  sliceIndex: number;
  maxSlices: number;
  onSliceIndexChange: (index: number) => void;
  trackScale: { x: number; y: number; z: number };
  tracks: TrackDefinition[];
  trackVisibility: Record<string, boolean>;
  trackOpacityByTrackSet: Record<string, number>;
  trackLineWidthByTrackSet: Record<string, number>;
  trackColorModesByTrackSet: Record<string, TrackColorMode>;
  channelTrackOffsets: Record<string, { x: number; y: number }>;
  isFullTrackTrailEnabled: boolean;
  trackTrailLength: number;
  selectedTrackIds: ReadonlySet<string>;
  followedTrackId: string | null;
  onTrackSelectionToggle: (trackId: string) => void;
  onTrackFollowRequest: (trackId: string) => void;
  paintbrush?: PaintbrushStrokeHandlers;
  onHoverVoxelChange?: (value: {
    intensity: string;
    components: { text: string; color: string }[];
    coordinates: { x: number; y: number; z: number };
  } | null) => void;
};

export type TrackHitTestResult = {
  trackId: string | null;
  pointer: { x: number; y: number } | null;
};

export type SliceSampler = (x: number, y: number) => number[] | null;
export type Offset = { x: number; y: number };
export type HoveredPixel = { x: number; y: number } | null;
export type HoveredVoxelInfo = {
  intensity: string;
  components: { text: string; color: string }[];
  coordinates: { x: number; y: number; z: number };
};
