import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TrackDefinition } from '../types/tracks';
import { getTrackColorHex } from '../trackColors';
import type { NormalizedVolume } from '../volumeProcessing';
import './PlanarViewer.css';

type ViewerLayer = {
  key: string;
  label: string;
  volume: NormalizedVolume | null;
  visible: boolean;
  contrast: number;
  brightness: number;
  color: string;
};

type PlanarViewerProps = {
  layers: ViewerLayer[];
  filename: string | null;
  isLoading: boolean;
  loadingProgress: number;
  loadedVolumes: number;
  expectedVolumes: number;
  timeIndex: number;
  totalTimepoints: number;
  isPlaying: boolean;
  onTogglePlayback: () => void;
  onTimeIndexChange: (index: number) => void;
  onRegisterReset: (handler: (() => void) | null) => void;
  sliceIndex: number;
  maxSlices: number;
  onSliceIndexChange: (index: number) => void;
  tracks: TrackDefinition[];
  trackVisibility: Record<number, boolean>;
  trackOpacity: number;
  trackLineWidth: number;
  followedTrackId: number | null;
  onTrackFollowRequest: (trackId: number) => void;
};

type SliceData = {
  width: number;
  height: number;
  buffer: Uint8ClampedArray;
  hasLayer: boolean;
};

type ViewState = {
  scale: number;
  offsetX: number;
  offsetY: number;
  rotation: number;
};

type PointerState = {
  pointerId: number;
  startX: number;
  startY: number;
  startOffsetX: number;
  startOffsetY: number;
};

type TrackHitTestResult = {
  trackId: number | null;
  pointer: { x: number; y: number } | null;
};

const MIN_ALPHA = 0.05;
const ROTATION_KEY_STEP = 0.1;
const PAN_STEP = 40;
const MIN_SCALE = 0.05;
const MAX_SCALE = 40;
const TRACK_HIGHLIGHT_BOOST = 0.4;
const OUTLINE_OPACITY = 0.75;
const OUTLINE_MIN_WIDTH = 0.4;
const TRACK_EPSILON = 1e-3;
const TRACK_HIT_TEST_MIN_DISTANCE = 6;

