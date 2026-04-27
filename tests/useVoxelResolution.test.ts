import assert from 'node:assert/strict';

import { useVoxelResolution } from '../src/hooks/useVoxelResolution.ts';
import type { VoxelResolutionAxis } from '../src/types/voxelResolution.ts';
import { renderHook } from './hooks/renderHook.ts';

console.log('Starting useVoxelResolution tests');

(() => {
  const hook = renderHook(() => useVoxelResolution());

  assert.strictEqual(hook.result.voxelResolutionInput.x, '1.0');
  assert.strictEqual(hook.result.voxelResolutionInput.t, '1.0');
  assert.strictEqual(hook.result.voxelResolutionInput.unit, 'μm');
  assert.strictEqual(hook.result.voxelResolutionInput.timeUnit, 's');
  assert.strictEqual(hook.result.voxelResolutionInput.correctAnisotropy, false);
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
    updateAxis('t', '5');
    hook.result.handleVoxelResolutionTimeUnitChange('ms');
  });

  act(() => rerender());

  assert.strictEqual(hook.result.voxelResolutionInput.x, '2');
  assert.strictEqual(hook.result.voxelResolutionInput.y, '3');
  assert.strictEqual(hook.result.voxelResolutionInput.z, '4');
  assert.strictEqual(hook.result.voxelResolutionInput.t, '5');
  assert.strictEqual(hook.result.voxelResolutionInput.timeUnit, 'ms');
  assert.ok(hook.result.voxelResolution);
})();

console.log('useVoxelResolution tests passed');
