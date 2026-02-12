import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import TestRenderer from 'react-test-renderer';

import FrontPage from '../../src/components/pages/FrontPage.tsx';

function buildBaseProps() {
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
    experimentConfiguration: {
      experimentDimension: '3d' as const,
      onExperimentDimensionChange: noop,
      voxelResolution: { x: '', y: '', z: '', unit: 'μm', correctAnisotropy: false },
      onVoxelResolutionAxisChange: noop,
      onVoxelResolutionUnitChange: noop,
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
      channelValidationMap: new Map(),
      activeChannelId: null,
      activeChannel: null,
      editingChannelId: null,
      editingChannelInputRef: { current: null },
      editingChannelOriginalNameRef: { current: '' },
      setActiveChannelId: noop,
      setEditingChannelId: noop,
      onAddChannel: noop,
      onChannelNameChange: noop,
      onRemoveChannel: noop,
      onChannelLayerFilesAdded: noop,
      onChannelLayerDrop: noop,
      onChannelLayerSegmentationToggle: noop,
      onChannelLayerRemove: noop,
      onChannelTrackFilesAdded: noop,
      onChannelTrackDrop: noop,
      onChannelTrackSetNameChange: noop,
      onChannelTrackSetRemove: noop,
      experimentDimension: '3d' as const,
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

test('front page initial mode renders setup choices', () => {
  const renderer = TestRenderer.create(<FrontPage {...(buildBaseProps() as any)} />);
  const textNodes = renderer.root.findAll((node: any) => typeof node.children?.[0] === 'string');
  const text = textNodes.flatMap((node: any) => node.children).join(' ');

  assert.match(text, /4D viewer/);
  assert.match(text, /Set up new experiment/);
  assert.match(text, /Load preprocessed experiment/);

  renderer.unmount();
});

test('front page preprocessed mode renders launch action', () => {
  const props = buildBaseProps();
  const renderer = TestRenderer.create(
    <FrontPage
      {...(props as any)}
      frontPageMode="preprocessed"
      preprocessedSummary={{
        preprocessedExperiment: {
          sourceName: 'Fixture',
          sourceSize: 1024,
          totalVolumeCount: 5,
          channelSummaries: [
            {
              id: 'channel-1',
              name: 'Channel 1',
              layers: [
                {
                  key: 'layer-1',
                  label: 'Layer 1',
                  isSegmentation: false,
                  volumeCount: 5,
                  width: 16,
                  height: 16,
                  depth: 4,
                  channels: 1,
                  min: 0,
                  max: 255
                }
              ],
              trackSets: []
            }
          ]
        },
        computeTrackSummary: () => ({ totalRows: 0, uniqueTracks: 0 })
      }}
      launchActions={{
        ...props.launchActions,
        frontPageMode: 'preprocessed',
        showLaunchViewerButton: true,
        launchButtonEnabled: true,
        launchButtonLaunchable: 'true'
      }}
    />
  );

  const launchButton = renderer.root
    .findAllByType('button')
    .find((button: any) => button.props.children === 'Launch viewer');
  assert.ok(launchButton);

  renderer.unmount();
});
