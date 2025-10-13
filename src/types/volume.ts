export type VolumeDataType =
  | 'uint8'
  | 'int8'
  | 'uint16'
  | 'int16'
  | 'uint32'
  | 'int32'
  | 'float32'
  | 'float64';

export type VolumeMetadata = {
  width: number;
  height: number;
  depth: number;
  channels: number;
  dataType: VolumeDataType;
  voxelSize?: [number, number, number];
  min: number;
  max: number;
};

export type VolumePayload = VolumeMetadata & {
  data: ArrayBuffer;
};
