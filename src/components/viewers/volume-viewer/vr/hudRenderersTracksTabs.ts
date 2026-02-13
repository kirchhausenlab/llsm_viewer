import {
  VR_TRACKS_FONT_SIZES,
  vrTracksFont,
} from './constants';
import type {
  VrTracksHud,
  VrTracksInteractiveRegion,
  VrTracksState,
} from './types';
import { drawRoundedRect } from './hudCanvas';
import type { TracksLayout } from './hudRenderersTracksShared';

export function renderTrackChannelTabs(params: {
  hud: VrTracksHud;
  ctx: CanvasRenderingContext2D;
  channels: VrTracksState['channels'];
  activeChannelId: string;
  regions: VrTracksInteractiveRegion[];
  layout: TracksLayout;
}): number {
  const { hud, ctx, channels, activeChannelId, regions, layout } = params;
  const { toPanelX, toPanelY, paddingX } = layout;
  const canvasWidth = hud.panelDisplayWidth;

  const tabAreaWidth = canvasWidth - paddingX * 2;
  const tabSpacingX = 18;
  const tabSpacingY = 18;
  const minTabWidth = 160;
  const maxTabWidth = 260;
  let columns = Math.min(3, channels.length);
  while (columns > 1) {
    const candidateWidth = (tabAreaWidth - (columns - 1) * tabSpacingX) / columns;
    if (candidateWidth >= minTabWidth) {
      break;
    }
    columns -= 1;
  }
  columns = Math.max(1, columns);
  const tabWidth = Math.max(
    minTabWidth,
    Math.min(maxTabWidth, (tabAreaWidth - (columns - 1) * tabSpacingX) / columns),
  );
  const tabHeight = 82;
  const totalRows = Math.ceil(channels.length / columns);

  ctx.font = vrTracksFont('600', VR_TRACKS_FONT_SIZES.tab);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (let index = 0; index < channels.length; index += 1) {
    const channel = channels[index];
    const rowIndex = Math.floor(index / columns);
    const rowStartIndex = rowIndex * columns;
    const itemsInRow = Math.min(columns, channels.length - rowStartIndex);
    const rowWidth = itemsInRow * tabWidth + Math.max(0, itemsInRow - 1) * tabSpacingX;
    const rowStartX = paddingX + Math.max(0, (tabAreaWidth - rowWidth) / 2);
    const columnIndex = index - rowStartIndex;
    const x = rowStartX + columnIndex * (tabWidth + tabSpacingX);
    const y = layout.currentY + rowIndex * (tabHeight + tabSpacingY);
    const isActive = channel.id === activeChannelId;
    const hasTracks = channel.totalTracks > 0;

    drawRoundedRect(ctx, x, y, tabWidth, tabHeight, 20);
    ctx.fillStyle = hasTracks ? (isActive ? '#2b5fa6' : '#1d2734') : '#1a202b';
    ctx.fill();
    if (
      hud.hoverRegion &&
      hud.hoverRegion.targetType === 'tracks-tab' &&
      hud.hoverRegion.channelId === channel.id
    ) {
      ctx.save();
      drawRoundedRect(ctx, x, y, tabWidth, tabHeight, 20);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 12, y + 12, tabWidth - 24, tabHeight - 24);
    ctx.clip();
    ctx.fillStyle = '#f3f6fc';
    ctx.fillText(channel.name, x + tabWidth / 2, y + tabHeight / 2);
    ctx.restore();

    regions.push({
      targetType: 'tracks-tab',
      channelId: channel.id,
      bounds: {
        minX: toPanelX(x),
        maxX: toPanelX(x + tabWidth),
        minY: Math.min(toPanelY(y), toPanelY(y + tabHeight)),
        maxY: Math.max(toPanelY(y), toPanelY(y + tabHeight)),
      },
    });
  }

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const totalTabHeight = totalRows * tabHeight + Math.max(0, totalRows - 1) * tabSpacingY;
  return layout.currentY + totalTabHeight + 36;
}
