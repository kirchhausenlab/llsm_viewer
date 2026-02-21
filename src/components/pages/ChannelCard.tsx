import { useCallback, useMemo } from 'react';
import ChannelDropboxSection from './ChannelDropboxSection';
import ChannelUploads from './ChannelUploads';
import useChannelDropbox from '../../hooks/useChannelDropbox';
import type { ChannelSource } from '../../hooks/dataset';

export type ChannelCardProps = {
  channel: ChannelSource;
  isDisabled: boolean;
  onLayerFilesAdded: (id: string, files: File[]) => void | Promise<void>;
  onLayerDrop: (id: string, dataTransfer: DataTransfer) => void;
  onLayerRemove: (channelId: string, layerId: string) => void;
};

export default function ChannelCard({
  channel,
  isDisabled,
  onLayerFilesAdded,
  onLayerDrop,
  onLayerRemove
}: ChannelCardProps) {
  const { state: dropboxState, controls: dropboxControls } = useChannelDropbox({ disabled: isDisabled });

  const isDropboxImporting = dropboxState.importTarget !== null;
  const primaryLayer = channel.layers[0] ?? null;
  const hasLayerSelection = primaryLayer !== null;

  const layerSelectionSummary = useMemo(() => {
    const totalFiles = primaryLayer?.files.length ?? 0;
    return totalFiles === 1 ? '1 file selected' : `${totalFiles} files selected`;
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

  const handleLayerDropboxImport = useCallback(
    () =>
      dropboxControls.importFromDropbox({
        target: 'layers',
        options: { extensions: ['.tif', '.tiff'], multiselect: true },
        onImported: (files: File[]) => onLayerFilesAdded(channel.id, files)
      }),
    [channel.id, dropboxControls, onLayerFilesAdded]
  );

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
        !hasLayerSelection ? (
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
