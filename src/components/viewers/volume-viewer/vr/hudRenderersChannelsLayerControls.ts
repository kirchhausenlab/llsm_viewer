import type {
  VrChannelsHud,
  VrChannelsInteractiveRegion,
  VrChannelsSliderDefinition,
} from './types';
import type {
  ActiveChannel,
  ActiveLayer,
  ChannelsLayout,
} from './hudRenderersChannelsShared';
import {
  drawGrayscaleColorSwatches,
  drawLayerHistogram,
  drawLayerToggleButtons,
  drawResetRows,
} from './hudRenderersChannelsLayerSections';
import {
  buildChannelSliderDefinitions,
  drawSliderControl,
} from './hudRenderersChannelsLayerSliders';

export function renderLayerControls(params: {
  hud: VrChannelsHud;
  ctx: CanvasRenderingContext2D;
  activeChannel: ActiveChannel;
  selectedLayer: ActiveLayer;
  regions: VrChannelsInteractiveRegion[];
  layout: ChannelsLayout;
  canvasWidth: number;
}): number {
  const { hud, ctx, activeChannel, selectedLayer, regions, layout, canvasWidth } = params;
  const { paddingX } = layout;
  const sliderColumnWidth = (canvasWidth - paddingX * 2 - 32) / 2;
  const sliderColumnSpacing = 32;

  const drawPairedSliderRow = (
    leftKey: VrChannelsSliderDefinition['key'],
    rightKey: VrChannelsSliderDefinition['key'],
  ) => {
    const leftSlider = sliderByKey.get(leftKey);
    const rightSlider = sliderByKey.get(rightKey);
    if (!leftSlider || !rightSlider) {
      return;
    }

    const rowTop = layout.currentY;
    const leftBottom = drawSliderControl({
      hud,
      ctx,
      activeChannel,
      selectedLayer,
      regions,
      layout,
      slider: leftSlider,
      x: paddingX,
      width: sliderColumnWidth,
      y: rowTop,
    });
    const rightBottom = drawSliderControl({
      hud,
      ctx,
      activeChannel,
      selectedLayer,
      regions,
      layout,
      slider: rightSlider,
      x: paddingX + sliderColumnWidth + sliderColumnSpacing,
      width: sliderColumnWidth,
      y: rowTop,
    });
    layout.currentY = Math.max(leftBottom, rightBottom) + 64;
  };

  const drawFullWidthSlider = (key: VrChannelsSliderDefinition['key']) => {
    const slider = sliderByKey.get(key);
    if (!slider) {
      return;
    }

    const sliderBottom = drawSliderControl({
      hud,
      ctx,
      activeChannel,
      selectedLayer,
      regions,
      layout,
      slider,
      x: paddingX,
      width: canvasWidth - paddingX * 2,
      y: layout.currentY,
    });
    layout.currentY = sliderBottom + 64;
  };

  layout.currentY = drawLayerToggleButtons({
    hud,
    ctx,
    activeChannel,
    selectedLayer,
    regions,
    layout,
  });

  layout.currentY = drawLayerHistogram({
    ctx,
    selectedLayer,
    layout,
    canvasWidth,
  });

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  const sliderDefs = buildChannelSliderDefinitions(activeChannel, selectedLayer);
  const sliderByKey = new Map<VrChannelsSliderDefinition['key'], VrChannelsSliderDefinition>();
  for (const slider of sliderDefs) {
    sliderByKey.set(slider.key, slider);
  }
  drawPairedSliderRow('windowMin', 'windowMax');
  drawPairedSliderRow('brightness', 'contrast');

  const availableRowWidth = canvasWidth - paddingX * 2;
  layout.currentY = drawResetRows({
    hud,
    ctx,
    activeChannel,
    selectedLayer,
    regions,
    layout,
    availableRowWidth,
  });

  const xOffsetSlider = sliderByKey.get('xOffset');
  if (xOffsetSlider) {
    const sliderBottom = drawSliderControl({
      hud,
      ctx,
      activeChannel,
      selectedLayer,
      regions,
      layout,
      slider: xOffsetSlider,
      x: paddingX,
      width: availableRowWidth,
      y: layout.currentY,
    });
    layout.currentY = sliderBottom + 64;
  }

  const yOffsetSlider = sliderByKey.get('yOffset');
  if (yOffsetSlider) {
    const sliderBottom = drawSliderControl({
      hud,
      ctx,
      activeChannel,
      selectedLayer,
      regions,
      layout,
      slider: yOffsetSlider,
      x: paddingX,
      width: availableRowWidth,
      y: layout.currentY,
    });
    layout.currentY = sliderBottom + 64;
  }

  ctx.fillStyle = '#9fb2c8';
  ctx.font = '500 26px "Inter", "Segoe UI", sans-serif';
  ctx.fillText('Global MIP / BL', paddingX, layout.currentY);
  layout.currentY += 44;

  drawFullWidthSlider('mipEarlyExitThreshold');
  drawPairedSliderRow('blDensityScale', 'blBackgroundCutoff');
  drawPairedSliderRow('blOpacityScale', 'blEarlyExitAlpha');

  if (selectedLayer.isGrayscale) {
    layout.currentY = drawGrayscaleColorSwatches({
      hud,
      ctx,
      activeChannel,
      selectedLayer,
      regions,
      layout,
    });
  }

  return layout.currentY;
}
