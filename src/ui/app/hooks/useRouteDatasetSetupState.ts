import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { ChannelSource, ChannelSourceType, TrackSetSource } from '../../../hooks/dataset';
import type { ChannelRemovalContext } from './useChannelEditing';

type UseRouteDatasetSetupStateOptions = {
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
};

type RouteDatasetSetupState = {
  handleStartExperimentSetup: () => void;
  handleAddChannel: () => void;
  handleAddSegmentationChannel: () => void;
  handleChannelNameChange: (channelId: string, value: string) => void;
  handleRemoveChannel: (channelId: string) => void;
};

export function useRouteDatasetSetupState({
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
  setLayerTimepointCounts
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
      let removedLayerIds: string[] = [];
      setChannels((current) => {
        const filtered = current.filter((channel) => channel.id !== channelId);
        const removedChannel = current.find((channel) => channel.id === channelId);
        if (removedChannel) {
          removedLayerIds = removedChannel.layers.map((layer) => layer.id);
        }
        handleChannelRemoved({
          removedChannelId: channelId,
          previousChannels: current,
          nextChannels: filtered
        });
        return filtered;
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
      }
      setTracks((current) => {
        let changed = false;
        const next = current.map((trackSet) => {
          if (trackSet.boundChannelId !== channelId) {
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
    [clearDatasetError, handleChannelRemoved, setChannels, setLayerTimepointCounts, setTracks]
  );

  return {
    handleStartExperimentSetup,
    handleAddChannel,
    handleAddSegmentationChannel,
    handleChannelNameChange,
    handleRemoveChannel
  };
}
