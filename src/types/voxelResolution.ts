export type VoxelResolutionUnit = 'Å' | 'nm' | 'μm' | 'mm';

export type VoxelResolutionInput = {
  x: string;
  y: string;
  z: string;
  unit: VoxelResolutionUnit;
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
