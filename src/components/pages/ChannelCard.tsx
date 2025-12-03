import { useCallback, useMemo } from 'react';
import ChannelDropboxSection from './ChannelDropboxSection';
import ChannelUploads from './ChannelUploads';
import useChannelDropbox from '../../hooks/useChannelDropbox';
import type { ChannelSource, ChannelValidation } from '../../hooks/useChannelSources';
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
  onTrackFileSelected: (channelId: string, file: File | null) => void;
  onTrackDrop: (channelId: string, dataTransfer: DataTransfer) => void;
  onTrackClear: (channelId: string) => void;
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
  onTrackFileSelected,
  onTrackDrop,
  onTrackClear
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
      onTrackFileSelected(channel.id, files[0] ?? null);
    },
    [channel.id, onTrackFileSelected]
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
        options: { extensions: ['.csv'], multiselect: false },
        onImported: (files: File[]) => {
          const [file] = files;
          onTrackFileSelected(channel.id, file ?? null);
        }
      }),
    [channel.id, dropboxControls, onTrackFileSelected]
  );

  const trackEntryCount = channel.trackEntries.length;
  const uniqueTrackCount = useMemo(() => {
    const identifiers = new Set<string>();
    for (const row of channel.trackEntries) {
      const trackId = row[0];
      if (trackId) {
        identifiers.add(trackId);
      }
    }
    return identifiers.size;
  }, [channel.trackEntries]);

  const loadedTrackSummary = useMemo(() => {
    if (trackEntryCount === 0) {
      return 'Loaded 0 track entries.';
    }
    if (uniqueTrackCount > 0) {
      const trackLabel = uniqueTrackCount === 1 ? '1 track' : `${uniqueTrackCount} tracks`;
      if (uniqueTrackCount === trackEntryCount) {
        return `Loaded ${trackLabel}.`;
      }
      const entryLabel =
        trackEntryCount === 1 ? '1 track entry' : `${trackEntryCount} track entries`;
      return `Loaded ${trackLabel} across ${entryLabel}.`;
    }
    return trackEntryCount === 1
      ? 'Loaded 1 track entry.'
      : `Loaded ${trackEntryCount} track entries.`;
  }, [trackEntryCount, uniqueTrackCount]);

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
      <p className="channel-tracks-title">Upload tracks (optional, .csv file)</p>
      <ChannelUploads
        variant="tracks"
        accept=".csv"
        disabled={isDisabled}
        isBusy={isDropboxImporting}
        browseLabel="From Files"
        subtitle="Or drop the tracks file here"
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
        rightSlot={
          channel.trackFile ? (
            <button
              type="button"
              onClick={() => onTrackClear(channel.id)}
              className="channel-track-clear"
              disabled={isDisabled || isDropboxImporting}
            >
              Clear
            </button>
          ) : null
        }
        statusSlot={
          <>
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
            {channel.trackError ? <p className="channel-tracks-error">{channel.trackError}</p> : null}
            {channel.trackStatus === 'loading' ? <p className="channel-tracks-status">Loading tracks…</p> : null}
            {channel.trackStatus === 'loaded' ? (
              <p className="channel-tracks-status">{loadedTrackSummary}</p>
            ) : null}
          </>
        }
      />
    </section>
  );
}
