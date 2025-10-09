import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { listTiffFiles, loadVolume } from './api';
import VolumeViewer from './components/VolumeViewer';
import { normalizeVolume, NormalizedVolume } from './volumeProcessing';
import './App.css';

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

  const loadRequestRef = useRef(0);

  const selectedFile = useMemo(() => files[selectedIndex] ?? null, [files, selectedIndex]);

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

        const loadedVolumes: NormalizedVolume[] = new Array(total);
        for (let index = 0; index < total; index++) {
          const rawVolume = await loadVolume(trimmed, discovered[index]);
          if (loadRequestRef.current !== requestId) {
            return;
          }
          loadedVolumes[index] = normalizeVolume(rawVolume);
          setLoadedCount(index + 1);
          setLoadProgress((index + 1) / total);
        }

        if (loadRequestRef.current !== requestId) {
          return;
        }

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

    const fps = 12;
    const interval = window.setInterval(() => {
      setSelectedIndex((prev) => {
        if (volumes.length === 0) {
          return prev;
        }
        const next = (prev + 1) % volumes.length;
        return next;
      });
    }, 1000 / fps);

    return () => {
      window.clearInterval(interval);
    };
  }, [isPlaying, volumes.length]);

  useEffect(() => {
    if (volumes.length <= 1 && isPlaying) {
      setIsPlaying(false);
    }
    if (selectedIndex >= volumes.length && volumes.length > 0) {
      setSelectedIndex(0);
    }
  }, [isPlaying, selectedIndex, volumes.length]);

  const isLoading = status === 'loading';

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
              onChange={(event) => setPath(event.target.value)}
              autoComplete="off"
            />
            <button type="submit" disabled={!path.trim() || isLoading}>
              Discover
            </button>
          </div>
        </form>

        <section className="dataset-summary">
          <header>
            <h2>Dataset overview</h2>
          </header>
          {files.length === 0 ? (
            <p className="hint">Enter a path and press Discover to list TIFF files.</p>
          ) : (
            <dl>
              <div>
                <dt>Timepoints</dt>
                <dd>{files.length}</dd>
              </div>
              <div>
                <dt>Playback</dt>
                <dd>
                  Frame {volumes.length === 0 ? 0 : Math.min(selectedIndex + 1, volumes.length)} of {volumes.length}
                </dd>
              </div>
              {selectedFile && (
                <div>
                  <dt>Current file</dt>
                  <dd>{selectedFile}</dd>
                </div>
              )}
            </dl>
          )}
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
        />
      </main>
    </div>
  );
}

export default App;
