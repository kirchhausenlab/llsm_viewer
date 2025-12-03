import { useCallback, useMemo, type Dispatch, type SetStateAction } from 'react';

import { DEFAULT_LAYER_COLOR, normalizeHexColor } from '../layerColors';
import type { LayerSettings } from '../state/layerSettings';
import { useDatasetErrors } from './useDatasetErrors';
import { DEFAULT_EXPERIMENT_DIMENSION, DEFAULT_VOXEL_RESOLUTION, useVoxelResolution, type VoxelResolutionHook } from './useVoxelResolution';
import type { ChannelLayerSource, ChannelSource } from './useChannelSources';
import type { LoadedLayer } from '../types/layers';
import {
  collectFilesFromDataTransfer,
  dedupeFiles,
  groupFilesIntoLayers,
  hasTiffExtension,
  sortVolumeFiles
} from '../utils/appHelpers';

export type DatasetSetupParams = {
  channels: ChannelSource[];
  layers: LoadedLayer[];
  channelActiveLayer: Record<string, string>;
  layerSettings: Record<string, LayerSettings>;
  setChannels: Dispatch<SetStateAction<ChannelSource[]>>;
  setLayerSettings: Dispatch<SetStateAction<Record<string, LayerSettings>>>;
  setLayerAutoThresholds: Dispatch<SetStateAction<Record<string, number>>>;
  setLayerTimepointCounts: Dispatch<SetStateAction<Record<string, number>>>;
  computeLayerTimepointCount: (files: File[]) => Promise<number>;
  createLayerSource: (files: File[]) => ChannelLayerSource;
};

export type DatasetSetupHook = {
  voxelResolution: VoxelResolutionHook;
  datasetErrors: ReturnType<typeof useDatasetErrors>;
  channelNameMap: Map<string, string>;
  channelLayersMap: Map<string, LoadedLayer[]>;
  layerChannelMap: Map<string, string>;
  channelTintMap: Map<string, string>;
  loadedChannelIds: string[];
  volumeTimepointCount: number;
  handleChannelLayerFilesAdded: (channelId: string, files: File[]) => Promise<void>;
  handleChannelLayerDrop: (channelId: string, dataTransfer: DataTransfer) => Promise<void>;
  handleChannelLayerSegmentationToggle: (channelId: string, layerId: string, value: boolean) => void;
  handleChannelLayerRemove: (channelId: string, layerId: string) => void;
  showInteractionWarning: (message: string) => void;
};

