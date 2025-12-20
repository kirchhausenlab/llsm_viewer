import FloatingWindow from '../../widgets/FloatingWindow';
import type { Position } from './types';

const NAVIGATION_HELP_WINDOW_HEIGHT = 360;

interface NavigationHelpWindowProps {
  isOpen: boolean;
  onClose: () => void;
  initialPosition: Position;
  windowMargin: number;
  width: number;
  resetSignal: number;
}

function NavigationHelpWindow({
  isOpen,
  onClose,
  initialPosition,
  windowMargin,
  width,
  resetSignal
}: NavigationHelpWindowProps) {
  return (
    <div style={{ display: isOpen ? undefined : 'none' }} aria-hidden={!isOpen}>
      <FloatingWindow
        title="Navigation controls"
        initialPosition={initialPosition}
        width={`min(${width}px, calc(100vw - ${windowMargin * 2}px))`}
        resetSignal={resetSignal}
        headerEndActions={
          <button
            type="button"
            className="floating-window-toggle"
            onClick={onClose}
            aria-label="Close navigation controls"
            data-no-drag
            title="Close"
          >
            <span aria-hidden="true">×</span>
          </button>
        }
      >
        <div className="navigation-help-window">
          <h3 className="navigation-help-window__title">Viewer tips</h3>
          <div className="viewer-top-menu-popover-section">
            <h4>3D volume view</h4>
            <ul>
              <li>Use WASD with Space/Ctrl to move forward, back, strafe, and rise or descend.</li>
              <li>Press Q/E to roll the camera counterclockwise/clockwise.</li>
              <li>Drag to orbit the dataset.</li>
              <li>
                Click a track line to select and highlight it. Use the Follow button in the Tracks window to follow that object
                in time.
              </li>
            </ul>
          </div>
          <div className="viewer-top-menu-popover-section">
            <h4>2D slice view</h4>
            <ul>
              <li>Press W/S to step through slices (hold Shift to skip 10 at a time).</li>
              <li>Drag to pan the slice, and scroll to zoom.</li>
              <li>Press Q/E to rotate the slice around its center.</li>
            </ul>
          </div>
        </div>
      </FloatingWindow>
    </div>
  );
}

export function computeNavigationHelpInitialPosition({
  windowMargin,
  windowWidth
}: {
  windowMargin: number;
  windowWidth: number;
}): Position {
  if (typeof window === 'undefined') {
    return { x: windowMargin, y: windowMargin };
  }

  const centerX = Math.round(window.innerWidth / 2 - windowWidth / 2);
  const centerY = Math.round(window.innerHeight / 2 - NAVIGATION_HELP_WINDOW_HEIGHT / 2);

  return {
    x: Math.max(windowMargin, centerX),
    y: Math.max(windowMargin, centerY)
  };
}

export default NavigationHelpWindow;
