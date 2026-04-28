import type { LoadedDatasetLayer } from '../../../hooks/dataset';
import type {
  LayerSettings,
  RenderStyle,
  SamplingMode,
} from '../../../state/layerSettings';

export type LayerRenderModeSnapshot = Record<string, {
  renderStyle: RenderStyle;
  samplingMode: SamplingMode;
}>;

export function collectChannelLayersFor2dView(
  loadedChannelIds: readonly string[],
  channelLayersMap: ReadonlyMap<string, readonly LoadedDatasetLayer[]>
): LoadedDatasetLayer[] {
  return loadedChannelIds.flatMap((channelId) => [...(channelLayersMap.get(channelId) ?? [])]);
}

export function readLayerRenderModeSnapshot(
  layerKey: string,
  layerSettings: Record<string, LayerSettings | undefined>,
  getLayerDefaultSettings: (layerKey: string) => LayerSettings
): LayerRenderModeSnapshot[string] {
  const settings = layerSettings[layerKey] ?? getLayerDefaultSettings(layerKey);
  return {
    renderStyle: settings.renderStyle,
    samplingMode: settings.samplingMode,
  };
}

export function captureLayerRenderModeSnapshot(
  layers: readonly LoadedDatasetLayer[],
  layerSettings: Record<string, LayerSettings | undefined>,
  getLayerDefaultSettings: (layerKey: string) => LayerSettings
): LayerRenderModeSnapshot {
  const snapshot: LayerRenderModeSnapshot = {};
  for (const layer of layers) {
    snapshot[layer.key] = readLayerRenderModeSnapshot(
      layer.key,
      layerSettings,
      getLayerDefaultSettings
    );
  }
  return snapshot;
}

export function addMissingLayerRenderModesToSnapshot(
  snapshot: LayerRenderModeSnapshot,
  layers: readonly LoadedDatasetLayer[],
  layerSettings: Record<string, LayerSettings | undefined>,
  getLayerDefaultSettings: (layerKey: string) => LayerSettings
): LayerRenderModeSnapshot {
  let next = snapshot;
  for (const layer of layers) {
    if (Object.prototype.hasOwnProperty.call(next, layer.key)) {
      continue;
    }
    if (next === snapshot) {
      next = { ...snapshot };
    }
    next[layer.key] = readLayerRenderModeSnapshot(
      layer.key,
      layerSettings,
      getLayerDefaultSettings
    );
  }
  return next;
}
