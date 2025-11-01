import { useCallback, useMemo } from 'react';
import * as THREE from 'three';
import type { Data3DTexture, DataTexture } from 'three';
import { VolumeRenderShader } from '../shaders/volumeRenderShader';
import { DEFAULT_LAYER_COLOR, normalizeHexColor } from '../layerColors';
import { useTransferFunctionCache, type TransferFunctionCacheResult } from './useTransferFunction';

type RayMarchUniforms = typeof VolumeRenderShader.uniforms;

type MaterialDimensions = {
  width: number;
  height: number;
  depth: number;
};

export type RayMarchMaterialParams = {
  color: string;
  channels: number;
  dimensions: MaterialDimensions;
  renderStyle: 0 | 1;
  windowMin: number;
  windowMax: number;
  invert: boolean;
  stepScale: number;
};

export type RayMarchMaterialControls = {
  material: THREE.ShaderMaterial;
  uniforms: RayMarchUniforms;
  setDimensions: (dimensions: MaterialDimensions) => void;
  setChannels: (value: number) => void;
  setRenderStyle: (style: 0 | 1) => void;
  setWindowMin: (value: number) => void;
  setWindowMax: (value: number) => void;
  setInvert: (invert: boolean) => void;
  setStepScale: (value: number) => void;
  setDataTexture: (texture: Data3DTexture | null) => void;
  setColormap: (color: string) => string;
  getColormapKey: () => string | null;
};

type UseRayMarchMaterialResult = {
  createRayMarchMaterial: (params: RayMarchMaterialParams) => RayMarchMaterialControls;
  getColormapTexture: (color: string) => DataTexture;
  clearColormap: (color?: string) => void;
};

export function useRayMarchMaterial(
  transferFunctionCache?: TransferFunctionCacheResult
): UseRayMarchMaterialResult {
  const { getColormapTexture, clearColormap } =
    transferFunctionCache ?? useTransferFunctionCache();

  const createRayMarchMaterial = useCallback(
    (params: RayMarchMaterialParams): RayMarchMaterialControls => {
      const uniforms = THREE.UniformsUtils.clone(VolumeRenderShader.uniforms) as RayMarchUniforms;
      uniforms.u_clim.value.set(0, 1);

      const material = new THREE.ShaderMaterial({
        uniforms,
        vertexShader: VolumeRenderShader.vertexShader,
        fragmentShader: VolumeRenderShader.fragmentShader,
        side: THREE.BackSide,
        transparent: true
      });
      (material as unknown as { depthWrite: boolean }).depthWrite = false;

      let colormapKey: string | null = null;

      const setDimensions = (dimensions: MaterialDimensions) => {
        uniforms.u_size.value.set(dimensions.width, dimensions.height, dimensions.depth);
      };

      const setChannels = (value: number) => {
        uniforms.u_channels.value = value;
      };

      const setRenderStyle = (style: 0 | 1) => {
        uniforms.u_renderstyle.value = style;
      };

      const setWindowMin = (value: number) => {
        uniforms.u_windowMin.value = value;
      };

      const setWindowMax = (value: number) => {
        uniforms.u_windowMax.value = value;
      };

      const setInvert = (invert: boolean) => {
        uniforms.u_invert.value = invert ? 1 : 0;
      };

      const setStepScale = (value: number) => {
        uniforms.u_stepScale.value = value;
      };

      const setDataTexture = (texture: Data3DTexture | null) => {
        uniforms.u_data.value = texture;
      };

      const setColormap = (color: string) => {
        const normalized = normalizeHexColor(color, DEFAULT_LAYER_COLOR);
        const texture = getColormapTexture(normalized);
        uniforms.u_cmdata.value = texture;
        colormapKey = normalized;
        return normalized;
      };

      const getColormapKey = () => colormapKey;

      setDimensions(params.dimensions);
      setChannels(params.channels);
      setRenderStyle(params.renderStyle);
      setWindowMin(params.windowMin);
      setWindowMax(params.windowMax);
      setInvert(params.invert);
      setStepScale(params.stepScale);
      setColormap(params.color);

      return {
        material,
        uniforms,
        setDimensions,
        setChannels,
        setRenderStyle,
        setWindowMin,
        setWindowMax,
        setInvert,
        setStepScale,
        setDataTexture,
        setColormap,
        getColormapKey
      };
    },
    [getColormapTexture]
  );

  return useMemo(
    () => ({ createRayMarchMaterial, getColormapTexture, clearColormap }),
    [clearColormap, createRayMarchMaterial, getColormapTexture]
  );
}

export type { UseRayMarchMaterialResult };
