import assert from 'node:assert/strict';
import { test } from 'node:test';

import { renderHook } from '../hooks/renderHook.ts';
import { useViewerPropsState } from '../../src/components/viewers/viewer-shell/hooks/useViewerPropsState.ts';

test('viewer props state creates sequential prop names and keeps selection in sync', () => {
  const hook = renderHook(() =>
    useViewerPropsState({
      volumeDimensions: { width: 120, height: 80, depth: 32 },
    })
  );

  hook.act(() => {
    hook.result.createProp();
    hook.result.createProp();
  });

  assert.equal(hook.result.props.length, 2);
  assert.equal(hook.result.props[0].name, 'Prop #1');
  assert.equal(hook.result.props[1].name, 'Prop #2');
  assert.equal(hook.result.props[0].text, 'Add text here');
  assert.equal(hook.result.props[0].screen.x, 0.5);
  assert.equal(hook.result.props[0].screen.y, 0.5);
  assert.equal(hook.result.selectedPropId, hook.result.props[1].id);
  assert.equal(hook.result.props[0].world.flipY, true);

  const firstPropId = hook.result.props[0].id;
  hook.act(() => {
    hook.result.selectProp(firstPropId);
    hook.result.deleteProp(firstPropId);
  });

  assert.equal(hook.result.props.length, 1);
  assert.equal(hook.result.selectedPropId, hook.result.props[0].id);
  hook.unmount();
});

test('viewer props state clamps screen drag positions', () => {
  const hook = renderHook(() =>
    useViewerPropsState({
      volumeDimensions: { width: 64, height: 64, depth: 16 },
    })
  );

  hook.act(() => {
    hook.result.createProp();
  });

  const propId = hook.result.props[0].id;
  hook.act(() => {
    hook.result.updateScreenPosition(propId, { x: -1, y: 2 });
  });

  assert.equal(hook.result.props[0].screen.x, 0);
  assert.equal(hook.result.props[0].screen.y, 1);
  hook.unmount();
});

test('viewer props state supports bulk visibility and clear all', () => {
  const hook = renderHook(() =>
    useViewerPropsState({
      volumeDimensions: { width: 64, height: 64, depth: 16 },
    })
  );

  hook.act(() => {
    hook.result.createProp();
    hook.result.createProp();
    hook.result.setAllVisible(false);
  });

  assert.equal(hook.result.props.every((prop) => prop.visible === false), true);

  hook.act(() => {
    hook.result.clearProps();
  });

  assert.equal(hook.result.props.length, 0);
  assert.equal(hook.result.selectedPropId, null);
  hook.unmount();
});
