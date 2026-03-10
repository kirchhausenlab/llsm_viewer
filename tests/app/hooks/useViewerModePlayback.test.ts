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

  const hook = renderHook(() =>
    useViewerModePlayback({
      is3dViewerAvailable: true,
      onBeforeEnterVr: () => {},
      onViewerModeChange: (mode) => modeChanges.push(mode),
      volumeTimepointCount: 2,
      isLoading: false
    })
  );

  const { act } = hook;

  act(() => hook.result.handleTogglePlayback());
  assert.equal(hook.result.playback.isPlaying, true);

  assert.equal(hook.result.viewerControls.viewerMode, '3d');
  assert.equal(modeChanges[0], '3d');

  act(() => hook.result.handleTimeIndexChange(5));
  assert.equal(hook.result.playback.selectedIndex, 1);

  (globalThis as any).window = previousWindow;
})();

console.log('useViewerModePlayback tests passed');
