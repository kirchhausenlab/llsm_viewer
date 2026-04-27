import FloatingWindow from '../../widgets/FloatingWindow';
import type { Position } from './types';
import {
  ViewerWindowButton,
  ViewerWindowSelectField,
  ViewerWindowSlider,
  ViewerWindowStack,
} from './window-ui';
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
        <ViewerWindowStack className="hover-settings-window">
          <div className="control-group">
            <span className="control-label control-label--compact">Hover effect</span>
            <div className="viewer-mode-row">
              <ViewerWindowButton
                id="hover-enabled-toggle"
                type="button"
                className="viewer-mode-button"
                active={settings.enabled}
                onClick={() => onEnabledChange(!settings.enabled)}
                aria-pressed={settings.enabled}
              >
                {settings.enabled ? 'Enabled' : 'Disabled'}
              </ViewerWindowButton>
            </div>
          </div>

          <ViewerWindowSelectField
            id="hover-type-select"
            label="Type"
            value={settings.type}
            onChange={(event) => onTypeChange(event.target.value === 'crosshair' ? 'crosshair' : 'default')}
          >
            <option value="default">Default</option>
            <option value="crosshair">Crosshair</option>
          </ViewerWindowSelectField>

          <ViewerWindowSlider
            id="hover-strength-slider"
            label="Strength"
            valueLabel={settings.strength}
            min={HOVER_SLIDER_MIN}
            max={HOVER_SLIDER_MAX}
            step={1}
            value={settings.strength}
            onChange={(event) => onStrengthChange(Number(event.target.value))}
          />

          <ViewerWindowSlider
            id="hover-radius-slider"
            label="Radius"
            valueLabel={settings.radius}
            min={HOVER_SLIDER_MIN}
            max={HOVER_SLIDER_MAX}
            step={1}
            value={settings.radius}
            onChange={(event) => onRadiusChange(Number(event.target.value))}
          />
        </ViewerWindowStack>
      </div>
    </FloatingWindow>
  );
}
