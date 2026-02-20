import { useCallback, useMemo, type Dispatch, type SetStateAction } from 'react';
import { computeAutoWindow } from '../../../autoContrast';
import { normalizeHexColor, DEFAULT_LAYER_COLOR } from '../../../shared/colorMaps/layerColors';
import type { NormalizedVolume } from '../../../core/volumeProcessing';
import type { VolumeBrickAtlas, VolumeBrickPageTable } from '../../../core/volumeProvider';
import {
  brightnessContrastModel,
  clampWindowBounds,
  DEFAULT_SLICED_PLANE_NORMAL,
  DEFAULT_SLICED_PLANE_POINT,
  RENDER_STYLE_BL,
  RENDER_STYLE_ISO,
  RENDER_STYLE_MIP,
  RENDER_STYLE_SLICED,
  DEFAULT_WINDOW_MAX,
  DEFAULT_WINDOW_MIN,
  type BrightnessContrastState,
  type LayerSettings,
  type RenderStyle,
  type SamplingMode,
  type SlicedPlaneVector,
  updateLayerSettings
} from '../../../state/layerSettings';
import type { LoadedDatasetLayer } from '../../../hooks/dataset';

export type LayerControlsParams = {
  layers: LoadedDatasetLayer[];
  selectedIndex: number;
  layerVolumes: Record<string, NormalizedVolume | null>;
  layerPageTables: Record<string, VolumeBrickPageTable | null>;
  layerBrickAtlases: Record<string, VolumeBrickAtlas | null>;
  loadVolume: ((layerKey: string, timepoint: number) => Promise<NormalizedVolume>) | null;
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
  setGlobalRenderStyle: Dispatch<SetStateAction<RenderStyle>>;
  setGlobalSamplingMode: Dispatch<SetStateAction<SamplingMode>>;
};

const nextRenderStyle = (current: RenderStyle): RenderStyle => {
  if (current === RENDER_STYLE_MIP) {
    return RENDER_STYLE_ISO;
  }
  if (current === RENDER_STYLE_ISO) {
    return RENDER_STYLE_BL;
  }
  return RENDER_STYLE_MIP;
};

const coerceFiniteNumber = (value: number, fallback = 0): number =>
  Number.isFinite(value) ? value : fallback;

const sanitizeSlicedPlanePoint = (point: SlicedPlaneVector): SlicedPlaneVector => ({
  x: coerceFiniteNumber(point.x),
  y: coerceFiniteNumber(point.y),
  z: coerceFiniteNumber(point.z)
});

const normalizeSlicedPlaneNormal = (normal: SlicedPlaneVector): SlicedPlaneVector => {
  const sanitized = sanitizeSlicedPlanePoint(normal);
  const magnitude = Math.hypot(sanitized.x, sanitized.y, sanitized.z);
  if (magnitude <= 1e-6) {
    return { ...DEFAULT_SLICED_PLANE_NORMAL };
  }
  return {
    x: sanitized.x / magnitude,
    y: sanitized.y / magnitude,
    z: sanitized.z / magnitude
  };
};

