import type { Dispatch, MutableRefObject, SetStateAction } from 'react';

import type { DatasetErrorHook } from '../../hooks/useDatasetErrors';
import type { VoxelResolutionHook } from '../../hooks/useVoxelResolution';
import type {
  ChannelSource,
  ChannelValidation,
  StagedPreprocessedExperiment,
  TrackSetSource,
  TrackValidation
} from '../../hooks/dataset';
import type { FollowedTrackState, TrackSetState } from '../../types/channelTracks';
import type { CompiledTrackSetHeader } from '../../types/tracks';
import type { TrackSummary as FrontPageTrackSummary } from '../../components/pages/FrontPage';

export type FrontPageWarningWindowProps = {
  warningWindowInitialPosition: { x: number; y: number };
  warningWindowWidth: number;
};

export type FrontPageRouteProps = {
  isExperimentSetupStarted: boolean;
  channels: ChannelSource[];
  setChannels: Dispatch<SetStateAction<ChannelSource[]>>;
  tracks: TrackSetSource[];
  setTracks: Dispatch<SetStateAction<TrackSetSource[]>>;
  activeChannelId: string | null;
  activeChannel: ChannelSource | null;
  channelValidationMap: Map<string, ChannelValidation>;
  trackValidationMap: Map<string, TrackValidation>;
  editingChannelId: string | null;
  editingChannelInputRef: MutableRefObject<HTMLInputElement | null>;
  editingChannelOriginalNameRef: MutableRefObject<string>;
  setActiveChannelId: Dispatch<SetStateAction<string | null>>;
  setEditingChannelId: Dispatch<SetStateAction<string | null>>;
  onStartExperimentSetup: () => void;
  onAddChannel: () => void;
  onAddSegmentationChannel: () => void;
  onReturnToStart: () => void;
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
  onTrackSetTimepointConventionChange: (
    trackSetId: string,
    timepointConvention: TrackSetSource['timepointConvention']
  ) => void | Promise<void>;
  onTrackSetClearFile: (trackSetId: string) => void;
  onTrackSetRemove: (trackSetId: string) => void;
  setIsExperimentSetupStarted: Dispatch<SetStateAction<boolean>>;
  setViewerMode: Dispatch<SetStateAction<'3d'>>;
  updateChannelIdCounter: (sources: ChannelSource[]) => void;
  showInteractionWarning: (message: string) => void;
  isLaunchingViewer: boolean;
  setTrackSetStates: Dispatch<SetStateAction<Record<string, TrackSetState>>>;
  setTrackOrderModeByTrackSet: Dispatch<SetStateAction<Record<string, 'id' | 'length'>>>;
  setSelectedTrackOrder: Dispatch<SetStateAction<string[]>>;
  setFollowedTrack: Dispatch<SetStateAction<FollowedTrackState>>;
  computeTrackSummary: (summary: CompiledTrackSetHeader | null | undefined) => FrontPageTrackSummary;
  hasGlobalTimepointMismatch: boolean;
  interactionErrorMessage: string | null;
  launchErrorMessage: string | null;
  onLaunchViewer: () => void;
  onLaunchViewerInPerformanceMode: () => void;
  canLaunch: boolean;
  onPreprocessedStateChange?: (state: {
    preprocessedExperiment: StagedPreprocessedExperiment | null;
    resetPreprocessedState: () => void;
  }) => void;
  datasetErrors: DatasetErrorHook;
  voxelResolution: VoxelResolutionHook;
};

export type FrontPageContainerProps = FrontPageRouteProps & FrontPageWarningWindowProps;
