import assert from 'node:assert/strict';

import { useRouteLaunchSessionState } from '../../../src/ui/app/hooks/useRouteLaunchSessionState.ts';
import { renderHook } from '../../hooks/renderHook.ts';

console.log('Starting useRouteLaunchSessionState tests');

(() => {
  let stopPlaybackCalls = 0;
  const hook = renderHook(() =>
    useRouteLaunchSessionState({
      stopPlayback: () => {
        stopPlaybackCalls += 1;
      },
    }),
  );

  assert.strictEqual(hook.result.status, 'idle');
  assert.strictEqual(hook.result.isViewerLaunched, false);
  assert.strictEqual(hook.result.isLaunchingViewer, false);

  hook.act(() => {
    hook.result.beginLaunchSession();
    hook.result.setLaunchExpectedVolumeCount(5);
    hook.result.setLaunchProgress({ loadedCount: 2, totalCount: 5 });
  });

  assert.strictEqual(hook.result.status, 'loading');
  assert.strictEqual(hook.result.isLoading, true);
  assert.strictEqual(hook.result.isLaunchingViewer, true);
  assert.strictEqual(hook.result.expectedVolumeCount, 5);
  assert.strictEqual(hook.result.loadedCount, 2);
  assert.strictEqual(hook.result.loadProgress, 0.4);

  hook.act(() => {
    hook.result.completeLaunchSession(5);
    hook.result.finishLaunchSessionAttempt();
  });

  assert.strictEqual(hook.result.status, 'loaded');
  assert.strictEqual(hook.result.isViewerLaunched, true);
  assert.strictEqual(hook.result.isLaunchingViewer, false);
  assert.strictEqual(hook.result.loadProgress, 1);
  assert.strictEqual(hook.result.loadedCount, 5);

  hook.act(() => {
    hook.result.endViewerSession();
  });

  assert.strictEqual(hook.result.isViewerLaunched, false);
  assert.strictEqual(stopPlaybackCalls, 1);
  hook.unmount();
})();

(() => {
  let stopPlaybackCalls = 0;
  const hook = renderHook(() =>
    useRouteLaunchSessionState({
      stopPlayback: () => {
        stopPlaybackCalls += 1;
      },
    }),
  );

  hook.act(() => {
    hook.result.beginLaunchSession();
    hook.result.failLaunchSession('Launch failed');
    hook.result.finishLaunchSessionAttempt();
  });

  assert.strictEqual(hook.result.status, 'error');
  assert.strictEqual(hook.result.error, 'Launch failed');
  assert.strictEqual(hook.result.isViewerLaunched, false);
  assert.strictEqual(hook.result.isLaunchingViewer, false);
  assert.strictEqual(hook.result.isLoading, false);

  hook.act(() => {
    hook.result.resetLaunchState();
  });

  assert.strictEqual(hook.result.status, 'idle');
  assert.strictEqual(hook.result.error, null);
  assert.strictEqual(hook.result.loadedCount, 0);
  assert.strictEqual(hook.result.expectedVolumeCount, 0);
  assert.strictEqual(hook.result.loadProgress, 0);
  assert.strictEqual(hook.result.isViewerLaunched, false);
  assert.strictEqual(hook.result.isLaunchingViewer, false);
  assert.strictEqual(stopPlaybackCalls, 1);
  hook.unmount();
})();

console.log('useRouteLaunchSessionState tests passed');
