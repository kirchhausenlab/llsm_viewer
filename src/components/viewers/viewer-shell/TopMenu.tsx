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
import { toUserFacingVoxelIndex } from '../../../shared/utils/voxelIndex';

type DropdownMenuId = 'file' | 'view' | 'edit' | 'tracks' | 'help';

type DropdownMenuItem = {
  label: string;
  disabled?: boolean;
  title?: string;
  onSelect?: () => void;
};

const DROPDOWN_MENU_ORDER: DropdownMenuId[] = ['file', 'view', 'edit', 'tracks', 'help'];

const clampRangeValue = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const HOVER_INTENSITY_MIN_DURATION_SECONDS = 8;
const HOVER_INTENSITY_PIXELS_PER_SECOND = 18;

const formatFollowCoordinate = (value: number): string => {
  if (!Number.isFinite(value)) {
    return '?';
  }
  if (Number.isInteger(value)) {
    return String(toUserFacingVoxelIndex(value));
  }
  return Number((value + 1).toFixed(2)).toString();
};

const formatFollowedTrackNumber = (trackId: string): string => {
  const suffix = trackId.includes(':') ? trackId.slice(trackId.indexOf(':') + 1) : trackId;
  const prefixedMatch = /^track-(.+)$/.exec(suffix);
  return prefixedMatch?.[1] ?? suffix;
};

