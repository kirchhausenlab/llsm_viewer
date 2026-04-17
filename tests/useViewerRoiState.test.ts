import assert from 'node:assert/strict';

import { useViewerRoiState } from '../src/components/viewers/viewer-shell/hooks/useViewerRoiState.ts';
import { formatRoiCentroidName } from '../src/types/roi.ts';
import { renderHook } from './hooks/renderHook.ts';

console.log('Starting useViewerRoiState tests');

(() => {
  const hook = renderHook(() =>
    useViewerRoiState({
      volumeDimensions: { width: 10, height: 20, depth: 500 },
    })
  );

  assert.equal(hook.result.tool, 'line');
  assert.equal(hook.result.dimensionMode, '2d');
  assert.equal(hook.result.defaultColor, '#FACC15');
  assert.equal(hook.result.workingRoi, null);
  assert.equal(hook.result.savedRois.length, 0);
  assert.deepEqual(hook.result.selectedSavedRoiIds, []);

  hook.act(() => {
    hook.result.setTool('line');
    hook.result.setDimensionMode('3d');
    hook.result.setWorkingRoi({
      shape: 'line',
      mode: '3d',
      start: { x: 3, y: 12, z: 9 },
      end: { x: 3, y: 12, z: 9 },
      color: '#00ff00',
    });
  });

  assert.equal(hook.result.tool, 'line');
  assert.equal(hook.result.dimensionMode, '3d');
  assert.deepEqual(hook.result.workingRoi, {
    shape: 'line',
    mode: '3d',
    start: { x: 3, y: 12, z: 9 },
    end: { x: 3, y: 12, z: 9 },
    color: '#00FF00',
  });

  let firstSaved = null;
  hook.act(() => {
    firstSaved = hook.result.addWorkingRoi();
  });

  assert.ok(firstSaved);
  assert.equal(hook.result.savedRois.length, 1);
  assert.equal(hook.result.activeSavedRoiId, hook.result.savedRois[0]!.id);
  assert.equal(hook.result.editingSavedRoiId, hook.result.savedRois[0]!.id);
  assert.deepEqual(hook.result.selectedSavedRoiIds, [hook.result.savedRois[0]!.id]);
  assert.equal(hook.result.savedRois[0]!.name, '009-012-003');

  hook.act(() => {
    hook.result.updateWorkingRoi((current) => ({
      ...current,
      end: { x: 7, y: 15, z: 11 },
      color: '#123456',
    }));
  });

  assert.deepEqual(hook.result.savedRois[0], {
    id: hook.result.savedRois[0]!.id,
    name: '009-012-003',
    shape: 'line',
    mode: '3d',
    start: { x: 3, y: 12, z: 9 },
    end: { x: 3, y: 12, z: 9 },
    color: '#00FF00',
  });

  hook.act(() => {
    hook.result.updateActiveSavedRoiFromWorking();
  });

  assert.deepEqual(hook.result.savedRois[0], {
    id: hook.result.savedRois[0]!.id,
    name: '009-012-003',
    shape: 'line',
    mode: '3d',
    start: { x: 3, y: 12, z: 9 },
    end: { x: 7, y: 15, z: 11 },
    color: '#123456',
  });

  hook.act(() => {
    hook.result.renameActiveSavedRoi('  Cell-A  ');
  });

  assert.equal(hook.result.savedRois[0]!.name, 'Cell-A');

  hook.act(() => {
    hook.result.setWorkingRoi({
      shape: 'rectangle',
      mode: '2d',
      start: { x: 1, y: 2, z: 3 },
      end: { x: 4, y: 5, z: 3 },
      color: '#ff00ff',
    });
  });

  let secondSaved = null;
  hook.act(() => {
    secondSaved = hook.result.addWorkingRoi();
  });

  assert.ok(secondSaved);
  assert.equal(hook.result.savedRois.length, 2);
  assert.deepEqual(hook.result.selectedSavedRoiIds, [hook.result.savedRois[1]!.id]);
  assert.equal(hook.result.activeSavedRoiId, hook.result.savedRois[1]!.id);

  hook.act(() => {
    hook.result.setWorkingRoi({
      shape: 'ellipse',
      mode: '2d',
      start: { x: 5, y: 6, z: 7 },
      end: { x: 8, y: 9, z: 7 },
      color: '#00ffaa',
    });
  });

  let thirdSaved = null;
  hook.act(() => {
    thirdSaved = hook.result.addWorkingRoi();
  });

  assert.ok(thirdSaved);
  assert.equal(hook.result.savedRois.length, 3);
  assert.deepEqual(hook.result.selectedSavedRoiIds, [hook.result.savedRois[2]!.id]);
  assert.equal(hook.result.activeSavedRoiId, hook.result.savedRois[2]!.id);

  hook.act(() => {
    hook.result.selectSavedRoi(hook.result.savedRois[0]!.id);
  });

  assert.equal(hook.result.activeSavedRoiId, hook.result.savedRois[0]!.id);
  assert.equal(hook.result.editingSavedRoiId, hook.result.savedRois[0]!.id);
  assert.deepEqual(hook.result.selectedSavedRoiIds, [hook.result.savedRois[0]!.id]);
  assert.deepEqual(hook.result.workingRoi, {
    shape: 'line',
    mode: '3d',
    start: { x: 3, y: 12, z: 9 },
    end: { x: 7, y: 15, z: 11 },
    color: '#123456',
  });
  assert.equal(hook.result.defaultColor, '#123456');

  hook.act(() => {
    hook.result.selectSavedRoi(hook.result.savedRois[1]!.id, true);
    hook.result.selectSavedRoi(hook.result.savedRois[2]!.id, true);
    hook.result.selectSavedRoi(hook.result.savedRois[1]!.id, true);
  });

  assert.deepEqual(hook.result.selectedSavedRoiIds, [
    hook.result.savedRois[0]!.id,
    hook.result.savedRois[1]!.id,
    hook.result.savedRois[2]!.id,
  ]);
  assert.equal(hook.result.activeSavedRoiId, hook.result.savedRois[0]!.id);
  assert.equal(hook.result.editingSavedRoiId, hook.result.savedRois[0]!.id);

  hook.act(() => {
    hook.result.activateSavedRoi(hook.result.savedRois[1]!.id);
  });

  assert.deepEqual(hook.result.selectedSavedRoiIds, [hook.result.savedRois[1]!.id]);
  assert.equal(hook.result.activeSavedRoiId, hook.result.savedRois[1]!.id);
  assert.equal(hook.result.editingSavedRoiId, hook.result.savedRois[1]!.id);
  assert.deepEqual(hook.result.workingRoi, {
    shape: 'rectangle',
    mode: '2d',
    start: { x: 1, y: 2, z: 3 },
    end: { x: 4, y: 5, z: 3 },
    color: '#FF00FF',
  });

  hook.act(() => {
    hook.result.selectSavedRoi(hook.result.savedRois[0]!.id);
    hook.result.selectSavedRoi(hook.result.savedRois[1]!.id, true);
    hook.result.selectSavedRoi(hook.result.savedRois[2]!.id, true);
    hook.result.setShowAllSavedRois(true);
  });

  hook.act(() => {
    hook.result.deleteActiveSavedRoi();
  });

  assert.equal(hook.result.savedRois.length, 2);
  assert.equal(hook.result.activeSavedRoiId, hook.result.savedRois[0]!.id);
  assert.equal(hook.result.editingSavedRoiId, hook.result.savedRois[0]!.id);
  assert.deepEqual(hook.result.selectedSavedRoiIds, [
    hook.result.savedRois[0]!.id,
    hook.result.savedRois[1]!.id,
  ]);
  assert.deepEqual(hook.result.workingRoi, {
    shape: 'rectangle',
    mode: '2d',
    start: { x: 1, y: 2, z: 3 },
    end: { x: 4, y: 5, z: 3 },
    color: '#FF00FF',
  });
  assert.equal(hook.result.showAllSavedRois, true);

  hook.unmount();
})();

(() => {
  const name = formatRoiCentroidName(
    {
      start: { x: 0, y: 0, z: 0 },
      end: { x: 9, y: 19, z: 499 },
    },
    { width: 10, height: 20, depth: 500 }
  );

  assert.equal(name, '250-010-005');
})();

console.log('useViewerRoiState tests passed');
