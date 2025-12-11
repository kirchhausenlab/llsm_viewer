import type { CSSProperties, MouseEvent } from 'react';

import {
  TRACK_COLOR_SWATCHES,
  getTrackColorHex,
  normalizeTrackColor
} from '../../../shared/colorMaps/trackColors';
import { applyAlphaToHex } from '../../../shared/utils/appHelpers';
import FloatingWindow from '../../widgets/FloatingWindow';
import type { LayoutProps, TracksPanelProps, TrackDefaults } from './types';

export type TracksPanelWindowProps = TracksPanelProps & {
  layout: Pick<LayoutProps, 'windowMargin' | 'controlWindowWidth' | 'trackWindowInitialPosition' | 'resetToken'>;
  trackDefaults: TrackDefaults;
  hasTrackData: boolean;
};

export default function TracksPanel({
  layout,
  hasTrackData,
  channels,
  channelNameMap,
  activeChannelId,
  onChannelTabSelect,
  parsedTracksByChannel,
  filteredTracksByChannel,
  minimumTrackLength,
  pendingMinimumTrackLength,
  trackLengthBounds,
  onMinimumTrackLengthChange,
  onMinimumTrackLengthApply,
  channelTrackColorModes,
  trackOpacityByChannel,
  trackLineWidthByChannel,
  trackSummaryByChannel,
  followedTrackChannelId,
  followedTrackId,
  onTrackOrderToggle,
  trackOrderModeByChannel,
  trackVisibility,
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
  trackDefaults
}: TracksPanelWindowProps) {
  const { windowMargin, controlWindowWidth, trackWindowInitialPosition, resetToken } = layout;

  const selectedTrackOrderMap = new Map(selectedTrackOrder.map((trackId, index) => [trackId, index]));

  if (!hasTrackData) {
    return null;
  }

  return (
    <FloatingWindow
      title="Tracks"
      initialPosition={trackWindowInitialPosition}
      width={`min(${controlWindowWidth}px, calc(100vw - ${windowMargin * 2}px))`}
      className="floating-window--tracks"
      resetSignal={resetToken}
      headerContent={
        <div className="channel-tabs channel-tabs--header" role="tablist" aria-label="Track channels">
          {channels.map((channel) => {
            const label = channelNameMap.get(channel.id) ?? 'Untitled channel';
            const displayLabel = label.length > 9 ? `${label.slice(0, 6)}...` : label;
            const isActive = channel.id === activeChannelId;
            const summary = trackSummaryByChannel.get(channel.id) ?? { total: 0, visible: 0 };
            const hasTracksForChannel = (parsedTracksByChannel.get(channel.id)?.length ?? 0) > 0;
            const hasVisibleTracks = summary.visible > 0;
            const tabClassName = ['channel-tab', isActive ? 'is-active' : '', !hasTracksForChannel ? 'is-hidden' : '']
              .filter(Boolean)
              .join(' ');
            const labelClassName = hasVisibleTracks
              ? 'channel-tab-label'
              : 'channel-tab-label channel-tab-label--crossed';
            const colorMode = channelTrackColorModes[channel.id] ?? { type: 'random' };
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
              onChannelTabSelect(channel.id);
            };

            const handleTrackTabAuxClick = (event: MouseEvent<HTMLButtonElement>) => {
              const currentSummary = trackSummaryByChannel.get(channel.id) ?? { total: 0, visible: 0 };
              const nextHasVisibleTracks = currentSummary.visible > 0;
              if (event.button === 1) {
                event.preventDefault();
                onTrackVisibilityAllChange(channel.id, !nextHasVisibleTracks);
              }
            };

            const tabTitle = hasVisibleTracks
              ? 'Middle click to hide all tracks for this channel'
              : 'Middle click to show all tracks for this channel';

            return (
              <button
                key={channel.id}
                type="button"
                className={tabClassName}
                style={tabStyle}
                onClick={handleTrackTabClick}
                onAuxClick={handleTrackTabAuxClick}
                role="tab"
                id={`track-tab-${channel.id}`}
                aria-label={label}
                aria-selected={isActive}
                aria-controls={`track-panel-${channel.id}`}
                title={tabTitle}
              >
                <span className={labelClassName}>{displayLabel}</span>
              </button>
            );
          })}
        </div>
      }
    >
      <div className="sidebar sidebar-left">
        {channels.length > 0 ? (
          <div className="track-controls">
            {channels.map((channel) => {
              const tracksForChannel = filteredTracksByChannel.get(channel.id) ?? [];
              const parsedTracks = parsedTracksByChannel.get(channel.id) ?? [];
              const summary = trackSummaryByChannel.get(channel.id) ?? { total: 0, visible: 0 };
              const isActive = channel.id === activeChannelId;
              const orderMode = trackOrderModeByChannel[channel.id] ?? 'id';
              const colorMode = channelTrackColorModes[channel.id] ?? { type: 'random' };
              const trackColorLabel = colorMode.type === 'uniform' ? 'Uniform' : 'By ID';
              const hasChannelTracks = parsedTracks.length > 0;
              const opacity = trackOpacityByChannel[channel.id] ?? trackDefaults.opacity;
              const lineWidth = trackLineWidthByChannel[channel.id] ?? trackDefaults.lineWidth;
              const displayTracks = [...tracksForChannel].sort((a, b) => {
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
                  return b.points.length - a.points.length;
                }
                return a.trackNumber - b.trackNumber;
              });

              return (
                <div
                  key={channel.id}
                  id={`track-panel-${channel.id}`}
                  role="tabpanel"
                  aria-labelledby={`track-tab-${channel.id}`}
                  className={isActive ? 'track-panel is-active' : 'track-panel'}
                  hidden={!isActive}
                >
                  <div className="track-panel-body">
                    <div className="track-filters">
                      <div className="track-length-filter">
                        <label htmlFor={`track-length-${channel.id}`}>
                          Min length <span>{pendingMinimumTrackLength}</span>
                        </label>
                        <div className="track-length-input-row">
                          <input
                            id={`track-length-${channel.id}`}
                            type="range"
                            min={trackLengthBounds.min}
                            max={trackLengthBounds.max}
                            step={0.1}
                            value={pendingMinimumTrackLength}
                            onChange={(event) => onMinimumTrackLengthChange(Number(event.target.value))}
                            disabled={!hasChannelTracks}
                          />
                          <button
                            type="button"
                            className="track-length-apply"
                            onClick={onMinimumTrackLengthApply}
                            disabled={!hasChannelTracks || pendingMinimumTrackLength === minimumTrackLength}
                          >
                            Apply
                          </button>
                        </div>
                      </div>
                      <div className="track-slider-row">
                        <div className="slider-control">
                          <label htmlFor={`track-opacity-${channel.id}`}>
                            Opacity <span>{Math.round(opacity * 100)}%</span>
                          </label>
                          <input
                            id={`track-opacity-${channel.id}`}
                            type="range"
                            min={0}
                            max={1}
                            step={0.05}
                            value={opacity}
                            onChange={(event) => onTrackOpacityChange(channel.id, Number(event.target.value))}
                            disabled={tracksForChannel.length === 0}
                          />
                        </div>
                        <div className="slider-control">
                          <label htmlFor={`track-linewidth-${channel.id}`}>
                            Thickness <span>{lineWidth.toFixed(1)}</span>
                          </label>
                          <input
                            id={`track-linewidth-${channel.id}`}
                            type="range"
                            min={0.5}
                            max={5}
                            step={0.1}
                            value={lineWidth}
                            onChange={(event) => onTrackLineWidthChange(channel.id, Number(event.target.value))}
                            disabled={tracksForChannel.length === 0}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="track-color-control">
                      <div className="track-color-control-header">
                        <span id={`track-color-label-${channel.id}`}>Track color</span>
                        <span>{trackColorLabel}</span>
                      </div>
                      <div className="track-color-swatch-row">
                        <div className="color-swatch-grid" role="group" aria-labelledby={`track-color-label-${channel.id}`}>
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
                                onClick={() => onTrackColorSelect(channel.id, swatch.value)}
                                disabled={tracksForChannel.length === 0}
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
                          onClick={() => onTrackColorReset(channel.id)}
                          disabled={tracksForChannel.length === 0}
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
                          onClick={() => onTrackOrderToggle(channel.id)}
                          disabled={tracksForChannel.length === 0}
                          aria-pressed={orderMode === 'length'}
                        >
                          {orderMode === 'length' ? 'Order by ID' : 'Order by length'}
                        </button>
                      </div>
                      {tracksForChannel.length > 0 ? (
                        <div className="track-list" role="group" aria-label={`${channelNameMap.get(channel.id) ?? 'Channel'} track visibility`}>
                          {displayTracks.map((track) => {
                            const isFollowed = followedTrackId === track.id;
                            const isSelected = selectedTrackIds.has(track.id);
                            const isChecked = isFollowed || isSelected || (trackVisibility[track.id] ?? true);
                            const trackColor =
                              colorMode.type === 'uniform'
                                ? normalizeTrackColor(colorMode.color)
                                : getTrackColorHex(track.id);
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
                                title={`${track.channelName} · Track #${track.trackNumber}`}
                              >
                                <div className="track-toggle">
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => onTrackVisibilityToggle(track.id)}
                                    aria-label={`Toggle visibility for Track #${track.trackNumber}`}
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
                                    <span className="track-name">Track #{track.trackNumber}</span>
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
          <p className="track-empty-hint">Add a channel to manage tracks.</p>
        )}
      </div>
    </FloatingWindow>
  );
}