export function useLayerControls({
  layers,
  selectedIndex,
  layerVolumes,
  layerPageTables,
  layerBrickAtlases,
  loadVolume,
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
        const activeLayerKey = channelActiveLayer[channelId];
        if (activeLayerKey && channelLayers.some((layer) => layer.key === activeLayerKey)) {
          return activeLayerKey;
        }
        return channelLayers[0]?.key ?? null;
      }

      return [...layers].sort((left, right) => left.key.localeCompare(right.key))[0]?.key ?? null;
    },
    [channelActiveLayer, layers, loadedChannelIds]
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

  const handleLayerSlicedDepthChange = useCallback(
    (key: string, value: number) => {
      const nextDepth = Math.max(0, Math.round(coerceFiniteNumber(value)));
      setLayerSettings((current) => {
        const previous = current[key] ?? createLayerDefaultSettings(key);
        const previousDepth = Math.max(0, Math.round(coerceFiniteNumber(previous.slicedPlaneDepth)));
        if (previousDepth === nextDepth) {
          return current;
        }

        const previousPoint = sanitizeSlicedPlanePoint(previous.slicedPlanePoint);
        const deltaDepth = nextDepth - previousDepth;
        const normal = normalizeSlicedPlaneNormal(previous.slicedPlaneNormal);
        const nextPoint = {
          x: previousPoint.x + normal.x * deltaDepth,
          y: previousPoint.y + normal.y * deltaDepth,
          z: previousPoint.z + normal.z * deltaDepth
        };

        return {
          ...current,
          [key]: {
            ...previous,
            slicedPlaneDepth: nextDepth,
            slicedPlanePoint: nextPoint,
            slicedPlaneNormal: normal
          }
        };
      });
    },
    [createLayerDefaultSettings, setLayerSettings]
  );

  const handleLayerSlicedPlaneRotateSet = useCallback(
    (key: string, point: SlicedPlaneVector, normal: SlicedPlaneVector) => {
      const nextPoint = sanitizeSlicedPlanePoint(point);
      const nextNormal = normalizeSlicedPlaneNormal(normal);
      setLayerSettings((current) => {
        const previous = current[key] ?? createLayerDefaultSettings(key);
        const previousPoint = sanitizeSlicedPlanePoint(previous.slicedPlanePoint);
        const previousNormal = normalizeSlicedPlaneNormal(previous.slicedPlaneNormal);
        const pointUnchanged =
          previousPoint.x === nextPoint.x &&
          previousPoint.y === nextPoint.y &&
          previousPoint.z === nextPoint.z;
        const normalUnchanged =
          previousNormal.x === nextNormal.x &&
          previousNormal.y === nextNormal.y &&
          previousNormal.z === nextNormal.z;

        if (pointUnchanged && normalUnchanged) {
          return current;
        }

        return {
          ...current,
          [key]: {
            ...previous,
            slicedPlanePoint: nextPoint,
            slicedPlaneNormal: nextNormal
          }
        };
      });
    },
    [createLayerDefaultSettings, setLayerSettings]
  );

  const handleLayerSlicedAnglesReset = useCallback(
    (key: string) => {
      setLayerSettings((current) => {
        const previous = current[key] ?? createLayerDefaultSettings(key);
        const previousPoint = sanitizeSlicedPlanePoint(previous.slicedPlanePoint);
        const previousNormal = normalizeSlicedPlaneNormal(previous.slicedPlaneNormal);
        const nextDepth = Math.max(0, Math.round(coerceFiniteNumber(previous.slicedPlaneDepth)));
        const nextPoint = {
          x: DEFAULT_SLICED_PLANE_POINT.x,
          y: DEFAULT_SLICED_PLANE_POINT.y,
          z: nextDepth
        };
        const nextNormal = { ...DEFAULT_SLICED_PLANE_NORMAL };

        const depthUnchanged = previous.slicedPlaneDepth === nextDepth;
        const pointUnchanged =
          previousPoint.x === nextPoint.x &&
          previousPoint.y === nextPoint.y &&
          previousPoint.z === nextPoint.z;
        const normalUnchanged =
          previousNormal.x === nextNormal.x &&
          previousNormal.y === nextNormal.y &&
          previousNormal.z === nextNormal.z;

        if (depthUnchanged && pointUnchanged && normalUnchanged) {
          return current;
        }

        return {
          ...current,
          [key]: {
            ...previous,
            slicedPlaneDepth: nextDepth,
            slicedPlanePoint: nextPoint,
            slicedPlaneNormal: nextNormal
          }
        };
      });
    },
    [createLayerDefaultSettings, setLayerSettings]
  );

  const handleLayerRenderStyleChange = useCallback(
    (layerKey: string, renderStyle: RenderStyle) => {
      setLayerSettings((current) => {
        const previous = current[layerKey] ?? createLayerDefaultSettings(layerKey);
        if (previous.renderStyle === renderStyle) {
          return current;
        }
        return {
          ...current,
          [layerKey]: {
            ...previous,
            renderStyle,
          }
        };
      });
      setGlobalRenderStyle(renderStyle);
    },
    [createLayerDefaultSettings, setGlobalRenderStyle, setLayerSettings]
  );

  const handleLayerRenderStyleToggle = useCallback(
    (layerKey?: string) => {
      const targetLayerKey = resolveRenderStyleTargetLayerKey(layerKey);
      if (!targetLayerKey) {
        return;
      }
      const currentStyle = (layerSettings[targetLayerKey] ?? createLayerDefaultSettings(targetLayerKey)).renderStyle;
      const nextStyle = nextRenderStyle(currentStyle);
      handleLayerRenderStyleChange(targetLayerKey, nextStyle);
    },
    [
      createLayerDefaultSettings,
      handleLayerRenderStyleChange,
      layerSettings,
      resolveRenderStyleTargetLayerKey
    ]
  );

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

  const handleLayerBlDensityScaleChange = useCallback(
    (key: string, value: number) => {
      const clamped = Math.max(0, value);
      setLayerSettings((current) => {
        const previous = current[key] ?? createLayerDefaultSettings(key);
        if (previous.blDensityScale === clamped) {
          return current;
        }
        return {
          ...current,
          [key]: {
            ...previous,
            blDensityScale: clamped
          }
        };
      });
    },
    [createLayerDefaultSettings, setLayerSettings]
  );

  const handleLayerBlBackgroundCutoffChange = useCallback(
    (key: string, value: number) => {
      const clamped = Math.min(Math.max(value, 0), 1);
      setLayerSettings((current) => {
        const previous = current[key] ?? createLayerDefaultSettings(key);
        if (previous.blBackgroundCutoff === clamped) {
          return current;
        }
        return {
          ...current,
          [key]: {
            ...previous,
            blBackgroundCutoff: clamped
          }
        };
      });
    },
    [createLayerDefaultSettings, setLayerSettings]
  );

  const handleLayerBlOpacityScaleChange = useCallback(
    (key: string, value: number) => {
      const clamped = Math.max(0, value);
      setLayerSettings((current) => {
        const previous = current[key] ?? createLayerDefaultSettings(key);
        if (previous.blOpacityScale === clamped) {
          return current;
        }
        return {
          ...current,
          [key]: {
            ...previous,
            blOpacityScale: clamped
          }
        };
      });
    },
    [createLayerDefaultSettings, setLayerSettings]
  );

  const handleLayerBlEarlyExitAlphaChange = useCallback(
    (key: string, value: number) => {
      const clamped = Math.min(Math.max(value, 0), 1);
      setLayerSettings((current) => {
        const previous = current[key] ?? createLayerDefaultSettings(key);
        if (previous.blEarlyExitAlpha === clamped) {
          return current;
        }
        return {
          ...current,
          [key]: {
            ...previous,
            blEarlyExitAlpha: clamped
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
    const activeLayers: LoadedDatasetLayer[] = [];
    for (const channelId of loadedChannelIds) {
      const channelLayers = layers.filter((layer) => layer.channelId === channelId);
      if (channelLayers.length === 0) {
        continue;
      }
      const selectedKey = channelActiveLayer[channelId];
      const selectedLayer =
        (selectedKey ? channelLayers.find((layer) => layer.key === selectedKey) : null) ?? channelLayers[0];
      activeLayers.push(selectedLayer);
    }

    return activeLayers.map((layer) => {
      const settings = layerSettings[layer.key] ?? createLayerDefaultSettings(layer.key);
      const channelVisible = channelVisibility[layer.channelId];
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
        blDensityScale: settings.blDensityScale,
        blBackgroundCutoff: settings.blBackgroundCutoff,
        blOpacityScale: settings.blOpacityScale,
        blEarlyExitAlpha: settings.blEarlyExitAlpha,
        invert: settings.invert,
        samplingMode: settings.samplingMode,
        sliceIndex: settings.slicedPlaneDepth,
        slicedPlanePoint: { ...settings.slicedPlanePoint },
        slicedPlaneNormal: { ...settings.slicedPlaneNormal },
        slicedPlaneEnabled: settings.renderStyle === RENDER_STYLE_SLICED,
        isSegmentation: layer.isSegmentation,
        scaleLevel:
          layerBrickAtlases[layer.key]?.scaleLevel ?? layerVolumes[layer.key]?.scaleLevel ?? 0,
        brickPageTable: layerPageTables[layer.key] ?? null,
        brickAtlas: layerBrickAtlases[layer.key] ?? null
      };
    });
  }, [
    channelActiveLayer,
    channelNameMap,
    channelVisibility,
    createLayerDefaultSettings,
    layerBrickAtlases,
    layerPageTables,
    layerVolumes,
    layerSettings,
    layers,
    loadedChannelIds
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
    handleLayerSlicedDepthChange,
    handleLayerSlicedPlaneRotateSet,
    handleLayerSlicedAnglesReset,
    handleLayerRenderStyleChange,
    handleLayerRenderStyleToggle,
    handleLayerBlDensityScaleChange,
    handleLayerBlBackgroundCutoffChange,
    handleLayerBlOpacityScaleChange,
    handleLayerBlEarlyExitAlphaChange,
    handleLayerSamplingModeToggle,
    handleLayerInvertToggle
  };
}
