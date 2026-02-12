import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import TestRenderer from 'react-test-renderer';

import LaunchActions, { type LaunchActionsProps } from '../../src/components/pages/LaunchActions.tsx';

const makeProps = (overrides: Partial<LaunchActionsProps> = {}): LaunchActionsProps => ({
  frontPageMode: 'configuring',
  hasGlobalTimepointMismatch: false,
  interactionErrorMessage: null,
  launchErrorMessage: null,
  showLaunchViewerButton: true,
  onPreprocessExperiment: () => {},
  isPreprocessingExperiment: false,
  preprocessButtonEnabled: true,
  preprocessSuccessMessage: null,
  exportWhilePreprocessing: false,
  onExportWhilePreprocessingChange: () => {},
  exportName: 'example',
  onExportNameChange: () => {},
  exportDestinationLabel: null,
  onLaunchViewer: () => {},
  isLaunchingViewer: false,
  launchButtonEnabled: true,
  launchButtonLaunchable: 'true',
  ...overrides
});

function buttonByText(renderer: any, label: string): any {
  return renderer.root.findAllByType('button').find((button: any) => button.props.children === label);
}

test('configuring mode shows preprocess controls', () => {
  const renderer = TestRenderer.create(<LaunchActions {...makeProps()} />);

  const preprocessButton = buttonByText(renderer, 'Preprocess experiment');
  assert.ok(preprocessButton);
  assert.equal(preprocessButton.props.disabled, false);

  const launchButton = buttonByText(renderer, 'Launch viewer');
  assert.equal(launchButton, undefined);

  renderer.unmount();
});

test('preprocessed mode shows launch button', () => {
  const renderer = TestRenderer.create(
    <LaunchActions
      {...makeProps({
        frontPageMode: 'preprocessed',
        launchButtonEnabled: true
      })}
    />
  );

  const launchButton = buttonByText(renderer, 'Launch viewer');
  assert.ok(launchButton);
  assert.equal(launchButton.props.disabled, false);

  const preprocessButton = buttonByText(renderer, 'Preprocess experiment');
  assert.equal(preprocessButton, undefined);

  renderer.unmount();
});
