import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

export function renderHook<T>(hook: () => T) {
  let result: T;

  function TestComponent() {
    result = hook();
    return null;
  }

  let renderer: TestRenderer.ReactTestRenderer;

  act(() => {
    renderer = TestRenderer.create(React.createElement(TestComponent));
  });

  return {
    get result() {
      return result;
    },
    rerender() {
      act(() => {
        renderer.update(React.createElement(TestComponent));
      });
    },
    unmount() {
      renderer.unmount();
    },
    act
  };
}
