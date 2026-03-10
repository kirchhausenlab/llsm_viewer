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
  const resolveLayerDimensions = useCallback((layer: VolumeViewerProps['layers'][number] | undefined) => {
    if (!layer) {
      return null;
    }

    const pageTable = layer.brickAtlas?.pageTable ?? layer.brickPageTable ?? null;
    const width = Math.max(
      0,
      Math.floor(layer.fullResolutionWidth || layer.volume?.width || pageTable?.volumeShape[2] || 0),
    );
    const height = Math.max(
      0,
      Math.floor(layer.fullResolutionHeight || layer.volume?.height || pageTable?.volumeShape[1] || 0),
    );
    const depth = Math.max(
      0,
      Math.floor(layer.fullResolutionDepth || layer.volume?.depth || pageTable?.volumeShape[0] || 0),
    );

    if (width <= 0 || height <= 0 || depth <= 0) {
      return null;
    }

    return { width, height, depth };
  }, []);

  const computeFollowedVoxelPosition = useCallback(
    (target: FollowedVoxelTarget) => {
      const volumeRootGroup = volumeRootGroupRef.current;
      if (!volumeRootGroup) {
        return null;
      }

      const layer = layersRef.current.find((entry) => entry.key === target.layerKey);
      const dimensions = resolveLayerDimensions(layer);
      if (!layer || !dimensions) {
        return null;
      }

      const clampedX = THREE.MathUtils.clamp(target.coordinates.x, 0, dimensions.width - 1);
      const clampedY = THREE.MathUtils.clamp(target.coordinates.y, 0, dimensions.height - 1);
      const clampedZ = THREE.MathUtils.clamp(target.coordinates.z, 0, dimensions.depth - 1);

      const localPosition = new THREE.Vector3(
        clampedX + (layer.offsetX ?? 0),
        clampedY + (layer.offsetY ?? 0),
        clampedZ,
      );

      volumeRootGroup.updateMatrixWorld(true);
      return volumeRootGroup.localToWorld(localPosition);
    },
    [layersRef, resolveLayerDimensions, volumeRootGroupRef],
  );

  const resolveHoveredFollowTarget = useCallback((): FollowedVoxelTarget | null => {
    const hovered = hoveredVoxelRef.current;
    const normalizedPosition = hovered?.normalizedPosition;
    const layerKey = hovered?.layerKey;

    if (!normalizedPosition || !layerKey) {
      return null;
    }

    const layer = layersRef.current.find((entry) => entry.key === layerKey);
    const dimensions = resolveLayerDimensions(layer);
    if (!layer || !dimensions) {
      return null;
    }

    return {
      layerKey,
      coordinates: {
        x: Math.round(THREE.MathUtils.clamp(normalizedPosition.x * dimensions.width, 0, dimensions.width - 1)),
        y: Math.round(THREE.MathUtils.clamp(normalizedPosition.y * dimensions.height, 0, dimensions.height - 1)),
        z: Math.round(THREE.MathUtils.clamp(normalizedPosition.z * dimensions.depth, 0, dimensions.depth - 1)),
      },
    };
  }, [hoveredVoxelRef, layersRef, resolveLayerDimensions]);

  return {
    computeFollowedVoxelPosition,
    resolveHoveredFollowTarget,
  };
}
