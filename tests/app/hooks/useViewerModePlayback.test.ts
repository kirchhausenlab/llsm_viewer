import assert from 'node:assert/strict';

import { useViewerModePlayback } from '../../../src/ui/app/hooks/useViewerModePlayback.ts';
import { renderHook } from '../../hooks/renderHook.ts';

console.log('Starting useViewerModePlayback tests');

(() => {
  const previousWindow = (globalThis as any).window;

  (globalThis as any).window = {
    requestAnimationFrame: (_callback: FrameRequestCallback) => 1,
    cancelAnimationFrame: () => {}
  };

  const modeChanges: string[] = [];
  const toggles: string[] = [];

  const hook = renderHook(() =>
    useViewerModePlayback({
      experimentDimension: '2d',
      is3dViewerAvailable: true,
      maxSliceDepth: 1,
      onBeforeEnterVr: () => {},
      onViewerModeToggle: (nextMode) => toggles.push(nextMode),
      onViewerModeChange: (mode) => modeChanges.push(mode),
      volumeTimepointCount: 2,
      isLoading: false
    })
  );

  const { act } = hook;

  act(() => hook.result.handleTogglePlayback());
  assert.equal(hook.result.playback.isPlaying, true);

  act(() => hook.result.viewerControls.toggleViewerMode());
  assert.equal(hook.result.viewerControls.viewerMode, '3d');

  assert.equal(modeChanges[0], '2d');
  assert.equal(modeChanges[modeChanges.length - 1], '3d');
  assert.equal(toggles[toggles.length - 1], '3d');

  act(() => hook.result.handleTimeIndexChange(5));
  assert.equal(hook.result.playback.selectedIndex, 1);

  (globalThis as any).window = previousWindow;
})();

console.log('useViewerModePlayback tests passed');
