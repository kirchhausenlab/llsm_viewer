import assert from 'node:assert/strict';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

import PropsWindow from '../../src/components/viewers/viewer-shell/PropsWindow.tsx';
import { buildDefaultViewerPropWorldState } from '../../src/components/viewers/viewer-shell/viewerPropDefaults.ts';
import type { ViewerProp } from '../../src/types/viewerProps.ts';

const TOTAL_TIMEPOINTS = 8;
const VOXEL_RESOLUTION = { x: 2, y: 2, z: 4, unit: 'μm' } as const;

function withConfirmMock<T>(impl: (message: string) => boolean, test: () => T): T {
  const previous = (globalThis as typeof globalThis & { confirm?: typeof globalThis.confirm }).confirm;
  (globalThis as typeof globalThis & { confirm?: typeof globalThis.confirm }).confirm = impl;
  try {
    return test();
  } finally {
    (globalThis as typeof globalThis & { confirm?: typeof globalThis.confirm }).confirm = previous;
  }
}

function findByClassToken(renderer: TestRenderer.ReactTestRenderer, classToken: string) {
  return renderer.root.findAll((node) => {
    const className = node.props.className;
    return typeof className === 'string' && className.split(/\s+/).includes(classToken);
  })[0] ?? null;
}

function hasClassToken(node: TestRenderer.ReactTestInstance, classToken: string) {
  const className = node.props.className;
  return typeof className === 'string' && className.split(/\s+/).includes(classToken);
}

function createProp(): ViewerProp {
  return {
    id: 'viewer-prop-1',
    name: 'Prop #1',
    type: 'text',
    typeface: 'Inter',
    dimension: '2d',
    visible: true,
    color: '#ffffff',
    bold: false,
    italic: false,
    underline: false,
    text: 'Prop #1',
    timestampUnits: 'index',
    initialTimepoint: 1,
    finalTimepoint: TOTAL_TIMEPOINTS,
    scalebar: {
      axis: 'x',
      length: 10,
      unit: 'μm',
      showText: true,
      textPlacement: 'below',
    },
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
      currentTimepoint={1}
      totalTimepoints={TOTAL_TIMEPOINTS}
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
        currentTimepoint={1}
        totalTimepoints={TOTAL_TIMEPOINTS}
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

    const deleteButton = renderer.root.findAllByType('button').find((button) => button.props.children === 'Delete');
    assert.ok(deleteButton);
    act(() => deleteButton.props.onClick());
    renderer.unmount();
  });

  assert.equal(confirmCalls, 1);
  assert.equal(deleteCalls, 1);
})();

