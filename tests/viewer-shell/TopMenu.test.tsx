import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import type { ReactTestInstance } from 'react-test-renderer';

import TopMenu from '../../src/components/viewers/viewer-shell/TopMenu.tsx';
import { UiThemeProvider } from '../../src/ui/app/providers/UiThemeProvider.tsx';

type ListenerMap = Map<string, Set<(event: Event) => void>>;

type MockStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  clear: () => void;
};

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
    dispatchEvent(event: Event) {
      listeners.get(event.type)?.forEach((listener) => listener(event));
      return true;
    }
  };
}

function createStorageMock(): MockStorage {
  const storage = new Map<string, string>();

  return {
    getItem(key: string) {
      return storage.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      storage.set(key, value);
    },
    removeItem(key: string) {
      storage.delete(key);
    },
    clear() {
      storage.clear();
    }
  };
}

function withEnvironmentMocks(run: () => void) {
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  const previousEvent = globalThis.Event;
  const previousResizeObserver = (globalThis as typeof globalThis & { ResizeObserver?: unknown }).ResizeObserver;

  const documentTarget = createListenerTarget();
  const windowTarget = createListenerTarget();
  const styleProperties = new Map<string, string>();
  const storage = createStorageMock();

  class MockEvent {
    type: string;

    constructor(type: string) {
      this.type = type;
    }
  }

  const documentMock = {
    ...documentTarget,
    activeElement: null,
    documentElement: {
      dataset: {} as Record<string, string>,
      style: {
        colorScheme: 'dark',
        setProperty(name: string, value: string) {
          styleProperties.set(name, value);
        },
        getPropertyValue(name: string) {
          return styleProperties.get(name) ?? '';
        }
      }
    }
  };

  const windowMock = {
    ...windowTarget,
    localStorage: storage
  };

  (globalThis as typeof globalThis & { document: typeof documentMock }).document = documentMock;
  (globalThis as typeof globalThis & { window: typeof windowMock }).window = windowMock;
  (globalThis as typeof globalThis & { Event: typeof MockEvent }).Event = MockEvent as typeof Event;
  delete (globalThis as typeof globalThis & { ResizeObserver?: unknown }).ResizeObserver;

  try {
    run();
  } finally {
    (globalThis as typeof globalThis & { document?: Document }).document = previousDocument;
    (globalThis as typeof globalThis & { window?: Window & typeof globalThis }).window = previousWindow;
    (globalThis as typeof globalThis & { Event?: typeof Event }).Event = previousEvent;
    if (previousResizeObserver === undefined) {
      delete (globalThis as typeof globalThis & { ResizeObserver?: unknown }).ResizeObserver;
    } else {
      (globalThis as typeof globalThis & { ResizeObserver?: unknown }).ResizeObserver = previousResizeObserver;
    }
  }
}

function extractText(node: ReactTestInstance | string): string {
  if (typeof node === 'string') {
    return node;
  }

  return node.children.map((child) => extractText(child as ReactTestInstance | string)).join('');
}

function createProps(overrides: Partial<React.ComponentProps<typeof TopMenu>> = {}): React.ComponentProps<typeof TopMenu> {
  return {
    onReturnToLauncher: () => {},
    onResetLayout: () => {},
    currentScaleLabel: '1.00x',
    isHelpMenuOpen: false,
    openHelpMenu: () => {},
    closeHelpMenu: () => {},
    followedTrackSetId: null,
    followedTrackId: null,
    followedVoxel: null,
    onStopTrackFollow: () => {},
    onStopVoxelFollow: () => {},
    hoveredVoxel: null,
    hoverCoordinateDigits: { x: 1, y: 1, z: 1 },
    hoverIntensityValueDigits: 1,
    onOpenChannelsWindow: () => {},
    onOpenPaintbrush: () => {},
    onOpenRenderSettingsWindow: () => {},
    onOpenTracksWindow: () => {},
    onOpenAmplitudePlotWindow: () => {},
    onOpenTrackSettingsWindow: () => {},
    onOpenDiagnosticsWindow: () => {},
    is3dModeAvailable: false,
    resetViewHandler: null,
    onVrButtonClick: () => {},
    vrButtonDisabled: true,
    vrButtonLabel: 'Enter VR',
    volumeTimepointCount: 1,
    isPlaying: false,
    selectedIndex: 0,
    onTimeIndexChange: () => {},
    playbackDisabled: true,
    onTogglePlayback: () => {},
    zSliderValue: 1,
    zSliderMax: 1,
    onZSliderChange: () => {},
    loadedChannelIds: [],
    channelNameMap: new Map(),
    channelVisibility: {},
    channelTintMap: new Map(),
    activeChannelId: null,
    onChannelTabSelect: () => {},
    onChannelVisibilityToggle: () => {},
    ...overrides
  };
}

function renderTopMenu(overrides: Partial<React.ComponentProps<typeof TopMenu>> = {}) {
  return TestRenderer.create(
    <UiThemeProvider>
      <TopMenu {...createProps(overrides)} />
    </UiThemeProvider>
  );
}

function findDropdownTrigger(renderer: TestRenderer.ReactTestRenderer, label: string): ReactTestInstance {
  const trigger = renderer.root.findAll(
    (node) =>
      node.type === 'button' &&
      typeof node.props.className === 'string' &&
      node.props.className.includes('viewer-top-menu-dropdown-trigger') &&
      extractText(node) === label
  )[0];

  assert.ok(trigger, `Expected dropdown trigger "${label}" to exist.`);
  return trigger;
}

