import assert from 'node:assert/strict';
import { test } from 'node:test';

import { renderHook } from '../hooks/renderHook.ts';
import { useViewerPropsState } from '../../src/components/viewers/viewer-shell/hooks/useViewerPropsState.ts';

test('viewer props state creates sequential prop names and keeps selection in sync', () => {
  const hook = renderHook(() =>
    useViewerPropsState({
      volumeDimensions: { width: 120, height: 80, depth: 32 },
      totalTimepoints: 7,
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
  assert.equal(hook.result.props[0].timestampUnits, 'index');
  assert.equal(hook.result.props[0].scalebar.axis, 'x');
  assert.equal(hook.result.props[0].scalebar.length, 10);
  assert.equal(hook.result.props[0].scalebar.unit, 'μm');
  assert.equal(hook.result.props[0].scalebar.showText, true);
  assert.equal(hook.result.props[0].initialTimepoint, 1);
  assert.equal(hook.result.props[0].finalTimepoint, 7);
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

test('viewer props state seeds scalebar defaults from voxel resolution metadata', () => {
  const hook = renderHook(() =>
    useViewerPropsState({
      volumeDimensions: { width: 120, height: 80, depth: 32 },
      totalTimepoints: 7,
      voxelResolution: { x: 10, y: 12, z: 20, unit: 'nm', correctAnisotropy: false },
    })
  );

  hook.act(() => {
    hook.result.createProp();
  });

  assert.equal(hook.result.props[0].scalebar.length, 150);
  assert.equal(hook.result.props[0].scalebar.unit, 'nm');
  hook.unmount();
});

test('viewer props state clamps screen drag positions', () => {
  const hook = renderHook(() =>
    useViewerPropsState({
      volumeDimensions: { width: 64, height: 64, depth: 16 },
      totalTimepoints: 5,
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
      totalTimepoints: 4,
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

  hook.act(() => {
    hook.result.createProp();
  });

  assert.equal(hook.result.props.length, 1);
  assert.equal(hook.result.props[0].id, 'viewer-prop-1');
  assert.equal(hook.result.props[0].name, 'Prop #1');
  hook.unmount();
});
