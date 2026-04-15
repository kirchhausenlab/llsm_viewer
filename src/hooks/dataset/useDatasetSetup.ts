import { useCallback, useMemo, type Dispatch, type SetStateAction } from 'react';
import { fromBlob } from 'geotiff';

import { DEFAULT_LAYER_COLOR, normalizeHexColor } from '../../shared/colorMaps/layerColors';
import { resolveImagejPageChannelLayout } from '../../shared/utils/tiffHyperstack';
import type { LayerSettings } from '../../state/layerSettings';
import { useDatasetErrors } from '../useDatasetErrors';
import { DEFAULT_VOXEL_RESOLUTION, useVoxelResolution, type VoxelResolutionHook } from '../useVoxelResolution';
import {
  getChannelVolumeComponentIndex,
  getOwnedMultichannelDerivedChannels,
  isMultichannelDerivedChannelSource,
  isMultichannelOwnerChannelSource,
  type ChannelSource,
  type TrackSetSource
} from './useChannelSources';
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
  setTracks: Dispatch<SetStateAction<TrackSetSource[]>>;
  loadedLayers: LoadedDatasetLayer[];
  layerSettings: Record<string, LayerSettings>;
  setChannels: Dispatch<SetStateAction<ChannelSource[]>>;
  setLayerSettings: Dispatch<SetStateAction<Record<string, LayerSettings>>>;
  setLayerAutoThresholds: Dispatch<SetStateAction<Record<string, number>>>;
  setLayerTimepointCounts: Dispatch<SetStateAction<Record<string, number>>>;
  setLayerTimepointCountErrors: Dispatch<SetStateAction<Record<string, string>>>;
  computeLayerTimepointCount: (files: File[]) => Promise<number>;
  createChannelSource: (name: string, channelType?: ChannelSource['channelType']) => ChannelSource;
  createVolumeSource: (files: File[]) => { id: string; files: File[]; isSegmentation: boolean };
  probeVolumeSourceChannels?: (files: File[]) => Promise<number>;
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

async function probeVolumeSourceChannelsDefault(files: File[]): Promise<number> {
  let expectedChannels: number | null = null;

  for (const file of files) {
    const tiff = await fromBlob(file);
    const imageCount = await tiff.getImageCount();
    if (imageCount <= 0) {
      throw new Error(`File "${file.name}" does not contain any images.`);
    }

    const firstImage = await tiff.getImage(0);
    const firstImageChannels =
      resolveImagejPageChannelLayout({
        samplesPerPixel: firstImage.getSamplesPerPixel(),
        imageCount,
        imageDescription: firstImage.fileDirectory.ImageDescription ?? null
      })?.channels ?? firstImage.getSamplesPerPixel();
    if (!Number.isFinite(firstImageChannels) || firstImageChannels <= 0) {
      throw new Error(`File "${file.name}" has an invalid channel count.`);
    }

    if (expectedChannels === null) {
      expectedChannels = firstImageChannels;
    } else if (firstImageChannels !== expectedChannels) {
      throw new Error(
        `TIFF channel counts must match across the uploaded selection. File "${file.name}" has ${firstImageChannels} channels, expected ${expectedChannels}.`
      );
    }

    if (firstImageChannels > 1 && imageCount > 1) {
      continue;
    }

    for (let imageIndex = 1; imageIndex < imageCount; imageIndex += 1) {
      const image = await tiff.getImage(imageIndex);
      const channels = image.getSamplesPerPixel();
      if (!Number.isFinite(channels) || channels <= 0) {
        throw new Error(`File "${file.name}" has an invalid channel count at image ${imageIndex + 1}.`);
      }
      if (channels !== firstImage.getSamplesPerPixel()) {
        throw new Error(
          `TIFF channel counts must match across the uploaded selection. File "${file.name}" image ${imageIndex + 1} has ${channels} channels, expected ${firstImage.getSamplesPerPixel()}.`
        );
      }
    }
  }

  return expectedChannels ?? 1;
}

