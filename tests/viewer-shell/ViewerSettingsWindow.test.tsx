import assert from 'node:assert/strict';
import React from 'react';
import TestRenderer from 'react-test-renderer';

import ViewerSettingsWindow from '../../src/components/viewers/viewer-shell/ViewerSettingsWindow.tsx';

console.log('Starting ViewerSettingsWindow tests');

function createProps(isOpen: boolean) {
  return {
    layout: {
      windowMargin: 16,
      controlWindowWidth: 360,
      viewerSettingsWindowInitialPosition: { x: 10, y: 10 },
      resetToken: 0
    },
    modeToggle: {
      is3dModeAvailable: true,
    },
    playbackControls: {
      fps: 12,
      onFpsChange: () => {},
      volumeTimepointCount: 3,
      onStartRecording: () => {},
      onStopRecording: () => {},
      isRecording: false,
      canRecord: true
    },
    viewerSettings: {
      samplingMode: 'linear' as const,
      onSamplingModeToggle: () => {},
      blendingMode: 'alpha' as const,
      onBlendingModeToggle: () => {},
      showRenderingQualityControl: false,
      hasVolumeData: true
    },
    isOpen,
    onClose: () => {},
    renderingQuality: 1,
    onRenderingQualityChange: () => {}
  };
}

(() => {
  const closedRenderer = TestRenderer.create(
    <ViewerSettingsWindow {...(createProps(false) as any)} />
  );
  assert.equal(closedRenderer.toJSON(), null);
  closedRenderer.unmount();

  const openRenderer = TestRenderer.create(
    <ViewerSettingsWindow {...(createProps(true) as any)} />
  );
  const fpsSlider = openRenderer.root.findByProps({ id: 'fps-slider' });
  assert.equal(fpsSlider.props.disabled, false);
  assert.equal(fpsSlider.props.max, 30);

  openRenderer.unmount();
})();

console.log('ViewerSettingsWindow tests passed');
