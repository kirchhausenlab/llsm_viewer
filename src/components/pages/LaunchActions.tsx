import type { FC } from 'react';

type LaunchActionsProps = {
  frontPageMode: 'initial' | 'configuring' | 'preprocessed';
  hasGlobalTimepointMismatch: boolean;
  interactionErrorMessage: string | null;
  launchErrorMessage: string | null;
  showLaunchViewerButton: boolean;
  onLaunchViewer: () => void;
  isLaunchingViewer: boolean;
  launchButtonEnabled: boolean;
  launchButtonLaunchable: 'true' | 'false';
  onExportPreprocessedExperiment: () => void;
  isExportingPreprocessed: boolean;
  canLaunch: boolean;
};

const LaunchActions: FC<LaunchActionsProps> = ({
  frontPageMode,
  hasGlobalTimepointMismatch,
  interactionErrorMessage,
  launchErrorMessage,
  showLaunchViewerButton,
  onLaunchViewer,
  isLaunchingViewer,
  launchButtonEnabled,
  launchButtonLaunchable,
  onExportPreprocessedExperiment,
  isExportingPreprocessed,
  canLaunch
}) => {
  return (
    <>
      {frontPageMode === 'configuring' && hasGlobalTimepointMismatch ? (
        <p className="launch-feedback launch-feedback-warning">
          Timepoint counts differ across channels. Align them before launching.
        </p>
      ) : null}
      {interactionErrorMessage ? (
        <p className="launch-feedback launch-feedback-error">{interactionErrorMessage}</p>
      ) : null}
      {launchErrorMessage ? (
        <p className="launch-feedback launch-feedback-error">{launchErrorMessage}</p>
      ) : null}
      {showLaunchViewerButton ? (
        <div className="front-page-actions">
          <button
            type="button"
            className="launch-viewer-button"
            onClick={onLaunchViewer}
            disabled={isLaunchingViewer || !launchButtonEnabled}
            data-launchable={launchButtonLaunchable}
          >
            {isLaunchingViewer ? 'Loading…' : 'Launch viewer'}
          </button>
          {frontPageMode !== 'initial' ? (
            <button
              type="button"
              className="export-preprocessed-button"
              onClick={onExportPreprocessedExperiment}
              disabled={isExportingPreprocessed || isLaunchingViewer || (frontPageMode === 'configuring' && !canLaunch)}
            >
              {isExportingPreprocessed ? 'Exporting…' : 'Export preprocessed experiment'}
            </button>
          ) : null}
        </div>
      ) : null}
    </>
  );
};

export default LaunchActions;
export type { LaunchActionsProps };
