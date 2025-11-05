import {
  VR_CHANNELS_CANVAS_MIN_HEIGHT,
  VR_CHANNELS_FONT_SIZES,
  VR_CHANNELS_HISTOGRAM_HEIGHT,
  VR_CHANNELS_HISTOGRAM_RADIUS,
  VR_TRACKS_FONT_SIZES,
  vrChannelsFont,
  vrTracksFont,
} from './constants';
import type {
  VrChannelsHud,
  VrChannelsInteractiveRegion,
  VrChannelsSliderDefinition,
  VrChannelsState,
  VrTracksHud,
  VrTracksInteractiveRegion,
  VrTracksSliderKey,
  VrTracksState,
} from './types';
import {
  DEFAULT_TRACK_COLOR,
  normalizeTrackColor,
  TRACK_COLOR_SWATCHES,
} from '../../../trackColors';
import {
  DEFAULT_LAYER_COLOR,
  GRAYSCALE_COLOR_SWATCHES,
  normalizeHexColor,
} from '../../../layerColors';
import {
  brightnessContrastModel,
  computeContrastMultiplier,
  formatContrastMultiplier,
  DEFAULT_WINDOW_MIN,
  DEFAULT_WINDOW_MAX,
} from '../../../state/layerSettings';
import { HISTOGRAM_FIRST_VALID_BIN } from '../../../autoContrast';

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

const formatNormalizedIntensity = (value: number): string => {
  const fixed = value.toFixed(3);
  return fixed.replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '');
};

const clamp = (value: number, min: number, max: number): number => {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
};

const computeHistogramShape = (
  histogram: Uint32Array | null,
  width: number,
  height: number,
): { points: Array<{ x: number; y: number }>; isEmpty: boolean } => {
  if (!histogram || histogram.length === 0) {
    return { points: [], isEmpty: true };
  }

  let maxCount = 0;
  for (let i = HISTOGRAM_FIRST_VALID_BIN; i < histogram.length; i += 1) {
    const value = histogram[i];
    if (value > maxCount) {
      maxCount = value;
    }
  }

  if (maxCount === 0) {
    return { points: [], isEmpty: true };
  }

  const bins = histogram.length;
  const span = bins > 1 ? bins - 1 : bins;
  const step = span > 0 ? width / span : width;
  const points: Array<{ x: number; y: number }> = [];

  for (let i = HISTOGRAM_FIRST_VALID_BIN; i < bins; i += 1) {
    const count = histogram[i];
    const normalized = count / maxCount;
    const x = step * i;
    const y = height - normalized * height;
    points.push({ x, y });
  }

  return { points, isEmpty: false };
};

