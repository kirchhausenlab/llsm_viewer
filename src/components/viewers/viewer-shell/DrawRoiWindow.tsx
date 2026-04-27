import FloatingWindow from '../../widgets/FloatingWindow';
import {
  ViewerWindowButton,
  ViewerWindowDivider,
  ViewerWindowRow,
  ViewerWindowSegmentedControl,
  ViewerWindowSlider,
  ViewerWindowStack,
} from './window-ui';
import type { LayoutProps } from './types';
import type { RoiDefinition, RoiDimensionMode, RoiTool } from '../../../types/roi';
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
  tool: RoiTool;
  dimensionMode: RoiDimensionMode;
  selectedZIndex: number;
  currentRoiName: string;
  roiAttachmentState: 'none' | 'unsaved' | 'saved';
  currentColor: string;
  workingRoi: RoiDefinition | null;
  twoDCurrentZEnabled: boolean;
  twoDStartZIndex: number;
  onToolChange: (tool: RoiTool) => void;
  onDimensionModeChange: (mode: RoiDimensionMode) => void;
  onColorChange: (color: string) => void;
  onTwoDCurrentZEnabledChange: (enabled: boolean) => void;
  onTwoDStartZIndexChange: (value: number) => void;
  onUpdateWorkingRoi: (updater: (current: RoiDefinition) => RoiDefinition) => void;
  onClearOrDetach: () => void;
  onClose: () => void;
};

function LineIcon() {
  return (
    <svg viewBox="0 0 24 24" className="roi-tool-icon" aria-hidden="true">
      <path d="M5 18 19 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function RectangleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="roi-tool-icon" aria-hidden="true">
      <rect x="5" y="5" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" rx="1" />
    </svg>
  );
}

function EllipseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="roi-tool-icon" aria-hidden="true">
      <ellipse cx="12" cy="12" rx="7" ry="5.5" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

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
  tool,
  dimensionMode,
  selectedZIndex,
  currentRoiName,
  roiAttachmentState,
  currentColor,
  workingRoi,
  twoDCurrentZEnabled,
  twoDStartZIndex,
  onToolChange,
  onDimensionModeChange,
  onColorChange,
  onTwoDCurrentZEnabledChange,
  onTwoDStartZIndexChange,
  onUpdateWorkingRoi,
  onClearOrDetach,
  onClose,
}: DrawRoiWindowProps) {
  const hasAttachedRoi = workingRoi !== null;
  const effectiveTool = workingRoi?.shape ?? tool;
  const effectiveDimensionMode = workingRoi?.mode ?? dimensionMode;
  const isTwoDMode = effectiveDimensionMode === '2d';
  const actionButtonLabel = roiAttachmentState === 'saved' ? 'Detach' : 'Clear';
  const actionButtonDisabled = roiAttachmentState === 'none';

  const handlePointCoordinateChange = (pointKey: 'start' | 'end', axis: AxisKey, nextValue: number) => {
    if (!workingRoi && axis === 'z' && pointKey === 'start' && isTwoDMode) {
      onTwoDStartZIndexChange(nextValue);
      return;
    }
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
      title="Draw ROI"
      initialPosition={initialPosition}
      width={`min(${controlWindowWidth}px, calc(100vw - ${windowMargin * 2}px))`}
      resetSignal={resetSignal}
      className="floating-window--draw-roi"
      onClose={onClose}
    >
      <ViewerWindowStack className="draw-roi-window">
        <ViewerWindowRow className="draw-roi-toolbar" wrap>
          <ViewerWindowSegmentedControl
            className="draw-roi-segmented-control draw-roi-segmented-control--mode"
            buttonClassName="draw-roi-segment-button"
            ariaLabel="ROI dimension"
            value={effectiveDimensionMode}
            onChange={onDimensionModeChange}
            disabled={hasAttachedRoi}
            options={(['2d', '3d'] as const).map((mode) => ({
              value: mode,
              content: mode.toUpperCase(),
            }))}
          />

          <ViewerWindowSegmentedControl
            className="draw-roi-segmented-control draw-roi-segmented-control--shape"
            buttonClassName="draw-roi-segment-button"
            ariaLabel="ROI drawing tool"
            value={effectiveTool}
            onChange={onToolChange}
            disabled={hasAttachedRoi}
            options={[
              { value: 'line', ariaLabel: 'Line', title: 'Line', className: 'draw-roi-tool-button', content: <LineIcon /> },
              {
                value: 'rectangle',
                ariaLabel: 'Rectangle',
                title: 'Rectangle',
                className: 'draw-roi-tool-button',
                content: <RectangleIcon />,
              },
              {
                value: 'ellipse',
                ariaLabel: 'Ellipse',
                title: 'Ellipse',
                className: 'draw-roi-tool-button',
                content: <EllipseIcon />,
              },
            ]}
          />
        </ViewerWindowRow>

        <div className="draw-roi-sliders" role="group" aria-label="ROI coordinates">
          <div className="draw-roi-name-row">
            <span>{currentRoiName}</span>
            <ViewerWindowButton
              type="button"
              className="draw-roi-action-button"
              disabled={actionButtonDisabled}
              onClick={onClearOrDetach}
            >
              {actionButtonLabel}
            </ViewerWindowButton>
          </div>
          {(['x', 'y', 'z'] as const).map((axis) => (
            <ViewerWindowRow key={axis} className="draw-roi-slider-row">
              {(['start', 'end'] as const).map((pointKey) => {
                if (axis === 'z' && pointKey === 'end' && isTwoDMode) {
                  return (
                    <div
                      key="two-d-current-z"
                      className="control-group control-group--slider draw-roi-slider-group draw-roi-slider-group--toggle"
                    >
                      <label htmlFor="draw-roi-current-z-toggle" className="draw-roi-checkbox-row">
                        <input
                          id="draw-roi-current-z-toggle"
                          type="checkbox"
                          checked={twoDCurrentZEnabled}
                          onChange={(event) => onTwoDCurrentZEnabledChange(event.target.checked)}
                        />
                        <span>Current Z</span>
                      </label>
                    </div>
                  );
                }

                const max =
                  axis === 'x'
                    ? Math.max(0, volumeDimensions.width - 1)
                    : axis === 'y'
                      ? Math.max(0, volumeDimensions.height - 1)
                      : Math.max(0, volumeDimensions.depth - 1);
                const value = (() => {
                  if (axis === 'z' && pointKey === 'start' && isTwoDMode) {
                    if (twoDCurrentZEnabled) {
                      return workingRoi?.start.z ?? selectedZIndex;
                    }
                    return workingRoi?.start.z ?? twoDStartZIndex;
                  }
                  return workingRoi ? workingRoi[pointKey][axis] : 0;
                })();
                const disabled = (() => {
                  if (axis === 'z' && pointKey === 'start' && isTwoDMode) {
                    return twoDCurrentZEnabled;
                  }
                  return !workingRoi;
                })();

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
          ))}
        </div>

        <ViewerWindowDivider />

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
