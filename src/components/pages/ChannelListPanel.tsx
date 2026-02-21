import { useEffect, useMemo, useRef, useState, type Dispatch, type FC, type MutableRefObject, type SetStateAction } from 'react';
import ChannelCard from './ChannelCard';
import TrackCard from './TrackCard';
import type { ChannelSource, ChannelValidation, TrackSetSource, TrackValidation } from '../../hooks/dataset';
import { ENTITY_NAME_MAX_LENGTH } from '../../constants/naming';

function isSegmentationChannel(channel: Pick<ChannelSource, 'channelType' | 'layers'>): boolean {
  if (channel.channelType === 'segmentation') {
    return true;
  }
  if (channel.channelType === 'channel') {
    return false;
  }
  if (channel.layers.length === 0) {
    return false;
  }
  return channel.layers.every((layer) => layer.isSegmentation);
}

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
  if (validation.errors.length > 0) {
    const hasNameError = validation.errors.includes('Name this channel.');
    const hasDuplicateNameError = validation.errors.includes('Channel name must be unique.');
    if (hasNameError) {
      parts.push('Insert channel name');
    }
    if (hasDuplicateNameError) {
      parts.push('Use unique name');
    }
    if (!hasNameError && !hasDuplicateNameError) {
      parts.push('Needs attention');
    }
  }

  if (channel.layers.length === 0) {
    parts.push('add a volume');
  } else if (validation.warnings.length > 0) {
    parts.push('Warnings');
  }
  return parts.join(' · ');
};

const buildTrackTabMeta = (
  trackSet: TrackSetSource,
  channelNameMap: Map<string, string>,
  validation: TrackValidation
): string => {
  const parts: string[] = [];
  if (validation.errors.length > 0) {
    const hasNameError = validation.errors.includes('Name this track.');
    const hasDuplicateNameError = validation.errors.includes('Track name must be unique.');
    if (hasNameError) {
      parts.push('Insert track name');
    }
    if (hasDuplicateNameError) {
      parts.push('Use unique name');
    }
    if (!hasNameError && !hasDuplicateNameError) {
      parts.push('Needs attention');
    }
  }

  if (trackSet.status === 'loading') {
    parts.push('Loading');
  } else if (trackSet.status === 'error') {
    parts.push('Needs attention');
  } else if (trackSet.fileName) {
    parts.push('File attached');
  } else {
    parts.push('No file');
  }

  if (trackSet.boundChannelId) {
    parts.push(`Bound: ${channelNameMap.get(trackSet.boundChannelId) ?? 'Unknown'}`);
  } else {
    parts.push('Bound: None');
  }
  return parts.join(' · ');
};

type ChannelListPanelProps = {
  channels: ChannelSource[];
  tracks: TrackSetSource[];
  channelValidationMap: Map<string, ChannelValidation>;
  trackValidationMap: Map<string, TrackValidation>;
  activeChannelId: string | null;
  activeChannel: ChannelSource | null;
  editingChannelId: string | null;
  editingChannelInputRef: MutableRefObject<HTMLInputElement | null>;
  editingChannelOriginalNameRef: MutableRefObject<string>;
  setActiveChannelId: Dispatch<SetStateAction<string | null>>;
  setEditingChannelId: Dispatch<SetStateAction<string | null>>;
  onAddChannel: () => void;
  onAddSegmentationChannel: () => void;
  onChannelNameChange: (channelId: string, name: string) => void;
  onRemoveChannel: (channelId: string) => void;
  onChannelLayerFilesAdded: (channelId: string, files: File[]) => void | Promise<void>;
  onChannelLayerDrop: (channelId: string, dataTransfer: DataTransfer) => void;
  onChannelLayerRemove: (channelId: string, layerId: string) => void;
  onAddTrack: () => void;
  onTrackFilesAdded: (trackSetId: string, files: File[]) => void | Promise<void>;
  onTrackDrop: (trackSetId: string, dataTransfer: DataTransfer) => void;
  onTrackSetNameChange: (trackSetId: string, name: string) => void;
  onTrackSetBoundChannelChange: (trackSetId: string, channelId: string | null) => void;
  onTrackSetClearFile: (trackSetId: string) => void;
  onTrackSetRemove: (trackSetId: string) => void;
  isFrontPageLocked: boolean;
};

