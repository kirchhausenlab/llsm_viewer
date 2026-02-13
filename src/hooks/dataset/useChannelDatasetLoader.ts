import { useCallback, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { VolumeTooLargeError, formatBytes } from '../../errors';
import { expandVolumesForMovieMode, loadVolumesFromFiles } from '../../loaders/volumeLoader';
import { clearTextureCache } from '../../core/textureCache';
import {
  colorizeSegmentationVolume,
  computeNormalizationParameters,
  normalizeVolume
} from '../../core/volumeProcessing';
import type { ExperimentDimension } from '../useVoxelResolution';
import { computeAutoWindow } from '../../autoContrast';
import { createSegmentationSeed, sortVolumeFiles } from '../../shared/utils/appHelpers';
import { DEFAULT_LAYER_COLOR } from '../../shared/colorMaps/layerColors';
import {
  clampWindowBounds,
  createDefaultLayerSettings,
  DEFAULT_RENDER_STYLE,
  DEFAULT_SAMPLING_MODE,
  DEFAULT_WINDOW_MAX,
  DEFAULT_WINDOW_MIN,
  type LayerSettings,
  type SamplingMode
} from '../../state/layerSettings';
import type { LoadedLayer } from '../../types/layers';
import type { VoxelResolutionValues } from '../../types/voxelResolution';

type LoadChannelLayer = {
  id: string;
  files: File[];
  isSegmentation: boolean;
};

type LoadChannelSource = {
  id: string;
  name: string;
  layers: LoadChannelLayer[];
};

export type LoadState = 'idle' | 'loading' | 'loaded' | 'error';

export type ChannelDatasetRuntimeOptions = {
  setStatus: (state: LoadState) => void;
  setError: (message: string | null) => void;
  clearDatasetError: () => void;
  setSelectedIndex: (index: number) => void;
  setActiveChannelTabId: (id: string | null) => void;
  setLoadedCount: Dispatch<SetStateAction<number>>;
  setExpectedVolumeCount: (count: number) => void;
  setLoadProgress: (progress: number) => void;
  setIsPlaying: (value: boolean) => void;
};

export type ChannelDatasetLayerStateOptions = {
  setLayers: (layers: LoadedLayer[]) => void;
  setChannelVisibility: (value: Record<string, boolean>) => void;
  setChannelActiveLayer: (value: Record<string, string>) => void;
  setLayerSettings: Dispatch<SetStateAction<Record<string, LayerSettings>>>;
  setLayerAutoThresholds: Dispatch<SetStateAction<Record<string, number>>>;
};

export type ChannelDatasetAppearanceOptions = {
  globalRenderStyle: 0 | 1;
  globalSamplingMode: SamplingMode;
  getChannelDefaultColor: (channelId: string) => string;
};

export type ApplyLoadedLayersOptions = ChannelDatasetRuntimeOptions &
  Omit<ChannelDatasetLayerStateOptions, 'setLayers'> &
  ChannelDatasetAppearanceOptions;

export type LoadSelectedDatasetOptions = ChannelDatasetRuntimeOptions &
  ChannelDatasetLayerStateOptions &
  ChannelDatasetAppearanceOptions & {
    voxelResolution: VoxelResolutionValues | null;
    anisotropyScale: { x: number; y: number; z: number } | null;
    channels: LoadChannelSource[];
    experimentDimension: ExperimentDimension;
    preprocessingSettingsRef: MutableRefObject<VoxelResolutionValues | null>;
    showLaunchError: (message: string) => void;
  };

type UseChannelDatasetLoaderParams = {
  getLayerTimepointCount: (layer: { id: string; files: File[] } | null | undefined) => number;
};

const DEFAULT_RESET_WINDOW = { windowMin: DEFAULT_WINDOW_MIN, windowMax: DEFAULT_WINDOW_MAX };

const computeInitialWindowForVolume = (
  volume: LoadedLayer['volumes'][number] | null | undefined
): { windowMin: number; windowMax: number; autoThreshold: number } => {
  if (!volume) {
    return { ...DEFAULT_RESET_WINDOW, autoThreshold: 0 };
  }

  const { windowMin, windowMax, nextThreshold } = computeAutoWindow(volume);
  const { windowMin: clampedMin, windowMax: clampedMax } = clampWindowBounds(windowMin, windowMax);

  return {
    windowMin: clampedMin,
    windowMax: clampedMax,
    autoThreshold: nextThreshold
  };
};

const computeLayerDefaultSettings = (
  layer: LoadedLayer,
  globalRenderStyle: 0 | 1,
  globalSamplingMode: SamplingMode,
  getChannelDefaultColor: (channelId: string) => string
): LayerSettings => {
  const { windowMin, windowMax } = computeInitialWindowForVolume(layer.volumes[0]);
  const defaultColor = layer.isSegmentation ? DEFAULT_LAYER_COLOR : getChannelDefaultColor(layer.channelId);
  return {
    ...createDefaultLayerSettings({ windowMin, windowMax }),
    color: defaultColor,
    renderStyle: globalRenderStyle,
    samplingMode: globalSamplingMode
  };
};

export function useChannelDatasetLoader({ getLayerTimepointCount }: UseChannelDatasetLoaderParams) {
  const layerAutoThresholdsRef = useRef<Record<string, number>>({});
  const loadRequestRef = useRef(0);

  const applyLoadedLayers = useCallback(
    (normalizedLayers: LoadedLayer[], expectedVolumeCount: number, options: ApplyLoadedLayersOptions) => {
      const {
        setChannelVisibility,
        setChannelActiveLayer,
        setLayerSettings,
        setLayerAutoThresholds,
        setSelectedIndex,
        setActiveChannelTabId,
        setStatus,
        setLoadedCount,
        setExpectedVolumeCount,
        setLoadProgress,
        setIsPlaying,
        clearDatasetError,
        setError,
        globalRenderStyle,
        globalSamplingMode,
        getChannelDefaultColor
      } = options;

      clearTextureCache();
      const visibilityDefaults = normalizedLayers.reduce<Record<string, boolean>>((acc, layer) => {
        if (!(layer.channelId in acc)) {
          acc[layer.channelId] = true;
        }
        return acc;
      }, {});
      const activeLayerDefaults = normalizedLayers.reduce<Record<string, string>>((acc, layer) => {
        if (!(layer.channelId in acc)) {
          acc[layer.channelId] = layer.key;
        }
        return acc;
      }, {});
      const initialWindows = normalizedLayers.reduce<
        Record<string, ReturnType<typeof computeInitialWindowForVolume>>
      >((acc, layer) => {
        acc[layer.key] = computeInitialWindowForVolume(layer.volumes[0]);
        return acc;
      }, {});

      setChannelVisibility(visibilityDefaults);
      setChannelActiveLayer(activeLayerDefaults);
      setLayerSettings(
        normalizedLayers.reduce<Record<string, LayerSettings>>((acc, layer) => {
          acc[layer.key] = computeLayerDefaultSettings(
            layer,
            globalRenderStyle,
            globalSamplingMode,
            getChannelDefaultColor
          );
          return acc;
        }, {})
      );
      setLayerAutoThresholds(
        normalizedLayers.reduce<Record<string, number>>((acc, layer) => {
          acc[layer.key] = initialWindows[layer.key]?.autoThreshold ?? 0;
          return acc;
        }, {})
      );
      layerAutoThresholdsRef.current = normalizedLayers.reduce<Record<string, number>>((acc, layer) => {
        acc[layer.key] = initialWindows[layer.key]?.autoThreshold ?? 0;
        return acc;
      }, {});

      setSelectedIndex(0);
      setActiveChannelTabId(Object.keys(activeLayerDefaults)[0] ?? null);
      setStatus('loaded');
      setLoadedCount(expectedVolumeCount);
      setExpectedVolumeCount(expectedVolumeCount);
      setLoadProgress(expectedVolumeCount > 0 ? 1 : 0);
      setIsPlaying(false);
      clearDatasetError();
      setError(null);
    },
    []
  );

  const createLayerDefaultSettings = useCallback(
    (_layerKey: string): LayerSettings => {
      const { windowMin, windowMax } = computeInitialWindowForVolume(null);
      return {
        ...createDefaultLayerSettings({ windowMin, windowMax }),
        color: DEFAULT_LAYER_COLOR,
        renderStyle: DEFAULT_RENDER_STYLE,
        samplingMode: DEFAULT_SAMPLING_MODE
      };
    },
    []
  );

  const loadSelectedDataset = useCallback(
    async ({
      voxelResolution,
      anisotropyScale: _anisotropyScale,
      channels: channelList,
      experimentDimension,
      preprocessingSettingsRef,
      setStatus,
      setError,
      clearDatasetError,
      setLayers,
      setChannelVisibility,
      setChannelActiveLayer,
      setLayerSettings,
      setLayerAutoThresholds,
      setSelectedIndex,
      setIsPlaying,
      setLoadProgress,
      setLoadedCount,
      setExpectedVolumeCount,
      setActiveChannelTabId,
      showLaunchError,
      getChannelDefaultColor,
      globalRenderStyle,
      globalSamplingMode
    }: LoadSelectedDatasetOptions) => {
      clearDatasetError();
      preprocessingSettingsRef.current = voxelResolution;
      const requestId = loadRequestRef.current + 1;
      loadRequestRef.current = requestId;
      const flatLayerSources = channelList
        .flatMap((channel) =>
          channel.layers.map((layer) => ({
            channelId: channel.id,
            channelLabel: channel.name.trim() || 'Untitled channel',
            key: layer.id,
            label: 'Volume',
            files: sortVolumeFiles(layer.files),
            isSegmentation: layer.isSegmentation
          }))
        )
        .filter((entry) => entry.files.length > 0);

      if (flatLayerSources.length === 0) {
        const message = 'Add a volume before launching the viewer.';
        showLaunchError(message);
        return null;
      }

      setStatus('loading');
      setError(null);
      clearTextureCache();
      setLayers([]);
      setChannelVisibility({});
      setChannelActiveLayer({});
      setLayerSettings({});
      setLayerAutoThresholds({});
      setSelectedIndex(0);
      setIsPlaying(false);
      setLoadProgress(0);
      setLoadedCount(0);
      setExpectedVolumeCount(0);
      setActiveChannelTabId(null);

      const referenceLayer = flatLayerSources[0] ?? null;
      const referenceFiles = referenceLayer?.files ?? [];
      const referenceTimepointsHint = referenceLayer
        ? getLayerTimepointCount({ id: referenceLayer.key, files: referenceLayer.files })
        : 0;
      const referenceTimepoints =
        experimentDimension === '2d' ? referenceTimepointsHint || referenceFiles.length : referenceFiles.length;
      const totalExpectedVolumes =
        experimentDimension === '2d'
          ? referenceTimepoints * flatLayerSources.length
          : referenceFiles.length * flatLayerSources.length;
      if (totalExpectedVolumes === 0) {
        const message = 'The selected dataset does not contain any TIFF files.';
        showLaunchError(message);
        setStatus('error');
        setError(message);
        return null;
      }

      setExpectedVolumeCount(totalExpectedVolumes);

      try {
        let referenceShape: { width: number; height: number; depth: number } | null = null;
        let referencePlanarShape: { width: number; height: number } | null = null;

        const rawLayers = await Promise.all(
          flatLayerSources.map(async (layer) => {
            const volumes = await loadVolumesFromFiles(layer.files, {
              onVolumeLoaded: (_index, volume) => {
                if (loadRequestRef.current !== requestId) {
                  return;
                }
                const timepointIncrement = experimentDimension === '2d' ? volume.depth : 1;

                setLoadedCount((current) => {
                  if (loadRequestRef.current !== requestId) {
                    return current;
                  }
                  const next = current + timepointIncrement;
                  setLoadProgress(totalExpectedVolumes === 0 ? 0 : next / totalExpectedVolumes);
                  return next;
                });
              }
            });
            const expandedVolumes = expandVolumesForMovieMode(volumes, experimentDimension);

            if (experimentDimension === '2d') {
              for (let timepoint = 0; timepoint < expandedVolumes.length; timepoint += 1) {
                const candidate = expandedVolumes[timepoint];
                if (!candidate) {
                  continue;
                }
                if (!referencePlanarShape) {
                  referencePlanarShape = { width: candidate.width, height: candidate.height };
                } else if (
                  candidate.width !== referencePlanarShape.width ||
                  candidate.height !== referencePlanarShape.height ||
                  candidate.depth !== 1
                ) {
                  throw new Error(
                    `Channel "${layer.channelLabel}" timepoint ${timepoint + 1} has volume dimensions ${candidate.width}×${candidate.height}×${candidate.depth} that do not match the reference shape ${referencePlanarShape.width}×${referencePlanarShape.height}×1.`
                  );
                }
              }
            } else {
              for (let timepoint = 0; timepoint < volumes.length; timepoint += 1) {
                const candidate = volumes[timepoint];
                if (!candidate) {
                  continue;
                }
                if (!referenceShape) {
                  referenceShape = {
                    width: candidate.width,
                    height: candidate.height,
                    depth: candidate.depth
                  };
                } else if (
                  candidate.width !== referenceShape.width ||
                  candidate.height !== referenceShape.height ||
                  candidate.depth !== referenceShape.depth
                ) {
                  throw new Error(
                    `Channel "${layer.channelLabel}" timepoint ${timepoint + 1} has volume dimensions ${candidate.width}×${candidate.height}×${candidate.depth} that do not match the reference shape ${referenceShape.width}×${referenceShape.height}×${referenceShape.depth}.`
                  );
                }
              }
            }

            if (referenceTimepoints > 0 && expandedVolumes.length !== referenceTimepoints) {
              throw new Error(
                `Channel "${layer.channelLabel}" has ${expandedVolumes.length} timepoints, but the first channel has ${referenceTimepoints}.`
              );
            }

            return { layer, volumes: expandedVolumes };
          })
        );

        const normalizedLayers: LoadedLayer[] = rawLayers.map(({ layer, volumes }) => {
          const normalizedVolumes = layer.isSegmentation
            ? volumes.map((rawVolume, volumeIndex) =>
                colorizeSegmentationVolume(rawVolume, createSegmentationSeed(layer.key, volumeIndex))
              )
            : (() => {
                const normalizationParameters = computeNormalizationParameters(volumes);
                return volumes.map((rawVolume) => normalizeVolume(rawVolume, normalizationParameters));
              })();
          return {
            key: layer.key,
            label: layer.label,
            channelId: layer.channelId,
            volumes: normalizedVolumes,
            isSegmentation: layer.isSegmentation
          };
        });

        const resolvedExpectedVolumes =
          rawLayers.length > 0 ? rawLayers[0].volumes.length * flatLayerSources.length : totalExpectedVolumes;

        if (loadRequestRef.current !== requestId) {
          return null;
        }

        setLayers(normalizedLayers);
        setExpectedVolumeCount(resolvedExpectedVolumes);
        applyLoadedLayers(normalizedLayers, resolvedExpectedVolumes, {
          setChannelVisibility,
          setChannelActiveLayer,
          setLayerSettings,
          setLayerAutoThresholds,
          setSelectedIndex,
          setActiveChannelTabId,
          setStatus,
          setLoadedCount,
          setExpectedVolumeCount,
          setLoadProgress,
          setIsPlaying,
          clearDatasetError,
          setError,
          globalRenderStyle,
          globalSamplingMode,
          getChannelDefaultColor
        });
        return normalizedLayers;
      } catch (err) {
        if (loadRequestRef.current !== requestId) {
          return null;
        }
        console.error(err);
        setStatus('error');
        clearTextureCache();
        setLayers([]);
        setChannelVisibility({});
        setChannelActiveLayer({});
        setLayerSettings({});
        setLayerAutoThresholds({});
        setSelectedIndex(0);
        setActiveChannelTabId(null);
        setLoadProgress(0);
        setLoadedCount(0);
        setExpectedVolumeCount(0);
        setIsPlaying(false);
        const message =
          err instanceof VolumeTooLargeError
            ? (() => {
                const size = formatBytes(err.requiredBytes);
                const limit = formatBytes(err.maxBytes);
                const name = err.fileName ? ` "${err.fileName}"` : '';
                return `The dataset${name} requires ${size}, which exceeds the current browser limit of ${limit}. Reduce the dataset size or enable chunked uploads before trying again.`;
              })()
            : err instanceof Error
              ? err.message
              : 'Failed to load volumes.';
        showLaunchError(message);
        setError(message);
        return null;
      }
    },
    [applyLoadedLayers, getLayerTimepointCount]
  );

  return {
    layerAutoThresholdsRef,
    applyLoadedLayers,
    loadSelectedDataset,
    createLayerDefaultSettings
  };
}
