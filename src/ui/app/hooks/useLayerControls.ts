import { useCallback, useMemo, type Dispatch, type SetStateAction } from 'react';
import { computeAutoWindow } from '../../../autoContrast';
import { normalizeHexColor, DEFAULT_LAYER_COLOR } from '../../../shared/colorMaps/layerColors';
import {
  brightnessContrastModel,
  clampWindowBounds,
  DEFAULT_WINDOW_MAX,
  DEFAULT_WINDOW_MIN,
  type BrightnessContrastState,
  type LayerSettings,
  type SamplingMode,
  updateLayerSettings
} from '../../../state/layerSettings';
import type { LoadedLayer } from '../../../types/layers';

export type LayerControlsParams = {
  layers: LoadedLayer[];
  selectedIndex: number;
  layerAutoThresholds: Record<string, number>;
  setLayerAutoThresholds: Dispatch<SetStateAction<Record<string, number>>>;
  createLayerDefaultSettings: (key: string) => LayerSettings;
  createLayerDefaultBrightnessState: (key: string) => BrightnessContrastState;
  layerSettings: Record<string, LayerSettings>;
  setLayerSettings: Dispatch<SetStateAction<Record<string, LayerSettings>>>;
  setChannelActiveLayer: Dispatch<SetStateAction<Record<string, string>>>;
  setChannelVisibility: Dispatch<SetStateAction<Record<string, boolean>>>;
  channelVisibility: Record<string, boolean>;
  channelActiveLayer: Record<string, string>;
  channelNameMap: Map<string, string>;
  layerChannelMap: Map<string, string>;
  loadedChannelIds: string[];
  setActiveChannelTabId: Dispatch<SetStateAction<string | null>>;
  setGlobalRenderStyle: Dispatch<SetStateAction<0 | 1>>;
  setGlobalSamplingMode: Dispatch<SetStateAction<SamplingMode>>;
};

export function useLayerControls({
  layers,
  selectedIndex,
  layerAutoThresholds,
  setLayerAutoThresholds,
  createLayerDefaultSettings,
  createLayerDefaultBrightnessState,
  layerSettings,
  setLayerSettings,
  setChannelActiveLayer,
  setChannelVisibility,
  channelVisibility,
  channelActiveLayer,
  channelNameMap,
  layerChannelMap,
  loadedChannelIds,
  setActiveChannelTabId,
  setGlobalRenderStyle,
  setGlobalSamplingMode
}: LayerControlsParams) {
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
      const layer = layers.find((entry) => entry.key === key);
      if (!layer) {
        return;
      }
      const volume = layer.volumes[selectedIndex] ?? null;
      if (!volume) {
        return;
      }

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
    },
    [createLayerDefaultSettings, layerAutoThresholds, layers, selectedIndex, setLayerAutoThresholds, setLayerSettings]
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

  const handleLayerRenderStyleToggle = useCallback(() => {
    setGlobalRenderStyle((current) => {
      const nextStyle: 0 | 1 = current === 1 ? 0 : 1;
      setLayerSettings((settings) => {
        let changed = false;
        const nextSettings: Record<string, LayerSettings> = { ...settings };
        for (const [layerKey, previous] of Object.entries(settings)) {
          if (previous.renderStyle !== nextStyle) {
            nextSettings[layerKey] = { ...previous, renderStyle: nextStyle };
            changed = true;
          }
        }
        return changed ? nextSettings : settings;
      });
      return nextStyle;
    });
  }, [setGlobalRenderStyle, setLayerSettings]);

  const handleLayerSamplingModeToggle = useCallback(() => {
    setGlobalSamplingMode((current) => {
      const nextMode: SamplingMode = current === 'nearest' ? 'linear' : 'nearest';
      setLayerSettings((settings) => {
        let changed = false;
        const nextSettings: Record<string, LayerSettings> = { ...settings };
        for (const [layerKey, previous] of Object.entries(settings)) {
          if (previous.samplingMode !== nextMode) {
            nextSettings[layerKey] = { ...previous, samplingMode: nextMode };
            changed = true;
          }
        }
        return changed ? nextSettings : settings;
      });
      return nextMode;
    });
  }, [setGlobalSamplingMode, setLayerSettings]);

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

  const handleChannelLayerSelectionChange = useCallback(
    (channelId: string, layerKey: string) => {
      setChannelActiveLayer((current) => {
        if (current[channelId] === layerKey) {
          return current;
        }
        return {
          ...current,
          [channelId]: layerKey
        };
      });
    },
    [setChannelActiveLayer]
  );

  const handleLayerSelect = useCallback(
    (layerKey: string) => {
      const channelId = layerChannelMap.get(layerKey);
      if (!channelId) {
        return;
      }
      handleChannelLayerSelectionChange(channelId, layerKey);
      setActiveChannelTabId((current) => (current === channelId ? current : channelId));
    },
    [handleChannelLayerSelectionChange, layerChannelMap, setActiveChannelTabId]
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

  const viewerLayers = useMemo(() => {
    const activeLayers: LoadedLayer[] = [];
    for (const layer of layers) {
      if (channelActiveLayer[layer.channelId] === layer.key) {
        activeLayers.push(layer);
      }
    }

    return activeLayers.map((layer) => {
      const settings = layerSettings[layer.key] ?? createLayerDefaultSettings(layer.key);
      const channelVisible = channelVisibility[layer.channelId];
      return {
        key: layer.key,
        label: layer.label,
        channelId: layer.channelId,
        channelName: channelNameMap.get(layer.channelId) ?? 'Untitled channel',
        volume: layer.volumes[selectedIndex] ?? null,
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
        invert: settings.invert,
        samplingMode: settings.samplingMode,
        isSegmentation: layer.isSegmentation
      };
    });
  }, [
    channelActiveLayer,
    channelNameMap,
    channelVisibility,
    createLayerDefaultSettings,
    layerSettings,
    layers,
    selectedIndex
  ]);

  const computedMaxSliceDepth = useMemo(() => {
    let depth = 0;
    for (const layer of viewerLayers) {
      if (layer.volume) {
        depth = Math.max(depth, layer.volume.depth);
      }
    }
    return depth;
  }, [viewerLayers]);

  return {
    viewerLayers,
    computedMaxSliceDepth,
    handleChannelLayerSelectionChange,
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
    handleLayerRenderStyleToggle,
    handleLayerSamplingModeToggle,
    handleLayerInvertToggle
  };
}
