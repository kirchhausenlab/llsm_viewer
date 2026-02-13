import type { RouteDatasetSetupProps } from './useRouteViewerProps';

type RouteDatasetSetupStateSection = Pick<
  RouteDatasetSetupProps,
  | 'isExperimentSetupStarted'
  | 'channels'
  | 'setChannels'
  | 'activeChannelId'
  | 'activeChannel'
  | 'channelValidationMap'
  | 'editingChannelId'
  | 'editingChannelInputRef'
  | 'editingChannelOriginalNameRef'
  | 'setActiveChannelId'
  | 'setEditingChannelId'
  | 'setIsExperimentSetupStarted'
  | 'setViewerMode'
  | 'updateChannelIdCounter'
>;

type RouteDatasetSetupHandlersSection = Pick<
  RouteDatasetSetupProps,
  | 'onStartExperimentSetup'
  | 'onAddChannel'
  | 'onReturnToStart'
  | 'onChannelNameChange'
  | 'onRemoveChannel'
  | 'onChannelLayerFilesAdded'
  | 'onChannelLayerDrop'
  | 'onChannelLayerSegmentationToggle'
  | 'onChannelLayerRemove'
  | 'onChannelTrackFilesAdded'
  | 'onChannelTrackDrop'
  | 'onChannelTrackSetNameChange'
  | 'onChannelTrackSetRemove'
>;

type RouteDatasetSetupTrackSection = Pick<
  RouteDatasetSetupProps,
  | 'setTrackSetStates'
  | 'setTrackOrderModeByTrackSet'
  | 'setSelectedTrackOrder'
  | 'setFollowedTrack'
  | 'computeTrackSummary'
>;

type RouteDatasetSetupLaunchSection = Pick<
  RouteDatasetSetupProps,
  | 'showInteractionWarning'
  | 'isLaunchingViewer'
  | 'hasGlobalTimepointMismatch'
  | 'interactionErrorMessage'
  | 'launchErrorMessage'
  | 'onLaunchViewer'
  | 'canLaunch'
>;

type RouteDatasetSetupPreprocessSection = Pick<
  RouteDatasetSetupProps,
  'onPreprocessedStateChange' | 'datasetErrors' | 'voxelResolution'
>;

export type RouteDatasetSetupSections = {
  state: RouteDatasetSetupStateSection;
  handlers: RouteDatasetSetupHandlersSection;
  tracks: RouteDatasetSetupTrackSection;
  launch: RouteDatasetSetupLaunchSection;
  preprocess: RouteDatasetSetupPreprocessSection;
};

export function createRouteDatasetSetupProps({
  state,
  handlers,
  tracks,
  launch,
  preprocess
}: RouteDatasetSetupSections): RouteDatasetSetupProps {
  return {
    ...state,
    ...handlers,
    ...tracks,
    ...launch,
    ...preprocess
  };
}
