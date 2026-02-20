import { useMemo } from 'react';
import type { StagedPreprocessedExperiment } from '../../hooks/dataset';
import type { VoxelResolutionInput, VoxelResolutionUnit } from '../../types/voxelResolution';
import FrontPageHeader from './FrontPageHeader';
import ExperimentConfiguration, { type VoxelResolutionAxis } from './ExperimentConfiguration';
import PreprocessedLoader, { type PreprocessedLoaderProps } from './PreprocessedLoader';
import ChannelListPanel, { type ChannelListPanelProps } from './ChannelListPanel';
import LaunchActions, { type LaunchActionsProps } from './LaunchActions';
import WarningsWindow from './WarningsWindow';
import { formatBytes } from '../../errors';

export type TrackSummary = { totalRows: number; uniqueTracks: number };

export type InitialActionsProps = {
  isFrontPageLocked: boolean;
  onStartExperimentSetup: () => void;
  onOpenPreprocessedLoader: () => void;
  isPreprocessedImporting: boolean;
};

export type ExperimentConfigurationState = {
  voxelResolution: VoxelResolutionInput;
  onVoxelResolutionAxisChange: (axis: VoxelResolutionAxis, value: string) => void;
  onVoxelResolutionUnitChange: (unit: VoxelResolutionUnit) => void;
  onVoxelResolutionAnisotropyToggle: (value: boolean) => void;
};

export type PreprocessedSummaryProps = {
  preprocessedExperiment: StagedPreprocessedExperiment | null;
  computeTrackSummary: (entries: string[][]) => TrackSummary;
};

type HeaderProps = {
  onReturnToStart: () => void;
  isFrontPageLocked: boolean;
};

type FrontPageProps = {
  isFrontPageLocked: boolean;
  frontPageMode: 'initial' | 'configuring' | 'preprocessed';
  header: HeaderProps;
  initialActions: InitialActionsProps;
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
    if (frontPageMode === 'configuring') {
      return 'Set up new experiment';
    }
    if (preprocessedLoader.isOpen) {
      return 'Load preprocessed experiment';
    }
    return '4D viewer';
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
          {frontPageMode === 'configuring' ? (
            <ExperimentConfiguration
              voxelResolution={experimentConfiguration.voxelResolution}
              onVoxelResolutionAxisChange={experimentConfiguration.onVoxelResolutionAxisChange}
              onVoxelResolutionUnitChange={experimentConfiguration.onVoxelResolutionUnitChange}
              onVoxelResolutionAnisotropyToggle={experimentConfiguration.onVoxelResolutionAnisotropyToggle}
              isFrontPageLocked={isFrontPageLocked}
            />
          ) : null}
          {frontPageMode !== 'preprocessed' ? <PreprocessedLoader {...preprocessedLoader} /> : null}
          {frontPageMode === 'configuring' ? (
            <ChannelListPanel
              channels={channelListPanel.channels}
              channelValidationMap={channelListPanel.channelValidationMap}
              activeChannelId={channelListPanel.activeChannelId}
              activeChannel={channelListPanel.activeChannel}
              editingChannelId={channelListPanel.editingChannelId}
              editingChannelInputRef={channelListPanel.editingChannelInputRef}
              editingChannelOriginalNameRef={channelListPanel.editingChannelOriginalNameRef}
              setActiveChannelId={channelListPanel.setActiveChannelId}
              setEditingChannelId={channelListPanel.setEditingChannelId}
              onAddChannel={channelListPanel.onAddChannel}
              onChannelNameChange={channelListPanel.onChannelNameChange}
              onRemoveChannel={channelListPanel.onRemoveChannel}
              onChannelLayerFilesAdded={channelListPanel.onChannelLayerFilesAdded}
              onChannelLayerDrop={channelListPanel.onChannelLayerDrop}
              onChannelLayerSegmentationToggle={channelListPanel.onChannelLayerSegmentationToggle}
              onChannelLayerRemove={channelListPanel.onChannelLayerRemove}
              onChannelTrackFilesAdded={channelListPanel.onChannelTrackFilesAdded}
              onChannelTrackDrop={channelListPanel.onChannelTrackDrop}
              onChannelTrackSetNameChange={channelListPanel.onChannelTrackSetNameChange}
              onChannelTrackSetRemove={channelListPanel.onChannelTrackSetRemove}
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
              </div>
              <ul className="preprocessed-summary-list">
                {preprocessedSummary.preprocessedExperiment.channelSummaries.map((
                  summary: StagedPreprocessedExperiment['channelSummaries'][number]
                ) => {
                  const trackSummaries = summary.trackSets.map((set) =>
                    preprocessedSummary.computeTrackSummary(set.entries)
                  );
                  const totalRows = trackSummaries.reduce((acc, current) => acc + current.totalRows, 0);
                  const totalTracks = trackSummaries.reduce((acc, current) => acc + current.uniqueTracks, 0);
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
                        <p className="preprocessed-summary-tracks">
                          {summary.trackSets.length > 0
                            ? `${summary.trackSets.length} track sets · ${totalTracks} tracks (${totalRows} rows)`
                            : 'No tracks attached'}
                        </p>
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
