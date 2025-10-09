import { useCallback, useEffect, useMemo, useState } from 'react';
import { browseDirectory, type DirectoryListing } from '../api';

type DirectoryPickerDialogProps = {
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

function DirectoryPickerDialog({ initialPath, onClose, onSelect }: DirectoryPickerDialogProps) {
  const sanitizedInitial = useMemo(() => {
    const trimmed = initialPath?.trim();
    if (!trimmed) {
      return '/';
    }
    return trimmed;
  }, [initialPath]);

  const [listing, setListing] = useState<DirectoryListing | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inputPath, setInputPath] = useState(sanitizedInitial);

  const loadPath = useCallback(
    async (targetPath: string) => {
      const normalized = targetPath.trim() || '/';
      setLoading(true);
      setError(null);
      try {
        const result = await browseDirectory(normalized);
        setListing(result);
        setInputPath(result.path);
      } catch (err) {
        console.error('Failed to browse directory', err);
        setError(err instanceof Error ? err.message : 'Failed to browse directory.');
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

  const handleSelect = useCallback(() => {
    if (!listing) {
      return;
    }
    onSelect(listing.path);
  }, [listing, onSelect]);

  const directories = listing?.directories ?? [];

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
          <h2>Select dataset folder</h2>
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
        <div className="directory-picker-content">
          {loading ? (
            <p className="directory-picker-status">Loading directories…</p>
          ) : error ? (
            <p className="directory-picker-error">{error}</p>
          ) : directories.length === 0 ? (
            <p className="directory-picker-status">This folder has no subdirectories.</p>
          ) : (
            <ul>
              {directories.map((name) => (
                <li key={name}>
                  <button type="button" onClick={() => handleEnterDirectory(name)}>
                    {name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <footer className="directory-picker-footer">
          <button type="button" onClick={handleSelect} disabled={!listing || loading}>
            Select folder
          </button>
          <button type="button" onClick={onClose} className="secondary">
            Cancel
          </button>
        </footer>
      </div>
    </div>
  );
}

export default DirectoryPickerDialog;
