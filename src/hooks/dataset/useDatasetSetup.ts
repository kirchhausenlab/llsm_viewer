import { useCallback, useMemo, type Dispatch, type SetStateAction } from 'react';

import { DEFAULT_LAYER_COLOR, normalizeHexColor } from '../../shared/colorMaps/layerColors';
import type { LayerSettings } from '../../state/layerSettings';
import { useDatasetErrors } from '../useDatasetErrors';
import { DEFAULT_VOXEL_RESOLUTION, useVoxelResolution, type VoxelResolutionHook } from '../useVoxelResolution';
import type { ChannelSource } from './useChannelSources';
import type { VolumeDataType } from '../../types/volume';
import {
  collectFilesFromDataTransfer,
  dedupeFiles,
  groupFilesIntoLayers,
  hasTiffExtension,
  sortVolumeFiles
} from '../../shared/utils/appHelpers';
import { isSegmentationChannelSource } from './channelClassification';

export type LoadedDatasetLayer = {
  key: string;
  label: string;
  channelId: string;
  isSegmentation: boolean;
  volumeCount: number;
  width: number;
  height: number;
  depth: number;
  channels: number;
  dataType: VolumeDataType;
  min: number;
  max: number;
};

export type DatasetSetupParams = {
  channels: ChannelSource[];
  loadedLayers: LoadedDatasetLayer[];
  layerSettings: Record<string, LayerSettings>;
  setChannels: Dispatch<SetStateAction<ChannelSource[]>>;
  setLayerSettings: Dispatch<SetStateAction<Record<string, LayerSettings>>>;
  setLayerAutoThresholds: Dispatch<SetStateAction<Record<string, number>>>;
  setLayerTimepointCounts: Dispatch<SetStateAction<Record<string, number>>>;
  setLayerTimepointCountErrors: Dispatch<SetStateAction<Record<string, string>>>;
  computeLayerTimepointCount: (files: File[]) => Promise<number>;
  createVolumeSource: (files: File[]) => { id: string; files: File[]; isSegmentation: boolean };
};

