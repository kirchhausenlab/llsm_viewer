import { useMemo, type CSSProperties, type MouseEvent } from 'react';

import {
  TRACK_COLOR_SWATCHES,
  getTrackColorHex,
  normalizeTrackColor
} from '../../../shared/colorMaps/trackColors';
import { applyAlphaToHex } from '../../../shared/utils/appHelpers';
import { resolveTrackVisibilityForState } from '../../../shared/utils/trackVisibilityState';
import { createDefaultTrackSetState } from '../../../hooks/tracks/useTrackStyling';
import FloatingWindow from '../../widgets/FloatingWindow';
import TrackSettingsWindow from '../../widgets/TrackSettingsWindow';
import type { LayoutProps, TrackDefaults, TrackSettingsProps, TracksPanelProps } from './types';

export type TracksPanelWindowProps = TracksPanelProps & {
  layout: Pick<
    LayoutProps,
    'windowMargin' | 'controlWindowWidth' | 'trackWindowInitialPosition' | 'trackSettingsWindowInitialPosition' | 'resetToken'
  >;
  isOpen: boolean;
  onClose: () => void;
  trackDefaults: TrackDefaults;
  trackSettings: TrackSettingsProps;
  isTrackSettingsOpen: boolean;
  onCloseTrackSettings: () => void;
  hasTrackData: boolean;
};

