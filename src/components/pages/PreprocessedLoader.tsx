import type { ChangeEvent, DragEvent, FC, FormEvent, MutableRefObject } from 'react';
import type { DropboxAppKeySource } from '../../integrations/dropbox';
import { formatBytes } from '../../errors';
import type { PreprocessedImportMilestone } from '../../shared/utils/preprocessedDataset';

const PREPROCESSED_IMPORT_MILESTONES: PreprocessedImportMilestone[] = ['scan', 'level0', 'mips', 'finalize'];
const PREPROCESSED_IMPORT_MILESTONE_LABELS: Record<PreprocessedImportMilestone, string> = {
  scan: 'Scanning archive',
  level0: 'Preparing level 0 volumes',
  mips: 'Generating mipmaps',
  finalize: 'Finalizing dataset'
};

type PreprocessedLoaderProps = {
  isOpen: boolean;
  isPreprocessedDragActive: boolean;
  onPreprocessedDragEnter: (event: DragEvent<HTMLDivElement>) => void;
  onPreprocessedDragLeave: (event: DragEvent<HTMLDivElement>) => void;
  onPreprocessedDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onPreprocessedDrop: (event: DragEvent<HTMLDivElement>) => void;
  preprocessedFileInputRef: MutableRefObject<HTMLInputElement | null>;
  onPreprocessedFileInputChange: (event: ChangeEvent<HTMLInputElement>) => void;
  isPreprocessedImporting: boolean;
  preprocessedImportBytesProcessed: number;
  preprocessedImportTotalBytes: number | null;
  preprocessedImportVolumesDecoded: number;
  preprocessedImportTotalVolumeCount: number | null;
  preprocessedImportMilestone: PreprocessedImportMilestone | null;
  preprocessedImportMilestoneProgress: number;
  preprocessedDropboxImporting: boolean;
  onPreprocessedBrowse: () => void;
  onPreprocessedDropboxImport: () => void;
  preprocessedImportError: string | null;
  preprocessedDropboxError: string | null;
  preprocessedDropboxInfo: string | null;
  isPreprocessedDropboxConfigOpen: boolean;
  onPreprocessedDropboxConfigSubmit: (event: FormEvent<HTMLFormElement>) => void;
  preprocessedDropboxAppKeyInput: string;
  onPreprocessedDropboxConfigInputChange: (event: ChangeEvent<HTMLInputElement>) => void;
  preprocessedDropboxAppKeySource: DropboxAppKeySource | null;
  onPreprocessedDropboxConfigCancel: () => void;
  onPreprocessedDropboxConfigClear: () => void;
};

