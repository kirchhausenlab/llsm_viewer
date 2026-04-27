import type { FC } from 'react';
import type { ExperimentType } from './FrontPage';
import type {
  TemporalResolutionUnit,
  VoxelResolutionAxis,
  VoxelResolutionInput,
  VoxelResolutionUnit
} from '../../types/voxelResolution';
import { TEMPORAL_RESOLUTION_UNITS, VOXEL_RESOLUTION_UNITS } from '../../types/voxelResolution';

type SkewAngleUnit = 'degrees' | 'radians';
type SkewDirection = 'X' | 'Y';

const SKEW_ANGLE_UNITS: readonly SkewAngleUnit[] = ['degrees', 'radians'];
const SKEW_DIRECTIONS: readonly SkewDirection[] = ['X', 'Y'];

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
  backgroundMaskEnabled: boolean;
  backgroundMaskValuesInput: string;
  backgroundMaskError: string | null;
  onBackgroundMaskToggle: (value: boolean) => void;
  onBackgroundMaskValuesInputChange: (value: string) => void;
  force8BitRender: boolean;
  onForce8BitRenderToggle: (value: boolean) => void;
  deSkewModeEnabled: boolean;
  skewAngleInput: string;
  skewAngleUnit: SkewAngleUnit;
  skewDirection: SkewDirection;
  deSkewMaskVoxels: boolean;
  onDeSkewModeToggle: (value: boolean) => void;
  onSkewAngleInputChange: (value: string) => void;
  onSkewAngleUnitChange: (value: SkewAngleUnit) => void;
  onSkewDirectionChange: (value: SkewDirection) => void;
  onDeSkewMaskVoxelsToggle: (value: boolean) => void;
  isFrontPageLocked: boolean;
};

const ExperimentConfiguration: FC<ExperimentConfigurationProps> = ({
  experimentType,
  voxelResolution,
  onVoxelResolutionAxisChange,
  onVoxelResolutionUnitChange,
  onVoxelResolutionTimeUnitChange,
  onVoxelResolutionAnisotropyToggle,
  backgroundMaskEnabled,
  backgroundMaskValuesInput,
  backgroundMaskError,
  onBackgroundMaskToggle,
  onBackgroundMaskValuesInputChange,
  force8BitRender,
  onForce8BitRenderToggle,
  deSkewModeEnabled,
  skewAngleInput,
  skewAngleUnit,
  skewDirection,
  deSkewMaskVoxels,
  onDeSkewModeToggle,
  onSkewAngleInputChange,
  onSkewAngleUnitChange,
  onSkewDirectionChange,
  onDeSkewMaskVoxelsToggle,
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
          <label className="voxel-resolution-anisotropy voxel-resolution-main-toggle">
            <input
              type="checkbox"
              checked={voxelResolution.correctAnisotropy}
              onChange={(event) => onVoxelResolutionAnisotropyToggle(event.target.checked)}
              disabled={isFrontPageLocked}
            />
            <strong>Make data isotropic</strong>
          </label>
        </div>
        <div className="voxel-resolution-anisotropy-row">
          <label className="voxel-resolution-anisotropy voxel-resolution-background-mask">
            <input
              type="checkbox"
              checked={backgroundMaskEnabled}
              onChange={(event) => onBackgroundMaskToggle(event.target.checked)}
              disabled={isFrontPageLocked}
            />
            <strong>Mask voxels by intensity</strong>
          </label>
          {backgroundMaskEnabled ? (
            <label className="voxel-resolution-background-mask-values">
              <span className="voxel-resolution-field-label">Values:</span>
              <input
                type="text"
                value={backgroundMaskValuesInput}
                onChange={(event) => onBackgroundMaskValuesInputChange(event.target.value)}
                placeholder="0; 65535; -1"
                disabled={isFrontPageLocked}
                aria-label="Mask voxels by intensity values"
              />
            </label>
          ) : null}
          <label className="voxel-resolution-anisotropy">
            <input
              type="checkbox"
              checked={force8BitRender}
              onChange={(event) => onForce8BitRenderToggle(event.target.checked)}
              disabled={isFrontPageLocked}
            />
            <strong>Force 8bit render (performance)</strong>
          </label>
        </div>
        <div className="voxel-resolution-anisotropy-row voxel-resolution-skew-row">
          <label className="voxel-resolution-anisotropy">
            <input
              type="checkbox"
              checked={deSkewModeEnabled}
              onChange={(event) => onDeSkewModeToggle(event.target.checked)}
              disabled={isFrontPageLocked}
            />
            <strong>De-skew mode</strong>
          </label>
          {deSkewModeEnabled ? (
            <>
              <label className="voxel-resolution-field voxel-resolution-skew-angle-field">
                <span className="voxel-resolution-field-label">Skew angle:</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  value={skewAngleInput}
                  onChange={(event) => onSkewAngleInputChange(event.target.value)}
                  disabled={isFrontPageLocked}
                />
              </label>
              <label className="voxel-resolution-unit voxel-resolution-skew-unit">
                <select
                  aria-label="Skew angle unit"
                  value={skewAngleUnit}
                  onChange={(event) => onSkewAngleUnitChange(event.target.value as SkewAngleUnit)}
                  disabled={isFrontPageLocked}
                >
                  {SKEW_ANGLE_UNITS.map((unit: SkewAngleUnit) => (
                    <option key={unit} value={unit}>
                      {unit}
                    </option>
                  ))}
                </select>
              </label>
              <label className="voxel-resolution-unit voxel-resolution-skew-direction">
                <span className="voxel-resolution-field-label">Skew direction:</span>
                <select
                  aria-label="Skew direction"
                  value={skewDirection}
                  onChange={(event) => onSkewDirectionChange(event.target.value as SkewDirection)}
                  disabled={isFrontPageLocked}
                >
                  {SKEW_DIRECTIONS.map((direction: SkewDirection) => (
                    <option key={direction} value={direction}>
                      {direction}
                    </option>
                  ))}
                </select>
              </label>
              <label className="voxel-resolution-anisotropy">
                <input
                  type="checkbox"
                  checked={deSkewMaskVoxels}
                  onChange={(event) => onDeSkewMaskVoxelsToggle(event.target.checked)}
                  disabled={isFrontPageLocked}
                />
                <strong>Mask voxels</strong>
              </label>
            </>
          ) : null}
        </div>
        {backgroundMaskEnabled && backgroundMaskError ? (
          <div className="voxel-resolution-background-mask-error">{backgroundMaskError}</div>
        ) : null}
      </div>
    </>
  );
};

export default ExperimentConfiguration;
export type { ExperimentConfigurationProps, SkewAngleUnit, SkewDirection };
