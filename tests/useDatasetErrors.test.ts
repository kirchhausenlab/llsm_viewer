import assert from 'node:assert/strict';

import { useDatasetErrors } from '../src/hooks/useDatasetErrors.ts';
import { renderHook } from './hooks/renderHook.ts';

console.log('Starting useDatasetErrors tests');

(() => {
  const hook = renderHook(() => useDatasetErrors());
  const { act } = hook;

  assert.strictEqual(hook.result.datasetError, null);
  assert.strictEqual(hook.result.datasetErrorContext, null);

  act(() => hook.result.reportDatasetError('boom', 'launch'));
  assert.strictEqual(hook.result.datasetError, 'boom');
  assert.strictEqual(hook.result.datasetErrorContext, 'launch');

  const resetBefore = hook.result.datasetErrorResetSignal;
  act(() => hook.result.clearDatasetError());
  assert.strictEqual(hook.result.datasetError, null);
  assert.strictEqual(hook.result.datasetErrorContext, null);
  assert.ok(hook.result.datasetErrorResetSignal > resetBefore);
})();

(() => {
  const hook = renderHook(() => useDatasetErrors());
  const { act } = hook;
  const before = hook.result.datasetErrorResetSignal;
  act(() => hook.result.bumpDatasetErrorResetSignal());
  assert.strictEqual(hook.result.datasetErrorResetSignal, before + 1);
})();

console.log('useDatasetErrors tests passed');
