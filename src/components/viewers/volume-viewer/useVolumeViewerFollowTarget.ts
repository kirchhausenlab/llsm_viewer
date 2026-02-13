import { useCallback } from 'react';
import type { MutableRefObject } from 'react';
import * as THREE from 'three';

import type { FollowedVoxelTarget, VolumeViewerProps } from '../VolumeViewer.types';

type UseVolumeViewerFollowTargetParams = {
  layersRef: MutableRefObject<VolumeViewerProps['layers']>;
  volumeRootGroupRef: MutableRefObject<THREE.Group | null>;
  hoveredVoxelRef: MutableRefObject<{
    layerKey: string | null;
    normalizedPosition: THREE.Vector3 | null;
  }>;
};

export function useVolumeViewerFollowTarget({
  layersRef,
  volumeRootGroupRef,
  hoveredVoxelRef,
}: UseVolumeViewerFollowTargetParams) {
  const computeFollowedVoxelPosition = useCallback(
    (target: FollowedVoxelTarget) => {
      const volumeRootGroup = volumeRootGroupRef.current;
      if (!volumeRootGroup) {
        return null;
      }

      const layer = layersRef.current.find((entry) => entry.key === target.layerKey);
      const volume = layer?.volume;
      if (!layer || !volume) {
        return null;
      }

      const clampedX = THREE.MathUtils.clamp(target.coordinates.x, 0, volume.width - 1);
      const clampedY = THREE.MathUtils.clamp(target.coordinates.y, 0, volume.height - 1);
      const clampedZ = THREE.MathUtils.clamp(target.coordinates.z, 0, volume.depth - 1);

      const localPosition = new THREE.Vector3(
        clampedX + (layer.offsetX ?? 0),
        clampedY + (layer.offsetY ?? 0),
        clampedZ,
      );

      volumeRootGroup.updateMatrixWorld(true);
      return volumeRootGroup.localToWorld(localPosition);
    },
    [layersRef, volumeRootGroupRef],
  );

  const resolveHoveredFollowTarget = useCallback((): FollowedVoxelTarget | null => {
    const hovered = hoveredVoxelRef.current;
    const normalizedPosition = hovered?.normalizedPosition;
    const layerKey = hovered?.layerKey;

    if (!normalizedPosition || !layerKey) {
      return null;
    }

    const layer = layersRef.current.find((entry) => entry.key === layerKey);
    const volume = layer?.volume;
    if (!layer || !volume) {
      return null;
    }

    return {
      layerKey,
      coordinates: {
        x: Math.round(THREE.MathUtils.clamp(normalizedPosition.x * volume.width, 0, volume.width - 1)),
        y: Math.round(THREE.MathUtils.clamp(normalizedPosition.y * volume.height, 0, volume.height - 1)),
        z: Math.round(THREE.MathUtils.clamp(normalizedPosition.z * volume.depth, 0, volume.depth - 1)),
      },
    };
  }, [hoveredVoxelRef, layersRef]);

  return {
    computeFollowedVoxelPosition,
    resolveHoveredFollowTarget,
  };
}
