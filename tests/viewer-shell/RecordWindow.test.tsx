import assert from 'node:assert/strict';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

import RecordWindow from '../../src/components/viewers/viewer-shell/RecordWindow.tsx';

console.log('Starting RecordWindow tests');

function createProps(isOpen: boolean) {
  let bitrateCalls = 0;
  let startCalls = 0;
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
      onStartRecording: () => {
        startCalls += 1;
      },
      onStopRecording: () => {
        stopCalls += 1;
      },
      isRecording: false,
      canRecord: true
    },
    isOpen,
    onClose: () => {},
    get bitrateCalls() {
      return bitrateCalls;
    },
    get startCalls() {
      return startCalls;
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

  const props = createProps(true);
  const renderer = TestRenderer.create(
    <RecordWindow {...(props as any)} />
  );
  const recordButton = renderer.root.findAll(
    (node) => node.type === 'button' && node.children.join('') === 'Record'
  )[0];
  const stopButton = renderer.root.findAll(
    (node) => node.type === 'button' && node.children.join('') === 'Stop'
  )[0];
  const bitrateSlider = renderer.root.findByProps({ id: 'recording-bitrate-slider' });

  assert.ok(recordButton);
  assert.ok(stopButton);
  assert.equal(bitrateSlider.props.value, 24);

  act(() => {
    recordButton?.props.onClick();
  });
  act(() => {
    stopButton?.props.onClick();
  });
  act(() => {
    bitrateSlider.props.onChange({ target: { value: '32' } });
  });

  assert.equal(props.startCalls, 1);
  assert.equal(props.stopCalls, 1);
  assert.equal(props.bitrateCalls, 1);

  renderer.unmount();
})();

console.log('RecordWindow tests passed');
