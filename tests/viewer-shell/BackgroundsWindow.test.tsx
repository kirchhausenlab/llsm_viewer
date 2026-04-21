import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

import BackgroundsWindow from '../../src/components/viewers/viewer-shell/BackgroundsWindow.tsx';

type ListenerMap = Map<string, Set<(event: Event) => void>>;

function createListenerTarget() {
  const listeners: ListenerMap = new Map();

  return {
    addEventListener(type: string, listener: (event: Event) => void) {
      const handlers = listeners.get(type) ?? new Set<(event: Event) => void>();
      handlers.add(listener);
      listeners.set(type, handlers);
    },
    removeEventListener(type: string, listener: (event: Event) => void) {
      listeners.get(type)?.delete(listener);
    },
  };
}

function withEnvironmentMocks(run: () => void) {
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;

  const documentTarget = createListenerTarget();
  const windowTarget = createListenerTarget();
  const styleProperties = new Map<string, string>();

  const documentMock = {
    ...documentTarget,
    documentElement: {
      style: {
        setProperty(name: string, value: string) {
          styleProperties.set(name, value);
        },
        getPropertyValue(name: string) {
          return styleProperties.get(name) ?? '';
        },
      },
    },
  };

  const windowMock = {
    ...windowTarget,
    innerWidth: 1280,
    innerHeight: 720,
    getComputedStyle: () => ({
      getPropertyValue: (name: string) => styleProperties.get(name) ?? '',
    }),
  };

  (globalThis as typeof globalThis & { document: typeof documentMock }).document = documentMock;
  (globalThis as typeof globalThis & { window: typeof windowMock }).window = windowMock;

  try {
    run();
  } finally {
    (globalThis as typeof globalThis & { document?: Document }).document = previousDocument;
    (globalThis as typeof globalThis & { window?: Window & typeof globalThis }).window = previousWindow;
  }
}

function createProps(
  isOpen: boolean,
  overrides: Partial<{
    isFloorAvailable: boolean;
    floorEnabled: boolean;
  }> = {}
) {
  let resetCalls = 0;
  const backgroundColorCalls: string[] = [];
  const floorEnabledCalls: boolean[] = [];
  const floorColorCalls: string[] = [];

  return {
    layout: {
      windowMargin: 16,
      controlWindowWidth: 288,
      backgroundsWindowInitialPosition: { x: 10, y: 20 },
      resetToken: 0,
    },
    backgrounds: {
      backgroundColor: '#224466',
      floorEnabled: overrides.floorEnabled ?? false,
      floorColor: '#d7dbe0',
      isFloorAvailable: overrides.isFloorAvailable ?? true,
      isResetDisabled: false,
      onResetToDefault: () => {
        resetCalls += 1;
      },
      onBackgroundColorChange: (color: string) => {
        backgroundColorCalls.push(color);
      },
      onFloorEnabledChange: (enabled: boolean) => {
        floorEnabledCalls.push(enabled);
      },
      onFloorColorChange: (color: string) => {
        floorColorCalls.push(color);
      },
    },
    isOpen,
    onClose: () => {},
    get resetCalls() {
      return resetCalls;
    },
    get backgroundColorCalls() {
      return backgroundColorCalls;
    },
    get floorEnabledCalls() {
      return floorEnabledCalls;
    },
    get floorColorCalls() {
      return floorColorCalls;
    },
  };
}

test('backgrounds window renders nothing while closed', () => {
  withEnvironmentMocks(() => {
    const renderer = TestRenderer.create(
      <BackgroundsWindow {...(createProps(false) as any)} />
    );

    assert.equal(renderer.toJSON(), null);
    act(() => {
      renderer.unmount();
    });
  });
});

test('backgrounds window renders the expected controls', () => {
  withEnvironmentMocks(() => {
    const renderer = TestRenderer.create(
      <BackgroundsWindow {...(createProps(true) as any)} />
    );

    const title = renderer.root.findAllByType('h2')[0];
    const resetButton = renderer.root.findByProps({ id: 'viewer-background-reset' });
    const backgroundColorInput = renderer.root.findByProps({ id: 'viewer-background-color' });
    const floorCheckbox = renderer.root.findByProps({ id: 'viewer-background-floor-enabled' });
    const floorColorInput = renderer.root.findByProps({ id: 'viewer-background-floor-color' });

    assert.equal(title?.children.join(''), 'Backgrounds');
    assert.equal(resetButton.children.join(''), 'Reset to Default');
    assert.equal(backgroundColorInput.props.value, '#224466');
    assert.equal(floorCheckbox.props.checked, false);
    assert.equal(floorColorInput.props.value, '#d7dbe0');
    assert.equal(floorColorInput.props.disabled, true);

    act(() => {
      renderer.unmount();
    });
  });
});

test('backgrounds window forwards selection and color changes', () => {
  withEnvironmentMocks(() => {
    const props = createProps(true);
    const renderer = TestRenderer.create(
      <BackgroundsWindow {...(props as any)} />
    );

    const resetButton = renderer.root.findByProps({ id: 'viewer-background-reset' });
    const backgroundColorInput = renderer.root.findByProps({ id: 'viewer-background-color' });
    const floorCheckbox = renderer.root.findByProps({ id: 'viewer-background-floor-enabled' });
    const floorColorInput = renderer.root.findByProps({ id: 'viewer-background-floor-color' });

    act(() => {
      resetButton.props.onClick();
    });
    act(() => {
      backgroundColorInput.props.onChange({ target: { value: '#123456' } });
    });
    act(() => {
      floorCheckbox.props.onChange({ target: { checked: true } });
    });
    act(() => {
      floorColorInput.props.onChange({ target: { value: '#654321' } });
    });

    assert.equal(props.resetCalls, 1);
    assert.deepEqual(props.backgroundColorCalls, ['#123456']);
    assert.deepEqual(props.floorEnabledCalls, [true]);
    assert.deepEqual(props.floorColorCalls, ['#654321']);

    act(() => {
      renderer.unmount();
    });
  });
});

test('backgrounds window disables floor controls while orthographic mode is active', () => {
  withEnvironmentMocks(() => {
    const renderer = TestRenderer.create(
      <BackgroundsWindow {...(createProps(true, {
        isFloorAvailable: false,
        floorEnabled: true,
      }) as any)} />
    );

    const floorCheckbox = renderer.root.findByProps({ id: 'viewer-background-floor-enabled' });
    const floorColorInput = renderer.root.findByProps({ id: 'viewer-background-floor-color' });

    assert.equal(floorCheckbox.props.disabled, true);
    assert.equal(floorColorInput.props.disabled, true);

    act(() => {
      renderer.unmount();
    });
  });
});
