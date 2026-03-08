import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import * as THREE from 'three';

import { createTrackColor } from '../../../shared/colorMaps/trackColors';
import type { TrackColorMode, TrackDefinition } from '../../../types/tracks';
import type { InstancedLineGeometry, TrackLineResource } from '../VolumeViewer.types';
import { DEFAULT_TRACK_LINE_WIDTH, DEFAULT_TRACK_OPACITY } from './constants';
import { Line2 } from 'three/examples/jsm/lines/Line2';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial';
import {
  computeTrackEndCapRadius,
  FOLLOWED_TRACK_LINE_WIDTH_MULTIPLIER,
  HOVERED_TRACK_LINE_WIDTH_MULTIPLIER,
  SELECTED_TRACK_LINE_WIDTH_MULTIPLIER,
} from './rendering';
import { performTrackHoverHitTest } from './trackHitTesting';
import { isTrackRenderable } from './renderableTracks';
import { useTrackHoverState } from './trackHoverState';
import { updateTrackAppearance as applyTrackAppearance } from './trackAppearance';
import { updateTrackDrawRanges as applyTrackDrawRanges } from './trackDrawRanges';

type TrackGeometryCacheEntry = {
  points: TrackDefinition['points'];
  offsetX: number;
  offsetY: number;
  positions: Float32Array;
  times: Float32Array;
};

const SHARED_TRACK_END_CAP_GEOMETRY = new THREE.SphereGeometry(1, 18, 14);
const TRACK_HIGHLIGHT_BLEND_TARGET = new THREE.Color(0xffffff);

function sanitizeTrackOpacity(value: number | undefined): number {
  return Math.min(1, Math.max(0, value ?? DEFAULT_TRACK_OPACITY));
}

function sanitizeTrackLineWidth(value: number | undefined): number {
  return Math.max(0.1, Math.min(10, value ?? DEFAULT_TRACK_LINE_WIDTH));
}

