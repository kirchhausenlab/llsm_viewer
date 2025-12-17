import type { FC } from 'react';

type PreprocessedLoaderProps = {
  isOpen: boolean;
  isPreprocessedImporting: boolean;
  onPreprocessedBrowse: () => void | Promise<void>;
  preprocessedImportError: string | null;
};

const PreprocessedLoader: FC<PreprocessedLoaderProps> = ({
  isOpen,
  isPreprocessedImporting,
  onPreprocessedBrowse,
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
            <p className="preprocessed-loader-subtitle">Select a preprocessed dataset folder (Zarr v3).</p>
          </div>
        </div>
        {preprocessedImportError ? <p className="preprocessed-loader-error">{preprocessedImportError}</p> : null}
      </div>
    </div>
  );
};

export default PreprocessedLoader;
export type { PreprocessedLoaderProps };

