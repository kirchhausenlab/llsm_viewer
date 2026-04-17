import assert from 'node:assert/strict';

import { parseRoiManagerStateFromJson, serializeRoiManagerState } from '../src/shared/utils/roiPersistence.ts';

console.log('Starting roiPersistence tests');

(() => {
  const serialized = serializeRoiManagerState({
    savedRois: [
      {
        id: 'roi-1',
        name: 'ROI 1',
        shape: 'rectangle',
        mode: '2d',
        start: { x: 1, y: 2, z: 3 },
        end: { x: 4, y: 5, z: 3 },
        color: '#ff00ff',
      },
      {
        id: 'roi-2',
        name: 'ROI 2',
        shape: 'line',
        mode: '3d',
        start: { x: 0, y: 0, z: 0 },
        end: { x: 2, y: 2, z: 2 },
        color: '#00ffaa',
      },
    ],
    selectedSavedRoiIds: ['roi-2', 'roi-1'],
    activeSavedRoiId: 'roi-2',
    defaultColor: '#facc15',
    dimensionMode: '3d',
    tool: 'ellipse',
  });

  const loaded = parseRoiManagerStateFromJson(serialized, { width: 8, height: 8, depth: 8 });
  assert.equal(loaded.savedRois.length, 2);
  assert.deepEqual(loaded.selectedSavedRoiIds, ['roi-2', 'roi-1']);
  assert.equal(loaded.activeSavedRoiId, 'roi-2');
  assert.equal(loaded.editingSavedRoiId, 'roi-2');
  assert.deepEqual(loaded.workingRoi, {
    shape: 'line',
    mode: '3d',
    start: { x: 0, y: 0, z: 0 },
    end: { x: 2, y: 2, z: 2 },
    color: '#00FFAA',
  });
  assert.equal(loaded.defaultColor, '#FACC15');
  assert.equal(loaded.tool, 'ellipse');
})();

(() => {
  const invalidPayload = JSON.stringify({
    version: 1,
    savedRois: [
      {
        id: 'roi-1',
        name: 'ROI 1',
        shape: 'rectangle',
        mode: '2d',
        start: { x: 0, y: 0, z: 0 },
        end: { x: 9, y: 1, z: 0 },
        color: '#ffffff',
      },
    ],
  });

  assert.throws(
    () => parseRoiManagerStateFromJson(invalidPayload, { width: 4, height: 4, depth: 4 }),
    /outside the current experiment bounds/i,
  );
})();

console.log('roiPersistence tests passed');
