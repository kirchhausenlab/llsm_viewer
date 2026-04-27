import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import TestRenderer from 'react-test-renderer';

import FrontPage from '../../src/components/pages/FrontPage.tsx';

(import.meta as any).env = (import.meta as any).env ?? {};

function collectText(node: any): string {
  if (node == null) {
    return '';
  }
  if (typeof node === 'string') {
    return node;
  }
  if (Array.isArray(node)) {
    return node.map((child) => collectText(child)).join(' ');
  }
  if (typeof node.toJSON === 'function') {
    return collectText(node.toJSON());
  }
  return collectText(node.children);
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
      onVoxelResolutionAnisotropyToggle: noop,
      backgroundMaskEnabled: false,
      backgroundMaskValuesInput: '',
      backgroundMaskError: null,
      onBackgroundMaskToggle: noop,
      onBackgroundMaskValuesInputChange: noop,
      force8BitRender: false,
      onForce8BitRenderToggle: noop,
      deSkewModeEnabled: false,
      skewAngleInput: '31.5',
      skewAngleUnit: 'degrees' as const,
      skewDirection: 'X' as const,
      deSkewMaskVoxels: true,
      onDeSkewModeToggle: noop,
      onSkewAngleInputChange: noop,
      onSkewAngleUnitChange: noop,
      onSkewDirectionChange: noop,
      onDeSkewMaskVoxelsToggle: noop
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
      onTrackSetTimepointConventionChange: noop,
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
      onLaunchViewerInPerformanceMode: noop,
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
  const props = buildBaseProps();
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
  const text = collectText(renderer);
  const links = renderer.root.findAllByType('a');

  assert.match(text, /Mirante4D/);
  assert.match(text, /v0.2.0/);
  assert.match(text, /Set up new experiment/);
  assert.match(text, /Load preprocessed experiment/);
  assert.match(text, /Load public experiments/);
  assert.match(text, /Performance note/);
  assert.match(text, /Mirante4D works best in Chrome\./);
  assert.match(text, /It makes heavy use of the user's GPUs\./);
  assert.match(text, /early build still being optimized: browser performance and stability may be affected\./);
  assert.match(text, /Developed by/);
  assert.match(text, /Jose Inacio Costa-Filho/);
  assert.match(text, /Kirchhausen Lab/);
  assert.match(text, /GitHub/);
  assert.match(text, /If you use Mirante4D in academic work, please cite/);
  assert.match(text, /SpatialDINO/);
  assert.deepEqual(
    links.map((link: any) => link.props.href),
    [
      'https://github.com/josedacostafilho',
      'https://kirchhausen.hms.harvard.edu/',
      'https://github.com/kirchhausenlab/llsm_viewer',
      'https://www.biorxiv.org/content/10.64898/2025.12.31.697247v2'
    ]
  );

  renderer.unmount();
});

test('front page public experiments mode renders hosted example cards', () => {
  const props = buildBaseProps();
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

  const text = collectText(renderer);
  assert.match(text, /Load public experiments/);
  assert.match(text, /Visualize the experiments used in the SpatialDINO paper\./);
  assert.match(text, /AP2/);
  assert.match(text, /NPC1/);
  assert.match(text, /Load experiment/);
  assert.doesNotMatch(text, /About Mirante4D:/);

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
          manifest: {
            dataset: {
              voxelResolution: { x: 0.2, y: 0.2, z: 0.8, unit: 'μm' },
              temporalResolution: { interval: 2, unit: 's' }
            }
          },
          channelSummaries: [
            {
              id: 'channel-1',
              name: 'Channel 1',
              layers: [
                {
                  key: 'layer-1',
                  label: 'Layer 1',
                  isSegmentation: true,
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
          ],
          trackSummaries: [
            {
              id: 'track-set-1',
              name: 'Tracks A',
              fileName: 'tracks-a.csv',
              boundChannelId: 'channel-1',
              header: null
            }
          ]
        },
        computeTrackSummary: () => ({ totalPoints: 24, totalTracks: 3 })
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
  const performanceButton = renderer.root
    .findAllByType('button')
    .find((button: any) => button.props.children === 'Launch in Performance Mode');
  const text = collectText(renderer);
  assert.ok(launchButton);
  assert.ok(performanceButton);
  assert.match(text, /Shape \(XYZ\)/);
  assert.match(text, /16 × 16 × 4/);
  assert.match(text, /Voxel size/);
  assert.match(text, /0\.2 × 0\.2 × 0\.8 μm/);
  assert.match(text, /Frame interval/);
  assert.match(text, /2 s/);
  assert.match(text, /Segmentation/);
  assert.match(text, /Tracks:\s+Tracks A/);
  assert.doesNotMatch(text, /Layer 1/);
  assert.doesNotMatch(text, /Range:/);

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
            timepointConvention: 'zero-based',
            file: null,
            fileName: '',
            status: 'idle',
            error: null,
            compiledHeader: null,
            loadCompiledCatalog: null,
            loadCompiledPayload: null
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

test('front page configuring mode keeps insert channel name copy without name required title', () => {
  const props = buildBaseProps();
  const renderer = TestRenderer.create(
    <FrontPage
      {...(props as any)}
      frontPageMode="configuring"
      channelListPanel={{
        ...props.channelListPanel,
        channels: [{ id: 'channel-1', name: '', volume: null, channelType: 'channel' }],
        channelValidationMap: new Map([
          ['channel-1', { errors: ['Name this channel.'], warnings: [] }]
        ])
      }}
    />
  );

  const text = collectText(renderer);
  assert.match(text, /Insert channel name/);
  assert.doesNotMatch(text, /Name required/);

  renderer.unmount();
});

test('front page configuring mode shows the track timepoint convention selector for selected files', () => {
  const props = buildBaseProps();
  const renderer = TestRenderer.create(
    <FrontPage
      {...(props as any)}
      frontPageMode="configuring"
      experimentConfiguration={{
        ...props.experimentConfiguration,
        experimentType: '3d-movie'
      }}
      channelListPanel={{
        ...props.channelListPanel,
        channels: [{ id: 'channel-1', name: 'Channel 1', volume: null, channelType: 'channel' }],
        tracks: [
          {
            id: 'track-set-1',
            name: 'Track set',
            boundChannelId: 'channel-1',
            timepointConvention: 'one-based',
            file: new File(['track-data'], 'tracks.csv'),
            fileName: 'tracks.csv',
            status: 'loaded',
            error: null,
            compiledHeader: null,
            loadCompiledCatalog: null,
            loadCompiledPayload: null
          }
        ]
      }}
    />
  );

  const text = collectText(renderer);
  assert.match(text, /Bind to:/);
  assert.match(text, /Convention:/);
  assert.match(text, /CSV 0 -> movie 0/);
  assert.match(text, /CSV 1 -> movie 0/);
  renderer.unmount();
});
