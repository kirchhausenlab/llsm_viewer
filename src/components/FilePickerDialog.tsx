import { useCallback, useEffect, useMemo, useState } from 'react';
import { browseForCsv, type CsvBrowserListing } from '../api';

type FilePickerDialogProps = {
  initialPath?: string;
  onClose: () => void;
  onSelect: (path: string) => void;
};

function joinPath(base: string, segment: string) {
  if (!base) {
    return segment;
  }
  if (base.endsWith('/')) {
    return `${base}${segment}`;
  }
  return `${base}/${segment}`;
}

function FilePickerDialog({ initialPath, onClose, onSelect }: FilePickerDialogProps) {
  const sanitizedInitial = useMemo(() => {
    const trimmed = initialPath?.trim();
    if (!trimmed) {
      return '/';
    }
    return trimmed;
  }, [initialPath]);

  const [listing, setListing] = useState<CsvBrowserListing | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inputPath, setInputPath] = useState(sanitizedInitial);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  const loadPath = useCallback(
    async (targetPath: string) => {
      const normalized = targetPath.trim() || '/';
      setLoading(true);
      setError(null);
      try {
        const result = await browseForCsv(normalized);
        setListing(result);
        setInputPath(result.path);
        setSelectedFile(result.selectedFile ?? null);
      } catch (err) {
        console.error('Failed to browse for CSV file', err);
        setError(err instanceof Error ? err.message : 'Failed to browse for CSV file.');
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    loadPath(sanitizedInitial).catch(() => {
      // Error is handled inside loadPath.
    });
  }, [loadPath, sanitizedInitial]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const handleNavigateUp = useCallback(() => {
    if (!listing?.parent) {
      return;
    }
    loadPath(listing.parent).catch(() => {
      // Error handled in loadPath.
    });
  }, [listing?.parent, loadPath]);

  const handleEnterDirectory = useCallback(
    (name: string) => {
      if (!listing) {
        return;
      }
      const nextPath = joinPath(listing.path, name);
      loadPath(nextPath).catch(() => {
        // Error handled in loadPath.
      });
    },
    [listing, loadPath]
  );

  const handleSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      loadPath(inputPath).catch(() => {
        // Error handled in loadPath.
      });
    },
    [inputPath, loadPath]
  );

  const handleSelectFile = useCallback((name: string) => {
    setSelectedFile(name);
  }, []);

  const handleConfirm = useCallback(() => {
    if (!listing || !selectedFile) {
      return;
    }
    onSelect(joinPath(listing.path, selectedFile));
  }, [listing, onSelect, selectedFile]);

  const directories = useMemo(
    () => (listing?.directories ?? []).filter((name) => !name.startsWith('.')),
    [listing]
  );

  const csvFiles = listing?.csvFiles ?? [];

  return (
    <div
      className="directory-picker-overlay"
      role="dialog"
      aria-modal="true"
      onMouseDown={onClose}
      onClick={onClose}
    >
      <div
        className="directory-picker-modal"
        onMouseDown={(event) => {
          event.stopPropagation();
        }}
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        <header className="directory-picker-header">
          <h2>Select tracks file</h2>
          <button type="button" className="directory-picker-close" onClick={onClose} aria-label="Close dialog">
            ×
          </button>
        </header>
        <form className="directory-picker-path" onSubmit={handleSubmit}>
          <input
            type="text"
            value={inputPath}
            onChange={(event) => setInputPath(event.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          <button type="submit" disabled={loading}>
            Go
          </button>
          <button type="button" onClick={handleNavigateUp} disabled={!listing?.parent || loading}>
            Up
          </button>
        </form>
        <div className="directory-picker-content file-picker-content">
          {loading ? (
            <p className="directory-picker-status">Loading folders and CSV files…</p>
          ) : error ? (
            <p className="directory-picker-error">{error}</p>
          ) : (
            <div className="file-picker-columns">
              <section className="file-picker-section">
                <h3>Folders</h3>
                {directories.length === 0 ? (
                  <p className="file-picker-empty">No subfolders.</p>
                ) : (
                  <ul className="file-picker-list">
                    {directories.map((name) => (
                      <li key={name}>
                        <button type="button" onClick={() => handleEnterDirectory(name)}>
                          {name}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <section className="file-picker-section">
                <h3>CSV files</h3>
                {csvFiles.length === 0 ? (
                  <p className="file-picker-empty">No CSV files detected.</p>
                ) : (
                  <ul className="file-picker-list file-picker-files">
                    {csvFiles.map((name) => (
                      <li key={name}>
                        <button
                          type="button"
                          className={name === selectedFile ? 'is-selected' : ''}
                          onClick={() => handleSelectFile(name)}
                          onDoubleClick={handleConfirm}
                        >
                          {name}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}
        </div>
        <footer className="directory-picker-footer">
          <button type="button" onClick={handleConfirm} disabled={!listing || !selectedFile || loading}>
            Select file
          </button>
          <button type="button" onClick={onClose} className="secondary">
            Cancel
          </button>
        </footer>
      </div>
    </div>
  );
}

export default FilePickerDialog;
