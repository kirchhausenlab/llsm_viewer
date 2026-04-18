import type { NormalizedVolume } from '../../core/volumeProcessing';
import type {
  VolumeBackgroundMask,
  VolumeBrickAtlas,
  VolumeBrickPageTable
} from '../../core/volumeProvider';
import type { RenderStyle, SamplingMode } from '../../state/layerSettings';
import type { VolumeDataType } from '../../types/volume';
import type { StoredIntensityDataType } from '../../shared/utils/preprocessedDataset/types';

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
  storedDataType?: StoredIntensityDataType;
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
