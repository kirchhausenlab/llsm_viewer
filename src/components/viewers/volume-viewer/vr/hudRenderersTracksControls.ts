import {
  VR_TRACKS_FONT_SIZES,
  vrTracksFont,
} from './constants';
import type {
  VrTracksHud,
  VrTracksInteractiveRegion,
  VrTracksSliderKey,
} from './types';
import {
  DEFAULT_TRACK_COLOR,
  normalizeTrackColor,
  TRACK_COLOR_SWATCHES,
} from '../../../../shared/colorMaps/trackColors';
import { drawRoundedRect, drawRoundedRectCompat } from './hudCanvas';
import type {
  ActiveTrackChannel,
  TracksLayout,
} from './hudRenderersTracksShared';

export function renderTrackSliderControls(params: {
  hud: VrTracksHud;
  ctx: CanvasRenderingContext2D;
  activeChannel: ActiveTrackChannel;
  regions: VrTracksInteractiveRegion[];
  layout: TracksLayout;
}): number {
  const { hud, ctx, activeChannel, regions, layout } = params;
  const { toPanelX, toPanelY, paddingX } = layout;
  const canvasWidth = hud.panelDisplayWidth;
  let currentY = layout.currentY;

  ctx.fillStyle = '#9fb2c8';
  ctx.font = vrTracksFont('500', VR_TRACKS_FONT_SIZES.body);
  ctx.fillText(
    `Visible ${Math.min(activeChannel.visibleTracks, activeChannel.totalTracks)} / ${activeChannel.totalTracks} tracks`,
    paddingX,
    currentY,
  );
  currentY += 42;

  const stopWidth = 220;
  const stopHeight = 56;
  const stopX = paddingX;
  const stopY = currentY;
  const stopDisabled = !activeChannel.followedTrackId;
  drawRoundedRect(ctx, stopX, stopY, stopWidth, stopHeight, 16);
  ctx.fillStyle = stopDisabled ? 'rgba(45, 60, 74, 0.6)' : '#2b3340';
  if (!stopDisabled && activeChannel.followedTrackId) {
    ctx.fillStyle = '#2b5fa6';
  }
  ctx.fill();
  if (
    hud.hoverRegion &&
    hud.hoverRegion.targetType === 'tracks-stop-follow' &&
    hud.hoverRegion.channelId === activeChannel.id
  ) {
    ctx.save();
    drawRoundedRect(ctx, stopX, stopY, stopWidth, stopHeight, 16);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.fill();
    ctx.restore();
  }

  ctx.fillStyle = stopDisabled ? '#7b8795' : '#f3f6fc';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = vrTracksFont('600', VR_TRACKS_FONT_SIZES.button);
  ctx.fillText('Stop following', stopX + stopWidth / 2, stopY + stopHeight / 2);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  regions.push({
    targetType: 'tracks-stop-follow',
    channelId: activeChannel.id,
    disabled: stopDisabled,
    bounds: {
      minX: toPanelX(stopX),
      maxX: toPanelX(stopX + stopWidth),
      minY: Math.min(toPanelY(stopY), toPanelY(stopY + stopHeight)),
      maxY: Math.max(toPanelY(stopY), toPanelY(stopY + stopHeight)),
    },
  });

  currentY += stopHeight + 32;

  const drawTrackSlider = (
    label: string,
    valueLabel: string,
    sliderKey: VrTracksSliderKey,
    value: number,
    min: number,
    max: number,
    step: number,
  ) => {
    ctx.fillStyle = '#9fb2c8';
    ctx.font = vrTracksFont('500', VR_TRACKS_FONT_SIZES.label);
    ctx.fillText(label, paddingX, currentY);
    ctx.fillStyle = '#dce3f1';
    ctx.font = vrTracksFont('600', VR_TRACKS_FONT_SIZES.value);
    ctx.fillText(valueLabel, paddingX + 240, currentY);
    ctx.font = vrTracksFont('500', VR_TRACKS_FONT_SIZES.body);

    const sliderX = paddingX;
    const sliderY = currentY + 34;
    const sliderWidth = canvasWidth - paddingX * 2;
    const sliderHeight = 26;
    const sliderRadius = 14;
    const disabled = activeChannel.totalTracks === 0;

    drawRoundedRect(ctx, sliderX, sliderY, sliderWidth, sliderHeight, sliderRadius);
    ctx.fillStyle = disabled ? 'rgba(45, 60, 74, 0.6)' : '#1f2733';
    ctx.fill();

    const ratio = Math.min(Math.max((value - min) / Math.max(max - min, 1e-5), 0), 1);
    const knobX = sliderX + ratio * sliderWidth;
    const knobY = sliderY + sliderHeight / 2;
    ctx.beginPath();
    ctx.arc(knobX, knobY, 18, 0, Math.PI * 2);
    ctx.fillStyle = disabled ? '#45515f' : '#f3f6fc';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = disabled ? 'rgba(0, 0, 0, 0.45)' : 'rgba(0, 0, 0, 0.3)';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(knobX, knobY, 10, 0, Math.PI * 2);
    ctx.fillStyle = disabled ? '#2a313c' : '#2b5fa6';
    ctx.fill();

    const isHovered =
      hud.hoverRegion &&
      hud.hoverRegion.targetType === 'tracks-slider' &&
      hud.hoverRegion.channelId === activeChannel.id &&
      hud.hoverRegion.sliderKey === sliderKey;
    if (isHovered) {
      ctx.save();
      drawRoundedRect(ctx, sliderX, sliderY, sliderWidth, sliderHeight, sliderRadius);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
      ctx.fill();
      ctx.restore();
    }

    regions.push({
      targetType: 'tracks-slider',
      channelId: activeChannel.id,
      sliderKey,
      min,
      max,
      step,
      disabled,
      bounds: {
        minX: toPanelX(sliderX),
        maxX: toPanelX(sliderX + sliderWidth),
        minY: Math.min(toPanelY(sliderY - 10), toPanelY(sliderY + sliderHeight + 10)),
        maxY: Math.max(toPanelY(sliderY - 10), toPanelY(sliderY + sliderHeight + 10)),
      },
      sliderTrack: {
        minX: toPanelX(sliderX),
        maxX: toPanelX(sliderX + sliderWidth),
        y: toPanelY(sliderY + sliderHeight / 2),
      },
    });

    currentY += sliderHeight + 56;
  };

  drawTrackSlider('Opacity', `${Math.round(activeChannel.opacity * 100)}%`, 'opacity', activeChannel.opacity, 0, 1, 0.05);
  drawTrackSlider('Thickness', `${activeChannel.lineWidth.toFixed(1)}`, 'lineWidth', activeChannel.lineWidth, 0.5, 5, 0.1);

  return currentY;
}

