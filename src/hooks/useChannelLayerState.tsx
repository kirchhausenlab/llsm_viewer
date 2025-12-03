import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type ReactNode,
  type SetStateAction
} from 'react';
import { computeAutoWindow } from '../autoContrast';
import {
  DEFAULT_LAYER_COLOR,
  GRAYSCALE_COLOR_SWATCHES,
  normalizeHexColor
} from '../layerColors';
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
} from '../state/layerSettings';
import type { LoadedLayer } from '../types/layers';
import type { VoxelResolutionValues } from '../types/voxelResolution';
import type { ExperimentDimension } from './useVoxelResolution';
import { type ChannelSourcesApi, type LoadState, useChannelSources } from './useChannelSources';

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

export type ApplyLoadedLayersOptions = {
  setSelectedIndex: (index: number) => void;
  setActiveChannelTabId: (id: string | null) => void;
  setStatus: (state: LoadState) => void;
  setLoadedCount: Dispatch<SetStateAction<number>>;
  setExpectedVolumeCount: (count: number) => void;
  setLoadProgress: (progress: number) => void;
  setIsPlaying: (value: boolean) => void;
  clearDatasetError: () => void;
  setError: (message: string | null) => void;
};

export type LoadSelectedDatasetOptions = {
  voxelResolution: VoxelResolutionValues | null;
  anisotropyScale: { x: number; y: number; z: number } | null;
  experimentDimension: ExperimentDimension;
  preprocessingSettingsRef: MutableRefObject<VoxelResolutionValues | null>;
  setStatus: (state: LoadState) => void;
  setError: (message: string | null) => void;
  clearDatasetError: () => void;
  setSelectedIndex: (index: number) => void;
  setIsPlaying: (value: boolean) => void;
  setLoadProgress: (value: number) => void;
  setLoadedCount: Dispatch<SetStateAction<number>>;
  setExpectedVolumeCount: (value: number) => void;
  setActiveChannelTabId: (value: string | null) => void;
  showLaunchError: (message: string) => void;
};

export type ChannelLayerState = Omit<ChannelSourcesApi, 'loadSelectedDataset' | 'applyLoadedLayers'> & {
  layers: LoadedLayer[];
  setLayers: Dispatch<SetStateAction<LoadedLayer[]>>;
  channelVisibility: Record<string, boolean>;
  setChannelVisibility: Dispatch<SetStateAction<Record<string, boolean>>>;
  channelActiveLayer: Record<string, string>;
  setChannelActiveLayer: Dispatch<SetStateAction<Record<string, string>>>;
  layerSettings: Record<string, LayerSettings>;
  setLayerSettings: Dispatch<SetStateAction<Record<string, LayerSettings>>>;
  layerAutoThresholds: Record<string, number>;
  setLayerAutoThresholds: Dispatch<SetStateAction<Record<string, number>>>;
  globalRenderStyle: 0 | 1;
  setGlobalRenderStyle: Dispatch<SetStateAction<0 | 1>>;
  globalSamplingMode: SamplingMode;
  setGlobalSamplingMode: Dispatch<SetStateAction<SamplingMode>>;
  channelDefaultColorMap: Map<string, string>;
  getChannelDefaultColor: (channelId: string) => string;
  createLayerDefaultSettings: (layerKey: string) => LayerSettings;
  createLayerDefaultBrightnessState: (layerKey: string) => ReturnType<typeof brightnessContrastModel.createState>;
  applyLoadedLayers: (
    normalizedLayers: LoadedLayer[],
    expectedVolumeCount: number,
    options: ApplyLoadedLayersOptions
  ) => void;
  loadSelectedDataset: (options: LoadSelectedDatasetOptions) => Promise<LoadedLayer[] | null>;
};

