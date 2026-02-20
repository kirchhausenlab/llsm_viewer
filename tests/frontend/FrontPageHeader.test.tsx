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
  assert.equal(buttons.length, 0);

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

  const returnButton = renderer.root.findAllByType('button')[0];
  assert.ok(returnButton);
  assert.equal(returnButton.props.children, '↩ Return');

  renderer.unmount();
});