export function renderTrackColorControls(params: {
  hud: VrTracksHud;
  ctx: CanvasRenderingContext2D;
  activeChannel: ActiveTrackChannel;
  regions: VrTracksInteractiveRegion[];
  layout: TracksLayout;
}): number {
  const { hud, ctx, activeChannel, regions, layout } = params;
  const { toPanelX, toPanelY, paddingX } = layout;
  const canvasWidth = hud.panelDisplayWidth;
  let currentY = layout.currentY;

  ctx.fillStyle = '#9fb2c8';
  ctx.font = vrTracksFont('500', VR_TRACKS_FONT_SIZES.body);
  ctx.fillText('Preset colors', paddingX, currentY);
  const colorLabel =
    activeChannel.colorMode.type === 'uniform'
      ? normalizeTrackColor(activeChannel.colorMode.color, DEFAULT_TRACK_COLOR)
      : 'Sorted';
  ctx.fillStyle = '#dce3f1';
  ctx.font = vrTracksFont('600', VR_TRACKS_FONT_SIZES.value);
  ctx.fillText(colorLabel, paddingX + 260, currentY);
  ctx.font = vrTracksFont('500', VR_TRACKS_FONT_SIZES.body);
  currentY += 40;

  const swatchSize = 54;
  const swatchSpacing = 20;
  let swatchX = paddingX;
  const swatchY = currentY;
  const uniformColor =
    activeChannel.colorMode.type === 'uniform'
      ? normalizeTrackColor(activeChannel.colorMode.color, DEFAULT_TRACK_COLOR)
      : null;

  for (const swatch of TRACK_COLOR_SWATCHES) {
    const normalized = normalizeTrackColor(swatch.value, DEFAULT_TRACK_COLOR);
    const isSelected = uniformColor === normalized;
    drawRoundedRectCompat(ctx, swatchX, swatchY, swatchSize, swatchSize, 14);
    ctx.fillStyle = normalized;
    ctx.fill();
    ctx.lineWidth = isSelected ? 4 : 2;
    ctx.strokeStyle = isSelected ? '#ffffff' : 'rgba(255, 255, 255, 0.45)';
    ctx.stroke();

    const isHovered =
      hud.hoverRegion &&
      hud.hoverRegion.targetType === 'tracks-color' &&
      hud.hoverRegion.channelId === activeChannel.id &&
      hud.hoverRegion.color === normalized;
    if (isHovered) {
      ctx.save();
      drawRoundedRectCompat(ctx, swatchX, swatchY, swatchSize, swatchSize, 14);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
      ctx.fill();
      ctx.restore();
    }

    regions.push({
      targetType: 'tracks-color',
      channelId: activeChannel.id,
      color: normalized,
      disabled: activeChannel.totalTracks === 0,
      bounds: {
        minX: toPanelX(swatchX),
        maxX: toPanelX(swatchX + swatchSize),
        minY: Math.min(toPanelY(swatchY), toPanelY(swatchY + swatchSize)),
        maxY: Math.max(toPanelY(swatchY), toPanelY(swatchY + swatchSize)),
      },
    });

    swatchX += swatchSize + swatchSpacing;
  }

  const modeWidth = 120;
  const modeHeight = swatchSize;
  const modeX = canvasWidth - paddingX - modeWidth;
  const modeY = swatchY;
  const isSortedMode = activeChannel.colorMode.type === 'random';
  drawRoundedRect(ctx, modeX, modeY, modeWidth, modeHeight, 16);
  ctx.fillStyle = isSortedMode ? '#2b5fa6' : '#1f2735';
  if (activeChannel.totalTracks === 0) {
    ctx.fillStyle = 'rgba(45, 60, 74, 0.6)';
  }
  ctx.fill();

  if (
    hud.hoverRegion &&
    hud.hoverRegion.targetType === 'tracks-color-mode' &&
    hud.hoverRegion.channelId === activeChannel.id
  ) {
    ctx.save();
    drawRoundedRect(ctx, modeX, modeY, modeWidth, modeHeight, 16);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.fill();
    ctx.restore();
  }

  ctx.fillStyle = activeChannel.totalTracks === 0 ? '#7b8795' : '#f3f6fc';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = vrTracksFont('600', VR_TRACKS_FONT_SIZES.button);
  ctx.fillText('Sorted', modeX + modeWidth / 2, modeY + modeHeight / 2);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  regions.push({
    targetType: 'tracks-color-mode',
    channelId: activeChannel.id,
    disabled: activeChannel.totalTracks === 0,
    bounds: {
      minX: toPanelX(modeX),
      maxX: toPanelX(modeX + modeWidth),
      minY: Math.min(toPanelY(modeY), toPanelY(modeY + modeHeight)),
      maxY: Math.max(toPanelY(modeY), toPanelY(modeY + modeHeight)),
    },
  });

  return currentY + swatchSize + 36;
}

