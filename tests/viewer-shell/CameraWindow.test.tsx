import assert from 'node:assert/strict';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

import CameraWindow from '../../src/components/viewers/viewer-shell/CameraWindow.tsx';
import type { SavedCameraView } from '../../src/types/camera.ts';

console.log('Starting CameraWindow tests');

function createViews(): SavedCameraView[] {
  return [
    {
      id: 'free-1',
      label: 'Free 1',
      mode: 'free-roam',
      cameraPosition: { x: 1, y: 2, z: 3 },
      cameraRotation: { yaw: 10, pitch: 20, roll: 30 },
    },
    {
      id: 'voxel-1',
      label: 'Voxel 1 @ (4, 5, 6)',
      mode: 'voxel-follow',
      cameraPosition: { x: 6, y: 5, z: 4 },
      cameraRotation: { yaw: -10, pitch: -20, roll: -30 },
      followedVoxel: { x: 4, y: 5, z: 6 },
    },
  ];
}

function createProps(overrides: Partial<React.ComponentProps<typeof CameraWindow>> = {}) {
  let updateCalls = 0;
  let followCalls = 0;
  let addCalls = 0;
  let removeCalls = 0;
  let renameCalls = 0;
  let saveCalls = 0;
  let loadCalls = 0;
  let clearCalls = 0;
  let selectCalls: string[] = [];

  return {
    initialPosition: { x: 10, y: 20 },
    windowMargin: 16,
    resetSignal: 0,
    cameraPositionDraft: { x: '1', y: '2', z: '3' },
    cameraRotationDraft: { yaw: '10', pitch: '20', roll: '30' },
    translationEnabled: true,
    rotationEnabled: true,
    canUpdate: true,
    voxelFollowDraft: { x: '5', y: '6', z: '7' },
    voxelFollowLocked: false,
    voxelFollowButtonLabel: 'Follow' as const,
    voxelFollowButtonDisabled: false,
    savedViews: createViews(),
    selectedViewId: 'free-1',
    canActivateViews: true,
    canAddView: true,
    canRemoveView: true,
    canSaveViews: true,
    canLoadViews: true,
    canClearViews: true,
    onCameraPositionChange: () => {},
    onCameraRotationChange: () => {},
    onApplyCameraUpdate: () => {
      updateCalls += 1;
    },
    onVoxelFollowChange: () => {},
    onVoxelFollowButtonClick: () => {
      followCalls += 1;
    },
    onAddView: () => {
      addCalls += 1;
    },
    onRemoveView: () => {
      removeCalls += 1;
    },
    onRenameView: () => {
      renameCalls += 1;
    },
    onSaveViews: () => {
      saveCalls += 1;
    },
    onLoadViews: () => {
      loadCalls += 1;
    },
    onClearViews: () => {
      clearCalls += 1;
    },
    onSelectView: (viewId: string) => {
      selectCalls.push(viewId);
    },
    onClose: () => {},
    get updateCalls() {
      return updateCalls;
    },
    get followCalls() {
      return followCalls;
    },
    get addCalls() {
      return addCalls;
    },
    get removeCalls() {
      return removeCalls;
    },
    get saveCalls() {
      return saveCalls;
    },
    get renameCalls() {
      return renameCalls;
    },
    get loadCalls() {
      return loadCalls;
    },
    get clearCalls() {
      return clearCalls;
    },
    get selectCalls() {
      return selectCalls;
    },
    ...overrides,
  };
}

(() => {
  const closedRenderer = TestRenderer.create(
    <CameraWindow {...(createProps({ savedViews: [], canSaveViews: false, canClearViews: false }) as any)} />
  );
  assert.notEqual(closedRenderer.toJSON(), null);
  closedRenderer.unmount();
})();

(() => {
  const props = createProps();
  const renderer = TestRenderer.create(<CameraWindow {...(props as any)} />);

  const updateButton = renderer.root.findAll(
    (node) => node.type === 'button' && node.children.join('') === 'Update view'
  )[0];
  const followButton = renderer.root.findAll(
    (node) => node.type === 'button' && node.children.join('') === 'Follow'
  )[0];
  const addButton = renderer.root.findAll(
    (node) => node.type === 'button' && node.children.join('') === 'Add'
  )[0];
  const removeButton = renderer.root.findAll(
    (node) => node.type === 'button' && node.children.join('') === 'Delete'
  )[0];
  const renameButton = renderer.root.findAll(
    (node) => node.type === 'button' && node.children.join('') === 'Rename'
  )[0];
  const saveButton = renderer.root.findAll(
    (node) => node.type === 'button' && node.children.join('') === 'Save'
  )[0];
  const loadButton = renderer.root.findAll(
    (node) => node.type === 'button' && node.children.join('') === 'Load'
  )[0];
  const clearButton = renderer.root.findAll(
    (node) => node.type === 'button' && node.children.join('') === 'Clear'
  )[0];
  const selectedViewButton = renderer.root.findAll(
    (node) =>
      node.type === 'button' &&
      typeof node.props.className === 'string' &&
      node.props.className.includes('camera-window-view') &&
      node.props.className.includes('is-selected')
  )[0];

  assert.ok(updateButton);
  assert.ok(followButton);
  assert.ok(addButton);
  assert.ok(removeButton);
  assert.ok(renameButton);
  assert.ok(saveButton);
  assert.ok(loadButton);
  assert.ok(clearButton);
  assert.equal(renderer.root.findAll((node) => node.props.id === 'camera-position-x')[0]?.props.value, '1');
  assert.equal(renderer.root.findAll((node) => node.props.id === 'camera-rotation-yaw')[0]?.props.value, '10');
  assert.equal(renderer.root.findAll((node) => node.props.id === 'camera-follow-z')[0]?.props.value, '7');
  assert.ok(selectedViewButton);

  act(() => updateButton.props.onClick());
  act(() => followButton.props.onClick());
  act(() => addButton.props.onClick());
  act(() => removeButton.props.onClick());
  act(() => renameButton.props.onClick());
  act(() => saveButton.props.onClick());
  act(() => loadButton.props.onClick());
  act(() => clearButton.props.onClick());
  act(() => selectedViewButton.props.onClick());

  assert.equal(props.updateCalls, 1);
  assert.equal(props.followCalls, 1);
  assert.equal(props.addCalls, 1);
  assert.equal(props.removeCalls, 1);
  assert.equal(props.renameCalls, 1);
  assert.equal(props.saveCalls, 1);
  assert.equal(props.loadCalls, 1);
  assert.equal(props.clearCalls, 1);
  assert.deepEqual(props.selectCalls, ['free-1']);

  renderer.unmount();
})();

(() => {
  const props = createProps({
    translationEnabled: false,
    voxelFollowLocked: true,
    voxelFollowButtonLabel: 'Stop',
    canActivateViews: false,
  });
  const renderer = TestRenderer.create(<CameraWindow {...(props as any)} />);

  const positionFieldset = renderer.root.findAll((node) => node.type === 'fieldset')[0];
  const followInput = renderer.root.findAll((node) => node.props.id === 'camera-follow-x')[0];
  const viewButtons = renderer.root.findAll(
    (node) => node.type === 'button' && typeof node.props.className === 'string' && node.props.className.includes('camera-window-view')
  );

  assert.equal(positionFieldset.props.disabled, true);
  assert.equal(followInput.props.disabled, true);
  assert.ok(viewButtons.every((node) => node.props.disabled === true));

  renderer.unmount();
})();

console.log('CameraWindow tests passed');
