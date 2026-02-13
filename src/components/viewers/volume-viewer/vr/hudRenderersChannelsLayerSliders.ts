import {
  VR_CHANNELS_FONT_SIZES,
  vrChannelsFont,
} from './constants';
import type {
  VrChannelsHud,
  VrChannelsInteractiveRegion,
  VrChannelsSliderDefinition,
} from './types';
import {
  brightnessContrastModel,
  computeContrastMultiplier,
  formatContrastMultiplier,
  DEFAULT_WINDOW_MIN,
  DEFAULT_WINDOW_MAX,
} from '../../../../state/layerSettings';
import { drawRoundedRect } from './hudCanvas';
import { formatNormalizedIntensity } from './hudMath';
import type {
  ActiveChannel,
  ActiveLayer,
  ChannelsLayout,
} from './hudRenderersChannelsShared';

export function buildChannelSliderDefinitions(
  activeChannel: ActiveChannel,
  selectedLayer: ActiveLayer
): VrChannelsSliderDefinition[] {
  return [
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
      disabled: !selectedLayer.hasData || activeChannel.id !== activeChannel.id,
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
      disabled: !selectedLayer.hasData || activeChannel.id !== activeChannel.id,
      axis: 'y',
    },
  ];
}

export function drawSliderControl(params: {
  hud: VrChannelsHud;
  ctx: CanvasRenderingContext2D;
  activeChannel: ActiveChannel;
  selectedLayer: ActiveLayer;
  regions: VrChannelsInteractiveRegion[];
  layout: ChannelsLayout;
  slider: VrChannelsSliderDefinition;
  x: number;
  width: number;
  y: number;
}): number {
  const { hud, ctx, activeChannel, selectedLayer, regions, layout, slider, x, width, y } = params;
  const { toPanelX, toPanelY } = layout;

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

  regions.push({
    targetType: 'channels-slider',
    channelId: activeChannel.id,
    layerKey: selectedLayer.key,
    sliderKey: slider.key,
    min: slider.min,
    max: slider.max,
    step: slider.step,
    disabled,
    axis: slider.axis,
    bounds: {
      minX: toPanelX(x),
      maxX: toPanelX(x + width),
      minY: Math.min(toPanelY(sliderY - 10), toPanelY(sliderY + sliderHeight + 10)),
      maxY: Math.max(toPanelY(sliderY - 10), toPanelY(sliderY + sliderHeight + 10)),
    },
    sliderTrack: {
      minX: toPanelX(x),
      maxX: toPanelX(x + width),
      y: toPanelY(sliderY + sliderHeight / 2),
    },
  });

  return sliderY + sliderHeight;
}
