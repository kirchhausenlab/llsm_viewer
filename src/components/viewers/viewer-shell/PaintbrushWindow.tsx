import { useCallback, useEffect, useState } from 'react';

import FloatingWindow from '../../widgets/FloatingWindow';
import type { LayoutProps } from './types';

type PaintbrushWindowProps = {
  initialPosition: LayoutProps['paintbrushWindowInitialPosition'];
  windowMargin: number;
  controlWindowWidth: number;
  resetSignal: number;
  onClose: () => void;
};

const PAINTBRUSH_MIN_RADIUS = 1;
const PAINTBRUSH_MAX_RADIUS = 10;
const DEFAULT_COLOR = '#ff5b5b';

export default function PaintbrushWindow({
  initialPosition,
  windowMargin,
  controlWindowWidth,
  resetSignal,
  onClose
}: PaintbrushWindowProps) {
  const [isEnabled, setIsEnabled] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const [isEraserMode, setIsEraserMode] = useState(false);
  const [radius, setRadius] = useState(PAINTBRUSH_MIN_RADIUS);
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [labelCount] = useState(0);

  useEffect(() => {
    setIsEnabled(false);
    setIsVisible(true);
    setIsEraserMode(false);
    setRadius(PAINTBRUSH_MIN_RADIUS);
    setColor(DEFAULT_COLOR);
  }, [resetSignal]);

  const handleClose = useCallback(() => {
    setIsEnabled(false);
    onClose();
  }, [onClose]);

  const handleRandomizeColor = useCallback(() => {
    const randomColor = `#${Math.floor(Math.random() * 0xffffff)
      .toString(16)
      .padStart(6, '0')}`;
    setColor(randomColor);
  }, []);

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
            onClick={() => setIsEnabled((current) => !current)}
            aria-pressed={isEnabled}
          >
            {isEnabled ? 'Enabled' : 'Disabled'}
          </button>
          <button
            type="button"
            onClick={() => setIsEraserMode((current) => !current)}
            aria-pressed={isEraserMode}
          >
            {isEraserMode ? 'Switch to brush' : 'Switch to Eraser'}
          </button>
          <button
            type="button"
            className="paintbrush-toggle"
            onClick={() => setIsVisible((current) => !current)}
            aria-pressed={isVisible}
          >
            {isVisible ? 'Show' : 'Hide'}
          </button>
        </div>

        <div className="control-row paintbrush-button-row">
          <button type="button">Undo</button>
          <button type="button">Redo</button>
          <button type="button">Clear</button>
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
              onChange={(event) => setRadius(Number(event.target.value))}
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
              onChange={(event) => setColor(event.target.value)}
              aria-label="Choose paintbrush color"
            />
          </label>
          <button type="button" onClick={handleRandomizeColor}>
            Random
          </button>
        </div>

        <div className="control-row paintbrush-label-row">
          <div className="paintbrush-label-count">
            <span># of labels:</span>
            <output aria-live="polite">{labelCount}</output>
          </div>
          <button type="button">Save</button>
        </div>
      </div>
    </FloatingWindow>
  );
}
