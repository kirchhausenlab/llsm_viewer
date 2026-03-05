import * as THREE from 'three';

function createFallbackByte3dTexture(
  data: Uint8Array,
  format: THREE.Data3DTexture['format'] = THREE.RedFormat,
): THREE.Data3DTexture {
  const texture = new THREE.Data3DTexture(data, 1, 1, 1);
  texture.format = format;
  texture.type = THREE.UnsignedByteType;
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.unpackAlignment = 1;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function createFallbackFloat3dTexture(
  data: Float32Array,
  format: THREE.Data3DTexture['format'] = THREE.RedFormat,
): THREE.Data3DTexture {
  const texture = new THREE.Data3DTexture(data, 1, 1, 1);
  texture.format = format;
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

export const FALLBACK_BRICK_OCCUPANCY_TEXTURE = createFallbackByte3dTexture(new Uint8Array([255]));
export const FALLBACK_BRICK_MIN_TEXTURE = createFallbackByte3dTexture(new Uint8Array([0]));
export const FALLBACK_BRICK_MAX_TEXTURE = createFallbackByte3dTexture(new Uint8Array([255]));
export const FALLBACK_BRICK_ATLAS_INDEX_TEXTURE = createFallbackFloat3dTexture(new Float32Array([1]));
export const FALLBACK_BRICK_ATLAS_DATA_TEXTURE = createFallbackByte3dTexture(new Uint8Array([0]));
export const FALLBACK_BRICK_ATLAS_BASE_TEXTURE = createFallbackFloat3dTexture(
  new Float32Array([0, 0, 0, 0]),
  THREE.RGBAFormat,
);
export const FALLBACK_BRICK_SUBCELL_TEXTURE = createFallbackByte3dTexture(
  new Uint8Array([0, 0, 0, 255]),
  THREE.RGBAFormat,
);
