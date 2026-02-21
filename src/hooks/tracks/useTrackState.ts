import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { ChannelSource, TrackSetSource } from '../dataset';
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
  tracks: TrackSetSource[];
  setTracks: Dispatch<SetStateAction<TrackSetSource[]>>;
  createTrackSetSource: (name: string, boundChannelId: string | null) => TrackSetSource;
  updateTrackSetIdCounter: (sources: TrackSetSource[]) => void;
  volumeTimepointCount: number;
};

export const useTrackState = ({
  channels,
  tracks,
  setTracks,
  createTrackSetSource,
  updateTrackSetIdCounter,
  volumeTimepointCount
}: UseTrackStateOptions) => {
  const {
    trackSets,
    rawTracksByTrackSet,
    handleAddTrackSet,
    handleTrackFilesAdded,
    handleTrackDrop,
    handleTrackSetNameChange,
    handleTrackSetBoundChannelChange,
    handleTrackSetClearFile,
    handleTrackSetRemove
  } = useParsedTracks({
    tracks,
    setTracks,
    channels,
    createTrackSetSource,
    updateTrackSetIdCounter
  });

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
    handleAddTrackSet,
    handleTrackFilesAdded,
    handleTrackDrop,
    handleTrackSetNameChange,
    handleTrackSetBoundChannelChange,
    handleTrackSetClearFile,
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