function clamp(value: number, min: number, max: number) {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

function getColorComponents(color: string) {
  const hex = color.startsWith('#') ? color.slice(1) : color;
  const normalized =
    hex.length === 3
      ? hex
          .split('')
          .map((char) => char + char)
          .join('')
      : hex;
  const safeHex = normalized.padEnd(6, 'f').slice(0, 6);
  const red = parseInt(safeHex.slice(0, 2), 16) / 255;
  const green = parseInt(safeHex.slice(2, 4), 16) / 255;
  const blue = parseInt(safeHex.slice(4, 6), 16) / 255;
  return { r: red, g: green, b: blue };
}

function mixWithWhite(color: { r: number; g: number; b: number }, intensity: number) {
  const amount = clamp(intensity, 0, 1);
  return {
    r: clamp(color.r + (1 - color.r) * amount, 0, 1),
    g: clamp(color.g + (1 - color.g) * amount, 0, 1),
    b: clamp(color.b + (1 - color.b) * amount, 0, 1)
  };
}

function componentsToCss({ r, g, b }: { r: number; g: number; b: number }) {
  const red = Math.round(clamp(r, 0, 1) * 255);
  const green = Math.round(clamp(g, 0, 1) * 255);
  const blue = Math.round(clamp(b, 0, 1) * 255);
  return `rgb(${red}, ${green}, ${blue})`;
}

function createInitialViewState(): ViewState {
  return { scale: 1, offsetX: 0, offsetY: 0, rotation: 0 };
}

function PlanarViewer({
  layers,
  filename,
  isLoading,
  loadingProgress,
  loadedVolumes,
  expectedVolumes,
  timeIndex,
  totalTimepoints,
  isPlaying,
  onTogglePlayback,
  onTimeIndexChange,
  onRegisterReset,
  sliceIndex,
  maxSlices,
  onSliceIndexChange,
  tracks,
  trackVisibility,
  trackOpacity,
  trackLineWidth,
  followedTrackId,
  onTrackFollowRequest
}: PlanarViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sliceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const previousSliceSizeRef = useRef<{ width: number; height: number } | null>(null);
  const needsAutoFitRef = useRef(false);
  const pointerStateRef = useRef<PointerState | null>(null);
  const followedTrackIdRef = useRef<number | null>(followedTrackId);
  const hoveredTrackIdRef = useRef<number | null>(null);

  const [hasMeasured, setHasMeasured] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [viewState, setViewState] = useState<ViewState>(() => createInitialViewState());
  const viewStateRef = useRef(viewState);
  const [sliceRevision, setSliceRevision] = useState(0);
  const [hoveredTrackId, setHoveredTrackId] = useState<number | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ x: number; y: number } | null>(null);

  const effectiveMaxSlices = Math.max(0, maxSlices);
  const clampedSliceIndex =
    effectiveMaxSlices > 0 ? clamp(sliceIndex, 0, effectiveMaxSlices - 1) : 0;

  useEffect(() => {
    viewStateRef.current = viewState;
  }, [viewState]);

  useEffect(() => {
    followedTrackIdRef.current = followedTrackId;
  }, [followedTrackId]);

  const sanitizedTrackOpacity = Math.min(1, Math.max(0, trackOpacity));
  const sanitizedTrackLineWidth = Math.max(0.1, Math.min(10, trackLineWidth));

  const updateViewState = useCallback(
    (updater: Partial<ViewState> | ((prev: ViewState) => ViewState)) => {
      setViewState((previous) => {
        const next =
          typeof updater === 'function'
            ? (updater as (prev: ViewState) => ViewState)(previous)
            : { ...previous, ...updater };
        viewStateRef.current = next;
        return next;
      });
    },
    []
  );

  const resetView = useCallback(() => {
    const container = containerRef.current;
    const sliceCanvas = sliceCanvasRef.current;
    if (!container || !sliceCanvas) {
      updateViewState(createInitialViewState());
      return;
    }
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width <= 0 || height <= 0) {
      updateViewState(createInitialViewState());
      return;
    }
    const scaleX = width / sliceCanvas.width;
    const scaleY = height / sliceCanvas.height;
    const fitScale = clamp(Math.min(scaleX, scaleY) || 1, MIN_SCALE, MAX_SCALE);
    updateViewState({ scale: fitScale, offsetX: 0, offsetY: 0, rotation: 0 });
  }, [updateViewState]);

  useEffect(() => {
    onRegisterReset(resetView);
    return () => {
      onRegisterReset(null);
    };
  }, [onRegisterReset, resetView]);

  const title = useMemo(() => {
    if (!filename) {
      return 'No dataset selected';
    }
    return filename;
  }, [filename]);

  const safeProgress = clamp(loadingProgress, 0, 1);
  const clampedLoadedVolumes = Math.max(0, loadedVolumes);
  const clampedExpectedVolumes = Math.max(0, expectedVolumes);
  const normalizedProgress =
    clampedExpectedVolumes > 0
      ? Math.min(1, clampedLoadedVolumes / clampedExpectedVolumes)
      : safeProgress;
  const hasStartedLoading =
    normalizedProgress > 0 || clampedLoadedVolumes > 0 || safeProgress > 0;
  const hasFinishedLoading =
    clampedExpectedVolumes > 0
      ? clampedLoadedVolumes >= clampedExpectedVolumes
      : safeProgress >= 1;
  const showLoadingOverlay = isLoading || (hasStartedLoading && !hasFinishedLoading);
  const clampedTimeIndex =
    totalTimepoints === 0 ? 0 : Math.min(timeIndex, Math.max(0, totalTimepoints - 1));

  const primaryVolume = useMemo(() => {
    for (const layer of layers) {
      if (layer.volume) {
        return layer.volume;
      }
    }
    return null;
  }, [layers]);

  const sliceData = useMemo<SliceData | null>(() => {
    if (!primaryVolume) {
      return null;
    }

    const width = primaryVolume.width;
    const height = primaryVolume.height;
    const pixelCount = width * height;

    if (pixelCount === 0) {
      return {
        width,
        height,
        buffer: new Uint8ClampedArray(0),
        hasLayer: false
      };
    }

    const accumR = new Float32Array(pixelCount);
    const accumG = new Float32Array(pixelCount);
    const accumB = new Float32Array(pixelCount);
    const accumA = new Float32Array(pixelCount);
    let hasLayer = false;

    const colorCache = new Map<string, { r: number; g: number; b: number }>();

    const getColor = (hex: string) => {
      if (!colorCache.has(hex)) {
        colorCache.set(hex, getColorComponents(hex));
      }
      return colorCache.get(hex)!;
    };

    layers.forEach((layer) => {
      const volume = layer.volume;
      if (!volume || !layer.visible) {
        return;
      }
      if (volume.width !== width || volume.height !== height) {
        return;
      }
      if (volume.depth <= 0) {
        return;
      }
      const channels = Math.max(1, volume.channels);
      const maxIndex = Math.max(0, volume.depth - 1);
      const slice = clamp(clampedSliceIndex, 0, maxIndex);
      const sliceStride = width * height * channels;
      const sliceOffset = slice * sliceStride;
      const data = volume.normalized;
      const brightness = layer.brightness ?? 0;
      const contrast = layer.contrast ?? 1;
      const tint = channels === 1 ? getColor(layer.color) : null;

      for (let i = 0; i < pixelCount; i++) {
        const pixelOffset = sliceOffset + i * channels;
        const sourceR = data[pixelOffset] ?? 0;
        const sourceG = channels > 1 ? data[pixelOffset + 1] ?? 0 : sourceR;
        const sourceB = channels > 2 ? data[pixelOffset + 2] ?? 0 : sourceG;
        const sourceA = channels > 3 ? data[pixelOffset + 3] ?? 0 : 0;

        const r = sourceR / 255;
        const g = sourceG / 255;
        const b = sourceB / 255;
        const a = sourceA / 255;

        let srcR = 0;
        let srcG = 0;
        let srcB = 0;
        let alpha = 0;

        if (channels === 1) {
          const brightened = clamp(r + brightness, 0, 1);
          const contrasted = clamp((brightened - 0.5) * contrast + 0.5, 0, 1);
          const layerAlpha = Math.max(contrasted, MIN_ALPHA);
          const color = tint ?? getColor('#ffffff');
          srcR = color.r * contrasted;
          srcG = color.g * contrasted;
          srcB = color.b * contrasted;
          alpha = layerAlpha;
        } else {
          const intensity =
            channels === 2
              ? 0.5 * (r + g)
              : channels === 3
              ? r * 0.2126 + g * 0.7152 + b * 0.0722
              : Math.max(r, g, Math.max(b, a));
          const brightIntensity = clamp(intensity + brightness, 0, 1);
          const contrasted = clamp((brightIntensity - 0.5) * contrast + 0.5, 0, 1);
          alpha = Math.max(contrasted, MIN_ALPHA);
          const brightR = clamp(r + brightness, 0, 1);
          const brightG = clamp(g + brightness, 0, 1);
          const brightB = clamp(b + brightness, 0, 1);
          srcR = brightR;
          srcG = channels > 1 ? brightG : brightR;
          srcB = channels > 2 ? brightB : 0;
        }

        const srcA = clamp(alpha, 0, 1);
        const srcRPremult = srcR * srcA;
        const srcGPremult = srcG * srcA;
        const srcBPremult = srcB * srcA;

        const prevR = accumR[i];
        const prevG = accumG[i];
        const prevB = accumB[i];
        const prevA = accumA[i];
        const oneMinusSrcA = 1 - srcA;

        accumR[i] = srcRPremult + prevR * oneMinusSrcA;
        accumG[i] = srcGPremult + prevG * oneMinusSrcA;
        accumB[i] = srcBPremult + prevB * oneMinusSrcA;
        accumA[i] = srcA + prevA * oneMinusSrcA;

        if (!hasLayer && srcA > 0) {
          hasLayer = true;
        }
      }
    });

    const output = new Uint8ClampedArray(pixelCount * 4);
    for (let i = 0; i < pixelCount; i++) {
      const alpha = clamp(accumA[i], 0, 1);
      const index = i * 4;
      if (alpha > 1e-6) {
        const invAlpha = 1 / alpha;
        output[index] = Math.round(clamp(accumR[i] * invAlpha, 0, 1) * 255);
        output[index + 1] = Math.round(clamp(accumG[i] * invAlpha, 0, 1) * 255);
        output[index + 2] = Math.round(clamp(accumB[i] * invAlpha, 0, 1) * 255);
        output[index + 3] = Math.round(alpha * 255);
      } else {
        output[index] = 0;
        output[index + 1] = 0;
        output[index + 2] = 0;
        output[index + 3] = 0;
      }
    }

    return { width, height, buffer: output, hasLayer };
  }, [layers, primaryVolume, clampedSliceIndex]);

  const trackRenderData = useMemo(() => {
    if (!primaryVolume) {
      return [];
    }

    const width = primaryVolume.width;
    const height = primaryVolume.height;
    const centerX = width / 2 - 0.5;
    const centerY = height / 2 - 0.5;
    const maxVisibleTime = clampedTimeIndex;

    return tracks
      .map((track) => {
        if (track.points.length === 0) {
          return null;
        }

        const baseColor = getColorComponents(getTrackColorHex(track.id));
        const highlightColor = mixWithWhite(baseColor, TRACK_HIGHLIGHT_BOOST);

        const visiblePoints: { x: number; y: number; z: number }[] = [];
        for (const point of track.points) {
          if (point.time - maxVisibleTime > TRACK_EPSILON) {
            break;
          }
          visiblePoints.push({
            x: point.x - centerX,
            y: point.y - centerY,
            z: point.z
          });
        }

        if (visiblePoints.length === 0) {
          return null;
        }

        return {
          id: track.id,
          points: visiblePoints,
          baseColor,
          highlightColor
        };
      })
      .filter((entry): entry is {
        id: number;
        points: { x: number; y: number; z: number }[];
        baseColor: { r: number; g: number; b: number };
        highlightColor: { r: number; g: number; b: number };
      } => entry !== null);
  }, [clampedTimeIndex, primaryVolume, tracks]);

  const computeTrackCentroid = useCallback(
    (trackId: number, targetTimeIndex: number) => {
      const track = tracks.find((candidate) => candidate.id === trackId);
      if (!track || track.points.length === 0) {
        return null;
      }

      const maxVisibleTime = targetTimeIndex + 1;
      let latestTime = -Infinity;
      let count = 0;
      let sumX = 0;
      let sumY = 0;
      let sumZ = 0;

      for (const point of track.points) {
        if (point.time - maxVisibleTime > TRACK_EPSILON) {
          break;
        }

        if (point.time > latestTime + TRACK_EPSILON) {
          latestTime = point.time;
          count = 1;
          sumX = point.x;
          sumY = point.y;
          sumZ = point.z;
        } else if (Math.abs(point.time - latestTime) <= TRACK_EPSILON) {
          count += 1;
          sumX += point.x;
          sumY += point.y;
          sumZ += point.z;
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
    [tracks]
  );

  const updateHoverState = useCallback(
    (trackId: number | null, position: { x: number; y: number } | null) => {
      if (hoveredTrackIdRef.current !== trackId) {
        hoveredTrackIdRef.current = trackId;
        setHoveredTrackId(trackId);
      }
      setTooltipPosition(position);
    },
    []
  );

  const clearHoverState = useCallback(() => {
    if (hoveredTrackIdRef.current !== null) {
      hoveredTrackIdRef.current = null;
      setHoveredTrackId(null);
    }
    setTooltipPosition(null);
  }, []);

  const drawSlice = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }

    const sliceCanvas = sliceCanvasRef.current;
    const dpr = window.devicePixelRatio || 1;
    const width = canvasSize.width;
    const height = canvasSize.height;

    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);

    if (!sliceCanvas) {
      return;
    }

    context.save();
    context.imageSmoothingEnabled = false;
    context.translate(width / 2 + viewState.offsetX, height / 2 + viewState.offsetY);
    context.rotate(viewState.rotation);
    context.scale(viewState.scale, viewState.scale);
    context.drawImage(sliceCanvas, -sliceCanvas.width / 2, -sliceCanvas.height / 2);

    if (trackRenderData.length > 0) {
      const scale = Math.max(viewState.scale, 1e-6);
      const baseLineWidth = sanitizedTrackLineWidth / scale;
      const outlineWidthBoost = Math.max(sanitizedTrackLineWidth * 0.75, OUTLINE_MIN_WIDTH) / scale;

      for (const track of trackRenderData) {
        const isFollowed = followedTrackId === track.id;
        const isExplicitlyVisible = trackVisibility[track.id] ?? true;
        const shouldShow = isFollowed || isExplicitlyVisible;
        if (!shouldShow) {
          continue;
        }

        const points = track.points;
        if (points.length === 0) {
          continue;
        }

        const opacityBoost = isFollowed ? 0.15 : 0;
        const targetOpacity = Math.min(1, sanitizedTrackOpacity + opacityBoost);
        const widthMultiplier = isFollowed ? 1.35 : 1;
        const strokeWidth = Math.max(0.1, baseLineWidth * widthMultiplier);
        const strokeColor = isFollowed ? track.highlightColor : track.baseColor;

        if (points.length >= 2 && isFollowed) {
          context.save();
          context.lineCap = 'round';
          context.lineJoin = 'round';
          context.globalAlpha = Math.min(1, targetOpacity * OUTLINE_OPACITY);
          context.strokeStyle = 'rgb(255, 255, 255)';
          context.lineWidth = strokeWidth + outlineWidthBoost;
          context.beginPath();
          context.moveTo(points[0].x, points[0].y);
          for (let i = 1; i < points.length; i++) {
            context.lineTo(points[i].x, points[i].y);
          }
          context.stroke();
          context.restore();
        }

        if (points.length >= 2) {
          context.save();
          context.lineCap = 'round';
          context.lineJoin = 'round';
          context.globalAlpha = targetOpacity;
          context.strokeStyle = componentsToCss(strokeColor);
          context.lineWidth = strokeWidth;
          context.beginPath();
          context.moveTo(points[0].x, points[0].y);
          for (let i = 1; i < points.length; i++) {
            context.lineTo(points[i].x, points[i].y);
          }
          context.stroke();
          context.restore();
        }

        const endPoint = points[points.length - 1];
        const pointRadius = Math.max(strokeWidth * 0.6, 1.2 / scale);
        context.save();
        context.globalAlpha = targetOpacity;
        context.fillStyle = componentsToCss(strokeColor);
        context.beginPath();
        context.arc(endPoint.x, endPoint.y, pointRadius, 0, Math.PI * 2);
        context.fill();
        context.restore();
      }
    }

    context.restore();
  }, [
    canvasSize.height,
    canvasSize.width,
    followedTrackId,
    sanitizedTrackLineWidth,
    sanitizedTrackOpacity,
    trackRenderData,
    trackVisibility,
    viewState
  ]);

  const performTrackHitTest = useCallback(
    (event: PointerEvent): TrackHitTestResult => {
      if (trackRenderData.length === 0) {
        return { trackId: null, pointer: null };
      }

      const canvas = canvasRef.current;
      if (!canvas) {
        return { trackId: null, pointer: null };
      }

      const rect = canvas.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;
      if (width <= 0 || height <= 0) {
        return { trackId: null, pointer: null };
      }

      const pointerX = event.clientX - rect.left;
      const pointerY = event.clientY - rect.top;
      if (pointerX < 0 || pointerY < 0 || pointerX > width || pointerY > height) {
        return { trackId: null, pointer: null };
      }

      const currentView = viewStateRef.current;
      const scale = currentView.scale;
      const rotation = currentView.rotation;
      const cos = Math.cos(rotation);
      const sin = Math.sin(rotation);
      const centerX = width / 2 + currentView.offsetX;
      const centerY = height / 2 + currentView.offsetY;

      let closestTrackId: number | null = null;
      let closestDistance = Infinity;

      const computeScreenPosition = (pointX: number, pointY: number) => {
        const rotatedX = pointX * cos - pointY * sin;
        const rotatedY = pointX * sin + pointY * cos;
        return {
          x: centerX + rotatedX * scale,
          y: centerY + rotatedY * scale
        };
      };

      const distanceToSegment = (
        px: number,
        py: number,
        x1: number,
        y1: number,
        x2: number,
        y2: number
      ) => {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const lengthSq = dx * dx + dy * dy;
        if (lengthSq < 1e-8) {
          return Math.hypot(px - x1, py - y1);
        }
        const t = clamp(((px - x1) * dx + (py - y1) * dy) / lengthSq, 0, 1);
        const projX = x1 + t * dx;
        const projY = y1 + t * dy;
        return Math.hypot(px - projX, py - projY);
      };

      for (const track of trackRenderData) {
        const isFollowed = followedTrackIdRef.current === track.id;
        const isExplicitlyVisible = trackVisibility[track.id] ?? true;
        if (!isFollowed && !isExplicitlyVisible) {
          continue;
        }

        let minDistanceForTrack = Infinity;
        let previousPoint: { x: number; y: number } | null = null;

        for (const point of track.points) {
          const screenPoint = computeScreenPosition(point.x, point.y);
          const pointDistance = Math.hypot(screenPoint.x - pointerX, screenPoint.y - pointerY);
          if (pointDistance < minDistanceForTrack) {
            minDistanceForTrack = pointDistance;
          }

          if (previousPoint) {
            const segmentDistance = distanceToSegment(
              pointerX,
              pointerY,
              previousPoint.x,
              previousPoint.y,
              screenPoint.x,
              screenPoint.y
            );
            if (segmentDistance < minDistanceForTrack) {
              minDistanceForTrack = segmentDistance;
            }
          }

          previousPoint = screenPoint;
        }

        if (!isFinite(minDistanceForTrack)) {
          continue;
        }

        const widthMultiplier = isFollowed ? 1.35 : 1;
        const strokeScreenWidth = sanitizedTrackLineWidth * widthMultiplier;
        const endpointRadius = Math.max(strokeScreenWidth * 0.6, 1.2);
        const hitThreshold = Math.max(
          TRACK_HIT_TEST_MIN_DISTANCE,
          strokeScreenWidth * 0.75,
          endpointRadius
        );

        if (minDistanceForTrack <= hitThreshold && minDistanceForTrack < closestDistance) {
          closestDistance = minDistanceForTrack;
          closestTrackId = track.id;
        }
      }

      if (closestTrackId === null) {
        return { trackId: null, pointer: null };
      }

      return { trackId: closestTrackId, pointer: { x: pointerX, y: pointerY } };
    },
    [sanitizedTrackLineWidth, trackRenderData, trackVisibility]
  );

  useEffect(() => {
    if (hoveredTrackId === null) {
      return;
    }

    const stillPresent = trackRenderData.some((track) => track.id === hoveredTrackId);
    if (!stillPresent) {
      clearHoverState();
    }
  }, [clearHoverState, hoveredTrackId, trackRenderData]);

  useEffect(() => {
    if (hoveredTrackId === null) {
      return;
    }

    const isExplicitlyVisible = trackVisibility[hoveredTrackId] ?? true;
    const isFollowed = followedTrackId === hoveredTrackId;
    if (!isExplicitlyVisible && !isFollowed) {
      clearHoverState();
    }
  }, [clearHoverState, followedTrackId, hoveredTrackId, trackVisibility]);

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
    if (!sliceData) {
      sliceCanvasRef.current = null;
      previousSliceSizeRef.current = null;
      drawSlice();
      return;
    }

    const { width, height, buffer } = sliceData;
    const offscreen = document.createElement('canvas');
    offscreen.width = width;
    offscreen.height = height;
    const context = offscreen.getContext('2d');
    if (!context) {
      sliceCanvasRef.current = null;
      previousSliceSizeRef.current = null;
      drawSlice();
      return;
    }

    const image = new ImageData(buffer as unknown as ImageDataArray, width, height);
    context.putImageData(image, 0, 0);
    sliceCanvasRef.current = offscreen;
    const previousSize = previousSliceSizeRef.current;
    if (!previousSize || previousSize.width !== width || previousSize.height !== height) {
      needsAutoFitRef.current = true;
    }
    previousSliceSizeRef.current = { width, height };
    setSliceRevision((value) => value + 1);
  }, [drawSlice, sliceData]);

  useEffect(() => {
    if (needsAutoFitRef.current) {
      needsAutoFitRef.current = false;
      resetView();
    }
  }, [canvasSize, resetView, sliceRevision]);

  useEffect(() => {
    drawSlice();
  }, [drawSlice, sliceRevision]);

  useEffect(() => {
    if (followedTrackId === null) {
      return;
    }
    if (!primaryVolume) {
      return;
    }

    const centroid = computeTrackCentroid(followedTrackId, clampedTimeIndex);
    if (!centroid) {
      return;
    }

    const width = primaryVolume.width;
    const height = primaryVolume.height;
    const centerX = centroid.x - (width / 2 - 0.5);
    const centerY = centroid.y - (height / 2 - 0.5);
    const scale = viewStateRef.current.scale;
    const rotation = viewStateRef.current.rotation;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const scaledX = centerX * scale;
    const scaledY = centerY * scale;
    const rotatedX = scaledX * cos - scaledY * sin;
    const rotatedY = scaledX * sin + scaledY * cos;

    updateViewState((previous) => {
      const nextOffsetX = -rotatedX;
      const nextOffsetY = -rotatedY;
      if (
        Math.abs(previous.offsetX - nextOffsetX) < 1e-3 &&
        Math.abs(previous.offsetY - nextOffsetY) < 1e-3
      ) {
        return previous;
      }
      return { ...previous, offsetX: nextOffsetX, offsetY: nextOffsetY };
    });

    if (effectiveMaxSlices > 0) {
      const targetSlice = clamp(
        Math.round(centroid.z),
        0,
        Math.max(0, effectiveMaxSlices - 1)
      );
      if (targetSlice !== clampedSliceIndex) {
        onSliceIndexChange(targetSlice);
      }
    }
  }, [
    clampedSliceIndex,
    clampedTimeIndex,
    computeTrackCentroid,
    effectiveMaxSlices,
    followedTrackId,
    onSliceIndexChange,
    primaryVolume,
    updateViewState,
    viewState.rotation,
    viewState.scale
  ]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0) {
        return;
      }

      const { trackId, pointer } = performTrackHitTest(event);
      if (trackId !== null) {
        pointerStateRef.current = null;
        onTrackFollowRequest(trackId);
        if (pointer) {
          updateHoverState(trackId, pointer);
        }
        return;
      }

      const target = canvasRef.current;
      if (!target) {
        return;
      }
      const currentView = viewStateRef.current;
      pointerStateRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startOffsetX: currentView.offsetX,
        startOffsetY: currentView.offsetY
      };
      target.setPointerCapture(event.pointerId);
    };

    const handlePointerMove = (event: PointerEvent) => {
      const state = pointerStateRef.current;
      if (state && state.pointerId === event.pointerId) {
        const deltaX = event.clientX - state.startX;
        const deltaY = event.clientY - state.startY;
        const nextOffsetX = state.startOffsetX + deltaX;
        const nextOffsetY = state.startOffsetY + deltaY;
        updateViewState((previous) => {
          if (
            Math.abs(previous.offsetX - nextOffsetX) < 1e-3 &&
            Math.abs(previous.offsetY - nextOffsetY) < 1e-3
          ) {
            return previous;
          }
          return {
            ...previous,
            offsetX: nextOffsetX,
            offsetY: nextOffsetY
          };
        });
        clearHoverState();
        return;
      }

      const { trackId, pointer } = performTrackHitTest(event);
      if (trackId !== null && pointer) {
        updateHoverState(trackId, pointer);
      } else {
        clearHoverState();
      }
    };

    const handlePointerEnd = (event: PointerEvent) => {
      const state = pointerStateRef.current;
      if (state && state.pointerId === event.pointerId) {
        const target = canvasRef.current;
        if (target) {
          target.releasePointerCapture(event.pointerId);
        }
        pointerStateRef.current = null;
      }

      const { trackId, pointer } = performTrackHitTest(event);
      if (trackId !== null && pointer) {
        updateHoverState(trackId, pointer);
      } else {
        clearHoverState();
      }
    };

    const handleWheel = (event: WheelEvent) => {
      if (event.deltaY === 0) {
        return;
      }
      event.preventDefault();
      const zoomFactor = Math.exp(-event.deltaY * 0.0015);
      updateViewState((previous) => {
        const nextScale = clamp(previous.scale * zoomFactor, MIN_SCALE, MAX_SCALE);
        return { ...previous, scale: nextScale };
      });
    };

    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerup', handlePointerEnd);
    canvas.addEventListener('pointercancel', handlePointerEnd);
    canvas.addEventListener('pointerleave', handlePointerEnd);
    canvas.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerup', handlePointerEnd);
      canvas.removeEventListener('pointercancel', handlePointerEnd);
      canvas.removeEventListener('pointerleave', handlePointerEnd);
      canvas.removeEventListener('wheel', handleWheel);
    };
  }, [
    clearHoverState,
    onTrackFollowRequest,
    performTrackHitTest,
    updateHoverState,
    updateViewState
  ]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const activeElement = document.activeElement;
      if (activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement) {
        return;
      }
      if (activeElement instanceof HTMLElement && activeElement.getAttribute('contenteditable') === 'true') {
        return;
      }

      switch (event.code) {
        case 'KeyW': {
          if (effectiveMaxSlices > 0) {
            const step = event.shiftKey ? 10 : 1;
            const nextIndex = clamp(
              clampedSliceIndex + step,
              0,
              Math.max(0, effectiveMaxSlices - 1)
            );
            if (nextIndex !== clampedSliceIndex) {
              onSliceIndexChange(nextIndex);
            }
            event.preventDefault();
          }
          break;
        }
        case 'KeyS': {
          if (effectiveMaxSlices > 0) {
            const step = event.shiftKey ? 10 : 1;
            const nextIndex = clamp(
              clampedSliceIndex - step,
              0,
              Math.max(0, effectiveMaxSlices - 1)
            );
            if (nextIndex !== clampedSliceIndex) {
              onSliceIndexChange(nextIndex);
            }
            event.preventDefault();
          }
          break;
        }
        case 'KeyA': {
          updateViewState((previous) => ({
            ...previous,
            offsetX: previous.offsetX - PAN_STEP
          }));
          event.preventDefault();
          break;
        }
        case 'KeyD': {
          updateViewState((previous) => ({
            ...previous,
            offsetX: previous.offsetX + PAN_STEP
          }));
          event.preventDefault();
          break;
        }
        case 'KeyQ': {
          updateViewState((previous) => ({
            ...previous,
            rotation: previous.rotation - ROTATION_KEY_STEP
          }));
          event.preventDefault();
          break;
        }
        case 'KeyE': {
          updateViewState((previous) => ({
            ...previous,
            rotation: previous.rotation + ROTATION_KEY_STEP
          }));
          event.preventDefault();
          break;
        }
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [clampedSliceIndex, effectiveMaxSlices, onSliceIndexChange, updateViewState]);

  const disableTimeControls = isLoading || totalTimepoints <= 1;
  const disableSliceControls = effectiveMaxSlices <= 1;

  return (
    <div className="planar-viewer">
      <header>
        <div>
          <h2>{title}</h2>
          {primaryVolume ? (
            <p>
              {primaryVolume.width} × {primaryVolume.height} × {primaryVolume.depth} ·{' '}
              {primaryVolume.channels} channel{primaryVolume.channels > 1 ? 's' : ''}
            </p>
          ) : (
            <p>Select a dataset to explore its XY slices.</p>
          )}
          {layers.length > 0 ? (
            <div className="viewer-layer-summary">
              {layers.map((layer) => (
                <span
                  key={layer.key}
                  className={layer.visible ? 'layer-pill' : 'layer-pill is-hidden'}
                  aria-label={layer.visible ? `${layer.label} visible` : `${layer.label} hidden`}
                >
                  {layer.label}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <div className="viewer-meta">
          <div className="time-info">
            <span>Frame {totalTimepoints === 0 ? 0 : clampedTimeIndex + 1}</span>
            <span>/</span>
            <span>{totalTimepoints}</span>
          </div>
        </div>
      </header>

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
          <canvas ref={canvasRef} className="planar-canvas" />
          {hoveredTrackId !== null && tooltipPosition ? (
            <div
              className="track-tooltip"
              style={{ left: `${tooltipPosition.x}px`, top: `${tooltipPosition.y}px` }}
              role="status"
              aria-live="polite"
            >
              Track #{hoveredTrackId}
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

      {effectiveMaxSlices > 0 ? (
        <section className="axis-controls">
          <label htmlFor="planar-z-slider">
            Z plane{' '}
            <span>
              {clampedSliceIndex + 1} / {effectiveMaxSlices}
            </span>
          </label>
          <input
            id="planar-z-slider"
            type="range"
            min={0}
            max={Math.max(0, effectiveMaxSlices - 1)}
            value={clampedSliceIndex}
            onChange={(event) => onSliceIndexChange(Number(event.target.value))}
            disabled={disableSliceControls}
          />
        </section>
      ) : null}

      {totalTimepoints > 0 ? (
        <section className="time-controls">
          <button
            type="button"
            onClick={onTogglePlayback}
            disabled={disableTimeControls}
            className={isPlaying ? 'playing' : ''}
          >
            {isPlaying ? 'Pause' : 'Play'}
          </button>
          <input
            type="range"
            min={0}
            max={Math.max(0, totalTimepoints - 1)}
            value={clampedTimeIndex}
            onChange={(event) => onTimeIndexChange(Number(event.target.value))}
            disabled={disableTimeControls}
          />
          <span className="time-label">
            {totalTimepoints === 0 ? '0' : `${clampedTimeIndex + 1} / ${totalTimepoints}`}
          </span>
        </section>
      ) : null}
    </div>
  );
}

export default PlanarViewer;
