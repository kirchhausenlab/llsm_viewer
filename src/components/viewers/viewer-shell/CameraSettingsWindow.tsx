import FloatingWindow from '../../widgets/FloatingWindow';
import {
  ViewerWindowSegmentedControl,
  ViewerWindowSlider,
  ViewerWindowStack,
} from './window-ui';
import type { LayoutProps } from './types';
import type { ModeToggleState } from './hooks/useViewerModeControls';

type CameraSettingsWindowProps = {
  layout: Pick<LayoutProps, 'windowMargin' | 'controlWindowWidth' | 'cameraSettingsWindowInitialPosition' | 'resetToken'>;
  modeToggle: ModeToggleState;
  isOpen: boolean;
  onClose: () => void;
  translationSpeedMultiplier: number;
  rotationSpeedMultiplier: number;
  onTranslationSpeedMultiplierChange: (value: number) => void;
  onRotationSpeedMultiplierChange: (value: number) => void;
  projectionLocked?: boolean;
};

const formatMultiplier = (value: number) => `${value.toFixed(1)}x`;

export default function CameraSettingsWindow({
  layout,
  modeToggle,
  isOpen,
  onClose,
  translationSpeedMultiplier,
  rotationSpeedMultiplier,
  onTranslationSpeedMultiplierChange,
  onRotationSpeedMultiplierChange,
  projectionLocked = false,
}: CameraSettingsWindowProps) {
  if (!isOpen) {
    return null;
  }

  const { windowMargin, controlWindowWidth, cameraSettingsWindowInitialPosition, resetToken } = layout;
  const { projectionMode, onProjectionModeChange, is3dModeAvailable } = modeToggle;
  const projectionLockTitle = projectionLocked
    ? 'Projection mode is locked while 2D view is active.'
    : undefined;
  const isometricDisabled = projectionLocked || modeToggle.isVrActive;
  const isometricTitle = projectionLocked
    ? projectionLockTitle
    : modeToggle.isVrActive
      ? 'Isometric view is unavailable while VR is active.'
      : undefined;

  return (
    <FloatingWindow
      title="Camera settings"
      initialPosition={cameraSettingsWindowInitialPosition}
      width={`min(${controlWindowWidth}px, calc(100vw - ${windowMargin * 2}px))`}
      className="floating-window--camera-settings"
      resetSignal={resetToken}
      onClose={onClose}
    >
      <div className="sidebar sidebar-right">
        <ViewerWindowStack className="camera-settings-window">
          <ViewerWindowSlider
            id="camera-settings-translation-speed"
            label="Translation speed"
            valueLabel={formatMultiplier(translationSpeedMultiplier)}
            min={0.1}
            max={3}
            step={0.1}
            value={translationSpeedMultiplier}
            onChange={(event) => onTranslationSpeedMultiplierChange(Number(event.target.value))}
          />

          <ViewerWindowSlider
            id="camera-settings-rotation-speed"
            label="Rotation speed"
            valueLabel={formatMultiplier(rotationSpeedMultiplier)}
            min={0.1}
            max={3}
            step={0.1}
            value={rotationSpeedMultiplier}
            onChange={(event) => onRotationSpeedMultiplierChange(Number(event.target.value))}
          />

          {is3dModeAvailable ? (
            <div className="control-group">
              <span className="control-label control-label--compact">Projection mode</span>
              <ViewerWindowSegmentedControl
                className="viewer-mode-row"
                ariaLabel="Projection mode"
                value={projectionMode}
                onChange={onProjectionModeChange}
                options={[
                  {
                    value: 'perspective',
                    content: 'Perspective',
                    disabled: projectionLocked,
                    title: projectionLockTitle,
                  },
                  {
                    value: 'orthographic',
                    content: 'Isometric',
                    disabled: isometricDisabled,
                    title: isometricTitle,
                  },
                ]}
              />
              {projectionLocked ? (
                <div className="control-hint">Projection mode is locked while 2D view is active.</div>
              ) : modeToggle.isVrActive ? (
                <div className="control-hint">Isometric view is unavailable while VR is active.</div>
              ) : null}
            </div>
          ) : null}
        </ViewerWindowStack>
      </div>
    </FloatingWindow>
  );
}
