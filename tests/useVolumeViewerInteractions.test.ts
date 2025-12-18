import assert from 'node:assert/strict';
import * as THREE from 'three';

import { useVolumeViewerInteractions } from '../src/components/viewers/volume-viewer/useVolumeViewerInteractions.ts';
import { FALLBACK_SEGMENTATION_LABEL_TEXTURE } from '../src/components/viewers/volume-viewer/fallbackTextures.ts';
import type { VolumeResources } from '../src/components/viewers/VolumeViewer.types.ts';
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
    }),
  );

  result.applyHoverHighlightToResources();

  const uniforms = (material as THREE.ShaderMaterial).uniforms;
  assert.strictEqual(uniforms.u_segmentationLabels.value, FALLBACK_SEGMENTATION_LABEL_TEXTURE);
})();

console.log('useVolumeViewerInteractions tests passed');

