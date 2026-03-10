import assert from 'node:assert/strict';
import React from 'react';
import TestRenderer from 'react-test-renderer';

import ViewerPropsOverlay from '../../src/components/viewers/volume-viewer/ViewerPropsOverlay.tsx';
import type { ViewerProp } from '../../src/types/viewerProps.ts';

function createProp(overrides: Partial<ViewerProp> = {}): ViewerProp {
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
    text: 'Hello',
    timestampUnits: 'index',
    initialTimepoint: 1,
    finalTimepoint: 5,
    scalebar: {
      axis: 'x',
      length: 10,
      unit: 'μm',
      showText: true,
      textPlacement: 'below',
    },
    screen: {
      x: 0.5,
      y: 0.5,
      rotation: 0,
      fontSize: 30,
      flipX: false,
      flipY: false,
    },
    world: {
      x: 0,
      y: 0,
      z: 0,
      roll: 0,
      pitch: 0,
      yaw: 0,
      fontSize: 10,
      flipX: false,
      flipY: true,
      flipZ: false,
      facingMode: 'fixed',
      occlusionMode: 'always-on-top',
      unitMode: 'voxel',
    },
    ...overrides,
  };
}

(() => {
  const hiddenProp = createProp({ visible: false });
  const renderer = TestRenderer.create(
    <ViewerPropsOverlay
      surfaceNode={null}
      viewerPropsConfig={{
        props: [hiddenProp],
        selectedPropId: hiddenProp.id,
        isEditing: true,
        currentTimepoint: 1,
        totalTimepoints: 5,
        onSelectProp: () => {},
        onUpdateScreenPosition: () => {},
        onUpdateWorldPosition: () => {},
      }}
    />
  );

  const outline = renderer.root.findByProps({ className: 'viewer-prop viewer-prop--selected viewer-prop--content-hidden' });
  const content = renderer.root.findByProps({ className: 'viewer-prop-content' });
  assert.ok(outline);
  assert.equal(content.props.style.opacity, 0);
  assert.equal(content.props['aria-hidden'], true);
  renderer.unmount();
})();

(() => {
  const hiddenProp = createProp({ visible: false });
  const renderer = TestRenderer.create(
    <ViewerPropsOverlay
      surfaceNode={null}
      viewerPropsConfig={{
        props: [hiddenProp],
        selectedPropId: null,
        isEditing: false,
        currentTimepoint: 1,
        totalTimepoints: 5,
        onSelectProp: () => {},
        onUpdateScreenPosition: () => {},
        onUpdateWorldPosition: () => {},
      }}
    />
  );

  assert.equal(renderer.toJSON(), null);
  renderer.unmount();
})();

(() => {
  const timestampProp = createProp({
    type: 'timestamp',
    timestampUnits: 'physical',
  });
  const renderer = TestRenderer.create(
    <ViewerPropsOverlay
      surfaceNode={null}
      viewerPropsConfig={{
        props: [timestampProp],
        selectedPropId: null,
        isEditing: false,
        currentTimepoint: 3,
        totalTimepoints: 5,
        temporalResolution: { interval: 2.3, unit: 'ms' },
        onSelectProp: () => {},
        onUpdateScreenPosition: () => {},
        onUpdateWorldPosition: () => {},
      }}
    />
  );

  const content = renderer.root.findByProps({ className: 'viewer-prop-content' });
  assert.deepEqual(content.children, ['4.6 ms']);
  renderer.unmount();
})();

(() => {
  const scalebarProp = createProp({
    type: 'scalebar',
    dimension: '2d',
  });
  const renderer = TestRenderer.create(
    <ViewerPropsOverlay
      surfaceNode={null}
      viewerPropsConfig={{
        props: [scalebarProp],
        selectedPropId: null,
        isEditing: false,
        currentTimepoint: 1,
        totalTimepoints: 5,
        onSelectProp: () => {},
        onUpdateScreenPosition: () => {},
        onUpdateWorldPosition: () => {},
      }}
    />
  );

  assert.equal(renderer.toJSON(), null);
  renderer.unmount();
})();