export function useDatasetSetup({
  channels,
  setTracks,
  loadedLayers,
  layerSettings,
  setChannels,
  setLayerSettings,
  setLayerAutoThresholds,
  setLayerTimepointCounts,
  setLayerTimepointCountErrors,
  computeLayerTimepointCount,
  createChannelSource,
  createVolumeSource,
  probeVolumeSourceChannels = probeVolumeSourceChannelsDefault
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

  const clearLayerDerivedState = useCallback(
    (layerIds: string[]) => {
      if (layerIds.length === 0) {
        return;
      }
      const uniqueLayerIds = new Set(layerIds);

      setLayerSettings((current) => {
        let changed = false;
        const next = { ...current };
        for (const layerId of uniqueLayerIds) {
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
        for (const layerId of uniqueLayerIds) {
          if (layerId in next) {
            delete next[layerId];
            changed = true;
          }
        }
        return changed ? next : current;
      });
      setLayerTimepointCounts((current) => {
        let changed = false;
        const next = { ...current };
        for (const layerId of uniqueLayerIds) {
          if (layerId in next) {
            delete next[layerId];
            changed = true;
          }
        }
        return changed ? next : current;
      });
      setLayerTimepointCountErrors((current) => {
        let changed = false;
        const next = { ...current };
        for (const layerId of uniqueLayerIds) {
          if (layerId in next) {
            delete next[layerId];
            changed = true;
          }
        }
        return changed ? next : current;
      });
    },
    [setLayerAutoThresholds, setLayerSettings, setLayerTimepointCountErrors, setLayerTimepointCounts]
  );

  const clearTrackBindingsForRemovedChannels = useCallback(
    (removedChannelIds: string[]) => {
      if (removedChannelIds.length === 0) {
        return;
      }
      const removedChannelIdSet = new Set(removedChannelIds);
      setTracks((current) => {
        let changed = false;
        const next = current.map((trackSet) => {
          if (!trackSet.boundChannelId || !removedChannelIdSet.has(trackSet.boundChannelId)) {
            return trackSet;
          }
          changed = true;
          return {
            ...trackSet,
            boundChannelId: null
          };
        });
        return changed ? next : current;
      });
    },
    [setTracks]
  );

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

      if (isMultichannelDerivedChannelSource(targetChannel)) {
        showInteractionWarning('Upload files to the multichannel parent row above.');
        return;
      }

      const targetIsSegmentation = isSegmentationChannelSource(targetChannel);
      let sourceChannels: number;
      try {
        sourceChannels = await probeVolumeSourceChannels(sorted);
      } catch (error) {
        const message = `Failed to inspect TIFF channels: ${
          error instanceof Error ? error.message : 'The dropped files could not be parsed as a TIFF sequence.'
        }`;
        showInteractionWarning(message);
        return;
      }

      if (targetIsSegmentation && sourceChannels > 1) {
        showInteractionWarning(
          `Segmentation channels require single-channel TIFF volumes. The uploaded selection has ${sourceChannels} channels.`
        );
        return;
      }

      const desiredLogicalChannelCount = targetIsSegmentation ? 1 : Math.max(1, sourceChannels);
      let removedVolumeIds: string[] = [];
      let removedChannelIds: string[] = [];
      const addedVolumes: Array<{ id: string }> = [];

      setChannels((current) => {
        const targetIndex = current.findIndex((channel) => channel.id === channelId);
        if (targetIndex < 0) {
          return current;
        }

        const currentTarget = current[targetIndex]!;
        const currentDerivedChannels = isMultichannelOwnerChannelSource(currentTarget)
          ? getOwnedMultichannelDerivedChannels(current, channelId)
          : [];
        const currentDerivedByComponentIndex = new Map(
          currentDerivedChannels.map((channel) => [getChannelVolumeComponentIndex(channel.volume), channel] as const)
        );

        removedVolumeIds = [
          currentTarget.volume?.id ?? null,
          ...currentDerivedChannels.map((channel) => channel.volume?.id ?? null)
        ].filter((value): value is string => value !== null);
        removedChannelIds = currentDerivedChannels.map((channel) => channel.id);

        const parentVolume = {
          ...createVolumeSource(sorted),
          isSegmentation: targetIsSegmentation,
          sourceChannels,
          componentIndex: 0,
          multichannelOwnerChannelId: desiredLogicalChannelCount > 1 ? currentTarget.id : null
        };
        addedVolumes.push({ id: parentVolume.id });

        const nextTarget: ChannelSource = {
          ...currentTarget,
          volume: parentVolume
        };

        const nextDerivedChannels: ChannelSource[] = [];
        for (let componentIndex = 1; componentIndex < desiredLogicalChannelCount; componentIndex += 1) {
          const existingChannel = currentDerivedByComponentIndex.get(componentIndex) ?? null;
          const volume = {
            ...createVolumeSource(sorted),
            isSegmentation: false,
            sourceChannels,
            componentIndex,
            multichannelOwnerChannelId: currentTarget.id
          };
          addedVolumes.push({ id: volume.id });
          if (existingChannel) {
            nextDerivedChannels.push({
              ...existingChannel,
              volume
            });
            continue;
          }

          const childChannel = createChannelSource('', 'channel');
          nextDerivedChannels.push({
            ...childChannel,
            volume
          });
        }

        const removedChildIds = new Set(currentDerivedChannels.map((channel) => channel.id));
        const nextChannels: ChannelSource[] = [];
        for (let index = 0; index < current.length; index += 1) {
          const channel = current[index]!;
          if (channel.id === currentTarget.id) {
            nextChannels.push(nextTarget, ...nextDerivedChannels);
            continue;
          }
          if (removedChildIds.has(channel.id)) {
            continue;
          }
          nextChannels.push(channel);
        }
        return nextChannels;
      });

      clearLayerDerivedState(removedVolumeIds);
      clearTrackBindingsForRemovedChannels(removedChannelIds);

      let hasTimepointCountError = false;
      try {
        const timepointCount = await computeLayerTimepointCount(sorted);
        setLayerTimepointCounts((current) => {
          let changed = false;
          const next: Record<string, number> = { ...current };
          for (const entry of addedVolumes) {
            if (next[entry.id] !== timepointCount) {
              next[entry.id] = timepointCount;
              changed = true;
            }
          }
          for (const layerId of removedVolumeIds) {
            if (layerId in next) {
              delete next[layerId];
              changed = true;
            }
          }
          return changed ? next : current;
        });
        setLayerTimepointCountErrors((current) => {
          let changed = false;
          const next = { ...current };
          for (const entry of addedVolumes) {
            if (entry.id in next) {
              delete next[entry.id];
              changed = true;
            }
          }
          for (const layerId of removedVolumeIds) {
            if (layerId in next) {
              delete next[layerId];
              changed = true;
            }
          }
          return changed ? next : current;
        });
      } catch (error) {
        console.error('Failed to compute timepoint count for layer', error);
        hasTimepointCountError = true;
        const message = `Failed to read TIFF timepoint count: ${
          error instanceof Error ? error.message : 'The dropped files could not be parsed as a TIFF sequence.'
        }`;
        setLayerTimepointCounts((current) => {
          let changed = false;
          const next = { ...current };
          for (const entry of addedVolumes) {
            if (entry.id in next) {
              delete next[entry.id];
              changed = true;
            }
          }
          for (const layerId of removedVolumeIds) {
            if (layerId in next) {
              delete next[layerId];
              changed = true;
            }
          }
          return changed ? next : current;
        });
        setLayerTimepointCountErrors((current) => {
          let changed = false;
          const next: Record<string, string> = { ...current };
          for (const entry of addedVolumes) {
            if (next[entry.id] !== message) {
              next[entry.id] = message;
              changed = true;
            }
          }
          for (const layerId of removedVolumeIds) {
            if (layerId in next) {
              delete next[layerId];
              changed = true;
            }
          }
          return changed ? next : current;
        });
        showInteractionWarning(message);
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
      clearLayerDerivedState,
      clearTrackBindingsForRemovedChannels,
      computeLayerTimepointCount,
      createChannelSource,
      createVolumeSource,
      setChannels,
      setLayerTimepointCounts,
      setLayerTimepointCountErrors,
      probeVolumeSourceChannels,
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
      const targetChannel = channels.find((channel) => channel.id === channelId) ?? null;
      if (!targetChannel?.volume || targetChannel.volume.id !== layerId) {
        return;
      }

      const removedChildren = isMultichannelOwnerChannelSource(targetChannel)
        ? getOwnedMultichannelDerivedChannels(channels, channelId)
        : [];
      const removedLayerIds = [
        layerId,
        ...removedChildren.map((channel) => channel.volume?.id ?? null)
      ].filter((value): value is string => value !== null);
      const removedChannelIds = removedChildren.map((channel) => channel.id);

      setChannels((current) => {
        if (removedChannelIds.length === 0) {
          return current.map((channel) => {
            if (channel.id !== channelId) {
              return channel;
            }
            return {
              ...channel,
              volume: null
            };
          });
        }

        const removedChildIds = new Set(removedChannelIds);
        return current.flatMap((channel) => {
          if (removedChildIds.has(channel.id)) {
            return [];
          }
          if (channel.id !== channelId) {
            return [channel];
          }
          return [
            {
              ...channel,
              volume: null
            }
          ];
        });
      });
      clearLayerDerivedState(removedLayerIds);
      clearTrackBindingsForRemovedChannels(removedChannelIds);
      clearDatasetError();
    },
    [channels, clearDatasetError, clearLayerDerivedState, clearTrackBindingsForRemovedChannels, setChannels]
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
