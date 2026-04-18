import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import TestRenderer from 'react-test-renderer';
import type { ReactTestInstance } from 'react-test-renderer';

import ExperimentConfiguration from '../../src/components/pages/ExperimentConfiguration.tsx';

test('experiment configuration renders the Render in 16bit checkbox and wires changes', () => {
  let toggled: boolean | null = null;
  const renderer = TestRenderer.create(
    <ExperimentConfiguration
      experimentType="3d-movie"
      voxelResolution={{ x: '1', y: '1', z: '1', t: '1', unit: 'μm', timeUnit: 's', correctAnisotropy: false }}
      onVoxelResolutionAxisChange={() => {}}
      onVoxelResolutionUnitChange={() => {}}
      onVoxelResolutionTimeUnitChange={() => {}}
      onVoxelResolutionAnisotropyToggle={() => {}}
      backgroundMaskEnabled={false}
      backgroundMaskValuesInput=""
      backgroundMaskError={null}
      onBackgroundMaskToggle={() => {}}
      onBackgroundMaskValuesInputChange={() => {}}
      renderIn16Bit={false}
      onRenderIn16BitToggle={(value) => {
        toggled = value;
      }}
      isFrontPageLocked={false}
    />
  );

  const checkbox = renderer.root
    .findAllByType('input')
    .find((node: ReactTestInstance) => node.props.type === 'checkbox' && node.props.checked === false);
  assert.ok(checkbox);
  const labels = renderer.root.findAllByType('strong').map((node: ReactTestInstance) => node.children.join(''));
  assert.ok(labels.includes('Render in 16bit'));

  const render16Checkbox = renderer.root.findAllByType('input').find(
    (node: ReactTestInstance) =>
      node.props.type === 'checkbox' &&
      node.parent?.findAllByType?.('strong')?.some((entry: ReactTestInstance) => entry.children.join('') === 'Render in 16bit')
  );
  assert.ok(render16Checkbox);
  render16Checkbox?.props.onChange({ target: { checked: true } });
  assert.equal(toggled, true);

  renderer.unmount();
});
