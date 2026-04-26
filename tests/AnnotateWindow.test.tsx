import assert from 'node:assert/strict';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

import AnnotateWindow from '../src/components/viewers/viewer-shell/AnnotateWindow.tsx';
import type { AnnotateController } from '../src/hooks/annotation/useAnnotate.ts';
import type { EditableSegmentationChannel } from '../src/types/annotation.ts';

console.log('Starting AnnotateWindow tests');

function createChannel(): EditableSegmentationChannel {
  return {
    channelId: 'annotate-1',
    layerKey: 'annotate-layer-1',
    name: 'Annotation',
    dimensions: { width: 3, height: 3, depth: 1 },
    volumeCount: 1,
    createdFrom: { kind: 'empty' },
    labels: [{ name: '' }],
    activeLabelIndex: 0,
    timepointLabels: new Map(),
    enabled: true,
    overlayVisible: true,
    mode: '3d',
    brushMode: 'brush',
    radius: 1,
    dirty: true,
    revision: 1,
    savedRevision: 0,
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
    sourceOptions: [{ id: 'empty', kind: 'empty', label: 'Empty' }],
    selectedSourceId: 'empty',
    creationName: 'Annotation',
    message: null,
    busy: false,
    canUndo: true,
    canRedo: false,
    hasDirtyChannels: true,
    revision: 1,
    editableVisibility: { [activeChannel.channelId]: true },
    editableLayerVolumes: { [activeChannel.layerKey]: null },
    editableLayerBrickAtlases: { [activeChannel.layerKey]: null },
    setSelectedSourceId: () => {},
    setCreationName: () => {},
    createChannel: async () => {},
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

(() => {
  let clearCalls = 0;
  let saveCalls = 0;
  const renderer = TestRenderer.create(
    <AnnotateWindow
      initialPosition={{ x: 0, y: 0 }}
      windowMargin={16}
      controlWindowWidth={320}
      resetSignal={0}
      controller={createController({
        clearActiveChannel: () => {
          clearCalls += 1;
        },
        saveActiveChannel: async () => {
          saveCalls += 1;
        },
      })}
      onClose={() => {}}
    />
  );

  const buttons = renderer.root.findAllByType('button');
  const clearButton = buttons.find((button) => button.props.children === 'Clear');
  const saveButton = buttons.find((button) => button.props.children === 'Save');
  const newButton = buttons.find((button) => button.props.children === 'New');
  assert.ok(clearButton);
  assert.ok(saveButton);
  assert.ok(newButton);
  assert.equal(newButton.props.disabled, true);
  assert.equal(renderer.root.findByProps({ id: 'annotate-source-select' }).props.disabled, true);
  assert.equal(renderer.root.findByProps({ id: 'annotate-channel-name' }).props.disabled, true);

  act(() => clearButton.props.onClick());
  act(() => {
    void saveButton.props.onClick();
  });

  assert.equal(clearCalls, 1);
  assert.equal(saveCalls, 1);
  renderer.unmount();
})();

(() => {
  const renderer = TestRenderer.create(
    <AnnotateWindow
      initialPosition={{ x: 0, y: 0 }}
      windowMargin={16}
      controlWindowWidth={320}
      resetSignal={0}
      controller={createController({
        available: false,
        unavailableReason: 'Annotate is unavailable for public datasets.',
        channels: [],
        activeChannel: null,
        activeChannelId: null,
      })}
      onClose={() => {}}
    />
  );

  const newButton = renderer.root.findAllByType('button').find((button) => button.props.children === 'New');
  assert.ok(newButton);
  assert.equal(newButton.props.disabled, true);
  assert.ok(renderer.root.findAllByProps({ role: 'status' }).some((node) => node.props.children === 'Annotate is unavailable for public datasets.'));
  renderer.unmount();
})();

console.log('AnnotateWindow tests passed');
