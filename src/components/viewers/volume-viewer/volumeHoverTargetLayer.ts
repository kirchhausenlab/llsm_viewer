import type { ViewerLayer, VolumeResources } from '../VolumeViewer.types';

export type VolumeHoverLayerSelection = {
  hoverableLayers: ViewerLayer[];
  targetLayer: ViewerLayer | null;
  resource: VolumeResources | null;
};

export function resolveVolumeHoverLayerSelection(
  layers: ViewerLayer[],
  resources: Map<string, VolumeResources>,
): VolumeHoverLayerSelection {
  const hoverableLayers: ViewerLayer[] = [];
  let targetLayer: ViewerLayer | null = null;
  let resource: VolumeResources | null = null;
  let cpuFallbackLayer: ViewerLayer | null = null;

  for (const layer of layers) {
    if (layer.isHoverTarget === false) {
      continue;
    }
    const candidate = resources.get(layer.key) ?? null;
    const volume = layer.volume;
    const pageTable =
      layer.brickAtlas?.pageTable ?? layer.brickPageTable ?? candidate?.brickAtlasSourcePageTable ?? null;
    const hasVolumeSource = Boolean(volume);
    const hasAtlasSource = Boolean((layer.brickAtlas?.enabled ?? false) && pageTable);
    if (!layer.visible || (!hasVolumeSource && !hasAtlasSource)) {
      continue;
    }

    const resolvedDepth =
      volume?.depth ??
      pageTable?.volumeShape[0] ??
      candidate?.dimensions.depth ??
      layer.fullResolutionDepth ??
      0;
    const hasVolumeDepth = resolvedDepth > 1;
    const viewerMode =
      layer.mode === 'slice' || layer.mode === '3d'
        ? layer.mode
        : hasVolumeDepth
          ? '3d'
          : 'slice';

    const canSampleLayer = viewerMode === '3d' || hasVolumeDepth;
    if (!canSampleLayer) {
      continue;
    }

    hoverableLayers.push(layer);

    const isSliceResource = candidate?.mode === 'slice' && hasVolumeDepth;
    const has3dResource = candidate?.mode === '3d';

    if (has3dResource && (!resource || resource.mode !== '3d')) {
      targetLayer = layer;
      resource = candidate;
    } else if (isSliceResource && (!resource || resource.mode !== '3d') && !targetLayer) {
      targetLayer = layer;
      resource = candidate;
    } else if (!cpuFallbackLayer) {
      cpuFallbackLayer = layer;
    }
  }

  if (!targetLayer && cpuFallbackLayer) {
    targetLayer = cpuFallbackLayer;
  }

  return { hoverableLayers, targetLayer, resource };
}
