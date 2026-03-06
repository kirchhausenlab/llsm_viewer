import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import TestRenderer from 'react-test-renderer';

import FrontPageHeader from '../../src/components/pages/FrontPageHeader.tsx';

test('front page header hides return button when not needed', () => {
  const renderer = TestRenderer.create(
    <FrontPageHeader
      title="Mirante4D"
      showReturnButton={false}
      onReturnToStart={() => {}}
      isFrontPageLocked={false}
    />
  );

  const buttons = renderer.root.findAllByType('button');
  assert.equal(buttons.length, 1);
  assert.equal(buttons[0].props.className, 'theme-mode-toggle front-page-theme-toggle');

  renderer.unmount();
});

test('front page header shows return button when requested', () => {
  const renderer = TestRenderer.create(
    <FrontPageHeader
      title="Set up new experiment"
      showReturnButton
      onReturnToStart={() => {}}
      isFrontPageLocked={false}
    />
  );

  const returnButton = renderer.root.findAllByType('button')[1];
  assert.ok(returnButton);
  assert.equal(returnButton.props.children, 'Return');

  renderer.unmount();
});
