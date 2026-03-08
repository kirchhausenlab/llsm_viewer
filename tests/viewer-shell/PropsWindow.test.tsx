import assert from 'node:assert/strict';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

import PropsWindow from '../../src/components/viewers/viewer-shell/PropsWindow.tsx';
import type { ViewerProp } from '../../src/types/viewerProps.ts';

function withConfirmMock<T>(impl: (message: string) => boolean, test: () => T): T {
  const previous = (globalThis as typeof globalThis & { confirm?: typeof globalThis.confirm }).confirm;
  (globalThis as typeof globalThis & { confirm?: typeof globalThis.confirm }).confirm = impl;
  try {
    return test();
  } finally {
    (globalThis as typeof globalThis & { confirm?: typeof globalThis.confirm }).confirm = previous;
  }
}

function createProp(): ViewerProp {
  return {
    id: 'viewer-prop-1',
    name: 'Prop #1',
    type: 'text',
    dimension: '2d',
    visible: true,
    color: '#ffffff',
    text: 'Prop #1',
    screen: {
      x: 0.2,
      y: 0.3,
      rotation: 0,
      fontSize: 30,
      flipX: false,
      flipY: false,
    },
    world: {
      x: 10,
      y: 12,
      z: 14,
      roll: 0,
      pitch: 0,
      yaw: 0,
      fontSize: 6,
      flipX: false,
      flipY: true,
      flipZ: false,
      facingMode: 'fixed',
      occlusionMode: 'occluded',
      unitMode: 'voxel',
    },
  };
}

(() => {
  const closedRenderer = TestRenderer.create(
    <PropsWindow
      layout={{
        windowMargin: 16,
        propsWindowInitialPosition: { x: 10, y: 10 },
        resetToken: 0,
      }}
      isOpen={false}
      onClose={() => {}}
      props={[]}
      selectedPropId={null}
      volumeDimensions={{ width: 100, height: 80, depth: 40 }}
      onCreateProp={() => {}}
      onSelectProp={() => {}}
      onUpdateProp={() => {}}
      onSetAllVisible={() => {}}
      onClearProps={() => {}}
      onDeleteProp={() => {}}
    />
  );
  assert.equal(closedRenderer.toJSON(), null);
  closedRenderer.unmount();
})();

(() => {
  let deleteCalls = 0;
  let confirmCalls = 0;

  withConfirmMock(() => {
    confirmCalls += 1;
    return true;
  }, () => {
    const prop = createProp();
    const renderer = TestRenderer.create(
      <PropsWindow
        layout={{
          windowMargin: 16,
          propsWindowInitialPosition: { x: 10, y: 10 },
          resetToken: 0,
        }}
        isOpen
        onClose={() => {}}
        props={[prop]}
        selectedPropId={prop.id}
        volumeDimensions={{ width: 100, height: 80, depth: 40 }}
        onCreateProp={() => {}}
        onSelectProp={() => {}}
        onUpdateProp={() => {}}
        onSetAllVisible={() => {}}
        onClearProps={() => {}}
        onDeleteProp={() => {
          deleteCalls += 1;
        }}
      />
    );

    const deleteButton = renderer.root.findAllByType('button').find((button) => button.props.children === 'Delete prop');
    assert.ok(deleteButton);
    act(() => deleteButton.props.onClick());
    renderer.unmount();
  });

  assert.equal(confirmCalls, 1);
  assert.equal(deleteCalls, 1);
})();
