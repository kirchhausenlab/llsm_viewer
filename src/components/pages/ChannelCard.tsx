import { useCallback, useMemo } from 'react';
import ChannelDropboxSection from './ChannelDropboxSection';
import ChannelUploads from './ChannelUploads';
import useChannelDropbox from '../../hooks/useChannelDropbox';
import {
  getChannelVolumeComponentIndex,
  getChannelVolumeSourceChannels,
  isMultichannelDerivedChannelSource,
  isMultichannelOwnerChannelSource,
  type ChannelSource,
  type ChannelValidation
} from '../../hooks/dataset';

export type ChannelCardProps = {
  channel: ChannelSource;
  validation: ChannelValidation;
  isDisabled: boolean;
  onLayerFilesAdded: (id: string, files: File[]) => void | Promise<void>;
  onLayerDrop: (id: string, dataTransfer: DataTransfer) => void;
  onLayerRemove: (channelId: string, layerId: string) => void;
};

export default function ChannelCard({
  channel,
  validation,
  isDisabled,
  onLayerFilesAdded,
  onLayerDrop,
  onLayerRemove
}: ChannelCardProps) {
  const { state: dropboxState, controls: dropboxControls } = useChannelDropbox({ disabled: isDisabled });

  const isDropboxImporting = dropboxState.importTarget !== null;
  const primaryLayer = channel.volume;
  const hasLayerSelection = primaryLayer !== null;
  const isLinkedMultichannelChild = isMultichannelDerivedChannelSource(channel);
  const isMultichannelOwner = isMultichannelOwnerChannelSource(channel);
  const sourceChannels = getChannelVolumeSourceChannels(primaryLayer);
  const componentLabel = getChannelVolumeComponentIndex(primaryLayer) + 1;

  const layerSelectionSummary = useMemo(() => {
    const totalFiles = primaryLayer?.files.length ?? 0;
    return totalFiles === 1 ? '1 file selected' : `${totalFiles} files selected`;
  }, [primaryLayer]);

  const statusContent =
    hasLayerSelection && (validation.errors.length > 0 || validation.warnings.length > 0) ? (
      <div className="track-card-status-row">
        {validation.errors.map((message, index) => (
          <p key={`error-${index}`} className="channel-tracks-error">
            {message}
          </p>
        ))}
        {validation.warnings.map((message, index) => (
          <p key={`warning-${index}`} className="channel-layer-status">
            {message}
          </p>
        ))}
      </div>
    ) : null;

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

  const handleLayerDropboxImport = useCallback(
    () =>
      dropboxControls.importFromDropbox({
        target: 'layers',
        options: { extensions: ['.tif', '.tiff'], multiselect: true },
        onImported: (files: File[]) => onLayerFilesAdded(channel.id, files)
      }),
    [channel.id, dropboxControls, onLayerFilesAdded]
  );

  if (isLinkedMultichannelChild && primaryLayer) {
    return (
      <div className="channel-layer-drop is-selected channel-layer-drop--linked">
        <div className="channel-layer-drop-content">
          <div className="channel-layer-row">
            <div className="channel-layer-description">
              <p className="channel-layer-drop-subtitle">
                Source channel {componentLabel} of {sourceChannels} from the multichannel upload above.
              </p>
              <p className="channel-layer-status">
                Clear or replace the upload on the parent row to remove or update this linked channel.
              </p>
            </div>
          </div>
          {statusContent}
        </div>
      </div>
    );
  }

  return (
    <ChannelUploads
      variant="layers"
      accept=".tif,.tiff,.TIF,.TIFF"
      multiple
      disabled={isDisabled}
      isBusy={isDropboxImporting}
      browseLabel="From Files"
      subtitle="Or drop folder here"
      hasSelection={hasLayerSelection}
      selectedSummary={layerSelectionSummary}
      onFilesSelected={handleLayerFilesSelected}
      onDropDataTransfer={handleLayerDrop}
      actionSlot={!hasLayerSelection ? (
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
      ) : undefined}
      rightSlot={
        hasLayerSelection && primaryLayer ? (
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
        hasLayerSelection ? (
          <>
            {isMultichannelOwner && sourceChannels > 1 ? (
              <p className="channel-layer-status">
                Expanded into {sourceChannels} linked grayscale channels below.
              </p>
            ) : null}
            {statusContent}
          </>
        ) : !hasLayerSelection ? (
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
        ) : null
      }
    />
  );
}
