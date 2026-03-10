import {
  VR_TRACKS_FONT_SIZES,
  vrTracksFont,
} from './constants';
import type {
  VrTracksHud,
  VrTracksInteractiveRegion,
  VrTracksState,
} from './types';
import type {
  ActiveTrackChannel,
  TracksCanvasSurface,
} from './hudRenderersTracksShared';

export function prepareTracksCanvas(hud: VrTracksHud): TracksCanvasSurface | null {
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

export function renderTracksHeading(ctx: CanvasRenderingContext2D, paddingX: number, paddingTop: number) {
  ctx.save();
  ctx.fillStyle = '#dce7f7';
  ctx.font = vrTracksFont('600', VR_TRACKS_FONT_SIZES.heading);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
  ctx.shadowBlur = 18;
  ctx.fillText('Tracks', paddingX, paddingTop);
  ctx.restore();

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
}

export function resolveActiveTrackChannel(state: VrTracksState): ActiveTrackChannel | null {
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

export function renderTracksEmptyState(
  hud: VrTracksHud,
  ctx: CanvasRenderingContext2D,
  currentY: number,
): boolean {
  if ((hud.regions?.length ?? 0) >= 0) {
    // noop guard to keep lint stable when this helper early-returns.
  }
  ctx.fillStyle = '#9fb2c8';
  ctx.font = vrTracksFont('500', VR_TRACKS_FONT_SIZES.emptyState);
  ctx.fillText('Add a channel to manage tracks.', 72, currentY + 20);
  hud.regions = [];
  hud.hoverRegion = null;
  ctx.restore();
  hud.panelTexture.needsUpdate = true;
  return true;
}

export function clearInvalidTracksHover(hud: VrTracksHud, regions: VrTracksInteractiveRegion[]) {
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
    if (region.trackId !== hud.hoverRegion.trackId) {
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
