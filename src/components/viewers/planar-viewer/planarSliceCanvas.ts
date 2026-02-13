import type { MutableRefObject } from 'react';
import type {
  HoveredPixel,
  PlanarLayout,
  SliceData,
  TrackRenderEntry,
  ViewState,
} from './types';
import { componentsToCss, mixWithWhite } from './utils';

const OUTLINE_OPACITY = 0.75;
const OUTLINE_MIN_WIDTH = 0.4;
const DEFAULT_TRACK_OPACITY = 0.9;
const SELECTED_TRACK_BLINK_PERIOD_MS = 1600;
const SELECTED_TRACK_BLINK_BASE = 1;
const SELECTED_TRACK_BLINK_RANGE = 0.5;

type DrawTrackStyle = {
  lineWidth: number;
  strokeAlpha: number;
  fillAlpha: number;
  strokeColor: { r: number; g: number; b: number };
};

type ResolveTrackStyleParams = {
  track: TrackRenderEntry;
  isSelected: boolean;
  isFollowed: boolean;
  isExplicitlyVisible: boolean;
  channelOpacity: number;
  channelLineWidth: number;
  blinkFactor: number;
};

type DrawPlanarSliceParams = {
  canvas: HTMLCanvasElement;
  xyCanvas: HTMLCanvasElement | null;
  canvasSize: { width: number; height: number };
  layout: PlanarLayout;
  viewState: ViewState;
  hoveredPixel: HoveredPixel;
  trackScale: { x: number; y: number };
  trackRenderData: TrackRenderEntry[];
  selectedTrackIds: ReadonlySet<string>;
  followedTrackId: string | null;
  trackVisibility: Record<string, boolean>;
  trackOpacityByTrackSet: Record<string, number>;
  trackLineWidthByTrackSet: Record<string, number>;
  nowMs?: () => number;
};