(() => {
  const prop = createProp();
  let updatedProp: ViewerProp | null = null;

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
      currentTimepoint={1}
      totalTimepoints={TOTAL_TIMEPOINTS}
      onCreateProp={() => {}}
      onSelectProp={() => {}}
      onUpdateProp={(_propId, updater) => {
        updatedProp = updater({
          ...prop,
          screen: {
            ...prop.screen,
            x: 0.1,
            y: 0.9,
            rotation: 45,
            flipX: true,
            flipY: true,
          },
        });
      }}
      onSetAllVisible={() => {}}
      onClearProps={() => {}}
      onDeleteProp={() => {}}
    />
  );

  const buttons = renderer.root.findAllByType('button');
  const actionRow = findByClassToken(renderer, 'props-window-action-row');
  const selectRow = findByClassToken(renderer, 'props-window-select-row');
  const newPropButton = buttons.find((button) => button.props.children === 'New prop');
  assert.equal(newPropButton, undefined);
  const addNewPropButton = buttons.find((button) => button.props.children === 'Add new prop');
  assert.ok(addNewPropButton);
  assert.equal(buttons.some((button) => button.props.children === 'Add prop'), false);
  assert.equal(buttons.some((button) => button.props.children === 'On-screen'), true);
  assert.ok(actionRow?.findAll((node) => node.type === 'button' && node.props.children === 'Add new prop').length);
  assert.ok(selectRow?.findAll((node) => hasClassToken(node, 'props-window-select')).length);
  assert.ok(selectRow?.findAll((node) => node.type === 'select' && node.props.id === 'props-selected-prop').length);
  assert.ok(selectRow?.findAll((node) => node.type === 'button' && node.props.children === 'Delete').length);
  assert.ok(selectRow?.findAll((node) => node.type === 'button' && node.props.children === 'Hide').length);

  const spans = renderer.root.findAllByType('span');
  assert.equal(spans.some((span) => span.props.children === 'Size:'), true);
  assert.equal(spans.some((span) => span.props.children === 'Text size:'), false);
  assert.equal(spans.some((span) => span.props.children === 'Color:'), true);
  assert.equal(spans.some((span) => span.props.children === 'Start/end times:'), true);
  assert.equal(spans.some((span) => span.props.children === 'Initial time:'), false);
  assert.equal(spans.some((span) => span.props.children === 'Final time:'), false);
  assert.equal(spans.some((span) => span.props.children === 'Font:'), true);

  const doubleSliderGrid = renderer.root.findByProps({
    className: 'props-slider-grid props-slider-grid--double',
  });
  assert.equal(doubleSliderGrid.children[3].findByType('button').props.children, 'Reset');

  const whiteSwatch = buttons.find((button) => button.props['aria-label'] === 'White prop color');
  const blackSwatch = buttons.find((button) => button.props['aria-label'] === 'Black prop color');
  const yellowSwatch = buttons.find((button) => button.props['aria-label'] === 'Yellow prop color');
  assert.ok(whiteSwatch);
  assert.ok(blackSwatch);
  assert.ok(yellowSwatch);

  const initialTimeInput = renderer.root.findByProps({ id: 'props-initial-timepoint-input' });
  const finalTimeInput = renderer.root.findByProps({ id: 'props-final-timepoint-input' });
  assert.equal(initialTimeInput.props.min, 1);
  assert.equal(initialTimeInput.props.max, TOTAL_TIMEPOINTS);
  assert.equal(finalTimeInput.props.min, 1);
  assert.equal(finalTimeInput.props.max, TOTAL_TIMEPOINTS);

  const resetButton = buttons.find((button) => button.props.children === 'Reset');
  assert.ok(resetButton);
  act(() => resetButton.props.onClick());

  assert.ok(updatedProp);
  const nextProp = updatedProp;
  assert.equal(nextProp.screen.x, 0.5);
  assert.equal(nextProp.screen.y, 0.5);
  assert.equal(nextProp.screen.rotation, 0);
  assert.equal(nextProp.screen.flipX, false);
  assert.equal(nextProp.screen.flipY, false);
  renderer.unmount();
})();

(() => {
  const baseProp = createProp();
  const prop: ViewerProp = {
    ...baseProp,
    id: 'viewer-prop-2',
    dimension: '3d',
    world: {
      ...baseProp.world,
      x: 1,
      y: 2,
      z: 3,
      roll: 10,
      pitch: 20,
      yaw: 30,
      flipX: true,
      flipY: false,
      flipZ: true,
    },
  };
  let updatedProp: ViewerProp | null = null;
  const volumeDimensions = { width: 100, height: 80, depth: 40 };

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
      volumeDimensions={volumeDimensions}
      currentTimepoint={1}
      totalTimepoints={TOTAL_TIMEPOINTS}
      onCreateProp={() => {}}
      onSelectProp={() => {}}
      onUpdateProp={(_propId, updater) => {
        updatedProp = updater(prop);
      }}
      onSetAllVisible={() => {}}
      onClearProps={() => {}}
      onDeleteProp={() => {}}
    />
  );

  const buttons = renderer.root.findAllByType('button');
  assert.equal(buttons.some((button) => button.props.children === 'On-world'), true);
  assert.equal(buttons.some((button) => button.props.children === 'World-facing'), true);
  const flipRow = findByClassToken(renderer, 'props-flip-row');
  assert.ok(flipRow?.findAll((node) => node.type === 'button' && node.props.children === 'Reset').length);

  const resetButton = buttons.find((button) => button.props.children === 'Reset');
  assert.ok(resetButton);
  act(() => resetButton.props.onClick());

  const expectedWorld = buildDefaultViewerPropWorldState(1, volumeDimensions);
  assert.ok(updatedProp);
  const nextProp = updatedProp;
  assert.equal(nextProp.world.x, expectedWorld.x);
  assert.equal(nextProp.world.y, expectedWorld.y);
  assert.equal(nextProp.world.z, expectedWorld.z);
  assert.equal(nextProp.world.roll, 0);
  assert.equal(nextProp.world.pitch, 0);
  assert.equal(nextProp.world.yaw, 0);
  assert.equal(nextProp.world.flipX, false);
  assert.equal(nextProp.world.flipY, true);
  assert.equal(nextProp.world.flipZ, false);
  renderer.unmount();
})();

