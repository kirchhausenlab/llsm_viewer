import { test } from 'node:test';
import React from 'react';
import TestRenderer from 'react-test-renderer';

import FrontPage from '../../src/components/pages/FrontPage.tsx';
import LaunchActions from '../../src/components/pages/LaunchActions.tsx';
import { assertVisualSnapshot } from '../helpers/visualSnapshot.ts';

function buildFrontPageProps() {
  const noop = () => {};
  return {
    isFrontPageLocked: false,
    frontPageMode: 'initial' as const,
    header: {
      onReturnToStart: noop,
      isFrontPageLocked: false
    },
    initialActions: {
      isFrontPageLocked: false,
      onStartExperimentSetup: noop,
      onOpenPreprocessedLoader: noop,
      isPreprocessedImporting: false
    },
    experimentTypeSelection: {
      onSelectExperimentType: noop,
      isFrontPageLocked: false
    },
    experimentConfiguration: {
      experimentType: 'single-3d-volume' as const,
      voxelResolution: { x: '', y: '', z: '', t: '', unit: 'μm', timeUnit: 's', correctAnisotropy: false },
      onVoxelResolutionAxisChange: noop,
      onVoxelResolutionUnitChange: noop,
      onVoxelResolutionTimeUnitChange: noop,
      onVoxelResolutionAnisotropyToggle: noop
    },
    preprocessedLoader: {
      isOpen: false,
      isPreprocessedImporting: false,
      onPreprocessedBrowse: noop,
      onPreprocessedArchiveBrowse: noop,
      onPreprocessedArchiveDrop: noop,
      preprocessedImportError: null
    },
    channelListPanel: {
      channels: [],
      tracks: [],
      channelValidationMap: new Map(),
      trackValidationMap: new Map(),
      activeChannelId: null,
      activeChannel: null,
      editingChannelId: null,
      editingChannelInputRef: { current: null },
      editingChannelOriginalNameRef: { current: '' },
      setActiveChannelId: noop,
      setEditingChannelId: noop,
      onAddChannel: noop,
      onAddSegmentationChannel: noop,
      onChannelNameChange: noop,
      onRemoveChannel: noop,
      onChannelLayerFilesAdded: noop,
      onChannelLayerDrop: noop,
      onChannelLayerRemove: noop,
      onAddTrack: noop,
      onTrackFilesAdded: noop,
      onTrackDrop: noop,
      onTrackSetNameChange: noop,
      onTrackSetBoundChannelChange: noop,
      onTrackSetClearFile: noop,
      onTrackSetRemove: noop,
      isFrontPageLocked: false
    },
    preprocessedSummary: {
      preprocessedExperiment: null,
      computeTrackSummary: () => ({ totalRows: 0, uniqueTracks: 0 })
    },
    launchActions: {
      frontPageMode: 'initial' as const,
      hasGlobalTimepointMismatch: false,
      interactionErrorMessage: null,
      launchErrorMessage: null,
      showLaunchViewerButton: false,
      onPreprocessExperiment: noop,
      isPreprocessingExperiment: false,
      preprocessButtonEnabled: false,
      preprocessSuccessMessage: null,
      exportWhilePreprocessing: false,
      onExportWhilePreprocessingChange: noop,
      exportName: '',
      onExportNameChange: noop,
      exportDestinationLabel: null,
      onLaunchViewer: noop,
      isLaunchingViewer: false,
      launchButtonEnabled: false,
      launchButtonLaunchable: 'false' as const
    },
    warningsWindow: {
      launchErrorMessage: null,
      warningWindowInitialPosition: { x: 0, y: 0 },
      warningWindowWidth: 320,
      datasetErrorResetSignal: 0,
      onDatasetErrorDismiss: noop
    }
  };
}

test('visual snapshot: front page initial state', () => {
  const renderer = TestRenderer.create(<FrontPage {...(buildFrontPageProps() as any)} />);
  const tree = renderer.toJSON();
  assertVisualSnapshot('frontpage-initial', `${JSON.stringify(tree, null, 2)}\n`);
  renderer.unmount();
});

test('visual snapshot: launch actions configuring state', () => {
  const renderer = TestRenderer.create(
    <LaunchActions
      frontPageMode="configuring"
      hasGlobalTimepointMismatch={false}
      interactionErrorMessage={null}
      launchErrorMessage={null}
      showLaunchViewerButton
      onPreprocessExperiment={() => {}}
      isPreprocessingExperiment={false}
      preprocessButtonEnabled
      preprocessSuccessMessage={null}
      exportWhilePreprocessing
      onExportWhilePreprocessingChange={() => {}}
      exportName="fixture"
      onExportNameChange={() => {}}
      exportDestinationLabel={null}
      onLaunchViewer={() => {}}
      isLaunchingViewer={false}
      launchButtonEnabled={false}
      launchButtonLaunchable="false"
    />
  );
  const tree = renderer.toJSON();
  assertVisualSnapshot('launch-actions-configuring', `${JSON.stringify(tree, null, 2)}\n`);
  renderer.unmount();
});
