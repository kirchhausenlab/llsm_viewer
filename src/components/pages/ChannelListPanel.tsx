import type {
  Dispatch,
  FC,
  MutableRefObject,
  SetStateAction
} from 'react';
import ChannelCard from './ChannelCard';
import type { ChannelSource, ChannelValidation } from '../../hooks/dataset';
import type { ExperimentDimension } from '../../hooks/useVoxelResolution';

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
  const hasTracks = channel.trackSets.some((set) => set.entries.length > 0);
  const isLoadingTracks = channel.trackSets.some((set) => set.status === 'loading');
  if (hasTracks) {
    parts.push('Tracks attached');
  } else if (isLoadingTracks) {
    parts.push('Tracks loading');
  }
  if (channel.layers.length === 0) {
    parts.push('add a volume');
  } else if (validation.errors.length > 0) {
    const hasNameError = validation.errors.includes('Name this channel.');
    parts.push(hasNameError ? 'Insert channel name' : 'Needs attention');
  } else if (validation.warnings.length > 0) {
    const hasNoTracksWarning = validation.warnings.some(
      (warning: string) => warning === 'No tracks attached to this channel.'
    );
    parts.push(hasNoTracksWarning ? 'no tracks attached' : 'Warnings');
  }
  return parts.join(' · ');
};

type ChannelListPanelProps = {
  channels: ChannelSource[];
  channelValidationMap: Map<string, ChannelValidation>;
  activeChannelId: string | null;
  activeChannel: ChannelSource | null;
  editingChannelId: string | null;
  editingChannelInputRef: MutableRefObject<HTMLInputElement | null>;
  editingChannelOriginalNameRef: MutableRefObject<string>;
  setActiveChannelId: Dispatch<SetStateAction<string | null>>;
  setEditingChannelId: Dispatch<SetStateAction<string | null>>;
  onAddChannel: () => void;
  onChannelNameChange: (channelId: string, name: string) => void;
  onRemoveChannel: (channelId: string) => void;
  onChannelLayerFilesAdded: (channelId: string, files: File[]) => void | Promise<void>;
  onChannelLayerDrop: (channelId: string, dataTransfer: DataTransfer) => void;
  onChannelLayerSegmentationToggle: (channelId: string, layerId: string, value: boolean) => void;
  onChannelLayerRemove: (channelId: string, layerId: string) => void;
  onChannelTrackFilesAdded: (channelId: string, files: File[]) => void | Promise<void>;
  onChannelTrackDrop: (channelId: string, dataTransfer: DataTransfer) => void;
  onChannelTrackSetNameChange: (channelId: string, trackSetId: string, name: string) => void;
  onChannelTrackSetRemove: (channelId: string, trackSetId: string) => void;
  experimentDimension: ExperimentDimension;
  isFrontPageLocked: boolean;
};

const ChannelListPanel: FC<ChannelListPanelProps> = ({
  channels,
  channelValidationMap,
  activeChannelId,
  activeChannel,
  editingChannelId,
  editingChannelInputRef,
  editingChannelOriginalNameRef,
  setActiveChannelId,
  setEditingChannelId,
  onAddChannel,
  onChannelNameChange,
  onRemoveChannel,
  onChannelLayerFilesAdded,
  onChannelLayerDrop,
  onChannelLayerSegmentationToggle,
  onChannelLayerRemove,
  onChannelTrackFilesAdded,
  onChannelTrackDrop,
  onChannelTrackSetNameChange,
  onChannelTrackSetRemove,
  experimentDimension,
  isFrontPageLocked
}) => {
  return (
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
                onFocus={() => {
                  if (isFrontPageLocked) {
                    return;
                  }
                  setActiveChannelId(channel.id);
                }}
              >
                <input
                  ref={editingChannelInputRef}
                  type="text"
                  value={channel.name}
                  className="channel-name-input"
                  maxLength={9}
                  onChange={(event) => onChannelNameChange(channel.id, event.target.value)}
                  onBlur={() => setEditingChannelId(null)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      setEditingChannelId(null);
                    } else if (event.key === 'Escape') {
                      onChannelNameChange(channel.id, editingChannelOriginalNameRef.current);
                      setEditingChannelId(null);
                    }
                  }}
                />
                <p className="channel-tab-meta">{tabMeta}</p>
                <button
                  type="button"
                  className="channel-tab-remove"
                  onClick={() => onRemoveChannel(channel.id)}
                  aria-label={removeLabel}
                  disabled={isFrontPageLocked}
                >
                  ×
                </button>
              </div>
            );
          }
          return (
            <button
              key={channel.id}
              id={`${channel.id}-tab`}
              className={tabClassName}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls="channel-detail-panel"
              tabIndex={isFrontPageLocked ? -1 : 0}
              aria-disabled={isFrontPageLocked}
              onClick={() => {
                if (isFrontPageLocked) {
                  return;
                }
                setEditingChannelId(null);
                setActiveChannelId(channel.id);
              }}
              onFocus={() => {
                if (isFrontPageLocked) {
                  return;
                }
                setEditingChannelId(null);
                setActiveChannelId(channel.id);
              }}
              onDoubleClick={startEditingChannelName}
            >
              <div className="channel-tab-content">
                <div className="channel-tab-title-row">
                  <h3 onDoubleClick={startEditingChannelName}>{channel.name || 'Untitled channel'}</h3>
                  <button
                    className="channel-tab-remove"
                    type="button"
                    aria-label={removeLabel}
                    onClick={() => onRemoveChannel(channel.id)}
                    disabled={isFrontPageLocked}
                  >
                    ×
                  </button>
                </div>
                <p className="channel-tab-meta">{tabMeta}</p>
              </div>
            </button>
          );
        })}
        <button
          type="button"
          className="channel-tab channel-tab--add"
          onClick={onAddChannel}
          disabled={isFrontPageLocked}
        >
          + Add channel
        </button>
      </div>
      <div id="channel-detail-panel" className="channel-panel" role="tabpanel" aria-label="Channel settings">
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
            onTrackFilesAdded={onChannelTrackFilesAdded}
            onTrackDrop={onChannelTrackDrop}
            onTrackSetNameChange={onChannelTrackSetNameChange}
            onTrackSetRemove={onChannelTrackSetRemove}
          />
        ) : (
          <p className="channel-panel-placeholder">
            {channels.length === 0 ? 'Add a channel to configure it.' : 'Select a channel to edit it.'}
          </p>
        )}
      </div>
    </div>
  );
};

export default ChannelListPanel;
export type { ChannelListPanelProps };
