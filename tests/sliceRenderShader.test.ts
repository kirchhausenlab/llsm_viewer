import assert from 'node:assert/strict';

import { SliceRenderShader } from '../src/shaders/sliceRenderShader.ts';

(() => {
  const shader = SliceRenderShader.fragmentShader;
  assert.match(shader, /uniform float u_backgroundMaskEnabled;/);
  assert.match(shader, /uniform float u_sliceIndex;/);
  assert.match(shader, /uniform sampler3D u_backgroundMask;/);
  assert.match(shader, /bool is_background_masked_slice\(vec2 uv\)/);
  assert.match(
    shader,
    /if \(is_background_masked_slice\(v_uv\)\) \{\s*gl_FragColor = apply_blending_mode\(apply_hover_outline\(vec4\(0\.0\)\)\);\s*return;\s*\}/s,
  );
})();

console.log('slice render shader tests passed');
