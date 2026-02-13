import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { getTrackColorHex } from '../../../../shared/colorMaps/trackColors';
import type { TrackDefinition } from '../../../../types/tracks';
import type { NormalizedVolume } from '../../../../core/volumeProcessing';
import { clamp, getColorComponents, mixWithWhite } from '../utils';
import type {
  HoveredIntensityInfo,
  HoveredPixel,
  PlanarLayout,
  PlanarViewerProps,
  SliceData,
  TrackRenderEntry,
  ViewState
} from '../types';
import {
  DEFAULT_TRACK_OPACITY,
  TRACK_EPSILON,
  TRACK_HIGHLIGHT_BOOST
} from './usePlanarInteractions/constants';
import { usePlanarCanvasInputHandlers } from './usePlanarInteractions/usePlanarCanvasInputHandlers';
import { usePlanarKeyboardShortcuts } from './usePlanarInteractions/usePlanarKeyboardShortcuts';
import { usePlanarPixelHover } from './usePlanarInteractions/usePlanarPixelHover';
import { usePlanarTrackHitTest } from './usePlanarInteractions/usePlanarTrackHitTest';
import { usePlanarTrackHoverState } from './usePlanarInteractions/usePlanarTrackHoverState';

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
  trackOpacityByTrackSet: Record<string, number>;
  trackLineWidthByTrackSet: Record<string, number>;
  trackColorModesByTrackSet: PlanarViewerProps['trackColorModesByTrackSet'];
  channelTrackOffsets: PlanarViewerProps['channelTrackOffsets'];
  isFullTrackTrailEnabled: boolean;
  trackTrailLength: number;
  selectedTrackIds: ReadonlySet<string>;
  followedTrackId: string | null;
  onTrackSelectionToggle: (trackId: string) => void;
  paintbrush?: PlanarViewerProps['paintbrush'];
  onHoverVoxelChange?: PlanarViewerProps['onHoverVoxelChange'];
  clampedTimeIndex: number;
  primaryVolume: NormalizedVolume | null;
  hoveredPixelRef: MutableRefObject<HoveredPixel>;
  onHoveredPixelChange: (value: HoveredPixel) => void;
  computeTrackCentroid: (trackId: string, maxVisibleTime: number) => { x: number; y: number; z: number } | null;
};

function resolveTrackHexColor(track: TrackDefinition, channelModes: PlanarViewerProps['trackColorModesByTrackSet']) {
  const mode = channelModes[track.trackSetId];
  if (mode && mode.type === 'uniform') {
    return mode.color;
  }
  return getTrackColorHex(track.trackNumber);
}

