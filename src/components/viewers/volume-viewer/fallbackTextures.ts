import * as THREE from 'three';

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

