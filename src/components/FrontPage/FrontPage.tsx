import type {
  ChangeEvent,
  DragEvent,
  FormEvent,
  MutableRefObject
} from 'react';
import ChannelCard from '../ChannelCard/ChannelCard';
import FloatingWindow from '../FloatingWindow';
import type { ChannelSource, ChannelValidation } from '../../types/channelSources';
import type { StagedPreprocessedExperiment } from '../../types/preprocessed';
import type { DropboxAppKeySource } from '../../integrations/dropbox';
import { classNames } from '../../utils/classNames';
import { formatBytes } from '../../errors';
import styles from './FrontPage.module.css';

type ChannelTabState = {
  channels: ChannelSource[];
  activeChannelId: string | null;
  editingChannelId: string | null;
  validationMap: Map<string, ChannelValidation>;
};

type ChannelHandlers = {
  onAddChannel: () => void;
  onRemoveChannel: (channelId: string) => void;
  onSelectChannel: (channelId: string) => void;
  onChannelNameChange: (channelId: string, value: string) => void;
  onChannelEditStart: (channelId: string, currentName: string) => void;
  onChannelEditCommit: () => void;
  onChannelEditCancel: (channelId: string) => void;
  editingInputRef: MutableRefObject<HTMLInputElement | null>;
};

type ChannelCardHandlers = {
  onLayerFilesAdded: (id: string, files: File[]) => void;
  onLayerDrop: (id: string, dataTransfer: DataTransfer) => void;
  onLayerSegmentationToggle: (channelId: string, layerId: string, value: boolean) => void;
  onLayerRemove: (channelId: string, layerId: string) => void;
  onTrackFileSelected: (channelId: string, file: File | null) => void;
  onTrackDrop: (channelId: string, dataTransfer: DataTransfer) => void;
  onTrackClear: (channelId: string) => void;
};

type PreprocessedLoaderHandlers = {
  onOpen: () => void;
  onClose: () => void;
  onBrowse: () => void;
  onDropboxImport: () => void;
  onDragEnter: (event: DragEvent<HTMLDivElement>) => void;
  onDragLeave: (event: DragEvent<HTMLDivElement>) => void;
  onDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  onFileInputChange: (event: ChangeEvent<HTMLInputElement>) => void;
  fileInputRef: MutableRefObject<HTMLInputElement | null>;
  onDropboxConfigSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onDropboxConfigInputChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onDropboxConfigCancel: () => void;
  onDropboxConfigClear: () => void;
};

type PreprocessedLoaderState = {
  isOpen: boolean;
  isImporting: boolean;
  isDropboxImporting: boolean;
  isDragActive: boolean;
  importError: string | null;
  dropboxError: string | null;
  dropboxInfo: string | null;
  isDropboxConfigOpen: boolean;
  dropboxAppKeyInput: string;
  dropboxAppKeySource: DropboxAppKeySource | null;
};

type PreprocessedSummaryProps = {
  experiment: StagedPreprocessedExperiment | null;
  onDiscard: () => void;
  isExporting: boolean;
};

type FrontPageControls = {
  hasGlobalTimepointMismatch: boolean;
  interactionErrorMessage: string | null;
  launchErrorMessage: string | null;
  isLaunchingViewer: boolean;
  launchButtonEnabled: boolean;
  launchButtonLaunchable: boolean;
  canLaunch: boolean;
  onLaunchViewer: () => void;
  onExportPreprocessedExperiment: () => void;
};

type FrontPageWarnings = {
  warningWindowWidth: number;
  warningWindowInitialPosition: { x: number; y: number };
  datasetErrorResetSignal: number;
  onDatasetErrorDismiss: () => void;
  warningWindowClassName: string;
  warningWindowBodyClassName: string;
};

type FrontPageProps = {
  backgroundVideoSrc: string;
  frontPageMode: 'initial' | 'configuring' | 'preprocessed';
  isFrontPageLocked: boolean;
  channelState: ChannelTabState;
  channelHandlers: ChannelHandlers;
  channelCardHandlers: ChannelCardHandlers;
  preprocessedState: PreprocessedLoaderState;
  preprocessedHandlers: PreprocessedLoaderHandlers;
  preprocessedSummary: PreprocessedSummaryProps;
  controls: FrontPageControls;
  warnings: FrontPageWarnings;
};

