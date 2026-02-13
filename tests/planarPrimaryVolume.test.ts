import assert from 'node:assert/strict';

import {
  findPrimaryPlanarVolume,
  shouldRequestPlanarAutoFit,
  toPlanarVolumeShape,
} from '../src/components/viewers/planar-viewer/usePlanarPrimaryVolume.ts';
import type { ViewerLayer } from '../src/components/viewers/planar-viewer/types.ts';
import type { NormalizedVolume } from '../src/core/volumeProcessing.ts';

console.log('Starting planar primary volume helper tests');

const createVolume = (width: number, height: number, depth: number): NormalizedVolume => ({
  width,
  height,
  depth,
  channels: 1,
  dataType: 'uint8',
  normalized: new Uint8Array(Math.max(1, width * height * depth)),
  min: 0,
  max: 255,
});

const createLayer = (key: string, volume: NormalizedVolume | null): ViewerLayer => ({
  key,
  label: key,
  channelId: key,
  channelName: key,
  volume,
  visible: true,
  sliderRange: 1,
  minSliderIndex: 0,
  maxSliderIndex: 1,
  brightnessSliderIndex: 0,
  contrastSliderIndex: 1,
  windowMin: 0,
  windowMax: 1,
  color: '#ffffff',
  offsetX: 0,
  offsetY: 0,
  renderStyle: 0,
  invert: false,
  isSegmentation: false,
});

(() => {
  const volume = createVolume(10, 11, 12);
  const layers = [
    createLayer('layer-0', null),
    createLayer('layer-1', volume),
    createLayer('layer-2', createVolume(1, 1, 1)),
  ];

  assert.strictEqual(findPrimaryPlanarVolume(layers), volume);
})();

(() => {
  assert.deepStrictEqual(toPlanarVolumeShape(createVolume(3, 4, 5)), {
    width: 3,
    height: 4,
    depth: 5,
  });
  assert.strictEqual(toPlanarVolumeShape(null), null);
})();

(() => {
  const previous = { width: 1, height: 2, depth: 3 };
  const currentSame = { width: 1, height: 2, depth: 3 };
  const currentChanged = { width: 1, height: 9, depth: 3 };

  assert.strictEqual(shouldRequestPlanarAutoFit(null, currentSame), true);
  assert.strictEqual(shouldRequestPlanarAutoFit(previous, null), true);
  assert.strictEqual(shouldRequestPlanarAutoFit(previous, currentSame), false);
  assert.strictEqual(shouldRequestPlanarAutoFit(previous, currentChanged), true);
})();

console.log('planar primary volume helper tests passed');
