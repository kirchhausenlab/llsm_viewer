import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction
} from 'react';

import { clearTextureCache } from '../../../core/textureCache';
import type {
  VolumeBrickAtlas,
  VolumeBrickPageTable,
  VolumeProvider,
  VolumeProviderDiagnostics
} from '../../../core/volumeProvider';
import type { NormalizedVolume } from '../../../core/volumeProcessing';
import type { PreprocessedLayerScaleManifestEntry } from '../../../shared/utils/preprocessedDataset/types';
import type { LoadedDatasetLayer, StagedPreprocessedExperiment } from '../../../hooks/dataset';
import { buildCandidateScaleLevels, resolvePreferredScaleLevel, type ViewerQualityProfile } from './multiscaleQualityPolicy';

type SetLaunchProgressOptions = {
  loadedCount: number;
  totalCount: number;
};

type UseRouteLayerVolumesOptions = {
  isViewerLaunched: boolean;
  isLaunchingViewer: boolean;
  qualityProfile: ViewerQualityProfile;
  preprocessedExperiment: StagedPreprocessedExperiment | null;
  volumeProvider: VolumeProvider | null;
  loadedChannelIds: string[];
  channelLayersMap: Map<string, LoadedDatasetLayer[]>;
  channelActiveLayer: Record<string, string>;
  channelVisibility: Record<string, boolean>;
  layerChannelMap: Map<string, string>;
  preferBrickResidency: boolean;
  playbackAtlasScaleLevelByLayerKey?: Record<string, number>;
  volumeTimepointCount: number;
  selectedIndex: number;
  clearDatasetError: () => void;
  beginLaunchSession: () => void;
  setLaunchExpectedVolumeCount: (count: number) => void;
  setLaunchProgress: (options: SetLaunchProgressOptions) => void;
  completeLaunchSession: (totalCount: number) => void;
  failLaunchSession: (message: string) => void;
  finishLaunchSessionAttempt: () => void;
  setSelectedIndex: Dispatch<SetStateAction<number>>;
  setIsPlaying: Dispatch<SetStateAction<boolean>>;
  showLaunchError: (message: string) => void;
};

type RouteLayerVolumesState = {
  currentLayerVolumes: Record<string, NormalizedVolume | null>;
  currentLayerPageTables: Record<string, VolumeBrickPageTable | null>;
  currentLayerBrickAtlases: Record<string, VolumeBrickAtlas | null>;
  volumeProviderDiagnostics: VolumeProviderDiagnostics | null;
  setCurrentLayerVolumes: Dispatch<SetStateAction<Record<string, NormalizedVolume | null>>>;
  playbackLayerKeys: string[];
  handleLaunchViewer: () => Promise<void>;
};

const DIAGNOSTICS_POLL_INTERVAL_MS = 500;
const MAX_BRICK_ATLAS_DEPTH_HINT_BY_PROFILE: Record<ViewerQualityProfile, number> = {
  inspect: 3072,
  interactive: 2560,
  playback: 2048
};
const MAX_BRICK_ATLAS_BYTES_HINT_BY_PROFILE: Record<ViewerQualityProfile, number> = {
  inspect: 768 * 1024 * 1024,
  interactive: 512 * 1024 * 1024,
  playback: 384 * 1024 * 1024
};
const MAX_VOLUME_BYTES_HINT_BY_PROFILE: Record<ViewerQualityProfile, number> = {
  inspect: 768 * 1024 * 1024,
  interactive: 512 * 1024 * 1024,
  playback: 384 * 1024 * 1024
};

function isAbortLikeError(error: unknown): boolean {
  return (
    (typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  );
}

function createAbortError(): Error {
  if (typeof DOMException !== 'undefined') {
    try {
      return new DOMException('The operation was aborted.', 'AbortError');
    } catch {
      // Fall back to Error below.
    }
  }
  const error = new Error('The operation was aborted.');
  error.name = 'AbortError';
  return error;
}

function throwIfAborted(signal: AbortSignal | null | undefined): void {
  if (!signal?.aborted) {
    return;
  }
  if (signal.reason instanceof Error) {
    throw signal.reason;
  }
  throw createAbortError();
}

function isAllocationLikeError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message.toLowerCase();
  return (
    message.includes('array buffer allocation failed') ||
    message.includes('allocation failed') ||
    message.includes('invalid typed array length') ||
    message.includes('out of memory') ||
    message.includes('cannot allocate')
  );
}

