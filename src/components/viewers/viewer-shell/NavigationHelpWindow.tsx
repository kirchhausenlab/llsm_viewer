import { useEffect, useState } from 'react';

import FloatingWindow from '../../widgets/FloatingWindow';
import type { Position } from './types';
import { TOP_MENU_HEIGHT, TOP_MENU_WINDOW_PADDING } from '../../../shared/utils/windowLayout';

const NAVIGATION_HELP_WINDOW_HEIGHT = 440;
const DEFAULT_TAB_ID = 'navigation';

type HelpTabId = 'navigation' | 'ui' | 'channels' | 'segmentation' | 'tracking';

type HelpTabSection = {
  title: string;
  items: string[];
};

type HelpTab = {
  id: HelpTabId;
  label: string;
  description: string;
  sections: HelpTabSection[];
};

const HELP_TABS: HelpTab[] = [
  {
    id: 'navigation',
    label: 'Navigation',
    description: 'Use these controls to move through the desktop viewer and inspect the current volume.',
    sections: [
      {
        title: 'Navigation',
        items: [
          'Left-click and drag to look around the volume.',
          'Scroll to zoom in or out.',
          'Use the arrow keys to look left, right, up, and down.',
          'Use W/A/S/D to move. Press Space to rise and C to descend.',
          'Press Q/E to roll the camera counterclockwise or clockwise.',
          'Use Reset view in the top bar to restore the default camera.'
        ]
      },
      {
        title: 'Selection and follow',
        items: [
          'Click a track line to select and highlight it.',
          'Use Follow in the Tracks window to keep the camera on a selected track over time.',
          'Double-click a hovered voxel to follow that point in the volume.',
          'While following a target, drag or use the arrow keys to orbit around it.',
          'W/A/S/D, Space, and C movement are disabled while following.'
        ]
      }
    ]
  },
  {
    id: 'ui',
    label: 'UI',
    description: 'The top bar and floating windows are the main way to open tools and move around the viewer interface.',
    sections: [
      {
        title: 'Top bar',
        items: [
          'Use the File, View, Edit, Tracks, and Help menus to open windows and viewer tools.',
          'Use the channel and track tabs in the top bar to switch the active channel or track set.',
          'Use the playback controls to play, pause, and scrub through timepoints.',
          'Watch the top bar for hover coordinates, intensity values, current scale, and follow status.'
        ]
      },
      {
        title: 'Windows',
        items: [
          'Drag any window by its header to reposition it.',
          'Close a window with the header close button, then reopen it from the menu.',
          'Use File > Recenter windows if the layout becomes cluttered or a window moves out of the way.'
        ]
      }
    ]
  },
  {
    id: 'channels',
    label: 'Channels',
    description: 'Channels control how each loaded volume is shown. Start here when the data is too dim, too bright, or misaligned.',
    sections: [
      {
        title: 'Basic workflow',
        items: [
          'Open View > Channels window to adjust the active channel.',
          'Use Hide/Show to compare channels quickly without unloading them.',
          'Use Reset to restore the current channel to its default display settings.'
        ]
      },
      {
        title: 'Display settings',
        items: [
          'Pick a render mode that matches the task: MIP, ISO, Beer-Lambert, or Slice for intensity data.',
          'Use the histogram and sliders to tune minimum/maximum range, brightness, and contrast.',
          'Use Auto for a quick contrast reset and the color picker to assign a clearer tint.',
          'If channels do not line up, adjust the X/Y offsets on the active channel.'
        ]
      }
    ]
  },
  {
    id: 'segmentation',
    label: 'Segmentation',
    description: 'Segmentation channels show labeled structures instead of raw intensity. Use them for masks, outlines, and manual cleanup.',
    sections: [
      {
        title: 'Viewing segmentation',
        items: [
          'Segmentation channels use simple 3D and Slice modes in the Channels window.',
          'Keep the segmentation visible beside intensity channels to check label placement against the raw data.',
          'Use Hide/Show on the channel when you want to compare the mask with the underlying volume.'
        ]
      },
      {
        title: 'Editing labels',
        items: [
          'Open Edit > Paintbrush to create or refine labels.',
          'Enable the paintbrush, then hold Ctrl + left-click or drag in the viewer to paint.',
          'Switch to Eraser to remove labels, and use the radius control to change brush size.',
          'Use Undo, Redo, Clear, and Save in the Paintbrush window to manage your edits.',
          'Show overlay lets you preview painted labels directly in the viewer.'
        ]
      }
    ]
  },
  {
    id: 'tracking',
    label: 'Tracking',
    description: 'Tracking tools help you inspect trajectories, reduce clutter, and follow selected objects across time.',
    sections: [
      {
        title: 'Track sets and visibility',
        items: [
          'Open Tracks > Tracks window after loading a track file.',
          'Use the track-set tabs in the top bar to switch between loaded track collections.',
          'Use the minimum length filter and Apply to hide short tracks.',
          'Toggle checkboxes to show or hide individual tracks.'
        ]
      },
      {
        title: 'Selection and analysis',
        items: [
          'Click a track label to select it and reveal follow controls.',
          'Use Follow to lock the camera to a selected trajectory while playback runs.',
          'Adjust opacity, thickness, and color in the Tracks window to make trajectories easier to read.',
          'Use Amplitude plot and Plot settings for the currently selected tracks.'
        ]
      }
    ]
  }
];

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
  const [activeTabId, setActiveTabId] = useState<HelpTabId>(DEFAULT_TAB_ID);

  useEffect(() => {
    if (isOpen) {
      setActiveTabId(DEFAULT_TAB_ID);
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const activeTab = HELP_TABS.find((tab) => tab.id === activeTabId) ?? HELP_TABS[0];

  return (
    <FloatingWindow
      title="Controls"
      initialPosition={initialPosition}
      width={`min(${width}px, calc(100vw - ${windowMargin * 2}px))`}
      className="floating-window--controls"
      resetSignal={resetSignal}
      onClose={onClose}
    >
      <div className="controls-help-window">
        <div className="controls-help-window__tabs" role="tablist" aria-label="Controls help sections">
          {HELP_TABS.map((tab) => {
            const isActive = tab.id === activeTab.id;

            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`controls-help-tab-${tab.id}`}
                aria-selected={isActive}
                aria-controls={`controls-help-panel-${tab.id}`}
                className={isActive ? 'controls-help-window__tab is-active' : 'controls-help-window__tab'}
                onClick={() => setActiveTabId(tab.id)}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <section
          id={`controls-help-panel-${activeTab.id}`}
          role="tabpanel"
          aria-labelledby={`controls-help-tab-${activeTab.id}`}
          className="controls-help-window__panel"
        >
          <div className="controls-help-window__panel-header">
            <h3 className="controls-help-window__title">{activeTab.label}</h3>
            <p className="controls-help-window__description">{activeTab.description}</p>
          </div>

          {activeTab.sections.map((section) => (
            <div key={section.title} className="viewer-top-menu-popover-section">
              <h4>{section.title}</h4>
              <ul>
                {section.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </section>
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
  const preferredY = TOP_MENU_HEIGHT + TOP_MENU_WINDOW_PADDING;

  if (typeof window === 'undefined') {
    return { x: windowMargin, y: preferredY };
  }

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const resolvedWidth = Math.min(windowWidth, viewportWidth - windowMargin * 2);
  const centerX = Math.round(viewportWidth / 2 - resolvedWidth / 2);
  const maxY = Math.max(windowMargin, viewportHeight - NAVIGATION_HELP_WINDOW_HEIGHT - windowMargin);

  return {
    x: Math.max(windowMargin, centerX),
    y: Math.min(preferredY, maxY)
  };
}

export default NavigationHelpWindow;
