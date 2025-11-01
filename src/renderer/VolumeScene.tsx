import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RefCallback } from 'react';
import * as THREE from 'three';
import { useRendererCanvas, type UseRendererCanvasResult } from './useRendererCanvas';
import type { VolumeViewerProps } from './types';
import { useVolumeTextures } from './useVolumeTextures';
import { normalizeHexColor, DEFAULT_LAYER_COLOR } from '../layerColors';

type TooltipPosition = { x: number; y: number } | null;

const MAX_RENDERER_PIXEL_RATIO = 2;

type VolumeSceneContainer = {
  containerRef: RefCallback<HTMLDivElement>;
  hasMeasured: boolean;
};

type VolumeSceneLoadingOverlay = {
  showLoadingOverlay: boolean;
};

type VolumeSceneTooltip = {
  hoveredTrackLabel: string | null;
  tooltipPosition: TooltipPosition;
};

export function useVolumeSceneContainer(
  _props: VolumeViewerProps,
  rendererCanvas: UseRendererCanvasResult,
  containerRef: RefCallback<HTMLDivElement>
): VolumeSceneContainer {
  return { containerRef, hasMeasured: rendererCanvas.hasMeasured };
}

export function useVolumeSceneLoadingOverlay(
  _props: VolumeViewerProps,
  _rendererCanvas: UseRendererCanvasResult
): VolumeSceneLoadingOverlay {
  return { showLoadingOverlay: false };
}

export function useVolumeSceneTooltip(
  _props: VolumeViewerProps,
  _rendererCanvas: UseRendererCanvasResult
): VolumeSceneTooltip {
  return { hoveredTrackLabel: null, tooltipPosition: null };
}

export function VolumeScene(props: VolumeViewerProps) {
  const [containerNode, setContainerNode] = useState<HTMLDivElement | null>(null);
  const rendererParameters = useMemo(
    () =>
      ({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance'
      }) as THREE.WebGLRendererParameters,
    []
  );

  const rendererCanvas = useRendererCanvas({
    container: containerNode,
    rendererParameters,
    maxPixelRatio: MAX_RENDERER_PIXEL_RATIO,
    enableXR: true
  });

  const containerRef = useCallback<RefCallback<HTMLDivElement>>((node) => {
    setContainerNode(node);
  }, []);

  const { containerRef: forwardedContainerRef, hasMeasured } = useVolumeSceneContainer(
    props,
    rendererCanvas,
    containerRef
  );
  const { showLoadingOverlay } = useVolumeSceneLoadingOverlay(props, rendererCanvas);
  const { hoveredTrackLabel, tooltipPosition } = useVolumeSceneTooltip(props, rendererCanvas);

  const volumeRootGroupRef = useRef<THREE.Group | null>(null);
  const volumeStepScaleRef = useRef(1);
  const colormapCacheRef = useRef<Map<string, THREE.DataTexture>>(new Map());

  const getColormapTexture = useCallback((color: string) => {
    const normalized = normalizeHexColor(color, DEFAULT_LAYER_COLOR);
    const cache = colormapCacheRef.current;
    let texture = cache.get(normalized) ?? null;
    if (!texture) {
      const size = 256;
      const data = new Uint8Array(size * 4);
      const red = parseInt(normalized.slice(1, 3), 16) / 255;
      const green = parseInt(normalized.slice(3, 5), 16) / 255;
      const blue = parseInt(normalized.slice(5, 7), 16) / 255;
      for (let i = 0; i < size; i++) {
        const intensity = i / (size - 1);
        data[i * 4 + 0] = Math.round(red * intensity * 255);
        data[i * 4 + 1] = Math.round(green * intensity * 255);
        data[i * 4 + 2] = Math.round(blue * intensity * 255);
        data[i * 4 + 3] = Math.round(intensity * 255);
      }
      texture = new THREE.DataTexture(data, size, 1, THREE.RGBAFormat);
      texture.needsUpdate = true;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.colorSpace = THREE.SRGBColorSpace;
      cache.set(normalized, texture);
    }
    return texture;
  }, []);

  useEffect(() => {
    const scene = rendererCanvas.scene;
    if (!scene) {
      volumeRootGroupRef.current = null;
      return;
    }

    let group = volumeRootGroupRef.current;
    if (!group) {
      group = new THREE.Group();
      group.name = 'VolumeRoot';
      volumeRootGroupRef.current = group;
    }
    scene.add(group);

    return () => {
      scene.remove(group);
    };
  }, [rendererCanvas.scene]);

  const {
    resourcesRef,
    upsertLayer,
    removeLayer,
    removeAllLayers
  } = useVolumeTextures({
    scene: rendererCanvas.scene,
    volumeRoot: volumeRootGroupRef.current,
    getColormapTexture,
    volumeStepScaleRef
  });

  useEffect(() => {
    const scene = rendererCanvas.scene;
    if (!scene) {
      removeAllLayers();
      return;
    }

    const seenKeys = new Set<string>();
    props.layers.forEach((layer, index) => {
      const resource = upsertLayer({ layer, index });
      if (resource) {
        seenKeys.add(layer.key);
      }
    });

    for (const key of Array.from(resourcesRef.current.keys())) {
      if (!seenKeys.has(key)) {
        removeLayer(key);
      }
    }
  }, [props.layers, removeAllLayers, removeLayer, rendererCanvas.scene, resourcesRef, upsertLayer]);

  useEffect(() => {
    return () => {
      for (const texture of colormapCacheRef.current.values()) {
        texture.dispose();
      }
      colormapCacheRef.current.clear();
    };
  }, []);

  return (
    <div className="volume-viewer">
      <section className="viewer-surface">
        {showLoadingOverlay && (
          <div className="overlay">
            <div className="loading-panel">
              <span className="loading-title">Loading dataset…</span>
            </div>
          </div>
        )}
        <div className={`render-surface${hasMeasured ? ' is-ready' : ''}`} ref={forwardedContainerRef}>
          {hoveredTrackLabel && tooltipPosition ? (
            <div
              className="track-tooltip"
              style={{ left: `${tooltipPosition.x}px`, top: `${tooltipPosition.y}px` }}
              role="status"
              aria-live="polite"
            >
              {hoveredTrackLabel}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

export default VolumeScene;
