import FloatingWindow from '../../widgets/FloatingWindow';
import type { Position } from './types';

const NAVIGATION_HELP_WINDOW_HEIGHT = 440;

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
  if (!isOpen) {
    return null;
  }

  return (
    <FloatingWindow
      title="Navigation controls"
      initialPosition={initialPosition}
      width={`min(${width}px, calc(100vw - ${windowMargin * 2}px))`}
      resetSignal={resetSignal}
      onClose={onClose}
    >
      <div className="navigation-help-window">
        <h3 className="navigation-help-window__title">Desktop viewer</h3>
        <div className="viewer-top-menu-popover-section">
          <h4>Navigation</h4>
          <ul>
            <li>Left-click and drag to look around the volume.</li>
            <li>Scroll to zoom in or out.</li>
            <li>Use the arrow keys to look left, right, up, and down.</li>
            <li>Use W/A/S/D to move. Press Space to rise and C to descend.</li>
            <li>Hold Shift to move faster.</li>
            <li>Press Q/E to roll the camera counterclockwise or clockwise.</li>
            <li>Use Reset view in the top bar to restore the default camera.</li>
          </ul>
        </div>
        <div className="viewer-top-menu-popover-section">
          <h4>Selection and follow</h4>
          <ul>
            <li>Click a track line to select and highlight it.</li>
            <li>Use Follow in the Tracks window to keep the camera on a selected track over time.</li>
            <li>Double-click a hovered voxel to follow that point in the volume.</li>
            <li>While following a target, drag or use the arrow keys to orbit around it.</li>
            <li>W/A/S/D, Space, C, and Shift movement are disabled while following.</li>
          </ul>
        </div>
      </div>
    </FloatingWindow>
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
