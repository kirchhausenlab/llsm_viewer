import { useMemo } from 'react';
import type { StagedPreprocessedExperiment } from '../../hooks/dataset';
import type {
  TemporalResolutionUnit,
  VoxelResolutionAxis,
  VoxelResolutionInput,
  VoxelResolutionUnit
} from '../../types/voxelResolution';
import FrontPageHeader from './FrontPageHeader';
import ExperimentConfiguration from './ExperimentConfiguration';
import PreprocessedLoader, { type PreprocessedLoaderProps } from './PreprocessedLoader';
import ChannelListPanel, { type ChannelListPanelProps } from './ChannelListPanel';
import LaunchActions, { type LaunchActionsProps } from './LaunchActions';
import WarningsWindow from './WarningsWindow';
import { formatBytes } from '../../errors';

export type TrackSummary = { totalRows: number; uniqueTracks: number };
export type ExperimentType = '3d-movie' | '2d-movie' | 'single-3d-volume';

const EXPERIMENT_TYPE_OPTIONS: ReadonlyArray<{ type: ExperimentType; label: string }> = [
  { type: '3d-movie', label: '3D movie' },
  { type: '2d-movie', label: '2D movie' },
  { type: 'single-3d-volume', label: 'Single 3D volume' }
];

export type InitialActionsProps = {
  isFrontPageLocked: boolean;
  onStartExperimentSetup: () => void;
  onOpenPreprocessedLoader: () => void;
  isPreprocessedImporting: boolean;
};

export type ExperimentConfigurationState = {
  experimentType: ExperimentType;
  voxelResolution: VoxelResolutionInput;
  onVoxelResolutionAxisChange: (axis: VoxelResolutionAxis, value: string) => void;
  onVoxelResolutionUnitChange: (unit: VoxelResolutionUnit) => void;
  onVoxelResolutionTimeUnitChange: (unit: TemporalResolutionUnit) => void;
  onVoxelResolutionAnisotropyToggle: (value: boolean) => void;
};

export type PreprocessedSummaryProps = {
  preprocessedExperiment: StagedPreprocessedExperiment | null;
  computeTrackSummary: (entries: string[][]) => TrackSummary;
};

type ExperimentTypeSelectionProps = {
  onSelectExperimentType: (type: ExperimentType) => void;
  isFrontPageLocked: boolean;
};

type HeaderProps = {
  onReturnToStart: () => void;
  isFrontPageLocked: boolean;
};

type FrontPageProps = {
  isFrontPageLocked: boolean;
  frontPageMode: 'initial' | 'experimentTypeSelection' | 'configuring' | 'preprocessed';
  header: HeaderProps;
  initialActions: InitialActionsProps;
  experimentTypeSelection: ExperimentTypeSelectionProps;
  experimentConfiguration: ExperimentConfigurationState;
  preprocessedLoader: PreprocessedLoaderProps;
  channelListPanel: ChannelListPanelProps;
  preprocessedSummary: PreprocessedSummaryProps;
  launchActions: LaunchActionsProps;
  warningsWindow: {
    launchErrorMessage: string | null;
    warningWindowInitialPosition: { x: number; y: number };
    warningWindowWidth: number;
    datasetErrorResetSignal: number;
    onDatasetErrorDismiss: () => void;
  };
};

