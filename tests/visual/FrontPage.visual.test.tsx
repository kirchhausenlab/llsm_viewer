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
      onOpenPublicExperimentLoader: noop,
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
    publicExperimentLoader: {
      isOpen: false,
      catalogUrl: 'https://mirante4d.s3.us-east-1.amazonaws.com/examples/catalog.json',
      publicExperiments: [],
      isCatalogLoading: false,
      isPreprocessedImporting: false,
      activePublicExperimentId: null,
      publicExperimentError: null,
      onRefreshPublicExperiments: noop,
      onLoadPublicExperiment: noop
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
      computeTrackSummary: () => ({ totalPoints: 0, totalTracks: 0 })
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
  const props = buildFrontPageProps();
  const renderer = TestRenderer.create(
    <FrontPage
      {...(props as any)}
      header={{
        ...props.header,
        versionLabel: 'v0.2.0',
        performanceNotice: {
          title: 'Performance note',
          lines: [
            'Mirante4D works best in Chrome.',
            'It makes heavy use of the user\'s GPUs.',
            'This is an early build still being optimized: browser performance and stability may be affected.'
          ]
        }
      }}
    />
  );
  const tree = renderer.toJSON();
  assertVisualSnapshot('frontpage-initial', `${JSON.stringify(tree, null, 2)}\n`);
  renderer.unmount();
});

test('visual snapshot: public experiments page', () => {
  const props = buildFrontPageProps();
  const renderer = TestRenderer.create(
    <FrontPage
      {...(props as any)}
      frontPageMode="publicExperiments"
      publicExperimentLoader={{
        ...props.publicExperimentLoader,
        isOpen: true,
        publicExperiments: [
          {
            id: 'ap2',
            label: 'AP2',
            description: '1 timepoint, 3 channels (raw, PCA, instance segmentation).',
            baseUrl: 'https://mirante4d.s3.us-east-1.amazonaws.com/examples/datasets/ap2.zarr',
            timepoints: 1
          },
          {
            id: 'npc1',
            label: 'NPC1',
            description: '5 timepoints, 1 channel (raw), tracks.',
            baseUrl: 'https://mirante4d.s3.us-east-1.amazonaws.com/examples/datasets/npc2_5.zarr',
            timepoints: 5
          }
        ]
      }}
    />
  );
  const tree = renderer.toJSON();
  assertVisualSnapshot('frontpage-public-experiments', `${JSON.stringify(tree, null, 2)}\n`);
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
