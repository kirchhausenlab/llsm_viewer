import { useCallback, useRef } from 'react';
import * as THREE from 'three';
import { DEFAULT_LAYER_COLOR, normalizeHexColor } from '../layerColors';

type TransferFunctionCacheEvent =
  | { type: 'hit'; key: string }
  | { type: 'miss'; key: string }
  | { type: 'clear'; key: string | null };

type TransferFunctionCacheListener = (event: TransferFunctionCacheEvent) => void;

type TransferFunctionCacheResult = {
  getColormapTexture: (color: string) => THREE.DataTexture;
  clearColormap: (color?: string) => void;
  addListener: (listener: TransferFunctionCacheListener) => () => void;
};

function createColormapTexture(hexColor: string) {
  const red = parseInt(hexColor.slice(1, 3), 16) / 255;
  const green = parseInt(hexColor.slice(3, 5), 16) / 255;
  const blue = parseInt(hexColor.slice(5, 7), 16) / 255;

  const size = 256;
  const data = new Uint8Array(size * 4);
  for (let i = 0; i < size; i++) {
    const intensity = i / (size - 1);
    data[i * 4 + 0] = Math.round(red * intensity * 255);
    data[i * 4 + 1] = Math.round(green * intensity * 255);
    data[i * 4 + 2] = Math.round(blue * intensity * 255);
    data[i * 4 + 3] = Math.round(intensity * 255);
  }

  const texture = new THREE.DataTexture(data, size, 1, THREE.RGBAFormat);
  texture.needsUpdate = true;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function useTransferFunctionCache(): TransferFunctionCacheResult {
  const cacheRef = useRef<Map<string, THREE.DataTexture>>(new Map());
  const listenersRef = useRef<Set<TransferFunctionCacheListener>>(new Set());

  const notify = useCallback((event: TransferFunctionCacheEvent) => {
    for (const listener of listenersRef.current) {
      listener(event);
    }
  }, []);

  const getColormapTexture = useCallback(
    (color: string) => {
      const normalized = normalizeHexColor(color, DEFAULT_LAYER_COLOR);
      const cache = cacheRef.current;
      const existing = cache.get(normalized);
      if (existing) {
        notify({ type: 'hit', key: normalized });
        return existing;
      }

      const texture = createColormapTexture(normalized);
      cache.set(normalized, texture);
      notify({ type: 'miss', key: normalized });
      return texture;
    },
    [notify]
  );

  const clearColormap = useCallback(
    (color?: string) => {
      const cache = cacheRef.current;
      if (color) {
        const normalized = normalizeHexColor(color, DEFAULT_LAYER_COLOR);
        if (cache.delete(normalized)) {
          notify({ type: 'clear', key: normalized });
        }
        return;
      }

      for (const texture of cache.values()) {
        texture.dispose();
      }
      cache.clear();
      notify({ type: 'clear', key: null });
    },
    [notify]
  );

  const addListener = useCallback((listener: TransferFunctionCacheListener) => {
    const listeners = listenersRef.current;
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return { getColormapTexture, clearColormap, addListener };
}

export type { TransferFunctionCacheEvent, TransferFunctionCacheListener };
