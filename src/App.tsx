import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import { loadVolumesFromFiles } from './loaders/volumeLoader';
import VolumeViewer from './components/VolumeViewer';
import PlanarViewer from './components/PlanarViewer';
import { computeNormalizationParameters, normalizeVolume, NormalizedVolume } from './volumeProcessing';
import { clearTextureCache } from './textureCache';
import FloatingWindow from './components/FloatingWindow';
import type { TrackDefinition, TrackPoint } from './types/tracks';
import { DEFAULT_LAYER_COLOR, GRAYSCALE_COLOR_SWATCHES, normalizeHexColor } from './layerColors';
import { getTrackColorHex } from './trackColors';
import './App.css';

const DEFAULT_CONTRAST = 1;
const DEFAULT_BRIGHTNESS = 0;
const DEFAULT_FPS = 12;
const DEFAULT_TRACK_OPACITY = 0.9;
const DEFAULT_TRACK_LINE_WIDTH = 1;
const WINDOW_MARGIN = 24;
const CONTROL_WINDOW_WIDTH = 360;
const TRACK_WINDOW_WIDTH = 340;
const LAYERS_WINDOW_VERTICAL_OFFSET = 420;

type LoadState = 'idle' | 'loading' | 'loaded' | 'error';

type LayerTarget = {
  key: string;
  label: string;
};

type LoadedLayer = LayerTarget & {
  volumes: NormalizedVolume[];
};

type LayerSettings = {
  contrast: number;
  brightness: number;
  color: string;
};

const createDefaultLayerSettings = (): LayerSettings => ({
  contrast: DEFAULT_CONTRAST,
  brightness: DEFAULT_BRIGHTNESS,
  color: DEFAULT_LAYER_COLOR
});

type DatasetLayerSource = {
  id: string;
  label: string;
  files: File[];
};

function hasTiffExtension(name: string) {
  const lower = name.toLowerCase();
  return lower.endsWith('.tif') || lower.endsWith('.tiff');
}

function getFileSortKey(file: File) {
  return file.webkitRelativePath || file.name;
}

function sortVolumeFiles(files: File[]): File[] {
  return [...files].sort((a, b) =>
    getFileSortKey(a).localeCompare(getFileSortKey(b), undefined, {
      numeric: true,
      sensitivity: 'base'
    })
  );
}

function getTopLevelFolderName(file: File): string | null {
  const relative = file.webkitRelativePath;
  if (!relative) {
    return null;
  }
  const segments = relative.split('/').filter(Boolean);
  if (segments.length <= 1) {
    return null;
  }
  return segments[0] ?? null;
}

function groupFilesIntoLayers(files: File[]): File[][] {
  const groups = new Map<string | null, File[]>();
  let hasFolder = false;

  for (const file of files) {
    const folder = getTopLevelFolderName(file);
    if (folder) {
      hasFolder = true;
    }
    const key = folder ?? null;
    const existing = groups.get(key);
    if (existing) {
      existing.push(file);
    } else {
      groups.set(key, [file]);
    }
  }

  if (!hasFolder) {
    return files.length > 0 ? [files] : [];
  }

  return [...groups.entries()]
    .sort((a, b) => (a[0] ?? '').localeCompare(b[0] ?? '', undefined, { numeric: true }))
    .map(([, value]) => value);
}

function inferLayerLabel(
  files: File[],
  fallbackIndex: number,
  existingLabels: Set<string>
) {
  let baseLabel: string | null = null;
  const first = files[0];
  if (first) {
    const relative = first.webkitRelativePath;
    if (relative) {
      const segments = relative.split('/').filter(Boolean);
      if (segments.length > 1) {
        baseLabel = segments[segments.length - 2] ?? null;
      }
    }
    if (!baseLabel) {
      const nameWithoutExtension = first.name.replace(/\.[^.]+$/, '');
      baseLabel = nameWithoutExtension || null;
    }
  }

  if (!baseLabel) {
    baseLabel = `Layer ${fallbackIndex + 1}`;
  }

  let candidate = baseLabel;
  let counter = 2;
  while (existingLabels.has(candidate)) {
    candidate = `${baseLabel} (${counter})`;
    counter += 1;
  }
  return candidate;
}

