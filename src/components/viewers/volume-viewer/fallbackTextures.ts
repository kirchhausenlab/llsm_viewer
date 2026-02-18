import * as THREE from 'three';

function createFallbackByte3dTexture(value: number): THREE.Data3DTexture {
  const texture = new THREE.Data3DTexture(new Uint8Array([value]), 1, 1, 1);
  texture.format = THREE.RedFormat;
  texture.type = THREE.UnsignedByteType;
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.unpackAlignment = 1;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function createFallbackFloat3dTexture(value: number): THREE.Data3DTexture {
  const texture = new THREE.Data3DTexture(new Float32Array([value]), 1, 1, 1);
  texture.format = THREE.RedFormat;
  texture.type = THREE.FloatType;
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.unpackAlignment = 1;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

export const FALLBACK_SEGMENTATION_LABEL_TEXTURE = (() => {
  const texture = new THREE.Data3DTexture(new Uint32Array([0]), 1, 1, 1);
  texture.format = THREE.RedIntegerFormat;
  texture.type = THREE.UnsignedIntType;
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.unpackAlignment = 1;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
})();

export const FALLBACK_BRICK_OCCUPANCY_TEXTURE = createFallbackByte3dTexture(255);
export const FALLBACK_BRICK_MIN_TEXTURE = createFallbackByte3dTexture(0);
export const FALLBACK_BRICK_MAX_TEXTURE = createFallbackByte3dTexture(255);
export const FALLBACK_BRICK_ATLAS_INDEX_TEXTURE = createFallbackFloat3dTexture(1);
export const FALLBACK_BRICK_ATLAS_DATA_TEXTURE = createFallbackByte3dTexture(0);
