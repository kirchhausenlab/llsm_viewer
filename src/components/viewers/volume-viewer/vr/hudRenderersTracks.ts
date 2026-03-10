import type {
  VrTracksHud,
  VrTracksInteractiveRegion,
  VrTracksState,
} from './types';
import type { TracksLayout } from './hudRenderersTracksShared';
import {
  clearInvalidTracksHover,
  prepareTracksCanvas,
  renderTracksEmptyState,
  renderTracksHeading,
  resolveActiveTrackChannel,
} from './hudRenderersTracksBase';
import {
  renderTrackChannelTabs,
  renderTrackColorControls,
  renderTrackMasterToggle,
  renderTrackRowsAndScroll,
  renderTrackSliderControls,
} from './hudRenderersTracksSections';

export function renderVrTracksHud(hud: VrTracksHud, state: VrTracksState) {
  const canvas = prepareTracksCanvas(hud);
  if (!canvas) {
    return;
  }

  const { ctx, canvasWidth, canvasHeight } = canvas;
  const regions: VrTracksInteractiveRegion[] = [];
  const paddingX = 72;
  const paddingTop = 48;
  const layout: TracksLayout = {
    toPanelX: (x: number) => (x / canvasWidth - 0.5) * hud.width,
    toPanelY: (y: number) => (0.5 - y / canvasHeight) * hud.height,
    paddingX,
    currentY: paddingTop + 84,
  };

  renderTracksHeading(ctx, paddingX, paddingTop);

  const activeChannel = resolveActiveTrackChannel(state);
  if (!activeChannel) {
    renderTracksEmptyState(hud, ctx, layout.currentY);
    return;
  }

  layout.currentY = renderTrackChannelTabs({
    hud,
    ctx,
    channels: state.channels,
    activeChannelId: activeChannel.id,
    regions,
    layout,
  });

  layout.currentY = renderTrackSliderControls({
    hud,
    ctx,
    activeChannel,
    regions,
    layout,
  });

  layout.currentY = renderTrackColorControls({
    hud,
    ctx,
    activeChannel,
    regions,
    layout,
  });

  layout.currentY = renderTrackMasterToggle({
    hud,
    ctx,
    activeChannel,
    regions,
    layout,
  });

  renderTrackRowsAndScroll({
    hud,
    ctx,
    activeChannel,
    regions,
    layout,
  });

  clearInvalidTracksHover(hud, regions);
  hud.regions = regions;
  ctx.restore();
  hud.panelTexture.needsUpdate = true;
}