const ChannelListPanel: FC<ChannelListPanelProps> = ({
  channels,
  tracks,
  channelValidationMap,
  trackValidationMap,
  activeChannelId,
  activeChannel: _activeChannel,
  editingChannelId,
  editingChannelInputRef,
  editingChannelOriginalNameRef,
  setActiveChannelId,
  setEditingChannelId,
  onAddChannel,
  onAddSegmentationChannel,
  onChannelNameChange,
  onRemoveChannel,
  onChannelLayerFilesAdded,
  onChannelLayerDrop,
  onChannelLayerRemove,
  onAddTrack,
  onTrackFilesAdded,
  onTrackDrop,
  onTrackSetNameChange,
  onTrackSetBoundChannelChange,
  onTrackSetClearFile,
  onTrackSetRemove,
  isFrontPageLocked
}) => {
  const [editingTrackId, setEditingTrackId] = useState<string | null>(null);
  const editingTrackInputRef = useRef<HTMLInputElement | null>(null);
  const editingTrackOriginalNameRef = useRef('');

  useEffect(() => {
    if (editingTrackId) {
      editingTrackInputRef.current?.focus();
      editingTrackInputRef.current?.select();
    }
  }, [editingTrackId]);

  const channelNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const channel of channels) {
      map.set(channel.id, channel.name.trim() || 'Unnamed channel');
    }
    return map;
  }, [channels]);

  const standardChannels = useMemo(
    () => channels.filter((channel) => !isSegmentationChannel(channel)),
    [channels]
  );

  const segmentationChannels = useMemo(
    () => channels.filter((channel) => isSegmentationChannel(channel)),
    [channels]
  );

  const orderedStandardChannelRows = useMemo(() => {
    if (standardChannels.length === 0) {
      return [{ type: 'add' as const }];
    }
    return [
      ...standardChannels.map((channel) => ({ type: 'channel' as const, channel })),
      { type: 'add' as const }
    ];
  }, [standardChannels]);

  const orderedSegmentationChannelRows = useMemo(() => {
    if (segmentationChannels.length === 0) {
      return [{ type: 'add' as const }];
    }
    return [
      ...segmentationChannels.map((channel) => ({ type: 'channel' as const, channel })),
      { type: 'add' as const }
    ];
  }, [segmentationChannels]);

  const orderedTrackRows = useMemo(() => {
    if (tracks.length === 0) {
      return [{ type: 'add' as const }];
    }
    return [...tracks.map((trackSet) => ({ type: 'track' as const, trackSet })), { type: 'add' as const }];
  }, [tracks]);

  const renderChannelRows = (
    rows: ReadonlyArray<{ type: 'add' } | { type: 'channel'; channel: ChannelSource }>,
    options: {
      addKeyPrefix: string;
      addLabel: string;
      onAdd: () => void;
    }
  ) => {
    return rows.map((row, index) => {
      if (row.type === 'add') {
        return (
          <div key={`${options.addKeyPrefix}-${index}`} className="setup-row setup-row--add" role="listitem">
            <button
              type="button"
              className="channel-tab channel-tab--add"
              onClick={options.onAdd}
              disabled={isFrontPageLocked}
            >
              {options.addLabel}
            </button>
            <div className="setup-row-panel setup-row-panel--empty" />
          </div>
        );
      }

      const channel = row.channel;
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

      return (
        <div key={channel.id} className="setup-row" role="listitem">
          {isEditing ? (
            <div
              id={`${channel.id}-tab`}
              className={`${tabClassName} is-editing`}
              role="tab"
              aria-selected={isActive}
              aria-controls={`channel-row-panel-${channel.id}`}
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
                maxLength={ENTITY_NAME_MAX_LENGTH}
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
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  onRemoveChannel(channel.id);
                }}
                aria-label={removeLabel}
                disabled={isFrontPageLocked}
              >
                x
              </button>
            </div>
          ) : (
            <div
              id={`${channel.id}-tab`}
              className={tabClassName}
              role="tab"
              aria-selected={isActive}
              aria-controls={`channel-row-panel-${channel.id}`}
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
              onKeyDown={(event) => {
                if (isFrontPageLocked) {
                  return;
                }
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  setEditingChannelId(null);
                  setActiveChannelId(channel.id);
                }
              }}
            >
              <div className="channel-tab-content">
                <div className="channel-tab-title-row">
                  <h3 onDoubleClick={startEditingChannelName}>{channel.name.trim() || 'Name required'}</h3>
                  <button
                    className="channel-tab-remove"
                    type="button"
                    aria-label={removeLabel}
                    onClick={(event) => {
                      event.stopPropagation();
                      onRemoveChannel(channel.id);
                    }}
                    disabled={isFrontPageLocked}
                  >
                    x
                  </button>
                </div>
                <p className="channel-tab-meta">{tabMeta}</p>
              </div>
            </div>
          )}
          <div id={`channel-row-panel-${channel.id}`} className="setup-row-panel" role="tabpanel">
            <ChannelCard
              key={channel.id}
              channel={channel}
              isDisabled={isFrontPageLocked}
              onLayerFilesAdded={onChannelLayerFilesAdded}
              onLayerDrop={onChannelLayerDrop}
              onLayerRemove={onChannelLayerRemove}
            />
          </div>
        </div>
      );
    });
  };

  return (
    <div className="channel-board">
      <section className="setup-section">
        <div
          className={`setup-section-header${standardChannels.length === 0 ? ' setup-section-header--title-only' : ''}`}
        >
          <h2 className="setup-section-title">Channels</h2>
          {standardChannels.length > 0 ? (
            <p className="setup-section-panel-title">Upload sequence of 3D files (.tif/.tiff)</p>
          ) : null}
        </div>
        <div className="setup-rows" role="list">
          {renderChannelRows(orderedStandardChannelRows, {
            addKeyPrefix: 'channel-add',
            addLabel: '+ Add channel',
            onAdd: onAddChannel
          })}
        </div>
      </section>

      <section className="setup-section">
        <div
          className={`setup-section-header${
            segmentationChannels.length === 0 ? ' setup-section-header--title-only' : ''
          }`}
        >
          <h2 className="setup-section-title">Segmentation channels</h2>
          {segmentationChannels.length > 0 ? (
            <p className="setup-section-panel-title">Upload sequence of 3D files (.tif/.tiff)</p>
          ) : null}
        </div>
        <div className="setup-rows" role="list">
          {renderChannelRows(orderedSegmentationChannelRows, {
            addKeyPrefix: 'segmentation-channel-add',
            addLabel: '+ Add segmentation channel',
            onAdd: onAddSegmentationChannel
          })}
        </div>
      </section>

      <section className="setup-section">
        <div className={`setup-section-header${tracks.length === 0 ? ' setup-section-header--title-only' : ''}`}>
          <h2 className="setup-section-title">Tracks</h2>
          {tracks.length > 0 ? <p className="setup-section-panel-title">Upload track file (.csv)</p> : null}
        </div>
        <div className="setup-rows" role="list">
          {orderedTrackRows.map((row, index) => {
            if (row.type === 'add') {
              return (
                <div key={`track-add-${index}`} className="setup-row setup-row--add" role="listitem">
                  <button
                    type="button"
                    className="channel-tab channel-tab--add"
                    onClick={onAddTrack}
                    disabled={isFrontPageLocked}
                  >
                    + Add track
                  </button>
                  <div className="setup-row-panel setup-row-panel--empty" />
                </div>
              );
            }

            const trackSet = row.trackSet;
            const validation = trackValidationMap.get(trackSet.id) ?? { errors: [], warnings: [] };
            const isEditing = editingTrackId === trackSet.id;
            const trackName = trackSet.name.trim();
            const hasTrackError = validation.errors.length > 0 || trackSet.status === 'error';
            const tabClassName = [
              'channel-tab',
              hasTrackError ? 'has-error' : '',
              !hasTrackError && trackSet.status === 'loading' ? 'has-warning' : '',
              isFrontPageLocked ? 'is-disabled' : ''
            ]
              .filter(Boolean)
              .join(' ');
            const tabMeta = buildTrackTabMeta(trackSet, channelNameMap, validation);
            const startEditingTrackName = () => {
              if (isFrontPageLocked || editingTrackId === trackSet.id) {
                return;
              }
              editingTrackOriginalNameRef.current = trackSet.name;
              setEditingTrackId(trackSet.id);
            };
            const removeLabel = trackName ? `Remove ${trackName}` : 'Remove track';

            return (
              <div key={trackSet.id} className="setup-row" role="listitem">
                {isEditing ? (
                  <div className={`${tabClassName} is-editing`} role="tab" aria-controls={`track-row-panel-${trackSet.id}`}>
                    <input
                      ref={editingTrackInputRef}
                      type="text"
                      value={trackSet.name}
                      className="channel-name-input"
                      maxLength={ENTITY_NAME_MAX_LENGTH}
                      onChange={(event) => onTrackSetNameChange(trackSet.id, event.target.value)}
                      onBlur={() => setEditingTrackId(null)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          setEditingTrackId(null);
                        } else if (event.key === 'Escape') {
                          onTrackSetNameChange(trackSet.id, editingTrackOriginalNameRef.current);
                          setEditingTrackId(null);
                        }
                      }}
                    />
                    <p className="channel-tab-meta">{tabMeta}</p>
                    <button
                      type="button"
                      className="channel-tab-remove"
                      onPointerDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                      onClick={(event) => {
                        event.stopPropagation();
                        onTrackSetRemove(trackSet.id);
                      }}
                      aria-label={removeLabel}
                      disabled={isFrontPageLocked}
                    >
                      x
                    </button>
                  </div>
                ) : (
                  <div
                    className={tabClassName}
                    role="tab"
                    aria-controls={`track-row-panel-${trackSet.id}`}
                    onDoubleClick={startEditingTrackName}
                  >
                    <div className="channel-tab-content">
                      <div className="channel-tab-title-row">
                        <h3 onDoubleClick={startEditingTrackName}>{trackName || 'Name required'}</h3>
                        <button
                          className="channel-tab-remove"
                          type="button"
                          aria-label={removeLabel}
                          onClick={(event) => {
                            event.stopPropagation();
                            onTrackSetRemove(trackSet.id);
                          }}
                          disabled={isFrontPageLocked}
                        >
                          x
                        </button>
                      </div>
                      <p className="channel-tab-meta">{tabMeta}</p>
                    </div>
                  </div>
                )}
                <div id={`track-row-panel-${trackSet.id}`} className="setup-row-panel" role="tabpanel">
                  <TrackCard
                    trackSet={trackSet}
                    channels={channels}
                    isDisabled={isFrontPageLocked}
                    onTrackFilesAdded={onTrackFilesAdded}
                    onTrackDrop={onTrackDrop}
                    onTrackSetBoundChannelChange={onTrackSetBoundChannelChange}
                    onTrackSetClearFile={onTrackSetClearFile}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};

export default ChannelListPanel;
export type { ChannelListPanelProps };
