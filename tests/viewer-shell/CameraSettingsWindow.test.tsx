import assert from 'node:assert/strict';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

import CameraSettingsWindow from '../../src/components/viewers/viewer-shell/CameraSettingsWindow.tsx';

console.log('Starting CameraSettingsWindow tests');

function createProps(isOpen: boolean) {
  let translationCalls = 0;
  let rotationCalls = 0;
  let projectionCalls: Array<'perspective' | 'orthographic'> = [];

  return {
    layout: {
      windowMargin: 16,
      controlWindowWidth: 288,
      cameraSettingsWindowInitialPosition: { x: 10, y: 10 },
      resetToken: 0,
    },
    modeToggle: {
      is3dModeAvailable: true,
      isVrActive: false,
      isVrRequesting: false,
      resetViewHandler: null,
      onVrButtonClick: () => {},
      vrButtonDisabled: false,
      vrButtonLabel: 'Enter VR',
      projectionMode: 'perspective' as const,
      onProjectionModeChange: (value: 'perspective' | 'orthographic') => {
        projectionCalls.push(value);
      },
    },
    isOpen,
    onClose: () => {},
    translationSpeedMultiplier: 1.4,
    rotationSpeedMultiplier: 0.8,
    onTranslationSpeedMultiplierChange: () => {
      translationCalls += 1;
    },
    onRotationSpeedMultiplierChange: () => {
      rotationCalls += 1;
    },
    get translationCalls() {
      return translationCalls;
    },
    get rotationCalls() {
      return rotationCalls;
    },
    get projectionCalls() {
      return projectionCalls;
    },
  };
}

(() => {
  const closedRenderer = TestRenderer.create(<CameraSettingsWindow {...(createProps(false) as any)} />);
  assert.equal(closedRenderer.toJSON(), null);
  closedRenderer.unmount();
})();

(() => {
  const props = createProps(true);
  const renderer = TestRenderer.create(<CameraSettingsWindow {...(props as any)} />);

  const translationSlider = renderer.root.findByProps({ id: 'camera-settings-translation-speed' });
  const rotationSlider = renderer.root.findByProps({ id: 'camera-settings-rotation-speed' });
  const perspectiveButton = renderer.root.findAll(
    (node) => node.type === 'button' && node.children.join('') === 'Perspective'
  )[0];
  const isometricButton = renderer.root.findAll(
    (node) => node.type === 'button' && node.children.join('') === 'Isometric'
  )[0];

  assert.equal(translationSlider.props.value, 1.4);
  assert.equal(rotationSlider.props.value, 0.8);
  assert.equal(perspectiveButton.props['aria-pressed'], true);
  assert.equal(isometricButton.props['aria-pressed'], false);
  assert.equal(perspectiveButton.props.className, isometricButton.props.className);

  act(() => {
    translationSlider.props.onChange({ target: { value: '2.2' } });
  });
  act(() => {
    rotationSlider.props.onChange({ target: { value: '1.9' } });
  });
  act(() => {
    isometricButton.props.onClick();
  });

  assert.equal(props.translationCalls, 1);
  assert.equal(props.rotationCalls, 1);
  assert.deepEqual(props.projectionCalls, ['orthographic']);

  renderer.unmount();
})();

(() => {
  const props = createProps(true);
  props.modeToggle.isVrActive = true;
  const renderer = TestRenderer.create(<CameraSettingsWindow {...(props as any)} />);
  const isometricButton = renderer.root.findAll(
    (node) => node.type === 'button' && node.children.join('') === 'Isometric'
  )[0];

  assert.equal(isometricButton.props.disabled, true);
  assert.equal(
    renderer.root.findAll((node) => node.children.join('') === 'Isometric view is unavailable while VR is active.').length,
    1
  );

  renderer.unmount();
})();

console.log('CameraSettingsWindow tests passed');
