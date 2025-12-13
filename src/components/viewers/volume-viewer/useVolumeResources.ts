import { useCallback, useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import * as THREE from 'three';

import { DEFAULT_LAYER_COLOR, normalizeHexColor } from '../../../shared/colorMaps/layerColors';
import {
  createColormapTexture,
  disposeMaterial,
  getExpectedSliceBufferLength,
  prepareSliceTexture,
} from './rendering';
import { VolumeClipmapManager } from './rendering/clipmap';
import { SliceRenderShader } from '../../../shaders/sliceRenderShader';
import { VolumeRenderShader } from '../../../shaders/volumeRenderShader';
import { getCachedTextureData } from '../../../core/textureCache';
import type { StreamableNormalizedVolume, VolumeResources } from '../VolumeViewer.types';
import { DESKTOP_VOLUME_STEP_SCALE } from './vr';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

type UseVolumeResourcesParams = {
  layers: import('../VolumeViewer.types').VolumeViewerProps['layers'];
  primaryVolume: StreamableNormalizedVolume | null;
  isAdditiveBlending: boolean;
  timeIndex: number;
  renderContextRevision: number;
  sceneRef: MutableRefObject<THREE.Scene | null>;
  cameraRef: MutableRefObject<THREE.PerspectiveCamera | null>;
  controlsRef: MutableRefObject<OrbitControls | null>;
  rotationTargetRef: MutableRefObject<THREE.Vector3>;
  defaultViewStateRef: MutableRefObject<{ position: THREE.Vector3; target: THREE.Vector3 } | null>;
  trackGroupRef: MutableRefObject<THREE.Group | null>;
  resourcesRef?: MutableRefObject<Map<string, VolumeResources>>;
  currentDimensionsRef?: MutableRefObject<{ width: number; height: number; depth: number } | null>;
  colormapCacheRef?: MutableRefObject<Map<string, THREE.DataTexture>>;
  volumeRootGroupRef?: MutableRefObject<THREE.Group | null>;
  volumeRootBaseOffsetRef?: MutableRefObject<THREE.Vector3>;
  volumeRootCenterOffsetRef?: MutableRefObject<THREE.Vector3>;
  volumeRootCenterUnscaledRef?: MutableRefObject<THREE.Vector3>;
  volumeRootHalfExtentsRef?: MutableRefObject<THREE.Vector3>;
  volumeNormalizationScaleRef?: MutableRefObject<number>;
  volumeUserScaleRef?: MutableRefObject<number>;
  volumeStepScaleRef?: MutableRefObject<number>;
  volumeYawRef?: MutableRefObject<number>;
  volumePitchRef?: MutableRefObject<number>;
  volumeRootRotatedCenterTempRef?: MutableRefObject<THREE.Vector3>;
  applyTrackGroupTransform: (dimensions: { width: number; height: number; depth: number } | null) => void;
  applyVolumeRootTransform: (dimensions: { width: number; height: number; depth: number } | null) => void;
  applyVolumeStepScaleToResources: (stepScale: number) => void;
  applyHoverHighlightToResources: () => void;
};

export function useVolumeResources({
  layers,
  primaryVolume,
  isAdditiveBlending,
  timeIndex,
  renderContextRevision,
  sceneRef,
  cameraRef,
  controlsRef,
  rotationTargetRef,
  defaultViewStateRef,
  trackGroupRef,
  resourcesRef: providedResourcesRef,
  currentDimensionsRef: providedCurrentDimensionsRef,
  colormapCacheRef: providedColormapCacheRef,
  volumeRootGroupRef: providedVolumeRootGroupRef,
  volumeRootBaseOffsetRef: providedVolumeRootBaseOffsetRef,
  volumeRootCenterOffsetRef: providedVolumeRootCenterOffsetRef,
  volumeRootCenterUnscaledRef: providedVolumeRootCenterUnscaledRef,
  volumeRootHalfExtentsRef: providedVolumeRootHalfExtentsRef,
  volumeNormalizationScaleRef: providedVolumeNormalizationScaleRef,
  volumeUserScaleRef: providedVolumeUserScaleRef,
  volumeStepScaleRef: providedVolumeStepScaleRef,
  volumeYawRef: providedVolumeYawRef,
  volumePitchRef: providedVolumePitchRef,
  volumeRootRotatedCenterTempRef: providedVolumeRootRotatedCenterTempRef,
  applyTrackGroupTransform,
  applyVolumeRootTransform,
  applyVolumeStepScaleToResources,
  applyHoverHighlightToResources,
}: UseVolumeResourcesParams) {
  const resourcesRef = providedResourcesRef ?? useRef<Map<string, VolumeResources>>(new Map());
  const additiveBlendingRef = useRef(isAdditiveBlending);
  const currentDimensionsRef =
    providedCurrentDimensionsRef ??
    useRef<{ width: number; height: number; depth: number } | null>(null);
  const colormapCacheRef = providedColormapCacheRef ?? useRef<Map<string, THREE.DataTexture>>(new Map());
  const volumeRootGroupRef = providedVolumeRootGroupRef ?? useRef<THREE.Group | null>(null);
  const volumeRootBaseOffsetRef = providedVolumeRootBaseOffsetRef ?? useRef(new THREE.Vector3());
  const volumeRootCenterOffsetRef = providedVolumeRootCenterOffsetRef ?? useRef(new THREE.Vector3());
  const volumeRootCenterUnscaledRef = providedVolumeRootCenterUnscaledRef ?? useRef(new THREE.Vector3());
  const volumeRootHalfExtentsRef = providedVolumeRootHalfExtentsRef ?? useRef(new THREE.Vector3());
  const volumeNormalizationScaleRef = providedVolumeNormalizationScaleRef ?? useRef(1);
  const volumeUserScaleRef = providedVolumeUserScaleRef ?? useRef(1);
  const volumeStepScaleRef = providedVolumeStepScaleRef ?? useRef(DESKTOP_VOLUME_STEP_SCALE);
  const volumeYawRef = providedVolumeYawRef ?? useRef(0);
  const volumePitchRef = providedVolumePitchRef ?? useRef(0);
  const volumeRootRotatedCenterTempRef =
    providedVolumeRootRotatedCenterTempRef ?? useRef(new THREE.Vector3());

  const getColormapTexture = useCallback((color: string) => {
    const normalized = normalizeHexColor(color, DEFAULT_LAYER_COLOR);
    const cache = colormapCacheRef.current;
    let texture = cache.get(normalized) ?? null;
    if (!texture) {
      texture = createColormapTexture(normalized);
      cache.set(normalized, texture);
    }
    return texture;
  }, []);

  const applyAdditiveBlendingToResources = useCallback(() => {
    const isAdditive = additiveBlendingRef.current;
    const materialBlending = isAdditive ? THREE.AdditiveBlending : THREE.NormalBlending;

    resourcesRef.current.forEach((resource) => {
      const applyToMaterial = (material: THREE.Material) => {
        material.blending = materialBlending;

        const uniforms = (material as THREE.ShaderMaterial | THREE.RawShaderMaterial).uniforms;
        if (uniforms?.u_additive) {
          uniforms.u_additive.value = isAdditive ? 1 : 0;
        }
      };

      const { material } = resource.mesh;
      if (Array.isArray(material)) {
        material.forEach(applyToMaterial);
      } else {
        applyToMaterial(material);
      }
    });

    applyHoverHighlightToResources();
  }, [applyHoverHighlightToResources, resourcesRef]);

  useEffect(() => {
    additiveBlendingRef.current = isAdditiveBlending;
    applyAdditiveBlendingToResources();
  }, [applyAdditiveBlendingToResources, isAdditiveBlending]);

  useEffect(() => {
    const abortController = new AbortController();

    const removeResource = (key: string) => {
      const resource = resourcesRef.current.get(key);
      if (!resource) {
        return;
      }
      const parent = resource.mesh.parent;
      if (parent) {
        parent.remove(resource.mesh);
      } else {
        const activeScene = sceneRef.current;
        if (activeScene) {
          activeScene.remove(resource.mesh);
        }
      }
      resource.mesh.geometry.dispose();
      disposeMaterial(resource.mesh.material);
      resource.texture.dispose();
      resource.labelTexture?.dispose();
      resource.clipmap?.dispose();
      resourcesRef.current.delete(key);
    };

    const removeAllResources = () => {
      for (const key of Array.from(resourcesRef.current.keys())) {
        removeResource(key);
      }
    };

    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!scene || !camera || !controls) {
      removeAllResources();
      currentDimensionsRef.current = null;
      applyTrackGroupTransform(null);
      applyVolumeRootTransform(null);
      return () => abortController.abort();
    }

    const referenceVolume = primaryVolume;

    if (!referenceVolume) {
      removeAllResources();
      currentDimensionsRef.current = null;
      rotationTargetRef.current.set(0, 0, 0);
      controls.target.set(0, 0, 0);
      controls.update();
      defaultViewStateRef.current = {
        position: camera.position.clone(),
        target: controls.target.clone(),
      };
      const trackGroup = trackGroupRef.current;
      if (trackGroup) {
        trackGroup.visible = false;
      }
      applyTrackGroupTransform(null);
      applyVolumeRootTransform(null);
      return () => abortController.abort();
    }

    const { width, height, depth } = referenceVolume;
    const dimensionsChanged =
      !currentDimensionsRef.current ||
      currentDimensionsRef.current.width !== width ||
      currentDimensionsRef.current.height !== height ||
      currentDimensionsRef.current.depth !== depth;

    if (dimensionsChanged) {
      removeAllResources();
      currentDimensionsRef.current = { width, height, depth };
      volumeUserScaleRef.current = 1;

      const maxDimension = Math.max(width, height, depth);
      const scale = 1 / maxDimension;
      const boundingRadius = Math.sqrt(width * width + height * height + depth * depth) * scale * 0.5;
      const fovInRadians = THREE.MathUtils.degToRad(camera.fov * 0.5);
      const distance = boundingRadius / Math.sin(fovInRadians);
      const safeDistance = Number.isFinite(distance) ? distance * 1.2 : 2.5;
      const nearDistance = Math.max(0.0001, boundingRadius * 0.00025);
      const farDistance = Math.max(safeDistance * 5, boundingRadius * 10);
      if (camera.near !== nearDistance || camera.far !== farDistance) {
        camera.near = nearDistance;
        camera.far = farDistance;
        camera.updateProjectionMatrix();
      }
      camera.position.set(0, 0, safeDistance);
      const rotationTarget = rotationTargetRef.current;
      rotationTarget.set(0, 0, 0);
      controls.target.copy(rotationTarget);
      controls.update();
      defaultViewStateRef.current = {
        position: camera.position.clone(),
        target: controls.target.clone(),
      };
      controls.saveState();

      applyTrackGroupTransform({ width, height, depth });
      applyVolumeRootTransform({ width, height, depth });
    }

    const seenKeys = new Set<string>();
    const materialBlending = additiveBlendingRef.current
      ? THREE.AdditiveBlending
      : THREE.NormalBlending;

    layers.forEach((layer, index) => {
      const volume = layer.volume;
      if (!volume) {
        removeResource(layer.key);
        return;
      }

      let cachedPreparation: ReturnType<typeof getCachedTextureData> | null = null;

      const isGrayscale = volume.channels === 1;
      const colormapTexture = getColormapTexture(isGrayscale ? layer.color : DEFAULT_LAYER_COLOR);

      let resources: VolumeResources | null = resourcesRef.current.get(layer.key) ?? null;

      const viewerMode =
        layer.mode === 'slice' || layer.mode === '3d'
          ? layer.mode
          : volume.depth > 1
            ? '3d'
            : 'slice';
      const zIndex = Number.isFinite(layer.sliceIndex)
        ? Number(layer.sliceIndex)
        : Math.floor(volume.depth / 2);
      const streamingSource = volume.streamingSource;
      const streamingBaseShape = volume.streamingBaseShape;
      const isStreamingVolume = Boolean(streamingSource);
      const hasStreamingClipmap = Boolean(streamingSource);

      if (viewerMode === '3d') {
        if (!hasStreamingClipmap) {
          cachedPreparation = getCachedTextureData(volume);
        }
        const placeholderChannels = Math.max(1, volume.channels);
        const initialData = cachedPreparation?.data ?? new Uint8Array(placeholderChannels);
        const initialFormat =
          cachedPreparation?.format ??
          (placeholderChannels === 1 ? THREE.RedFormat : placeholderChannels === 2 ? THREE.RGFormat : THREE.RGBAFormat);

        let labelTexture: THREE.Data3DTexture | null = null;
        if (layer.isSegmentation && volume.segmentationLabels) {
          const labelData = new Float32Array(volume.segmentationLabels.length);
          labelData.set(volume.segmentationLabels);
          labelTexture = new THREE.Data3DTexture(
            labelData,
            volume.width,
            volume.height,
            volume.depth,
          );
          labelTexture.format = THREE.RedFormat;
          labelTexture.type = THREE.FloatType;
          labelTexture.minFilter = THREE.NearestFilter;
          labelTexture.magFilter = THREE.NearestFilter;
          labelTexture.unpackAlignment = 1;
          labelTexture.needsUpdate = true;
        }

        const expectedLength = cachedPreparation?.data.length ?? placeholderChannels;
        const needsRebuild =
          !resources ||
          resources.mode !== viewerMode ||
          resources.dimensions.width !== volume.width ||
          resources.dimensions.height !== volume.height ||
          resources.dimensions.depth !== volume.depth ||
          resources.channels !== volume.channels ||
          !(resources.texture instanceof THREE.Data3DTexture) ||
          resources.texture.image.data.length !== expectedLength ||
          resources.texture.format !== initialFormat;

        if (needsRebuild) {
          removeResource(layer.key);

          const texture = new THREE.Data3DTexture(
            initialData,
            cachedPreparation ? volume.width : 1,
            cachedPreparation ? volume.height : 1,
            cachedPreparation ? volume.depth : 1,
          );
          texture.format = initialFormat;
          texture.type = THREE.UnsignedByteType;
          const samplingFilter =
            layer.samplingMode === 'nearest' ? THREE.NearestFilter : THREE.LinearFilter;
          texture.minFilter = samplingFilter;
          texture.magFilter = samplingFilter;
          texture.unpackAlignment = 1;
          texture.colorSpace = THREE.LinearSRGBColorSpace;
          texture.needsUpdate = true;

          const shader = VolumeRenderShader;
          const uniforms = THREE.UniformsUtils.clone(shader.uniforms);
          uniforms.u_data.value = texture;
          uniforms.u_size.value.set(volume.width, volume.height, volume.depth);
          uniforms.u_clim.value.set(0, 1);
          uniforms.u_renderstyle.value = layer.renderStyle;
          uniforms.u_renderthreshold.value = 0.5;
          uniforms.u_cmdata.value = colormapTexture;
          uniforms.u_channels.value = volume.channels;
          uniforms.u_windowMin.value = layer.windowMin;
          uniforms.u_windowMax.value = layer.windowMax;
          uniforms.u_invert.value = layer.invert ? 1 : 0;
          uniforms.u_stepScale.value = volumeStepScaleRef.current;
          uniforms.u_nearestSampling.value = layer.samplingMode === 'nearest' ? 1 : 0;
          if (uniforms.u_segmentationLabels) {
            uniforms.u_segmentationLabels.value = labelTexture;
          }
          if (uniforms.u_additive) {
            uniforms.u_additive.value = isAdditiveBlending ? 1 : 0;
          }

          let clipmap: VolumeClipmapManager | null = null;
          if (hasStreamingClipmap && uniforms.u_useClipmap && uniforms.u_clipmapTextures) {
            clipmap = new VolumeClipmapManager({
              ...volume,
              streamingSource: streamingSource!,
              streamingBaseShape,
            });
          }

          const material = new THREE.ShaderMaterial({
            uniforms,
            vertexShader: shader.vertexShader,
            fragmentShader: shader.fragmentShader,
            side: THREE.BackSide,
            transparent: true,
            blending: materialBlending,
          });
          material.depthWrite = false;

          const geometry = new THREE.BoxGeometry(volume.width, volume.height, volume.depth);
          geometry.translate(volume.width / 2 - 0.5, volume.height / 2 - 0.5, volume.depth / 2 - 0.5);

          const mesh = new THREE.Mesh(geometry, material);
          mesh.visible = layer.visible;
          mesh.renderOrder = index;
          mesh.position.set(layer.offsetX, layer.offsetY, 0);

          clipmap?.update(rotationTargetRef.current, {
            signal: abortController.signal,
            priorityCenter: rotationTargetRef.current,
          });
          clipmap?.applyToMaterial(material);

          const worldCameraPosition = new THREE.Vector3();
          const localCameraPosition = new THREE.Vector3();
          mesh.onBeforeRender = (_renderer, _scene, renderCamera) => {
            const shaderMaterial = mesh.material as THREE.ShaderMaterial;
            const cameraUniform = shaderMaterial.uniforms?.u_cameraPos?.value as
              | THREE.Vector3
              | undefined;
            if (!cameraUniform) {
              return;
            }

            worldCameraPosition.setFromMatrixPosition(renderCamera.matrixWorld);
            localCameraPosition.copy(worldCameraPosition);
            mesh.worldToLocal(localCameraPosition);
            cameraUniform.copy(localCameraPosition);
          };

          const volumeRootGroup = volumeRootGroupRef.current;
          if (volumeRootGroup) {
            volumeRootGroup.add(mesh);
          } else {
            scene.add(mesh);
          }
          mesh.updateMatrixWorld(true);

          const clipmapMetadata = clipmap
            ? { levels: clipmap.getActiveLevelCount(), size: clipmap.clipSize }
            : null;

          resourcesRef.current.set(layer.key, {
            mesh,
            texture,
            clipmap: clipmap ?? undefined,
            labelTexture,
            source: isStreamingVolume
              ? { type: 'zarr', clipmap: clipmapMetadata, streamingSource: streamingSource! }
              : { type: 'tiff', clipmap: clipmapMetadata },
            dimensions: { width: volume.width, height: volume.height, depth: volume.depth },
            channels: volume.channels,
            mode: viewerMode,
            samplingMode: layer.samplingMode,
          });
        }

        resources = resourcesRef.current.get(layer.key) ?? null;
      } else {
        const maxIndex = Math.max(0, volume.depth - 1);
        const clampedIndex = Math.min(Math.max(zIndex, 0), maxIndex);
        const expectedLength = getExpectedSliceBufferLength(volume);

        const needsRebuild =
          !resources ||
          resources.mode !== viewerMode ||
          resources.dimensions.width !== volume.width ||
          resources.dimensions.height !== volume.height ||
          resources.dimensions.depth !== volume.depth ||
          resources.channels !== volume.channels ||
          !(resources.texture instanceof THREE.DataTexture) ||
          (resources.sliceBuffer?.length ?? 0) !== expectedLength;

        if (needsRebuild) {
          removeResource(layer.key);

          const sliceInfo = prepareSliceTexture(volume, clampedIndex, null);
          const texture = new THREE.DataTexture(
            sliceInfo.data,
            volume.width,
            volume.height,
            sliceInfo.format,
          );
          texture.type = THREE.UnsignedByteType;
          texture.minFilter = THREE.LinearFilter;
          texture.magFilter = THREE.LinearFilter;
          texture.unpackAlignment = 1;
          texture.colorSpace = THREE.LinearSRGBColorSpace;
          texture.needsUpdate = true;

          const shader = SliceRenderShader;
          const uniforms = THREE.UniformsUtils.clone(shader.uniforms);
          uniforms.u_slice.value = texture;
          uniforms.u_cmdata.value = colormapTexture;
          uniforms.u_channels.value = volume.channels;
          uniforms.u_windowMin.value = layer.windowMin;
          uniforms.u_windowMax.value = layer.windowMax;
          uniforms.u_invert.value = layer.invert ? 1 : 0;
          if (uniforms.u_additive) {
            uniforms.u_additive.value = isAdditiveBlending ? 1 : 0;
          }

          const material = new THREE.ShaderMaterial({
            uniforms,
            vertexShader: shader.vertexShader,
            fragmentShader: shader.fragmentShader,
            transparent: true,
            side: THREE.DoubleSide,
            depthTest: false,
            depthWrite: false,
            blending: materialBlending,
          });

          const geometry = new THREE.PlaneGeometry(volume.width, volume.height);
          geometry.translate(volume.width / 2 - 0.5, volume.height / 2 - 0.5, 0);

          const mesh = new THREE.Mesh(geometry, material);
          mesh.position.set(layer.offsetX, layer.offsetY, clampedIndex);
          mesh.visible = layer.visible;
          mesh.renderOrder = index;
          const volumeRootGroup = volumeRootGroupRef.current;
          if (volumeRootGroup) {
            volumeRootGroup.add(mesh);
          } else {
            scene.add(mesh);
          }

          resourcesRef.current.set(layer.key, {
            mesh,
            texture,
            dimensions: { width: volume.width, height: volume.height, depth: volume.depth },
            channels: volume.channels,
            mode: viewerMode,
            samplingMode: layer.samplingMode,
            sliceBuffer: sliceInfo.data,
            source: isStreamingVolume
              ? { type: 'zarr', clipmap: null, streamingSource: streamingSource! }
              : { type: 'tiff', clipmap: null },
          });
        }

        resources = resourcesRef.current.get(layer.key) ?? null;
      }

      if (resources) {
        const { mesh } = resources;
        mesh.visible = layer.visible;
        mesh.renderOrder = index;

        const materialUniforms = (mesh.material as THREE.ShaderMaterial).uniforms;
        materialUniforms.u_channels.value = volume.channels;
        materialUniforms.u_windowMin.value = layer.windowMin;
        materialUniforms.u_windowMax.value = layer.windowMax;
        materialUniforms.u_invert.value = layer.invert ? 1 : 0;
        materialUniforms.u_cmdata.value = colormapTexture;
        if (materialUniforms.u_additive) {
          materialUniforms.u_additive.value = isAdditiveBlending ? 1 : 0;
        }
        const shaderMaterial = mesh.material as THREE.ShaderMaterial;
        const desiredBlending = materialBlending;
        if (shaderMaterial.blending !== desiredBlending) {
          shaderMaterial.blending = desiredBlending;
          shaderMaterial.needsUpdate = true;
        }
        if (materialUniforms.u_stepScale) {
          materialUniforms.u_stepScale.value = volumeStepScaleRef.current;
        }
        if (materialUniforms.u_nearestSampling) {
          materialUniforms.u_nearestSampling.value = layer.samplingMode === 'nearest' ? 1 : 0;
        }

        if (resources.mode === '3d') {
          const preparation = !isStreamingVolume ? cachedPreparation ?? getCachedTextureData(volume) : null;
          const dataTexture = resources.texture as THREE.Data3DTexture;
          if (resources.samplingMode !== layer.samplingMode) {
            const samplingFilter =
              layer.samplingMode === 'nearest' ? THREE.NearestFilter : THREE.LinearFilter;
            dataTexture.minFilter = samplingFilter;
            dataTexture.magFilter = samplingFilter;
            dataTexture.needsUpdate = true;
            resources.samplingMode = layer.samplingMode;
          }
          if (preparation) {
            dataTexture.image.data = preparation.data;
            dataTexture.image.width = volume.width;
            dataTexture.image.height = volume.height;
            dataTexture.image.depth = volume.depth;
            dataTexture.format = preparation.format;
            dataTexture.needsUpdate = true;
          }
          materialUniforms.u_data.value = dataTexture;
          if (layer.isSegmentation && volume.segmentationLabels) {
            const expectedLength = volume.segmentationLabels.length;
            let labelTexture = resources.labelTexture ?? null;
            const needsLabelTextureRebuild =
              !labelTexture ||
              !(labelTexture.image?.data instanceof Float32Array) ||
              labelTexture.image.data.length !== expectedLength;

            if (needsLabelTextureRebuild) {
              labelTexture?.dispose();
              const labelData = new Float32Array(volume.segmentationLabels.length);
              labelData.set(volume.segmentationLabels);
              labelTexture = new THREE.Data3DTexture(
                labelData,
                volume.width,
                volume.height,
                volume.depth,
              );
              labelTexture.format = THREE.RedFormat;
              labelTexture.type = THREE.FloatType;
              labelTexture.minFilter = THREE.NearestFilter;
              labelTexture.magFilter = THREE.NearestFilter;
              labelTexture.unpackAlignment = 1;
              labelTexture.needsUpdate = true;
            } else if (labelTexture) {
              const labelData = labelTexture.image.data as Float32Array;
              labelData.set(volume.segmentationLabels);
              labelTexture.needsUpdate = true;
            }
            resources.labelTexture = labelTexture;
            if (materialUniforms.u_segmentationLabels) {
              materialUniforms.u_segmentationLabels.value = labelTexture;
            }
          } else if (materialUniforms.u_segmentationLabels) {
            materialUniforms.u_segmentationLabels.value = null;
            resources.labelTexture = null;
          }
          if (materialUniforms.u_renderstyle) {
            materialUniforms.u_renderstyle.value = layer.renderStyle;
          }

          if (hasStreamingClipmap && materialUniforms.u_useClipmap && materialUniforms.u_clipmapTextures) {
            if (!resources.clipmap) {
              resources.clipmap = new VolumeClipmapManager({
                ...volume,
                streamingSource: streamingSource!,
                streamingBaseShape,
              });
            }
            resources.clipmap?.setTimeIndex(timeIndex);
            resources.clipmap?.update(rotationTargetRef.current, {
              signal: abortController.signal,
              priorityCenter: rotationTargetRef.current,
            });
            resources.clipmap?.applyToMaterial(shaderMaterial);
          } else if (materialUniforms.u_useClipmap) {
            resources.clipmap?.dispose();
            resources.clipmap = undefined;
            materialUniforms.u_useClipmap.value = 0;
          }

          const clipmapMetadata = resources.clipmap
            ? { levels: resources.clipmap.getActiveLevelCount(), size: resources.clipmap.clipSize }
            : null;

          resources.source = isStreamingVolume
            ? { type: 'zarr', clipmap: clipmapMetadata, streamingSource: streamingSource! }
            : { type: 'tiff', clipmap: clipmapMetadata };

          const desiredX = layer.offsetX;
          const desiredY = layer.offsetY;
          if (mesh.position.x !== desiredX || mesh.position.y !== desiredY) {
            mesh.position.set(desiredX, desiredY, mesh.position.z);
            mesh.updateMatrixWorld();
          }
        } else {
          const maxIndex = Math.max(0, volume.depth - 1);
          const clampedIndex = Math.min(Math.max(zIndex, 0), maxIndex);
          const existingBuffer = resources.sliceBuffer ?? null;
          const sliceInfo = prepareSliceTexture(volume, clampedIndex, existingBuffer);
          resources.sliceBuffer = sliceInfo.data;
          const dataTexture = resources.texture as THREE.DataTexture;
          dataTexture.image.data = sliceInfo.data;
          dataTexture.image.width = volume.width;
          dataTexture.image.height = volume.height;
          dataTexture.format = sliceInfo.format;
          dataTexture.needsUpdate = true;
          materialUniforms.u_slice.value = dataTexture;
          const desiredX = layer.offsetX;
          const desiredY = layer.offsetY;
          if (
            mesh.position.x !== desiredX ||
            mesh.position.y !== desiredY ||
            mesh.position.z !== clampedIndex
          ) {
            mesh.position.set(desiredX, desiredY, clampedIndex);
            mesh.updateMatrixWorld();
          }
          resources.source = isStreamingVolume
            ? { type: 'zarr', clipmap: null, streamingSource: streamingSource! }
            : { type: 'tiff', clipmap: null };
        }
      }

      seenKeys.add(layer.key);
    });

    for (const key of Array.from(resourcesRef.current.keys())) {
      if (!seenKeys.has(key)) {
        removeResource(key);
      }
    }

    applyHoverHighlightToResources();
    return () => abortController.abort();
  }, [
    applyTrackGroupTransform,
    applyVolumeStepScaleToResources,
    getColormapTexture,
    layers,
    renderContextRevision,
    applyHoverHighlightToResources,
    applyVolumeRootTransform,
    primaryVolume,
    cameraRef,
    controlsRef,
    rotationTargetRef,
    defaultViewStateRef,
    trackGroupRef,
    sceneRef,
    timeIndex,
  ]);

  useEffect(() => {
    return () => {
      for (const texture of colormapCacheRef.current.values()) {
        texture.dispose();
      }
      colormapCacheRef.current.clear();
    };
  }, []);

  return {
    resourcesRef,
    currentDimensionsRef,
    colormapCacheRef,
    volumeRootGroupRef,
    volumeRootBaseOffsetRef,
    volumeRootCenterOffsetRef,
    volumeRootCenterUnscaledRef,
    volumeRootHalfExtentsRef,
    volumeNormalizationScaleRef,
    volumeUserScaleRef,
    volumeStepScaleRef,
    volumeYawRef,
    volumePitchRef,
    volumeRootRotatedCenterTempRef,
    getColormapTexture,
    applyVolumeStepScaleToResources,
  };
}