export function useChannelLayerState(): ChannelLayerState {
  const channelSources = useChannelSources();
  const [layers, setLayers] = useState<LoadedLayer[]>([]);
  const layersRef = useRef<LoadedLayer[]>([]);
  const [channelVisibility, setChannelVisibility] = useState<Record<string, boolean>>({});
  const [channelActiveLayer, setChannelActiveLayer] = useState<Record<string, string>>({});
  const [layerSettings, setLayerSettings] = useState<Record<string, LayerSettings>>({});
  const [layerAutoThresholds, setLayerAutoThresholds] = useState<Record<string, number>>({});
  const [globalRenderStyle, setGlobalRenderStyle] = useState<0 | 1>(DEFAULT_RENDER_STYLE);
  const [globalSamplingMode, setGlobalSamplingMode] = useState<SamplingMode>(DEFAULT_SAMPLING_MODE);

  useEffect(() => {
    layersRef.current = layers;
  }, [layers]);

  const channelDefaultColorMap = useMemo(() => {
    const colorableChannels = channelSources.channels.filter((channel) =>
      channel.layers.some((layer) => !layer.isSegmentation)
    );
    if (colorableChannels.length <= 1) {
      return new Map<string, string>();
    }

    const fallbackSwatch = GRAYSCALE_COLOR_SWATCHES[0];
    const shiftedSwatches = GRAYSCALE_COLOR_SWATCHES.slice(1);

    const map = new Map<string, string>();
    colorableChannels.forEach((channel, index) => {
      const swatch = index < shiftedSwatches.length ? shiftedSwatches[index] : fallbackSwatch;
      map.set(channel.id, normalizeHexColor(swatch?.value, DEFAULT_LAYER_COLOR));
    });
    return map;
  }, [channelSources.channels]);

  const getChannelDefaultColor = useCallback(
    (channelId: string): string => channelDefaultColorMap.get(channelId) ?? DEFAULT_LAYER_COLOR,
    [channelDefaultColorMap]
  );

  const createLayerDefaultSettings = useCallback(
    (layerKey: string): LayerSettings => {
      const layer = layersRef.current.find((entry) => entry.key === layerKey) ?? null;
      const { windowMin, windowMax } = computeInitialWindowForVolume(layer?.volumes[0]);
      const defaultColor =
        layer?.isSegmentation === true
          ? DEFAULT_LAYER_COLOR
          : getChannelDefaultColor(layer?.channelId ?? '');
      return {
        ...createDefaultLayerSettings({ windowMin, windowMax }),
        color: defaultColor,
        renderStyle: globalRenderStyle,
        samplingMode: globalSamplingMode
      };
    },
    [getChannelDefaultColor, globalRenderStyle, globalSamplingMode]
  );

  const createLayerDefaultBrightnessState = useCallback(
    (_layerKey: string) => brightnessContrastModel.createState(DEFAULT_WINDOW_MIN, DEFAULT_WINDOW_MAX),
    []
  );

  const applyLoadedLayers: ChannelLayerState['applyLoadedLayers'] = useCallback(
    (normalizedLayers, expectedVolumeCount, options) =>
      channelSources.applyLoadedLayers(normalizedLayers, expectedVolumeCount, {
        ...options,
        setChannelVisibility,
        setChannelActiveLayer,
        setLayerSettings,
        setLayerAutoThresholds,
        globalRenderStyle,
        globalSamplingMode,
        getChannelDefaultColor
      }),
    [
      channelSources,
      getChannelDefaultColor,
      globalRenderStyle,
      globalSamplingMode,
      setChannelActiveLayer,
      setChannelVisibility
    ]
  );

  const loadSelectedDataset: ChannelLayerState['loadSelectedDataset'] = useCallback(
    (options) =>
      channelSources.loadSelectedDataset({
        ...options,
        channels: channelSources.channels,
        setLayers,
        setChannelVisibility,
        setChannelActiveLayer,
        setLayerSettings,
        setLayerAutoThresholds,
        getChannelDefaultColor,
        globalRenderStyle,
        globalSamplingMode
      }),
    [
      channelSources,
      getChannelDefaultColor,
      globalRenderStyle,
      globalSamplingMode,
      setChannelActiveLayer,
      setChannelVisibility
    ]
  );

  return {
    ...channelSources,
    layers,
    setLayers,
    channelVisibility,
    setChannelVisibility,
    channelActiveLayer,
    setChannelActiveLayer,
    layerSettings,
    setLayerSettings,
    layerAutoThresholds,
    setLayerAutoThresholds,
    globalRenderStyle,
    setGlobalRenderStyle,
    globalSamplingMode,
    setGlobalSamplingMode,
    channelDefaultColorMap,
    getChannelDefaultColor,
    createLayerDefaultSettings,
    createLayerDefaultBrightnessState,
    applyLoadedLayers,
    loadSelectedDataset
  };
}

const ChannelLayerStateContext = createContext<ChannelLayerState | null>(null);

export function ChannelLayerStateProvider({ children }: { children: ReactNode }) {
  const value = useChannelLayerState();
  return <ChannelLayerStateContext.Provider value={value}>{children}</ChannelLayerStateContext.Provider>;
}

export function useChannelLayerStateContext(): ChannelLayerState {
  const value = useContext(ChannelLayerStateContext);
  if (!value) {
    throw new Error('useChannelLayerStateContext must be used within a ChannelLayerStateProvider');
  }
  return value;
}
