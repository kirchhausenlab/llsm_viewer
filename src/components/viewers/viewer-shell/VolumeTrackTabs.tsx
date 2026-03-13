import { useEffect, useMemo, useState, type MouseEvent } from 'react';

import { normalizeTrackColor } from '../../../shared/colorMaps/trackColors';
import { isLightHexColor } from '../../../shared/utils/appHelpers';
import { buildRainbowTabStyle, buildTintedTabStyle } from './tabStyles';
import type { VolumeTrackTabsProps } from './types';
import { formatCompactChannelLabel } from './channelLabel';

const MAX_VISIBLE_TRACK_TABS = 4;

const clampRangeValue = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const resolveTabOffsetForActiveTrackSet = (
  trackSetIds: string[],
  activeTrackSetId: string | null
): number => {
  if (!activeTrackSetId) {
    return 0;
  }

  const activeTabIndex = trackSetIds.indexOf(activeTrackSetId);
  if (activeTabIndex === -1) {
    return 0;
  }

  return Math.max(0, activeTabIndex - MAX_VISIBLE_TRACK_TABS + 1);
};

export default function VolumeTrackTabs({
  trackSets,
  trackHeadersByTrackSet,
  activeTrackSetId,
  trackColorModesByTrackSet,
  trackVisibilitySummaryByTrackSet,
  onTrackSetTabSelect,
  onTrackVisibilityAllChange
}: VolumeTrackTabsProps) {
  const trackSetIds = useMemo(() => trackSets.map((trackSet) => trackSet.id), [trackSets]);
  const maxTabOffset = Math.max(0, trackSetIds.length - MAX_VISIBLE_TRACK_TABS);
  const [tabOffset, setTabOffset] = useState(() =>
    clampRangeValue(resolveTabOffsetForActiveTrackSet(trackSetIds, activeTrackSetId), 0, maxTabOffset)
  );

  useEffect(() => {
    setTabOffset((currentOffset) => clampRangeValue(currentOffset, 0, maxTabOffset));
  }, [maxTabOffset]);

  useEffect(() => {
    if (!activeTrackSetId) {
      return;
    }

    const activeTabIndex = trackSetIds.indexOf(activeTrackSetId);
    if (activeTabIndex === -1) {
      return;
    }

    setTabOffset((currentOffset) => {
      if (activeTabIndex < currentOffset) {
        return activeTabIndex;
      }
      if (activeTabIndex >= currentOffset + MAX_VISIBLE_TRACK_TABS) {
        return activeTabIndex - MAX_VISIBLE_TRACK_TABS + 1;
      }
      return currentOffset;
    });
  }, [activeTrackSetId, trackSetIds]);

  const visibleTrackSets = useMemo(
    () => trackSets.slice(tabOffset, tabOffset + MAX_VISIBLE_TRACK_TABS),
    [tabOffset, trackSets]
  );
  const canScrollLeft = tabOffset > 0;
  const canScrollRight = tabOffset < maxTabOffset;

  if (trackSets.length === 0) {
    return null;
  }

  return (
    <div className="viewer-top-menu-track-tabs-shell">
      <button
        type="button"
        className={
          canScrollLeft
            ? 'viewer-top-menu-track-tabs-nav'
            : 'viewer-top-menu-track-tabs-nav is-hidden'
        }
        onClick={() => setTabOffset((currentOffset) => clampRangeValue(currentOffset - 1, 0, maxTabOffset))}
        aria-label="Show previous track tabs"
        tabIndex={canScrollLeft ? 0 : -1}
        aria-hidden={!canScrollLeft}
      >
        <span aria-hidden="true">&laquo;</span>
      </button>
      <div className="viewer-top-menu-track-tabs" role="tablist" aria-label="Track sets">
        {visibleTrackSets.map((trackSet) => {
          const label = trackSet.name || 'Tracks';
          const compactLabel = formatCompactChannelLabel(label);
          const isActive = trackSet.id === activeTrackSetId;
          const hasTracks = (trackHeadersByTrackSet.get(trackSet.id)?.totalTracks ?? 0) > 0;
          const summary = trackVisibilitySummaryByTrackSet.get(trackSet.id) ?? { total: 0, visible: 0 };
          const isHidden = hasTracks && summary.visible === 0;
          const colorMode = trackColorModesByTrackSet[trackSet.id] ?? { type: 'random' as const };
          const tintColor =
            colorMode.type === 'uniform' ? normalizeTrackColor(colorMode.color) : null;
          const isLightTint = tintColor ? isLightHexColor(tintColor) : false;
          const tabClassName = [
            'channel-tab',
            'viewer-top-menu-track-tab',
            isActive ? 'is-active' : '',
            isLightTint ? 'is-light-tint' : '',
            !hasTracks || isHidden ? 'is-hidden' : ''
          ]
            .filter(Boolean)
            .join(' ');
          const labelClassName = !hasTracks
            ? 'channel-tab-label channel-tab-label--crossed'
            : isHidden
              ? 'channel-tab-label channel-tab-label--hidden'
              : 'channel-tab-label';
          const tabStyle =
            tintColor === null
              ? buildRainbowTabStyle()
              : buildTintedTabStyle(tintColor, isLightTint);

          const handleTrackTabClick = (event: MouseEvent<HTMLButtonElement>) => {
            if (event.button !== 0) {
              return;
            }
            onTrackSetTabSelect(trackSet.id);
          };

          const handleTrackTabAuxClick = (event: MouseEvent<HTMLButtonElement>) => {
            if (event.button !== 1) {
              return;
            }

            const currentSummary = trackVisibilitySummaryByTrackSet.get(trackSet.id) ?? { total: 0, visible: 0 };
            onTrackVisibilityAllChange(trackSet.id, currentSummary.visible === 0);
            event.preventDefault();
            event.stopPropagation();
          };

          return (
            <button
              key={trackSet.id}
              type="button"
              className={tabClassName}
              style={tabStyle}
              onClick={handleTrackTabClick}
              onAuxClick={handleTrackTabAuxClick}
              title={label}
              role="tab"
              id={`top-menu-track-tab-${trackSet.id}`}
              aria-label={label}
              aria-selected={isActive}
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
            ? 'viewer-top-menu-track-tabs-nav'
            : 'viewer-top-menu-track-tabs-nav is-hidden'
        }
        onClick={() => setTabOffset((currentOffset) => clampRangeValue(currentOffset + 1, 0, maxTabOffset))}
        aria-label="Show next track tabs"
        tabIndex={canScrollRight ? 0 : -1}
        aria-hidden={!canScrollRight}
      >
        <span aria-hidden="true">&raquo;</span>
      </button>
    </div>
  );
}
