import assert from 'node:assert/strict';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

import RoiManagerWindow from '../../src/components/viewers/viewer-shell/RoiManagerWindow.tsx';

console.log('Starting RoiManagerWindow tests');

function findByClass(renderer: TestRenderer.ReactTestRenderer, className: string) {
  return renderer.root.findAll(
    (node) => typeof node.props.className === 'string' && node.props.className.split(/\s+/).includes(className),
  );
}

(() => {
  const selectCalls: Array<{ roiId: string; additive: boolean | undefined }> = [];
  const renderer = TestRenderer.create(
    <RoiManagerWindow
      initialPosition={{ x: 0, y: 0 }}
      windowMargin={16}
      controlWindowWidth={320}
      resetSignal={0}
      savedRois={[
        {
          id: 'roi-1',
          name: 'ROI 1',
          shape: 'line',
          mode: '3d',
          start: { x: 1, y: 2, z: 3 },
          end: { x: 4, y: 5, z: 6 },
          color: '#FFFFFF',
        },
        {
          id: 'roi-2',
          name: 'ROI 2',
          shape: 'rectangle',
          mode: '2d',
          start: { x: 2, y: 3, z: 4 },
          end: { x: 5, y: 6, z: 4 },
          color: '#FF00FF',
        },
        {
          id: 'roi-3',
          name: 'ROI 3',
          shape: 'ellipse',
          mode: '2d',
          start: { x: 3, y: 4, z: 5 },
          end: { x: 6, y: 7, z: 5 },
          color: '#00FFAA',
        },
      ]}
      selectedSavedRoiIds={['roi-2', 'roi-3']}
      activeSavedRoiId="roi-2"
      showAllSavedRois={false}
      canAdd={false}
      canUpdate={true}
      canMeasure={true}
      canSave={true}
      canLoad={true}
      onSelectRoi={(roiId, additive) => {
        selectCalls.push({ roiId, additive });
      }}
      onAdd={() => {}}
      onDelete={() => {}}
      onRename={() => {}}
      onUpdate={() => {}}
      onMeasure={() => {}}
      onSave={() => {}}
      onLoad={() => {}}
      onShowAllChange={() => {}}
      onClose={() => {}}
    />
  );

  const roiButtons = renderer.root.findAll(
    (node) => node.type === 'button' && typeof node.props.className === 'string' && node.props.className.includes('roi-manager-list-item'),
  );
  assert.equal(roiButtons.length, 3);
  assert.equal(roiButtons[0]!.props.className.includes('is-selected'), false);
  assert.equal(roiButtons[1]!.props.className.includes('is-active'), true);
  assert.equal(roiButtons[2]!.props.className.includes('is-selected'), true);

  const badges = findByClass(renderer, 'roi-manager-selection-badge')
    .filter((node) => node.type === 'span' && !node.props.className.includes('is-active'));
  const activeBadges = findByClass(renderer, 'roi-manager-selection-badge')
    .filter((node) => node.type === 'span' && node.props.className.includes('is-active'));
  assert.deepEqual(activeBadges.map((badge) => badge.children.join('')), ['1']);
  assert.deepEqual(badges.map((badge) => badge.children.join('')), ['2']);
  assert.equal(
    renderer.root.findAll((node) => node.type === 'button' && node.children.join('') === 'Properties').length,
    0,
  );

  act(() => {
    roiButtons[0]!.props.onClick({ shiftKey: false });
  });
  act(() => {
    roiButtons[2]!.props.onClick({ shiftKey: true });
  });

  assert.deepEqual(selectCalls, [
    { roiId: 'roi-1', additive: false },
    { roiId: 'roi-3', additive: true },
  ]);

  renderer.unmount();
})();

console.log('RoiManagerWindow tests passed');
