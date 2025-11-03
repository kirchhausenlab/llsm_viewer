import type {
  ChangeEvent,
  Dispatch,
  DragEvent,
  FormEvent,
  MutableRefObject,
  SetStateAction
} from 'react';
import ChannelCard from './ChannelCard';
import FloatingWindow from './FloatingWindow';
import { formatBytes } from '../errors';
import type { ChannelSource, ChannelValidation, StagedPreprocessedExperiment } from '../App';
import type { DropboxAppKeySource } from '../integrations/dropbox';

type TrackSummary = { totalRows: number; uniqueTracks: number };

type FrontPageProps = {
  backgroundVideoSrc: string;
  isFrontPageLocked: boolean;
  frontPageMode: 'initial' | 'configuring' | 'preprocessed';
  channels: ChannelSource[];
  activeChannelId: string | null;
  activeChannel: ChannelSource | null;
  channelValidationMap: Map<string, ChannelValidation>;
  editingChannelId: string | null;
  editingChannelInputRef: MutableRefObject<HTMLInputElement | null>;
  editingChannelOriginalNameRef: MutableRefObject<string>;
  setActiveChannelId: Dispatch<SetStateAction<string | null>>;
  setEditingChannelId: Dispatch<SetStateAction<string | null>>;
  onAddChannel: () => void;
  onOpenPreprocessedLoader: () => void;
  isPreprocessedLoaderOpen: boolean;
  isPreprocessedDragActive: boolean;
  onPreprocessedDragEnter: (event: DragEvent<HTMLDivElement>) => void;
  onPreprocessedDragLeave: (event: DragEvent<HTMLDivElement>) => void;
  onPreprocessedDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onPreprocessedDrop: (event: DragEvent<HTMLDivElement>) => void;
  preprocessedFileInputRef: MutableRefObject<HTMLInputElement | null>;
  onPreprocessedFileInputChange: (event: ChangeEvent<HTMLInputElement>) => void;
  isPreprocessedImporting: boolean;
  preprocessedDropboxImporting: boolean;
  onPreprocessedBrowse: () => void;
  onPreprocessedDropboxImport: () => void;
  onPreprocessedLoaderClose: () => void;
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
  onChannelNameChange: (channelId: string, name: string) => void;
  onRemoveChannel: (channelId: string) => void;
  onChannelLayerFilesAdded: (channelId: string, files: File[]) => void;
  onChannelLayerDrop: (channelId: string, dataTransfer: DataTransfer) => void;
  onChannelLayerSegmentationToggle: (channelId: string, layerId: string, value: boolean) => void;
  onChannelLayerRemove: (channelId: string, layerId: string) => void;
  onChannelTrackFileSelected: (channelId: string, file: File | null) => void;
  onChannelTrackDrop: (channelId: string, dataTransfer: DataTransfer) => void;
  onChannelTrackClear: (channelId: string) => void;
  preprocessedExperiment: StagedPreprocessedExperiment | null;
  computeTrackSummary: (entries: string[][]) => TrackSummary;
  hasGlobalTimepointMismatch: boolean;
  interactionErrorMessage: string | null;
  launchErrorMessage: string | null;
  onLaunchViewer: () => void;
  isLaunchingViewer: boolean;
  launchButtonEnabled: boolean;
  launchButtonLaunchable: 'true' | 'false';
  onExportPreprocessedExperiment: () => void;
  isExportingPreprocessed: boolean;
  canLaunch: boolean;
  warningWindowInitialPosition: { x: number; y: number };
  warningWindowWidth: number;
  datasetErrorResetSignal: number;
  onDatasetErrorDismiss: () => void;
};

const getChannelLayerSummary = (channel: ChannelSource): string => {
  if (channel.layers.length === 0) {
    return 'No volume selected';
  }
  const primaryLayer = channel.layers[0];
  const totalFiles = primaryLayer.files.length;
  const fileLabel = totalFiles === 1 ? 'file' : 'files';
  return `${totalFiles} ${fileLabel}`;
};

const buildChannelTabMeta = (channel: ChannelSource, validation: ChannelValidation): string => {
  const parts: string[] = [getChannelLayerSummary(channel)];
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
  } else if (validation.warnings.length > 0) {
    const hasNoTracksWarning = validation.warnings.some(
      (warning) => warning === 'No tracks attached to this channel.'
    );
    parts.push(hasNoTracksWarning ? 'no tracks attached' : 'Warnings');
  }
  return parts.join(' · ');
};

