import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import FrontPage from './components/FrontPage';
import ViewerShell, { type ViewerShellProps } from './components/ViewerShell';
import type { NumericRange, TrackColorMode, TrackDefinition, TrackPoint } from './types/tracks';
import {
  DEFAULT_LAYER_COLOR,
  GRAYSCALE_COLOR_SWATCHES,
  normalizeHexColor
} from './layerColors';
import { clearTextureCache } from './textureCache';
import {
  DEFAULT_TRACK_COLOR,
  TRACK_COLOR_SWATCHES,
  normalizeTrackColor,
  type TrackColorOption
} from './trackColors';
import {
  brightnessContrastModel,
  clampWindowBounds,
  computeContrastMultiplier,
  createDefaultLayerSettings,
  DEFAULT_RENDER_STYLE,
  DEFAULT_SAMPLING_MODE,
  DEFAULT_WINDOW_MAX,
  DEFAULT_WINDOW_MIN,
  formatContrastMultiplier,
  type LayerSettings,
  type SamplingMode
} from './state/layerSettings';
import { deriveChannelTrackOffsets } from './state/channelTrackOffsets';
import type { LoadedLayer } from './types/layers';
import type { HoveredVoxelInfo } from './types/hover';
import type { ChannelTrackState, FollowedTrackState } from './types/channelTracks';
import type { NormalizedVolume } from './volumeProcessing';
import './styles/app/index.css';
import { computeAutoWindow, getVolumeHistogram } from './autoContrast';
import { computeTrackSummary } from './utils/trackSummary';
import usePreprocessedExperiment from './hooks/usePreprocessedExperiment';
import type { VoxelResolutionInput, VoxelResolutionUnit, VoxelResolutionValues } from './types/voxelResolution';
import {
  collectFilesFromDataTransfer,
  dedupeFiles,
  groupFilesIntoLayers,
  hasTiffExtension,
  parseTrackCsvFile,
  sortVolumeFiles
} from './utils/appHelpers';
import { useVoxelResolution, type ExperimentDimension } from './hooks/useVoxelResolution';
import { useDatasetErrors, type DatasetErrorContext } from './hooks/useDatasetErrors';
import { useTracksForDisplay } from './hooks/useTracksForDisplay';
import {
  type ChannelLayerSource,
  type ChannelSource,
  type ChannelValidation,
  useChannelSources
} from './hooks/useChannelSources';
import { useViewerControls } from './hooks/useViewerControls';

const DEFAULT_TRACK_OPACITY = 0.9;
const DEFAULT_TRACK_LINE_WIDTH = 1;
const WINDOW_MARGIN = 24;
const CONTROL_WINDOW_WIDTH = 360;
const SELECTED_TRACKS_WINDOW_WIDTH = 1120;
const SELECTED_TRACKS_WINDOW_HEIGHT = 220;
const LAYERS_WINDOW_VERTICAL_OFFSET = 420;
const WARNING_WINDOW_WIDTH = 360;
const TRACK_SMOOTHING_RANGE: NumericRange = { min: 0, max: 5 };
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

type LoadState = 'idle' | 'loading' | 'loaded' | 'error';

const createDefaultChannelTrackState = (): ChannelTrackState => ({
  opacity: DEFAULT_TRACK_OPACITY,
  lineWidth: DEFAULT_TRACK_LINE_WIDTH,
  visibility: {},
  colorMode: { type: 'random' }
});

const clampRangeToBounds = (range: NumericRange, bounds: NumericRange): NumericRange => {
  const min = Math.min(Math.max(range.min, bounds.min), bounds.max);
  const max = Math.max(Math.min(range.max, bounds.max), min);
  return { min, max };
};

