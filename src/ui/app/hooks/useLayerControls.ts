import { useCallback, useMemo, useRef, type Dispatch, type SetStateAction } from 'react';
import { computeAutoWindow } from '../../../autoContrast';
import { normalizeHexColor, DEFAULT_LAYER_COLOR } from '../../../shared/colorMaps/layerColors';
import type { NormalizedVolume } from '../../../core/volumeProcessing';
import type { VolumeBackgroundMask, VolumeBrickAtlas, VolumeBrickPageTable } from '../../../core/volumeProvider';
import type { ViewerLayer } from '../../contracts/viewerLayer';
import {
  brightnessContrastModel,
  clampWindowBounds,
  RENDER_STYLE_MIP,
  RENDER_STYLE_SLICE,
  DEFAULT_WINDOW_MAX,
  DEFAULT_WINDOW_MIN,
  type BrightnessContrastState,
  type IntensityRenderModeValue,
  type LayerSettings,
  type RenderStyle,
  type SamplingMode,
  resolveIntensityRenderModeConfig,
  resolveIntensityRenderModeValue,
  resolveLayerSamplingMode,
  updateLayerSettings
} from '../../../state/layerSettings';
import type { LoadedDatasetLayer } from '../../../hooks/dataset';
import type { PlaybackWarmupFrameState } from './useRouteLayerVolumes';

export type LayerControlsParams = {
  layers: LoadedDatasetLayer[];
  selectedIndex: number;
  isPlaying?: boolean;
  layerVolumes: Record<string, NormalizedVolume | null>;
  layerPageTables: Record<string, VolumeBrickPageTable | null>;
  layerBrickAtlases: Record<string, VolumeBrickAtlas | null>;
  backgroundMasksByScale: Record<number, VolumeBackgroundMask | null>;
  playbackWarmupFrames?: PlaybackWarmupFrameState[];
  playbackWarmupTimeIndex?: number | null;
  playbackWarmupLayerVolumes?: Record<string, NormalizedVolume | null>;
  playbackWarmupLayerPageTables?: Record<string, VolumeBrickPageTable | null>;
  playbackWarmupLayerBrickAtlases?: Record<string, VolumeBrickAtlas | null>;
  playbackWarmupBackgroundMasksByScale?: Record<number, VolumeBackgroundMask | null>;
  loadVolume: ((layerKey: string, timepoint: number) => Promise<NormalizedVolume>) | null;
  layerAutoThresholds: Record<string, number>;
  setLayerAutoThresholds: Dispatch<SetStateAction<Record<string, number>>>;
  createLayerDefaultSettings: (key: string) => LayerSettings;
  createLayerDefaultBrightnessState: (key: string) => BrightnessContrastState;
  layerSettings: Record<string, LayerSettings>;
  setLayerSettings: Dispatch<SetStateAction<Record<string, LayerSettings>>>;
  setChannelVisibility: Dispatch<SetStateAction<Record<string, boolean>>>;
  channelVisibility: Record<string, boolean>;
  channelNameMap: Map<string, string>;
  layerChannelMap: Map<string, string>;
  loadedChannelIds: string[];
  setActiveChannelTabId: Dispatch<SetStateAction<string | null>>;
  setGlobalSamplingMode: Dispatch<SetStateAction<SamplingMode>>;
  setGlobalBlDensityScale: Dispatch<SetStateAction<number>>;
  setGlobalBlBackgroundCutoff: Dispatch<SetStateAction<number>>;
  setGlobalBlOpacityScale: Dispatch<SetStateAction<number>>;
  setGlobalBlEarlyExitAlpha: Dispatch<SetStateAction<number>>;
  setGlobalMipEarlyExitThreshold: Dispatch<SetStateAction<number>>;
};

const nextIntensityRenderMode = (current: IntensityRenderModeValue): IntensityRenderModeValue => {
  if (current === 'mip') {
    return 'mip-v';
  }
  if (current === 'mip-v') {
    return 'iso';
  }
  if (current === 'iso') {
    return 'bl';
  }
  if (current === 'bl') {
    return 'slice';
  }
  return 'mip';
};

const nextSegmentationRenderStyle = (current: RenderStyle): RenderStyle =>
  current === RENDER_STYLE_SLICE ? RENDER_STYLE_MIP : RENDER_STYLE_SLICE;

type ViewerLayerConfig = ViewerLayer & {
  channelId?: string;
};

