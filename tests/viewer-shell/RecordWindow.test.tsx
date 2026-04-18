import assert from 'node:assert/strict';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

import RecordWindow from '../../src/components/viewers/viewer-shell/RecordWindow.tsx';
import type { RecordingStatus } from '../../src/components/viewers/viewer-shell/types.ts';

console.log('Starting RecordWindow tests');

function createProps(isOpen: boolean, recordingStatus: RecordingStatus = 'idle') {
  let bitrateCalls = 0;
  let countdownCalls = 0;
  let screenshotCalls = 0;
  let primaryCalls = 0;
  let stopCalls = 0;

  return {
    layout: {
      windowMargin: 16,
      controlWindowWidth: 360,
      recordWindowInitialPosition: { x: 10, y: 10 },
      resetToken: 0
    },
    playbackControls: {
      recordingBitrateMbps: 24,
      onRecordingBitrateMbpsChange: () => {
        bitrateCalls += 1;
      },
      countdownSeconds: 3,
      onCountdownSecondsChange: () => {
        countdownCalls += 1;
      },
      onTakeScreenshot: () => {
        screenshotCalls += 1;
      },
      canTakeScreenshot: recordingStatus === 'idle',
      onRecordingPrimaryAction: () => {
        primaryCalls += 1;
      },
      onStopRecording: () => {
        stopCalls += 1;
      },
      recordingStatus,
      isRecording: recordingStatus === 'recording',
      canRecord: true
    },
    isOpen,
    onClose: () => {},
    get bitrateCalls() {
      return bitrateCalls;
    },
    get countdownCalls() {
      return countdownCalls;
    },
    get screenshotCalls() {
      return screenshotCalls;
    },
    get primaryCalls() {
      return primaryCalls;
    },
    get stopCalls() {
      return stopCalls;
    }
  };
}

(() => {
  const closedRenderer = TestRenderer.create(
    <RecordWindow {...(createProps(false) as any)} />
  );
  assert.equal(closedRenderer.toJSON(), null);
  closedRenderer.unmount();
})();

(() => {
  const props = createProps(true);
  const renderer = TestRenderer.create(
    <RecordWindow {...(props as any)} />
  );
  const title = renderer.root.findAllByType('h2')[0];

  const screenshotButton = renderer.root.findAll(
    (node) => node.type === 'button' && node.children.join('') === 'Screenshot'
  )[0];
  const recordButton = renderer.root.findAll(
    (node) => node.type === 'button' && node.children.join('') === 'Record'
  )[0];
  const stopButton = renderer.root.findAll(
    (node) => node.type === 'button' && node.children.join('') === 'Stop'
  )[0];
  const bitrateSlider = renderer.root.findByProps({ id: 'recording-bitrate-slider' });
  const countdownInput = renderer.root.findByProps({ id: 'recording-countdown-input' });
  const strayNumberInputs = renderer.root.findAll(
    (node) => node.type === 'input' && node.props.type === 'number' && node.props.id !== 'recording-countdown-input'
  );

  assert.ok(screenshotButton);
  assert.equal(title?.children.join(''), 'Screen capture');
  assert.ok(recordButton);
  assert.ok(stopButton);
  assert.equal(bitrateSlider.props.value, 24);
  assert.equal(countdownInput.props.value, 3);
  assert.equal(strayNumberInputs.length, 0);

  act(() => {
    screenshotButton?.props.onClick();
  });
  act(() => {
    recordButton?.props.onClick();
  });
  act(() => {
    stopButton?.props.onClick();
  });
  act(() => {
    bitrateSlider.props.onChange({ target: { value: '32' } });
  });
  act(() => {
    countdownInput.props.onChange({ target: { value: '5' } });
  });

  assert.equal(props.screenshotCalls, 1);
  assert.equal(props.primaryCalls, 1);
  assert.equal(props.stopCalls, 1);
  assert.equal(props.bitrateCalls, 1);
  assert.equal(props.countdownCalls, 1);

  renderer.unmount();
})();

(() => {
  const pendingRenderer = TestRenderer.create(
    <RecordWindow {...(createProps(true, 'pending-start') as any)} />
  );
  assert.ok(
    pendingRenderer.root.findAll(
      (node) => node.type === 'button' && node.children.join('') === 'Abort'
    )[0]
  );
  pendingRenderer.unmount();

  const pausedRenderer = TestRenderer.create(
    <RecordWindow {...(createProps(true, 'paused') as any)} />
  );
  assert.ok(
    pausedRenderer.root.findAll(
      (node) => node.type === 'button' && node.children.join('') === 'Resume'
    )[0]
  );
  pausedRenderer.unmount();
})();

console.log('RecordWindow tests passed');
