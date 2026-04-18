import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction
} from 'react';
import { fromBlob } from 'geotiff';
import { findDuplicateEntityNameKeys, normalizeEntityName, normalizeEntityNameKey } from '../../constants/naming';
import type {
  PreprocessedChannelSummary,
  PreprocessedManifest,
  PreprocessedTrackSetSummary
} from '../../shared/utils/preprocessedDataset';
import type { PreprocessedStorageHandle } from '../../shared/storage/preprocessedStorage';
import {
  computeGlobalTimepointMismatch,
  getLayerTimepointCountError,
  getKnownLayerTimepointCount,
  hasPendingLayerTimepointCount,
} from './channelTimepointValidation';
import type {
  CompiledTrackSetHeader,
  CompiledTrackSetPayload,
  CompiledTrackSummary,
  TrackTimepointConvention
} from '../../types/tracks';
export { isSegmentationChannelSource } from './channelClassification';

export type LoadState = 'idle' | 'loading' | 'loaded' | 'error';

export type ChannelVolumeSource = {
  id: string;
  files: File[];
  isSegmentation: boolean;
  sourceChannels?: number;
  sourceDataType?: import('../../types/volume').VolumeDataType;
  componentIndex?: number;
  multichannelOwnerChannelId?: string | null;
};

export type ChannelSourceType = 'channel' | 'segmentation';

export type TrackSetSource = {
  id: string;
  name: string;
  boundChannelId: string | null;
  timepointConvention: TrackTimepointConvention;
  file: File | null;
  fileName: string;
  status: LoadState;
  error: string | null;
  compiledHeader: CompiledTrackSetHeader | null;
  loadCompiledCatalog: (() => Promise<CompiledTrackSummary[]>) | null;
  loadCompiledPayload: (() => Promise<CompiledTrackSetPayload>) | null;
};

export type ChannelSource = {
  id: string;
  name: string;
  volume: ChannelVolumeSource | null;
  channelType?: ChannelSourceType;
};

export function getChannelVolumeSourceChannels(volume: Pick<ChannelVolumeSource, 'sourceChannels'> | null | undefined): number {
  const sourceChannels = volume?.sourceChannels;
  if (typeof sourceChannels === 'number' && Number.isFinite(sourceChannels) && sourceChannels >= 1) {
    return Math.floor(sourceChannels);
  }
  return 1;
}

export function getChannelVolumeComponentIndex(
  volume: Pick<ChannelVolumeSource, 'componentIndex'> | null | undefined
): number {
  const componentIndex = volume?.componentIndex;
  if (typeof componentIndex === 'number' && Number.isFinite(componentIndex) && componentIndex >= 0) {
    return Math.floor(componentIndex);
  }
  return 0;
}

export function getChannelVolumeMultichannelOwnerId(
  volume: Pick<ChannelVolumeSource, 'multichannelOwnerChannelId'> | null | undefined
): string | null {
  return typeof volume?.multichannelOwnerChannelId === 'string' && volume.multichannelOwnerChannelId.length > 0
    ? volume.multichannelOwnerChannelId
    : null;
}

export function isMultichannelVolumeSource(volume: ChannelVolumeSource | null | undefined): boolean {
  return getChannelVolumeSourceChannels(volume) > 1;
}

export function isMultichannelDerivedChannelSource(channel: ChannelSource | null | undefined): boolean {
  if (!channel?.volume || !isMultichannelVolumeSource(channel.volume)) {
    return false;
  }
  const ownerId = getChannelVolumeMultichannelOwnerId(channel.volume);
  return ownerId !== null && ownerId !== channel.id;
}

export function isMultichannelOwnerChannelSource(channel: ChannelSource | null | undefined): boolean {
  if (!channel?.volume || !isMultichannelVolumeSource(channel.volume)) {
    return false;
  }
  const ownerId = getChannelVolumeMultichannelOwnerId(channel.volume);
  return ownerId === channel.id && getChannelVolumeComponentIndex(channel.volume) === 0;
}

export function getOwnedMultichannelDerivedChannels(
  channels: readonly ChannelSource[],
  ownerChannelId: string
): ChannelSource[] {
  return channels
    .filter((channel) => {
      if (!channel.volume || !isMultichannelVolumeSource(channel.volume)) {
        return false;
      }
      return getChannelVolumeMultichannelOwnerId(channel.volume) === ownerChannelId && channel.id !== ownerChannelId;
    })
    .sort((left, right) => {
      return getChannelVolumeComponentIndex(left.volume) - getChannelVolumeComponentIndex(right.volume);
    });
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
  layerTimepointCountErrors: Record<string, string>;
  setLayerTimepointCountErrors: Dispatch<SetStateAction<Record<string, string>>>;
  channelIdRef: MutableRefObject<number>;
  layerIdRef: MutableRefObject<number>;
  trackSetIdRef: MutableRefObject<number>;
  computeLayerTimepointCount: (files: File[]) => Promise<number>;
  getLayerTimepointCount: (layer: Pick<ChannelVolumeSource, 'id' | 'files'> | null | undefined) => number;
  createChannelSource: (name: string, channelType?: ChannelSourceType) => ChannelSource;
  createVolumeSource: (files: File[]) => ChannelVolumeSource;
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
};

