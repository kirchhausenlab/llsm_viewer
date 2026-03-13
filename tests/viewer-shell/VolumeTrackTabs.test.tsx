import assert from 'node:assert/strict';
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

(() => {
  const selectionCalls: string[] = [];
  const renderer = TestRenderer.create(
    <VolumeTrackTabs
      {...(createProps({
        onTrackSetTabSelect: (trackSetId) => {
          selectionCalls.push(trackSetId);
        }
      }) as any)}
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
})();

(() => {
  const visibilityCalls: Array<{ trackSetId: string; visible: boolean }> = [];
  let prevented = false;
  let stopped = false;
  const renderer = TestRenderer.create(
    <VolumeTrackTabs
      {...(createProps({
        onTrackVisibilityAllChange: (trackSetId, visible) => {
          visibilityCalls.push({ trackSetId, visible });
        }
      }) as any)}
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
})();