function App() {
  const [layerSources, setLayerSources] = useState<DatasetLayerSource[]>([]);
  const [datasetError, setDatasetError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [layers, setLayers] = useState<LoadedLayer[]>([]);
  const [visibleLayers, setVisibleLayers] = useState<Record<string, boolean>>({});
  const [layerSettings, setLayerSettings] = useState<Record<string, LayerSettings>>({});
  const [status, setStatus] = useState<LoadState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [loadProgress, setLoadProgress] = useState(0);
  const [loadedCount, setLoadedCount] = useState(0);
  const [expectedVolumeCount, setExpectedVolumeCount] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [fps, setFps] = useState(DEFAULT_FPS);
  const [resetViewHandler, setResetViewHandler] = useState<(() => void) | null>(null);
  const [activeLayerKey, setActiveLayerKey] = useState<string | null>(null);
  const [tracks, setTracks] = useState<string[][]>([]);
  const [trackStatus, setTrackStatus] = useState<LoadState>('idle');
  const [trackError, setTrackError] = useState<string | null>(null);
  const [tracksFile, setTracksFile] = useState<File | null>(null);
  const [trackVisibility, setTrackVisibility] = useState<Record<number, boolean>>({});
  const [trackOpacity, setTrackOpacity] = useState(DEFAULT_TRACK_OPACITY);
  const [trackLineWidth, setTrackLineWidth] = useState(DEFAULT_TRACK_LINE_WIDTH);
  const [followedTrackId, setFollowedTrackId] = useState<number | null>(null);
  const [viewerMode, setViewerMode] = useState<'3d' | '2d'>('3d');
  const [sliceIndex, setSliceIndex] = useState(0);
  const [isViewerLaunched, setIsViewerLaunched] = useState(false);
  const [isLaunchingViewer, setIsLaunchingViewer] = useState(false);
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

  const loadRequestRef = useRef(0);
  const hasTrackDataRef = useRef(false);
  const trackMasterCheckboxRef = useRef<HTMLInputElement | null>(null);
  const layerIdRef = useRef(0);
  const datasetInputRef = useRef<HTMLInputElement | null>(null);
  const trackInputRef = useRef<HTMLInputElement | null>(null);
  const datasetDragCounterRef = useRef(0);
  const trackDragCounterRef = useRef(0);
  const [isDatasetDragging, setIsDatasetDragging] = useState(false);
  const [isTrackDragging, setIsTrackDragging] = useState(false);

  const volumeTimepointCount = layers.length > 0 ? layers[0].volumes.length : 0;
  const datasetShape = useMemo(() => {
    for (const layer of layers) {
      for (const volume of layer.volumes) {
        if (volume) {
          const channelLabel = volume.channels === 1 ? 'channel' : 'channels';
          return `${volume.width} × ${volume.height} × ${volume.depth} · ${volume.channels} ${channelLabel}`;
        }
      }
    }
    return null;
  }, [layers]);
  const parsedTracks = useMemo<TrackDefinition[]>(() => {
    if (tracks.length === 0) {
      return [];
    }

    const trackMap = new Map<number, TrackPoint[]>();
    let maxTimeValue = -Infinity;

    for (const row of tracks) {
      if (row.length < 6) {
        continue;
      }

      const rawId = Number(row[0]);
      const time = Number(row[2]);
      const x = Number(row[3]);
      const y = Number(row[4]);
      const z = Number(row[5]);

      if (
        !Number.isFinite(rawId) ||
        !Number.isFinite(time) ||
        !Number.isFinite(x) ||
        !Number.isFinite(y) ||
        !Number.isFinite(z)
      ) {
        continue;
      }

      const id = Math.trunc(rawId);
      if (time > maxTimeValue) {
        maxTimeValue = time;
      }

      const normalizedTime = Math.max(0, time - 1);
      const point: TrackPoint = { time: normalizedTime, x, y, z };
      const existing = trackMap.get(id);
      if (existing) {
        existing.push(point);
      } else {
        trackMap.set(id, [point]);
      }
    }

    const parsed: TrackDefinition[] = [];
    const datasetTimepointCount = Number.isFinite(maxTimeValue) ? Math.max(0, Math.trunc(maxTimeValue)) : 0;

    for (const [id, points] of trackMap.entries()) {
      if (points.length === 0) {
        continue;
      }

      const sortedPoints = [...points].sort((a, b) => a.time - b.time);
      const uniqueTimeCount = new Set(sortedPoints.map((point) => point.time)).size;
      const offset = Math.max(0, datasetTimepointCount - uniqueTimeCount);
      const adjustedPoints = sortedPoints.map<TrackPoint>((point) => ({
        time: point.time + offset,
        x: point.x,
        y: point.y,
        z: point.z
      }));
      parsed.push({ id, points: adjustedPoints });
    }

    parsed.sort((a, b) => a.id - b.id);

    return parsed;
  }, [tracks]);
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

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const trackWidth = Math.min(TRACK_WINDOW_WIDTH, window.innerWidth - WINDOW_MARGIN * 2);
    const nextX = Math.max(WINDOW_MARGIN, window.innerWidth - trackWidth - WINDOW_MARGIN);

    setTrackWindowInitialPosition((current) => {
      if (current.x === nextX && current.y === WINDOW_MARGIN) {
        return current;
      }
      return { x: nextX, y: WINDOW_MARGIN };
    });
  }, []);

  useEffect(() => {
    const previouslyHadData = hasTrackDataRef.current;
    if (!hasParsedTrackData) {
      hasTrackDataRef.current = false;
      setTrackVisibility({});
      setTrackOpacity(DEFAULT_TRACK_OPACITY);
      setTrackLineWidth(DEFAULT_TRACK_LINE_WIDTH);
      return;
    }

    if (!previouslyHadData) {
      setTrackOpacity(DEFAULT_TRACK_OPACITY);
      setTrackLineWidth(DEFAULT_TRACK_LINE_WIDTH);
    }

    hasTrackDataRef.current = true;
  }, [hasParsedTrackData]);

  useEffect(() => {
    if (parsedTracks.length === 0) {
      return;
    }

    setTrackVisibility((current) => {
      const next: Record<number, boolean> = {};
      let changed = false;

      for (const track of parsedTracks) {
        const previous = current[track.id];
        if (previous === undefined) {
          changed = true;
        }
        next[track.id] = previous ?? true;
      }

      for (const key of Object.keys(current)) {
        const numericKey = Number(key);
        if (!parsedTracks.some((track) => track.id === numericKey)) {
          changed = true;
          break;
        }
      }

      if (!changed && Object.keys(next).length === Object.keys(current).length) {
        return current;
      }

      return next;
    });
  }, [parsedTracks]);

  useEffect(() => {
    if (followedTrackId === null) {
      return;
    }

    const hasTrack = parsedTracks.some((track) => track.id === followedTrackId);
    if (!hasTrack) {
      setFollowedTrackId(null);
    }
  }, [followedTrackId, parsedTracks]);

  const loadSelectedDataset = useCallback(async () => {
    setDatasetError(null);
    if (layerSources.length === 0) {
      return false;
    }

    const requestId = loadRequestRef.current + 1;
    loadRequestRef.current = requestId;

    setStatus('loading');
    setError(null);
    clearTextureCache();
    setLayers([]);
    setVisibleLayers({});
    setLayerSettings({});
    setSelectedIndex(0);
    setIsPlaying(false);
    setLoadProgress(0);
    setLoadedCount(0);
    setExpectedVolumeCount(0);
    setActiveLayerKey(null);

    const preparedLayers = layerSources
      .map((layer, index) => ({
        key: layer.id,
        label: layer.label.trim() || `Layer ${index + 1}`,
        files: sortVolumeFiles(layer.files)
      }))
      .filter((layer) => layer.files.length > 0);

    if (preparedLayers.length === 0) {
      const message = 'Each layer must include at least one TIFF file.';
      setDatasetError(message);
      setStatus('error');
      setError(message);
      return false;
    }

    const referenceFiles = preparedLayers[0].files;
    const totalExpectedVolumes = referenceFiles.length * preparedLayers.length;
    if (totalExpectedVolumes === 0) {
      const message = 'The selected dataset does not contain any TIFF files.';
      setDatasetError(message);
      setStatus('error');
      setError(message);
      return false;
    }

    setExpectedVolumeCount(totalExpectedVolumes);

    try {
      for (const layer of preparedLayers) {
        if (layer.files.length !== referenceFiles.length) {
          throw new Error(
            `Layer "${layer.label}" has a different number of timepoints (${layer.files.length}) than the first layer (${referenceFiles.length}).`
          );
        }
      }

      let referenceShape: { width: number; height: number; depth: number } | null = null;

      const rawLayers = await Promise.all(
        preparedLayers.map(async (layer) => {
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
                  `Layer "${layer.label}" has volume dimensions ${volume.width}×${volume.height}×${volume.depth} that do not match the reference shape ${referenceShape.width}×${referenceShape.height}×${referenceShape.depth}.`
                );
              }

              setLoadedCount((current) => {
                if (loadRequestRef.current !== requestId) {
                  return current;
                }
                const next = current + 1;
                setLoadProgress(next / totalExpectedVolumes);
                return next;
              });
            }
          });
          return { layer, volumes };
        })
      );

      if (loadRequestRef.current !== requestId) {
        return false;
      }

      const normalizedLayers: LoadedLayer[] = rawLayers.map(({ layer, volumes }) => {
        const normalizationParameters = computeNormalizationParameters(volumes);
        const normalizedVolumes = volumes.map((rawVolume) => normalizeVolume(rawVolume, normalizationParameters));
        return {
          key: layer.key,
          label: layer.label,
          volumes: normalizedVolumes
        };
      });

      clearTextureCache();
      setLayers(normalizedLayers);
      setVisibleLayers(
        normalizedLayers.reduce<Record<string, boolean>>((acc, layer) => {
          acc[layer.key] = true;
          return acc;
        }, {})
      );
      setLayerSettings(
        normalizedLayers.reduce<Record<string, LayerSettings>>((acc, layer) => {
          acc[layer.key] = createDefaultLayerSettings();
          return acc;
        }, {})
      );
      setSelectedIndex(0);
      setActiveLayerKey(normalizedLayers[0]?.key ?? null);
      setStatus('loaded');
      setLoadedCount(totalExpectedVolumes);
      setLoadProgress(1);
      setDatasetError(null);
      return true;
    } catch (err) {
      if (loadRequestRef.current !== requestId) {
        return false;
      }
      console.error(err);
      setStatus('error');
      clearTextureCache();
      setLayers([]);
      setVisibleLayers({});
      setLayerSettings({});
      setSelectedIndex(0);
      setActiveLayerKey(null);
      setLoadProgress(0);
      setLoadedCount(0);
      setExpectedVolumeCount(0);
      setIsPlaying(false);
      const message = err instanceof Error ? err.message : 'Failed to load volumes.';
      setDatasetError(message);
      setError(message);
      return false;
    }
  }, [layerSources]);

  useEffect(() => {
    if (!isPlaying || volumeTimepointCount <= 1) {
      return;
    }

    const safeFps = Math.max(1, fps);
    const interval = window.setInterval(() => {
      setSelectedIndex((prev) => {
        if (volumeTimepointCount === 0) {
          return prev;
        }
        const next = (prev + 1) % volumeTimepointCount;
        return next;
      });
    }, 1000 / safeFps);

    return () => {
      window.clearInterval(interval);
    };
  }, [fps, isPlaying, volumeTimepointCount]);

  useEffect(() => {
    if (volumeTimepointCount <= 1 && isPlaying) {
      setIsPlaying(false);
    }
    if (selectedIndex >= volumeTimepointCount && volumeTimepointCount > 0) {
      setSelectedIndex(0);
    }
  }, [isPlaying, selectedIndex, volumeTimepointCount]);

  const isLoading = status === 'loading';
  const playbackDisabled = isLoading || volumeTimepointCount <= 1;
  const playbackLabel = useMemo(() => {
    if (volumeTimepointCount === 0) {
      return '0 / 0';
    }
    const currentFrame = Math.min(selectedIndex + 1, volumeTimepointCount);
    return `${currentFrame} / ${volumeTimepointCount}`;
  }, [selectedIndex, volumeTimepointCount]);

  const handleResetControls = useCallback(() => {
    setLayerSettings(
      layers.reduce<Record<string, LayerSettings>>((acc, layer) => {
        acc[layer.key] = createDefaultLayerSettings();
        return acc;
      }, {})
    );
    setFps(DEFAULT_FPS);
    setTrackOpacity(DEFAULT_TRACK_OPACITY);
    setTrackLineWidth(DEFAULT_TRACK_LINE_WIDTH);
    setTrackVisibility(
      parsedTracks.reduce<Record<number, boolean>>((acc, track) => {
        acc[track.id] = true;
        return acc;
      }, {})
    );
  }, [layers, parsedTracks]);

  const trackVisibilitySummary = useMemo(() => {
    if (parsedTracks.length === 0) {
      return { total: 0, visible: 0 };
    }
    let visible = 0;
    for (const track of parsedTracks) {
      if (trackVisibility[track.id] ?? true) {
        visible += 1;
      }
    }
    return { total: parsedTracks.length, visible };
  }, [parsedTracks, trackVisibility]);

  const allTracksChecked =
    trackVisibilitySummary.total > 0 && trackVisibilitySummary.visible === trackVisibilitySummary.total;
  const someTracksChecked =
    trackVisibilitySummary.total > 0 &&
    trackVisibilitySummary.visible > 0 &&
    trackVisibilitySummary.visible < trackVisibilitySummary.total;

  useEffect(() => {
    const checkbox = trackMasterCheckboxRef.current;
    if (!checkbox) {
      return;
    }
    checkbox.indeterminate = someTracksChecked && !allTracksChecked;
  }, [allTracksChecked, someTracksChecked]);

  const controlsAtDefaults = useMemo(() => {
    const allLayerDefaults =
      layers.length === 0 ||
      layers.every((layer) => {
        const settings = layerSettings[layer.key];
        const contrast = settings?.contrast ?? DEFAULT_CONTRAST;
        const brightness = settings?.brightness ?? DEFAULT_BRIGHTNESS;
        const color = normalizeHexColor(settings?.color, DEFAULT_LAYER_COLOR);
        const firstVolume = layer.volumes[0] ?? null;
        const isGrayscale = firstVolume?.channels === 1;
        const colorAtDefault = !isGrayscale || color === DEFAULT_LAYER_COLOR;
        return contrast === DEFAULT_CONTRAST && brightness === DEFAULT_BRIGHTNESS && colorAtDefault;
      });

    const trackVisibilityAtDefault =
      parsedTracks.length === 0 || parsedTracks.every((track) => trackVisibility[track.id] ?? true);
    const trackOpacityAtDefault = trackOpacity === DEFAULT_TRACK_OPACITY;
    const trackLineWidthAtDefault = trackLineWidth === DEFAULT_TRACK_LINE_WIDTH;

    return (
      allLayerDefaults &&
      fps === DEFAULT_FPS &&
      trackVisibilityAtDefault &&
      trackOpacityAtDefault &&
      trackLineWidthAtDefault
    );
  }, [
    fps,
    layerSettings,
    layers,
    parsedTracks,
    trackLineWidth,
    trackOpacity,
    trackVisibility
  ]);

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

  const handleDatasetFilesAdded = useCallback((incomingFiles: File[]) => {
    const tiffFiles = incomingFiles.filter((file) => hasTiffExtension(file.name));
    if (tiffFiles.length === 0) {
      setDatasetError('Please drop TIFF (.tif/.tiff) files.');
      return;
    }

    let addedAny = false;
    setLayerSources((current) => {
      const existingLabels = new Set(
        current.map((layer) => layer.label.trim()).filter((label) => label.length > 0)
      );

      const grouped = groupFilesIntoLayers(tiffFiles);
      const nextLayers: DatasetLayerSource[] = [];

      for (const group of grouped) {
        const sorted = sortVolumeFiles(group);
        if (sorted.length === 0) {
          continue;
        }
        const nextId = layerIdRef.current + 1;
        layerIdRef.current = nextId;
        const label = inferLayerLabel(sorted, current.length + nextLayers.length, existingLabels);
        existingLabels.add(label);
        nextLayers.push({
          id: `layer-${nextId}`,
          label,
          files: sorted
        });
      }

      if (nextLayers.length === 0) {
        return current;
      }

      addedAny = true;
      return [...current, ...nextLayers];
    });

    if (addedAny) {
      setDatasetError(null);
    } else {
      setDatasetError('No TIFF files detected in the dropped selection.');
    }
  }, []);

  const handleDatasetBrowse = useCallback(() => {
    datasetInputRef.current?.click();
  }, []);

  const handleDatasetInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const fileList = event.target.files;
      if (fileList && fileList.length > 0) {
        handleDatasetFilesAdded(Array.from(fileList));
      }
      event.target.value = '';
    },
    [handleDatasetFilesAdded]
  );

  const handleDatasetDragEnter = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    datasetDragCounterRef.current += 1;
    setIsDatasetDragging(true);
  }, []);

  const handleDatasetDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDatasetDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    datasetDragCounterRef.current = Math.max(0, datasetDragCounterRef.current - 1);
    if (datasetDragCounterRef.current === 0) {
      setIsDatasetDragging(false);
    }
  }, []);

  const handleDatasetDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      datasetDragCounterRef.current = 0;
      setIsDatasetDragging(false);
      const fileList = event.dataTransfer.files;
      if (!fileList || fileList.length === 0) {
        return;
      }
      handleDatasetFilesAdded(Array.from(fileList));
    },
    [handleDatasetFilesAdded]
  );

  const handleLayerLabelChange = useCallback((id: string, value: string) => {
    setLayerSources((current) => current.map((layer) => (layer.id === id ? { ...layer, label: value } : layer)));
  }, []);

  const handleLayerRemove = useCallback((id: string) => {
    setLayerSources((current) => current.filter((layer) => layer.id !== id));
    setDatasetError(null);
  }, []);

  const handleTrackFilesAdded = useCallback((files: File[]) => {
    const csvFile = files.find((file) => file.name.toLowerCase().endsWith('.csv')) ?? null;
    if (!csvFile) {
      setTracksFile(null);
      setTrackStatus('idle');
      setTrackError('Please drop a CSV file.');
      setTracks([]);
      return;
    }
    setTracksFile(csvFile);
    setTrackStatus('idle');
    setTrackError(null);
  }, []);

  const handleTrackBrowse = useCallback(() => {
    trackInputRef.current?.click();
  }, []);

  const handleTrackInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const fileList = event.target.files;
      if (fileList && fileList.length > 0) {
        handleTrackFilesAdded(Array.from(fileList));
      }
      event.target.value = '';
    },
    [handleTrackFilesAdded]
  );

  const handleTrackDragEnter = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    trackDragCounterRef.current += 1;
    setIsTrackDragging(true);
  }, []);

  const handleTrackDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleTrackDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    trackDragCounterRef.current = Math.max(0, trackDragCounterRef.current - 1);
    if (trackDragCounterRef.current === 0) {
      setIsTrackDragging(false);
    }
  }, []);

  const handleTrackDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      trackDragCounterRef.current = 0;
      setIsTrackDragging(false);
      const fileList = event.dataTransfer.files;
      if (!fileList || fileList.length === 0) {
        return;
      }
      handleTrackFilesAdded(Array.from(fileList));
    },
    [handleTrackFilesAdded]
  );

  const handleTrackClear = useCallback(() => {
    setTracksFile(null);
    setTrackStatus('idle');
    setTrackError(null);
    setTracks([]);
  }, []);

  const loadTrackData = useCallback(async (file: File | null) => {
    if (!file) {
      setTracks([]);
      setTrackStatus('idle');
      setTrackError(null);
      return true;
    }

    setTrackStatus('loading');
    setTrackError(null);

    try {
      const contents = await file.text();
      const lines = contents.split(/\r?\n/);
      const rows: string[][] = [];

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) {
          continue;
        }
        const columns = line.split(',');
        if (columns.length !== 8) {
          throw new Error('CSV file must contain exactly 8 comma-separated columns per row.');
        }
        rows.push(columns.map((value) => value.trim()));
      }

      setTracks(rows);
      setTrackStatus('loaded');
      return true;
    } catch (err) {
      console.error('Failed to load tracks CSV', err);
      setTrackError(err instanceof Error ? err.message : 'Failed to load tracks.');
      setTrackStatus('error');
      setTracks([]);
      return false;
    }
  }, []);

  const handleLaunchViewer = useCallback(async () => {
    if (isLaunchingViewer || layerSources.length === 0) {
      setDatasetError('Add at least one dataset layer to continue.');
      return;
    }

    setIsLaunchingViewer(true);
    try {
      const datasetLoaded = await loadSelectedDataset();
      if (!datasetLoaded) {
        return;
      }

      const tracksLoaded = await loadTrackData(tracksFile);
      if (!tracksLoaded) {
        return;
      }

      setIsViewerLaunched(true);
    } finally {
      setIsLaunchingViewer(false);
    }
  }, [isLaunchingViewer, layerSources.length, loadSelectedDataset, loadTrackData, tracksFile]);

  const handleLayerVisibilityToggle = useCallback((key: string) => {
    setVisibleLayers((current) => ({
      ...current,
      [key]: !current[key]
    }));
  }, []);

  const handleTrackVisibilityToggle = useCallback((trackId: number) => {
    let toggledOff = false;
    setTrackVisibility((current) => {
      const previous = current[trackId];
      const nextValue = !(previous ?? true);
      if (!nextValue) {
        toggledOff = true;
      }
      return {
        ...current,
        [trackId]: nextValue
      };
    });
    if (toggledOff) {
      setFollowedTrackId((current) => (current === trackId ? null : current));
    }
  }, []);

  const handleTrackVisibilityAllChange = useCallback(
    (isChecked: boolean) => {
      if (!isChecked) {
        setFollowedTrackId(null);
      }
      setTrackVisibility(
        parsedTracks.reduce<Record<number, boolean>>((acc, track) => {
          acc[track.id] = isChecked;
          return acc;
        }, {})
      );
    },
    [parsedTracks]
  );

  const handleTrackOpacityChange = useCallback((value: number) => {
    setTrackOpacity((current) => {
      if (current === value) {
        return current;
      }
      return value;
    });
  }, []);

  const handleTrackLineWidthChange = useCallback((value: number) => {
    setTrackLineWidth((current) => {
      if (current === value) {
        return current;
      }
      return value;
    });
  }, []);

  const ensureTrackIsVisible = useCallback((trackId: number) => {
    setTrackVisibility((current) => {
      if (current[trackId]) {
        return current;
      }
      return { ...current, [trackId]: true };
    });
  }, []);

  const handleTrackFollow = useCallback(
    (trackId: number) => {
      setFollowedTrackId((current) => (current === trackId ? null : trackId));
      ensureTrackIsVisible(trackId);
    },
    [ensureTrackIsVisible]
  );

  const handleTrackFollowFromViewer = useCallback(
    (trackId: number) => {
      setFollowedTrackId((current) => (current === trackId ? current : trackId));
      ensureTrackIsVisible(trackId);
    },
    [ensureTrackIsVisible]
  );

  const handleStopTrackFollow = useCallback(() => {
    setFollowedTrackId(null);
  }, []);

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
      setActiveLayerKey(null);
      return;
    }

    setActiveLayerKey((current) => {
      if (current && layers.some((layer) => layer.key === current)) {
        return current;
      }
      return layers[0].key;
    });
  }, [layers]);

  const handleLayerContrastChange = useCallback((key: string, value: number) => {
    setLayerSettings((current) => {
      const previous = current[key] ?? createDefaultLayerSettings();
      if (previous.contrast === value) {
        return current;
      }
      return {
        ...current,
        [key]: {
          ...previous,
          contrast: value
        }
      };
    });
  }, []);

  const handleLayerBrightnessChange = useCallback((key: string, value: number) => {
    setLayerSettings((current) => {
      const previous = current[key] ?? createDefaultLayerSettings();
      if (previous.brightness === value) {
        return current;
      }
      return {
        ...current,
        [key]: {
          ...previous,
          brightness: value
        }
      };
    });
  }, []);

  const handleLayerColorChange = useCallback((key: string, value: string) => {
    setLayerSettings((current) => {
      const previous = current[key] ?? createDefaultLayerSettings();
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
  }, []);

  const viewerLayers = useMemo(
    () =>
      layers.map((layer) => {
        const settings = layerSettings[layer.key] ?? createDefaultLayerSettings();
        return {
          key: layer.key,
          label: layer.label,
          volume: layer.volumes[selectedIndex] ?? null,
          visible: Boolean(visibleLayers[layer.key]),
          contrast: settings.contrast,
          brightness: settings.brightness,
          color: normalizeHexColor(settings.color, DEFAULT_LAYER_COLOR)
        };
      }),
    [layerSettings, layers, selectedIndex, visibleLayers]
  );

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
  const datasetLoader = (
    <div className="upload-panel">
      <div
        className={`file-drop-zone${isDatasetDragging ? ' is-active' : ''}`}
        onDragEnter={handleDatasetDragEnter}
        onDragOver={handleDatasetDragOver}
        onDragLeave={handleDatasetDragLeave}
        onDrop={handleDatasetDrop}
      >
        <input
          ref={datasetInputRef}
          className="file-drop-input"
          type="file"
          accept=".tif,.tiff"
          multiple
          onChange={handleDatasetInputChange}
        />
        <div className="file-drop-content">
          <p className="file-drop-title">Drop TIFF stacks here</p>
          <p className="file-drop-subtitle">Drop a folder or multiple TIFF files to add a layer.</p>
          <button type="button" className="file-drop-button" onClick={handleDatasetBrowse}>
            Choose files
          </button>
        </div>
      </div>
      {datasetError ? <p className="drop-error">{datasetError}</p> : null}
      {layerSources.length > 0 ? (
        <ul className="layer-upload-list">
          {layerSources.map((layer) => {
            const firstName = layer.files[0] ? getFileSortKey(layer.files[0]) : null;
            const lastName =
              layer.files.length > 1 ? getFileSortKey(layer.files[layer.files.length - 1]) : firstName;
            const preview =
              firstName && lastName && lastName !== firstName ? `${firstName} → ${lastName}` : firstName;
            return (
              <li key={layer.id} className="layer-upload-item">
                <div className="layer-upload-header">
                  <input
                    type="text"
                    value={layer.label}
                    placeholder="Layer name"
                    onChange={(event) => handleLayerLabelChange(layer.id, event.target.value)}
                    className="layer-upload-name-input"
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    className="layer-remove-button"
                    onClick={() => handleLayerRemove(layer.id)}
                    aria-label={`Remove ${layer.label}`}
                  >
                    Remove
                  </button>
                </div>
                <p className="layer-upload-meta">
                  {layer.files.length === 1 ? '1 file' : `${layer.files.length} files`}
                </p>
                {preview ? (
                  <p className="layer-upload-preview" title={preview}>
                    {preview}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="drop-placeholder">Drop TIFF folders or files to create layers.</p>
      )}
    </div>
  );

  const trackLoader = (
    <div className="upload-panel">
      <div
        className={`file-drop-zone${isTrackDragging ? ' is-active' : ''}`}
        onDragEnter={handleTrackDragEnter}
        onDragOver={handleTrackDragOver}
        onDragLeave={handleTrackDragLeave}
        onDrop={handleTrackDrop}
      >
        <input
          ref={trackInputRef}
          className="file-drop-input"
          type="file"
          accept=".csv"
          onChange={handleTrackInputChange}
        />
        <div className="file-drop-content">
          <p className="file-drop-title">Drop tracks CSV</p>
          <p className="file-drop-subtitle">Drop a CSV file or choose one from your device.</p>
          <button type="button" className="file-drop-button" onClick={handleTrackBrowse}>
            Choose file
          </button>
        </div>
      </div>
      {trackError ? <p className="drop-error">{trackError}</p> : null}
      {tracksFile ? (
        <div className="selected-file-chip">
          <span title={tracksFile.name}>{tracksFile.name}</span>
          <button type="button" onClick={handleTrackClear} aria-label="Remove tracks file">
            ×
          </button>
        </div>
      ) : (
        <p className="drop-placeholder">Tracks are optional. Drop a CSV file to include them.</p>
      )}
      {trackStatus === 'loading' ? (
        <p className="drop-status">Loading tracks…</p>
      ) : trackStatus === 'loaded' ? (
        <p className="drop-status">
          {tracks.length === 1 ? 'Loaded 1 track entry.' : `Loaded ${tracks.length} track entries.`}
        </p>
      ) : null}
    </div>
  );

  if (!isViewerLaunched) {
    return (
      <>
        <div className="front-page">
          <div className="front-page-card">
            <h1>LLSM Viewer</h1>
            <div className="front-page-widgets">
              <section className="front-page-widget">
                <header>
                  <h2>Dataset setup</h2>
                  <p>Drop TIFF stacks to create layers. Each drop becomes a new layer.</p>
                </header>
                {datasetLoader}
              </section>
              <section className="front-page-widget">
                <header>
                  <h2>Tracks</h2>
                </header>
                {trackLoader}
              </section>
            </div>
            <button
              type="button"
              className="launch-viewer-button"
              onClick={handleLaunchViewer}
              disabled={layerSources.length === 0 || isLaunchingViewer}
            >
              {isLaunchingViewer ? 'Loading...' : 'Launch viewer'}
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="app">
        <main className="viewer">
          {viewerMode === '3d' ? (
            <VolumeViewer
              layers={viewerLayers}
              isLoading={isLoading}
              loadingProgress={loadProgress}
              loadedVolumes={loadedCount}
              expectedVolumes={expectedVolumeCount}
              timeIndex={selectedIndex}
              totalTimepoints={volumeTimepointCount}
              onRegisterReset={handleRegisterReset}
              tracks={parsedTracks}
              trackVisibility={trackVisibility}
              trackOpacity={trackOpacity}
              trackLineWidth={trackLineWidth}
              followedTrackId={followedTrackId}
              onTrackFollowRequest={handleTrackFollowFromViewer}
            />
          ) : (
            <PlanarViewer
              layers={viewerLayers}
              isLoading={isLoading}
              loadingProgress={loadProgress}
              loadedVolumes={loadedCount}
              expectedVolumes={expectedVolumeCount}
              timeIndex={selectedIndex}
              totalTimepoints={volumeTimepointCount}
              onRegisterReset={handleRegisterReset}
              sliceIndex={sliceIndex}
              maxSlices={maxSliceDepth}
              onSliceIndexChange={handleSliceIndexChange}
              tracks={parsedTracks}
              trackVisibility={trackVisibility}
              trackOpacity={trackOpacity}
              trackLineWidth={trackLineWidth}
              followedTrackId={followedTrackId}
              onTrackFollowRequest={handleTrackFollowFromViewer}
            />
          )}
        </main>
        <FloatingWindow
          title="Playback controls"
          initialPosition={controlWindowInitialPosition}
          width={`min(${CONTROL_WINDOW_WIDTH}px, calc(100vw - ${WINDOW_MARGIN * 2}px))`}
        >
          <div className="sidebar sidebar-left">
            <header className="sidebar-header">
              <button type="button" className="sidebar-launcher-button" onClick={handleReturnToLauncher}>
                Return to Launcher
              </button>
            </header>

            <div className="global-controls">
              <div className="control-group">
                <div className="viewer-mode-row">
                  <button
                    type="button"
                    onClick={handleToggleViewerMode}
                    className={viewerMode === '3d' ? 'viewer-mode-button' : 'viewer-mode-button is-active'}
                  >
                    {viewerMode === '3d' ? 'Go to 2D view' : 'Go to 3D view'}
                  </button>
                  <button type="button" onClick={() => resetViewHandler?.()} disabled={!resetViewHandler}>
                    Reset view
                  </button>
                </div>
                <button type="button" onClick={handleResetControls} disabled={controlsAtDefaults}>
                  Reset controls
                </button>
              </div>
              <div className="control-group">
                <label htmlFor="fps-slider">
                  frames per second <span>{fps}</span>
                </label>
                <input
                  id="fps-slider"
                  type="range"
                  min={1}
                  max={60}
                  step={1}
                  value={fps}
                  onChange={(event) => setFps(Number(event.target.value))}
                  disabled={volumeTimepointCount <= 1}
                />
              </div>
              {viewerMode === '2d' && maxSliceDepth > 0 ? (
                <div className="control-group">
                  <label htmlFor="z-plane-slider">
                    Z plane{' '}
                    <span>
                      {Math.min(sliceIndex + 1, maxSliceDepth)} / {maxSliceDepth}
                    </span>
                  </label>
                  <input
                    id="z-plane-slider"
                    type="range"
                    min={0}
                    max={Math.max(0, maxSliceDepth - 1)}
                    value={Math.min(sliceIndex, Math.max(0, maxSliceDepth - 1))}
                    onChange={(event) => handleSliceIndexChange(Number(event.target.value))}
                    disabled={maxSliceDepth <= 1}
                  />
                </div>
              ) : null}
              <div className="playback-controls">
                <div className="playback-controls-row">
                  <button
                    type="button"
                    onClick={handleTogglePlayback}
                    disabled={playbackDisabled}
                    className={isPlaying ? 'playback-toggle playing' : 'playback-toggle'}
                    aria-label={isPlaying ? 'Pause playback' : 'Start playback'}
                  >
                    {isPlaying ? '⏸' : '▶'}
                  </button>
                  <div className="playback-slider-group">
                    <input
                      type="range"
                      min={0}
                      max={Math.max(0, volumeTimepointCount - 1)}
                      value={Math.min(selectedIndex, Math.max(0, volumeTimepointCount - 1))}
                      onChange={(event) => handleTimeIndexChange(Number(event.target.value))}
                      disabled={playbackDisabled}
                    />
                    <span className="playback-time-label">{playbackLabel}</span>
                  </div>
                </div>
              </div>
            </div>
            {error && <p className="error">{error}</p>}
          </div>
        </FloatingWindow>

        <FloatingWindow
          title="Layers"
          initialPosition={layersWindowInitialPosition}
          width={`min(${CONTROL_WINDOW_WIDTH}px, calc(100vw - ${WINDOW_MARGIN * 2}px))`}
        >
          <div className="sidebar sidebar-left">
            {layers.length > 0 ? (
              <div className="layer-controls">
                {datasetShape ? <p className="layer-dataset-shape">{datasetShape}</p> : null}
                <div className="layer-tabs" role="tablist" aria-label="Volume layers">
                  {layers.map((layer) => (
                    <button
                      key={layer.key}
                      type="button"
                      className={layer.key === activeLayerKey ? 'layer-tab is-active' : 'layer-tab'}
                      onClick={() => setActiveLayerKey(layer.key)}
                      role="tab"
                      id={`layer-tab-${layer.key}`}
                      aria-selected={layer.key === activeLayerKey}
                      aria-controls={`layer-panel-${layer.key}`}
                    >
                      {layer.label}
                    </button>
                  ))}
                </div>
                {layers.map((layer) => {
                  const isActive = layer.key === activeLayerKey;
                  const settings = layerSettings[layer.key] ?? createDefaultLayerSettings();
                  const sliderDisabled = layer.volumes.length === 0;
                  const firstVolume = layer.volumes[0] ?? null;
                  const isGrayscale = firstVolume?.channels === 1;
                  const normalizedColor = normalizeHexColor(settings.color, DEFAULT_LAYER_COLOR);
                  const displayColor = normalizedColor.toUpperCase();
                  return (
                    <div
                      key={layer.key}
                      id={`layer-panel-${layer.key}`}
                      role="tabpanel"
                      aria-labelledby={`layer-tab-${layer.key}`}
                      className={isActive ? 'layer-panel is-active' : 'layer-panel'}
                      hidden={!isActive}
                    >
                      {firstVolume ? (
                        <div className="layer-intensity" role="group" aria-label="Intensity normalization">
                          <span className="layer-intensity-label">Intensity normalization</span>
                          <span className="layer-intensity-range">
                            {firstVolume.min.toFixed(3)} – {firstVolume.max.toFixed(3)}
                          </span>
                        </div>
                      ) : null}
                      <label className="layer-visibility">
                        <input
                          type="checkbox"
                          checked={Boolean(visibleLayers[layer.key])}
                          onChange={() => handleLayerVisibilityToggle(layer.key)}
                        />
                        <span>Show layer</span>
                      </label>
                      <div className="slider-control">
                        <label htmlFor={`layer-contrast-${layer.key}`}>
                          Contrast <span>{settings.contrast.toFixed(2)}×</span>
                        </label>
                        <input
                          id={`layer-contrast-${layer.key}`}
                          type="range"
                          min={0.2}
                          max={3}
                          step={0.05}
                          value={settings.contrast}
                          onChange={(event) => handleLayerContrastChange(layer.key, Number(event.target.value))}
                          disabled={sliderDisabled}
                        />
                      </div>
                      <div className="slider-control">
                        <label htmlFor={`layer-brightness-${layer.key}`}>
                          Brightness{' '}
                          <span>
                            {settings.brightness >= 0 ? '+' : ''}
                            {settings.brightness.toFixed(2)}
                          </span>
                        </label>
                        <input
                          id={`layer-brightness-${layer.key}`}
                          type="range"
                          min={-0.5}
                          max={0.5}
                          step={0.01}
                          value={settings.brightness}
                          onChange={(event) => handleLayerBrightnessChange(layer.key, Number(event.target.value))}
                          disabled={sliderDisabled}
                        />
                      </div>
                      {isGrayscale ? (
                        <div className="color-control">
                          <div className="color-control-header">
                            <span id={`layer-color-label-${layer.key}`}>Tint color</span>
                            <span>{displayColor}</span>
                          </div>
                          <div
                            className="color-swatch-grid"
                            role="group"
                            aria-labelledby={`layer-color-label-${layer.key}`}
                          >
                            {GRAYSCALE_COLOR_SWATCHES.map((swatch) => {
                              const swatchColor = normalizeHexColor(swatch.value, DEFAULT_LAYER_COLOR);
                              const isSelected = swatchColor === normalizedColor;
                              return (
                                <button
                                  key={swatch.value}
                                  type="button"
                                  className={
                                    isSelected ? 'color-swatch-button is-selected' : 'color-swatch-button'
                                  }
                                  style={{ backgroundColor: swatch.value }}
                                  onClick={() => handleLayerColorChange(layer.key, swatch.value)}
                                  disabled={sliderDisabled}
                                  aria-pressed={isSelected}
                                  aria-label={`${swatch.label} tint`}
                                  title={swatch.label}
                                />
                              );
                            })}
                          </div>
                          <label className="color-picker" htmlFor={`layer-color-custom-${layer.key}`}>
                            <span>Custom</span>
                            <input
                              id={`layer-color-custom-${layer.key}`}
                              type="color"
                              value={normalizedColor}
                              onChange={(event) => handleLayerColorChange(layer.key, event.target.value)}
                              disabled={sliderDisabled}
                              aria-label="Choose custom tint color"
                            />
                          </label>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="empty-layer-hint">Load a volume to configure layer properties.</p>
            )}
          </div>
        </FloatingWindow>

        <FloatingWindow
          title="Tracks"
          initialPosition={trackWindowInitialPosition}
          width={`min(${TRACK_WINDOW_WIDTH}px, calc(100vw - ${WINDOW_MARGIN * 2}px))`}
        >
          <div className="sidebar sidebar-right">
            <div className="track-controls">
              <div className="control-group">
                <button
                  type="button"
                  onClick={handleStopTrackFollow}
                  disabled={followedTrackId === null}
                  className="viewer-stop-tracking"
                >
                  Stop tracking
                </button>
              </div>
              <div className="slider-control">
                <label htmlFor="track-opacity-slider">
                  Opacity <span>{Math.round(trackOpacity * 100)}%</span>
                </label>
                <input
                  id="track-opacity-slider"
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={trackOpacity}
                  onChange={(event) => handleTrackOpacityChange(Number(event.target.value))}
                  disabled={parsedTracks.length === 0}
                />
              </div>
              <div className="slider-control">
                <label htmlFor="track-linewidth-slider">
                  Thickness <span>{trackLineWidth.toFixed(1)}</span>
                </label>
                <input
                  id="track-linewidth-slider"
                  type="range"
                  min={0.5}
                  max={5}
                  step={0.1}
                  value={trackLineWidth}
                  onChange={(event) => handleTrackLineWidthChange(Number(event.target.value))}
                  disabled={parsedTracks.length === 0}
                />
              </div>
              <div className="track-list-header">
                <label className="track-master-toggle">
                  <input
                    ref={trackMasterCheckboxRef}
                    type="checkbox"
                    checked={parsedTracks.length > 0 && allTracksChecked}
                    onChange={(event) => handleTrackVisibilityAllChange(event.target.checked)}
                    disabled={parsedTracks.length === 0}
                  />
                  <span>Show all tracks</span>
                </label>
              </div>
              {parsedTracks.length > 0 ? (
                <div className="track-list" role="group" aria-label="Track visibility">
                  {parsedTracks.map((track, index) => {
                    const isFollowed = followedTrackId === track.id;
                    const isChecked = isFollowed || (trackVisibility[track.id] ?? true);
                    const trackColor = getTrackColorHex(track.id);
                    return (
                      <div
                        key={track.id}
                        className={isFollowed ? 'track-item is-following' : 'track-item'}
                        title={`Track ID ${track.id}`}
                      >
                        <label className="track-toggle">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleTrackVisibilityToggle(track.id)}
                          />
                          <span className="track-label">
                            <span
                              className="track-color-swatch"
                              style={{ backgroundColor: trackColor }}
                              aria-hidden="true"
                            />
                            <span className="track-name">Track #{index + 1}</span>
                          </span>
                        </label>
                        <button
                          type="button"
                          className={isFollowed ? 'track-follow-button is-active' : 'track-follow-button'}
                          onClick={() => handleTrackFollow(track.id)}
                          aria-pressed={isFollowed}
                        >
                          {isFollowed ? 'Following' : 'Follow'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="track-empty-hint">Load a tracks file to toggle individual trajectories.</p>
              )}
            </div>
          </div>
      </FloatingWindow>
      </div>
    </>
  );
}

export default App;
