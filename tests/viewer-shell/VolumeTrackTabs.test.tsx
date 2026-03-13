import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

import VolumeTrackTabs from '../../src/components/viewers/viewer-shell/VolumeTrackTabs.tsx';

function createProps(overrides: Partial<React.ComponentProps<typeof VolumeTrackTabs>> = {}) {
  return {
    trackSets: [
      { id: 'set-a', name: 'Tracks A' },
      { id: 'set-b', name: 'Tracks B' }
    ],
    trackHeadersByTrackSet: new Map([
      ['set-a', { totalTracks: 6 }],
      ['set-b', { totalTracks: 4 }]
    ]),
    activeTrackSetId: 'set-a',
    trackColorModesByTrackSet: {},
    trackVisibilitySummaryByTrackSet: new Map([
      ['set-a', { total: 6, visible: 6 }],
      ['set-b', { total: 4, visible: 0 }]
    ]),
    onTrackSetTabSelect: () => {},
    onTrackVisibilityAllChange: () => {},
    ...overrides
  };
}

test('track tabs keep hidden styling and remain selectable', () => {
  const selectionCalls: string[] = [];
  const renderer = TestRenderer.create(
    <VolumeTrackTabs
      {...createProps({
        onTrackSetTabSelect: (trackSetId) => {
          selectionCalls.push(trackSetId);
        }
      })}
    />
  );

  const trackTab = renderer.root.findByProps({ id: 'top-menu-track-tab-set-b' });
  const trackLabel = trackTab.children[0];

  assert.match(String(trackLabel.props.className), /channel-tab-label--hidden/);
  assert.match(String(trackTab.props.className), /\bis-hidden\b/);

  act(() => {
    trackTab.props.onClick({ button: 0 });
  });

  assert.deepEqual(selectionCalls, ['set-b']);

  renderer.unmount();
});

test('track tabs middle-click toggles whole-set visibility', () => {
  const visibilityCalls: Array<{ trackSetId: string; visible: boolean }> = [];
  let prevented = false;
  let stopped = false;
  const renderer = TestRenderer.create(
    <VolumeTrackTabs
      {...createProps({
        onTrackVisibilityAllChange: (trackSetId, visible) => {
          visibilityCalls.push({ trackSetId, visible });
        }
      })}
    />
  );

  const trackTab = renderer.root.findByProps({ id: 'top-menu-track-tab-set-a' });

  act(() => {
    trackTab.props.onAuxClick({
      button: 1,
      preventDefault() {
        prevented = true;
      },
      stopPropagation() {
        stopped = true;
      }
    });
  });

  assert.equal(prevented, true);
  assert.equal(stopped, true);
  assert.deepEqual(visibilityCalls, [{ trackSetId: 'set-a', visible: false }]);

  renderer.unmount();
});

test('track tabs truncate long labels and keep a four-tab viewport', () => {
  const renderer = TestRenderer.create(
    <VolumeTrackTabs
      {...createProps({
        trackSets: [
          { id: 'set-a', name: 'Tracks A' },
          { id: 'set-b', name: 'Tracks B' },
          { id: 'set-c', name: 'Tracks C' },
          { id: 'set-d', name: 'Tracks D' },
          { id: 'set-e', name: '12345678901234567890' }
        ],
        trackHeadersByTrackSet: new Map([
          ['set-a', { totalTracks: 6 }],
          ['set-b', { totalTracks: 4 }],
          ['set-c', { totalTracks: 3 }],
          ['set-d', { totalTracks: 9 }],
          ['set-e', { totalTracks: 7 }]
        ]),
        activeTrackSetId: 'set-e',
        trackVisibilitySummaryByTrackSet: new Map([
          ['set-a', { total: 6, visible: 6 }],
          ['set-b', { total: 4, visible: 4 }],
          ['set-c', { total: 3, visible: 3 }],
          ['set-d', { total: 9, visible: 9 }],
          ['set-e', { total: 7, visible: 7 }]
        ])
      })}
    />
  );

  const visibleTabs = renderer.root.findAll(
    (node) => node.type === 'button' && node.props.role === 'tab'
  );
  const visibleTabIds = visibleTabs.map((node) => String(node.props.id));
  const longLabelTab = renderer.root.findByProps({ id: 'top-menu-track-tab-set-e' });
  const previousButton = renderer.root.findByProps({ 'aria-label': 'Show previous track tabs' });
  const nextButton = renderer.root.findByProps({ 'aria-label': 'Show next track tabs' });

  assert.deepEqual(visibleTabIds, [
    'top-menu-track-tab-set-b',
    'top-menu-track-tab-set-c',
    'top-menu-track-tab-set-d',
    'top-menu-track-tab-set-e'
  ]);
  assert.equal(longLabelTab.children[0].children.join(''), '12345678901');
  assert.doesNotMatch(String(previousButton.props.className), /\bis-hidden\b/);
  assert.match(String(nextButton.props.className), /\bis-hidden\b/);

  renderer.unmount();
});
