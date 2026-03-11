import assert from 'node:assert/strict';

import { useWindowLayout } from '../../../src/ui/app/hooks/useWindowLayout.ts';
import {
  computeLayersWindowDefaultPosition,
  computePaintbrushWindowRecenterPosition,
  computePlotSettingsWindowDefaultPosition,
  computePropsWindowRecenterPosition,
  computeRecordWindowDefaultPosition,
  computeSelectedTracksWindowDefaultPosition,
  computeTrackSettingsWindowRecenterPosition,
  computeTrackWindowDefaultPosition,
  computeViewerSettingsWindowDefaultPosition
} from '../../../src/shared/utils/windowLayout.ts';
import { renderHook } from '../../hooks/renderHook.ts';

console.log('Starting useWindowLayout tests');

(() => {
  const originalWindow = globalThis.window;
  const initialWindow = { innerWidth: 1200, innerHeight: 900 } as Window;
  globalThis.window = initialWindow as Window & typeof globalThis;

  const hook = renderHook(() => useWindowLayout());

  const updatedWindow = { innerWidth: 1800, innerHeight: 1100 } as Window;
  globalThis.window = updatedWindow as Window & typeof globalThis;

  hook.act(() => {
    hook.result.resetLayout();
  });
  hook.act(() => hook.rerender());

  assert.strictEqual(hook.result.layoutResetToken, 1);
  assert.deepStrictEqual(hook.result.layersWindowInitialPosition, computeLayersWindowDefaultPosition());
  assert.deepStrictEqual(hook.result.propsWindowInitialPosition, computePropsWindowRecenterPosition());
  assert.deepStrictEqual(hook.result.trackWindowInitialPosition, computeTrackWindowDefaultPosition());
  assert.deepStrictEqual(hook.result.paintbrushWindowInitialPosition, computePaintbrushWindowRecenterPosition());
  assert.deepStrictEqual(hook.result.recordWindowInitialPosition, computeRecordWindowDefaultPosition());
  assert.deepStrictEqual(
    hook.result.viewerSettingsWindowInitialPosition,
    computeViewerSettingsWindowDefaultPosition()
  );
  assert.deepStrictEqual(
    hook.result.selectedTracksWindowInitialPosition,
    computeSelectedTracksWindowDefaultPosition()
  );
  assert.deepStrictEqual(hook.result.plotSettingsWindowInitialPosition, computePlotSettingsWindowDefaultPosition());
  assert.deepStrictEqual(
    hook.result.trackSettingsWindowInitialPosition,
    computeTrackSettingsWindowRecenterPosition()
  );

  globalThis.window = originalWindow;
})();

console.log('useWindowLayout tests passed');
