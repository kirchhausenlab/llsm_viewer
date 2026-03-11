import assert from 'node:assert/strict';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

import ViewerSettingsWindow from '../../src/components/viewers/viewer-shell/ViewerSettingsWindow.tsx';

console.log('Starting ViewerSettingsWindow tests');

function createProps(isOpen: boolean) {
  let densityCalls = 0;
  let mipCalls = 0;
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
      volumeTimepointCount: 3
    },
    viewerSettings: {
      samplingMode: 'linear' as const,
      onSamplingModeToggle: () => {},
      blendingMode: 'alpha' as const,
      onBlendingModeToggle: () => {},
      showRenderingQualityControl: true,
      hasVolumeData: true
    },
    isOpen,
    onClose: () => {},
    renderingQuality: 1,
    onRenderingQualityChange: () => {},
    globalRenderControls: {
      disabled: false,
      mipEarlyExitThreshold: 0.875,
      blDensityScale: 1.5,
      blBackgroundCutoff: 0.2,
      blOpacityScale: 1.8,
      blEarlyExitAlpha: 0.93,
      onBlDensityScaleChange: () => {
        densityCalls += 1;
      },
      onBlBackgroundCutoffChange: () => {},
      onBlOpacityScaleChange: () => {},
      onBlEarlyExitAlphaChange: () => {},
      onMipEarlyExitThresholdChange: () => {
        mipCalls += 1;
      }
    },
    get densityCalls() {
      return densityCalls;
    },
    get mipCalls() {
      return mipCalls;
    }
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
  const qualitySlider = openRenderer.root.findByProps({ id: 'volume-steps-slider' });
  const mipSlider = openRenderer.root.findByProps({ id: 'global-mip-early-exit' });
  assert.equal(fpsSlider.props.disabled, false);
  assert.equal(fpsSlider.props.max, 30);
  assert.equal(qualitySlider.props.value, 1);
  assert.equal(mipSlider.props.value, 0.875);
  assert.equal(
    openRenderer.root.findAll(
      (node) => node.type === 'button' && node.children.join('') === 'Alpha color blending'
    ).length,
    1
  );
  assert.equal(
    openRenderer.root.findAll((node) => node.type === 'button' && node.children.join('') === 'Record').length,
    0
  );
  assert.equal(
    openRenderer.root.findAll((node) => node.type === 'button' && node.children.join('') === 'Stop').length,
    0
  );

  openRenderer.unmount();
})();

(() => {
  const props = createProps(true);
  const renderer = TestRenderer.create(
    <ViewerSettingsWindow {...(props as any)} />
  );
  const blInputs = renderer.root.findAll(
    (node) =>
      node.type === 'input' &&
      typeof node.props.id === 'string' &&
      node.props.id.startsWith('global-bl-')
  );
  assert.equal(blInputs.length, 4);

  act(() => {
    blInputs[0]?.props.onChange({ target: { value: '2.4' } });
  });
  assert.equal(props.densityCalls, 1);

  const mipInput = renderer.root.findByProps({ id: 'global-mip-early-exit' });

  act(() => {
    mipInput?.props.onChange({ target: { value: '0.91' } });
  });
  assert.equal(props.mipCalls, 1);

  renderer.unmount();
})();

console.log('ViewerSettingsWindow tests passed');
