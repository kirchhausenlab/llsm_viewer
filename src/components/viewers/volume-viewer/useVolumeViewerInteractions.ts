import { useCallback } from 'react';
import * as THREE from 'three';
import type { MutableRefObject } from 'react';
import { HOVER_HIGHLIGHT_RADIUS_VOXELS } from './rendering';
import type { HoveredVoxelInfo } from '../../../types/hover';
import type { VolumeResources, VolumeViewerProps } from '../VolumeViewer.types';

export function useVolumeViewerInteractions({
  layersRef,
  resourcesRef,
  hoveredVoxelRef,
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
      if (resource.mode !== '3d') {
        continue;
      }
      const uniforms = (resource.mesh.material as THREE.ShaderMaterial).uniforms;
      const layer = layersByKey.get(key);
      const isSegmentationLayer = Boolean(layer?.isSegmentation);
      const hasHoverLabel = Number.isFinite(segmentationLabel);
      const isActive = Boolean(layerKey && normalizedPosition && layerKey === key);
      if (uniforms.u_hoverActive) {
        uniforms.u_hoverActive.value = isActive ? 1 : 0;
      }
      if (uniforms.u_hoverSegmentationMode) {
        uniforms.u_hoverSegmentationMode.value = isActive && isSegmentationLayer && hasHoverLabel ? 1 : 0;
      }
      if (uniforms.u_hoverLabel) {
        uniforms.u_hoverLabel.value = hasHoverLabel ? (segmentationLabel as number) : 0;
      }
      if (uniforms.u_segmentationLabels) {
        uniforms.u_segmentationLabels.value = resource.labelTexture ?? null;
      }
      if (
        isActive &&
        normalizedPosition &&
        uniforms.u_hoverPos &&
        uniforms.u_hoverRadius &&
        uniforms.u_hoverScale
      ) {
        uniforms.u_hoverPos.value.copy(normalizedPosition);
        uniforms.u_hoverScale.value.set(
          resource.dimensions.width,
          resource.dimensions.height,
          resource.dimensions.depth,
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
  }, [hoveredVoxelRef, layersRef, resourcesRef]);

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
        if (left[i].text !== right[i].text || left[i].color !== right[i].color) {
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
    (reason: string | null) => {
      if (reason === null) {
        voxelHoverDebugRef.current = null;
        setVoxelHoverDebug(null);
        return;
      }

      reportVoxelHoverAbort(reason);
    },
    [reportVoxelHoverAbort, setVoxelHoverDebug, voxelHoverDebugRef],
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
