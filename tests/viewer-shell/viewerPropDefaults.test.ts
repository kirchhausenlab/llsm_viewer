import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildDefaultViewerPropScalebarState,
  isViewerPropVisibleAtTimepoint,
  normalizeViewerPropTimeRange,
  resolveViewerPropDisplayText,
  resolveViewerPropScalebarInfo,
} from '../../src/components/viewers/viewer-shell/viewerPropDefaults.ts';

test('viewer prop time range normalization clamps and orders inclusive bounds', () => {
  assert.deepEqual(normalizeViewerPropTimeRange(7, 2, 5), {
    initialTimepoint: 2,
    finalTimepoint: 5,
  });
});

test('viewer prop visibility helper respects inclusive time ranges', () => {
  const prop = { type: 'text' as const, initialTimepoint: 2, finalTimepoint: 4 };

  assert.equal(isViewerPropVisibleAtTimepoint(prop, 1, 6), false);
  assert.equal(isViewerPropVisibleAtTimepoint(prop, 2, 6), true);
  assert.equal(isViewerPropVisibleAtTimepoint(prop, 4, 6), true);
  assert.equal(isViewerPropVisibleAtTimepoint(prop, 5, 6), false);
});

test('viewer timestamp props ignore time-range visibility and stay visible across the full movie', () => {
  const prop = { type: 'timestamp' as const, initialTimepoint: 4, finalTimepoint: 4 };

  assert.equal(isViewerPropVisibleAtTimepoint(prop, 1, 6), true);
  assert.equal(isViewerPropVisibleAtTimepoint(prop, 6, 6), true);
});

test('viewer prop display text returns text props unchanged', () => {
  assert.equal(
    resolveViewerPropDisplayText(
      { type: 'text', text: 'Hello world', timestampUnits: 'index' },
      3,
      8
    ),
    'Hello world'
  );
});

test('viewer prop display text resolves timestamp index units from 1-based timepoints', () => {
  assert.equal(
    resolveViewerPropDisplayText(
      { type: 'timestamp', text: 'ignored', timestampUnits: 'index' },
      3,
      8
    ),
    '3'
  );
});

test('viewer prop display text resolves timestamp physical units from preprocessing metadata', () => {
  assert.equal(
    resolveViewerPropDisplayText(
      { type: 'timestamp', text: 'ignored', timestampUnits: 'physical' },
      1,
      8,
      { interval: 2.3, unit: 'ms' }
    ),
    '0 ms'
  );
  assert.equal(
    resolveViewerPropDisplayText(
      { type: 'timestamp', text: 'ignored', timestampUnits: 'physical' },
      2,
      8,
      { interval: 2.3, unit: 'ms' }
    ),
    '2.3 ms'
  );
  assert.equal(
    resolveViewerPropDisplayText(
      { type: 'timestamp', text: 'ignored', timestampUnits: 'physical' },
      3,
      8,
      { interval: 2.3, unit: 'ms' }
    ),
    '4.6 ms'
  );
});

test('viewer prop display text falls back to index units when physical metadata is unavailable', () => {
  assert.equal(
    resolveViewerPropDisplayText(
      { type: 'timestamp', text: 'ignored', timestampUnits: 'physical' },
      4,
      8
    ),
    '4'
  );
});

test('viewer scalebar defaults derive a 15-voxel X-length from dataset resolution', () => {
  assert.deepEqual(
    buildDefaultViewerPropScalebarState({ x: 10, y: 12, z: 20, unit: 'nm' }),
    {
      axis: 'x',
      length: 150,
      unit: 'nm',
      showText: true,
      textPlacement: 'below',
    }
  );
});

test('viewer scalebar info converts physical length to voxel length', () => {
  assert.deepEqual(
    resolveViewerPropScalebarInfo(
      {
        type: 'scalebar',
        scalebar: {
          axis: 'x',
          length: 30000,
          unit: 'nm',
          showText: true,
          textPlacement: 'below',
        },
      },
      { x: 2, y: 2, z: 2, unit: 'μm' }
    ),
    {
      label: '30000 nm',
      voxelLength: 15,
      isRenderable: true,
      isAnisotropic: false,
    }
  );
});

test('viewer scalebar info flags anisotropy and suppresses sub-voxel bars', () => {
  assert.deepEqual(
    resolveViewerPropScalebarInfo(
      {
        type: 'scalebar',
        scalebar: {
          axis: 'z',
          length: 500,
          unit: 'nm',
          showText: false,
          textPlacement: 'right',
        },
      },
      { x: 2, y: 2, z: 4, unit: 'μm' }
    ),
    {
      label: '500 nm',
      voxelLength: 0.125,
      isRenderable: false,
      isAnisotropic: true,
    }
  );
});
