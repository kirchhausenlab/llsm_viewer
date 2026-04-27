import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import TestRenderer from 'react-test-renderer';
import type { ReactTestInstance } from 'react-test-renderer';

import ExperimentConfiguration, {
  type ExperimentConfigurationProps
} from '../../src/components/pages/ExperimentConfiguration.tsx';

function buildExperimentConfigurationProps(
  overrides: Partial<ExperimentConfigurationProps> = {}
): ExperimentConfigurationProps {
  return {
    experimentType: '3d-movie',
    voxelResolution: { x: '1', y: '1', z: '1', t: '1', unit: 'μm', timeUnit: 's', correctAnisotropy: false },
    onVoxelResolutionAxisChange: () => {},
    onVoxelResolutionUnitChange: () => {},
    onVoxelResolutionTimeUnitChange: () => {},
    onVoxelResolutionAnisotropyToggle: () => {},
    backgroundMaskEnabled: false,
    backgroundMaskValuesInput: '',
    backgroundMaskError: null,
    onBackgroundMaskToggle: () => {},
    onBackgroundMaskValuesInputChange: () => {},
    force8BitRender: false,
    onForce8BitRenderToggle: () => {},
    deSkewModeEnabled: false,
    skewAngleInput: '31.5',
    skewAngleUnit: 'degrees',
    skewDirection: 'X',
    deSkewMaskVoxels: true,
    onDeSkewModeToggle: () => {},
    onSkewAngleInputChange: () => {},
    onSkewAngleUnitChange: () => {},
    onSkewDirectionChange: () => {},
    onDeSkewMaskVoxelsToggle: () => {},
    isFrontPageLocked: false,
    ...overrides
  };
}

function findCheckboxByLabel(root: ReactTestInstance, label: string): ReactTestInstance | undefined {
  return root.findAllByType('input').find((node: ReactTestInstance) => {
    if (node.props.type !== 'checkbox') {
      return false;
    }
    return node.parent
      ?.findAllByType?.('strong')
      ?.some((entry: ReactTestInstance) => entry.children.join('') === label);
  });
}

test('experiment configuration renders renamed masking and force 8bit controls', () => {
  let force8BitToggled: boolean | null = null;
  const renderer = TestRenderer.create(
    <ExperimentConfiguration
      {...buildExperimentConfigurationProps({
        onForce8BitRenderToggle: (value) => {
          force8BitToggled = value;
        }
      })}
    />
  );

  const labels = renderer.root.findAllByType('strong').map((node: ReactTestInstance) => node.children.join(''));
  assert.ok(labels.includes('Mask voxels by intensity'));
  assert.ok(labels.includes('Make data isotropic'));
  assert.ok(labels.includes('Force 8bit render (performance)'));
  assert.equal(findCheckboxByLabel(renderer.root, 'Make data isotropic')?.props.checked, false);
  assert.equal(findCheckboxByLabel(renderer.root, 'Force 8bit render (performance)')?.props.checked, false);

  findCheckboxByLabel(renderer.root, 'Force 8bit render (performance)')?.props.onChange({
    target: { checked: true }
  });
  assert.equal(force8BitToggled, true);

  renderer.unmount();
});

test('experiment configuration reveals de-skew controls when enabled', () => {
  let deSkewToggled: boolean | null = null;
  let skewAngleInput: string | null = null;
  let skewAngleUnit: string | null = null;
  let skewDirection: string | null = null;
  let maskVoxelsToggled: boolean | null = null;

  const renderer = TestRenderer.create(
    <ExperimentConfiguration
      {...buildExperimentConfigurationProps({
        deSkewModeEnabled: true,
        onDeSkewModeToggle: (value) => {
          deSkewToggled = value;
        },
        onSkewAngleInputChange: (value) => {
          skewAngleInput = value;
        },
        onSkewAngleUnitChange: (value) => {
          skewAngleUnit = value;
        },
        onSkewDirectionChange: (value) => {
          skewDirection = value;
        },
        onDeSkewMaskVoxelsToggle: (value) => {
          maskVoxelsToggled = value;
        }
      })}
    />
  );

  assert.equal(findCheckboxByLabel(renderer.root, 'De-skew mode')?.props.checked, true);
  assert.equal(findCheckboxByLabel(renderer.root, 'Mask voxels')?.props.checked, true);

  const skewAngle = renderer.root.findByProps({ value: '31.5' });
  assert.equal(skewAngle.props.type, 'number');
  skewAngle.props.onChange({ target: { value: '45' } });
  assert.equal(skewAngleInput, '45');

  const angleUnit = renderer.root.findByProps({ 'aria-label': 'Skew angle unit' });
  assert.equal(angleUnit.props.value, 'degrees');
  angleUnit.props.onChange({ target: { value: 'radians' } });
  assert.equal(skewAngleUnit, 'radians');

  const direction = renderer.root.findByProps({ 'aria-label': 'Skew direction' });
  assert.equal(direction.props.value, 'X');
  direction.props.onChange({ target: { value: 'Y' } });
  assert.equal(skewDirection, 'Y');

  findCheckboxByLabel(renderer.root, 'De-skew mode')?.props.onChange({ target: { checked: false } });
  assert.equal(deSkewToggled, false);
  findCheckboxByLabel(renderer.root, 'Mask voxels')?.props.onChange({ target: { checked: false } });
  assert.equal(maskVoxelsToggled, false);

  renderer.unmount();
});
