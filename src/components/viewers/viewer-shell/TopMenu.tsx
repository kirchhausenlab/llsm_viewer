import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject
} from 'react';

import type { TopMenuProps } from './types';

type DropdownMenuId = 'file' | 'view' | 'channels' | 'tracks';

type DropdownMenuItem = {
  label: string;
  description?: string;
  onSelect?: () => void;
};

export default function TopMenu({
  onReturnToLauncher,
  onResetLayout,
  helpMenuRef,
  isHelpMenuOpen,
  onHelpMenuToggle,
  followedTrackChannelId,
  followedTrackId,
  followedVoxel,
  onStopTrackFollow,
  onStopVoxelFollow,
  hoveredVoxel
}: TopMenuProps) {
  const [openMenu, setOpenMenu] = useState<DropdownMenuId | null>(null);
  const fileMenuRef = useRef<HTMLDivElement>(null);
  const viewMenuRef = useRef<HTMLDivElement>(null);
  const channelsMenuRef = useRef<HTMLDivElement>(null);
  const tracksMenuRef = useRef<HTMLDivElement>(null);
  const menuRefs: Record<DropdownMenuId, RefObject<HTMLDivElement>> = {
    file: fileMenuRef,
    view: viewMenuRef,
    channels: channelsMenuRef,
    tracks: tracksMenuRef
  };
  const triggerRefs = useRef<Record<DropdownMenuId, HTMLButtonElement | null>>({
    file: null,
    view: null,
    channels: null,
    tracks: null
  });
  const menuItemRefs = useRef<Record<DropdownMenuId, Array<HTMLButtonElement | null>>({
    file: [],
    view: [],
    channels: [],
    tracks: []
  });

  menuItemRefs.current.file = [];
  menuItemRefs.current.view = [];
  menuItemRefs.current.channels = [];
  menuItemRefs.current.tracks = [];

  const dropdownItems = useMemo<Record<DropdownMenuId, DropdownMenuItem[]>>(
    () => ({
      file: [
        { label: 'Preferences', description: 'Customize viewer defaults and shortcuts.' },
        { label: 'Reset layout', description: 'Restore windows to their default positions.', onSelect: onResetLayout },
        { label: 'Exit', description: 'Return to the experiment launcher.', onSelect: onReturnToLauncher }
      ],
      view: [
        { label: 'Switch 3D / 2D', description: 'Use the mode toggle to change between 3D and 2D viewers.' },
        { label: 'Rendering quality', description: 'Adjust sampling and quality controls in viewer settings.' },
        { label: 'VR mode', description: 'Start a headset session from the viewer controls when available.' }
      ],
      channels: [
        { label: 'Channel tabs', description: 'Use the Channels window to switch and manage visible layers.' },
        { label: 'Brightness & contrast', description: 'Window, invert, and tint channels from their settings panels.' },
        { label: 'Layer resets', description: 'Reset individual channel layers without affecting others.' }
      ],
      tracks: [
        { label: 'Filter tracks', description: 'Apply length filters and visibility toggles per channel.' },
        { label: 'Follow selection', description: 'Use the Tracks window to follow a selected trajectory.' },
        { label: 'Selected tracks plot', description: 'Open the Selected Tracks window for amplitude/time plots.' }
      ]
    }),
    [onResetLayout, onReturnToLauncher]
  );

  useEffect(() => {
    if (!openMenu) {
      return undefined;
    }

    const handleDocumentClick = (event: MouseEvent) => {
      const container = menuRefs[openMenu].current;
      if (container && container.contains(event.target as Node)) {
        return;
      }

      setOpenMenu(null);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenMenu(null);
        triggerRefs.current[openMenu]?.focus();
      }
    };

    document.addEventListener('mousedown', handleDocumentClick);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleDocumentClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [openMenu]);

  useEffect(() => {
    if (!openMenu) {
      return;
    }

    const [firstItem] = menuItemRefs.current[openMenu];
    firstItem?.focus();
  }, [openMenu]);

  useEffect(() => {
    if (!openMenu || !isHelpMenuOpen) {
      return;
    }

    onHelpMenuToggle();
  }, [isHelpMenuOpen, onHelpMenuToggle, openMenu]);

  useEffect(() => {
    if (isHelpMenuOpen) {
      setOpenMenu(null);
    }
  }, [isHelpMenuOpen]);

  const handleMenuToggle = (menuId: DropdownMenuId) => {
    setOpenMenu((currentMenu) => (currentMenu === menuId ? null : menuId));
  };

  const handleTriggerKeyDown = (menuId: DropdownMenuId, event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setOpenMenu(menuId);
    } else if (event.key === 'Escape') {
      setOpenMenu(null);
    }
  };

  const handleMenuKeyDown = (menuId: DropdownMenuId, event: ReactKeyboardEvent<HTMLDivElement>) => {
    const items = menuItemRefs.current[menuId].filter(Boolean) as HTMLButtonElement[];
    if (items.length === 0) {
      return;
    }

    const currentIndex = items.findIndex((item) => item === document.activeElement);
    const nextIndex = (currentIndex + 1) % items.length;
    const previousIndex = (currentIndex - 1 + items.length) % items.length;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      items[nextIndex].focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      items[previousIndex].focus();
    } else if (event.key === 'Home') {
      event.preventDefault();
      items[0].focus();
    } else if (event.key === 'End') {
      event.preventDefault();
      items[items.length - 1].focus();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setOpenMenu(null);
      triggerRefs.current[menuId]?.focus();
    } else if (event.key === 'Tab') {
      setOpenMenu(null);
    }
  };

  const handleMenuItemSelect = (menuId: DropdownMenuId, onSelect?: () => void) => {
    onSelect?.();
    setOpenMenu(null);
    triggerRefs.current[menuId]?.focus();
  };

  const intensityComponents =
    hoveredVoxel && hoveredVoxel.components.length > 0
      ? hoveredVoxel.components
      : hoveredVoxel
      ? [{ text: hoveredVoxel.intensity, color: null }]
      : [];

  const isTrackFollowActive = followedTrackChannelId !== null && followedTrackId !== null;
  const isFollowActive = isTrackFollowActive || followedVoxel !== null;

  return (
    <div className="viewer-top-menu">
      <div className="viewer-top-menu-row">
        <div className="viewer-top-menu-left">
          <div className="viewer-top-menu-actions">
            <div className="viewer-top-menu-dropdowns">
              {(Object.keys(dropdownItems) as DropdownMenuId[]).map((menuId) => (
                <div key={menuId} className="viewer-top-menu-dropdown" ref={menuRefs[menuId]}>
                  <button
                    type="button"
                    className="viewer-top-menu-button viewer-top-menu-dropdown-trigger"
                    aria-expanded={openMenu === menuId}
                    aria-controls={`viewer-${menuId}-menu`}
                    aria-haspopup="menu"
                    onClick={() => handleMenuToggle(menuId)}
                    onKeyDown={(event) => handleTriggerKeyDown(menuId, event)}
                    ref={(element) => {
                      triggerRefs.current[menuId] = element;
                    }}
                  >
                    <span className="viewer-top-menu-dropdown-label">{menuId.charAt(0).toUpperCase() + menuId.slice(1)}</span>
                    <span aria-hidden="true" className="viewer-top-menu-dropdown-caret">
                      ▾
                    </span>
                  </button>
                  {openMenu === menuId ? (
                    <div
                      id={`viewer-${menuId}-menu`}
                      className="viewer-top-menu-dropdown-menu"
                      role="menu"
                      aria-label={`${menuId} menu`}
                      onKeyDown={(event) => handleMenuKeyDown(menuId, event)}
                    >
                      <div className="viewer-top-menu-dropdown-header">
                        <h3 className="viewer-top-menu-dropdown-title">
                          {menuId.charAt(0).toUpperCase() + menuId.slice(1)}
                        </h3>
                        <p className="viewer-top-menu-dropdown-subtitle">Quick actions and tips</p>
                      </div>
                      <div className="viewer-top-menu-dropdown-list">
                        {dropdownItems[menuId].map((item, index) => (
                          <button
                            key={`${menuId}-${item.label}`}
                            type="button"
                            role="menuitem"
                            className="viewer-top-menu-dropdown-item"
                            ref={(element) => {
                              menuItemRefs.current[menuId][index] = element;
                            }}
                            onClick={() => handleMenuItemSelect(menuId, item.onSelect)}
                          >
                            <span className="viewer-top-menu-dropdown-item-label">{item.label}</span>
                            {item.description ? (
                              <span className="viewer-top-menu-dropdown-item-description">{item.description}</span>
                            ) : null}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
            <div className="viewer-top-menu-help" ref={helpMenuRef}>
              <button
                type="button"
                className="viewer-top-menu-button"
                onClick={onHelpMenuToggle}
                aria-expanded={isHelpMenuOpen}
                aria-controls="viewer-help-popover"
              >
                Help
              </button>
              {isHelpMenuOpen ? (
                <div
                  id="viewer-help-popover"
                  className="viewer-top-menu-popover"
                  role="dialog"
                  aria-modal="false"
                  aria-labelledby="viewer-help-popover-title"
                >
                  <h3 id="viewer-help-popover-title" className="viewer-top-menu-popover-title">
                    Viewer tips
                  </h3>
                  <div className="viewer-top-menu-popover-section">
                    <h4>3D volume view</h4>
                    <ul>
                      <li>Use WASD with Space/Ctrl to move forward, back, strafe, and rise or descend.</li>
                      <li>Press Q/E to roll the camera counterclockwise/clockwise.</li>
                      <li>Drag to orbit the dataset.</li>
                      <li>
                        Click a track line to select and highlight it. Use the Follow button in the Tracks window to follow that
                        object in time.
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
              ) : null}
            </div>
            {isFollowActive ? (
              <button
                type="button"
                className="viewer-top-menu-button viewer-top-menu-button--danger"
                onClick={() =>
                  isTrackFollowActive
                    ? onStopTrackFollow(followedTrackChannelId ?? undefined)
                    : onStopVoxelFollow()
                }
              >
                Stop following
              </button>
            ) : null}
          </div>
        </div>
        <div className="viewer-top-menu-right">
          <div className="viewer-top-menu-intensity" role="status" aria-live="polite">
            {hoveredVoxel ? (
              <>
                <span className="viewer-top-menu-coordinates">
                  ({hoveredVoxel.coordinates.x}, {hoveredVoxel.coordinates.y}, {hoveredVoxel.coordinates.z})
                </span>
                <span className="viewer-top-menu-intensity-value">
                  {intensityComponents.map((component, index) => (
                    <span key={`${component.text}-${index}`} className="viewer-top-menu-intensity-part">
                      <span style={component.color ? { color: component.color } : undefined}>{component.text}</span>
                      {index < intensityComponents.length - 1 ? (
                        <span className="viewer-top-menu-intensity-separator" aria-hidden="true">
                          ·
                        </span>
                      ) : null}
                    </span>
                  ))}
                </span>
              </>
            ) : (
              <span>—</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