function App() {
  const {
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
    loadSelectedDataset
  } = useChannelSources();
  const [isExperimentSetupStarted, setIsExperimentSetupStarted] = useState(false);
  const [editingChannelId, setEditingChannelId] = useState<string | null>(null);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const {
    voxelResolutionInput,
    voxelResolution,
    anisotropyScale,
    trackScale,
    experimentDimension,
    handleVoxelResolutionAxisChange,
    handleVoxelResolutionUnitChange,
    handleVoxelResolutionAnisotropyToggle,
    handleExperimentDimensionChange,
    setExperimentDimension,
    setVoxelResolutionInput
  } = useVoxelResolution();
  const {
    datasetError,
    datasetErrorContext,
    datasetErrorResetSignal,
    reportDatasetError,
    clearDatasetError,
    bumpDatasetErrorResetSignal
  } = useDatasetErrors();
  const [layers, setLayers] = useState<LoadedLayer[]>([]);
  const layersRef = useRef<LoadedLayer[]>([]);
  useEffect(() => {
    layersRef.current = layers;
  }, [layers]);
  const [channelVisibility, setChannelVisibility] = useState<Record<string, boolean>>({});
  const [channelActiveLayer, setChannelActiveLayer] = useState<Record<string, string>>({});
  const [layerSettings, setLayerSettings] = useState<Record<string, LayerSettings>>({});
  const [globalRenderStyle, setGlobalRenderStyle] = useState<0 | 1>(DEFAULT_RENDER_STYLE);
  const [globalSamplingMode, setGlobalSamplingMode] = useState<SamplingMode>(DEFAULT_SAMPLING_MODE);
  const [blendingMode, setBlendingMode] = useState<'alpha' | 'additive'>('additive');
  const preprocessingSettingsRef = useRef<VoxelResolutionValues | null>(null);
  const channelDefaultColorMap = useMemo(() => {
    const colorableChannels = channels.filter((channel) =>
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
  }, [channels]);
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
    (_layerKey: string) => {
      return brightnessContrastModel.createState(DEFAULT_WINDOW_MIN, DEFAULT_WINDOW_MAX);
    },
    []
  );
  const [layerAutoThresholds, setLayerAutoThresholds] = useState<Record<string, number>>({});
  const [status, setStatus] = useState<LoadState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [loadProgress, setLoadProgress] = useState(0);
  const [loadedCount, setLoadedCount] = useState(0);
  const [expectedVolumeCount, setExpectedVolumeCount] = useState(0);
  const [resetViewHandler, setResetViewHandler] = useState<(() => void) | null>(null);
  const [activeChannelTabId, setActiveChannelTabId] = useState<string | null>(null);
  const [activeTrackChannelId, setActiveTrackChannelId] = useState<string | null>(null);
  const [channelTrackStates, setChannelTrackStates] = useState<Record<string, ChannelTrackState>>({});
  const [trackOrderModeByChannel, setTrackOrderModeByChannel] = useState<Record<string, 'id' | 'length'>>({});
  const [selectedTrackOrder, setSelectedTrackOrder] = useState<string[]>([]);
  const selectedTrackIds = useMemo(() => new Set(selectedTrackOrder), [selectedTrackOrder]);
  const [selectedTracksAmplitudeLimits, setSelectedTracksAmplitudeLimits] =
    useState<NumericRange | null>(null);
  const [selectedTracksTimeLimits, setSelectedTracksTimeLimits] = useState<NumericRange | null>(null);
  const [trackSmoothing, setTrackSmoothing] = useState(0);
  const [pendingMinimumTrackLength, setPendingMinimumTrackLength] = useState(1);
  const [minimumTrackLength, setMinimumTrackLength] = useState(1);
  const [followedTrack, setFollowedTrack] = useState<FollowedTrackState>(null);
  const [viewerMode, setViewerMode] = useState<'3d' | '2d'>('3d');
  const [sliceIndex, setSliceIndex] = useState(0);
  const [orthogonalViewsEnabled, setOrthogonalViewsEnabled] = useState(false);
  const hasInitializedSliceIndexRef = useRef(false);
  const [isViewerLaunched, setIsViewerLaunched] = useState(false);
  const [isLaunchingViewer, setIsLaunchingViewer] = useState(false);
  const [layoutResetToken, setLayoutResetToken] = useState(0);
  const [hoveredVolumeVoxel, setHoveredVolumeVoxel] = useState<HoveredVoxelInfo | null>(null);
  const [isHelpMenuOpen, setIsHelpMenuOpen] = useState(false);
  const hasInitializedTrackColorsRef = useRef(false);

  const is3dViewerAvailable = experimentDimension === '3d';

  useEffect(() => {
    setHoveredVolumeVoxel(null);
  }, [viewerMode]);
  useEffect(() => {
    if (!is3dViewerAvailable) {
      setViewerMode('2d');
    }
  }, [is3dViewerAvailable]);
  const handleHelpMenuToggle = useCallback(() => {
    setIsHelpMenuOpen((previous) => !previous);
  }, []);

  useEffect(() => {
    if (channels.length === 0) {
      hasInitializedTrackColorsRef.current = false;
    }
  }, [channels.length]);
  const controlWindowInitialPosition = useMemo(
    () => ({ x: WINDOW_MARGIN, y: WINDOW_MARGIN }),
    []
  );
  const layersWindowInitialPosition = useMemo(
    () => ({ x: WINDOW_MARGIN, y: WINDOW_MARGIN + LAYERS_WINDOW_VERTICAL_OFFSET }),
    []
  );
  const computeRightColumnX = useCallback(() => {
    if (typeof window === 'undefined') {
      return WINDOW_MARGIN;
    }
    const windowWidth = Math.min(CONTROL_WINDOW_WIDTH, window.innerWidth - WINDOW_MARGIN * 2);
    return Math.max(WINDOW_MARGIN, window.innerWidth - windowWidth - WINDOW_MARGIN);
  }, []);
  const computeViewerSettingsWindowDefaultPosition = useCallback(() => {
    if (typeof window === 'undefined') {
      return { x: WINDOW_MARGIN, y: WINDOW_MARGIN };
    }

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const windowWidth = Math.min(CONTROL_WINDOW_WIDTH, viewportWidth - WINDOW_MARGIN * 2);
    const estimatedHeight = 320;
    const centeredX = Math.max(WINDOW_MARGIN, Math.round((viewportWidth - windowWidth) / 2));
    const centeredY = Math.max(
      WINDOW_MARGIN,
      Math.round((viewportHeight - estimatedHeight) / 2)
    );

    return { x: centeredX, y: centeredY };
  }, []);
  const computeTrackWindowDefaultPosition = useCallback(() => {
    const x = computeRightColumnX();

    if (typeof window === 'undefined') {
      return { x, y: WINDOW_MARGIN };
    }

    const viewportHeight = window.innerHeight;
    const estimatedHeight = 360;
    const maxY = Math.max(WINDOW_MARGIN, viewportHeight - estimatedHeight - WINDOW_MARGIN);

    return { x, y: Math.min(WINDOW_MARGIN, maxY) };
  }, [computeRightColumnX]);
  const [trackWindowInitialPosition, setTrackWindowInitialPosition] = useState<{ x: number; y: number }>(
    () => computeTrackWindowDefaultPosition()
  );
  const computeSelectedTracksWindowDefaultPosition = useCallback(() => {
    if (typeof window === 'undefined') {
      return { x: WINDOW_MARGIN, y: WINDOW_MARGIN };
    }
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const windowWidth = Math.min(SELECTED_TRACKS_WINDOW_WIDTH, viewportWidth - WINDOW_MARGIN * 2);
    const x = Math.max(WINDOW_MARGIN, Math.round((viewportWidth - windowWidth) / 2));
    const y = Math.max(
      WINDOW_MARGIN,
      viewportHeight - SELECTED_TRACKS_WINDOW_HEIGHT - WINDOW_MARGIN
    );
    return { x, y };
  }, []);
  const computePlotSettingsWindowDefaultPosition = useCallback(() => {
    if (typeof window === 'undefined') {
      return { x: WINDOW_MARGIN, y: WINDOW_MARGIN };
    }

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const windowWidth = Math.min(CONTROL_WINDOW_WIDTH, viewportWidth - WINDOW_MARGIN * 2);
    const estimatedHeight = 260;
    const x = Math.max(WINDOW_MARGIN, Math.round((viewportWidth - windowWidth) / 2));
    const anchorY = viewportHeight - SELECTED_TRACKS_WINDOW_HEIGHT - WINDOW_MARGIN;
    const y = Math.max(WINDOW_MARGIN, Math.round(anchorY - estimatedHeight - 16));
    return { x, y };
  }, []);
  const [viewerSettingsWindowInitialPosition, setViewerSettingsWindowInitialPosition] = useState<{
    x: number;
    y: number;
  }>(() => computeViewerSettingsWindowDefaultPosition());
  const [selectedTracksWindowInitialPosition, setSelectedTracksWindowInitialPosition] = useState<{
    x: number;
    y: number;
  }>(() => computeSelectedTracksWindowDefaultPosition());
  const [plotSettingsWindowInitialPosition, setPlotSettingsWindowInitialPosition] = useState<{
    x: number;
    y: number;
  }>(() => computePlotSettingsWindowDefaultPosition());
  const editingChannelOriginalNameRef = useRef('');
  const editingChannelInputRef = useRef<HTMLInputElement | null>(null);
  const pendingChannelFocusIdRef = useRef<string | null>(null);
  const helpMenuRef = useRef<HTMLDivElement | null>(null);

  const handleBeforeEnterVr = useCallback(() => {
    setFollowedTrack(null);
  }, [setFollowedTrack]);

  const {
    playback: { selectedIndex, setSelectedIndex, isPlaying, fps, togglePlayback, setFps, stopPlayback, setIsPlaying },
    vr: {
      isVrSupportChecked,
      isVrSupported,
      isVrPassthroughSupported,
      isVrActive,
      isVrRequesting,
      hasVrSessionHandlers,
      isVrAvailable,
      vrButtonLabel,
      enterVr,
      exitVr,
      registerSessionHandlers,
      handleSessionStarted,
      handleSessionEnded,
      vrButtonDisabled,
      vrButtonTitle,
      handleVrButtonClick
    }
  } = useViewerControls({
    viewerMode,
    is3dViewerAvailable,
    onBeforeEnterVr: handleBeforeEnterVr
  });

  useEffect(() => {
    if (editingChannelId && editingChannelId !== activeChannelId) {
      setEditingChannelId(null);
    }
  }, [activeChannelId, editingChannelId]);

  useEffect(() => {
    if (!isViewerLaunched) {
      setIsHelpMenuOpen(false);
    }
  }, [isViewerLaunched]);

  useEffect(() => {
    if (!isHelpMenuOpen) {
      return;
    }

    const handleDocumentClick = (event: MouseEvent) => {
      const container = helpMenuRef.current;
      if (!container) {
        return;
      }

      if (!container.contains(event.target as Node)) {
        setIsHelpMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsHelpMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleDocumentClick);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleDocumentClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isHelpMenuOpen]);

  useEffect(() => {
    if (datasetError && datasetErrorContext === 'launch') {
      bumpDatasetErrorResetSignal();
    }
  }, [bumpDatasetErrorResetSignal, datasetError, datasetErrorContext]);

  useEffect(() => {
    const pendingChannelId = pendingChannelFocusIdRef.current;
    if (!pendingChannelId) {
      return;
    }
    const pendingChannel = channels.find((channel) => channel.id === pendingChannelId);
    if (!pendingChannel) {
      pendingChannelFocusIdRef.current = null;
      return;
    }
    pendingChannelFocusIdRef.current = null;
    setActiveChannelId(pendingChannelId);
    editingChannelOriginalNameRef.current = pendingChannel.name;
    setEditingChannelId(pendingChannelId);
  }, [channels]);

  useEffect(() => {
    if (editingChannelId && !channels.some((channel) => channel.id === editingChannelId)) {
      setEditingChannelId(null);
    }
  }, [channels, editingChannelId]);

  useEffect(() => {
    if (isLaunchingViewer) {
      setEditingChannelId(null);
    }
  }, [isLaunchingViewer]);

  useEffect(() => {
    if (editingChannelId) {
      editingChannelInputRef.current?.focus();
      editingChannelInputRef.current?.select();
    }
  }, [editingChannelId]);

  useEffect(() => {
    if (channels.length === 0) {
      if (activeChannelId !== null) {
        setActiveChannelId(null);
      }
      return;
    }
    if (!activeChannelId || !channels.some((channel) => channel.id === activeChannelId)) {
      setActiveChannelId(channels[0].id);
    }
  }, [activeChannelId, channels]);

  const volumeTimepointCount = layers.length > 0 ? layers[0].volumes.length : 0;
  const channelNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const channel of channels) {
      map.set(channel.id, channel.name.trim() || 'Untitled channel');
    }
    return map;
  }, [channels, experimentDimension]);
  const channelLayersMap = useMemo(() => {
    const map = new Map<string, LoadedLayer[]>();
    for (const layer of layers) {
      const collection = map.get(layer.channelId);
      if (collection) {
        collection.push(layer);
      } else {
        map.set(layer.channelId, [layer]);
      }
    }
    return map;
  }, [layers]);
  const layerChannelMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const layer of layers) {
      map.set(layer.key, layer.channelId);
    }
    return map;
  }, [layers]);
  const channelTintMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const channel of channels) {
      const channelLayers = channelLayersMap.get(channel.id) ?? [];
      const activeLayerKey = channelActiveLayer[channel.id] ?? channelLayers[0]?.key ?? null;
      if (activeLayerKey) {
        const settings = layerSettings[activeLayerKey];
        const normalized = normalizeHexColor(settings?.color ?? DEFAULT_LAYER_COLOR, DEFAULT_LAYER_COLOR);
        map.set(channel.id, normalized);
      } else {
        map.set(channel.id, DEFAULT_LAYER_COLOR);
      }
    }
    return map;
  }, [channelActiveLayer, channelLayersMap, channels, layerSettings]);
  const loadedChannelIds = useMemo(() => {
    const seen = new Set<string>();
    const order: string[] = [];
    for (const layer of layers) {
      if (!seen.has(layer.channelId)) {
        seen.add(layer.channelId);
        order.push(layer.channelId);
      }
    }
    return order;
  }, [layers]);
  const rawTracksByChannel = useMemo(() => {
    const map = new Map<string, TrackDefinition[]>();
    const is2dExperiment = experimentDimension === '2d';
    const minimumColumns = is2dExperiment ? 6 : 7;

    for (const channel of channels) {
      const entries = channel.trackEntries;
      if (entries.length === 0) {
        map.set(channel.id, []);
        continue;
      }

      const trackMap = new Map<number, TrackPoint[]>();

      for (const row of entries) {
        if (row.length < minimumColumns) {
          continue;
        }

        const rawId = Number(row[0]);
        const initialTime = Number(row[1]);
        const deltaTime = Number(row[2]);
        const x = Number(row[3]);
        const y = Number(row[4]);
        const amplitudeIndex = is2dExperiment && row.length < 7 ? 5 : 6;
        const rawZ = is2dExperiment ? (row.length >= 7 ? Number(row[5]) : 0) : Number(row[5]);
        const amplitudeRaw = Number(row[amplitudeIndex]);
        const hasValidZ = Number.isFinite(rawZ);
        const z = is2dExperiment ? (hasValidZ ? rawZ : 0) : rawZ;

        if (
          !Number.isFinite(rawId) ||
          !Number.isFinite(initialTime) ||
          !Number.isFinite(deltaTime) ||
          !Number.isFinite(x) ||
          !Number.isFinite(y) ||
          !Number.isFinite(amplitudeRaw) ||
          (!is2dExperiment && !hasValidZ)
        ) {
          continue;
        }

        const id = Math.trunc(rawId);
        const time = initialTime + deltaTime;
        const normalizedTime = Math.max(0, time - 1);
        const amplitude = Math.max(0, amplitudeRaw);
        const point: TrackPoint = { time: normalizedTime, x, y, z, amplitude };
        const existing = trackMap.get(id);
        if (existing) {
          existing.push(point);
        } else {
          trackMap.set(id, [point]);
        }
      }

      const channelName = channel.name.trim() || 'Untitled channel';
      const parsed: TrackDefinition[] = [];

      const sortedEntries = Array.from(trackMap.entries()).sort((a, b) => a[0] - b[0]);
      sortedEntries.forEach(([sourceTrackId, points]) => {
        if (points.length === 0) {
          return;
        }

        const sortedPoints = [...points].sort((a, b) => a.time - b.time);
        const adjustedPoints = sortedPoints.map<TrackPoint>((point) => ({
          time: point.time,
          x: point.x,
          y: point.y,
          z: point.z,
          amplitude: point.amplitude
        }));

        parsed.push({
          id: `${channel.id}:${sourceTrackId}`,
          channelId: channel.id,
          channelName,
          trackNumber: sourceTrackId,
          sourceTrackId,
          points: adjustedPoints
        });
      });

      map.set(channel.id, parsed);
    }

    return map;
  }, [anisotropyScale, channels, experimentDimension]);

  const {
    parsedTracksByChannel,
    plotTracksByChannel,
    parsedTracks,
    trackLookup,
    filteredTracksByChannel,
    filteredTracks,
    filteredTrackLookup,
    plotFilteredTracksByChannel,
    plotFilteredTracks,
    plotFilteredTrackLookup,
    selectedTrackSeries,
    trackExtents,
    selectedTrackExtents
  } = useTracksForDisplay({
    rawTracksByChannel,
    channels,
    selectedTrackOrder,
    minimumTrackLength,
    trackSmoothing,
    volumeTimepointCount
  });

  const amplitudeExtent = trackExtents.amplitude;
  const timeExtent = trackExtents.time;
  const previousAmplitudeExtentRef = useRef<NumericRange | null>(null);
  const previousTimeExtentRef = useRef<NumericRange | null>(null);

  useEffect(() => {
    setSelectedTracksAmplitudeLimits((current) => {
      const previousBounds = previousAmplitudeExtentRef.current;
      previousAmplitudeExtentRef.current = amplitudeExtent;

      if (!current) {
        return amplitudeExtent;
      }

      const clamped = clampRangeToBounds(current, amplitudeExtent);
      const boundsChanged =
        !!previousBounds &&
        (previousBounds.min !== amplitudeExtent.min || previousBounds.max !== amplitudeExtent.max);

      if (boundsChanged && current.min === previousBounds.min && current.max === previousBounds.max) {
        return amplitudeExtent;
      }

      return clamped;
    });
  }, [amplitudeExtent.max, amplitudeExtent.min]);

  useEffect(() => {
    setSelectedTracksTimeLimits((current) => {
      const previousBounds = previousTimeExtentRef.current;
      previousTimeExtentRef.current = timeExtent;

      if (!current) {
        return timeExtent;
      }

      const clamped = clampRangeToBounds(current, timeExtent);
      const boundsChanged =
        !!previousBounds && (previousBounds.min !== timeExtent.min || previousBounds.max !== timeExtent.max);

      if (boundsChanged && current.min === previousBounds.min && current.max === previousBounds.max) {
        return timeExtent;
      }

      return clamped;
    });
  }, [timeExtent.max, timeExtent.min]);

  const resolvedAmplitudeLimits = selectedTracksAmplitudeLimits ?? amplitudeExtent;
  const resolvedTimeLimits = selectedTracksTimeLimits ?? timeExtent;

  const trackLengthBounds = useMemo(() => {
    const min = Math.max(0, Math.floor(timeExtent.min));
    const max = Math.max(Math.ceil(timeExtent.max), min + 1);
    return { min, max } as const;
  }, [timeExtent.max, timeExtent.min]);

  const clampTrackLength = useCallback(
    (value: number) => Math.min(Math.max(value, trackLengthBounds.min), trackLengthBounds.max),
    [trackLengthBounds.max, trackLengthBounds.min]
  );

  useEffect(() => {
    setPendingMinimumTrackLength((current) => clampTrackLength(current));
    setMinimumTrackLength((current) => clampTrackLength(current));
  }, [clampTrackLength]);

  useEffect(() => {
    const available = new Set(filteredTracks.map((track) => track.id));
    if (selectedTrackOrder.length > 0) {
      setSelectedTrackOrder((current) => {
        const filtered = current.filter((id) => available.has(id));
        return filtered.length === current.length ? current : filtered;
      });
    }
    setFollowedTrack((current) => (current && !available.has(current.id) ? null : current));
  }, [filteredTracks, selectedTrackOrder.length]);

  useEffect(() => {
    if (hasInitializedTrackColorsRef.current) {
      return;
    }

    const channelsWithTracks = channels.filter(
      (channel) => (parsedTracksByChannel.get(channel.id)?.length ?? 0) > 0
    );

    if (channelsWithTracks.length === 0) {
      return;
    }

    setChannelTrackStates((current) => {
      const next: Record<string, ChannelTrackState> = { ...current };
      let changed = false;

      const ensureState = (channelId: string) => {
        const existing = next[channelId];
        if (existing) {
          return existing;
        }
        const fallback = createDefaultChannelTrackState();
        next[channelId] = fallback;
        changed = true;
        return fallback;
      };

      if (channelsWithTracks.length === 1) {
        const channelId = channelsWithTracks[0].id;
        const state = ensureState(channelId);
        if (state.colorMode.type !== 'random') {
          next[channelId] = { ...state, colorMode: { type: 'random' } };
          changed = true;
        }
      } else {
        channelsWithTracks.forEach((channel, index) => {
          const state = ensureState(channel.id);
          if (index < TRACK_COLOR_SWATCHES.length) {
            const color = normalizeTrackColor(TRACK_COLOR_SWATCHES[index].value);
            if (state.colorMode.type !== 'uniform' || state.colorMode.color !== color) {
              next[channel.id] = { ...state, colorMode: { type: 'uniform', color } };
              changed = true;
            }
          } else if (state.colorMode.type !== 'random') {
            next[channel.id] = { ...state, colorMode: { type: 'random' } };
            changed = true;
          }
        });
      }

      return changed ? next : current;
    });

    hasInitializedTrackColorsRef.current = true;
  }, [channels, parsedTracksByChannel]);

  const hasParsedTrackData = parsedTracks.length > 0;
  const volumeStepScaleChangeRef = useRef<((value: number) => void) | null>(null);

  const handleRegisterReset = useCallback((handler: (() => void) | null) => {
    setResetViewHandler(() => handler);
  }, []);

  const handleRegisterVolumeStepScaleChange = useCallback(
    (handler: ((value: number) => void) | null) => {
      volumeStepScaleChangeRef.current = handler;
    },
    [],
  );

  const handleVolumeStepScaleChange = useCallback((value: number) => {
    volumeStepScaleChangeRef.current?.(value);
  }, []);

  const handleReturnToLauncher = useCallback(() => {
    if (typeof window !== 'undefined') {
      const confirmed = window.confirm(
        'Do you really want to return? The current session will be discarded'
      );
      if (!confirmed) {
        return;
      }
    }
    setIsViewerLaunched(false);
  }, [setIsViewerLaunched]);

  const handleResetWindowLayout = useCallback(() => {
    setLayoutResetToken((value) => value + 1);
    setTrackWindowInitialPosition(computeTrackWindowDefaultPosition());
    setViewerSettingsWindowInitialPosition(computeViewerSettingsWindowDefaultPosition());
    setSelectedTracksWindowInitialPosition(computeSelectedTracksWindowDefaultPosition());
    setPlotSettingsWindowInitialPosition(computePlotSettingsWindowDefaultPosition());
  }, [
    computeSelectedTracksWindowDefaultPosition,
    computePlotSettingsWindowDefaultPosition,
    computeViewerSettingsWindowDefaultPosition,
    computeTrackWindowDefaultPosition
  ]);

  useEffect(() => {
    const defaultPosition = computeTrackWindowDefaultPosition();
    setTrackWindowInitialPosition((current) => {
      if (current.x === defaultPosition.x && current.y === defaultPosition.y) {
        return current;
      }
      return defaultPosition;
    });
  }, [computeTrackWindowDefaultPosition]);

  useEffect(() => {
    const defaultPosition = computeViewerSettingsWindowDefaultPosition();
    setViewerSettingsWindowInitialPosition((current) => {
      if (current.x === defaultPosition.x && current.y === defaultPosition.y) {
        return current;
      }
      return defaultPosition;
    });
  }, [computeViewerSettingsWindowDefaultPosition]);

  useEffect(() => {
    const defaultPosition = computeSelectedTracksWindowDefaultPosition();
    setSelectedTracksWindowInitialPosition((current) => {
      if (current.x === defaultPosition.x && current.y === defaultPosition.y) {
        return current;
      }
      return defaultPosition;
    });
  }, [computeSelectedTracksWindowDefaultPosition]);

  useEffect(() => {
    const defaultPosition = computePlotSettingsWindowDefaultPosition();
    setPlotSettingsWindowInitialPosition((current) => {
      if (current.x === defaultPosition.x && current.y === defaultPosition.y) {
        return current;
      }
      return defaultPosition;
    });
  }, [computePlotSettingsWindowDefaultPosition]);

  useEffect(() => {
    setChannelTrackStates((current) => {
      const next: Record<string, ChannelTrackState> = {};
      let changed = false;

      for (const channel of channels) {
        const channelId = channel.id;
        const existing = current[channelId] ?? createDefaultChannelTrackState();
        const tracks = parsedTracksByChannel.get(channelId) ?? [];

        const visibility: Record<string, boolean> = {};
        let visibilityChanged = false;
        for (const track of tracks) {
          const previous = existing.visibility[track.id];
          if (previous === undefined) {
            visibilityChanged = true;
          }
          visibility[track.id] = previous ?? true;
        }

        for (const key of Object.keys(existing.visibility)) {
          if (!(key in visibility)) {
            visibilityChanged = true;
            break;
          }
        }

        let nextState = existing;
        if (visibilityChanged) {
          nextState = { ...nextState, visibility };
        }

        next[channelId] = nextState;
        if (!current[channelId] || nextState !== existing) {
          changed = true;
        }
      }

      if (Object.keys(current).length !== channels.length) {
        changed = true;
      }

      return changed ? next : current;
    });
  }, [channels, parsedTracksByChannel]);

  useEffect(() => {
    setFollowedTrack((current) => {
      if (!current) {
        return current;
      }
      if (trackLookup.has(current.id)) {
        return current;
      }
      return null;
    });
  }, [trackLookup]);

  const showLaunchError = useCallback((message: string) => {
    reportDatasetError(message, 'launch');
  }, [reportDatasetError]);

  const showInteractionWarning = useCallback((message: string) => {
    reportDatasetError(message, 'interaction');
  }, [reportDatasetError]);

  const loadDataset = useCallback(
    () =>
      loadSelectedDataset({
        voxelResolution,
        anisotropyScale,
        channels,
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
      }),
    [
      anisotropyScale,
      channels,
      clearDatasetError,
      experimentDimension,
      getChannelDefaultColor,
      globalRenderStyle,
      globalSamplingMode,
      loadSelectedDataset,
      setActiveChannelTabId,
      setChannelActiveLayer,
      setChannelVisibility,
      setExpectedVolumeCount,
      setIsPlaying,
      setLayerSettings,
      voxelResolution
    ]
  );

  const {
    preprocessedExperiment,
    isPreprocessedLoaderOpen,
    isPreprocessedImporting,
    isPreprocessedDragActive,
    isExportingPreprocessed,
    preprocessedDropboxImporting,
    preprocessedImportError,
    preprocessedDropboxError,
    preprocessedDropboxInfo,
    preprocessedImportBytesProcessed,
    preprocessedImportTotalBytes,
    preprocessedImportVolumesDecoded,
    preprocessedImportTotalVolumeCount,
    isPreprocessedDropboxConfigOpen,
    preprocessedDropboxAppKeyInput,
    preprocessedDropboxAppKeySource,
    preprocessedFileInputRef,
    handlePreprocessedLoaderOpen,
    handlePreprocessedFileInputChange,
    handlePreprocessedBrowse,
    handlePreprocessedDragEnter,
    handlePreprocessedDragLeave,
    handlePreprocessedDragOver,
    handlePreprocessedDrop,
    handlePreprocessedDropboxImport,
    handlePreprocessedDropboxConfigSubmit,
    handlePreprocessedDropboxConfigInputChange,
    handlePreprocessedDropboxConfigClear,
    handlePreprocessedDropboxConfigCancel,
    handleExportPreprocessedExperiment,
    resetPreprocessedState
  } = usePreprocessedExperiment({
    channels,
    setChannels,
    setActiveChannelId,
    setEditingChannelId,
    setChannelTrackStates,
    setTrackOrderModeByChannel,
    setSelectedTrackOrder,
    setFollowedTrack,
    setIsExperimentSetupStarted,
    setExperimentDimension,
    setViewerMode,
    clearDatasetError,
    updateChannelIdCounter,
    loadSelectedDataset: loadDataset,
    showInteractionWarning,
    isLaunchingViewer,
    voxelResolution,
    experimentDimension
  });

  const isLoading = status === 'loading';
  const playbackDisabled = isLoading || volumeTimepointCount <= 1;

  const playbackLabel = useMemo(() => {
    if (volumeTimepointCount === 0) {
      return '0 / 0';
    }
    const currentFrame = Math.min(selectedIndex + 1, volumeTimepointCount);
    return `${currentFrame} / ${volumeTimepointCount}`;
  }, [selectedIndex, volumeTimepointCount]);

  const trackSummaryByChannel = useMemo(() => {
    const summary = new Map<string, { total: number; visible: number }>();
    for (const channel of channels) {
      const tracksForChannel = filteredTracksByChannel.get(channel.id) ?? [];
      const state = channelTrackStates[channel.id] ?? createDefaultChannelTrackState();
      let visible = 0;
      for (const track of tracksForChannel) {
        const explicitVisible = state.visibility[track.id] ?? true;
        const isFollowedTrack = followedTrack?.id === track.id;
        const isSelectedTrack = selectedTrackIds.has(track.id);
        if (explicitVisible || isFollowedTrack || isSelectedTrack) {
          visible += 1;
        }
      }
      summary.set(channel.id, { total: tracksForChannel.length, visible });
    }
    return summary;
  }, [channels, channelTrackStates, filteredTracksByChannel, followedTrack, selectedTrackIds]);

  const trackVisibility = useMemo(() => {
    const visibility: Record<string, boolean> = {};
    for (const channel of channels) {
      const tracksForChannel = filteredTracksByChannel.get(channel.id) ?? [];
      const state = channelTrackStates[channel.id] ?? createDefaultChannelTrackState();
      for (const track of tracksForChannel) {
        visibility[track.id] = state.visibility[track.id] ?? true;
      }
    }
    return visibility;
  }, [channelTrackStates, channels, filteredTracksByChannel]);

  const trackOpacityByChannel = useMemo(() => {
    const map: Record<string, number> = {};
    for (const channel of channels) {
      const state = channelTrackStates[channel.id] ?? createDefaultChannelTrackState();
      map[channel.id] = state.opacity;
    }
    return map;
  }, [channelTrackStates, channels]);

  const trackLineWidthByChannel = useMemo(() => {
    const map: Record<string, number> = {};
    for (const channel of channels) {
      const state = channelTrackStates[channel.id] ?? createDefaultChannelTrackState();
      map[channel.id] = state.lineWidth;
    }
    return map;
  }, [channelTrackStates, channels]);

  const trackChannels = useMemo(() => {
    return loadedChannelIds.map((channelId) => ({
      id: channelId,
      name: channelNameMap.get(channelId) ?? 'Untitled channel'
    }));
  }, [channelNameMap, loadedChannelIds]);

  const vrChannelPanels = useMemo(() => {
    return loadedChannelIds.map((channelId) => {
      const channelLayers = channelLayersMap.get(channelId) ?? [];
      const name = channelNameMap.get(channelId) ?? 'Untitled channel';
      const visible = channelVisibility[channelId] ?? true;
      const activeLayerKey = channelActiveLayer[channelId] ?? channelLayers[0]?.key ?? null;
      const layersInfo = channelLayers.map((layer) => {
        const defaultWindow = DEFAULT_RESET_WINDOW;
        const settings = layerSettings[layer.key] ?? createLayerDefaultSettings(layer.key);
        const firstVolume = layer.volumes[0] ?? null;
        const isGrayscale = Boolean(firstVolume && firstVolume.channels === 1);
        const histogram = firstVolume ? getVolumeHistogram(firstVolume) : null;
        return {
          key: layer.key,
          label: layer.label,
          hasData: layer.volumes.length > 0,
          isGrayscale,
          isSegmentation: layer.isSegmentation,
          defaultWindow,
          histogram,
          settings
        };
      });
      return {
        id: channelId,
        name,
        visible,
        activeLayerKey,
        layers: layersInfo
      };
    });
  }, [
    channelActiveLayer,
    channelLayersMap,
    channelNameMap,
    channelVisibility,
    layerSettings,
    loadedChannelIds
  ]);

  const channelTrackColorModes = useMemo(() => {
    const map: Record<string, TrackColorMode> = {};
    for (const channel of channels) {
      const state = channelTrackStates[channel.id] ?? createDefaultChannelTrackState();
      map[channel.id] = state.colorMode;
    }
    return map;
  }, [channelTrackStates, channels]);

  const followedTrackId = followedTrack?.id ?? null;
  const followedTrackChannelId = followedTrack?.channelId ?? null;

  const channelTrackOffsets = useMemo(
    () =>
      deriveChannelTrackOffsets({
        channels,
        channelLayersMap,
        channelActiveLayer,
        layerSettings
      }),
    [channelActiveLayer, channelLayersMap, channels, layerSettings]
  );

  const handleTogglePlayback = useCallback(() => {
    setIsPlaying((current) => {
      if (!current && volumeTimepointCount <= 1) {
        return current;
      }
      return !current;
    });
  }, [volumeTimepointCount]);

  const handleTimeIndexChange = useCallback(
    (nextIndex: number) => {
      setSelectedIndex((prev) => {
        if (volumeTimepointCount === 0) {
          return prev;
        }
        const clamped = Math.max(0, Math.min(volumeTimepointCount - 1, nextIndex));
        return clamped;
      });
    },
    [volumeTimepointCount]
  );

  const handleJumpToStart = useCallback(() => {
    if (volumeTimepointCount === 0) {
      return;
    }
    handleTimeIndexChange(0);
  }, [handleTimeIndexChange, volumeTimepointCount]);

  const handleJumpToEnd = useCallback(() => {
    if (volumeTimepointCount === 0) {
      return;
    }
    handleTimeIndexChange(volumeTimepointCount - 1);
  }, [handleTimeIndexChange, volumeTimepointCount]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    if (viewerMode !== '2d') {
      return;
    }
    if (!isPlaying || playbackDisabled) {
      return;
    }

    const minFps = 1;
    const maxFps = 60;
    const clampedFps = Math.min(Math.max(fps, minFps), maxFps);
    const frameDuration = clampedFps > 0 ? 1000 / clampedFps : Infinity;

    let animationFrame: number | null = null;
    let lastTimestamp: number | null = null;
    let accumulator = 0;
    let cancelled = false;

    const step = (timestamp: number) => {
      if (cancelled) {
        return;
      }

      if (lastTimestamp === null) {
        lastTimestamp = timestamp;
      }

      accumulator += timestamp - lastTimestamp;
      lastTimestamp = timestamp;

      while (accumulator >= frameDuration) {
        accumulator -= frameDuration;
        setSelectedIndex((previous) => {
          if (volumeTimepointCount <= 1) {
            const maxIndex = Math.max(0, volumeTimepointCount - 1);
            const clamped = Math.min(Math.max(previous, 0), maxIndex);
            return clamped;
          }

          const maxIndex = Math.max(0, volumeTimepointCount - 1);
          const nextIndex = previous >= maxIndex ? 0 : previous + 1;
          return nextIndex;
        });
      }

      animationFrame = window.requestAnimationFrame(step);
    };

    animationFrame = window.requestAnimationFrame(step);

    return () => {
      cancelled = true;
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame);
      }
    };
  }, [fps, isPlaying, playbackDisabled, viewerMode, volumeTimepointCount]);

  const handleStartExperimentSetup = useCallback(() => {
    resetPreprocessedState();
    setIsExperimentSetupStarted(true);
    setActiveChannelId(null);
    setEditingChannelId(null);
    pendingChannelFocusIdRef.current = null;
    clearDatasetError();
  }, [clearDatasetError, resetPreprocessedState]);

  const handleAddChannel = useCallback(() => {
    resetPreprocessedState();
    setIsExperimentSetupStarted(true);

    let createdChannel: ChannelSource | null = null;
    setChannels((current) => {
      const newChannel: ChannelSource = createChannelSource('');
      createdChannel = newChannel;
      return [...current, newChannel];
    });
    if (createdChannel === null) {
      return;
    }
    const channel = createdChannel as ChannelSource;
    pendingChannelFocusIdRef.current = channel.id;
    setActiveChannelId(channel.id);
    editingChannelOriginalNameRef.current = channel.name;
    setEditingChannelId(channel.id);
    clearDatasetError();
  }, [clearDatasetError, createChannelSource, resetPreprocessedState]);

  const handleChannelNameChange = useCallback((channelId: string, value: string) => {
    setChannels((current) =>
      current.map((channel) => (channel.id === channelId ? { ...channel, name: value } : channel))
    );
  }, []);

  const handleRemoveChannel = useCallback((channelId: string) => {
    let removedLayerIds: string[] = [];
    setChannels((current) => {
      const filtered = current.filter((channel) => channel.id !== channelId);
      const removedChannel = current.find((channel) => channel.id === channelId);
      if (removedChannel) {
        removedLayerIds = removedChannel.layers.map((layer) => layer.id);
      }
      setActiveChannelId((previous) => {
        if (filtered.length === 0) {
          return null;
        }
        if (previous && filtered.some((channel) => channel.id === previous)) {
          return previous;
        }
        const removedIndex = current.findIndex((channel) => channel.id === channelId);
        if (removedIndex <= 0) {
          return filtered[0].id;
        }
        const fallbackIndex = Math.min(removedIndex - 1, filtered.length - 1);
        return filtered[fallbackIndex]?.id ?? filtered[0].id;
      });
      return filtered;
    });
    if (removedLayerIds.length > 0) {
      setLayerTimepointCounts((current) => {
        let changed = false;
        const next = { ...current };
        for (const layerId of removedLayerIds) {
          if (layerId in next) {
            delete next[layerId];
            changed = true;
          }
        }
        return changed ? next : current;
      });
    }
    clearDatasetError();
  }, [clearDatasetError]);

  const handleChannelLayerFilesAdded = useCallback(
    async (channelId: string, incomingFiles: File[]) => {
      const tiffFiles = dedupeFiles(incomingFiles.filter((file) => hasTiffExtension(file.name)));
      if (tiffFiles.length === 0) {
        showInteractionWarning('No TIFF files detected in the dropped selection.');
        return;
      }

      let addedAny = false;
      let ignoredExtraGroups = false;
      let addedLayer: ChannelLayerSource | null = null;
      const replacedLayerIds: string[] = [];
      setChannels((current) =>
        current.map((channel) => {
          if (channel.id !== channelId) {
            return channel;
          }
          const grouped = groupFilesIntoLayers(tiffFiles);
          if (grouped.length === 0) {
            return channel;
          }
          if (grouped.length > 1) {
            ignoredExtraGroups = true;
          }
          const sorted = sortVolumeFiles(grouped[0]);
          if (sorted.length === 0) {
            return channel;
          }
          addedAny = true;
          if (channel.layers.length > 0) {
            replacedLayerIds.push(channel.layers[0].id);
          }
          const nextLayer = createLayerSource(sorted);
          addedLayer = nextLayer;
          return { ...channel, layers: [nextLayer] };
        })
      );

      if (addedAny) {
        if (addedLayer) {
          const layerForCounts: ChannelLayerSource = addedLayer;
          try {
            const timepointCount = await computeLayerTimepointCount(layerForCounts.files);
            setLayerTimepointCounts((current) => {
              const next: Record<string, number> = {
                ...current,
                [layerForCounts.id]: timepointCount
              };
              for (const layerId of replacedLayerIds) {
                if (layerId in next) {
                  delete next[layerId];
                }
              }
              return next;
            });
          } catch (error) {
            console.error('Failed to compute timepoint count for layer', error);
            setLayerTimepointCounts((current) => {
              const next: Record<string, number> = {
                ...current,
                [layerForCounts.id]: layerForCounts.files.length
              };
              for (const layerId of replacedLayerIds) {
                if (layerId in next) {
                  delete next[layerId];
                }
              }
              return next;
            });
          }
        }
        if (replacedLayerIds.length > 0) {
          setLayerSettings((current) => {
            let changed = false;
            const next = { ...current };
            for (const layerId of replacedLayerIds) {
              if (layerId in next) {
                delete next[layerId];
                changed = true;
              }
            }
            return changed ? next : current;
          });
          setLayerAutoThresholds((current) => {
            let changed = false;
            const next = { ...current };
            for (const layerId of replacedLayerIds) {
              if (layerId in next) {
                delete next[layerId];
                changed = true;
              }
            }
            return changed ? next : current;
          });
        }
        if (ignoredExtraGroups) {
          showInteractionWarning('Only the first TIFF sequence was added. Additional sequences were ignored.');
        } else {
          clearDatasetError();
        }
      }
    },
    [clearDatasetError, computeLayerTimepointCount, createLayerSource, showInteractionWarning]
  );

  const handleChannelLayerDrop = useCallback(
    async (channelId: string, dataTransfer: DataTransfer) => {
      const files = await collectFilesFromDataTransfer(dataTransfer);
      if (files.length === 0) {
        showInteractionWarning('No TIFF files detected in the dropped selection.');
        return;
      }
      handleChannelLayerFilesAdded(channelId, files);
    },
    [handleChannelLayerFilesAdded, showInteractionWarning]
  );

  const handleChannelLayerSegmentationToggle = useCallback(
    (channelId: string, layerId: string, value: boolean) => {
      setChannels((current) =>
        current.map((channel) => {
          if (channel.id !== channelId) {
            return channel;
          }
          return {
            ...channel,
            layers: channel.layers.map((layer) =>
              layer.id === layerId ? { ...layer, isSegmentation: value } : layer
            )
          };
        })
      );
    },
    []
  );

  const handleChannelLayerRemove = useCallback((channelId: string, layerId: string) => {
    let removed = false;
    setChannels((current) =>
      current.map((channel) => {
        if (channel.id !== channelId) {
          return channel;
        }
        const filtered = channel.layers.filter((layer) => layer.id !== layerId);
        if (filtered.length === channel.layers.length) {
          return channel;
        }
        removed = true;
        return {
          ...channel,
          layers: filtered
        };
      })
    );
    if (removed) {
      setLayerSettings((current) => {
        if (!(layerId in current)) {
          return current;
        }
        const next = { ...current };
        delete next[layerId];
        return next;
      });
      setLayerAutoThresholds((current) => {
        if (!(layerId in current)) {
          return current;
        }
        const next = { ...current };
        delete next[layerId];
        return next;
      });
      setLayerTimepointCounts((current) => {
        if (!(layerId in current)) {
          return current;
        }
        const next = { ...current };
        delete next[layerId];
        return next;
      });
      clearDatasetError();
    }
  }, [clearDatasetError]);

  const handleChannelTrackFileSelected = useCallback((channelId: string, file: File | null) => {
    if (!file) {
      setChannels((current) =>
        current.map((channel) =>
          channel.id === channelId
            ? { ...channel, trackFile: null, trackStatus: 'idle', trackError: null, trackEntries: [] }
            : channel
        )
      );
      return;
    }

    if (!file.name.toLowerCase().endsWith('.csv')) {
      setChannels((current) =>
        current.map((channel) =>
          channel.id === channelId
            ? {
                ...channel,
                trackFile: null,
                trackStatus: 'error',
                trackError: 'Please drop a CSV file.',
                trackEntries: []
              }
            : channel
        )
      );
      return;
    }

    setChannels((current) =>
      current.map((channel) =>
        channel.id === channelId
          ? { ...channel, trackFile: file, trackStatus: 'loading', trackError: null, trackEntries: [] }
          : channel
      )
    );

    parseTrackCsvFile(file)
      .then((rows) => {
        setChannels((current) =>
          current.map((channel) =>
            channel.id === channelId
              ? { ...channel, trackFile: file, trackStatus: 'loaded', trackError: null, trackEntries: rows }
              : channel
          )
        );
      })
      .catch((err) => {
        console.error('Failed to load tracks CSV', err);
        const message = err instanceof Error ? err.message : 'Failed to load tracks.';
        setChannels((current) =>
          current.map((channel) =>
            channel.id === channelId
              ? {
                  ...channel,
                  trackFile: null,
                  trackStatus: 'error',
                  trackError: message,
                  trackEntries: []
                }
              : channel
          )
        );
      });
  }, []);

  const handleChannelTrackDrop = useCallback(
    async (channelId: string, dataTransfer: DataTransfer) => {
      const files = await collectFilesFromDataTransfer(dataTransfer);
      const csvFile = files.find((file) => file.name.toLowerCase().endsWith('.csv')) ?? null;
      if (!csvFile) {
        setChannels((current) =>
          current.map((channel) =>
            channel.id === channelId
              ? {
                  ...channel,
                  trackFile: null,
                  trackStatus: 'error',
                  trackError: 'Please drop a CSV file.',
                  trackEntries: []
                }
              : channel
          )
        );
        return;
      }
      handleChannelTrackFileSelected(channelId, csvFile);
    },
    [handleChannelTrackFileSelected]
  );

  const handleChannelTrackClear = useCallback(
    (channelId: string) => handleChannelTrackFileSelected(channelId, null),
    [handleChannelTrackFileSelected]
  );

  const handleDiscardPreprocessedExperiment = useCallback(() => {
    resetPreprocessedState();
    setChannels([]);
    setChannelVisibility({});
    setChannelActiveLayer({});
    setLayerSettings({});
    setLayerAutoThresholds({});
    setLayers([]);
    setSelectedIndex(0);
    setActiveChannelId(null);
    setEditingChannelId(null);
    setActiveChannelTabId(null);
    setChannelTrackStates({});
    setTrackOrderModeByChannel({});
    setSelectedTrackOrder([]);
    setFollowedTrack(null);
    hasInitializedTrackColorsRef.current = false;
    setStatus('idle');
    setError(null);
    setLoadProgress(0);
    setLoadedCount(0);
    setExpectedVolumeCount(0);
    setIsPlaying(false);
    setIsViewerLaunched(false);
    setIsExperimentSetupStarted(false);
    channelIdRef.current = 0;
    layerIdRef.current = 0;
    clearTextureCache();
    clearDatasetError();
  }, [clearDatasetError, resetPreprocessedState]);

  const handleReturnToFrontPage = useCallback(() => {
    handleDiscardPreprocessedExperiment();
  }, [handleDiscardPreprocessedExperiment]);



  const frontPageMode = useMemo<'initial' | 'configuring' | 'preprocessed'>(() => {
    if (preprocessedExperiment) {
      return 'preprocessed';
    }
    if (channels.length > 0 || isExperimentSetupStarted) {
      return 'configuring';
    }
    return 'initial';
  }, [channels, isExperimentSetupStarted, preprocessedExperiment]);
  const canLaunch = hasAnyLayers && allChannelsValid && !hasLoadingTracks && voxelResolution !== null;
  const launchButtonEnabled = frontPageMode === 'preprocessed' ? preprocessedExperiment !== null : canLaunch;
  const launchButtonLaunchable = launchButtonEnabled ? 'true' : 'false';

  const activeChannel = useMemo(
    () => channels.find((channel) => channel.id === activeChannelId) ?? null,
    [activeChannelId, channels]
  );

  const launchErrorMessage = datasetErrorContext === 'launch' ? datasetError : null;
  const interactionErrorMessage = datasetErrorContext === 'interaction' ? datasetError : null;


  const handleLaunchViewer = useCallback(async () => {
    if (isLaunchingViewer) {
      return;
    }

    if (!preprocessedExperiment && !voxelResolution) {
      showLaunchError('Fill in all voxel resolution fields before launching.');
      return;
    }

    if (preprocessedExperiment) {
      clearDatasetError();
      setIsLaunchingViewer(true);
      try {
        const manifestVoxelResolution =
          preprocessedExperiment.manifest.dataset.voxelResolution ?? voxelResolution ?? null;
        preprocessingSettingsRef.current = manifestVoxelResolution;
        setLayers(preprocessedExperiment.layers);
        applyLoadedLayers(preprocessedExperiment.layers, preprocessedExperiment.totalVolumeCount, {
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
        setIsViewerLaunched(true);
      } finally {
        setIsLaunchingViewer(false);
      }
      return;
    }

    const hasAnyLayersConfigured = channels.some((channel) =>
      channel.layers.some((layer) => layer.files.length > 0)
    );
    if (!hasAnyLayersConfigured) {
      showLaunchError('Add a volume before launching the viewer.');
      return;
    }

    const blockingChannel = channelValidationList.find((entry) => entry.errors.length > 0);
    if (blockingChannel) {
      const rawName = channels.find((channel) => channel.id === blockingChannel.channelId)?.name ?? '';
      const channelName = rawName.trim() || 'this channel';
      showLaunchError(`Resolve the errors in ${channelName} before launching.`);
      return;
    }

    const hasPendingTracks = channels.some((channel) => channel.trackStatus === 'loading');
    if (hasPendingTracks) {
      showLaunchError('Wait for tracks to finish loading before launching.');
      return;
    }

    clearDatasetError();
    preprocessingSettingsRef.current = voxelResolution;
    setViewerMode(experimentDimension);
    setIsLaunchingViewer(true);
    try {
      const normalizedLayers = await loadDataset();
      if (!normalizedLayers) {
        return;
      }

      setIsViewerLaunched(true);
    } finally {
      setIsLaunchingViewer(false);
    }
  }, [
    channelValidationList,
    channels,
    clearDatasetError,
    isLaunchingViewer,
    loadDataset,
    preprocessedExperiment,
    showLaunchError,
    experimentDimension,
    voxelResolution
  ]);

  const handleChannelVisibilityToggle = useCallback((channelId: string) => {
    setChannelVisibility((current) => {
      const previous = current[channelId] ?? true;
      const nextValue = !previous;
      return {
        ...current,
        [channelId]: nextValue
      };
    });
  }, []);

  const handleTrackVisibilityToggle = useCallback(
    (trackId: string) => {
      const track = trackLookup.get(trackId);
      if (!track) {
        return;
      }

      let nextVisible = true;
      setChannelTrackStates((current) => {
        const existing = current[track.channelId] ?? createDefaultChannelTrackState();
        const previous = existing.visibility[trackId] ?? true;
        nextVisible = !previous;
        return {
          ...current,
          [track.channelId]: {
            ...existing,
            visibility: {
              ...existing.visibility,
              [trackId]: nextVisible
            }
          }
        };
      });

      if (!nextVisible) {
        setFollowedTrack((current) => (current && current.id === trackId ? null : current));
        setSelectedTrackOrder((current) =>
          current.includes(trackId) ? current.filter((id) => id !== trackId) : current
        );
      }
    },
    [trackLookup]
  );

  const handleTrackVisibilityAllChange = useCallback(
    (channelId: string, isChecked: boolean) => {
      const tracksForChannel = parsedTracksByChannel.get(channelId) ?? [];
      setChannelTrackStates((current) => {
        const existing = current[channelId] ?? createDefaultChannelTrackState();
        const visibility: Record<string, boolean> = {};
        for (const track of tracksForChannel) {
          visibility[track.id] = isChecked;
        }
        return {
          ...current,
          [channelId]: {
            ...existing,
            visibility
          }
        };
      });

      if (!isChecked) {
        setFollowedTrack((current) => (current && current.channelId === channelId ? null : current));
        const trackIdsForChannel = new Set(tracksForChannel.map((track) => track.id));
        setSelectedTrackOrder((current) => {
          if (current.length === 0) {
            return current;
          }
          const filtered = current.filter((id) => !trackIdsForChannel.has(id));
          return filtered.length === current.length ? current : filtered;
        });
      }
    },
    [parsedTracksByChannel]
  );

  const handleMinimumTrackLengthChange = useCallback(
    (value: number) => {
      setPendingMinimumTrackLength((current) => {
        const clamped = clampTrackLength(value);
        return clamped === current ? current : clamped;
      });
    },
    [clampTrackLength]
  );

  const handleMinimumTrackLengthApply = useCallback(() => {
    setMinimumTrackLength(clampTrackLength(pendingMinimumTrackLength));
  }, [clampTrackLength, pendingMinimumTrackLength]);

  const handleTrackOrderToggle = useCallback((channelId: string) => {
    setTrackOrderModeByChannel((current) => {
      const previous = current[channelId] ?? 'id';
      const nextMode = previous === 'id' ? 'length' : 'id';
      if (current[channelId] === nextMode) {
        return current;
      }
      return {
        ...current,
        [channelId]: nextMode
      };
    });
  }, []);

  const handleTrackOpacityChange = useCallback((channelId: string, value: number) => {
    setChannelTrackStates((current) => {
      const existing = current[channelId] ?? createDefaultChannelTrackState();
      if (existing.opacity === value) {
        return current;
      }
      return {
        ...current,
        [channelId]: {
          ...existing,
          opacity: value
        }
      };
    });
  }, []);

  const handleTrackLineWidthChange = useCallback((channelId: string, value: number) => {
    setChannelTrackStates((current) => {
      const existing = current[channelId] ?? createDefaultChannelTrackState();
      if (existing.lineWidth === value) {
        return current;
      }
      return {
        ...current,
        [channelId]: {
          ...existing,
          lineWidth: value
        }
      };
    });
  }, []);

  const handleTrackColorSelect = useCallback((channelId: string, color: string) => {
    const normalized = normalizeTrackColor(color);
    setChannelTrackStates((current) => {
      const existing = current[channelId] ?? createDefaultChannelTrackState();
      if (existing.colorMode.type === 'uniform' && existing.colorMode.color === normalized) {
        return current;
      }
      return {
        ...current,
        [channelId]: {
          ...existing,
          colorMode: { type: 'uniform', color: normalized }
        }
      };
    });
  }, []);

  const handleTrackColorReset = useCallback((channelId: string) => {
    setChannelTrackStates((current) => {
      const existing = current[channelId] ?? createDefaultChannelTrackState();
      if (existing.colorMode.type === 'random') {
        return current;
      }
      return {
        ...current,
        [channelId]: {
          ...existing,
          colorMode: { type: 'random' }
        }
      };
    });
  }, []);

  const ensureTrackIsVisible = useCallback(
    (trackId: string) => {
      const track = trackLookup.get(trackId);
      if (!track) {
        return;
      }

      setChannelTrackStates((current) => {
        const existing = current[track.channelId] ?? createDefaultChannelTrackState();
        if (existing.visibility[trackId] ?? true) {
          return current;
        }
        return {
          ...current,
          [track.channelId]: {
            ...existing,
            visibility: {
              ...existing.visibility,
              [trackId]: true
            }
          }
        };
      });
    },
    [trackLookup]
  );

  const handleTrackSelectionToggle = useCallback(
    (trackId: string) => {
      const track = trackLookup.get(trackId);
      if (!track) {
        return;
      }

      let didSelect = false;
      setSelectedTrackOrder((current) => {
        if (current.includes(trackId)) {
          return current.filter((id) => id !== trackId);
        }
        didSelect = true;
        return [...current, trackId];
      });

      if (didSelect) {
        ensureTrackIsVisible(trackId);
      }
    },
    [ensureTrackIsVisible, trackLookup]
  );

  const handleTrackFollow = useCallback(
    (trackId: string) => {
      const track = trackLookup.get(trackId);
      if (!track) {
        return;
      }

      if (followedTrack?.id !== trackId) {
        setSelectedTrackOrder((current) =>
          current.includes(trackId) ? current : [...current, trackId]
        );
      }

      setFollowedTrack((current) => (current && current.id === trackId ? null : { id: trackId, channelId: track.channelId }));
      ensureTrackIsVisible(trackId);
    },
    [ensureTrackIsVisible, followedTrack, trackLookup]
  );

  const handleTrackFollowFromViewer = useCallback(
    (trackId: string) => {
      const track = trackLookup.get(trackId);
      if (!track) {
        return;
      }

      setSelectedTrackOrder((current) =>
        current.includes(trackId) ? current : [...current, trackId]
      );

      setFollowedTrack((current) => (current && current.id === trackId ? current : { id: trackId, channelId: track.channelId }));
      ensureTrackIsVisible(trackId);
      setActiveTrackChannelId(track.channelId);
    },
    [ensureTrackIsVisible, trackLookup]
  );

  const handleTrackChannelSelect = useCallback((channelId: string) => {
    setActiveTrackChannelId(channelId);
  }, []);

  const handleStopTrackFollow = useCallback((channelId?: string) => {
    if (!channelId) {
      setFollowedTrack(null);
      return;
    }
    setFollowedTrack((current) => (current && current.channelId === channelId ? null : current));
  }, []);

  const handleSelectedTracksAmplitudeLimitsChange = useCallback(
    (next: NumericRange) => {
      setSelectedTracksAmplitudeLimits(clampRangeToBounds(next, amplitudeExtent));
    },
    [amplitudeExtent]
  );

  const handleSelectedTracksTimeLimitsChange = useCallback(
    (next: NumericRange) => {
      setSelectedTracksTimeLimits(clampRangeToBounds(next, timeExtent));
    },
    [timeExtent]
  );

  const handleSelectedTracksAutoRange = useCallback(() => {
    const nextAmplitude = selectedTrackExtents.amplitude ?? amplitudeExtent;
    const nextTime = selectedTrackExtents.time ?? timeExtent;

    setSelectedTracksAmplitudeLimits(clampRangeToBounds(nextAmplitude, amplitudeExtent));
    setSelectedTracksTimeLimits(clampRangeToBounds(nextTime, timeExtent));
  }, [amplitudeExtent, selectedTrackExtents, timeExtent]);

  const handleTrackSmoothingChange = useCallback((value: number) => {
    const clamped = Math.min(Math.max(value, TRACK_SMOOTHING_RANGE.min), TRACK_SMOOTHING_RANGE.max);
    setTrackSmoothing(clamped);
  }, []);

  const handleClearSelectedTracks = useCallback(() => {
    setSelectedTrackOrder([]);
    setFollowedTrack(null);
  }, []);

  const handleToggleViewerMode = useCallback(() => {
    if (!is3dViewerAvailable) {
      return;
    }
    setViewerMode((current) => (current === '3d' ? '2d' : '3d'));
    setResetViewHandler(null);
    handleStopTrackFollow();
  }, [handleStopTrackFollow, is3dViewerAvailable]);

  const handleSliceIndexChange = useCallback((index: number) => {
    setSliceIndex(index);
  }, []);

  const handleOrthogonalViewsToggle = useCallback(() => {
    setOrthogonalViewsEnabled((current) => !current);
  }, []);

  useEffect(() => {
    if (layers.length === 0) {
      setActiveChannelTabId(null);
      return;
    }

    setActiveChannelTabId((current) => {
      if (current && layers.some((layer) => layer.channelId === current)) {
        return current;
      }
      return layers[0].channelId;
    });
  }, [layers]);

  useEffect(() => {
    if (channels.length === 0) {
      setActiveTrackChannelId(null);
      return;
    }

    setActiveTrackChannelId((current) => {
      if (current && channels.some((channel) => channel.id === current)) {
        return current;
      }
      return channels[0].id;
    });
  }, [channels]);

  useEffect(() => {
    setChannelActiveLayer((current) => {
      if (layers.length === 0) {
        if (Object.keys(current).length === 0) {
          return current;
        }
        return {};
      }

      const next: Record<string, string> = { ...current };
      let changed = false;
      const validChannels = new Set<string>();
      for (const layer of layers) {
        validChannels.add(layer.channelId);
      }

      for (const channelId of Object.keys(next)) {
        if (!validChannels.has(channelId)) {
          delete next[channelId];
          changed = true;
        }
      }

      for (const channelId of validChannels) {
        const channelLayers = channelLayersMap.get(channelId) ?? [];
        const activeKey = next[channelId];
        const hasActive = activeKey ? channelLayers.some((layer) => layer.key === activeKey) : false;
        if (!hasActive) {
          const fallback = channelLayers[0];
          if (fallback) {
            next[channelId] = fallback.key;
            changed = true;
          }
        }
      }

      return changed ? next : current;
    });
  }, [channelLayersMap, layers]);

  const handleLayerContrastChange = useCallback((key: string, sliderIndex: number) => {
    setLayerSettings((current) => {
      const previous = current[key] ?? createLayerDefaultSettings(key);
      if (previous.contrastSliderIndex === sliderIndex) {
        return current;
      }
      const updated = brightnessContrastModel.applyContrast(previous, sliderIndex);
      if (
        previous.windowMin === updated.windowMin &&
        previous.windowMax === updated.windowMax &&
        previous.contrastSliderIndex === updated.contrastSliderIndex &&
        previous.brightnessSliderIndex === updated.brightnessSliderIndex &&
        previous.minSliderIndex === updated.minSliderIndex &&
        previous.maxSliderIndex === updated.maxSliderIndex
      ) {
        return current;
      }
      return {
        ...current,
        [key]: {
          ...previous,
          ...updated
        }
      };
    });
  }, [createLayerDefaultSettings]);

  const handleLayerBrightnessChange = useCallback((key: string, sliderIndex: number) => {
    setLayerSettings((current) => {
      const previous = current[key] ?? createLayerDefaultSettings(key);
      if (previous.brightnessSliderIndex === sliderIndex) {
        return current;
      }
      const updated = brightnessContrastModel.applyBrightness(previous, sliderIndex);
      if (
        previous.windowMin === updated.windowMin &&
        previous.windowMax === updated.windowMax &&
        previous.contrastSliderIndex === updated.contrastSliderIndex &&
        previous.brightnessSliderIndex === updated.brightnessSliderIndex &&
        previous.minSliderIndex === updated.minSliderIndex &&
        previous.maxSliderIndex === updated.maxSliderIndex
      ) {
        return current;
      }
      return {
        ...current,
        [key]: {
          ...previous,
          ...updated
        }
      };
    });
  }, [createLayerDefaultSettings]);

  const handleLayerWindowMinChange = useCallback((key: string, value: number) => {
    setLayerSettings((current) => {
      const previous = current[key] ?? createLayerDefaultSettings(key);
      const clampedValue = Math.max(DEFAULT_WINDOW_MIN, Math.min(DEFAULT_WINDOW_MAX, value));
      if (previous.windowMin === clampedValue) {
        return current;
      }
      const updated = brightnessContrastModel.applyWindow(clampedValue, previous.windowMax);
      if (
        previous.windowMin === updated.windowMin &&
        previous.windowMax === updated.windowMax &&
        previous.contrastSliderIndex === updated.contrastSliderIndex &&
        previous.brightnessSliderIndex === updated.brightnessSliderIndex &&
        previous.minSliderIndex === updated.minSliderIndex &&
        previous.maxSliderIndex === updated.maxSliderIndex
      ) {
        return current;
      }
      return {
        ...current,
        [key]: {
          ...previous,
          ...updated
        }
      };
    });
  }, [createLayerDefaultSettings]);

  const handleLayerWindowMaxChange = useCallback((key: string, value: number) => {
    setLayerSettings((current) => {
      const previous = current[key] ?? createLayerDefaultSettings(key);
      const clampedValue = Math.max(DEFAULT_WINDOW_MIN, Math.min(DEFAULT_WINDOW_MAX, value));
      if (previous.windowMax === clampedValue) {
        return current;
      }
      const updated = brightnessContrastModel.applyWindow(previous.windowMin, clampedValue);
      if (
        previous.windowMin === updated.windowMin &&
        previous.windowMax === updated.windowMax &&
        previous.contrastSliderIndex === updated.contrastSliderIndex &&
        previous.brightnessSliderIndex === updated.brightnessSliderIndex &&
        previous.minSliderIndex === updated.minSliderIndex &&
        previous.maxSliderIndex === updated.maxSliderIndex
      ) {
        return current;
      }
      return {
        ...current,
        [key]: {
          ...previous,
          ...updated
        }
      };
    });
  }, [createLayerDefaultSettings]);

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
    [createLayerDefaultSettings, layerAutoThresholds, layers, selectedIndex]
  );

  const handleLayerOffsetChange = useCallback((key: string, axis: 'x' | 'y', value: number) => {
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
  }, [createLayerDefaultSettings]);

  const handleLayerColorChange = useCallback((key: string, value: string) => {
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
  }, [createLayerDefaultSettings]);

  const handleLayerRenderStyleToggle = useCallback(
    (_key?: string) => {
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
    },
    []
  );

  const handleLayerSamplingModeToggle = useCallback(
    (_key?: string) => {
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
    },
    []
  );

  const handleBlendingModeToggle = useCallback(() => {
    setBlendingMode((current) => (current === 'additive' ? 'alpha' : 'additive'));
  }, []);

  const handleLayerInvertToggle = useCallback((key: string) => {
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
  }, [createLayerDefaultSettings]);

  const handleChannelLayerSelectionChange = useCallback((channelId: string, layerKey: string) => {
    setChannelActiveLayer((current) => {
      if (current[channelId] === layerKey) {
        return current;
      }
      return {
        ...current,
        [channelId]: layerKey
      };
    });
  }, []);

  const handleLayerSelect = useCallback(
    (layerKey: string) => {
      const channelId = layerChannelMap.get(layerKey);
      if (!channelId) {
        return;
      }
      handleChannelLayerSelectionChange(channelId, layerKey);
      setActiveChannelTabId((current) => (current === channelId ? current : channelId));
    },
    [handleChannelLayerSelectionChange, layerChannelMap]
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
    [handleLayerSelect, layerChannelMap, loadedChannelIds]
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
    [createLayerDefaultBrightnessState, createLayerDefaultSettings, layers]
  );

  const handleDatasetErrorDismiss = useCallback(() => {
    clearDatasetError();
  }, [clearDatasetError]);

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
    layerSettings,
    layers,
    selectedIndex
  ]);

  const maxSliceDepth = useMemo(() => {
    let depth = 0;
    for (const layer of viewerLayers) {
      if (layer.volume) {
        depth = Math.max(depth, layer.volume.depth);
      }
    }
    return depth;
  }, [viewerLayers]);

  useEffect(() => {
    if (hasInitializedSliceIndexRef.current) {
      return;
    }
    if (maxSliceDepth > 0) {
      const middleIndex = Math.floor(maxSliceDepth / 2);
      setSliceIndex(middleIndex);
      hasInitializedSliceIndexRef.current = true;
    }
  }, [maxSliceDepth]);

  useEffect(() => {
    if (maxSliceDepth <= 0) {
      if (sliceIndex !== 0) {
        setSliceIndex(0);
      }
      return;
    }
    if (sliceIndex >= maxSliceDepth) {
      setSliceIndex(maxSliceDepth - 1);
    }
    if (sliceIndex < 0) {
      setSliceIndex(0);
    }
  }, [maxSliceDepth, sliceIndex]);

  useEffect(() => {
    if (maxSliceDepth <= 1 && orthogonalViewsEnabled) {
      setOrthogonalViewsEnabled(false);
    }
  }, [maxSliceDepth, orthogonalViewsEnabled]);

  if (!isViewerLaunched) {
    const isFrontPageLocked =
      isLaunchingViewer || isExportingPreprocessed || isPreprocessedImporting || preprocessedDropboxImporting;
    const warningWindowInitialPosition =
      typeof window === 'undefined'
        ? { x: WINDOW_MARGIN, y: WINDOW_MARGIN }
        : {
            x: Math.max(WINDOW_MARGIN, Math.round(window.innerWidth / 2 - WARNING_WINDOW_WIDTH / 2)),
            y: WINDOW_MARGIN + 16
          };
    return (
      <FrontPage
        isFrontPageLocked={isFrontPageLocked}
        frontPageMode={frontPageMode}
        channels={channels}
        activeChannelId={activeChannelId}
        activeChannel={activeChannel}
        channelValidationMap={channelValidationMap}
        editingChannelId={editingChannelId}
        editingChannelInputRef={editingChannelInputRef}
        editingChannelOriginalNameRef={editingChannelOriginalNameRef}
        setActiveChannelId={setActiveChannelId}
        setEditingChannelId={setEditingChannelId}
        onStartExperimentSetup={handleStartExperimentSetup}
        onAddChannel={handleAddChannel}
        onOpenPreprocessedLoader={handlePreprocessedLoaderOpen}
        onReturnToStart={handleReturnToFrontPage}
        experimentDimension={experimentDimension}
        onExperimentDimensionChange={handleExperimentDimensionChange}
        voxelResolution={voxelResolutionInput}
        onVoxelResolutionAxisChange={handleVoxelResolutionAxisChange}
        onVoxelResolutionUnitChange={handleVoxelResolutionUnitChange}
        onVoxelResolutionAnisotropyToggle={handleVoxelResolutionAnisotropyToggle}
        isPreprocessedLoaderOpen={isPreprocessedLoaderOpen}
        isPreprocessedDragActive={isPreprocessedDragActive}
        onPreprocessedDragEnter={handlePreprocessedDragEnter}
        onPreprocessedDragLeave={handlePreprocessedDragLeave}
        onPreprocessedDragOver={handlePreprocessedDragOver}
        onPreprocessedDrop={handlePreprocessedDrop}
        preprocessedFileInputRef={preprocessedFileInputRef}
        onPreprocessedFileInputChange={handlePreprocessedFileInputChange}
        isPreprocessedImporting={isPreprocessedImporting}
        preprocessedImportBytesProcessed={preprocessedImportBytesProcessed}
        preprocessedImportTotalBytes={preprocessedImportTotalBytes}
        preprocessedImportVolumesDecoded={preprocessedImportVolumesDecoded}
        preprocessedImportTotalVolumeCount={preprocessedImportTotalVolumeCount}
        preprocessedDropboxImporting={preprocessedDropboxImporting}
        onPreprocessedBrowse={handlePreprocessedBrowse}
        onPreprocessedDropboxImport={handlePreprocessedDropboxImport}
        preprocessedImportError={preprocessedImportError}
        preprocessedDropboxError={preprocessedDropboxError}
        preprocessedDropboxInfo={preprocessedDropboxInfo}
        isPreprocessedDropboxConfigOpen={isPreprocessedDropboxConfigOpen}
        onPreprocessedDropboxConfigSubmit={handlePreprocessedDropboxConfigSubmit}
        preprocessedDropboxAppKeyInput={preprocessedDropboxAppKeyInput}
        onPreprocessedDropboxConfigInputChange={handlePreprocessedDropboxConfigInputChange}
        preprocessedDropboxAppKeySource={preprocessedDropboxAppKeySource}
        onPreprocessedDropboxConfigCancel={handlePreprocessedDropboxConfigCancel}
        onPreprocessedDropboxConfigClear={handlePreprocessedDropboxConfigClear}
        onChannelNameChange={handleChannelNameChange}
        onRemoveChannel={handleRemoveChannel}
        onChannelLayerFilesAdded={handleChannelLayerFilesAdded}
        onChannelLayerDrop={handleChannelLayerDrop}
        onChannelLayerSegmentationToggle={handleChannelLayerSegmentationToggle}
        onChannelLayerRemove={handleChannelLayerRemove}
        onChannelTrackFileSelected={handleChannelTrackFileSelected}
        onChannelTrackDrop={handleChannelTrackDrop}
        onChannelTrackClear={handleChannelTrackClear}
        preprocessedExperiment={preprocessedExperiment}
        computeTrackSummary={computeTrackSummary}
        hasGlobalTimepointMismatch={hasGlobalTimepointMismatch}
        interactionErrorMessage={interactionErrorMessage}
        launchErrorMessage={launchErrorMessage}
        onLaunchViewer={handleLaunchViewer}
        isLaunchingViewer={isLaunchingViewer}
        launchButtonEnabled={launchButtonEnabled}
        launchButtonLaunchable={launchButtonLaunchable}
        onExportPreprocessedExperiment={handleExportPreprocessedExperiment}
        isExportingPreprocessed={isExportingPreprocessed}
        canLaunch={canLaunch}
        warningWindowInitialPosition={warningWindowInitialPosition}
        warningWindowWidth={WARNING_WINDOW_WIDTH}
        datasetErrorResetSignal={datasetErrorResetSignal}
        onDatasetErrorDismiss={handleDatasetErrorDismiss}
      />
    );
  }

  const volumeViewerProps: ViewerShellProps['volumeViewerProps'] = {
    layers: viewerLayers,
    isLoading,
    loadingProgress: loadProgress,
    loadedVolumes: loadedCount,
    expectedVolumes: expectedVolumeCount,
    timeIndex: selectedIndex,
    totalTimepoints: volumeTimepointCount,
    isPlaying,
    playbackDisabled,
    playbackLabel,
    fps,
    blendingMode,
    onTogglePlayback: handleTogglePlayback,
    onTimeIndexChange: handleTimeIndexChange,
    onFpsChange: setFps,
    onVolumeStepScaleChange: handleVolumeStepScaleChange,
    onRegisterVolumeStepScaleChange: handleRegisterVolumeStepScaleChange,
    onRegisterReset: handleRegisterReset,
    trackScale,
    tracks: filteredTracks,
    trackVisibility,
    trackOpacityByChannel,
    trackLineWidthByChannel,
    channelTrackColorModes,
    channelTrackOffsets,
    selectedTrackIds,
    followedTrackId,
    onTrackSelectionToggle: handleTrackSelectionToggle,
    onTrackFollowRequest: handleTrackFollowFromViewer,
    onHoverVoxelChange: setHoveredVolumeVoxel,
    vr: is3dViewerAvailable
      ? {
          isVrPassthroughSupported,
          trackChannels,
          activeTrackChannelId,
          onTrackChannelSelect: handleTrackChannelSelect,
          onTrackVisibilityToggle: handleTrackVisibilityToggle,
          onTrackVisibilityAllChange: handleTrackVisibilityAllChange,
          onTrackOpacityChange: handleTrackOpacityChange,
          onTrackLineWidthChange: handleTrackLineWidthChange,
          onTrackColorSelect: handleTrackColorSelect,
          onTrackColorReset: handleTrackColorReset,
          onStopTrackFollow: handleStopTrackFollow,
          channelPanels: vrChannelPanels,
          activeChannelPanelId: activeChannelTabId,
          onChannelPanelSelect: setActiveChannelTabId,
          onChannelVisibilityToggle: handleChannelVisibilityToggle,
          onChannelReset: handleChannelSliderReset,
          onChannelLayerSelect: handleChannelLayerSelectionChange,
          onLayerSelect: handleLayerSelect,
          onLayerSoloToggle: handleLayerSoloToggle,
          onLayerContrastChange: handleLayerContrastChange,
          onLayerBrightnessChange: handleLayerBrightnessChange,
          onLayerWindowMinChange: handleLayerWindowMinChange,
          onLayerWindowMaxChange: handleLayerWindowMaxChange,
          onLayerAutoContrast: handleLayerAutoContrast,
          onLayerOffsetChange: handleLayerOffsetChange,
          onLayerColorChange: handleLayerColorChange,
          onLayerRenderStyleToggle: handleLayerRenderStyleToggle,
          onLayerSamplingModeToggle: handleLayerSamplingModeToggle,
          onLayerInvertToggle: handleLayerInvertToggle,
          onRegisterVrSession: registerSessionHandlers,
          onVrSessionStarted: handleSessionStarted,
          onVrSessionEnded: handleSessionEnded
        }
      : undefined
  };

  const orthogonalViewsAvailable = viewerMode === '2d' && maxSliceDepth > 1;

  const planarViewerProps: ViewerShellProps['planarViewerProps'] = {
    layers: viewerLayers,
    isLoading,
    loadingProgress: loadProgress,
    loadedVolumes: loadedCount,
    expectedVolumes: expectedVolumeCount,
    timeIndex: selectedIndex,
    totalTimepoints: volumeTimepointCount,
    onRegisterReset: handleRegisterReset,
    sliceIndex,
    maxSlices: maxSliceDepth,
    onSliceIndexChange: handleSliceIndexChange,
    trackScale,
    tracks: filteredTracks,
    trackVisibility,
    trackOpacityByChannel,
    trackLineWidthByChannel,
    channelTrackColorModes,
    channelTrackOffsets,
    followedTrackId,
    selectedTrackIds,
    onTrackSelectionToggle: handleTrackSelectionToggle,
    onTrackFollowRequest: handleTrackFollowFromViewer,
    onHoverVoxelChange: setHoveredVolumeVoxel,
    orthogonalViewsEnabled: viewerMode === '2d' && maxSliceDepth > 1 && orthogonalViewsEnabled
  };

  const showSelectedTracksWindow = !isVrActive && hasParsedTrackData;

  const viewerShellProps: ViewerShellProps = {
    viewerMode,
    volumeViewerProps,
    planarViewerProps,
    planarSettings: {
      orthogonalViewsAvailable,
      orthogonalViewsEnabled,
      onOrthogonalViewsToggle: handleOrthogonalViewsToggle
    },
    topMenu: {
      onReturnToLauncher: handleReturnToLauncher,
      onResetLayout: handleResetWindowLayout,
      helpMenuRef,
      isHelpMenuOpen,
      onHelpMenuToggle: handleHelpMenuToggle,
      hoveredVoxel: hoveredVolumeVoxel,
      followedTrackChannelId,
      followedTrackId,
      onStopTrackFollow: handleStopTrackFollow
    },
    layout: {
      windowMargin: WINDOW_MARGIN,
      controlWindowWidth: CONTROL_WINDOW_WIDTH,
      selectedTracksWindowWidth: SELECTED_TRACKS_WINDOW_WIDTH,
      resetToken: layoutResetToken,
      controlWindowInitialPosition,
      viewerSettingsWindowInitialPosition,
      layersWindowInitialPosition,
      trackWindowInitialPosition,
      selectedTracksWindowInitialPosition,
      plotSettingsWindowInitialPosition
    },
    modeControls: {
      is3dModeAvailable: is3dViewerAvailable,
      isVrActive,
      isVrRequesting,
      resetViewHandler,
      onToggleViewerMode: handleToggleViewerMode,
      onVrButtonClick: handleVrButtonClick,
      vrButtonDisabled,
      vrButtonTitle,
      vrButtonLabel,
      renderStyle: globalRenderStyle,
      samplingMode: globalSamplingMode,
      onRenderStyleToggle: () => handleLayerRenderStyleToggle(),
      onSamplingModeToggle: () => handleLayerSamplingModeToggle(),
      blendingMode,
      onBlendingModeToggle: handleBlendingModeToggle
    },
    playbackControls: {
      fps,
      onFpsChange: setFps,
      volumeTimepointCount,
      sliceIndex,
      maxSliceDepth,
      onSliceIndexChange: handleSliceIndexChange,
      isPlaying,
      playbackLabel,
      selectedIndex,
      onTimeIndexChange: handleTimeIndexChange,
      playbackDisabled,
      onTogglePlayback: handleTogglePlayback,
      onJumpToStart: handleJumpToStart,
      onJumpToEnd: handleJumpToEnd,
      error
    },
    channelsPanel: {
      loadedChannelIds,
      channelNameMap,
      channelVisibility,
      channelTintMap,
      activeChannelId: activeChannelTabId,
      onChannelTabSelect: setActiveChannelTabId,
      onChannelVisibilityToggle: handleChannelVisibilityToggle,
      channelLayersMap,
      channelActiveLayer,
      layerSettings,
      getLayerDefaultSettings: createLayerDefaultSettings,
      onChannelLayerSelect: handleChannelLayerSelectionChange,
      onChannelReset: handleChannelSliderReset,
      onLayerWindowMinChange: handleLayerWindowMinChange,
      onLayerWindowMaxChange: handleLayerWindowMaxChange,
      onLayerBrightnessChange: handleLayerBrightnessChange,
      onLayerContrastChange: handleLayerContrastChange,
      onLayerAutoContrast: handleLayerAutoContrast,
      onLayerOffsetChange: handleLayerOffsetChange,
      onLayerColorChange: handleLayerColorChange,
      onLayerInvertToggle: handleLayerInvertToggle
    },
    tracksPanel: {
      channels,
      channelNameMap,
      activeChannelId: activeTrackChannelId,
      onChannelTabSelect: setActiveTrackChannelId,
      parsedTracksByChannel,
      filteredTracksByChannel,
      minimumTrackLength,
      pendingMinimumTrackLength,
      trackLengthBounds,
      onMinimumTrackLengthChange: handleMinimumTrackLengthChange,
      onMinimumTrackLengthApply: handleMinimumTrackLengthApply,
      channelTrackColorModes,
      trackOpacityByChannel,
      trackLineWidthByChannel,
      trackSummaryByChannel,
      followedTrackChannelId,
      followedTrackId,
      onTrackOrderToggle: handleTrackOrderToggle,
      trackOrderModeByChannel,
      trackVisibility,
      onTrackVisibilityToggle: handleTrackVisibilityToggle,
      onTrackVisibilityAllChange: handleTrackVisibilityAllChange,
      onTrackOpacityChange: handleTrackOpacityChange,
      onTrackLineWidthChange: handleTrackLineWidthChange,
      onTrackColorSelect: handleTrackColorSelect,
      onTrackColorReset: handleTrackColorReset,
      onTrackSelectionToggle: handleTrackSelectionToggle,
      selectedTrackIds,
      onTrackFollow: handleTrackFollow
    },
    selectedTracksPanel: {
      shouldRender: showSelectedTracksWindow,
      series: selectedTrackSeries,
      totalTimepoints: volumeTimepointCount,
      amplitudeLimits: resolvedAmplitudeLimits,
      timeLimits: resolvedTimeLimits,
      currentTimepoint: selectedIndex,
      channelTintMap,
      smoothing: trackSmoothing,
      onTrackSelectionToggle: handleTrackSelectionToggle
    },
    plotSettings: {
      amplitudeExtent,
      amplitudeLimits: resolvedAmplitudeLimits,
      timeExtent,
      timeLimits: resolvedTimeLimits,
      smoothing: trackSmoothing,
      smoothingExtent: TRACK_SMOOTHING_RANGE,
      onAmplitudeLimitsChange: handleSelectedTracksAmplitudeLimitsChange,
      onTimeLimitsChange: handleSelectedTracksTimeLimitsChange,
      onSmoothingChange: handleTrackSmoothingChange,
      onAutoRange: handleSelectedTracksAutoRange,
      onClearSelection: handleClearSelectedTracks
    },
    trackDefaults: {
      opacity: DEFAULT_TRACK_OPACITY,
      lineWidth: DEFAULT_TRACK_LINE_WIDTH
    }
  };

  return <ViewerShell {...viewerShellProps} />;
}

export default App;
