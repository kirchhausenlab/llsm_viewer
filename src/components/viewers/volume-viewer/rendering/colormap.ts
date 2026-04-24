import * as THREE from 'three';

import { DEFAULT_LAYER_COLOR, normalizeHexColor } from '../../../../shared/colorMaps/layerColors';

export function createColormapTexture(hexColor: string) {
  const normalized = normalizeHexColor(hexColor, DEFAULT_LAYER_COLOR);
  const red = parseInt(normalized.slice(1, 3), 16) / 255;
  const green = parseInt(normalized.slice(3, 5), 16) / 255;
  const blue = parseInt(normalized.slice(5, 7), 16) / 255;

  const size = 256;
  const data = new Uint8Array(size * 4);
  for (let i = 0; i < size; i++) {
    const intensity = i / (size - 1);
    // Keep chroma constant and map intensity through alpha to avoid squaring luminance during blending.
    data[i * 4 + 0] = Math.round(red * 255);
    data[i * 4 + 1] = Math.round(green * 255);
    data[i * 4 + 2] = Math.round(blue * 255);
    data[i * 4 + 3] = Math.round(intensity * 255);
  }
  const texture = new THREE.DataTexture(data, size, 1, THREE.RGBAFormat);
  texture.type = THREE.UnsignedByteType;
  texture.internalFormat = null;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.unpackAlignment = 1;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}
