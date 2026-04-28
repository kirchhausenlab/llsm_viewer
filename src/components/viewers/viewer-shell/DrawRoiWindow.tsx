import FloatingWindow from '../../widgets/FloatingWindow';
import {
  ViewerWindowRow,
  ViewerWindowSlider,
  ViewerWindowStack,
} from './window-ui';
import type { LayoutProps } from './types';
import type { RoiDefinition, RoiDimensionMode } from '../../../types/roi';
import { ROI_COLOR_SWATCHES } from '../../../types/roi';
import { fromUserFacingVoxelIndex, toUserFacingVoxelIndex } from '../../../shared/utils/voxelIndex';

type DrawRoiWindowProps = {
  initialPosition: LayoutProps['drawRoiWindowInitialPosition'];
  windowMargin: number;
  controlWindowWidth: number;
  resetSignal: number;
  volumeDimensions: {
    width: number;
    height: number;
    depth: number;
  };
  dimensionMode: RoiDimensionMode;
  currentRoiName: string;
  currentColor: string;
  workingRoi: RoiDefinition | null;
  onColorChange: (color: string) => void;
  onUpdateWorkingRoi: (updater: (current: RoiDefinition) => RoiDefinition) => void;
  onClose: () => void;
};

type AxisKey = keyof RoiDefinition['start'];

const clampCoordinate = (value: number, axis: AxisKey, volumeDimensions: DrawRoiWindowProps['volumeDimensions']) => {
  const max =
    axis === 'x'
      ? Math.max(0, volumeDimensions.width - 1)
      : axis === 'y'
        ? Math.max(0, volumeDimensions.height - 1)
        : Math.max(0, volumeDimensions.depth - 1);
  return Math.min(max, Math.max(0, Math.round(value)));
};

export default function DrawRoiWindow({
  initialPosition,
  windowMargin,
  controlWindowWidth,
  resetSignal,
  volumeDimensions,
  dimensionMode,
  currentRoiName,
  currentColor,
  workingRoi,
  onColorChange,
  onUpdateWorkingRoi,
  onClose,
}: DrawRoiWindowProps) {
  const effectiveDimensionMode = workingRoi?.mode ?? dimensionMode;
  const isTwoDMode = effectiveDimensionMode === '2d';

  const handlePointCoordinateChange = (pointKey: 'start' | 'end', axis: AxisKey, nextValue: number) => {
    if (!workingRoi) {
      return;
    }

    onUpdateWorkingRoi((current) => {
      const clampedValue = clampCoordinate(nextValue, axis, volumeDimensions);
      const next = {
        ...current,
        start: { ...current.start },
        end: { ...current.end },
      };
      next[pointKey][axis] = clampedValue;
      if (current.mode === '2d' && axis === 'z') {
        next.start.z = clampedValue;
        next.end.z = clampedValue;
      } else if (current.mode === '2d' && pointKey === 'start' && axis === 'z') {
        next.end.z = clampedValue;
      }
      return next;
    });
  };

  return (
    <FloatingWindow
      title="ROI properties"
      initialPosition={initialPosition}
      width={`min(${controlWindowWidth}px, calc(100vw - ${windowMargin * 2}px))`}
      resetSignal={resetSignal}
      className="floating-window--draw-roi"
      onClose={onClose}
    >
      <ViewerWindowStack className="draw-roi-window">
        <div className="draw-roi-sliders" role="group" aria-label="ROI coordinates">
          <div className="draw-roi-name-row">
            <span>{currentRoiName}</span>
          </div>
          {(['x', 'y', 'z'] as const).flatMap((axis) => {
            if (axis === 'z' && isTwoDMode) {
              return [];
            }
            return (
              <ViewerWindowRow key={axis} className="draw-roi-slider-row">
                {(['start', 'end'] as const).map((pointKey) => {
                  const max =
                    axis === 'x'
                      ? Math.max(0, volumeDimensions.width - 1)
                      : axis === 'y'
                        ? Math.max(0, volumeDimensions.height - 1)
                        : Math.max(0, volumeDimensions.depth - 1);
                  const value = workingRoi ? workingRoi[pointKey][axis] : 0;
                  const disabled = !workingRoi;

                  return (
                    <ViewerWindowSlider
                      key={`${pointKey}-${axis}`}
                      id={`draw-roi-${pointKey}-${axis}-slider`}
                      className="draw-roi-slider-group"
                      label={`${axis.toUpperCase()} ${pointKey === 'start' ? 'Start' : 'End'}`}
                      valueLabel={toUserFacingVoxelIndex(value)}
                      min={1}
                      max={max + 1}
                      step={1}
                      value={toUserFacingVoxelIndex(value)}
                      disabled={disabled}
                      onChange={(event) =>
                        handlePointCoordinateChange(pointKey, axis, fromUserFacingVoxelIndex(Number(event.target.value)))
                      }
                    />
                  );
                })}
              </ViewerWindowRow>
            );
          })}
        </div>

        <div className="draw-roi-color-section">
          <div className="draw-roi-color-header">
            <span>Color</span>
            <span>{currentColor}</span>
          </div>
          <div className="draw-roi-color-row">
            <div className="color-swatch-grid" role="group" aria-label="ROI color presets">
              {ROI_COLOR_SWATCHES.map((swatch) => {
                const isSelected = swatch.value.toUpperCase() === currentColor;
                return (
                  <button
                    key={swatch.value}
                    type="button"
                    className={isSelected ? 'color-swatch-button is-selected' : 'color-swatch-button'}
                    style={{ backgroundColor: swatch.value }}
                    aria-pressed={isSelected}
                    aria-label={`${swatch.label} ROI color`}
                    onClick={() => onColorChange(swatch.value)}
                  />
                );
              })}
              <label className="color-picker-trigger draw-roi-color-picker" htmlFor="draw-roi-color-input">
                <input
                  id="draw-roi-color-input"
                  className="color-picker-input"
                  type="color"
                  value={currentColor}
                  onChange={(event) => onColorChange(event.target.value)}
                  aria-label="Choose ROI color"
                />
                <span
                  className="color-picker-indicator"
                  style={{ backgroundColor: currentColor }}
                  aria-hidden="true"
                />
              </label>
            </div>
          </div>
        </div>
      </ViewerWindowStack>
    </FloatingWindow>
  );
}
