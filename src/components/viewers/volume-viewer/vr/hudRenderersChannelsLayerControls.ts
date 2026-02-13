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

  const sliderColumnWidth = (canvasWidth - paddingX * 2 - 32) / 2;
  const sliderColumnSpacing = 32;

  const windowMinSlider = sliderByKey.get('windowMin');
  const windowMaxSlider = sliderByKey.get('windowMax');
  if (windowMinSlider && windowMaxSlider) {
    const rowTop = layout.currentY;
    const minBottom = drawSliderControl({
      hud,
      ctx,
      activeChannel,
      selectedLayer,
      regions,
      layout,
      slider: windowMinSlider,
      x: paddingX,
      width: sliderColumnWidth,
      y: rowTop,
    });
    const maxBottom = drawSliderControl({
      hud,
      ctx,
      activeChannel,
      selectedLayer,
      regions,
      layout,
      slider: windowMaxSlider,
      x: paddingX + sliderColumnWidth + sliderColumnSpacing,
      width: sliderColumnWidth,
      y: rowTop,
    });
    layout.currentY = Math.max(minBottom, maxBottom) + 64;
  }

  const brightnessSlider = sliderByKey.get('brightness');
  const contrastSlider = sliderByKey.get('contrast');
  if (brightnessSlider && contrastSlider) {
    const rowTop = layout.currentY;
    const brightnessBottom = drawSliderControl({
      hud,
      ctx,
      activeChannel,
      selectedLayer,
      regions,
      layout,
      slider: brightnessSlider,
      x: paddingX,
      width: sliderColumnWidth,
      y: rowTop,
    });
    const contrastBottom = drawSliderControl({
      hud,
      ctx,
      activeChannel,
      selectedLayer,
      regions,
      layout,
      slider: contrastSlider,
      x: paddingX + sliderColumnWidth + sliderColumnSpacing,
      width: sliderColumnWidth,
      y: rowTop,
    });
    layout.currentY = Math.max(brightnessBottom, contrastBottom) + 64;
  }

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
