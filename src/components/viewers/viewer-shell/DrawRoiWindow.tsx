import FloatingWindow from '../../widgets/FloatingWindow';
import type { LayoutProps } from './types';
import type { RoiDefinition, RoiDimensionMode, RoiTool } from '../../../types/roi';
import { ROI_COLOR_SWATCHES } from '../../../types/roi';

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
  currentRoiName: string;
  currentColor: string;
  workingRoi: RoiDefinition | null;
  onToolChange: (tool: RoiTool) => void;
  onDimensionModeChange: (mode: RoiDimensionMode) => void;
  onColorChange: (color: string) => void;
  onUpdateWorkingRoi: (updater: (current: RoiDefinition) => RoiDefinition) => void;
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
  currentRoiName,
  currentColor,
  workingRoi,
  onToolChange,
  onDimensionModeChange,
  onColorChange,
  onUpdateWorkingRoi,
  onClose,
}: DrawRoiWindowProps) {
  const slidersDisabled = workingRoi === null;
  const endZDisabled = slidersDisabled || workingRoi?.mode === '2d';

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
      title="Draw ROI"
      initialPosition={initialPosition}
      width={`min(${controlWindowWidth}px, calc(100vw - ${windowMargin * 2}px))`}
      resetSignal={resetSignal}
      className="floating-window--draw-roi"
      onClose={onClose}
    >
      <div className="global-controls draw-roi-window">
        <div className="control-row draw-roi-toolbar">
          <div
            className="draw-roi-segmented-control draw-roi-segmented-control--mode"
            role="group"
            aria-label="ROI dimension"
          >
            {(['2d', '3d'] as const).map((mode) => {
              const isSelected = dimensionMode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  className={isSelected ? 'draw-roi-segment-button is-active' : 'draw-roi-segment-button'}
                  aria-pressed={isSelected}
                  onClick={() => onDimensionModeChange(mode)}
                >
                  {mode.toUpperCase()}
                </button>
              );
            })}
          </div>

          <div
            className="draw-roi-segmented-control draw-roi-segmented-control--shape"
            role="group"
            aria-label="ROI drawing tool"
          >
            <button
              type="button"
              className={tool === 'line' ? 'draw-roi-segment-button draw-roi-tool-button is-active' : 'draw-roi-segment-button draw-roi-tool-button'}
              aria-pressed={tool === 'line'}
              aria-label="Line"
              onClick={() => onToolChange('line')}
              title="Line"
            >
              <LineIcon />
            </button>
            <button
              type="button"
              className={tool === 'rectangle' ? 'draw-roi-segment-button draw-roi-tool-button is-active' : 'draw-roi-segment-button draw-roi-tool-button'}
              aria-pressed={tool === 'rectangle'}
              aria-label="Rectangle"
              onClick={() => onToolChange('rectangle')}
              title="Rectangle"
            >
              <RectangleIcon />
            </button>
            <button
              type="button"
              className={tool === 'ellipse' ? 'draw-roi-segment-button draw-roi-tool-button is-active' : 'draw-roi-segment-button draw-roi-tool-button'}
              aria-pressed={tool === 'ellipse'}
              aria-label="Ellipse"
              onClick={() => onToolChange('ellipse')}
              title="Ellipse"
            >
              <EllipseIcon />
            </button>
          </div>
        </div>

        <div className="draw-roi-sliders" role="group" aria-label="ROI coordinates">
          <div className="draw-roi-name-row">
            <span>ROI name</span>
            <span>{currentRoiName}</span>
          </div>
          {(['x', 'y', 'z'] as const).map((axis) => (
            <div key={axis} className="control-row draw-roi-slider-row">
              {(['start', 'end'] as const).map((pointKey) => {
                const max =
                  axis === 'x'
                    ? Math.max(0, volumeDimensions.width - 1)
                    : axis === 'y'
                      ? Math.max(0, volumeDimensions.height - 1)
                      : Math.max(0, volumeDimensions.depth - 1);
                const value = workingRoi ? workingRoi[pointKey][axis] : 0;
                const disabled = pointKey === 'end' && axis === 'z' ? endZDisabled : slidersDisabled;
                return (
                  <div key={`${pointKey}-${axis}`} className="control-group control-group--slider draw-roi-slider-group">
                    <label htmlFor={`draw-roi-${pointKey}-${axis}-slider`}>
                      {axis.toUpperCase()} {pointKey === 'start' ? 'Start' : 'End'} <span>{value}</span>
                    </label>
                    <input
                      id={`draw-roi-${pointKey}-${axis}-slider`}
                      type="range"
                      min={0}
                      max={max}
                      step={1}
                      value={value}
                      disabled={disabled}
                      onChange={(event) => handlePointCoordinateChange(pointKey, axis, Number(event.target.value))}
                    />
                  </div>
                );
              })}
            </div>
          ))}
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
            </div>
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
    </FloatingWindow>
  );
}