export function useDatasetSetup({
  channels,
  layers,
  channelActiveLayer,
  layerSettings,
  setChannels,
  setLayerSettings,
  setLayerAutoThresholds,
  setLayerTimepointCounts,
  computeLayerTimepointCount,
  createLayerSource
}: DatasetSetupParams): DatasetSetupHook {
  const voxelResolution = useVoxelResolution(DEFAULT_VOXEL_RESOLUTION, DEFAULT_EXPERIMENT_DIMENSION);
  const datasetErrors = useDatasetErrors();
  const { reportDatasetError, clearDatasetError } = datasetErrors;

  const showInteractionWarning = useCallback(
    (message: string) => {
      reportDatasetError(message, 'interaction');
    },
    [reportDatasetError]
  );

  const volumeTimepointCount = layers.length > 0 ? layers[0].volumes.length : 0;

  const channelNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const channel of channels) {
      map.set(channel.id, channel.name.trim() || 'Untitled channel');
    }
    return map;
  }, [channels]);

  const channelLayersMap = useMemo(() => {
    const map = new Map<string, LoadedLayer[]>();
    for (const layer of layers) {
      const collection = map.get(layer.channelId);
      if (collection) {
        collection.push(layer);
      } else {
        map.set(layer.channelId, [layer]);
      }
    }
    return map;
  }, [layers]);

  const layerChannelMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const layer of layers) {
      map.set(layer.key, layer.channelId);
    }
    return map;
  }, [layers]);

  const channelTintMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const channel of channels) {
      const channelLayers = channelLayersMap.get(channel.id) ?? [];
      const activeLayerKey = channelActiveLayer[channel.id] ?? channelLayers[0]?.key ?? null;
      if (activeLayerKey) {
        const settings = layerSettings[activeLayerKey];
        const normalized = normalizeHexColor(settings?.color ?? DEFAULT_LAYER_COLOR, DEFAULT_LAYER_COLOR);
        map.set(channel.id, normalized);
      } else {
        map.set(channel.id, DEFAULT_LAYER_COLOR);
      }
    }
    return map;
  }, [channelActiveLayer, channelLayersMap, channels, layerSettings]);

  const loadedChannelIds = useMemo(() => {
    const seen = new Set<string>();
    const order: string[] = [];
    for (const layer of layers) {
      if (!seen.has(layer.channelId)) {
        seen.add(layer.channelId);
        order.push(layer.channelId);
      }
    }
    return order;
  }, [layers]);

  const handleChannelLayerFilesAdded = useCallback(
    async (channelId: string, incomingFiles: File[]) => {
      const tiffFiles = dedupeFiles(incomingFiles.filter((file) => hasTiffExtension(file.name)));
      if (tiffFiles.length === 0) {
        showInteractionWarning('No TIFF files detected in the dropped selection.');
        return;
      }

      let addedAny = false;
      let ignoredExtraGroups = false;
      let addedLayer: ChannelLayerSource | null = null;
      const replacedLayerIds: string[] = [];

      setChannels((current) =>
        current.map((channel) => {
          if (channel.id !== channelId) {
            return channel;
          }
          const grouped = groupFilesIntoLayers(tiffFiles);
          if (grouped.length === 0) {
            return channel;
          }
          if (grouped.length > 1) {
            ignoredExtraGroups = true;
          }
          const sorted = sortVolumeFiles(grouped[0]);
          if (sorted.length === 0) {
            return channel;
          }
          addedAny = true;
          if (channel.layers.length > 0) {
            replacedLayerIds.push(channel.layers[0].id);
          }
          const nextLayer = createLayerSource(sorted);
          addedLayer = nextLayer;
          return { ...channel, layers: [nextLayer] };
        })
      );

      if (addedAny) {
        if (addedLayer) {
          const layerForCounts: ChannelLayerSource = addedLayer;
          try {
            const timepointCount = await computeLayerTimepointCount(layerForCounts.files);
            setLayerTimepointCounts((current) => {
              const next: Record<string, number> = {
                ...current,
                [layerForCounts.id]: timepointCount
              };
              for (const layerId of replacedLayerIds) {
                if (layerId in next) {
                  delete next[layerId];
                }
              }
              return next;
            });
          } catch (error) {
            console.error('Failed to compute timepoint count for layer', error);
            setLayerTimepointCounts((current) => {
              const next: Record<string, number> = {
                ...current,
                [layerForCounts.id]: layerForCounts.files.length
              };
              for (const layerId of replacedLayerIds) {
                if (layerId in next) {
                  delete next[layerId];
                }
              }
              return next;
            });
          }
        }
        if (replacedLayerIds.length > 0) {
          setLayerSettings((current) => {
            let changed = false;
            const next = { ...current };
            for (const layerId of replacedLayerIds) {
              if (layerId in next) {
                delete next[layerId];
                changed = true;
              }
            }
            return changed ? next : current;
          });
          setLayerAutoThresholds((current) => {
            let changed = false;
            const next = { ...current };
            for (const layerId of replacedLayerIds) {
              if (layerId in next) {
                delete next[layerId];
                changed = true;
              }
            }
            return changed ? next : current;
          });
        }
        if (ignoredExtraGroups) {
          showInteractionWarning('Only the first TIFF sequence was added. Additional sequences were ignored.');
        } else {
          clearDatasetError();
        }
      }
    },
    [
      clearDatasetError,
      computeLayerTimepointCount,
      createLayerSource,
      setChannels,
      setLayerAutoThresholds,
      setLayerSettings,
      setLayerTimepointCounts,
      showInteractionWarning
    ]
  );

  const handleChannelLayerDrop = useCallback(
    async (channelId: string, dataTransfer: DataTransfer) => {
      const files = await collectFilesFromDataTransfer(dataTransfer);
      if (files.length === 0) {
        showInteractionWarning('No TIFF files detected in the dropped selection.');
        return;
      }
      handleChannelLayerFilesAdded(channelId, files);
    },
    [handleChannelLayerFilesAdded, showInteractionWarning]
  );

  const handleChannelLayerSegmentationToggle = useCallback(
    (channelId: string, layerId: string, value: boolean) => {
      setChannels((current) =>
        current.map((channel) => {
          if (channel.id !== channelId) {
            return channel;
          }
          return {
            ...channel,
            layers: channel.layers.map((layer) => (layer.id === layerId ? { ...layer, isSegmentation: value } : layer))
          };
        })
      );
    },
    [setChannels]
  );

  const handleChannelLayerRemove = useCallback(
    (channelId: string, layerId: string) => {
      let removed = false;
      setChannels((current) =>
        current.map((channel) => {
          if (channel.id !== channelId) {
            return channel;
          }
          const filtered = channel.layers.filter((layer) => layer.id !== layerId);
          if (filtered.length === channel.layers.length) {
            return channel;
          }
          removed = true;
          return {
            ...channel,
            layers: filtered
          };
        })
      );
      if (removed) {
        setLayerSettings((current) => {
          if (!(layerId in current)) {
            return current;
          }
          const next = { ...current };
          delete next[layerId];
          return next;
        });
        setLayerAutoThresholds((current) => {
          if (!(layerId in current)) {
            return current;
          }
          const next = { ...current };
          delete next[layerId];
          return next;
        });
        setLayerTimepointCounts((current) => {
          if (!(layerId in current)) {
            return current;
          }
          const next = { ...current };
          delete next[layerId];
          return next;
        });
        clearDatasetError();
      }
    },
    [
      clearDatasetError,
      setChannels,
      setLayerAutoThresholds,
      setLayerSettings,
      setLayerTimepointCounts
    ]
  );

  return {
    voxelResolution,
    datasetErrors,
    channelNameMap,
    channelLayersMap,
    layerChannelMap,
    channelTintMap,
    loadedChannelIds,
    volumeTimepointCount,
    handleChannelLayerFilesAdded,
    handleChannelLayerDrop,
    handleChannelLayerSegmentationToggle,
    handleChannelLayerRemove,
    showInteractionWarning
  };
}
