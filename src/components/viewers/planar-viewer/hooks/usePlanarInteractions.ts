import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent
} from 'react';
import { getTrackColorHex } from '../../../../shared/colorMaps/trackColors';
import type { TrackDefinition } from '../../../../types/tracks';
import type { NormalizedVolume } from '../../../../core/volumeProcessing';
import { componentsToCss, clamp, getColorComponents, mixWithWhite } from '../utils';
import type {
  HoveredPixel,
  HoveredIntensityInfo,
  PlanarLayout,
  PlanarViewerProps,
  SliceData,
  TrackHitTestResult,
  TrackRenderEntry,
  ViewState
} from '../types';
import { MAX_SCALE, MIN_SCALE, PAN_STEP, ROTATION_KEY_STEP } from './usePlanarLayout';

const TRACK_HIGHLIGHT_BOOST = 0.4;
const TRACK_EPSILON = 1e-3;
const TRACK_HIT_TEST_MIN_DISTANCE = 6;
const DEFAULT_TRACK_LINE_WIDTH = 1;
const FOLLOWED_TRACK_LINE_WIDTH_MULTIPLIER = 1.35;
const SELECTED_TRACK_LINE_WIDTH_MULTIPLIER = 1.5;

type UsePlanarInteractionsParams = {
  canvasRef: MutableRefObject<HTMLCanvasElement | null>;
  layout: PlanarLayout;
  viewStateRef: MutableRefObject<ViewState>;
  updateViewState: (updater: Partial<ViewState> | ((prev: ViewState) => ViewState)) => void;
  sliceData: SliceData | null;
  samplePixelValue: (x: number, y: number) => HoveredIntensityInfo | null;
  clampedSliceIndex: number;
  effectiveMaxSlices: number;
  onSliceIndexChange: (index: number) => void;
  trackScale: { x: number; y: number; z: number };
  tracks: TrackDefinition[];
  trackLookup: Map<string, TrackDefinition>;
  trackVisibility: Record<string, boolean>;
  trackLineWidthByChannel: Record<string, number>;
  channelTrackColorModes: PlanarViewerProps['channelTrackColorModes'];
  channelTrackOffsets: PlanarViewerProps['channelTrackOffsets'];
  selectedTrackIds: ReadonlySet<string>;
  followedTrackId: string | null;
  onTrackSelectionToggle: (trackId: string) => void;
  onHoverVoxelChange?: PlanarViewerProps['onHoverVoxelChange'];
  clampedTimeIndex: number;
  primaryVolume: NormalizedVolume | null;
  hoveredPixelRef: MutableRefObject<HoveredPixel>;
  onHoveredPixelChange: (value: HoveredPixel) => void;
  computeTrackCentroid: (trackId: string, maxVisibleTime: number) => { x: number; y: number; z: number } | null;
};

type PointerState = {
  pointerId: number;
  startX: number;
  startY: number;
  startOffsetX: number;
  startOffsetY: number;
};

function resolveTrackHexColor(track: TrackDefinition, channelModes: PlanarViewerProps['channelTrackColorModes']) {
  const mode = channelModes[track.channelId];
  if (mode && mode.type === 'uniform') {
    return mode.color;
  }
  return getTrackColorHex(track.id);
}

