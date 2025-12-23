import { useCallback } from 'react';

import FloatingWindow from '../../widgets/FloatingWindow';
import type { PaintbrushMode } from '../../../hooks/paintbrush/usePaintbrush';
import type { LayoutProps } from './types';

type PaintbrushWindowProps = {
  initialPosition: LayoutProps['paintbrushWindowInitialPosition'];
  windowMargin: number;
  controlWindowWidth: number;
  resetSignal: number;
  enabled: boolean;
  overlayVisible: boolean;
  mode: PaintbrushMode;
  radius: number;
  color: string;
  labelCount: number;
  canUndo: boolean;
  canRedo: boolean;
  onEnabledChange: (value: boolean) => void;
  onOverlayVisibleChange: (value: boolean) => void;
  onModeChange: (value: PaintbrushMode) => void;
  onRadiusChange: (value: number) => void;
  onColorChange: (value: string) => void;
  onRandomColor: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  onSave: () => void;
  onClose: () => void;
};

const PAINTBRUSH_MIN_RADIUS = 1;
const PAINTBRUSH_MAX_RADIUS = 10;

export default function PaintbrushWindow({
  initialPosition,
  windowMargin,
  controlWindowWidth,
  resetSignal,
  enabled,
  overlayVisible,
  mode,
  radius,
  color,
  labelCount,
  canUndo,
  canRedo,
  onEnabledChange,
  onOverlayVisibleChange,
  onModeChange,
  onRadiusChange,
  onColorChange,
  onRandomColor,
  onUndo,
  onRedo,
  onClear,
  onSave,
  onClose
}: PaintbrushWindowProps) {
  const handleClose = useCallback(() => {
    onEnabledChange(false);
    onClose();
  }, [onClose, onEnabledChange]);

  const handleClear = useCallback(() => {
    if (typeof globalThis.confirm === 'function') {
      const confirmed = globalThis.confirm('Clear all painting? This will erase all painted voxels and history.');
      if (!confirmed) {
        return;
      }
    }
    onClear();
  }, [onClear]);

  const isEraserMode = mode === 'eraser';

  return (
    <FloatingWindow
      title="Paintbrush"
      initialPosition={initialPosition}
      width={`min(${controlWindowWidth}px, calc(100vw - ${windowMargin * 2}px))`}
      resetSignal={resetSignal}
      headerEndActions={
        <button
          type="button"
          className="floating-window-toggle"
          onClick={handleClose}
          aria-label="Close paintbrush window"
          data-no-drag
          title="Close"
        >
          <span aria-hidden="true">×</span>
        </button>
      }
    >
      <div className="global-controls paintbrush-window">
        <div className="control-row paintbrush-button-row">
          <button
            type="button"
            className="paintbrush-toggle"
            onClick={() => onEnabledChange(!enabled)}
            aria-pressed={enabled}
            title="Hold Shift + Left-click/drag in the viewer to paint/erase"
          >
            {enabled ? 'Enabled' : 'Disabled'}
          </button>
          <button
            type="button"
            onClick={() => onModeChange(isEraserMode ? 'brush' : 'eraser')}
            aria-pressed={isEraserMode}
          >
            {isEraserMode ? 'Switch to brush' : 'Switch to Eraser'}
          </button>
          <button
            type="button"
            className="paintbrush-toggle"
            onClick={() => onOverlayVisibleChange(!overlayVisible)}
            aria-pressed={overlayVisible}
          >
            {overlayVisible ? 'Hide overlay' : 'Show overlay'}
          </button>
        </div>

        <div className="control-row paintbrush-button-row">
          <button type="button" onClick={onUndo} disabled={!canUndo}>
            Undo
          </button>
          <button type="button" onClick={onRedo} disabled={!canRedo}>
            Redo
          </button>
          <button type="button" onClick={handleClear}>
            Clear
          </button>
        </div>

        <div className="control-row paintbrush-controls-row">
          <div className="control-group control-group--slider paintbrush-slider-group">
            <label htmlFor="paintbrush-radius-slider">
              Radius <span>{radius}</span>
            </label>
            <input
              id="paintbrush-radius-slider"
              type="range"
              min={PAINTBRUSH_MIN_RADIUS}
              max={PAINTBRUSH_MAX_RADIUS}
              step={1}
              value={radius}
              onChange={(event) => onRadiusChange(Number(event.target.value))}
            />
          </div>
          <div
            className="paintbrush-color-preview"
            aria-label={`Selected color: ${color}`}
            style={{ backgroundColor: color }}
          />
          <label className="paintbrush-color-picker" htmlFor="paintbrush-color-input">
            <span>Color</span>
            <input
              id="paintbrush-color-input"
              className="paintbrush-color-input"
              type="color"
              value={color}
              onChange={(event) => onColorChange(event.target.value)}
              aria-label="Choose paintbrush color"
            />
          </label>
          <button type="button" onClick={onRandomColor}>
            Random
          </button>
        </div>

        <div className="control-row paintbrush-label-row">
          <div className="paintbrush-label-count">
            <span># of labels:</span>
            <output aria-live="polite">{labelCount}</output>
          </div>
          <button type="button" onClick={onSave}>
            Save
          </button>
        </div>
      </div>
    </FloatingWindow>
  );
}
