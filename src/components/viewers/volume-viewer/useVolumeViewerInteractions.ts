import { useCallback } from 'react';
import * as THREE from 'three';
import type { MutableRefObject } from 'react';
import { HOVER_HIGHLIGHT_RADIUS_VOXELS } from './rendering';
import type { HoveredVoxelInfo } from '../../../types/hover';
import type { VolumeResources, VolumeViewerProps } from '../VolumeViewer.types';

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}

function resolveSliceTextureSize(resource: VolumeResources): { width: number; height: number } {
  const texture = resource.texture;
  if (!(texture instanceof THREE.DataTexture)) {
    return { width: 1, height: 1 };
  }
  const image = texture.image as { width?: number; height?: number } | null | undefined;
  return {
    width: Math.max(1, Number(image?.width ?? 1)),
    height: Math.max(1, Number(image?.height ?? 1)),
  };
}

function resolveSliceSubdivisions({
  layer,
  sliceWidth,
  sliceHeight,
}: {
  layer: VolumeViewerProps['layers'][number] | undefined;
  sliceWidth: number;
  sliceHeight: number;
}): { x: number; y: number } {
  const fullWidth =
    Number.isFinite(layer?.fullResolutionWidth) && (layer?.fullResolutionWidth ?? 0) > 0
      ? Number(layer?.fullResolutionWidth)
      : sliceWidth;
  const fullHeight =
    Number.isFinite(layer?.fullResolutionHeight) && (layer?.fullResolutionHeight ?? 0) > 0
      ? Number(layer?.fullResolutionHeight)
      : sliceHeight;
  return {
    x: Math.max(1, Math.round(fullWidth / sliceWidth)),
    y: Math.max(1, Math.round(fullHeight / sliceHeight)),
  };
}

