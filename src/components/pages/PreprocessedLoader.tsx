import type { FC } from 'react';

type PreprocessedLoaderProps = {
  isOpen: boolean;
  isPreprocessedImporting: boolean;
  onPreprocessedBrowse: () => void | Promise<void>;
  onPreprocessedArchiveBrowse: () => void | Promise<void>;
  preprocessedImportError: string | null;
};

const PreprocessedLoader: FC<PreprocessedLoaderProps> = ({
  isOpen,
  isPreprocessedImporting,
  onPreprocessedBrowse,
  onPreprocessedArchiveBrowse,
  preprocessedImportError
}) => {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="preprocessed-loader">
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
            <p className="preprocessed-loader-info">Safari users can upload a zipped .zarr folder instead.</p>
          </div>
        </div>
        {preprocessedImportError ? <p className="preprocessed-loader-error">{preprocessedImportError}</p> : null}
      </div>
    </div>
  );
};

export default PreprocessedLoader;
export type { PreprocessedLoaderProps };