export default function FrontPage({
  backgroundVideoSrc,
  isFrontPageLocked,
  frontPageMode,
  channels,
  activeChannelId,
  activeChannel,
  channelValidationMap,
  editingChannelId,
  editingChannelInputRef,
  editingChannelOriginalNameRef,
  setActiveChannelId,
  setEditingChannelId,
  onAddChannel,
  onOpenPreprocessedLoader,
  isPreprocessedLoaderOpen,
  isPreprocessedDragActive,
  onPreprocessedDragEnter,
  onPreprocessedDragLeave,
  onPreprocessedDragOver,
  onPreprocessedDrop,
  preprocessedFileInputRef,
  onPreprocessedFileInputChange,
  isPreprocessedImporting,
  preprocessedDropboxImporting,
  onPreprocessedBrowse,
  onPreprocessedDropboxImport,
  onPreprocessedLoaderClose,
  preprocessedImportError,
  preprocessedDropboxError,
  preprocessedDropboxInfo,
  isPreprocessedDropboxConfigOpen,
  onPreprocessedDropboxConfigSubmit,
  preprocessedDropboxAppKeyInput,
  onPreprocessedDropboxConfigInputChange,
  preprocessedDropboxAppKeySource,
  onPreprocessedDropboxConfigCancel,
  onPreprocessedDropboxConfigClear,
  onChannelNameChange,
  onRemoveChannel,
  onChannelLayerFilesAdded,
  onChannelLayerDrop,
  onChannelLayerSegmentationToggle,
  onChannelLayerRemove,
  onChannelTrackFileSelected,
  onChannelTrackDrop,
  onChannelTrackClear,
  preprocessedExperiment,
  computeTrackSummary,
  hasGlobalTimepointMismatch,
  interactionErrorMessage,
  launchErrorMessage,
  onLaunchViewer,
  isLaunchingViewer,
  launchButtonEnabled,
  launchButtonLaunchable,
  onExportPreprocessedExperiment,
  isExportingPreprocessed,
  canLaunch,
  warningWindowInitialPosition,
  warningWindowWidth,
  datasetErrorResetSignal,
  onDatasetErrorDismiss
}: FrontPageProps) {
  return (
    <div className="app front-page-mode">
      <video
        className="app-background-video"
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        aria-hidden="true"
      >
        <source src={backgroundVideoSrc} type="video/mp4" />
      </video>
      <div className="front-page">
        <div className={`front-page-card${isFrontPageLocked ? ' is-loading' : ''}`}>
          <header className="front-page-header">
            <h1>4D viewer</h1>
          </header>
          {frontPageMode !== 'preprocessed' ? (
            <div className="channel-add-actions">
              {frontPageMode === 'initial' ? (
                <div className="channel-add-initial">
                  <button
                    type="button"
                    className="channel-add-button"
                    onClick={onAddChannel}
                    disabled={isFrontPageLocked}
                  >
                    Set up new experiment
                  </button>
                  <button
                    type="button"
                    className="channel-add-button"
                    onClick={onOpenPreprocessedLoader}
                    disabled={isFrontPageLocked || isPreprocessedImporting || preprocessedDropboxImporting}
                  >
                    Load preprocessed experiment
                  </button>
                </div>
              ) : (
                <div className="channel-add-configuring">
                  <button
                    type="button"
                    className="channel-add-button"
                    onClick={onAddChannel}
                    disabled={isFrontPageLocked}
                  >
                    Add new channel
                  </button>
                </div>
              )}
            </div>
          ) : null}
          {frontPageMode !== 'preprocessed' && isPreprocessedLoaderOpen ? (
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
                  <button
                    type="button"
                    className="preprocessed-loader-cancel"
                    onClick={onPreprocessedLoaderClose}
                    disabled={isPreprocessedImporting || preprocessedDropboxImporting}
                  >
                    Cancel
                  </button>
                </div>
                {isPreprocessedImporting ? (
                  <p className="preprocessed-loader-status">Loading preprocessed dataset…</p>
                ) : null}
                {preprocessedImportError ? (
                  <p className="preprocessed-loader-error">{preprocessedImportError}</p>
                ) : null}
                {preprocessedDropboxError ? (
                  <p className="preprocessed-loader-error">{preprocessedDropboxError}</p>
                ) : null}
                {preprocessedDropboxInfo ? (
                  <p className="preprocessed-loader-info">{preprocessedDropboxInfo}</p>
                ) : null}
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
                    <p className="preprocessed-dropbox-config-hint">
                      Add your Dropbox app key to enable imports.
                    </p>
                    <div className="preprocessed-dropbox-config-actions">
                      <button type="submit" className="preprocessed-dropbox-config-save">
                        {preprocessedDropboxAppKeySource === 'env' ? 'Close' : 'Save app key'}
                      </button>
                      <button
                        type="button"
                        className="preprocessed-dropbox-config-cancel"
                        onClick={onPreprocessedDropboxConfigCancel}
                      >
                        Cancel
                      </button>
                      {preprocessedDropboxAppKeySource === 'local' ? (
                        <button
                          type="button"
                          className="preprocessed-dropbox-config-clear"
                          onClick={onPreprocessedDropboxConfigClear}
                        >
                          Remove saved key
                        </button>
                      ) : null}
                    </div>
                  </form>
                ) : null}
              </div>
            </div>
          ) : null}
          {frontPageMode === 'configuring' ? (
            <div className="channel-board">
              {channels.length > 0 ? (
                <>
                  <div className="channel-tabs" role="tablist" aria-label="Configured channels">
                    {channels.map((channel) => {
                      const validation = channelValidationMap.get(channel.id) ?? { errors: [], warnings: [] };
                      const isActive = channel.id === activeChannelId;
                      const isEditing = editingChannelId === channel.id;
                      const trimmedChannelName = channel.name.trim();
                      const removeLabel = trimmedChannelName ? `Remove ${trimmedChannelName}` : 'Remove channel';
                      const tabClassName = [
                        'channel-tab',
                        isActive ? 'is-active' : '',
                        validation.errors.length > 0 ? 'has-error' : '',
                        validation.errors.length === 0 && validation.warnings.length > 0 ? 'has-warning' : '',
                        isFrontPageLocked ? 'is-disabled' : ''
                      ]
                        .filter(Boolean)
                        .join(' ');
                      const tabMeta = buildChannelTabMeta(channel, validation);
                      const startEditingChannelName = () => {
                        if (isFrontPageLocked || editingChannelId === channel.id) {
                          return;
                        }
                        editingChannelOriginalNameRef.current = channel.name;
                        setEditingChannelId(channel.id);
                      };
                      if (isEditing) {
                        return (
                          <div
                            key={channel.id}
                            id={`${channel.id}-tab`}
                            className={`${tabClassName} is-editing`}
                            role="tab"
                            aria-selected={isActive}
                            aria-controls="channel-detail-panel"
                            tabIndex={isFrontPageLocked ? -1 : 0}
                            aria-disabled={isFrontPageLocked}
                            onClick={() => {
                              if (isFrontPageLocked) {
                                return;
                              }
                              setActiveChannelId(channel.id);
                            }}
                            onKeyDown={(event) => {
                              if (isFrontPageLocked) {
                                event.preventDefault();
                                return;
                              }
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                setActiveChannelId(channel.id);
                              }
                            }}
                          >
                            <span className="channel-tab-text">
                              <input
                                ref={(node) => {
                                  editingChannelInputRef.current = node;
                                }}
                                className="channel-tab-name-input"
                                value={channel.name}
                                onChange={(event) => onChannelNameChange(channel.id, event.target.value)}
                                placeholder="Insert channel name here"
                                onBlur={() => {
                                  editingChannelInputRef.current = null;
                                  setEditingChannelId(null);
                                }}
                                onKeyDown={(event) => {
                                  if (isFrontPageLocked) {
                                    event.preventDefault();
                                    return;
                                  }
                                  if (event.key === 'Enter') {
                                    event.preventDefault();
                                    editingChannelInputRef.current = null;
                                    setEditingChannelId(null);
                                  } else if (event.key === 'Escape') {
                                    event.preventDefault();
                                    onChannelNameChange(channel.id, editingChannelOriginalNameRef.current);
                                    editingChannelInputRef.current = null;
                                    setEditingChannelId(null);
                                  }
                                }}
                                aria-label="Channel name"
                                autoComplete="off"
                                autoFocus
                                disabled={isFrontPageLocked}
                              />
                              <span className="channel-tab-meta">{tabMeta}</span>
                            </span>
                            <button
                              type="button"
                              className="channel-tab-remove"
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
                              setActiveChannelId(channel.id);
                              return;
                            }
                            startEditingChannelName();
                          }}
                          onKeyDown={(event) => {
                            if (isFrontPageLocked) {
                              event.preventDefault();
                              return;
                            }
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              if (!isActive) {
                                setActiveChannelId(channel.id);
                              } else {
                                startEditingChannelName();
                              }
                            }
                          }}
                        >
                          <span className="channel-tab-text">
                            <span className="channel-tab-name">
                              {trimmedChannelName ? (
                                trimmedChannelName
                              ) : (
                                <span className="channel-tab-placeholder">Insert channel name here</span>
                              )}
                            </span>
                            <span className="channel-tab-meta">{tabMeta}</span>
                          </span>
                          <button
                            type="button"
                            className="channel-tab-remove"
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
                    className="channel-panel"
                    role="tabpanel"
                    id="channel-detail-panel"
                    aria-labelledby={activeChannel ? `${activeChannel.id}-tab` : undefined}
                  >
                    {activeChannel ? (
                      <ChannelCard
                        key={activeChannel.id}
                        channel={activeChannel}
                        validation={channelValidationMap.get(activeChannel.id) ?? { errors: [], warnings: [] }}
                        isDisabled={isFrontPageLocked}
                        onLayerFilesAdded={onChannelLayerFilesAdded}
                        onLayerDrop={onChannelLayerDrop}
                        onLayerSegmentationToggle={onChannelLayerSegmentationToggle}
                        onLayerRemove={onChannelLayerRemove}
                        onTrackFileSelected={onChannelTrackFileSelected}
                        onTrackDrop={onChannelTrackDrop}
                        onTrackClear={onChannelTrackClear}
                      />
                    ) : (
                      <p className="channel-panel-placeholder">Select a channel to edit it.</p>
                    )}
                  </div>
                </>
              ) : null}
            </div>
          ) : null}
          {frontPageMode === 'preprocessed' && preprocessedExperiment ? (
            <div className="preprocessed-summary">
              <div className="preprocessed-summary-header">
                <h2>Loaded preprocessed experiment</h2>
                <p className="preprocessed-summary-meta">
                  {preprocessedExperiment.sourceName ?? 'Imported dataset'}
                  {typeof preprocessedExperiment.sourceSize === 'number'
                    ? ` · ${formatBytes(preprocessedExperiment.sourceSize)}`
                    : ''}
                  {preprocessedExperiment.totalVolumeCount > 0
                    ? ` · ${preprocessedExperiment.totalVolumeCount} volumes`
                    : ''}
                </p>
              </div>
              <ul className="preprocessed-summary-list">
                {preprocessedExperiment.channelSummaries.map((summary) => {
                  const trackSummary = computeTrackSummary(summary.trackEntries);
                  return (
                    <li key={summary.id} className="preprocessed-summary-item">
                      <div className="preprocessed-summary-channel">
                        <h3>{summary.name}</h3>
                        <ul className="preprocessed-summary-layer-list">
                          {summary.layers.map((layer) => (
                            <li key={layer.key} className="preprocessed-summary-layer">
                              <span className="preprocessed-summary-layer-title">
                                {layer.label}
                                {layer.isSegmentation ? (
                                  <span className="preprocessed-summary-layer-flag">Segmentation</span>
                                ) : null}
                              </span>
                              <span className="preprocessed-summary-layer-meta">
                                {layer.volumeCount} timepoints · {layer.width}×{layer.height}×{layer.depth} · {layer.channels} channels
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
              <div className="preprocessed-summary-actions">
                <button
                  type="button"
                  className="preprocessed-summary-button"
                  onClick={onExportPreprocessedExperiment}
                  disabled={isExportingPreprocessed}
                >
                  Discard preprocessed experiment
                </button>
              </div>
            </div>
          ) : null}
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
                disabled={
                  isExportingPreprocessed ||
                  isLaunchingViewer ||
                  (frontPageMode === 'configuring' && !canLaunch)
                }
              >
                {isExportingPreprocessed ? 'Exporting…' : 'Export preprocessed experiment'}
              </button>
            ) : null}
          </div>
        </div>
        {launchErrorMessage ? (
          <FloatingWindow
            title="Cannot launch viewer"
            className="floating-window--warning"
            bodyClassName="warning-window-body"
            width={warningWindowWidth}
            initialPosition={warningWindowInitialPosition}
            resetSignal={datasetErrorResetSignal}
          >
            <div className="warning-window-content">
              <p className="warning-window-intro">The viewer could not be launched.</p>
              <p className="warning-window-message">{launchErrorMessage}</p>
              <p className="warning-window-hint">Review the dataset configuration and try again.</p>
              <div className="warning-window-actions">
                <button
                  type="button"
                  className="warning-window-action-button"
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
