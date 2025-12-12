import type { VolumeMetadata, VolumeDataType } from '../types/volume';

export type VolumeStartMessage = {
  type: 'volume-start';
  requestId: number;
  index: number;
  metadata: {
    width: number;
    height: number;
    depth: number;
    channels: number;
    dataType: VolumeDataType;
    bytesPerValue: number;
  };
};

export type VolumeSliceMessage = {
  type: 'volume-slice';
  requestId: number;
  index: number;
  sliceIndex: number;
  sliceCount: number;
  min: number;
  max: number;
  buffer: ArrayBuffer;
};

export type VolumeLoadedMessage = {
  type: 'volume-loaded';
  requestId: number;
  index: number;
  metadata: VolumeMetadata;
};

export type VolumeWorkerCompleteMessage = {
  type: 'complete';
  requestId: number;
};

export type VolumeWorkerErrorMessage = {
  type: 'error';
  requestId: number;
  message: string;
  code?: string;
  details?: unknown;
};

export type VolumeWorkerOutboundMessage =
  | VolumeStartMessage
  | VolumeSliceMessage
  | VolumeLoadedMessage
  | VolumeWorkerCompleteMessage
  | VolumeWorkerErrorMessage;
