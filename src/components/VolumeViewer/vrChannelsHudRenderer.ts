import { PlaneGeometry, Vector3 } from 'three';

import { DEFAULT_LAYER_COLOR, GRAYSCALE_COLOR_SWATCHES, normalizeHexColor } from '../layerColors';
import type { VrChannelsHud, VrChannelsInteractiveRegion, VrChannelsState } from './types';
import { computeHistogramMappingPoints, computeHistogramShape, drawRoundedRect, formatNormalizedIntensity } from './utils';

export const VR_CHANNELS_PANEL_WIDTH = 0.6;
export const VR_CHANNELS_PANEL_HEIGHT = 0.6;
export const VR_CHANNELS_VERTICAL_OFFSET = 0;
export const VR_CHANNELS_CAMERA_ANCHOR_OFFSET = new Vector3(0.4, -0.18, -0.65);
export const VR_CHANNELS_CANVAS_WIDTH = 1184;
export const VR_CHANNELS_CANVAS_MIN_HEIGHT = 1184;
export const VR_CHANNELS_HISTOGRAM_HEIGHT = 160;
export const VR_CHANNELS_HISTOGRAM_RADIUS = 18;
export const VR_CHANNELS_FONT_FAMILY = '"Inter", "Helvetica Neue", Arial, sans-serif';
export const VR_CHANNELS_FONT_SIZES = {
  heading: 52,
  emptyState: 32,
  tab: 32,
  body: 34,
  label: 32,
  value: 34,
  small: 28
} as const;

export function vrChannelsFont(weight: string, size: number) {
  return `${weight} ${size}px ${VR_CHANNELS_FONT_FAMILY}`;
}

export type VrChannelsHudRenderOptions = {
  onResize?: (hud: VrChannelsHud, displayHeight: number) => void;
};

export function resizeVrChannelsHud(hud: VrChannelsHud, displayHeight: number, translateHandleOffset: number, yawHandleOffset: number) {
    if (!hud.panelCanvas) {
      return;
    }

    const pixelRatio = hud.pixelRatio || 1;
    hud.panelDisplayHeight = displayHeight;
    hud.panelCanvas.width = Math.round(hud.panelDisplayWidth * pixelRatio);
    hud.panelCanvas.height = Math.round(displayHeight * pixelRatio);

    const newPanelHeight = (hud.width / hud.panelDisplayWidth) * displayHeight;
    hud.height = newPanelHeight;

    const panelGeometry = new PlaneGeometry(hud.width, newPanelHeight);
    hud.panel.geometry.dispose();
    hud.panel.geometry = panelGeometry;

    const backgroundGeometry = new PlaneGeometry(hud.width, newPanelHeight);
    hud.background.geometry.dispose();
    hud.background.geometry = backgroundGeometry;

    const halfHeight = newPanelHeight / 2;
    hud.panelTranslateHandle.position.setY(halfHeight + translateHandleOffset);
    hud.panelPitchHandle.position.setY(-(halfHeight + yawHandleOffset));
    hud.panelTranslateHandle.updateMatrixWorld();
    hud.panelPitchHandle.updateMatrixWorld();

    hud.cacheDirty = true;
}