(() => {
  const prop: ViewerProp = {
    ...createProp(),
    screen: {
      ...createProp().screen,
      fontSize: 48,
    },
    world: {
      ...createProp().world,
      fontSize: 30,
    },
  };
  let updatedProp: ViewerProp | null = null;
  let currentProp = prop;

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
      currentTimepoint={1}
      totalTimepoints={TOTAL_TIMEPOINTS}
      onCreateProp={() => {}}
      onSelectProp={() => {}}
      onUpdateProp={(_propId, updater) => {
        currentProp = updater(currentProp);
        updatedProp = currentProp;
      }}
      onSetAllVisible={() => {}}
      onClearProps={() => {}}
      onDeleteProp={() => {}}
    />
  );

  const typefaceSelect = renderer.root.findByProps({ id: 'props-typeface-select' });
  assert.deepEqual(
    typefaceSelect.findAllByType('option').map((option) => option.props.children),
    ['Inter', 'Arial', 'Georgia', 'Times New Roman', 'Verdana', 'Courier New']
  );

  const boldButton = renderer.root.findByProps({ 'aria-label': 'Toggle boldface' });
  const italicButton = renderer.root.findByProps({ 'aria-label': 'Toggle italic' });
  const underlineButton = renderer.root.findByProps({ 'aria-label': 'Toggle underline' });
  const yellowSwatch = renderer.root.findByProps({ 'aria-label': 'Yellow prop color' });
  const customColorInput = renderer.root.findByProps({ id: 'props-color-input' });
  const initialTimeInput = renderer.root.findByProps({ id: 'props-initial-timepoint-input' });
  const finalTimeInput = renderer.root.findByProps({ id: 'props-final-timepoint-input' });

  const modeButton = renderer.root.findAllByType('button').find((button) => button.props.children === 'On-screen');
  assert.ok(modeButton);
  act(() => boldButton.props.onClick());
  act(() => italicButton.props.onClick());
  act(() => underlineButton.props.onClick());
  act(() => yellowSwatch.props.onClick());
  act(() => customColorInput.props.onChange({ target: { value: '#ff00ff' } }));
  act(() => initialTimeInput.props.onChange({ target: { value: '3' } }));
  act(() => finalTimeInput.props.onChange({ target: { value: '5' } }));
  act(() => modeButton.props.onClick());

  assert.ok(updatedProp);
  assert.equal(updatedProp.dimension, '3d');
  assert.equal(updatedProp.bold, true);
  assert.equal(updatedProp.italic, true);
  assert.equal(updatedProp.underline, true);
  assert.equal(updatedProp.color, '#ff00ff');
  assert.equal(updatedProp.initialTimepoint, 3);
  assert.equal(updatedProp.finalTimepoint, 5);
  assert.equal(updatedProp.world.fontSize, 48);
  renderer.unmount();
})();

