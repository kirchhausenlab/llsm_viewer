import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';

import { createTrackColor } from '../../../shared/colorMaps/trackColors';
import {
  materializeTrackPoints,
  resolveTrackCentroidAtTime
} from '../../../shared/utils/compiledTracks';
import { resolveTrackVisibilityForState } from '../../../shared/utils/trackVisibilityState';
import type { TrackSetState } from '../../../types/channelTracks';
import type {
  CompiledTrackSetPayload,
  CompiledTrackSummary,
  TrackColorMode
} from '../../../types/tracks';
import type { DesktopViewerCamera } from '../../../hooks/useVolumeRenderSetup';
import { createDefaultTrackSetState } from '../../../hooks/tracks/useTrackStyling';
import type {
  InstancedLineGeometry,
  InstancedLineSegmentsGeometry,
  TrackBatchResource,
  TrackLineResource,
  TrackRenderResource
} from '../VolumeViewer.types';
import { DEFAULT_TRACK_LINE_WIDTH, DEFAULT_TRACK_OPACITY } from './constants';
import {
  computeTrackEndCapRadius,
  FOLLOWED_TRACK_LINE_WIDTH_MULTIPLIER,
  HOVERED_TRACK_LINE_WIDTH_MULTIPLIER,
  SELECTED_TRACK_LINE_WIDTH_MULTIPLIER
} from './rendering/trackGeometry';
import { performTrackHoverHitTest } from './trackHitTesting';
import { useTrackHoverState } from './trackHoverState';
import { updateTrackAppearance as applyTrackAppearance } from './trackAppearance';
import { updateTrackDrawRanges as applyTrackDrawRanges } from './trackDrawRanges';

type OverlayGeometryCacheEntry = {
  payload: CompiledTrackSetPayload;
  pointCount: number;
  offsetX: number;
  offsetY: number;
  positions: Float32Array;
  times: Float32Array;
};

type TrackMarkerResource = {
  key: string;
  trackSetId: string;
  centroids: THREE.InstancedMesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  centroidMaterial: THREE.MeshBasicMaterial;
  centroidCapacity: number;
  startMarks: LineSegments2;
  startGeometry: InstancedLineSegmentsGeometry;
  startMaterial: LineMaterial;
};

type ShaderUniformSlot = { value: number };

const SHARED_TRACK_END_CAP_GEOMETRY = new THREE.SphereGeometry(1, 18, 14);
const SHARED_TRACK_BALL_GEOMETRY = new THREE.SphereGeometry(1, 12, 8);
const TRACK_HIGHLIGHT_BLEND_TARGET = new THREE.Color(0xffffff);
const TRACK_BATCH_SHADER_KEY = 'track-batch-window-v1';
const MIN_TRACK_VISIBLE_TIME = -1e9;
const MAX_TRACK_VISIBLE_TIME = 1e9;
const TRACK_TIME_EPSILON = 1e-3;
const TRACK_CENTROID_MIN_RADIUS = 0.11;
const TRACK_CENTROID_RADIUS_MULTIPLIER = 0.9;
const TRACK_START_MARKER_HALF_WIDTH_MULTIPLIER = 1.8;
const trackMarkerMatrixTemp = new THREE.Matrix4();
const trackMarkerColorTemp = new THREE.Color();
const trackMarkerStartTemp = new THREE.Vector3();
const trackMarkerNextTemp = new THREE.Vector3();
const trackMarkerDirectionTemp = new THREE.Vector3();
const trackMarkerReferenceTemp = new THREE.Vector3();
const trackMarkerPerpTemp = new THREE.Vector3();
const trackMarkerLeftTemp = new THREE.Vector3();
const trackMarkerRightTemp = new THREE.Vector3();

function sanitizeTrackOpacity(value: number | undefined): number {
  return Math.min(1, Math.max(0, value ?? DEFAULT_TRACK_OPACITY));
}

function sanitizeTrackLineWidth(value: number | undefined): number {
  return Math.max(0.1, Math.min(10, value ?? DEFAULT_TRACK_LINE_WIDTH));
}

function getTrackResourceKey(trackId: string): string {
  return `track:${trackId}`;
}

function getTrackBatchKey(trackSetId: string): string {
  return `batch:${trackSetId}`;
}

function getTrackMarkerKey(trackSetId: string): string {
  return `markers:${trackSetId}`;
}

function isTrackBatchResource(resource: TrackRenderResource): resource is TrackBatchResource {
  return resource.kind === 'batch';
}

function isTrackOverlayResource(resource: TrackRenderResource): resource is TrackLineResource {
  return resource.kind === 'overlay';
}

function getVisibleTimeWindow(
  targetTimeIndex: number,
  isFullTrackTrailEnabled: boolean,
  trackTrailLength: number
) {
  return {
    min: isFullTrackTrailEnabled
      ? MIN_TRACK_VISIBLE_TIME
      : targetTimeIndex - Math.max(0, trackTrailLength) - TRACK_TIME_EPSILON,
    max: targetTimeIndex + TRACK_TIME_EPSILON
  };
}

function disposeTrackBatchResource(trackGroup: THREE.Group, resource: TrackBatchResource): void {
  trackGroup.remove(resource.line);
  resource.geometry.dispose();
  resource.material.dispose();
}

function disposeTrackOverlayResource(trackGroup: THREE.Group, resource: TrackLineResource): void {
  trackGroup.remove(resource.line);
  trackGroup.remove(resource.outline);
  trackGroup.remove(resource.endCap);
  resource.geometry.dispose();
  resource.material.dispose();
  resource.outlineMaterial.dispose();
  resource.endCapMaterial.dispose();
}

function disposeTrackMarkerResource(trackGroup: THREE.Group, resource: TrackMarkerResource): void {
  trackGroup.remove(resource.centroids);
  trackGroup.remove(resource.startMarks);
  resource.centroidMaterial.dispose();
  resource.startGeometry.dispose();
  resource.startMaterial.dispose();
}

function disposeTrackResource(trackGroup: THREE.Group, resource: TrackRenderResource): void {
  if (resource.kind === 'batch') {
    disposeTrackBatchResource(trackGroup, resource);
    return;
  }
  disposeTrackOverlayResource(trackGroup, resource);
}