const computeTrackSummary = (entries: string[][]): { totalRows: number; uniqueTracks: number } => {
  if (entries.length === 0) {
    return { totalRows: 0, uniqueTracks: 0 };
  }
  const identifiers = new Set<string>();
  for (const row of entries) {
    if (row.length === 0) {
      continue;
    }
    identifiers.add(row[0] ?? '');
  }
  return {
    totalRows: entries.length,
    uniqueTracks: identifiers.size
  };
};

export default function FrontPage({
  backgroundVideoSrc,
  frontPageMode,
  isFrontPageLocked,
  channelState,
  channelHandlers,
  channelCardHandlers,
  preprocessedState,
  preprocessedHandlers,
  preprocessedSummary,
  controls,
  warnings
}: FrontPageProps) {
  const { channels, activeChannelId, editingChannelId, validationMap } = channelState;
  const {
    onAddChannel,
    onRemoveChannel,
    onSelectChannel,
    onChannelNameChange,
    onChannelEditStart,
    onChannelEditCommit,
    onChannelEditCancel,
    editingInputRef
  } = channelHandlers;
  const activeChannel = channels.find((channel) => channel.id === activeChannelId) ?? null;

  const startEditingChannel = (channel: ChannelSource) => {
    if (isFrontPageLocked || editingChannelId === channel.id) {
      return;
    }
    onChannelEditStart(channel.id, channel.name);
  };

  const renderChannelTabs = () => {
    if (channels.length === 0) {
      return null;
    }
    return (
      <>
        <div className={styles.channelTabs} role="tablist" aria-label="Configured channels">
          {channels.map((channel) => {
            const validation = validationMap.get(channel.id) ?? { errors: [], warnings: [] };
            const isActive = channel.id === activeChannelId;
            const isEditing = editingChannelId === channel.id;
            const trimmedChannelName = channel.name.trim();
            const removeLabel = trimmedChannelName ? `Remove ${trimmedChannelName}` : 'Remove channel';
            const tabMeta = buildChannelTabMeta(channel, validation);
            const tabClassName = classNames(
              styles.channelTab,
              isActive && styles.isActive,
              validation.errors.length > 0 && styles.hasError,
              validation.errors.length === 0 && validation.warnings.length > 0 && styles.hasWarning,
              isFrontPageLocked && styles.isDisabled,
              isEditing && styles.isEditing
            );

            if (isEditing) {
              return (
                <div
                  key={channel.id}
                  id={`${channel.id}-tab`}
                  className={tabClassName}
                  role="tab"
                  aria-selected={isActive}
                  aria-controls="channel-detail-panel"
                  tabIndex={isFrontPageLocked ? -1 : 0}
                  aria-disabled={isFrontPageLocked}
                  onClick={() => {
                    if (isFrontPageLocked) {
                      return;
                    }
                    onSelectChannel(channel.id);
                  }}
                  onKeyDown={(event) => {
                    if (isFrontPageLocked) {
                      event.preventDefault();
                      return;
                    }
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onSelectChannel(channel.id);
                    }
                  }}
                >
                  <span className={styles.channelTabText}>
                    <input
                      ref={editingInputRef}
                      className={styles.channelTabNameInput}
                      value={channel.name}
                      onChange={(event) => onChannelNameChange(channel.id, event.target.value)}
                      placeholder="Insert channel name here"
                      onBlur={() => {
                        onChannelEditCommit();
                      }}
                      onKeyDown={(event) => {
                        if (isFrontPageLocked) {
                          event.preventDefault();
                          return;
                        }
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          onChannelEditCommit();
                        } else if (event.key === 'Escape') {
                          event.preventDefault();
                          onChannelEditCancel(channel.id);
                        }
                      }}
                      aria-label="Channel name"
                      autoComplete="off"
                      autoFocus
                      disabled={isFrontPageLocked}
                    />
                    <span className={styles.channelTabMeta}>{tabMeta}</span>
                  </span>
                  <button
                    type="button"
                    className={styles.channelTabRemove}
                    aria-label={removeLabel}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      if (isFrontPageLocked) {
                        return;
                      }
                      onRemoveChannel(channel.id);
                    }}
                    disabled={isFrontPageLocked}
                  >
                    🗑️
                  </button>
                </div>
              );
            }

            return (
              <div
                key={channel.id}
                id={`${channel.id}-tab`}
                className={tabClassName}
                role="tab"
                aria-selected={isActive}
                aria-controls="channel-detail-panel"
                tabIndex={isFrontPageLocked ? -1 : 0}
                aria-disabled={isFrontPageLocked}
                onClick={() => {
                  if (isFrontPageLocked) {
                    return;
                  }
                  if (!isActive) {
                    onSelectChannel(channel.id);
                    return;
                  }
                  startEditingChannel(channel);
                }}
                onKeyDown={(event) => {
                  if (isFrontPageLocked) {
                    event.preventDefault();
                    return;
                  }
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    if (!isActive) {
                      onSelectChannel(channel.id);
                    } else {
                      startEditingChannel(channel);
                    }
                  }
                }}
              >
                <span className={styles.channelTabText}>
                  <span className={styles.channelTabName}>
                    {trimmedChannelName ? (
                      trimmedChannelName
                    ) : (
                      <span className={styles.channelTabPlaceholder}>Insert channel name here</span>
                    )}
                  </span>
                  <span className={styles.channelTabMeta}>{tabMeta}</span>
                </span>
                <button
                  type="button"
                  className={styles.channelTabRemove}
                  aria-label={removeLabel}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    if (isFrontPageLocked) {
                      return;
                    }
                    onRemoveChannel(channel.id);
                  }}
                  disabled={isFrontPageLocked}
                >
                  🗑️
                </button>
              </div>
            );
          })}
        </div>
        <div
          className={styles.channelPanel}
          role="tabpanel"
          id="channel-detail-panel"
          aria-labelledby={activeChannel ? `${activeChannel.id}-tab` : undefined}
        >
          {activeChannel ? (
            <ChannelCard
              key={activeChannel.id}
              channel={activeChannel}
              validation={validationMap.get(activeChannel.id) ?? { errors: [], warnings: [] }}
              isDisabled={isFrontPageLocked}
              {...channelCardHandlers}
            />
          ) : (
            <p className={styles.channelPanelPlaceholder}>Select a channel to edit it.</p>
          )}
        </div>
      </>
    );
  };

  const renderPreprocessedSummary = () => {
    const { experiment, onDiscard, isExporting } = preprocessedSummary;
    if (!experiment) {
      return null;
    }
    return (
      <div className={styles.preprocessedSummary}>
        <div className={styles.preprocessedSummaryHeader}>
          <h2>Loaded preprocessed experiment</h2>
          <p className={styles.preprocessedSummaryMeta}>
            {experiment.sourceName ?? 'Imported dataset'}
            {typeof experiment.sourceSize === 'number' ? ` · ${formatBytes(experiment.sourceSize)}` : ''}
            {experiment.totalVolumeCount > 0 ? ` · ${experiment.totalVolumeCount} volumes` : ''}
          </p>
        </div>
        <ul className={styles.preprocessedSummaryList}>
          {experiment.channelSummaries.map((summary) => {
            const trackSummary = computeTrackSummary(summary.trackEntries);
            return (
              <li key={summary.id} className={styles.preprocessedSummaryItem}>
                <div className={styles.preprocessedSummaryChannel}>
                  <h3>{summary.name}</h3>
                  <ul className={styles.preprocessedSummaryLayerList}>
                    {summary.layers.map((layer) => (
                      <li key={layer.key} className={styles.preprocessedSummaryLayer}>
                        <span className={styles.preprocessedSummaryLayerTitle}>
                          {layer.label}
                          {layer.isSegmentation ? (
                            <span className={styles.preprocessedSummaryLayerFlag}>Segmentation</span>
                          ) : null}
                        </span>
                        <span className={styles.preprocessedSummaryLayerMeta}>
                          {layer.volumeCount} timepoints · {layer.width}×{layer.height}×{layer.depth} · {layer.channels}{' '}
                          channels
                        </span>
                        <span className={styles.preprocessedSummaryLayerRange}>
                          Range: {layer.min}–{layer.max}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className={styles.preprocessedSummaryTracks}>
                    {trackSummary.uniqueTracks > 0
                      ? `${trackSummary.uniqueTracks} tracks (${trackSummary.totalRows} rows)`
                      : 'No tracks attached'}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
        <div className={styles.preprocessedSummaryActions}>
          <button
            type="button"
            className={styles.preprocessedSummaryButton}
            onClick={onDiscard}
            disabled={isExporting}
          >
            Discard preprocessed experiment
          </button>
        </div>
      </div>
    );
  };

  const renderPreprocessedLoader = () => {
    const {
      isOpen,
      isImporting,
      isDropboxImporting,
      isDragActive,
      importError,
      dropboxError,
      dropboxInfo,
      isDropboxConfigOpen,
      dropboxAppKeyInput,
      dropboxAppKeySource
    } = preprocessedState;
    const {
      onClose,
      onBrowse,
      onDropboxImport,
      onDragEnter,
      onDragLeave,
      onDragOver,
      onDrop,
      onFileInputChange,
      fileInputRef,
      onDropboxConfigSubmit,
      onDropboxConfigInputChange,
      onDropboxConfigCancel,
      onDropboxConfigClear
    } = preprocessedHandlers;

    if (frontPageMode === 'preprocessed') {
      return null;
    }

    if (!isOpen) {
      return null;
    }

    return (
      <div
        className={classNames(styles.preprocessedLoader, isDragActive && styles.isActive)}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        <input
          ref={fileInputRef}
          className={styles.fileDropInput}
          type="file"
          accept=".zip,.llsm,.llsmz,.json"
          onChange={onFileInputChange}
          disabled={isImporting || isDropboxImporting}
        />
        <div className={styles.preprocessedLoaderContent}>
          <div className={styles.preprocessedLoaderRow}>
            <div className={styles.preprocessedLoaderButtons}>
              <button
                type="button"
                className={styles.channelAddButton}
                onClick={onBrowse}
                disabled={isImporting || isDropboxImporting}
              >
                From files
              </button>
              <button
                type="button"
                className={styles.channelAddButton}
                onClick={onDropboxImport}
                disabled={isImporting || isDropboxImporting}
              >
                {isDropboxImporting ? 'Importing…' : 'From Dropbox'}
              </button>
              <p className={styles.preprocessedLoaderSubtitle}>Or drop file here</p>
            </div>
            <button
              type="button"
              className={styles.preprocessedLoaderCancel}
              onClick={onClose}
              disabled={isImporting || isDropboxImporting}
            >
              Cancel
            </button>
          </div>
          {isImporting ? <p className={styles.preprocessedLoaderStatus}>Loading preprocessed dataset…</p> : null}
          {importError ? <p className={styles.preprocessedLoaderError}>{importError}</p> : null}
          {dropboxError ? <p className={styles.preprocessedLoaderError}>{dropboxError}</p> : null}
          {dropboxInfo ? <p className={styles.preprocessedLoaderInfo}>{dropboxInfo}</p> : null}
          {isDropboxConfigOpen ? (
            <form className={styles.preprocessedDropboxConfig} onSubmit={onDropboxConfigSubmit} noValidate>
              <label className={styles.preprocessedDropboxConfigLabel}>
                Dropbox app key
                <input
                  value={dropboxAppKeyInput}
                  onChange={onDropboxConfigInputChange}
                  disabled={dropboxAppKeySource === 'env'}
                />
              </label>
              <p className={styles.preprocessedDropboxConfigHint}>Add your Dropbox app key to enable imports.</p>
              <div className={styles.preprocessedDropboxConfigActions}>
                <button type="submit" className={styles.preprocessedDropboxConfigSave}>
                  {dropboxAppKeySource === 'env' ? 'Close' : 'Save app key'}
                </button>
                <button
                  type="button"
                  className={styles.preprocessedDropboxConfigCancel}
                  onClick={onDropboxConfigCancel}
                >
                  Cancel
                </button>
                {dropboxAppKeySource === 'local' ? (
                  <button
                    type="button"
                    className={styles.preprocessedDropboxConfigClear}
                    onClick={onDropboxConfigClear}
                  >
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

  const renderChannelBoard = () => {
    if (frontPageMode !== 'configuring') {
      return null;
    }
    return <div className={styles.channelBoard}>{renderChannelTabs()}</div>;
  };

  const {
    hasGlobalTimepointMismatch,
    interactionErrorMessage,
    launchErrorMessage,
    isLaunchingViewer,
    launchButtonEnabled,
    launchButtonLaunchable,
    canLaunch,
    onLaunchViewer,
    onExportPreprocessedExperiment
  } = controls;

  const {
    warningWindowWidth,
    warningWindowInitialPosition,
    datasetErrorResetSignal,
    onDatasetErrorDismiss,
    warningWindowClassName,
    warningWindowBodyClassName
  } = warnings;

  return (
    <div className={classNames(styles.app, styles.frontPageMode)}>
      <video
        className={styles.appBackgroundVideo}
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        aria-hidden="true"
      >
        <source src={backgroundVideoSrc} type="video/mp4" />
      </video>
      <div className={styles.frontPage}>
        <div className={classNames(styles.frontPageCard, isFrontPageLocked && styles.isLoading)}>
          <header className={styles.frontPageHeader}>
            <h1>4D microscopy viewer</h1>
          </header>
          {frontPageMode !== 'preprocessed' ? (
            <div className={styles.channelAddActions}>
              {frontPageMode === 'initial' ? (
                <div className={styles.channelAddInitial}>
                  <button
                    type="button"
                    className={styles.channelAddButton}
                    onClick={onAddChannel}
                    disabled={isFrontPageLocked}
                  >
                    Set up new experiment
                  </button>
                  <button
                    type="button"
                    className={styles.channelAddButton}
                    onClick={preprocessedHandlers.onOpen}
                    disabled={isFrontPageLocked || preprocessedState.isImporting || preprocessedState.isDropboxImporting}
                  >
                    Load preprocessed experiment
                  </button>
                </div>
              ) : (
                <div className={styles.channelAddConfiguring}>
                  <button
                    type="button"
                    className={styles.channelAddButton}
                    onClick={onAddChannel}
                    disabled={isFrontPageLocked}
                  >
                    Add new channel
                  </button>
                </div>
              )}
            </div>
          ) : null}
          {renderPreprocessedLoader()}
          {renderChannelBoard()}
          {frontPageMode === 'preprocessed' ? renderPreprocessedSummary() : null}
          {frontPageMode === 'configuring' && hasGlobalTimepointMismatch ? (
            <p className={classNames(styles.launchFeedback, styles.launchFeedbackWarning)}>
              Timepoint counts differ across channels. Align them before launching.
            </p>
          ) : null}
          {interactionErrorMessage ? (
            <p className={classNames(styles.launchFeedback, styles.launchFeedbackError)}>
              {interactionErrorMessage}
            </p>
          ) : null}
          {launchErrorMessage ? (
            <p className={classNames(styles.launchFeedback, styles.launchFeedbackError)}>{launchErrorMessage}</p>
          ) : null}
          <div className={styles.frontPageActions}>
            <button
              type="button"
              className={styles.launchViewerButton}
              onClick={onLaunchViewer}
              disabled={isLaunchingViewer || !launchButtonEnabled}
              data-launchable={launchButtonLaunchable}
            >
              {isLaunchingViewer ? 'Loading…' : 'Launch viewer'}
            </button>
            {frontPageMode !== 'initial' ? (
              <button
                type="button"
                className={styles.exportPreprocessedButton}
                onClick={onExportPreprocessedExperiment}
                disabled={
                  preprocessedSummary.isExporting ||
                  isLaunchingViewer ||
                  (frontPageMode === 'configuring' && !canLaunch)
                }
              >
                {preprocessedSummary.isExporting ? 'Exporting…' : 'Export preprocessed experiment'}
              </button>
            ) : null}
          </div>
        </div>
        {launchErrorMessage ? (
          <FloatingWindow
            title="Cannot launch viewer"
            className={warningWindowClassName}
            bodyClassName={warningWindowBodyClassName}
            width={warningWindowWidth}
            initialPosition={warningWindowInitialPosition}
            resetSignal={datasetErrorResetSignal}
          >
            <div className={styles.warningWindowContent}>
              <p className={styles.warningWindowIntro}>The viewer could not be launched.</p>
              <p className={styles.warningWindowMessage}>{launchErrorMessage}</p>
              <p className={styles.warningWindowHint}>Review the dataset configuration and try again.</p>
              <div className={styles.warningWindowActions}>
                <button
                  type="button"
                  className={styles.warningWindowActionButton}
                  onClick={onDatasetErrorDismiss}
                >
                  Got it
                </button>
              </div>
            </div>
          </FloatingWindow>
        ) : null}
      </div>
    </div>
  );
}

const buildChannelTabMeta = (channel: ChannelSource, validation: ChannelValidation): string => {
  const parts: string[] = [];
  if (channel.layers.length === 0) {
    parts.push('No volume selected');
  } else {
    const primaryLayer = channel.layers[0];
    const totalFiles = primaryLayer.files.length;
    const fileLabel = totalFiles === 1 ? 'file' : 'files';
    parts.push(`${totalFiles} ${fileLabel}`);
  }
  if (channel.trackEntries.length > 0) {
    parts.push('Tracks attached');
  } else if (channel.trackStatus === 'loading') {
    parts.push('Tracks loading');
  }
  if (channel.layers.length === 0) {
    parts.push('add a volume');
  } else if (validation.errors.length > 0) {
    const hasNameError = validation.errors.includes('Name this channel.');
    parts.push(hasNameError ? 'Insert channel name' : 'Needs attention');
  }
  return parts.join(' · ');
};
