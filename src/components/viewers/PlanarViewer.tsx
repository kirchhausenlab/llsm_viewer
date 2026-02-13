import { useCallback, useMemo, useRef, useState } from 'react';
import type { HoveredPixel, PlanarViewerProps } from './planar-viewer/types';
import { usePlanarLayout } from './planar-viewer/hooks/usePlanarLayout';
import { usePlanarSlices } from './planar-viewer/hooks/usePlanarSlices';
import { usePlanarInteractions } from './planar-viewer/hooks/usePlanarInteractions';
import { useLoadingOverlay } from '../../shared/hooks/useLoadingOverlay';
import { clamp } from './planar-viewer/utils';
import { computePlanarTrackCentroid } from './planar-viewer/planarTrackCentroid';
import { drawPlanarSlice } from './planar-viewer/planarSliceCanvas';
import { usePlanarPrimaryVolume } from './planar-viewer/usePlanarPrimaryVolume';
import { usePlanarViewerCanvasLifecycle } from './planar-viewer/usePlanarViewerCanvasLifecycle';
import { usePlanarViewerBindings } from './planar-viewer/usePlanarViewerBindings';
import './viewerCommon.css';
import './PlanarViewer.css';

function PlanarViewer({
  layers,
  isLoading,
  loadingProgress,
  loadedVolumes,
  expectedVolumes,
  timeIndex,
  totalTimepoints,
  onRegisterReset,
  onRegisterCaptureTarget,
  sliceIndex,
  maxSlices,
  onSliceIndexChange,
  trackScale,
  tracks,
  trackVisibility,
  trackOpacityByTrackSet,
  trackLineWidthByTrackSet,
  trackColorModesByTrackSet,
  channelTrackOffsets,
  isFullTrackTrailEnabled,
  trackTrailLength,
  selectedTrackIds,
  followedTrackId,
  onTrackSelectionToggle,
  onTrackFollowRequest: _onTrackFollowRequest,
  paintbrush,
  onHoverVoxelChange,
}: PlanarViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const xyCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const xyContextRef = useRef<CanvasRenderingContext2D | null>(null);
  const hoveredPixelRef = useRef<HoveredPixel>(null);

  const [hasMeasured, setHasMeasured] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [autoFitRequestRevision, setAutoFitRequestRevision] = useState(0);
  const [hoveredPixel, setHoveredPixel] = useState<HoveredPixel>(null);
  const requestAutoFit = useCallback(() => {
    setAutoFitRequestRevision((value) => value + 1);
  }, []);

  const effectiveMaxSlices = Math.max(0, maxSlices);
  const clampedSliceIndex = effectiveMaxSlices > 0 ? clamp(sliceIndex, 0, effectiveMaxSlices - 1) : 0;

  const trackScaleX = trackScale.x ?? 1;
  const trackScaleY = trackScale.y ?? 1;
  const trackScaleZ = trackScale.z ?? 1;

  const { showLoadingOverlay, clampedExpectedVolumes, clampedLoadedVolumes } = useLoadingOverlay({
    isLoading,
    loadingProgress,
    loadedVolumes,
    expectedVolumes,
  });
  const clampedTimeIndex = totalTimepoints === 0 ? 0 : Math.min(timeIndex, Math.max(0, totalTimepoints - 1));
  const { primaryVolume } = usePlanarPrimaryVolume({ layers, requestAutoFit });

  const trackLookup = useMemo(() => {
    const map = new Map<string, typeof tracks[number]>();
    for (const track of tracks) {
      map.set(track.id, track);
    }
    return map;
  }, [tracks]);

  const computeTrackCentroid = useCallback(
    (trackId: string, maxVisibleTime: number) => {
      return computePlanarTrackCentroid({
        track: trackLookup.get(trackId),
        maxVisibleTime,
        channelTrackOffsets,
        trackScale: { x: trackScaleX, y: trackScaleY },
        isFullTrackTrailEnabled,
        trackTrailLength,
      });
    },
    [
      channelTrackOffsets,
      isFullTrackTrailEnabled,
      trackLookup,
      trackScaleX,
      trackScaleY,
      trackTrailLength,
    ]
  );

  const { layout, viewState, viewStateRef, updateViewState, resetView } = usePlanarLayout({
    primaryVolume,
    voxelScale: { x: trackScaleX, y: trackScaleY, z: trackScaleZ },
    containerRef,
    onRegisterReset
  });

  const { sliceData, samplePixelValue } = usePlanarSlices({
    layers,
    primaryVolume,
    clampedSliceIndex
  });

  const {
    trackRenderData,
    hoveredTrackLabel,
    tooltipPosition,
    canvasHandlers
  } = usePlanarInteractions({
    canvasRef,
    layout,
    viewStateRef,
    updateViewState,
    sliceData,
    samplePixelValue,
    clampedSliceIndex,
    effectiveMaxSlices,
    onSliceIndexChange,
    trackScale: { x: trackScaleX, y: trackScaleY, z: trackScaleZ },
    tracks,
    trackLookup,
    trackVisibility,
    trackOpacityByTrackSet,
    trackLineWidthByTrackSet,
    trackColorModesByTrackSet,
    channelTrackOffsets,
    isFullTrackTrailEnabled,
    trackTrailLength,
    selectedTrackIds,
    followedTrackId,
    onTrackSelectionToggle,
    paintbrush,
    onHoverVoxelChange,
    clampedTimeIndex,
    primaryVolume,
    hoveredPixelRef,
    onHoveredPixelChange: setHoveredPixel,
    computeTrackCentroid
  });

  usePlanarViewerBindings({
    onRegisterCaptureTarget,
    canvasRef,
    sliceData,
    setHoveredPixel,
    onHoverVoxelChange,
  });

  const drawSlice = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    drawPlanarSlice({
      canvas,
      xyCanvas: xyCanvasRef.current,
      canvasSize,
      layout,
      viewState,
      hoveredPixel,
      trackScale: { x: trackScaleX, y: trackScaleY },
      trackRenderData,
      selectedTrackIds,
      followedTrackId,
      trackVisibility,
      trackOpacityByTrackSet,
      trackLineWidthByTrackSet,
    });
  }, [
    canvasSize.height,
    canvasSize.width,
    followedTrackId,
    hoveredPixel,
    layout,
    selectedTrackIds,
    trackLineWidthByTrackSet,
    trackOpacityByTrackSet,
    trackRenderData,
    trackScaleX,
    trackScaleY,
    trackVisibility,
    viewState.offsetX,
    viewState.offsetY,
    viewState.rotation,
    viewState.scale
  ]);

  usePlanarViewerCanvasLifecycle({
    drawSlice,
    selectedTrackIds,
    hoveredPixel,
    canvasRef,
    containerRef,
    setHasMeasured,
    setCanvasSize,
    autoFitRequestRevision,
    requestAutoFit,
    resetView,
    sliceData,
    xyCanvasRef,
    xyContextRef,
  });

  return (
    <div className="planar-viewer">
      <section className="planar-surface">
        {showLoadingOverlay && (
          <div className="overlay">
            <div className="loading-panel">
              <span className="loading-title">Loading dataset…</span>
              {clampedExpectedVolumes > 0 ? (
                <span>
                  Loaded {clampedLoadedVolumes} / {clampedExpectedVolumes} volumes
                </span>
              ) : null}
            </div>
          </div>
        )}
        <div
          className={`planar-canvas-wrapper${hasMeasured ? ' is-ready' : ''}`}
          ref={containerRef}
        >
          <canvas ref={canvasRef} className="planar-canvas" {...canvasHandlers} />
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
          {(!sliceData || !sliceData.hasLayer) && !showLoadingOverlay ? (
            <div className="planar-empty-hint">
              {layers.length === 0
                ? 'Load a dataset to begin viewing slices.'
                : 'Enable a layer to view its XY slice.'}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

export default PlanarViewer;
