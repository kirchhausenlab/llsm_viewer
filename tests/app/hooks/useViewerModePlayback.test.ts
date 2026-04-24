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
  let playbackStartRequests = 0;
  let playbackStartCancels = 0;

  const hook = renderHook(() =>
    useViewerModePlayback({
      is3dViewerAvailable: true,
      onBeforeEnterVr: () => {},
      onViewerModeChange: (mode) => modeChanges.push(mode),
      volumeTimepointCount: 2,
      isLoading: false,
      bufferBeforePlayDefault: true,
      onPlaybackStartRequest: () => {
        playbackStartRequests += 1;
      },
      onPlaybackStartCancel: () => {
        playbackStartCancels += 1;
      }
    })
  );

  const { act } = hook;

  act(() => hook.result.handleTogglePlayback());
  assert.equal(hook.result.playback.isPlaying, false);
  assert.equal(playbackStartRequests, 1);

  assert.equal(hook.result.viewerControls.viewerMode, '3d');
  assert.equal(modeChanges[0], '3d');

  act(() => hook.result.handleTimeIndexChange(5));
  assert.equal(hook.result.playback.selectedIndex, 1);

  const pendingHook = renderHook(() =>
    useViewerModePlayback({
      is3dViewerAvailable: true,
      onBeforeEnterVr: () => {},
      volumeTimepointCount: 2,
      isLoading: false,
      isPlaybackStartPending: true,
      bufferBeforePlayDefault: true,
      onPlaybackStartCancel: () => {
        playbackStartCancels += 1;
      }
    })
  );
  pendingHook.act(() => pendingHook.result.handleTogglePlayback());
  assert.equal(playbackStartCancels >= 1, true);

  (globalThis as any).window = previousWindow;
})();

console.log('useViewerModePlayback tests passed');