export function usePlanarInteractions({
  canvasRef,
  layout,
  viewStateRef,
  updateViewState,
  sliceData,
  samplePixelValue,
  clampedSliceIndex,
  effectiveMaxSlices,
  onSliceIndexChange,
  trackScale,
  tracks,
  trackLookup,
  trackVisibility,
  trackLineWidthByChannel,
  channelTrackColorModes,
  channelTrackOffsets,
  selectedTrackIds,
  followedTrackId,
  onTrackSelectionToggle,
  onHoverVoxelChange,
  clampedTimeIndex,
  primaryVolume,
  hoveredPixelRef,
  onHoveredPixelChange,
  computeTrackCentroid
}: UsePlanarInteractionsParams) {
  const [hoveredTrackId, setHoveredTrackId] = useState<string | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ x: number; y: number } | null>(null);
  const pointerStateRef = useRef<PointerState | null>(null);
  const hoveredTrackIdRef = useRef<string | null>(null);
  const selectedTrackIdsRef = useRef<ReadonlySet<string>>(selectedTrackIds);
  const followedTrackIdRef = useRef<string | null>(followedTrackId);

  useEffect(() => {
    hoveredTrackIdRef.current = hoveredTrackId;
  }, [hoveredTrackId]);

  useEffect(() => {
    selectedTrackIdsRef.current = selectedTrackIds;
  }, [selectedTrackIds]);

  useEffect(() => {
    followedTrackIdRef.current = followedTrackId;
  }, [followedTrackId]);

  const emitHoverVoxel = useCallback(
    (value: Parameters<NonNullable<PlanarViewerProps['onHoverVoxelChange']>>[0]) => {
      onHoverVoxelChange?.(value);
    },
    [onHoverVoxelChange]
  );

  const updateHoveredPixel = useCallback(
    (value: HoveredPixel) => {
      const previous = hoveredPixelRef.current;
      if (
        (previous === null && value === null) ||
        (previous && value && previous.x === value.x && previous.y === value.y)
      ) {
        return;
      }

      hoveredPixelRef.current = value;
      onHoveredPixelChange(value);
    },
    [hoveredPixelRef, onHoveredPixelChange]
  );

  const trackRenderData = useMemo(() => {
    if (!primaryVolume) {
      return [] as TrackRenderEntry[];
    }

    const width = primaryVolume.width;
    const height = primaryVolume.height;
    const centerX = width / 2 - 0.5;
    const centerY = height / 2 - 0.5;
    const centerZ = primaryVolume.depth > 0 ? primaryVolume.depth / 2 - 0.5 : 0;
    const maxVisibleTime = clampedTimeIndex;

    return tracks
      .map<TrackRenderEntry | null>((track) => {
        if (track.points.length === 0) {
          return null;
        }

        const offset = channelTrackOffsets[track.channelId] ?? { x: 0, y: 0 };
        const scaledOffsetX = offset.x * trackScale.x;
        const scaledOffsetY = offset.y * trackScale.y;
        const baseColor = getColorComponents(resolveTrackHexColor(track, channelTrackColorModes));
        const highlightColor = mixWithWhite(baseColor, TRACK_HIGHLIGHT_BOOST);

        const visiblePoints: { x: number; y: number; z: number }[] = [];
        for (const point of track.points) {
          if (point.time - maxVisibleTime > TRACK_EPSILON) {
            break;
          }
          const resolvedZ = Number.isFinite(point.z) ? point.z : 0;
          visiblePoints.push({
            x: point.x * trackScale.x + scaledOffsetX - centerX,
            y: point.y * trackScale.y + scaledOffsetY - centerY,
            z: resolvedZ * trackScale.z - centerZ
          });
        }

        if (visiblePoints.length === 0) {
          return null;
        }

        return {
          id: track.id,
          channelId: track.channelId,
          channelName: track.channelName,
          trackNumber: track.trackNumber,
          points: visiblePoints,
          baseColor,
          highlightColor
        };
      })
      .filter((entry): entry is TrackRenderEntry => entry !== null);
  }, [
    channelTrackColorModes,
    channelTrackOffsets,
    clampedTimeIndex,
    primaryVolume,
    trackScale.x,
    trackScale.y,
    trackScale.z,
    tracks
  ]);

  const updateHoverState = useCallback((trackId: string | null, position: { x: number; y: number } | null) => {
    if (hoveredTrackIdRef.current !== trackId) {
      hoveredTrackIdRef.current = trackId;
      setHoveredTrackId(trackId);
    }
    setTooltipPosition(position);
  }, []);

  const clearHoverState = useCallback(() => {
    if (hoveredTrackIdRef.current !== null) {
      hoveredTrackIdRef.current = null;
      setHoveredTrackId(null);
    }
    setTooltipPosition(null);
  }, []);

  const clearPixelInfo = useCallback(() => {
    updateHoveredPixel(null);
    emitHoverVoxel(null);
  }, [emitHoverVoxel, updateHoveredPixel]);

  const updatePixelHover = useCallback(
    (event: PointerEvent) => {
      if (!sliceData || !sliceData.hasLayer || !layout.xy) {
        clearPixelInfo();
        return;
      }

      const canvas = canvasRef.current;
      if (!canvas) {
        clearPixelInfo();
        return;
      }

      const rect = canvas.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;
      if (width <= 0 || height <= 0) {
        clearPixelInfo();
        return;
      }

      const pointerX = event.clientX - rect.left;
      const pointerY = event.clientY - rect.top;
      if (pointerX < 0 || pointerY < 0 || pointerX > width || pointerY > height) {
        clearPixelInfo();
        return;
      }

      const currentView = viewStateRef.current;
      const scale = Math.max(currentView.scale, 1e-6);
      const rotation = currentView.rotation;
      const cos = Math.cos(rotation);
      const sin = Math.sin(rotation);
      const centerX = width / 2 + currentView.offsetX;
      const centerY = height / 2 + currentView.offsetY;
      const dx = pointerX - centerX;
      const dy = pointerY - centerY;
      const rotatedX = dx * cos + dy * sin;
      const rotatedY = -dx * sin + dy * cos;
      const blockX = rotatedX / scale + layout.blockWidth / 2;
      const blockY = rotatedY / scale + layout.blockHeight / 2;

      const xyView = layout.xy;
      if (
        !xyView ||
        blockX < xyView.originX ||
        blockY < xyView.originY ||
        blockX >= xyView.originX + xyView.width ||
        blockY >= xyView.originY + xyView.height
      ) {
        clearPixelInfo();
        return;
      }

      const sliceX = blockX - xyView.originX;
      const sliceY = blockY - xyView.originY;

      const intensity = samplePixelValue(sliceX, sliceY);
      if (!intensity) {
        clearPixelInfo();
        return;
      }

      const voxelX = Math.round(clamp(sliceX, 0, Math.max(0, sliceData.width - 1)));
      const voxelY = Math.round(clamp(sliceY, 0, Math.max(0, sliceData.height - 1)));
      updateHoveredPixel({ x: voxelX, y: voxelY });
      emitHoverVoxel({
        intensity: intensity.intensity,
        components: intensity.components,
        coordinates: {
          x: voxelX,
          y: voxelY,
          z: clampedSliceIndex
        }
      });
    },
    [
      clampedSliceIndex,
      clearPixelInfo,
      emitHoverVoxel,
      samplePixelValue,
      sliceData,
      layout,
      updateHoveredPixel,
      viewStateRef,
      canvasRef
    ]
  );

  useEffect(() => {
    return () => {
      emitHoverVoxel(null);
    };
  }, [emitHoverVoxel]);

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

      if (!layout.xy || layout.blockWidth <= 0 || layout.blockHeight <= 0) {
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
      const halfBlockWidth = layout.blockWidth / 2;
      const halfBlockHeight = layout.blockHeight / 2;
      const xyCenterX = layout.xy.centerX;
      const xyCenterY = layout.xy.centerY;

      let closestTrackId: string | null = null;
      let closestDistance = Infinity;

      const computeScreenPosition = (pointX: number, pointY: number) => {
        const blockX = xyCenterX + pointX;
        const blockY = xyCenterY + pointY;
        const relX = blockX - halfBlockWidth;
        const relY = blockY - halfBlockHeight;
        const rotatedX = relX * cos - relY * sin;
        const rotatedY = relX * sin + relY * cos;
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
        const isSelected = selectedTrackIdsRef.current.has(track.id);
        if (!isFollowed && !isExplicitlyVisible && !isSelected) {
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

        const channelLineWidth = trackLineWidthByChannel[track.channelId] ?? DEFAULT_TRACK_LINE_WIDTH;
        const sanitizedLineWidth = Math.max(0.1, Math.min(10, channelLineWidth));
        let widthMultiplier = 1;
        if (isFollowed) {
          widthMultiplier = Math.max(widthMultiplier, FOLLOWED_TRACK_LINE_WIDTH_MULTIPLIER);
        }
        if (isSelected) {
          widthMultiplier = Math.max(widthMultiplier, SELECTED_TRACK_LINE_WIDTH_MULTIPLIER);
        }
        const strokeScreenWidth = Math.max(0.1, (sanitizedLineWidth / scale) * widthMultiplier);
        const endpointRadius = Math.max(strokeScreenWidth * 0.6, 1.2 / scale);
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
    [layout, trackLineWidthByChannel, trackRenderData, trackVisibility, viewStateRef, canvasRef]
  );

  const hoveredTrackDefinition = hoveredTrackId ? trackLookup.get(hoveredTrackId) ?? null : null;
  const hoveredTrackLabel = hoveredTrackDefinition
    ? `${hoveredTrackDefinition.channelName} · Track #${hoveredTrackDefinition.trackNumber}`
    : null;

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (event.button !== 0) {
        return;
      }
      const nativeEvent = event.nativeEvent;

      const { trackId, pointer } = performTrackHitTest(nativeEvent);
      if (trackId !== null) {
        pointerStateRef.current = null;
        onTrackSelectionToggle(trackId);
        if (pointer) {
          updateHoverState(trackId, pointer);
        }
        return;
      }

      const target = event.currentTarget;
      const currentView = viewStateRef.current;
      pointerStateRef.current = {
        pointerId: nativeEvent.pointerId,
        startX: nativeEvent.clientX,
        startY: nativeEvent.clientY,
        startOffsetX: currentView.offsetX,
        startOffsetY: currentView.offsetY
      };
      target.setPointerCapture(nativeEvent.pointerId);
    },
    [onTrackSelectionToggle, performTrackHitTest, updateHoverState, viewStateRef]
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const nativeEvent = event.nativeEvent;
      const state = pointerStateRef.current;
      if (state && state.pointerId === nativeEvent.pointerId) {
        const deltaX = nativeEvent.clientX - state.startX;
        const deltaY = nativeEvent.clientY - state.startY;
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
        updatePixelHover(nativeEvent);
        return;
      }

      const { trackId, pointer } = performTrackHitTest(nativeEvent);
      if (trackId !== null && pointer) {
        updateHoverState(trackId, pointer);
      } else {
        clearHoverState();
      }
      updatePixelHover(nativeEvent);
    },
    [clearHoverState, performTrackHitTest, updateHoverState, updatePixelHover, updateViewState]
  );

  const handlePointerEnd = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const nativeEvent = event.nativeEvent;
      const state = pointerStateRef.current;
      if (state && state.pointerId === nativeEvent.pointerId) {
        const target = event.currentTarget;
        target.releasePointerCapture(nativeEvent.pointerId);
        pointerStateRef.current = null;
      }

      const { trackId, pointer } = performTrackHitTest(nativeEvent);
      if (trackId !== null && pointer) {
        updateHoverState(trackId, pointer);
      } else {
        clearHoverState();
      }
      updatePixelHover(nativeEvent);
    },
    [clearHoverState, performTrackHitTest, updateHoverState, updatePixelHover]
  );

  const handleWheel = useCallback(
    (event: ReactWheelEvent<HTMLCanvasElement>) => {
      if (event.deltaY === 0) {
        return;
      }
      event.preventDefault();
      const zoomFactor = Math.exp(-event.deltaY * 0.0015);
      updateViewState((previous) => {
        const nextScale = clamp(previous.scale * zoomFactor, MIN_SCALE, MAX_SCALE);
        return { ...previous, scale: nextScale };
      });
    },
    [updateViewState]
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
    viewStateRef
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
  }, [
    clampedSliceIndex,
    effectiveMaxSlices,
    onSliceIndexChange,
    updateViewState
  ]);

  return {
    trackRenderData,
    hoveredTrackId,
    hoveredTrackLabel,
    tooltipPosition,
    canvasHandlers: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerEnd,
      onPointerCancel: handlePointerEnd,
      onPointerLeave: handlePointerEnd,
      onWheel: handleWheel,
    },
  };
}
