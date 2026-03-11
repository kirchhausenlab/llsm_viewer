import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction
} from 'react';
import { computeAutoWindow } from '../autoContrast';
import {
  DEFAULT_LAYER_COLOR,
  GRAYSCALE_COLOR_SWATCHES,
  normalizeHexColor
} from '../shared/colorMaps/layerColors';
import { getTrackColorHex } from '../shared/colorMaps/trackColors';
import {
  brightnessContrastModel,
  clampWindowBounds,
  createDefaultLayerSettings,
  DEFAULT_BL_BACKGROUND_CUTOFF,
  DEFAULT_BL_DENSITY_SCALE,
  DEFAULT_BL_EARLY_EXIT_ALPHA,
  DEFAULT_BL_OPACITY_SCALE,
  DEFAULT_MIP_EARLY_EXIT_THRESHOLD,
  DEFAULT_RENDER_STYLE,
  DEFAULT_SAMPLING_MODE,
  DEFAULT_WINDOW_MAX,
  DEFAULT_WINDOW_MIN,
  resolveLayerSamplingMode,
  type LayerSettings,
  type RenderStyle,
  type SamplingMode
} from '../state/layerSettings';
import type { LoadedLayer } from '../types/layers';
import { type ChannelSourcesApi, useChannelSources } from './dataset';
import type {
  ApplyLoadedLayersOptions as ChannelSourcesApplyLoadedLayersOptions,
  LoadSelectedDatasetOptions as ChannelSourcesLoadSelectedDatasetOptions
} from './dataset/useChannelDatasetLoader';

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

type ChannelLayerLoadBindingKeys =
  | 'setChannelVisibility'
  | 'setLayerSettings'
  | 'setLayerAutoThresholds'
  | 'globalRenderStyle'
  | 'globalSamplingMode'
  | 'globalBlDensityScale'
  | 'globalBlBackgroundCutoff'
  | 'globalBlOpacityScale'
  | 'globalBlEarlyExitAlpha'
  | 'globalMipEarlyExitThreshold'
  | 'getChannelDefaultColor';

export type ApplyLoadedLayersOptions = Omit<ChannelSourcesApplyLoadedLayersOptions, ChannelLayerLoadBindingKeys>;

export type LoadSelectedDatasetOptions = Omit<
  ChannelSourcesLoadSelectedDatasetOptions,
  ChannelLayerLoadBindingKeys | 'setLayers' | 'channels'
>;