export default function TracksPanel({
  layout,
  isOpen,
  onClose,
  hasTrackData,
  trackSets,
  activeTrackSetId,
  onTrackSetTabSelect,
  parsedTracksByTrackSet,
  filteredTracksByTrackSet,
  minimumTrackLength,
  pendingMinimumTrackLength,
  trackLengthBounds,
  onMinimumTrackLengthChange,
  onMinimumTrackLengthApply,
  trackColorModesByTrackSet,
  trackOpacityByTrackSet,
  trackLineWidthByTrackSet,
  trackSetStates,
  followedTrackId,
  onTrackOrderToggle,
  trackOrderModeByTrackSet,
  onTrackVisibilityToggle,
  onTrackVisibilityAllChange,
  onTrackOpacityChange,
  onTrackLineWidthChange,
  onTrackColorSelect,
  onTrackColorReset,
  onTrackSelectionToggle,
  selectedTrackOrder,
  selectedTrackIds,
  onTrackFollow,
  trackDefaults,
  trackSettings,
  isTrackSettingsOpen,
  onCloseTrackSettings
}: TracksPanelWindowProps) {
  const {
    windowMargin,
    controlWindowWidth,
    trackWindowInitialPosition,
    trackSettingsWindowInitialPosition,
    resetToken
  } = layout;

  const selectedTrackOrderMap = new Map(selectedTrackOrder.map((trackId, index) => [trackId, index]));
  const trackSummaryByTrackSet = useMemo(() => {
    const summary = new Map<string, { total: number; visible: number }>();
    for (const trackSet of trackSets) {
      const state = trackSetStates[trackSet.id] ?? createDefaultTrackSetState();
      const tracksForSet = filteredTracksByTrackSet.get(trackSet.id) ?? [];
      let visible = 0;
      for (const track of tracksForSet) {
        const explicitVisible = resolveTrackVisibilityForState(state, track.id);
        const isFollowedTrack = followedTrackId === track.id;
        const isSelectedTrack = selectedTrackIds.has(track.id);
        if (explicitVisible || isFollowedTrack || isSelectedTrack) {
          visible += 1;
        }
      }
      summary.set(trackSet.id, { total: tracksForSet.length, visible });
    }
    return summary;
  }, [filteredTracksByTrackSet, followedTrackId, selectedTrackIds, trackSetStates, trackSets]);

  if (!hasTrackData || !isOpen) {
    return null;
  }

  return (
    <>
      <FloatingWindow
        title="Tracks"
        initialPosition={trackWindowInitialPosition}
        width={`min(${controlWindowWidth}px, calc(100vw - ${windowMargin * 2}px))`}
        className="floating-window--tracks"
        resetSignal={resetToken}
        onClose={onClose}
        headerContent={
          <div className="channel-tabs channel-tabs--header" role="tablist" aria-label="Track sets">
            {trackSets.map((trackSet) => {
              const label = trackSet.name || 'Tracks';
              const displayLabel = label.length > 14 ? `${label.slice(0, 11)}...` : label;
              const isActive = trackSet.id === activeTrackSetId;
              const summary = trackSummaryByTrackSet.get(trackSet.id) ?? { total: 0, visible: 0 };
              const hasTracksForSet = (parsedTracksByTrackSet.get(trackSet.id)?.length ?? 0) > 0;
              const hasVisibleTracks = summary.visible > 0;
              const tabClassName = [
                'channel-tab',
                isActive ? 'is-active' : '',
                !hasTracksForSet ? 'is-hidden' : ''
              ]
                .filter(Boolean)
                .join(' ');
              const labelClassName = hasVisibleTracks
                ? 'channel-tab-label'
                : 'channel-tab-label channel-tab-label--crossed';
              const colorMode = trackColorModesByTrackSet[trackSet.id] ?? { type: 'random' };
              const tabStyle: CSSProperties & Record<string, string> | undefined =
                colorMode.type === 'uniform'
                  ? {
                      '--channel-tab-background': applyAlphaToHex(normalizeTrackColor(colorMode.color), 0.18),
                      '--channel-tab-background-active': applyAlphaToHex(normalizeTrackColor(colorMode.color), 0.35),
                      '--channel-tab-border': 'rgba(255, 255, 255, 0.15)',
                      '--channel-tab-border-active': applyAlphaToHex(normalizeTrackColor(colorMode.color), 0.55)
                    }
                  : undefined;

              const handleTrackTabClick = (event: MouseEvent<HTMLButtonElement>) => {
                if (event.button !== 0) return;
                onTrackSetTabSelect(trackSet.id);
              };

              const handleTrackTabAuxClick = (event: MouseEvent<HTMLButtonElement>) => {
                const currentSummary = trackSummaryByTrackSet.get(trackSet.id) ?? { total: 0, visible: 0 };
                const nextHasVisibleTracks = currentSummary.visible === 0;
                if (event.button === 1) {
                  onTrackVisibilityAllChange(trackSet.id, nextHasVisibleTracks);
                  event.preventDefault();
                  event.stopPropagation();
                }
              };

              return (
                <button
                  key={trackSet.id}
                  id={`track-tab-${trackSet.id}`}
                  type="button"
                  role="tab"
                  className={tabClassName}
                  aria-selected={isActive}
                  aria-controls={`track-panel-${trackSet.id}`}
                  onClick={handleTrackTabClick}
                  onAuxClick={handleTrackTabAuxClick}
                  style={tabStyle}
                >
                  <span className={labelClassName}>{displayLabel}</span>
                </button>
              );
            })}
          </div>
        }
      >
        <div className="sidebar sidebar-left">
          {trackSets.length > 0 ? (
            <div className="track-controls">
              {trackSets.map((trackSet) => {
                const tracksForSet = filteredTracksByTrackSet.get(trackSet.id) ?? [];
                const parsedTracks = parsedTracksByTrackSet.get(trackSet.id) ?? [];
                const summary = trackSummaryByTrackSet.get(trackSet.id) ?? { total: 0, visible: 0 };
                const isActive = trackSet.id === activeTrackSetId;
                const orderMode = trackOrderModeByTrackSet[trackSet.id] ?? 'id';
                const colorMode = trackColorModesByTrackSet[trackSet.id] ?? { type: 'random' };
                const trackColorLabel = colorMode.type === 'uniform' ? 'Uniform' : 'By ID';
                const hasSetTracks = parsedTracks.length > 0;
                const opacity = trackOpacityByTrackSet[trackSet.id] ?? trackDefaults.opacity;
                const lineWidth = trackLineWidthByTrackSet[trackSet.id] ?? trackDefaults.lineWidth;
                const visibilityState = trackSetStates[trackSet.id] ?? createDefaultTrackSetState();
                const displayTracks = [...tracksForSet].sort((a, b) => {
                  const selectionIndexA = selectedTrackOrderMap.get(a.id);
                  const selectionIndexB = selectedTrackOrderMap.get(b.id);

                  if (selectionIndexA !== undefined || selectionIndexB !== undefined) {
                    if (selectionIndexA === undefined) return 1;
                    if (selectionIndexB === undefined) return -1;
                    if (selectionIndexA !== selectionIndexB) {
                      return selectionIndexA - selectionIndexB;
                    }
                  }

                  if (orderMode === 'length') {
                    return b.pointCount - a.pointCount;
                  }
                  const idOrder = a.trackNumber - b.trackNumber;
                  if (idOrder !== 0) {
                    return idOrder;
                  }
                  return (a.segmentIndex ?? 0) - (b.segmentIndex ?? 0);
                });

                return (
                  <div
                    key={trackSet.id}
                    id={`track-panel-${trackSet.id}`}
                    role="tabpanel"
                    aria-labelledby={`track-tab-${trackSet.id}`}
                    className={isActive ? 'track-panel is-active' : 'track-panel'}
                    hidden={!isActive}
                  >
                    <div className="track-panel-body">
                      <div className="track-filters">
                        <div className="track-length-filter">
                          <label htmlFor={`track-length-${trackSet.id}`}>
                            Min length <span>{pendingMinimumTrackLength}</span>
                          </label>
                          <div className="track-length-input-row">
                            <input
                              id={`track-length-${trackSet.id}`}
                              type="range"
                              min={trackLengthBounds.min}
                              max={trackLengthBounds.max}
                              step={0.1}
                              value={pendingMinimumTrackLength}
                              onChange={(event) => onMinimumTrackLengthChange(Number(event.target.value))}
                              disabled={!hasSetTracks}
                            />
                            <button
                              type="button"
                              className="track-length-apply"
                              onClick={onMinimumTrackLengthApply}
                              disabled={!hasSetTracks || pendingMinimumTrackLength === minimumTrackLength}
                            >
                              Apply
                            </button>
                          </div>
                        </div>
                        <div className="track-slider-row">
                          <div className="slider-control">
                            <label htmlFor={`track-opacity-${trackSet.id}`}>
                              Opacity <span>{Math.round(opacity * 100)}%</span>
                            </label>
                            <input
                              id={`track-opacity-${trackSet.id}`}
                              type="range"
                              min={0}
                              max={1}
                              step={0.05}
                              value={opacity}
                              onChange={(event) => onTrackOpacityChange(trackSet.id, Number(event.target.value))}
                              disabled={tracksForSet.length === 0}
                            />
                          </div>
                          <div className="slider-control">
                            <label htmlFor={`track-linewidth-${trackSet.id}`}>
                              Thickness <span>{lineWidth.toFixed(1)}</span>
                            </label>
                            <input
                              id={`track-linewidth-${trackSet.id}`}
                              type="range"
                              min={0.5}
                              max={5}
                              step={0.1}
                              value={lineWidth}
                              onChange={(event) => onTrackLineWidthChange(trackSet.id, Number(event.target.value))}
                              disabled={tracksForSet.length === 0}
                            />
                          </div>
                        </div>
                      </div>
                      <div className="track-color-control">
                        <div className="track-color-control-header">
                          <span id={`track-color-label-${trackSet.id}`}>Track color</span>
                          <span>{trackColorLabel}</span>
                        </div>
                        <div className="track-color-swatch-row">
                          <div className="color-swatch-grid" role="group" aria-labelledby={`track-color-label-${trackSet.id}`}>
                            {TRACK_COLOR_SWATCHES.map((swatch: (typeof TRACK_COLOR_SWATCHES)[number]) => {
                              const normalized = normalizeTrackColor(swatch.value);
                              const isSelected =
                                colorMode.type === 'uniform' && normalizeTrackColor(colorMode.color) === normalized;
                              return (
                                <button
                                  key={swatch.value}
                                  type="button"
                                  className={isSelected ? 'color-swatch-button is-selected' : 'color-swatch-button'}
                                  style={{ backgroundColor: swatch.value }}
                                  onClick={() => onTrackColorSelect(trackSet.id, swatch.value)}
                                  disabled={tracksForSet.length === 0}
                                  aria-pressed={isSelected}
                                  aria-label={`${swatch.label} tracks color`}
                                  title={swatch.label}
                                />
                              );
                            })}
                          </div>
                          <button
                            type="button"
                            className={colorMode.type === 'random' ? 'track-color-randomizer' : 'track-color-randomizer is-active'}
                            onClick={() => onTrackColorReset(trackSet.id)}
                            disabled={tracksForSet.length === 0}
                          >
                            Sorted
                          </button>
                        </div>
                      </div>
                      <div className="track-list-section">
                        <div className="track-list-header">
                          <span className="track-list-summary">
                            Shown tracks: <strong>{summary.visible}</strong>
                          </span>
                          <button
                            type="button"
                            className={orderMode === 'length' ? 'track-order-toggle is-active' : 'track-order-toggle'}
                            onClick={() => onTrackOrderToggle(trackSet.id)}
                            disabled={tracksForSet.length === 0}
                            aria-pressed={orderMode === 'length'}
                          >
                            {orderMode === 'length' ? 'Order by ID' : 'Order by length'}
                          </button>
                        </div>
                        {tracksForSet.length > 0 ? (
                          <div className="track-list" role="group" aria-label={`${trackSet.name ?? 'Tracks'} visibility`}>
                            {displayTracks.map((track) => {
                              const isFollowed = followedTrackId === track.id;
                              const isSelected = selectedTrackIds.has(track.id);
                              const isChecked =
                                isFollowed || isSelected || resolveTrackVisibilityForState(visibilityState, track.id);
                              const trackColor =
                                colorMode.type === 'uniform'
                                  ? normalizeTrackColor(colorMode.color)
                                  : getTrackColorHex(track.trackNumber);
                              const itemClassName = [
                                'track-item',
                                isSelected ? 'is-selected' : '',
                                isFollowed ? 'is-following' : ''
                              ]
                                .filter(Boolean)
                                .join(' ');
                              const shouldShowFollowButton = isSelected || isFollowed;

                              return (
                                <div
                                  key={track.id}
                                  className={itemClassName}
                                  title={`${track.trackSetName} · Track #${track.displayTrackNumber ?? String(track.trackNumber)}`}
                                >
                                  <div className="track-toggle">
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={() => onTrackVisibilityToggle(track.id)}
                                      aria-label={`Toggle visibility for Track #${track.displayTrackNumber ?? String(track.trackNumber)}`}
                                    />
                                  </div>
                                  <button
                                    type="button"
                                    className="track-label-button"
                                    onClick={() => onTrackSelectionToggle(track.id)}
                                    aria-pressed={isSelected}
                                  >
                                    <span className="track-label">
                                      <span className="track-color-swatch" style={{ backgroundColor: trackColor }} aria-hidden="true" />
                                      <span className="track-name">Track #{track.displayTrackNumber ?? String(track.trackNumber)}</span>
                                    </span>
                                  </button>
                                  {shouldShowFollowButton ? (
                                    <button
                                      type="button"
                                      className={isFollowed ? 'track-follow-button is-active' : 'track-follow-button'}
                                      onClick={() => onTrackFollow(track.id)}
                                      aria-pressed={isFollowed}
                                    >
                                      {isFollowed ? 'Following' : 'Follow'}
                                    </button>
                                  ) : (
                                    <span className="track-follow-placeholder" aria-hidden="true" />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="track-empty-hint">Load a tracks file to toggle individual trajectories.</p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="track-empty-hint">Add a track set to manage tracks.</p>
          )}
        </div>
      </FloatingWindow>

      <div style={{ display: isTrackSettingsOpen ? undefined : 'none' }} aria-hidden={!isTrackSettingsOpen}>
        <FloatingWindow
          title="Track settings"
          initialPosition={trackSettingsWindowInitialPosition}
          width={`min(${controlWindowWidth}px, calc(100vw - ${windowMargin * 2}px))`}
          className="floating-window--track-settings"
          resetSignal={resetToken}
          onClose={onCloseTrackSettings}
        >
          <TrackSettingsWindow {...trackSettings} />
        </FloatingWindow>
      </div>
    </>
  );
}
