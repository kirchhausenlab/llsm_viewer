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
  assert.equal(hook.result.isPropsWindowOpen, false);
  assert.equal(hook.result.isTracksWindowOpen, true);
  assert.equal(hook.result.isAmplitudePlotOpen, false);
  assert.equal(hook.result.isViewerSettingsOpen, false);
  assert.equal(hook.result.isHoverSettingsWindowOpen, false);
  assert.equal(hook.result.isTrackSettingsOpen, false);
  assert.equal(hook.result.isPlotSettingsOpen, false);
  assert.equal(hook.result.isDiagnosticsWindowOpen, false);
  assert.equal(hook.result.isDrawRoiWindowOpen, false);
  assert.equal(hook.result.isRoiManagerWindowOpen, false);

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
    hook.result.openHoverSettingsWindow();
    hook.result.openTrackSettings();
    hook.result.openAmplitudePlot();
    hook.result.openPlotSettings();
    hook.result.openPropsWindow();
    hook.result.openPaintbrush();
    hook.result.openDrawRoiWindow();
    hook.result.openRoiManagerWindow();
    hook.result.openDiagnosticsWindow();
  });

  assert.equal(hook.result.isViewerSettingsOpen, true);
  assert.equal(hook.result.isHoverSettingsWindowOpen, true);
  assert.equal(hook.result.isPropsWindowOpen, true);
  assert.equal(hook.result.isTracksWindowOpen, true);
  assert.equal(hook.result.isTrackSettingsOpen, true);
  assert.equal(hook.result.isAmplitudePlotOpen, true);
  assert.equal(hook.result.isPlotSettingsOpen, true);
  assert.equal(hook.result.isPaintbrushOpen, true);
  assert.equal(hook.result.isDrawRoiWindowOpen, true);
  assert.equal(hook.result.isRoiManagerWindowOpen, true);
  assert.equal(hook.result.isDiagnosticsWindowOpen, true);

  hook.act(() => {
    hook.result.closeTracksWindow();
    hook.result.closeAmplitudePlot();
  });

  assert.equal(hook.result.isTracksWindowOpen, false);
  assert.equal(hook.result.isTrackSettingsOpen, false);
  assert.equal(hook.result.isAmplitudePlotOpen, false);
  assert.equal(hook.result.isDrawRoiWindowOpen, true);
  assert.equal(hook.result.isRoiManagerWindowOpen, true);
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

  hook.act(() => {
    hook.result.openAmplitudePlot();
  });

  assert.equal(hook.result.isAmplitudePlotOpen, true);
  assert.equal(hook.result.isPlotSettingsOpen, false);

  hook.act(() => {
    hook.result.closeAmplitudePlot();
  });

  options = {
    ...options,
    hasTrackData: true,
    canShowPlotSettings: true
  };
  hook.rerender();

  assert.equal(hook.result.isTracksWindowOpen, true);
  assert.equal(hook.result.isAmplitudePlotOpen, false);

  hook.act(() => {
    hook.result.closeChannelsWindow();
    hook.result.openPropsWindow();
    hook.result.closeTracksWindow();
    hook.result.closeAmplitudePlot();
    hook.result.openViewerSettings();
    hook.result.openHoverSettingsWindow();
    hook.result.openDrawRoiWindow();
    hook.result.openRoiManagerWindow();
    hook.result.openDiagnosticsWindow();
  });

  options = {
    ...options,
    resetToken: 1
  };
  hook.rerender();

  assert.equal(hook.result.isChannelsWindowOpen, false);
  assert.equal(hook.result.isPropsWindowOpen, true);
  assert.equal(hook.result.isTracksWindowOpen, false);
  assert.equal(hook.result.isAmplitudePlotOpen, false);
  assert.equal(hook.result.isViewerSettingsOpen, true);
  assert.equal(hook.result.isHoverSettingsWindowOpen, true);
  assert.equal(hook.result.isDrawRoiWindowOpen, true);
  assert.equal(hook.result.isRoiManagerWindowOpen, true);
  assert.equal(hook.result.isDiagnosticsWindowOpen, true);

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
