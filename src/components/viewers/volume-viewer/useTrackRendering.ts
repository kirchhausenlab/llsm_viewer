import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import * as THREE from 'three';

import { createTrackColor } from '../../../shared/colorMaps/trackColors';
import type { TrackDefinition } from '../../../types/tracks';
import type { TrackColorMode } from '../../../types/tracks';
import {
  computeTrackEndCapRadius,
  FOLLOWED_TRACK_LINE_WIDTH_MULTIPLIER,
  HOVERED_TRACK_LINE_WIDTH_MULTIPLIER,
  SELECTED_TRACK_LINE_WIDTH_MULTIPLIER,
} from './rendering';
import { DEFAULT_TRACK_LINE_WIDTH, DEFAULT_TRACK_OPACITY } from './constants';
import type { InstancedLineGeometry, TrackLineResource } from '../VolumeViewer.types';
import { Line2 } from 'three/examples/jsm/lines/Line2';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry';
import { useTrackHoverState } from './trackHoverState';
import { updateTrackDrawRanges as applyTrackDrawRanges } from './trackDrawRanges';
import { performTrackHoverHitTest } from './trackHitTesting';
import { updateTrackAppearance as applyTrackAppearance } from './trackAppearance';

export type UseTrackRenderingParams = {
  tracks: TrackDefinition[];
  trackVisibility: Record<string, boolean>;
  trackOpacityByTrackSet: Record<string, number>;
  trackLineWidthByTrackSet: Record<string, number>;
  trackColorModesByTrackSet: Record<string, TrackColorMode>;
  channelTrackOffsets: Record<string, { x: number; y: number }>;
  trackScale: { x?: number; y?: number; z?: number };
  isFullTrackTrailEnabled: boolean;
  trackTrailLength: number;
  selectedTrackIds: ReadonlySet<string>;
  followedTrackId: string | null;
  clampedTimeIndex: number;
  trackGroupRef: MutableRefObject<THREE.Group | null>;
  trackLinesRef: MutableRefObject<Map<string, TrackLineResource>>;
  containerRef: MutableRefObject<HTMLDivElement | null>;
  rendererRef: MutableRefObject<THREE.WebGLRenderer | null>;
  cameraRef: MutableRefObject<THREE.PerspectiveCamera | null>;
  hoverRaycasterRef: MutableRefObject<THREE.Raycaster | null>;
  currentDimensionsRef: MutableRefObject<{ width: number; height: number; depth: number } | null>;
  hasActive3DLayer: boolean;
};

