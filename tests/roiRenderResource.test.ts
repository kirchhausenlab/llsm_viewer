import assert from 'node:assert/strict';
import * as THREE from 'three';

import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';

import { createRoiResource, updateRoiResourceGeometry } from '../src/components/viewers/volume-viewer/useRoiRendering.ts';

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

  const blOcclusionUniforms = {
    roiBlOcclusionEnabled: { value: 1 },
    roiBlAlphaTexture: { value: new THREE.Texture() },
    roiBlDepthTexture: { value: new THREE.Texture() },
    roiBlViewport: { value: new THREE.Vector2(128, 128) },
    roiBlDepthBias: { value: 0.001 },
  };
  const resource = createRoiResource(spec, { current: null }, { current: null }, blOcclusionUniforms);

  assert.ok(resource.line instanceof LineSegments2, 'ROI segment geometry must render through LineSegments2');
  assert.equal(resource.geometry.attributes.instanceStart.count, 4, '2D rectangle should keep four visible edges');
  assert.equal(resource.geometry.instanceCount, 4, 'ROI resource should expose the full segment count to the renderer');
  const shader = {
    uniforms: {},
    vertexShader: '',
    fragmentShader: 'uniform float linewidth;\nfloat alpha = opacity;\n',
  };
  resource.material.onBeforeCompile(shader as Parameters<typeof resource.material.onBeforeCompile>[0], null as never);
  assert.strictEqual(shader.uniforms.roiBlOcclusionEnabled, blOcclusionUniforms.roiBlOcclusionEnabled);
  assert.strictEqual(shader.uniforms.roiBlAlphaTexture, blOcclusionUniforms.roiBlAlphaTexture);
  assert.strictEqual(shader.uniforms.roiBlDepthTexture, blOcclusionUniforms.roiBlDepthTexture);
  assert.match(shader.fragmentShader, /uniform sampler2D roiBlAlphaTexture;/);
  assert.match(shader.fragmentShader, /gl_FragCoord\.z > roiBlFrontDepth/);

  const previousGeometry = resource.geometry;
  updateRoiResourceGeometry(resource, {
    ...spec,
    shape: 'ellipse',
    mode: '3d',
    end: { x: 7, y: 8, z: 9 },
  });
  assert.notEqual(resource.geometry, previousGeometry, 'ROI geometry should be replaced when the segment layout changes');
  assert.equal(resource.geometry.attributes.instanceStart.count, 120, '3D ellipse should expose all orthogonal loop segments');
  assert.equal(resource.geometry.instanceCount, 120, '3D ellipse should expose all orthogonal loop instances');

  resource.geometry.dispose();
  resource.material.dispose();
})();

console.log('roiRenderResource tests passed');
