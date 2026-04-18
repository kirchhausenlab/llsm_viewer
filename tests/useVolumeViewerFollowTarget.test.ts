import assert from 'node:assert/strict';
import * as THREE from 'three';

import { useVolumeViewerFollowTarget } from '../src/components/viewers/volume-viewer/useVolumeViewerFollowTarget.ts';
import { renderHook } from './hooks/renderHook.ts';

console.log('Starting useVolumeViewerFollowTarget tests');

(() => {
  const { result } = renderHook(() =>
    useVolumeViewerFollowTarget({
      layersRef: {
        current: [
          {
            key: 'layer-a',
            fullResolutionWidth: 100,
            fullResolutionHeight: 80,
            fullResolutionDepth: 60,
            volume: null,
            brickAtlas: {
              pageTable: {
                volumeShape: [15, 20, 25],
              },
            },
            offsetX: 0,
            offsetY: 0,
          },
        ] as any,
      },
      volumeRootGroupRef: { current: new THREE.Group() },
      hoveredVoxelRef: {
        current: {
          layerKey: 'layer-a',
          normalizedPosition: new THREE.Vector3(0.5, 0.25, 0.75),
        },
      } as any,
    }),
  );

  assert.deepStrictEqual(result.resolveHoveredFollowTarget(), {
    coordinates: {
      x: 50,
      y: 20,
      z: 45,
    },
  });
})();

(() => {
  const volumeRootGroup = new THREE.Group();
  volumeRootGroup.position.set(10, 20, 30);
  volumeRootGroup.updateMatrixWorld(true);

  const { result } = renderHook(() =>
    useVolumeViewerFollowTarget({
      layersRef: {
        current: [
          {
            key: 'layer-b',
            fullResolutionWidth: 100,
            fullResolutionHeight: 80,
            fullResolutionDepth: 60,
            volume: null,
            brickAtlas: {
              pageTable: {
                volumeShape: [15, 20, 25],
              },
            },
            offsetX: 3,
            offsetY: 4,
          },
        ] as any,
      },
      volumeRootGroupRef: { current: volumeRootGroup },
      hoveredVoxelRef: {
        current: {
          layerKey: null,
          normalizedPosition: null,
        },
      } as any,
    }),
  );

  const worldPosition = result.computeFollowedVoxelPosition({
    layerKey: 'layer-b',
    coordinates: {
      x: 99,
      y: 79,
      z: 59,
    },
  });

  assert.ok(worldPosition instanceof THREE.Vector3);
  assert.deepStrictEqual(worldPosition?.toArray(), [109, 99, 89]);
})();

(() => {
  const { result } = renderHook(() =>
    useVolumeViewerFollowTarget({
      layersRef: {
        current: [
          {
            key: 'layer-c',
            fullResolutionWidth: 0,
            fullResolutionHeight: 0,
            fullResolutionDepth: 0,
            volume: null,
            brickPageTable: {
              volumeShape: [8, 16, 32],
            },
            offsetX: 0,
            offsetY: 0,
          },
        ] as any,
      },
      volumeRootGroupRef: { current: new THREE.Group() },
      hoveredVoxelRef: {
        current: {
          layerKey: 'layer-c',
          normalizedPosition: new THREE.Vector3(0.5, 0.5, 0.5),
        },
      } as any,
    }),
  );

  assert.deepStrictEqual(result.resolveHoveredFollowTarget(), {
    coordinates: {
      x: 16,
      y: 8,
      z: 4,
    },
  });
})();

console.log('useVolumeViewerFollowTarget tests passed');
