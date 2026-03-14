import { useCallback } from 'react';
import ChannelDropboxSection from './ChannelDropboxSection';
import ChannelUploads from './ChannelUploads';
import useChannelDropbox from '../../hooks/useChannelDropbox';
import type { ChannelSource, TrackSetSource } from '../../hooks/dataset';

type TrackCardProps = {
  trackSet: TrackSetSource;
  channels: ChannelSource[];
  isDisabled: boolean;
  onTrackFilesAdded: (trackSetId: string, files: File[]) => void | Promise<void>;
  onTrackDrop: (trackSetId: string, dataTransfer: DataTransfer) => void;
  onTrackSetBoundChannelChange: (trackSetId: string, channelId: string | null) => void;
  onTrackSetTimepointConventionChange: (
    trackSetId: string,
    timepointConvention: TrackSetSource['timepointConvention']
  ) => void | Promise<void>;
  onTrackSetClearFile: (trackSetId: string) => void;
};

export default function TrackCard({
  trackSet,
  channels,
  isDisabled,
  onTrackFilesAdded,
  onTrackDrop,
  onTrackSetBoundChannelChange,
  onTrackSetTimepointConventionChange,
  onTrackSetClearFile
}: TrackCardProps) {
  const { state: dropboxState, controls: dropboxControls } = useChannelDropbox({ disabled: isDisabled });

  const isDropboxImporting = dropboxState.importTarget !== null;
  const hasTrackSelection = trackSet.file !== null;
  const trackSelectionSummary = hasTrackSelection ? '1 file selected' : '0 files selected';

  const handleTrackFilesSelected = useCallback(
    (files: File[]) => {
      onTrackFilesAdded(trackSet.id, files);
    },
    [onTrackFilesAdded, trackSet.id]
  );

  const handleTrackDrop = useCallback(
    (dataTransfer: DataTransfer) => {
      onTrackDrop(trackSet.id, dataTransfer);
    },
    [onTrackDrop, trackSet.id]
  );

  const handleTrackDropboxImport = useCallback(
    () =>
      dropboxControls.importFromDropbox({
        target: 'tracks',
        options: { extensions: ['.csv'], multiselect: false },
        onImported: (files: File[]) => {
          onTrackFilesAdded(trackSet.id, files.slice(0, 1));
        }
      }),
    [dropboxControls, onTrackFilesAdded, trackSet.id]
  );

  return (
    <ChannelUploads
      variant="tracks"
      accept=".csv"
      disabled={isDisabled}
      isBusy={isDropboxImporting}
      browseLabel="From Files"
      subtitle="Or drop file here"
      hasSelection={hasTrackSelection}
      selectedSummary={trackSelectionSummary}
      onFilesSelected={handleTrackFilesSelected}
      onDropDataTransfer={handleTrackDrop}
      actionSlot={!hasTrackSelection ? (
        <ChannelDropboxSection
          channelId={trackSet.id}
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
      ) : undefined}
      rightSlot={
        hasTrackSelection ? (
          <div className="track-card-selected-controls">
            <label className="track-card-bind-label" htmlFor={`track-bind-${trackSet.id}`}>
              Bind to:
            </label>
            <select
              id={`track-bind-${trackSet.id}`}
              className="track-card-bind-select"
              value={trackSet.boundChannelId ?? ''}
              onChange={(event) =>
                onTrackSetBoundChannelChange(trackSet.id, event.target.value === '' ? null : event.target.value)
              }
              disabled={isDisabled || isDropboxImporting}
            >
              <option value="">None</option>
              {channels.map((channel) => (
                <option key={channel.id} value={channel.id}>
                  {channel.name.trim() || 'Unnamed channel'}
                </option>
              ))}
            </select>
            <label className="track-card-bind-label" htmlFor={`track-timepoint-convention-${trackSet.id}`}>
              Convention:
            </label>
            <select
              id={`track-timepoint-convention-${trackSet.id}`}
              className="track-card-bind-select"
              value={trackSet.timepointConvention}
              onChange={(event) =>
                onTrackSetTimepointConventionChange(
                  trackSet.id,
                  event.target.value as TrackSetSource['timepointConvention']
                )
              }
              disabled={isDisabled || isDropboxImporting}
            >
              <option value="zero-based">CSV 0 -&gt; movie 0</option>
              <option value="one-based">CSV 1 -&gt; movie 0</option>
            </select>
            <button
              type="button"
              className="channel-track-clear"
              onClick={() => onTrackSetClearFile(trackSet.id)}
              disabled={isDisabled || isDropboxImporting}
            >
              Clear
            </button>
          </div>
        ) : null
      }
      statusSlot={
        hasTrackSelection && trackSet.error ? (
          <div className="track-card-status-row">
            <p className="channel-tracks-status">{trackSet.error}</p>
          </div>
        ) : !hasTrackSelection ? (
          <ChannelDropboxSection
            channelId={trackSet.id}
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
        ) : null
      }
    />
  );
}
