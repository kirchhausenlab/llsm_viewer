import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import TestRenderer from 'react-test-renderer';
import type { ReactTestInstance } from 'react-test-renderer';

import NavigationHelpWindow from '../../src/components/viewers/viewer-shell/NavigationHelpWindow.tsx';

function extractText(node: ReactTestInstance | string): string {
  if (typeof node === 'string') {
    return node;
  }

  return node.children.map((child) => extractText(child as ReactTestInstance | string)).join('');
}

test('navigation help window renders the updated desktop navigation guidance', () => {
  const renderer = TestRenderer.create(
    <NavigationHelpWindow
      isOpen
      onClose={() => {}}
      initialPosition={{ x: 24, y: 24 }}
      windowMargin={16}
      width={420}
      resetSignal={0}
    />
  );

  const headings = renderer.root.findAllByType('h4').map((node) => extractText(node));
  assert.deepEqual(headings, ['Navigation', 'Selection and follow']);

  const items = renderer.root.findAllByType('li').map((node) => extractText(node));
  assert.deepEqual(items, [
    'Left-click and drag to look around the volume.',
    'Scroll to zoom in or out.',
    'Use the arrow keys to look left, right, up, and down.',
    'Use W/A/S/D to move. Press Space to rise and C to descend.',
    'Hold Shift to move faster.',
    'Press Q/E to roll the camera counterclockwise or clockwise.',
    'Use Reset view in the top bar to restore the default camera.',
    'Click a track line to select and highlight it.',
    'Use Follow in the Tracks window to keep the camera on a selected track over time.',
    'Double-click a hovered voxel to follow that point in the volume.',
    'While following a target, drag or use the arrow keys to orbit around it.',
    'W/A/S/D, Space, C, and Shift movement are disabled while following.'
  ]);

  renderer.unmount();
});