(() => {
  const prop: ViewerProp = {
    ...createProp(),
    type: 'scalebar',
    dimension: '3d',
    scalebar: {
      axis: 'x',
      length: 30000,
      unit: 'nm',
      showText: true,
      textPlacement: 'below',
    },
    world: {
      ...createProp().world,
      fontSize: 12,
    },
  };
  let updatedProp: ViewerProp | null = null;
  let currentProp = prop;

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
      currentTimepoint={1}
      totalTimepoints={TOTAL_TIMEPOINTS}
      voxelResolution={VOXEL_RESOLUTION}
      onCreateProp={() => {}}
      onSelectProp={() => {}}
      onUpdateProp={(_propId, updater) => {
        currentProp = updater(currentProp);
        updatedProp = currentProp;
      }}
      onSetAllVisible={() => {}}
      onClearProps={() => {}}
      onDeleteProp={() => {}}
    />
  );

  assert.equal(
    renderer.root.findAllByType('button').some((button) => button.props.children === 'On-world'),
    false
  );
  assert.equal(renderer.root.findByProps({ id: 'props-scalebar-axis-button' }).props.children, 'X');
  assert.equal(renderer.root.findByProps({ id: 'props-scalebar-length-input' }).props.value, 30000);
  assert.deepEqual(
    renderer.root
      .findByProps({ id: 'props-scalebar-unit-select' })
      .findAllByType('option')
      .map((option) => option.props.children),
    ['Å', 'nm', 'μm', 'mm']
  );
  assert.equal(renderer.root.findByProps({ id: 'props-scalebar-text-toggle' }).props.children, 'Hide text');
  assert.equal(
    renderer.root.findByProps({ id: 'props-scalebar-text-placement-button' }).props.children,
    'Below'
  );
  assert.equal(
    renderer.root.findByProps({ id: 'props-scalebar-facing-mode-button' }).props.children,
    'World-facing'
  );
  assert.equal(
    renderer.root.findAllByProps({ id: 'props-initial-timepoint-input' }).length,
    0
  );
  assert.equal(
    renderer.root.findAllByProps({ id: 'props-final-timepoint-input' }).length,
    0
  );

  act(() => renderer.root.findByProps({ id: 'props-scalebar-axis-button' }).props.onClick());
  act(() =>
    renderer.root
      .findByProps({ id: 'props-scalebar-length-input' })
      .props.onChange({ target: { value: '40000' } })
  );
  act(() =>
    renderer.root
      .findByProps({ id: 'props-scalebar-unit-select' })
      .props.onChange({ target: { value: 'mm' } })
  );
  act(() =>
    renderer.root.findByProps({ id: 'props-scalebar-text-placement-button' }).props.onClick()
  );
  act(() =>
    renderer.root.findByProps({ id: 'props-scalebar-facing-mode-button' }).props.onClick()
  );

  assert.equal(updatedProp?.scalebar.axis, 'y');
  assert.equal(updatedProp?.scalebar.length, 40000);
  assert.equal(updatedProp?.scalebar.unit, 'mm');
  assert.equal(updatedProp?.scalebar.textPlacement, 'right');
  assert.equal(updatedProp?.world.facingMode, 'billboard');
  assert.equal(updatedProp?.initialTimepoint, 1);
  assert.equal(updatedProp?.finalTimepoint, TOTAL_TIMEPOINTS);
  renderer.unmount();
})();

(() => {
  const prop: ViewerProp = {
    ...createProp(),
    type: 'scalebar',
    dimension: '3d',
    scalebar: {
      axis: 'x',
      length: 30000,
      unit: 'nm',
      showText: false,
      textPlacement: 'below',
    },
  };
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
      currentTimepoint={1}
      totalTimepoints={TOTAL_TIMEPOINTS}
      voxelResolution={VOXEL_RESOLUTION}
      onCreateProp={() => {}}
      onSelectProp={() => {}}
      onUpdateProp={() => {}}
      onSetAllVisible={() => {}}
      onClearProps={() => {}}
      onDeleteProp={() => {}}
    />
  );

  assert.equal(renderer.root.findAllByProps({ id: 'props-typeface-select' }).length, 0);
  assert.equal(renderer.root.findAllByProps({ 'aria-label': 'Toggle boldface' }).length, 0);
  assert.equal(
    renderer.root.findAllByProps({ id: 'props-scalebar-text-placement-button' }).length,
    0
  );
  assert.equal(
    renderer.root.findByProps({ id: 'props-scalebar-facing-mode-button' }).props.children,
    'World-facing'
  );
  renderer.unmount();
})();

