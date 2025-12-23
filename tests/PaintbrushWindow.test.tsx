import assert from 'node:assert/strict';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

import PaintbrushWindow from '../src/components/viewers/viewer-shell/PaintbrushWindow.tsx';

console.log('Starting PaintbrushWindow tests');

function withConfirmMock<T>(impl: (message: string) => boolean, test: () => T): T {
  const previous = (globalThis as any).confirm;
  (globalThis as any).confirm = impl;
  try {
    return test();
  } finally {
    (globalThis as any).confirm = previous;
  }
}

(() => {
  let clearCalls = 0;
  let confirmCalls = 0;

  withConfirmMock(() => {
    confirmCalls += 1;
    return false;
  }, () => {
    const renderer = TestRenderer.create(
      <PaintbrushWindow
        initialPosition={{ x: 0, y: 0 }}
        windowMargin={16}
        controlWindowWidth={320}
        resetSignal={0}
        enabled
        overlayVisible
        mode="brush"
        radius={1}
        color="#ff0000"
        labelCount={1}
        canUndo
        canRedo={false}
        onEnabledChange={() => {}}
        onOverlayVisibleChange={() => {}}
        onModeChange={() => {}}
        onRadiusChange={() => {}}
        onColorChange={() => {}}
        onRandomColor={() => {}}
        onUndo={() => {}}
        onRedo={() => {}}
        onClear={() => {
          clearCalls += 1;
        }}
        onSave={() => {}}
        onClose={() => {}}
      />
    );

    const clearButton = renderer.root.findAllByType('button').find((button) => button.props.children === 'Clear');
    assert.ok(clearButton);
    act(() => clearButton.props.onClick());

    renderer.unmount();
  });

  assert.equal(confirmCalls, 1);
  assert.equal(clearCalls, 0);
})();

(() => {
  let clearCalls = 0;
  let confirmCalls = 0;

  withConfirmMock(() => {
    confirmCalls += 1;
    return true;
  }, () => {
    const renderer = TestRenderer.create(
      <PaintbrushWindow
        initialPosition={{ x: 0, y: 0 }}
        windowMargin={16}
        controlWindowWidth={320}
        resetSignal={0}
        enabled
        overlayVisible
        mode="brush"
        radius={1}
        color="#ff0000"
        labelCount={1}
        canUndo
        canRedo={false}
        onEnabledChange={() => {}}
        onOverlayVisibleChange={() => {}}
        onModeChange={() => {}}
        onRadiusChange={() => {}}
        onColorChange={() => {}}
        onRandomColor={() => {}}
        onUndo={() => {}}
        onRedo={() => {}}
        onClear={() => {
          clearCalls += 1;
        }}
        onSave={() => {}}
        onClose={() => {}}
      />
    );

    const clearButton = renderer.root.findAllByType('button').find((button) => button.props.children === 'Clear');
    assert.ok(clearButton);
    act(() => clearButton.props.onClick());

    renderer.unmount();
  });

  assert.equal(confirmCalls, 1);
  assert.equal(clearCalls, 1);
})();

console.log('PaintbrushWindow tests passed');

