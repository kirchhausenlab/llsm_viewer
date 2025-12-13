import { useCallback, useMemo, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { fromBlob } from 'geotiff';
import {
  expandVolumesForMovieMode,
  loadVolumesFromFiles,
  materializeVolumePayload
} from '../../loaders/volumeLoader';
import { clearTextureCache } from '../../core/textureCache';
import type { NormalizedVolume } from '../../core/volumeProcessing';
import {
  colorizeSegmentationVolume,
  computeNormalizationParameters,
  normalizeVolume
} from '../../core/volumeProcessing';
import type { ExperimentDimension } from '../useVoxelResolution';
import { computeAutoWindow } from '../../autoContrast';
import type { ImportPreprocessedDatasetResult } from '../../shared/utils/preprocessedDataset';
import { resampleVolume } from '../../shared/utils/anisotropyCorrection';
import { createSegmentationSeed, sortVolumeFiles } from '../../shared/utils/appHelpers';
import {
  DEFAULT_LAYER_COLOR,
  GRAYSCALE_COLOR_SWATCHES,
  normalizeHexColor
} from '../../shared/colorMaps/layerColors';
import {
  brightnessContrastModel,
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

export type LoadState = 'idle' | 'loading' | 'loaded' | 'error';

export type ChannelLayerSource = {
  id: string;
  files: File[];
  isSegmentation: boolean;
};

export type ChannelSource = {
  id: string;
  name: string;
  layers: ChannelLayerSource[];
  trackFile: File | null;
  trackStatus: LoadState;
  trackError: string | null;
  trackEntries: string[][];
};

export type ChannelValidation = {
  errors: string[];
  warnings: string[];
};

export type StagedPreprocessedExperiment = ImportPreprocessedDatasetResult & {
  sourceName: string | null;
  sourceSize: number | null;
};

const DEFAULT_RESET_WINDOW = { windowMin: DEFAULT_WINDOW_MIN, windowMax: DEFAULT_WINDOW_MAX };

const computeInitialWindowForVolume = (
  volume: NormalizedVolume | null | undefined
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

export type ChannelSourcesApi = {
  channels: ChannelSource[];
  setChannels: Dispatch<SetStateAction<ChannelSource[]>>;
  layerTimepointCounts: Record<string, number>;
  setLayerTimepointCounts: Dispatch<SetStateAction<Record<string, number>>>;
  channelIdRef: MutableRefObject<number>;
  layerIdRef: MutableRefObject<number>;
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
    options: {
      setChannelVisibility: (value: Record<string, boolean>) => void;
      setChannelActiveLayer: (value: Record<string, string>) => void;
      setLayerSettings: Dispatch<SetStateAction<Record<string, LayerSettings>>>;
      setLayerAutoThresholds: Dispatch<SetStateAction<Record<string, number>>>;
      setSelectedIndex: (index: number) => void;
      setActiveChannelTabId: (id: string | null) => void;
      setStatus: (state: LoadState) => void;
      setLoadedCount: Dispatch<SetStateAction<number>>;
      setExpectedVolumeCount: (count: number) => void;
      setLoadProgress: (progress: number) => void;
      setIsPlaying: (value: boolean) => void;
      clearDatasetError: () => void;
      setError: (message: string | null) => void;
      globalRenderStyle: 0 | 1;
      globalSamplingMode: SamplingMode;
      getChannelDefaultColor: (channelId: string) => string;
    }
  ) => void;
  loadSelectedDataset: (options: {
    voxelResolution: VoxelResolutionValues | null;
    anisotropyScale: { x: number; y: number; z: number } | null;
    channels: ChannelSource[];
    experimentDimension: ExperimentDimension;
    preprocessingSettingsRef: MutableRefObject<VoxelResolutionValues | null>;
    setStatus: (state: LoadState) => void;
    setError: (message: string | null) => void;
    clearDatasetError: () => void;
    setLayers: (layers: LoadedLayer[]) => void;
    setChannelVisibility: (value: Record<string, boolean>) => void;
    setChannelActiveLayer: (value: Record<string, string>) => void;
    setLayerSettings: Dispatch<SetStateAction<Record<string, LayerSettings>>>;
    setLayerAutoThresholds: Dispatch<SetStateAction<Record<string, number>>>;
    setSelectedIndex: (index: number) => void;
    setIsPlaying: (value: boolean) => void;
    setLoadProgress: (value: number) => void;
    setLoadedCount: Dispatch<SetStateAction<number>>;
    setExpectedVolumeCount: (value: number) => void;
    setActiveChannelTabId: (value: string | null) => void;
    showLaunchError: (message: string) => void;
    getChannelDefaultColor: (channelId: string) => string;
    globalRenderStyle: 0 | 1;
    globalSamplingMode: SamplingMode;
  }) => Promise<LoadedLayer[] | null>;
  createLayerDefaultSettings: (layerKey: string) => LayerSettings;
  layerAutoThresholdsRef: MutableRefObject<Record<string, number>>;
};

export function useChannelSources(): ChannelSourcesApi {
  const [channels, setChannels] = useState<ChannelSource[]>([]);
  const [layerTimepointCounts, setLayerTimepointCounts] = useState<Record<string, number>>({});
  const channelIdRef = useRef(0);
  const layerIdRef = useRef(0);
  const layerAutoThresholdsRef = useRef<Record<string, number>>({});
  const loadRequestRef = useRef(0);

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

  const createChannelSource = useCallback((name: string): ChannelSource => {
    const nextId = channelIdRef.current + 1;
    channelIdRef.current = nextId;
    return {
      id: `channel-${nextId}`,
      name,
      layers: [],
      trackFile: null,
      trackStatus: 'idle',
      trackError: null,
      trackEntries: []
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

      if (channel.trackStatus === 'error' && channel.trackError) {
        errors.push(channel.trackError);
      } else if (channel.trackStatus === 'loading') {
        warnings.push('Tracks are still loading.');
      } else if (channel.layers.length > 0 && !channel.trackFile) {
        warnings.push('No tracks attached to this channel.');
      }

      return {
        channelId: channel.id,
        errors,
        warnings,
        layerCount: channel.layers.length,
        timepointCount: getLayerTimepointCount(primaryLayer)
      };
    });
  }, [channels, getLayerTimepointCount]);

  const channelValidationMap = useMemo(() => {
    const map = new Map<string, ChannelValidation>();
    for (const entry of channelValidationList) {
      map.set(entry.channelId, { errors: entry.errors, warnings: entry.warnings });
    }
    return map;
  }, [channelValidationList]);

  const hasGlobalTimepointMismatch = useMemo(() => {
    const timepointCounts = new Set<number>();
    for (const channel of channels) {
      for (const layer of channel.layers) {
        const count = getLayerTimepointCount(layer);
        if (count > 0) {
          timepointCounts.add(count);
        }
      }
    }
    return timepointCounts.size > 1;
  }, [channels, getLayerTimepointCount]);

  const hasAnyLayers = useMemo(
    () => channels.some((channel) => channel.layers.some((layer) => layer.files.length > 0)),
    [channels]
  );

  const hasLoadingTracks = useMemo(
    () => channels.some((channel) => channel.trackStatus === 'loading'),
    [channels]
  );

  const allChannelsValid = useMemo(
    () => channelValidationList.every((entry) => entry.errors.length === 0),
    [channelValidationList]
  );

  const applyLoadedLayers: ChannelSourcesApi['applyLoadedLayers'] = useCallback(
    (normalizedLayers, expectedVolumeCount, options) => {
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
    (layerKey: string): LayerSettings => {
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

  const loadSelectedDataset: ChannelSourcesApi['loadSelectedDataset'] = useCallback(
    async ({
      voxelResolution,
      anisotropyScale,
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
    }) => {
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
            const realizedVolumes = await Promise.all(
              volumes.map((volume) => materializeVolumePayload(volume))
            );
            const expandedVolumes = expandVolumesForMovieMode(realizedVolumes, experimentDimension);

            if (experimentDimension === '2d') {
              const primaryVolume = expandedVolumes[0] ?? null;
              if (!referencePlanarShape && primaryVolume) {
                referencePlanarShape = { width: primaryVolume.width, height: primaryVolume.height };
              } else if (
                primaryVolume &&
                referencePlanarShape &&
                (primaryVolume.width !== referencePlanarShape.width ||
                  primaryVolume.height !== referencePlanarShape.height)
              ) {
                throw new Error(
                  `Channel "${layer.channelLabel}" has volume dimensions ${primaryVolume.width}×${primaryVolume.height}×${primaryVolume.depth} that do not match the reference shape ${referencePlanarShape.width}×${referencePlanarShape.height}×1.`
                );
              }
            } else {
              if (!referenceShape) {
                referenceShape = {
                  width: volumes[0]?.width ?? 0,
                  height: volumes[0]?.height ?? 0,
                  depth: volumes[0]?.depth ?? 0
                };
              } else if (
                volumes[0] &&
                (volumes[0].width !== referenceShape.width ||
                  volumes[0].height !== referenceShape.height ||
                  volumes[0].depth !== referenceShape.depth)
              ) {
                throw new Error(
                  `Channel "${layer.channelLabel}" has volume dimensions ${volumes[0].width}×${volumes[0].height}×${volumes[0].depth} that do not match the reference shape ${referenceShape.width}×${referenceShape.height}×${referenceShape.depth}.`
                );
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
          const correctedVolumes = anisotropyScale
            ? volumes.map((rawVolume) =>
                resampleVolume(rawVolume, {
                  scale: anisotropyScale,
                  interpolation: layer.isSegmentation ? 'nearest' : 'linear',
                  targetDataType: layer.isSegmentation ? rawVolume.dataType : 'float32'
                })
              )
            : volumes;
          const normalizedVolumes = layer.isSegmentation
            ? correctedVolumes.map((rawVolume, volumeIndex) =>
                colorizeSegmentationVolume(rawVolume, createSegmentationSeed(layer.key, volumeIndex))
              )
            : (() => {
                const normalizationParameters = computeNormalizationParameters(correctedVolumes);
                return correctedVolumes.map((rawVolume) => normalizeVolume(rawVolume, normalizationParameters));
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
        const message = err instanceof Error ? err.message : 'Failed to load volumes.';
        showLaunchError(message);
        setError(message);
        return null;
      }
    },
    [applyLoadedLayers, getLayerTimepointCount]
  );

  return {
    channels,
    setChannels,
    layerTimepointCounts,
    setLayerTimepointCounts,
    channelIdRef,
    layerIdRef,
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
