import assert from 'node:assert/strict';
import { test } from 'node:test';

import { renderHook } from '../hooks/renderHook.ts';
import { useViewerPanelWindows } from '../../src/components/viewers/viewer-shell/hooks/useViewerPanelWindows.ts';

test('viewer panel window controls open and close the requested windows', () => {
  const hook = renderHook(() =>
    useViewerPanelWindows({
      resetToken: 0,
      hasTrackData: true,
      canShowPlotSettings: true
    })
  );

  assert.equal(hook.result.isChannelsWindowOpen, true);
  assert.equal(hook.result.isTracksWindowOpen, true);
  assert.equal(hook.result.isAmplitudePlotOpen, true);
  assert.equal(hook.result.isViewerSettingsOpen, false);
  assert.equal(hook.result.isTrackSettingsOpen, false);
  assert.equal(hook.result.isPlotSettingsOpen, false);
  assert.equal(hook.result.isDiagnosticsWindowOpen, false);

  hook.act(() => {
    hook.result.closeChannelsWindow();
    hook.result.closeTracksWindow();
    hook.result.closeAmplitudePlot();
  });

  assert.equal(hook.result.isChannelsWindowOpen, false);
  assert.equal(hook.result.isTracksWindowOpen, false);
  assert.equal(hook.result.isAmplitudePlotOpen, false);

  hook.act(() => {
    hook.result.openViewerSettings();
    hook.result.openTrackSettings();
    hook.result.openAmplitudePlot();
    hook.result.openPaintbrush();
    hook.result.openDiagnosticsWindow();
  });

  assert.equal(hook.result.isViewerSettingsOpen, true);
  assert.equal(hook.result.isTracksWindowOpen, true);
  assert.equal(hook.result.isTrackSettingsOpen, true);
  assert.equal(hook.result.isAmplitudePlotOpen, true);
  assert.equal(hook.result.isPlotSettingsOpen, true);
  assert.equal(hook.result.isPaintbrushOpen, true);
  assert.equal(hook.result.isDiagnosticsWindowOpen, true);

  hook.act(() => {
    hook.result.closeTracksWindow();
    hook.result.closeAmplitudePlot();
  });

  assert.equal(hook.result.isTracksWindowOpen, false);
  assert.equal(hook.result.isTrackSettingsOpen, false);
  assert.equal(hook.result.isAmplitudePlotOpen, false);
  assert.equal(hook.result.isPlotSettingsOpen, false);

  hook.unmount();
});

test('viewer panel windows react to availability changes and reset layout events', () => {
  let options = {
    resetToken: 0,
    hasTrackData: false,
    canShowPlotSettings: false
  };

  const hook = renderHook(() => useViewerPanelWindows(options));

  assert.equal(hook.result.isTracksWindowOpen, false);
  assert.equal(hook.result.isAmplitudePlotOpen, false);

  options = {
    ...options,
    hasTrackData: true,
    canShowPlotSettings: true
  };
  hook.rerender();

  assert.equal(hook.result.isTracksWindowOpen, true);
  assert.equal(hook.result.isAmplitudePlotOpen, true);

  hook.act(() => {
    hook.result.closeChannelsWindow();
    hook.result.closeTracksWindow();
    hook.result.closeAmplitudePlot();
    hook.result.openViewerSettings();
    hook.result.openDiagnosticsWindow();
  });

  options = {
    ...options,
    resetToken: 1
  };
  hook.rerender();

  assert.equal(hook.result.isChannelsWindowOpen, true);
  assert.equal(hook.result.isTracksWindowOpen, true);
  assert.equal(hook.result.isAmplitudePlotOpen, true);
  assert.equal(hook.result.isViewerSettingsOpen, false);
  assert.equal(hook.result.isDiagnosticsWindowOpen, false);

  options = {
    ...options,
    hasTrackData: false,
    canShowPlotSettings: false
  };
  hook.rerender();

  assert.equal(hook.result.isTracksWindowOpen, false);
  assert.equal(hook.result.isTrackSettingsOpen, false);
  assert.equal(hook.result.isAmplitudePlotOpen, false);
  assert.equal(hook.result.isPlotSettingsOpen, false);

  hook.unmount();
});
