import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { ChannelSource } from '../dataset';
import useParsedTracks from './useParsedTracks';
import useTrackStyling, {
  DEFAULT_TRACK_LINE_WIDTH,
  DEFAULT_TRACK_OPACITY,
  createDefaultTrackSetState
} from './useTrackStyling';
import useTrackSelection, {
  DEFAULT_TRACK_TRAIL_LENGTH,
  TRACK_SMOOTHING_RANGE,
  TRACK_TRAIL_LENGTH_RANGE,
} from './useTrackSelection';

export type UseTrackStateOptions = {
  channels: ChannelSource[];
  setChannels: Dispatch<SetStateAction<ChannelSource[]>>;
  volumeTimepointCount: number;
};

export const useTrackState = ({
  channels,
  setChannels,
  volumeTimepointCount
}: UseTrackStateOptions) => {
  const {
    trackSets,
    rawTracksByTrackSet,
    handleChannelTrackFilesAdded,
    handleChannelTrackDrop,
    handleTrackSetNameChange,
    handleTrackSetRemove
  } = useParsedTracks({ channels, setChannels });

  const styling = useTrackStyling({ trackSets, parsedTracksByTrackSet: rawTracksByTrackSet });

  const selection = useTrackSelection({
    trackSets,
    rawTracksByTrackSet,
    volumeTimepointCount,
    trackSetStates: styling.trackSetStates,
    setTrackSetStates: styling.setTrackSetStates,
    ensureTrackIsVisible: styling.ensureTrackIsVisible
  });

  const resetTrackState = useCallback(() => {
    styling.resetTrackStyling();
    selection.resetTrackSelection();
  }, [selection.resetTrackSelection, styling.resetTrackStyling]);

  return {
    ...selection,
    ...styling,
    trackSets,
    rawTracksByTrackSet,
    handleChannelTrackFilesAdded,
    handleChannelTrackDrop,
    handleTrackSetNameChange,
    handleTrackSetRemove,
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
  createDefaultTrackSetState,
};
