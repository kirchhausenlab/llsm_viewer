import {
  VR_CHANNELS_FONT_SIZES,
  VR_CHANNELS_HISTOGRAM_HEIGHT,
  VR_CHANNELS_HISTOGRAM_RADIUS,
  vrChannelsFont,
} from './constants';
import type {
  VrChannelsHud,
  VrChannelsInteractiveRegion,
} from './types';
import {
  DEFAULT_LAYER_COLOR,
  GRAYSCALE_COLOR_SWATCHES,
  normalizeHexColor,
} from '../../../../shared/colorMaps/layerColors';
import {
  RENDER_STYLE_BL,
  RENDER_STYLE_ISO,
  RENDER_STYLE_MIP,
  DEFAULT_WINDOW_MIN,
  DEFAULT_WINDOW_MAX,
} from '../../../../state/layerSettings';
import { drawRoundedRect, drawRoundedRectCompat } from './hudCanvas';
import {
  computeHistogramMappingPoints,
  computeHistogramShape,
} from './hudMath';
import type {
  ActiveChannel,
  ActiveLayer,
  ChannelsLayout,
} from './hudRenderersChannelsShared';

export function drawLayerToggleButtons(params: {
  hud: VrChannelsHud;
  ctx: CanvasRenderingContext2D;
  activeChannel: ActiveChannel;
  selectedLayer: ActiveLayer;
  regions: VrChannelsInteractiveRegion[];
  layout: ChannelsLayout;
}): number {
  const { hud, ctx, activeChannel, selectedLayer, regions, layout } = params;
  const { toPanelX, toPanelY, paddingX } = layout;
  const canvasWidth = hud.panelDisplayWidth;
  const currentY = layout.currentY;

  const actionButtonHeight = 60;
  const actionButtonRadius = 16;
  const actionSpacing = 24;
  const availableRowWidth = canvasWidth - paddingX * 2;
  const maxActionButtonWidth = 280;
  const renderSamplingWidth = Math.max(
    0,
    Math.min(maxActionButtonWidth, (availableRowWidth - actionSpacing) / 2),
  );

  const renderStyleDisabled = !selectedLayer.hasData;
  const samplingDisabled = renderStyleDisabled;
  const renderStyleActive = selectedLayer.settings.renderStyle !== RENDER_STYLE_MIP;
  const samplingActive = selectedLayer.settings.samplingMode === 'nearest';
  const renderStyleLabel =
    selectedLayer.settings.renderStyle === RENDER_STYLE_ISO
      ? 'ISO'
      : selectedLayer.settings.renderStyle === RENDER_STYLE_BL
        ? 'BL'
        : 'MIP';

  const renderX = paddingX;
  const samplingX = renderX + renderSamplingWidth + actionSpacing;

  drawRoundedRect(ctx, renderX, currentY, renderSamplingWidth, actionButtonHeight, actionButtonRadius);
  ctx.fillStyle = renderStyleDisabled ? 'rgba(45, 60, 74, 0.6)' : renderStyleActive ? '#2b5fa6' : '#2b3340';
  ctx.fill();

  if (
    hud.hoverRegion &&
    hud.hoverRegion.targetType === 'channels-render-style' &&
    hud.hoverRegion.channelId === activeChannel.id &&
    hud.hoverRegion.layerKey === selectedLayer.key
  ) {
    ctx.save();
    drawRoundedRect(ctx, renderX, currentY, renderSamplingWidth, actionButtonHeight, actionButtonRadius);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.fill();
    ctx.restore();
  }

  drawRoundedRect(ctx, samplingX, currentY, renderSamplingWidth, actionButtonHeight, actionButtonRadius);
  ctx.fillStyle = samplingDisabled ? 'rgba(45, 60, 74, 0.6)' : samplingActive ? '#2b5fa6' : '#2b3340';
  ctx.fill();

  if (
    hud.hoverRegion &&
    hud.hoverRegion.targetType === 'channels-sampling' &&
    hud.hoverRegion.channelId === activeChannel.id &&
    hud.hoverRegion.layerKey === selectedLayer.key
  ) {
    ctx.save();
    drawRoundedRect(ctx, samplingX, currentY, renderSamplingWidth, actionButtonHeight, actionButtonRadius);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.fill();
    ctx.restore();
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = vrChannelsFont('600', VR_CHANNELS_FONT_SIZES.small);
  ctx.fillStyle = renderStyleDisabled ? '#7b8795' : '#f3f6fc';
  ctx.fillText(`Render: ${renderStyleLabel}`, renderX + renderSamplingWidth / 2, currentY + actionButtonHeight / 2);
  ctx.fillStyle = samplingDisabled ? '#7b8795' : '#f3f6fc';
  ctx.fillText('Sampling mode', samplingX + renderSamplingWidth / 2, currentY + actionButtonHeight / 2);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  regions.push({
    targetType: 'channels-render-style',
    channelId: activeChannel.id,
    layerKey: selectedLayer.key,
    disabled: renderStyleDisabled,
    bounds: {
      minX: toPanelX(renderX),
      maxX: toPanelX(renderX + renderSamplingWidth),
      minY: Math.min(toPanelY(currentY), toPanelY(currentY + actionButtonHeight)),
      maxY: Math.max(toPanelY(currentY), toPanelY(currentY + actionButtonHeight)),
    },
  });

  regions.push({
    targetType: 'channels-sampling',
    channelId: activeChannel.id,
    layerKey: selectedLayer.key,
    disabled: samplingDisabled,
    bounds: {
      minX: toPanelX(samplingX),
      maxX: toPanelX(samplingX + renderSamplingWidth),
      minY: Math.min(toPanelY(currentY), toPanelY(currentY + actionButtonHeight)),
      maxY: Math.max(toPanelY(currentY), toPanelY(currentY + actionButtonHeight)),
    },
  });

  return currentY + actionButtonHeight + 32;
}

export function drawLayerHistogram(params: {
  ctx: CanvasRenderingContext2D;
  selectedLayer: ActiveLayer;
  layout: ChannelsLayout;
  canvasWidth: number;
}): number {
  const { ctx, selectedLayer, layout, canvasWidth } = params;
  const histogramWidth = canvasWidth - layout.paddingX * 2;
  const histogramHeight = VR_CHANNELS_HISTOGRAM_HEIGHT;
  const histogramX = layout.paddingX;
  const histogramY = layout.currentY;
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

  return histogramY + histogramHeight + 48;
}

export function drawResetRows(params: {
  hud: VrChannelsHud;
  ctx: CanvasRenderingContext2D;
  activeChannel: ActiveChannel;
  selectedLayer: ActiveLayer;
  regions: VrChannelsInteractiveRegion[];
  layout: ChannelsLayout;
  availableRowWidth: number;
}): number {
  const { hud, ctx, activeChannel, selectedLayer, regions, layout, availableRowWidth } = params;
  const { toPanelX, toPanelY, paddingX } = layout;

  const actionButtonHeight = 60;
  const actionButtonRadius = 16;
  const actionSpacing = 24;
  const maxActionButtonWidth = 280;
  const tripleButtonSpacing = actionSpacing;
  const tripleButtonWidth = Math.max(
    0,
    Math.min(maxActionButtonWidth, (availableRowWidth - tripleButtonSpacing * 2) / 3),
  );

  const resetDisabled = false;
  const invertDisabled = !selectedLayer.hasData || selectedLayer.isSegmentation;
  const autoContrastDisabled = !selectedLayer.hasData;
  const invertActive = selectedLayer.settings.invert;

  const resetRowY = layout.currentY;
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

  regions.push({
    targetType: 'channels-reset',
    channelId: activeChannel.id,
    disabled: resetDisabled,
    bounds: {
      minX: toPanelX(resetX),
      maxX: toPanelX(resetX + tripleButtonWidth),
      minY: Math.min(toPanelY(resetRowY), toPanelY(resetRowY + actionButtonHeight)),
      maxY: Math.max(toPanelY(resetRowY), toPanelY(resetRowY + actionButtonHeight)),
    },
  });

  regions.push({
    targetType: 'channels-invert',
    channelId: activeChannel.id,
    layerKey: selectedLayer.key,
    disabled: invertDisabled,
    bounds: {
      minX: toPanelX(invertX),
      maxX: toPanelX(invertX + tripleButtonWidth),
      minY: Math.min(toPanelY(resetRowY), toPanelY(resetRowY + actionButtonHeight)),
      maxY: Math.max(toPanelY(resetRowY), toPanelY(resetRowY + actionButtonHeight)),
    },
  });

  regions.push({
    targetType: 'channels-auto-contrast',
    channelId: activeChannel.id,
    layerKey: selectedLayer.key,
    disabled: autoContrastDisabled,
    bounds: {
      minX: toPanelX(autoX),
      maxX: toPanelX(autoX + tripleButtonWidth),
      minY: Math.min(toPanelY(resetRowY), toPanelY(resetRowY + actionButtonHeight)),
      maxY: Math.max(toPanelY(resetRowY), toPanelY(resetRowY + actionButtonHeight)),
    },
  });

  return resetRowY + actionButtonHeight + 48;
}

export function drawGrayscaleColorSwatches(params: {
  hud: VrChannelsHud;
  ctx: CanvasRenderingContext2D;
  activeChannel: ActiveChannel;
  selectedLayer: ActiveLayer;
  regions: VrChannelsInteractiveRegion[];
  layout: ChannelsLayout;
}): number {
  const { hud, ctx, activeChannel, selectedLayer, regions, layout } = params;
  const { toPanelX, toPanelY, paddingX } = layout;

  ctx.fillStyle = '#9fb2c8';
  ctx.font = vrChannelsFont('500', VR_CHANNELS_FONT_SIZES.body);
  ctx.fillText('Tint color', paddingX, layout.currentY);
  ctx.fillStyle = '#dce3f1';
  const displayColor = normalizeHexColor(selectedLayer.settings.color, DEFAULT_LAYER_COLOR).toUpperCase();
  ctx.font = vrChannelsFont('600', VR_CHANNELS_FONT_SIZES.value);
  ctx.fillText(displayColor, paddingX + 240, layout.currentY);
  ctx.font = vrChannelsFont('500', VR_CHANNELS_FONT_SIZES.body);

  let currentY = layout.currentY + 42;
  const swatchSize = 54;
  const swatchSpacing = 20;
  let swatchX = paddingX;
  const swatchY = currentY;

  for (const swatch of GRAYSCALE_COLOR_SWATCHES) {
    const normalized = normalizeHexColor(swatch.value, DEFAULT_LAYER_COLOR);
    const isSelected = normalized === normalizeHexColor(selectedLayer.settings.color, DEFAULT_LAYER_COLOR);
    drawRoundedRectCompat(ctx, swatchX, swatchY, swatchSize, swatchSize, 14);
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
      drawRoundedRectCompat(ctx, swatchX, swatchY, swatchSize, swatchSize, 14);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
      ctx.fill();
      ctx.restore();
    }

    regions.push({
      targetType: 'channels-color',
      channelId: activeChannel.id,
      layerKey: selectedLayer.key,
      color: normalized,
      disabled: !selectedLayer.hasData,
      bounds: {
        minX: toPanelX(swatchX),
        maxX: toPanelX(swatchX + swatchSize),
        minY: Math.min(toPanelY(swatchY), toPanelY(swatchY + swatchSize)),
        maxY: Math.max(toPanelY(swatchY), toPanelY(swatchY + swatchSize)),
      },
    });

    swatchX += swatchSize + swatchSpacing;
  }

  currentY += swatchSize + 30;
  return currentY;
}
