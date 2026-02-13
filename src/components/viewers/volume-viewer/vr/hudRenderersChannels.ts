import {
  VR_CHANNELS_CANVAS_MIN_HEIGHT,
  VR_CHANNELS_FONT_SIZES,
  vrChannelsFont,
} from './constants';
import type {
  VrChannelsHud,
  VrChannelsInteractiveRegion,
  VrChannelsState,
} from './types';
import type { ChannelsLayout } from './hudRenderersChannelsShared';
import {
  clearInvalidChannelsHover,
  prepareChannelsCanvas,
  renderChannelsHeading,
  renderEmptyChannelsState,
  resolveActiveChannel,
  resolveSelectedLayer,
} from './hudRenderersChannelsBase';
import {
  renderChannelTabs,
  renderLayerControls,
} from './hudRenderersChannelsSections';

export function renderVrChannelsHud(hud: VrChannelsHud, state: VrChannelsState): number | null {
  const canvas = prepareChannelsCanvas(hud);
  if (!canvas) {
    return null;
  }

  const { ctx, canvasWidth, canvasHeight } = canvas;
  const regions: VrChannelsInteractiveRegion[] = [];
  const paddingX = 68;
  const paddingTop = 48;
  const layout: ChannelsLayout = {
    toPanelX: (x: number) => (x / canvasWidth - 0.5) * hud.width,
    toPanelY: (y: number) => (0.5 - y / canvasHeight) * hud.height,
    paddingX,
    currentY: paddingTop + 84,
  };

  renderChannelsHeading(ctx, paddingX, paddingTop);

  const activeChannel = resolveActiveChannel(state);
  if (!activeChannel) {
    return renderEmptyChannelsState(hud, ctx, layout.currentY);
  }

  layout.currentY = renderChannelTabs({
    hud,
    ctx,
    channels: state.channels,
    activeChannelId: activeChannel.id,
    regions,
    layout,
  });

  ctx.fillStyle = '#9fb2c8';
  ctx.font = vrChannelsFont('500', VR_CHANNELS_FONT_SIZES.body);
  ctx.fillText('Active layer', paddingX, layout.currentY);
  layout.currentY += 40;

  const selectedLayer = resolveSelectedLayer(activeChannel);
  if (!selectedLayer) {
    ctx.fillStyle = '#9fb2c8';
    ctx.font = vrChannelsFont('500', VR_CHANNELS_FONT_SIZES.emptyState);
    ctx.fillText('No layers available for this channel.', paddingX, layout.currentY);
    layout.currentY += 64;
  } else {
    renderLayerControls({
      hud,
      ctx,
      activeChannel,
      selectedLayer,
      regions,
      layout,
      canvasWidth,
    });
  }

  clearInvalidChannelsHover(hud, regions);
  hud.regions = regions;

  const paddingBottom = 72;
  const contentBottom = Math.ceil(layout.currentY + paddingBottom);
  ctx.restore();

  const desiredDisplayHeight = Math.max(VR_CHANNELS_CANVAS_MIN_HEIGHT, contentBottom);
  if (Math.abs(desiredDisplayHeight - hud.panelDisplayHeight) > 1) {
    return desiredDisplayHeight;
  }

  hud.panelTexture.needsUpdate = true;
  return null;
}