function areViewerLayersEquivalent(left: ViewerLayerConfig | undefined, right: ViewerLayerConfig): boolean {
  if (!left) {
    return false;
  }
  return (
    left.key === right.key &&
    left.label === right.label &&
    left.channelId === right.channelId &&
    left.channelName === right.channelName &&
    left.fullResolutionWidth === right.fullResolutionWidth &&
    left.fullResolutionHeight === right.fullResolutionHeight &&
    left.fullResolutionDepth === right.fullResolutionDepth &&
    left.volume === right.volume &&
    left.channels === right.channels &&
    left.dataType === right.dataType &&
    left.min === right.min &&
    left.max === right.max &&
    left.visible === right.visible &&
    left.sliderRange === right.sliderRange &&
    left.minSliderIndex === right.minSliderIndex &&
    left.maxSliderIndex === right.maxSliderIndex &&
    left.brightnessSliderIndex === right.brightnessSliderIndex &&
    left.contrastSliderIndex === right.contrastSliderIndex &&
    left.windowMin === right.windowMin &&
    left.windowMax === right.windowMax &&
    left.color === right.color &&
    left.offsetX === right.offsetX &&
    left.offsetY === right.offsetY &&
    left.renderStyle === right.renderStyle &&
    left.mode === right.mode &&
    left.blDensityScale === right.blDensityScale &&
    left.blBackgroundCutoff === right.blBackgroundCutoff &&
    left.blOpacityScale === right.blOpacityScale &&
    left.blEarlyExitAlpha === right.blEarlyExitAlpha &&
    left.mipEarlyExitThreshold === right.mipEarlyExitThreshold &&
    left.invert === right.invert &&
    left.samplingMode === right.samplingMode &&
    left.isSegmentation === right.isSegmentation &&
    left.scaleLevel === right.scaleLevel &&
    left.brickPageTable === right.brickPageTable &&
    left.brickAtlas === right.brickAtlas &&
    left.backgroundMask === right.backgroundMask &&
    left.playbackWarmupForLayerKey === right.playbackWarmupForLayerKey &&
    left.playbackWarmupTimeIndex === right.playbackWarmupTimeIndex &&
    left.playbackRole === right.playbackRole &&
    left.playbackSlotIndex === right.playbackSlotIndex
  );
}

function stabilizeViewerLayerArray(
  nextLayers: ViewerLayerConfig[],
  previousLayers: ViewerLayerConfig[],
): ViewerLayerConfig[] {
  const previousByKey = new Map(previousLayers.map((layer) => [layer.key, layer]));
  let changed = nextLayers.length !== previousLayers.length;
  const stableLayers = nextLayers.map((layer) => {
    const previous = previousByKey.get(layer.key);
    if (areViewerLayersEquivalent(previous, layer)) {
      return previous as ViewerLayerConfig;
    }
    changed = true;
    return layer;
  });
  if (
    !changed &&
    stableLayers.length === previousLayers.length &&
    stableLayers.every((layer, index) => layer === previousLayers[index])
  ) {
    return previousLayers;
  }
  return stableLayers;
}