export type DatasetSetupHook = {
  voxelResolution: VoxelResolutionHook;
  datasetErrors: ReturnType<typeof useDatasetErrors>;
  channelNameMap: Map<string, string>;
  channelLayersMap: Map<string, LoadedDatasetLayer[]>;
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
  loadedLayers,
  layerSettings,
  setChannels,
  setLayerSettings,
  setLayerAutoThresholds,
  setLayerTimepointCounts,
  setLayerTimepointCountErrors,
  computeLayerTimepointCount,
  createVolumeSource
}: DatasetSetupParams): DatasetSetupHook {
  const voxelResolution = useVoxelResolution(DEFAULT_VOXEL_RESOLUTION);
  const datasetErrors = useDatasetErrors();
  const { reportDatasetError, clearDatasetError } = datasetErrors;
  const showInteractionWarning = useCallback(
    (message: string) => {
      reportDatasetError(message, 'interaction');
    },
    [reportDatasetError]
  );

  const volumeTimepointCount = loadedLayers.length > 0 ? loadedLayers[0].volumeCount : 0;

  const channelNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const channel of channels) {
      map.set(channel.id, channel.name.trim() || 'Untitled channel');
    }
    return map;
  }, [channels]);

  const channelLayersMap = useMemo(() => {
    const map = new Map<string, LoadedDatasetLayer[]>();
    for (const layer of loadedLayers) {
      const collection = map.get(layer.channelId);
      if (collection) {
        collection.push(layer);
      } else {
        map.set(layer.channelId, [layer]);
      }
    }
    return map;
  }, [loadedLayers]);

  const layerChannelMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const layer of loadedLayers) {
      map.set(layer.key, layer.channelId);
    }
    return map;
  }, [loadedLayers]);

  const channelTintMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const channel of channels) {
      const channelLayers = channelLayersMap.get(channel.id) ?? [];
      const primaryLayerKey = channelLayers[0]?.key ?? null;
      if (primaryLayerKey) {
        const settings = layerSettings[primaryLayerKey];
        const normalized = normalizeHexColor(settings?.color ?? DEFAULT_LAYER_COLOR, DEFAULT_LAYER_COLOR);
        map.set(channel.id, normalized);
      } else {
        map.set(channel.id, DEFAULT_LAYER_COLOR);
      }
    }
    return map;
  }, [channelLayersMap, channels, layerSettings]);

  const loadedChannelIds = useMemo(() => {
    const seen = new Set<string>();
    const order: string[] = [];
    const channelMeta = new Map<string, { firstIndex: number; hasNonSegmentationLayer: boolean }>();
    let layerIndex = 0;
    for (const layer of loadedLayers) {
      if (!seen.has(layer.channelId)) {
        seen.add(layer.channelId);
        order.push(layer.channelId);
      }
      const existing = channelMeta.get(layer.channelId);
      if (existing) {
        if (!layer.isSegmentation) {
          existing.hasNonSegmentationLayer = true;
        }
      } else {
        channelMeta.set(layer.channelId, {
          firstIndex: layerIndex,
          hasNonSegmentationLayer: !layer.isSegmentation
        });
      }
      layerIndex += 1;
    }
    return [...order].sort((left, right) => {
      const leftMeta = channelMeta.get(left);
      const rightMeta = channelMeta.get(right);
      const leftIsSegmentation = !(leftMeta?.hasNonSegmentationLayer ?? true);
      const rightIsSegmentation = !(rightMeta?.hasNonSegmentationLayer ?? true);

      if (leftIsSegmentation !== rightIsSegmentation) {
        return leftIsSegmentation ? 1 : -1;
      }
      return (leftMeta?.firstIndex ?? 0) - (rightMeta?.firstIndex ?? 0);
    });
  }, [loadedLayers]);

  const handleChannelLayerFilesAdded = useCallback(
    async (channelId: string, incomingFiles: File[]) => {
      const tiffFiles = dedupeFiles(incomingFiles.filter((file) => hasTiffExtension(file.name)));
      if (tiffFiles.length === 0) {
        showInteractionWarning('No TIFF files detected in the dropped selection.');
        return;
      }

      const grouped = groupFilesIntoLayers(tiffFiles);
      if (grouped.length === 0) {
        return;
      }

      const ignoredExtraGroups = grouped.length > 1;
      const sorted = sortVolumeFiles(grouped[0]);
      if (sorted.length === 0) {
        return;
      }

      const targetChannel = channels.find((channel) => channel.id === channelId) ?? null;
      if (!targetChannel) {
        return;
      }
      const replacedVolumeId = targetChannel.volume?.id ?? null;
      const addedVolume = {
        ...createVolumeSource(sorted),
        isSegmentation: isSegmentationChannelSource(targetChannel)
      };

      setChannels((current) =>
        current.map((channel) => (channel.id === channelId ? { ...channel, volume: addedVolume } : channel))
      );
      setLayerTimepointCounts((current) => {
        if (!replacedVolumeId || !(replacedVolumeId in current)) {
          return current;
        }
        const next = { ...current };
        delete next[replacedVolumeId];
        return next;
      });
      setLayerTimepointCountErrors((current) => {
        const hasAddedError = addedVolume.id in current;
        const hasReplacedError = Boolean(replacedVolumeId && replacedVolumeId in current);
        if (!hasAddedError && !hasReplacedError) {
          return current;
        }
        const next = { ...current };
        delete next[addedVolume.id];
        if (replacedVolumeId) {
          delete next[replacedVolumeId];
        }
        return next;
      });

      let hasTimepointCountError = false;
      try {
        const timepointCount = await computeLayerTimepointCount(addedVolume.files);
        setLayerTimepointCounts((current) => {
          const next: Record<string, number> = {
            ...current,
            [addedVolume.id]: timepointCount
          };
          if (replacedVolumeId && replacedVolumeId in next) {
            delete next[replacedVolumeId];
          }
          return next;
        });
        setLayerTimepointCountErrors((current) => {
          const hasAddedError = addedVolume.id in current;
          const hasReplacedError = Boolean(replacedVolumeId && replacedVolumeId in current);
          if (!hasAddedError && !hasReplacedError) {
            return current;
          }
          const next = { ...current };
          delete next[addedVolume.id];
          if (replacedVolumeId) {
            delete next[replacedVolumeId];
          }
          return next;
        });
      } catch (error) {
        console.error('Failed to compute timepoint count for layer', error);
        hasTimepointCountError = true;
        const message = `Failed to read TIFF timepoint count: ${
          error instanceof Error ? error.message : 'The dropped files could not be parsed as a TIFF sequence.'
        }`;
        setLayerTimepointCounts((current) => {
          if (!(addedVolume.id in current) && (!replacedVolumeId || !(replacedVolumeId in current))) {
            return current;
          }
          const next = { ...current };
          delete next[addedVolume.id];
          if (replacedVolumeId) {
            delete next[replacedVolumeId];
          }
          return next;
        });
        setLayerTimepointCountErrors((current) => {
          const next: Record<string, string> = {
            ...current,
            [addedVolume.id]: message
          };
          if (replacedVolumeId && replacedVolumeId in next) {
            delete next[replacedVolumeId];
          }
          return next;
        });
        showInteractionWarning(message);
      }

      if (replacedVolumeId) {
        setLayerSettings((current) => {
          if (!(replacedVolumeId in current)) {
            return current;
          }
          const next = { ...current };
          delete next[replacedVolumeId];
          return next;
        });
        setLayerAutoThresholds((current) => {
          if (!(replacedVolumeId in current)) {
            return current;
          }
          const next = { ...current };
          delete next[replacedVolumeId];
          return next;
        });
      }

      if (ignoredExtraGroups && !hasTimepointCountError) {
        showInteractionWarning('Only the first TIFF sequence was added. Additional sequences were ignored.');
      } else if (!hasTimepointCountError) {
        clearDatasetError();
      }
    },
    [
      channels,
      clearDatasetError,
      computeLayerTimepointCount,
      createVolumeSource,
      setChannels,
      setLayerAutoThresholds,
      setLayerSettings,
      setLayerTimepointCounts,
      setLayerTimepointCountErrors,
      showInteractionWarning
    ]
  );

  const handleChannelLayerDrop = useCallback(
    async (channelId: string, dataTransfer: DataTransfer) => {
      try {
        const files = await collectFilesFromDataTransfer(dataTransfer);
        if (files.length === 0) {
          showInteractionWarning('No TIFF files detected in the dropped selection.');
          return;
        }
        await handleChannelLayerFilesAdded(channelId, files);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to read dropped files.';
        showInteractionWarning(message);
      }
    },
    [handleChannelLayerFilesAdded, showInteractionWarning]
  );

  const handleChannelLayerSegmentationToggle = useCallback(
    (channelId: string, layerId: string, value: boolean) => {
      setChannels((current) =>
        current.map((channel) => {
          if (channel.id !== channelId || !channel.volume || channel.volume.id !== layerId) {
            return channel;
          }
          return {
            ...channel,
            volume: { ...channel.volume, isSegmentation: value }
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
          if (!channel.volume || channel.volume.id !== layerId) {
            return channel;
          }
          removed = true;
          return {
            ...channel,
            volume: null
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
        setLayerTimepointCountErrors((current) => {
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
      setLayerTimepointCountErrors,
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