function getTextureChannelCountForSourceChannels(sourceChannels: number): number {
  if (sourceChannels <= 1) {
    return 1;
  }
  if (sourceChannels === 2) {
    return 2;
  }
  return 4;
}

function getBytesPerValueForDataType(dataType: string | undefined): number {
  switch (dataType) {
    case 'uint8':
    case 'int8':
      return 1;
    case 'uint16':
    case 'int16':
      return 2;
    case 'uint32':
    case 'int32':
    case 'float32':
      return 4;
    case 'float64':
      return 8;
    default:
      return 1;
  }
}

function selectDeterministicLayerKey(layers: ReadonlyArray<{ key: string }>): string | null {
  if (layers.length === 0) {
    return null;
  }
  return [...layers].sort((left, right) => left.key.localeCompare(right.key))[0]?.key ?? null;
}

function collectActiveLayerKeys(
  loadedChannelIds: string[],
  channelLayersMap: Map<string, LoadedDatasetLayer[]>,
  channelActiveLayer: Record<string, string>
): string[] {
  const keys: string[] = [];
  for (const channelId of loadedChannelIds) {
    const channelLayers = channelLayersMap.get(channelId) ?? [];
    if (channelLayers.length === 0) {
      continue;
    }

    const selectedLayerKey = channelActiveLayer[channelId];
    const selectedLayer = selectedLayerKey
      ? channelLayers.find((layer) => layer.key === selectedLayerKey) ?? null
      : null;
    const resolvedLayerKey = selectedLayer?.key ?? selectDeterministicLayerKey(channelLayers);
    if (resolvedLayerKey) {
      keys.push(resolvedLayerKey);
    }
  }
  return keys;
}

function buildLayerResidencyModeMap({
  channelLayersMap,
  preferBrickResidency,
  canUseAtlas
}: {
  channelLayersMap: Map<string, LoadedDatasetLayer[]>;
  preferBrickResidency: boolean;
  canUseAtlas: boolean;
}): Map<string, 'volume' | 'atlas'> {
  const modeByKey = new Map<string, 'volume' | 'atlas'>();
  for (const layers of channelLayersMap.values()) {
    for (const layer of layers) {
      const useAtlas = preferBrickResidency && canUseAtlas && layer.depth > 1 && !layer.isSegmentation;
      modeByKey.set(layer.key, useAtlas ? 'atlas' : 'volume');
    }
  }
  return modeByKey;
}

