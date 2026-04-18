import { useMemo } from 'react';
import type { StagedPreprocessedExperiment } from '../../hooks/dataset';
import type {
  TemporalResolutionMetadata,
  TemporalResolutionUnit,
  VoxelResolutionAxis,
  VoxelResolutionInput,
  VoxelResolutionValues,
  VoxelResolutionUnit
} from '../../types/voxelResolution';
import ThemeModeToggle from '../app/ThemeModeToggle';
import FrontPageHeader from './FrontPageHeader';
import ExperimentConfiguration from './ExperimentConfiguration';
import PreprocessedLoader, { type PreprocessedLoaderProps } from './PreprocessedLoader';
import PublicExperimentLoader, { type PublicExperimentLoaderProps } from './PublicExperimentLoader';
import ChannelListPanel, { type ChannelListPanelProps } from './ChannelListPanel';
import LaunchActions, { type LaunchActionsProps } from './LaunchActions';
import WarningsWindow from './WarningsWindow';
import { formatBytes } from '../../errors';

export type TrackSummary = { totalPoints: number; totalTracks: number };
export type ExperimentType = '3d-movie' | '2d-movie' | 'single-3d-volume';

const EXPERIMENT_TYPE_OPTIONS: ReadonlyArray<{ type: ExperimentType; label: string }> = [
  { type: '3d-movie', label: '3D movie' },
  { type: '2d-movie', label: '2D movie' },
  { type: 'single-3d-volume', label: 'Single 3D volume' }
];

const formatSummaryNumber = (value: number): string => {
  if (!Number.isFinite(value)) {
    return 'Unavailable';
  }
  if (Number.isInteger(value)) {
    return value.toString();
  }
  return Number(value.toFixed(3)).toString();
};

const formatVoxelSize = (voxelResolution: VoxelResolutionValues | null | undefined): string | null => {
  if (!voxelResolution) {
    return null;
  }
  return `${formatSummaryNumber(voxelResolution.x)} × ${formatSummaryNumber(voxelResolution.y)} × ${formatSummaryNumber(voxelResolution.z)} ${voxelResolution.unit}`;
};

const formatFrameInterval = (
  temporalResolution: TemporalResolutionMetadata | null | undefined
): string | null => {
  if (!temporalResolution) {
    return null;
  }
  return `${formatSummaryNumber(temporalResolution.interval)} ${temporalResolution.unit}`;
};

export type InitialActionsProps = {
  isFrontPageLocked: boolean;
  onStartExperimentSetup: () => void;
  onOpenPreprocessedLoader: () => void;
  onOpenPublicExperimentLoader: () => void;
  isPreprocessedImporting: boolean;
};

export type ExperimentConfigurationState = {
  experimentType: ExperimentType;
  voxelResolution: VoxelResolutionInput;
  onVoxelResolutionAxisChange: (axis: VoxelResolutionAxis, value: string) => void;
  onVoxelResolutionUnitChange: (unit: VoxelResolutionUnit) => void;
  onVoxelResolutionTimeUnitChange: (unit: TemporalResolutionUnit) => void;
  onVoxelResolutionAnisotropyToggle: (value: boolean) => void;
  backgroundMaskEnabled: boolean;
  backgroundMaskValuesInput: string;
  backgroundMaskError: string | null;
  onBackgroundMaskToggle: (value: boolean) => void;
  onBackgroundMaskValuesInputChange: (value: string) => void;
  renderIn16Bit: boolean;
  onRenderIn16BitToggle: (value: boolean) => void;
};

export type PreprocessedSummaryProps = {
  preprocessedExperiment: StagedPreprocessedExperiment | null;
  computeTrackSummary: (summary: StagedPreprocessedExperiment['trackSummaries'][number]['header']) => TrackSummary;
};

type ExperimentTypeSelectionProps = {
  onSelectExperimentType: (type: ExperimentType) => void;
  isFrontPageLocked: boolean;
};

type HeaderProps = {
  onReturnToStart: () => void;
  isFrontPageLocked: boolean;
  versionLabel?: string | null;
  performanceNotice?: {
    title: string;
    lines: string[];
  } | null;
};

