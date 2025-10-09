import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { browseDirectory, listTiffFiles, loadTracks, loadVolume, type VolumePayload } from './api';
import VolumeViewer from './components/VolumeViewer';
import { computeNormalizationParameters, normalizeVolume, NormalizedVolume } from './volumeProcessing';
import { clearTextureCache } from './textureCache';
import DirectoryPickerDialog from './components/DirectoryPickerDialog';
import FilePickerDialog from './components/FilePickerDialog';
import type { TrackDefinition, TrackPoint } from './types/tracks';
import { DEFAULT_LAYER_COLOR, GRAYSCALE_COLOR_SWATCHES, normalizeHexColor } from './layerColors';
import './App.css';

const DEFAULT_CONTRAST = 1;
const DEFAULT_BRIGHTNESS = 0;
const DEFAULT_FPS = 12;
const DEFAULT_TRACK_OPACITY = 0.9;
const DEFAULT_TRACK_LINE_WIDTH = 1;

type LoadState = 'idle' | 'loading' | 'loaded' | 'error';

type LayerTarget = {
  key: string;
  label: string;
  directory: string;
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

function joinPath(base: string, segment: string) {
  if (!base) {
    return segment;
  }
  if (base.endsWith('/')) {
    return `${base}${segment}`;
  }
  return `${base}/${segment}`;
}

function App() {
  const [path, setPath] = useState('');
  const [files, setFiles] = useState<string[]>([]);
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
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isTrackPickerOpen, setIsTrackPickerOpen] = useState(false);
  const [subfolderSummary, setSubfolderSummary] = useState<{
    rootHasTiffs: boolean;
    subfolders: string[];
  } | null>(null);
  const [subfolderChecks, setSubfolderChecks] = useState<Record<string, boolean>>({});
  const [subfolderLoading, setSubfolderLoading] = useState(false);
  const [subfolderError, setSubfolderError] = useState<string | null>(null);
  const [activeLayerKey, setActiveLayerKey] = useState<string | null>(null);
  const [trackPath, setTrackPath] = useState('');
  const [tracks, setTracks] = useState<string[][]>([]);
  const [trackStatus, setTrackStatus] = useState<LoadState>('idle');
  const [trackError, setTrackError] = useState<string | null>(null);
  const [showTrackOverlay, setShowTrackOverlay] = useState(false);
  const [trackVisibility, setTrackVisibility] = useState<Record<number, boolean>>({});
  const [trackOpacity, setTrackOpacity] = useState(DEFAULT_TRACK_OPACITY);
  const [trackLineWidth, setTrackLineWidth] = useState(DEFAULT_TRACK_LINE_WIDTH);

  const loadRequestRef = useRef(0);
  const subfolderRequestRef = useRef(0);
  const hasTrackDataRef = useRef(false);
  const trackMasterCheckboxRef = useRef<HTMLInputElement | null>(null);

  const selectedFile = useMemo(() => files[selectedIndex] ?? null, [files, selectedIndex]);
  const timepointCount = layers.length > 0 ? layers[0].volumes.length : 0;
  const parsedTracks = useMemo<TrackDefinition[]>(() => {
    if (tracks.length === 0) {
      return [];
    }

    const trackMap = new Map<number, TrackPoint[]>();

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
      const point: TrackPoint = { time, x, y, z };
      const existing = trackMap.get(id);
      if (existing) {
        existing.push(point);
      } else {
        trackMap.set(id, [point]);
      }
    }

    const parsed: TrackDefinition[] = [];

    for (const [id, points] of trackMap.entries()) {
      const sortedPoints = [...points].sort((a, b) => a.time - b.time);
      parsed.push({ id, points: sortedPoints });
    }

    parsed.sort((a, b) => a.id - b.id);

    return parsed;
  }, [tracks]);
  const hasParsedTrackData = parsedTracks.length > 0;

  const handleRegisterReset = useCallback((handler: (() => void) | null) => {
    setResetViewHandler(() => handler);
  }, []);

  useEffect(() => {
    const previouslyHadData = hasTrackDataRef.current;
    if (!hasParsedTrackData) {
      hasTrackDataRef.current = false;
      setShowTrackOverlay(false);
      setTrackVisibility({});
      setTrackOpacity(DEFAULT_TRACK_OPACITY);
      setTrackLineWidth(DEFAULT_TRACK_LINE_WIDTH);
      return;
    }

    if (!previouslyHadData) {
      setShowTrackOverlay(true);
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

  const refreshSubfolderSummary = useCallback(
    async (targetPath: string) => {
      const trimmed = targetPath.trim();
      if (!trimmed) {
        setSubfolderSummary(null);
        setSubfolderChecks({});
        setSubfolderError(null);
        setSubfolderLoading(false);
        return;
      }

      const requestId = subfolderRequestRef.current + 1;
      subfolderRequestRef.current = requestId;
      setSubfolderLoading(true);
      setSubfolderError(null);

      try {
        const listing = await browseDirectory(trimmed);
        if (subfolderRequestRef.current !== requestId) {
          return;
        }

        const rootHasTiffs = Boolean(listing.rootHasTiffs);
        const subfolders = [...(listing.tiffSubdirectories ?? [])];

        setSubfolderSummary({ rootHasTiffs, subfolders });
        setSubfolderChecks(() => {
          const initial: Record<string, boolean> = {};
          if (rootHasTiffs) {
            initial.root = false;
          }
          for (const name of subfolders) {
            initial[name] = false;
          }
          return initial;
        });
      } catch (error) {
        if (subfolderRequestRef.current !== requestId) {
          return;
        }
        console.error('Failed to summarize subfolders', error);
        setSubfolderSummary(null);
        setSubfolderChecks({});
        setSubfolderError(error instanceof Error ? error.message : 'Failed to analyze folder.');
      } finally {
        if (subfolderRequestRef.current === requestId) {
          setSubfolderLoading(false);
        }
      }
    },
    []
  );

  const handlePathSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const trimmed = path.trim();
      if (!trimmed) {
        return;
      }

      const requestId = loadRequestRef.current + 1;
      loadRequestRef.current = requestId;

      setStatus('loading');
      setError(null);
      setFiles([]);
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
      try {
        const explicitTargets: LayerTarget[] = (() => {
          if (!subfolderSummary) {
            return [
              {
                key: 'root',
                label: 'root',
                directory: trimmed
              }
            ];
          }

          const selectedEntries = Object.entries(subfolderChecks).filter(([, checked]) => checked);
          if (selectedEntries.length === 0) {
            throw new Error('Select at least one layer to load.');
          }

          return selectedEntries.map(([key]) => ({
            key,
            label: key === 'root' ? 'root' : key,
            directory: key === 'root' ? trimmed : joinPath(trimmed, key)
          }));
        })();

        const layerFileLists = await Promise.all(
          explicitTargets.map(async (target) => {
            const filesForLayer = await listTiffFiles(target.directory);
            return { target, files: filesForLayer };
          })
        );

        if (loadRequestRef.current !== requestId) {
          return;
        }

        if (layerFileLists.length === 0) {
          setStatus('loaded');
          setLoadProgress(1);
          return;
        }

        const referenceFiles = layerFileLists[0].files;
        if (referenceFiles.length === 0) {
          setFiles([]);
          setStatus('loaded');
          setLoadProgress(1);
          return;
        }

        const totalExpectedVolumes = referenceFiles.length * layerFileLists.length;
        setExpectedVolumeCount(totalExpectedVolumes);

        for (const { files: candidateFiles, target } of layerFileLists) {
          if (candidateFiles.length !== referenceFiles.length) {
            throw new Error(
              `Layer "${target.label}" has a different number of timepoints (${candidateFiles.length}) than the reference layer (${referenceFiles.length}).`
            );
          }
        }

        const rawLayers: { target: LayerTarget; files: string[]; volumes: VolumePayload[] }[] = layerFileLists.map(
          ({ target, files }) => ({ target, files, volumes: new Array<VolumePayload>(referenceFiles.length) })
        );

        let referenceShape: { width: number; height: number; depth: number } | null = null;

        await Promise.all(
          rawLayers.map(async ({ target, files, volumes }) => {
            await Promise.all(
              files.map(async (filename, index) => {
                const rawVolume = await loadVolume(target.directory, filename);
                if (loadRequestRef.current !== requestId) {
                  return;
                }

                if (!referenceShape) {
                  referenceShape = {
                    width: rawVolume.width,
                    height: rawVolume.height,
                    depth: rawVolume.depth
                  };
                } else if (
                  rawVolume.width !== referenceShape.width ||
                  rawVolume.height !== referenceShape.height ||
                  rawVolume.depth !== referenceShape.depth
                ) {
                  throw new Error(
                    `Layer "${target.label}" has volume dimensions ${rawVolume.width}×${rawVolume.height}×${rawVolume.depth} that do not match the reference shape ${referenceShape.width}×${referenceShape.height}×${referenceShape.depth}.`
                  );
                }

                volumes[index] = rawVolume;
                setLoadedCount((current) => {
                  if (loadRequestRef.current !== requestId) {
                    return current;
                  }
                  const next = current + 1;
                  setLoadProgress(next / totalExpectedVolumes);
                  return next;
                });
              })
            );
          })
        );

        if (loadRequestRef.current !== requestId) {
          return;
        }

        const normalizedLayers: LoadedLayer[] = rawLayers.map(({ target, volumes }) => {
          const normalizationParameters = computeNormalizationParameters(volumes);
          const normalizedVolumes = volumes.map((rawVolume) => normalizeVolume(rawVolume, normalizationParameters));
          return {
            ...target,
            volumes: normalizedVolumes
          };
        });

        clearTextureCache();
        setFiles(referenceFiles);
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
      } catch (err) {
        if (loadRequestRef.current !== requestId) {
          return;
        }
        console.error(err);
        setStatus('error');
        setFiles([]);
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
        setError(err instanceof Error ? err.message : 'Failed to load volumes.');
      }
    },
    [path, subfolderChecks, subfolderSummary]
  );

  useEffect(() => {
    if (!isPlaying || timepointCount <= 1) {
      return;
    }

    const safeFps = Math.max(1, fps);
    const interval = window.setInterval(() => {
      setSelectedIndex((prev) => {
        if (timepointCount === 0) {
          return prev;
        }
        const next = (prev + 1) % timepointCount;
        return next;
      });
    }, 1000 / safeFps);

    return () => {
      window.clearInterval(interval);
    };
  }, [fps, isPlaying, timepointCount]);

  useEffect(() => {
    if (timepointCount <= 1 && isPlaying) {
      setIsPlaying(false);
    }
    if (selectedIndex >= timepointCount && timepointCount > 0) {
      setSelectedIndex(0);
    }
  }, [isPlaying, selectedIndex, timepointCount]);

  const isLoading = status === 'loading';

  const handleResetControls = useCallback(() => {
    setLayerSettings(
      layers.reduce<Record<string, LayerSettings>>((acc, layer) => {
        acc[layer.key] = createDefaultLayerSettings();
        return acc;
      }, {})
    );
    setFps(DEFAULT_FPS);
    setShowTrackOverlay(hasParsedTrackData);
    setTrackOpacity(DEFAULT_TRACK_OPACITY);
    setTrackLineWidth(DEFAULT_TRACK_LINE_WIDTH);
    setTrackVisibility(
      parsedTracks.reduce<Record<number, boolean>>((acc, track) => {
        acc[track.id] = true;
        return acc;
      }, {})
    );
  }, [hasParsedTrackData, layers, parsedTracks]);

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

    const overlayDefault = hasParsedTrackData;
    const overlayAtDefault = showTrackOverlay === overlayDefault;

    const trackVisibilityAtDefault =
      parsedTracks.length === 0 || parsedTracks.every((track) => trackVisibility[track.id] ?? true);
    const trackOpacityAtDefault = trackOpacity === DEFAULT_TRACK_OPACITY;
    const trackLineWidthAtDefault = trackLineWidth === DEFAULT_TRACK_LINE_WIDTH;

    return (
      allLayerDefaults &&
      fps === DEFAULT_FPS &&
      overlayAtDefault &&
      trackVisibilityAtDefault &&
      trackOpacityAtDefault &&
      trackLineWidthAtDefault
    );
  }, [
    fps,
    hasParsedTrackData,
    layerSettings,
    layers,
    parsedTracks,
    showTrackOverlay,
    trackLineWidth,
    trackOpacity,
    trackVisibility
  ]);

  const handleTogglePlayback = useCallback(() => {
    setIsPlaying((current) => {
      if (!current && timepointCount <= 1) {
        return current;
      }
      return !current;
    });
  }, [timepointCount]);

  const handleTimeIndexChange = useCallback(
    (nextIndex: number) => {
      setSelectedIndex((prev) => {
        if (timepointCount === 0) {
          return prev;
        }
        const clamped = Math.max(0, Math.min(timepointCount - 1, nextIndex));
        return clamped;
      });
    },
    [timepointCount]
  );

  const handleOpenPicker = useCallback(() => {
    setIsPickerOpen(true);
  }, []);

  const handleClosePicker = useCallback(() => {
    setIsPickerOpen(false);
  }, []);

  const handleOpenTrackPicker = useCallback(() => {
    setIsTrackPickerOpen(true);
  }, []);

  const handleCloseTrackPicker = useCallback(() => {
    setIsTrackPickerOpen(false);
  }, []);

  const handlePathChange = useCallback((nextPath: string) => {
    setPath(nextPath);
    subfolderRequestRef.current += 1;
    setSubfolderSummary(null);
    setSubfolderChecks({});
    setSubfolderError(null);
    setSubfolderLoading(false);
  }, []);

  const handlePathPicked = useCallback(
    (selectedPath: string) => {
      handlePathChange(selectedPath);
      setIsPickerOpen(false);
      refreshSubfolderSummary(selectedPath).catch(() => {
        // Error handled inside refreshSubfolderSummary
      });
    },
    [handlePathChange, refreshSubfolderSummary]
  );

  const handleTrackPathChange = useCallback((nextPath: string) => {
    setTrackPath(nextPath);
    setTrackStatus('idle');
    setTrackError(null);
  }, []);

  const handleTrackPathPicked = useCallback((selectedPath: string) => {
    setTrackPath(selectedPath);
    setIsTrackPickerOpen(false);
    setTrackStatus('idle');
    setTrackError(null);
  }, []);

  const handleTrackSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const trimmed = trackPath.trim();
      if (!trimmed) {
        return;
      }

      setTrackStatus('loading');
      setTrackError(null);

      try {
        const rows = await loadTracks(trimmed);
        setTracks(rows);
        setTrackStatus('loaded');
      } catch (err) {
        console.error('Failed to load tracks CSV', err);
        setTrackError(err instanceof Error ? err.message : 'Failed to load tracks.');
        setTrackStatus('error');
        setTracks([]);
      }
    },
    [loadTracks, trackPath]
  );

  const handleSubfolderToggle = useCallback((name: string) => {
    setSubfolderChecks((current) => ({
      ...current,
      [name]: !current[name]
    }));
  }, []);

  const handleLayerVisibilityToggle = useCallback((key: string) => {
    setVisibleLayers((current) => ({
      ...current,
      [key]: !current[key]
    }));
  }, []);

  const handleTrackVisibilityToggle = useCallback((trackId: number) => {
    setTrackVisibility((current) => {
      const previous = current[trackId];
      const nextValue = !(previous ?? true);
      return {
        ...current,
        [trackId]: nextValue
      };
    });
  }, []);

  const handleTrackVisibilityAllChange = useCallback(
    (isChecked: boolean) => {
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

  const subfolderItems = useMemo(() => {
    if (!subfolderSummary) {
      return [];
    }
    const items: { key: string; label: string }[] = [];
    if (subfolderSummary.rootHasTiffs) {
      items.push({ key: 'root', label: 'root' });
    }
    for (const name of subfolderSummary.subfolders) {
      items.push({ key: name, label: name });
    }
    return items;
  }, [subfolderSummary]);

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

  const hasExplicitLayerSelection = useMemo(() => {
    if (!subfolderSummary) {
      return true;
    }
    return Object.values(subfolderChecks).some(Boolean);
  }, [subfolderChecks, subfolderSummary]);

  return (
    <div className="app">
      <aside className="sidebar sidebar-left">
        <header>
          <h1>LLSM Viewer</h1>
          <p>Load 4D microscopy data by entering the path to a TIFF stack directory.</p>
        </header>

        <form onSubmit={handlePathSubmit} className="path-form">
          <label htmlFor="path-input">Dataset folder</label>
          <div className="path-input-wrapper">
            <input
              id="path-input"
              type="text"
              value={path}
              placeholder="/nfs/scratch2/..."
              onChange={(event) => handlePathChange(event.target.value)}
              autoComplete="off"
            />
            <button
              type="button"
              className="path-browse-button"
              onClick={handleOpenPicker}
              aria-label="Browse for dataset folder"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path
                  d="M3 6.75A1.75 1.75 0 0 1 4.75 5h4.19c.46 0 .9.18 1.23.5l1.32 1.29H19.5A1.5 1.5 0 0 1 21 8.29v8.96A1.75 1.75 0 0 1 19.25 19H4.75A1.75 1.75 0 0 1 3 17.25Z"
                  fill="currentColor"
                />
              </svg>
            </button>
          </div>
          {subfolderLoading ? (
            <p className="subfolder-status">Checking for .tif files…</p>
          ) : subfolderError ? (
            <p className="subfolder-error">{subfolderError}</p>
          ) : subfolderSummary ? (
            subfolderItems.length > 0 ? (
              <div className="subfolder-list">
                {subfolderItems.map((item, index) => (
                  <label key={item.key} className={index === 0 ? 'subfolder-item root' : 'subfolder-item'}>
                    <input
                      type="checkbox"
                      checked={Boolean(subfolderChecks[item.key])}
                      onChange={() => handleSubfolderToggle(item.key)}
                    />
                    <span>{item.label}</span>
                  </label>
                ))}
              </div>
          ) : (
              <p className="subfolder-status">no .tif files detected</p>
            )
          ) : null}
          {subfolderSummary && !hasExplicitLayerSelection ? (
            <p className="subfolder-warning">Select at least one layer to enable loading.</p>
          ) : null}
          <button type="submit" disabled={!path.trim() || isLoading || !hasExplicitLayerSelection}>
            Load dataset
          </button>
        </form>

        {layers.length > 0 ? (
          <section className="sidebar-panel layer-controls">
            <header>
              <h2>Layers</h2>
            </header>
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
          </section>
        ) : null}

        <section className="sidebar-panel view-controls">
          <header>
            <h2>View controls</h2>
          </header>
          <div className="control-group">
            <button type="button" onClick={() => resetViewHandler?.()} disabled={!resetViewHandler}>
              Reset view
            </button>
            <button type="button" onClick={handleResetControls} disabled={controlsAtDefaults}>
              Reset controls
            </button>
          </div>
          <div className="control-group">
            <label htmlFor="fps-slider">
              FPS <span>{fps}</span>
            </label>
            <input
              id="fps-slider"
              type="range"
              min={1}
              max={60}
              step={1}
              value={fps}
              onChange={(event) => setFps(Number(event.target.value))}
              disabled={timepointCount <= 1}
            />
          </div>
        </section>

        {error && <p className="error">{error}</p>}
      </aside>

      <main className="viewer">
        <VolumeViewer
          layers={viewerLayers}
          filename={selectedFile}
          isLoading={isLoading}
          loadingProgress={loadProgress}
          loadedVolumes={loadedCount}
          expectedVolumes={expectedVolumeCount}
          timeIndex={selectedIndex}
          totalTimepoints={timepointCount}
          isPlaying={isPlaying}
          onTogglePlayback={handleTogglePlayback}
          onTimeIndexChange={handleTimeIndexChange}
          onRegisterReset={handleRegisterReset}
          tracks={parsedTracks}
          showTrackOverlay={showTrackOverlay}
          trackVisibility={trackVisibility}
          trackOpacity={trackOpacity}
          trackLineWidth={trackLineWidth}
        />
      </main>
      <aside className="sidebar sidebar-right">
        <header>
          <h2>Tracking</h2>
          <p>Load track data and configure how trajectories appear in the viewer.</p>
        </header>

        <form onSubmit={handleTrackSubmit} className="path-form">
          <label htmlFor="tracks-input">Tracks file</label>
          <div className="path-input-wrapper">
            <input
              id="tracks-input"
              type="text"
              value={trackPath}
              placeholder="/nfs/scratch2/.../tracks.csv"
              onChange={(event) => handleTrackPathChange(event.target.value)}
              autoComplete="off"
            />
            <button
              type="button"
              className="path-browse-button"
              onClick={handleOpenTrackPicker}
              aria-label="Browse for tracks file"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path
                  d="M6 2a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8.83a2 2 0 0 0-.59-1.41l-4.83-4.83A2 2 0 0 0 13.17 2Zm6 2.41L17.59 8H13a1 1 0 0 1-1-1Z"
                  fill="currentColor"
                />
              </svg>
            </button>
          </div>
          {trackStatus === 'loading' ? (
            <p className="subfolder-status">Loading tracks…</p>
          ) : trackError ? (
            <p className="subfolder-error">{trackError}</p>
          ) : trackStatus === 'loaded' ? (
            <p className="subfolder-status">
              {tracks.length === 1 ? 'Loaded 1 track entry.' : `Loaded ${tracks.length} track entries.`}
            </p>
          ) : null}
          <button type="submit" disabled={!trackPath.trim() || trackStatus === 'loading'}>
            Load tracks
          </button>
        </form>

        <section className="sidebar-panel track-controls">
          <header>
            <h2>Overlay controls</h2>
          </header>
          <div className="control-group">
            <label className="track-overlay-toggle">
              <span>Show tracking overlay</span>
              <input
                type="checkbox"
                checked={showTrackOverlay}
                onChange={(event) => setShowTrackOverlay(event.target.checked)}
                disabled={!hasParsedTrackData}
              />
            </label>
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
                const isChecked = trackVisibility[track.id] ?? true;
                return (
                  <label key={track.id} className="track-item" title={`Track ID ${track.id}`}>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => handleTrackVisibilityToggle(track.id)}
                    />
                    <span>Track #{index + 1}</span>
                  </label>
                );
              })}
            </div>
          ) : (
            <p className="track-empty-hint">Load a tracks file to toggle individual trajectories.</p>
          )}
        </section>
      </aside>
      {isPickerOpen ? (
        <DirectoryPickerDialog
          initialPath={path}
          onClose={handleClosePicker}
          onSelect={handlePathPicked}
        />
      ) : null}
      {isTrackPickerOpen ? (
        <FilePickerDialog
          initialPath={trackPath}
          onClose={handleCloseTrackPicker}
          onSelect={handleTrackPathPicked}
        />
      ) : null}
    </div>
  );
}

export default App;
