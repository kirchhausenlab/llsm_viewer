import assert from 'node:assert/strict';

import { useVoxelResolution } from '../src/hooks/useVoxelResolution.ts';
import type { VoxelResolutionAxis } from '../src/types/voxelResolution.ts';
import { renderHook } from './hooks/renderHook.ts';

console.log('Starting useVoxelResolution tests');

(() => {
  const hook = renderHook(() => useVoxelResolution());

  assert.strictEqual(hook.result.voxelResolutionInput.x, '1.0');
  assert.strictEqual(hook.result.voxelResolutionInput.unit, 'μm');
  assert.strictEqual(hook.result.experimentDimension, '3d');
  assert.deepStrictEqual(hook.result.trackScale, { x: 1, y: 1, z: 1 });
})();

(() => {
  const hook = renderHook(() => useVoxelResolution());
  const { act, rerender } = hook;
  const updateAxis = (axis: VoxelResolutionAxis, value: string) =>
    hook.result.handleVoxelResolutionAxisChange(axis, value);

  act(() => {
    updateAxis('x', '2');
    updateAxis('y', '3');
    updateAxis('z', '4');
  });

  act(() => rerender());

  assert.strictEqual(hook.result.voxelResolutionInput.x, '2');
  assert.strictEqual(hook.result.voxelResolutionInput.y, '3');
  assert.strictEqual(hook.result.voxelResolutionInput.z, '4');
  assert.ok(hook.result.voxelResolution);
})();

(() => {
  const hook = renderHook(() => useVoxelResolution());
  const { act, rerender } = hook;

  act(() => {
    hook.result.handleExperimentDimensionChange('2d');
    hook.result.handleVoxelResolutionAxisChange('x', '1.5');
    hook.result.handleVoxelResolutionAxisChange('y', '2.5');
  });

  act(() => rerender());

  assert.strictEqual(hook.result.experimentDimension, '2d');
  assert.ok(hook.result.voxelResolution);
})();

console.log('useVoxelResolution tests passed');
