import type { Dispatch, SetStateAction } from 'react';
import type { FollowedTrackState, TrackSetState } from '../../types/channelTracks';
import type { ChannelSource, StagedPreprocessedExperiment, TrackSetSource } from './useChannelSources';
import { usePreprocessedImport } from '../preprocessedExperiment/usePreprocessedImport';
import type { PublicExperimentCatalogEntry } from '../../shared/utils/publicExperimentCatalog';

export type UsePreprocessedExperimentOptions = {
  channels: ChannelSource[];
  setChannels: Dispatch<SetStateAction<ChannelSource[]>>;
  tracks: TrackSetSource[];
  setTracks: Dispatch<SetStateAction<TrackSetSource[]>>;
  setActiveChannelId: Dispatch<SetStateAction<string | null>>;
  setEditingChannelId: Dispatch<SetStateAction<string | null>>;
  setTrackSetStates: Dispatch<SetStateAction<Record<string, TrackSetState>>>;
  setTrackOrderModeByTrackSet: Dispatch<SetStateAction<Record<string, 'id' | 'length'>>>;
  setSelectedTrackOrder: Dispatch<SetStateAction<string[]>>;
  setFollowedTrack: Dispatch<SetStateAction<FollowedTrackState>>;
  setIsExperimentSetupStarted: Dispatch<SetStateAction<boolean>>;
  setViewerMode: Dispatch<SetStateAction<'3d'>>;
  clearDatasetError: () => void;
  updateChannelIdCounter: (sources: ChannelSource[]) => void;
  showInteractionWarning: (message: string) => void;
  isLaunchingViewer: boolean;
};

export type UsePreprocessedExperimentResult = {
  preprocessedExperiment: StagedPreprocessedExperiment | null;
  setPreprocessedExperiment: (experiment: StagedPreprocessedExperiment | null) => void;
  isPreprocessedLoaderOpen: boolean;
  isPublicExperimentLoaderOpen: boolean;
  isPublicExperimentCatalogLoading: boolean;
  publicExperimentCatalog: PublicExperimentCatalogEntry[];
  publicExperimentCatalogError: string | null;
  activePublicExperimentId: string | null;
  publicExperimentCatalogUrl: string;
  isPreprocessedImporting: boolean;
  preprocessedImportError: string | null;
  handlePreprocessedLoaderOpen: () => void;
  handlePreprocessedLoaderClose: () => void;
  handlePublicExperimentLoaderOpen: () => void;
  handlePublicExperimentLoaderClose: () => void;
  handlePublicExperimentCatalogRefresh: () => Promise<void>;
  handlePublicExperimentLoad: (experimentId: string) => Promise<void>;
  handlePreprocessedBrowse: () => Promise<void>;
  handlePreprocessedArchiveBrowse: () => Promise<void>;
  handlePreprocessedArchiveDrop: (file: File) => Promise<void>;
  resetPreprocessedState: () => void;
};

export default function usePreprocessedExperiment({
  channels,
  setChannels,
  tracks,
  setTracks,
  setActiveChannelId,
  setEditingChannelId,
  setTrackSetStates,
  setTrackOrderModeByTrackSet,
  setSelectedTrackOrder,
  setFollowedTrack,
  setIsExperimentSetupStarted,
  setViewerMode,
  clearDatasetError,
  updateChannelIdCounter,
  showInteractionWarning,
  isLaunchingViewer
}: UsePreprocessedExperimentOptions): UsePreprocessedExperimentResult {
  const importState = usePreprocessedImport({
    setChannels,
    setTracks,
    setActiveChannelId,
    setEditingChannelId,
    setTrackSetStates,
    setTrackOrderModeByTrackSet,
    setSelectedTrackOrder,
    setFollowedTrack,
    setIsExperimentSetupStarted,
    setViewerMode,
    clearDatasetError,
    updateChannelIdCounter
  });
  void channels;
  void tracks;
  void showInteractionWarning;
  void isLaunchingViewer;

  return {
    preprocessedExperiment: importState.preprocessedExperiment,
    setPreprocessedExperiment: importState.setPreprocessedExperiment,
    isPreprocessedLoaderOpen: importState.isPreprocessedLoaderOpen,
    isPublicExperimentLoaderOpen: importState.isPublicExperimentLoaderOpen,
    isPublicExperimentCatalogLoading: importState.isPublicExperimentCatalogLoading,
    publicExperimentCatalog: importState.publicExperimentCatalog,
    publicExperimentCatalogError: importState.publicExperimentCatalogError,
    activePublicExperimentId: importState.activePublicExperimentId,
    publicExperimentCatalogUrl: importState.publicExperimentCatalogUrl,
    isPreprocessedImporting: importState.isPreprocessedImporting,
    preprocessedImportError: importState.preprocessedImportError,
    handlePreprocessedLoaderOpen: importState.handlePreprocessedLoaderOpen,
    handlePreprocessedLoaderClose: importState.handlePreprocessedLoaderClose,
    handlePublicExperimentLoaderOpen: importState.handlePublicExperimentLoaderOpen,
    handlePublicExperimentLoaderClose: importState.handlePublicExperimentLoaderClose,
    handlePublicExperimentCatalogRefresh: importState.handlePublicExperimentCatalogRefresh,
    handlePublicExperimentLoad: importState.handlePublicExperimentLoad,
    handlePreprocessedBrowse: importState.handlePreprocessedBrowse,
    handlePreprocessedArchiveBrowse: importState.handlePreprocessedArchiveBrowse,
    handlePreprocessedArchiveDrop: importState.handlePreprocessedArchiveDrop,
    resetPreprocessedState: importState.resetPreprocessedState
  };
}
