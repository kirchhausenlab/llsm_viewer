import type { FC } from 'react';

type LaunchActionsProps = {
  frontPageMode: 'initial' | 'configuring' | 'preprocessed';
  hasGlobalTimepointMismatch: boolean;
  interactionErrorMessage: string | null;
  launchErrorMessage: string | null;
  showLaunchViewerButton: boolean;
  onPreprocessExperiment: () => void;
  isPreprocessingExperiment: boolean;
  preprocessButtonEnabled: boolean;
  preprocessSuccessMessage: string | null;
  exportWhilePreprocessing: boolean;
  onExportWhilePreprocessingChange: (value: boolean) => void;
  exportName: string;
  onExportNameChange: (value: string) => void;
  exportDestinationLabel: string | null;
  onLaunchViewer: () => void;
  isLaunchingViewer: boolean;
  launchButtonEnabled: boolean;
  launchButtonLaunchable: 'true' | 'false';
};

function ensureZarrDirectoryName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    return 'preprocessed.zarr';
  }
  return trimmed.toLowerCase().endsWith('.zarr') ? trimmed : `${trimmed}.zarr`;
}

const LaunchActions: FC<LaunchActionsProps> = ({
  frontPageMode,
  hasGlobalTimepointMismatch,
  interactionErrorMessage,
  launchErrorMessage,
  showLaunchViewerButton,
  onPreprocessExperiment,
  isPreprocessingExperiment,
  preprocessButtonEnabled,
  preprocessSuccessMessage,
  exportWhilePreprocessing,
  onExportWhilePreprocessingChange,
  exportName,
  onExportNameChange,
  exportDestinationLabel,
  onLaunchViewer,
  isLaunchingViewer,
  launchButtonEnabled,
  launchButtonLaunchable
}) => {
  const exportDirectoryName = ensureZarrDirectoryName(exportName);
  const exportHint = exportDestinationLabel
    ? `Exporting to: ${exportDestinationLabel}`
    : `You’ll be asked to choose the parent folder; we will create ${exportDirectoryName}/ inside it.`;

  return (
    <>
      {frontPageMode === 'configuring' && hasGlobalTimepointMismatch ? (
        <p className="launch-feedback launch-feedback-warning">
          Timepoint counts differ across channels. Align them before preprocessing.
        </p>
      ) : null}
      {interactionErrorMessage ? (
        <p className="launch-feedback launch-feedback-error">{interactionErrorMessage}</p>
      ) : null}
      {launchErrorMessage ? (
        <p className="launch-feedback launch-feedback-error">{launchErrorMessage}</p>
      ) : null}
      {frontPageMode === 'preprocessed' && preprocessSuccessMessage ? (
        <p className="launch-feedback launch-feedback-success">{preprocessSuccessMessage}</p>
      ) : null}
      {showLaunchViewerButton && frontPageMode !== 'initial' ? (
        <div className="front-page-actions">
          {frontPageMode === 'configuring' ? (
            <>
              <div className="launch-export-controls">
                <div className="launch-export-row">
                  <label className="launch-checkbox">
                    <input
                      type="checkbox"
                      checked={exportWhilePreprocessing}
                      disabled={isPreprocessingExperiment || isLaunchingViewer}
                      onChange={(event) => onExportWhilePreprocessingChange(event.target.checked)}
                    />
                    Export to `.zarr` while preprocessing
                  </label>
                  {exportWhilePreprocessing ? (
                    <input
                      type="text"
                      className="launch-export-name"
                      value={exportName}
                      disabled={isPreprocessingExperiment || isLaunchingViewer}
                      onChange={(event) => onExportNameChange(event.target.value)}
                      aria-label="Export dataset name"
                    />
                  ) : null}
                </div>
                {exportWhilePreprocessing ? <p className="launch-export-hint">{exportHint}</p> : null}
              </div>
              <button
                type="button"
                className="launch-viewer-button"
                onClick={onPreprocessExperiment}
                disabled={isPreprocessingExperiment || isLaunchingViewer || !preprocessButtonEnabled}
                data-launchable={preprocessButtonEnabled ? 'true' : 'false'}
              >
                {isPreprocessingExperiment ? 'Preprocessing…' : 'Preprocess experiment'}
              </button>
            </>
          ) : null}
          {frontPageMode === 'preprocessed' ? (
            <button
              type="button"
              className="launch-viewer-button"
              onClick={onLaunchViewer}
              disabled={isLaunchingViewer || !launchButtonEnabled}
              data-launchable={launchButtonLaunchable}
            >
              {isLaunchingViewer ? 'Loading…' : 'Launch viewer'}
            </button>
          ) : null}
        </div>
      ) : null}
    </>
  );
};

export default LaunchActions;
export type { LaunchActionsProps };