export default function FrontPage({
  isFrontPageLocked,
  frontPageMode,
  header,
  initialActions,
  experimentTypeSelection,
  experimentConfiguration,
  preprocessedLoader,
  channelListPanel,
  preprocessedSummary,
  launchActions,
  warningsWindow
}: FrontPageProps) {
  const headerTitle = useMemo(() => {
    if (frontPageMode === 'preprocessed') {
      return 'Loaded preprocessed experiment';
    }
    if (frontPageMode === 'configuring' || frontPageMode === 'experimentTypeSelection') {
      return 'Set up new experiment';
    }
    if (preprocessedLoader.isOpen) {
      return 'Load preprocessed experiment';
    }
    return 'Mirante4D';
  }, [frontPageMode, preprocessedLoader.isOpen]);

  const showReturnButton = frontPageMode !== 'initial' || preprocessedLoader.isOpen;
  const showLaunchViewerButton = frontPageMode !== 'initial' || preprocessedLoader.isOpen;

  return (
    <div className="app front-page-mode">
      <div className="front-page">
        <div className={`front-page-card${isFrontPageLocked ? ' is-loading' : ''}`}>
          <FrontPageHeader
            title={headerTitle}
            showReturnButton={showReturnButton}
            onReturnToStart={header.onReturnToStart}
            isFrontPageLocked={header.isFrontPageLocked}
          />
          {frontPageMode === 'initial' && !preprocessedLoader.isOpen ? (
            <div className="channel-add-actions">
              <div className="channel-add-initial">
                <button
                  type="button"
                  className="channel-add-button"
                  onClick={initialActions.onStartExperimentSetup}
                  disabled={initialActions.isFrontPageLocked}
                >
                  Set up new experiment
                </button>
                <button
                  type="button"
                  className="channel-add-button"
                  onClick={initialActions.onOpenPreprocessedLoader}
                  disabled={
                    initialActions.isFrontPageLocked || initialActions.isPreprocessedImporting
                  }
                >
                  Load preprocessed experiment
                </button>
              </div>
            </div>
          ) : null}
          {frontPageMode === 'experimentTypeSelection' ? (
            <div className="experiment-type-selection">
              <p className="experiment-type-selection-title">Choose the type of experiment:</p>
              <div className="experiment-type-selection-buttons">
                {EXPERIMENT_TYPE_OPTIONS.map((option) => (
                  <button
                    key={option.type}
                    type="button"
                    className="channel-add-button experiment-type-selection-button"
                    onClick={() => experimentTypeSelection.onSelectExperimentType(option.type)}
                    disabled={experimentTypeSelection.isFrontPageLocked}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {frontPageMode === 'configuring' ? (
            <ExperimentConfiguration
              experimentType={experimentConfiguration.experimentType}
              voxelResolution={experimentConfiguration.voxelResolution}
              onVoxelResolutionAxisChange={experimentConfiguration.onVoxelResolutionAxisChange}
              onVoxelResolutionUnitChange={experimentConfiguration.onVoxelResolutionUnitChange}
              onVoxelResolutionTimeUnitChange={experimentConfiguration.onVoxelResolutionTimeUnitChange}
              onVoxelResolutionAnisotropyToggle={experimentConfiguration.onVoxelResolutionAnisotropyToggle}
              isFrontPageLocked={isFrontPageLocked}
            />
          ) : null}
          {frontPageMode !== 'preprocessed' ? <PreprocessedLoader {...preprocessedLoader} /> : null}
          {frontPageMode === 'configuring' ? (
            <ChannelListPanel
              channels={channelListPanel.channels}
              tracks={channelListPanel.tracks}
              channelValidationMap={channelListPanel.channelValidationMap}
              trackValidationMap={channelListPanel.trackValidationMap}
              activeChannelId={channelListPanel.activeChannelId}
              activeChannel={channelListPanel.activeChannel}
              editingChannelId={channelListPanel.editingChannelId}
              editingChannelInputRef={channelListPanel.editingChannelInputRef}
              editingChannelOriginalNameRef={channelListPanel.editingChannelOriginalNameRef}
              setActiveChannelId={channelListPanel.setActiveChannelId}
              setEditingChannelId={channelListPanel.setEditingChannelId}
              onAddChannel={channelListPanel.onAddChannel}
              onAddSegmentationChannel={channelListPanel.onAddSegmentationChannel}
              onChannelNameChange={channelListPanel.onChannelNameChange}
              onRemoveChannel={channelListPanel.onRemoveChannel}
              onChannelLayerFilesAdded={channelListPanel.onChannelLayerFilesAdded}
              onChannelLayerDrop={channelListPanel.onChannelLayerDrop}
              onChannelLayerRemove={channelListPanel.onChannelLayerRemove}
              onAddTrack={channelListPanel.onAddTrack}
              onTrackFilesAdded={channelListPanel.onTrackFilesAdded}
              onTrackDrop={channelListPanel.onTrackDrop}
              onTrackSetNameChange={channelListPanel.onTrackSetNameChange}
              onTrackSetBoundChannelChange={channelListPanel.onTrackSetBoundChannelChange}
              onTrackSetClearFile={channelListPanel.onTrackSetClearFile}
              onTrackSetRemove={channelListPanel.onTrackSetRemove}
              isFrontPageLocked={channelListPanel.isFrontPageLocked}
            />
          ) : null}
          {frontPageMode === 'preprocessed' && preprocessedSummary.preprocessedExperiment ? (
            <div className="preprocessed-summary">
              <div className="preprocessed-summary-header">
                <h2>Loaded preprocessed experiment</h2>
                <p className="preprocessed-summary-meta">
                  {preprocessedSummary.preprocessedExperiment.sourceName ?? 'Imported dataset'}
                  {typeof preprocessedSummary.preprocessedExperiment.sourceSize === 'number'
                    ? ` · ${formatBytes(preprocessedSummary.preprocessedExperiment.sourceSize)}`
                    : ''}
                  {preprocessedSummary.preprocessedExperiment.totalVolumeCount > 0
                    ? ` · ${preprocessedSummary.preprocessedExperiment.totalVolumeCount} volumes`
                    : ''}
                </p>
                {(() => {
                  const trackSummaries = preprocessedSummary.preprocessedExperiment.trackSummaries ?? [];
                  const totals = trackSummaries.reduce(
                    (acc, set) => {
                      const summary = preprocessedSummary.computeTrackSummary(set.entries);
                      return {
                        rows: acc.rows + summary.totalRows,
                        tracks: acc.tracks + summary.uniqueTracks
                      };
                    },
                    { rows: 0, tracks: 0 }
                  );
                  return (
                    <p className="preprocessed-summary-tracks">
                      {trackSummaries.length > 0
                        ? `${trackSummaries.length} track sets · ${totals.tracks} tracks (${totals.rows} rows)`
                        : 'No tracks attached'}
                    </p>
                  );
                })()}
              </div>
              <ul className="preprocessed-summary-list">
                {preprocessedSummary.preprocessedExperiment.channelSummaries.map((
                  summary: StagedPreprocessedExperiment['channelSummaries'][number]
                ) => {
                  return (
                    <li key={summary.id} className="preprocessed-summary-item">
                      <div className="preprocessed-summary-channel">
                        <h3>{summary.name}</h3>
                        <ul className="preprocessed-summary-layer-list">
                          {summary.layers.map((layer: (typeof summary.layers)[number]) => (
                            <li key={layer.key} className="preprocessed-summary-layer">
                              <span className="preprocessed-summary-layer-title">
                                {layer.label}
                                {layer.isSegmentation ? (
                                  <span className="preprocessed-summary-layer-flag">Segmentation</span>
                                ) : null}
                              </span>
                              <span className="preprocessed-summary-layer-meta">
                                {layer.volumeCount} timepoints · {layer.width}×{layer.height}×{layer.depth} · {layer.channels}{' '}
                                channels
                              </span>
                              <span className="preprocessed-summary-layer-range">
                                Range: {layer.min}–{layer.max}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
          <LaunchActions
            frontPageMode={launchActions.frontPageMode}
            hasGlobalTimepointMismatch={launchActions.hasGlobalTimepointMismatch}
            interactionErrorMessage={launchActions.interactionErrorMessage}
            launchErrorMessage={launchActions.launchErrorMessage}
            showLaunchViewerButton={showLaunchViewerButton}
            onPreprocessExperiment={launchActions.onPreprocessExperiment}
            isPreprocessingExperiment={launchActions.isPreprocessingExperiment}
            preprocessButtonEnabled={launchActions.preprocessButtonEnabled}
            preprocessSuccessMessage={launchActions.preprocessSuccessMessage}
            exportWhilePreprocessing={launchActions.exportWhilePreprocessing}
            onExportWhilePreprocessingChange={launchActions.onExportWhilePreprocessingChange}
            exportName={launchActions.exportName}
            onExportNameChange={launchActions.onExportNameChange}
            exportDestinationLabel={launchActions.exportDestinationLabel}
            onLaunchViewer={launchActions.onLaunchViewer}
            isLaunchingViewer={launchActions.isLaunchingViewer}
            launchButtonEnabled={launchActions.launchButtonEnabled}
            launchButtonLaunchable={launchActions.launchButtonLaunchable}
          />
        </div>
        <WarningsWindow
          title="Cannot launch viewer"
          launchErrorMessage={warningsWindow.launchErrorMessage}
          warningWindowInitialPosition={warningsWindow.warningWindowInitialPosition}
          warningWindowWidth={warningsWindow.warningWindowWidth}
          datasetErrorResetSignal={warningsWindow.datasetErrorResetSignal}
          onDatasetErrorDismiss={warningsWindow.onDatasetErrorDismiss}
        />
      </div>
    </div>
  );
}
