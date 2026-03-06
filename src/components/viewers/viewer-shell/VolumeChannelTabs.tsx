import { useEffect, useMemo, useState, type MouseEvent } from 'react';

import { DEFAULT_LAYER_COLOR } from '../../../shared/colorMaps/layerColors';
import { applyAlphaToHex } from '../../../shared/utils/appHelpers';
import type { ChannelPanelStyle, VolumeChannelTabsProps } from './types';
import { formatCompactChannelLabel } from './channelLabel';

const MAX_VISIBLE_CHANNEL_TABS = 5;

const clampRangeValue = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const resolveTabOffsetForActiveChannel = (channelIds: string[], activeChannelId: string | null): number => {
  if (!activeChannelId) {
    return 0;
  }

  const activeTabIndex = channelIds.indexOf(activeChannelId);
  if (activeTabIndex === -1) {
    return 0;
  }

  return Math.max(0, activeTabIndex - MAX_VISIBLE_CHANNEL_TABS + 1);
};

export default function VolumeChannelTabs({
  loadedChannelIds,
  channelNameMap,
  channelVisibility,
  channelTintMap,
  activeChannelId,
  onChannelTabSelect,
  onChannelVisibilityToggle
}: VolumeChannelTabsProps) {
  const maxTabOffset = Math.max(0, loadedChannelIds.length - MAX_VISIBLE_CHANNEL_TABS);
  const [tabOffset, setTabOffset] = useState(() =>
    clampRangeValue(resolveTabOffsetForActiveChannel(loadedChannelIds, activeChannelId), 0, maxTabOffset)
  );

  useEffect(() => {
    setTabOffset((currentOffset) => clampRangeValue(currentOffset, 0, maxTabOffset));
  }, [maxTabOffset]);

  useEffect(() => {
    if (!activeChannelId) {
      return;
    }

    const activeTabIndex = loadedChannelIds.indexOf(activeChannelId);
    if (activeTabIndex === -1) {
      return;
    }

    setTabOffset((currentOffset) => {
      if (activeTabIndex < currentOffset) {
        return activeTabIndex;
      }
      if (activeTabIndex >= currentOffset + MAX_VISIBLE_CHANNEL_TABS) {
        return activeTabIndex - MAX_VISIBLE_CHANNEL_TABS + 1;
      }
      return currentOffset;
    });
  }, [activeChannelId, loadedChannelIds]);

  const visibleChannelIds = useMemo(
    () => loadedChannelIds.slice(tabOffset, tabOffset + MAX_VISIBLE_CHANNEL_TABS),
    [loadedChannelIds, tabOffset]
  );
  const canScrollLeft = tabOffset > 0;
  const canScrollRight = tabOffset < maxTabOffset;

  if (loadedChannelIds.length === 0) {
    return null;
  }

  return (
    <div className="viewer-top-menu-channel-tabs-shell">
      <button
        type="button"
        className={
          canScrollLeft
            ? 'viewer-top-menu-channel-tabs-nav'
            : 'viewer-top-menu-channel-tabs-nav is-hidden'
        }
        onClick={() => setTabOffset((currentOffset) => clampRangeValue(currentOffset - 1, 0, maxTabOffset))}
        aria-label="Show previous channel tabs"
        tabIndex={canScrollLeft ? 0 : -1}
        aria-hidden={!canScrollLeft}
      >
        <span aria-hidden="true">&laquo;</span>
      </button>
      <div className="viewer-top-menu-channel-tabs" role="tablist" aria-label="Volume channels">
        {visibleChannelIds.map((channelId) => {
          const label = channelNameMap.get(channelId) ?? 'Untitled channel';
          const compactLabel = formatCompactChannelLabel(label);
          const isActive = channelId === activeChannelId;
          const isVisible = channelVisibility[channelId] ?? true;
          const tabClassName = [
            'channel-tab',
            'viewer-top-menu-channel-tab',
            isActive ? 'is-active' : '',
            !isVisible ? 'is-hidden' : ''
          ]
            .filter(Boolean)
            .join(' ');
          const labelClassName = isVisible
            ? 'channel-tab-label'
            : 'channel-tab-label channel-tab-label--hidden';
          const tintColor = channelTintMap.get(channelId) ?? DEFAULT_LAYER_COLOR;
          const tabStyle: ChannelPanelStyle = {
            '--channel-tab-background': applyAlphaToHex(tintColor, 0.18),
            '--channel-tab-background-active': applyAlphaToHex(tintColor, 0.35),
            '--channel-tab-border': 'rgba(255, 255, 255, 0.15)',
            '--channel-tab-border-active': applyAlphaToHex(tintColor, 0.55),
            '--channel-tab-highlight': applyAlphaToHex(tintColor, 0.82)
          };

          const handleChannelTabClick = (event: MouseEvent<HTMLButtonElement>) => {
            if (event.button !== 0) {
              return;
            }
            onChannelTabSelect(channelId);
          };

          const handleChannelTabAuxClick = (event: MouseEvent<HTMLButtonElement>) => {
            if (event.button === 1) {
              event.preventDefault();
              onChannelVisibilityToggle(channelId);
            }
          };

          return (
            <button
              key={channelId}
              type="button"
              className={tabClassName}
              style={tabStyle}
              onClick={handleChannelTabClick}
              onAuxClick={handleChannelTabAuxClick}
              title={label}
              role="tab"
              id={`channel-tab-${channelId}`}
              aria-label={label}
              aria-selected={isActive}
              aria-controls={`channel-panel-${channelId}`}
            >
              <span className={labelClassName}>{compactLabel}</span>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        className={
          canScrollRight
            ? 'viewer-top-menu-channel-tabs-nav'
            : 'viewer-top-menu-channel-tabs-nav is-hidden'
        }
        onClick={() => setTabOffset((currentOffset) => clampRangeValue(currentOffset + 1, 0, maxTabOffset))}
        aria-label="Show next channel tabs"
        tabIndex={canScrollRight ? 0 : -1}
        aria-hidden={!canScrollRight}
      >
        <span aria-hidden="true">&raquo;</span>
      </button>
    </div>
  );
}