export function useRouteLayerVolumes({
  isViewerLaunched,
  isLaunchingViewer,
  qualityProfile,
  preprocessedExperiment,
  volumeProvider,
  loadedChannelIds,
  channelLayersMap,
  channelActiveLayer,
  channelVisibility,
  layerChannelMap,
  preferBrickResidency,
  playbackAtlasScaleLevelByLayerKey,
  volumeTimepointCount,
  selectedIndex,
  clearDatasetError,
  beginLaunchSession,
  setLaunchExpectedVolumeCount,
  setLaunchProgress,
  completeLaunchSession,
  failLaunchSession,
  finishLaunchSessionAttempt,
  setSelectedIndex,
  setIsPlaying,
  showLaunchError
}: UseRouteLayerVolumesOptions): RouteLayerVolumesState {
  const [currentLayerVolumes, setCurrentLayerVolumes] = useState<Record<string, NormalizedVolume | null>>({});
  const [currentLayerPageTables, setCurrentLayerPageTables] = useState<Record<string, VolumeBrickPageTable | null>>(
    {}
  );
  const [currentLayerBrickAtlases, setCurrentLayerBrickAtlases] = useState<Record<string, VolumeBrickAtlas | null>>(
    {}
  );
  const [volumeProviderDiagnostics, setVolumeProviderDiagnostics] = useState<VolumeProviderDiagnostics | null>(null);
  const volumeLoadRequestRef = useRef(0);
  const volumeLoadAbortControllerRef = useRef<AbortController | null>(null);
  const showLaunchErrorRef = useRef(showLaunchError);
  const maxBrickAtlasDepthHint = useMemo(() => MAX_BRICK_ATLAS_DEPTH_HINT_BY_PROFILE[qualityProfile], [qualityProfile]);
  const maxBrickAtlasBytesHint = useMemo(() => MAX_BRICK_ATLAS_BYTES_HINT_BY_PROFILE[qualityProfile], [qualityProfile]);
  const maxVolumeBytesHint = useMemo(() => MAX_VOLUME_BYTES_HINT_BY_PROFILE[qualityProfile], [qualityProfile]);
  const canUseAtlas = typeof volumeProvider?.getBrickAtlas === 'function';
  const layerScaleLevelsByKey = useMemo(() => {
    const map = new Map<string, number[]>();
    const manifest = preprocessedExperiment?.manifest;
    if (!manifest) {
      return map;
    }
    for (const channel of manifest.dataset.channels) {
      for (const layer of channel.layers) {
        const levels = Array.from(new Set(layer.zarr.scales.map((scale) => scale.level))).sort((left, right) => left - right);
        map.set(layer.key, levels.length > 0 ? levels : [0]);
      }
    }
    return map;
  }, [preprocessedExperiment?.manifest]);
  const layerScalesByLevelByKey = useMemo(() => {
    const map = new Map<string, Map<number, PreprocessedLayerScaleManifestEntry>>();
    const manifest = preprocessedExperiment?.manifest;
    if (!manifest) {
      return map;
    }
    for (const channel of manifest.dataset.channels) {
      for (const layer of channel.layers) {
        const byLevel = new Map<number, PreprocessedLayerScaleManifestEntry>();
        for (const scale of layer.zarr.scales) {
          byLevel.set(scale.level, scale);
        }
        map.set(layer.key, byLevel);
      }
    }
    return map;
  }, [preprocessedExperiment?.manifest]);
  const resolvePreferredAtlasScaleLevel = useCallback(
    (layerKey: string): number => {
      const levels = layerScaleLevelsByKey.get(layerKey) ?? [0];
      return resolvePreferredScaleLevel({
        knownScaleLevels: levels,
        configuredScaleLevel: playbackAtlasScaleLevelByLayerKey?.[layerKey],
        qualityProfile
      });
    },
    [layerScaleLevelsByKey, playbackAtlasScaleLevelByLayerKey, qualityProfile]
  );
  const layerResidencyModeByKeyRef = useRef<Map<string, 'volume' | 'atlas'>>(
    buildLayerResidencyModeMap({ channelLayersMap, preferBrickResidency, canUseAtlas })
  );

  useEffect(() => {
    showLaunchErrorRef.current = showLaunchError;
  }, [showLaunchError]);

  useEffect(() => {
    layerResidencyModeByKeyRef.current = buildLayerResidencyModeMap({
      channelLayersMap,
      preferBrickResidency,
      canUseAtlas
    });
  }, [canUseAtlas, channelLayersMap, preferBrickResidency]);

  const loadLayerTimepointResources = useCallback(
    async (
      layerKey: string,
      timeIndex: number,
      options?: { signal?: AbortSignal | null }
    ): Promise<{
      volume: NormalizedVolume | null;
      pageTable: VolumeBrickPageTable | null;
      brickAtlas: VolumeBrickAtlas | null;
    }> => {
      const signal = options?.signal ?? null;
      throwIfAborted(signal);
      const residencyMode = layerResidencyModeByKeyRef.current.get(layerKey) ?? 'volume';
      const shouldLoadBrickAtlas =
        residencyMode === 'atlas' && typeof volumeProvider?.getBrickAtlas === 'function';

      if (shouldLoadBrickAtlas) {
        // Keep atlas playback on the atlas/page-table path only.
        // Pulling full volumes here regresses playback throughput and cache miss diagnostics.
        const preferredScaleLevel = resolvePreferredAtlasScaleLevel(layerKey);
        const knownLevels = layerScaleLevelsByKey.get(layerKey) ?? [preferredScaleLevel];
        const candidateScaleLevels = buildCandidateScaleLevels({
          knownScaleLevels: knownLevels,
          preferredScaleLevel
        });

        let lastError: unknown = null;
        for (const scaleLevel of candidateScaleLevels) {
          throwIfAborted(signal);
          const scale = layerScalesByLevelByKey.get(layerKey)?.get(scaleLevel) ?? null;
          const sourceChannels = scale?.channels ?? 1;
          const textureChannels = getTextureChannelCountForSourceChannels(sourceChannels);

          if (typeof volumeProvider?.getBrickPageTable === 'function') {
            const pageTable = await volumeProvider.getBrickPageTable(layerKey, timeIndex, { scaleLevel, signal });
            throwIfAborted(signal);
            const [chunkDepth, chunkHeight, chunkWidth] = pageTable.chunkShape;
            const estimatedAtlasDepth = chunkDepth * pageTable.occupiedBrickCount;
            const estimatedAtlasBytes = chunkWidth * chunkHeight * estimatedAtlasDepth * textureChannels;
            if (estimatedAtlasDepth > maxBrickAtlasDepthHint || estimatedAtlasBytes > maxBrickAtlasBytesHint) {
              continue;
            }
          }

          try {
            const atlas = await volumeProvider!.getBrickAtlas!(layerKey, timeIndex, { scaleLevel, signal });
            throwIfAborted(signal);
            if (!atlas.enabled) {
              continue;
            }
            if (atlas.depth > maxBrickAtlasDepthHint) {
              continue;
            }
            if (atlas.data.byteLength > maxBrickAtlasBytesHint) {
              continue;
            }
            return {
              volume: null,
              pageTable: atlas.pageTable,
              brickAtlas: atlas
            };
          } catch (error) {
            if (isAllocationLikeError(error)) {
              lastError = error;
              continue;
            }
            throw error;
          }
        }

        if (lastError instanceof Error) {
          throw lastError;
        }
        throw new Error(`Brick atlas is unavailable for layer "${layerKey}" at timepoint ${timeIndex}.`);
      }

      const preferredScaleLevel = resolvePreferredAtlasScaleLevel(layerKey);
      const knownLevels = layerScaleLevelsByKey.get(layerKey) ?? [preferredScaleLevel];
      const candidateScaleLevels = buildCandidateScaleLevels({
        knownScaleLevels: knownLevels,
        preferredScaleLevel
      });

      let lastVolumeError: unknown = null;
      for (let index = 0; index < candidateScaleLevels.length; index += 1) {
        const scaleLevel = candidateScaleLevels[index] ?? 0;
        const isLastCandidate = index === candidateScaleLevels.length - 1;
        const scale = layerScalesByLevelByKey.get(layerKey)?.get(scaleLevel) ?? null;
        const bytesPerValue = getBytesPerValueForDataType(scale?.zarr.data.dataType);
        const estimatedVolumeBytes = scale
          ? scale.width * scale.height * scale.depth * scale.channels * bytesPerValue
          : 0;
        if (!isLastCandidate && estimatedVolumeBytes > maxVolumeBytesHint) {
          continue;
        }

        try {
          const [volume, pageTable] = await Promise.all([
            volumeProvider!.getVolume(layerKey, timeIndex, { scaleLevel, signal }),
            typeof volumeProvider?.getBrickPageTable === 'function'
              ? volumeProvider.getBrickPageTable(layerKey, timeIndex, { scaleLevel, signal })
              : Promise.resolve(null)
          ]);
          throwIfAborted(signal);
          return {
            volume,
            pageTable,
            brickAtlas: null
          };
        } catch (error) {
          if (isAllocationLikeError(error)) {
            lastVolumeError = error;
            continue;
          }
          throw error;
        }
      }
      if (lastVolumeError instanceof Error) {
        throw lastVolumeError;
      }
      throw new Error(`Volume is unavailable for layer "${layerKey}" at timepoint ${timeIndex}.`);
    },
    [
      layerScaleLevelsByKey,
      layerScalesByLevelByKey,
      maxBrickAtlasDepthHint,
      maxBrickAtlasBytesHint,
      maxVolumeBytesHint,
      resolvePreferredAtlasScaleLevel,
      volumeProvider
    ]
  );

  const playbackLayerKeys = useMemo(() => {
    if (!isViewerLaunched || loadedChannelIds.length === 0) {
      return [] as string[];
    }

    const keys = collectActiveLayerKeys(loadedChannelIds, channelLayersMap, channelActiveLayer).filter((layerKey) => {
      const channelId = layerChannelMap.get(layerKey);
      if (!channelId) {
        return true;
      }
      return channelVisibility[channelId] ?? true;
    });
    return keys;
  }, [
    isViewerLaunched,
    loadedChannelIds,
    channelLayersMap,
    channelActiveLayer,
    layerChannelMap,
    channelVisibility
  ]);
  const playbackLayerKeySignature = useMemo(() => playbackLayerKeys.join('\u001f'), [playbackLayerKeys]);

  const handleLaunchViewer = useCallback(async () => {
    if (isLaunchingViewer) {
      return;
    }

    if (!preprocessedExperiment || !volumeProvider) {
      showLaunchError('Preprocess or import a preprocessed experiment before launching the viewer.');
      return;
    }

    clearDatasetError();
    beginLaunchSession();
    setCurrentLayerVolumes({});
    setCurrentLayerPageTables({});
    setCurrentLayerBrickAtlases({});
    setSelectedIndex(0);
    setIsPlaying(false);
    try {
      clearTextureCache();

      const initialTimeIndex = 0;
      const layerKeys = collectActiveLayerKeys(loadedChannelIds, channelLayersMap, channelActiveLayer);
      setLaunchExpectedVolumeCount(layerKeys.length);

      const loadedVolumes: Record<string, NormalizedVolume | null> = {};
      const loadedPageTables: Record<string, VolumeBrickPageTable | null> = {};
      const loadedBrickAtlases: Record<string, VolumeBrickAtlas | null> = {};
      for (let index = 0; index < layerKeys.length; index++) {
        const layerKey = layerKeys[index];
        const { volume, pageTable, brickAtlas } = await loadLayerTimepointResources(
          layerKey,
          initialTimeIndex
        );
        loadedVolumes[layerKey] = volume;
        loadedPageTables[layerKey] = pageTable;
        loadedBrickAtlases[layerKey] = brickAtlas;
        const nextLoaded = index + 1;
        setLaunchProgress({ loadedCount: nextLoaded, totalCount: layerKeys.length });
      }

      setCurrentLayerVolumes(loadedVolumes);
      setCurrentLayerPageTables(loadedPageTables);
      setCurrentLayerBrickAtlases(loadedBrickAtlases);
      if (typeof volumeProvider.getDiagnostics === 'function') {
        setVolumeProviderDiagnostics(volumeProvider.getDiagnostics());
      }
      completeLaunchSession(layerKeys.length);
    } catch (error) {
      console.error('Failed to launch viewer', error);
      const message = error instanceof Error ? error.message : 'Failed to launch viewer.';
      failLaunchSession(message);
      showLaunchError(message);
    } finally {
      finishLaunchSessionAttempt();
    }
  }, [
    isLaunchingViewer,
    preprocessedExperiment,
    volumeProvider,
    showLaunchError,
    clearDatasetError,
    beginLaunchSession,
    setSelectedIndex,
    setIsPlaying,
    loadedChannelIds,
    channelLayersMap,
    channelActiveLayer,
    setLaunchExpectedVolumeCount,
    setLaunchProgress,
    loadLayerTimepointResources,
    completeLaunchSession,
    failLaunchSession,
    finishLaunchSessionAttempt
  ]);

  useEffect(() => {
    if (!isViewerLaunched || !volumeProvider || typeof volumeProvider.getDiagnostics !== 'function') {
      setVolumeProviderDiagnostics(null);
      return;
    }

    let active = true;
    const captureDiagnostics = () => {
      if (!active) {
        return;
      }
      try {
        setVolumeProviderDiagnostics(volumeProvider.getDiagnostics());
      } catch (error) {
        console.warn('Failed to capture volume provider diagnostics', error);
      }
    };

    captureDiagnostics();
    const intervalId = setInterval(captureDiagnostics, DIAGNOSTICS_POLL_INTERVAL_MS);
    return () => {
      active = false;
      clearInterval(intervalId);
    };
  }, [isViewerLaunched, volumeProvider]);

  useEffect(() => {
    if (!isViewerLaunched || !volumeProvider) {
      volumeLoadAbortControllerRef.current?.abort();
      volumeLoadAbortControllerRef.current = null;
      return;
    }
    if (volumeTimepointCount === 0 || playbackLayerKeys.length === 0) {
      volumeLoadAbortControllerRef.current?.abort();
      volumeLoadAbortControllerRef.current = null;
      setCurrentLayerVolumes({});
      setCurrentLayerPageTables({});
      setCurrentLayerBrickAtlases({});
      return;
    }

    const requestId = volumeLoadRequestRef.current + 1;
    volumeLoadRequestRef.current = requestId;
    let cancelled = false;
    volumeLoadAbortControllerRef.current?.abort();
    const requestAbortController = new AbortController();
    volumeLoadAbortControllerRef.current = requestAbortController;

    const clampedIndex = Math.max(0, Math.min(volumeTimepointCount - 1, selectedIndex));

    void (async () => {
      try {
        const entries = await Promise.all(
          playbackLayerKeys.map(async (layerKey) => {
            const { volume, pageTable, brickAtlas } = await loadLayerTimepointResources(
              layerKey,
              clampedIndex,
              { signal: requestAbortController.signal }
            );
            return [layerKey, volume, pageTable, brickAtlas] as const;
          })
        );

        if (
          cancelled ||
          requestAbortController.signal.aborted ||
          volumeLoadRequestRef.current !== requestId
        ) {
          return;
        }

        const nextVolumes = entries.reduce<Record<string, NormalizedVolume | null>>((acc, [layerKey, volume]) => {
          acc[layerKey] = volume;
          return acc;
        }, {});
        const nextPageTables = entries.reduce<Record<string, VolumeBrickPageTable | null>>(
          (acc, [layerKey, _volume, pageTable]) => {
            acc[layerKey] = pageTable;
            return acc;
          },
          {}
        );
        const nextBrickAtlases = entries.reduce<Record<string, VolumeBrickAtlas | null>>(
          (acc, [layerKey, _volume, _pageTable, brickAtlas]) => {
            acc[layerKey] = brickAtlas;
            return acc;
          },
          {}
        );

        setCurrentLayerVolumes(nextVolumes);
        setCurrentLayerPageTables(nextPageTables);
        setCurrentLayerBrickAtlases(nextBrickAtlases);
        if (typeof volumeProvider.getDiagnostics === 'function') {
          setVolumeProviderDiagnostics(volumeProvider.getDiagnostics());
        }
      } catch (error) {
        if (
          cancelled ||
          requestAbortController.signal.aborted ||
          volumeLoadRequestRef.current !== requestId ||
          isAbortLikeError(error)
        ) {
          return;
        }
        console.error('Failed to load timepoint volumes', error);
        setCurrentLayerVolumes({});
        setCurrentLayerPageTables({});
        setCurrentLayerBrickAtlases({});
        showLaunchErrorRef.current(error instanceof Error ? error.message : 'Failed to load timepoint volumes.');
      }
    })();

    return () => {
      cancelled = true;
      requestAbortController.abort();
      if (volumeLoadAbortControllerRef.current === requestAbortController) {
        volumeLoadAbortControllerRef.current = null;
      }
    };
  }, [
    isViewerLaunched,
    volumeProvider,
    volumeTimepointCount,
    playbackLayerKeySignature,
    selectedIndex,
    loadLayerTimepointResources
  ]);

  return {
    currentLayerVolumes,
    currentLayerPageTables,
    currentLayerBrickAtlases,
    volumeProviderDiagnostics,
    setCurrentLayerVolumes,
    playbackLayerKeys,
    handleLaunchViewer
  };
}
