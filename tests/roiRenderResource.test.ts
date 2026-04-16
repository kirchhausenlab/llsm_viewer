import assert from 'node:assert/strict';

import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2';

import { createRoiResource } from '../src/components/viewers/volume-viewer/useRoiRendering.ts';

console.log('Starting roiRenderResource tests');

(() => {
  const spec: Parameters<typeof createRoiResource>[0] = {
    key: 'roi:test',
    roiId: 'roi:test',
    shape: 'rectangle',
    mode: '2d',
    start: { x: 1, y: 2, z: 3 },
    end: { x: 5, y: 8, z: 3 },
    color: '#FACC15',
    isInvalid: false,
    shouldBlink: false,
  };

  const resource = createRoiResource(spec, { current: null }, { current: null });

  assert.ok(resource.line instanceof LineSegments2, 'ROI segment geometry must render through LineSegments2');
  assert.equal(resource.geometry.attributes.instanceStart.count, 4, '2D rectangle should keep four visible edges');
  assert.equal(resource.geometry.instanceCount, 4, 'ROI resource should expose the full segment count to the renderer');

  resource.geometry.dispose();
  resource.material.dispose();
})();

console.log('roiRenderResource tests passed');
