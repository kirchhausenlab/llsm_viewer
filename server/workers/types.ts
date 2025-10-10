export type VolumeDataType =
  | 'uint8'
  | 'int8'
  | 'uint16'
  | 'int16'
  | 'uint32'
  | 'int32'
  | 'float32'
  | 'float64';

export interface VolumeMetadata {
  width: number;
  height: number;
  depth: number;
  channels: number;
  dataType: VolumeDataType;
  min: number;
  max: number;
}

export interface LoadVolumeRequestMessage {
  id: number;
  directoryPath: string;
  filename: string;
}

export interface LoadVolumeSuccessMessage {
  id: number;
  ok: true;
  metadata: VolumeMetadata;
  buffer: ArrayBuffer;
}

export interface LoadVolumeErrorMessage {
  id: number;
  ok: false;
  error: {
    message: string;
    statusCode?: number;
    code?: string;
  };
}

export type LoadVolumeWorkerResponse = LoadVolumeSuccessMessage | LoadVolumeErrorMessage;
