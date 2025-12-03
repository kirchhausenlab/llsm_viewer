import assert from 'node:assert/strict';

import { useViewerPlayback } from '../src/hooks/viewer';
import { renderHook } from './hooks/renderHook.ts';

console.log('Starting useViewerPlayback tests');

(() => {
  const hook = renderHook(() => useViewerPlayback());
  assert.strictEqual(hook.result.selectedIndex, 0);
  assert.strictEqual(hook.result.isPlaying, false);
})();

(() => {
  const hook = renderHook(() => useViewerPlayback(2));
  const { act } = hook;

  act(() => hook.result.togglePlayback());
  assert.strictEqual(hook.result.isPlaying, true);

  act(() => hook.result.stopPlayback());
  assert.strictEqual(hook.result.isPlaying, false);

  act(() => hook.result.setSelectedIndex((current) => current + 1));
  assert.strictEqual(hook.result.selectedIndex, 3);
})();

console.log('useViewerPlayback tests passed');
