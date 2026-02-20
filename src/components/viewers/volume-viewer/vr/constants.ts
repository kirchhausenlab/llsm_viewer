import * as THREE from 'three';

export const VR_CHANNELS_HISTOGRAM_HEIGHT = 160;
export const VR_CHANNELS_HISTOGRAM_RADIUS = 18;

export const VR_PLAYBACK_PANEL_WIDTH = 0.6;
export const VR_PLAYBACK_PANEL_HEIGHT = 0.36;
export const VR_PLAYBACK_MIN_FPS = 1;
export const VR_PLAYBACK_MAX_FPS = 60;
export const VR_PLAYBACK_VERTICAL_OFFSET = 0;
export const VR_PLAYBACK_CAMERA_ANCHOR_OFFSET = new THREE.Vector3(0, -0.18, -0.65);

export const VR_CHANNELS_PANEL_WIDTH = 0.6;
export const VR_CHANNELS_PANEL_HEIGHT = 0.6;
export const VR_CHANNELS_VERTICAL_OFFSET = 0;
export const VR_CHANNELS_CAMERA_ANCHOR_OFFSET = new THREE.Vector3(0.4, -0.18, -0.65);
export const VR_CHANNELS_CANVAS_WIDTH = 1184;
export const VR_CHANNELS_CANVAS_MIN_HEIGHT = 1184;
export const VR_CHANNELS_FONT_FAMILY = '"Inter", "Helvetica Neue", Arial, sans-serif';
export const vrChannelsFont = (weight: string, size: number) =>
  `${weight} ${size}px ${VR_CHANNELS_FONT_FAMILY}`;
export const VR_CHANNELS_FONT_SIZES = {
  heading: 52,
  emptyState: 32,
  tab: 32,
  body: 34,
  label: 32,
  value: 34,
  small: 28,
} as const;

export const VR_TRACKS_PANEL_WIDTH = 0.58;
export const VR_TRACKS_PANEL_HEIGHT = 0.64;
export const VR_TRACKS_VERTICAL_OFFSET = -0.12;
export const VR_TRACKS_CAMERA_ANCHOR_OFFSET = new THREE.Vector3(0.7, -0.22, -0.7);
export const VR_TRACKS_CANVAS_WIDTH = 1180;
export const VR_TRACKS_CANVAS_HEIGHT = 1320;
export const VR_TRACKS_FONT_FAMILY = VR_CHANNELS_FONT_FAMILY;
export const vrTracksFont = (weight: string, size: number) =>
  `${weight} ${size}px ${VR_TRACKS_FONT_FAMILY}`;
export const VR_TRACKS_FONT_SIZES = {
  heading: 52,
  emptyState: 32,
  tab: 32,
  body: 32,
  label: 30,
  value: 32,
  button: 30,
  track: 30,
  small: 26,
} as const;

export const VR_HUD_MIN_HEIGHT = 0;
export const VR_HUD_FRONT_MARGIN = 0.24;
export const VR_HUD_LATERAL_MARGIN = 0.1;
export const VR_HUD_PLACEMENT_EPSILON = 1e-4;
export const VR_VOLUME_BASE_OFFSET = new THREE.Vector3(0, 1.2, -0.3);
export const VR_UI_TOUCH_DISTANCE = 0.08;
export const VR_UI_TOUCH_SURFACE_MARGIN = 0.04;
export const VR_CONTROLLER_TOUCH_RADIUS = 0.015;
export const VR_TRANSLATION_HANDLE_RADIUS = 0.03;
export const VR_SCALE_HANDLE_RADIUS = VR_TRANSLATION_HANDLE_RADIUS;
export const VR_TRANSLATION_HANDLE_OFFSET = 0.04;
export const VR_ROTATION_HANDLE_RADIUS = VR_TRANSLATION_HANDLE_RADIUS;
export const VR_ROTATION_HANDLE_OFFSET = 0.03;
export const VR_PITCH_HANDLE_FORWARD_OFFSET = VR_ROTATION_HANDLE_OFFSET;
export const VR_SCALE_HANDLE_OFFSET = 0.04;
export const VR_VOLUME_MIN_SCALE = 0.2;
export const VR_VOLUME_MAX_SCALE = 5;
export const VR_VOLUME_STEP_SCALE = 1;
export const DESKTOP_VOLUME_STEP_SCALE = 1.1;
export const XR_TARGET_FOVEATION = 0.6;
export const VR_HUD_TRANSLATE_HANDLE_RADIUS = 0.018;
export const VR_HUD_TRANSLATE_HANDLE_OFFSET = VR_HUD_TRANSLATE_HANDLE_RADIUS;
export const VR_HUD_YAW_HANDLE_RADIUS = 0.016;
export const VR_HUD_YAW_HANDLE_OFFSET = 0.03;
export const VR_HUD_TRANSLATE_HANDLE_COLOR = 0x4d9dff;
export const VR_HUD_YAW_HANDLE_COLOR = 0xffb347;
export const VR_HUD_SURFACE_OFFSET = 0.0015;
