import assert from 'node:assert/strict';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

import TracksPanel from '../../src/components/viewers/viewer-shell/TracksPanel.tsx';
import { createDefaultTrackSetState } from '../../src/hooks/tracks/useTrackStyling.ts';
import type { TrackSummary } from '../../src/types/tracks.ts';

console.log('Starting TracksPanel tests');

const track: TrackSummary = {
  id: 'track-a',
  trackSetId: 'set-a',
  trackSetName: 'Tracks A',
  channelId: null,
  channelName: null,
  trackNumber: 1,
  sourceTrackId: 1,
  pointCount: 8,
  timeStart: 0,
  timeEnd: 7,
  amplitudeMin: 1,
  amplitudeMax: 9,
};

function createProps(defaultVisibility = true) {
  return {
    layout: {
      windowMargin: 16,
      controlWindowWidth: 360,
      trackWindowInitialPosition: { x: 0, y: 0 },
      trackSettingsWindowInitialPosition: { x: 24, y: 24 },
      resetToken: 0,
    },
    isOpen: true,
    onClose: () => {},
    hasTrackData: true,
    trackSets: [
      {
        id: 'set-a',
        name: 'Tracks A',
        boundChannelId: null,
        boundChannelName: null,
        fileName: 'tracks-a.csv',
      },
    ],
    trackHeadersByTrackSet: new Map([['set-a', { totalTracks: 1 }]]),
    activeTrackSetId: 'set-a',
    onTrackSetTabSelect: () => {},
    onRequireTrackCatalog: () => {},
    parsedTracksByTrackSet: new Map([['set-a', [track]]]),
    filteredTracksByTrackSet: new Map([['set-a', [track]]]),
    minimumTrackLength: 0,
    pendingMinimumTrackLength: 0,
    trackLengthBounds: { min: 0, max: 20 },
    onMinimumTrackLengthChange: () => {},
    onMinimumTrackLengthApply: () => {},
    trackColorModesByTrackSet: {},
    trackOpacityByTrackSet: {},
    trackLineWidthByTrackSet: {},
    trackSetStates: {
      'set-a': {
        ...createDefaultTrackSetState(),
        defaultVisibility,
      },
    },
    followedTrackSetId: null,
    followedTrackId: null,
    onTrackOrderToggle: () => {},
    trackOrderModeByTrackSet: {},
    onTrackVisibilityToggle: () => {},
    onTrackVisibilityAllChange: () => {},
    onTrackOpacityChange: () => {},
    onTrackLineWidthChange: () => {},
    onTrackColorSelect: () => {},
    onTrackColorReset: () => {},
    onTrackSelectionToggle: () => {},
    selectedTrackOrder: [],
    selectedTrackIds: new Set<string>(),
    onTrackFollow: () => {},
    trackDefaults: {
      opacity: 0.9,
      lineWidth: 1,
    },
    trackSettings: {
      isFullTrailEnabled: false,
      trailLength: 10,
      trailLengthExtent: { min: 1, max: 100 },
      drawCentroids: false,
      drawStartingPoints: true,
      onFullTrailToggle: () => {},
      onTrailLengthChange: () => {},
      onDrawCentroidsToggle: () => {},
      onDrawStartingPointsToggle: () => {},
    },
    isTrackSettingsOpen: false,
    onCloseTrackSettings: () => {},
  };
}

function findButtonByLabel(renderer: TestRenderer.ReactTestRenderer, label: string) {
  return renderer.root
    .findAll((node) => node.type === 'button')
    .find((button) => button.children.join('') === label) ?? null;
}

function findNodeByClassName(renderer: TestRenderer.ReactTestRenderer, className: string) {
  return renderer.root.findAll((node) => node.props.className === className)[0] ?? null;
}

(() => {
  const visibilityCalls: Array<{ trackSetId: string; visible: boolean }> = [];
  const renderer = TestRenderer.create(
    <TracksPanel
      {...({
        ...createProps(true),
        onTrackVisibilityAllChange: (trackSetId: string, visible: boolean) => {
          visibilityCalls.push({ trackSetId, visible });
        },
      } as any)}
    />,
  );

  const currentTrackTitle = findNodeByClassName(renderer, 'track-current-title');
  const hideButton = findButtonByLabel(renderer, 'Hide');

  assert.equal(currentTrackTitle?.children.join(''), 'Tracks A');
  assert.ok(hideButton);

  act(() => {
    hideButton?.props.onClick();
  });
  assert.deepEqual(visibilityCalls, [{ trackSetId: 'set-a', visible: false }]);

  renderer.update(
    <TracksPanel
      {...({
        ...createProps(false),
        onTrackVisibilityAllChange: (trackSetId: string, visible: boolean) => {
          visibilityCalls.push({ trackSetId, visible });
        },
      } as any)}
    />,
  );

  const showButton = findButtonByLabel(renderer, 'Show');
  assert.ok(showButton);

  act(() => {
    showButton?.props.onClick();
  });
  assert.deepEqual(visibilityCalls, [
    { trackSetId: 'set-a', visible: false },
    { trackSetId: 'set-a', visible: true },
  ]);

  renderer.unmount();
})();

console.log('TracksPanel tests passed');
