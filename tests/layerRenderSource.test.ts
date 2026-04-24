import assert from 'node:assert/strict';

import type { ViewerLayer } from '../src/components/viewers/VolumeViewer.types.ts';
import type { NormalizedVolume } from '../src/core/volumeProcessing.ts';
import type { VolumeBrickAtlas, VolumeBrickPageTable } from '../src/core/volumeProvider.ts';
import { resolveCanonicalSceneDimensions } from '../src/components/viewers/volume-viewer/layerRenderSource.ts';

const baseLayer = {
  key: 'layer-a',
  label: 'Layer A',
  channelName: 'channel-a',
  visible: true,
  sliderRange: 100,
  minSliderIndex: 0,
  maxSliderIndex: 100,
  brightnessSliderIndex: 50,
  contrastSliderIndex: 50,
  windowMin: 0,
  windowMax: 1,
  color: '#ffffff',
  offsetX: 0,
  offsetY: 0,
  renderStyle: 0,
  blDensityScale: 1,
  blBackgroundCutoff: 0.08,
  blOpacityScale: 1,
  blEarlyExitAlpha: 0.98,
  mipEarlyExitThreshold: 0.98,
  invert: false,
  samplingMode: 'linear' as const,
  mode: '3d' as const,
  scaleLevel: 0,
} satisfies Partial<ViewerLayer>;

(() => {
  const volume: NormalizedVolume = {
    kind: 'intensity',
    width: 8,
    height: 8,
    depth: 4,
    channels: 1,
    dataType: 'uint8',
    normalized: new Uint8Array(8 * 8 * 4),
    min: 0,
    max: 0,
    scaleLevel: 1,
  };
  const layer: ViewerLayer = {
    ...baseLayer,
    fullResolutionWidth: 16,
    fullResolutionHeight: 12,
    fullResolutionDepth: 10,
    volume,
    brickPageTable: null,
    brickAtlas: null,
  } as ViewerLayer;

  assert.deepStrictEqual(resolveCanonicalSceneDimensions([layer]), {
    width: 16,
    height: 12,
    depth: 10,
  });
})();

(() => {
  const pageTable: VolumeBrickPageTable = {
    layerKey: 'layer-a',
    timepoint: 0,
    scaleLevel: 1,
    gridShape: [1, 1, 1],
    chunkShape: [2, 4, 4],
    volumeShape: [2, 4, 4],
    brickAtlasIndices: new Int32Array([0]),
    chunkMin: new Uint8Array([0]),
    chunkMax: new Uint8Array([255]),
    chunkOccupancy: new Float32Array([1]),
    occupiedBrickCount: 1,
  };
  const brickAtlas: VolumeBrickAtlas = {
    layerKey: 'layer-a',
    timepoint: 0,
    scaleLevel: 1,
    pageTable,
    width: 4,
    height: 4,
    depth: 2,
    textureFormat: 'red',
    sourceChannels: 1,
    data: new Uint8Array(4 * 4 * 2),
    enabled: true,
  };
  const layer: ViewerLayer = {
    ...baseLayer,
    fullResolutionWidth: 14,
    fullResolutionHeight: 18,
    fullResolutionDepth: 6,
    volume: null,
    brickPageTable: pageTable,
    brickAtlas,
  } as ViewerLayer;

  assert.deepStrictEqual(resolveCanonicalSceneDimensions([layer]), {
    width: 14,
    height: 18,
    depth: 6,
  });
})();

(() => {
  assert.equal(resolveCanonicalSceneDimensions([]), null);
})();
