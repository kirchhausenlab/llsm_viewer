import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import * as THREE from 'three';

import { createTrackColor, DEFAULT_TRACK_COLOR } from '../../../shared/colorMaps/trackColors';
import type { TrackDefinition } from '../../../types/tracks';
import type { TrackColorMode } from '../../../types/tracks';
import {
  computeTrackEndCapRadius,
  FOLLOWED_TRACK_LINE_WIDTH_MULTIPLIER,
  getTrackIdFromObject,
  HOVERED_TRACK_LINE_WIDTH_MULTIPLIER,
  SELECTED_TRACK_BLINK_BASE,
  SELECTED_TRACK_BLINK_PERIOD_MS,
  SELECTED_TRACK_BLINK_RANGE,
  SELECTED_TRACK_LINE_WIDTH_MULTIPLIER,
  trackBlinkColorTemp,
} from './rendering';
import { DEFAULT_TRACK_LINE_WIDTH, DEFAULT_TRACK_OPACITY } from './constants';
import type { TrackLineResource } from '../VolumeViewer.types';
import { Line2 } from 'three/examples/jsm/lines/Line2';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry';

const HOVER_STATE_SOURCES = ['pointer', 'controller'] as const;

type HoverState = {
  trackId: string | null;
  position: { x: number; y: number } | null;
};

