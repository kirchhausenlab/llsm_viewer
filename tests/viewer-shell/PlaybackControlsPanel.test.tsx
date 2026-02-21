import assert from 'node:assert/strict';
import React from 'react';
import TestRenderer from 'react-test-renderer';

import PlaybackControlsPanel from '../../src/components/viewers/viewer-shell/PlaybackControlsPanel.tsx';

console.log('Starting PlaybackControlsPanel tests');

function createProps(playbackDisabled: boolean, depth: number) {
  return {
    layout: {
      windowMargin: 16,
      controlWindowWidth: 360,
      controlWindowInitialPosition: { x: 0, y: 0 },
      viewerSettingsWindowInitialPosition: { x: 10, y: 10 },
      resetToken: 0
    },
    modeToggle: {
      is3dModeAvailable: true,
      isVrActive: false,
      isVrRequesting: false,
      resetViewHandler: null,
      onVrButtonClick: () => {},
      vrButtonDisabled: false,
      vrButtonLabel: 'Enter VR'
    },
    playbackControls: {
      fps: 12,
      onFpsChange: () => {},
      volumeTimepointCount: 1,
      isPlaying: false,
      playbackLabel: '1 / 1',
      selectedIndex: 0,
      onTimeIndexChange: () => {},
      playbackDisabled,
      onTogglePlayback: () => {},
      onJumpToStart: () => {},
      onJumpToEnd: () => {},
      error: null,
      onStartRecording: () => {},
      onStopRecording: () => {},
      isRecording: false,
      canRecord: true,
      activeSlicedLayerControl: {
        layerKey: 'layer-a',
        depth,
        zIndex: 0
      },
      onActiveSlicedLayerDepthChange: () => {}
    },
    viewerSettings: {
      samplingMode: 'linear' as const,
      onSamplingModeToggle: () => {},
      blendingMode: 'alpha' as const,
      onBlendingModeToggle: () => {},
      showRenderingQualityControl: false,
      hasVolumeData: true
    },
    isViewerSettingsOpen: false,
    onToggleViewerSettings: () => {},
    onCloseViewerSettings: () => {},
    renderingQuality: 1,
    onRenderingQualityChange: () => {}
  };
}

(() => {
  const renderer = TestRenderer.create(
    <PlaybackControlsPanel {...(createProps(true, 200) as any)} />
  );
  const enabledSlider = renderer.root.findByProps({ id: 'sliced-depth-slider-layer-a' });
  assert.equal(enabledSlider.props.disabled, false);
  assert.equal(enabledSlider.props.max, 199);

  renderer.update(<PlaybackControlsPanel {...(createProps(true, 1) as any)} />);
  const disabledSlider = renderer.root.findByProps({ id: 'sliced-depth-slider-layer-a' });
  assert.equal(disabledSlider.props.disabled, true);
  assert.equal(disabledSlider.props.max, 0);

  renderer.unmount();
})();

console.log('PlaybackControlsPanel tests passed');