export type ChannelLayerState = Omit<ChannelSourcesApi, 'loadSelectedDataset' | 'applyLoadedLayers'> & {
  layers: LoadedLayer[];
  setLayers: Dispatch<SetStateAction<LoadedLayer[]>>;
  channelVisibility: Record<string, boolean>;
  setChannelVisibility: Dispatch<SetStateAction<Record<string, boolean>>>;
  layerSettings: Record<string, LayerSettings>;
  setLayerSettings: Dispatch<SetStateAction<Record<string, LayerSettings>>>;
  layerAutoThresholds: Record<string, number>;
  setLayerAutoThresholds: Dispatch<SetStateAction<Record<string, number>>>;
  globalRenderStyle: RenderStyle;
  setGlobalRenderStyle: Dispatch<SetStateAction<RenderStyle>>;
  globalSamplingMode: SamplingMode;
  setGlobalSamplingMode: Dispatch<SetStateAction<SamplingMode>>;
  globalBlDensityScale: number;
  setGlobalBlDensityScale: Dispatch<SetStateAction<number>>;
  globalBlBackgroundCutoff: number;
  setGlobalBlBackgroundCutoff: Dispatch<SetStateAction<number>>;
  globalBlOpacityScale: number;
  setGlobalBlOpacityScale: Dispatch<SetStateAction<number>>;
  globalBlEarlyExitAlpha: number;
  setGlobalBlEarlyExitAlpha: Dispatch<SetStateAction<number>>;
  globalMipEarlyExitThreshold: number;
  setGlobalMipEarlyExitThreshold: Dispatch<SetStateAction<number>>;
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
  const [layerSettings, setLayerSettings] = useState<Record<string, LayerSettings>>({});
  const [layerAutoThresholds, setLayerAutoThresholds] = useState<Record<string, number>>({});
  const [globalRenderStyle, setGlobalRenderStyle] = useState<RenderStyle>(DEFAULT_RENDER_STYLE);
  const [globalSamplingMode, setGlobalSamplingMode] = useState<SamplingMode>(DEFAULT_SAMPLING_MODE);
  const [globalBlDensityScale, setGlobalBlDensityScale] = useState(DEFAULT_BL_DENSITY_SCALE);
  const [globalBlBackgroundCutoff, setGlobalBlBackgroundCutoff] = useState(DEFAULT_BL_BACKGROUND_CUTOFF);
  const [globalBlOpacityScale, setGlobalBlOpacityScale] = useState(DEFAULT_BL_OPACITY_SCALE);
  const [globalBlEarlyExitAlpha, setGlobalBlEarlyExitAlpha] = useState(DEFAULT_BL_EARLY_EXIT_ALPHA);
  const [globalMipEarlyExitThreshold, setGlobalMipEarlyExitThreshold] = useState(DEFAULT_MIP_EARLY_EXIT_THRESHOLD);

  useEffect(() => {
    layersRef.current = layers;
  }, [layers]);

  const channelDefaultColorMap = useMemo(() => {
    const colorableChannels = channelSources.channels.filter((channel) =>
      channel.volume !== null && !channel.volume.isSegmentation
    );
    if (colorableChannels.length <= 1) {
      return new Map<string, string>();
    }

    const shiftedSwatches = GRAYSCALE_COLOR_SWATCHES.slice(1);

    const map = new Map<string, string>();
    colorableChannels.forEach((channel, index) => {
      const swatch = shiftedSwatches[index];
      const explicitColor = swatch ? swatch.value : getTrackColorHex(channel.id);
      map.set(channel.id, normalizeHexColor(explicitColor, DEFAULT_LAYER_COLOR));
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
        samplingMode: resolveLayerSamplingMode(globalRenderStyle, globalSamplingMode, layer?.isSegmentation === true),
        blDensityScale: globalBlDensityScale,
        blBackgroundCutoff: globalBlBackgroundCutoff,
        blOpacityScale: globalBlOpacityScale,
        blEarlyExitAlpha: globalBlEarlyExitAlpha,
        mipEarlyExitThreshold: globalMipEarlyExitThreshold
      };
    },
    [
      getChannelDefaultColor,
      globalBlBackgroundCutoff,
      globalBlDensityScale,
      globalBlEarlyExitAlpha,
      globalBlOpacityScale,
      globalMipEarlyExitThreshold,
      globalRenderStyle,
      globalSamplingMode
    ]
  );

  const createLayerDefaultBrightnessState = useCallback(
    (_layerKey: string) => brightnessContrastModel.createState(DEFAULT_WINDOW_MIN, DEFAULT_WINDOW_MAX),
    []
  );

  const baseLoadBindings = useMemo(
    () => ({
      setChannelVisibility,
      setLayerSettings,
      setLayerAutoThresholds,
      getChannelDefaultColor,
      globalRenderStyle,
      globalSamplingMode,
      globalBlDensityScale,
      globalBlBackgroundCutoff,
      globalBlOpacityScale,
      globalBlEarlyExitAlpha,
      globalMipEarlyExitThreshold
    }),
    [
      getChannelDefaultColor,
      globalBlBackgroundCutoff,
      globalBlDensityScale,
      globalBlEarlyExitAlpha,
      globalBlOpacityScale,
      globalMipEarlyExitThreshold,
      globalRenderStyle,
      globalSamplingMode,
      setChannelVisibility
    ]
  );

  const loadSelectedDatasetBindings = useMemo(
    () => ({
      ...baseLoadBindings,
      setLayers
    }),
    [baseLoadBindings]
  );

  const applyLoadedLayers: ChannelLayerState['applyLoadedLayers'] = useCallback(
    (normalizedLayers, expectedVolumeCount, options) =>
      channelSources.applyLoadedLayers(normalizedLayers, expectedVolumeCount, {
        ...options,
        ...baseLoadBindings
      }),
    [baseLoadBindings, channelSources]
  );

  const loadSelectedDataset: ChannelLayerState['loadSelectedDataset'] = useCallback(
    (options) =>
      channelSources.loadSelectedDataset({
        ...options,
        channels: channelSources.channels,
        ...loadSelectedDatasetBindings
      }),
    [channelSources, loadSelectedDatasetBindings]
  );

  return {
    ...channelSources,
    layers,
    setLayers,
    channelVisibility,
    setChannelVisibility,
    layerSettings,
    setLayerSettings,
    layerAutoThresholds,
    setLayerAutoThresholds,
    globalRenderStyle,
    setGlobalRenderStyle,
    globalSamplingMode,
    setGlobalSamplingMode,
    globalBlDensityScale,
    setGlobalBlDensityScale,
    globalBlBackgroundCutoff,
    setGlobalBlBackgroundCutoff,
    globalBlOpacityScale,
    setGlobalBlOpacityScale,
    globalBlEarlyExitAlpha,
    setGlobalBlEarlyExitAlpha,
    globalMipEarlyExitThreshold,
    setGlobalMipEarlyExitThreshold,
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
