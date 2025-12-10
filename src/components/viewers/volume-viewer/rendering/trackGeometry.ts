import * as THREE from 'three';

export const SELECTED_TRACK_BLINK_PERIOD_MS = 1600;
export const SELECTED_TRACK_BLINK_BASE = 1;
export const SELECTED_TRACK_BLINK_RANGE = 0.5;
export const TRACK_END_CAP_RADIUS_MULTIPLIER = 0.35;
export const TRACK_END_CAP_MIN_RADIUS = 0.12;
export const TRACK_LINE_WIDTH_MIN = 0.5;
export const TRACK_LINE_WIDTH_MAX = 5;
export const TRACK_END_CAP_RADIUS_AT_MIN_WIDTH = TRACK_LINE_WIDTH_MIN * TRACK_END_CAP_RADIUS_MULTIPLIER;
export const TRACK_END_CAP_RADIUS_AT_MAX_WIDTH =
  TRACK_LINE_WIDTH_MAX * TRACK_END_CAP_RADIUS_MULTIPLIER * 0.5;
export const TRACK_END_CAP_RADIUS_SLOPE =
  (TRACK_END_CAP_RADIUS_AT_MAX_WIDTH - TRACK_END_CAP_RADIUS_AT_MIN_WIDTH) /
  (TRACK_LINE_WIDTH_MAX - TRACK_LINE_WIDTH_MIN);
export const TRACK_END_CAP_RADIUS_INTERCEPT =
  TRACK_END_CAP_RADIUS_AT_MIN_WIDTH - TRACK_END_CAP_RADIUS_SLOPE * TRACK_LINE_WIDTH_MIN;
export const FOLLOWED_TRACK_LINE_WIDTH_MULTIPLIER = 1.35;
export const SELECTED_TRACK_LINE_WIDTH_MULTIPLIER = 1.5;
export const HOVERED_TRACK_LINE_WIDTH_MULTIPLIER = 1.2;

export function computeTrackEndCapRadius(lineWidth: number) {
  const linearRadius = TRACK_END_CAP_RADIUS_INTERCEPT + TRACK_END_CAP_RADIUS_SLOPE * lineWidth;
  return Math.max(linearRadius, TRACK_END_CAP_MIN_RADIUS);
}

export function getTrackIdFromObject(object: THREE.Object3D): string | null {
  const trackId = object.userData?.trackId;
  return typeof trackId === 'string' ? trackId : null;
}

export const trackColorTemp = new THREE.Color();
export const trackBlinkColorTemp = new THREE.Color();
