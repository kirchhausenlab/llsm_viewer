import { useCallback, useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import * as THREE from 'three';

import { formatChannelValuesDetailed } from '../../../shared/utils/intensityFormatting';
import { clampValue, sampleRawValuesAtPosition, sampleSegmentationLabel } from '../../../shared/utils/hoverSampling';
import type { NormalizedVolume } from '../../../core/volumeProcessing';
import type { HoveredVoxelInfo } from '../../../types/hover';
import type { ViewerLayer, VolumeResources } from '../VolumeViewer.types';
import {
  hoverBoundingBox,
  hoverEntryOffset,
  hoverEntryPoint,
  hoverEnd,
  hoverExitPoint,
  hoverExitRay,
  hoverInverseMatrix,
  hoverLayerMatrix,
  hoverLayerOffsetMatrix,
  hoverLocalRay,
  hoverMaxPosition,
  hoverPointerVector,
  hoverRayDirection,
  hoverRefineStep,
  hoverSample,
  hoverStart,
  hoverStartNormalized,
  hoverStep,
  hoverVolumeSize,
  MIP_MAX_STEPS,
  MIP_REFINEMENT_STEPS,
} from './rendering';
import { resolveVolumeHoverLayerSelection } from './volumeHoverTargetLayer';
import {
  adjustWindowedIntensity,
  computeVolumeLuminance,
  sampleVolumeAtNormalizedPosition,
} from './volumeHoverSampling';

export type UseVolumeHoverParams = {
  layersRef: MutableRefObject<ViewerLayer[]>;
  resourcesRef: MutableRefObject<Map<string, VolumeResources>>;
  hoverRaycasterRef: MutableRefObject<THREE.Raycaster | null>;
  volumeRootGroupRef: MutableRefObject<THREE.Group | null>;
  volumeStepScaleRef: MutableRefObject<number>;
  hoveredVoxelRef: MutableRefObject<{
    layerKey: string | null;
    normalizedPosition: THREE.Vector3 | null;
    segmentationLabel: number | null;
  }>;
  rendererRef: MutableRefObject<THREE.WebGLRenderer | null>;
  cameraRef: MutableRefObject<THREE.PerspectiveCamera | null>;
  applyHoverHighlightToResources: () => void;
  emitHoverVoxel: (hovered: HoveredVoxelInfo | null) => void;
  clearVoxelHover: () => void;
  reportVoxelHoverAbort: (reason: string) => void;
  clearVoxelHoverDebug: () => void;
  setHoverNotReady: (message: string) => void;
  isAdditiveBlending: boolean;
};

export function useVolumeHover({
  layersRef,
  resourcesRef,
  hoverRaycasterRef,
  volumeRootGroupRef,
  volumeStepScaleRef,
  hoveredVoxelRef,
  rendererRef,
  cameraRef,
  applyHoverHighlightToResources,
  emitHoverVoxel,
  clearVoxelHover,
  reportVoxelHoverAbort,
  clearVoxelHoverDebug,
  setHoverNotReady,
  isAdditiveBlending,
}: UseVolumeHoverParams) {
  const hoverTeardownRef = useRef(false);
  const hoverInitializationFailedRef = useRef(false);
  const hoverSystemReadyRef = useRef(false);
  const pendingHoverEventRef = useRef<PointerEvent | MouseEvent | null>(null);
  const hoverRetryFrameRef = useRef<number | null>(null);
  const updateVoxelHoverRef = useRef<(event: PointerEvent | MouseEvent) => void>(() => {});

  const retryPendingVoxelHover = useCallback(() => {
    const pendingEvent = pendingHoverEventRef.current;
    if (!pendingEvent) {
      return;
    }

    if (hoverTeardownRef.current) {
      pendingHoverEventRef.current = null;
      return;
    }

    if (hoverInitializationFailedRef.current) {
      pendingHoverEventRef.current = null;
      setHoverNotReady('Hover inactive: renderer not initialized.');
      return;
    }

    const renderer = rendererRef.current;
    const cameraInstance = cameraRef.current;
    const raycasterInstance = hoverRaycasterRef.current;
    const hasHoverRefs = renderer !== null && cameraInstance !== null && raycasterInstance !== null;

    if (!hoverSystemReadyRef.current || !hasHoverRefs) {
      if (!hoverSystemReadyRef.current) {
        setHoverNotReady('Hover inactive: renderer not initialized.');
      } else if (!hasHoverRefs) {
        setHoverNotReady('Hover inactive: hover dependencies missing.');
      }

      if (hoverRetryFrameRef.current !== null) {
        cancelAnimationFrame(hoverRetryFrameRef.current);
      }

      hoverRetryFrameRef.current = requestAnimationFrame(() => {
        hoverRetryFrameRef.current = null;
        if (hoverTeardownRef.current) {
          return;
        }
        retryPendingVoxelHover();
      });
      return;
    }

    if (hoverRetryFrameRef.current !== null) {
      cancelAnimationFrame(hoverRetryFrameRef.current);
      hoverRetryFrameRef.current = null;
    }

    pendingHoverEventRef.current = null;
    updateVoxelHoverRef.current(pendingEvent);
  }, [cameraRef, hoverRaycasterRef, rendererRef, setHoverNotReady]);

  const updateVoxelHover = useCallback(
    (event: PointerEvent | MouseEvent) => {
      if (hoverTeardownRef.current) {
        pendingHoverEventRef.current = null;
        return;
      }

      if (!hoverSystemReadyRef.current) {
        if (hoverInitializationFailedRef.current) {
          pendingHoverEventRef.current = null;
          setHoverNotReady('Hover inactive: renderer not initialized.');
        } else {
          pendingHoverEventRef.current = event;
          setHoverNotReady('Hover inactive: renderer not initialized.');
          retryPendingVoxelHover();
        }
        return;
      }

      const renderer = rendererRef.current;
      const cameraInstance = cameraRef.current;
      const raycasterInstance = hoverRaycasterRef.current;
      if (!renderer || !cameraInstance || !raycasterInstance) {
        pendingHoverEventRef.current = event;
        setHoverNotReady('Hover inactive: hover dependencies missing.');
        retryPendingVoxelHover();
        return;
      }

      if (renderer.xr?.isPresenting) {
        reportVoxelHoverAbort('Hover sampling disabled while XR session is active.');
        return;
      }

      const domElement = renderer.domElement;
      const rect = domElement.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;
      if (width <= 0 || height <= 0) {
        reportVoxelHoverAbort('Render surface has no measurable area.');
        return;
      }

      const offsetX = event.clientX - rect.left;
      const offsetY = event.clientY - rect.top;
      if (offsetX < 0 || offsetY < 0 || offsetX > width || offsetY > height) {
        clearVoxelHoverDebug();
        clearVoxelHover();
        return;
      }

      const { hoverableLayers, targetLayer, resource } = resolveVolumeHoverLayerSelection(
        layersRef.current,
        resourcesRef.current,
      );

      if (!targetLayer || !targetLayer.volume) {
        reportVoxelHoverAbort('No visible 3D-capable volume layer is available.');
        return;
      }

      const volume = targetLayer.volume;
      hoverVolumeSize.set(volume.width, volume.height, volume.depth);

      const useGpuHover = resource?.mode === '3d';
      const useSliceResource = resource?.mode === 'slice' && volume.depth > 1;
      let boundingBox: THREE.Box3 | null = null;

      if (useGpuHover && resource) {
        const geometry = resource.mesh.geometry as THREE.BufferGeometry;
        if (!geometry.boundingBox) {
          geometry.computeBoundingBox();
        }

        boundingBox = geometry.boundingBox ?? null;
        resource.mesh.updateMatrixWorld(true);
        hoverInverseMatrix.copy(resource.mesh.matrixWorld).invert();
      } else if (useSliceResource && resource) {
        const geometry = resource.mesh.geometry as THREE.BufferGeometry;
        if (!geometry.boundingBox) {
          geometry.computeBoundingBox();
        }

        boundingBox = geometry.boundingBox ?? null;
        resource.mesh.updateMatrixWorld(true);
        hoverInverseMatrix.copy(resource.mesh.matrixWorld).invert();
      } else {
        hoverBoundingBox.min.set(-0.5, -0.5, -0.5);
        hoverBoundingBox.max.set(
          volume.width - 0.5,
          volume.height - 0.5,
          volume.depth - 0.5,
        );
        boundingBox = hoverBoundingBox;

        const volumeRootGroup = volumeRootGroupRef.current;
        hoverLayerMatrix.identity();
        if (volumeRootGroup) {
          volumeRootGroup.updateMatrixWorld(true);
          hoverLayerMatrix.copy(volumeRootGroup.matrixWorld);
        }
        hoverLayerOffsetMatrix.makeTranslation(targetLayer.offsetX, targetLayer.offsetY, 0);
        hoverLayerMatrix.multiply(hoverLayerOffsetMatrix);
        hoverInverseMatrix.copy(hoverLayerMatrix).invert();
      }

      if (!boundingBox) {
        reportVoxelHoverAbort('Unable to compute a bounding box for hover sampling.');
        return;
      }

      hoverPointerVector.set((offsetX / width) * 2 - 1, -(offsetY / height) * 2 + 1);
      raycasterInstance.setFromCamera(hoverPointerVector, cameraInstance);
      hoverLocalRay.copy(raycasterInstance.ray).applyMatrix4(hoverInverseMatrix);

      const isInsideBoundingBox = boundingBox.containsPoint(hoverLocalRay.origin);
      let hasEntry = false;
      if (isInsideBoundingBox) {
        hoverEntryPoint.copy(hoverLocalRay.origin);
        hasEntry = true;
      } else {
        const entryHit = hoverLocalRay.intersectBox(boundingBox, hoverEntryPoint);
        hasEntry = entryHit !== null;
      }

      hoverRayDirection.copy(hoverLocalRay.direction).normalize();
      hoverEntryOffset.copy(hoverRayDirection).multiplyScalar(1e-4);
      hoverExitRay.origin.copy(isInsideBoundingBox ? hoverLocalRay.origin : hoverEntryPoint);
      hoverExitRay.origin.add(hoverEntryOffset);
      hoverExitRay.direction.copy(hoverRayDirection);
      const exitHit = hoverExitRay.intersectBox(boundingBox, hoverExitPoint);
      const hasExit = exitHit !== null;

      if (!hasEntry || !hasExit) {
        reportVoxelHoverAbort('Ray does not intersect the target volume.');
        return;
      }

      const entryDistance = hoverLocalRay.origin.distanceTo(hoverEntryPoint);
      const exitDistance = hoverLocalRay.origin.distanceTo(hoverExitPoint);
      hoverStart.copy(entryDistance <= exitDistance ? hoverEntryPoint : hoverExitPoint);
      hoverEnd.copy(entryDistance <= exitDistance ? hoverExitPoint : hoverEntryPoint);

      const safeStepScale = Math.max(volumeStepScaleRef.current, 1e-3);
      const travelDistance = hoverEnd.distanceTo(hoverStart);
      let nsteps = Math.round(travelDistance * safeStepScale);
      nsteps = clampValue(nsteps, 1, MIP_MAX_STEPS);

      hoverStartNormalized.copy(hoverStart).divide(hoverVolumeSize);
      hoverStep.copy(hoverEnd).sub(hoverStart).divide(hoverVolumeSize).divideScalar(nsteps);
      hoverSample.copy(hoverStartNormalized);

      const channels = Math.max(1, volume.channels);

      let maxValue = -Infinity;
      let maxIndex = 0;
      hoverMaxPosition.copy(hoverSample);
      let maxRawValues: number[] = [];

      const highWaterMark = targetLayer.invert ? 0.001 : 0.999;

      for (let i = 0; i < nsteps; i++) {
        const sample = sampleVolumeAtNormalizedPosition(volume, hoverSample);
        const luminance = computeVolumeLuminance(sample.normalizedValues, channels);
        const adjusted = adjustWindowedIntensity(
          luminance,
          targetLayer.windowMin,
          targetLayer.windowMax,
          targetLayer.invert,
        );
        if (adjusted > maxValue) {
          maxValue = adjusted;
          maxIndex = i;
          hoverMaxPosition.copy(hoverSample);
          maxRawValues = sample.rawValues;

          if ((!targetLayer.invert && maxValue >= highWaterMark) || (targetLayer.invert && maxValue <= highWaterMark)) {
            break;
          }
        }

        hoverSample.add(hoverStep);
      }

      hoverSample.copy(hoverStartNormalized).addScaledVector(hoverStep, maxIndex - 0.5);
      hoverRefineStep.copy(hoverStep).divideScalar(MIP_REFINEMENT_STEPS);

      for (let i = 0; i < MIP_REFINEMENT_STEPS; i++) {
        const sample = sampleVolumeAtNormalizedPosition(volume, hoverSample);
        const luminance = computeVolumeLuminance(sample.normalizedValues, channels);
        const adjusted = adjustWindowedIntensity(
          luminance,
          targetLayer.windowMin,
          targetLayer.windowMax,
          targetLayer.invert,
        );
        if (adjusted > maxValue) {
          maxValue = adjusted;
          hoverMaxPosition.copy(hoverSample);
          maxRawValues = sample.rawValues;
        }
        hoverSample.add(hoverRefineStep);
      }

      if (!Number.isFinite(maxValue) || maxRawValues.length === 0) {
        reportVoxelHoverAbort('No finite intensity was found along the hover ray.');
        return;
      }

      hoverMaxPosition.set(
        clampValue(hoverMaxPosition.x, 0, 1),
        clampValue(hoverMaxPosition.y, 0, 1),
        clampValue(hoverMaxPosition.z, 0, 1),
      );

      const hoveredSegmentationLabel =
        targetLayer.isSegmentation && targetLayer.volume?.segmentationLabels
          ? sampleSegmentationLabel(targetLayer.volume, hoverMaxPosition)
          : null;

      const displayLayers = isAdditiveBlending && hoverableLayers.length > 0 ? hoverableLayers : [targetLayer];
      const useLayerLabels = isAdditiveBlending && displayLayers.length > 1;
      const samples: Array<{
        values: number[];
        type: NormalizedVolume['dataType'];
        label: string | null;
        color: string;
      }> = [];

      for (const layer of displayLayers) {
        const layerVolume = layer.volume;
        if (!layerVolume) {
          continue;
        }

        let displayValues: number[] | null = null;

        if (layer.isSegmentation && layerVolume.segmentationLabels) {
          const labelValue =
            layer.key === targetLayer.key && hoveredSegmentationLabel !== null
              ? hoveredSegmentationLabel
              : sampleSegmentationLabel(layerVolume, hoverMaxPosition);
          if (labelValue !== null) {
            displayValues = [labelValue];
          }
        }

        if (!displayValues) {
          displayValues = layer.key === targetLayer.key
            ? maxRawValues
            : sampleRawValuesAtPosition(layerVolume, hoverMaxPosition);
        }

        if (!displayValues || displayValues.length === 0) {
          continue;
        }

        const channelLabel = layer.channelName?.trim() || layer.label?.trim() || null;
        samples.push({
          values: displayValues,
          type: layerVolume.dataType,
          label: useLayerLabels ? channelLabel : null,
          color: layer.color,
        });
      }

      const totalValues = samples.reduce((sum, sample) => sum + sample.values.length, 0);
      if (totalValues === 0) {
        reportVoxelHoverAbort('Unable to format hover intensity for display.');
        return;
      }

      const includeLabel = totalValues > 1;
      const intensityParts = samples.flatMap((sample) =>
        formatChannelValuesDetailed(sample.values, sample.type, sample.label, includeLabel).map((entry) => ({
          text: entry.text,
          color: sample.color,
        })),
      );

      if (intensityParts.length === 0) {
        reportVoxelHoverAbort('Unable to format hover intensity for display.');
        return;
      }

      clearVoxelHoverDebug();

      const hoveredVoxel = {
        intensity: intensityParts.map((entry) => entry.text).join(' · '),
        components: intensityParts.map((entry) => ({ text: entry.text, color: entry.color })),
        coordinates: {
          x: Math.round(clampValue(hoverMaxPosition.x * volume.width, 0, volume.width - 1)),
          y: Math.round(clampValue(hoverMaxPosition.y * volume.height, 0, volume.height - 1)),
          z: Math.round(clampValue(hoverMaxPosition.z * volume.depth, 0, volume.depth - 1))
        }
      } satisfies HoveredVoxelInfo;

      emitHoverVoxel(hoveredVoxel);
      hoveredVoxelRef.current = {
        layerKey: targetLayer.key,
        normalizedPosition: hoverMaxPosition.clone(),
        segmentationLabel: hoveredSegmentationLabel,
      };
      applyHoverHighlightToResources();
    },
    [
      applyHoverHighlightToResources,
      clearVoxelHover,
      clearVoxelHoverDebug,
      emitHoverVoxel,
      hoverRaycasterRef,
      layersRef,
      rendererRef,
      cameraRef,
      reportVoxelHoverAbort,
      resourcesRef,
      retryPendingVoxelHover,
      setHoverNotReady,
      volumeRootGroupRef,
      volumeStepScaleRef,
      isAdditiveBlending,
    ],
  );
  updateVoxelHoverRef.current = updateVoxelHover;

  const resetHoverState = useCallback(() => {
    hoverTeardownRef.current = false;
    hoverInitializationFailedRef.current = false;
    hoverSystemReadyRef.current = false;
  }, []);

  const markHoverInitializationFailed = useCallback(() => {
    hoverInitializationFailedRef.current = true;
  }, []);

  const markHoverInitialized = useCallback(
    (raycaster: THREE.Raycaster) => {
      hoverRaycasterRef.current = raycaster;
      clearVoxelHoverDebug();
      hoverSystemReadyRef.current = true;
      retryPendingVoxelHover();
    },
    [clearVoxelHoverDebug, hoverRaycasterRef, retryPendingVoxelHover],
  );

  const teardownHover = useCallback(() => {
    hoverTeardownRef.current = true;
    hoverSystemReadyRef.current = false;
    pendingHoverEventRef.current = null;
    hoverRaycasterRef.current = null;
    if (hoverRetryFrameRef.current !== null) {
      cancelAnimationFrame(hoverRetryFrameRef.current);
      hoverRetryFrameRef.current = null;
    }
  }, [hoverRaycasterRef]);

  useEffect(() => {
    return () => {
      emitHoverVoxel(null);
    };
  }, [emitHoverVoxel]);

  return {
    hoverRaycasterRef,
    updateVoxelHover,
    retryPendingVoxelHover,
    resetHoverState,
    markHoverInitializationFailed,
    markHoverInitialized,
    teardownHover,
  };
}
