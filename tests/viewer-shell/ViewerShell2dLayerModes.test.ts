import assert from 'node:assert/strict';

import {
  addMissingLayerRenderModesToSnapshot,
  captureLayerRenderModeSnapshot,
  collectChannelLayersFor2dView,
  type LayerRenderModeSnapshot,
} from '../../src/components/viewers/viewer-shell/twoDLayerModes.ts';
import type { LoadedDatasetLayer } from '../../src/hooks/dataset/useDatasetSetup.ts';
import {
  createDefaultLayerSettings,
  RENDER_STYLE_BL,
  RENDER_STYLE_MIP,
  RENDER_STYLE_SLICE,
} from '../../src/state/layerSettings.ts';

console.log('Starting ViewerShell 2D layer mode tests');

const regularLayer: LoadedDatasetLayer = {
  key: 'regular-layer',
  label: 'Intensity',
  channelId: 'regular-channel',
  isSegmentation: false,
  volumeCount: 1,
  width: 8,
  height: 8,
  depth: 4,
  channels: 1,
  dataType: 'uint8',
  min: 0,
  max: 255,
};

const editableSegmentationLayer: LoadedDatasetLayer = {
  key: 'annotate-layer-1',
  label: 'Annotation',
  channelId: 'annotate-1',
  isSegmentation: true,
  volumeCount: 1,
  width: 8,
  height: 8,
  depth: 4,
  channels: 1,
  dataType: 'uint32',
  min: 0,
  max: 1,
};

(() => {
  const channelLayersMap = new Map<string, LoadedDatasetLayer[]>([
    [regularLayer.channelId, [regularLayer]],
    [editableSegmentationLayer.channelId, [editableSegmentationLayer]],
  ]);

  const layers = collectChannelLayersFor2dView(
    [regularLayer.channelId, editableSegmentationLayer.channelId],
    channelLayersMap
  );

  assert.deepEqual(
    layers.map((layer) => layer.key),
    ['regular-layer', 'annotate-layer-1']
  );
})();

(() => {
  const layerSettings = {
    [regularLayer.key]: {
      ...createDefaultLayerSettings(),
      renderStyle: RENDER_STYLE_BL,
      samplingMode: 'linear' as const,
    },
  };
  const snapshot = captureLayerRenderModeSnapshot(
    [regularLayer, editableSegmentationLayer],
    layerSettings,
    () => createDefaultLayerSettings()
  );

  assert.deepEqual(snapshot, {
    [regularLayer.key]: {
      renderStyle: RENDER_STYLE_BL,
      samplingMode: 'linear',
    },
    [editableSegmentationLayer.key]: {
      renderStyle: RENDER_STYLE_MIP,
      samplingMode: 'linear',
    },
  });
})();

(() => {
  const snapshot: LayerRenderModeSnapshot = {
    [regularLayer.key]: {
      renderStyle: RENDER_STYLE_SLICE,
      samplingMode: 'nearest',
    },
  };
  const nextSnapshot = addMissingLayerRenderModesToSnapshot(
    snapshot,
    [regularLayer, editableSegmentationLayer],
    {},
    () => createDefaultLayerSettings()
  );

  assert.notEqual(nextSnapshot, snapshot);
  assert.deepEqual(nextSnapshot[regularLayer.key], snapshot[regularLayer.key]);
  assert.deepEqual(nextSnapshot[editableSegmentationLayer.key], {
    renderStyle: RENDER_STYLE_MIP,
    samplingMode: 'linear',
  });

  const unchangedSnapshot = addMissingLayerRenderModesToSnapshot(
    nextSnapshot,
    [regularLayer, editableSegmentationLayer],
    {},
    () => createDefaultLayerSettings()
  );
  assert.equal(unchangedSnapshot, nextSnapshot);
})();

console.log('ViewerShell 2D layer mode tests passed');
