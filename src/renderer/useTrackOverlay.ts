import { useCallback, useEffect } from 'react';
import type { MutableRefObject } from 'react';
import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial';
import type { TrackDefinition } from '../types/tracks';

export type TrackLineResource = {
  line: Line2;
  outline: Line2;
  geometry: LineGeometry;
  material: LineMaterial;
  outlineMaterial: LineMaterial;
  positions: Float32Array;
  times: number[];
  baseColor: THREE.Color;
  highlightColor: THREE.Color;
  channelId: string;
  baseLineWidth: number;
  targetLineWidth: number;
  outlineExtraWidth: number;
  targetOpacity: number;
  outlineBaseOpacity: number;
  isFollowed: boolean;
  isSelected: boolean;
  isHovered: boolean;
  shouldShow: boolean;
  needsAppearanceUpdate: boolean;
};

export type TrackOverlayControls = {
  updateTrackDrawRanges: (targetTimeIndex: number) => void;
  updateTrackInteractionState: () => void;
};

export type UseTrackOverlayParams = {
  trackGroup: THREE.Group | null;
  trackLinesRef: MutableRefObject<Map<string, TrackLineResource>>;
  tracks: TrackDefinition[];
  trackOverlayRevision: number;
  rendererSize: { width: number; height: number } | null;
  channelTrackOffsets: Record<string, { x: number; y: number }>;
  resolveTrackColor: (track: TrackDefinition) => THREE.Color;
  hoveredTrackIdRef: MutableRefObject<string | null>;
  clearHoverState: () => void;
  timeIndexRef: MutableRefObject<number>;
  defaultTrackOpacity: number;
  defaultTrackLineWidth: number;
  hoverLineWidthMultiplier: number;
  followLineWidthMultiplier: number;
  selectedLineWidthMultiplier: number;
  trackVisibility: Record<string, boolean>;
  selectedTrackIds: ReadonlySet<string>;
  hoveredTrackId: string | null;
  followedTrackId: string | null;
  trackOpacityByChannel: Record<string, number>;
  trackLineWidthByChannel: Record<string, number>;
};

