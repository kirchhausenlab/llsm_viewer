import {
  VR_CHANNELS_FONT_SIZES,
  vrChannelsFont,
} from './constants';
import type {
  VrChannelsHud,
  VrChannelsInteractiveRegion,
  VrChannelsState,
} from './types';
import { drawRoundedRect } from './hudCanvas';
import type { ChannelsLayout } from './hudRenderersChannelsShared';

export function renderChannelTabs(params: {
  hud: VrChannelsHud;
  ctx: CanvasRenderingContext2D;
  channels: VrChannelsState['channels'];
  activeChannelId: string;
  regions: VrChannelsInteractiveRegion[];
  layout: ChannelsLayout;
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
  const tabLabelPaddingX = 12;
  const tabLabelPaddingY = 12;

  ctx.font = vrChannelsFont('600', VR_CHANNELS_FONT_SIZES.tab);
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

    drawRoundedRect(ctx, x, y, tabWidth, tabHeight, 20);
    ctx.fillStyle = channel.visible ? (isActive ? '#2b5fa6' : '#1d2734') : '#1a202b';
    ctx.fill();

    const isTabHovered =
      hud.hoverRegion &&
      hud.hoverRegion.channelId === channel.id &&
      (hud.hoverRegion.targetType === 'channels-tab' ||
        hud.hoverRegion.targetType === 'channels-tab-toggle');
    if (isTabHovered) {
      ctx.save();
      drawRoundedRect(ctx, x, y, tabWidth, tabHeight, 20);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(
      x + tabLabelPaddingX,
      y + tabLabelPaddingY,
      tabWidth - tabLabelPaddingX * 2,
      tabHeight - tabLabelPaddingY * 2,
    );
    ctx.clip();

    const isToggleHovered =
      hud.hoverRegion &&
      hud.hoverRegion.targetType === 'channels-tab-toggle' &&
      hud.hoverRegion.channelId === channel.id;
    ctx.fillStyle = channel.visible ? '#f3f6fc' : 'rgba(243, 246, 252, 0.55)';
    if (isToggleHovered) {
      ctx.fillStyle = '#ffffff';
    }
    ctx.fillText(channel.name, x + tabWidth / 2, y + tabHeight / 2);
    ctx.restore();

    regions.push({
      targetType: 'channels-tab-toggle',
      channelId: channel.id,
      bounds: {
        minX: toPanelX(x + tabLabelPaddingX),
        maxX: toPanelX(x + tabWidth - tabLabelPaddingX),
        minY: Math.min(toPanelY(y + tabLabelPaddingY), toPanelY(y + tabHeight - tabLabelPaddingY)),
        maxY: Math.max(toPanelY(y + tabLabelPaddingY), toPanelY(y + tabHeight - tabLabelPaddingY)),
      },
    });

    regions.push({
      targetType: 'channels-tab',
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
  return layout.currentY + totalTabHeight + 48;
}
