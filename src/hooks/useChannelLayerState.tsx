import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction
} from 'react';
import {
  DEFAULT_LAYER_COLOR,
  GRAYSCALE_COLOR_SWATCHES,
  normalizeHexColor
} from '../shared/colorMaps/layerColors';
import { getTrackColorHex } from '../shared/colorMaps/trackColors';
import {
  brightnessContrastModel,
  DEFAULT_BL_BACKGROUND_CUTOFF,
  DEFAULT_BL_DENSITY_SCALE,
  DEFAULT_BL_EARLY_EXIT_ALPHA,
  DEFAULT_BL_OPACITY_SCALE,
  DEFAULT_MIP_EARLY_EXIT_THRESHOLD,
  DEFAULT_SAMPLING_MODE,
  type SamplingMode
} from '../state/layerSettings';
import type { LayerSettings } from '../state/layerSettings';
import { type ChannelSourcesApi, useChannelSources } from './dataset';

export type ChannelLayerState = ChannelSourcesApi & {
  channelVisibility: Record<string, boolean>;
  setChannelVisibility: Dispatch<SetStateAction<Record<string, boolean>>>;
  layerSettings: Record<string, LayerSettings>;
  setLayerSettings: Dispatch<SetStateAction<Record<string, LayerSettings>>>;
  layerAutoThresholds: Record<string, number>;
  setLayerAutoThresholds: Dispatch<SetStateAction<Record<string, number>>>;
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
  createLayerDefaultBrightnessState: (layerKey: string) => ReturnType<typeof brightnessContrastModel.createState>;
};

export function useChannelLayerState(): ChannelLayerState {
  const channelSources = useChannelSources();
  const [channelVisibility, setChannelVisibility] = useState<Record<string, boolean>>({});
  const [layerSettings, setLayerSettings] = useState<Record<string, LayerSettings>>({});
  const [layerAutoThresholds, setLayerAutoThresholds] = useState<Record<string, number>>({});
  const [globalSamplingMode, setGlobalSamplingMode] = useState<SamplingMode>(DEFAULT_SAMPLING_MODE);
  const [globalBlDensityScale, setGlobalBlDensityScale] = useState(DEFAULT_BL_DENSITY_SCALE);
  const [globalBlBackgroundCutoff, setGlobalBlBackgroundCutoff] = useState(DEFAULT_BL_BACKGROUND_CUTOFF);
  const [globalBlOpacityScale, setGlobalBlOpacityScale] = useState(DEFAULT_BL_OPACITY_SCALE);
  const [globalBlEarlyExitAlpha, setGlobalBlEarlyExitAlpha] = useState(DEFAULT_BL_EARLY_EXIT_ALPHA);
  const [globalMipEarlyExitThreshold, setGlobalMipEarlyExitThreshold] = useState(DEFAULT_MIP_EARLY_EXIT_THRESHOLD);

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

  const createLayerDefaultBrightnessState = useCallback(
    (_layerKey: string) => brightnessContrastModel.createState(),
    []
  );

  return {
    ...channelSources,
    channelVisibility,
    setChannelVisibility,
    layerSettings,
    setLayerSettings,
    layerAutoThresholds,
    setLayerAutoThresholds,
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
    createLayerDefaultBrightnessState
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
