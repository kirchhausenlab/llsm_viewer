import assert from 'node:assert/strict';
import * as THREE from 'three';

import { useVolumeViewerInteractions } from '../src/components/viewers/volume-viewer/useVolumeViewerInteractions.ts';
import type { VolumeResources } from '../src/components/viewers/VolumeViewer.types.ts';
import { HOVER_HIGHLIGHT_RADIUS_VOXELS } from '../src/components/viewers/volume-viewer/rendering/index.ts';
import {
  resolveDefaultHoverRadiusScale,
  resolveDefaultHoverStrengthScale,
} from '../src/shared/utils/hoverSettings.ts';
import { RENDER_STYLE_BL } from '../src/state/layerSettings.ts';
import { renderHook } from './hooks/renderHook.ts';

console.log('Starting useVolumeViewerInteractions tests');

(() => {
  const layerKey = 'layer';

  const material = new THREE.ShaderMaterial({
    uniforms: {
      u_hoverActive: { value: 0 },
      u_hoverSegmentationMode: { value: 0 },
      u_hoverLabel: { value: 0 },
      u_segmentationLabels: { value: null },
      u_hoverPos: { value: new THREE.Vector3() },
      u_hoverRadius: { value: 0 },
      u_hoverScale: { value: new THREE.Vector3() },
      u_hoverVisualMode: { value: 0 },
      u_hoverStrength: { value: 0 },
    },
    vertexShader: 'void main() { gl_Position = vec4(0.0); }',
    fragmentShader: 'void main() { gl_FragColor = vec4(1.0); }',
  });

  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
  const texture = new THREE.Data3DTexture(new Uint8Array([0]), 1, 1, 1);
  const resource: VolumeResources = {
    mesh,
    texture,
    labelTexture: null,
    dimensions: { width: 1, height: 1, depth: 1 },
    channels: 1,
    mode: '3d',
    samplingMode: 'nearest',
  };

  const resourcesRef = { current: new Map<string, VolumeResources>([[layerKey, resource]]) };

  const { result } = renderHook(() =>
    useVolumeViewerInteractions({
      layersRef: { current: [{ key: layerKey, isSegmentation: false }] as any },
      resourcesRef,
      hoveredVoxelRef: {
        current: {
          layerKey: null,
          normalizedPosition: null,
          segmentationLabel: null,
        },
      },
      volumeAnisotropyScaleRef: { current: { x: 1, y: 1, z: 1 } },
      hoverIntensityRef: { current: null },
      voxelHoverDebugRef: { current: null },
      setVoxelHoverDebug: () => {},
      isDevMode: false,
      hoverSettings: { type: 'default', strength: 50, radius: 50 },
    }),
  );

  result.applyHoverHighlightToResources();

  const uniforms = (material as THREE.ShaderMaterial).uniforms;
  assert.strictEqual(uniforms.u_segmentationLabels.value, null);
  assert.strictEqual(uniforms.u_hoverVisualMode.value, 0);
  assert.strictEqual(uniforms.u_hoverStrength.value, 0);
})();

(() => {
  const layerKey = 'slice-layer';

  const material = new THREE.ShaderMaterial({
    uniforms: {
      u_hoverActive: { value: 0 },
      u_sliceSize: { value: new THREE.Vector2(0, 0) },
      u_hoverPixel: { value: new THREE.Vector2(-1, -1) },
      u_hoverGridSubdivisions: { value: new THREE.Vector2(1, 1) },
      u_hoverOutlineColor: { value: new THREE.Vector3(0, 0, 0) },
    },
    vertexShader: 'void main() { gl_Position = vec4(0.0); }',
    fragmentShader: 'void main() { gl_FragColor = vec4(1.0); }',
  });

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
  const texture = new THREE.DataTexture(new Uint8Array(4 * 3 * 4), 4, 3, THREE.RGBAFormat);
  const resource: VolumeResources = {
    mesh,
    texture,
    dimensions: { width: 8, height: 12, depth: 6 },
    channels: 1,
    mode: 'slice',
    samplingMode: 'nearest',
  };

  const resourcesRef = { current: new Map<string, VolumeResources>([[layerKey, resource]]) };

  const { result } = renderHook(() =>
    useVolumeViewerInteractions({
      layersRef: {
        current: [
          {
            key: layerKey,
            isSegmentation: false,
            fullResolutionWidth: 8,
            fullResolutionHeight: 12,
          },
        ] as any,
      },
      resourcesRef,
      hoveredVoxelRef: {
        current: {
          layerKey,
          normalizedPosition: new THREE.Vector3(0.51, 0.5, 0.2),
          segmentationLabel: null,
        },
      },
      volumeAnisotropyScaleRef: { current: { x: 1, y: 1, z: 1 } },
      hoverIntensityRef: { current: null },
      voxelHoverDebugRef: { current: null },
      setVoxelHoverDebug: () => {},
      isDevMode: false,
      hoverSettings: { type: 'default', strength: 10, radius: 90 },
    }),
  );

  result.applyHoverHighlightToResources();

  const uniforms = (material as THREE.ShaderMaterial).uniforms;
  assert.strictEqual(uniforms.u_hoverActive.value, 1);
  assert.deepStrictEqual(
    [
      uniforms.u_sliceSize.value.x,
      uniforms.u_sliceSize.value.y,
    ],
    [4, 3],
  );
  assert.deepStrictEqual(
    [
      uniforms.u_hoverPixel.value.x,
      uniforms.u_hoverPixel.value.y,
    ],
    [2, 1],
  );
  assert.deepStrictEqual(
    [
      uniforms.u_hoverGridSubdivisions.value.x,
      uniforms.u_hoverGridSubdivisions.value.y,
    ],
    [2, 4],
  );
})();