function getTrackCentroidBaseIndex(track: CompiledTrackSummary, centroidIndex: number): number {
  return (track.centroidOffset + centroidIndex) * 4;
}

function getTrackCentroidTime(
  track: CompiledTrackSummary,
  payload: CompiledTrackSetPayload,
  centroidIndex: number
): number {
  return payload.centroidData[getTrackCentroidBaseIndex(track, centroidIndex)] ?? Number.NEGATIVE_INFINITY;
}

function setTrackCentroidVector(
  target: THREE.Vector3,
  track: CompiledTrackSummary,
  payload: CompiledTrackSetPayload,
  centroidIndex: number,
  offsetX: number,
  offsetY: number
): THREE.Vector3 {
  const base = getTrackCentroidBaseIndex(track, centroidIndex);
  return target.set(
    (payload.centroidData[base + 1] ?? 0) + offsetX,
    (payload.centroidData[base + 2] ?? 0) + offsetY,
    payload.centroidData[base + 3] ?? 0
  );
}

function findFirstTrackCentroidIndexAtOrAfter(
  track: CompiledTrackSummary,
  payload: CompiledTrackSetPayload,
  targetTime: number
): number {
  let low = 0;
  let high = track.centroidCount;

  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (getTrackCentroidTime(track, payload, mid) < targetTime) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  return low;
}

function findLastTrackCentroidIndexAtOrBefore(
  track: CompiledTrackSummary,
  payload: CompiledTrackSetPayload,
  targetTime: number
): number {
  let low = 0;
  let high = track.centroidCount;

  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (getTrackCentroidTime(track, payload, mid) <= targetTime) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  return low - 1;
}

function resolveTrackOffset(
  track: Pick<CompiledTrackSummary, 'channelId'>,
  channelTrackOffsets: Record<string, { x: number; y: number }>
) {
  return track.channelId ? (channelTrackOffsets[track.channelId] ?? { x: 0, y: 0 }) : { x: 0, y: 0 };
}

function setLineMaterialResolution(
  material: LineMaterial,
  containerNode: HTMLDivElement | null
): void {
  if (!containerNode) {
    material.resolution.set(1, 1);
    return;
  }

  material.resolution.set(
    Math.max(containerNode.clientWidth, 1),
    Math.max(containerNode.clientHeight, 1)
  );
}

function ensureTrackBatchShader(material: LineMaterial): void {
  const visibleTimeMin: ShaderUniformSlot = { value: MIN_TRACK_VISIBLE_TIME };
  const visibleTimeMax: ShaderUniformSlot = { value: MAX_TRACK_VISIBLE_TIME };

  material.vertexColors = true;
  material.transparent = true;
  material.depthTest = false;
  material.depthWrite = false;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.trackVisibleTimeMin = visibleTimeMin;
    shader.uniforms.trackVisibleTimeMax = visibleTimeMax;
    shader.vertexShader = shader.vertexShader
      .replace(
        'attribute vec3 instanceColorEnd;\n',
        'attribute vec3 instanceColorEnd;\nattribute vec2 instanceTimeRange;\nvarying vec2 vTrackTimeRange;\n'
      )
      .replace(
        'void main() {\n',
        'void main() {\n\tvTrackTimeRange = instanceTimeRange;\n'
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        'uniform float linewidth;\n',
        'uniform float linewidth;\nuniform float trackVisibleTimeMin;\nuniform float trackVisibleTimeMax;\nvarying vec2 vTrackTimeRange;\n'
      )
      .replace(
        'float alpha = opacity;\n',
        'if (vTrackTimeRange.y < trackVisibleTimeMin || vTrackTimeRange.x > trackVisibleTimeMax) discard;\n\tfloat alpha = opacity;\n'
      );
  };
  material.customProgramCacheKey = () => TRACK_BATCH_SHADER_KEY;
  material.userData.trackVisibleTimeMin = visibleTimeMin;
  material.userData.trackVisibleTimeMax = visibleTimeMax;
  material.needsUpdate = true;
}

function updateTrackBatchTimeWindow(
  resource: TrackBatchResource,
  targetTimeIndex: number,
  isFullTrackTrailEnabled: boolean,
  trackTrailLength: number
): void {
  const window = getVisibleTimeWindow(targetTimeIndex, isFullTrackTrailEnabled, trackTrailLength);
  resource.visibleTimeMin = window.min;
  resource.visibleTimeMax = window.max;

  const minUniform = resource.material.userData.trackVisibleTimeMin as ShaderUniformSlot | undefined;
  const maxUniform = resource.material.userData.trackVisibleTimeMax as ShaderUniformSlot | undefined;
  if (minUniform) {
    minUniform.value = window.min;
  }
  if (maxUniform) {
    maxUniform.value = window.max;
  }
}

