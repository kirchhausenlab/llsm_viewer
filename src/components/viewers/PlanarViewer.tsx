import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import type { HoveredPixel, PlanarViewerProps, SliceData } from './planar-viewer/types';
import { usePlanarLayout } from './planar-viewer/hooks/usePlanarLayout';
import { usePlanarSlices } from './planar-viewer/hooks/usePlanarSlices';
import { usePlanarInteractions } from './planar-viewer/hooks/usePlanarInteractions';
import { useLoadingOverlay } from '../../shared/hooks/useLoadingOverlay';
import { componentsToCss, clamp, mixWithWhite } from './planar-viewer/utils';
import './viewerCommon.css';
import './PlanarViewer.css';

const OUTLINE_OPACITY = 0.75;
const OUTLINE_MIN_WIDTH = 0.4;
const DEFAULT_TRACK_OPACITY = 0.9;
const SELECTED_TRACK_BLINK_PERIOD_MS = 1600;
const SELECTED_TRACK_BLINK_BASE = 0.85;
const SELECTED_TRACK_BLINK_RANGE = 0.15;

function updateOffscreenCanvas(
  slice: SliceData | null,
  canvasRef: MutableRefObject<HTMLCanvasElement | null>,
  contextRef: MutableRefObject<CanvasRenderingContext2D | null>
): boolean {
  const previousCanvas = canvasRef.current;
  const previousContext = contextRef.current;

  if (!slice || slice.width === 0 || slice.height === 0) {
    const hadContent = Boolean(previousCanvas && previousContext);
    canvasRef.current = null;
    contextRef.current = null;
    return hadContent;
  }

  let canvas = previousCanvas;
  if (!canvas) {
    canvas = document.createElement('canvas');
  }

  if (canvas.width !== slice.width || canvas.height !== slice.height) {
    canvas.width = slice.width;
    canvas.height = slice.height;
    contextRef.current = null;
  }

  let context = contextRef.current;
  if (!context) {
    context = canvas.getContext('2d');
    if (!context) {
      canvasRef.current = null;
      contextRef.current = null;
      return Boolean(previousCanvas && previousContext);
    }
    contextRef.current = context;
  }

  const image = new ImageData(slice.buffer as unknown as ImageDataArray, slice.width, slice.height);
  context.putImageData(image, 0, 0);
  canvasRef.current = canvas;

  return true;
}