(() => {
  const layerKey = 'bl-layer';

  const material = new THREE.ShaderMaterial({
    uniforms: {
      u_hoverActive: { value: 0 },
      u_hoverSegmentationMode: { value: 0 },
      u_hoverLabel: { value: 0 },
      u_hoverPos: { value: new THREE.Vector3() },
      u_hoverRadius: { value: 0 },
      u_hoverScale: { value: new THREE.Vector3() },
      u_hoverVisualMode: { value: 0 },
      u_hoverStrength: { value: 0 },
    },
    vertexShader: 'void main() { gl_Position = vec4(0.0); }',
    fragmentShader: 'void main() { gl_FragColor = vec4(1.0); }',
  });

  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
  const texture = new THREE.Data3DTexture(new Uint8Array([0]), 1, 1, 1);
  const resource: VolumeResources = {
    mesh,
    texture,
    dimensions: { width: 4, height: 5, depth: 6 },
    channels: 1,
    mode: '3d',
    samplingMode: 'linear',
    renderStyle: RENDER_STYLE_BL,
  };

  const resourcesRef = { current: new Map<string, VolumeResources>([[layerKey, resource]]) };

  const { result: crosshairResult } = renderHook(() =>
    useVolumeViewerInteractions({
      layersRef: { current: [{ key: layerKey, isSegmentation: false, renderStyle: RENDER_STYLE_BL }] as any },
      resourcesRef,
      hoveredVoxelRef: {
        current: {
          layerKey,
          normalizedPosition: new THREE.Vector3(0.25, 0.5, 0.75),
          segmentationLabel: null,
        },
      },
      volumeAnisotropyScaleRef: { current: { x: 1, y: 1, z: 1 } },
      hoverIntensityRef: { current: null },
      voxelHoverDebugRef: { current: null },
      setVoxelHoverDebug: () => {},
      isDevMode: false,
      hoverSettings: { type: 'crosshair', strength: 10, radius: 90 },
    }),
  );
  crosshairResult.applyHoverHighlightToResources();
  assert.strictEqual(material.uniforms.u_hoverVisualMode.value, 1);
  assert.strictEqual(material.uniforms.u_hoverRadius.value, HOVER_HIGHLIGHT_RADIUS_VOXELS);
  assert.strictEqual(material.uniforms.u_hoverStrength.value, 1);

  const { result: defaultResult } = renderHook(() =>
    useVolumeViewerInteractions({
      layersRef: { current: [{ key: layerKey, isSegmentation: false, renderStyle: RENDER_STYLE_BL }] as any },
      resourcesRef,
      hoveredVoxelRef: {
        current: {
          layerKey,
          normalizedPosition: new THREE.Vector3(0.25, 0.5, 0.75),
          segmentationLabel: null,
        },
      },
      volumeAnisotropyScaleRef: { current: { x: 1, y: 1, z: 1 } },
      hoverIntensityRef: { current: null },
      voxelHoverDebugRef: { current: null },
      setVoxelHoverDebug: () => {},
      isDevMode: false,
      hoverSettings: { type: 'default', strength: 90, radius: 10 },
    }),
  );
  defaultResult.applyHoverHighlightToResources();
  assert.strictEqual(material.uniforms.u_hoverVisualMode.value, 0);
  assert.strictEqual(
    material.uniforms.u_hoverRadius.value,
    HOVER_HIGHLIGHT_RADIUS_VOXELS * resolveDefaultHoverRadiusScale(10)
  );
  assert.strictEqual(
    material.uniforms.u_hoverStrength.value,
    resolveDefaultHoverStrengthScale(90)
  );
})();

console.log('useVolumeViewerInteractions tests passed');