function buildBatchSegmentBuffers(
  tracks: CompiledTrackSummary[],
  payload: CompiledTrackSetPayload,
  offsetX: number,
  offsetY: number,
  colorMode: TrackColorMode
) {
  const totalSegments = tracks.reduce((sum, track) => sum + track.segmentCount, 0);
  const positions = new Float32Array(totalSegments * 6);
  const colors = new Float32Array(totalSegments * 6);
  const times = new Float32Array(totalSegments * 2);
  const segmentTrackIds = new Array<string>(totalSegments);

  let writeSegmentIndex = 0;
  for (const track of tracks) {
    if (track.segmentCount <= 0) {
      continue;
    }

    const segmentPositionOffset = track.segmentOffset * 6;
    const segmentTimeOffset = track.segmentOffset * 2;
    const color =
      colorMode.type === 'uniform'
        ? new THREE.Color(colorMode.color)
        : createTrackColor(track.trackNumber);

    for (let segmentIndex = 0; segmentIndex < track.segmentCount; segmentIndex += 1) {
      const sourcePositionBase = segmentPositionOffset + segmentIndex * 6;
      const targetPositionBase = writeSegmentIndex * 6;
      positions[targetPositionBase + 0] = (payload.segmentPositions[sourcePositionBase + 0] ?? 0) + offsetX;
      positions[targetPositionBase + 1] = (payload.segmentPositions[sourcePositionBase + 1] ?? 0) + offsetY;
      positions[targetPositionBase + 2] = payload.segmentPositions[sourcePositionBase + 2] ?? 0;
      positions[targetPositionBase + 3] = (payload.segmentPositions[sourcePositionBase + 3] ?? 0) + offsetX;
      positions[targetPositionBase + 4] = (payload.segmentPositions[sourcePositionBase + 4] ?? 0) + offsetY;
      positions[targetPositionBase + 5] = payload.segmentPositions[sourcePositionBase + 5] ?? 0;

      const targetTimeBase = writeSegmentIndex * 2;
      const sourceTimeBase = segmentTimeOffset + segmentIndex * 2;
      times[targetTimeBase + 0] = payload.segmentTimes[sourceTimeBase + 0] ?? 0;
      times[targetTimeBase + 1] = payload.segmentTimes[sourceTimeBase + 1] ?? 0;

      const targetColorBase = writeSegmentIndex * 6;
      colors[targetColorBase + 0] = color.r;
      colors[targetColorBase + 1] = color.g;
      colors[targetColorBase + 2] = color.b;
      colors[targetColorBase + 3] = color.r;
      colors[targetColorBase + 4] = color.g;
      colors[targetColorBase + 5] = color.b;
      segmentTrackIds[writeSegmentIndex] = track.id;
      writeSegmentIndex += 1;
    }
  }

  return { positions, colors, times, segmentTrackIds };
}

function resolveTrackBaseColor(track: Pick<CompiledTrackSummary, 'trackNumber'>, colorMode: TrackColorMode): THREE.Color {
  return colorMode.type === 'uniform'
    ? new THREE.Color(colorMode.color)
    : createTrackColor(track.trackNumber);
}

function resolveTrackCentroidRadius(lineWidth: number): number {
  return Math.max(computeTrackEndCapRadius(lineWidth) * TRACK_CENTROID_RADIUS_MULTIPLIER, TRACK_CENTROID_MIN_RADIUS);
}

function ensureTrackMarkerResource(
  trackGroup: THREE.Group,
  existingResource: TrackMarkerResource | undefined,
  key: string,
  trackSetId: string,
  centroidCapacity: number,
  opacity: number,
  lineWidth: number,
  containerNode: HTMLDivElement | null
): TrackMarkerResource {
  if (existingResource && existingResource.centroidCapacity >= centroidCapacity) {
    existingResource.centroidMaterial.opacity = opacity;
    existingResource.centroidMaterial.needsUpdate = true;
    existingResource.startMaterial.opacity = opacity;
    existingResource.startMaterial.linewidth = lineWidth;
    setLineMaterialResolution(existingResource.startMaterial, containerNode);
    existingResource.startMaterial.needsUpdate = true;
    return existingResource;
  }

  if (existingResource) {
    disposeTrackMarkerResource(trackGroup, existingResource);
  }

  const centroidMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0xffffff),
    transparent: true,
    opacity,
    depthTest: false,
    depthWrite: false
  });
  const centroids = new THREE.InstancedMesh(
    SHARED_TRACK_BALL_GEOMETRY,
    centroidMaterial,
    Math.max(centroidCapacity, 1)
  );
  centroids.name = `TrackCentroids:${trackSetId}`;
  centroids.renderOrder = 1002;
  centroids.frustumCulled = false;
  centroids.visible = false;
  centroids.count = 0;

  const startGeometry = new LineSegmentsGeometry() as InstancedLineSegmentsGeometry;
  startGeometry.setPositions([]);
  startGeometry.setColors([]);

  const startMaterial = new LineMaterial({
    color: new THREE.Color(0xffffff),
    linewidth: lineWidth,
    transparent: true,
    opacity,
    depthTest: false,
    depthWrite: false
  });
  startMaterial.vertexColors = true;
  setLineMaterialResolution(startMaterial, containerNode);

  const startMarks = new LineSegments2(startGeometry, startMaterial);
  startMarks.name = `TrackStarts:${trackSetId}`;
  startMarks.renderOrder = 1003;
  startMarks.frustumCulled = false;
  startMarks.visible = false;

  trackGroup.add(centroids);
  trackGroup.add(startMarks);

  return {
    key,
    trackSetId,
    centroids,
    centroidMaterial,
    centroidCapacity: Math.max(centroidCapacity, 1),
    startMarks,
    startGeometry,
    startMaterial
  };
}

function pushMarkerSegment(
  positions: number[],
  colors: number[],
  from: THREE.Vector3,
  to: THREE.Vector3,
  color: THREE.Color
): void {
  positions.push(from.x, from.y, from.z, to.x, to.y, to.z);
  colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
}

export type UseTrackRenderingParams = {
  tracks: CompiledTrackSummary[];
  compiledTrackPayloadByTrackSet: ReadonlyMap<string, CompiledTrackSetPayload>;
  onRequireTrackPayloads?: (trackSetIds: Iterable<string>) => void;
  trackSetStates: Record<string, TrackSetState>;
  trackOpacityByTrackSet: Record<string, number>;
  trackLineWidthByTrackSet: Record<string, number>;
  trackColorModesByTrackSet: Record<string, TrackColorMode>;
  channelTrackOffsets: Record<string, { x: number; y: number }>;
  isFullTrackTrailEnabled: boolean;
  trackTrailLength: number;
  drawTrackCentroids: boolean;
  drawTrackStartingPoints: boolean;
  selectedTrackIds: ReadonlySet<string>;
  followedTrackId: string | null;
  clampedTimeIndex: number;
  trackGroupRef: MutableRefObject<THREE.Group | null>;
  trackLinesRef: MutableRefObject<Map<string, TrackRenderResource>>;
  containerRef: MutableRefObject<HTMLDivElement | null>;
  rendererRef: MutableRefObject<THREE.WebGLRenderer | null>;
  cameraRef: MutableRefObject<DesktopViewerCamera | null>;
  hoverRaycasterRef: MutableRefObject<THREE.Raycaster | null>;
  hasActive3DLayer: boolean;
};

