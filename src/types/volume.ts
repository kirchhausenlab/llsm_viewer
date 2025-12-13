export type VolumeDataType =
  | 'uint8'
  | 'int8'
  | 'uint16'
  | 'int16'
  | 'uint32'
  | 'int32'
  | 'float32'
  | 'float64';

export type VolumeTypedArray =
  | Uint8Array
  | Int8Array
  | Uint16Array
  | Int16Array
  | Uint32Array
  | Int32Array
  | Float32Array
  | Float64Array;

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

export type VolumeDataHandle<Store = unknown> = {
  kind: 'zarr';
  store: Store;
  path: string;
  chunkShape: [number, number, number, number];
};

export type VolumePayload<Data = ArrayBufferLike | VolumeDataHandle> = VolumeMetadata & {
  data: Data;
};

export function isVolumeDataHandle(value: unknown): value is VolumeDataHandle {
  return (
    typeof value === 'object' &&
    !!value &&
    (value as Partial<VolumeDataHandle>).kind === 'zarr' &&
    typeof (value as Partial<VolumeDataHandle>).path === 'string'
  );
}

export function getBytesPerValue(type: VolumeDataType): number {
  switch (type) {
    case 'uint8':
    case 'int8':
      return 1;
    case 'uint16':
    case 'int16':
      return 2;
    case 'uint32':
    case 'int32':
    case 'float32':
      return 4;
    case 'float64':
      return 8;
    default: {
      const exhaustive: never = type;
      throw new Error(`Unsupported volume data type: ${exhaustive}`);
    }
  }
}

export function createVolumeTypedArray(
  type: VolumeDataType,
  buffer: ArrayBufferLike,
  byteOffset = 0,
  length?: number
): VolumeTypedArray {
  switch (type) {
    case 'uint8':
      return new Uint8Array(buffer, byteOffset, length);
    case 'int8':
      return new Int8Array(buffer, byteOffset, length);
    case 'uint16':
      return new Uint16Array(buffer, byteOffset, length);
    case 'int16':
      return new Int16Array(buffer, byteOffset, length);
    case 'uint32':
      return new Uint32Array(buffer, byteOffset, length);
    case 'int32':
      return new Int32Array(buffer, byteOffset, length);
    case 'float32':
      return new Float32Array(buffer, byteOffset, length);
    case 'float64':
      return new Float64Array(buffer, byteOffset, length);
    default: {
      const exhaustive: never = type;
      throw new Error(`Unsupported volume data type: ${exhaustive}`);
    }
  }
}

export function createWritableVolumeArray(type: VolumeDataType, length: number): VolumeTypedArray {
  switch (type) {
    case 'uint8':
      return new Uint8Array(length);
    case 'int8':
      return new Int8Array(length);
    case 'uint16':
      return new Uint16Array(length);
    case 'int16':
      return new Int16Array(length);
    case 'uint32':
      return new Uint32Array(length);
    case 'int32':
      return new Int32Array(length);
    case 'float32':
      return new Float32Array(length);
    case 'float64':
      return new Float64Array(length);
    default: {
      const exhaustive: never = type;
      throw new Error(`Unsupported volume data type: ${exhaustive}`);
    }
  }
}