export function useTrackRendering({
  tracks,
  trackVisibility,
  trackOpacityByTrackSet,
  trackLineWidthByTrackSet,
  trackColorModesByTrackSet,
  channelTrackOffsets,
  trackScale: _trackScale,
  isFullTrackTrailEnabled,
  trackTrailLength,
  selectedTrackIds,
  followedTrackId,
  clampedTimeIndex,
  trackGroupRef,
  trackLinesRef,
  containerRef,
  rendererRef,
  cameraRef,
  hoverRaycasterRef,
  currentDimensionsRef,
  hasActive3DLayer,
}: UseTrackRenderingParams) {
  const [trackOverlayRevision, setTrackOverlayRevision] = useState(0);
  const {
    hoveredTrackIdRef,
    hoveredTrackId,
    tooltipPosition,
    updateHoverState,
    clearHoverState
  } = useTrackHoverState();
  const previouslyHad3DLayerRef = useRef(false);

  const trackLookup = useMemo(() => {
    const map = new Map<string, TrackDefinition>();
    for (const track of tracks) {
      map.set(track.id, track);
    }
    return map;
  }, [tracks]);

  const resolveTrackColor = useCallback(
    (track: TrackDefinition) => {
      const mode = trackColorModesByTrackSet[track.trackSetId];
      if (mode && mode.type === 'uniform') {
        return new THREE.Color(mode.color);
      }
      return createTrackColor(track.trackNumber);
    },
    [trackColorModesByTrackSet],
  );

  const applyTrackGroupTransform = useCallback(
    (dimensions: { width: number; height: number; depth: number } | null) => {
      const trackGroup = trackGroupRef.current;
      if (!trackGroup) {
        return;
      }

      if (!dimensions) {
        trackGroup.position.set(0, 0, 0);
        trackGroup.scale.set(1, 1, 1);
        trackGroup.matrixWorldNeedsUpdate = true;
        return;
      }

      const { width, height, depth } = dimensions;
      const maxDimension = Math.max(width, height, depth);
      if (!Number.isFinite(maxDimension) || maxDimension <= 0) {
        trackGroup.position.set(0, 0, 0);
        trackGroup.scale.set(1, 1, 1);
        trackGroup.matrixWorldNeedsUpdate = true;
        return;
      }

      trackGroup.position.set(0, 0, 0);
      trackGroup.scale.set(1, 1, 1);
      trackGroup.matrixWorldNeedsUpdate = true;
    },
    [trackGroupRef],
  );

  const updateTrackDrawRanges = useCallback(
    (targetTimeIndex: number) => {
      applyTrackDrawRanges({
        lines: trackLinesRef.current.values(),
        targetTimeIndex,
        isFullTrackTrailEnabled,
        trackTrailLength
      });
    },
    [isFullTrackTrailEnabled, trackLinesRef, trackTrailLength],
  );

  useEffect(() => {
    if (trackOverlayRevision === 0) {
      return;
    }

    const trackGroup = trackGroupRef.current;
    if (!trackGroup) {
      return;
    }

    const trackLines = trackLinesRef.current;
    const activeIds = new Set<string>();
    tracks.forEach((track) => {
      if (track.points.length > 0) {
        activeIds.add(track.id);
      }
    });

    for (const [id, resource] of Array.from(trackLines.entries())) {
      if (!activeIds.has(id)) {
        trackGroup.remove(resource.line);
        trackGroup.remove(resource.outline);
        trackGroup.remove(resource.endCap);
        resource.geometry.dispose();
        resource.material.dispose();
        resource.outlineMaterial.dispose();
        resource.endCap.geometry.dispose();
        resource.endCapMaterial.dispose();
        if (hoveredTrackIdRef.current === id) {
          clearHoverState();
        }
        trackLines.delete(id);
      }
    }

    for (const track of tracks) {
      if (track.points.length === 0) {
        continue;
      }

      let resource = trackLines.get(track.id);
      const positions = new Float32Array(track.points.length * 3);
      const times = new Array<number>(track.points.length);
      const offset = channelTrackOffsets[track.channelId] ?? { x: 0, y: 0 };
      const offsetX = offset.x;
      const offsetY = offset.y;

      for (let index = 0; index < track.points.length; index++) {
        const point = track.points[index];
        const resolvedZ = Number.isFinite(point.z) ? point.z : 0;
        positions[index * 3 + 0] = point.x + offsetX;
        positions[index * 3 + 1] = point.y + offsetY;
        positions[index * 3 + 2] = resolvedZ;
        times[index] = point.time;
      }

      const baseColor = resolveTrackColor(track);
      const highlightColor = baseColor.clone().lerp(new THREE.Color(0xffffff), 0.4);

      if (!resource) {
        const geometry = new LineGeometry() as InstancedLineGeometry;
        geometry.setPositions(positions);
        geometry.instanceCount = 0;
        const material = new LineMaterial({
          color: baseColor.clone(),
          linewidth: 1,
          transparent: true,
          opacity: 0.9,
          depthTest: false,
          depthWrite: false,
        });
        const outlineMaterial = new LineMaterial({
          color: new THREE.Color(0xffffff),
          linewidth: 1,
          transparent: true,
          opacity: 0,
          depthTest: false,
          depthWrite: false,
        });
        const containerNode = containerRef.current;
        if (containerNode) {
          const width = Math.max(containerNode.clientWidth, 1);
          const height = Math.max(containerNode.clientHeight, 1);
          material.resolution.set(width, height);
          outlineMaterial.resolution.set(width, height);
        } else {
          material.resolution.set(1, 1);
          outlineMaterial.resolution.set(1, 1);
        }

        const outline = new Line2(geometry, outlineMaterial);
        outline.computeLineDistances();
        outline.renderOrder = 999;
        outline.frustumCulled = false;
        outline.visible = false;

        const line = new Line2(geometry, material);
        line.computeLineDistances();
        line.renderOrder = 1000;
        line.frustumCulled = false;
        line.userData.trackId = track.id;

        trackGroup.add(outline);
        trackGroup.add(line);

        const endCapMaterial = new THREE.MeshBasicMaterial({
          color: baseColor.clone(),
          transparent: true,
          opacity: DEFAULT_TRACK_OPACITY,
          depthTest: false,
          depthWrite: false,
        });
        const endCapGeometry = new THREE.SphereGeometry(1, 18, 14);
        const endCap = new THREE.Mesh(endCapGeometry, endCapMaterial);
        endCap.renderOrder = 1001;
        endCap.frustumCulled = false;
        endCap.visible = false;
        endCap.userData.trackId = track.id;

        trackGroup.add(endCap);
        const newResource: TrackLineResource = {
          line,
          outline,
          geometry,
          material,
          outlineMaterial,
          endCap,
          endCapMaterial,
          times,
          positions,
          geometryPointStartIndex: 0,
          geometryPointEndIndex: Math.max(track.points.length - 1, 0),
          baseColor: baseColor.clone(),
          highlightColor: highlightColor.clone(),
          channelId: track.channelId,
          baseLineWidth: DEFAULT_TRACK_LINE_WIDTH,
          targetLineWidth: DEFAULT_TRACK_LINE_WIDTH,
          outlineExtraWidth: Math.max(DEFAULT_TRACK_LINE_WIDTH * 0.75, 0.4),
          targetOpacity: DEFAULT_TRACK_OPACITY,
          outlineBaseOpacity: 0,
          endCapRadius: computeTrackEndCapRadius(DEFAULT_TRACK_LINE_WIDTH),
          hasVisiblePoints: false,
          isFollowed: false,
          isSelected: false,
          isHovered: false,
          shouldShow: false,
          needsAppearanceUpdate: true,
        };
        trackLines.set(track.id, newResource);
        resource = newResource;
      } else {
        const { geometry, line, outline } = resource;
        geometry.setPositions(positions);
        line.computeLineDistances();
        outline.computeLineDistances();
        resource.times = times;
        resource.positions = positions;
        resource.geometryPointStartIndex = 0;
        resource.geometryPointEndIndex = Math.max(track.points.length - 1, 0);
        resource.baseColor.copy(baseColor);
        resource.highlightColor.copy(highlightColor);
        resource.endCapMaterial.color.copy(baseColor);
        resource.endCap.userData.trackId = track.id;
        resource.endCapRadius = computeTrackEndCapRadius(resource.baseLineWidth);
        resource.channelId = track.channelId;
        resource.needsAppearanceUpdate = true;
      }
    }

    updateTrackDrawRanges(clampedTimeIndex);
  }, [
    trackColorModesByTrackSet,
    channelTrackOffsets,
    clearHoverState,
    clampedTimeIndex,
    containerRef,
    resolveTrackColor,
    trackLinesRef,
    trackOverlayRevision,
    tracks,
    updateTrackDrawRanges,
  ]);

  useEffect(() => {
    if (trackOverlayRevision === 0) {
      return;
    }

    const trackGroup = trackGroupRef.current;
    if (!trackGroup) {
      return;
    }

    let visibleCount = 0;

    for (const track of tracks) {
      const resource = trackLinesRef.current.get(track.id);
      if (!resource) {
        continue;
      }

      const { line, outline, endCap } = resource;

      const isExplicitlyVisible = trackVisibility[track.id] ?? true;
      const isFollowed = followedTrackId === track.id;
      const isHovered = hoveredTrackId === track.id;
      const isSelected = selectedTrackIds.has(track.id);
      const isHighlighted = isFollowed || isHovered || isSelected;
      const channelOpacity = trackOpacityByTrackSet[track.trackSetId] ?? DEFAULT_TRACK_OPACITY;
      const sanitizedOpacity = Math.min(1, Math.max(0, channelOpacity));
      const isChannelHidden = sanitizedOpacity <= 0;
      const isOpacityExempt = isFollowed || isSelected;
      const shouldShow =
        (isFollowed || isExplicitlyVisible || isSelected) && (!isChannelHidden || isOpacityExempt);

      resource.channelId = track.channelId;
      resource.isFollowed = isFollowed;
      resource.isHovered = isHovered;
      resource.isSelected = isSelected;
      resource.shouldShow = shouldShow;
      resource.needsAppearanceUpdate = true;

      line.visible = shouldShow;
      outline.visible = shouldShow && isHighlighted;
      endCap.visible = shouldShow && resource.hasVisiblePoints;
      if (shouldShow) {
        visibleCount += 1;
      }

      const effectiveOpacity = isChannelHidden && isOpacityExempt ? DEFAULT_TRACK_OPACITY : sanitizedOpacity;
      const opacityBoost = isFollowed || isSelected ? 0.15 : isHovered ? 0.12 : 0;
      resource.targetOpacity = Math.min(1, effectiveOpacity + opacityBoost);

      const channelLineWidth = trackLineWidthByTrackSet[track.trackSetId] ?? DEFAULT_TRACK_LINE_WIDTH;
      const sanitizedLineWidth = Math.max(0.1, Math.min(10, channelLineWidth));
      resource.baseLineWidth = sanitizedLineWidth;
      let widthMultiplier = 1;
      if (isHovered) {
        widthMultiplier = Math.max(widthMultiplier, HOVERED_TRACK_LINE_WIDTH_MULTIPLIER);
      }
      if (isFollowed) {
        widthMultiplier = Math.max(widthMultiplier, FOLLOWED_TRACK_LINE_WIDTH_MULTIPLIER);
      }
      if (isSelected) {
        widthMultiplier = Math.max(widthMultiplier, SELECTED_TRACK_LINE_WIDTH_MULTIPLIER);
      }
      resource.targetLineWidth = sanitizedLineWidth * widthMultiplier;
      resource.outlineExtraWidth = Math.max(sanitizedLineWidth * 0.75, 0.4);

      resource.endCapRadius = computeTrackEndCapRadius(resource.targetLineWidth);

      resource.outlineBaseOpacity = isFollowed || isSelected ? 0.75 : isHovered ? 0.9 : 0;
    }

    const followedTrackExists = followedTrackId !== null && trackLinesRef.current.has(followedTrackId);

    trackGroup.visible = visibleCount > 0 || followedTrackExists;

    if (hoveredTrackId !== null) {
      const hoveredResource = trackLinesRef.current.get(hoveredTrackId);
      if (!hoveredResource || !hoveredResource.line.visible) {
        clearHoverState();
      }
    }
  }, [
    clearHoverState,
    followedTrackId,
    hoveredTrackId,
    selectedTrackIds,
    trackLineWidthByTrackSet,
    trackOpacityByTrackSet,
    trackOverlayRevision,
    trackVisibility,
    trackLinesRef,
    tracks,
  ]);

  useEffect(() => {
    updateTrackDrawRanges(clampedTimeIndex);
  }, [clampedTimeIndex, updateTrackDrawRanges]);

  useEffect(() => {
    const previouslyHad3DLayer = previouslyHad3DLayerRef.current;
    previouslyHad3DLayerRef.current = hasActive3DLayer;

    if (!hasActive3DLayer || previouslyHad3DLayer === hasActive3DLayer) {
      return;
    }

    applyTrackGroupTransform(currentDimensionsRef.current);
    const trackGroup = trackGroupRef.current;
    if (trackGroup) {
      trackGroup.updateMatrixWorld(true);
    }

    setTrackOverlayRevision((revision) => revision + 1);
    updateTrackDrawRanges(clampedTimeIndex);
  }, [
    applyTrackGroupTransform,
    clampedTimeIndex,
    currentDimensionsRef,
    hasActive3DLayer,
    trackGroupRef,
    updateTrackDrawRanges,
  ]);

  const computeTrackCentroid = useCallback(
    (trackId: string, targetTimeIndex: number) => {
      const track = trackLookup.get(trackId);
      if (!track || track.points.length === 0) {
        return null;
      }

      const maxVisibleTime = targetTimeIndex;
      const minVisibleTime = isFullTrackTrailEnabled ? -Infinity : targetTimeIndex - trackTrailLength;
      const epsilon = 1e-3;
      let latestTime = -Infinity;
      let count = 0;
      let sumX = 0;
      let sumY = 0;
      let sumZ = 0;
      const offset = channelTrackOffsets[track.channelId] ?? { x: 0, y: 0 };
      const offsetX = offset.x;
      const offsetY = offset.y;

      for (const point of track.points) {
        if (point.time - maxVisibleTime > epsilon) {
          break;
        }

        if (point.time < minVisibleTime - epsilon) {
          continue;
        }

        if (point.time > latestTime + epsilon) {
          latestTime = point.time;
          count = 1;
          sumX = point.x + offsetX;
          sumY = point.y + offsetY;
          sumZ = Number.isFinite(point.z) ? point.z : 0;
        } else if (Math.abs(point.time - latestTime) <= epsilon) {
          count += 1;
          sumX += point.x + offsetX;
          sumY += point.y + offsetY;
          sumZ += Number.isFinite(point.z) ? point.z : 0;
        }
      }

      if (count === 0) {
        return null;
      }

      const trackGroup = trackGroupRef.current;
      if (!trackGroup) {
        return null;
      }

      const centroidLocal = new THREE.Vector3(sumX / count, sumY / count, sumZ / count);
      trackGroup.updateMatrixWorld(true);
      return trackGroup.localToWorld(centroidLocal);
    },
    [channelTrackOffsets, isFullTrackTrailEnabled, trackGroupRef, trackLookup, trackTrailLength],
  );

  const performHoverHitTest = useCallback(
    (event: PointerEvent) => {
      return performTrackHoverHitTest({
        event,
        camera: cameraRef.current,
        trackGroup: trackGroupRef.current,
        raycaster: hoverRaycasterRef.current,
        renderer: rendererRef.current,
        trackLines: trackLinesRef.current,
        clearPointerHover: () => clearHoverState('pointer'),
        setPointerHover: (trackId, position) => {
          updateHoverState(trackId, position, 'pointer');
        }
      });
    },
    [cameraRef, clearHoverState, hoverRaycasterRef, rendererRef, trackLinesRef, trackGroupRef, updateHoverState],
  );

  const updateTrackAppearance = useCallback(
    (timestamp: number) => {
      applyTrackAppearance({
        trackLines: trackLinesRef.current,
        timestamp
      });
    },
    [trackLinesRef],
  );

  const refreshTrackOverlay = useCallback(() => {
    setTrackOverlayRevision((revision) => revision + 1);
  }, []);

  const disposeTrackResources = useCallback(() => {
    const trackGroup = trackGroupRef.current;
    if (!trackGroup) {
      trackLinesRef.current.clear();
      return;
    }
    for (const resource of trackLinesRef.current.values()) {
      trackGroup.remove(resource.line);
      trackGroup.remove(resource.outline);
      trackGroup.remove(resource.endCap);
      resource.geometry.dispose();
      resource.material.dispose();
      resource.outlineMaterial.dispose();
      resource.endCap.geometry.dispose();
      resource.endCapMaterial.dispose();
    }
    trackLinesRef.current.clear();
  }, [trackGroupRef, trackLinesRef]);

  return {
    trackGroupRef,
    trackLinesRef,
    hoveredTrackId,
    tooltipPosition,
    trackOverlayRevision,
    trackLookup,
    applyTrackGroupTransform,
    updateTrackDrawRanges,
    performHoverHitTest,
    updateHoverState,
    clearHoverState,
    updateTrackAppearance,
    computeTrackCentroid,
    refreshTrackOverlay,
    disposeTrackResources,
  };
}