export function useTrackRendering({
  tracks,
  compiledTrackPayloadByTrackSet = new Map<string, CompiledTrackSetPayload>(),
  onRequireTrackPayloads,
  trackSetStates,
  trackOpacityByTrackSet,
  trackLineWidthByTrackSet,
  trackColorModesByTrackSet,
  channelTrackOffsets,
  isFullTrackTrailEnabled,
  trackTrailLength,
  drawTrackCentroids,
  drawTrackStartingPoints,
  selectedTrackIds,
  followedTrackId,
  clampedTimeIndex,
  trackGroupRef,
  trackLinesRef,
  containerRef,
  rendererRef,
  cameraRef,
  hoverRaycasterRef,
  hasActive3DLayer: _hasActive3DLayer
}: UseTrackRenderingParams) {
  const [trackOverlayRevision, setTrackOverlayRevision] = useState(0);
  const {
    hoveredTrackIdRef,
    hoveredTrackId,
    tooltipPosition,
    updateHoverState,
    clearHoverState
  } = useTrackHoverState();
  const overlayGeometryCacheRef = useRef<Map<string, OverlayGeometryCacheEntry>>(new Map());
  const trackMarkerResourcesRef = useRef<Map<string, TrackMarkerResource>>(new Map());
  const pendingAppearanceUpdateRef = useRef(false);
  const animatedTrackIdsRef = useRef<Set<string>>(new Set());

  const trackLookup = useMemo(() => {
    const map = new Map<string, CompiledTrackSummary>();
    for (const track of tracks) {
      map.set(track.id, track);
    }
    return map;
  }, [tracks]);

  const batchTracksByTrackSet = useMemo(() => {
    const map = new Map<string, CompiledTrackSummary[]>();
    for (const track of tracks) {
      const trackSetState = trackSetStates[track.trackSetId] ?? createDefaultTrackSetState();
      const isVisible = resolveTrackVisibilityForState(trackSetState, track.id);
      const trackSetOpacity = sanitizeTrackOpacity(trackOpacityByTrackSet[track.trackSetId]);
      if (!isVisible || trackSetOpacity <= 0 || track.segmentCount <= 0) {
        continue;
      }

      const existing = map.get(track.trackSetId);
      if (existing) {
        existing.push(track);
      } else {
        map.set(track.trackSetId, [track]);
      }
    }
    return map;
  }, [trackOpacityByTrackSet, trackSetStates, tracks]);

  const highlightedTrackIds = useMemo(() => {
    const ids = new Set<string>();
    if (hoveredTrackId) {
      const hoveredTrack = trackLookup.get(hoveredTrackId);
      if (hoveredTrack) {
        const trackSetState = trackSetStates[hoveredTrack.trackSetId] ?? createDefaultTrackSetState();
        const isVisible = hoveredTrack.pointCount > 0 && resolveTrackVisibilityForState(trackSetState, hoveredTrack.id);
        const trackSetOpacity = sanitizeTrackOpacity(trackOpacityByTrackSet[hoveredTrack.trackSetId]);
        if (isVisible && trackSetOpacity > 0) {
          ids.add(hoveredTrackId);
        }
      }
    }
    if (followedTrackId && trackLookup.has(followedTrackId)) {
      ids.add(followedTrackId);
    }
    for (const trackId of selectedTrackIds) {
      if (trackLookup.has(trackId)) {
        ids.add(trackId);
      }
    }
    return ids;
  }, [followedTrackId, hoveredTrackId, selectedTrackIds, trackLookup, trackOpacityByTrackSet, trackSetStates]);

  const markerTracksByTrackSet = useMemo(() => {
    const map = new Map<string, CompiledTrackSummary[]>();

    for (const track of tracks) {
      if (track.centroidCount < 2) {
        continue;
      }

      const trackSetState = trackSetStates[track.trackSetId] ?? createDefaultTrackSetState();
      const isVisible = resolveTrackVisibilityForState(trackSetState, track.id);
      const trackSetOpacity = sanitizeTrackOpacity(trackOpacityByTrackSet[track.trackSetId]);
      const isHighlighted = highlightedTrackIds.has(track.id);
      if ((!isVisible || trackSetOpacity <= 0) && !isHighlighted) {
        continue;
      }

      const existing = map.get(track.trackSetId);
      if (existing) {
        existing.push(track);
      } else {
        map.set(track.trackSetId, [track]);
      }
    }

    return map;
  }, [highlightedTrackIds, trackOpacityByTrackSet, trackSetStates, tracks]);

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
    [trackGroupRef]
  );

  const getOverlayTrackGeometry = useCallback(
    (track: CompiledTrackSummary, payload: CompiledTrackSetPayload) => {
      const offset = resolveTrackOffset(track, channelTrackOffsets);
      const offsetX = offset.x;
      const offsetY = offset.y;
      const cached = overlayGeometryCacheRef.current.get(track.id);

      if (
        cached &&
        cached.payload === payload &&
        cached.pointCount === track.pointCount &&
        cached.offsetX === offsetX &&
        cached.offsetY === offsetY
      ) {
        return cached;
      }

      const points = materializeTrackPoints(track, payload);
      const positions = new Float32Array(points.length * 3);
      const times = new Float32Array(points.length);
      for (let index = 0; index < points.length; index += 1) {
        const point = points[index]!;
        positions[index * 3 + 0] = point.x + offsetX;
        positions[index * 3 + 1] = point.y + offsetY;
        positions[index * 3 + 2] = Number.isFinite(point.z) ? point.z : 0;
        times[index] = point.time;
      }

      const entry: OverlayGeometryCacheEntry = {
        payload,
        pointCount: track.pointCount,
        offsetX,
        offsetY,
        positions,
        times
      };
      overlayGeometryCacheRef.current.set(track.id, entry);
      return entry;
    },
    [channelTrackOffsets]
  );

  const updateTrackDrawRanges = useCallback(
    (targetTimeIndex: number) => {
      const overlayResources: TrackLineResource[] = [];
      for (const resource of trackLinesRef.current.values()) {
        if (resource.kind === 'overlay') {
          overlayResources.push(resource);
        }
      }

      applyTrackDrawRanges({
        lines: overlayResources,
        targetTimeIndex,
        isFullTrackTrailEnabled,
        trackTrailLength
      });
    },
    [isFullTrackTrailEnabled, trackLinesRef, trackTrailLength]
  );

  useEffect(() => {
    const activeTrackIds = new Set(tracks.map((track) => track.id));
    for (const trackId of Array.from(overlayGeometryCacheRef.current.keys())) {
      if (!activeTrackIds.has(trackId)) {
        overlayGeometryCacheRef.current.delete(trackId);
      }
    }
  }, [tracks]);

  useEffect(() => {
    if (hoveredTrackId && !highlightedTrackIds.has(hoveredTrackId)) {
      clearHoverState();
    }
  }, [clearHoverState, highlightedTrackIds, hoveredTrackId]);

  useEffect(() => {
    const missingPayloadTrackSetIds = new Set<string>();
    for (const [trackSetId] of batchTracksByTrackSet) {
      if (!compiledTrackPayloadByTrackSet.has(trackSetId)) {
        missingPayloadTrackSetIds.add(trackSetId);
      }
    }
    for (const trackId of highlightedTrackIds) {
      const track = trackLookup.get(trackId);
      if (track && !compiledTrackPayloadByTrackSet.has(track.trackSetId)) {
        missingPayloadTrackSetIds.add(track.trackSetId);
      }
    }
    for (const [trackSetId] of markerTracksByTrackSet) {
      if (!compiledTrackPayloadByTrackSet.has(trackSetId)) {
        missingPayloadTrackSetIds.add(trackSetId);
      }
    }

    if (missingPayloadTrackSetIds.size > 0) {
      onRequireTrackPayloads?.(missingPayloadTrackSetIds);
    }
  }, [
    batchTracksByTrackSet,
    compiledTrackPayloadByTrackSet,
    highlightedTrackIds,
    markerTracksByTrackSet,
    onRequireTrackPayloads,
    trackLookup
  ]);

  useEffect(() => {
    if (trackOverlayRevision === 0) {
      return;
    }

    const trackGroup = trackGroupRef.current;
    if (!trackGroup) {
      return;
    }

    const nextBatchKeys = new Set<string>();
    for (const [trackSetId, tracksForSet] of batchTracksByTrackSet) {
      const payload = compiledTrackPayloadByTrackSet.get(trackSetId);
      if (!payload || tracksForSet.length === 0) {
        continue;
      }

      const trackOffset = resolveTrackOffset(tracksForSet[0]!, channelTrackOffsets);
      const colorMode = trackColorModesByTrackSet[trackSetId] ?? { type: 'random' };
      const { positions, colors, times, segmentTrackIds } = buildBatchSegmentBuffers(
        tracksForSet,
        payload,
        trackOffset.x,
        trackOffset.y,
        colorMode
      );
      if (segmentTrackIds.length === 0) {
        continue;
      }

      const key = getTrackBatchKey(trackSetId);
      nextBatchKeys.add(key);
      const existingResource = trackLinesRef.current.get(key);
      const lineWidth = sanitizeTrackLineWidth(trackLineWidthByTrackSet[trackSetId]);
      const opacity = sanitizeTrackOpacity(trackOpacityByTrackSet[trackSetId]);
      let resource: TrackBatchResource;

      if (!existingResource || existingResource.kind !== 'batch') {
        const geometry = new LineSegmentsGeometry() as InstancedLineSegmentsGeometry;
        geometry.setPositions(positions);
        geometry.setColors(colors);
        geometry.setAttribute('instanceTimeRange', new THREE.InstancedBufferAttribute(times, 2));
        geometry.instanceCount = segmentTrackIds.length;

        const material = new LineMaterial({
          color: new THREE.Color(0xffffff),
          linewidth: lineWidth,
          transparent: true,
          opacity,
          depthTest: false,
          depthWrite: false
        });
        setLineMaterialResolution(material, containerRef.current);
        ensureTrackBatchShader(material);

        const line = new Line2(geometry as unknown as LineGeometry, material);
        line.computeLineDistances();
        line.renderOrder = 995;
        line.frustumCulled = false;
        line.visible = true;
        line.userData.resourceKey = key;

        resource = {
          kind: 'batch',
          key,
          trackSetId,
          line,
          geometry,
          material,
          segmentTrackIds,
          segmentTimes: times,
          visibleTimeMin: MIN_TRACK_VISIBLE_TIME,
          visibleTimeMax: MAX_TRACK_VISIBLE_TIME
        };
        trackGroup.add(line);
        trackLinesRef.current.set(key, resource);
      } else {
        resource = existingResource;
        resource.geometry.setPositions(positions);
        resource.geometry.setColors(colors);
        resource.geometry.setAttribute('instanceTimeRange', new THREE.InstancedBufferAttribute(times, 2));
        resource.geometry.instanceCount = segmentTrackIds.length;
        resource.line.computeLineDistances();
        resource.segmentTrackIds = segmentTrackIds;
        resource.segmentTimes = times;
        resource.material.linewidth = lineWidth;
        resource.material.opacity = opacity;
        resource.material.needsUpdate = true;
        resource.line.visible = true;
      }

      updateTrackBatchTimeWindow(resource, clampedTimeIndex, isFullTrackTrailEnabled, trackTrailLength);
    }

    for (const [key, resource] of Array.from(trackLinesRef.current.entries())) {
      if (!isTrackBatchResource(resource)) {
        continue;
      }
      if (!nextBatchKeys.has(key)) {
        disposeTrackBatchResource(trackGroup, resource);
        trackLinesRef.current.delete(key);
      }
    }
  }, [
    batchTracksByTrackSet,
    channelTrackOffsets,
    compiledTrackPayloadByTrackSet,
    containerRef,
    trackColorModesByTrackSet,
    trackGroupRef,
    trackLineWidthByTrackSet,
    trackLinesRef,
    trackOpacityByTrackSet,
    trackOverlayRevision
  ]);

  useEffect(() => {
    if (trackOverlayRevision === 0) {
      return;
    }

    const trackGroup = trackGroupRef.current;
    if (!trackGroup) {
      return;
    }

    const nextOverlayKeys = new Set<string>();
    const animatedTrackIds = new Set<string>();
    let didUpdateAppearance = false;

    for (const trackId of highlightedTrackIds) {
      const track = trackLookup.get(trackId);
      const payload = track ? compiledTrackPayloadByTrackSet.get(track.trackSetId) : null;
      if (!track || !payload || track.pointCount < 2) {
        continue;
      }

      const key = getTrackResourceKey(track.id);
      nextOverlayKeys.add(key);
      const geometryData = getOverlayTrackGeometry(track, payload);
      const baseColor = (() => {
        const mode = trackColorModesByTrackSet[track.trackSetId];
        if (mode && mode.type === 'uniform') {
          return new THREE.Color(mode.color);
        }
        return createTrackColor(track.trackNumber);
      })();
      const highlightColor = baseColor.clone().lerp(TRACK_HIGHLIGHT_BLEND_TARGET, 0.4);

      let resource = trackLinesRef.current.get(key);
      if (!resource || resource.kind !== 'overlay') {
        const geometry = new LineGeometry() as InstancedLineGeometry;
        geometry.setPositions(geometryData.positions);
        geometry.instanceCount = 0;

        const material = new LineMaterial({
          color: baseColor.clone(),
          linewidth: 1,
          transparent: true,
          opacity: DEFAULT_TRACK_OPACITY,
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
        setLineMaterialResolution(material, containerRef.current);
        setLineMaterialResolution(outlineMaterial, containerRef.current);

        const outline = new Line2(geometry, outlineMaterial);
        outline.computeLineDistances();
        outline.renderOrder = 999;
        outline.frustumCulled = false;
        outline.visible = false;
        outline.userData.resourceKey = key;
        outline.userData.trackId = track.id;

        const line = new Line2(geometry, material);
        line.computeLineDistances();
        line.renderOrder = 1000;
        line.frustumCulled = false;
        line.visible = false;
        line.userData.resourceKey = key;
        line.userData.trackId = track.id;

        const endCapMaterial = new THREE.MeshBasicMaterial({
          color: baseColor.clone(),
          transparent: true,
          opacity: DEFAULT_TRACK_OPACITY,
          depthTest: false,
          depthWrite: false
        });
        const endCap = new THREE.Mesh(SHARED_TRACK_END_CAP_GEOMETRY, endCapMaterial);
        endCap.renderOrder = 1001;
        endCap.frustumCulled = false;
        endCap.visible = false;
        endCap.userData.resourceKey = key;
        endCap.userData.trackId = track.id;

        trackGroup.add(outline);
        trackGroup.add(line);
        trackGroup.add(endCap);

        resource = {
          kind: 'overlay',
          key,
          trackId: track.id,
          line,
          outline,
          geometry,
          material,
          outlineMaterial,
          endCap,
          endCapMaterial,
          times: geometryData.times,
          positions: geometryData.positions,
          geometryPointStartIndex: 0,
          geometryPointEndIndex: Math.max(track.pointCount - 1, 0),
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
          needsAppearanceUpdate: true
        };
        trackLinesRef.current.set(key, resource);
        didUpdateAppearance = true;
      } else {
        const positionsChanged = resource.positions !== geometryData.positions;
        const timesChanged = resource.times !== geometryData.times;
        const baseColorChanged = !resource.baseColor.equals(baseColor);
        const highlightColorChanged = !resource.highlightColor.equals(highlightColor);

        if (positionsChanged) {
          resource.geometry.setPositions(geometryData.positions);
          resource.line.computeLineDistances();
          resource.outline.computeLineDistances();
          resource.positions = geometryData.positions;
          resource.geometryPointStartIndex = 0;
          resource.geometryPointEndIndex = Math.max(track.pointCount - 1, 0);
        }
        if (timesChanged) {
          resource.times = geometryData.times;
        }
        if (baseColorChanged) {
          resource.baseColor.copy(baseColor);
        }
        if (highlightColorChanged) {
          resource.highlightColor.copy(highlightColor);
        }

        resource.needsAppearanceUpdate ||= positionsChanged || timesChanged || baseColorChanged || highlightColorChanged;
        didUpdateAppearance ||= resource.needsAppearanceUpdate;
      }

      const isFollowed = followedTrackId === track.id;
      const isHovered = hoveredTrackId === track.id;
      const isSelected = selectedTrackIds.has(track.id);
      const channelOpacity = sanitizeTrackOpacity(trackOpacityByTrackSet[track.trackSetId]);
      const effectiveOpacity =
        channelOpacity <= 0 && (isFollowed || isSelected || isHovered) ? DEFAULT_TRACK_OPACITY : channelOpacity;
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
        animatedTrackIds.add(track.id);
      }

      const nextTargetLineWidth = baseLineWidth * widthMultiplier;
      const nextOutlineExtraWidth = Math.max(baseLineWidth * 0.75, 0.4);
      const nextEndCapRadius = computeTrackEndCapRadius(nextTargetLineWidth);
      const nextOutlineBaseOpacity = isFollowed || isSelected ? 0.75 : isHovered ? 0.9 : 0;

      const didResourceChange =
        resource.isFollowed !== isFollowed ||
        resource.isHovered !== isHovered ||
        resource.isSelected !== isSelected ||
        resource.targetOpacity !== nextTargetOpacity ||
        resource.baseLineWidth !== baseLineWidth ||
        resource.targetLineWidth !== nextTargetLineWidth ||
        resource.outlineExtraWidth !== nextOutlineExtraWidth ||
        resource.endCapRadius !== nextEndCapRadius ||
        resource.outlineBaseOpacity !== nextOutlineBaseOpacity ||
        resource.line.visible !== true ||
        resource.outline.visible !== true;

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
      resource.line.visible = true;
      resource.outline.visible = true;
      resource.needsAppearanceUpdate ||= didResourceChange;
      didUpdateAppearance ||= didResourceChange;
    }

    for (const [key, resource] of Array.from(trackLinesRef.current.entries())) {
      if (!isTrackOverlayResource(resource)) {
        continue;
      }
      if (!nextOverlayKeys.has(key)) {
        if (hoveredTrackIdRef.current === resource.trackId) {
          clearHoverState();
        }
        disposeTrackOverlayResource(trackGroup, resource);
        trackLinesRef.current.delete(key);
      }
    }

    animatedTrackIdsRef.current = animatedTrackIds;
    pendingAppearanceUpdateRef.current ||= didUpdateAppearance;
    updateTrackDrawRanges(clampedTimeIndex);
  }, [
    clearHoverState,
    clampedTimeIndex,
    compiledTrackPayloadByTrackSet,
    containerRef,
    followedTrackId,
    getOverlayTrackGeometry,
    highlightedTrackIds,
    hoveredTrackId,
    hoveredTrackIdRef,
    selectedTrackIds,
    trackColorModesByTrackSet,
    trackGroupRef,
    trackLineWidthByTrackSet,
    trackLinesRef,
    trackLookup,
    trackOpacityByTrackSet,
    trackOverlayRevision,
    updateTrackDrawRanges
  ]);

  useEffect(() => {
    const trackGroup = trackGroupRef.current;
    if (!trackGroup) {
      return;
    }

    if (trackOverlayRevision === 0) {
      for (const resource of trackMarkerResourcesRef.current.values()) {
        disposeTrackMarkerResource(trackGroup, resource);
      }
      trackMarkerResourcesRef.current.clear();
      return;
    }

    const nextMarkerKeys = new Set<string>();
    const maxVisibleTime = clampedTimeIndex + TRACK_TIME_EPSILON;
    const minVisibleTime = isFullTrackTrailEnabled
      ? Number.NEGATIVE_INFINITY
      : clampedTimeIndex - Math.max(0, trackTrailLength) - TRACK_TIME_EPSILON;

    for (const [trackSetId, tracksForSet] of markerTracksByTrackSet) {
      const payload = compiledTrackPayloadByTrackSet.get(trackSetId);
      if (!payload || tracksForSet.length === 0) {
        continue;
      }

      const key = getTrackMarkerKey(trackSetId);
      nextMarkerKeys.add(key);
      const trackSetOpacity = sanitizeTrackOpacity(trackOpacityByTrackSet[trackSetId]);
      const markerOpacity = trackSetOpacity > 0 ? trackSetOpacity : DEFAULT_TRACK_OPACITY;
      const lineWidth = sanitizeTrackLineWidth(trackLineWidthByTrackSet[trackSetId]);
      const markerRadius = resolveTrackCentroidRadius(lineWidth);
      const centroidCapacity = drawTrackCentroids
        ? tracksForSet.reduce((sum, track) => sum + Math.max(track.centroidCount - 2, 0), 0)
        : 1;
      const existingResource = trackMarkerResourcesRef.current.get(key);
      const resource = ensureTrackMarkerResource(
        trackGroup,
        existingResource,
        key,
        trackSetId,
        centroidCapacity,
        markerOpacity,
        lineWidth,
        containerRef.current
      );
      if (resource !== existingResource) {
        trackMarkerResourcesRef.current.set(key, resource);
      }

      let centroidIndex = 0;
      const startPositions: number[] = [];
      const startColors: number[] = [];
      const colorMode = trackColorModesByTrackSet[trackSetId] ?? { type: 'random' };

      for (const track of tracksForSet) {
        const firstVisibleIndex = isFullTrackTrailEnabled
          ? 0
          : findFirstTrackCentroidIndexAtOrAfter(track, payload, minVisibleTime);
        const lastVisibleIndex = findLastTrackCentroidIndexAtOrBefore(track, payload, maxVisibleTime);
        const hasVisibleSegment =
          firstVisibleIndex >= 0 &&
          firstVisibleIndex < track.centroidCount &&
          lastVisibleIndex > firstVisibleIndex &&
          lastVisibleIndex < track.centroidCount;
        if (!hasVisibleSegment) {
          continue;
        }

        const offset = resolveTrackOffset(track, channelTrackOffsets);
        const color = resolveTrackBaseColor(track, colorMode);

        if (drawTrackCentroids) {
          for (let pointIndex = firstVisibleIndex + 1; pointIndex < lastVisibleIndex; pointIndex += 1) {
            setTrackCentroidVector(trackMarkerStartTemp, track, payload, pointIndex, offset.x, offset.y);
            trackMarkerMatrixTemp.makeScale(markerRadius, markerRadius, markerRadius);
            trackMarkerMatrixTemp.setPosition(trackMarkerStartTemp);
            resource.centroids.setMatrixAt(centroidIndex, trackMarkerMatrixTemp);
            resource.centroids.setColorAt(centroidIndex, trackMarkerColorTemp.copy(color));
            centroidIndex += 1;
          }
        }

        if (!drawTrackStartingPoints || firstVisibleIndex !== 0) {
          continue;
        }

        setTrackCentroidVector(trackMarkerStartTemp, track, payload, 0, offset.x, offset.y);
        let hasDirection = false;
        for (let pointIndex = 1; pointIndex <= lastVisibleIndex; pointIndex += 1) {
          setTrackCentroidVector(trackMarkerNextTemp, track, payload, pointIndex, offset.x, offset.y);
          trackMarkerDirectionTemp.subVectors(trackMarkerNextTemp, trackMarkerStartTemp);
          if (trackMarkerDirectionTemp.lengthSq() > 1e-8) {
            trackMarkerDirectionTemp.normalize();
            hasDirection = true;
            break;
          }
        }
        if (!hasDirection) {
          continue;
        }

        if (Math.abs(trackMarkerDirectionTemp.z) < 0.85) {
          trackMarkerReferenceTemp.set(0, 0, 1);
        } else {
          trackMarkerReferenceTemp.set(0, 1, 0);
        }
        trackMarkerPerpTemp
          .crossVectors(trackMarkerDirectionTemp, trackMarkerReferenceTemp)
          .normalize();

        const startHalfWidth = markerRadius * TRACK_START_MARKER_HALF_WIDTH_MULTIPLIER;
        trackMarkerLeftTemp.copy(trackMarkerStartTemp).addScaledVector(trackMarkerPerpTemp, startHalfWidth);
        trackMarkerRightTemp.copy(trackMarkerStartTemp).addScaledVector(trackMarkerPerpTemp, -startHalfWidth);
        pushMarkerSegment(startPositions, startColors, trackMarkerLeftTemp, trackMarkerRightTemp, color);
      }

      resource.centroids.count = drawTrackCentroids ? centroidIndex : 0;
      resource.centroids.visible = drawTrackCentroids && centroidIndex > 0;
      resource.centroids.instanceMatrix.needsUpdate = true;
      if (resource.centroids.instanceColor) {
        resource.centroids.instanceColor.needsUpdate = true;
      }
      resource.centroidMaterial.needsUpdate = true;

      resource.startGeometry.setPositions(startPositions);
      resource.startGeometry.setColors(startColors);
      resource.startGeometry.instanceCount = startPositions.length / 6;
      resource.startMarks.computeLineDistances();
      resource.startMarks.visible = startPositions.length > 0;
    }

    for (const [key, resource] of Array.from(trackMarkerResourcesRef.current.entries())) {
      if (!nextMarkerKeys.has(key)) {
        disposeTrackMarkerResource(trackGroup, resource);
        trackMarkerResourcesRef.current.delete(key);
      }
    }
  }, [
    channelTrackOffsets,
    clampedTimeIndex,
    compiledTrackPayloadByTrackSet,
    containerRef,
    drawTrackCentroids,
    drawTrackStartingPoints,
    isFullTrackTrailEnabled,
    markerTracksByTrackSet,
    trackColorModesByTrackSet,
    trackGroupRef,
    trackLineWidthByTrackSet,
    trackMarkerResourcesRef,
    trackOpacityByTrackSet,
    trackOverlayRevision,
    trackTrailLength
  ]);

  useEffect(() => {
    for (const resource of trackLinesRef.current.values()) {
      if (resource.kind === 'batch') {
        updateTrackBatchTimeWindow(resource, clampedTimeIndex, isFullTrackTrailEnabled, trackTrailLength);
      }
    }
    updateTrackDrawRanges(clampedTimeIndex);
  }, [clampedTimeIndex, isFullTrackTrailEnabled, trackLinesRef, trackTrailLength, updateTrackDrawRanges]);

  useEffect(() => {
    const trackGroup = trackGroupRef.current;
    if (!trackGroup) {
      return;
    }

    const hasVisibleTrackResources = Array.from(trackLinesRef.current.values()).some((resource) => {
      if (resource.kind === 'batch') {
        return resource.line.visible;
      }
      return resource.line.visible || resource.outline.visible || resource.endCap.visible;
    });
    trackGroup.visible = hasVisibleTrackResources;
  }, [
    batchTracksByTrackSet,
    compiledTrackPayloadByTrackSet,
    highlightedTrackIds,
    trackGroupRef,
    trackLinesRef,
    trackOverlayRevision,
    tracks.length
  ]);

  const computeTrackCentroid = useCallback(
    (trackId: string, targetTimeIndex: number) => {
      const track = trackLookup.get(trackId);
      if (!track) {
        return null;
      }

      const payload = compiledTrackPayloadByTrackSet.get(track.trackSetId);
      if (!payload) {
        return null;
      }

      const centroid = resolveTrackCentroidAtTime(track, payload, targetTimeIndex, {
        isFullTrackTrailEnabled,
        trackTrailLength
      });
      if (!centroid) {
        return null;
      }

      const offset = resolveTrackOffset(track, channelTrackOffsets);
      const trackGroup = trackGroupRef.current;
      if (!trackGroup) {
        return null;
      }

      const centroidLocal = new THREE.Vector3(
        centroid.x + offset.x,
        centroid.y + offset.y,
        centroid.z
      );
      trackGroup.updateMatrixWorld(true);
      return trackGroup.localToWorld(centroidLocal);
    },
    [
      channelTrackOffsets,
      compiledTrackPayloadByTrackSet,
      isFullTrackTrailEnabled,
      trackGroupRef,
      trackLookup,
      trackTrailLength
    ]
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
        }
      }),
    [cameraRef, clearHoverState, hoverRaycasterRef, rendererRef, trackLinesRef, trackGroupRef, updateHoverState]
  );

  const updateTrackAppearance = useCallback(
    (timestamp: number) => {
      const animatedResources: TrackLineResource[] = [];
      const allOverlayResources: TrackLineResource[] = [];
      for (const resource of trackLinesRef.current.values()) {
        if (!isTrackOverlayResource(resource)) {
          continue;
        }
        allOverlayResources.push(resource);
        if (animatedTrackIdsRef.current.has(resource.trackId)) {
          animatedResources.push(resource);
        }
      }

      if (allOverlayResources.length === 0) {
        animatedTrackIdsRef.current = new Set();
        pendingAppearanceUpdateRef.current = false;
        return;
      }

      if (pendingAppearanceUpdateRef.current) {
        applyTrackAppearance({
          lines: allOverlayResources,
          timestamp
        });
        pendingAppearanceUpdateRef.current = false;
        return;
      }

      if (animatedResources.length === 0) {
        return;
      }

      applyTrackAppearance({
        lines: animatedResources,
        timestamp
      });
    },
    [trackLinesRef]
  );

  const refreshTrackOverlay = useCallback(() => {
    setTrackOverlayRevision((revision) => revision + 1);
  }, []);

  const disposeTrackResources = useCallback(() => {
    const trackGroup = trackGroupRef.current;
    if (!trackGroup) {
      trackLinesRef.current.clear();
      trackMarkerResourcesRef.current.clear();
      animatedTrackIdsRef.current = new Set();
      pendingAppearanceUpdateRef.current = false;
      return;
    }

    for (const resource of trackLinesRef.current.values()) {
      disposeTrackResource(trackGroup, resource);
    }
    for (const resource of trackMarkerResourcesRef.current.values()) {
      disposeTrackMarkerResource(trackGroup, resource);
    }
    trackLinesRef.current.clear();
    trackMarkerResourcesRef.current.clear();
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
    disposeTrackResources
  };
}
