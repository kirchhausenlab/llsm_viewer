import assert from 'node:assert/strict';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

import type { HelpMenuControls } from '../../../src/ui/app/hooks/useHelpMenu.ts';
import { HelpMenu } from '../../../src/components/app/HelpMenu.tsx';

type EventListenerMap = Map<string, Set<EventListener>>;

function createDocumentMock() {
  const listeners: EventListenerMap = new Map();

  return {
    addEventListener: (type: string, listener: EventListener) => {
      const handlers = listeners.get(type) ?? new Set<EventListener>();
      handlers.add(listener);
      listeners.set(type, handlers);
    },
    removeEventListener: (type: string, listener: EventListener) => {
      const handlers = listeners.get(type);
      handlers?.delete(listener);
    },
    dispatchEvent: (event: Event) => {
      listeners.get(event.type)?.forEach((listener) => listener(event));
    }
  };
}

function withDocumentMock(test: (documentMock: ReturnType<typeof createDocumentMock>) => void) {
  const previousDocument = (globalThis as any).document;
  const documentMock = createDocumentMock();
  (globalThis as any).document = documentMock;

  try {
    test(documentMock);
  } finally {
    (globalThis as any).document = previousDocument;
  }
}

function renderHelpMenu() {
  let latestProps: HelpMenuControls | undefined;

  const renderer = TestRenderer.create(
    <HelpMenu isViewerLaunched>
      {(props) => {
        latestProps = props;
        return null;
      }}
    </HelpMenu>
  );

  return { renderer, getProps: () => latestProps! };
}

(() => {
  withDocumentMock(() => {
    const { renderer, getProps } = renderHelpMenu();

    act(() => getProps().onHelpMenuToggle());
    assert.equal(getProps().isHelpMenuOpen, true);

    act(() => getProps().onHelpMenuToggle());
    assert.equal(getProps().isHelpMenuOpen, false);

    renderer.unmount();
  });
})();

(() => {
  withDocumentMock((documentMock) => {
    const { renderer, getProps } = renderHelpMenu();

    act(() => getProps().onHelpMenuToggle());
    assert.equal(getProps().isHelpMenuOpen, true);

    act(() => documentMock.dispatchEvent({ type: 'keydown', key: 'Escape' } as unknown as Event));
    assert.equal(getProps().isHelpMenuOpen, false);

    renderer.unmount();
  });
})();

(() => {
  withDocumentMock((documentMock) => {
    const { renderer, getProps } = renderHelpMenu();
    const insideTarget = {};
    const container = {
      contains: (node: unknown) => node === insideTarget
    } as unknown as HTMLDivElement;

    getProps().helpMenuRef.current = container;

    act(() => getProps().onHelpMenuToggle());
    assert.equal(getProps().isHelpMenuOpen, true);

    act(() => documentMock.dispatchEvent({ type: 'mousedown', target: insideTarget } as unknown as Event));
    assert.equal(getProps().isHelpMenuOpen, true);

    act(() => documentMock.dispatchEvent({ type: 'mousedown', target: {} } as unknown as Event));
    assert.equal(getProps().isHelpMenuOpen, false);

    renderer.unmount();
  });
})();
