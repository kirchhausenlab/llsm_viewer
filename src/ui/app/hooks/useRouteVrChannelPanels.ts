import { useMemo } from 'react';

import type { NormalizedVolume } from '../../../core/volumeProcessing';
import type { LoadedDatasetLayer } from '../../../hooks/dataset';
import type { LayerSettings } from '../../../state/layerSettings';
import { DEFAULT_WINDOW_MAX, DEFAULT_WINDOW_MIN } from '../../../state/layerSettings';

const DEFAULT_RESET_WINDOW = { windowMin: DEFAULT_WINDOW_MIN, windowMax: DEFAULT_WINDOW_MAX };

function selectDeterministicLayerKey(layers: ReadonlyArray<{ key: string }>): string | null {
  if (layers.length === 0) {
    return null;
  }
  return [...layers].sort((left, right) => left.key.localeCompare(right.key))[0]?.key ?? null;
}

type UseRouteVrChannelPanelsOptions = {
  trackSets: Array<{ id: string; name: string }>;
  loadedChannelIds: string[];
  channelNameMap: Map<string, string>;
  channelLayersMap: Map<string, LoadedDatasetLayer[]>;
  channelVisibility: Record<string, boolean>;
  channelActiveLayer: Record<string, string>;
  layerSettings: Record<string, LayerSettings>;
  currentLayerVolumes: Record<string, NormalizedVolume | null>;
  createLayerDefaultSettings: (layerKey: string) => LayerSettings;
};

export type RouteTrackChannel = {
  id: string;
  name: string;
};

export type RouteVrChannelPanelLayer = {
  key: string;
  label: string;
  hasData: boolean;
  isGrayscale: boolean;
  isSegmentation: boolean;
  defaultWindow: { windowMin: number; windowMax: number };
  histogram: Uint32Array | null;
  settings: LayerSettings;
};

export type RouteVrChannelPanel = {
  id: string;
  name: string;
  visible: boolean;
  activeLayerKey: string | null;
  layers: RouteVrChannelPanelLayer[];
};

type UseRouteVrChannelPanelsResult = {
  trackChannels: RouteTrackChannel[];
  vrChannelPanels: RouteVrChannelPanel[];
};

export function useRouteVrChannelPanels({
  trackSets,
  loadedChannelIds,
  channelNameMap,
  channelLayersMap,
  channelVisibility,
  channelActiveLayer,
  layerSettings,
  currentLayerVolumes,
  createLayerDefaultSettings
}: UseRouteVrChannelPanelsOptions): UseRouteVrChannelPanelsResult {
  const trackChannels = useMemo(() => {
    return trackSets.map((trackSet) => ({
      id: trackSet.id,
      name: trackSet.name.trim() || 'Tracks'
    }));
  }, [trackSets]);

  const vrChannelPanels = useMemo(() => {
    return loadedChannelIds.map((channelId) => {
      const channelLayers = channelLayersMap.get(channelId) ?? [];
      const name = channelNameMap.get(channelId) ?? 'Untitled channel';
      const visible = channelVisibility[channelId] ?? true;
      const activeLayerKey = channelActiveLayer[channelId] ?? selectDeterministicLayerKey(channelLayers);
      const layers = channelLayers.map((layer) => {
        const settings = layerSettings[layer.key] ?? createLayerDefaultSettings(layer.key);
        const volume = currentLayerVolumes[layer.key] ?? null;
        return {
          key: layer.key,
          label: layer.label,
          hasData: layer.volumeCount > 0,
          isGrayscale: layer.channels === 1,
          isSegmentation: layer.isSegmentation,
          defaultWindow: DEFAULT_RESET_WINDOW,
          histogram: volume?.histogram ?? null,
          settings
        };
      });

      return {
        id: channelId,
        name,
        visible,
        activeLayerKey,
        layers
      };
    });
  }, [
    loadedChannelIds,
    channelNameMap,
    channelLayersMap,
    channelVisibility,
    channelActiveLayer,
    layerSettings,
    currentLayerVolumes,
    createLayerDefaultSettings
  ]);

  return { trackChannels, vrChannelPanels };
}