type ScaledTrackPoint = { x: number; y: number; z: number };

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
  onHoveredPixelChange,
  computeTrackCentroid
}: UsePlanarInteractionsParams) {
  const selectedTrackIdsRef = useRef<ReadonlySet<string>>(selectedTrackIds);
  const followedTrackIdRef = useRef<string | null>(followedTrackId);
  const { hoveredTrackId, tooltipPosition, updateHoverState, clearHoverState } = usePlanarTrackHoverState();

  useEffect(() => {
    selectedTrackIdsRef.current = selectedTrackIds;
  }, [selectedTrackIds]);

  useEffect(() => {
    followedTrackIdRef.current = followedTrackId;
  }, [followedTrackId]);

  const trackRenderData = useMemo(() => {
    if (!primaryVolume) {
      return [] as TrackRenderEntry[];
    }

    const maxVisibleTime = clampedTimeIndex;
    const minVisibleTime = isFullTrackTrailEnabled ? -Infinity : clampedTimeIndex - trackTrailLength;

    return tracks
      .map<TrackRenderEntry | null>((track) => {
        if (track.points.length === 0) {
          return null;
        }

        const channelOpacity = trackOpacityByTrackSet[track.trackSetId] ?? DEFAULT_TRACK_OPACITY;
        const isChannelHidden = channelOpacity <= 0;
        const isExplicitlyTracked =
          selectedTrackIdsRef.current.has(track.id) || followedTrackIdRef.current === track.id;
        if (isChannelHidden && !isExplicitlyTracked) {
          return null;
        }

        const offset = channelTrackOffsets[track.channelId] ?? { x: 0, y: 0 };
        const scaledOffsetX = offset.x * trackScale.x;
        const scaledOffsetY = offset.y * trackScale.y;
        const baseColor = getColorComponents(resolveTrackHexColor(track, trackColorModesByTrackSet));
        const highlightColor = mixWithWhite(baseColor, TRACK_HIGHLIGHT_BOOST);

        const scaledPoints: ScaledTrackPoint[] = [];
        for (const point of track.points) {
          if (point.time - maxVisibleTime > TRACK_EPSILON) {
            break;
          }
          if (point.time + TRACK_EPSILON < minVisibleTime) {
            continue;
          }
          const resolvedZ = Number.isFinite(point.z) ? point.z : 0;
          scaledPoints.push({
            x: point.x * trackScale.x + scaledOffsetX,
            y: point.y * trackScale.y + scaledOffsetY,
            z: resolvedZ * trackScale.z
          });
        }

        if (scaledPoints.length === 0) {
          return null;
        }

        // Render full projections of each track in the XY view so overlays stay smooth and
        // consistent regardless of the current slice anchor.
        const xyPoints = scaledPoints.map((point) => ({ x: point.x, y: point.y }));

        if (xyPoints.length === 0) {
          return null;
        }

        return {
          id: track.id,
          trackSetId: track.trackSetId,
          trackSetName: track.trackSetName,
          channelId: track.channelId,
          channelName: track.channelName,
          trackNumber: track.trackNumber,
          xyPoints,
          baseColor,
          highlightColor
        };
      })
      .filter((entry): entry is TrackRenderEntry => entry !== null);
  }, [
    trackColorModesByTrackSet,
    channelTrackOffsets,
    clampedTimeIndex,
    followedTrackId,
    isFullTrackTrailEnabled,
    primaryVolume,
    selectedTrackIds,
    trackTrailLength,
    trackOpacityByTrackSet,
    trackScale.x,
    trackScale.y,
    trackScale.z,
    tracks
  ]);

  const { updatePixelHover } = usePlanarPixelHover({
    canvasRef,
    layout,
    viewStateRef,
    sliceData,
    samplePixelValue,
    clampedSliceIndex,
    trackScale: { x: trackScale.x, y: trackScale.y },
    hoveredPixelRef,
    onHoveredPixelChange,
    onHoverVoxelChange
  });

  const performTrackHitTest = usePlanarTrackHitTest({
    canvasRef,
    layout,
    viewStateRef,
    trackRenderData,
    trackVisibility,
    trackOpacityByTrackSet,
    trackLineWidthByTrackSet,
    selectedTrackIdsRef,
    followedTrackIdRef
  });

  const canvasHandlers = usePlanarCanvasInputHandlers({
    clampedSliceIndex,
    paintbrush,
    hoveredPixelRef,
    viewStateRef,
    updateViewState,
    onTrackSelectionToggle,
    performTrackHitTest,
    updateHoverState,
    clearHoverState,
    updatePixelHover
  });

  const hoveredTrackDefinition = hoveredTrackId ? trackLookup.get(hoveredTrackId) ?? null : null;
  const hoveredTrackLabel = hoveredTrackDefinition
    ? `${hoveredTrackDefinition.trackSetName} · Track #${
        hoveredTrackDefinition.displayTrackNumber ?? String(hoveredTrackDefinition.trackNumber)
      }`
    : null;

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
    const centerX = centroid.x - (width / 2 - 0.5) * trackScale.x;
    const centerY = centroid.y - (height / 2 - 0.5) * trackScale.y;
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
    trackScale.x,
    trackScale.y,
    updateViewState,
    viewStateRef
  ]);

  usePlanarKeyboardShortcuts({
    clampedSliceIndex,
    effectiveMaxSlices,
    onSliceIndexChange,
    updateViewState
  });

  return {
    trackRenderData,
    hoveredTrackId,
    hoveredTrackLabel,
    tooltipPosition,
    canvasHandlers
  };
}
