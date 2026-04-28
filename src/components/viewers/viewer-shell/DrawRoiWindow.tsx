import type { CSSProperties } from 'react';

import FloatingWindow from '../../widgets/FloatingWindow';
import {
  ViewerWindowRow,
  ViewerWindowSlider,
  ViewerWindowStack,
} from './window-ui';
import type { LayoutProps } from './types';
import type { RoiAlignment, RoiDefinition, RoiDimensionMode } from '../../../types/roi';
import { normalizeRoiAlignment, ROI_COLOR_SWATCHES } from '../../../types/roi';
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
  currentAlignment: RoiAlignment;
  glassAlignmentEnabled: boolean;
  workingRoi: RoiDefinition | null;
  onColorChange: (color: string) => void;
  onAlignmentChange: (alignment: RoiAlignment) => void;
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

function AxesGuideIcon() {
  return (
    <svg
      className="viewer-top-menu-overlay-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M6 18h12" />
      <path d="m15 15 3 3-3 3" />
      <path d="M6 18V6" />
      <path d="m3 9 3-3 3 3" />
      <path d="M6 18 17 7" />
      <path d="M13 7h4v4" />
    </svg>
  );
}

function GlassGuideIcon() {
  return (
    <svg
      className="viewer-top-menu-overlay-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M8 4.5h10l-3 15H5l3-15Z" />
      <path d="m10 7.5 5.4 0" />
      <path d="m8.6 12.2 5.4 0" />
      <path d="m6.8 17 5.4 0" />
    </svg>
  );
}

export default function DrawRoiWindow({
  initialPosition,
  windowMargin,
  controlWindowWidth,
  resetSignal,
  volumeDimensions,
  dimensionMode,
  currentRoiName,
  currentColor,
  currentAlignment,
  glassAlignmentEnabled,
  workingRoi,
  onColorChange,
  onAlignmentChange,
  onUpdateWorkingRoi,
  onClose,
}: DrawRoiWindowProps) {
  const effectiveDimensionMode = workingRoi?.mode ?? dimensionMode;
  const isTwoDMode = effectiveDimensionMode === '2d';
  const effectiveAlignment = workingRoi
    ? normalizeRoiAlignment(workingRoi.alignment)
    : normalizeRoiAlignment(currentAlignment);

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
          {!isTwoDMode ? (
            <ViewerWindowRow className="draw-roi-alignment-row" align="center">
              <span className="draw-roi-alignment-label">Alignment:</span>
              <div
                className="viewer-top-menu-segmented-control viewer-top-menu-segmented-control--overlay draw-roi-alignment-control"
                role="group"
                aria-label="ROI alignment"
                style={{ '--viewer-top-menu-segment-count': 2 } as CSSProperties}
              >
                <button
                  type="button"
                  className={
                    effectiveAlignment === 'axes'
                      ? 'viewer-top-menu-segment-button is-active'
                      : 'viewer-top-menu-segment-button'
                  }
                  aria-label="Axes"
                  aria-pressed={effectiveAlignment === 'axes'}
                  title="Axes"
                  onClick={() => onAlignmentChange('axes')}
                >
                  <AxesGuideIcon />
                </button>
                <button
                  type="button"
                  className={
                    effectiveAlignment === 'glass'
                      ? 'viewer-top-menu-segment-button is-active'
                      : 'viewer-top-menu-segment-button'
                  }
                  aria-label="Glass"
                  aria-pressed={effectiveAlignment === 'glass'}
                  title={glassAlignmentEnabled ? 'Glass' : 'Glass alignment requires de-skew metadata.'}
                  disabled={!glassAlignmentEnabled}
                  onClick={() => {
                    if (glassAlignmentEnabled) {
                      onAlignmentChange('glass');
                    }
                  }}
                >
                  <GlassGuideIcon />
                </button>
              </div>
            </ViewerWindowRow>
          ) : null}
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
