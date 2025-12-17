import type { Dispatch, SetStateAction } from 'react';
import type { ChannelTrackState, FollowedTrackState } from '../../types/channelTracks';
import type { ChannelSource, StagedPreprocessedExperiment } from './useChannelSources';
import type { ExperimentDimension } from '../useVoxelResolution';
import { usePreprocessedImport } from '../preprocessedExperiment/usePreprocessedImport';

export type UsePreprocessedExperimentOptions = {
  channels: ChannelSource[];
  setChannels: Dispatch<SetStateAction<ChannelSource[]>>;
  setActiveChannelId: Dispatch<SetStateAction<string | null>>;
  setEditingChannelId: Dispatch<SetStateAction<string | null>>;
  setChannelTrackStates: Dispatch<SetStateAction<Record<string, ChannelTrackState>>>;
  setTrackOrderModeByChannel: Dispatch<SetStateAction<Record<string, 'id' | 'length'>>>;
  setSelectedTrackOrder: Dispatch<SetStateAction<string[]>>;
  setFollowedTrack: Dispatch<SetStateAction<FollowedTrackState>>;
  setIsExperimentSetupStarted: Dispatch<SetStateAction<boolean>>;
  setExperimentDimension: Dispatch<SetStateAction<ExperimentDimension>>;
  setViewerMode: Dispatch<SetStateAction<'3d' | '2d'>>;
  clearDatasetError: () => void;
  updateChannelIdCounter: (sources: ChannelSource[]) => void;
  showInteractionWarning: (message: string) => void;
  isLaunchingViewer: boolean;
};

export type UsePreprocessedExperimentResult = {
  preprocessedExperiment: StagedPreprocessedExperiment | null;
  setPreprocessedExperiment: (experiment: StagedPreprocessedExperiment | null) => void;
  isPreprocessedLoaderOpen: boolean;
  isPreprocessedImporting: boolean;
  preprocessedImportError: string | null;
  handlePreprocessedLoaderOpen: () => void;
  handlePreprocessedLoaderClose: () => void;
  handlePreprocessedBrowse: () => Promise<void>;
  resetPreprocessedState: () => void;
};

export default function usePreprocessedExperiment({
  channels,
  setChannels,
  setActiveChannelId,
  setEditingChannelId,
  setChannelTrackStates,
  setTrackOrderModeByChannel,
  setSelectedTrackOrder,
  setFollowedTrack,
  setIsExperimentSetupStarted,
  setExperimentDimension,
  setViewerMode,
  clearDatasetError,
  updateChannelIdCounter,
  showInteractionWarning,
  isLaunchingViewer
}: UsePreprocessedExperimentOptions): UsePreprocessedExperimentResult {
  const importState = usePreprocessedImport({
    setChannels,
    setActiveChannelId,
    setEditingChannelId,
    setChannelTrackStates,
    setTrackOrderModeByChannel,
    setSelectedTrackOrder,
    setFollowedTrack,
    setIsExperimentSetupStarted,
    setExperimentDimension,
    setViewerMode,
    clearDatasetError,
    updateChannelIdCounter
  });
  void channels;
  void showInteractionWarning;
  void isLaunchingViewer;

  return {
    preprocessedExperiment: importState.preprocessedExperiment,
    setPreprocessedExperiment: importState.setPreprocessedExperiment,
    isPreprocessedLoaderOpen: importState.isPreprocessedLoaderOpen,
    isPreprocessedImporting: importState.isPreprocessedImporting,
    preprocessedImportError: importState.preprocessedImportError,
    handlePreprocessedLoaderOpen: importState.handlePreprocessedLoaderOpen,
    handlePreprocessedLoaderClose: importState.handlePreprocessedLoaderClose,
    handlePreprocessedBrowse: importState.handlePreprocessedBrowse,
    resetPreprocessedState: importState.resetPreprocessedState
  };
}
