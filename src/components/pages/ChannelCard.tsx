import { useCallback, useMemo } from 'react';
import ChannelDropboxSection from './ChannelDropboxSection';
import ChannelUploads from './ChannelUploads';
import useChannelDropbox from '../../hooks/useChannelDropbox';
import type { ChannelSource, ChannelValidation } from '../../hooks/dataset';
import type { ExperimentDimension } from '../../hooks/useVoxelResolution';

export type ChannelCardProps = {
  channel: ChannelSource;
  validation: ChannelValidation;
  isDisabled: boolean;
  experimentDimension: ExperimentDimension;
  onLayerFilesAdded: (id: string, files: File[]) => void | Promise<void>;
  onLayerDrop: (id: string, dataTransfer: DataTransfer) => void;
  onLayerSegmentationToggle: (channelId: string, layerId: string, value: boolean) => void;
  onLayerRemove: (channelId: string, layerId: string) => void;
  onTrackFilesAdded: (channelId: string, files: File[]) => void | Promise<void>;
  onTrackDrop: (channelId: string, dataTransfer: DataTransfer) => void;
  onTrackSetNameChange: (channelId: string, trackSetId: string, name: string) => void;
  onTrackSetRemove: (channelId: string, trackSetId: string) => void;
};

export default function ChannelCard({
  channel,
  validation: _validation,
  isDisabled,
  experimentDimension,
  onLayerFilesAdded,
  onLayerDrop,
  onLayerSegmentationToggle,
  onLayerRemove,
  onTrackFilesAdded,
  onTrackDrop,
  onTrackSetNameChange,
  onTrackSetRemove
}: ChannelCardProps) {
  const { state: dropboxState, controls: dropboxControls } = useChannelDropbox({ disabled: isDisabled });

  const isDropboxImporting = dropboxState.importTarget !== null;
  const primaryLayer = channel.layers[0] ?? null;
  const uploadTitle = useMemo(
    () =>
      experimentDimension === '2d'
        ? 'Upload single 3D file or sequence of 2D files (.tif/.tiff)'
        : 'Upload sequence of 3D files (.tif/.tiff)',
    [experimentDimension]
  );

  const volumeStatus = useMemo(() => {
    if (!primaryLayer) {
      return '0 files';
    }
    const totalFiles = primaryLayer.files.length;
    return totalFiles === 1 ? '1 file' : `${totalFiles} files`;
  }, [primaryLayer]);

  const handleLayerFilesSelected = useCallback(
    (files: File[]) => {
      onLayerFilesAdded(channel.id, files);
    },
    [channel.id, onLayerFilesAdded]
  );

  const handleLayerDrop = useCallback(
    (dataTransfer: DataTransfer) => {
      onLayerDrop(channel.id, dataTransfer);
    },
    [channel.id, onLayerDrop]
  );

  const handleTrackFilesSelected = useCallback(
    (files: File[]) => {
      onTrackFilesAdded(channel.id, files);
    },
    [channel.id, onTrackFilesAdded]
  );

  const handleTrackDrop = useCallback(
    (dataTransfer: DataTransfer) => {
      onTrackDrop(channel.id, dataTransfer);
    },
    [channel.id, onTrackDrop]
  );

  const handleLayerDropboxImport = useCallback(
    () =>
      dropboxControls.importFromDropbox({
        target: 'layers',
        options: { extensions: ['.tif', '.tiff'], multiselect: true },
        onImported: (files: File[]) => onLayerFilesAdded(channel.id, files)
      }),
    [channel.id, dropboxControls, onLayerFilesAdded]
  );

  const handleTrackDropboxImport = useCallback(
    () =>
      dropboxControls.importFromDropbox({
        target: 'tracks',
        options: { extensions: ['.csv'], multiselect: true },
        onImported: (files: File[]) => {
          onTrackFilesAdded(channel.id, files);
        }
      }),
    [channel.id, dropboxControls, onTrackFilesAdded]
  );

  const trackSetSummaries = useMemo(() => {
    const summaries = new Map<string, string>();
    for (const set of channel.trackSets) {
      const entries = set.entries;
      const entryCount = entries.length;
      const identifiers = new Set<string>();
      for (const row of entries) {
        const trackId = row[0];
        if (trackId) {
          identifiers.add(trackId);
        }
      }
      const uniqueCount = identifiers.size;

      if (set.status === 'loading') {
        summaries.set(set.id, 'Loading…');
        continue;
      }
      if (set.status === 'error') {
        summaries.set(set.id, set.error ?? 'Failed to load tracks.');
        continue;
      }
      if (entryCount === 0) {
        summaries.set(set.id, 'Loaded 0 track entries.');
        continue;
      }
      if (uniqueCount > 0) {
        const trackLabel = uniqueCount === 1 ? '1 track' : `${uniqueCount} tracks`;
        if (uniqueCount === entryCount) {
          summaries.set(set.id, `Loaded ${trackLabel}.`);
          continue;
        }
        const entryLabel = entryCount === 1 ? '1 track entry' : `${entryCount} track entries`;
        summaries.set(set.id, `Loaded ${trackLabel} across ${entryLabel}.`);
        continue;
      }
      summaries.set(set.id, entryCount === 1 ? 'Loaded 1 track entry.' : `Loaded ${entryCount} track entries.`);
    }
    return summaries;
  }, [channel.trackSets]);

  return (
    <section className={`channel-card${isDisabled ? ' is-disabled' : ''}`} aria-disabled={isDisabled}>
      <div className="channel-layer-drop-header">
        <p className="channel-layer-drop-title">{uploadTitle}</p>
        {primaryLayer ? (
          <label className="channel-layer-segmentation">
            <input
              type="checkbox"
              checked={primaryLayer.isSegmentation}
              onChange={(event) => onLayerSegmentationToggle(channel.id, primaryLayer.id, event.target.checked)}
              disabled={isDisabled}
            />
            <span>Segmentation volume</span>
          </label>
        ) : null}
      </div>
      <ChannelUploads
        variant="layers"
        accept=".tif,.tiff,.TIF,.TIFF"
        multiple
        disabled={isDisabled}
        isBusy={isDropboxImporting}
        browseLabel="From Files"
        subtitle="Or drop sequence folder here"
        onFilesSelected={handleLayerFilesSelected}
        onDropDataTransfer={handleLayerDrop}
        actionSlot={
          <ChannelDropboxSection
            channelId={channel.id}
            variant="layers"
            isDisabled={isDisabled}
            isImporting={dropboxState.importTarget === 'layers'}
            error={dropboxState.errorContext === 'layers' ? dropboxState.error : null}
            info={dropboxState.info}
            appKeyInput={dropboxState.appKeyInput}
            appKeySource={dropboxState.appKeySource}
            isConfigOpen={dropboxState.isConfigOpen}
            showConfigForm
            renderStatuses={false}
            onImport={handleLayerDropboxImport}
            onAppKeyInputChange={dropboxControls.updateAppKeyInput}
            onSubmitAppKey={dropboxControls.submitDropboxConfig}
            onCancelAppKey={dropboxControls.cancelDropboxConfig}
            onClearAppKey={dropboxControls.clearDropboxConfig}
          />
        }
        rightSlot={
          primaryLayer ? (
            <button
              type="button"
              className="channel-track-clear channel-layer-clear"
              onClick={() => onLayerRemove(channel.id, primaryLayer.id)}
              aria-label="Clear volume"
              disabled={isDisabled}
            >
              Clear
            </button>
          ) : null
        }
        statusSlot={
          <>
            <ChannelDropboxSection
              channelId={channel.id}
              variant="layers"
              isDisabled={isDisabled}
              isImporting={dropboxState.importTarget === 'layers'}
              error={dropboxState.errorContext === 'layers' ? dropboxState.error : null}
              info={dropboxState.info}
              appKeyInput={dropboxState.appKeyInput}
              appKeySource={dropboxState.appKeySource}
              isConfigOpen={dropboxState.isConfigOpen}
              showConfigForm
              renderButton={false}
              onImport={handleLayerDropboxImport}
              onAppKeyInputChange={dropboxControls.updateAppKeyInput}
              onSubmitAppKey={dropboxControls.submitDropboxConfig}
              onCancelAppKey={dropboxControls.cancelDropboxConfig}
              onClearAppKey={dropboxControls.clearDropboxConfig}
            />
            <p className="channel-layer-status">{volumeStatus}</p>
          </>
        }
      />
      <p className="channel-tracks-title">Upload tracks (optional, .csv files)</p>
      <ChannelUploads
        variant="tracks"
        accept=".csv"
        multiple
        disabled={isDisabled}
        isBusy={isDropboxImporting}
        browseLabel="From Files"
        subtitle="Or drop one or more tracks files here"
        onFilesSelected={handleTrackFilesSelected}
        onDropDataTransfer={handleTrackDrop}
        actionSlot={
          <ChannelDropboxSection
            channelId={channel.id}
            variant="tracks"
            isDisabled={isDisabled}
            isImporting={dropboxState.importTarget === 'tracks'}
            error={dropboxState.errorContext === 'tracks' ? dropboxState.error : null}
            info={null}
            appKeyInput={dropboxState.appKeyInput}
            appKeySource={dropboxState.appKeySource}
            isConfigOpen={dropboxState.isConfigOpen}
            renderStatuses={false}
            onImport={handleTrackDropboxImport}
            onAppKeyInputChange={dropboxControls.updateAppKeyInput}
            onSubmitAppKey={dropboxControls.submitDropboxConfig}
            onCancelAppKey={dropboxControls.cancelDropboxConfig}
            onClearAppKey={dropboxControls.clearDropboxConfig}
          />
        }
        statusSlot={
          <ChannelDropboxSection
            channelId={channel.id}
            variant="tracks"
            isDisabled={isDisabled}
            isImporting={dropboxState.importTarget === 'tracks'}
            error={dropboxState.errorContext === 'tracks' ? dropboxState.error : null}
            appKeyInput={dropboxState.appKeyInput}
            appKeySource={dropboxState.appKeySource}
            isConfigOpen={dropboxState.isConfigOpen}
            renderButton={false}
            onImport={handleTrackDropboxImport}
            onAppKeyInputChange={dropboxControls.updateAppKeyInput}
            onSubmitAppKey={dropboxControls.submitDropboxConfig}
            onCancelAppKey={dropboxControls.cancelDropboxConfig}
            onClearAppKey={dropboxControls.clearDropboxConfig}
          />
        }
      />
      {channel.trackSets.length > 0 ? (
        <div className="channel-tracks-list" aria-label="Attached track sets">
          {channel.trackSets.map((set) => (
            <div key={set.id} className="channel-tracks-list-row">
              <span className="channel-tracks-filename">{set.fileName}</span>
              <input
                type="text"
                className="channel-tracks-name-input"
                value={set.name}
                onChange={(event) => onTrackSetNameChange(channel.id, set.id, event.target.value)}
                disabled={isDisabled}
                aria-label={`Track set name for ${set.fileName}`}
              />
              <button
                type="button"
                className="channel-tracks-remove"
                onClick={() => onTrackSetRemove(channel.id, set.id)}
                aria-label={`Remove ${set.fileName}`}
                disabled={isDisabled || isDropboxImporting}
              >
                🗑
              </button>
              <span className={set.status === 'error' ? 'channel-tracks-status channel-tracks-error' : 'channel-tracks-status'}>
                {trackSetSummaries.get(set.id) ?? ''}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
