import { useMemo } from 'react';
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
import type {
  ChannelSource,
  ChannelValidation,
  ExperimentDimension,
  StagedPreprocessedExperiment
} from '../App';
import type { DropboxAppKeySource } from '../integrations/dropbox';
import type { VoxelResolutionInput, VoxelResolutionUnit } from '../types/voxelResolution';
import { VOXEL_RESOLUTION_UNITS } from '../types/voxelResolution';

type TrackSummary = { totalRows: number; uniqueTracks: number };

type VoxelResolutionAxis = 'x' | 'y' | 'z';

const VOXEL_RESOLUTION_AXES: ReadonlyArray<{ axis: VoxelResolutionAxis; label: string }> = [
  { axis: 'x', label: 'X' },
  { axis: 'y', label: 'Y' },
  { axis: 'z', label: 'Z' }
];

type FrontPageProps = {
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
  onStartExperimentSetup: () => void;
  onAddChannel: () => void;
  onOpenPreprocessedLoader: () => void;
  onReturnToStart: () => void;
  experimentDimension: ExperimentDimension;
  onExperimentDimensionChange: (dimension: ExperimentDimension) => void;
  voxelResolution: VoxelResolutionInput;
  onVoxelResolutionAxisChange: (axis: VoxelResolutionAxis, value: string) => void;
  onVoxelResolutionUnitChange: (unit: VoxelResolutionUnit) => void;
  onVoxelResolutionAnisotropyToggle: (value: boolean) => void;
  isPreprocessedLoaderOpen: boolean;
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
  onChannelNameChange: (channelId: string, name: string) => void;
  onRemoveChannel: (channelId: string) => void;
  onChannelLayerFilesAdded: (channelId: string, files: File[]) => void | Promise<void>;
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
    return '0 files';
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
  onStartExperimentSetup,
  onAddChannel,
  onOpenPreprocessedLoader,
  onReturnToStart,
  experimentDimension,
  onExperimentDimensionChange,
  voxelResolution,
  onVoxelResolutionAxisChange,
  onVoxelResolutionUnitChange,
  onVoxelResolutionAnisotropyToggle,
  isPreprocessedLoaderOpen,
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
  const headerTitle = useMemo(() => {
    if (frontPageMode === 'preprocessed') {
      return 'Loaded preprocessed experiment';
    }
    if (frontPageMode === 'configuring') {
      return 'Set up new experiment';
    }
    if (isPreprocessedLoaderOpen) {
      return 'Load preprocessed experiment';
    }
    return '4D viewer';
  }, [frontPageMode, isPreprocessedLoaderOpen]);

  const showReturnButton = frontPageMode !== 'initial' || isPreprocessedLoaderOpen;
  const voxelResolutionAxes = useMemo(() => {
    return experimentDimension === '2d'
      ? VOXEL_RESOLUTION_AXES.filter(({ axis }) => axis !== 'z')
      : VOXEL_RESOLUTION_AXES;
  }, [experimentDimension]);

  return (
    <div className="app front-page-mode">
      <div className="front-page">
        <div className={`front-page-card${isFrontPageLocked ? ' is-loading' : ''}`}>
          <header className="front-page-header">
            <div className="front-page-title-row">
              <h1>{headerTitle}</h1>
              {showReturnButton ? (
                <button
                  type="button"
                  className="channel-add-button front-page-return-button"
                  onClick={onReturnToStart}
                  disabled={isFrontPageLocked}
                >
                  ↩ Return
                </button>
              ) : null}
            </div>
          </header>
          {frontPageMode === 'initial' && !isPreprocessedLoaderOpen ? (
            <div className="channel-add-actions">
              <div className="channel-add-initial">
                <button
                  type="button"
                  className="channel-add-button"
                  onClick={onStartExperimentSetup}
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
            </div>
          ) : null}
          {frontPageMode === 'configuring' ? (
            <>
              <div className="movie-mode-row">
                <span className="movie-mode-label">Choose movie type:</span>
                <div className="voxel-resolution-mode-toggle" role="group" aria-label="Movie dimension">
                  {['3d', '2d'].map((mode) => (
                    <label
                      key={mode}
                      className={`voxel-resolution-mode${
                        experimentDimension === mode ? ' is-selected' : ''
                      }`}
                    >
                      <input
                        type="radio"
                        value={mode}
                        checked={experimentDimension === mode}
                        onChange={() => onExperimentDimensionChange(mode as ExperimentDimension)}
                        disabled={isFrontPageLocked}
                      />
                      {mode === '3d' ? '3D movie' : '2D movie'}
                    </label>
                  ))}
                </div>
              </div>
              <div className="voxel-resolution-row">
                <span className="voxel-resolution-title">Voxel resolution:</span>
                {voxelResolutionAxes.map(({ axis, label }) => (
                  <label key={axis} className="voxel-resolution-field">
                    <span className="voxel-resolution-field-label">{label}:</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="any"
                      value={voxelResolution[axis]}
                      onChange={(event) => onVoxelResolutionAxisChange(axis, event.target.value)}
                      disabled={isFrontPageLocked}
                    />
                  </label>
                ))}
                <label className="voxel-resolution-unit">
                  <span className="voxel-resolution-field-label">Unit</span>
                  <select
                    value={voxelResolution.unit}
                    onChange={(event) =>
                      onVoxelResolutionUnitChange(event.target.value as VoxelResolutionUnit)
                    }
                    disabled={isFrontPageLocked}
                  >
                    {VOXEL_RESOLUTION_UNITS.map((unit) => (
                      <option key={unit} value={unit}>
                        {unit}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="voxel-resolution-anisotropy">
                  <input
                    type="checkbox"
                    checked={voxelResolution.correctAnisotropy}
                    onChange={(event) => onVoxelResolutionAnisotropyToggle(event.target.checked)}
                    disabled={isFrontPageLocked}
                  />
                  <strong>Make data isotropic</strong>
                </label>
              </div>
            </>
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
                </div>
                {isPreprocessedImporting ? (
                  <p className="preprocessed-loader-status">
                    Loading preprocessed dataset…
                    {preprocessedImportTotalVolumeCount !== null || preprocessedImportVolumesDecoded > 0 ? (
                      <>
                        {' '}
                        {preprocessedImportTotalVolumeCount ? (
                          <>
                            Decoded {preprocessedImportVolumesDecoded} of {preprocessedImportTotalVolumeCount} volumes (
                            {preprocessedImportTotalVolumeCount > 0
                              ? Math.min(
                                  100,
                                  Math.round(
                                    (preprocessedImportVolumesDecoded /
                                      preprocessedImportTotalVolumeCount) *
                                      100
                                  )
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
                            {formatBytes(preprocessedImportBytesProcessed)} of{' '}
                            {formatBytes(preprocessedImportTotalBytes)} (
                            {preprocessedImportTotalBytes > 0
                              ? Math.min(
                                  100,
                                  Math.round(
                                    (preprocessedImportBytesProcessed / preprocessedImportTotalBytes) * 100
                                  )
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
                    <button
                      type="button"
                      className="channel-tab channel-tab--add"
                      onClick={onAddChannel}
                      disabled={isFrontPageLocked}
                      aria-label="Add new channel"
                    >
                      <span className="channel-tab-add-icon">＋</span>
                      <span className="channel-tab-add-text">Add new channel</span>
                    </button>
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
                    experimentDimension={experimentDimension}
                    onLayerFilesAdded={onChannelLayerFilesAdded}
                    onLayerDrop={onChannelLayerDrop}
                    onLayerSegmentationToggle={onChannelLayerSegmentationToggle}
                    onLayerRemove={onChannelLayerRemove}
                    onTrackFileSelected={onChannelTrackFileSelected}
                    onTrackDrop={onChannelTrackDrop}
                    onTrackClear={onChannelTrackClear}
                  />
                ) : (
                  <p className="channel-panel-placeholder">
                    {channels.length === 0 ? 'Add a channel to configure it.' : 'Select a channel to edit it.'}
                  </p>
                )}
              </div>
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