(() => {
  const prop: ViewerProp = {
    ...createProp(),
    type: 'timestamp',
    timestampUnits: 'index',
  };
  let updatedProp: ViewerProp | null = null;

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
      currentTimepoint={3}
      totalTimepoints={TOTAL_TIMEPOINTS}
      temporalResolution={{ interval: 2.3, unit: 'ms' }}
      onCreateProp={() => {}}
      onSelectProp={() => {}}
      onUpdateProp={(_propId, updater) => {
        updatedProp = updater(prop);
      }}
      onSetAllVisible={() => {}}
      onClearProps={() => {}}
      onDeleteProp={() => {}}
    />
  );

  const unitsButton = renderer.root.findByProps({ id: 'props-timestamp-units-button' });

  assert.equal(unitsButton.props.children, 'Index');
  assert.equal(renderer.root.findAllByProps({ id: 'props-text-input' }).length, 0);
  assert.equal(renderer.root.findAllByProps({ id: 'props-initial-timepoint-input' }).length, 0);
  assert.equal(renderer.root.findAllByProps({ id: 'props-final-timepoint-input' }).length, 0);
  assert.equal(
    renderer.root.findAllByType('button').some((button) => button.props.children === 'On-screen'),
    false
  );
  assert.equal(
    renderer.root.findAllByType('button').some((button) => button.props.children === 'On-world'),
    false
  );
  assert.equal(
    renderer.root.findAllByType('button').some((button) => button.props.children === 'World-facing'),
    false
  );
  assert.equal(
    renderer.root.findAll((node) => hasClassToken(node, 'props-editor-mode-row')).length,
    0
  );

  act(() => unitsButton.props.onClick());

  assert.equal(updatedProp?.timestampUnits, 'physical');
  renderer.unmount();
})();

(() => {
  const prop: ViewerProp = {
    ...createProp(),
    screen: {
      ...createProp().screen,
      fontSize: 52,
    },
    world: {
      ...createProp().world,
      fontSize: 18,
    },
  };
  let updatedProp: ViewerProp | null = null;

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
      currentTimepoint={3}
      totalTimepoints={TOTAL_TIMEPOINTS}
      voxelResolution={{ ...VOXEL_RESOLUTION, unit: 'nm' }}
      onCreateProp={() => {}}
      onSelectProp={() => {}}
      onUpdateProp={(_propId, updater) => {
        updatedProp = updater(prop);
      }}
      onSetAllVisible={() => {}}
      onClearProps={() => {}}
      onDeleteProp={() => {}}
    />
  );

  const typeSelect = renderer.root.findByProps({ id: 'props-type-select' });
  act(() => typeSelect.props.onChange({ target: { value: 'scalebar' } }));

  assert.equal(updatedProp?.type, 'scalebar');
  assert.equal(updatedProp?.dimension, '3d');
  assert.equal(updatedProp?.world.fontSize, 52);
  assert.equal(updatedProp?.initialTimepoint, 1);
  assert.equal(updatedProp?.finalTimepoint, TOTAL_TIMEPOINTS);
  assert.equal(updatedProp?.scalebar.length, 30);
  assert.equal(updatedProp?.scalebar.unit, 'nm');
  renderer.unmount();
})();

(() => {
  const prop: ViewerProp = {
    ...createProp(),
    dimension: '3d',
    world: {
      ...createProp().world,
      fontSize: 18,
    },
  };
  let updatedProp: ViewerProp | null = null;
  let currentProp = prop;

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
      currentTimepoint={3}
      totalTimepoints={TOTAL_TIMEPOINTS}
      temporalResolution={{ interval: 2.3, unit: 'ms' }}
      onCreateProp={() => {}}
      onSelectProp={() => {}}
      onUpdateProp={(_propId, updater) => {
        currentProp = updater(currentProp);
        updatedProp = currentProp;
      }}
      onSetAllVisible={() => {}}
      onClearProps={() => {}}
      onDeleteProp={() => {}}
    />
  );

  const typeSelect = renderer.root.findByProps({ id: 'props-type-select' });
  act(() => typeSelect.props.onChange({ target: { value: 'timestamp' } }));

  assert.equal(updatedProp?.type, 'timestamp');
  assert.equal(updatedProp?.dimension, '2d');
  assert.equal(updatedProp?.screen.fontSize, 18);
  renderer.unmount();
})();
