import type { FC } from 'react';
import type { VoxelResolutionInput, VoxelResolutionUnit } from '../../types/voxelResolution';
import { VOXEL_RESOLUTION_UNITS } from '../../types/voxelResolution';

export type VoxelResolutionAxis = 'x' | 'y' | 'z';

const VOXEL_RESOLUTION_AXES: ReadonlyArray<{ axis: VoxelResolutionAxis; label: string }> = [
  { axis: 'x', label: 'X' },
  { axis: 'y', label: 'Y' },
  { axis: 'z', label: 'Z' }
];

type ExperimentConfigurationProps = {
  voxelResolution: VoxelResolutionInput;
  onVoxelResolutionAxisChange: (axis: VoxelResolutionAxis, value: string) => void;
  onVoxelResolutionUnitChange: (unit: VoxelResolutionUnit) => void;
  onVoxelResolutionAnisotropyToggle: (value: boolean) => void;
  isFrontPageLocked: boolean;
};

const ExperimentConfiguration: FC<ExperimentConfigurationProps> = ({
  voxelResolution,
  onVoxelResolutionAxisChange,
  onVoxelResolutionUnitChange,
  onVoxelResolutionAnisotropyToggle,
  isFrontPageLocked
}) => {
  return (
    <>
      <div className="voxel-resolution-row">
        <span className="voxel-resolution-title">Voxel resolution:</span>
        {VOXEL_RESOLUTION_AXES.map(({ axis, label }) => (
          <label key={axis} className="voxel-resolution-field">
            <span className="voxel-resolution-field-label">{label}:</span>
            <input
              type="number"
              inputMode="decimal"
              step="any"
              value={voxelResolution[axis]}
              onChange={(event) => onVoxelResolutionAxisChange(axis, event.target.value)}
              disabled={isFrontPageLocked}
            />
          </label>
        ))}
        <label className="voxel-resolution-unit">
          <span className="voxel-resolution-field-label">Unit</span>
          <select
            value={voxelResolution.unit}
            onChange={(event) => onVoxelResolutionUnitChange(event.target.value as VoxelResolutionUnit)}
            disabled={isFrontPageLocked}
          >
            {VOXEL_RESOLUTION_UNITS.map((unit: VoxelResolutionUnit) => (
              <option key={unit} value={unit}>
                {unit}
              </option>
            ))}
          </select>
        </label>
        <label className="voxel-resolution-anisotropy">
          <input
            type="checkbox"
            checked={voxelResolution.correctAnisotropy}
            onChange={(event) => onVoxelResolutionAnisotropyToggle(event.target.checked)}
            disabled={isFrontPageLocked}
          />
          <strong>Make data isotropic</strong>
        </label>
      </div>
    </>
  );
};

export default ExperimentConfiguration;
export type { ExperimentConfigurationProps };
