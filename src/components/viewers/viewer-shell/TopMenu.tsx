import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject
} from 'react';

import type { TopMenuProps } from './types';
import ThemeModeToggle from '../../app/ThemeModeToggle';
import VolumeChannelTabs from './VolumeChannelTabs';
import VolumeTrackTabs from './VolumeTrackTabs';
import { formatCompactChannelLabel } from './channelLabel';
import { isLightHexColor } from '../../../shared/utils/appHelpers';

type DropdownMenuId = 'file' | 'view' | 'edit' | 'tracks' | 'help';

type DropdownMenuItem = {
  label: string;
  onSelect?: () => void;
};

const DROPDOWN_MENU_ORDER: DropdownMenuId[] = ['file', 'view', 'edit', 'tracks', 'help'];

const clampRangeValue = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const HOVER_INTENSITY_VISIBLE_ITEMS = 3;
const HOVER_INTENSITY_MIN_DURATION_SECONDS = 8;
const HOVER_INTENSITY_PIXELS_PER_SECOND = 18;

export default function TopMenu(props: TopMenuProps) {
  const {
    onReturnToLauncher,
    onResetLayout,
    openHelpMenu,
    onOpenChannelsWindow,
    onOpenPropsWindow,
    onOpenPaintbrush,
    onOpenRecordWindow,
    onOpenRenderSettingsWindow,
    onOpenTracksWindow,
    onOpenAmplitudePlotWindow,
    onOpenPlotSettingsWindow,
    onOpenTrackSettingsWindow,
    onOpenDiagnosticsWindow,
    is3dModeAvailable,
    resetViewHandler,
    onVrButtonClick,
    vrButtonDisabled,
    vrButtonTitle,
    vrButtonLabel,
    currentScaleLabel,
    isHelpMenuOpen,
    closeHelpMenu,
    volumeTimepointCount,
    isPlaying,
    selectedIndex,
    onTimeIndexChange,
    playbackDisabled,
    onTogglePlayback,
    zSliderValue,
    zSliderMax,
    onZSliderChange,
    loadedChannelIds,
    channelNameMap,
    channelVisibility,
    channelTintMap,
    activeChannelId,
    onChannelTabSelect,
    onChannelVisibilityToggle,
    trackSets,
    trackHeadersByTrackSet,
    activeTrackSetId,
    trackColorModesByTrackSet,
    onTrackSetTabSelect,
    hoverCoordinateDigits,
    hoverIntensityValueDigits,
    followedTrackSetId,
    followedTrackId,
    followedVoxel,
    onStopTrackFollow,
    onStopVoxelFollow,
    hoveredVoxel
  } = props;
  const [openMenu, setOpenMenu] = useState<DropdownMenuId | null>(null);
  const [hoverIntensityOverflow, setHoverIntensityOverflow] = useState(0);
  const topMenuRowRef = useRef<HTMLDivElement | null>(null);
  const topMenuHeightRef = useRef(0);
  const hoverIntensityViewportRef = useRef<HTMLSpanElement | null>(null);
  const hoverIntensityTrackRef = useRef<HTMLSpanElement | null>(null);
  const fileMenuRef = useRef<HTMLDivElement>(null);
  const viewMenuRef = useRef<HTMLDivElement>(null);
  const editMenuRef = useRef<HTMLDivElement>(null);
  const tracksMenuRef = useRef<HTMLDivElement>(null);
  const helpMenuRef = useRef<HTMLDivElement>(null);
  const menuRefs: Record<DropdownMenuId, RefObject<HTMLDivElement>> = {
    file: fileMenuRef,
    view: viewMenuRef,
    edit: editMenuRef,
    tracks: tracksMenuRef,
    help: helpMenuRef
  };
  const triggerRefs = useRef<Record<DropdownMenuId, HTMLButtonElement | null>>({
    file: null,
    view: null,
    edit: null,
    tracks: null,
    help: null
  });
  const menuItemRefs = useRef<Record<DropdownMenuId, Array<HTMLButtonElement | null>>>(
    {
      file: [],
      view: [],
      edit: [],
      tracks: [],
      help: []
    }
  );

  menuItemRefs.current.file = [];
  menuItemRefs.current.view = [];
  menuItemRefs.current.edit = [];
  menuItemRefs.current.tracks = [];
  menuItemRefs.current.help = [];

  const dropdownItems = useMemo<Record<DropdownMenuId, DropdownMenuItem[]>>(
    () => ({
      file: [
        { label: 'Save changes' },
        { label: 'Reset changes' },
        { label: 'Recenter windows', onSelect: onResetLayout },
        { label: 'Diagnostics', onSelect: onOpenDiagnosticsWindow },
        { label: 'Exit', onSelect: onReturnToLauncher }
      ],
      view: [
        { label: 'Channels window', onSelect: onOpenChannelsWindow },
        { label: 'Camera' },
        { label: 'Record', onSelect: onOpenRecordWindow },
        { label: 'Background' },
        { label: 'Render settings', onSelect: onOpenRenderSettingsWindow },
        { label: 'Hover settings' }
      ],
      edit: [
        { label: 'Props', onSelect: onOpenPropsWindow },
        { label: 'Paintbrush', onSelect: onOpenPaintbrush },
        { label: 'Measure' }
      ],
      tracks: [
        { label: 'Tracks window', onSelect: onOpenTracksWindow },
        { label: 'Amplitude plot', onSelect: onOpenAmplitudePlotWindow },
        { label: 'Plot settings', onSelect: onOpenPlotSettingsWindow },
        { label: 'Tracks settings', onSelect: onOpenTrackSettingsWindow }
      ],
      help: [
        { label: 'About' },
        { label: 'Navigation controls', onSelect: openHelpMenu }
      ]
    }),
    [
      onOpenAmplitudePlotWindow,
      onOpenChannelsWindow,
      onOpenDiagnosticsWindow,
      onOpenPaintbrush,
      onOpenPlotSettingsWindow,
      onOpenPropsWindow,
      onOpenRecordWindow,
      onOpenRenderSettingsWindow,
      onOpenTrackSettingsWindow,
      onOpenTracksWindow,
      onResetLayout,
      onReturnToLauncher,
      openHelpMenu
    ]
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

    closeHelpMenu();
  }, [closeHelpMenu, isHelpMenuOpen, openMenu]);

  useEffect(() => {
    if (isHelpMenuOpen) {
      setOpenMenu(null);
    }
  }, [isHelpMenuOpen]);

  useLayoutEffect(() => {
    if (typeof document === 'undefined') {
      return undefined;
    }

    const rootStyle = document.documentElement.style;
    const updateTopMenuHeight = () => {
      const height = topMenuRowRef.current?.getBoundingClientRect().height ?? 0;
      const roundedHeight = Math.max(0, Math.round(height));
      rootStyle.setProperty('--viewer-top-menu-bottom', `${roundedHeight}px`);
      if (topMenuHeightRef.current !== roundedHeight) {
        topMenuHeightRef.current = roundedHeight;
        window.dispatchEvent(new Event('viewer-top-menu-boundary-change'));
      }
    };

    updateTopMenuHeight();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateTopMenuHeight);
      return () => {
        window.removeEventListener('resize', updateTopMenuHeight);
        rootStyle.setProperty('--viewer-top-menu-bottom', '0px');
      };
    }

    const observer = new ResizeObserver(() => {
      updateTopMenuHeight();
    });

    if (topMenuRowRef.current) {
      observer.observe(topMenuRowRef.current);
    }

    window.addEventListener('resize', updateTopMenuHeight);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateTopMenuHeight);
      rootStyle.setProperty('--viewer-top-menu-bottom', '0px');
      window.dispatchEvent(new Event('viewer-top-menu-boundary-change'));
    };
  }, []);

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

  const intensityComponents = useMemo(
    () =>
      hoveredVoxel && hoveredVoxel.components.length > 0
        ? hoveredVoxel.components
        : hoveredVoxel
        ? [{ text: hoveredVoxel.intensity, channelLabel: null, color: null }]
        : [],
    [hoveredVoxel]
  );
  const resolvedIntensityComponents = useMemo(
    () =>
      intensityComponents.map((component, index) => {
        const channelLabel = component.channelLabel?.trim() || null;
        const valueText =
          channelLabel && component.text.startsWith(channelLabel)
            ? component.text.slice(channelLabel.length).trimStart()
            : component.text;
        return {
          key: `${channelLabel ?? 'value'}-${component.text}-${index}`,
          channelLabel,
          displayChannelLabel: channelLabel ? formatCompactChannelLabel(channelLabel) : null,
          valueText,
          displayText: channelLabel
            ? `${formatCompactChannelLabel(channelLabel)} ${valueText}`.trim()
            : valueText,
          fullText: component.text,
          color: component.color ?? null
        };
      }),
    [intensityComponents]
  );
  const hoverIntensityMeasureKey = useMemo(
    () => resolvedIntensityComponents.map((component) => component.key).join('|'),
    [resolvedIntensityComponents]
  );
  const resolvedTimepointCount = Math.max(0, volumeTimepointCount);
  const playbackMaxIndex = Math.max(0, resolvedTimepointCount - 1);
  const resolvedSelectedIndex = clampRangeValue(selectedIndex, 0, playbackMaxIndex);
  const playbackCounterLabel =
    resolvedTimepointCount === 0 ? '0/0' : `${resolvedSelectedIndex + 1}/${resolvedTimepointCount}`;
  const resolvedZSliderMax = Math.max(1, Math.floor(zSliderMax ?? 1));
  const resolvedZSliderValue = clampRangeValue(Math.round(zSliderValue ?? 1), 1, resolvedZSliderMax);
  const zSliderDisabled = resolvedZSliderMax <= 1 || !onZSliderChange;
  const isTrackFollowActive = followedTrackSetId !== null && followedTrackId !== null;
  const isFollowActive = isTrackFollowActive || followedVoxel !== null;
  const shouldAnimateHoverIntensity =
    resolvedIntensityComponents.length > HOVER_INTENSITY_VISIBLE_ITEMS && hoverIntensityOverflow > 0;
  const hoverIntensityTrackStyle = shouldAnimateHoverIntensity
    ? ({
        '--viewer-top-menu-intensity-overflow': `${hoverIntensityOverflow}px`,
        '--viewer-top-menu-intensity-duration': `${Math.max(
          HOVER_INTENSITY_MIN_DURATION_SECONDS,
          hoverIntensityOverflow / HOVER_INTENSITY_PIXELS_PER_SECOND
        )}s`
      } as CSSProperties)
    : undefined;

  useLayoutEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const updateHoverIntensityOverflow = () => {
      const viewportWidth = hoverIntensityViewportRef.current?.clientWidth ?? 0;
      const trackWidth = hoverIntensityTrackRef.current?.scrollWidth ?? 0;
      const nextOverflow = Math.max(0, Math.ceil(trackWidth - viewportWidth));
      setHoverIntensityOverflow((currentOverflow) =>
        currentOverflow === nextOverflow ? currentOverflow : nextOverflow
      );
    };

    updateHoverIntensityOverflow();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateHoverIntensityOverflow);
      return () => {
        window.removeEventListener('resize', updateHoverIntensityOverflow);
      };
    }

    const observer = new ResizeObserver(() => {
      updateHoverIntensityOverflow();
    });

    if (hoverIntensityViewportRef.current) {
      observer.observe(hoverIntensityViewportRef.current);
    }
    if (hoverIntensityTrackRef.current) {
      observer.observe(hoverIntensityTrackRef.current);
    }

    window.addEventListener('resize', updateHoverIntensityOverflow);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateHoverIntensityOverflow);
    };
  }, [hoverIntensityMeasureKey]);

  return (
    <div className="viewer-top-menu">
      <div className="viewer-top-menu-row" ref={topMenuRowRef}>
        <div className="viewer-top-menu-strip viewer-top-menu-strip--primary">
          <div className="viewer-top-menu-strip-left">
            <div className="viewer-top-menu-actions">
              <div className="viewer-top-menu-dropdowns">
                {DROPDOWN_MENU_ORDER.map((menuId) => (
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
                      <span className="viewer-top-menu-dropdown-label">
                        {menuId.charAt(0).toUpperCase() + menuId.slice(1)}
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
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="viewer-top-menu-strip-right">
            <button
              type="button"
              className="viewer-top-menu-button"
              onClick={() => resetViewHandler?.()}
              disabled={!resetViewHandler}
            >
              Reset view
            </button>
            {is3dModeAvailable ? (
              <button
                type="button"
                className="viewer-top-menu-button"
                onClick={onVrButtonClick}
                disabled={vrButtonDisabled}
                title={vrButtonTitle}
              >
                {vrButtonLabel}
              </button>
            ) : null}
            <ThemeModeToggle className="viewer-top-menu-theme-toggle" compact />
          </div>
        </div>
        <div className="viewer-top-menu-strip viewer-top-menu-strip--secondary">
          <div className="viewer-top-menu-strip-left viewer-top-menu-strip-left--secondary">
            <div className="viewer-top-menu-strip-center viewer-top-menu-strip-center--secondary">
              <div className="viewer-top-menu-secondary-group viewer-top-menu-secondary-group--playback">
                <button
                  type="button"
                  onClick={onTogglePlayback}
                  disabled={playbackDisabled}
                  className={
                    isPlaying
                      ? 'playback-button playback-toggle playing viewer-top-menu-playback-button'
                      : 'playback-button playback-toggle viewer-top-menu-playback-button'
                  }
                  aria-label={isPlaying ? 'Pause playback' : 'Start playback'}
                >
                  {isPlaying ? (
                    <svg className="playback-button-icon" viewBox="0 0 24 24" role="img" aria-hidden="true" focusable="false">
                      <path d="M9 5a1 1 0 0 1 1 1v12a1 1 0 1 1-2 0V6a1 1 0 0 1 1-1Zm6 0a1 1 0 0 1 1 1v12a1 1 0 1 1-2 0V6a1 1 0 0 1 1-1Z" />
                    </svg>
                  ) : (
                    <svg className="playback-button-icon" viewBox="0 0 24 24" role="img" aria-hidden="true" focusable="false">
                      <path d="M8.5 5.636a1 1 0 0 1 1.53-.848l8.01 5.363a1 1 0 0 1 0 1.698l-8.01 5.363A1 1 0 0 1 8 16.364V7.636a1 1 0 0 1 .5-.868Z" />
                    </svg>
                  )}
                </button>
                <label className="viewer-top-menu-slider-group" htmlFor="top-menu-playback-slider">
                  <input
                    id="top-menu-playback-slider"
                    className="playback-slider viewer-top-menu-slider"
                    type="range"
                    min={0}
                    max={playbackMaxIndex}
                    value={resolvedSelectedIndex}
                    onChange={(event) => onTimeIndexChange(Number(event.target.value))}
                    disabled={playbackDisabled}
                    aria-label="Timepoint"
                  />
                  <span className="viewer-top-menu-slider-counter viewer-top-menu-slider-counter--time">
                    {playbackCounterLabel}
                  </span>
                </label>
              </div>
              <div className="viewer-top-menu-secondary-group viewer-top-menu-secondary-group--z">
                <span className="viewer-top-menu-slider-label">Z</span>
                <label className="viewer-top-menu-slider-group" htmlFor="top-menu-z-slider">
                  <input
                    id="top-menu-z-slider"
                    className="playback-slider viewer-top-menu-slider"
                    type="range"
                    min={1}
                    max={resolvedZSliderMax}
                    step={1}
                    value={resolvedZSliderValue}
                    onChange={(event) => onZSliderChange?.(Number(event.target.value))}
                    disabled={zSliderDisabled}
                    aria-label="Z"
                  />
                  <span className="viewer-top-menu-slider-counter viewer-top-menu-slider-counter--z">
                    {resolvedZSliderValue}/{resolvedZSliderMax}
                  </span>
                </label>
              </div>
            </div>
            <div className="viewer-top-menu-tab-widgets">
              <VolumeChannelTabs
                loadedChannelIds={loadedChannelIds}
                channelNameMap={channelNameMap}
                channelVisibility={channelVisibility}
                channelTintMap={channelTintMap}
                activeChannelId={activeChannelId}
                onChannelTabSelect={onChannelTabSelect}
                onChannelVisibilityToggle={onChannelVisibilityToggle}
              />
              <VolumeTrackTabs
                trackSets={trackSets}
                trackHeadersByTrackSet={trackHeadersByTrackSet}
                activeTrackSetId={activeTrackSetId}
                trackColorModesByTrackSet={trackColorModesByTrackSet}
                onTrackSetTabSelect={onTrackSetTabSelect}
              />
            </div>
          </div>
          <div className="viewer-top-menu-strip-right viewer-top-menu-strip-right--secondary">
            <div className="viewer-top-menu-secondary-group viewer-top-menu-secondary-group--status">
              {isFollowActive ? (
                <button
                  type="button"
                  className="viewer-top-menu-button viewer-top-menu-button--danger"
                  onClick={() =>
                    isTrackFollowActive
                      ? onStopTrackFollow(followedTrackSetId ?? undefined)
                      : onStopVoxelFollow()
                  }
                >
                  Stop following
                </button>
              ) : null}
              <div className="viewer-top-menu-scale" role="status" aria-live="polite">
                <span className="viewer-top-menu-scale-label">Scale</span>
                <span className="viewer-top-menu-scale-value">{currentScaleLabel}</span>
              </div>
              <div className="viewer-top-menu-intensity" role="status" aria-live="polite">
                {hoveredVoxel ? (
                  <>
                    <span className="viewer-top-menu-intensity-marquee" ref={hoverIntensityViewportRef}>
                      <span
                        className={
                          shouldAnimateHoverIntensity
                            ? 'viewer-top-menu-intensity-track is-animated'
                            : 'viewer-top-menu-intensity-track'
                        }
                        ref={hoverIntensityTrackRef}
                        style={hoverIntensityTrackStyle}
                      >
                        {resolvedIntensityComponents.map((component) => (
                          <span
                            key={component.key}
                            className="viewer-top-menu-intensity-entry"
                            style={
                              component.color
                                ? ({
                                    '--viewer-top-menu-intensity-marker-color': component.color,
                                    '--viewer-top-menu-intensity-marker-border': isLightHexColor(component.color)
                                      ? 'var(--panel-border-strong)'
                                      : 'transparent'
                                  } as CSSProperties)
                                : undefined
                            }
                            title={component.channelLabel ?? component.fullText}
                          >
                            {component.channelLabel && component.color ? (
                              <span
                                className="viewer-top-menu-intensity-entry-marker"
                                aria-hidden="true"
                              />
                            ) : null}
                            {component.channelLabel ? (
                              <>
                                <span className="viewer-top-menu-intensity-entry-label">
                                  {component.displayChannelLabel}
                                </span>
                                {component.valueText ? (
                                  <span
                                    className="viewer-top-menu-intensity-entry-value"
                                    style={{ width: `${hoverIntensityValueDigits}ch` }}
                                  >
                                    {component.valueText}
                                  </span>
                                ) : null}
                              </>
                            ) : (
                              <span
                                className="viewer-top-menu-intensity-entry-value"
                                style={{ width: `${hoverIntensityValueDigits}ch` }}
                              >
                                {component.valueText}
                              </span>
                            )}
                          </span>
                        ))}
                      </span>
                    </span>
                    <span className="viewer-top-menu-coordinates">
                      (
                      <span className="viewer-top-menu-coordinate-value" style={{ width: `${hoverCoordinateDigits.x}ch` }}>
                        {hoveredVoxel.coordinates.x}
                      </span>
                      ,{' '}
                      <span className="viewer-top-menu-coordinate-value" style={{ width: `${hoverCoordinateDigits.y}ch` }}>
                        {hoveredVoxel.coordinates.y}
                      </span>
                      ,{' '}
                      <span className="viewer-top-menu-coordinate-value" style={{ width: `${hoverCoordinateDigits.z}ch` }}>
                        {hoveredVoxel.coordinates.z}
                      </span>
                      )
                    </span>
                  </>
                ) : (
                  <span className="viewer-top-menu-intensity-empty">—</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
