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
import type { LoadedDatasetLayer, StagedPreprocessedExperiment } from '../../../hooks/dataset';

type SetLaunchProgressOptions = {
  loadedCount: number;
  totalCount: number;
};

type UseRouteLayerVolumesOptions = {
  isViewerLaunched: boolean;
  isLaunchingViewer: boolean;
  isPlaying?: boolean;
  preprocessedExperiment: StagedPreprocessedExperiment | null;
  volumeProvider: VolumeProvider | null;
  loadedChannelIds: string[];
  channelLayersMap: Map<string, LoadedDatasetLayer[]>;
  channelActiveLayer: Record<string, string>;
  channelVisibility: Record<string, boolean>;
  layerChannelMap: Map<string, string>;
  preferBrickResidency: boolean;
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
const MAX_BRICK_ATLAS_DEPTH_HINT = 2048;

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
      const useAtlas = preferBrickResidency && canUseAtlas && !layer.isSegmentation && layer.depth > 1;
      modeByKey.set(layer.key, useAtlas ? 'atlas' : 'volume');
    }
  }
  return modeByKey;
}

export function useRouteLayerVolumes({
  isViewerLaunched,
  isLaunchingViewer,
  isPlaying = false,
  preprocessedExperiment,
  volumeProvider,
  loadedChannelIds,
  channelLayersMap,
  channelActiveLayer,
  channelVisibility,
  layerChannelMap,
  preferBrickResidency,
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
  const maxBrickAtlasDepthHint = useMemo(() => MAX_BRICK_ATLAS_DEPTH_HINT, []);
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
  const resolvePreferredAtlasScaleLevel = useCallback(
    (layerKey: string): number => {
      const levels = layerScaleLevelsByKey.get(layerKey) ?? [0];
      const desired = isPlaying ? 1 : 0;
      let resolved = levels[0] ?? 0;
      for (const level of levels) {
        if (level <= desired) {
          resolved = level;
        }
      }
      return resolved;
    },
    [isPlaying, layerScaleLevelsByKey]
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
        const preferredScaleLevel = resolvePreferredAtlasScaleLevel(layerKey);
        const knownLevels = layerScaleLevelsByKey.get(layerKey) ?? [preferredScaleLevel];
        const candidateScaleLevels = knownLevels.filter((level) => level >= preferredScaleLevel);
        if (candidateScaleLevels.length === 0) {
          candidateScaleLevels.push(preferredScaleLevel);
        }

        for (const scaleLevel of candidateScaleLevels) {
          throwIfAborted(signal);
          const atlas = await volumeProvider!.getBrickAtlas!(layerKey, timeIndex, { scaleLevel, signal });
          throwIfAborted(signal);
          if (!atlas.enabled) {
            continue;
          }
          if (atlas.depth > maxBrickAtlasDepthHint) {
            continue;
          }
          return {
            volume: null,
            pageTable: atlas.pageTable,
            brickAtlas: atlas
          };
        }

        throw new Error(`Brick atlas is unavailable for layer "${layerKey}" at timepoint ${timeIndex}.`);
      }

      const [volume, pageTable] = await Promise.all([
        volumeProvider!.getVolume(layerKey, timeIndex, { scaleLevel: 0, signal }),
        typeof volumeProvider?.getBrickPageTable === 'function'
          ? volumeProvider.getBrickPageTable(layerKey, timeIndex, { scaleLevel: 0, signal })
          : Promise.resolve(null)
      ]);
      throwIfAborted(signal);
      return {
        volume,
        pageTable,
        brickAtlas: null
      };
    },
    [layerScaleLevelsByKey, maxBrickAtlasDepthHint, resolvePreferredAtlasScaleLevel, volumeProvider]
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
