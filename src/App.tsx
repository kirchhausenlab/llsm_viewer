import { useCallback, useEffect, useMemo, useState } from 'react';
import { listTiffFiles, loadVolume, VolumePayload } from './api';
import VolumeViewer from './components/VolumeViewer';
import './App.css';

type LoadState = 'idle' | 'loading' | 'loaded' | 'error';

function App() {
  const [path, setPath] = useState('');
  const [files, setFiles] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [volume, setVolume] = useState<VolumePayload | null>(null);
  const [status, setStatus] = useState<LoadState>('idle');
  const [error, setError] = useState<string | null>(null);

  const selectedFile = useMemo(() => files[selectedIndex] ?? null, [files, selectedIndex]);

  const handlePathSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setStatus('loading');
      setError(null);
      try {
        const discovered = await listTiffFiles(path.trim());
        setFiles(discovered);
        setSelectedIndex(0);
        setStatus('loaded');
      } catch (err) {
        console.error(err);
        setStatus('error');
        setFiles([]);
        setVolume(null);
        setError(err instanceof Error ? err.message : 'Failed to enumerate volume files.');
      }
    },
    [path]
  );

  const fetchVolume = useCallback(
    async (targetPath: string, filename: string) => {
      setStatus('loading');
      setError(null);
      try {
        const payload = await loadVolume(targetPath, filename);
        setVolume(payload);
        setStatus('loaded');
      } catch (err) {
        console.error(err);
        setStatus('error');
        setVolume(null);
        setError(err instanceof Error ? err.message : 'Failed to load volume.');
      }
    },
    []
  );

  useEffect(() => {
    if (path && selectedFile) {
      void fetchVolume(path, selectedFile);
    }
  }, [fetchVolume, path, selectedFile]);

  const isLoading = status === 'loading';

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

        <section className="file-list">
          <header>
            <h2>Available timepoints</h2>
            <span className="file-count">{files.length} files</span>
          </header>
          {files.length === 0 ? (
            <p className="hint">Enter a path and press Discover to list TIFF files.</p>
          ) : (
            <ul>
              {files.map((file, index) => (
                <li key={file}>
                  <button
                    type="button"
                    className={index === selectedIndex ? 'active' : ''}
                    onClick={() => setSelectedIndex(index)}
                    disabled={isLoading && index === selectedIndex}
                  >
                    {file}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {error && <p className="error">{error}</p>}
      </aside>

      <main className="viewer">
        <VolumeViewer
          volume={volume}
          filename={selectedFile}
          isLoading={isLoading}
          timeIndex={selectedIndex}
          totalTimepoints={files.length}
        />
      </main>
    </div>
  );
}

export default App;