export function useLayerControls({
  layers,
  selectedIndex,
  isPlaying = false,
  layerVolumes,
  layerPageTables,
  layerBrickAtlases,
  backgroundMasksByScale,
  playbackWarmupFrames = [],
  playbackWarmupTimeIndex = null,
  playbackWarmupLayerVolumes = {},
  playbackWarmupLayerPageTables = {},
  playbackWarmupLayerBrickAtlases = {},
  playbackWarmupBackgroundMasksByScale = {},
  loadVolume,
  layerAutoThresholds,
  setLayerAutoThresholds,
  createLayerDefaultSettings,
  createLayerDefaultBrightnessState,
  layerSettings,
  setLayerSettings,
  setChannelVisibility,
  channelVisibility,
  channelNameMap,
  layerChannelMap,
  loadedChannelIds,
  setActiveChannelTabId,
  setGlobalSamplingMode,
  setGlobalBlDensityScale,
  setGlobalBlBackgroundCutoff,
  setGlobalBlOpacityScale,
  setGlobalBlEarlyExitAlpha,
  setGlobalMipEarlyExitThreshold
}: LayerControlsParams) {
  const viewerLayersCacheRef = useRef<ViewerLayerConfig[]>([]);
  const viewerPlaybackWarmupLayersCacheRef = useRef<ViewerLayerConfig[]>([]);
  const normalizedPlaybackWarmupFrames = useMemo<PlaybackWarmupFrameState[]>(
    () =>
      playbackWarmupFrames.length > 0
        ? playbackWarmupFrames
        : playbackWarmupTimeIndex === null
          ? []
          : [{
              slotIndex: 0,
              timeIndex: playbackWarmupTimeIndex,
              scaleSignature: '',
              layerResidencyDecisions: {},
              layerVolumes: playbackWarmupLayerVolumes,
              layerPageTables: playbackWarmupLayerPageTables,
              layerBrickAtlases: playbackWarmupLayerBrickAtlases,
              backgroundMasksByScale: playbackWarmupBackgroundMasksByScale
            }],
    [
      playbackWarmupBackgroundMasksByScale,
      playbackWarmupFrames,
      playbackWarmupLayerBrickAtlases,
      playbackWarmupLayerPageTables,
      playbackWarmupLayerVolumes,
      playbackWarmupTimeIndex
    ]
  );
  const resolveRenderStyleTargetLayerKey = useCallback(
    (requestedLayerKey?: string): string | null => {
      if (requestedLayerKey && layers.some((layer) => layer.key === requestedLayerKey)) {
        return requestedLayerKey;
      }

      const sortedChannelIds = [...loadedChannelIds].sort((left, right) => left.localeCompare(right));
      for (const channelId of sortedChannelIds) {
        const channelLayers = layers
          .filter((layer) => layer.channelId === channelId)
          .sort((left, right) => left.key.localeCompare(right.key));
        if (channelLayers.length === 0) {
          continue;
        }
        return channelLayers[0]?.key ?? null;
      }

      return [...layers].sort((left, right) => left.key.localeCompare(right.key))[0]?.key ?? null;
    },
    [layers, loadedChannelIds]
  );

  const handleLayerContrastChange = useCallback(
    (key: string, sliderIndex: number) => {
      updateLayerSettings(key, setLayerSettings, createLayerDefaultSettings, ({ previous }) => {
        if (previous.contrastSliderIndex === sliderIndex) {
          return null;
        }
        return brightnessContrastModel.applyContrast(previous, sliderIndex);
      });
    },
    [createLayerDefaultSettings, setLayerSettings]
  );

  const handleLayerBrightnessChange = useCallback(
    (key: string, sliderIndex: number) => {
      updateLayerSettings(key, setLayerSettings, createLayerDefaultSettings, ({ previous }) => {
        if (previous.brightnessSliderIndex === sliderIndex) {
          return null;
        }
        return brightnessContrastModel.applyBrightness(previous, sliderIndex);
      });
    },
    [createLayerDefaultSettings, setLayerSettings]
  );

  const handleLayerWindowMinChange = useCallback(
    (key: string, value: number) => {
      updateLayerSettings(key, setLayerSettings, createLayerDefaultSettings, ({ previous }) => {
        const clampedValue = Math.max(DEFAULT_WINDOW_MIN, Math.min(DEFAULT_WINDOW_MAX, value));
        if (previous.windowMin === clampedValue) {
          return null;
        }
        return brightnessContrastModel.applyWindow(clampedValue, previous.windowMax);
      });
    },
    [createLayerDefaultSettings, setLayerSettings]
  );

  const handleLayerWindowMaxChange = useCallback(
    (key: string, value: number) => {
      updateLayerSettings(key, setLayerSettings, createLayerDefaultSettings, ({ previous }) => {
        const clampedValue = Math.max(DEFAULT_WINDOW_MIN, Math.min(DEFAULT_WINDOW_MAX, value));
        if (previous.windowMax === clampedValue) {
          return null;
        }
        return brightnessContrastModel.applyWindow(previous.windowMin, clampedValue);
      });
    },
    [createLayerDefaultSettings, setLayerSettings]
  );

  const handleLayerAutoContrast = useCallback(
    (key: string) => {
      const applyAutoWindow = (volume: NormalizedVolume) => {
        const previousThreshold = layerAutoThresholds[key] ?? 0;
        const { windowMin, windowMax, nextThreshold } = computeAutoWindow(volume, previousThreshold);
        const { windowMin: clampedMin, windowMax: clampedMax } = clampWindowBounds(windowMin, windowMax);
        const updatedState = brightnessContrastModel.applyWindow(clampedMin, clampedMax);

        setLayerAutoThresholds((current) => {
          if (current[key] === nextThreshold) {
            return current;
          }
          return {
            ...current,
            [key]: nextThreshold
          };
        });

        setLayerSettings((current) => {
          const previous = current[key] ?? createLayerDefaultSettings(key);
          if (
            previous.windowMin === updatedState.windowMin &&
            previous.windowMax === updatedState.windowMax &&
            previous.brightnessSliderIndex === updatedState.brightnessSliderIndex &&
            previous.contrastSliderIndex === updatedState.contrastSliderIndex &&
            previous.minSliderIndex === updatedState.minSliderIndex &&
            previous.maxSliderIndex === updatedState.maxSliderIndex
          ) {
            return current;
          }
          return {
            ...current,
            [key]: {
              ...previous,
              ...updatedState
            }
          };
        });
      };

      const cached = layerVolumes[key] ?? null;
      if (cached) {
        applyAutoWindow(cached);
        return;
      }

      if (!loadVolume) {
        return;
      }

      void (async () => {
        try {
          const volume = await loadVolume(key, selectedIndex);
          applyAutoWindow(volume);
        } catch (error) {
          console.error('Failed to auto-contrast layer', error);
        }
      })();
    },
    [
      createLayerDefaultSettings,
      layerAutoThresholds,
      layerVolumes,
      loadVolume,
      selectedIndex,
      setLayerAutoThresholds,
      setLayerSettings
    ]
  );

  const handleLayerOffsetChange = useCallback(
    (key: string, axis: 'x' | 'y', value: number) => {
      setLayerSettings((current) => {
        const previous = current[key] ?? createLayerDefaultSettings(key);
        const property = axis === 'x' ? 'xOffset' : 'yOffset';
        if (previous[property] === value) {
          return current;
        }
        return {
          ...current,
          [key]: {
            ...previous,
            [property]: value
          }
        };
      });
    },
    [createLayerDefaultSettings, setLayerSettings]
  );

  const handleLayerColorChange = useCallback(
    (key: string, value: string) => {
      setLayerSettings((current) => {
        const previous = current[key] ?? createLayerDefaultSettings(key);
        const normalized = normalizeHexColor(value, DEFAULT_LAYER_COLOR);
        if (previous.color === normalized) {
          return current;
        }
        return {
          ...current,
          [key]: {
            ...previous,
            color: normalized
          }
        };
      });
    },
    [createLayerDefaultSettings, setLayerSettings]
  );

  const handleLayerRenderStyleChange = useCallback(
    (layerKey: string, renderStyle: RenderStyle, samplingMode?: SamplingMode) => {
      const targetLayer = layers.find((layer) => layer.key === layerKey);
      const isSegmentation = targetLayer?.isSegmentation === true;
      const previous = layerSettings[layerKey] ?? createLayerDefaultSettings(layerKey);
      const nextSamplingMode = resolveLayerSamplingMode(
        renderStyle,
        samplingMode ?? previous.samplingMode,
        isSegmentation
      );
      setLayerSettings((current) => {
        const currentSettings = current[layerKey] ?? createLayerDefaultSettings(layerKey);
        if (
          currentSettings.renderStyle === renderStyle &&
          currentSettings.samplingMode === nextSamplingMode
        ) {
          return current;
        }
        return {
          ...current,
          [layerKey]: {
            ...currentSettings,
            renderStyle,
            samplingMode: nextSamplingMode
          }
        };
      });
      setGlobalSamplingMode((current) => (current === nextSamplingMode ? current : nextSamplingMode));
    },
    [
      createLayerDefaultSettings,
      layerSettings,
      layers,
      setGlobalSamplingMode,
      setLayerSettings
    ]
  );

  const handleLayerRenderStyleToggle = useCallback(
    (layerKey?: string) => {
      const targetLayerKey = resolveRenderStyleTargetLayerKey(layerKey);
      if (!targetLayerKey) {
        return;
      }
      const currentStyle = (layerSettings[targetLayerKey] ?? createLayerDefaultSettings(targetLayerKey)).renderStyle;
      const targetLayer = layers.find((layer) => layer.key === targetLayerKey);
      if (targetLayer?.isSegmentation) {
        const nextStyle = nextSegmentationRenderStyle(currentStyle);
        handleLayerRenderStyleChange(targetLayerKey, nextStyle);
        return;
      }
      const currentSettings = layerSettings[targetLayerKey] ?? createLayerDefaultSettings(targetLayerKey);
      const nextMode = nextIntensityRenderMode(
        resolveIntensityRenderModeValue(currentSettings.renderStyle, currentSettings.samplingMode)
      );
      const nextConfig = resolveIntensityRenderModeConfig(nextMode);
      handleLayerRenderStyleChange(targetLayerKey, nextConfig.renderStyle, nextConfig.samplingMode);
    },
    [
      createLayerDefaultSettings,
      handleLayerRenderStyleChange,
      layerSettings,
      layers,
      resolveRenderStyleTargetLayerKey
    ]
  );

  const handleLayerSamplingModeToggle = useCallback(() => {
    setGlobalSamplingMode((current) => {
      const requestedSamplingMode: SamplingMode = current === 'nearest' ? 'linear' : 'nearest';
      setLayerSettings((settings) => {
        let changed = false;
        const nextSettings: Record<string, LayerSettings> = { ...settings };
        for (const layer of layers) {
          const previous = settings[layer.key] ?? createLayerDefaultSettings(layer.key);
          const nextSamplingMode = resolveLayerSamplingMode(
            previous.renderStyle,
            requestedSamplingMode,
            layer.isSegmentation
          );
          if (previous.samplingMode !== nextSamplingMode) {
            nextSettings[layer.key] = { ...previous, samplingMode: nextSamplingMode };
            changed = true;
          }
        }
        return changed ? nextSettings : settings;
      });
      return requestedSamplingMode;
    });
  }, [createLayerDefaultSettings, layers, setGlobalSamplingMode, setLayerSettings]);

  const handleLayerInvertToggle = useCallback(
    (key: string) => {
      setLayerSettings((current) => {
        const previous = current[key] ?? createLayerDefaultSettings(key);
        const nextInvert = !previous.invert;
        if (previous.invert === nextInvert) {
          return current;
        }
        return {
          ...current,
          [key]: {
            ...previous,
            invert: nextInvert
          }
        };
      });
    },
    [createLayerDefaultSettings, setLayerSettings]
  );

  const handleLayerBlDensityScaleChange = useCallback(
    (_key: string, value: number) => {
      const clamped = Math.max(0, value);
      setGlobalBlDensityScale((current) => (current === clamped ? current : clamped));
      setLayerSettings((current) => {
        let changed = false;
        const next: Record<string, LayerSettings> = { ...current };
        for (const layer of layers) {
          const previous = current[layer.key] ?? createLayerDefaultSettings(layer.key);
          if (previous.blDensityScale === clamped) {
            continue;
          }
          next[layer.key] = {
            ...previous,
            blDensityScale: clamped
          };
          changed = true;
        }
        if (!changed) {
          return current;
        }
        return next;
      });
    },
    [createLayerDefaultSettings, layers, setGlobalBlDensityScale, setLayerSettings]
  );

  const handleLayerBlBackgroundCutoffChange = useCallback(
    (_key: string, value: number) => {
      const clamped = Math.min(Math.max(value, 0), 1);
      setGlobalBlBackgroundCutoff((current) => (current === clamped ? current : clamped));
      setLayerSettings((current) => {
        let changed = false;
        const next: Record<string, LayerSettings> = { ...current };
        for (const layer of layers) {
          const previous = current[layer.key] ?? createLayerDefaultSettings(layer.key);
          if (previous.blBackgroundCutoff === clamped) {
            continue;
          }
          next[layer.key] = {
            ...previous,
            blBackgroundCutoff: clamped
          };
          changed = true;
        }
        if (!changed) {
          return current;
        }
        return next;
      });
    },
    [createLayerDefaultSettings, layers, setGlobalBlBackgroundCutoff, setLayerSettings]
  );

  const handleLayerBlOpacityScaleChange = useCallback(
    (_key: string, value: number) => {
      const clamped = Math.max(0, value);
      setGlobalBlOpacityScale((current) => (current === clamped ? current : clamped));
      setLayerSettings((current) => {
        let changed = false;
        const next: Record<string, LayerSettings> = { ...current };
        for (const layer of layers) {
          const previous = current[layer.key] ?? createLayerDefaultSettings(layer.key);
          if (previous.blOpacityScale === clamped) {
            continue;
          }
          next[layer.key] = {
            ...previous,
            blOpacityScale: clamped
          };
          changed = true;
        }
        if (!changed) {
          return current;
        }
        return next;
      });
    },
    [createLayerDefaultSettings, layers, setGlobalBlOpacityScale, setLayerSettings]
  );

  const handleLayerBlEarlyExitAlphaChange = useCallback(
    (_key: string, value: number) => {
      const clamped = Math.min(Math.max(value, 0), 1);
      setGlobalBlEarlyExitAlpha((current) => (current === clamped ? current : clamped));
      setLayerSettings((current) => {
        let changed = false;
        const next: Record<string, LayerSettings> = { ...current };
        for (const layer of layers) {
          const previous = current[layer.key] ?? createLayerDefaultSettings(layer.key);
          if (previous.blEarlyExitAlpha === clamped) {
            continue;
          }
          next[layer.key] = {
            ...previous,
            blEarlyExitAlpha: clamped
          };
          changed = true;
        }
        if (!changed) {
          return current;
        }
        return next;
      });
    },
    [createLayerDefaultSettings, layers, setGlobalBlEarlyExitAlpha, setLayerSettings]
  );

  const handleLayerMipEarlyExitThresholdChange = useCallback(
    (_key: string, value: number) => {
      const clamped = Math.min(Math.max(value, 0), 1);
      setGlobalMipEarlyExitThreshold((current) => (current === clamped ? current : clamped));
      setLayerSettings((current) => {
        let changed = false;
        const next: Record<string, LayerSettings> = { ...current };
        for (const layer of layers) {
          const previous = current[layer.key] ?? createLayerDefaultSettings(layer.key);
          if (previous.mipEarlyExitThreshold === clamped) {
            continue;
          }
          next[layer.key] = {
            ...previous,
            mipEarlyExitThreshold: clamped
          };
          changed = true;
        }
        if (!changed) {
          return current;
        }
        return next;
      });
    },
    [createLayerDefaultSettings, layers, setGlobalMipEarlyExitThreshold, setLayerSettings]
  );

  const handleLayerSelect = useCallback(
    (layerKey: string) => {
      const channelId = layerChannelMap.get(layerKey);
      if (!channelId) {
        return;
      }
      setActiveChannelTabId((current) => (current === channelId ? current : channelId));
    },
    [layerChannelMap, setActiveChannelTabId]
  );

  const handleLayerSoloToggle = useCallback(
    (layerKey: string) => {
      const channelId = layerChannelMap.get(layerKey);
      if (!channelId || loadedChannelIds.length === 0) {
        return;
      }

      handleLayerSelect(layerKey);

      setChannelVisibility((current) => {
        const visibleCount = loadedChannelIds.reduce(
          (count, id) => ((current[id] ?? true) ? count + 1 : count),
          0
        );
        const targetVisible = current[channelId] ?? true;
        const isSolo = targetVisible && visibleCount === 1;

        const next: Record<string, boolean> = { ...current };
        let changed = false;

        if (isSolo) {
          for (const id of loadedChannelIds) {
            const previous = next[id] ?? true;
            if (previous === false) {
              next[id] = true;
              changed = true;
            }
          }
        } else {
          for (const id of loadedChannelIds) {
            const desired = id === channelId;
            const previous = next[id] ?? true;
            if (previous !== desired) {
              next[id] = desired;
              changed = true;
            }
          }
        }

        return changed ? next : current;
      });
    },
    [handleLayerSelect, layerChannelMap, loadedChannelIds, setChannelVisibility]
  );

  const handleChannelSliderReset = useCallback(
    (channelId: string) => {
      const relevantLayers = layers.filter((layer) => layer.channelId === channelId);
      if (relevantLayers.length === 0) {
        return;
      }

      setLayerSettings((current) => {
        let changed = false;
        const next: Record<string, LayerSettings> = { ...current };
        for (const layer of relevantLayers) {
          const previous = current[layer.key] ?? createLayerDefaultSettings(layer.key);
          const defaultState = createLayerDefaultBrightnessState(layer.key);
          const updated: LayerSettings = {
            ...previous,
            ...defaultState,
            xOffset: 0,
            yOffset: 0,
            renderStyle: previous.renderStyle,
            invert: false,
            samplingMode: previous.samplingMode
          };
          if (
            previous.windowMin !== updated.windowMin ||
            previous.windowMax !== updated.windowMax ||
            previous.minSliderIndex !== updated.minSliderIndex ||
            previous.maxSliderIndex !== updated.maxSliderIndex ||
            previous.brightnessSliderIndex !== updated.brightnessSliderIndex ||
            previous.contrastSliderIndex !== updated.contrastSliderIndex ||
            previous.xOffset !== updated.xOffset ||
            previous.yOffset !== updated.yOffset ||
            previous.renderStyle !== updated.renderStyle ||
            previous.invert !== updated.invert ||
            previous.samplingMode !== updated.samplingMode
          ) {
            next[layer.key] = updated;
            changed = true;
          }
        }

        return changed ? next : current;
      });

      setLayerAutoThresholds((current) => {
        let changed = false;
        const next = { ...current };
        for (const layer of relevantLayers) {
          if (next[layer.key] !== 0) {
            next[layer.key] = 0;
            changed = true;
          }
        }
        return changed ? next : current;
      });
    },
    [
      createLayerDefaultBrightnessState,
      createLayerDefaultSettings,
      layers,
      setLayerAutoThresholds,
      setLayerSettings
    ]
  );

  const activeLayers = useMemo(() => {
    const nextActiveLayers: LoadedDatasetLayer[] = [];
    for (const channelId of loadedChannelIds) {
      const channelLayers = layers
        .filter((layer) => layer.channelId === channelId)
        .sort((left, right) => left.key.localeCompare(right.key));
      if (channelLayers.length === 0) {
        continue;
      }
      const selectedLayer = channelLayers[0];
      nextActiveLayers.push(selectedLayer);
    }
    return nextActiveLayers;
  }, [layers, loadedChannelIds]);

  const viewerLayers = useMemo(() => {
    const nextLayers: ViewerLayerConfig[] = activeLayers.map((layer) => {
      const settings = layerSettings[layer.key] ?? createLayerDefaultSettings(layer.key);
      const effectiveSamplingMode = resolveLayerSamplingMode(
        settings.renderStyle,
        settings.samplingMode,
        layer.isSegmentation
      );
      const channelVisible = channelVisibility[layer.channelId];
      const brickAtlas = layerBrickAtlases[layer.key] ?? null;
      const brickPageTable = brickAtlas?.pageTable ?? layerPageTables[layer.key] ?? null;
      const scaleLevel =
        brickAtlas?.scaleLevel ?? layerVolumes[layer.key]?.scaleLevel ?? 0;
      return {
        key: layer.key,
        label: layer.label,
        channelId: layer.channelId,
        channelName: channelNameMap.get(layer.channelId) ?? 'Untitled channel',
        fullResolutionWidth: layer.width,
        fullResolutionHeight: layer.height,
        fullResolutionDepth: layer.depth,
        volume: layerVolumes[layer.key] ?? null,
        channels: layer.channels,
        dataType: layer.dataType,
        storedDataType: layer.storedDataType,
        min: layer.min,
        max: layer.max,
        visible: channelVisible ?? true,
        sliderRange: settings.sliderRange,
        minSliderIndex: settings.minSliderIndex,
        maxSliderIndex: settings.maxSliderIndex,
        brightnessSliderIndex: settings.brightnessSliderIndex,
        contrastSliderIndex: settings.contrastSliderIndex,
        windowMin: settings.windowMin,
        windowMax: settings.windowMax,
        color: normalizeHexColor(settings.color, DEFAULT_LAYER_COLOR),
        offsetX: settings.xOffset,
        offsetY: settings.yOffset,
        renderStyle: settings.renderStyle,
        mode: undefined,
        blDensityScale: settings.blDensityScale,
        blBackgroundCutoff: settings.blBackgroundCutoff,
        blOpacityScale: settings.blOpacityScale,
        blEarlyExitAlpha: settings.blEarlyExitAlpha,
        mipEarlyExitThreshold: settings.mipEarlyExitThreshold,
        invert: settings.invert,
        samplingMode: effectiveSamplingMode,
        isSegmentation: layer.isSegmentation,
        scaleLevel,
        brickPageTable,
        brickAtlas,
        backgroundMask: layer.isSegmentation ? null : (backgroundMasksByScale[scaleLevel] ?? null),
        playbackRole: isPlaying ? 'active' : undefined
      };
    });
    const stableLayers = stabilizeViewerLayerArray(nextLayers, viewerLayersCacheRef.current);
    viewerLayersCacheRef.current = stableLayers;
    return stableLayers;
  }, [
    activeLayers,
    backgroundMasksByScale,
    channelNameMap,
    channelVisibility,
    createLayerDefaultSettings,
    isPlaying,
    layerBrickAtlases,
    layerPageTables,
    layerVolumes,
    layerSettings
  ]);

  const viewerPlaybackWarmupLayers = useMemo(() => {
    if (normalizedPlaybackWarmupFrames.length === 0) {
      if (viewerPlaybackWarmupLayersCacheRef.current.length === 0) {
        return viewerPlaybackWarmupLayersCacheRef.current;
      }
      viewerPlaybackWarmupLayersCacheRef.current = [];
      return viewerPlaybackWarmupLayersCacheRef.current;
    }

    const nextLayers = normalizedPlaybackWarmupFrames.flatMap((frame) =>
      activeLayers.flatMap((layer): ViewerLayerConfig[] => {
        const settings = layerSettings[layer.key] ?? createLayerDefaultSettings(layer.key);
        const effectiveSamplingMode = resolveLayerSamplingMode(
          settings.renderStyle,
          settings.samplingMode,
          layer.isSegmentation
        );
        const channelVisible = channelVisibility[layer.channelId];
        if (!(channelVisible ?? true) || settings.renderStyle === RENDER_STYLE_SLICE) {
          return [];
        }
        const brickAtlas = frame.layerBrickAtlases[layer.key] ?? null;
        const brickPageTable = brickAtlas?.pageTable ?? frame.layerPageTables[layer.key] ?? null;
        const scaleLevel = brickAtlas?.scaleLevel ?? frame.layerVolumes[layer.key]?.scaleLevel ?? 0;
        if (!brickAtlas || scaleLevel <= 0) {
          return [];
        }

        return [{
          key: `${layer.key}::playback-warmup:slot:${frame.slotIndex}`,
          label: layer.label,
          channelId: layer.channelId,
          channelName: channelNameMap.get(layer.channelId) ?? 'Untitled channel',
          fullResolutionWidth: layer.width,
          fullResolutionHeight: layer.height,
          fullResolutionDepth: layer.depth,
          volume: frame.layerVolumes[layer.key] ?? null,
          channels: layer.channels,
          dataType: layer.dataType,
          storedDataType: layer.storedDataType,
          min: layer.min,
          max: layer.max,
          visible: false,
          sliderRange: settings.sliderRange,
          minSliderIndex: settings.minSliderIndex,
          maxSliderIndex: settings.maxSliderIndex,
          brightnessSliderIndex: settings.brightnessSliderIndex,
          contrastSliderIndex: settings.contrastSliderIndex,
          windowMin: settings.windowMin,
          windowMax: settings.windowMax,
          color: normalizeHexColor(settings.color, DEFAULT_LAYER_COLOR),
          offsetX: settings.xOffset,
          offsetY: settings.yOffset,
          renderStyle: settings.renderStyle,
          mode: undefined,
          blDensityScale: settings.blDensityScale,
          blBackgroundCutoff: settings.blBackgroundCutoff,
          blOpacityScale: settings.blOpacityScale,
          blEarlyExitAlpha: settings.blEarlyExitAlpha,
          mipEarlyExitThreshold: settings.mipEarlyExitThreshold,
          invert: settings.invert,
          samplingMode: effectiveSamplingMode,
          isSegmentation: layer.isSegmentation,
          scaleLevel,
          brickPageTable,
          brickAtlas,
          backgroundMask: layer.isSegmentation ? null : (frame.backgroundMasksByScale[scaleLevel] ?? null),
          playbackWarmupForLayerKey: layer.key,
          playbackWarmupTimeIndex: frame.timeIndex,
          playbackRole: 'warmup',
          playbackSlotIndex: frame.slotIndex
        }];
      })
    );
    const stableLayers = stabilizeViewerLayerArray(nextLayers, viewerPlaybackWarmupLayersCacheRef.current);
    viewerPlaybackWarmupLayersCacheRef.current = stableLayers;
    return stableLayers;
  }, [
    activeLayers,
    channelNameMap,
    channelVisibility,
    createLayerDefaultSettings,
    layerSettings,
    normalizedPlaybackWarmupFrames,
  ]);

  const layerDepthMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const layer of layers) {
      map.set(layer.key, layer.depth);
    }
    return map;
  }, [layers]);

  const computedMaxSliceDepth = useMemo(() => {
    let depth = 0;
    for (const layer of viewerLayers) {
      const fallbackDepth = layerDepthMap.get(layer.key) ?? 0;
      depth = Math.max(depth, layer.volume?.depth ?? fallbackDepth);
    }
    return depth;
  }, [layerDepthMap, viewerLayers]);

  return {
    viewerLayers,
    viewerPlaybackWarmupLayers,
    computedMaxSliceDepth,
    handleLayerSelect,
    handleLayerSoloToggle,
    handleChannelSliderReset,
    handleLayerContrastChange,
    handleLayerBrightnessChange,
    handleLayerWindowMinChange,
    handleLayerWindowMaxChange,
    handleLayerAutoContrast,
    handleLayerOffsetChange,
    handleLayerColorChange,
    handleLayerRenderStyleChange,
    handleLayerRenderStyleToggle,
    handleLayerBlDensityScaleChange,
    handleLayerBlBackgroundCutoffChange,
    handleLayerBlOpacityScaleChange,
    handleLayerBlEarlyExitAlphaChange,
    handleLayerMipEarlyExitThresholdChange,
    handleLayerSamplingModeToggle,
    handleLayerInvertToggle
  };
}
