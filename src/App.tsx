import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadVolumesFromFiles } from './loaders/volumeLoader';
import { VolumeTooLargeError, formatBytes } from './errors';
import FrontPage from './components/FrontPage';
import ViewerShell, { type ViewerShellProps } from './components/ViewerShell';
import {
  colorizeSegmentationVolume,
  computeNormalizationParameters,
  normalizeVolume
} from './volumeProcessing';
import { clearTextureCache } from './textureCache';
import type { TrackColorMode, TrackDefinition, TrackPoint } from './types/tracks';
import { DEFAULT_LAYER_COLOR, normalizeHexColor } from './layerColors';
import {
  DEFAULT_TRACK_COLOR,
  getTrackColorHex,
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
import './styles/app/index.css';
import { computeAutoWindow, getVolumeHistogram } from './autoContrast';
import { getDefaultWindowForVolume } from './utils/volumeWindow';
import type { ImportPreprocessedDatasetResult } from './utils/preprocessedDataset';
import { computeTrackSummary } from './utils/trackSummary';
import useVrLifecycle from './hooks/useVrLifecycle';
import usePreprocessedExperiment from './hooks/usePreprocessedExperiment';
import {
  collectFilesFromDataTransfer,
  createSegmentationSeed,
  dedupeFiles,
  groupFilesIntoLayers,
  hasTiffExtension,
  parseTrackCsvFile,
  sortVolumeFiles
} from './utils/appHelpers';

const DEFAULT_FPS = 12;
const DEFAULT_TRACK_OPACITY = 0.9;
const DEFAULT_TRACK_LINE_WIDTH = 1;
const WINDOW_MARGIN = 24;
const CONTROL_WINDOW_WIDTH = 360;
const PLAYBACK_WINDOW_WIDTH = 420;
const TRACK_WINDOW_WIDTH = 340;
const SELECTED_TRACKS_WINDOW_WIDTH = 960;
const SELECTED_TRACKS_WINDOW_HEIGHT = 220;
const LAYERS_WINDOW_VERTICAL_OFFSET = 420;
const WARNING_WINDOW_WIDTH = 360;

type LoadState = 'idle' | 'loading' | 'loaded' | 'error';

type ChannelTrackState = {
  opacity: number;
  lineWidth: number;
  visibility: Record<string, boolean>;
  colorMode: TrackColorMode;
};

const createDefaultChannelTrackState = (): ChannelTrackState => ({
  opacity: DEFAULT_TRACK_OPACITY,
  lineWidth: DEFAULT_TRACK_LINE_WIDTH,
  visibility: {},
  colorMode: { type: 'random' }
});


type FollowedTrackState = {
  id: string;
  channelId: string;
} | null;

type DatasetErrorContext = 'launch' | 'interaction';

type ChannelLayerSource = {
  id: string;
  files: File[];
  isSegmentation: boolean;
};

type ChannelSource = {
  id: string;
  name: string;
  layers: ChannelLayerSource[];
  trackFile: File | null;
  trackStatus: LoadState;
  trackError: string | null;
  trackEntries: string[][];
};

type StagedPreprocessedExperiment = ImportPreprocessedDatasetResult & {
  sourceName: string | null;
  sourceSize: number | null;
};

type ChannelValidation = {
  errors: string[];
  warnings: string[];
};

export type {
  ChannelSource,
  ChannelTrackState,
  ChannelValidation,
  FollowedTrackState,
  StagedPreprocessedExperiment
};

function App() {
  const [channels, setChannels] = useState<ChannelSource[]>([]);
  const [isExperimentSetupStarted, setIsExperimentSetupStarted] = useState(false);
  const [editingChannelId, setEditingChannelId] = useState<string | null>(null);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [datasetError, setDatasetError] = useState<string | null>(null);
  const [datasetErrorContext, setDatasetErrorContext] = useState<DatasetErrorContext | null>(null);
  const [datasetErrorResetSignal, setDatasetErrorResetSignal] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [layers, setLayers] = useState<LoadedLayer[]>([]);
  const layersRef = useRef<LoadedLayer[]>([]);
  useEffect(() => {
    layersRef.current = layers;
  }, [layers]);
  const [channelVisibility, setChannelVisibility] = useState<Record<string, boolean>>({});
  const [channelActiveLayer, setChannelActiveLayer] = useState<Record<string, string>>({});
  const [layerSettings, setLayerSettings] = useState<Record<string, LayerSettings>>({});
  const createLayerDefaultSettings = useCallback(
    (layerKey: string): LayerSettings => {
      const layer = layersRef.current.find((entry) => entry.key === layerKey) ?? null;
      const defaultWindow = getDefaultWindowForVolume(layer?.volumes[0]);
      return createDefaultLayerSettings(defaultWindow);
    },
    []
  );
  const createLayerDefaultBrightnessState = useCallback(
    (layerKey: string) => {
      const layer = layersRef.current.find((entry) => entry.key === layerKey) ?? null;
      const defaultWindow = getDefaultWindowForVolume(layer?.volumes[0]);
      return brightnessContrastModel.createState(
        defaultWindow?.windowMin,
        defaultWindow?.windowMax
      );
    },
    []
  );
  const [layerAutoThresholds, setLayerAutoThresholds] = useState<Record<string, number>>({});
  const [status, setStatus] = useState<LoadState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [loadProgress, setLoadProgress] = useState(0);
  const [loadedCount, setLoadedCount] = useState(0);
  const [expectedVolumeCount, setExpectedVolumeCount] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [fps, setFps] = useState(DEFAULT_FPS);
  const [resetViewHandler, setResetViewHandler] = useState<(() => void) | null>(null);
  const [activeChannelTabId, setActiveChannelTabId] = useState<string | null>(null);
  const [activeTrackChannelId, setActiveTrackChannelId] = useState<string | null>(null);
  const [channelTrackStates, setChannelTrackStates] = useState<Record<string, ChannelTrackState>>({});
  const [trackOrderModeByChannel, setTrackOrderModeByChannel] = useState<Record<string, 'id' | 'length'>>({});
  const [selectedTrackIds, setSelectedTrackIds] = useState<ReadonlySet<string>>(new Set());
  const [followedTrack, setFollowedTrack] = useState<FollowedTrackState>(null);
  const [viewerMode, setViewerMode] = useState<'3d' | '2d'>('3d');
  const [sliceIndex, setSliceIndex] = useState(0);
  const [isViewerLaunched, setIsViewerLaunched] = useState(false);
  const [isLaunchingViewer, setIsLaunchingViewer] = useState(false);
  const [layoutResetToken, setLayoutResetToken] = useState(0);
  const [isHelpMenuOpen, setIsHelpMenuOpen] = useState(false);
  const handleHelpMenuToggle = useCallback(() => {
    setIsHelpMenuOpen((previous) => !previous);
  }, []);
  const controlWindowInitialPosition = useMemo(
    () => ({ x: WINDOW_MARGIN, y: WINDOW_MARGIN }),
    []
  );
  const layersWindowInitialPosition = useMemo(
    () => ({ x: WINDOW_MARGIN, y: WINDOW_MARGIN + LAYERS_WINDOW_VERTICAL_OFFSET }),
    []
  );
  const [trackWindowInitialPosition, setTrackWindowInitialPosition] = useState<{ x: number; y: number }>(
    () => ({ x: WINDOW_MARGIN, y: WINDOW_MARGIN })
  );
  const computeTrackWindowDefaultPosition = useCallback(() => {
    if (typeof window === 'undefined') {
      return { x: WINDOW_MARGIN, y: WINDOW_MARGIN };
    }
    const trackWidth = Math.min(TRACK_WINDOW_WIDTH, window.innerWidth - WINDOW_MARGIN * 2);
    const nextX = Math.max(WINDOW_MARGIN, window.innerWidth - trackWidth - WINDOW_MARGIN);
    return { x: nextX, y: WINDOW_MARGIN };
  }, []);
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
  const [selectedTracksWindowInitialPosition, setSelectedTracksWindowInitialPosition] = useState<{
    x: number;
    y: number;
  }>(() => computeSelectedTracksWindowDefaultPosition());

  const loadRequestRef = useRef(0);
  const trackMasterCheckboxRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const channelIdRef = useRef(0);
  const layerIdRef = useRef(0);
  const editingChannelOriginalNameRef = useRef('');
  const editingChannelInputRef = useRef<HTMLInputElement | null>(null);
  const pendingChannelFocusIdRef = useRef<string | null>(null);
  const helpMenuRef = useRef<HTMLDivElement | null>(null);

  const createChannelSource = useCallback(
    (name: string): ChannelSource => {
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
    },
    []
  );

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

  const handleBeforeEnterVr = useCallback(() => {
    setFollowedTrack(null);
  }, [setFollowedTrack]);

  const {
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
    handleSessionEnded
  } = useVrLifecycle({
    viewerMode,
    onBeforeEnter: handleBeforeEnterVr
  });

  const handleVrButtonClick = useCallback(() => {
    if (isVrActive) {
      void exitVr();
    } else {
      void enterVr();
    }
  }, [enterVr, exitVr, isVrActive]);

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
      setDatasetErrorResetSignal((value) => value + 1);
    }
  }, [datasetError, datasetErrorContext]);

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
  }, [channels]);
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
  const parsedTracksByChannel = useMemo(() => {
    const map = new Map<string, TrackDefinition[]>();

    for (const channel of channels) {
      const entries = channel.trackEntries;
      if (entries.length === 0) {
        map.set(channel.id, []);
        continue;
      }

      const trackMap = new Map<number, TrackPoint[]>();

      for (const row of entries) {
        if (row.length < 7) {
          continue;
        }

        const rawId = Number(row[0]);
        const initialTime = Number(row[1]);
        const deltaTime = Number(row[2]);
        const x = Number(row[3]);
        const y = Number(row[4]);
        const z = Number(row[5]);
        const amplitudeRaw = Number(row[6]);

        if (
          !Number.isFinite(rawId) ||
          !Number.isFinite(initialTime) ||
          !Number.isFinite(deltaTime) ||
          !Number.isFinite(x) ||
          !Number.isFinite(y) ||
          !Number.isFinite(z) ||
          !Number.isFinite(amplitudeRaw)
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
  }, [channels]);

  const parsedTracks = useMemo(() => {
    const ordered: TrackDefinition[] = [];
    for (const channel of channels) {
      const channelTracks = parsedTracksByChannel.get(channel.id) ?? [];
      ordered.push(...channelTracks);
    }
    return ordered;
  }, [channels, parsedTracksByChannel]);

  const trackLookup = useMemo(() => {
    const map = new Map<string, TrackDefinition>();
    for (const track of parsedTracks) {
      map.set(track.id, track);
    }
    return map;
  }, [parsedTracks]);

  const selectedTrackSeries = useMemo(
    () =>
      parsedTracks
        .filter((track) => selectedTrackIds.has(track.id))
        .map((track) => ({
          id: track.id,
          label: `${track.channelName} · Track #${track.trackNumber}`,
          color: getTrackColorHex(track.id),
          points: track.points
        })),
    [parsedTracks, selectedTrackIds]
  );

  useEffect(() => {
    setSelectedTrackIds((current) => {
      if (current.size === 0) {
        return current;
      }

      const next = new Set<string>();
      for (const track of parsedTracks) {
        if (current.has(track.id)) {
          next.add(track.id);
        }
      }

      return next.size === current.size ? current : next;
    });
  }, [parsedTracks]);

  const hasParsedTrackData = parsedTracks.length > 0;
  const handleRegisterReset = useCallback((handler: (() => void) | null) => {
    setResetViewHandler(() => handler);
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
    setSelectedTracksWindowInitialPosition(computeSelectedTracksWindowDefaultPosition());
  }, [
    computeSelectedTracksWindowDefaultPosition,
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
    const defaultPosition = computeSelectedTracksWindowDefaultPosition();
    setSelectedTracksWindowInitialPosition((current) => {
      if (current.x === defaultPosition.x && current.y === defaultPosition.y) {
        return current;
      }
      return defaultPosition;
    });
  }, [computeSelectedTracksWindowDefaultPosition]);

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
    setDatasetError(message);
    setDatasetErrorContext('launch');
  }, []);

  const showInteractionWarning = useCallback((message: string) => {
    setDatasetError(message);
    setDatasetErrorContext('interaction');
  }, []);

  const clearDatasetError = useCallback(() => {
    setDatasetError(null);
    setDatasetErrorContext(null);
  }, []);

  const applyLoadedLayers = useCallback(
    (normalizedLayers: LoadedLayer[], expectedVolumeCount: number) => {
      clearTextureCache();
      setLayers(normalizedLayers);
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
      setChannelVisibility(visibilityDefaults);
      setChannelActiveLayer(activeLayerDefaults);
      setLayerSettings(
        normalizedLayers.reduce<Record<string, LayerSettings>>((acc, layer) => {
          const defaultWindow = getDefaultWindowForVolume(layer.volumes[0]);
          acc[layer.key] = createDefaultLayerSettings(defaultWindow);
          return acc;
        }, {})
      );
      setLayerAutoThresholds(
        normalizedLayers.reduce<Record<string, number>>((acc, layer) => {
          acc[layer.key] = 0;
          return acc;
        }, {})
      );
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
    [clearDatasetError]
  );

  const loadSelectedDataset = useCallback(async (): Promise<LoadedLayer[] | null> => {
    clearDatasetError();
    const flatLayerSources = channels
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

    const requestId = loadRequestRef.current + 1;
    loadRequestRef.current = requestId;

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

    const referenceFiles = flatLayerSources[0]?.files ?? [];
    const totalExpectedVolumes = referenceFiles.length * flatLayerSources.length;
    if (totalExpectedVolumes === 0) {
      const message = 'The selected dataset does not contain any TIFF files.';
      showLaunchError(message);
      setStatus('error');
      setError(message);
      return null;
    }

    setExpectedVolumeCount(totalExpectedVolumes);

    try {
      for (const layer of flatLayerSources) {
        if (layer.files.length !== referenceFiles.length) {
          throw new Error(
            `Channel "${layer.channelLabel}" has ${layer.files.length} timepoints, but the first channel has ${referenceFiles.length}.`
          );
        }
      }

      let referenceShape: { width: number; height: number; depth: number } | null = null;

      const rawLayers = await Promise.all(
        flatLayerSources.map(async (layer) => {
          const volumes = await loadVolumesFromFiles(layer.files, {
            onVolumeLoaded: (_index, volume) => {
              if (loadRequestRef.current !== requestId) {
                return;
              }

              if (!referenceShape) {
                referenceShape = {
                  width: volume.width,
                  height: volume.height,
                  depth: volume.depth
                };
              } else if (
                volume.width !== referenceShape.width ||
                volume.height !== referenceShape.height ||
                volume.depth !== referenceShape.depth
              ) {
                throw new Error(
                  `Channel "${layer.channelLabel}" has volume dimensions ${volume.width}×${volume.height}×${volume.depth} that do not match the reference shape ${referenceShape.width}×${referenceShape.height}×${referenceShape.depth}.`
                );
              }

              setLoadedCount((current) => {
                if (loadRequestRef.current !== requestId) {
                  return current;
                }

                const next = current + 1;
                setLoadProgress(totalExpectedVolumes === 0 ? 0 : next / totalExpectedVolumes);
                return next;
              });
            }
          });
          return { layer, volumes };
        })
      );

      if (loadRequestRef.current !== requestId) {
        return null;
      }

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

      applyLoadedLayers(normalizedLayers, totalExpectedVolumes);
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
  }, [
    applyLoadedLayers,
    channels,
    clearDatasetError,
    colorizeSegmentationVolume,
    computeNormalizationParameters,
    createSegmentationSeed,
    normalizeVolume,
    showLaunchError
  ]);

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
    isPreprocessedDropboxConfigOpen,
    preprocessedDropboxAppKeyInput,
    preprocessedDropboxAppKeySource,
    preprocessedFileInputRef,
    handlePreprocessedLoaderOpen,
    handlePreprocessedLoaderClose,
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
    setSelectedTrackIds,
    setFollowedTrack,
    setIsExperimentSetupStarted,
    clearDatasetError,
    updateChannelIdCounter,
    loadSelectedDataset,
    showInteractionWarning,
    isLaunchingViewer
  });

  useEffect(() => {
    if (preprocessedExperiment) {
      return;
    }
    if (channels.length === 0) {
      setIsExperimentSetupStarted(false);
    }
  }, [channels, preprocessedExperiment]);

  const isLoading = status === 'loading';
  const playbackDisabled = isLoading || volumeTimepointCount <= 1;
  const vrButtonDisabled = isVrActive ? false : !isVrAvailable || !hasVrSessionHandlers || isVrRequesting;
  const vrButtonTitle = isVrActive
    ? 'Exit immersive VR session.'
    : !isVrSupportChecked
    ? 'Checking WebXR capabilities…'
    : !isVrSupported
    ? 'WebXR immersive VR is not supported in this browser.'
    : viewerMode !== '3d'
    ? 'Switch to the 3D view to enable VR.'
    : !hasVrSessionHandlers
    ? 'Viewer is still initializing.'
    : isVrRequesting
    ? 'Starting VR session…'
    : undefined;

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
      const tracksForChannel = parsedTracksByChannel.get(channel.id) ?? [];
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
  }, [channels, channelTrackStates, followedTrack, parsedTracksByChannel, selectedTrackIds]);

  const trackVisibility = useMemo(() => {
    const visibility: Record<string, boolean> = {};
    for (const channel of channels) {
      const tracksForChannel = parsedTracksByChannel.get(channel.id) ?? [];
      const state = channelTrackStates[channel.id] ?? createDefaultChannelTrackState();
      for (const track of tracksForChannel) {
        visibility[track.id] = state.visibility[track.id] ?? true;
      }
    }
    return visibility;
  }, [channelTrackStates, channels, parsedTracksByChannel]);

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
        const defaultWindow = getDefaultWindowForVolume(layer.volumes[0]);
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

  useEffect(() => {
    for (const channel of channels) {
      const checkbox = trackMasterCheckboxRefs.current[channel.id];
      if (!checkbox) {
        continue;
      }
      const summary = trackSummaryByChannel.get(channel.id) ?? { total: 0, visible: 0 };
      const allChecked = summary.total > 0 && summary.visible === summary.total;
      const someChecked =
        summary.total > 0 && summary.visible > 0 && summary.visible < summary.total;
      checkbox.indeterminate = someChecked && !allChecked;
    }
  }, [channels, trackSummaryByChannel]);

  useEffect(() => {
    const validIds = new Set(channels.map((channel) => channel.id));
    for (const key of Object.keys(trackMasterCheckboxRefs.current)) {
      if (!validIds.has(key)) {
        delete trackMasterCheckboxRefs.current[key];
      }
    }
  }, [channels]);

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
    setChannels((current) => {
      const filtered = current.filter((channel) => channel.id !== channelId);
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
    clearDatasetError();
  }, [clearDatasetError]);

  const handleChannelLayerFilesAdded = useCallback(
    (channelId: string, incomingFiles: File[]) => {
      const tiffFiles = dedupeFiles(incomingFiles.filter((file) => hasTiffExtension(file.name)));
      if (tiffFiles.length === 0) {
        showInteractionWarning('No TIFF files detected in the dropped selection.');
        return;
      }

      let addedAny = false;
      let ignoredExtraGroups = false;
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
          return { ...channel, layers: [nextLayer] };
        })
      );

      if (addedAny) {
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
      } else {
        showInteractionWarning('No volume was added from that drop.');
      }
    },
    [clearDatasetError, createLayerSource, showInteractionWarning]
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
    setSelectedTrackIds(new Set<string>());
    setFollowedTrack(null);
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



  const frontPageMode = useMemo<'initial' | 'configuring' | 'preprocessed'>(() => {
    if (preprocessedExperiment) {
      return 'preprocessed';
    }
    if (channels.length > 0 || isExperimentSetupStarted) {
      return 'configuring';
    }
    return 'initial';
  }, [channels, isExperimentSetupStarted, preprocessedExperiment]);

  const channelValidationList = useMemo(() => {
    return channels.map((channel) => {
      const errors: string[] = [];
      const warnings: string[] = [];

      if (!channel.name.trim()) {
        errors.push('Name this channel.');
      }

      if (channel.layers.length === 0) {
        errors.push('Add a volume to this channel.');
      } else {
        const layer = channel.layers[0];
        if (!layer || layer.files.length === 0) {
          errors.push('Add files to the volume in this channel.');
        }
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
        timepointCount: channel.layers[0]?.files.length ?? 0
      };
    });
  }, [channels]);

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
        if (layer.files.length > 0) {
          timepointCounts.add(layer.files.length);
        }
      }
    }
    return timepointCounts.size > 1;
  }, [channels]);
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
  const canLaunch = hasAnyLayers && allChannelsValid && !hasLoadingTracks;
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

    if (preprocessedExperiment) {
      clearDatasetError();
      setIsLaunchingViewer(true);
      try {
        applyLoadedLayers(preprocessedExperiment.layers, preprocessedExperiment.totalVolumeCount);
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
    setIsLaunchingViewer(true);
    try {
      const normalizedLayers = await loadSelectedDataset();
      if (!normalizedLayers) {
        return;
      }

      setIsViewerLaunched(true);
    } finally {
      setIsLaunchingViewer(false);
    }
  }, [
    applyLoadedLayers,
    channelValidationList,
    channels,
    clearDatasetError,
    isLaunchingViewer,
    loadSelectedDataset,
    preprocessedExperiment,
    showLaunchError
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
        setSelectedTrackIds((current) => {
          if (!current.has(trackId)) {
            return current;
          }
          const next = new Set(current);
          next.delete(trackId);
          return next;
        });
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
        setSelectedTrackIds((current) => {
          if (current.size === 0) {
            return current;
          }
          const next = new Set(current);
          for (const track of tracksForChannel) {
            next.delete(track.id);
          }
          return next.size === current.size ? current : next;
        });
      }
    },
    [parsedTracksByChannel]
  );

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
      setSelectedTrackIds((current) => {
        if (current.has(trackId)) {
          const next = new Set(current);
          next.delete(trackId);
          return next;
        }
        const next = new Set(current);
        next.add(trackId);
        didSelect = true;
        return next;
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
        setSelectedTrackIds((current) => {
          if (current.has(trackId)) {
            return current;
          }
          const next = new Set(current);
          next.add(trackId);
          return next;
        });
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

      setSelectedTrackIds((current) => {
        if (current.has(trackId)) {
          return current;
        }
        const next = new Set(current);
        next.add(trackId);
        return next;
      });

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

  const registerTrackMasterCheckbox = useCallback(
    (channelId: string) => (element: HTMLInputElement | null) => {
      trackMasterCheckboxRefs.current[channelId] = element;
    },
    []
  );

  const handleToggleViewerMode = useCallback(() => {
    setViewerMode((current) => (current === '3d' ? '2d' : '3d'));
    setResetViewHandler(null);
    handleStopTrackFollow();
  }, [handleStopTrackFollow]);

  const handleSliceIndexChange = useCallback((index: number) => {
    setSliceIndex(index);
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

  const handleLayerRenderStyleToggle = useCallback((key: string) => {
    setLayerSettings((current) => {
      const previous = current[key] ?? createLayerDefaultSettings(key);
      const nextStyle: 0 | 1 = previous.renderStyle === 1 ? 0 : 1;
      if (previous.renderStyle === nextStyle) {
        return current;
      }
      return {
        ...current,
        [key]: {
          ...previous,
          renderStyle: nextStyle
        }
      };
    });
  }, [createLayerDefaultSettings]);

  const handleLayerSamplingModeToggle = useCallback((key: string) => {
    setLayerSettings((current) => {
      const previous = current[key] ?? createLayerDefaultSettings(key);
      const nextMode: SamplingMode = previous.samplingMode === 'nearest' ? 'linear' : 'nearest';
      if (previous.samplingMode === nextMode) {
        return current;
      }
      return {
        ...current,
        [key]: {
          ...previous,
          samplingMode: nextMode
        }
      };
    });
  }, [createLayerDefaultSettings]);

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
            renderStyle: DEFAULT_RENDER_STYLE,
            invert: false,
            samplingMode: DEFAULT_SAMPLING_MODE
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
      const isActiveChannel = layer.channelId === activeChannelTabId;
      const channelVisible = channelVisibility[layer.channelId];
      return {
        key: layer.key,
        label: layer.label,
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
        offsetX: isActiveChannel ? settings.xOffset : 0,
        offsetY: isActiveChannel ? settings.yOffset : 0,
        renderStyle: settings.renderStyle,
        invert: settings.invert,
        samplingMode: settings.samplingMode,
        isSegmentation: layer.isSegmentation
      };
    });
  }, [activeChannelTabId, channelActiveLayer, channelVisibility, layerSettings, layers, selectedIndex]);

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

  const backgroundVideoSrc = `${import.meta.env.BASE_URL}media/background.mp4`;

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
        backgroundVideoSrc={backgroundVideoSrc}
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
        onAddChannel={handleAddChannel}
        onOpenPreprocessedLoader={handlePreprocessedLoaderOpen}
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
        preprocessedDropboxImporting={preprocessedDropboxImporting}
        onPreprocessedBrowse={handlePreprocessedBrowse}
        onPreprocessedDropboxImport={handlePreprocessedDropboxImport}
        onPreprocessedLoaderClose={handlePreprocessedLoaderClose}
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
    onTogglePlayback: handleTogglePlayback,
    onTimeIndexChange: handleTimeIndexChange,
    onFpsChange: setFps,
    onRegisterReset: handleRegisterReset,
    tracks: parsedTracks,
    trackVisibility,
    trackOpacityByChannel,
    trackLineWidthByChannel,
    channelTrackColorModes,
    channelTrackOffsets,
    selectedTrackIds,
    followedTrackId,
    onTrackSelectionToggle: handleTrackSelectionToggle,
    onTrackFollowRequest: handleTrackFollowFromViewer,
    vr: {
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
  };

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
    tracks: parsedTracks,
    trackVisibility,
    trackOpacityByChannel,
    trackLineWidthByChannel,
    channelTrackColorModes,
    channelTrackOffsets,
    followedTrackId,
    selectedTrackIds,
    onTrackSelectionToggle: handleTrackSelectionToggle,
    onTrackFollowRequest: handleTrackFollowFromViewer
  };

  const showSelectedTracksWindow = !isVrActive && hasParsedTrackData;

  const viewerShellProps: ViewerShellProps = {
    viewerMode,
    volumeViewerProps,
    planarViewerProps,
    topMenu: {
      onReturnToLauncher: handleReturnToLauncher,
      onResetLayout: handleResetWindowLayout,
      helpMenuRef,
      isHelpMenuOpen,
      onHelpMenuToggle: handleHelpMenuToggle
    },
    layout: {
      windowMargin: WINDOW_MARGIN,
      playbackWindowWidth: PLAYBACK_WINDOW_WIDTH,
      controlWindowWidth: CONTROL_WINDOW_WIDTH,
      trackWindowWidth: TRACK_WINDOW_WIDTH,
      selectedTracksWindowWidth: SELECTED_TRACKS_WINDOW_WIDTH,
      resetToken: layoutResetToken,
      controlWindowInitialPosition,
      layersWindowInitialPosition,
      trackWindowInitialPosition,
      selectedTracksWindowInitialPosition
    },
    modeControls: {
      isVrActive,
      isVrRequesting,
      resetViewHandler,
      onToggleViewerMode: handleToggleViewerMode,
      onVrButtonClick: handleVrButtonClick,
      vrButtonDisabled,
      vrButtonTitle,
      vrButtonLabel
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
      onLayerRenderStyleToggle: handleLayerRenderStyleToggle,
      onLayerSamplingModeToggle: handleLayerSamplingModeToggle,
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
      channelTrackColorModes,
      trackOpacityByChannel,
      trackLineWidthByChannel,
      trackSummaryByChannel,
      followedTrackChannelId,
      followedTrackId,
      onTrackOrderToggle: handleTrackOrderToggle,
      trackOrderModeByChannel,
      registerTrackMasterCheckbox,
      trackVisibility,
      onTrackVisibilityToggle: handleTrackVisibilityToggle,
      onTrackVisibilityAllChange: handleTrackVisibilityAllChange,
      onTrackOpacityChange: handleTrackOpacityChange,
      onTrackLineWidthChange: handleTrackLineWidthChange,
      onTrackColorSelect: handleTrackColorSelect,
      onTrackColorReset: handleTrackColorReset,
      onTrackSelectionToggle: handleTrackSelectionToggle,
      selectedTrackIds,
      onTrackFollow: handleTrackFollow,
      onStopTrackFollow: handleStopTrackFollow
    },
    selectedTracksPanel: {
      shouldRender: showSelectedTracksWindow,
      series: selectedTrackSeries,
      totalTimepoints: volumeTimepointCount
    },
    trackDefaults: {
      opacity: DEFAULT_TRACK_OPACITY,
      lineWidth: DEFAULT_TRACK_LINE_WIDTH
    }
  };

  return <ViewerShell {...viewerShellProps} />;
}

export default App;
