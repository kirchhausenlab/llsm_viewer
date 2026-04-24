import { normalizeHexColor } from '../../../shared/colorMaps/layerColors';
import FloatingWindow from '../../widgets/FloatingWindow';
import type { BackgroundSettingsProps, Position } from './types';

export type BackgroundsWindowProps = {
  layout: {
    windowMargin: number;
    controlWindowWidth: number;
    backgroundsWindowInitialPosition: Position;
    resetToken: number;
  };
  backgrounds: BackgroundSettingsProps;
  isOpen: boolean;
  onClose: () => void;
};

const DEFAULT_BACKGROUND_COLOR = '#000000';
const DEFAULT_FLOOR_COLOR = '#d7dbe0';

export default function BackgroundsWindow({
  layout,
  backgrounds,
  isOpen,
  onClose,
}: BackgroundsWindowProps) {
  const {
    windowMargin,
    controlWindowWidth,
    backgroundsWindowInitialPosition,
    resetToken,
  } = layout;
  const {
    backgroundColor,
    floorEnabled,
    floorColor,
    isFloorAvailable,
    isResetDisabled,
    onResetToDefault,
    onBackgroundColorChange,
    onFloorEnabledChange,
    onFloorColorChange,
  } = backgrounds;

  if (!isOpen) {
    return null;
  }

  const normalizedBackgroundColor = normalizeHexColor(backgroundColor, DEFAULT_BACKGROUND_COLOR);
  const normalizedFloorColor = normalizeHexColor(floorColor, DEFAULT_FLOOR_COLOR);
  const isFloorControlDisabled = !isFloorAvailable;
  const isFloorColorDisabled = !isFloorAvailable || !floorEnabled;

  return (
    <FloatingWindow
      title="Backgrounds"
      initialPosition={backgroundsWindowInitialPosition}
      width={`min(${controlWindowWidth}px, calc(100vw - ${windowMargin * 2}px))`}
      className="floating-window--backgrounds"
      resetSignal={resetToken}
      onClose={onClose}
    >
      <div className="sidebar sidebar-right">
        <div className="global-controls backgrounds-window__options" role="group" aria-label="Viewer backgrounds">
          <button
            id="viewer-background-reset"
            type="button"
            onClick={onResetToDefault}
            disabled={isResetDisabled}
          >
            Reset to Default
          </button>

          <div className="backgrounds-window__row">
            <span className="backgrounds-window__label">Background color:</span>
            <label className="color-picker-trigger" htmlFor="viewer-background-color">
              <input
                id="viewer-background-color"
                className="color-picker-input"
                type="color"
                value={normalizedBackgroundColor}
                onChange={(event) => onBackgroundColorChange(event.target.value)}
                aria-label="Choose background color"
              />
              <span
                className="color-picker-indicator"
                style={{ backgroundColor: normalizedBackgroundColor }}
                aria-hidden="true"
              />
            </label>
          </div>

          <div className="backgrounds-window__row">
            <label className="backgrounds-window__checkbox" htmlFor="viewer-background-floor-enabled">
              <input
                id="viewer-background-floor-enabled"
                type="checkbox"
                checked={floorEnabled}
                disabled={isFloorControlDisabled}
                onChange={(event) => onFloorEnabledChange(event.target.checked)}
              />
              <span>Floor</span>
            </label>
            <label
              className={isFloorColorDisabled ? 'color-picker-trigger is-disabled' : 'color-picker-trigger'}
              htmlFor="viewer-background-floor-color"
            >
              <input
                id="viewer-background-floor-color"
                className="color-picker-input"
                type="color"
                value={normalizedFloorColor}
                onChange={(event) => onFloorColorChange(event.target.value)}
                disabled={isFloorColorDisabled}
                aria-label="Choose floor color"
              />
              <span
                className="color-picker-indicator"
                style={{ backgroundColor: normalizedFloorColor }}
                aria-hidden="true"
              />
            </label>
          </div>
        </div>
      </div>
    </FloatingWindow>
  );
}
