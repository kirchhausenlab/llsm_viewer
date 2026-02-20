import type { FC } from 'react';
import type { ExperimentType } from './FrontPage';
import type {
  TemporalResolutionUnit,
  VoxelResolutionAxis,
  VoxelResolutionInput,
  VoxelResolutionUnit
} from '../../types/voxelResolution';
import { TEMPORAL_RESOLUTION_UNITS, VOXEL_RESOLUTION_UNITS } from '../../types/voxelResolution';

const SPATIAL_VOXEL_RESOLUTION_AXES_BY_EXPERIMENT_TYPE: Readonly<Record<ExperimentType, ReadonlyArray<{ axis: VoxelResolutionAxis; label: string }>>> = {
  'single-3d-volume': [
    { axis: 'x', label: 'X' },
    { axis: 'y', label: 'Y' },
    { axis: 'z', label: 'Z' }
  ],
  '3d-movie': [
    { axis: 'x', label: 'X' },
    { axis: 'y', label: 'Y' },
    { axis: 'z', label: 'Z' }
  ],
  '2d-movie': [
    { axis: 'x', label: 'X' },
    { axis: 'y', label: 'Y' }
  ]
};

type ExperimentConfigurationProps = {
  experimentType: ExperimentType;
  voxelResolution: VoxelResolutionInput;
  onVoxelResolutionAxisChange: (axis: VoxelResolutionAxis, value: string) => void;
  onVoxelResolutionUnitChange: (unit: VoxelResolutionUnit) => void;
  onVoxelResolutionTimeUnitChange: (unit: TemporalResolutionUnit) => void;
  onVoxelResolutionAnisotropyToggle: (value: boolean) => void;
  isFrontPageLocked: boolean;
};

const ExperimentConfiguration: FC<ExperimentConfigurationProps> = ({
  experimentType,
  voxelResolution,
  onVoxelResolutionAxisChange,
  onVoxelResolutionUnitChange,
  onVoxelResolutionTimeUnitChange,
  onVoxelResolutionAnisotropyToggle,
  isFrontPageLocked
}) => {
  const spatialResolutionAxes = SPATIAL_VOXEL_RESOLUTION_AXES_BY_EXPERIMENT_TYPE[experimentType];
  const showTemporalResolution = experimentType === '3d-movie' || experimentType === '2d-movie';

  return (
    <>
      <div className="voxel-resolution-row">
        <div className="voxel-resolution-main-row">
          <span className="voxel-resolution-title">Resolution:</span>
          {spatialResolutionAxes.map(({ axis, label }) => (
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
            <select
              aria-label="Spatial unit"
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
          {showTemporalResolution ? (
            <div className="voxel-resolution-temporal-group">
              <label className="voxel-resolution-field">
                <span className="voxel-resolution-field-label">T:</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  value={voxelResolution.t}
                  onChange={(event) => onVoxelResolutionAxisChange('t', event.target.value)}
                  disabled={isFrontPageLocked}
                />
              </label>
              <label className="voxel-resolution-time-unit">
                <select
                  aria-label="Temporal unit"
                  value={voxelResolution.timeUnit}
                  onChange={(event) =>
                    onVoxelResolutionTimeUnitChange(event.target.value as TemporalResolutionUnit)
                  }
                  disabled={isFrontPageLocked}
                >
                  {TEMPORAL_RESOLUTION_UNITS.map((unit: TemporalResolutionUnit) => (
                    <option key={unit} value={unit}>
                      {unit}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}
        </div>
        <div className="voxel-resolution-anisotropy-row">
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
      </div>
    </>
  );
};

export default ExperimentConfiguration;
export type { ExperimentConfigurationProps };