type FrontPageProps = {
  isFrontPageLocked: boolean;
  frontPageMode: 'initial' | 'experimentTypeSelection' | 'configuring' | 'preprocessed' | 'publicExperiments';
  header: HeaderProps;
  initialActions: InitialActionsProps;
  experimentTypeSelection: ExperimentTypeSelectionProps;
  experimentConfiguration: ExperimentConfigurationState;
  preprocessedLoader: PreprocessedLoaderProps;
  publicExperimentLoader: PublicExperimentLoaderProps;
  channelListPanel: Omit<ChannelListPanelProps, 'experimentType'>;
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
  publicExperimentLoader,
  channelListPanel,
  preprocessedSummary,
  launchActions,
  warningsWindow
}: FrontPageProps) {
  const headerTitle = useMemo(() => {
    if (frontPageMode === 'preprocessed') {
      return 'Loaded preprocessed experiment';
    }
    if (frontPageMode === 'publicExperiments') {
      return 'Load public experiments';
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
  const showAboutFooter = frontPageMode === 'initial' && !preprocessedLoader.isOpen;
  const preprocessedOverview = useMemo(() => {
    const experiment = preprocessedSummary.preprocessedExperiment;
    if (!experiment) {
      return null;
    }

    const channelSummaries = experiment.channelSummaries ?? [];
    const trackSummaries = experiment.trackSummaries ?? [];
    const allLayers = channelSummaries.flatMap((channel) => channel.layers ?? []);
    const manifestDataset = experiment.manifest?.dataset;
    const shapeLabels = [...new Set(allLayers.map((layer) => `${layer.width} × ${layer.height} × ${layer.depth}`))];
    const totalTimepoints =
      experiment.totalVolumeCount > 0
        ? experiment.totalVolumeCount
        : allLayers[0]?.volumeCount ?? 0;
    const trackTotals = trackSummaries.reduce(
      (acc, trackSet) => {
        const summary = preprocessedSummary.computeTrackSummary(trackSet.header);
        return {
          points: acc.points + summary.totalPoints,
          tracks: acc.tracks + summary.totalTracks
        };
      },
      { points: 0, tracks: 0 }
    );
    const boundTrackNamesByChannel = new Map<string, string[]>();
    const unboundTrackNames: string[] = [];

    for (const trackSet of trackSummaries) {
      const trackName = trackSet.name.trim() || trackSet.fileName.trim() || 'Unnamed track set';
      if (!trackSet.boundChannelId) {
        unboundTrackNames.push(trackName);
        continue;
      }
      const boundTracks = boundTrackNamesByChannel.get(trackSet.boundChannelId) ?? [];
      boundTracks.push(trackName);
      boundTrackNamesByChannel.set(trackSet.boundChannelId, boundTracks);
    }

    const facts = [
      {
        label: 'Timepoints',
        value: totalTimepoints > 0 ? formatSummaryNumber(totalTimepoints) : 'Unavailable'
      },
      {
        label: 'Shape (XYZ)',
        value:
          shapeLabels.length === 1
            ? shapeLabels[0] ?? 'Unavailable'
            : shapeLabels.length > 1
              ? 'Varies by channel'
              : 'Unavailable'
      },
      {
        label: 'Channels',
        value: formatSummaryNumber(channelSummaries.length)
      }
    ];
    const voxelSize = formatVoxelSize(manifestDataset?.voxelResolution ?? null);
    const frameInterval = formatFrameInterval(manifestDataset?.temporalResolution ?? null);

    if (voxelSize) {
      facts.push({ label: 'Voxel size', value: voxelSize });
    }
    if (frameInterval) {
      facts.push({ label: 'Frame interval', value: frameInterval });
    }
    if (trackSummaries.length > 0) {
      facts.push({
        label: 'Track sets',
        value: `${trackSummaries.length} · ${trackTotals.tracks} tracks (${trackTotals.points} points)`
      });
    }

    return {
      boundTrackNamesByChannel,
      facts,
      unboundTrackNames
    };
  }, [preprocessedSummary.computeTrackSummary, preprocessedSummary.preprocessedExperiment]);

  return (
    <div className="app front-page-mode">
      <ThemeModeToggle className="front-page-theme-toggle" />
      <div className="front-page">
        <div className={`front-page-card${isFrontPageLocked ? ' is-loading' : ''}`}>
          <FrontPageHeader
            title={headerTitle}
            showReturnButton={showReturnButton}
            onReturnToStart={header.onReturnToStart}
            isFrontPageLocked={header.isFrontPageLocked}
            versionLabel={header.versionLabel}
            performanceNotice={header.performanceNotice}
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
                <button
                  type="button"
                  className="channel-add-button channel-add-button-public"
                  onClick={initialActions.onOpenPublicExperimentLoader}
                  disabled={
                    initialActions.isFrontPageLocked || initialActions.isPreprocessedImporting
                  }
                >
                  Load public experiments
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
              backgroundMaskEnabled={experimentConfiguration.backgroundMaskEnabled}
              backgroundMaskValuesInput={experimentConfiguration.backgroundMaskValuesInput}
              backgroundMaskError={experimentConfiguration.backgroundMaskError}
              onBackgroundMaskToggle={experimentConfiguration.onBackgroundMaskToggle}
              onBackgroundMaskValuesInputChange={experimentConfiguration.onBackgroundMaskValuesInputChange}
              renderIn16Bit={experimentConfiguration.renderIn16Bit}
              onRenderIn16BitToggle={experimentConfiguration.onRenderIn16BitToggle}
              isFrontPageLocked={isFrontPageLocked}
            />
          ) : null}
          {frontPageMode !== 'preprocessed' && frontPageMode !== 'publicExperiments' ? (
            <PreprocessedLoader {...preprocessedLoader} />
          ) : null}
          {frontPageMode === 'publicExperiments' ? <PublicExperimentLoader {...publicExperimentLoader} /> : null}
          {frontPageMode === 'configuring' ? (
            <ChannelListPanel
              experimentType={experimentConfiguration.experimentType}
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
              onTrackSetTimepointConventionChange={channelListPanel.onTrackSetTimepointConventionChange}
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
                </p>
                {preprocessedOverview ? (
                  <ul className="preprocessed-summary-facts">
                    {preprocessedOverview.facts.map((fact) => (
                      <li key={fact.label} className="preprocessed-summary-fact">
                        <span className="preprocessed-summary-fact-label">{fact.label}</span>
                        <span className="preprocessed-summary-fact-value">{fact.value}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {preprocessedOverview && preprocessedOverview.unboundTrackNames.length > 0 ? (
                  <p className="preprocessed-summary-unbound-tracks">
                    Unbound track sets: {preprocessedOverview.unboundTrackNames.join(', ')}
                  </p>
                ) : null}
              </div>
              <ul className="preprocessed-summary-list">
                {preprocessedSummary.preprocessedExperiment.channelSummaries.map((
                  summary: StagedPreprocessedExperiment['channelSummaries'][number]
                ) => {
                  const boundTrackNames = preprocessedOverview?.boundTrackNamesByChannel.get(summary.id) ?? [];
                  const isSegmentation = summary.layers.some((layer: (typeof summary.layers)[number]) => layer.isSegmentation);
                  return (
                    <li key={summary.id} className="preprocessed-summary-item">
                      <div className="preprocessed-summary-channel">
                        <div className="preprocessed-summary-channel-header">
                          <h3>{summary.name}</h3>
                          {isSegmentation ? (
                            <span className="preprocessed-summary-layer-flag">Segmentation</span>
                          ) : null}
                        </div>
                        {boundTrackNames.length > 0 ? (
                          <p className="preprocessed-summary-channel-meta">
                            Tracks: {boundTrackNames.join(', ')}
                          </p>
                        ) : null}
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
            onLaunchViewerInPerformanceMode={launchActions.onLaunchViewerInPerformanceMode}
            isLaunchingViewer={launchActions.isLaunchingViewer}
            launchButtonEnabled={launchActions.launchButtonEnabled}
            launchButtonLaunchable={launchActions.launchButtonLaunchable}
          />
          {showAboutFooter ? (
            <footer className="front-page-about">
              <p>
                Developed by{' '}
                <a href="https://github.com/josedacostafilho" target="_blank" rel="noreferrer">
                  Jose Inacio Costa-Filho
                </a>{' '}
                in the{' '}
                <a href="https://kirchhausen.hms.harvard.edu/" target="_blank" rel="noreferrer">
                  Kirchhausen Lab
                </a>
                . Source code in{' '}
                <a href="https://github.com/kirchhausenlab/llsm_viewer" target="_blank" rel="noreferrer">
                  GitHub
                </a>
                . If you use Mirante4D in academic work, please cite{' '}
                <a
                  href="https://www.biorxiv.org/content/10.64898/2025.12.31.697247v2"
                  target="_blank"
                  rel="noreferrer"
                >
                  SpatialDINO
                </a>
                .
              </p>
            </footer>
          ) : null}
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
