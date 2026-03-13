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

function hasClassName(node: ReactTestInstance, className: string): boolean {
  return typeof node.props.className === 'string' && node.props.className.includes(className);
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
    onOpenPropsWindow: () => {},
    onOpenPaintbrush: () => {},
    onOpenRecordWindow: () => {},
    onOpenRenderSettingsWindow: () => {},
    onOpenTracksWindow: () => {},
    onOpenAmplitudePlotWindow: () => {},
    onOpenPlotSettingsWindow: () => {},
    onOpenTrackSettingsWindow: () => {},
    onOpenDiagnosticsWindow: () => {},
    is3dModeAvailable: false,
    resetViewHandler: null,
    onVrButtonClick: () => {},
    vrButtonDisabled: true,
    vrButtonLabel: 'Enter VR',
    volumeTimepointCount: 1,
    isPlaying: false,
    isPerformanceMode: false,
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
    segmentationChannelIds: new Set(),
    activeChannelId: null,
    onChannelTabSelect: () => {},
    onChannelVisibilityToggle: () => {},
    trackSets: [],
    trackHeadersByTrackSet: new Map(),
    activeTrackSetId: null,
    trackColorModesByTrackSet: {},
    trackVisibilitySummaryByTrackSet: new Map(),
    onTrackSetTabSelect: () => {},
    onTrackVisibilityAllChange: () => {},
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
      ['Tracks', ['Tracks window', 'Amplitude plot', 'Plot settings', 'Tracks settings']],
      ['Help', ['About', 'Controls']]
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

test('top menu renders the initial loading warning when provided', () => {
  withEnvironmentMocks(() => {
    const renderer = renderTopMenu({
      currentScaleLabel: 'L2 (4x)',
      initialScaleWarningMessage: 'temporary scale'
    });

    const menuRow = renderer.root.findAll(
      (node) => node.type === 'div' && hasClassName(node, 'viewer-top-menu-row')
    )[0];
    const warningAnchor = renderer.root.findAll(
      (node) => node.type === 'div' && hasClassName(node, 'viewer-top-menu-floating-warning')
    )[0];
    const warning = renderer.root.findAll(
      (node) =>
        typeof node.props.className === 'string' &&
        node.props.className.includes('viewer-top-menu-warning')
    )[0];

    assert.ok(warningAnchor);
    assert.ok(warning);
    assert.equal(
      menuRow.findAll(
        (node) => typeof node.props.className === 'string' && node.props.className.includes('viewer-top-menu-warning')
      ).length,
      0
    );
    assert.match(extractText(warning), /Initial loadingtemporary scale/);
    assert.strictEqual(warning.props.title, 'Viewer opened at a temporary coarse scale and will sharpen automatically.');

    renderer.unmount();
  });
});

test('wired dropdown items invoke the expected handlers', () => {
  withEnvironmentMocks(() => {
    let exitCalls = 0;
    let resetCalls = 0;
    let channelsCalls = 0;
    let propsCalls = 0;
    let paintbrushCalls = 0;
    let recordCalls = 0;
    let renderSettingsCalls = 0;
    let tracksCalls = 0;
    let amplitudePlotCalls = 0;
    let plotSettingsCalls = 0;
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
      onOpenPropsWindow: () => {
        propsCalls += 1;
      },
      onOpenPaintbrush: () => {
        paintbrushCalls += 1;
      },
      onOpenRecordWindow: () => {
        recordCalls += 1;
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
      onOpenPlotSettingsWindow: () => {
        plotSettingsCalls += 1;
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
      findDropdownTrigger(renderer, 'View').props.onClick();
    });
    act(() => {
      findMenuItem(renderer, 'Record').props.onClick();
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
      findMenuItem(renderer, 'Props').props.onClick();
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
      findDropdownTrigger(renderer, 'Tracks').props.onClick();
    });
    act(() => {
      findMenuItem(renderer, 'Plot settings').props.onClick();
    });

    act(() => {
      findDropdownTrigger(renderer, 'Help').props.onClick();
    });
    act(() => {
      findMenuItem(renderer, 'Controls').props.onClick();
    });

    assert.equal(resetCalls, 1);
    assert.equal(exitCalls, 1);
    assert.equal(channelsCalls, 1);
    assert.equal(propsCalls, 1);
    assert.equal(paintbrushCalls, 1);
    assert.equal(recordCalls, 1);
    assert.equal(renderSettingsCalls, 1);
    assert.equal(tracksCalls, 1);
    assert.equal(amplitudePlotCalls, 1);
    assert.equal(plotSettingsCalls, 1);
    assert.equal(trackSettingsCalls, 1);
    assert.equal(diagnosticsCalls, 1);
    assert.equal(helpCalls, 1);

    renderer.unmount();
  });
});

test('top menu does not close the controls window when another menu opens', () => {
  withEnvironmentMocks(() => {
    let closeHelpCalls = 0;
    let renderer!: TestRenderer.ReactTestRenderer;

    act(() => {
      renderer = renderTopMenu({
        isHelpMenuOpen: true,
        closeHelpMenu: () => {
          closeHelpCalls += 1;
        }
      });
    });

    act(() => {
      findDropdownTrigger(renderer, 'View').props.onClick();
    });

    const renderedItems = renderer.root
      .findAll((node) => node.type === 'button' && node.props.role === 'menuitem')
      .map((node) => extractText(node));

    assert.deepEqual(renderedItems, [
      'Channels window',
      'Camera',
      'Record',
      'Background',
      'Render settings',
      'Hover settings'
    ]);
    assert.equal(closeHelpCalls, 0);

    renderer.unmount();
  });
});

test('top menu renders and switches track tabs', () => {
  withEnvironmentMocks(() => {
    const selectedTrackSetIds: string[] = [];
    const renderer = renderTopMenu({
      trackSets: [
        { id: 'set-a', name: 'Tracks A' },
        { id: 'set-b', name: 'Tracks B' }
      ],
      trackHeadersByTrackSet: new Map([
        ['set-a', { totalTracks: 12 }],
        ['set-b', { totalTracks: 8 }]
      ]),
      activeTrackSetId: 'set-a',
      onTrackSetTabSelect: (trackSetId) => {
        selectedTrackSetIds.push(trackSetId);
      }
    });

    const trackTab = renderer.root.findAll(
      (node) =>
        node.type === 'button' &&
        node.props.role === 'tab' &&
        node.props.id === 'top-menu-track-tab-set-b'
    )[0];

    assert.ok(trackTab);

    act(() => {
      trackTab.props.onClick({ button: 0 });
    });

    assert.deepEqual(selectedTrackSetIds, ['set-b']);

    renderer.unmount();
  });
});

test('top menu track tabs support middle-click visibility toggles', () => {
  withEnvironmentMocks(() => {
    const visibilityCalls: Array<{ trackSetId: string; visible: boolean }> = [];
    const renderer = renderTopMenu({
      trackSets: [{ id: 'set-a', name: 'Tracks A' }],
      trackHeadersByTrackSet: new Map([['set-a', { totalTracks: 12 }]]),
      activeTrackSetId: 'set-a',
      trackVisibilitySummaryByTrackSet: new Map([['set-a', { total: 12, visible: 5 }]]),
      onTrackVisibilityAllChange: (trackSetId, visible) => {
        visibilityCalls.push({ trackSetId, visible });
      }
    });

    const trackTab = renderer.root.findByProps({ id: 'top-menu-track-tab-set-a' });
    let prevented = false;
    let stopped = false;

    act(() => {
      trackTab.props.onAuxClick({
        button: 1,
        preventDefault() {
          prevented = true;
        },
        stopPropagation() {
          stopped = true;
        }
      });
    });

    assert.equal(prevented, true);
    assert.equal(stopped, true);
    assert.deepEqual(visibilityCalls, [{ trackSetId: 'set-a', visible: false }]);

    renderer.unmount();
  });
});

test('top menu keeps playback and Z controls in the top-row second column', () => {
  withEnvironmentMocks(() => {
    const renderer = renderTopMenu({
      volumeTimepointCount: 5,
      playbackDisabled: false,
      zSliderMax: 8,
      onZSliderChange: () => {}
    });

    const topSecondColumn = renderer.root.findAll(
      (node) =>
        node.type === 'div' &&
        hasClassName(node, 'viewer-top-menu-cell--top') &&
        hasClassName(node, 'viewer-top-menu-cell--column-2')
    )[0];
    const topFourthColumn = renderer.root.findAll(
      (node) =>
        node.type === 'div' &&
        hasClassName(node, 'viewer-top-menu-cell--top') &&
        hasClassName(node, 'viewer-top-menu-cell--column-4')
    )[0];
    const bottomSecondColumn = renderer.root.findAll(
      (node) =>
        node.type === 'div' &&
        hasClassName(node, 'viewer-top-menu-cell--bottom') &&
        hasClassName(node, 'viewer-top-menu-cell--column-2')
    )[0];

    assert.ok(topSecondColumn.findByProps({ id: 'top-menu-playback-slider' }));
    assert.ok(topSecondColumn.findByProps({ id: 'top-menu-z-slider' }));
    assert.equal(topFourthColumn.findAllByProps({ id: 'top-menu-playback-slider' }).length, 0);
    assert.equal(topFourthColumn.findAllByProps({ id: 'top-menu-z-slider' }).length, 0);
    assert.equal(bottomSecondColumn.findAllByProps({ id: 'top-menu-playback-slider' }).length, 0);
    assert.equal(bottomSecondColumn.findAllByProps({ id: 'top-menu-z-slider' }).length, 0);

    renderer.unmount();
  });
});

test('top menu places scale, hover, and follow status in their updated columns', () => {
  withEnvironmentMocks(() => {
    const renderer = renderTopMenu({
      currentScaleLabel: '1.25x',
      isPerformanceMode: true,
      followedTrackSetId: 'set-a',
      followedTrackId: 'track-1',
      hoveredVoxel: {
        coordinates: { x: '1', y: '2', z: '3' },
        intensity: '7',
        components: [{ text: '7', channelLabel: null, color: null }]
      }
    });

    const topThirdColumn = renderer.root.findAll(
      (node) =>
        node.type === 'div' &&
        hasClassName(node, 'viewer-top-menu-cell--top') &&
        hasClassName(node, 'viewer-top-menu-cell--column-3')
    )[0];
    const bottomThirdColumn = renderer.root.findAll(
      (node) =>
        node.type === 'div' &&
        hasClassName(node, 'viewer-top-menu-cell--bottom') &&
        hasClassName(node, 'viewer-top-menu-cell--column-3')
    )[0];
    const bottomFourthColumn = renderer.root.findAll(
      (node) =>
        node.type === 'div' &&
        hasClassName(node, 'viewer-top-menu-cell--bottom') &&
        hasClassName(node, 'viewer-top-menu-cell--column-4')
    )[0];

    assert.ok(
      topThirdColumn.findAll((node) => hasClassName(node, 'viewer-top-menu-scale')).length > 0
    );
    assert.equal(
      topThirdColumn.findAll(
        (node) =>
          node.type === 'div' &&
          hasClassName(node, 'viewer-top-menu-warning--performance') &&
          extractText(node).includes('Performance Mode')
      ).length,
      1
    );
    assert.ok(
      bottomThirdColumn.findAll((node) => hasClassName(node, 'viewer-top-menu-intensity')).length > 0
    );
    assert.ok(
      bottomThirdColumn.findAll((node) => hasClassName(node, 'viewer-top-menu-hover-column')).length > 0
    );
    assert.equal(
      bottomFourthColumn.findAll((node) => node.type === 'button' && extractText(node) === 'Stop following').length,
      1
    );
    assert.equal(
      bottomFourthColumn.findAll((node) => hasClassName(node, 'viewer-top-menu-intensity')).length,
      0
    );

    renderer.unmount();
  });
});

test('top menu keeps all three shared column dividers even when track tabs are absent', () => {
  withEnvironmentMocks(() => {
    const renderer = renderTopMenu({
      loadedChannelIds: ['channel-a'],
      channelNameMap: new Map([['channel-a', 'Channel A']]),
      channelVisibility: { 'channel-a': true },
      channelTintMap: new Map([['channel-a', '#ffffff']])
    });

    const bottomFirstColumn = renderer.root.findAll(
      (node) =>
        node.type === 'div' &&
        hasClassName(node, 'viewer-top-menu-cell--bottom') &&
        hasClassName(node, 'viewer-top-menu-cell--column-1')
    )[0];
    const bottomSecondColumn = renderer.root.findAll(
      (node) =>
        node.type === 'div' &&
        hasClassName(node, 'viewer-top-menu-cell--bottom') &&
        hasClassName(node, 'viewer-top-menu-cell--column-2')
    )[0];
    const columnDividers = renderer.root.findAll(
      (node) => node.type === 'span' && hasClassName(node, 'viewer-top-menu-column-divider')
    );

    assert.ok(bottomFirstColumn.findByProps({ id: 'channel-tab-channel-a' }));
    assert.equal(bottomSecondColumn.findAll((node) => node.props.role === 'tab').length, 0);
    assert.equal(columnDividers.length, 3);

    renderer.unmount();
  });
});
