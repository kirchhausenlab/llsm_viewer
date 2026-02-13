import assert from 'node:assert/strict';

import {
  createRouteDatasetSetupProps,
  type RouteDatasetSetupSections
} from '../../../src/ui/app/hooks/routeDatasetSetupProps.ts';

console.log('Starting routeDatasetSetupProps tests');

(() => {
  const state = {
    isExperimentSetupStarted: true,
    channels: [],
    setChannels: (() => undefined) as RouteDatasetSetupSections['state']['setChannels'],
    activeChannelId: 'channel-1',
    activeChannel: null,
    channelValidationMap: new Map(),
    editingChannelId: 'channel-1',
    editingChannelInputRef: { current: null },
    editingChannelOriginalNameRef: { current: 'Original' },
    setActiveChannelId: (() => undefined) as RouteDatasetSetupSections['state']['setActiveChannelId'],
    setEditingChannelId: (() => undefined) as RouteDatasetSetupSections['state']['setEditingChannelId'],
    setIsExperimentSetupStarted: (() => undefined) as RouteDatasetSetupSections['state']['setIsExperimentSetupStarted'],
    setViewerMode: (() => undefined) as RouteDatasetSetupSections['state']['setViewerMode'],
    updateChannelIdCounter: () => undefined
  } satisfies RouteDatasetSetupSections['state'];

  const handlers = {
    onStartExperimentSetup: () => undefined,
    onAddChannel: () => undefined,
    onReturnToStart: () => undefined,
    onChannelNameChange: () => undefined,
    onRemoveChannel: () => undefined,
    onChannelLayerFilesAdded: () => undefined,
    onChannelLayerDrop: () => undefined,
    onChannelLayerSegmentationToggle: () => undefined,
    onChannelLayerRemove: () => undefined,
    onChannelTrackFilesAdded: () => undefined,
    onChannelTrackDrop: () => undefined,
    onChannelTrackSetNameChange: () => undefined,
    onChannelTrackSetRemove: () => undefined
  } satisfies RouteDatasetSetupSections['handlers'];

  const tracks = {
    setTrackSetStates: (() => undefined) as RouteDatasetSetupSections['tracks']['setTrackSetStates'],
    setTrackOrderModeByTrackSet: (() => undefined) as RouteDatasetSetupSections['tracks']['setTrackOrderModeByTrackSet'],
    setSelectedTrackOrder: (() => undefined) as RouteDatasetSetupSections['tracks']['setSelectedTrackOrder'],
    setFollowedTrack: (() => undefined) as RouteDatasetSetupSections['tracks']['setFollowedTrack'],
    computeTrackSummary: () => ({ totalRows: 0, uniqueTracks: 0 })
  } satisfies RouteDatasetSetupSections['tracks'];

  const launch = {
    showInteractionWarning: () => undefined,
    isLaunchingViewer: false,
    hasGlobalTimepointMismatch: false,
    interactionErrorMessage: 'interaction-warning',
    launchErrorMessage: 'launch-error',
    onLaunchViewer: () => undefined,
    canLaunch: true
  } satisfies RouteDatasetSetupSections['launch'];

  const preprocess = {
    onPreprocessedStateChange: () => undefined,
    datasetErrors: {} as RouteDatasetSetupSections['preprocess']['datasetErrors'],
    voxelResolution: {} as RouteDatasetSetupSections['preprocess']['voxelResolution']
  } satisfies RouteDatasetSetupSections['preprocess'];

  const result = createRouteDatasetSetupProps({
    state,
    handlers,
    tracks,
    launch,
    preprocess
  });

  assert.strictEqual(result.activeChannelId, state.activeChannelId);
  assert.strictEqual(result.editingChannelOriginalNameRef, state.editingChannelOriginalNameRef);
  assert.strictEqual(result.onChannelTrackDrop, handlers.onChannelTrackDrop);
  assert.strictEqual(result.setTrackSetStates, tracks.setTrackSetStates);
  assert.strictEqual(result.launchErrorMessage, launch.launchErrorMessage);
  assert.strictEqual(result.datasetErrors, preprocess.datasetErrors);
  assert.strictEqual(result.voxelResolution, preprocess.voxelResolution);
})();

console.log('routeDatasetSetupProps tests passed');
