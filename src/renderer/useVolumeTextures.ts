import { useCallback, useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { VolumeRenderShader } from '../shaders/volumeRenderShader';
import { SliceRenderShader } from '../shaders/sliceRenderShader';
import type { ViewerLayer, VolumeResources } from './types';
import type { NormalizedVolume } from '../volumeProcessing';
import { getCachedTextureData } from '../textureCache';
import { DEFAULT_LAYER_COLOR, normalizeHexColor } from '../layerColors';

type VolumeDimensions = { width: number; height: number; depth: number };

type UseVolumeTexturesParams = {
  scene: THREE.Scene | null;
  volumeRoot: THREE.Group | null;
  getColormapTexture: (color: string) => THREE.DataTexture;
  clearColormap: (color?: string) => void;
  volumeStepScaleRef: MutableRefObject<number>;
};

type UpsertLayerParams = {
  layer: ViewerLayer;
  index: number;
};

type UseVolumeTexturesResult = {
  resourcesRef: MutableRefObject<Map<string, VolumeResources>>;
  currentDimensionsRef: MutableRefObject<VolumeDimensions | null>;
  upsertLayer: (params: UpsertLayerParams) => VolumeResources | null;
  removeLayer: (key: string) => void;
  removeAllLayers: () => void;
  addInvalidationListener: (
    listener: VolumeTextureInvalidationListener
  ) => () => void;
};

type VolumeTextureInvalidationEvent =
  | { type: 'colormap'; layerKey: string; previousKey: string | null; nextKey: string }
  | {
      type: 'sampling';
      layerKey: string;
      previousMode: 'linear' | 'nearest';
      nextMode: 'linear' | 'nearest';
    };

type VolumeTextureInvalidationListener = (
  event: VolumeTextureInvalidationEvent
) => void;

function getExpectedSliceBufferLength(volume: NormalizedVolume) {
  const pixelCount = volume.width * volume.height;
  return pixelCount * 4;
}

function prepareSliceTexture(
  volume: NormalizedVolume,
  sliceIndex: number,
  existingBuffer: Uint8Array | null
) {
  const { width, height, depth, channels, normalized } = volume;
  const pixelCount = width * height;
  const targetLength = pixelCount * 4;

  let buffer = existingBuffer ?? null;
  if (!buffer || buffer.length !== targetLength) {
    buffer = new Uint8Array(targetLength);
  }

  const maxIndex = Math.max(0, depth - 1);
  const clampedIndex = Math.min(Math.max(sliceIndex, 0), maxIndex);
  const sliceStride = pixelCount * channels;
  const sliceOffset = clampedIndex * sliceStride;

  for (let i = 0; i < pixelCount; i++) {
    const sourceOffset = sliceOffset + i * channels;
    const targetOffset = i * 4;

    const red = normalized[sourceOffset] ?? 0;
    const green = channels > 1 ? normalized[sourceOffset + 1] ?? 0 : red;
    const blue = channels > 2 ? normalized[sourceOffset + 2] ?? 0 : green;
    const alpha = channels > 3 ? normalized[sourceOffset + 3] ?? 255 : 255;

    if (channels === 1) {
      buffer[targetOffset] = red;
      buffer[targetOffset + 1] = red;
      buffer[targetOffset + 2] = red;
      buffer[targetOffset + 3] = 255;
    } else if (channels === 2) {
      buffer[targetOffset] = red;
      buffer[targetOffset + 1] = green;
      buffer[targetOffset + 2] = 0;
      buffer[targetOffset + 3] = 255;
    } else if (channels === 3) {
      buffer[targetOffset] = red;
      buffer[targetOffset + 1] = green;
      buffer[targetOffset + 2] = blue;
      buffer[targetOffset + 3] = 255;
    } else {
      buffer[targetOffset] = red;
      buffer[targetOffset + 1] = green;
      buffer[targetOffset + 2] = blue;
      buffer[targetOffset + 3] = alpha;
    }
  }

  return { data: buffer, format: THREE.RGBAFormat };
}

export function useVolumeTextures({
  scene,
  volumeRoot,
  getColormapTexture,
  clearColormap,
  volumeStepScaleRef
}: UseVolumeTexturesParams): UseVolumeTexturesResult {
  const resourcesRef = useRef<Map<string, VolumeResources>>(new Map());
  const currentDimensionsRef = useRef<VolumeDimensions | null>(null);

  const sceneRef = useRef<THREE.Scene | null>(scene);
  const volumeRootRef = useRef<THREE.Group | null>(volumeRoot);
  const getColormapTextureRef = useRef(getColormapTexture);
  const clearColormapRef = useRef(clearColormap);
  const colormapKeyRef = useRef<Map<string, string>>(new Map());
  const samplingModeRef = useRef<Map<string, 'linear' | 'nearest'>>(new Map());
  const invalidationListenersRef = useRef<Set<VolumeTextureInvalidationListener>>(new Set());

  useEffect(() => {
    sceneRef.current = scene;
  }, [scene]);

  useEffect(() => {
    volumeRootRef.current = volumeRoot;
  }, [volumeRoot]);

  useEffect(() => {
    getColormapTextureRef.current = getColormapTexture;
  }, [getColormapTexture]);

  useEffect(() => {
    clearColormapRef.current = clearColormap;
  }, [clearColormap]);

  const notifyInvalidation = useCallback(
    (event: VolumeTextureInvalidationEvent) => {
      for (const listener of invalidationListenersRef.current) {
        listener(event);
      }
    },
    []
  );

  const addInvalidationListener = useCallback(
    (listener: VolumeTextureInvalidationListener) => {
      const listeners = invalidationListenersRef.current;
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    []
  );

  const disposeMaterial = useCallback((material: THREE.Material | THREE.Material[]) => {
    if (Array.isArray(material)) {
      material.forEach((entry) => entry.dispose());
    } else {
      material.dispose();
    }
  }, []);

  const removeLayer = useCallback((key: string) => {
    const resource = resourcesRef.current.get(key);
    if (!resource) {
      return;
    }

    const { mesh, texture } = resource;
    if (mesh.parent) {
      mesh.parent.remove(mesh);
    } else {
      const activeScene = sceneRef.current;
      if (activeScene) {
        activeScene.remove(mesh);
      }
    }

    mesh.geometry.dispose();
    disposeMaterial(mesh.material);
    texture.dispose();
    resourcesRef.current.delete(key);
    colormapKeyRef.current.delete(key);
    samplingModeRef.current.delete(key);
  }, [disposeMaterial]);

  const removeAllLayers = useCallback(() => {
    for (const key of Array.from(resourcesRef.current.keys())) {
      removeLayer(key);
    }
    colormapKeyRef.current.clear();
    samplingModeRef.current.clear();
  }, [removeLayer]);

  const upsertLayer = useCallback(
    ({ layer, index }: UpsertLayerParams): VolumeResources | null => {
      const volume = layer.volume;
      if (!volume) {
        removeLayer(layer.key);
        return null;
      }

      const sceneInstance = sceneRef.current;
      if (!sceneInstance) {
        removeLayer(layer.key);
        return null;
      }

      const getColormap = getColormapTextureRef.current;
      const clearColormapEntry = clearColormapRef.current;
      const colormapKeys = colormapKeyRef.current;
      const samplingModes = samplingModeRef.current;

      const isGrayscale = volume.channels === 1;
      const requestedColor = isGrayscale ? layer.color : DEFAULT_LAYER_COLOR;
      const colormapKey = normalizeHexColor(requestedColor, DEFAULT_LAYER_COLOR);
      const previousColormapKey = colormapKeys.get(layer.key) ?? null;
      if (previousColormapKey && previousColormapKey !== colormapKey) {
        clearColormapEntry(previousColormapKey);
        notifyInvalidation({
          type: 'colormap',
          layerKey: layer.key,
          previousKey: previousColormapKey,
          nextKey: colormapKey
        });
      }

      const previousSamplingMode = samplingModes.get(layer.key) ?? null;
      if (previousSamplingMode && previousSamplingMode !== layer.samplingMode) {
        notifyInvalidation({
          type: 'sampling',
          layerKey: layer.key,
          previousMode: previousSamplingMode,
          nextMode: layer.samplingMode
        });
      }

      const colormapTexture = getColormap(requestedColor);

      const resources = resourcesRef.current;
      let existing = resources.get(layer.key) ?? null;

      const viewerMode =
        layer.mode === 'slice' || layer.mode === '3d'
          ? layer.mode
          : volume.depth > 1
          ? '3d'
          : 'slice';

      const zIndex = Number.isFinite(layer.sliceIndex)
        ? Number(layer.sliceIndex)
        : Math.floor(volume.depth / 2);

      if (viewerMode === '3d') {
        const cachedPreparation = getCachedTextureData(volume);
        const { data: textureData, format: textureFormat } = cachedPreparation;
        const needsRebuild =
          !existing ||
          existing.mode !== viewerMode ||
          existing.dimensions.width !== volume.width ||
          existing.dimensions.height !== volume.height ||
          existing.dimensions.depth !== volume.depth ||
          existing.channels !== volume.channels ||
          !(existing.texture instanceof THREE.Data3DTexture) ||
          existing.texture.image.data.length !== textureData.length ||
          existing.texture.format !== textureFormat;

        if (needsRebuild) {
          removeLayer(layer.key);

          const texture = new THREE.Data3DTexture(textureData, volume.width, volume.height, volume.depth);
          texture.format = textureFormat;
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

          const material = new THREE.ShaderMaterial({
            uniforms,
            vertexShader: shader.vertexShader,
            fragmentShader: shader.fragmentShader,
            side: THREE.BackSide,
            transparent: true
          });
          (material as unknown as { depthWrite: boolean }).depthWrite = false;

          const geometry = new THREE.BoxGeometry(volume.width, volume.height, volume.depth);
          geometry.translate(volume.width / 2 - 0.5, volume.height / 2 - 0.5, volume.depth / 2 - 0.5);

          const mesh = new THREE.Mesh(geometry, material);
          const meshObject = mesh as unknown as { visible: boolean; renderOrder: number };
          meshObject.visible = layer.visible;
          meshObject.renderOrder = index;
          mesh.position.set(layer.offsetX, layer.offsetY, 0);

          const worldCameraPosition = new THREE.Vector3();
          const localCameraPosition = new THREE.Vector3();
          mesh.onBeforeRender = (_renderer, _scene, renderCamera) => {
            const shaderMaterial = mesh.material as THREE.ShaderMaterial;
            const cameraUniform = shaderMaterial.uniforms?.u_cameraPos?.value as THREE.Vector3 | undefined;
            if (!cameraUniform) {
              return;
            }
            worldCameraPosition.setFromMatrixPosition(renderCamera.matrixWorld);
            localCameraPosition.copy(worldCameraPosition);
            mesh.worldToLocal(localCameraPosition);
            cameraUniform.copy(localCameraPosition);
          };

          const group = volumeRootRef.current;
          if (group) {
            group.add(mesh);
          } else {
            sceneInstance.add(mesh);
          }
          mesh.updateMatrixWorld(true);

          existing = {
            mesh,
            texture,
            dimensions: { width: volume.width, height: volume.height, depth: volume.depth },
            channels: volume.channels,
            mode: viewerMode,
            samplingMode: layer.samplingMode,
            colormapKey
          };
          resources.set(layer.key, existing);
        }

        if (!existing) {
          return null;
        }

        const mesh = existing.mesh;
        const meshObject = mesh as unknown as { visible: boolean; renderOrder: number };
        meshObject.visible = layer.visible;
        meshObject.renderOrder = index;

        const shaderMaterial = mesh.material as THREE.ShaderMaterial;
        shaderMaterial.uniforms.u_channels.value = volume.channels;
        shaderMaterial.uniforms.u_windowMin.value = layer.windowMin;
        shaderMaterial.uniforms.u_windowMax.value = layer.windowMax;
        shaderMaterial.uniforms.u_invert.value = layer.invert ? 1 : 0;
        shaderMaterial.uniforms.u_cmdata.value = colormapTexture;
        if (shaderMaterial.uniforms.u_stepScale) {
          shaderMaterial.uniforms.u_stepScale.value = volumeStepScaleRef.current;
        }

        const dataTexture = existing.texture as THREE.Data3DTexture;
        if (existing.samplingMode !== layer.samplingMode) {
          const samplingFilter =
            layer.samplingMode === 'nearest' ? THREE.NearestFilter : THREE.LinearFilter;
          dataTexture.minFilter = samplingFilter;
          dataTexture.magFilter = samplingFilter;
          dataTexture.needsUpdate = true;
          existing.samplingMode = layer.samplingMode;
        }

        const preparation = getCachedTextureData(volume);
        dataTexture.image.data = preparation.data;
        dataTexture.format = preparation.format;
        dataTexture.needsUpdate = true;
        shaderMaterial.uniforms.u_data.value = dataTexture;
        if (shaderMaterial.uniforms.u_renderstyle) {
          shaderMaterial.uniforms.u_renderstyle.value = layer.renderStyle;
        }

        const desiredX = layer.offsetX;
        const desiredY = layer.offsetY;
        if (mesh.position.x !== desiredX || mesh.position.y !== desiredY) {
          mesh.position.set(desiredX, desiredY, mesh.position.z);
          mesh.updateMatrixWorld();
        }

        existing.colormapKey = colormapKey;
        colormapKeys.set(layer.key, colormapKey);
        samplingModes.set(layer.key, layer.samplingMode);

        return existing;
      }

      const resourcesEntry = existing;
      const maxIndex = Math.max(0, volume.depth - 1);
      const clampedIndex = Math.min(Math.max(zIndex, 0), maxIndex);
      const expectedLength = getExpectedSliceBufferLength(volume);

      const needsRebuild =
        !resourcesEntry ||
        resourcesEntry.mode !== viewerMode ||
        resourcesEntry.dimensions.width !== volume.width ||
        resourcesEntry.dimensions.height !== volume.height ||
        resourcesEntry.dimensions.depth !== volume.depth ||
        resourcesEntry.channels !== volume.channels ||
        !(resourcesEntry.texture instanceof THREE.DataTexture) ||
        (resourcesEntry.sliceBuffer?.length ?? 0) !== expectedLength;

      if (needsRebuild) {
        removeLayer(layer.key);

        const sliceInfo = prepareSliceTexture(volume, clampedIndex, null);
        const texture = new THREE.DataTexture(
          sliceInfo.data,
          volume.width,
          volume.height,
          sliceInfo.format
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

        const material = new THREE.ShaderMaterial({
          uniforms,
          vertexShader: shader.vertexShader,
          fragmentShader: shader.fragmentShader,
          transparent: true,
          side: THREE.DoubleSide,
          depthTest: false,
          depthWrite: false
        });

        const geometry = new THREE.PlaneGeometry(volume.width, volume.height);
        geometry.translate(volume.width / 2 - 0.5, volume.height / 2 - 0.5, 0);

        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(layer.offsetX, layer.offsetY, clampedIndex);
        const meshObject = mesh as unknown as { visible: boolean; renderOrder: number };
        meshObject.visible = layer.visible;
        meshObject.renderOrder = index;

        const group = volumeRootRef.current;
        if (group) {
          group.add(mesh);
        } else {
          sceneInstance.add(mesh);
        }

        existing = {
          mesh,
          texture,
          dimensions: { width: volume.width, height: volume.height, depth: volume.depth },
          channels: volume.channels,
          mode: viewerMode,
          samplingMode: layer.samplingMode,
          colormapKey,
          sliceBuffer: sliceInfo.data
        };
        resources.set(layer.key, existing);
      }

      if (!existing) {
        return null;
      }

      const mesh = existing.mesh;
      const meshObject = mesh as unknown as { visible: boolean; renderOrder: number };
      meshObject.visible = layer.visible;
      meshObject.renderOrder = index;

      const materialUniforms = (mesh.material as THREE.ShaderMaterial).uniforms;
      materialUniforms.u_channels.value = volume.channels;
      materialUniforms.u_windowMin.value = layer.windowMin;
      materialUniforms.u_windowMax.value = layer.windowMax;
      materialUniforms.u_invert.value = layer.invert ? 1 : 0;
      materialUniforms.u_cmdata.value = colormapTexture;

      const existingBuffer = existing.sliceBuffer ?? null;
      const sliceInfo = prepareSliceTexture(volume, clampedIndex, existingBuffer);
      existing.sliceBuffer = sliceInfo.data;
      const dataTexture = existing.texture as THREE.DataTexture;
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

      existing.colormapKey = colormapKey;
      colormapKeys.set(layer.key, colormapKey);
      samplingModes.set(layer.key, layer.samplingMode);

      return existing;
    },
    [notifyInvalidation, removeLayer, volumeStepScaleRef]
  );

  useEffect(() => {
    return () => {
      removeAllLayers();
    };
  }, [removeAllLayers]);

  return useMemo(
    () => ({
      resourcesRef,
      currentDimensionsRef,
      upsertLayer,
      removeLayer,
      removeAllLayers,
      addInvalidationListener
    }),
    [addInvalidationListener, removeAllLayers, removeLayer, upsertLayer]
  );
}

export type {
  UseVolumeTexturesResult,
  VolumeTextureInvalidationEvent,
  VolumeTextureInvalidationListener
};
