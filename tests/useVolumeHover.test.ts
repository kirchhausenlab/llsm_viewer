import assert from 'node:assert/strict';
import * as THREE from 'three';

import { useVolumeHover } from '../src/components/viewers/volume-viewer/useVolumeHover.ts';
import { renderHook } from './hooks/renderHook.ts';

(() => {
  const hoverStatuses: Array<string | null> = [];

  const hook = renderHook(() =>
    useVolumeHover({
      layersRef: { current: [] },
      resourcesRef: { current: new Map() },
      hoverRaycasterRef: { current: null },
      volumeRootGroupRef: { current: null },
      volumeRootBaseOffsetRef: { current: new THREE.Vector3() },
      volumeRootCenterOffsetRef: { current: new THREE.Vector3() },
      volumeRootCenterUnscaledRef: { current: new THREE.Vector3() },
      volumeRootHalfExtentsRef: { current: new THREE.Vector3() },
      volumeNormalizationScaleRef: { current: 1 },
      volumeUserScaleRef: { current: 1 },
      volumeStepScaleRef: { current: 1 },
      volumeYawRef: { current: 0 },
      volumePitchRef: { current: 0 },
      volumeRootRotatedCenterTempRef: { current: new THREE.Vector3() },
      currentDimensionsRef: { current: null },
      hoveredVoxelRef: {
        current: { layerKey: null, normalizedPosition: null, segmentationLabel: null },
      },
      rendererRef: { current: null },
      cameraRef: { current: null },
      applyHoverHighlightToResources: () => {},
      emitHoverVoxel: () => {},
      clearVoxelHover: () => {},
      reportVoxelHoverAbort: () => {},
      clearVoxelHoverDebug: () => {},
      setHoverNotReady: (reason) => {
        hoverStatuses.push(reason);
      },
      isAdditiveBlending: false,
    }),
  );

  hoverStatuses.push('Hover inactive: renderer not initialized.');

  hook.result.markHoverInitialized(new THREE.Raycaster());

  assert.strictEqual(hoverStatuses.at(-1), null);
})();
