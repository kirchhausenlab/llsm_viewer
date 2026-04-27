import assert from 'node:assert/strict';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

import AnnotateWindow from '../src/components/viewers/viewer-shell/AnnotateWindow.tsx';
import type {
  AnnotateController,
  AnnotateCreateChannelResult,
} from '../src/hooks/annotation/useAnnotate.ts';
import type { EditableSegmentationChannel } from '../src/types/annotation.ts';

console.log('Starting AnnotateWindow tests');

function createChannel(overrides: Partial<EditableSegmentationChannel> = {}): EditableSegmentationChannel {
  return {
    channelId: 'annotate-1',
    layerKey: 'annotate-layer-1',
    name: 'Annotation',
    dimensions: { width: 3, height: 3, depth: 1 },
    volumeCount: 1,
    createdFrom: { kind: 'empty' },
    labels: [{ name: '' }, { name: 'Nucleus' }],
    activeLabelIndex: 1,
    timepointLabels: new Map(),
    enabled: false,
    overlayVisible: true,
    mode: '3d',
    brushMode: 'brush',
    radius: 1,
    dirty: true,
    revision: 1,
    savedRevision: 0,
    ...overrides,
  };
}

function createController(overrides: Partial<AnnotateController> = {}): AnnotateController {
  const activeChannel = createChannel();
  return {
    available: true,
    unavailableReason: null,
    channels: [activeChannel],
    activeChannel,
    activeChannelId: activeChannel.channelId,
    sourceOptions: [
      { id: 'empty', kind: 'empty', label: 'Empty' },
      {
        id: 'regular:labels',
        kind: 'regular-segmentation',
        label: 'Labels',
        channelId: 'labels',
        layerKey: 'labels-layer',
        volumeCount: 1,
        dimensions: { width: 3, height: 3, depth: 1 },
      },
    ],
    selectedSourceId: 'empty',
    creationName: 'Annotation',
    message: null,
    busy: false,
    canUndo: true,
    canRedo: true,
    hasDirtyChannels: true,
    revision: 1,
    editableVisibility: { [activeChannel.channelId]: true },
    editableLayerVolumes: { [activeChannel.layerKey]: null },
    editableLayerBrickAtlases: { [activeChannel.layerKey]: null },
    setSelectedSourceId: () => {},
    setCreationName: () => {},
    createChannel: async () => ({ ok: true, channelId: 'annotate-2' }),
    deleteActiveChannel: () => {},
    setActiveChannelId: () => {},
    setChannelVisible: () => {},
    setEnabled: () => {},
    setOverlayVisible: () => {},
    setMode: () => {},
    setBrushMode: () => {},
    setRadius: () => {},
    setActiveLabelIndex: () => {},
    addLabel: () => {},
    deleteActiveLabel: () => {},
    renameActiveLabel: () => {},
    clearActiveChannel: () => {},
    saveActiveChannel: async () => {},
    undo: () => {},
    redo: () => {},
    beginStroke: () => {},
    applyStrokeAt: () => {},
    endStroke: () => {},
    resetTool: () => {},
    getEditableLoadedLayers: () => [],
    getEditableViewerLayers: () => [],
    getEditableChannelById: () => null,
    ...overrides,
  };
}

function renderAnnotateWindow(controller: AnnotateController, selectedChannel = {
  channelId: 'annotate-1',
  name: 'Annotation',
  editable: true,
}) {
  return TestRenderer.create(
    <AnnotateWindow
      initialPosition={{ x: 0, y: 0 }}
      windowMargin={16}
      controlWindowWidth={320}
      resetSignal={0}
      controller={controller}
      selectedChannel={selectedChannel}
      onClose={() => {}}
    />
  );
}

function findButtonByText(renderer: TestRenderer.ReactTestRenderer, text: string) {
  return renderer.root.findAllByType('button').find((button) => button.props.children === text);
}