export function useTrackOverlay({
  trackGroup,
  trackLinesRef,
  tracks,
  trackOverlayRevision,
  rendererSize,
  channelTrackOffsets,
  resolveTrackColor,
  hoveredTrackIdRef,
  clearHoverState,
  timeIndexRef,
  defaultTrackOpacity,
  defaultTrackLineWidth,
  hoverLineWidthMultiplier,
  followLineWidthMultiplier,
  selectedLineWidthMultiplier,
  trackVisibility,
  selectedTrackIds,
  hoveredTrackId,
  followedTrackId,
  trackOpacityByChannel,
  trackLineWidthByChannel
}: UseTrackOverlayParams): TrackOverlayControls {
  const updateTrackDrawRanges = useCallback(
    (targetTimeIndex: number) => {
      const lines = trackLinesRef.current;
      const maxVisibleTime = targetTimeIndex;

      for (const resource of lines.values()) {
        const { geometry, times } = resource;
        let visiblePoints = 0;
        for (let index = 0; index < times.length; index++) {
          if (times[index] <= maxVisibleTime) {
            visiblePoints = index + 1;
          } else {
            break;
          }
        }

        const totalSegments = Math.max(times.length - 1, 0);
        const visibleSegments = Math.min(Math.max(visiblePoints - 1, 0), totalSegments);
        geometry.instanceCount = visibleSegments;
      }
    },
    [trackLinesRef]
  );

  const updateTrackInteractionState = useCallback(() => {
    if (trackOverlayRevision === 0) {
      return;
    }

    const trackGroupInstance = trackGroup;
    if (!trackGroupInstance) {
      return;
    }

    let visibleCount = 0;

    for (const track of tracks) {
      const resource = trackLinesRef.current.get(track.id);
      if (!resource) {
        continue;
      }

      const { line, outline } = resource;

      const isExplicitlyVisible = trackVisibility[track.id] ?? true;
      const isFollowed = followedTrackId === track.id;
      const isHovered = hoveredTrackId === track.id;
      const isSelected = selectedTrackIds.has(track.id);
      const isHighlighted = isFollowed || isHovered || isSelected;
      const shouldShow = isFollowed || isExplicitlyVisible || isSelected;

      resource.channelId = track.channelId;
      resource.isFollowed = isFollowed;
      resource.isHovered = isHovered;
      resource.isSelected = isSelected;
      resource.shouldShow = shouldShow;
      resource.needsAppearanceUpdate = true;

      line.visible = shouldShow;
      outline.visible = shouldShow && isHighlighted;
      if (shouldShow) {
        visibleCount += 1;
      }

      const channelOpacity = trackOpacityByChannel[track.channelId] ?? defaultTrackOpacity;
      const sanitizedOpacity = Math.min(1, Math.max(0, channelOpacity));
      const opacityBoost = isFollowed || isSelected ? 0.15 : isHovered ? 0.12 : 0;
      resource.targetOpacity = Math.min(1, sanitizedOpacity + opacityBoost);

      const channelLineWidth = trackLineWidthByChannel[track.channelId] ?? defaultTrackLineWidth;
      const sanitizedLineWidth = Math.max(0.1, Math.min(10, channelLineWidth));
      resource.baseLineWidth = sanitizedLineWidth;
      let widthMultiplier = 1;
      if (isHovered) {
        widthMultiplier = Math.max(widthMultiplier, hoverLineWidthMultiplier);
      }
      if (isFollowed) {
        widthMultiplier = Math.max(widthMultiplier, followLineWidthMultiplier);
      }
      if (isSelected) {
        widthMultiplier = Math.max(widthMultiplier, selectedLineWidthMultiplier);
      }
      resource.targetLineWidth = sanitizedLineWidth * widthMultiplier;
      resource.outlineExtraWidth = Math.max(sanitizedLineWidth * 0.75, 0.4);

      resource.outlineBaseOpacity = isFollowed || isSelected ? 0.75 : isHovered ? 0.9 : 0;
    }

    const followedTrackExists =
      followedTrackId !== null && trackLinesRef.current.has(followedTrackId);

    trackGroupInstance.visible = visibleCount > 0 || followedTrackExists;

    if (hoveredTrackId !== null) {
      const hoveredResource = trackLinesRef.current.get(hoveredTrackId);
      if (!hoveredResource || !hoveredResource.line.visible) {
        clearHoverState();
      }
    }
  }, [
    trackOverlayRevision,
    trackGroup,
    tracks,
    trackLinesRef,
    trackVisibility,
    followedTrackId,
    hoveredTrackId,
    selectedTrackIds,
    trackOpacityByChannel,
    defaultTrackOpacity,
    trackLineWidthByChannel,
    defaultTrackLineWidth,
    hoverLineWidthMultiplier,
    followLineWidthMultiplier,
    selectedLineWidthMultiplier,
    clearHoverState
  ]);

  useEffect(() => {
    const trackGroupInstance = trackGroup;
    const lines = trackLinesRef.current;

    if (!trackGroupInstance) {
      if (lines.size > 0) {
        for (const resource of lines.values()) {
          resource.geometry.dispose();
          resource.material.dispose();
          resource.outlineMaterial.dispose();
        }
        lines.clear();
      }
      return;
    }

    const activeIds = new Set<string>();
    for (const track of tracks) {
      activeIds.add(track.id);
    }

    for (const [id, resource] of Array.from(lines.entries())) {
      if (!activeIds.has(id)) {
        trackGroupInstance.remove(resource.line);
        trackGroupInstance.remove(resource.outline);
        resource.geometry.dispose();
        resource.material.dispose();
        resource.outlineMaterial.dispose();
        if (hoveredTrackIdRef.current === id) {
          clearHoverState();
        }
        lines.delete(id);
      }
    }

    for (const track of tracks) {
      if (track.points.length === 0) {
        continue;
      }

      const offset = channelTrackOffsets[track.channelId] ?? { x: 0, y: 0 };
      const positions = new Float32Array(track.points.length * 3);
      const times = new Array<number>(track.points.length);

      for (let index = 0; index < track.points.length; index++) {
        const point = track.points[index];
        positions[index * 3 + 0] = point.x + offset.x;
        positions[index * 3 + 1] = point.y + offset.y;
        positions[index * 3 + 2] = point.z;
        times[index] = point.time;
      }

      const baseColor = resolveTrackColor(track);
      const highlightColor = baseColor.clone().lerp(new THREE.Color(0xffffff), 0.4);

      let resource = lines.get(track.id) ?? null;
      if (!resource) {
        const geometry = new LineGeometry();
        geometry.setPositions(positions);
        geometry.instanceCount = 0;

        const material = new LineMaterial({
          color: baseColor.clone(),
          linewidth: 1,
          transparent: true,
          opacity: 0.9,
          depthTest: false,
          depthWrite: false
        });
        const outlineMaterial = new LineMaterial({
          color: new THREE.Color(0xffffff),
          linewidth: 1,
          transparent: true,
          opacity: 0,
          depthTest: false,
          depthWrite: false
        });

        const width = Math.max(rendererSize?.width ?? 1, 1);
        const height = Math.max(rendererSize?.height ?? 1, 1);
        material.resolution.set(width, height);
        outlineMaterial.resolution.set(width, height);

        const outline = new Line2(geometry, outlineMaterial);
        outline.computeLineDistances();
        outline.renderOrder = 999;
        outline.frustumCulled = false;
        outline.visible = false;

        const line = new Line2(geometry, material);
        line.computeLineDistances();
        line.renderOrder = 1000;
        line.frustumCulled = false;
        const lineWithUserData = line as unknown as { userData: Record<string, unknown> };
        lineWithUserData.userData.trackId = track.id;

        trackGroupInstance.add(outline);
        trackGroupInstance.add(line);

        resource = {
          line,
          outline,
          geometry,
          material,
          outlineMaterial,
          positions,
          times,
          baseColor: baseColor.clone(),
          highlightColor: highlightColor.clone(),
          channelId: track.channelId,
          baseLineWidth: defaultTrackLineWidth,
          targetLineWidth: defaultTrackLineWidth,
          outlineExtraWidth: Math.max(defaultTrackLineWidth * 0.75, 0.4),
          targetOpacity: defaultTrackOpacity,
          outlineBaseOpacity: 0,
          isFollowed: false,
          isSelected: false,
          isHovered: false,
          shouldShow: false,
          needsAppearanceUpdate: true
        };
        lines.set(track.id, resource);
      } else {
        const { geometry, line, outline } = resource;
        geometry.setPositions(positions);
        line.computeLineDistances();
        outline.computeLineDistances();
        resource.positions = positions;
        resource.times = times;
        resource.baseColor.copy(baseColor);
        resource.highlightColor.copy(highlightColor);
        resource.channelId = track.channelId;
        resource.needsAppearanceUpdate = true;
      }
    }

    updateTrackDrawRanges(timeIndexRef.current);
    updateTrackInteractionState();
  }, [
    trackGroup,
    trackLinesRef,
    tracks,
    channelTrackOffsets,
    resolveTrackColor,
    rendererSize?.width,
    rendererSize?.height,
    hoveredTrackIdRef,
    clearHoverState,
    updateTrackDrawRanges,
    updateTrackInteractionState,
    defaultTrackLineWidth,
    defaultTrackOpacity,
    timeIndexRef,
    trackOverlayRevision
  ]);

  useEffect(() => {
    return () => {
      const lines = trackLinesRef.current;
      const group = trackGroup;
      if (!group) {
        for (const resource of lines.values()) {
          resource.geometry.dispose();
          resource.material.dispose();
          resource.outlineMaterial.dispose();
        }
        lines.clear();
        return;
      }

      for (const resource of lines.values()) {
        group.remove(resource.line);
        group.remove(resource.outline);
        resource.geometry.dispose();
        resource.material.dispose();
        resource.outlineMaterial.dispose();
      }
      lines.clear();
    };
  }, [trackGroup, trackLinesRef]);

  return { updateTrackDrawRanges, updateTrackInteractionState };
}

