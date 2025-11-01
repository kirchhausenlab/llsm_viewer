import { useCallback, useMemo, useState } from 'react';
import type { RefCallback } from 'react';
import type * as THREE from 'three';
import { useRendererCanvas, type UseRendererCanvasResult } from './useRendererCanvas';
import type { VolumeViewerProps } from './types';

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
