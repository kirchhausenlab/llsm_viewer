import { useCallback, type Dispatch, type SetStateAction } from 'react';
import {
  getOwnedMultichannelDerivedChannels,
  isMultichannelOwnerChannelSource,
  type ChannelSource,
  type ChannelSourceType,
  type TrackSetSource
} from '../../../hooks/dataset';
import type { ChannelRemovalContext } from './useChannelEditing';

type UseRouteDatasetSetupStateOptions = {
  channels: ChannelSource[];
  resetPreprocessedState: () => void;
  setIsExperimentSetupStarted: Dispatch<SetStateAction<boolean>>;
  resetChannelEditingState: () => void;
  clearDatasetError: () => void;
  setChannels: Dispatch<SetStateAction<ChannelSource[]>>;
  setTracks: Dispatch<SetStateAction<TrackSetSource[]>>;
  createChannelSource: (name: string, channelType?: ChannelSourceType) => ChannelSource;
  queuePendingChannelFocus: (channelId: string, originalName: string) => void;
  startEditingChannel: (channelId: string, originalName: string) => void;
  handleChannelRemoved: (context: ChannelRemovalContext) => void;
  setLayerTimepointCounts: Dispatch<SetStateAction<Record<string, number>>>;
  setLayerTimepointCountErrors: Dispatch<SetStateAction<Record<string, string>>>;
};

type RouteDatasetSetupState = {
  handleStartExperimentSetup: () => void;
  handleAddChannel: () => void;
  handleAddSegmentationChannel: () => void;
  handleChannelNameChange: (channelId: string, value: string) => void;
  handleRemoveChannel: (channelId: string) => void;
};

export function useRouteDatasetSetupState({
  channels,
  resetPreprocessedState,
  setIsExperimentSetupStarted,
  resetChannelEditingState,
  clearDatasetError,
  setChannels,
  setTracks,
  createChannelSource,
  queuePendingChannelFocus,
  startEditingChannel,
  handleChannelRemoved,
  setLayerTimepointCounts,
  setLayerTimepointCountErrors
}: UseRouteDatasetSetupStateOptions): RouteDatasetSetupState {
  const handleStartExperimentSetup = useCallback(() => {
    resetPreprocessedState();
    setIsExperimentSetupStarted(true);
    resetChannelEditingState();
    clearDatasetError();
  }, [clearDatasetError, resetChannelEditingState, resetPreprocessedState, setIsExperimentSetupStarted]);

  const handleAddChannel = useCallback(() => {
    resetPreprocessedState();
    setIsExperimentSetupStarted(true);

    const channel = createChannelSource('', 'channel');
    setChannels((current) => {
      return [...current, channel];
    });
    queuePendingChannelFocus(channel.id, channel.name);
    startEditingChannel(channel.id, channel.name);
    clearDatasetError();
  }, [
    clearDatasetError,
    createChannelSource,
    queuePendingChannelFocus,
    resetPreprocessedState,
    setChannels,
    setIsExperimentSetupStarted,
    startEditingChannel
  ]);

  const handleAddSegmentationChannel = useCallback(() => {
    resetPreprocessedState();
    setIsExperimentSetupStarted(true);

    const channel = createChannelSource('', 'segmentation');
    setChannels((current) => {
      return [...current, channel];
    });
    queuePendingChannelFocus(channel.id, channel.name);
    startEditingChannel(channel.id, channel.name);
    clearDatasetError();
  }, [
    clearDatasetError,
    createChannelSource,
    queuePendingChannelFocus,
    resetPreprocessedState,
    setChannels,
    setIsExperimentSetupStarted,
    startEditingChannel
  ]);

  const handleChannelNameChange = useCallback(
    (channelId: string, value: string) => {
      setChannels((current) =>
        current.map((channel) => (channel.id === channelId ? { ...channel, name: value } : channel))
      );
    },
    [setChannels]
  );

  const handleRemoveChannel = useCallback(
    (channelId: string) => {
      const removedChannel = channels.find((channel) => channel.id === channelId) ?? null;
      if (!removedChannel) {
        return;
      }
      const removedChildren = isMultichannelOwnerChannelSource(removedChannel)
        ? getOwnedMultichannelDerivedChannels(channels, channelId)
        : [];
      const removedLayerIds = [
        removedChannel.volume?.id ?? null,
        ...removedChildren.map((channel) => channel.volume?.id ?? null)
      ].filter((value): value is string => value !== null);
      const removedChannelIds = removedChildren.map((channel) => channel.id);
      const removedChannelIdSet = new Set([channelId, ...removedChannelIds]);
      const filtered = channels.filter((channel) => !removedChannelIdSet.has(channel.id));

      setChannels(filtered);
      handleChannelRemoved({
        removedChannelId: channelId,
        previousChannels: channels,
        nextChannels: filtered
      });
      if (removedLayerIds.length > 0) {
        setLayerTimepointCounts((current) => {
          let changed = false;
          const next = { ...current };
          for (const layerId of removedLayerIds) {
            if (layerId in next) {
              delete next[layerId];
              changed = true;
            }
          }
          return changed ? next : current;
        });
        setLayerTimepointCountErrors((current) => {
          let changed = false;
          const next = { ...current };
          for (const layerId of removedLayerIds) {
            if (layerId in next) {
              delete next[layerId];
              changed = true;
            }
          }
          return changed ? next : current;
        });
      }
      setTracks((current) => {
        let changed = false;
        const removedChannelIdSet = new Set([channelId, ...removedChannelIds]);
        const next = current.map((trackSet) => {
          if (!trackSet.boundChannelId || !removedChannelIdSet.has(trackSet.boundChannelId)) {
            return trackSet;
          }
          changed = true;
          return {
            ...trackSet,
            boundChannelId: null
          };
        });
        return changed ? next : current;
      });
      clearDatasetError();
    },
    [
      channels,
      clearDatasetError,
      handleChannelRemoved,
      setChannels,
      setLayerTimepointCountErrors,
      setLayerTimepointCounts,
      setTracks
    ]
  );

  return {
    handleStartExperimentSetup,
    handleAddChannel,
    handleAddSegmentationChannel,
    handleChannelNameChange,
    handleRemoveChannel
  };
}
