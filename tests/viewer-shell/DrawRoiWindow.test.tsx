import assert from 'node:assert/strict';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

import DrawRoiWindow from '../../src/components/viewers/viewer-shell/DrawRoiWindow.tsx';
import type { RoiDefinition } from '../../src/types/roi.ts';

console.log('Starting DrawRoiWindow tests');

function createWorkingRoi(overrides: Partial<RoiDefinition> = {}): RoiDefinition {
  return {
    shape: 'line',
    mode: '3d',
    start: { x: 2, y: 4, z: 6 },
    end: { x: 8, y: 10, z: 12 },
    color: '#FACC15',
    ...overrides,
  };
}

function createProps(overrides: Partial<React.ComponentProps<typeof DrawRoiWindow>> = {}) {
  return {
    initialPosition: { x: 0, y: 0 },
    windowMargin: 16,
    controlWindowWidth: 320,
    resetSignal: 0,
    volumeDimensions: {
      width: 40,
      height: 50,
      depth: 60,
    },
    tool: 'line' as const,
    dimensionMode: '3d' as const,
    currentRoiName: 'Unsaved ROI',
    currentColor: '#FACC15',
    workingRoi: createWorkingRoi(),
    onToolChange: () => {},
    onDimensionModeChange: () => {},
    onColorChange: () => {},
    onUpdateWorkingRoi: () => {},
    onClose: () => {},
    ...overrides,
  };
}

function findNodeByClassName(renderer: TestRenderer.ReactTestRenderer, className: string) {
  return renderer.root.findAll((node) => node.props.className === className)[0] ?? null;
}

(() => {
  const renderer = TestRenderer.create(
    <DrawRoiWindow {...createProps()} />,
  );

  const toolbar = findNodeByClassName(renderer, 'control-row draw-roi-toolbar');
  assert.ok(toolbar);
  assert.equal(
    toolbar.findAll((node) => node.props.className?.includes?.('draw-roi-segmented-control')).length,
    2,
  );
  const nameRow = findNodeByClassName(renderer, 'draw-roi-name-row');
  assert.ok(nameRow);
  assert.equal(nameRow.children[1]?.children.join(''), 'Unsaved ROI');

  const toolButtons = renderer.root.findAll(
    (node) => node.type === 'button' && node.props.className?.includes?.('draw-roi-tool-button'),
  );
  assert.deepEqual(toolButtons.map((button) => button.props.title), ['Line', 'Rectangle', 'Ellipse']);

  const sliderRows = renderer.root.findAll((node) => node.props.className === 'control-row draw-roi-slider-row');
  assert.equal(sliderRows.length, 3);
  sliderRows.forEach((row) => {
    const sliderGroups = row.findAll(
      (node) => node.props.className === 'control-group control-group--slider draw-roi-slider-group',
    );
    assert.equal(sliderGroups.length, 2);
  });

  assert.equal(findNodeByClassName(renderer, 'draw-roi-current-label'), null);
  assert.equal(
    renderer.root.findAll((node) => Array.isArray(node.children) && node.children.join('') === 'Picker').length,
    0,
  );

  const colorPickerTrigger = findNodeByClassName(renderer, 'color-picker-trigger draw-roi-color-picker');
  assert.ok(colorPickerTrigger);
  assert.ok(colorPickerTrigger.findByProps({ className: 'color-picker-indicator' }));

  renderer.unmount();
})();

(() => {
  const workingRoi = createWorkingRoi({
    mode: '2d',
    start: { x: 1, y: 2, z: 3 },
    end: { x: 4, y: 5, z: 3 },
  });
  let updatedRoi: RoiDefinition | null = null;

  const renderer = TestRenderer.create(
    <DrawRoiWindow
      {...createProps({
        dimensionMode: '2d',
        workingRoi,
        onUpdateWorkingRoi: (updater) => {
          updatedRoi = updater(workingRoi);
        },
      })}
    />,
  );

  const startZSlider = renderer.root.findByProps({ id: 'draw-roi-start-z-slider' });
  const endZSlider = renderer.root.findByProps({ id: 'draw-roi-end-z-slider' });

  assert.equal(endZSlider.props.disabled, true);

  act(() => {
    startZSlider.props.onChange({ target: { value: '9' } });
  });

  assert.ok(updatedRoi);
  assert.equal(updatedRoi.start.z, 9);
  assert.equal(updatedRoi.end.z, 9);

  renderer.unmount();
})();

console.log('DrawRoiWindow tests passed');
