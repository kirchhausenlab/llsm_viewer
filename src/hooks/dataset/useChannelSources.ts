import { useCallback, useMemo, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { fromBlob } from 'geotiff';
import { findDuplicateEntityNameKeys, normalizeEntityName, normalizeEntityNameKey } from '../../constants/naming';
import type {
  PreprocessedChannelSummary,
  PreprocessedManifest,
  PreprocessedTrackSetSummary
} from '../../shared/utils/preprocessedDataset';
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

export type ChannelSourceType = 'channel' | 'segmentation';

export type TrackSetSource = {
  id: string;
  name: string;
  boundChannelId: string | null;
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
  channelType?: ChannelSourceType;
};

export function isSegmentationChannelSource(channel: Pick<ChannelSource, 'channelType' | 'layers'>): boolean {
  if (channel.channelType === 'segmentation') {
    return true;
  }
  if (channel.channelType === 'channel') {
    return false;
  }
  if (channel.layers.length === 0) {
    return false;
  }
  return channel.layers.every((layer) => layer.isSegmentation);
}

export type ChannelValidation = {
  errors: string[];
  warnings: string[];
};

export type TrackValidation = {
  errors: string[];
  warnings: string[];
};

export type StagedPreprocessedExperiment = {
  manifest: PreprocessedManifest;
  channelSummaries: PreprocessedChannelSummary[];
  trackSummaries: PreprocessedTrackSetSummary[];
  totalVolumeCount: number;
  storageHandle: PreprocessedStorageHandle;
  sourceName: string | null;
  sourceSize: number | null;
};

export type ChannelSourcesApi = {
  channels: ChannelSource[];
  setChannels: Dispatch<SetStateAction<ChannelSource[]>>;
  tracks: TrackSetSource[];
  setTracks: Dispatch<SetStateAction<TrackSetSource[]>>;
  layerTimepointCounts: Record<string, number>;
  setLayerTimepointCounts: Dispatch<SetStateAction<Record<string, number>>>;
  channelIdRef: MutableRefObject<number>;
  layerIdRef: MutableRefObject<number>;
  trackSetIdRef: MutableRefObject<number>;
  computeLayerTimepointCount: (files: File[]) => Promise<number>;
  getLayerTimepointCount: (layer: Pick<ChannelLayerSource, 'id' | 'files'> | null | undefined) => number;
  createChannelSource: (name: string, channelType?: ChannelSourceType) => ChannelSource;
  createLayerSource: (files: File[]) => ChannelLayerSource;
  createTrackSetSource: (name: string, boundChannelId: string | null) => TrackSetSource;
  updateChannelIdCounter: (sources: ChannelSource[]) => void;
  updateTrackSetIdCounter: (sources: TrackSetSource[]) => void;
  channelValidationList: Array<{
    channelId: string;
    errors: string[];
    warnings: string[];
    layerCount: number;
    timepointCount: number;
  }>;
  channelValidationMap: Map<string, ChannelValidation>;
  trackValidationMap: Map<string, TrackValidation>;
  hasGlobalTimepointMismatch: boolean;
  hasAnyLayers: boolean;
  hasLoadingTracks: boolean;
  hasTrackErrors: boolean;
  allChannelsValid: boolean;
  allTracksValid: boolean;
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
  const [tracks, setTracks] = useState<TrackSetSource[]>([]);
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

  const createChannelSource = useCallback((name: string, channelType: ChannelSourceType = 'channel'): ChannelSource => {
    const nextId = channelIdRef.current + 1;
    channelIdRef.current = nextId;
    return {
      id: `channel-${nextId}`,
      name,
      layers: [],
      channelType
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

  const createTrackSetSource = useCallback((name: string, boundChannelId: string | null): TrackSetSource => {
    const nextId = trackSetIdRef.current + 1;
    trackSetIdRef.current = nextId;
    return {
      id: `track-set-${nextId}`,
      name,
      boundChannelId,
      file: null,
      fileName: '',
      status: 'idle',
      error: null,
      entries: []
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

  const updateTrackSetIdCounter = useCallback((sources: TrackSetSource[]) => {
    let maxId = trackSetIdRef.current;
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
    trackSetIdRef.current = maxId;
  }, []);

  const channelValidationList = useMemo(() => {
    const duplicateChannelNameKeys = findDuplicateEntityNameKeys(channels.map((channel) => channel.name));

    return channels.map((channel) => {
      const errors: string[] = [];
      const warnings: string[] = [];
      const normalizedName = normalizeEntityName(channel.name);
      const normalizedNameKey = normalizeEntityNameKey(channel.name);

      if (!normalizedName) {
        errors.push('Name this channel.');
      }
      if (normalizedName && duplicateChannelNameKeys.has(normalizedNameKey)) {
        errors.push('Channel name must be unique.');
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

      return {
        channelId: channel.id,
        errors,
        warnings,
        layerCount: channel.layers.length,
        timepointCount: knownTimepointCount ?? 0
      };
    });
  }, [channels, layerTimepointCounts, resolveKnownLayerTimepointCount]);

  const trackValidationList = useMemo(() => {
    const duplicateTrackNameKeys = findDuplicateEntityNameKeys(tracks.map((trackSet) => trackSet.name));

    return tracks.map((trackSet) => {
      const errors: string[] = [];
      const warnings: string[] = [];
      const normalizedName = normalizeEntityName(trackSet.name);
      const normalizedNameKey = normalizeEntityNameKey(trackSet.name);

      if (!normalizedName) {
        errors.push('Name this track.');
      }
      if (normalizedName && duplicateTrackNameKeys.has(normalizedNameKey)) {
        errors.push('Track name must be unique.');
      }

      return {
        trackSetId: trackSet.id,
        errors,
        warnings
      };
    });
  }, [tracks]);

  const channelValidationMap = useMemo(() => {
    const map = new Map<string, ChannelValidation>();
    for (const entry of channelValidationList) {
      map.set(entry.channelId, { errors: entry.errors, warnings: entry.warnings });
    }
    return map;
  }, [channelValidationList]);

  const trackValidationMap = useMemo(() => {
    const map = new Map<string, TrackValidation>();
    for (const entry of trackValidationList) {
      map.set(entry.trackSetId, { errors: entry.errors, warnings: entry.warnings });
    }
    return map;
  }, [trackValidationList]);

  const hasGlobalTimepointMismatch = useMemo(() => {
    return computeGlobalTimepointMismatch(channels, layerTimepointCounts);
  }, [channels, layerTimepointCounts]);

  const hasAnyLayers = useMemo(
    () => channels.some((channel) => channel.layers.some((layer) => layer.files.length > 0)),
    [channels]
  );

  const hasLoadingTracks = useMemo(
    () => tracks.some((trackSet) => trackSet.status === 'loading'),
    [tracks]
  );

  const hasTrackErrors = useMemo(
    () => tracks.some((trackSet) => trackSet.status === 'error'),
    [tracks]
  );

  const allChannelsValid = useMemo(
    () => channelValidationList.every((entry) => entry.errors.length === 0),
    [channelValidationList]
  );

  const allTracksValid = useMemo(
    () => trackValidationList.every((entry) => entry.errors.length === 0) && !hasTrackErrors,
    [hasTrackErrors, trackValidationList]
  );

  return {
    channels,
    setChannels,
    tracks,
    setTracks,
    layerTimepointCounts,
    setLayerTimepointCounts,
    channelIdRef,
    layerIdRef,
    trackSetIdRef,
    computeLayerTimepointCount,
    getLayerTimepointCount,
    createChannelSource,
    createLayerSource,
    createTrackSetSource,
    updateChannelIdCounter,
    updateTrackSetIdCounter,
    channelValidationList,
    channelValidationMap,
    trackValidationMap,
    hasGlobalTimepointMismatch,
    hasAnyLayers,
    hasLoadingTracks,
    hasTrackErrors,
    allChannelsValid,
    allTracksValid,
    applyLoadedLayers,
    loadSelectedDataset,
    createLayerDefaultSettings,
    layerAutoThresholdsRef
  };
}
