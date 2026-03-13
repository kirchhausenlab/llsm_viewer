import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import TestRenderer from 'react-test-renderer';
import type { ReactTestInstance } from 'react-test-renderer';

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

test('front page header renders version and performance note when provided', () => {
  const renderer = TestRenderer.create(
    <FrontPageHeader
      title="Mirante4D"
      showReturnButton={false}
      onReturnToStart={() => {}}
      isFrontPageLocked={false}
      versionLabel="v0.2.0"
      performanceNotice={{
        title: 'Performance note',
        lines: [
          'Mirante4D works best in Chrome.',
          'It makes heavy use of the user\'s GPUs.',
          'This is an early build still being optimized: browser performance and stability may be affected.'
        ]
      }}
    />
  );

  const text = renderer.root
    .findAllByType('p')
    .map((node: ReactTestInstance) => node.children.join(' '))
    .join(' ');
  const version = renderer.root.findAll(
    (node: ReactTestInstance) => node.type === 'span' && node.props.className === 'front-page-version-label'
  )[0];

  assert.ok(version);
  assert.equal(version.children.join(''), 'v0.2.0');
  assert.match(text, /Performance note/);
  assert.match(text, /Mirante4D works best in Chrome\./);
  assert.match(text, /It makes heavy use of the user's GPUs\./);
  assert.match(text, /early build still being optimized: browser performance and stability may be affected\./);

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
  assert.equal(returnButton.props.children, 'Return');

  renderer.unmount();
});
