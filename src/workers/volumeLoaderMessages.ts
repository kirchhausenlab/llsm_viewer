import type { VolumeMetadata } from '../types/volume';

export type VolumeLoadedMessage = {
  type: 'volume-loaded';
  requestId: number;
  index: number;
  metadata: VolumeMetadata;
  buffer: ArrayBuffer;
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
  | VolumeLoadedMessage
  | VolumeWorkerCompleteMessage
  | VolumeWorkerErrorMessage;
