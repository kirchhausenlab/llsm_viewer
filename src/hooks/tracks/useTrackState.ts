import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { ChannelSource } from '../dataset';
import type { ExperimentDimension } from '../useVoxelResolution';
import useParsedTracks from './useParsedTracks';
import useTrackStyling, {
  DEFAULT_TRACK_LINE_WIDTH,
  DEFAULT_TRACK_OPACITY,
  createDefaultChannelTrackState
} from './useTrackStyling';
import useTrackSelection, {
  DEFAULT_TRACK_TRAIL_LENGTH,
  TRACK_SMOOTHING_RANGE,
  TRACK_TRAIL_LENGTH_RANGE,
} from './useTrackSelection';

export type UseTrackStateOptions = {
  channels: ChannelSource[];
  setChannels: Dispatch<SetStateAction<ChannelSource[]>>;
  experimentDimension: ExperimentDimension;
  volumeTimepointCount: number;
};

export const useTrackState = ({
  channels,
  setChannels,
  experimentDimension,
  volumeTimepointCount
}: UseTrackStateOptions) => {
  const { rawTracksByChannel, handleChannelTrackFileSelected, handleChannelTrackDrop, handleChannelTrackClear } =
    useParsedTracks({ channels, setChannels, experimentDimension });

  const styling = useTrackStyling({ channels, parsedTracksByChannel: rawTracksByChannel });

  const selection = useTrackSelection({
    channels,
    rawTracksByChannel,
    volumeTimepointCount,
    channelTrackStates: styling.channelTrackStates,
    setChannelTrackStates: styling.setChannelTrackStates,
    ensureTrackIsVisible: styling.ensureTrackIsVisible
  });

  const resetTrackState = useCallback(() => {
    styling.resetTrackStyling();
    selection.resetTrackSelection();
  }, [selection.resetTrackSelection, styling.resetTrackStyling]);

  return {
    ...selection,
    ...styling,
    rawTracksByChannel,
    handleChannelTrackFileSelected,
    handleChannelTrackDrop,
    handleChannelTrackClear,
    resetTrackState
  };
};

export default useTrackState;
export {
  DEFAULT_TRACK_OPACITY,
  DEFAULT_TRACK_LINE_WIDTH,
  TRACK_SMOOTHING_RANGE,
  TRACK_TRAIL_LENGTH_RANGE,
  DEFAULT_TRACK_TRAIL_LENGTH,
  createDefaultChannelTrackState,
};