export function updatePlanarOffscreenCanvas(
  slice: SliceData | null,
  canvasRef: MutableRefObject<HTMLCanvasElement | null>,
  contextRef: MutableRefObject<CanvasRenderingContext2D | null>,
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

export function resolvePlanarTrackStyle({
  track,
  isSelected,
  isFollowed,
  isExplicitlyVisible,
  channelOpacity,
  channelLineWidth,
  blinkFactor,
}: ResolveTrackStyleParams): DrawTrackStyle | null {
  if (!isFollowed && !isExplicitlyVisible && !isSelected) {
    return null;
  }

  const isChannelHidden = channelOpacity <= 0;
  if (isChannelHidden && !isFollowed && !isSelected) {
    return null;
  }

  const effectiveOpacity = isChannelHidden && (isSelected || isFollowed)
    ? DEFAULT_TRACK_OPACITY
    : channelOpacity;

  const sanitizedLineWidth = Math.max(0.1, Math.min(10, channelLineWidth));
  let lineWidth = sanitizedLineWidth;
  if (isFollowed) {
    lineWidth *= 1.35;
  }
  if (isSelected) {
    lineWidth *= 1.5;
  }

  const opacityMultiplier = isSelected ? blinkFactor : 1;
  const strokeAlpha = Math.min(1, effectiveOpacity * opacityMultiplier);
  const fillAlpha = Math.min(1, strokeAlpha * 0.9);
  const highlightColor = mixWithWhite(track.baseColor, 0.4);
  const strokeColor = isSelected ? highlightColor : track.baseColor;

  return {
    lineWidth,
    strokeAlpha,
    fillAlpha,
    strokeColor,
  };
}

function drawTrackPath({
  context,
  points,
  offsetX,
  offsetY,
}: {
  context: CanvasRenderingContext2D;
  points: { x: number; y: number }[];
  offsetX: number;
  offsetY: number;
}) {
  points.forEach((point, index) => {
    const x = offsetX + point.x;
    const y = offsetY + point.y;
    if (index === 0) {
      context.moveTo(x, y);
    } else {
      context.lineTo(x, y);
    }
  });
}

export function drawPlanarSlice({
  canvas,
  xyCanvas,
  canvasSize,
  layout,
  viewState,
  hoveredPixel,
  trackScale,
  trackRenderData,
  selectedTrackIds,
  followedTrackId,
  trackVisibility,
  trackOpacityByTrackSet,
  trackLineWidthByTrackSet,
  nowMs = () => performance.now(),
}: DrawPlanarSliceParams) {
  const context = canvas.getContext('2d');
  if (!context) {
    return;
  }

  const dpr = window.devicePixelRatio || 1;
  const width = canvasSize.width;
  const height = canvasSize.height;

  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, width, height);
  context.imageSmoothingEnabled = false;

  if (!layout.xy || !xyCanvas || layout.blockWidth <= 0 || layout.blockHeight <= 0) {
    return;
  }

  context.save();

  const viewScale = viewState.scale;
  const dprScale = Math.max(viewScale, 1e-6);

  context.translate(width / 2 + viewState.offsetX, height / 2 + viewState.offsetY);
  context.rotate(viewState.rotation);
  context.scale(viewScale, viewScale);

  const originX = -layout.blockWidth / 2;
  const originY = -layout.blockHeight / 2;

  context.drawImage(
    xyCanvas,
    originX + layout.xy.originX,
    originY + layout.xy.originY,
    layout.xy.width,
    layout.xy.height,
  );

  const xyOriginX = originX + layout.xy.originX;
  const xyOriginY = originY + layout.xy.originY;

  if (hoveredPixel) {
    const hoverX = xyOriginX + hoveredPixel.x * trackScale.x;
    const hoverY = xyOriginY + hoveredPixel.y * trackScale.y;
    context.save();
    const hoverOutlineWidth = Math.max(1, OUTLINE_MIN_WIDTH) / dprScale;
    context.lineWidth = hoverOutlineWidth;
    context.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    context.strokeRect(
      hoverX - 0.5 * trackScale.x,
      hoverY - 0.5 * trackScale.y,
      trackScale.x,
      trackScale.y,
    );
    context.restore();
  }

  if (trackRenderData.length > 0) {
    const blinkPhase = ((nowMs() % SELECTED_TRACK_BLINK_PERIOD_MS) / SELECTED_TRACK_BLINK_PERIOD_MS) * Math.PI * 2;
    const blinkFactor = SELECTED_TRACK_BLINK_BASE + Math.sin(blinkPhase) * SELECTED_TRACK_BLINK_RANGE;

    for (const track of trackRenderData) {
      const isSelected = selectedTrackIds.has(track.id);
      const isFollowed = followedTrackId === track.id;
      const isExplicitlyVisible = trackVisibility[track.id] ?? true;
      const channelOpacity = trackOpacityByTrackSet[track.trackSetId] ?? DEFAULT_TRACK_OPACITY;
      const channelLineWidth = trackLineWidthByTrackSet[track.trackSetId] ?? 1;

      const style = resolvePlanarTrackStyle({
        track,
        isSelected,
        isFollowed,
        isExplicitlyVisible,
        channelOpacity,
        channelLineWidth,
        blinkFactor,
      });
      if (!style) {
        continue;
      }

      const points = track.xyPoints;
      if (points.length === 0) {
        continue;
      }

      context.save();
      context.globalAlpha = style.strokeAlpha;
      context.lineWidth = style.lineWidth / dprScale;
      context.lineCap = 'round';
      context.lineJoin = 'round';
      context.strokeStyle = componentsToCss(style.strokeColor);
      context.beginPath();
      drawTrackPath({ context, points, offsetX: xyOriginX, offsetY: xyOriginY });
      context.stroke();

      const endpointRadius = Math.max(style.lineWidth * 0.6, OUTLINE_MIN_WIDTH) / dprScale;
      const endpoint = points[points.length - 1];
      if (endpoint) {
        const x = xyOriginX + endpoint.x;
        const y = xyOriginY + endpoint.y;
        context.fillStyle = componentsToCss(track.highlightColor);
        context.globalAlpha = style.fillAlpha;
        context.beginPath();
        context.arc(x, y, endpointRadius, 0, Math.PI * 2);
        context.fill();
      }
      context.restore();

      if (style.lineWidth < 1.25) {
        context.save();
        context.lineWidth = Math.max(OUTLINE_MIN_WIDTH, style.lineWidth * 1.4) / dprScale;
        context.strokeStyle = `rgba(0, 0, 0, ${OUTLINE_OPACITY})`;
        context.beginPath();
        drawTrackPath({ context, points, offsetX: xyOriginX, offsetY: xyOriginY });
        context.stroke();
        context.restore();
      }
    }
  }

  context.restore();
}
