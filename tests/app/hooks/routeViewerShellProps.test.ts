import assert from 'node:assert/strict';

import {
  createRouteViewerShellProps,
  type RouteViewerShellSections
} from '../../../src/ui/app/hooks/routeViewerShellProps.ts';

console.log('Starting routeViewerShellProps tests');

(() => {
  const viewer = {
    viewerMode: '3d',
    viewerPanels: {} as RouteViewerShellSections['viewer']['viewerPanels'],
    vr: {} as RouteViewerShellSections['viewer']['vr']
  } satisfies RouteViewerShellSections['viewer'];

  const chrome = {
    topMenu: {} as RouteViewerShellSections['chrome']['topMenu'],
    layout: {} as RouteViewerShellSections['chrome']['layout'],
    modeControls: {} as RouteViewerShellSections['chrome']['modeControls'],
    playbackControls: {} as RouteViewerShellSections['chrome']['playbackControls']
  } satisfies RouteViewerShellSections['chrome'];

  const panels = {
    channelsPanel: {} as RouteViewerShellSections['panels']['channelsPanel'],
    tracksPanel: {} as RouteViewerShellSections['panels']['tracksPanel'],
    selectedTracksPanel: {} as RouteViewerShellSections['panels']['selectedTracksPanel'],
    plotSettings: {} as RouteViewerShellSections['panels']['plotSettings'],
    trackSettings: {} as RouteViewerShellSections['panels']['trackSettings']
  } satisfies RouteViewerShellSections['panels'];

  const result = createRouteViewerShellProps({
    viewer,
    chrome,
    panels
  });

  assert.strictEqual(result.viewerMode, viewer.viewerMode);
  assert.strictEqual(result.viewerPanels, viewer.viewerPanels);
  assert.strictEqual(result.vr, viewer.vr);
  assert.strictEqual(result.topMenu, chrome.topMenu);
  assert.strictEqual(result.modeControls, chrome.modeControls);
  assert.strictEqual(result.channelsPanel, panels.channelsPanel);
  assert.strictEqual(result.trackSettings, panels.trackSettings);
})();

console.log('routeViewerShellProps tests passed');