export type UseTrackRenderingParams = {
  tracks: TrackDefinition[];
  trackVisibility: Record<string, boolean>;
  trackOpacityByChannel: Record<string, number>;
  trackLineWidthByChannel: Record<string, number>;
  channelTrackColorModes: Record<string, TrackColorMode>;
  channelTrackOffsets: Record<string, { x: number; y: number }>;
  trackScale: { x?: number; y?: number; z?: number };
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
  trackOpacityByChannel,
  trackLineWidthByChannel,
  channelTrackColorModes,
  channelTrackOffsets,
  trackScale,
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
  const trackScaleX = trackScale.x ?? 1;
  const trackScaleY = trackScale.y ?? 1;
  const trackScaleZ = trackScale.z ?? 1;

  const [trackOverlayRevision, setTrackOverlayRevision] = useState(0);
  const hoveredTrackIdRef = useRef<string | null>(null);
  const [hoveredTrackId, setHoveredTrackId] = useState<string | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ x: number; y: number } | null>(null);
  const hoverSourcesRef = useRef<Record<(typeof HOVER_STATE_SOURCES)[number], HoverState>>({
    pointer: { trackId: null, position: null },
    controller: { trackId: null, position: null },
  });
  const previouslyHad3DLayerRef = useRef(false);

  const trackLookup = useMemo(() => {
    const map = new Map<string, TrackDefinition>();
    for (const track of tracks) {
      map.set(track.id, track);
    }
    return map;
  }, [tracks]);

  const applyHoverState = useCallback(() => {
    const pointerState = hoverSourcesRef.current.pointer;
    const controllerState = hoverSourcesRef.current.controller;
    const nextState =
      pointerState.trackId !== null
        ? pointerState
        : controllerState.trackId !== null
        ? controllerState
        : { trackId: null as string | null, position: null as { x: number; y: number } | null };

    if (hoveredTrackIdRef.current !== nextState.trackId) {
      hoveredTrackIdRef.current = nextState.trackId;
      setHoveredTrackId(nextState.trackId);
    }
    setTooltipPosition(nextState.position);
  }, []);

  const updateHoverState = useCallback(
    (
      trackId: string | null,
      position: { x: number; y: number } | null,
      source: 'pointer' | 'controller' = 'pointer',
    ) => {
      hoverSourcesRef.current[source] = { trackId, position };
      applyHoverState();
    },
    [applyHoverState],
  );

  const clearHoverState = useCallback(
    (source?: 'pointer' | 'controller') => {
      if (source) {
        hoverSourcesRef.current[source] = { trackId: null, position: null };
      } else {
        HOVER_STATE_SOURCES.forEach((key) => {
          hoverSourcesRef.current[key] = { trackId: null, position: null };
        });
      }
      applyHoverState();
    },
    [applyHoverState],
  );

  const resolveTrackColor = useCallback(
    (track: TrackDefinition) => {
      const mode = channelTrackColorModes[track.channelId];
      if (mode && mode.type === 'uniform') {
        return new THREE.Color(mode.color);
      }
      return createTrackColor(track.id);
    },
    [channelTrackColorModes],
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
      const lines = trackLinesRef.current;
      const maxVisibleTime = targetTimeIndex;

      for (const resource of lines.values()) {
        const { geometry, times, positions, endCap } = resource;
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
        const hasVisiblePoints = visiblePoints > 0;
        resource.hasVisiblePoints = hasVisiblePoints;
        if (hasVisiblePoints) {
          const lastPointIndex = visiblePoints - 1;
          const baseIndex = lastPointIndex * 3;
          endCap.position.set(
            positions[baseIndex] ?? 0,
            positions[baseIndex + 1] ?? 0,
            positions[baseIndex + 2] ?? 0,
          );
        }
        endCap.visible = resource.shouldShow && hasVisiblePoints;
        geometry.instanceCount = visibleSegments;
      }
    },
    [trackLinesRef],
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

      let resource = trackLines.get(track.id) ?? null;
      const positions = new Float32Array(track.points.length * 3);
      const times = new Array<number>(track.points.length);
      const offset = channelTrackOffsets[track.channelId] ?? { x: 0, y: 0 };
      const scaledOffsetX = offset.x * trackScaleX;
      const scaledOffsetY = offset.y * trackScaleY;

      for (let index = 0; index < track.points.length; index++) {
        const point = track.points[index];
        const resolvedZ = Number.isFinite(point.z) ? point.z : 0;
        positions[index * 3 + 0] = point.x * trackScaleX + scaledOffsetX;
        positions[index * 3 + 1] = point.y * trackScaleY + scaledOffsetY;
        positions[index * 3 + 2] = resolvedZ * trackScaleZ;
        times[index] = point.time;
      }

      const baseColor = resolveTrackColor(track);
      const highlightColor = baseColor.clone().lerp(new THREE.Color(0xffffff), 0.4);

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
        trackLines.set(track.id, resource);
      } else {
        const { geometry, line, outline } = resource;
        geometry.setPositions(positions);
        line.computeLineDistances();
        outline.computeLineDistances();
        resource.times = times;
        resource.positions = positions;
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
    channelTrackColorModes,
    channelTrackOffsets,
    clearHoverState,
    clampedTimeIndex,
    containerRef,
    resolveTrackColor,
    trackLinesRef,
    trackOverlayRevision,
    trackScaleX,
    trackScaleY,
    trackScaleZ,
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
      const shouldShow = isFollowed || isExplicitlyVisible || isSelected;

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

      const channelOpacity = trackOpacityByChannel[track.channelId] ?? DEFAULT_TRACK_OPACITY;
      const sanitizedOpacity = Math.min(1, Math.max(0, channelOpacity));
      const opacityBoost = isFollowed || isSelected ? 0.15 : isHovered ? 0.12 : 0;
      resource.targetOpacity = Math.min(1, sanitizedOpacity + opacityBoost);

      const channelLineWidth = trackLineWidthByChannel[track.channelId] ?? DEFAULT_TRACK_LINE_WIDTH;
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
    trackLineWidthByChannel,
    trackOpacityByChannel,
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

      const maxVisibleTime = targetTimeIndex + 1;
      const epsilon = 1e-3;
      let latestTime = -Infinity;
      let count = 0;
      let sumX = 0;
      let sumY = 0;
      let sumZ = 0;
      const offset = channelTrackOffsets[track.channelId] ?? { x: 0, y: 0 };
      const scaledOffsetX = offset.x * trackScaleX;
      const scaledOffsetY = offset.y * trackScaleY;

      for (const point of track.points) {
        if (point.time - maxVisibleTime > epsilon) {
          break;
        }

        if (point.time > latestTime + epsilon) {
          latestTime = point.time;
          count = 1;
          sumX = point.x * trackScaleX + scaledOffsetX;
          sumY = point.y * trackScaleY + scaledOffsetY;
          sumZ = (Number.isFinite(point.z) ? point.z : 0) * trackScaleZ;
        } else if (Math.abs(point.time - latestTime) <= epsilon) {
          count += 1;
          sumX += point.x * trackScaleX + scaledOffsetX;
          sumY += point.y * trackScaleY + scaledOffsetY;
          sumZ += (Number.isFinite(point.z) ? point.z : 0) * trackScaleZ;
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
    [channelTrackOffsets, trackLookup, trackGroupRef, trackScaleX, trackScaleY, trackScaleZ],
  );

  const performHoverHitTest = useCallback(
    (event: PointerEvent) => {
      const cameraInstance = cameraRef.current;
      const trackGroupInstance = trackGroupRef.current;
      const raycasterInstance = hoverRaycasterRef.current;
      const renderer = rendererRef.current;
      if (!cameraInstance || !trackGroupInstance || !raycasterInstance || !trackGroupInstance.visible || !renderer) {
        clearHoverState('pointer');
        return null;
      }

      const domElement = renderer.domElement;
      const rect = domElement.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;
      if (width <= 0 || height <= 0) {
        clearHoverState('pointer');
        return null;
      }

      const offsetX = event.clientX - rect.left;
      const offsetY = event.clientY - rect.top;
      if (offsetX < 0 || offsetY < 0 || offsetX > width || offsetY > height) {
        clearHoverState('pointer');
        return null;
      }

      const pointerVector = new THREE.Vector2();
      pointerVector.set((offsetX / width) * 2 - 1, -(offsetY / height) * 2 + 1);
      raycasterInstance.setFromCamera(pointerVector, cameraInstance);

      const visibleObjects: THREE.Object3D[] = [];
      for (const resource of trackLinesRef.current.values()) {
        if (resource.line.visible) {
          visibleObjects.push(resource.line);
        }
        if (resource.endCap.visible) {
          visibleObjects.push(resource.endCap);
        }
      }

      if (visibleObjects.length === 0) {
        clearHoverState('pointer');
        return null;
      }

      const intersections = raycasterInstance.intersectObjects(visibleObjects, false);
      if (intersections.length === 0) {
        clearHoverState('pointer');
        return null;
      }

      const intersection = intersections[0];
      const trackId = getTrackIdFromObject(intersection.object);
      if (trackId === null) {
        clearHoverState('pointer');
        return null;
      }

      updateHoverState(trackId, { x: offsetX, y: offsetY }, 'pointer');
      return trackId;
    },
    [cameraRef, clearHoverState, hoverRaycasterRef, rendererRef, trackLinesRef, trackGroupRef, updateHoverState],
  );

  const updateTrackAppearance = useCallback(
    (timestamp: number) => {
      const blinkPhase = (timestamp % SELECTED_TRACK_BLINK_PERIOD_MS) / SELECTED_TRACK_BLINK_PERIOD_MS;
      const blinkAngle = blinkPhase * Math.PI * 2;
      const blinkWave = Math.sin(blinkAngle);
      const blinkScale = SELECTED_TRACK_BLINK_BASE + SELECTED_TRACK_BLINK_RANGE * blinkWave;

      for (const resource of trackLinesRef.current.values()) {
        const { line, outline, material, outlineMaterial, endCap, endCapMaterial } = resource;
        const baseColor = resource.baseColor ?? new THREE.Color(DEFAULT_TRACK_COLOR);
        const highlightColor = resource.highlightColor ?? baseColor;
        const visibleColor = resource.isHovered ? highlightColor : baseColor;
        trackBlinkColorTemp.copy(visibleColor);
        if (resource.isSelected) {
          trackBlinkColorTemp.multiplyScalar(blinkScale);
        }
        const targetColor = trackBlinkColorTemp.getHex();
        if ((material.color?.getHex?.() ?? material.color) !== targetColor) {
          material.color.setHex(targetColor);
          material.needsUpdate = true;
        }
        if ((endCapMaterial.color?.getHex?.() ?? endCapMaterial.color) !== targetColor) {
          endCapMaterial.color.setHex(targetColor);
          endCapMaterial.needsUpdate = true;
        }

        const outlineTarget = resource.isHovered ? highlightColor : baseColor;
        const outlineTargetColor = outlineTarget.getHex();
        const currentOutlineColor = (outlineMaterial.color?.getHex?.() ?? outlineMaterial.color) as number;
        if (outlineTargetColor !== currentOutlineColor) {
          outlineMaterial.color.setHex(outlineTargetColor);
          outlineMaterial.needsUpdate = true;
        }

        const targetOpacity = resource.targetOpacity * (resource.isSelected ? blinkScale : 1);
        if (material.opacity !== targetOpacity) {
          material.opacity = targetOpacity;
          material.needsUpdate = true;
        }
        if (endCapMaterial.opacity !== targetOpacity) {
          endCapMaterial.opacity = targetOpacity;
          endCapMaterial.needsUpdate = true;
        }

        if (material.linewidth !== resource.targetLineWidth) {
          material.linewidth = resource.targetLineWidth;
          material.needsUpdate = true;
        }

        const targetOutlineOpacity = resource.outlineBaseOpacity * (resource.isSelected ? blinkScale : 1);
        if (outlineMaterial.opacity !== targetOutlineOpacity) {
          outlineMaterial.opacity = targetOutlineOpacity;
          outlineMaterial.needsUpdate = true;
        }

        const outlineWidth = resource.targetLineWidth + resource.outlineExtraWidth;
        if (outlineMaterial.linewidth !== outlineWidth) {
          outlineMaterial.linewidth = outlineWidth;
          outlineMaterial.needsUpdate = true;
        }

        if (resource.needsAppearanceUpdate) {
          const currentCapScale = endCap.scale.x;
          if (currentCapScale !== resource.endCapRadius) {
            endCap.scale.setScalar(resource.endCapRadius);
          }
          resource.needsAppearanceUpdate = false;
        }
      }
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
