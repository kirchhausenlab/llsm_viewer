export type VoxelResolutionUnit = 'Å' | 'nm' | 'μm' | 'mm';
export type TemporalResolutionUnit = 'ns' | 'μs' | 'ms' | 's';

export type AnisotropyScaleFactors = {
  x: number;
  y: number;
  z: number;
};

export type VoxelResolutionInput = {
  x: string;
  y: string;
  z: string;
  t: string;
  unit: VoxelResolutionUnit;
  timeUnit: TemporalResolutionUnit;
  correctAnisotropy: boolean;
};

export type VoxelResolutionValues = {
  x: number;
  y: number;
  z: number;
  unit: VoxelResolutionUnit;
  correctAnisotropy: boolean;
};

export const VOXEL_RESOLUTION_UNITS: readonly VoxelResolutionUnit[] = ['Å', 'nm', 'μm', 'mm'];
export const TEMPORAL_RESOLUTION_UNITS: readonly TemporalResolutionUnit[] = ['ns', 'μs', 'ms', 's'];

export type VoxelResolutionAxis = 'x' | 'y' | 'z' | 't';