function disposeTrackResource(trackGroup: THREE.Group, resource: TrackLineResource): void {
  trackGroup.remove(resource.line);
  trackGroup.remove(resource.outline);
  trackGroup.remove(resource.endCap);
  resource.geometry.dispose();
  resource.material.dispose();
  resource.outlineMaterial.dispose();
  resource.endCapMaterial.dispose();
}

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
    clearHoverState,
  } = useTrackHoverState();
  const previouslyHad3DLayerRef = useRef(false);
  const geometryCacheRef = useRef<Map<string, TrackGeometryCacheEntry>>(new Map());
  const pendingAppearanceUpdateRef = useRef(false);
  const animatedTrackIdsRef = useRef<Set<string>>(new Set());

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

  const mountedTrackIds = useMemo(() => {
    const ids = new Set<string>();
    if (!hasActive3DLayer) {
      return ids;
    }

    for (const track of tracks) {
      if (track.points.length === 0) {
        continue;
      }
      if (
        isTrackRenderable(track, {
          trackVisibility,
          trackOpacityByTrackSet,
          selectedTrackIds,
          followedTrackId,
        })
      ) {
        ids.add(track.id);
      }
    }

    return ids;
  }, [followedTrackId, hasActive3DLayer, selectedTrackIds, trackOpacityByTrackSet, trackVisibility, tracks]);

  const mountedTracks = useMemo(
    () => tracks.filter((track) => mountedTrackIds.has(track.id)),
    [mountedTrackIds, tracks],
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
        trackTrailLength,
      });
    },
    [isFullTrackTrailEnabled, trackLinesRef, trackTrailLength],
  );

  const getTrackGeometry = useCallback(
    (track: TrackDefinition) => {
      const offset = track.channelId ? (channelTrackOffsets[track.channelId] ?? { x: 0, y: 0 }) : { x: 0, y: 0 };
      const offsetX = offset.x;
      const offsetY = offset.y;
      const cached = geometryCacheRef.current.get(track.id);

      if (cached && cached.points === track.points && cached.offsetX === offsetX && cached.offsetY === offsetY) {
        return cached;
      }

      const positions = new Float32Array(track.points.length * 3);
      const times = new Float32Array(track.points.length);

      for (let index = 0; index < track.points.length; index += 1) {
        const point = track.points[index];
        const resolvedZ = Number.isFinite(point.z) ? point.z : 0;
        positions[index * 3 + 0] = point.x + offsetX;
        positions[index * 3 + 1] = point.y + offsetY;
        positions[index * 3 + 2] = resolvedZ;
        times[index] = point.time;
      }

      const nextEntry: TrackGeometryCacheEntry = {
        points: track.points,
        offsetX,
        offsetY,
        positions,
        times,
      };
      geometryCacheRef.current.set(track.id, nextEntry);
      return nextEntry;
    },
    [channelTrackOffsets],
  );

  useEffect(() => {
    const activeIds = new Set<string>();
    for (const track of tracks) {
      if (track.points.length > 0) {
        activeIds.add(track.id);
      }
    }

    for (const trackId of Array.from(geometryCacheRef.current.keys())) {
      if (!activeIds.has(trackId)) {
        geometryCacheRef.current.delete(trackId);
      }
    }
  }, [tracks]);

  useEffect(() => {
    if (trackOverlayRevision === 0) {
      return;
    }

    const trackGroup = trackGroupRef.current;
    if (!trackGroup) {
      return;
    }

    const trackLines = trackLinesRef.current;
    for (const [trackId, resource] of Array.from(trackLines.entries())) {
      if (!mountedTrackIds.has(trackId)) {
        disposeTrackResource(trackGroup, resource);
        if (hoveredTrackIdRef.current === trackId) {
          clearHoverState();
        }
        trackLines.delete(trackId);
      }
    }

    if (!hasActive3DLayer || mountedTracks.length === 0) {
      trackGroup.visible = false;
      animatedTrackIdsRef.current = new Set();
      pendingAppearanceUpdateRef.current = false;
      return;
    }

    let didSyncResources = false;

    for (const track of mountedTracks) {
      const { positions, times } = getTrackGeometry(track);
      const baseColor = resolveTrackColor(track);
      const highlightColor = baseColor.clone().lerp(TRACK_HIGHLIGHT_BLEND_TARGET, 0.4);

      let resource = trackLines.get(track.id);
      if (!resource) {
        const geometry = new LineGeometry() as InstancedLineGeometry;
        geometry.setPositions(positions);
        geometry.instanceCount = 0;

        const material = new LineMaterial({
          color: baseColor.clone(),
          linewidth: 1,
          transparent: true,
          opacity: DEFAULT_TRACK_OPACITY,
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
        line.visible = false;
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
        const endCap = new THREE.Mesh(SHARED_TRACK_END_CAP_GEOMETRY, endCapMaterial);
        endCap.renderOrder = 1001;
        endCap.frustumCulled = false;
        endCap.visible = false;
        endCap.userData.trackId = track.id;

        trackGroup.add(endCap);

        resource = {
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
          shouldShow: true,
          needsAppearanceUpdate: true,
        };
        trackLines.set(track.id, resource);
        didSyncResources = true;
        continue;
      }

      const positionsChanged = resource.positions !== positions;
      const timesChanged = resource.times !== times;
      const baseColorChanged = !resource.baseColor.equals(baseColor);
      const highlightColorChanged = !resource.highlightColor.equals(highlightColor);
      const channelChanged = resource.channelId !== track.channelId;

      if (positionsChanged) {
        resource.geometry.setPositions(positions);
        resource.line.computeLineDistances();
        resource.outline.computeLineDistances();
        resource.positions = positions;
        resource.geometryPointStartIndex = 0;
        resource.geometryPointEndIndex = Math.max(track.points.length - 1, 0);
      }
      if (timesChanged) {
        resource.times = times;
      }
      if (baseColorChanged) {
        resource.baseColor.copy(baseColor);
        resource.endCapMaterial.color.copy(baseColor);
      }
      if (highlightColorChanged) {
        resource.highlightColor.copy(highlightColor);
      }
      if (channelChanged) {
        resource.channelId = track.channelId;
      }

      resource.endCap.userData.trackId = track.id;
      resource.needsAppearanceUpdate ||= positionsChanged || timesChanged || baseColorChanged || highlightColorChanged || channelChanged;
      didSyncResources ||= resource.needsAppearanceUpdate;
    }

    pendingAppearanceUpdateRef.current ||= didSyncResources;
    updateTrackDrawRanges(clampedTimeIndex);
  }, [
    clearHoverState,
    clampedTimeIndex,
    containerRef,
    getTrackGeometry,
    hasActive3DLayer,
    mountedTrackIds,
    mountedTracks,
    resolveTrackColor,
    trackGroupRef,
    trackLinesRef,
    trackOverlayRevision,
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

    if (!hasActive3DLayer || mountedTracks.length === 0) {
      trackGroup.visible = false;
      animatedTrackIdsRef.current = new Set();
      pendingAppearanceUpdateRef.current = false;
      if (hoveredTrackId !== null) {
        clearHoverState();
      }
      return;
    }

    let didUpdateAppearance = false;
    const animatedTrackIds = new Set<string>();

    for (const track of mountedTracks) {
      const resource = trackLinesRef.current.get(track.id);
      if (!resource) {
        continue;
      }

      const { line, outline, endCap } = resource;
      const isFollowed = followedTrackId === track.id;
      const isHovered = hoveredTrackId === track.id;
      const isSelected = selectedTrackIds.has(track.id);
      const isHighlighted = isFollowed || isHovered || isSelected;
      const channelOpacity = sanitizeTrackOpacity(trackOpacityByTrackSet[track.trackSetId]);
      const effectiveOpacity = channelOpacity <= 0 && (isFollowed || isSelected) ? DEFAULT_TRACK_OPACITY : channelOpacity;
      const opacityBoost = isFollowed || isSelected ? 0.15 : isHovered ? 0.12 : 0;
      const nextTargetOpacity = Math.min(1, effectiveOpacity + opacityBoost);
      const baseLineWidth = sanitizeTrackLineWidth(trackLineWidthByTrackSet[track.trackSetId]);

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

      const nextTargetLineWidth = baseLineWidth * widthMultiplier;
      const nextOutlineExtraWidth = Math.max(baseLineWidth * 0.75, 0.4);
      const nextEndCapRadius = computeTrackEndCapRadius(nextTargetLineWidth);
      const nextOutlineBaseOpacity = isFollowed || isSelected ? 0.75 : isHovered ? 0.9 : 0;

      const didResourceChange =
        resource.channelId !== track.channelId ||
        resource.isFollowed !== isFollowed ||
        resource.isHovered !== isHovered ||
        resource.isSelected !== isSelected ||
        resource.shouldShow !== true ||
        resource.targetOpacity !== nextTargetOpacity ||
        resource.baseLineWidth !== baseLineWidth ||
        resource.targetLineWidth !== nextTargetLineWidth ||
        resource.outlineExtraWidth !== nextOutlineExtraWidth ||
        resource.endCapRadius !== nextEndCapRadius ||
        resource.outlineBaseOpacity !== nextOutlineBaseOpacity ||
        line.visible !== true ||
        outline.visible !== isHighlighted ||
        endCap.visible !== resource.hasVisiblePoints;

      resource.channelId = track.channelId;
      resource.isFollowed = isFollowed;
      resource.isHovered = isHovered;
      resource.isSelected = isSelected;
      resource.shouldShow = true;
      resource.targetOpacity = nextTargetOpacity;
      resource.baseLineWidth = baseLineWidth;
      resource.targetLineWidth = nextTargetLineWidth;
      resource.outlineExtraWidth = nextOutlineExtraWidth;
      resource.endCapRadius = nextEndCapRadius;
      resource.outlineBaseOpacity = nextOutlineBaseOpacity;
      resource.needsAppearanceUpdate ||= didResourceChange;

      line.visible = true;
      outline.visible = isHighlighted;
      endCap.visible = resource.hasVisiblePoints;

      didUpdateAppearance ||= didResourceChange;
      if (isSelected) {
        animatedTrackIds.add(track.id);
      }
    }

    animatedTrackIdsRef.current = animatedTrackIds;
    pendingAppearanceUpdateRef.current ||= didUpdateAppearance;
    trackGroup.visible = mountedTracks.length > 0;

    if (hoveredTrackId !== null && !trackLinesRef.current.has(hoveredTrackId)) {
      clearHoverState();
    }
  }, [
    clearHoverState,
    followedTrackId,
    hasActive3DLayer,
    hoveredTrackId,
    mountedTracks,
    selectedTrackIds,
    trackLineWidthByTrackSet,
    trackOpacityByTrackSet,
    trackLinesRef,
    trackOverlayRevision,
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
      const minVisibleTime = isFullTrackTrailEnabled ? Number.NEGATIVE_INFINITY : targetTimeIndex - trackTrailLength;
      const epsilon = 1e-3;
      let latestTime = Number.NEGATIVE_INFINITY;
      let count = 0;
      let sumX = 0;
      let sumY = 0;
      let sumZ = 0;
      const offset = track.channelId ? (channelTrackOffsets[track.channelId] ?? { x: 0, y: 0 }) : { x: 0, y: 0 };
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
    (event: PointerEvent) =>
      performTrackHoverHitTest({
        event,
        camera: cameraRef.current,
        trackGroup: trackGroupRef.current,
        raycaster: hoverRaycasterRef.current,
        renderer: rendererRef.current,
        trackLines: trackLinesRef.current,
        clearPointerHover: () => clearHoverState('pointer'),
        setPointerHover: (trackId, position) => {
          updateHoverState(trackId, position, 'pointer');
        },
      }),
    [cameraRef, clearHoverState, hoverRaycasterRef, rendererRef, trackLinesRef, trackGroupRef, updateHoverState],
  );

  const updateTrackAppearance = useCallback(
    (timestamp: number) => {
      const trackLines = trackLinesRef.current;
      if (trackLines.size === 0) {
        animatedTrackIdsRef.current = new Set();
        pendingAppearanceUpdateRef.current = false;
        return;
      }

      const hasPendingAppearanceUpdate = pendingAppearanceUpdateRef.current;
      const animatedTrackIds = animatedTrackIdsRef.current;
      if (!hasPendingAppearanceUpdate && animatedTrackIds.size === 0) {
        return;
      }

      if (hasPendingAppearanceUpdate) {
        applyTrackAppearance({
          lines: trackLines.values(),
          timestamp,
        });
        pendingAppearanceUpdateRef.current = false;
        return;
      }

      const animatedResources: TrackLineResource[] = [];
      for (const trackId of animatedTrackIds) {
        const resource = trackLines.get(trackId);
        if (resource) {
          animatedResources.push(resource);
        }
      }
      if (animatedResources.length === 0) {
        return;
      }

      applyTrackAppearance({
        lines: animatedResources,
        timestamp,
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
      animatedTrackIdsRef.current = new Set();
      pendingAppearanceUpdateRef.current = false;
      return;
    }

    for (const resource of trackLinesRef.current.values()) {
      disposeTrackResource(trackGroup, resource);
    }
    trackLinesRef.current.clear();
    animatedTrackIdsRef.current = new Set();
    pendingAppearanceUpdateRef.current = false;
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
