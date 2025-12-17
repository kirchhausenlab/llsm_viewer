import type { MutableRefObject } from 'react';
import * as THREE from 'three';

import {
  applyVolumeRootTransform as applyVolumeRootTransformWithRefs,
  applyVolumeYawPitch as applyVolumeYawPitchWithRefs,
  updateVolumeHandles as updateVolumeHandlesWithRefs,
} from '../../vr';
import type { VolumeDimensions } from '../../vr';
import type { VolumeResources } from '../../../VolumeViewer.types';

export type CreateVolumeHelpersParams = {
  rendererRef: MutableRefObject<THREE.WebGLRenderer | null>;
  volumeRootGroupRef: MutableRefObject<THREE.Group | null>;
  currentDimensionsRef: MutableRefObject<VolumeDimensions | null>;
  hasActive3DLayerRef: MutableRefObject<boolean>;
  volumeUserScaleRef: MutableRefObject<number>;
  volumeRootCenterUnscaledRef: MutableRefObject<THREE.Vector3>;
  volumeRootHalfExtentsRef: MutableRefObject<THREE.Vector3>;
  vrHandleLocalPointRef: MutableRefObject<THREE.Vector3>;
  vrTranslationHandleRef: MutableRefObject<THREE.Mesh | null>;
  vrVolumeScaleHandleRef: MutableRefObject<THREE.Mesh | null>;
  vrVolumeYawHandlesRef: MutableRefObject<THREE.Mesh[]>;
  vrVolumePitchHandleRef: MutableRefObject<THREE.Mesh | null>;
  volumeRootBaseOffsetRef: MutableRefObject<THREE.Vector3>;
  volumeRootCenterOffsetRef: MutableRefObject<THREE.Vector3>;
  volumeRootRotatedCenterTempRef: MutableRefObject<THREE.Vector3>;
  volumeYawRef: MutableRefObject<number>;
  volumePitchRef: MutableRefObject<number>;
  vrHudYawEulerRef: MutableRefObject<THREE.Euler>;
  vrHandleQuaternionTempRef: MutableRefObject<THREE.Quaternion>;
  volumeNormalizationScaleRef: MutableRefObject<number>;
  volumeAnisotropyScaleRef: MutableRefObject<{ x: number; y: number; z: number }>;
  volumeStepScaleRef: MutableRefObject<number>;
  resourcesRef: MutableRefObject<Map<string, VolumeResources>>;
};

export type CreateVolumeHelpersResult = {
  updateVolumeHandles: () => void;
  applyVolumeYawPitch: (yaw: number, pitch: number) => void;
  applyVolumeRootTransform: (dimensions: VolumeDimensions | null) => void;
  applyVolumeStepScaleToResources: (stepScale: number) => void;
};

export function createVolumeHelpers({
  rendererRef,
  volumeRootGroupRef,
  currentDimensionsRef,
  hasActive3DLayerRef,
  volumeUserScaleRef,
  volumeRootCenterUnscaledRef,
  volumeRootHalfExtentsRef,
  vrHandleLocalPointRef,
  vrTranslationHandleRef,
  vrVolumeScaleHandleRef,
  vrVolumeYawHandlesRef,
  vrVolumePitchHandleRef,
  volumeRootBaseOffsetRef,
  volumeRootCenterOffsetRef,
  volumeRootRotatedCenterTempRef,
  volumeYawRef,
  volumePitchRef,
  vrHudYawEulerRef,
  vrHandleQuaternionTempRef,
  volumeNormalizationScaleRef,
  volumeAnisotropyScaleRef,
  volumeStepScaleRef,
  resourcesRef,
}: CreateVolumeHelpersParams): CreateVolumeHelpersResult {
  const updateVolumeHandles = () => {
    updateVolumeHandlesWithRefs({
      rendererRef,
      volumeRootGroupRef,
      currentDimensionsRef,
      hasActive3DLayerRef,
      volumeNormalizationScaleRef,
      volumeAnisotropyScaleRef,
      volumeUserScaleRef,
      volumeRootCenterUnscaledRef,
      volumeRootHalfExtentsRef,
      vrHandleLocalPointRef,
      vrTranslationHandleRef,
      vrVolumeScaleHandleRef,
      vrVolumeYawHandlesRef,
      vrVolumePitchHandleRef,
    });
  };

  const applyVolumeYawPitch = (yaw: number, pitch: number) => {
    applyVolumeYawPitchWithRefs(
      {
        rendererRef,
        volumeRootGroupRef,
        currentDimensionsRef,
        hasActive3DLayerRef,
        volumeNormalizationScaleRef,
        volumeAnisotropyScaleRef,
        volumeUserScaleRef,
        volumeRootCenterUnscaledRef,
        volumeRootHalfExtentsRef,
        vrHandleLocalPointRef,
        vrTranslationHandleRef,
        vrVolumeScaleHandleRef,
        vrVolumeYawHandlesRef,
        vrVolumePitchHandleRef,
        volumeRootBaseOffsetRef,
        volumeRootCenterOffsetRef,
        volumeRootRotatedCenterTempRef,
        volumeYawRef,
        volumePitchRef,
        vrHudYawEulerRef,
        vrHandleQuaternionTempRef,
      },
      yaw,
      pitch,
    );
  };

  const applyVolumeRootTransform = (dimensions: VolumeDimensions | null) => {
    applyVolumeRootTransformWithRefs(
      {
        rendererRef,
        volumeRootGroupRef,
        currentDimensionsRef,
        hasActive3DLayerRef,
        volumeNormalizationScaleRef,
        volumeAnisotropyScaleRef,
        volumeUserScaleRef,
        volumeRootCenterUnscaledRef,
        volumeRootHalfExtentsRef,
        vrHandleLocalPointRef,
        vrTranslationHandleRef,
        vrVolumeScaleHandleRef,
        vrVolumeYawHandlesRef,
        vrVolumePitchHandleRef,
        volumeRootBaseOffsetRef,
        volumeRootCenterOffsetRef,
        volumeRootRotatedCenterTempRef,
        volumeYawRef,
        volumePitchRef,
        vrHudYawEulerRef,
        vrHandleQuaternionTempRef,
      },
      dimensions,
    );
  };

  const applyVolumeStepScaleToResources = (stepScale: number) => {
    volumeStepScaleRef.current = stepScale;
    for (const resource of resourcesRef.current.values()) {
      if (resource.mode !== '3d') {
        continue;
      }
      const material = resource.mesh.material;
      const materialList = Array.isArray(material) ? material : [material];
      for (const entry of materialList) {
        const shaderMaterial = entry as THREE.ShaderMaterial | undefined;
        const uniforms = shaderMaterial?.uniforms as
          | Record<string, { value: unknown }>
          | undefined;
        if (uniforms && 'u_stepScale' in uniforms) {
          const stepUniform = uniforms.u_stepScale as { value: number };
          stepUniform.value = stepScale;
        }
      }
    }
  };

  return {
    updateVolumeHandles,
    applyVolumeYawPitch,
    applyVolumeRootTransform,
    applyVolumeStepScaleToResources,
  };
}