(() => {
  let deleteChannelCalls = 0;
  let clearCalls = 0;
  let saveCalls = 0;
  const enabledValues: boolean[] = [];
  const brushModes: string[] = [];
  const dimensionModes: string[] = [];
  let undoCalls = 0;
  let redoCalls = 0;
  const renderer = renderAnnotateWindow(
    createController({
      deleteActiveChannel: () => {
        deleteChannelCalls += 1;
      },
      clearActiveChannel: () => {
        clearCalls += 1;
      },
      saveActiveChannel: async () => {
        saveCalls += 1;
      },
      setEnabled: (value) => {
        enabledValues.push(value);
      },
      setBrushMode: (mode) => {
        brushModes.push(mode);
      },
      setMode: (mode) => {
        dimensionModes.push(mode);
      },
      undo: () => {
        undoCalls += 1;
      },
      redo: () => {
        redoCalls += 1;
      },
    })
  );

  const newButton = findButtonByText(renderer, 'New channel');
  const deleteButton = findButtonByText(renderer, 'Delete channel');
  assert.ok(newButton);
  assert.ok(deleteButton);
  assert.equal(newButton.props.disabled, false);
  assert.equal(deleteButton.props.disabled, false);
  assert.equal(renderer.root.findByProps({ className: 'annotate-body' }).props['aria-disabled'], false);

  const currentLabel = renderer.root.findByProps({ className: 'annotate-current-label' });
  assert.equal(currentLabel.props.children, '2 - Nucleus');
  assert.match(currentLabel.props.style.color, /^rgb\(/);

  assert.equal(findButtonByText(renderer, 'Hide'), undefined);
  assert.equal(findButtonByText(renderer, 'Show'), undefined);
  assert.equal(findButtonByText(renderer, 'Undo'), undefined);
  assert.equal(findButtonByText(renderer, 'Redo'), undefined);

  const handButton = renderer.root.findByProps({ 'aria-label': 'Hand' });
  const brushButton = renderer.root.findByProps({ 'aria-label': 'Brush' });
  const eraserButton = renderer.root.findByProps({ 'aria-label': 'Eraser' });
  assert.equal(handButton.props['aria-pressed'], true);
  assert.equal(brushButton.findAllByType('svg').length, 1);
  assert.equal(eraserButton.findAllByType('svg').length, 1);

  act(() => brushButton.props.onClick());
  act(() => eraserButton.props.onClick());
  act(() => handButton.props.onClick());
  assert.deepEqual(brushModes, ['brush', 'eraser']);
  assert.deepEqual(enabledValues, [true, true, false]);

  const mode2dButton = renderer.root.findAllByType('button').find((button) => button.props.children === '2D');
  assert.ok(mode2dButton);
  act(() => mode2dButton.props.onClick());
  assert.deepEqual(dimensionModes, ['2d']);

  act(() => renderer.root.findByProps({ 'aria-label': 'Undo' }).props.onClick());
  act(() => renderer.root.findByProps({ 'aria-label': 'Redo' }).props.onClick());
  assert.equal(undoCalls, 1);
  assert.equal(redoCalls, 1);

  const labelTexts = renderer.root.findAllByProps({ className: 'roi-manager-list-item-label' });
  assert.equal(labelTexts[0]?.props.children, '1');
  const activeLabelButton = renderer.root.findAllByProps({ role: 'option' })[1];
  assert.ok(activeLabelButton?.props.className.includes('roi-manager-list-item'));
  assert.ok(activeLabelButton?.props.className.includes('is-active'));

  act(() => deleteButton.props.onClick());
  act(() => findButtonByText(renderer, 'Clear')?.props.onClick());
  act(() => {
    void findButtonByText(renderer, 'Save')?.props.onClick();
  });
  assert.equal(deleteChannelCalls, 1);
  assert.equal(clearCalls, 1);
  assert.equal(saveCalls, 1);
  renderer.unmount();
})();

await (async () => {
  let createCalls = 0;
  let nextCreateResult: AnnotateCreateChannelResult = {
    ok: false,
    message: 'Channel name must be unique.',
  };
  const controller = createController({
    channels: [],
    activeChannel: null,
    activeChannelId: null,
    createChannel: async ({ name, sourceId } = {}) => {
      createCalls += 1;
      assert.equal(name, 'Cells');
      assert.equal(sourceId, 'regular:labels');
      return nextCreateResult;
    },
  });
  const renderer = renderAnnotateWindow(controller, null);

  const newButton = findButtonByText(renderer, 'New channel');
  const deleteButton = findButtonByText(renderer, 'Delete channel');
  assert.ok(newButton);
  assert.ok(deleteButton);
  assert.equal(deleteButton.props.disabled, true);
  assert.equal(renderer.root.findByProps({ className: 'annotate-body is-disabled' }).props['aria-disabled'], true);

  act(() => newButton.props.onClick());
  assert.equal(newButton.props.disabled, true);
  assert.ok(renderer.root.findByProps({ children: 'Create new channel' }));

  act(() => {
    renderer.root.findByProps({ id: 'annotate-create-channel-name' }).props.onChange({
      target: { value: 'Cells' },
    });
    renderer.root.findByProps({ id: 'annotate-create-source-select' }).props.onChange({
      target: { value: 'regular:labels' },
    });
  });

  await act(async () => {
    renderer.root.findByType('form').props.onSubmit({ preventDefault: () => {} });
    await Promise.resolve();
  });
  assert.equal(createCalls, 1);
  assert.equal(renderer.root.findByProps({ role: 'alert' }).props.children, 'Channel name must be unique.');

  nextCreateResult = { ok: true, channelId: 'annotate-2' };
  await act(async () => {
    renderer.root.findByType('form').props.onSubmit({ preventDefault: () => {} });
    await Promise.resolve();
  });
  assert.equal(createCalls, 2);
  assert.equal(renderer.root.findAllByProps({ role: 'alert' }).length, 0);
  assert.equal(renderer.root.findAllByType('form').length, 0);

  act(() => newButton.props.onClick());
  assert.equal(renderer.root.findAllByType('form').length, 1);
  act(() => findButtonByText(renderer, 'Cancel')?.props.onClick());
  assert.equal(renderer.root.findAllByType('form').length, 0);
  assert.equal(createCalls, 2);
  renderer.unmount();
})();

(() => {
  const renderer = renderAnnotateWindow(
    createController({
      channels: [],
      activeChannel: null,
      activeChannelId: null,
    }),
    { channelId: 'labels', name: 'Labels', editable: false }
  );

  assert.equal(findButtonByText(renderer, 'Delete channel')?.props.disabled, true);
  assert.equal(renderer.root.findByProps({ className: 'annotate-body is-disabled' }).props['aria-disabled'], true);
  assert.ok(renderer.root.findAllByProps({ children: 'Labels (read-only)' }).length > 0);
  renderer.unmount();
})();

console.log('AnnotateWindow tests passed');
