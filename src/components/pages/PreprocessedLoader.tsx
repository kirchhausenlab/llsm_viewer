import type { FC } from 'react';

type PreprocessedLoaderProps = {
  isOpen: boolean;
  isPreprocessedImporting: boolean;
  onPreprocessedBrowse: () => void | Promise<void>;
  onPreprocessedArchiveBrowse: () => void | Promise<void>;
  onPreprocessedArchiveDrop: (file: File) => void | Promise<void>;
  preprocessedImportError: string | null;
};

const PreprocessedLoader: FC<PreprocessedLoaderProps> = ({
  isOpen,
  isPreprocessedImporting,
  onPreprocessedBrowse,
  onPreprocessedArchiveBrowse,
  onPreprocessedArchiveDrop,
  preprocessedImportError
}) => {
  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="preprocessed-loader"
      onDragOver={(event) => {
        event.preventDefault();
      }}
      onDrop={(event) => {
        event.preventDefault();
        if (isPreprocessedImporting) {
          return;
        }
        const file = event.dataTransfer?.files?.[0];
        if (!file) {
          return;
        }
        void onPreprocessedArchiveDrop(file);
      }}
    >
      <div className="preprocessed-loader-content">
        <div className="preprocessed-loader-row">
          <div className="preprocessed-loader-buttons">
            <button
              type="button"
              className="channel-add-button"
              onClick={onPreprocessedBrowse}
              disabled={isPreprocessedImporting}
            >
              {isPreprocessedImporting ? 'Loading…' : 'Choose folder'}
            </button>
            <button
              type="button"
              className="channel-add-button"
              onClick={onPreprocessedArchiveBrowse}
              disabled={isPreprocessedImporting}
            >
              {isPreprocessedImporting ? 'Loading…' : 'Upload .zip'}
            </button>
            <p className="preprocessed-loader-subtitle">Select a preprocessed dataset folder (Zarr v3).</p>
            <p className="preprocessed-loader-info">
              Safari users can drop a .zip archive if folder selection isn&apos;t supported.
            </p>
          </div>
        </div>
        {preprocessedImportError ? <p className="preprocessed-loader-error">{preprocessedImportError}</p> : null}
      </div>
    </div>
  );
};

export default PreprocessedLoader;
export type { PreprocessedLoaderProps };
