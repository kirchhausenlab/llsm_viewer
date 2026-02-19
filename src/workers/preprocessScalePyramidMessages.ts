import type { NormalizationParameters } from '../core/volumeProcessing';
import type { VolumeDataType } from '../types/volume';

export type PreprocessScaleSpecMessage = {
  level: number;
  width: number;
  height: number;
  depth: number;
  channels: number;
  hasLabels: boolean;
};

export type BuildPreprocessScalePyramidMessage = {
  type: 'build-preprocess-scale-pyramid';
  requestId: number;
  layerKey: string;
  isSegmentation: boolean;
  segmentationSeed: number;
  normalization: NormalizationParameters | null;
  rawVolume: {
    width: number;
    height: number;
    depth: number;
    channels: number;
    dataType: VolumeDataType;
    voxelSize?: [number, number, number];
    min: number;
    max: number;
    data: ArrayBuffer;
  };
  scales: PreprocessScaleSpecMessage[];
};

export type PreprocessScalePyramidReadyMessage = {
  type: 'preprocess-scale-pyramid-ready';
  requestId: number;
  scales: Array<{
    level: number;
    width: number;
    height: number;
    depth: number;
    channels: number;
    data: ArrayBuffer;
    labels?: ArrayBuffer;
  }>;
};

export type PreprocessScalePyramidErrorMessage = {
  type: 'error';
  requestId: number;
  message: string;
};

export type PreprocessScalePyramidWorkerInboundMessage = BuildPreprocessScalePyramidMessage;

export type PreprocessScalePyramidWorkerOutboundMessage =
  | PreprocessScalePyramidReadyMessage
  | PreprocessScalePyramidErrorMessage;

