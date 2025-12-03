import { useCallback, useMemo, useState } from 'react';

import { computeAnisotropyScale } from '../shared/utils/anisotropyCorrection';
import type { VoxelResolutionAxis, VoxelResolutionInput, VoxelResolutionUnit, VoxelResolutionValues } from '../types/voxelResolution';

const DEFAULT_VOXEL_RESOLUTION: VoxelResolutionInput = {
  x: '1.0',
  y: '1.0',
  z: '1.0',
  unit: 'μm',
  correctAnisotropy: false
};

const DEFAULT_EXPERIMENT_DIMENSION: '3d' | '2d' = '3d';

export type ExperimentDimension = '3d' | '2d';

export type VoxelResolutionState = {
  voxelResolutionInput: VoxelResolutionInput;
  voxelResolution: VoxelResolutionValues | null;
  anisotropyScale: { x: number; y: number; z: number } | null;
  experimentDimension: ExperimentDimension;
  trackScale: { x: number; y: number; z: number };
};

export type VoxelResolutionActions = {
  handleVoxelResolutionAxisChange: (axis: VoxelResolutionAxis, value: string) => void;
  handleVoxelResolutionUnitChange: (unit: VoxelResolutionUnit) => void;
  handleVoxelResolutionAnisotropyToggle: (value: boolean) => void;
  handleExperimentDimensionChange: (dimension: ExperimentDimension) => void;
  setExperimentDimension: React.Dispatch<React.SetStateAction<ExperimentDimension>>;
  setVoxelResolutionInput: React.Dispatch<React.SetStateAction<VoxelResolutionInput>>;
};

export type VoxelResolutionHook = VoxelResolutionState & VoxelResolutionActions;

export function useVoxelResolution(
  initial: VoxelResolutionInput = DEFAULT_VOXEL_RESOLUTION,
  initialDimension: ExperimentDimension = DEFAULT_EXPERIMENT_DIMENSION
): VoxelResolutionHook {
  const [voxelResolutionInput, setVoxelResolutionInput] = useState<VoxelResolutionInput>(initial);
  const [experimentDimension, setExperimentDimension] = useState<ExperimentDimension>(initialDimension);

  const voxelResolution = useMemo<VoxelResolutionValues | null>(() => {
    const axes: VoxelResolutionAxis[] = experimentDimension === '2d' ? ['x', 'y'] : ['x', 'y', 'z'];
    const parsed: Partial<Record<VoxelResolutionAxis, number>> = {};
    for (const axis of axes) {
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

    let resolvedZ: number | undefined = parsed.z;
    if (experimentDimension === '2d') {
      const rawZ = voxelResolutionInput.z.trim();
      if (rawZ) {
        const numericZ = Number(rawZ);
        if (!Number.isFinite(numericZ)) {
          return null;
        }
        resolvedZ = numericZ;
      } else {
        resolvedZ = parsed.y ?? parsed.x;
      }
    }

    if (resolvedZ === undefined) {
      return null;
    }

    return {
      x: parsed.x ?? 0,
      y: parsed.y ?? 0,
      z: resolvedZ,
      unit: voxelResolutionInput.unit,
      correctAnisotropy: voxelResolutionInput.correctAnisotropy
    };
  }, [experimentDimension, voxelResolutionInput]);

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

  const handleVoxelResolutionAnisotropyToggle = useCallback((value: boolean) => {
    setVoxelResolutionInput((current) => {
      if (current.correctAnisotropy === value) {
        return current;
      }
      return { ...current, correctAnisotropy: value };
    });
  }, []);

  const handleExperimentDimensionChange = useCallback((dimension: ExperimentDimension) => {
    setExperimentDimension((current) => (current === dimension ? current : dimension));
  }, []);

  return {
    voxelResolutionInput,
    voxelResolution,
    anisotropyScale,
    trackScale,
    experimentDimension,
    handleVoxelResolutionAxisChange,
    handleVoxelResolutionUnitChange,
    handleVoxelResolutionAnisotropyToggle,
    handleExperimentDimensionChange,
    setExperimentDimension,
    setVoxelResolutionInput
  };
}

export { DEFAULT_VOXEL_RESOLUTION, DEFAULT_EXPERIMENT_DIMENSION };
