import { useCallback, type MutableRefObject } from 'react';
import { clamp } from '../../utils';
import type { PlanarLayout, TrackHitTestResult, TrackRenderEntry, ViewState } from '../../types';
import {
  DEFAULT_TRACK_LINE_WIDTH,
  DEFAULT_TRACK_OPACITY,
  FOLLOWED_TRACK_LINE_WIDTH_MULTIPLIER,
  SELECTED_TRACK_LINE_WIDTH_MULTIPLIER,
  TRACK_HIT_TEST_MIN_DISTANCE
} from './constants';

type UsePlanarTrackHitTestParams = {
  canvasRef: MutableRefObject<HTMLCanvasElement | null>;
  layout: PlanarLayout;
  viewStateRef: MutableRefObject<ViewState>;
  trackRenderData: TrackRenderEntry[];
  trackVisibility: Record<string, boolean>;
  trackOpacityByTrackSet: Record<string, number>;
  trackLineWidthByTrackSet: Record<string, number>;
  selectedTrackIdsRef: MutableRefObject<ReadonlySet<string>>;
  followedTrackIdRef: MutableRefObject<string | null>;
};

export function usePlanarTrackHitTest({
  canvasRef,
  layout,
  viewStateRef,
  trackRenderData,
  trackVisibility,
  trackOpacityByTrackSet,
  trackLineWidthByTrackSet,
  selectedTrackIdsRef,
  followedTrackIdRef
}: UsePlanarTrackHitTestParams) {
  return useCallback(
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
      const originX = -layout.blockWidth / 2;
      const originY = -layout.blockHeight / 2;
      const xyOriginX = layout.xy.originX;
      const xyOriginY = layout.xy.originY;

      let closestTrackId: string | null = null;
      let closestDistance = Infinity;

      const computeScreenPosition = (
        pointX: number,
        pointY: number,
        viewOriginX: number,
        viewOriginY: number
      ) => {
        const blockX = originX + viewOriginX + pointX;
        const blockY = originY + viewOriginY + pointY;
        const rotatedX = blockX * cos - blockY * sin;
        const rotatedY = blockX * sin + blockY * cos;
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
        const channelOpacity = trackOpacityByTrackSet[track.trackSetId] ?? DEFAULT_TRACK_OPACITY;
        const isChannelHidden = channelOpacity <= 0;
        if (isChannelHidden && !isFollowed && !isSelected) {
          continue;
        }
        if (!isFollowed && !isExplicitlyVisible && !isSelected) {
          continue;
        }

        let minDistanceForTrack = Infinity;

        const measurePoints = (
          points: { x: number; y: number }[],
          viewOriginX: number,
          viewOriginY: number
        ) => {
          let previousPoint: { x: number; y: number } | null = null;

          for (const point of points) {
            const screenPoint = computeScreenPosition(point.x, point.y, viewOriginX, viewOriginY);
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
        };

        if (track.xyPoints.length > 0) {
          measurePoints(track.xyPoints, xyOriginX, xyOriginY);
        }

        if (!isFinite(minDistanceForTrack)) {
          continue;
        }

        const channelLineWidth = trackLineWidthByTrackSet[track.trackSetId] ?? DEFAULT_TRACK_LINE_WIDTH;
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
    [
      canvasRef,
      followedTrackIdRef,
      layout,
      selectedTrackIdsRef,
      trackLineWidthByTrackSet,
      trackOpacityByTrackSet,
      trackRenderData,
      trackVisibility,
      viewStateRef
    ]
  );
}
