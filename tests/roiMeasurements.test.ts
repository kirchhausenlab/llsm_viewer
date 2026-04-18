import assert from 'node:assert/strict';

import type { IntensityVolume } from '../src/core/volumeProcessing.ts';
import type { SavedRoi } from '../src/types/roi.ts';
import { DEFAULT_ROI_MEASUREMENT_SETTINGS } from '../src/types/roiMeasurements.ts';
import {
  buildRoiMeasurementsCsv,
  buildRoiMeasurementsSnapshot,
  computeRoiMeasurementValues,
  validateSavedRoiWithinDimensions,
} from '../src/shared/utils/roiMeasurements.ts';

console.log('Starting roiMeasurements tests');

function createVolume(width: number, height: number, depth: number, normalized: number[]): IntensityVolume {
  return {
    kind: 'intensity',
    width,
    height,
    depth,
    channels: 1,
    dataType: 'uint8',
    normalizedDataType: 'uint8',
    normalized: Uint8Array.from(normalized),
    min: 0,
    max: 255,
  };
}

(() => {
  const volume = createVolume(4, 4, 1, [
    0, 1, 2, 3,
    4, 5, 6, 7,
    8, 9, 10, 11,
    12, 13, 14, 15,
  ]);
  const roi: SavedRoi = {
    id: 'roi-1',
    name: 'ROI 1',
    shape: 'rectangle',
    mode: '2d',
    start: { x: 1, y: 1, z: 0 },
    end: { x: 2, y: 2, z: 0 },
    color: '#FFFFFF',
  };

  const values = computeRoiMeasurementValues(roi, volume);
  assert.equal(values.count, 4);
  assert.equal(values.min, 5);
  assert.equal(values.max, 10);
  assert.equal(values.mean, 7.5);
  assert.equal(values.median, 7.5);
})();

(() => {
  const volume = createVolume(3, 1, 1, [0, 100, 200]);
  const roi: SavedRoi = {
    id: 'roi-2',
    name: 'ROI 2',
    shape: 'line',
    mode: '3d',
    start: { x: 0, y: 0, z: 0 },
    end: { x: 2, y: 0, z: 0 },
    color: '#FFFFFF',
  };

  const values = computeRoiMeasurementValues(roi, volume);
  assert.equal(values.count, 3);
  assert.equal(values.min, 0);
  assert.equal(values.max, 200);
  assert.equal(values.mean, 100);
})();

(() => {
  const volume: IntensityVolume = {
    kind: 'intensity',
    width: 2,
    height: 1,
    depth: 1,
    channels: 1,
    dataType: 'uint16',
    normalizedDataType: 'uint16',
    normalized: new Uint16Array([0, 65535]),
    min: 0,
    max: 65535,
  };
  const roi: SavedRoi = {
    id: 'roi-u16',
    name: 'ROI U16',
    shape: 'rectangle',
    mode: '2d',
    start: { x: 0, y: 0, z: 0 },
    end: { x: 1, y: 0, z: 0 },
    color: '#FFFFFF',
  };

  const values = computeRoiMeasurementValues(roi, volume);
  assert.equal(values.count, 2);
  assert.equal(values.min, 0);
  assert.equal(values.max, 65535);
  assert.equal(values.mean, 32767.5);
})();

(() => {
  const snapshot = buildRoiMeasurementsSnapshot({
    selectedRois: [
      {
        id: 'roi-1',
        name: 'ROI 1',
        shape: 'rectangle',
        mode: '2d',
        start: { x: 0, y: 0, z: 0 },
        end: { x: 0, y: 0, z: 0 },
        color: '#FFFFFF',
      },
      {
        id: 'roi-2',
        name: 'ROI 2',
        shape: 'rectangle',
        mode: '2d',
        start: { x: 1, y: 0, z: 0 },
        end: { x: 1, y: 0, z: 0 },
        color: '#FFFFFF',
      },
    ],
    channels: [
      { id: 'channel-a', name: 'A', volume: createVolume(2, 1, 1, [10, 20]) },
      { id: 'channel-b', name: 'B', volume: null },
    ],
    timepoint: 3,
  });

  assert.equal(snapshot.rows.length, 4);
  assert.deepEqual(
    snapshot.rows.map((row) => [row.roiOrder, row.channelName]),
    [
      [1, 'A'],
      [1, 'B'],
      [2, 'A'],
      [2, 'B'],
    ],
  );
  assert.equal(snapshot.rows[1]!.values.mean, null);

  const csv = buildRoiMeasurementsCsv({
    snapshot,
    settings: DEFAULT_ROI_MEASUREMENT_SETTINGS,
    visibleChannelIds: ['channel-a'],
  });
  assert.match(csv, /"#","Ch","Count","Min","Max","Mean"/);
  assert.match(csv, /"1","A","1","10\.000","10\.000","10\.000"/);
  assert.doesNotMatch(csv, /"B"/);
})();

(() => {
  const roi: SavedRoi = {
    id: 'roi-3',
    name: 'ROI 3',
    shape: 'ellipse',
    mode: '3d',
    start: { x: 0, y: 0, z: 0 },
    end: { x: 1, y: 1, z: 1 },
    color: '#FFFFFF',
  };
  assert.equal(validateSavedRoiWithinDimensions(roi, { width: 2, height: 2, depth: 2 }), true);
  assert.equal(validateSavedRoiWithinDimensions({ ...roi, end: { x: 2, y: 1, z: 1 } }, { width: 2, height: 2, depth: 2 }), false);
})();

console.log('roiMeasurements tests passed');
