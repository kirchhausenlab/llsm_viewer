import { useCallback } from 'react';
import type { MutableRefObject } from 'react';
import * as THREE from 'three';

import type { FollowedVoxelTarget, VolumeResources, VolumeViewerProps } from '../VolumeViewer.types';

type UseVolumeViewerFollowTargetParams = {
  layersRef: MutableRefObject<VolumeViewerProps['layers']>;
  resourcesRef: MutableRefObject<Map<string, VolumeResources>>;
  volumeRootGroupRef: MutableRefObject<THREE.Group | null>;
  hoveredVoxelRef: MutableRefObject<{
    layerKey: string | null;
    normalizedPosition: THREE.Vector3 | null;
  }>;
};

function firstPositiveDimension(...values: number[]): number {
  for (const value of values) {
    if (Number.isFinite(value) && value > 0) {
      return value;
    }
  }
  return 0;
}

function resolveFollowSpaceDimensions(
  layer: VolumeViewerProps['layers'][number],
  resource: VolumeResources | null,
): { width: number; height: number; depth: number } | null {
  const volume = layer.volume ?? null;
  const pageTable =
    layer.brickPageTable ??
    layer.brickAtlas?.pageTable ??
    resource?.brickAtlasSourcePageTable ??
    resource?.brickMetadataSourcePageTable ??
    null;

  const width = firstPositiveDimension(
    resource?.dimensions.width ?? 0,
    volume?.width ?? 0,
    layer.fullResolutionWidth,
    pageTable?.volumeShape[2] ?? 0,
  );
  const height = firstPositiveDimension(
    resource?.dimensions.height ?? 0,
    volume?.height ?? 0,
    layer.fullResolutionHeight,
    pageTable?.volumeShape[1] ?? 0,
  );
  const depth = firstPositiveDimension(
    resource?.dimensions.depth ?? 0,
    volume?.depth ?? 0,
    layer.fullResolutionDepth,
    pageTable?.volumeShape[0] ?? 0,
  );

  if (width <= 0 || height <= 0 || depth <= 0) {
    return null;
  }

  return { width, height, depth };
}

export function useVolumeViewerFollowTarget({
  layersRef,
  resourcesRef,
  volumeRootGroupRef,
  hoveredVoxelRef,
}: UseVolumeViewerFollowTargetParams) {
  const computeFollowedVoxelPosition = useCallback(
    (target: FollowedVoxelTarget) => {
      const layer = layersRef.current.find((entry) => entry.key === target.layerKey);
      if (!layer) {
        return null;
      }

      const resource = resourcesRef.current.get(target.layerKey) ?? null;
      const dimensions = resolveFollowSpaceDimensions(layer, resource);
      if (!dimensions) {
        return null;
      }

      const clampedX = THREE.MathUtils.clamp(target.coordinates.x, 0, dimensions.width - 1);
      const clampedY = THREE.MathUtils.clamp(target.coordinates.y, 0, dimensions.height - 1);
      const clampedZ = THREE.MathUtils.clamp(target.coordinates.z, 0, dimensions.depth - 1);

      const localPosition = new THREE.Vector3(clampedX, clampedY, clampedZ);

      const mesh = resource?.mesh ?? null;
      if (mesh) {
        mesh.updateMatrixWorld(true);
        return mesh.localToWorld(localPosition);
      }

      const volumeRootGroup = volumeRootGroupRef.current;
      if (!volumeRootGroup) {
        return null;
      }

      localPosition.x += layer.offsetX ?? 0;
      localPosition.y += layer.offsetY ?? 0;

      volumeRootGroup.updateMatrixWorld(true);
      return volumeRootGroup.localToWorld(localPosition);
    },
    [layersRef, resourcesRef, volumeRootGroupRef],
  );

  const resolveHoveredFollowTarget = useCallback((): FollowedVoxelTarget | null => {
    const hovered = hoveredVoxelRef.current;
    const normalizedPosition = hovered?.normalizedPosition;
    const layerKey = hovered?.layerKey;

    if (!normalizedPosition || !layerKey) {
      return null;
    }

    const layer = layersRef.current.find((entry) => entry.key === layerKey);
    if (!layer) {
      return null;
    }

    const resource = resourcesRef.current.get(layerKey) ?? null;
    const dimensions = resolveFollowSpaceDimensions(layer, resource);
    if (!dimensions) {
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
  }, [hoveredVoxelRef, layersRef, resourcesRef]);

  return {
    computeFollowedVoxelPosition,
    resolveHoveredFollowTarget,
  };
}
