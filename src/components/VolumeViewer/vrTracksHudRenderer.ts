import { Vector3 } from 'three';

import { normalizeTrackColor, TRACK_COLOR_SWATCHES } from '../../trackColors';
import type {
  VrTracksHud,
  VrTracksInteractiveRegion,
  VrTracksSliderKey,
  VrTracksState
} from './types';
import { drawRoundedRect } from './utils';

export const VR_TRACKS_PANEL_WIDTH = 0.58;
export const VR_TRACKS_PANEL_HEIGHT = 0.64;
export const VR_TRACKS_VERTICAL_OFFSET = -0.12;
export const VR_TRACKS_CAMERA_ANCHOR_OFFSET = new Vector3(0.7, -0.22, -0.7);
export const VR_TRACKS_CANVAS_WIDTH = 1180;
export const VR_TRACKS_CANVAS_HEIGHT = 1320;
export const VR_TRACKS_FONT_FAMILY = '"Inter", "Helvetica Neue", Arial, sans-serif';
export const VR_TRACKS_FONT_SIZES = {
  heading: 52,
  emptyState: 32,
  tab: 32,
  body: 32,
  label: 30,
  value: 32,
  button: 30,
  track: 30,
  small: 26
} as const;

export function vrTracksFont(weight: string, size: number) {
  return `${weight} ${size}px ${VR_TRACKS_FONT_FAMILY}`;
}