export function useVolumeViewerInteractions({
  layersRef,
  resourcesRef,
  hoveredVoxelRef,
  volumeAnisotropyScaleRef,
  hoverIntensityRef,
  voxelHoverDebugRef,
  setVoxelHoverDebug,
  isDevMode,
  onHoverVoxelChange,
}: {
  layersRef: MutableRefObject<VolumeViewerProps['layers']>;
  resourcesRef: MutableRefObject<Map<string, VolumeResources>>;
  hoveredVoxelRef: MutableRefObject<{
    layerKey: string | null;
    normalizedPosition: THREE.Vector3 | null;
    segmentationLabel: number | null;
  }>;
  volumeAnisotropyScaleRef: MutableRefObject<{ x: number; y: number; z: number }>;
  hoverIntensityRef: MutableRefObject<HoveredVoxelInfo | null>;
  voxelHoverDebugRef: MutableRefObject<string | null>;
  setVoxelHoverDebug: (value: string | null) => void;
  isDevMode: boolean;
  onHoverVoxelChange?: (value: HoveredVoxelInfo | null) => void;
}) {
  const applyHoverHighlightToResources = useCallback(() => {
    const { layerKey, normalizedPosition, segmentationLabel } = hoveredVoxelRef.current ?? {};
    const layers = layersRef.current ?? [];
    const layersByKey = new Map(layers.map((layer) => [layer.key, layer]));
    for (const [key, resource] of resourcesRef.current?.entries() ?? []) {
      const uniforms = (resource.mesh.material as THREE.ShaderMaterial).uniforms;
      const layer = layersByKey.get(key);
      const isActive = Boolean(layerKey && normalizedPosition && layerKey === key);

      if (resource.mode === 'slice') {
        if (uniforms.u_hoverActive) {
          uniforms.u_hoverActive.value = isActive ? 1 : 0;
        }

        const sliceSize = resolveSliceTextureSize(resource);
        if (uniforms.u_sliceSize) {
          (uniforms.u_sliceSize.value as THREE.Vector2).set(sliceSize.width, sliceSize.height);
        }
        if (uniforms.u_hoverOutlineColor) {
          (uniforms.u_hoverOutlineColor.value as THREE.Vector3).set(1.0, 0.95, 0.72);
        }

        if (uniforms.u_hoverPixel) {
          if (isActive && normalizedPosition) {
            const pixelX = Math.floor(clampNumber(normalizedPosition.x * sliceSize.width, 0, sliceSize.width - 1));
            const pixelY = Math.floor(clampNumber(normalizedPosition.y * sliceSize.height, 0, sliceSize.height - 1));
            (uniforms.u_hoverPixel.value as THREE.Vector2).set(pixelX, pixelY);
            if (uniforms.u_hoverGridSubdivisions) {
              const subdivisions = resolveSliceSubdivisions({
                layer,
                sliceWidth: sliceSize.width,
                sliceHeight: sliceSize.height,
              });
              (uniforms.u_hoverGridSubdivisions.value as THREE.Vector2).set(subdivisions.x, subdivisions.y);
            }
          } else {
            (uniforms.u_hoverPixel.value as THREE.Vector2).set(-1, -1);
            if (uniforms.u_hoverGridSubdivisions) {
              (uniforms.u_hoverGridSubdivisions.value as THREE.Vector2).set(1, 1);
            }
          }
        }
        continue;
      }

      if (resource.mode !== '3d') {
        continue;
      }
      const isSegmentationLayer = Boolean(layer?.isSegmentation);
      const hasHoverLabel = Number.isFinite(segmentationLabel);
      if (uniforms.u_hoverActive) {
        uniforms.u_hoverActive.value = isActive ? 1 : 0;
      }
      if (uniforms.u_hoverSegmentationMode) {
        uniforms.u_hoverSegmentationMode.value = isActive && isSegmentationLayer && hasHoverLabel ? 1 : 0;
      }
      if (uniforms.u_hoverLabel) {
        uniforms.u_hoverLabel.value = hasHoverLabel ? (segmentationLabel as number) : 0;
      }
      if (
        isActive &&
        normalizedPosition &&
        uniforms.u_hoverPos &&
        uniforms.u_hoverRadius &&
        uniforms.u_hoverScale
      ) {
        uniforms.u_hoverPos.value.copy(normalizedPosition);
        const scale = volumeAnisotropyScaleRef.current;
        const scaleX = Number.isFinite(scale?.x) && scale.x > 0 ? scale.x : 1;
        const scaleY = Number.isFinite(scale?.y) && scale.y > 0 ? scale.y : 1;
        const scaleZ = Number.isFinite(scale?.z) && scale.z > 0 ? scale.z : 1;
        uniforms.u_hoverScale.value.set(
          resource.dimensions.width * scaleX,
          resource.dimensions.height * scaleY,
          resource.dimensions.depth * scaleZ,
        );
        uniforms.u_hoverRadius.value = HOVER_HIGHLIGHT_RADIUS_VOXELS;
      } else {
        if (uniforms.u_hoverRadius) {
          uniforms.u_hoverRadius.value = 0;
        }
        if (uniforms.u_hoverScale) {
          uniforms.u_hoverScale.value.set(0, 0, 0);
        }
      }
    }
  }, [hoveredVoxelRef, layersRef, resourcesRef, volumeAnisotropyScaleRef]);

  const areHoverComponentsEqual = useCallback(
    (
      a: HoveredVoxelInfo['components'] | undefined,
      b: HoveredVoxelInfo['components'] | undefined,
    ) => {
      const left = a ?? [];
      const right = b ?? [];
      if (left.length !== right.length) {
        return false;
      }
      for (let i = 0; i < left.length; i++) {
        if (
          left[i].text !== right[i].text ||
          left[i].channelLabel !== right[i].channelLabel ||
          left[i].color !== right[i].color
        ) {
          return false;
        }
      }
      return true;
    },
    [],
  );

  const emitHoverVoxel = useCallback(
    (value: HoveredVoxelInfo | null) => {
      const previous = hoverIntensityRef.current;
      const isSame =
        (previous === null && value === null) ||
        (previous !== null &&
          value !== null &&
          previous.intensity === value.intensity &&
          previous.coordinates.x === value.coordinates.x &&
          previous.coordinates.y === value.coordinates.y &&
          previous.coordinates.z === value.coordinates.z &&
          areHoverComponentsEqual(previous.components, value.components));

      if (isSame) {
        return;
      }
      hoverIntensityRef.current = value;
      onHoverVoxelChange?.(value);
    },
    [areHoverComponentsEqual, hoverIntensityRef, onHoverVoxelChange],
  );

  const clearVoxelHover = useCallback(() => {
    emitHoverVoxel(null);
    if (hoveredVoxelRef.current) {
      hoveredVoxelRef.current = { layerKey: null, normalizedPosition: null, segmentationLabel: null };
    }
    applyHoverHighlightToResources();
  }, [applyHoverHighlightToResources, emitHoverVoxel, hoveredVoxelRef]);

  const reportVoxelHoverAbort = useCallback(
    (reason: string) => {
      if (voxelHoverDebugRef.current !== reason && isDevMode) {
        console.debug('[voxel-hover]', reason);
      }
      if (isDevMode) {
        voxelHoverDebugRef.current = reason;
        setVoxelHoverDebug(reason);
      } else {
        voxelHoverDebugRef.current = null;
        setVoxelHoverDebug(null);
      }
      clearVoxelHover();
    },
    [clearVoxelHover, isDevMode, setVoxelHoverDebug, voxelHoverDebugRef],
  );

  const clearVoxelHoverDebug = useCallback(() => {
    voxelHoverDebugRef.current = null;
    if (isDevMode) {
      setVoxelHoverDebug(null);
    }
  }, [isDevMode, setVoxelHoverDebug, voxelHoverDebugRef]);

  const setHoverNotReady = useCallback(
    (reason: string) => {
      reportVoxelHoverAbort(reason);
    },
    [reportVoxelHoverAbort],
  );

  return {
    applyHoverHighlightToResources,
    emitHoverVoxel,
    clearVoxelHover,
    reportVoxelHoverAbort,
    clearVoxelHoverDebug,
    setHoverNotReady,
  } as const;
}
