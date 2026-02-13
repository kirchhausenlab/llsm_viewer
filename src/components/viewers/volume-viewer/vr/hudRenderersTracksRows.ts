import {
  VR_TRACKS_FONT_SIZES,
  vrTracksFont,
} from './constants';
import type {
  VrTracksHud,
  VrTracksInteractiveRegion,
} from './types';
import { drawRoundedRect } from './hudCanvas';
import type {
  ActiveTrackChannel,
  TracksLayout,
} from './hudRenderersTracksShared';

export function renderTrackRowsAndScroll(params: {
  hud: VrTracksHud;
  ctx: CanvasRenderingContext2D;
  activeChannel: ActiveTrackChannel;
  regions: VrTracksInteractiveRegion[];
  layout: TracksLayout;
}): void {
  const { hud, ctx, activeChannel, regions, layout } = params;
  const { toPanelX, toPanelY, paddingX } = layout;
  const canvasWidth = hud.panelDisplayWidth;
  const canvasHeight = hud.panelDisplayHeight;

  if (activeChannel.totalTracks === 0) {
    ctx.fillStyle = '#9fb2c8';
    ctx.font = vrTracksFont('500', VR_TRACKS_FONT_SIZES.emptyState);
    ctx.fillText('Load a tracks file to toggle individual trajectories.', paddingX, layout.currentY + 12);
    return;
  }

  const listTop = layout.currentY;
  const listPaddingBottom = 64;
  const availableHeight = Math.max(canvasHeight - listPaddingBottom - listTop, 120);
  const rowHeight = 68;
  const totalTracks = activeChannel.tracks.length;
  const visibleRows = Math.max(1, Math.floor(availableHeight / rowHeight));
  const maxScrollIndex = Math.max(totalTracks - visibleRows, 0);
  const clampedScrollOffset = Math.min(Math.max(activeChannel.scrollOffset ?? 0, 0), 1);
  const startIndex = Math.min(Math.floor(clampedScrollOffset * maxScrollIndex + 1e-6), maxScrollIndex);
  const endIndex = Math.min(startIndex + visibleRows, totalTracks);
  const rowsToRender = Math.max(0, endIndex - startIndex);

  const trackAreaWidth = canvasWidth - paddingX * 2;
  const scrollBarWidth = 26;
  const scrollBarSpacing = 18;
  const needsScroll = totalTracks > visibleRows;
  const trackContentWidth = needsScroll ? trackAreaWidth - scrollBarWidth - scrollBarSpacing : trackAreaWidth;

  for (let index = 0; index < rowsToRender; index += 1) {
    const track = activeChannel.tracks[startIndex + index];
    if (!track) {
      continue;
    }

    const rowY = listTop + index * rowHeight;
    const rowRadius = 16;
    drawRoundedRect(ctx, paddingX, rowY, trackContentWidth, rowHeight - 8, rowRadius);
    const isHoveredRow =
      hud.hoverRegion &&
      (hud.hoverRegion.targetType === 'tracks-toggle' || hud.hoverRegion.targetType === 'tracks-follow') &&
      hud.hoverRegion.channelId === activeChannel.id &&
      hud.hoverRegion.trackId === track.id;

    ctx.fillStyle = track.isFollowed ? '#2b3340' : '#1d2734';
    if (isHoveredRow) {
      ctx.fillStyle = '#334157';
    }
    ctx.fill();

    const toggleBoxSize = 34;
    const toggleBoxX = paddingX + 18;
    const toggleBoxY = rowY + (rowHeight - 8 - toggleBoxSize) / 2;
    drawRoundedRect(ctx, toggleBoxX, toggleBoxY, toggleBoxSize, toggleBoxSize, 10);
    ctx.fillStyle = track.visible ? '#2b5fa6' : '#2a313c';
    ctx.fill();
    if (track.visible) {
      ctx.strokeStyle = '#f3f6fc';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(toggleBoxX + 8, toggleBoxY + toggleBoxSize / 2);
      ctx.lineTo(toggleBoxX + toggleBoxSize / 2 - 3, toggleBoxY + toggleBoxSize - 9);
      ctx.lineTo(toggleBoxX + toggleBoxSize - 7, toggleBoxY + 10);
      ctx.stroke();
    }

    regions.push({
      targetType: 'tracks-toggle',
      channelId: activeChannel.id,
      trackId: track.id,
      disabled: false,
      bounds: {
        minX: toPanelX(toggleBoxX),
        maxX: toPanelX(toggleBoxX + toggleBoxSize),
        minY: Math.min(toPanelY(toggleBoxY), toPanelY(toggleBoxY + toggleBoxSize)),
        maxY: Math.max(toPanelY(toggleBoxY), toPanelY(toggleBoxY + toggleBoxSize)),
      },
    });

    const swatchRadius = 10;
    const swatchCenterX = toggleBoxX + toggleBoxSize + 26;
    const swatchCenterY = toggleBoxY + toggleBoxSize / 2;
    ctx.beginPath();
    ctx.arc(swatchCenterX, swatchCenterY, swatchRadius, 0, Math.PI * 2);
    ctx.fillStyle = track.color;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#0b0f14';
    ctx.stroke();

    ctx.fillStyle = track.isFollowed ? '#f6fbff' : '#dce3f1';
    ctx.font = vrTracksFont('600', VR_TRACKS_FONT_SIZES.track);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(track.label, swatchCenterX + 18, swatchCenterY);

    const followWidth = 140;
    const followHeight = rowHeight - 20;
    const followX = paddingX + trackContentWidth - followWidth - 18;
    const followY = rowY + (rowHeight - 8 - followHeight) / 2;
    drawRoundedRect(ctx, followX, followY, followWidth, followHeight, 14);
    ctx.fillStyle = track.isFollowed ? '#2b5fa6' : '#2b3340';
    if (isHoveredRow && hud.hoverRegion?.targetType === 'tracks-follow') {
      ctx.fillStyle = '#336cd1';
    }
    ctx.fill();
    ctx.fillStyle = '#f3f6fc';
    ctx.font = vrTracksFont('600', VR_TRACKS_FONT_SIZES.button);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(track.isFollowed ? 'Following' : 'Follow', followX + followWidth / 2, followY + followHeight / 2);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    regions.push({
      targetType: 'tracks-follow',
      channelId: activeChannel.id,
      trackId: track.id,
      disabled: false,
      bounds: {
        minX: toPanelX(followX),
        maxX: toPanelX(followX + followWidth),
        minY: Math.min(toPanelY(followY), toPanelY(followY + followHeight)),
        maxY: Math.max(toPanelY(followY), toPanelY(followY + followHeight)),
      },
    });
  }

  if (!needsScroll || rowsToRender <= 0) {
    return;
  }

  const scrollTrackTop = listTop;
  const scrollTrackHeight = Math.max(rowHeight * visibleRows - 8, rowHeight - 8);
  const scrollTrackX = paddingX + trackContentWidth + scrollBarSpacing;
  const scrollRadius = scrollBarWidth / 2;
  drawRoundedRect(ctx, scrollTrackX, scrollTrackTop, scrollBarWidth, scrollTrackHeight, scrollRadius);
  ctx.fillStyle = '#141b25';
  ctx.fill();

  const handleRatio = Math.min(Math.max(clampedScrollOffset, 0), 1);
  const handleHeight = Math.max(40, scrollTrackHeight * Math.min(visibleRows / totalTracks, 1));
  const handleTravel = Math.max(scrollTrackHeight - handleHeight, 1e-5);
  const handleOffset = handleTravel * handleRatio;
  const handleY = scrollTrackTop + handleOffset;
  drawRoundedRect(ctx, scrollTrackX, handleY, scrollBarWidth, handleHeight, scrollRadius);

  const isScrollHovered =
    hud.hoverRegion &&
    hud.hoverRegion.targetType === 'tracks-scroll' &&
    hud.hoverRegion.channelId === activeChannel.id;
  ctx.fillStyle = isScrollHovered ? '#3a73d1' : '#2b5fa6';
  ctx.fill();

  const sliderTopPanel = toPanelY(scrollTrackTop);
  const sliderBottomPanel = toPanelY(scrollTrackTop + scrollTrackHeight);
  const sliderMin = Math.min(sliderTopPanel, sliderBottomPanel);
  const sliderMax = Math.max(sliderTopPanel, sliderBottomPanel);

  regions.push({
    targetType: 'tracks-scroll',
    channelId: activeChannel.id,
    bounds: {
      minX: toPanelX(scrollTrackX),
      maxX: toPanelX(scrollTrackX + scrollBarWidth),
      minY: Math.min(toPanelY(scrollTrackTop), toPanelY(scrollTrackTop + scrollTrackHeight)),
      maxY: Math.max(toPanelY(scrollTrackTop), toPanelY(scrollTrackTop + scrollTrackHeight)),
    },
    verticalSliderTrack: {
      x: toPanelX(scrollTrackX + scrollBarWidth / 2),
      minY: sliderMin,
      maxY: sliderMax,
      inverted: sliderTopPanel > sliderBottomPanel,
      visibleRows,
      totalRows: totalTracks,
    },
  });
}
