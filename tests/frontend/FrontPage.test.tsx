import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import TestRenderer from 'react-test-renderer';

import FrontPage from '../../src/components/pages/FrontPage.tsx';

(import.meta as any).env = (import.meta as any).env ?? {};

function collectText(renderer: any): string {
  const textNodes = renderer.root.findAll((node: any) => typeof node.children?.[0] === 'string');
  return textNodes.flatMap((node: any) => node.children).join(' ');
}

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

test('front page initial mode renders setup choices', () => {
  const renderer = TestRenderer.create(<FrontPage {...(buildBaseProps() as any)} />);
  const text = collectText(renderer);

  assert.match(text, /Mirante4D/);
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

test('front page experiment type mode renders chooser buttons', () => {
  const props = buildBaseProps();
  const renderer = TestRenderer.create(
    <FrontPage
      {...(props as any)}
      frontPageMode="experimentTypeSelection"
    />
  );

  const text = collectText(renderer);
  assert.match(text, /Choose the type of experiment:/);
  assert.match(text, /3D movie/);
  assert.match(text, /2D movie/);
  assert.match(text, /Single 3D volume/);

  renderer.unmount();
});

test('front page configuring mode uses 2D movie upload copy and keeps tracks section', () => {
  const props = buildBaseProps();
  const renderer = TestRenderer.create(
    <FrontPage
      {...(props as any)}
      frontPageMode="configuring"
      experimentConfiguration={{
        ...props.experimentConfiguration,
        experimentType: '2d-movie'
      }}
      channelListPanel={{
        ...props.channelListPanel,
        channels: [{ id: 'channel-1', name: 'Channel 1', layers: [], channelType: 'channel' }]
      }}
    />
  );

  const text = collectText(renderer);
  assert.match(text, /Upload single 3D file or sequence of 2D files \(\.tif\/\.tiff\)/);
  assert.match(text, /Tracks/);
  renderer.unmount();
});

test('front page configuring mode hides tracks section for single 3D volume', () => {
  const props = buildBaseProps();
  const renderer = TestRenderer.create(
    <FrontPage
      {...(props as any)}
      frontPageMode="configuring"
      experimentConfiguration={{
        ...props.experimentConfiguration,
        experimentType: 'single-3d-volume'
      }}
      channelListPanel={{
        ...props.channelListPanel,
        channels: [{ id: 'channel-1', name: 'Channel 1', layers: [], channelType: 'channel' }],
        tracks: [
          {
            id: 'track-set-1',
            name: 'Track set',
            boundChannelId: null,
            file: null,
            fileName: '',
            status: 'idle',
            error: null,
            entries: []
          }
        ]
      }}
    />
  );

  const text = collectText(renderer);
  assert.match(text, /Upload single 3D file or sequence of 2D files \(\.tif\/\.tiff\)/);
  assert.doesNotMatch(text, /\bTracks\b/);
  renderer.unmount();
});