export function renderVrTracksHud(hud: VrTracksHud, state: VrTracksState) {
  if (!hud.panelCanvas || !hud.panelContext) {
    hud.regions = [];
    return;
  }
  const ctx = hud.panelContext;
  const canvasWidth = hud.panelDisplayWidth;
  const canvasHeight = hud.panelDisplayHeight;
  const targetPixelRatio =
    typeof window !== 'undefined' ? Math.min(2, window.devicePixelRatio || 1) : hud.pixelRatio;
  if (targetPixelRatio && Math.abs(targetPixelRatio - hud.pixelRatio) > 0.01 && hud.panelCanvas) {
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

  const toPanelX = (x: number) => (x / canvasWidth - 0.5) * hud.width;
  const toPanelY = (y: number) => (0.5 - y / canvasHeight) * hud.height;
  const regions: VrTracksInteractiveRegion[] = [];

  const paddingX = 72;
  const paddingTop = 48;

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

  let currentY = paddingTop + 84;

  const channels = state.channels ?? [];
  if (channels.length === 0) {
    ctx.fillStyle = '#9fb2c8';
    ctx.font = vrTracksFont('500', VR_TRACKS_FONT_SIZES.emptyState);
    ctx.fillText('Add a channel to manage tracks.', paddingX, currentY + 20);
    hud.regions = [];
    hud.hoverRegion = null;
    ctx.restore();
    hud.panelTexture.needsUpdate = true;
    return;
  }

  let activeChannelId = state.activeChannelId;
  if (!activeChannelId || !channels.some((channel) => channel.id === activeChannelId)) {
    activeChannelId = channels[0].id;
    state.activeChannelId = activeChannelId;
  }
  const activeChannel = channels.find((channel) => channel.id === activeChannelId) ?? channels[0];

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
    Math.min(maxTabWidth, (tabAreaWidth - (columns - 1) * tabSpacingX) / columns)
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
    const y = currentY + rowIndex * (tabHeight + tabSpacingY);
    const isActive = channel.id === activeChannelId;
    const hasTracks = channel.totalTracks > 0;

    drawRoundedRect(ctx, x, y, tabWidth, tabHeight, 20);
    ctx.fillStyle = hasTracks ? (isActive ? '#2b5fa6' : '#1d2734') : '#1a202b';
    ctx.fill();
    if (hud.hoverRegion && hud.hoverRegion.targetType === 'tracks-tab' && hud.hoverRegion.channelId === channel.id) {
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

    const rectBounds = {
      minX: toPanelX(x),
      maxX: toPanelX(x + tabWidth),
      minY: Math.min(toPanelY(y), toPanelY(y + tabHeight)),
      maxY: Math.max(toPanelY(y), toPanelY(y + tabHeight))
    };
    regions.push({
      targetType: 'tracks-tab',
      channelId: channel.id,
      bounds: rectBounds,
      disabled: !hasTracks
    });
  }

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const totalTabHeight = totalRows * tabHeight + Math.max(0, totalRows - 1) * tabSpacingY;
  currentY += totalTabHeight + 36;

  ctx.fillStyle = '#9fb2c8';
  ctx.font = vrTracksFont('500', VR_TRACKS_FONT_SIZES.body);
  ctx.fillText(
    `Visible ${Math.min(activeChannel.visibleTracks, activeChannel.totalTracks)} / ${activeChannel.totalTracks} tracks`,
    paddingX,
    currentY
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

  const stopBounds = {
    minX: toPanelX(stopX),
    maxX: toPanelX(stopX + stopWidth),
    minY: Math.min(toPanelY(stopY), toPanelY(stopY + stopHeight)),
    maxY: Math.max(toPanelY(stopY), toPanelY(stopY + stopHeight))
  };
  regions.push({
    targetType: 'tracks-stop-follow',
    channelId: activeChannel.id,
    bounds: stopBounds,
    disabled: stopDisabled
  });

  currentY += stopHeight + 32;

  const drawTrackSlider = (
    label: string,
    valueLabel: string,
    sliderKey: VrTracksSliderKey,
    value: number,
    min: number,
    max: number,
    step: number
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

    const sliderBounds = {
      minX: toPanelX(sliderX),
      maxX: toPanelX(sliderX + sliderWidth),
      minY: Math.min(toPanelY(sliderY - 10), toPanelY(sliderY + sliderHeight + 10)),
      maxY: Math.max(toPanelY(sliderY - 10), toPanelY(sliderY + sliderHeight + 10))
    };
    regions.push({
      targetType: 'tracks-slider',
      channelId: activeChannel.id,
      sliderKey,
      min,
      max,
      step,
      bounds: sliderBounds,
      sliderTrack: {
        minX: toPanelX(sliderX + 12),
        maxX: toPanelX(sliderX + sliderWidth - 12),
        y: toPanelY(sliderY + sliderHeight / 2)
      },
      disabled
    });

    currentY += sliderHeight + 48;
  };

  const opacityPercent = Math.round(activeChannel.opacity * 100);
  drawTrackSlider('Track opacity', `${opacityPercent}%`, 'opacity', activeChannel.opacity, 0, 1, 0.01);
  drawTrackSlider(
    'Line width',
    `${activeChannel.lineWidth.toFixed(2)} px`,
    'lineWidth',
    activeChannel.lineWidth,
    0.1,
    10,
    0.01
  );

  const colorModes: Array<{ mode: 'track' | 'channel'; label: string } | null> = [
    { mode: 'track', label: 'Track colors' },
    { mode: 'channel', label: 'Channel color' }
  ];
  const colorModeSpacing = 18;
  const colorModeWidth = Math.min(320, (canvasWidth - paddingX * 2 - colorModeSpacing) / colorModes.length);
  const colorModeHeight = 60;
  ctx.font = vrTracksFont('600', VR_TRACKS_FONT_SIZES.button);

  for (let index = 0; index < colorModes.length; index += 1) {
    const entry = colorModes[index];
    if (!entry) {
      continue;
    }
    const modeX = paddingX + index * (colorModeWidth + colorModeSpacing);
    const modeY = currentY;
    const isActive = activeChannel.colorMode === entry.mode;
    const disabled = activeChannel.totalTracks === 0;
    drawRoundedRect(ctx, modeX, modeY, colorModeWidth, colorModeHeight, 16);
    ctx.fillStyle = disabled ? 'rgba(45, 60, 74, 0.6)' : isActive ? '#2b5fa6' : '#2b3340';
    ctx.fill();

    const isHovered =
      hud.hoverRegion &&
      hud.hoverRegion.targetType === 'tracks-color-mode' &&
      hud.hoverRegion.channelId === activeChannel.id &&
      hud.hoverRegion.color === entry.mode;
    if (isHovered) {
      ctx.save();
      drawRoundedRect(ctx, modeX, modeY, colorModeWidth, colorModeHeight, 16);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
      ctx.fill();
      ctx.restore();
    }

    ctx.fillStyle = disabled ? '#7b8795' : '#f3f6fc';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(entry.label, modeX + colorModeWidth / 2, modeY + colorModeHeight / 2);

    const modeBounds = {
      minX: toPanelX(modeX),
      maxX: toPanelX(modeX + colorModeWidth),
      minY: Math.min(toPanelY(modeY), toPanelY(modeY + colorModeHeight)),
      maxY: Math.max(toPanelY(modeY), toPanelY(modeY + colorModeHeight))
    };
    regions.push({
      targetType: 'tracks-color-mode',
      channelId: activeChannel.id,
      bounds: modeBounds,
      color: entry.mode,
      disabled: disabled || activeChannel.totalTracks === 0
    });
  }

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  currentY += colorModeHeight + 36;

  const swatches = TRACK_COLOR_SWATCHES;
  const swatchSize = 64;
  const swatchSpacing = 18;
  const swatchesPerRow = Math.max(1, Math.floor((canvasWidth - paddingX * 2 + swatchSpacing) / (swatchSize + swatchSpacing)));
  const swatchRows = Math.ceil(swatches.length / swatchesPerRow);
  const swatchAreaHeight = swatchRows * (swatchSize + swatchSpacing) - swatchSpacing;
  ctx.font = vrTracksFont('500', VR_TRACKS_FONT_SIZES.label);
  ctx.fillStyle = '#9fb2c8';
  ctx.fillText('Track colors', paddingX, currentY);
  currentY += 38;

  let swatchX = paddingX;
  let swatchY = currentY;

  for (let index = 0; index < swatches.length; index += 1) {
    const color = swatches[index];
    if (!color) {
      continue;
    }
    const normalized = normalizeTrackColor(color);
    drawRoundedRect(ctx, swatchX, swatchY, swatchSize, swatchSize, 14);
    ctx.fillStyle = normalized;
    ctx.fill();

    if (
      hud.hoverRegion &&
      hud.hoverRegion.targetType === 'tracks-color' &&
      hud.hoverRegion.channelId === activeChannel.id &&
      hud.hoverRegion.color === normalized
    ) {
      ctx.save();
      drawRoundedRect(ctx, swatchX, swatchY, swatchSize, swatchSize, 14);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
      ctx.fill();
      ctx.restore();
    }

    const colorBounds = {
      minX: toPanelX(swatchX),
      maxX: toPanelX(swatchX + swatchSize),
      minY: Math.min(toPanelY(swatchY), toPanelY(swatchY + swatchSize)),
      maxY: Math.max(toPanelY(swatchY), toPanelY(swatchY + swatchSize))
    };
    regions.push({
      targetType: 'tracks-color',
      channelId: activeChannel.id,
      bounds: colorBounds,
      color: normalized,
      disabled: activeChannel.totalTracks === 0
    });

    swatchX += swatchSize + swatchSpacing;
    if (swatchX + swatchSize > paddingX + canvasWidth - paddingX) {
      swatchX = paddingX;
      swatchY += swatchSize + swatchSpacing;
    }
  }

  currentY += swatchAreaHeight + 36;

  const masterWidth = canvasWidth - paddingX * 2;
  const masterHeight = 54;
  const masterX = paddingX;
  const masterY = currentY;
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

  const masterBounds = {
    minX: toPanelX(masterX),
    maxX: toPanelX(masterX + masterWidth),
    minY: Math.min(toPanelY(masterY), toPanelY(masterY + masterHeight)),
    maxY: Math.max(toPanelY(masterY), toPanelY(masterY + masterHeight))
  };
  regions.push({
    targetType: 'tracks-master-toggle',
    channelId: activeChannel.id,
    bounds: masterBounds,
    disabled: activeChannel.totalTracks === 0
  });

  currentY += masterHeight + 32;

  if (activeChannel.totalTracks === 0) {
    ctx.fillStyle = '#9fb2c8';
    ctx.font = vrTracksFont('500', VR_TRACKS_FONT_SIZES.emptyState);
    ctx.fillText('Load a tracks file to toggle individual trajectories.', paddingX, currentY + 12);
  } else {
    const listTop = currentY;
    const listPaddingBottom = 64;
    const availableHeight = Math.max(canvasHeight - listPaddingBottom - listTop, 120);
    const rowHeight = 68;
    const totalTracks = activeChannel.tracks.length;
    const visibleRows = Math.max(1, Math.floor(availableHeight / rowHeight));
    const maxScrollIndex = Math.max(totalTracks - visibleRows, 0);
    const clampedScrollOffset = Math.min(Math.max(activeChannel.scrollOffset ?? 0, 0), 1);
    const startIndex = Math.min(
      Math.floor(clampedScrollOffset * maxScrollIndex + 1e-6),
      maxScrollIndex
    );
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
      const toggleBoxY = rowY + (rowHeight - toggleBoxSize) / 2 - 4;
      drawRoundedRect(ctx, toggleBoxX, toggleBoxY, toggleBoxSize, toggleBoxSize, 10);
      ctx.fillStyle = track.visible ? '#2b5fa6' : '#2a313c';
      ctx.fill();
      ctx.strokeStyle = '#0d1620';
      ctx.lineWidth = 2;
      ctx.stroke();
      if (track.visible) {
        ctx.beginPath();
        ctx.moveTo(toggleBoxX + 9, toggleBoxY + toggleBoxSize / 2);
        ctx.lineTo(toggleBoxX + toggleBoxSize / 2 - 2, toggleBoxY + toggleBoxSize - 9);
        ctx.lineTo(toggleBoxX + toggleBoxSize - 9, toggleBoxY + 9);
        ctx.strokeStyle = '#f3f6fc';
        ctx.lineWidth = 4;
        ctx.stroke();
      }

      ctx.fillStyle = '#f3f6fc';
      ctx.font = vrTracksFont('600', VR_TRACKS_FONT_SIZES.track);
      ctx.fillText(`Track ${track.trackNumber}`, paddingX + 80, rowY + 8);
      ctx.font = vrTracksFont('500', VR_TRACKS_FONT_SIZES.small);
      ctx.fillStyle = '#9fb2c8';
      ctx.fillText(track.label, paddingX + 80, rowY + 42);

      const colorSwatchSize = 38;
      const colorSwatchX = paddingX + trackContentWidth - colorSwatchSize - 18;
      const colorSwatchY = rowY + (rowHeight - colorSwatchSize) / 2 - 4;
      drawRoundedRect(ctx, colorSwatchX, colorSwatchY, colorSwatchSize, colorSwatchSize, 10);
      ctx.fillStyle = normalizeTrackColor(track.color);
      ctx.fill();
      ctx.strokeStyle = '#0d1620';
      ctx.lineWidth = 2;
      ctx.stroke();

      if (
        hud.hoverRegion &&
        hud.hoverRegion.targetType === 'tracks-follow' &&
        hud.hoverRegion.channelId === activeChannel.id &&
        hud.hoverRegion.trackId === track.id
      ) {
        ctx.save();
        drawRoundedRect(ctx, colorSwatchX, colorSwatchY, colorSwatchSize, colorSwatchSize, 10);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
        ctx.fill();
        ctx.restore();
      }

      const followWidth = 180;
      const followHeight = 50;
      const followX = colorSwatchX - followWidth - 18;
      const followY = rowY + (rowHeight - followHeight) / 2 - 4;
      drawRoundedRect(ctx, followX, followY, followWidth, followHeight, 14);
      const isFollowed = track.isFollowed;
      ctx.fillStyle = isFollowed ? '#2b5fa6' : '#2b3340';
      ctx.fill();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = vrTracksFont('600', VR_TRACKS_FONT_SIZES.button);
      ctx.fillStyle = '#f3f6fc';
      ctx.fillText(isFollowed ? 'Following' : 'Follow', followX + followWidth / 2, followY + followHeight / 2);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';

      const toggleBounds = {
        minX: toPanelX(toggleBoxX),
        maxX: toPanelX(toggleBoxX + toggleBoxSize),
        minY: Math.min(toPanelY(toggleBoxY), toPanelY(toggleBoxY + toggleBoxSize)),
        maxY: Math.max(toPanelY(toggleBoxY), toPanelY(toggleBoxY + toggleBoxSize))
      };
      regions.push({
        targetType: 'tracks-toggle',
        channelId: activeChannel.id,
        trackId: track.id,
        bounds: toggleBounds
      });

      const followBounds = {
        minX: toPanelX(followX),
        maxX: toPanelX(followX + followWidth),
        minY: Math.min(toPanelY(followY), toPanelY(followY + followHeight)),
        maxY: Math.max(toPanelY(followY), toPanelY(followY + followHeight))
      };
      regions.push({
        targetType: 'tracks-follow',
        channelId: activeChannel.id,
        trackId: track.id,
        bounds: followBounds
      });

      const rowBounds = {
        minX: toPanelX(paddingX),
        maxX: toPanelX(paddingX + trackContentWidth),
        minY: Math.min(toPanelY(rowY), toPanelY(rowY + rowHeight - 8)),
        maxY: Math.max(toPanelY(rowY), toPanelY(rowY + rowHeight - 8))
      };
      regions.push({
        targetType: 'tracks-row',
        channelId: activeChannel.id,
        trackId: track.id,
        bounds: rowBounds
      });
    }

    if (needsScroll && rowsToRender > 0) {
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
      const scrollBounds = {
        minX: toPanelX(scrollTrackX),
        maxX: toPanelX(scrollTrackX + scrollBarWidth),
        minY: Math.min(toPanelY(scrollTrackTop), toPanelY(scrollTrackTop + scrollTrackHeight)),
        maxY: Math.max(toPanelY(scrollTrackTop), toPanelY(scrollTrackTop + scrollTrackHeight))
      };
      regions.push({
        targetType: 'tracks-scroll',
        channelId: activeChannel.id,
        bounds: scrollBounds,
        verticalSliderTrack: {
          x: toPanelX(scrollTrackX + scrollBarWidth / 2),
          minY: sliderMin,
          maxY: sliderMax,
          inverted: sliderTopPanel > sliderBottomPanel,
          visibleRows,
          totalRows: totalTracks
        }
      });
    }
  }

  if (hud.hoverRegion) {
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

  hud.regions = regions;
  ctx.restore();
  hud.panelTexture.needsUpdate = true;
}
