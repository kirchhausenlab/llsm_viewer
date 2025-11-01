import { useCallback } from 'react';
import type { RefCallback } from 'react';
import type { VolumeViewerProps } from './types';

type TooltipPosition = { x: number; y: number } | null;

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

export function useVolumeSceneContainer(_props: VolumeViewerProps): VolumeSceneContainer {
  const containerRef = useCallback<RefCallback<HTMLDivElement>>((node) => {
    void node;
  }, []);
  return { containerRef, hasMeasured: false };
}

export function useVolumeSceneLoadingOverlay(_props: VolumeViewerProps): VolumeSceneLoadingOverlay {
  return { showLoadingOverlay: false };
}

export function useVolumeSceneTooltip(_props: VolumeViewerProps): VolumeSceneTooltip {
  return { hoveredTrackLabel: null, tooltipPosition: null };
}

export function VolumeScene(props: VolumeViewerProps) {
  const { containerRef, hasMeasured } = useVolumeSceneContainer(props);
  const { showLoadingOverlay } = useVolumeSceneLoadingOverlay(props);
  const { hoveredTrackLabel, tooltipPosition } = useVolumeSceneTooltip(props);

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
        <div className={`render-surface${hasMeasured ? ' is-ready' : ''}`} ref={containerRef}>
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
