import type { NormalizedVolume } from '../../../core/volumeProcessing';
import type { VolumeBrickAtlas, VolumeBrickPageTable } from '../../../core/volumeProvider';
import type { VolumeResources, VolumeViewerProps } from '../VolumeViewer.types';

export type ManagedViewerLayer = VolumeViewerProps['layers'][number];

export type LayerRenderSource = {
  width: number;
  height: number;
  depth: number;
  dataWidth: number;
  dataHeight: number;
  dataDepth: number;
  channels: number;
  volume: NormalizedVolume | null;
  pageTable: VolumeBrickPageTable | null;
  brickAtlas: VolumeBrickAtlas | null;
};

export type SceneDimensions = {
  width: number;
  height: number;
  depth: number;
};

export function hasMismatchedPageTableSource(
  left: Pick<VolumeBrickPageTable, 'layerKey' | 'timepoint' | 'scaleLevel'>,
  right: Pick<VolumeBrickPageTable, 'layerKey' | 'timepoint' | 'scaleLevel'>
): boolean {
  return (
    left.timepoint !== right.timepoint ||
    left.scaleLevel !== right.scaleLevel ||
    left.layerKey !== right.layerKey
  );
}

export function resolveLayerRenderSource(layer: ManagedViewerLayer): LayerRenderSource | null {
  const volume = layer.volume ?? null;
  const brickAtlas = layer.brickAtlas ?? null;
  const atlasPageTable = brickAtlas?.pageTable ?? null;
  const standalonePageTable = layer.brickPageTable ?? null;
  const pageTable = atlasPageTable ?? standalonePageTable;
  if (
    atlasPageTable &&
    standalonePageTable &&
    atlasPageTable !== standalonePageTable &&
    hasMismatchedPageTableSource(atlasPageTable, standalonePageTable)
  ) {
    throw new Error('[brick-skip] hard-cutover violation: mismatched-page-table-source');
  }
  if (volume) {
    const depth = layer.fullResolutionDepth > 0 ? layer.fullResolutionDepth : volume.depth;
    const height = layer.fullResolutionHeight > 0 ? layer.fullResolutionHeight : volume.height;
    const width = layer.fullResolutionWidth > 0 ? layer.fullResolutionWidth : volume.width;
    return {
      width,
      height,
      depth,
      dataWidth: volume.width,
      dataHeight: volume.height,
      dataDepth: volume.depth,
      channels: volume.channels,
      volume,
      pageTable,
      brickAtlas
    };
  }
  if (brickAtlas?.enabled && pageTable) {
    const depth = layer.fullResolutionDepth > 0 ? layer.fullResolutionDepth : pageTable.volumeShape[0];
    const height = layer.fullResolutionHeight > 0 ? layer.fullResolutionHeight : pageTable.volumeShape[1];
    const width = layer.fullResolutionWidth > 0 ? layer.fullResolutionWidth : pageTable.volumeShape[2];
    return {
      width,
      height,
      depth,
      dataWidth: pageTable.volumeShape[2],
      dataHeight: pageTable.volumeShape[1],
      dataDepth: pageTable.volumeShape[0],
      channels: brickAtlas.sourceChannels,
      volume: null,
      pageTable,
      brickAtlas
    };
  }
  return null;
}

export function resolveCanonicalSceneDimensions(
  layers: readonly ManagedViewerLayer[],
): SceneDimensions | null {
  for (const layer of layers) {
    const source = resolveLayerRenderSource(layer);
    if (source) {
      return {
        width: source.width,
        height: source.height,
        depth: source.depth,
      };
    }
  }
  return null;
}

export function isPlaybackWarmupLayer(layer: ManagedViewerLayer): boolean {
  return typeof layer.playbackWarmupForLayerKey === 'string' && layer.playbackWarmupForLayerKey.length > 0;
}

export function isPlaybackPinnedLayer(layer: ManagedViewerLayer): boolean {
  return layer.playbackRole === 'warmup' || layer.playbackRole === 'active';
}

function doesWarmupResourceMatchSource(
  resource: VolumeResources,
  layer: ManagedViewerLayer,
  source: LayerRenderSource
): boolean {
  if (resource.playbackWarmupForLayerKey !== layer.key) {
    return false;
  }
  const sourcePageTable = source.pageTable;
  const resourcePageTable = resource.brickPageTable;
  if (!source.brickAtlas || !sourcePageTable || !resourcePageTable) {
    return false;
  }
  if (resource.brickAtlasSourceToken === source.brickAtlas && resourcePageTable === sourcePageTable) {
    return true;
  }
  return (
    resourcePageTable.layerKey === sourcePageTable.layerKey &&
    resourcePageTable.timepoint === sourcePageTable.timepoint &&
    resourcePageTable.scaleLevel === sourcePageTable.scaleLevel
  );
}

export function findPromotableWarmupResource(
  resources: Map<string, VolumeResources>,
  layer: ManagedViewerLayer,
  source: LayerRenderSource
): { key: string; resource: VolumeResources } | null {
  for (const [resourceKey, resource] of resources.entries()) {
    if (!resource.playbackWarmupForLayerKey) {
      continue;
    }
    if (!doesWarmupResourceMatchSource(resource, layer, source)) {
      continue;
    }
    return { key: resourceKey, resource };
  }
  return null;
}
