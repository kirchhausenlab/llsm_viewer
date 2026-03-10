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
import type {
  ActiveChannel,
  ActiveLayer,
  ChannelsCanvasSurface,
} from './hudRenderersChannelsShared';

export function prepareChannelsCanvas(hud: VrChannelsHud): ChannelsCanvasSurface | null {
  if (!hud.panelCanvas || !hud.panelContext) {
    hud.regions = [];
    return null;
  }

  const ctx = hud.panelContext;
  const canvasWidth = hud.panelDisplayWidth;
  const canvasHeight = hud.panelDisplayHeight;
  const targetPixelRatio =
    typeof window !== 'undefined' ? Math.min(2, window.devicePixelRatio || 1) : hud.pixelRatio;

  if (targetPixelRatio && Math.abs(targetPixelRatio - (hud.pixelRatio ?? 1)) > 0.01 && hud.panelCanvas) {
    hud.pixelRatio = targetPixelRatio;
    hud.panelCanvas.width = Math.round(canvasWidth * hud.pixelRatio);
    hud.panelCanvas.height = Math.round(canvasHeight * hud.pixelRatio);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
  }

  const pixelRatio = hud.pixelRatio ?? 1;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, hud.panelCanvas.width, hud.panelCanvas.height);
  ctx.save();
  ctx.scale(pixelRatio, pixelRatio);
  ctx.fillStyle = 'rgba(16, 22, 29, 1)';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  return { ctx, canvasWidth, canvasHeight };
}

export function renderChannelsHeading(ctx: CanvasRenderingContext2D, paddingX: number, paddingTop: number) {
  ctx.save();
  ctx.fillStyle = '#dce7f7';
  ctx.font = vrChannelsFont('600', VR_CHANNELS_FONT_SIZES.heading);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
  ctx.shadowBlur = 18;
  ctx.fillText('Channels', paddingX, paddingTop);
  ctx.restore();

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
}

export function renderEmptyChannelsState(
  hud: VrChannelsHud,
  ctx: CanvasRenderingContext2D,
  currentY: number,
): number | null {
  ctx.fillStyle = '#9fb2c8';
  ctx.font = vrChannelsFont('500', VR_CHANNELS_FONT_SIZES.emptyState);
  ctx.fillText('Load a volume to configure channel properties.', 68, currentY + 20);
  hud.regions = [];
  hud.hoverRegion = null;

  const contentBottom = Math.ceil(currentY + 140);
  ctx.restore();

  const desiredDisplayHeight = Math.max(VR_CHANNELS_CANVAS_MIN_HEIGHT, contentBottom);
  if (Math.abs(desiredDisplayHeight - hud.panelDisplayHeight) > 1) {
    return desiredDisplayHeight;
  }

  hud.panelTexture.needsUpdate = true;
  return null;
}

export function resolveActiveChannel(state: VrChannelsState): ActiveChannel | null {
  const channels = state.channels ?? [];
  if (channels.length === 0) {
    return null;
  }

  let activeChannelId = state.activeChannelId;
  if (!activeChannelId || !channels.some((channel) => channel.id === activeChannelId)) {
    activeChannelId = channels[0].id;
    state.activeChannelId = activeChannelId;
  }

  return channels.find((channel) => channel.id === activeChannelId) ?? channels[0];
}

export function resolveSelectedLayer(activeChannel: ActiveChannel): ActiveLayer | null {
  return (
    activeChannel.layers.find((layer) => layer.key === activeChannel.activeLayerKey) ??
    activeChannel.layers[0] ??
    null
  );
}

export function clearInvalidChannelsHover(hud: VrChannelsHud, regions: VrChannelsInteractiveRegion[]) {
  if (!hud.hoverRegion) {
    return;
  }

  const stillValid = regions.some((region) => {
    if (region.targetType !== hud.hoverRegion?.targetType) {
      return false;
    }
    if (region.channelId !== hud.hoverRegion.channelId) {
      return false;
    }
    if (region.layerKey !== hud.hoverRegion.layerKey) {
      return false;
    }
    if (region.sliderKey !== hud.hoverRegion.sliderKey) {
      return false;
    }
    if (region.color !== hud.hoverRegion.color) {
      return false;
    }
    return true;
  });

  if (!stillValid) {
    hud.hoverRegion = null;
  }
}
