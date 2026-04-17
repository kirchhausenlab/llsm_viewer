import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

import HoverSettingsWindow from '../../src/components/viewers/viewer-shell/HoverSettingsWindow.tsx';

function createProps(isOpen: boolean) {
  const enabledCalls: boolean[] = [];
  const typeCalls: Array<'default' | 'crosshair'> = [];
  const strengthCalls: number[] = [];
  const radiusCalls: number[] = [];

  return {
    layout: {
      windowMargin: 16,
      controlWindowWidth: 360,
      hoverSettingsWindowInitialPosition: { x: 10, y: 20 },
      resetToken: 0,
    },
    hoverSettings: {
      settings: {
        enabled: true,
        type: 'default' as const,
        strength: 50,
        radius: 50,
      },
      onEnabledChange: (enabled: boolean) => {
        enabledCalls.push(enabled);
      },
      onTypeChange: (type: 'default' | 'crosshair') => {
        typeCalls.push(type);
      },
      onStrengthChange: (value: number) => {
        strengthCalls.push(value);
      },
      onRadiusChange: (value: number) => {
        radiusCalls.push(value);
      },
    },
    isOpen,
    onClose: () => {},
    get enabledCalls() {
      return enabledCalls;
    },
    get typeCalls() {
      return typeCalls;
    },
    get strengthCalls() {
      return strengthCalls;
    },
    get radiusCalls() {
      return radiusCalls;
    },
  };
}

test('hover settings window renders nothing while closed', () => {
  const renderer = TestRenderer.create(
    <HoverSettingsWindow {...(createProps(false) as any)} />
  );

  assert.equal(renderer.toJSON(), null);
  renderer.unmount();
});

test('hover settings window renders the expected controls', () => {
  const renderer = TestRenderer.create(
    <HoverSettingsWindow {...(createProps(true) as any)} />
  );

  const toggleButton = renderer.root.findByProps({ id: 'hover-enabled-toggle' });
  const typeSelect = renderer.root.findByProps({ id: 'hover-type-select' });
  const strengthSlider = renderer.root.findByProps({ id: 'hover-strength-slider' });
  const radiusSlider = renderer.root.findByProps({ id: 'hover-radius-slider' });

  assert.equal(toggleButton.props['aria-pressed'], true);
  assert.equal(toggleButton.children.join(''), 'Enabled');
  assert.equal(typeSelect.props.value, 'default');
  assert.equal(strengthSlider.props.value, 50);
  assert.equal(radiusSlider.props.value, 50);

  renderer.unmount();
});

test('hover settings window forwards toggle, dropdown, and slider changes', () => {
  const props = createProps(true);
  const renderer = TestRenderer.create(
    <HoverSettingsWindow {...(props as any)} />
  );

  const toggleButton = renderer.root.findByProps({ id: 'hover-enabled-toggle' });
  const typeSelect = renderer.root.findByProps({ id: 'hover-type-select' });
  const strengthSlider = renderer.root.findByProps({ id: 'hover-strength-slider' });
  const radiusSlider = renderer.root.findByProps({ id: 'hover-radius-slider' });

  act(() => {
    toggleButton.props.onClick();
  });
  act(() => {
    typeSelect.props.onChange({ target: { value: 'crosshair' } });
  });
  act(() => {
    strengthSlider.props.onChange({ target: { value: '72' } });
  });
  act(() => {
    radiusSlider.props.onChange({ target: { value: '28' } });
  });

  assert.deepEqual(props.enabledCalls, [false]);
  assert.deepEqual(props.typeCalls, ['crosshair']);
  assert.deepEqual(props.strengthCalls, [72]);
  assert.deepEqual(props.radiusCalls, [28]);

  renderer.unmount();
});
