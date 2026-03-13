import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import TestRenderer from 'react-test-renderer';
import type { ReactTestInstance } from 'react-test-renderer';
import { act } from 'react-test-renderer';

import NavigationHelpWindow, {
  computeNavigationHelpInitialPosition
} from '../../src/components/viewers/viewer-shell/NavigationHelpWindow.tsx';
import { TOP_MENU_HEIGHT, TOP_MENU_WINDOW_PADDING } from '../../src/shared/utils/windowLayout.ts';

function extractText(node: ReactTestInstance | string): string {
  if (typeof node === 'string') {
    return node;
  }

  return node.children.map((child) => extractText(child as ReactTestInstance | string)).join('');
}

function findButtonByText(renderer: TestRenderer.ReactTestRenderer, label: string): ReactTestInstance {
  const button = renderer.root.findAll((node) => node.type === 'button' && extractText(node) === label)[0];
  assert.ok(button, `Expected button "${label}" to exist.`);
  return button;
}

test('navigation help window renders tabbed controls guidance and switches content', () => {
  let renderer!: TestRenderer.ReactTestRenderer;

  act(() => {
    renderer = TestRenderer.create(
      <NavigationHelpWindow
        isOpen
        onClose={() => {}}
        initialPosition={{ x: 24, y: 24 }}
        windowMargin={16}
        width={420}
        resetSignal={0}
      />
    );
  });

  const title = renderer.root.findAllByType('h2').map((node) => extractText(node));
  assert.deepEqual(title, ['Controls']);

  const tabs = renderer.root.findAll((node) => node.type === 'button' && node.props.role === 'tab');
  assert.deepEqual(
    tabs.map((node) => extractText(node)),
    ['Navigation', 'UI', 'Channels', 'Segmentation', 'Tracking']
  );
  assert.equal(tabs[0]?.props['aria-selected'], true);

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

  act(() => {
    findButtonByText(renderer, 'UI').props.onClick();
  });

  const uiHeadings = renderer.root.findAllByType('h4').map((node) => extractText(node));
  assert.deepEqual(uiHeadings, ['Top bar', 'Windows']);
  const uiItems = renderer.root.findAllByType('li').map((node) => extractText(node));
  assert.ok(uiItems.includes('Use the File, View, Edit, Tracks, and Help menus to open windows and viewer tools.'));
  assert.ok(uiItems.includes('Use the playback controls to play, pause, and scrub through timepoints.'));

  act(() => {
    findButtonByText(renderer, 'Segmentation').props.onClick();
  });

  const segmentationHeadings = renderer.root.findAllByType('h4').map((node) => extractText(node));
  assert.deepEqual(segmentationHeadings, ['Viewing segmentation', 'Editing labels']);
  const segmentationItems = renderer.root.findAllByType('li').map((node) => extractText(node));
  assert.ok(segmentationItems.includes('Open Edit > Paintbrush to create or refine labels.'));
  assert.ok(segmentationItems.includes('Use Undo, Redo, Clear, and Save in the Paintbrush window to manage your edits.'));

  renderer.unmount();
});

test('navigation help window initial position matches top-aligned viewer windows', () => {
  const previousWindow = globalThis.window;
  (globalThis as typeof globalThis & { window: Window }).window = {
    innerWidth: 1280,
    innerHeight: 900
  } as Window;

  try {
    assert.deepEqual(
      computeNavigationHelpInitialPosition({
        windowMargin: 24,
        windowWidth: 420
      }),
      {
        x: 430,
        y: TOP_MENU_HEIGHT + TOP_MENU_WINDOW_PADDING
      }
    );
  } finally {
    (globalThis as typeof globalThis & { window?: Window }).window = previousWindow;
  }
});