function PlanarViewer({
  layers,
  isLoading,
  loadingProgress,
  loadedVolumes,
  expectedVolumes,
  timeIndex,
  totalTimepoints,
  onRegisterReset,
  sliceIndex,
  maxSlices,
  onSliceIndexChange,
  trackScale,
  tracks,
  trackVisibility,
  trackOpacityByChannel,
  trackLineWidthByChannel,
  channelTrackColorModes,
  channelTrackOffsets,
  selectedTrackIds,
  followedTrackId,
  onTrackSelectionToggle,
  onTrackFollowRequest: _onTrackFollowRequest,
  onHoverVoxelChange,
  orthogonalViewsEnabled
}: PlanarViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const xyCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const xzCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const zyCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const xyContextRef = useRef<CanvasRenderingContext2D | null>(null);
  const xzContextRef = useRef<CanvasRenderingContext2D | null>(null);
  const zyContextRef = useRef<CanvasRenderingContext2D | null>(null);
  const hoveredPixelRef = useRef<HoveredPixel>(null);
  const previousPrimaryVolumeRef = useRef<{ width: number; height: number; depth: number } | null>(null);
  const needsAutoFitRef = useRef(false);

  const [hasMeasured, setHasMeasured] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [sliceRevision, setSliceRevision] = useState(0);
  const [hoveredPixel, setHoveredPixel] = useState<HoveredPixel>(null);

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

  const primaryVolume = useMemo(() => {
    for (const layer of layers) {
      if (layer.volume) {
        return layer.volume;
      }
    }
    return null;
  }, [layers]);

  useEffect(() => {
    const previous = previousPrimaryVolumeRef.current;

    if (!primaryVolume) {
      previousPrimaryVolumeRef.current = null;
      needsAutoFitRef.current = true;
      return;
    }

    const current = {
      width: primaryVolume.width,
      height: primaryVolume.height,
      depth: primaryVolume.depth
    };

    previousPrimaryVolumeRef.current = current;

    if (
      !previous ||
      previous.width !== current.width ||
      previous.height !== current.height ||
      previous.depth !== current.depth
    ) {
      needsAutoFitRef.current = true;
    }
  }, [primaryVolume]);

  const trackLookup = useMemo(() => {
    const map = new Map<string, typeof tracks[number]>();
    for (const track of tracks) {
      map.set(track.id, track);
    }
    return map;
  }, [tracks]);

  const computeTrackCentroid = useCallback(
    (trackId: string, maxVisibleTime: number) => {
      const track = trackLookup.get(trackId);
      if (!track) {
        return null;
      }

      const offset = channelTrackOffsets[track.channelId] ?? { x: 0, y: 0 };
      const scaledOffsetX = offset.x * trackScaleX;
      const scaledOffsetY = offset.y * trackScaleY;

      let count = 0;
      let latestTime = -Infinity;
      let sumX = 0;
      let sumY = 0;
      let sumZ = 0;

      for (const point of track.points) {
        if (point.time - maxVisibleTime > 1e-3) {
          break;
        }

        if (point.time > latestTime + 1e-3) {
          latestTime = point.time;
          count = 1;
          sumX = point.x * trackScaleX + scaledOffsetX;
          sumY = point.y * trackScaleY + scaledOffsetY;
          sumZ = (Number.isFinite(point.z) ? point.z : 0) * trackScaleZ;
        } else if (Math.abs(point.time - latestTime) <= 1e-3) {
          count += 1;
          sumX += point.x * trackScaleX + scaledOffsetX;
          sumY += point.y * trackScaleY + scaledOffsetY;
          sumZ += (Number.isFinite(point.z) ? point.z : 0) * trackScaleZ;
        }
      }

      if (count === 0) {
        return null;
      }

      return {
        x: sumX / count,
        y: sumY / count,
        z: sumZ / count
      };
    },
    [channelTrackOffsets, trackLookup, trackScaleX, trackScaleY, trackScaleZ]
  );

  const { layout, viewState, viewStateRef, updateViewState, resetView } = usePlanarLayout({
    primaryVolume,
    orthogonalViewsEnabled,
    containerRef,
    onRegisterReset
  });

  const orthogonalAnchor = useMemo(() => {
    if (!primaryVolume) {
      return null;
    }

    const fallbackAnchor = {
      x: Math.max(0, primaryVolume.width / 2 - 0.5),
      y: Math.max(0, primaryVolume.height / 2 - 0.5)
    };

    if (followedTrackId) {
      const centroid = computeTrackCentroid(followedTrackId, clampedTimeIndex);
      if (centroid) {
        return {
          x: clamp(centroid.x, 0, Math.max(0, primaryVolume.width - 1)),
          y: clamp(centroid.y, 0, Math.max(0, primaryVolume.height - 1))
        };
      }
    }

    if (hoveredPixel) {
      return {
        x: clamp(hoveredPixel.x ?? 0, 0, Math.max(0, primaryVolume.width - 1)),
        y: clamp(hoveredPixel.y ?? 0, 0, Math.max(0, primaryVolume.height - 1))
      };
    }

    return fallbackAnchor;
  }, [clampedTimeIndex, computeTrackCentroid, followedTrackId, hoveredPixel, primaryVolume]);

  const { sliceData, xzSliceData, zySliceData, samplePixelValue } = usePlanarSlices({
    layers,
    primaryVolume,
    clampedSliceIndex,
    orthogonalAnchor,
    orthogonalViewsEnabled
  });

  const {
    trackRenderData,
    hoveredTrackId,
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
    trackLineWidthByChannel,
    channelTrackColorModes,
    channelTrackOffsets,
    selectedTrackIds,
    followedTrackId,
    orthogonalAnchor,
    orthogonalViewsEnabled,
    onTrackSelectionToggle,
    onHoverVoxelChange,
    clampedTimeIndex,
    primaryVolume,
    hoveredPixelRef,
    onHoveredPixelChange: setHoveredPixel,
    computeTrackCentroid
  });

  useEffect(() => {
    if (!sliceData || !sliceData.hasLayer) {
      setHoveredPixel(null);
      onHoverVoxelChange?.(null);
    }
  }, [onHoverVoxelChange, sliceData]);

  const drawSlice = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }

    const xyCanvas = xyCanvasRef.current;
    const dpr = window.devicePixelRatio || 1;
    const width = canvasSize.width;
    const height = canvasSize.height;

    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);
    context.imageSmoothingEnabled = false;

    if (!layout.xy || !xyCanvas || layout.blockWidth <= 0 || layout.blockHeight <= 0) {
      return;
    }

    const xzCanvas = layout.xz && xzSliceData ? xzCanvasRef.current : null;
    const zyCanvas = layout.zy && zySliceData ? zyCanvasRef.current : null;
    context.save();

    const viewScale = viewState.scale;
    const viewRotation = viewState.rotation;
    const cos = Math.cos(viewRotation);
    const sin = Math.sin(viewRotation);

    context.translate(width / 2 + viewState.offsetX, height / 2 + viewState.offsetY);
    context.rotate(viewRotation);
    context.scale(viewScale, viewScale);

    const originX = -layout.blockWidth / 2;
    const originY = -layout.blockHeight / 2;
    const xyCenterX = originX + layout.xy.centerX;
    const xyCenterY = originY + layout.xy.centerY;

    context.drawImage(xyCanvas, originX + layout.xy.originX, originY + layout.xy.originY);

    const xyOriginX = originX + layout.xy.originX;
    const xyOriginY = originY + layout.xy.originY;

    if (layout.zy && zyCanvas) {
      const zyCenterX = originX + layout.zy.centerX;
      const zyCenterY = originY + layout.zy.centerY;
      context.drawImage(zyCanvas, originX + layout.zy.originX, originY + layout.zy.originY);
      context.save();
      context.globalAlpha = 0.4;
      context.beginPath();
      context.moveTo(xyCenterX, originY + layout.zy.originY);
      context.lineTo(zyCenterX, zyCenterY);
      context.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      context.lineWidth = 1 / Math.max(viewScale, 1e-6);
      context.stroke();
      context.restore();
    }

    if (layout.xz && xzCanvas) {
      const xzCenterX = originX + layout.xz.centerX;
      const xzCenterY = originY + layout.xz.centerY;
      context.drawImage(xzCanvas, originX + layout.xz.originX, originY + layout.xz.originY);
      context.save();
      context.globalAlpha = 0.4;
      context.beginPath();
      context.moveTo(xyCenterX, originY + layout.xz.originY);
      context.lineTo(xzCenterX, xzCenterY);
      context.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      context.lineWidth = 1 / Math.max(viewScale, 1e-6);
      context.stroke();
      context.restore();
    }

    const dprScale = Math.max(viewScale, 1e-6);

    if (hoveredPixel && layout.xy) {
      const hoverX = originX + layout.xy.originX + hoveredPixel.x;
      const hoverY = originY + layout.xy.originY + hoveredPixel.y;
      context.save();
      context.lineWidth = Math.max(1 / dprScale, OUTLINE_MIN_WIDTH);
      context.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      context.strokeRect(hoverX - 0.5, hoverY - 0.5, 1, 1);
      context.restore();
    }

    if (trackRenderData.length > 0) {
      const blinkPhase = ((performance.now() % SELECTED_TRACK_BLINK_PERIOD_MS) / SELECTED_TRACK_BLINK_PERIOD_MS) * Math.PI * 2;
      const blinkFactor = SELECTED_TRACK_BLINK_BASE + Math.sin(blinkPhase) * SELECTED_TRACK_BLINK_RANGE;

      for (const track of trackRenderData) {
        const isSelected = selectedTrackIds.has(track.id);
        const isFollowed = followedTrackId === track.id;
        const isExplicitlyVisible = trackVisibility[track.id] ?? true;
        if (!isFollowed && !isExplicitlyVisible && !isSelected) {
          continue;
        }

        const channelOpacity = trackOpacityByChannel[track.channelId] ?? DEFAULT_TRACK_OPACITY;
        if (channelOpacity <= 0) {
          continue;
        }

        const channelLineWidth = trackLineWidthByChannel[track.channelId] ?? 1;
        const sanitizedLineWidth = Math.max(0.1, Math.min(10, channelLineWidth));
        let lineWidth = sanitizedLineWidth;
        if (isFollowed) {
          lineWidth *= 1.35;
        }
        if (isSelected) {
          lineWidth *= 1.5;
        }

        const opacityMultiplier = isSelected ? blinkFactor : 1;
        const strokeAlpha = Math.min(1, channelOpacity * opacityMultiplier);
        const fillAlpha = Math.min(1, strokeAlpha * 0.9);
        const highlightColor = mixWithWhite(track.baseColor, 0.4);
        const strokeColor = isSelected ? highlightColor : track.baseColor;

        const drawTrack = (points: { x: number; y: number }[], offsetX: number, offsetY: number) => {
          if (points.length === 0) {
            return;
          }

          context.save();
          context.globalAlpha = strokeAlpha;
          context.lineWidth = lineWidth;
          context.lineCap = 'round';
          context.lineJoin = 'round';
          context.strokeStyle = componentsToCss(strokeColor);
          context.beginPath();

          points.forEach((point, index) => {
            const x = offsetX + point.x;
            const y = offsetY + point.y;
            if (index === 0) {
              context.moveTo(x, y);
            } else {
              context.lineTo(x, y);
            }
          });
          context.stroke();

          const endpointRadius = Math.max(lineWidth * 0.6, OUTLINE_MIN_WIDTH) / dprScale;
          context.fillStyle = componentsToCss(track.highlightColor);
          context.globalAlpha = fillAlpha;
          for (const point of points) {
            const x = offsetX + point.x;
            const y = offsetY + point.y;
            context.beginPath();
            context.arc(x, y, endpointRadius, 0, Math.PI * 2);
            context.fill();
          }

          context.restore();

          if (lineWidth / dprScale < 1.25) {
            context.save();
            context.lineWidth = Math.max(OUTLINE_MIN_WIDTH, lineWidth * 1.4);
            context.strokeStyle = `rgba(0, 0, 0, ${OUTLINE_OPACITY})`;
            context.beginPath();
            points.forEach((point, index) => {
              const x = offsetX + point.x;
              const y = offsetY + point.y;
              if (index === 0) {
                context.moveTo(x, y);
              } else {
                context.lineTo(x, y);
              }
            });
            context.stroke();
            context.restore();
          }
        };

        drawTrack(track.xyPoints, xyOriginX, xyOriginY);

        if (layout.xz) {
          const xzOriginX = originX + layout.xz.originX;
          const xzOriginY = originY + layout.xz.originY;
          drawTrack(track.xzPoints, xzOriginX, xzOriginY);
        }

        if (layout.zy) {
          const zyOriginX = originX + layout.zy.originX;
          const zyOriginY = originY + layout.zy.originY;
          drawTrack(track.zyPoints, zyOriginX, zyOriginY);
        }
      }
    }

    context.restore();
  }, [
    canvasSize.height,
    canvasSize.width,
    clampedSliceIndex,
    followedTrackId,
    layout,
    selectedTrackIds,
    sliceData,
    trackLineWidthByChannel,
    trackOpacityByChannel,
    trackRenderData,
    hoveredPixel,
    trackVisibility,
    viewState.offsetX,
    viewState.offsetY,
    viewState.rotation,
    viewState.scale,
    xzSliceData,
    zySliceData
  ]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    let frameId: number | null = null;
    let isRunning = true;

    const animate = () => {
      if (!isRunning) {
        return;
      }
      drawSlice();
      frameId = window.requestAnimationFrame(animate);
    };

    const shouldAnimate = selectedTrackIds.size > 0 || hoveredPixel !== null;
    if (shouldAnimate) {
      frameId = window.requestAnimationFrame(animate);
    }

    return () => {
      isRunning = false;
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [drawSlice, hoveredPixel, selectedTrackIds]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) {
      return;
    }

    const observer = new ResizeObserver(() => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (width > 0 && height > 0) {
        setHasMeasured(true);
      }
      setCanvasSize((current) => {
        if (current.width === width && current.height === height) {
          return current;
        }
        return { width, height };
      });
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      needsAutoFitRef.current = true;
    });

    observer.observe(container);
    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const updatedXY = updateOffscreenCanvas(sliceData, xyCanvasRef, xyContextRef);
    const updatedXZ = updateOffscreenCanvas(xzSliceData, xzCanvasRef, xzContextRef);
    const updatedZY = updateOffscreenCanvas(zySliceData, zyCanvasRef, zyContextRef);

    if (updatedXY || updatedXZ || updatedZY) {
      setSliceRevision((value) => value + 1);
    }
  }, [sliceData, xzSliceData, zySliceData]);

  useEffect(() => {
    if (needsAutoFitRef.current) {
      needsAutoFitRef.current = false;
      resetView();
    }
  }, [canvasSize, layout.blockHeight, layout.blockWidth, resetView, sliceRevision]);

  useEffect(() => {
    drawSlice();
  }, [drawSlice, sliceRevision]);

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