export default function TopMenu(props: TopMenuProps) {
  const {
    onReturnToLauncher,
    onResetLayout,
    openHelpMenu,
    onOpenChannelsWindow,
    onOpenCameraWindow,
    onOpenCameraSettingsWindow,
    onOpenBackgroundsWindow,
    onOpenPropsWindow,
    onOpenPaintbrush,
    onOpenDrawRoiWindow,
    onOpenRoiManagerWindow,
    onOpenSetMeasurementsWindow,
    onOpenRecordWindow,
    onOpenRenderSettingsWindow,
    onOpenHoverSettingsWindow,
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
    initialScaleWarningMessage,
    isPerformanceMode = false,
    isHelpMenuOpen,
    volumeTimepointCount,
    isPlaying,
    isPlaybackStartPending = false,
    selectedIndex,
    onTimeIndexChange,
    playbackDisabled,
    onTogglePlayback,
    zSliderValue,
    zSliderMax,
    onZSliderChange,
    is2dViewActive = false,
    onToggle2dView,
    twoDViewButtonDisabled = true,
    twoDViewButtonTitle,
    loadedChannelIds,
    channelNameMap,
    channelVisibility,
    channelTintMap,
    segmentationChannelIds,
    activeChannelId,
    onChannelTabSelect,
    onChannelVisibilityToggle,
    trackSets,
    trackHeadersByTrackSet,
    activeTrackSetId,
    trackColorModesByTrackSet,
    trackVisibilitySummaryByTrackSet,
    onTrackSetTabSelect,
    onTrackVisibilityAllChange,
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
        { label: 'Save changes', disabled: true },
        { label: 'Reset changes', disabled: true },
        { label: 'Recenter windows', onSelect: onResetLayout },
        { label: 'Diagnostics', onSelect: onOpenDiagnosticsWindow },
        ...(is3dModeAvailable
          ? [
              {
                label: vrButtonLabel,
                disabled: vrButtonDisabled,
                title: vrButtonTitle,
                onSelect: onVrButtonClick
              }
            ]
          : []),
        { label: 'Exit', onSelect: onReturnToLauncher }
      ],
      view: [
        { label: 'Channels', onSelect: onOpenChannelsWindow },
        { label: 'View selection', onSelect: onOpenCameraWindow },
        { label: 'Screen capture', onSelect: onOpenRecordWindow },
        { label: 'Backgrounds', onSelect: onOpenBackgroundsWindow },
        { label: 'Render settings', onSelect: onOpenRenderSettingsWindow },
        { label: 'Camera settings', onSelect: onOpenCameraSettingsWindow },
        { label: 'Hover settings', onSelect: onOpenHoverSettingsWindow }
      ],
      edit: [
        { label: 'Props', onSelect: onOpenPropsWindow },
        { label: 'Paintbrush', onSelect: onOpenPaintbrush },
        { label: 'Draw ROI', onSelect: onOpenDrawRoiWindow },
        { label: 'ROI Manager', onSelect: onOpenRoiManagerWindow },
        { label: 'Set measurements', onSelect: onOpenSetMeasurementsWindow }
      ],
      tracks: [
        { label: 'Tracks window', onSelect: onOpenTracksWindow },
        { label: 'Amplitude plot', onSelect: onOpenAmplitudePlotWindow },
        { label: 'Plot settings', onSelect: onOpenPlotSettingsWindow },
        { label: 'Tracks settings', onSelect: onOpenTrackSettingsWindow }
      ],
      help: [
        { label: 'About', disabled: true },
        { label: 'Controls', onSelect: openHelpMenu }
      ]
    }),
    [
      onOpenAmplitudePlotWindow,
      onOpenBackgroundsWindow,
      onOpenCameraWindow,
      onOpenCameraSettingsWindow,
      onOpenChannelsWindow,
      onOpenDiagnosticsWindow,
      onOpenDrawRoiWindow,
      onOpenPaintbrush,
      onOpenPlotSettingsWindow,
      onOpenPropsWindow,
      onOpenSetMeasurementsWindow,
      onOpenRecordWindow,
      onOpenRenderSettingsWindow,
      onOpenHoverSettingsWindow,
      onOpenRoiManagerWindow,
      onOpenTrackSettingsWindow,
      onOpenTracksWindow,
      onResetLayout,
      onReturnToLauncher,
      onVrButtonClick,
      openHelpMenu,
      is3dModeAvailable,
      vrButtonDisabled,
      vrButtonLabel,
      vrButtonTitle
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

    const [firstItem] = menuItemRefs.current[openMenu].filter(
      (item): item is HTMLButtonElement => item !== null && item.disabled !== true
    );
    firstItem?.focus();
  }, [openMenu]);

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
    const items = menuItemRefs.current[menuId].filter(
      (item): item is HTMLButtonElement => item !== null && item.disabled !== true
    );
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
  const zSliderCounterLabel = `${resolvedZSliderValue}/${resolvedZSliderMax}`;
  const playbackCounterWidthCh = Math.max(playbackCounterLabel.length, zSliderCounterLabel.length) + 0.5;
  const zSliderDisabled = resolvedZSliderMax <= 1 || !onZSliderChange;
  const hasChannelTabs = loadedChannelIds.length > 0;
  const hasTrackTabs = trackSets.length > 0;
  const isTrackFollowActive = followedTrackSetId !== null && followedTrackId !== null;
  const isFollowActive = isTrackFollowActive || followedVoxel !== null;
  const followTargetLabel = useMemo(() => {
    if (isTrackFollowActive && followedTrackId) {
      const trackSetName =
        trackSets.find((trackSet) => trackSet.id === followedTrackSetId)?.name.trim() || 'Track';
      return `Following ${trackSetName} track #${formatFollowedTrackNumber(followedTrackId)}`;
    }
    if (followedVoxel) {
      const { x, y, z } = followedVoxel.coordinates;
      return `Following voxel (${formatFollowCoordinate(x)}, ${formatFollowCoordinate(y)}, ${formatFollowCoordinate(z)})`;
    }
    return null;
  }, [followedTrackId, followedTrackSetId, followedVoxel, isTrackFollowActive, trackSets]);
  const shouldAnimateHoverIntensity = hoverIntensityOverflow > 0;
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
        <span className="viewer-top-menu-column-divider viewer-top-menu-column-divider--1" aria-hidden="true" />
        <span className="viewer-top-menu-column-divider viewer-top-menu-column-divider--2" aria-hidden="true" />
        <span className="viewer-top-menu-column-divider viewer-top-menu-column-divider--3" aria-hidden="true" />
        <span className="viewer-top-menu-row-divider" aria-hidden="true" />

        <div className="viewer-top-menu-cell viewer-top-menu-cell--top viewer-top-menu-cell--column-1">
          <div className="viewer-top-menu-cell-content viewer-top-menu-cell-content--start">
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
                              disabled={item.disabled === true}
                              title={item.title}
                              ref={(element) => {
                                menuItemRefs.current[menuId][index] = item.disabled === true ? null : element;
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
        </div>

        <div className="viewer-top-menu-cell viewer-top-menu-cell--top viewer-top-menu-cell--column-2">
          <div className="viewer-top-menu-cell-content" />
        </div>

        <div className="viewer-top-menu-cell viewer-top-menu-cell--top viewer-top-menu-cell--column-3">
          <div className="viewer-top-menu-cell-content" />
        </div>

        <div className="viewer-top-menu-cell viewer-top-menu-cell--top viewer-top-menu-cell--column-4">
          <div className="viewer-top-menu-cell-content viewer-top-menu-cell-content--split">
            <div className="viewer-top-menu-cell-group viewer-top-menu-cell-group--fit">
              <div className="viewer-top-menu-scale-row">
                <div className="viewer-top-menu-scale" role="status" aria-live="polite">
                  <span className="viewer-top-menu-scale-label">Scale</span>
                  <span className="viewer-top-menu-scale-value">{currentScaleLabel}</span>
                </div>
                {isPerformanceMode ? (
                  <div
                    className="viewer-top-menu-warning viewer-top-menu-warning--performance"
                    role="status"
                    aria-live="polite"
                    title="Performance mode raises all requested LOD scales by one level. Scale L0 is disabled in this session."
                  >
                    <span className="viewer-top-menu-warning-label">Performance Mode</span>
                  </div>
                ) : null}
              </div>
            </div>
            <div className="viewer-top-menu-cell-group viewer-top-menu-cell-group--end viewer-top-menu-primary-actions">
              <button
                type="button"
                className="viewer-top-menu-button"
                onClick={() => onToggle2dView?.()}
                disabled={twoDViewButtonDisabled}
                title={twoDViewButtonTitle}
                aria-pressed={is2dViewActive}
              >
                {is2dViewActive ? '3D view' : '2D view'}
              </button>
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
        </div>

        <div className="viewer-top-menu-cell viewer-top-menu-cell--bottom viewer-top-menu-cell--column-1">
          <div
            className="viewer-top-menu-cell-content viewer-top-menu-cell-content--start viewer-top-menu-playback-controls"
            style={
              {
                '--viewer-top-menu-playback-counter-width': `${playbackCounterWidthCh}ch`
              } as CSSProperties
            }
          >
            <button
              type="button"
              onClick={onTogglePlayback}
              disabled={playbackDisabled}
              className={
                isPlaying
                  ? 'playback-button playback-toggle playing viewer-top-menu-playback-button'
                  : 'playback-button playback-toggle viewer-top-menu-playback-button'
              }
              aria-label={isPlaying ? 'Pause playback' : isPlaybackStartPending ? 'Cancel playback buffering' : 'Start playback'}
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
            <label
              className="viewer-top-menu-slider-group viewer-top-menu-slider-group--time"
              htmlFor="top-menu-playback-slider"
            >
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
            <span className="viewer-top-menu-slider-label">Z</span>
            <label
              className="viewer-top-menu-slider-group viewer-top-menu-slider-group--z"
              htmlFor="top-menu-z-slider"
            >
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
                {zSliderCounterLabel}
              </span>
            </label>
          </div>
        </div>

        <div className="viewer-top-menu-cell viewer-top-menu-cell--bottom viewer-top-menu-cell--column-2">
          <div className="viewer-top-menu-cell-content viewer-top-menu-cell-content--start">
            {hasChannelTabs ? (
              <VolumeChannelTabs
                loadedChannelIds={loadedChannelIds}
                channelNameMap={channelNameMap}
                channelVisibility={channelVisibility}
                channelTintMap={channelTintMap}
                segmentationChannelIds={segmentationChannelIds}
                activeChannelId={activeChannelId}
                onChannelTabSelect={onChannelTabSelect}
                onChannelVisibilityToggle={onChannelVisibilityToggle}
              />
            ) : null}
          </div>
        </div>

        <div className="viewer-top-menu-cell viewer-top-menu-cell--bottom viewer-top-menu-cell--column-3">
          <div className="viewer-top-menu-cell-content viewer-top-menu-cell-content--start">
            {hasTrackTabs ? (
              <VolumeTrackTabs
                trackSets={trackSets}
                trackHeadersByTrackSet={trackHeadersByTrackSet}
                activeTrackSetId={activeTrackSetId}
                trackColorModesByTrackSet={trackColorModesByTrackSet}
                trackVisibilitySummaryByTrackSet={trackVisibilitySummaryByTrackSet}
                onTrackSetTabSelect={onTrackSetTabSelect}
                onTrackVisibilityAllChange={onTrackVisibilityAllChange}
              />
            ) : null}
          </div>
        </div>

        <div className="viewer-top-menu-cell viewer-top-menu-cell--bottom viewer-top-menu-cell--column-4">
          <div className="viewer-top-menu-cell-content viewer-top-menu-cell-content--split">
            <div className="viewer-top-menu-cell-group viewer-top-menu-cell-group--grow viewer-top-menu-hover-column">
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
                        {toUserFacingVoxelIndex(hoveredVoxel.coordinates.x)}
                      </span>
                      ,{' '}
                      <span className="viewer-top-menu-coordinate-value" style={{ width: `${hoverCoordinateDigits.y}ch` }}>
                        {toUserFacingVoxelIndex(hoveredVoxel.coordinates.y)}
                      </span>
                      ,{' '}
                      <span className="viewer-top-menu-coordinate-value" style={{ width: `${hoverCoordinateDigits.z}ch` }}>
                        {toUserFacingVoxelIndex(hoveredVoxel.coordinates.z)}
                      </span>
                      )
                    </span>
                  </>
                ) : (
                  <span className="viewer-top-menu-intensity-empty">—</span>
                )}
              </div>
            </div>
            {isFollowActive && followTargetLabel ? (
              <div className="viewer-top-menu-cell-group viewer-top-menu-cell-group--end">
                <div className="viewer-top-menu-status-group viewer-top-menu-follow-group">
                  <span
                    className="viewer-top-menu-follow-target"
                    title={followTargetLabel}
                    role="status"
                    aria-live="polite"
                  >
                    {followTargetLabel}
                  </span>
                  <button
                    type="button"
                    className="viewer-top-menu-button viewer-top-menu-button--danger"
                    onClick={() =>
                      isTrackFollowActive
                        ? onStopTrackFollow(followedTrackSetId ?? undefined)
                        : onStopVoxelFollow()
                    }
                    aria-label={`Stop following ${followTargetLabel.replace(/^Following\s+/, '')}`}
                  >
                    Stop
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
      {initialScaleWarningMessage ? (
        <div className="viewer-top-menu-floating-warning">
          <div
            className="viewer-top-menu-warning"
            role="status"
            aria-live="polite"
            title="Viewer opened at a temporary coarse scale and will sharpen automatically."
          >
            <span className="viewer-top-menu-warning-label">Initial loading</span>
            <span className="viewer-top-menu-warning-message">{initialScaleWarningMessage}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
