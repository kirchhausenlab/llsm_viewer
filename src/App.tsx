import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { browseDirectory, listTiffFiles, loadVolume, type VolumePayload } from './api';
import VolumeViewer from './components/VolumeViewer';
import { computeNormalizationParameters, normalizeVolume, NormalizedVolume } from './volumeProcessing';
import { clearTextureCache } from './textureCache';
import './App.css';
import DirectoryPickerDialog from './components/DirectoryPickerDialog';

const DEFAULT_CONTRAST = 1;
const DEFAULT_BRIGHTNESS = 0;
const DEFAULT_FPS = 12;

type LoadState = 'idle' | 'loading' | 'loaded' | 'error';

function App() {
  const [path, setPath] = useState('');
  const [files, setFiles] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [volumes, setVolumes] = useState<NormalizedVolume[]>([]);
  const [status, setStatus] = useState<LoadState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [loadProgress, setLoadProgress] = useState(0);
  const [loadedCount, setLoadedCount] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [contrast, setContrast] = useState(DEFAULT_CONTRAST);
  const [brightness, setBrightness] = useState(DEFAULT_BRIGHTNESS);
  const [fps, setFps] = useState(DEFAULT_FPS);
  const [resetViewHandler, setResetViewHandler] = useState<(() => void) | null>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [subfolderSummary, setSubfolderSummary] = useState<{
    rootHasTiffs: boolean;
    subfolders: string[];
  } | null>(null);
  const [subfolderChecks, setSubfolderChecks] = useState<Record<string, boolean>>({});
  const [subfolderLoading, setSubfolderLoading] = useState(false);
  const [subfolderError, setSubfolderError] = useState<string | null>(null);

  const loadRequestRef = useRef(0);
  const subfolderRequestRef = useRef(0);

  const selectedFile = useMemo(() => files[selectedIndex] ?? null, [files, selectedIndex]);
  const hasVolume = volumes.length > 0;

  const handleRegisterReset = useCallback((handler: (() => void) | null) => {
    setResetViewHandler(() => handler);
  }, []);

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
      setVolumes([]);
      setSelectedIndex(0);
      setIsPlaying(false);
      setLoadProgress(0);
      setLoadedCount(0);
      try {
        const discovered = await listTiffFiles(trimmed);
        if (loadRequestRef.current !== requestId) {
          return;
        }
        setFiles(discovered);
        setSelectedIndex(0);
        const total = discovered.length;

        if (total === 0) {
          setStatus('loaded');
          setLoadProgress(1);
          return;
        }

        const rawVolumes: VolumePayload[] = new Array(total);
        await Promise.all(
          discovered.map(async (filename, index) => {
            const rawVolume = await loadVolume(trimmed, filename);
            if (loadRequestRef.current !== requestId) {
              return;
            }
            rawVolumes[index] = rawVolume;
            setLoadedCount((current) => {
              if (loadRequestRef.current !== requestId) {
                return current;
              }
              const next = current + 1;
              setLoadProgress(next / total);
              return next;
            });
          })
        );

        if (loadRequestRef.current !== requestId) {
          return;
        }

        const normalizationParameters = computeNormalizationParameters(rawVolumes);
        const loadedVolumes: NormalizedVolume[] = rawVolumes.map((rawVolume) =>
          normalizeVolume(rawVolume, normalizationParameters)
        );

        clearTextureCache();
        setVolumes(loadedVolumes);
        setStatus('loaded');
        setLoadedCount(total);
        setLoadProgress(1);
      } catch (err) {
        if (loadRequestRef.current !== requestId) {
          return;
        }
        console.error(err);
        setStatus('error');
        setFiles([]);
        clearTextureCache();
        setVolumes([]);
        setSelectedIndex(0);
        setLoadProgress(0);
        setLoadedCount(0);
        setIsPlaying(false);
        setError(err instanceof Error ? err.message : 'Failed to load volumes.');
      }
    },
    [path]
  );

  useEffect(() => {
    if (!isPlaying || volumes.length <= 1) {
      return;
    }

    const safeFps = Math.max(1, fps);
    const interval = window.setInterval(() => {
      setSelectedIndex((prev) => {
        if (volumes.length === 0) {
          return prev;
        }
        const next = (prev + 1) % volumes.length;
        return next;
      });
    }, 1000 / safeFps);

    return () => {
      window.clearInterval(interval);
    };
  }, [fps, isPlaying, volumes.length]);

  useEffect(() => {
    if (volumes.length <= 1 && isPlaying) {
      setIsPlaying(false);
    }
    if (selectedIndex >= volumes.length && volumes.length > 0) {
      setSelectedIndex(0);
    }
  }, [isPlaying, selectedIndex, volumes.length]);

  const isLoading = status === 'loading';

  const handleResetControls = useCallback(() => {
    setContrast(DEFAULT_CONTRAST);
    setBrightness(DEFAULT_BRIGHTNESS);
    setFps(DEFAULT_FPS);
  }, []);

  const controlsAtDefaults =
    contrast === DEFAULT_CONTRAST && brightness === DEFAULT_BRIGHTNESS && fps === DEFAULT_FPS;

  const handleTogglePlayback = useCallback(() => {
    setIsPlaying((current) => {
      if (!current && volumes.length <= 1) {
        return current;
      }
      return !current;
    });
  }, [volumes.length]);

  const handleTimeIndexChange = useCallback(
    (nextIndex: number) => {
      setSelectedIndex((prev) => {
        if (volumes.length === 0) {
          return prev;
        }
        const clamped = Math.max(0, Math.min(volumes.length - 1, nextIndex));
        return clamped;
      });
    },
    [volumes.length]
  );

  const handleOpenPicker = useCallback(() => {
    setIsPickerOpen(true);
  }, []);

  const handleClosePicker = useCallback(() => {
    setIsPickerOpen(false);
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

  const handleSubfolderToggle = useCallback((name: string) => {
    setSubfolderChecks((current) => ({
      ...current,
      [name]: !current[name]
    }));
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

  return (
    <div className="app">
      <aside className="sidebar">
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
          <button type="submit" disabled={!path.trim() || isLoading}>
            Load dataset
          </button>
        </form>

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
            <label htmlFor="contrast-slider">
              Contrast <span>{contrast.toFixed(2)}×</span>
            </label>
            <input
              id="contrast-slider"
              type="range"
              min={0.2}
              max={3}
              step={0.05}
              value={contrast}
              onChange={(event) => setContrast(Number(event.target.value))}
              disabled={!hasVolume}
            />
          </div>
          <div className="control-group">
            <label htmlFor="brightness-slider">
              Brightness <span>{brightness >= 0 ? '+' : ''}{brightness.toFixed(2)}</span>
            </label>
            <input
              id="brightness-slider"
              type="range"
              min={-0.5}
              max={0.5}
              step={0.01}
              value={brightness}
              onChange={(event) => setBrightness(Number(event.target.value))}
              disabled={!hasVolume}
            />
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
              disabled={volumes.length <= 1}
            />
          </div>
        </section>

        {error && <p className="error">{error}</p>}
      </aside>

      <main className="viewer">
        <VolumeViewer
          volume={volumes[selectedIndex] ?? null}
          filename={selectedFile}
          isLoading={isLoading}
          loadingProgress={loadProgress}
          loadedTimepoints={loadedCount}
          timeIndex={selectedIndex}
          totalTimepoints={volumes.length}
          expectedTimepoints={files.length}
          isPlaying={isPlaying}
          onTogglePlayback={handleTogglePlayback}
          onTimeIndexChange={handleTimeIndexChange}
          contrast={contrast}
          brightness={brightness}
          onRegisterReset={handleRegisterReset}
        />
      </main>
      {isPickerOpen ? (
        <DirectoryPickerDialog
          initialPath={path}
          onClose={handleClosePicker}
          onSelect={handlePathPicked}
        />
      ) : null}
    </div>
  );
}

export default App;