export function renderTrackMasterToggle(params: {
  hud: VrTracksHud;
  ctx: CanvasRenderingContext2D;
  activeChannel: ActiveTrackChannel;
  regions: VrTracksInteractiveRegion[];
  layout: TracksLayout;
}): number {
  const { hud, ctx, activeChannel, regions, layout } = params;
  const { toPanelX, toPanelY, paddingX } = layout;
  const canvasWidth = hud.panelDisplayWidth;

  const masterWidth = canvasWidth - paddingX * 2;
  const masterHeight = 54;
  const masterX = paddingX;
  const masterY = layout.currentY;
  const allVisible =
    activeChannel.totalTracks > 0 && activeChannel.visibleTracks === activeChannel.totalTracks;
  const someVisible =
    activeChannel.totalTracks > 0 &&
    activeChannel.visibleTracks > 0 &&
    activeChannel.visibleTracks < activeChannel.totalTracks;

  drawRoundedRect(ctx, masterX, masterY, masterWidth, masterHeight, 16);
  ctx.fillStyle = activeChannel.totalTracks === 0 ? 'rgba(45, 60, 74, 0.6)' : '#1f2735';
  ctx.fill();
  if (
    hud.hoverRegion &&
    hud.hoverRegion.targetType === 'tracks-master-toggle' &&
    hud.hoverRegion.channelId === activeChannel.id
  ) {
    ctx.save();
    drawRoundedRect(ctx, masterX, masterY, masterWidth, masterHeight, 16);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.fill();
    ctx.restore();
  }

  const boxSize = 36;
  const boxX = masterX + 18;
  const boxY = masterY + (masterHeight - boxSize) / 2;
  drawRoundedRect(ctx, boxX, boxY, boxSize, boxSize, 10);
  ctx.fillStyle = allVisible ? '#2b5fa6' : '#2a313c';
  if (activeChannel.totalTracks === 0) {
    ctx.fillStyle = 'rgba(53, 64, 78, 0.8)';
  }
  ctx.fill();

  if (allVisible || someVisible) {
    ctx.strokeStyle = '#f3f6fc';
    ctx.lineWidth = 4;
    if (someVisible && !allVisible) {
      ctx.beginPath();
      ctx.moveTo(boxX + 8, boxY + boxSize / 2);
      ctx.lineTo(boxX + boxSize - 8, boxY + boxSize / 2);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(boxX + 9, boxY + boxSize / 2);
      ctx.lineTo(boxX + boxSize / 2 - 2, boxY + boxSize - 9);
      ctx.lineTo(boxX + boxSize - 9, boxY + 9);
      ctx.stroke();
    }
  }

  ctx.fillStyle = activeChannel.totalTracks === 0 ? '#7b8795' : '#dce3f1';
  ctx.font = vrTracksFont('600', VR_TRACKS_FONT_SIZES.body);
  ctx.fillText('Show all tracks', boxX + boxSize + 18, masterY + (masterHeight - 32) / 2);

  regions.push({
    targetType: 'tracks-master-toggle',
    channelId: activeChannel.id,
    disabled: activeChannel.totalTracks === 0,
    bounds: {
      minX: toPanelX(masterX),
      maxX: toPanelX(masterX + masterWidth),
      minY: Math.min(toPanelY(masterY), toPanelY(masterY + masterHeight)),
      maxY: Math.max(toPanelY(masterY), toPanelY(masterY + masterHeight)),
    },
  });

  return layout.currentY + masterHeight + 32;
}
