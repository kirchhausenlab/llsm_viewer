import { useCallback, useMemo, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { fromBlob } from 'geotiff';
import type { PreprocessedChannelSummary, PreprocessedManifest } from '../../shared/utils/preprocessedDataset';
import type { PreprocessedStorageHandle } from '../../shared/storage/preprocessedStorage';
import type { LayerSettings } from '../../state/layerSettings';
import type { LoadedLayer } from '../../types/layers';
import {
  useChannelDatasetLoader,
  type ApplyLoadedLayersOptions,
  type LoadSelectedDatasetOptions,
  type LoadState
} from './useChannelDatasetLoader';
import {
  computeGlobalTimepointMismatch,
  getKnownLayerTimepointCount,
  hasPendingLayerTimepointCount,
} from './channelTimepointValidation';

export type { LoadState } from './useChannelDatasetLoader';

export type ChannelLayerSource = {
  id: string;
  files: File[];
  isSegmentation: boolean;
};

export type TrackSetSource = {
  id: string;
  name: string;
  file: File | null;
  fileName: string;
  status: LoadState;
  error: string | null;
  entries: string[][];
};

export type ChannelSource = {
  id: string;
  name: string;
  layers: ChannelLayerSource[];
  trackSets: TrackSetSource[];
};

export type ChannelValidation = {
  errors: string[];
  warnings: string[];
};

export type StagedPreprocessedExperiment = {
  manifest: PreprocessedManifest;
  channelSummaries: PreprocessedChannelSummary[];
  totalVolumeCount: number;
  storageHandle: PreprocessedStorageHandle;
  sourceName: string | null;
  sourceSize: number | null;
};

export type ChannelSourcesApi = {
  channels: ChannelSource[];
  setChannels: Dispatch<SetStateAction<ChannelSource[]>>;
  layerTimepointCounts: Record<string, number>;
  setLayerTimepointCounts: Dispatch<SetStateAction<Record<string, number>>>;
  channelIdRef: MutableRefObject<number>;
  layerIdRef: MutableRefObject<number>;
  trackSetIdRef: MutableRefObject<number>;
  computeLayerTimepointCount: (files: File[]) => Promise<number>;
  getLayerTimepointCount: (layer: Pick<ChannelLayerSource, 'id' | 'files'> | null | undefined) => number;
  createChannelSource: (name: string) => ChannelSource;
  createLayerSource: (files: File[]) => ChannelLayerSource;
  updateChannelIdCounter: (sources: ChannelSource[]) => void;
  channelValidationList: Array<{
    channelId: string;
    errors: string[];
    warnings: string[];
    layerCount: number;
    timepointCount: number;
  }>;
  channelValidationMap: Map<string, ChannelValidation>;
  hasGlobalTimepointMismatch: boolean;
  hasAnyLayers: boolean;
  hasLoadingTracks: boolean;
  allChannelsValid: boolean;
  applyLoadedLayers: (
    normalizedLayers: LoadedLayer[],
    expectedVolumeCount: number,
    options: ApplyLoadedLayersOptions
  ) => void;
  loadSelectedDataset: (options: LoadSelectedDatasetOptions) => Promise<LoadedLayer[] | null>;
  createLayerDefaultSettings: (layerKey: string) => LayerSettings;
  layerAutoThresholdsRef: MutableRefObject<Record<string, number>>;
};

export function useChannelSources(): ChannelSourcesApi {
  const [channels, setChannels] = useState<ChannelSource[]>([]);
  const [layerTimepointCounts, setLayerTimepointCounts] = useState<Record<string, number>>({});
  const channelIdRef = useRef(0);
  const layerIdRef = useRef(0);
  const trackSetIdRef = useRef(0);

  const computeLayerTimepointCount = useCallback(async (files: File[]): Promise<number> => {
    let totalSlices = 0;
    for (const file of files) {
      const tiff = await fromBlob(file);
      totalSlices += await tiff.getImageCount();
    }
    return totalSlices;
  }, []);

  const getLayerTimepointCount = useCallback(
    (layer: Pick<ChannelLayerSource, 'id' | 'files'> | null | undefined): number => {
      if (!layer) {
        return 0;
      }
      return layerTimepointCounts[layer.id] ?? layer.files.length;
    },
    [layerTimepointCounts]
  );
  const resolveKnownLayerTimepointCount = useCallback(
    (layer: Pick<ChannelLayerSource, 'id' | 'files'> | null | undefined): number | null => {
      return getKnownLayerTimepointCount(layer, layerTimepointCounts);
    },
    [layerTimepointCounts]
  );

  const {
    layerAutoThresholdsRef,
    applyLoadedLayers,
    loadSelectedDataset,
    createLayerDefaultSettings
  } = useChannelDatasetLoader({
    getLayerTimepointCount
  });

  const createChannelSource = useCallback((name: string): ChannelSource => {
    const nextId = channelIdRef.current + 1;
    channelIdRef.current = nextId;
    return {
      id: `channel-${nextId}`,
      name,
      layers: [],
      trackSets: []
    };
  }, []);

  const createLayerSource = useCallback((files: File[]): ChannelLayerSource => {
    const nextId = layerIdRef.current + 1;
    layerIdRef.current = nextId;
    return {
      id: `layer-${nextId}`,
      files,
      isSegmentation: false
    };
  }, []);

  const updateChannelIdCounter = useCallback((sources: ChannelSource[]) => {
    let maxId = channelIdRef.current;
    for (const source of sources) {
      const match = /([0-9]+)$/.exec(source.id);
      if (!match) {
        continue;
      }
      const value = Number.parseInt(match[1], 10);
      if (Number.isFinite(value) && value > maxId) {
        maxId = value;
      }
    }
    channelIdRef.current = maxId;
  }, []);

  const channelValidationList = useMemo(() => {
    return channels.map((channel) => {
      const errors: string[] = [];
      const warnings: string[] = [];

      if (!channel.name.trim()) {
        errors.push('Name this channel.');
      }

      const primaryLayer = channel.layers[0] ?? null;
      if (!primaryLayer) {
        errors.push('Add a volume to this channel.');
      } else if (primaryLayer.files.length === 0) {
        errors.push('Add files to the volume in this channel.');
      }
      const knownTimepointCount = resolveKnownLayerTimepointCount(primaryLayer);
      if (hasPendingLayerTimepointCount(primaryLayer, layerTimepointCounts)) {
        warnings.push('Timepoint count is still being calculated.');
      }

      const trackSetErrors = channel.trackSets
        .filter((set) => set.status === 'error' && set.error)
        .map((set) => set.error as string);
      if (trackSetErrors.length > 0) {
        errors.push(...trackSetErrors);
      } else if (channel.trackSets.some((set) => set.status === 'loading')) {
        warnings.push('Tracks are still loading.');
      } else if (channel.layers.length > 0 && channel.trackSets.length === 0) {
        warnings.push('No tracks attached to this channel.');
      }

      return {
        channelId: channel.id,
        errors,
        warnings,
        layerCount: channel.layers.length,
        timepointCount: knownTimepointCount ?? 0
      };
    });
  }, [channels, layerTimepointCounts, resolveKnownLayerTimepointCount]);

  const channelValidationMap = useMemo(() => {
    const map = new Map<string, ChannelValidation>();
    for (const entry of channelValidationList) {
      map.set(entry.channelId, { errors: entry.errors, warnings: entry.warnings });
    }
    return map;
  }, [channelValidationList]);

  const hasGlobalTimepointMismatch = useMemo(() => {
    return computeGlobalTimepointMismatch(channels, layerTimepointCounts);
  }, [channels, layerTimepointCounts]);

  const hasAnyLayers = useMemo(
    () => channels.some((channel) => channel.layers.some((layer) => layer.files.length > 0)),
    [channels]
  );

  const hasLoadingTracks = useMemo(
    () => channels.some((channel) => channel.trackSets.some((set) => set.status === 'loading')),
    [channels]
  );

  const allChannelsValid = useMemo(
    () => channelValidationList.every((entry) => entry.errors.length === 0),
    [channelValidationList]
  );

  return {
    channels,
    setChannels,
    layerTimepointCounts,
    setLayerTimepointCounts,
    channelIdRef,
    layerIdRef,
    trackSetIdRef,
    computeLayerTimepointCount,
    getLayerTimepointCount,
    createChannelSource,
    createLayerSource,
    updateChannelIdCounter,
    channelValidationList,
    channelValidationMap,
    hasGlobalTimepointMismatch,
    hasAnyLayers,
    hasLoadingTracks,
    allChannelsValid,
    applyLoadedLayers,
    loadSelectedDataset,
    createLayerDefaultSettings,
    layerAutoThresholdsRef
  };
}
