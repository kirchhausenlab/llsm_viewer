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
    dimensionMode: '3d' as const,
    currentRoiName: 'Unsaved ROI',
    currentColor: '#FACC15',
    currentAlignment: 'axes' as const,
    glassAlignmentEnabled: true,
    workingRoi: createWorkingRoi(),
    onColorChange: () => {},
    onAlignmentChange: () => {},
    onUpdateWorkingRoi: () => {},
    onClose: () => {},
    ...overrides,
  };
}

function findNodeByClassName(renderer: TestRenderer.ReactTestRenderer, className: string) {
  return renderer.root.findAll((node) => {
    const nodeClassName = node.props.className;
    return typeof nodeClassName === 'string' && nodeClassName.split(/\s+/).includes(className);
  })[0] ?? null;
}

(() => {
  const renderer = TestRenderer.create(
    <DrawRoiWindow {...createProps()} />,
  );

  assert.equal(
    renderer.root.findAll((node) => (
      typeof node.type === 'string' &&
      node.props.className?.includes?.('draw-roi-segmented-control')
    )).length,
    0,
  );
  const nameRow = findNodeByClassName(renderer, 'draw-roi-name-row');
  assert.ok(nameRow);
  const nameRowSpans = nameRow?.findAllByType('span') ?? [];
  const nameRowButtons = nameRow?.findAllByType('button') ?? [];
  assert.equal(nameRowSpans[0]?.children.join(''), 'Unsaved ROI');
  assert.equal(nameRowButtons.length, 0);

  const toolButtons = renderer.root.findAll(
    (node) => node.type === 'button' && node.props.className?.includes?.('draw-roi-tool-button'),
  );
  assert.equal(toolButtons.length, 0);

  const sliderRows = renderer.root.findAll((node) => {
    const className = node.props.className;
    return (
      typeof node.type === 'string' &&
      typeof className === 'string' &&
      className.split(/\s+/).includes('draw-roi-slider-row')
    );
  });
  assert.equal(sliderRows.length, 3);
  sliderRows.forEach((row) => {
    const sliders = row.findAll(
      (node) => node.type === 'input' && node.props.type === 'range',
    );
    assert.equal(sliders.length, 2);
  });

  const colorPickerTrigger = findNodeByClassName(renderer, 'draw-roi-color-picker');
  assert.ok(colorPickerTrigger);
  assert.ok(colorPickerTrigger.findByProps({ className: 'color-picker-indicator' }));

  const alignmentRow = findNodeByClassName(renderer, 'draw-roi-alignment-row');
  assert.ok(alignmentRow);
  assert.equal(alignmentRow.findAllByType('span')[0]?.children.join(''), 'Alignment:');
  assert.equal(alignmentRow.findByProps({ 'aria-label': 'Glass' }).props.disabled, false);

  renderer.unmount();
})();

(() => {
  const renderer = TestRenderer.create(
    <DrawRoiWindow
      {...createProps({
        dimensionMode: '2d',
        currentRoiName: 'No ROI',
        workingRoi: null,
      })}
    />,
  );

  assert.equal(renderer.root.findAllByProps({ id: 'draw-roi-start-z-slider' }).length, 0);
  assert.equal(renderer.root.findAllByProps({ id: 'draw-roi-current-z-toggle' }).length, 0);

  const sliderRows = renderer.root.findAll((node) => {
    const className = node.props.className;
    return (
      typeof node.type === 'string' &&
      typeof className === 'string' &&
      className.split(/\s+/).includes('draw-roi-slider-row')
    );
  });
  assert.equal(sliderRows.length, 2);
  for (const slider of renderer.root.findAll((node) => node.type === 'input' && node.props.type === 'range')) {
    assert.equal(slider.props.disabled, true);
  }

  renderer.unmount();
})();

(() => {
  let nextAlignment: string | null = null;
  const renderer = TestRenderer.create(
    <DrawRoiWindow
      {...createProps({
        currentAlignment: 'glass',
        glassAlignmentEnabled: false,
        workingRoi: createWorkingRoi({ alignment: 'glass' }),
        onAlignmentChange: (alignment) => {
          nextAlignment = alignment;
        },
      })}
    />,
  );

  const glassButton = renderer.root.findByProps({ 'aria-label': 'Glass' });
  assert.equal(glassButton.props.disabled, true);
  act(() => {
    glassButton.props.onClick();
  });
  assert.equal(nextAlignment, null);

  const axesButton = renderer.root.findByProps({ 'aria-label': 'Axes' });
  act(() => {
    axesButton.props.onClick();
  });
  assert.equal(nextAlignment, 'axes');

  renderer.unmount();
})();

(() => {
  const renderer = TestRenderer.create(
    <DrawRoiWindow
      {...createProps({
        currentAlignment: 'glass',
        workingRoi: createWorkingRoi(),
      })}
    />,
  );

  assert.equal(renderer.root.findByProps({ 'aria-label': 'Axes' }).props['aria-pressed'], true);
  assert.equal(renderer.root.findByProps({ 'aria-label': 'Glass' }).props['aria-pressed'], false);

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

  assert.equal(renderer.root.findAllByProps({ id: 'draw-roi-start-z-slider' }).length, 0);
  assert.equal(renderer.root.findAllByProps({ id: 'draw-roi-current-z-toggle' }).length, 0);
  const xStartSlider = renderer.root.findByProps({ id: 'draw-roi-start-x-slider' });
  assert.equal(xStartSlider.props.disabled, false);
  assert.equal(xStartSlider.props.value, 2);

  act(() => {
    xStartSlider.props.onChange({ target: { value: '10' } });
  });

  assert.ok(updatedRoi);
  assert.equal(updatedRoi.start.x, 9);
  assert.equal(updatedRoi.start.z, 3);
  assert.equal(updatedRoi.end.z, 3);

  renderer.unmount();
})();

console.log('DrawRoiWindow tests passed');