function findMenuItem(renderer: TestRenderer.ReactTestRenderer, label: string): ReactTestInstance {
  const menuItem = renderer.root.findAll(
    (node) => node.type === 'button' && node.props.role === 'menuitem' && extractText(node) === label
  )[0];

  assert.ok(menuItem, `Expected menu item "${label}" to exist.`);
  return menuItem;
}

test('top menu renders the requested dropdown order and items', () => {
  withEnvironmentMocks(() => {
    const renderer = renderTopMenu();
    const triggerLabels = renderer.root
      .findAll(
        (node) =>
          node.type === 'button' &&
          typeof node.props.className === 'string' &&
          node.props.className.includes('viewer-top-menu-dropdown-trigger')
      )
      .map((node) => extractText(node));

    assert.deepEqual(triggerLabels, ['File', 'View', 'Edit', 'Tracks', 'Help']);

    const expectedMenus = new Map<string, string[]>([
      ['File', ['Save changes', 'Reset changes', 'Recenter windows', 'Diagnostics', 'Exit']],
      ['View', ['Channels window', 'Camera', 'Record', 'Background', 'Render settings', 'Hover settings']],
      ['Edit', ['Props', 'Paintbrush', 'Measure']],
      ['Tracks', ['Tracks window', 'Amplitude plot', 'Tracks settings']],
      ['Help', ['About', 'Navigation controls']]
    ]);

    for (const [label, expectedItems] of expectedMenus) {
      act(() => {
        findDropdownTrigger(renderer, label).props.onClick();
      });

      const renderedItems = renderer.root
        .findAll((node) => node.type === 'button' && node.props.role === 'menuitem')
        .map((node) => extractText(node));

      assert.deepEqual(renderedItems, expectedItems);
    }

    renderer.unmount();
  });
});

test('wired dropdown items invoke the expected handlers', () => {
  withEnvironmentMocks(() => {
    let exitCalls = 0;
    let resetCalls = 0;
    let channelsCalls = 0;
    let paintbrushCalls = 0;
    let renderSettingsCalls = 0;
    let tracksCalls = 0;
    let amplitudePlotCalls = 0;
    let trackSettingsCalls = 0;
    let diagnosticsCalls = 0;
    let helpCalls = 0;

    const renderer = renderTopMenu({
      onReturnToLauncher: () => {
        exitCalls += 1;
      },
      onResetLayout: () => {
        resetCalls += 1;
      },
      onOpenChannelsWindow: () => {
        channelsCalls += 1;
      },
      onOpenPaintbrush: () => {
        paintbrushCalls += 1;
      },
      onOpenRenderSettingsWindow: () => {
        renderSettingsCalls += 1;
      },
      onOpenTracksWindow: () => {
        tracksCalls += 1;
      },
      onOpenAmplitudePlotWindow: () => {
        amplitudePlotCalls += 1;
      },
      onOpenTrackSettingsWindow: () => {
        trackSettingsCalls += 1;
      },
      onOpenDiagnosticsWindow: () => {
        diagnosticsCalls += 1;
      },
      openHelpMenu: () => {
        helpCalls += 1;
      }
    });

    act(() => {
      findDropdownTrigger(renderer, 'File').props.onClick();
    });
    act(() => {
      findMenuItem(renderer, 'Recenter windows').props.onClick();
    });

    act(() => {
      findDropdownTrigger(renderer, 'File').props.onClick();
    });
    act(() => {
      findMenuItem(renderer, 'Exit').props.onClick();
    });

    act(() => {
      findDropdownTrigger(renderer, 'View').props.onClick();
    });
    act(() => {
      findMenuItem(renderer, 'Channels window').props.onClick();
    });

    act(() => {
      findDropdownTrigger(renderer, 'File').props.onClick();
    });
    act(() => {
      findMenuItem(renderer, 'Diagnostics').props.onClick();
    });

    act(() => {
      findDropdownTrigger(renderer, 'Edit').props.onClick();
    });
    act(() => {
      findMenuItem(renderer, 'Paintbrush').props.onClick();
    });

    act(() => {
      findDropdownTrigger(renderer, 'View').props.onClick();
    });
    act(() => {
      findMenuItem(renderer, 'Render settings').props.onClick();
    });

    act(() => {
      findDropdownTrigger(renderer, 'Tracks').props.onClick();
    });
    act(() => {
      findMenuItem(renderer, 'Tracks window').props.onClick();
    });

    act(() => {
      findDropdownTrigger(renderer, 'Tracks').props.onClick();
    });
    act(() => {
      findMenuItem(renderer, 'Amplitude plot').props.onClick();
    });

    act(() => {
      findDropdownTrigger(renderer, 'Tracks').props.onClick();
    });
    act(() => {
      findMenuItem(renderer, 'Tracks settings').props.onClick();
    });

    act(() => {
      findDropdownTrigger(renderer, 'Help').props.onClick();
    });
    act(() => {
      findMenuItem(renderer, 'Navigation controls').props.onClick();
    });

    assert.equal(resetCalls, 1);
    assert.equal(exitCalls, 1);
    assert.equal(channelsCalls, 1);
    assert.equal(paintbrushCalls, 1);
    assert.equal(renderSettingsCalls, 1);
    assert.equal(tracksCalls, 1);
    assert.equal(amplitudePlotCalls, 1);
    assert.equal(trackSettingsCalls, 1);
    assert.equal(diagnosticsCalls, 1);
    assert.equal(helpCalls, 1);

    renderer.unmount();
  });
});
