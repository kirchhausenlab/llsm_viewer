import { useCallback, useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import { computeAnisotropyScale } from '../shared/utils/anisotropyCorrection';
import type {
  TemporalResolutionUnit,
  VoxelResolutionAxis,
  VoxelResolutionInput,
  VoxelResolutionUnit,
  VoxelResolutionValues
} from '../types/voxelResolution';
import type { AnisotropyScaleFactors } from '../types/voxelResolution';

const DEFAULT_VOXEL_RESOLUTION: VoxelResolutionInput = {
  x: '1.0',
  y: '1.0',
  z: '1.0',
  t: '1.0',
  unit: 'μm',
  timeUnit: 's',
  correctAnisotropy: false
};

const SPATIAL_VOXEL_RESOLUTION_AXES: ReadonlyArray<keyof AnisotropyScaleFactors> = ['x', 'y', 'z'];

export type VoxelResolutionState = {
  voxelResolutionInput: VoxelResolutionInput;
  voxelResolution: VoxelResolutionValues | null;
  anisotropyScale: { x: number; y: number; z: number } | null;
  trackScale: { x: number; y: number; z: number };
};

export type VoxelResolutionActions = {
  handleVoxelResolutionAxisChange: (axis: VoxelResolutionAxis, value: string) => void;
  handleVoxelResolutionUnitChange: (unit: VoxelResolutionUnit) => void;
  handleVoxelResolutionTimeUnitChange: (unit: TemporalResolutionUnit) => void;
  handleVoxelResolutionAnisotropyToggle: (value: boolean) => void;
  setVoxelResolutionInput: Dispatch<SetStateAction<VoxelResolutionInput>>;
};

export type VoxelResolutionHook = VoxelResolutionState & VoxelResolutionActions;

export function useVoxelResolution(initial: VoxelResolutionInput = DEFAULT_VOXEL_RESOLUTION): VoxelResolutionHook {
  const [voxelResolutionInput, setVoxelResolutionInput] = useState<VoxelResolutionInput>(initial);

  const voxelResolution = useMemo<VoxelResolutionValues | null>(() => {
    const parsed: Partial<Record<'x' | 'y' | 'z', number>> = {};
    for (const axis of SPATIAL_VOXEL_RESOLUTION_AXES) {
      const rawValue = voxelResolutionInput[axis].trim();
      if (!rawValue) {
        return null;
      }
      const numericValue = Number(rawValue);
      if (!Number.isFinite(numericValue)) {
        return null;
      }
      parsed[axis] = numericValue;
    }

    return {
      x: parsed.x ?? 0,
      y: parsed.y ?? 0,
      z: parsed.z ?? 0,
      unit: voxelResolutionInput.unit,
      correctAnisotropy: voxelResolutionInput.correctAnisotropy
    };
  }, [voxelResolutionInput]);

  const anisotropyScale = useMemo(() => computeAnisotropyScale(voxelResolution), [voxelResolution]);

  const trackScale = useMemo(() => anisotropyScale ?? { x: 1, y: 1, z: 1 }, [anisotropyScale]);

  const handleVoxelResolutionAxisChange = useCallback((axis: VoxelResolutionAxis, value: string) => {
    const normalizedValue = value.replace(/,/g, '.');
    setVoxelResolutionInput((current) => {
      if (current[axis] === normalizedValue) {
        return current;
      }
      return { ...current, [axis]: normalizedValue };
    });
  }, []);

  const handleVoxelResolutionUnitChange = useCallback((unit: VoxelResolutionUnit) => {
    setVoxelResolutionInput((current) => {
      if (current.unit === unit) {
        return current;
      }
      return { ...current, unit };
    });
  }, []);

  const handleVoxelResolutionTimeUnitChange = useCallback((unit: TemporalResolutionUnit) => {
    setVoxelResolutionInput((current) => {
      if (current.timeUnit === unit) {
        return current;
      }
      return { ...current, timeUnit: unit };
    });
  }, []);

  const handleVoxelResolutionAnisotropyToggle = useCallback((value: boolean) => {
    setVoxelResolutionInput((current) => {
      if (current.correctAnisotropy === value) {
        return current;
      }
      return { ...current, correctAnisotropy: value };
    });
  }, []);

  return {
    voxelResolutionInput,
    voxelResolution,
    anisotropyScale,
    trackScale,
    handleVoxelResolutionAxisChange,
    handleVoxelResolutionUnitChange,
    handleVoxelResolutionTimeUnitChange,
    handleVoxelResolutionAnisotropyToggle,
    setVoxelResolutionInput
  };
}

export { DEFAULT_VOXEL_RESOLUTION };