export function useChannelSources(): ChannelSourcesApi {
  const [channels, setChannels] = useState<ChannelSource[]>([]);
  const [tracks, setTracks] = useState<TrackSetSource[]>([]);
  const [layerTimepointCounts, setLayerTimepointCounts] = useState<Record<string, number>>({});
  const [layerTimepointCountErrors, setLayerTimepointCountErrors] = useState<Record<string, string>>({});
  const channelIdRef = useRef(0);
  const layerIdRef = useRef(0);
  const trackSetIdRef = useRef(0);

  const computeLayerTimepointCount = useCallback(async (files: File[]): Promise<number> => {
    let totalSlices = 0;
    for (const file of files) {
      const tiff = await fromBlob(file);
      totalSlices += await tiff.getImageCount();
    }
    if (!Number.isFinite(totalSlices) || Math.floor(totalSlices) !== totalSlices || totalSlices <= 0) {
      throw new Error('TIFF sequence did not expose a valid positive timepoint count.');
    }
    return totalSlices;
  }, []);

  const getLayerTimepointCount = useCallback(
    (layer: Pick<ChannelVolumeSource, 'id' | 'files'> | null | undefined): number => {
      if (!layer) {
        return 0;
      }
      return layerTimepointCounts[layer.id] ?? 0;
    },
    [layerTimepointCounts]
  );
  const resolveKnownLayerTimepointCount = useCallback(
    (layer: Pick<ChannelVolumeSource, 'id' | 'files'> | null | undefined): number | null => {
      return getKnownLayerTimepointCount(layer, layerTimepointCounts, layerTimepointCountErrors);
    },
    [layerTimepointCountErrors, layerTimepointCounts]
  );

  useEffect(() => {
    const knownLayerIds = new Set<string>();
    for (const channel of channels) {
      if (channel.volume) {
        knownLayerIds.add(channel.volume.id);
      }
    }
    setLayerTimepointCounts((current) => {
      let changed = false;
      const next: Record<string, number> = {};
      for (const [layerId, count] of Object.entries(current)) {
        if (!knownLayerIds.has(layerId)) {
          changed = true;
          continue;
        }
        next[layerId] = count;
      }
      return changed ? next : current;
    });
    setLayerTimepointCountErrors((current) => {
      let changed = false;
      const next: Record<string, string> = {};
      for (const [layerId, message] of Object.entries(current)) {
        if (!knownLayerIds.has(layerId)) {
          changed = true;
          continue;
        }
        next[layerId] = message;
      }
      return changed ? next : current;
    });
  }, [channels]);

  const createChannelSource = useCallback((name: string, channelType: ChannelSourceType = 'channel'): ChannelSource => {
    const nextId = channelIdRef.current + 1;
    channelIdRef.current = nextId;
    return {
      id: `channel-${nextId}`,
      name,
      volume: null,
      channelType
    };
  }, []);

  const createVolumeSource = useCallback((files: File[]): ChannelVolumeSource => {
    const nextId = layerIdRef.current + 1;
    layerIdRef.current = nextId;
    return {
      id: `layer-${nextId}`,
      files,
      isSegmentation: false,
      sourceChannels: 1,
      sourceDataType: undefined,
      componentIndex: 0,
      multichannelOwnerChannelId: null
    };
  }, []);

  const createTrackSetSource = useCallback((name: string, boundChannelId: string | null): TrackSetSource => {
    const nextId = trackSetIdRef.current + 1;
    trackSetIdRef.current = nextId;
    return {
      id: `track-set-${nextId}`,
      name,
      boundChannelId,
      timepointConvention: 'zero-based',
      file: null,
      fileName: '',
      status: 'idle',
      error: null,
      compiledHeader: null,
      loadCompiledCatalog: null,
      loadCompiledPayload: null
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

      const primaryLayer = channel.volume;
      if (!primaryLayer) {
        errors.push('Add a volume to this channel.');
      } else if (primaryLayer.files.length === 0) {
        errors.push('Add files to the volume in this channel.');
      }
      const knownTimepointCount = resolveKnownLayerTimepointCount(primaryLayer);
      const timepointCountError = getLayerTimepointCountError(primaryLayer, layerTimepointCountErrors);
      if (timepointCountError) {
        errors.push(timepointCountError);
      } else if (hasPendingLayerTimepointCount(primaryLayer, layerTimepointCounts, layerTimepointCountErrors)) {
        warnings.push('Timepoint count is still being calculated.');
      }

      return {
        channelId: channel.id,
        errors,
        warnings,
        layerCount: channel.volume ? 1 : 0,
        timepointCount: knownTimepointCount ?? 0
      };
    });
  }, [channels, layerTimepointCountErrors, layerTimepointCounts, resolveKnownLayerTimepointCount]);

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
    return computeGlobalTimepointMismatch(channels, layerTimepointCounts, layerTimepointCountErrors);
  }, [channels, layerTimepointCountErrors, layerTimepointCounts]);

  const hasAnyLayers = useMemo(
    () => channels.some((channel) => (channel.volume?.files.length ?? 0) > 0),
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
    layerTimepointCountErrors,
    setLayerTimepointCountErrors,
    channelIdRef,
    layerIdRef,
    trackSetIdRef,
    computeLayerTimepointCount,
    getLayerTimepointCount,
    createChannelSource,
    createVolumeSource,
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
  };
}
