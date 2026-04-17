import FloatingWindow from '../../widgets/FloatingWindow';
import type { Position } from './types';
import {
  HOVER_SLIDER_MAX,
  HOVER_SLIDER_MIN,
} from '../../../shared/utils/hoverSettings';
import type { HoverSettingsProps } from './types';

export type HoverSettingsWindowProps = {
  layout: {
    windowMargin: number;
    controlWindowWidth: number;
    hoverSettingsWindowInitialPosition: Position;
    resetToken: number;
  };
  hoverSettings: HoverSettingsProps;
  isOpen: boolean;
  onClose: () => void;
};

export default function HoverSettingsWindow({
  layout,
  hoverSettings,
  isOpen,
  onClose,
}: HoverSettingsWindowProps) {
  const {
    windowMargin,
    controlWindowWidth,
    hoverSettingsWindowInitialPosition,
    resetToken,
  } = layout;
  const {
    settings,
    onEnabledChange,
    onTypeChange,
    onStrengthChange,
    onRadiusChange,
  } = hoverSettings;

  if (!isOpen) {
    return null;
  }

  return (
    <FloatingWindow
      title="Hover settings"
      initialPosition={hoverSettingsWindowInitialPosition}
      width={`min(${controlWindowWidth}px, calc(100vw - ${windowMargin * 2}px))`}
      className="floating-window--hover-settings"
      resetSignal={resetToken}
      onClose={onClose}
    >
      <div className="sidebar sidebar-right">
        <div className="global-controls">
          <div className="control-group">
            <span className="control-label control-label--compact">Hover effect</span>
            <div className="viewer-mode-row">
              <button
                id="hover-enabled-toggle"
                type="button"
                className={settings.enabled ? 'viewer-mode-button is-active' : 'viewer-mode-button'}
                onClick={() => onEnabledChange(!settings.enabled)}
                aria-pressed={settings.enabled}
              >
                {settings.enabled ? 'Enabled' : 'Disabled'}
              </button>
            </div>
          </div>

          <div className="control-group">
            <label htmlFor="hover-type-select">Type</label>
            <select
              id="hover-type-select"
              value={settings.type}
              onChange={(event) => onTypeChange(event.target.value === 'crosshair' ? 'crosshair' : 'default')}
            >
              <option value="default">Default</option>
              <option value="crosshair">Crosshair</option>
            </select>
          </div>

          <div className="control-group control-group--slider">
            <label htmlFor="hover-strength-slider">
              Strength <span>{settings.strength}</span>
            </label>
            <input
              id="hover-strength-slider"
              type="range"
              min={HOVER_SLIDER_MIN}
              max={HOVER_SLIDER_MAX}
              step={1}
              value={settings.strength}
              onChange={(event) => onStrengthChange(Number(event.target.value))}
            />
          </div>

          <div className="control-group control-group--slider">
            <label htmlFor="hover-radius-slider">
              Radius <span>{settings.radius}</span>
            </label>
            <input
              id="hover-radius-slider"
              type="range"
              min={HOVER_SLIDER_MIN}
              max={HOVER_SLIDER_MAX}
              step={1}
              value={settings.radius}
              onChange={(event) => onRadiusChange(Number(event.target.value))}
            />
          </div>
        </div>
      </div>
    </FloatingWindow>
  );
}