const PreprocessedLoader: FC<PreprocessedLoaderProps> = ({
  isOpen,
  isPreprocessedDragActive,
  onPreprocessedDragEnter,
  onPreprocessedDragLeave,
  onPreprocessedDragOver,
  onPreprocessedDrop,
  preprocessedFileInputRef,
  onPreprocessedFileInputChange,
  isPreprocessedImporting,
  preprocessedImportBytesProcessed,
  preprocessedImportTotalBytes,
  preprocessedImportVolumesDecoded,
  preprocessedImportTotalVolumeCount,
  preprocessedImportMilestone,
  preprocessedImportMilestoneProgress,
  preprocessedDropboxImporting,
  onPreprocessedBrowse,
  onPreprocessedDropboxImport,
  preprocessedImportError,
  preprocessedDropboxError,
  preprocessedDropboxInfo,
  isPreprocessedDropboxConfigOpen,
  onPreprocessedDropboxConfigSubmit,
  preprocessedDropboxAppKeyInput,
  onPreprocessedDropboxConfigInputChange,
  preprocessedDropboxAppKeySource,
  onPreprocessedDropboxConfigCancel,
  onPreprocessedDropboxConfigClear
}) => {
  const milestoneIndex = preprocessedImportMilestone
    ? PREPROCESSED_IMPORT_MILESTONES.indexOf(preprocessedImportMilestone)
    : -1;
  const milestoneLabel = preprocessedImportMilestone
    ? PREPROCESSED_IMPORT_MILESTONE_LABELS[preprocessedImportMilestone]
    : null;

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className={`preprocessed-loader${isPreprocessedDragActive ? ' is-active' : ''}`}
      onDragEnter={onPreprocessedDragEnter}
      onDragLeave={onPreprocessedDragLeave}
      onDragOver={onPreprocessedDragOver}
      onDrop={onPreprocessedDrop}
    >
      <input
        ref={preprocessedFileInputRef}
        className="file-drop-input"
        type="file"
        accept=".zip,.llsm,.llsmz,.json"
        onChange={onPreprocessedFileInputChange}
        disabled={isPreprocessedImporting || preprocessedDropboxImporting}
      />
      <div className="preprocessed-loader-content">
        <div className="preprocessed-loader-row">
          <div className="preprocessed-loader-buttons">
            <button
              type="button"
              className="channel-add-button"
              onClick={onPreprocessedBrowse}
              disabled={isPreprocessedImporting || preprocessedDropboxImporting}
            >
              From files
            </button>
            <button
              type="button"
              className="channel-add-button"
              onClick={onPreprocessedDropboxImport}
              disabled={isPreprocessedImporting || preprocessedDropboxImporting}
            >
              {preprocessedDropboxImporting ? 'Importing…' : 'From Dropbox'}
            </button>
            <p className="preprocessed-loader-subtitle">Or drop file here</p>
          </div>
        </div>
        {isPreprocessedImporting ? (
          <p className="preprocessed-loader-status">
            Loading preprocessed dataset…
            {milestoneLabel && milestoneIndex >= 0 ? (
              <>
                {' '}
                Stage {milestoneIndex + 1} of {PREPROCESSED_IMPORT_MILESTONES.length}: {milestoneLabel}
                {preprocessedImportMilestoneProgress > 0
                  ? ` (${preprocessedImportMilestoneProgress}%)`
                  : null}
              </>
            ) : null}
            {preprocessedImportTotalVolumeCount !== null || preprocessedImportVolumesDecoded > 0 ? (
              <>
                {' '}
                {preprocessedImportTotalVolumeCount ? (
                  <>
                    Decoded {preprocessedImportVolumesDecoded} of {preprocessedImportTotalVolumeCount} volumes (
                    {preprocessedImportTotalVolumeCount > 0
                      ? Math.min(
                          100,
                          Math.round((preprocessedImportVolumesDecoded / preprocessedImportTotalVolumeCount) * 100)
                        )
                      : 100}
                    %)
                  </>
                ) : (
                  <>
                    Decoded {preprocessedImportVolumesDecoded} volume
                    {preprocessedImportVolumesDecoded === 1 ? '' : 's'}
                  </>
                )}
              </>
            ) : null}
            {preprocessedImportBytesProcessed > 0 ? (
              <>
                {' '}
                {preprocessedImportTotalBytes ? (
                  <>
                    {formatBytes(preprocessedImportBytesProcessed)} of {formatBytes(preprocessedImportTotalBytes)} (
                    {preprocessedImportTotalBytes > 0
                      ? Math.min(
                          100,
                          Math.round((preprocessedImportBytesProcessed / preprocessedImportTotalBytes) * 100)
                        )
                      : 100}
                    %)
                  </>
                ) : (
                  <>{formatBytes(preprocessedImportBytesProcessed)} processed</>
                )}
              </>
            ) : null}
          </p>
        ) : null}
        {preprocessedImportError ? <p className="preprocessed-loader-error">{preprocessedImportError}</p> : null}
        {preprocessedDropboxError ? <p className="preprocessed-loader-error">{preprocessedDropboxError}</p> : null}
        {preprocessedDropboxInfo ? <p className="preprocessed-loader-info">{preprocessedDropboxInfo}</p> : null}
        {isPreprocessedDropboxConfigOpen ? (
          <form className="preprocessed-dropbox-config" onSubmit={onPreprocessedDropboxConfigSubmit} noValidate>
            <label className="preprocessed-dropbox-config-label">
              Dropbox app key
              <input
                value={preprocessedDropboxAppKeyInput}
                onChange={onPreprocessedDropboxConfigInputChange}
                disabled={preprocessedDropboxAppKeySource === 'env'}
              />
            </label>
            <p className="preprocessed-dropbox-config-hint">Add your Dropbox app key to enable imports.</p>
            <div className="preprocessed-dropbox-config-actions">
              <button type="submit" className="preprocessed-dropbox-config-save">
                {preprocessedDropboxAppKeySource === 'env' ? 'Close' : 'Save app key'}
              </button>
              <button type="button" className="preprocessed-dropbox-config-cancel" onClick={onPreprocessedDropboxConfigCancel}>
                Cancel
              </button>
              {preprocessedDropboxAppKeySource === 'local' ? (
                <button type="button" className="preprocessed-dropbox-config-clear" onClick={onPreprocessedDropboxConfigClear}>
                  Remove saved key
                </button>
              ) : null}
            </div>
          </form>
        ) : null}
      </div>
    </div>
  );
};

export default PreprocessedLoader;
export type { PreprocessedLoaderProps };
