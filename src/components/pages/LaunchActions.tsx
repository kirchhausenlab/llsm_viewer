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
  onPreprocessExperiment,
  isPreprocessingExperiment,
  preprocessButtonEnabled,
  preprocessSuccessMessage,
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
            <button
              type="button"
              className="launch-viewer-button"
              onClick={onPreprocessExperiment}
              disabled={isPreprocessingExperiment || isLaunchingViewer || !preprocessButtonEnabled}
              data-launchable={preprocessButtonEnabled ? 'true' : 'false'}
            >
              {isPreprocessingExperiment ? 'Preprocessing…' : 'Preprocess experiment'}
            </button>
          ) : null}
          {frontPageMode === 'preprocessed' ? (
            <>
              <button
                type="button"
                className="launch-viewer-button"
                onClick={onLaunchViewer}
                disabled={isLaunchingViewer || !launchButtonEnabled}
                data-launchable={launchButtonLaunchable}
              >
                {isLaunchingViewer ? 'Loading…' : 'Launch viewer'}
              </button>
              <button
                type="button"
                className="export-preprocessed-button"
                onClick={onExportPreprocessedExperiment}
                disabled={isExportingPreprocessed || isLaunchingViewer}
              >
                {isExportingPreprocessed ? 'Exporting…' : 'Export preprocessed experiment'}
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </>
  );
};

export default LaunchActions;
export type { LaunchActionsProps };