const computeHistogramMappingPoints = (
  windowMin: number,
  windowMax: number,
  defaultMin: number,
  defaultMax: number,
  width: number,
  height: number,
): Array<{ x: number; y: number }> => {
  const defaultRange = defaultMax - defaultMin;
  const windowWidth = windowMax - windowMin;

  if (!(defaultRange > 0) || !(windowWidth > 0)) {
    return [];
  }

  const lowerFraction = (windowMin - defaultMin) / defaultRange;
  const upperFraction = (windowMax - defaultMin) / defaultRange;
  const fractions: number[] = [0, 1];

  if (lowerFraction > 0 && lowerFraction < 1) {
    fractions.push(lowerFraction);
  }

  if (upperFraction > 0 && upperFraction < 1) {
    fractions.push(upperFraction);
  }

  fractions.sort((a, b) => a - b);

  const uniqueFractions: number[] = [];
  for (const fraction of fractions) {
    if (
      uniqueFractions.length === 0 ||
      Math.abs(fraction - uniqueFractions[uniqueFractions.length - 1]) > 1e-6
    ) {
      uniqueFractions.push(fraction);
    }
  }

  const points: Array<{ x: number; y: number }> = [];
  for (const fraction of uniqueFractions) {
    const clampedFraction = clamp(fraction, 0, 1);
    const x = clampedFraction * width;
    const value = defaultMin + clampedFraction * defaultRange;
    const normalized = clamp((value - windowMin) / windowWidth, 0, 1);
    const y = (1 - normalized) * height;
    points.push({ x, y });
  }

  return points;
};
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
    Math.min(maxTabWidth, (tabAreaWidth - (columns - 1) * tabSpacingX) / columns),
  );
  const tabHeight = 82;
  const totalRows = Math.ceil(channels.length / columns);
  const tabLabelPaddingX = 12;
  const tabLabelPaddingY = 12;

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

    const rectBounds = {
      minX: toPanelX(x),
      maxX: toPanelX(x + tabWidth),
      minY: Math.min(toPanelY(y), toPanelY(y + tabHeight)),
      maxY: Math.max(toPanelY(y), toPanelY(y + tabHeight)),
    };
    regions.push({ targetType: 'tracks-tab', channelId: channel.id, bounds: rectBounds });
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

  const stopBounds = {
    minX: toPanelX(stopX),
    maxX: toPanelX(stopX + stopWidth),
    minY: Math.min(toPanelY(stopY), toPanelY(stopY + stopHeight)),
    maxY: Math.max(toPanelY(stopY), toPanelY(stopY + stopHeight)),
  };
  regions.push({
    targetType: 'tracks-stop-follow',
    channelId: activeChannel.id,
    bounds: stopBounds,
    disabled: stopDisabled,
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

    const sliderBounds = {
      minX: toPanelX(sliderX),
      maxX: toPanelX(sliderX + sliderWidth),
      minY: Math.min(toPanelY(sliderY - 10), toPanelY(sliderY + sliderHeight + 10)),
      maxY: Math.max(toPanelY(sliderY - 10), toPanelY(sliderY + sliderHeight + 10)),
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
        minX: toPanelX(sliderX),
        maxX: toPanelX(sliderX + sliderWidth),
        y: toPanelY(sliderY + sliderHeight / 2),
      },
      disabled,
    });

    currentY += sliderHeight + 56;
  };
  drawTrackSlider('Opacity', `${Math.round(activeChannel.opacity * 100)}%`, 'opacity', activeChannel.opacity, 0, 1, 0.05);
  drawTrackSlider(
    'Thickness',
    `${activeChannel.lineWidth.toFixed(1)}`,
    'lineWidth',
    activeChannel.lineWidth,
    0.5,
    5,
    0.1,
  );

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
    if ((ctx as any).roundRect) {
      (ctx as any).roundRect(swatchX, swatchY, swatchSize, swatchSize, 14);
    } else {
      drawRoundedRect(ctx, swatchX, swatchY, swatchSize, swatchSize, 14);
    }
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
      if ((ctx as any).roundRect) {
        (ctx as any).roundRect(swatchX, swatchY, swatchSize, swatchSize, 14);
      } else {
        drawRoundedRect(ctx, swatchX, swatchY, swatchSize, swatchSize, 14);
      }
      ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
      ctx.fill();
      ctx.restore();
    }
    const colorBounds = {
      minX: toPanelX(swatchX),
      maxX: toPanelX(swatchX + swatchSize),
      minY: Math.min(toPanelY(swatchY), toPanelY(swatchY + swatchSize)),
      maxY: Math.max(toPanelY(swatchY), toPanelY(swatchY + swatchSize)),
    };
    regions.push({
      targetType: 'tracks-color',
      channelId: activeChannel.id,
      color: normalized,
      bounds: colorBounds,
      disabled: activeChannel.totalTracks === 0,
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

  const modeBounds = {
    minX: toPanelX(modeX),
    maxX: toPanelX(modeX + modeWidth),
    minY: Math.min(toPanelY(modeY), toPanelY(modeY + modeHeight)),
    maxY: Math.max(toPanelY(modeY), toPanelY(modeY + modeHeight)),
  };
  regions.push({
    targetType: 'tracks-color-mode',
    channelId: activeChannel.id,
    bounds: modeBounds,
    disabled: activeChannel.totalTracks === 0,
  });

  currentY += swatchSize + 36;

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
    maxY: Math.max(toPanelY(masterY), toPanelY(masterY + masterHeight)),
  };
  regions.push({
    targetType: 'tracks-master-toggle',
    channelId: activeChannel.id,
    bounds: masterBounds,
    disabled: activeChannel.totalTracks === 0,
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
      maxScrollIndex,
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
      const toggleBounds = {
        minX: toPanelX(toggleBoxX),
        maxX: toPanelX(toggleBoxX + toggleBoxSize),
        minY: Math.min(toPanelY(toggleBoxY), toPanelY(toggleBoxY + toggleBoxSize)),
        maxY: Math.max(toPanelY(toggleBoxY), toPanelY(toggleBoxY + toggleBoxSize)),
      };
      regions.push({
        targetType: 'tracks-toggle',
        channelId: activeChannel.id,
        trackId: track.id,
        bounds: toggleBounds,
        disabled: false,
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

      const followBounds = {
        minX: toPanelX(followX),
        maxX: toPanelX(followX + followWidth),
        minY: Math.min(toPanelY(followY), toPanelY(followY + followHeight)),
        maxY: Math.max(toPanelY(followY), toPanelY(followY + followHeight)),
      };
      regions.push({
        targetType: 'tracks-follow',
        channelId: activeChannel.id,
        trackId: track.id,
        bounds: followBounds,
        disabled: false,
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
        maxY: Math.max(toPanelY(scrollTrackTop), toPanelY(scrollTrackTop + scrollTrackHeight)),
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
          totalRows: totalTracks,
        },
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
export function renderVrChannelsHud(hud: VrChannelsHud, state: VrChannelsState): number | null {
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

  const toPanelX = (x: number) => (x / canvasWidth - 0.5) * hud.width;
  const toPanelY = (y: number) => (0.5 - y / canvasHeight) * hud.height;
  const regions: VrChannelsInteractiveRegion[] = [];

  const paddingX = 68;
  const paddingTop = 48;

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

  let currentY = paddingTop + 84;

  const channels = state.channels ?? [];
  if (channels.length === 0) {
    ctx.fillStyle = '#9fb2c8';
    ctx.font = vrChannelsFont('500', VR_CHANNELS_FONT_SIZES.emptyState);
    ctx.fillText('Load a volume to configure channel properties.', paddingX, currentY + 20);
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
    Math.min(maxTabWidth, (tabAreaWidth - (columns - 1) * tabSpacingX) / columns),
  );
  const tabHeight = 82;
  const totalRows = Math.ceil(channels.length / columns);

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
    const y = currentY + rowIndex * (tabHeight + tabSpacingY);
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

    const rectBounds = {
      minX: toPanelX(x),
      maxX: toPanelX(x + tabWidth),
      minY: Math.min(toPanelY(y), toPanelY(y + tabHeight)),
      maxY: Math.max(toPanelY(y), toPanelY(y + tabHeight)),
    };
    regions.push({ targetType: 'channels-tab', channelId: channel.id, bounds: rectBounds });

    const labelBounds = {
      minX: toPanelX(x + tabLabelPaddingX),
      maxX: toPanelX(x + tabWidth - tabLabelPaddingX),
      minY: Math.min(toPanelY(y + tabLabelPaddingY), toPanelY(y + tabHeight - tabLabelPaddingY)),
      maxY: Math.max(toPanelY(y + tabLabelPaddingY), toPanelY(y + tabHeight - tabLabelPaddingY)),
    };
    regions.push({
      targetType: 'channels-tab-toggle',
      channelId: channel.id,
      bounds: labelBounds,
    });
  }

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const totalTabHeight = totalRows * tabHeight + Math.max(0, totalRows - 1) * tabSpacingY;
  currentY += totalTabHeight + 48;

  ctx.fillStyle = '#9fb2c8';
  ctx.font = vrChannelsFont('500', VR_CHANNELS_FONT_SIZES.body);
  ctx.fillText('Active layer', paddingX, currentY);
  currentY += 40;

  const layers = activeChannel.layers;
  if (layers.length === 0) {
    ctx.fillStyle = '#9fb2c8';
    ctx.font = vrChannelsFont('500', VR_CHANNELS_FONT_SIZES.emptyState);
    ctx.fillText('No layers available for this channel.', paddingX, currentY);
    currentY += 64;
  }

  const selectedLayer =
    activeChannel.layers.find((layer) => layer.key === activeChannel.activeLayerKey) ??
    activeChannel.layers[0] ??
    null;

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  if (selectedLayer) {
    const renderStyleDisabled = !selectedLayer.hasData;
    const invertDisabled = !selectedLayer.hasData || selectedLayer.isSegmentation;
    const renderStyleActive = selectedLayer.settings.renderStyle === 1;
    const samplingDisabled = renderStyleDisabled;
    const samplingActive = selectedLayer.settings.samplingMode === 'nearest';
    const invertActive = selectedLayer.settings.invert;
    const autoContrastDisabled = !selectedLayer.hasData;
    const resetDisabled = activeChannel.layers.length === 0;
    const actionButtonHeight = 60;
    const actionButtonRadius = 16;
    const actionSpacing = 24;
    const availableRowWidth = canvasWidth - paddingX * 2;
    const maxActionButtonWidth = 280;
    const renderSamplingWidth = Math.max(
      0,
      Math.min(maxActionButtonWidth, (availableRowWidth - actionSpacing) / 2),
    );
    const renderRowY = currentY;
    const renderX = paddingX;
    const samplingX = renderX + renderSamplingWidth + actionSpacing;

    drawRoundedRect(ctx, renderX, renderRowY, renderSamplingWidth, actionButtonHeight, actionButtonRadius);
    ctx.fillStyle = renderStyleDisabled ? 'rgba(45, 60, 74, 0.6)' : renderStyleActive ? '#2b5fa6' : '#2b3340';
    ctx.fill();
    if (
      hud.hoverRegion &&
      hud.hoverRegion.targetType === 'channels-render-style' &&
      hud.hoverRegion.channelId === activeChannel.id &&
      hud.hoverRegion.layerKey === selectedLayer.key
    ) {
      ctx.save();
      drawRoundedRect(ctx, renderX, renderRowY, renderSamplingWidth, actionButtonHeight, actionButtonRadius);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
      ctx.fill();
      ctx.restore();
    }

    drawRoundedRect(ctx, samplingX, renderRowY, renderSamplingWidth, actionButtonHeight, actionButtonRadius);
    ctx.fillStyle = samplingDisabled ? 'rgba(45, 60, 74, 0.6)' : samplingActive ? '#2b5fa6' : '#2b3340';
    ctx.fill();
    if (
      hud.hoverRegion &&
      hud.hoverRegion.targetType === 'channels-sampling' &&
      hud.hoverRegion.channelId === activeChannel.id &&
      hud.hoverRegion.layerKey === selectedLayer.key
    ) {
      ctx.save();
      drawRoundedRect(ctx, samplingX, renderRowY, renderSamplingWidth, actionButtonHeight, actionButtonRadius);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
      ctx.fill();
      ctx.restore();
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = vrChannelsFont('600', VR_CHANNELS_FONT_SIZES.small);
    ctx.fillStyle = renderStyleDisabled ? '#7b8795' : '#f3f6fc';
    ctx.fillText('Render style', renderX + renderSamplingWidth / 2, renderRowY + actionButtonHeight / 2);
    ctx.fillStyle = samplingDisabled ? '#7b8795' : '#f3f6fc';
    ctx.fillText('Sampling mode', samplingX + renderSamplingWidth / 2, renderRowY + actionButtonHeight / 2);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    const renderBounds = {
      minX: toPanelX(renderX),
      maxX: toPanelX(renderX + renderSamplingWidth),
      minY: Math.min(toPanelY(renderRowY), toPanelY(renderRowY + actionButtonHeight)),
      maxY: Math.max(toPanelY(renderRowY), toPanelY(renderRowY + actionButtonHeight)),
    };
    regions.push({
      targetType: 'channels-render-style',
      channelId: activeChannel.id,
      layerKey: selectedLayer.key,
      bounds: renderBounds,
      disabled: renderStyleDisabled,
    });

    const samplingBounds = {
      minX: toPanelX(samplingX),
      maxX: toPanelX(samplingX + renderSamplingWidth),
      minY: Math.min(toPanelY(renderRowY), toPanelY(renderRowY + actionButtonHeight)),
      maxY: Math.max(toPanelY(renderRowY), toPanelY(renderRowY + actionButtonHeight)),
    };
    regions.push({
      targetType: 'channels-sampling',
      channelId: activeChannel.id,
      layerKey: selectedLayer.key,
      bounds: samplingBounds,
      disabled: samplingDisabled,
    });

    const renderRowBottom = renderRowY + actionButtonHeight;
    currentY = renderRowBottom + 32;

    const histogramWidth = canvasWidth - paddingX * 2;
    const histogramHeight = VR_CHANNELS_HISTOGRAM_HEIGHT;
    const histogramX = paddingX;
    const histogramY = currentY;
    const histogramShape = computeHistogramShape(
      selectedLayer.histogram ?? null,
      histogramWidth,
      histogramHeight,
    );

    ctx.save();
    drawRoundedRect(ctx, histogramX, histogramY, histogramWidth, histogramHeight, VR_CHANNELS_HISTOGRAM_RADIUS);
    ctx.fillStyle = histogramShape.isEmpty ? 'rgba(17, 23, 34, 0.55)' : 'rgba(17, 23, 34, 0.85)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.stroke();
    ctx.restore();

    if (!histogramShape.isEmpty) {
      ctx.save();
      drawRoundedRect(ctx, histogramX, histogramY, histogramWidth, histogramHeight, VR_CHANNELS_HISTOGRAM_RADIUS);
      ctx.clip();
      ctx.beginPath();
      ctx.moveTo(histogramX, histogramY + histogramHeight);
      for (const point of histogramShape.points) {
        ctx.lineTo(histogramX + point.x, histogramY + point.y);
      }
      ctx.lineTo(histogramX + histogramWidth, histogramY + histogramHeight);
      ctx.closePath();
      ctx.fillStyle = 'rgba(91, 140, 255, 0.35)';
      ctx.strokeStyle = 'rgba(91, 140, 255, 0.9)';
      ctx.lineWidth = 2.4;
      ctx.fill();
      ctx.stroke();

      const mappingPoints = computeHistogramMappingPoints(
        selectedLayer.settings.windowMin,
        selectedLayer.settings.windowMax,
        DEFAULT_WINDOW_MIN,
        DEFAULT_WINDOW_MAX,
        histogramWidth,
        histogramHeight,
      );

      if (mappingPoints.length > 1) {
        ctx.beginPath();
        mappingPoints.forEach((point, index) => {
          const px = histogramX + point.x;
          const py = histogramY + point.y;
          if (index === 0) {
            ctx.moveTo(px, py);
          } else {
            ctx.lineTo(px, py);
          }
        });
        ctx.strokeStyle = '#f5f7ff';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
      }

      ctx.restore();
    }

    currentY += histogramHeight + 48;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    const sliderDefs: VrChannelsSliderDefinition[] = [
      {
        key: 'windowMin',
        label: 'Minimum',
        value: selectedLayer.settings.windowMin,
        min: DEFAULT_WINDOW_MIN,
        max: DEFAULT_WINDOW_MAX,
        step: 0.001,
        formatter: (value: number) => formatNormalizedIntensity(value),
        disabled: !selectedLayer.hasData,
      },
      {
        key: 'windowMax',
        label: 'Maximum',
        value: selectedLayer.settings.windowMax,
        min: DEFAULT_WINDOW_MIN,
        max: DEFAULT_WINDOW_MAX,
        step: 0.001,
        formatter: (value: number) => formatNormalizedIntensity(value),
        disabled: !selectedLayer.hasData,
      },
      {
        key: 'contrast',
        label: 'Contrast',
        value: selectedLayer.settings.contrastSliderIndex,
        min: 0,
        max: selectedLayer.settings.sliderRange,
        step: 1,
        formatter: (value: number) => {
          const preview = brightnessContrastModel.applyContrast(selectedLayer.settings, value);
          const multiplier = computeContrastMultiplier(preview.windowMin, preview.windowMax);
          return `${formatContrastMultiplier(multiplier)}×`;
        },
        disabled: !selectedLayer.hasData,
      },
      {
        key: 'brightness',
        label: 'Brightness',
        value: selectedLayer.settings.brightnessSliderIndex,
        min: 0,
        max: selectedLayer.settings.sliderRange,
        step: 1,
        formatter: (value: number) => {
          const preview = brightnessContrastModel.applyBrightness(selectedLayer.settings, value);
          const center = preview.windowMin + (preview.windowMax - preview.windowMin) / 2;
          return formatNormalizedIntensity(center);
        },
        disabled: !selectedLayer.hasData,
      },
      {
        key: 'xOffset',
        label: 'X shift',
        value: selectedLayer.settings.xOffset,
        min: -10,
        max: 10,
        step: 0.1,
        formatter: (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(2)} px`,
        disabled: !selectedLayer.hasData || activeChannel.id !== activeChannelId,
        axis: 'x',
      },
      {
        key: 'yOffset',
        label: 'Y shift',
        value: selectedLayer.settings.yOffset,
        min: -10,
        max: 10,
        step: 0.1,
        formatter: (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(2)} px`,
        disabled: !selectedLayer.hasData || activeChannel.id !== activeChannelId,
        axis: 'y',
      },
    ];
    const sliderColumnWidth = (canvasWidth - paddingX * 2 - 32) / 2;
    const sliderColumnSpacing = 32;
    const sliderByKey = new Map<VrChannelsSliderDefinition['key'], VrChannelsSliderDefinition>();
    for (const slider of sliderDefs) {
      sliderByKey.set(slider.key, slider);
    }

    const drawSliderControl = (
      slider: VrChannelsSliderDefinition,
      x: number,
      width: number,
      y: number,
    ) => {
      const sliderHeight = 28;
      const sliderRadius = 16;
      const knobRadius = 18;
      const disabled = slider.disabled;

      ctx.save();
      ctx.fillStyle = '#9fb2c8';
      ctx.font = vrChannelsFont('500', VR_CHANNELS_FONT_SIZES.label);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(slider.label, x, y);

      ctx.fillStyle = '#dce3f1';
      ctx.font = vrChannelsFont('600', VR_CHANNELS_FONT_SIZES.value);
      ctx.textAlign = 'right';
      ctx.fillText(slider.formatter(slider.value), x + width, y);
      ctx.restore();

      const sliderY = y + 38;
      drawRoundedRect(ctx, x, sliderY, width, sliderHeight, sliderRadius);
      ctx.fillStyle = disabled ? 'rgba(45, 60, 74, 0.6)' : '#1f2733';
      ctx.fill();

      const ratio = Math.min(Math.max((slider.value - slider.min) / Math.max(slider.max - slider.min, 1e-5), 0), 1);
      const knobX = x + ratio * width;
      const knobY = sliderY + sliderHeight / 2;
      ctx.beginPath();
      ctx.arc(knobX, knobY, knobRadius, 0, Math.PI * 2);
      ctx.fillStyle = disabled ? '#45515f' : '#f3f6fc';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = disabled ? 'rgba(0, 0, 0, 0.45)' : 'rgba(0, 0, 0, 0.3)';
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(knobX, knobY, knobRadius - 8, 0, Math.PI * 2);
      ctx.fillStyle = disabled ? '#2a313c' : '#2b5fa6';
      ctx.fill();

      const isHovered =
        hud.hoverRegion &&
        hud.hoverRegion.targetType === 'channels-slider' &&
        hud.hoverRegion.channelId === activeChannel.id &&
        hud.hoverRegion.layerKey === selectedLayer.key &&
        hud.hoverRegion.sliderKey === slider.key;
      if (isHovered) {
        ctx.save();
        drawRoundedRect(ctx, x, sliderY, width, sliderHeight, sliderRadius);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
        ctx.fill();
        ctx.restore();
      }

      const sliderBounds = {
        minX: toPanelX(x),
        maxX: toPanelX(x + width),
        minY: Math.min(toPanelY(sliderY - 10), toPanelY(sliderY + sliderHeight + 10)),
        maxY: Math.max(toPanelY(sliderY - 10), toPanelY(sliderY + sliderHeight + 10)),
      };
      regions.push({
        targetType: 'channels-slider',
        channelId: activeChannel.id,
        layerKey: selectedLayer.key,
        sliderKey: slider.key,
        bounds: sliderBounds,
        min: slider.min,
        max: slider.max,
        step: slider.step,
        disabled,
        sliderTrack: {
          minX: toPanelX(x),
          maxX: toPanelX(x + width),
          y: toPanelY(sliderY + sliderHeight / 2),
        },
        axis: slider.axis,
      });

      return sliderY + sliderHeight;
    };

    const windowMinSlider = sliderByKey.get('windowMin');
    const windowMaxSlider = sliderByKey.get('windowMax');
    if (windowMinSlider && windowMaxSlider) {
      const rowTop = currentY;
      const minBottom = drawSliderControl(windowMinSlider, paddingX, sliderColumnWidth, rowTop);
      const maxBottom = drawSliderControl(
        windowMaxSlider,
        paddingX + sliderColumnWidth + sliderColumnSpacing,
        sliderColumnWidth,
        rowTop,
      );
      currentY = Math.max(minBottom, maxBottom) + 64;
    }

    const brightnessSlider = sliderByKey.get('brightness');
    const contrastSlider = sliderByKey.get('contrast');
    if (brightnessSlider && contrastSlider) {
      const rowTop = currentY;
      const brightnessBottom = drawSliderControl(brightnessSlider, paddingX, sliderColumnWidth, rowTop);
      const contrastBottom = drawSliderControl(
        contrastSlider,
        paddingX + sliderColumnWidth + sliderColumnSpacing,
        sliderColumnWidth,
        rowTop,
      );
      currentY = Math.max(brightnessBottom, contrastBottom) + 64;
    }

    const tripleButtonSpacing = actionSpacing;
    const tripleButtonWidth = Math.max(
      0,
      Math.min(maxActionButtonWidth, (availableRowWidth - tripleButtonSpacing * 2) / 3),
    );
    const resetRowY = currentY;
    const resetX = paddingX;
    const invertX = resetX + tripleButtonWidth + tripleButtonSpacing;
    const autoX = invertX + tripleButtonWidth + tripleButtonSpacing;

    drawRoundedRect(ctx, resetX, resetRowY, tripleButtonWidth, actionButtonHeight, actionButtonRadius);
    ctx.fillStyle = resetDisabled ? 'rgba(45, 60, 74, 0.6)' : '#2b3340';
    ctx.fill();
    if (
      hud.hoverRegion &&
      hud.hoverRegion.targetType === 'channels-reset' &&
      hud.hoverRegion.channelId === activeChannel.id
    ) {
      ctx.save();
      drawRoundedRect(ctx, resetX, resetRowY, tripleButtonWidth, actionButtonHeight, actionButtonRadius);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
      ctx.fill();
      ctx.restore();
    }

    drawRoundedRect(ctx, invertX, resetRowY, tripleButtonWidth, actionButtonHeight, actionButtonRadius);
    ctx.fillStyle = invertDisabled ? 'rgba(45, 60, 74, 0.6)' : invertActive ? '#2b5fa6' : '#2b3340';
    ctx.fill();
    if (
      hud.hoverRegion &&
      hud.hoverRegion.targetType === 'channels-invert' &&
      hud.hoverRegion.channelId === activeChannel.id &&
      hud.hoverRegion.layerKey === selectedLayer.key
    ) {
      ctx.save();
      drawRoundedRect(ctx, invertX, resetRowY, tripleButtonWidth, actionButtonHeight, actionButtonRadius);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
      ctx.fill();
      ctx.restore();
    }

    drawRoundedRect(ctx, autoX, resetRowY, tripleButtonWidth, actionButtonHeight, actionButtonRadius);
    ctx.fillStyle = autoContrastDisabled ? 'rgba(45, 60, 74, 0.6)' : '#2b3340';
    ctx.fill();
    if (
      hud.hoverRegion &&
      hud.hoverRegion.targetType === 'channels-auto-contrast' &&
      hud.hoverRegion.channelId === activeChannel.id &&
      hud.hoverRegion.layerKey === selectedLayer.key
    ) {
      ctx.save();
      drawRoundedRect(ctx, autoX, resetRowY, tripleButtonWidth, actionButtonHeight, actionButtonRadius);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
      ctx.fill();
      ctx.restore();
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = vrChannelsFont('600', VR_CHANNELS_FONT_SIZES.small);
    ctx.fillStyle = resetDisabled ? '#7b8795' : '#f3f6fc';
    ctx.fillText('Reset', resetX + tripleButtonWidth / 2, resetRowY + actionButtonHeight / 2);
    ctx.fillStyle = invertDisabled ? '#7b8795' : '#f3f6fc';
    ctx.fillText('Invert', invertX + tripleButtonWidth / 2, resetRowY + actionButtonHeight / 2);
    ctx.fillStyle = autoContrastDisabled ? '#7b8795' : '#f3f6fc';
    ctx.fillText('Auto', autoX + tripleButtonWidth / 2, resetRowY + actionButtonHeight / 2);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    const resetBounds = {
      minX: toPanelX(resetX),
      maxX: toPanelX(resetX + tripleButtonWidth),
      minY: Math.min(toPanelY(resetRowY), toPanelY(resetRowY + actionButtonHeight)),
      maxY: Math.max(toPanelY(resetRowY), toPanelY(resetRowY + actionButtonHeight)),
    };
    regions.push({
      targetType: 'channels-reset',
      channelId: activeChannel.id,
      bounds: resetBounds,
      disabled: resetDisabled,
    });

    const invertBounds = {
      minX: toPanelX(invertX),
      maxX: toPanelX(invertX + tripleButtonWidth),
      minY: Math.min(toPanelY(resetRowY), toPanelY(resetRowY + actionButtonHeight)),
      maxY: Math.max(toPanelY(resetRowY), toPanelY(resetRowY + actionButtonHeight)),
    };
    regions.push({
      targetType: 'channels-invert',
      channelId: activeChannel.id,
      layerKey: selectedLayer.key,
      bounds: invertBounds,
      disabled: invertDisabled,
    });

    const autoContrastBounds = {
      minX: toPanelX(autoX),
      maxX: toPanelX(autoX + tripleButtonWidth),
      minY: Math.min(toPanelY(resetRowY), toPanelY(resetRowY + actionButtonHeight)),
      maxY: Math.max(toPanelY(resetRowY), toPanelY(resetRowY + actionButtonHeight)),
    };
    regions.push({
      targetType: 'channels-auto-contrast',
      channelId: activeChannel.id,
      layerKey: selectedLayer.key,
      bounds: autoContrastBounds,
      disabled: autoContrastDisabled,
    });

    const resetRowBottom = resetRowY + actionButtonHeight;
    currentY = resetRowBottom + 48;

    const xOffsetSlider = sliderByKey.get('xOffset');
    if (xOffsetSlider) {
      const sliderBottom = drawSliderControl(xOffsetSlider, paddingX, availableRowWidth, currentY);
      currentY = sliderBottom + 64;
    }

    const yOffsetSlider = sliderByKey.get('yOffset');
    if (yOffsetSlider) {
      const sliderBottom = drawSliderControl(yOffsetSlider, paddingX, availableRowWidth, currentY);
      currentY = sliderBottom + 64;
    }

    if (selectedLayer.isGrayscale) {
      ctx.fillStyle = '#9fb2c8';
      ctx.font = vrChannelsFont('500', VR_CHANNELS_FONT_SIZES.body);
      ctx.fillText('Tint color', paddingX, currentY);
      ctx.fillStyle = '#dce3f1';
      const displayColor = normalizeHexColor(selectedLayer.settings.color, DEFAULT_LAYER_COLOR).toUpperCase();
      ctx.font = vrChannelsFont('600', VR_CHANNELS_FONT_SIZES.value);
      ctx.fillText(displayColor, paddingX + 240, currentY);
      ctx.font = vrChannelsFont('500', VR_CHANNELS_FONT_SIZES.body);
      currentY += 42;

      const swatchSize = 54;
      const swatchSpacing = 20;
      let swatchX = paddingX;
      const swatchY = currentY;
      for (const swatch of GRAYSCALE_COLOR_SWATCHES) {
        const normalized = normalizeHexColor(swatch.value, DEFAULT_LAYER_COLOR);
        const isSelected = normalized === normalizeHexColor(selectedLayer.settings.color, DEFAULT_LAYER_COLOR);
        ctx.beginPath();
        const roundRect = (ctx as any).roundRect as
          | ((x: number, y: number, width: number, height: number, radius: number) => void)
          | undefined;
        if (typeof roundRect === 'function') {
          roundRect.call(ctx, swatchX, swatchY, swatchSize, swatchSize, 14);
        } else {
          drawRoundedRect(ctx, swatchX, swatchY, swatchSize, swatchSize, 14);
        }
        ctx.fillStyle = normalized;
        ctx.fill();
        ctx.strokeStyle = isSelected ? '#ffffff' : 'rgba(255, 255, 255, 0.45)';
        ctx.lineWidth = isSelected ? 4 : 2;
        ctx.stroke();

        if (
          hud.hoverRegion &&
          hud.hoverRegion.targetType === 'channels-color' &&
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
          maxY: Math.max(toPanelY(swatchY), toPanelY(swatchY + swatchSize)),
        };
        regions.push({
          targetType: 'channels-color',
          channelId: activeChannel.id,
          layerKey: selectedLayer.key,
          bounds: colorBounds,
          color: normalized,
          disabled: !selectedLayer.hasData,
        });

        swatchX += swatchSize + swatchSpacing;
      }
      currentY += swatchSize + 30;
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

  hud.regions = regions;

  const paddingBottom = 72;
  const contentBottom = Math.ceil(currentY + paddingBottom);
  ctx.restore();

  const desiredDisplayHeight = Math.max(VR_CHANNELS_CANVAS_MIN_HEIGHT, contentBottom);
  if (Math.abs(desiredDisplayHeight - hud.panelDisplayHeight) > 1) {
    return desiredDisplayHeight;
  }

  hud.panelTexture.needsUpdate = true;
  return null;
}
