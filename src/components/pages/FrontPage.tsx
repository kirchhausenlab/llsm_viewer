import { useMemo } from 'react';
import type { StagedPreprocessedExperiment } from '../../hooks/dataset';
import type { ExperimentDimension } from '../../hooks/useVoxelResolution';
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
  preprocessedDropboxImporting: boolean;
};

export type ExperimentConfigurationState = {
  experimentDimension: ExperimentDimension;
  onExperimentDimensionChange: (dimension: ExperimentDimension) => void;
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
                    initialActions.isFrontPageLocked ||
                    initialActions.isPreprocessedImporting ||
                    initialActions.preprocessedDropboxImporting
                  }
                >
                  Load preprocessed experiment
                </button>
              </div>
            </div>
          ) : null}
          {frontPageMode === 'configuring' ? (
            <ExperimentConfiguration
              experimentDimension={experimentConfiguration.experimentDimension}
              onExperimentDimensionChange={experimentConfiguration.onExperimentDimensionChange}
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
              onChannelTrackFileSelected={channelListPanel.onChannelTrackFileSelected}
              onChannelTrackDrop={channelListPanel.onChannelTrackDrop}
              onChannelTrackClear={channelListPanel.onChannelTrackClear}
              experimentDimension={channelListPanel.experimentDimension}
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
                  const trackSummary = preprocessedSummary.computeTrackSummary(summary.trackEntries);
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
                          {trackSummary.uniqueTracks > 0
                            ? `${trackSummary.uniqueTracks} tracks (${trackSummary.totalRows} rows)`
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
            onLaunchViewer={launchActions.onLaunchViewer}
            isLaunchingViewer={launchActions.isLaunchingViewer}
            launchButtonEnabled={launchActions.launchButtonEnabled}
            launchButtonLaunchable={launchActions.launchButtonLaunchable}
            onExportPreprocessedExperiment={launchActions.onExportPreprocessedExperiment}
            isExportingPreprocessed={launchActions.isExportingPreprocessed}
            canLaunch={launchActions.canLaunch}
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
