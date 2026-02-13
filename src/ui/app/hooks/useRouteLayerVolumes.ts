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
import type { VolumeProvider } from '../../../core/volumeProvider';
import type { NormalizedVolume } from '../../../core/volumeProcessing';
import type { LoadedDatasetLayer, StagedPreprocessedExperiment } from '../../../hooks/dataset';

type SetLaunchProgressOptions = {
  loadedCount: number;
  totalCount: number;
};

type UseRouteLayerVolumesOptions = {
  isViewerLaunched: boolean;
  isLaunchingViewer: boolean;
  preprocessedExperiment: StagedPreprocessedExperiment | null;
  volumeProvider: VolumeProvider | null;
  loadedChannelIds: string[];
  channelLayersMap: Map<string, LoadedDatasetLayer[]>;
  channelActiveLayer: Record<string, string>;
  channelVisibility: Record<string, boolean>;
  layerChannelMap: Map<string, string>;
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
  setCurrentLayerVolumes: Dispatch<SetStateAction<Record<string, NormalizedVolume | null>>>;
  playbackLayerKeys: string[];
  handleLaunchViewer: () => Promise<void>;
};

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
    const resolvedLayerKey = selectedLayer?.key ?? channelLayers[0]?.key ?? null;
    if (resolvedLayerKey) {
      keys.push(resolvedLayerKey);
    }
  }
  return keys;
}

export function useRouteLayerVolumes({
  isViewerLaunched,
  isLaunchingViewer,
  preprocessedExperiment,
  volumeProvider,
  loadedChannelIds,
  channelLayersMap,
  channelActiveLayer,
  channelVisibility,
  layerChannelMap,
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
  const volumeLoadRequestRef = useRef(0);

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
    setSelectedIndex(0);
    setIsPlaying(false);
    try {
      clearTextureCache();

      const initialTimeIndex = 0;
      const layerKeys = collectActiveLayerKeys(loadedChannelIds, channelLayersMap, channelActiveLayer);
      setLaunchExpectedVolumeCount(layerKeys.length);

      const loadedVolumes: Record<string, NormalizedVolume | null> = {};
      for (let index = 0; index < layerKeys.length; index++) {
        const layerKey = layerKeys[index];
        loadedVolumes[layerKey] = await volumeProvider.getVolume(layerKey, initialTimeIndex);
        const nextLoaded = index + 1;
        setLaunchProgress({ loadedCount: nextLoaded, totalCount: layerKeys.length });
      }

      setCurrentLayerVolumes(loadedVolumes);
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
    completeLaunchSession,
    failLaunchSession,
    finishLaunchSessionAttempt
  ]);

  useEffect(() => {
    if (!isViewerLaunched || !volumeProvider) {
      return;
    }
    if (volumeTimepointCount === 0 || playbackLayerKeys.length === 0) {
      setCurrentLayerVolumes({});
      return;
    }

    const requestId = volumeLoadRequestRef.current + 1;
    volumeLoadRequestRef.current = requestId;
    let cancelled = false;

    const clampedIndex = Math.max(0, Math.min(volumeTimepointCount - 1, selectedIndex));

    void (async () => {
      try {
        const entries = await Promise.all(
          playbackLayerKeys.map(async (layerKey) => [
            layerKey,
            await volumeProvider.getVolume(layerKey, clampedIndex)
          ] as const)
        );

        if (cancelled || volumeLoadRequestRef.current !== requestId) {
          return;
        }

        const nextVolumes = entries.reduce<Record<string, NormalizedVolume | null>>((acc, [layerKey, volume]) => {
          acc[layerKey] = volume;
          return acc;
        }, {});

        setCurrentLayerVolumes(nextVolumes);
      } catch (error) {
        console.error('Failed to load timepoint volumes', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isViewerLaunched, volumeProvider, volumeTimepointCount, playbackLayerKeys, selectedIndex]);

  return {
    currentLayerVolumes,
    setCurrentLayerVolumes,
    playbackLayerKeys,
    handleLaunchViewer
  };
}