export function renderVrChannelsHud(hud: VrChannelsHud, state: VrChannelsState, options: VrChannelsHudRenderOptions = {}) {
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
      if (options.onResize && Math.abs(desiredDisplayHeight - hud.panelDisplayHeight) > 1) {
        options.onResize(hud, desiredDisplayHeight);
        renderVrChannelsHud(hud, state, options);
        return;
      }

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
      ctx.fillStyle = isActive ? '#2b5fa6' : '#1d2734';
      ctx.fill();
      if (hud.hoverRegion && hud.hoverRegion.targetType === 'channels-tab' && hud.hoverRegion.channelId === channel.id) {
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
      const labelMetrics = ctx.measureText(channel.name);
      const labelWidth = Math.min(labelMetrics.width + 20, tabWidth - 24);
      const labelHeight = VR_CHANNELS_FONT_SIZES.tab * 1.25;
      const labelCenterX = x + tabWidth / 2;
      const labelCenterY = y + tabHeight / 2;
      const labelMinX = labelCenterX - labelWidth / 2;
      const labelMaxX = labelCenterX + labelWidth / 2;
      const labelMinY = labelCenterY - labelHeight / 2;
      const labelMaxY = labelCenterY + labelHeight / 2;
      const isLabelHover =
        hud.hoverRegion &&
        hud.hoverRegion.targetType === 'channels-visibility' &&
        hud.hoverRegion.channelId === channel.id;

      ctx.fillStyle = channel.visible ? '#f3f6fc' : 'rgba(243, 246, 252, 0.6)';
      if (isLabelHover) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
      }
      ctx.fillText(channel.name, labelCenterX, labelCenterY);
      ctx.restore();

      if (!channel.visible) {
        ctx.save();
        ctx.strokeStyle = 'rgba(243, 246, 252, 0.7)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(labelMinX, labelCenterY);
        ctx.lineTo(labelMaxX, labelCenterY);
        ctx.stroke();
        ctx.restore();
      }

      const labelBounds = {
        minX: toPanelX(labelMinX),
        maxX: toPanelX(labelMaxX),
        minY: Math.min(toPanelY(labelMinY), toPanelY(labelMaxY)),
        maxY: Math.max(toPanelY(labelMinY), toPanelY(labelMaxY))
      };
      regions.push({ targetType: 'channels-visibility', channelId: channel.id, bounds: labelBounds });

      const rectBounds = {
        minX: toPanelX(x),
        maxX: toPanelX(x + tabWidth),
        minY: Math.min(toPanelY(y), toPanelY(y + tabHeight)),
        maxY: Math.max(toPanelY(y), toPanelY(y + tabHeight))
      };
      regions.push({ targetType: 'channels-tab', channelId: channel.id, bounds: rectBounds });
    }

    const totalTabHeight = totalRows * tabHeight + Math.max(0, totalRows - 1) * tabSpacingY;
    currentY += totalTabHeight + 36;

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
        Math.min(maxActionButtonWidth, (availableRowWidth - actionSpacing) / 2)
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
        maxY: Math.max(toPanelY(renderRowY), toPanelY(renderRowY + actionButtonHeight))
      };
      regions.push({
        targetType: 'channels-render-style',
        channelId: activeChannel.id,
        layerKey: selectedLayer.key,
        bounds: renderBounds,
        disabled: renderStyleDisabled
      });

      const samplingBounds = {
        minX: toPanelX(samplingX),
        maxX: toPanelX(samplingX + renderSamplingWidth),
        minY: Math.min(toPanelY(renderRowY), toPanelY(renderRowY + actionButtonHeight)),
        maxY: Math.max(toPanelY(renderRowY), toPanelY(renderRowY + actionButtonHeight))
      };
      regions.push({
        targetType: 'channels-sampling',
        channelId: activeChannel.id,
        layerKey: selectedLayer.key,
        bounds: samplingBounds,
        disabled: samplingDisabled
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
        histogramHeight
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
        drawRoundedRect(
          ctx,
          histogramX,
          histogramY,
          histogramWidth,
          histogramHeight,
          VR_CHANNELS_HISTOGRAM_RADIUS
        );
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
          histogramHeight
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
          disabled: !selectedLayer.hasData
        },
        {
          key: 'windowMax',
          label: 'Maximum',
          value: selectedLayer.settings.windowMax,
          min: DEFAULT_WINDOW_MIN,
          max: DEFAULT_WINDOW_MAX,
          step: 0.001,
          formatter: (value: number) => formatNormalizedIntensity(value),
          disabled: !selectedLayer.hasData
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
          disabled: !selectedLayer.hasData
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
          disabled: !selectedLayer.hasData
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
          axis: 'x'
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
          axis: 'y'
        }
      ];

      const sliderByKey = new Map(sliderDefs.map((entry) => [entry.key, entry]));

      const drawSliderControl = (
        slider: VrChannelsSliderDefinition,
        x: number,
        width: number,
        top: number
      ): number => {
        ctx.font = vrChannelsFont('500', VR_CHANNELS_FONT_SIZES.body);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillStyle = '#9fb2c8';
        ctx.fillText(slider.label, x, top);
        const valueLabel = slider.formatter(slider.value);
        ctx.textAlign = 'right';
        ctx.fillStyle = '#dce3f1';
        ctx.font = vrChannelsFont('600', VR_CHANNELS_FONT_SIZES.value);
        ctx.fillText(valueLabel, x + width, top);
        ctx.textAlign = 'left';
        ctx.font = vrChannelsFont('500', VR_CHANNELS_FONT_SIZES.body);
        ctx.fillStyle = '#9fb2c8';

        const sliderY = top + 36;
        const sliderHeight = 26;
        const sliderRadius = 14;
        drawRoundedRect(ctx, x, sliderY, width, sliderHeight, sliderRadius);
        ctx.fillStyle = slider.disabled ? 'rgba(45, 60, 74, 0.6)' : '#1f2733';
        ctx.fill();

        const rangeSpan = slider.max - slider.min;
        const knobFraction = rangeSpan <= 1e-5 ? 0 : (slider.value - slider.min) / rangeSpan;
        const clampedFraction = Math.min(Math.max(knobFraction, 0), 1);
        const knobX = x + clampedFraction * width;
        const knobY = sliderY + sliderHeight / 2;
        ctx.beginPath();
        ctx.arc(knobX, knobY, 18, 0, Math.PI * 2);
        ctx.fillStyle = slider.disabled ? '#45515f' : '#f3f6fc';
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = slider.disabled ? 'rgba(0, 0, 0, 0.45)' : 'rgba(0, 0, 0, 0.3)';
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(knobX, knobY, 10, 0, Math.PI * 2);
        ctx.fillStyle = slider.disabled ? '#2a313c' : '#2b5fa6';
        ctx.fill();

        if (
          hud.hoverRegion &&
          hud.hoverRegion.targetType === 'channels-slider' &&
          hud.hoverRegion.sliderKey === slider.key
        ) {
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
          maxY: Math.max(toPanelY(sliderY - 10), toPanelY(sliderY + sliderHeight + 10))
        };
        regions.push({
          targetType: 'channels-slider',
          channelId: activeChannel.id,
          layerKey: selectedLayer.key,
          sliderKey: slider.key,
          min: slider.min,
          max: slider.max,
          step: slider.step,
          axis: slider.axis,
          bounds: sliderBounds,
          sliderTrack: {
            minX: toPanelX(x),
            maxX: toPanelX(x + width),
            y: toPanelY(sliderY + sliderHeight / 2)
          },
          disabled: slider.disabled
        });

        return sliderY + sliderHeight;
      };

      const sliderColumnSpacing = 24;
      const sliderColumnWidth = Math.max(
        0,
        (availableRowWidth - sliderColumnSpacing) / 2
      );

      const minSlider = sliderByKey.get('windowMin');
      const maxSlider = sliderByKey.get('windowMax');
      if (minSlider && maxSlider) {
        const rowTop = currentY;
        const minBottom = drawSliderControl(minSlider, paddingX, sliderColumnWidth, rowTop);
        const maxBottom = drawSliderControl(
          maxSlider,
          paddingX + sliderColumnWidth + sliderColumnSpacing,
          sliderColumnWidth,
          rowTop
        );
        currentY = Math.max(minBottom, maxBottom) + 64;
      }

      const brightnessSlider = sliderByKey.get('brightness');
      const contrastSlider = sliderByKey.get('contrast');
      if (brightnessSlider && contrastSlider) {
        const rowTop = currentY;
        const brightnessBottom = drawSliderControl(
          brightnessSlider,
          paddingX,
          sliderColumnWidth,
          rowTop
        );
        const contrastBottom = drawSliderControl(
          contrastSlider,
          paddingX + sliderColumnWidth + sliderColumnSpacing,
          sliderColumnWidth,
          rowTop
        );
        currentY = Math.max(brightnessBottom, contrastBottom) + 64;
      }

      const tripleButtonSpacing = actionSpacing;
      const tripleButtonWidth = Math.max(
        0,
        Math.min(maxActionButtonWidth, (availableRowWidth - tripleButtonSpacing * 2) / 3)
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
        maxY: Math.max(toPanelY(resetRowY), toPanelY(resetRowY + actionButtonHeight))
      };
      regions.push({
        targetType: 'channels-reset',
        channelId: activeChannel.id,
        bounds: resetBounds,
        disabled: resetDisabled
      });

      const invertBounds = {
        minX: toPanelX(invertX),
        maxX: toPanelX(invertX + tripleButtonWidth),
        minY: Math.min(toPanelY(resetRowY), toPanelY(resetRowY + actionButtonHeight)),
        maxY: Math.max(toPanelY(resetRowY), toPanelY(resetRowY + actionButtonHeight))
      };
      regions.push({
        targetType: 'channels-invert',
        channelId: activeChannel.id,
        layerKey: selectedLayer.key,
        bounds: invertBounds,
        disabled: invertDisabled
      });

      const autoContrastBounds = {
        minX: toPanelX(autoX),
        maxX: toPanelX(autoX + tripleButtonWidth),
        minY: Math.min(toPanelY(resetRowY), toPanelY(resetRowY + actionButtonHeight)),
        maxY: Math.max(toPanelY(resetRowY), toPanelY(resetRowY + actionButtonHeight))
      };
      regions.push({
        targetType: 'channels-auto-contrast',
        channelId: activeChannel.id,
        layerKey: selectedLayer.key,
        bounds: autoContrastBounds,
        disabled: autoContrastDisabled
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
          ctx.roundRect?.(swatchX, swatchY, swatchSize, swatchSize, 14);
          if (!ctx.roundRect) {
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
            maxY: Math.max(toPanelY(swatchY), toPanelY(swatchY + swatchSize))
          };
          regions.push({
            targetType: 'channels-color',
            channelId: activeChannel.id,
            layerKey: selectedLayer.key,
            bounds: colorBounds,
            color: normalized,
            disabled: !selectedLayer.hasData
          });

          swatchX += swatchSize + swatchSpacing;
        }
        currentY += swatchSize + 30;
      }
    }

    ctx.fillStyle = '#9fb2c8';
    ctx.font = vrChannelsFont('500', VR_CHANNELS_FONT_SIZES.label);
    ctx.fillText('Layers', paddingX, currentY);
    currentY += 40;

    const layerButtonHeight = 60;
    const layerButtonWidth = canvasWidth - paddingX * 2;
    ctx.font = vrChannelsFont('600', VR_CHANNELS_FONT_SIZES.label);

    for (const layer of activeChannel.layers) {
      const isSelected = layer.key === (activeChannel.activeLayerKey ?? layer.key);
      const x = paddingX;
      const y = currentY;
      drawRoundedRect(ctx, x, y, layerButtonWidth, layerButtonHeight, 16);
      ctx.fillStyle = isSelected ? '#2b5fa6' : '#1f2735';
      ctx.fill();
      if (hud.hoverRegion && hud.hoverRegion.targetType === 'channels-layer' && hud.hoverRegion.layerKey === layer.key) {
        ctx.save();
        drawRoundedRect(ctx, x, y, layerButtonWidth, layerButtonHeight, 16);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
        ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = '#f3f6fc';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(layer.label, x + 24, y + layerButtonHeight / 2);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';

      const layerBounds = {
        minX: toPanelX(x),
        maxX: toPanelX(x + layerButtonWidth),
        minY: Math.min(toPanelY(y), toPanelY(y + layerButtonHeight)),
        maxY: Math.max(toPanelY(y), toPanelY(y + layerButtonHeight))
      };
      regions.push({
        targetType: 'channels-layer',
        channelId: activeChannel.id,
        layerKey: layer.key,
        bounds: layerBounds,
        disabled: false
      });

      currentY += layerButtonHeight + 18;
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
    if (options.onResize && Math.abs(desiredDisplayHeight - hud.panelDisplayHeight) > 1) {
      options.onResize(hud, desiredDisplayHeight);
      renderVrChannelsHud(hud, state, options);
      return;
    }

    hud.panelTexture.needsUpdate = true;
