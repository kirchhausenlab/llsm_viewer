import type { VrUiTargetType } from './types';

export type ControllerUiFlagState = {
  playHoveredAny: boolean;
  playbackSliderHoveredAny: boolean;
  playbackSliderActiveAny: boolean;
  fpsSliderHoveredAny: boolean;
  fpsSliderActiveAny: boolean;
  resetVolumeHoveredAny: boolean;
  resetHudHoveredAny: boolean;
  exitHoveredAny: boolean;
  modeHoveredAny: boolean;
};

type ApplyControllerUiFlagsOptions = {
  hoverUiType: VrUiTargetType | null;
  activeUiType: VrUiTargetType | null;
  hoverTrackId: string | null;
  flags: ControllerUiFlagState;
};

const HUD_DRAG_ACTIVE_TYPES: ReadonlySet<VrUiTargetType> = new Set([
  'playback-panel-grab',
  'playback-panel-yaw',
  'playback-panel-pitch',
  'channels-panel-grab',
  'channels-panel-yaw',
  'channels-panel-pitch',
  'tracks-panel-grab',
  'tracks-panel-yaw',
  'tracks-panel-pitch'
]);

export function createEmptyControllerUiFlags(): ControllerUiFlagState {
  return {
    playHoveredAny: false,
    playbackSliderHoveredAny: false,
    playbackSliderActiveAny: false,
    fpsSliderHoveredAny: false,
    fpsSliderActiveAny: false,
    resetVolumeHoveredAny: false,
    resetHudHoveredAny: false,
    exitHoveredAny: false,
    modeHoveredAny: false
  };
}

export function applyControllerUiFlags({
  hoverUiType,
  activeUiType,
  hoverTrackId,
  flags
}: ApplyControllerUiFlagsOptions): { hoverTrackId: string | null; flags: ControllerUiFlagState } {
  let nextHoverTrackId = hoverTrackId;
  const nextFlags = { ...flags };

  if (hoverUiType === 'playback-play-toggle') {
    nextFlags.playHoveredAny = true;
    nextHoverTrackId = null;
  } else if (hoverUiType === 'playback-slider') {
    nextFlags.playbackSliderHoveredAny = true;
  } else if (hoverUiType === 'playback-fps-slider') {
    nextFlags.fpsSliderHoveredAny = true;
  } else if (
    hoverUiType === 'playback-panel-grab' ||
    hoverUiType === 'playback-panel' ||
    hoverUiType === 'playback-panel-yaw' ||
    hoverUiType === 'playback-panel-pitch'
  ) {
    nextHoverTrackId = null;
  } else if (hoverUiType === 'playback-reset-volume') {
    nextFlags.resetVolumeHoveredAny = true;
    nextHoverTrackId = null;
  } else if (hoverUiType === 'playback-reset-hud') {
    nextFlags.resetHudHoveredAny = true;
    nextHoverTrackId = null;
  } else if (hoverUiType === 'playback-exit-vr') {
    nextFlags.exitHoveredAny = true;
    nextHoverTrackId = null;
  } else if (hoverUiType === 'playback-toggle-mode') {
    nextFlags.modeHoveredAny = true;
    nextHoverTrackId = null;
  } else if (
    hoverUiType === 'volume-translate-handle' ||
    hoverUiType === 'volume-scale-handle' ||
    hoverUiType === 'volume-yaw-handle' ||
    hoverUiType === 'volume-pitch-handle'
  ) {
    nextHoverTrackId = null;
  } else if (hoverUiType && hoverUiType.startsWith('tracks-')) {
    nextHoverTrackId = null;
  }

  if (activeUiType === 'playback-slider') {
    nextFlags.playbackSliderActiveAny = true;
    nextHoverTrackId = null;
  } else if (activeUiType === 'playback-fps-slider') {
    nextFlags.fpsSliderActiveAny = true;
    nextHoverTrackId = null;
  } else if (activeUiType === 'playback-reset-volume') {
    nextFlags.resetVolumeHoveredAny = true;
    nextHoverTrackId = null;
  } else if (activeUiType === 'playback-reset-hud') {
    nextFlags.resetHudHoveredAny = true;
    nextHoverTrackId = null;
  } else if (activeUiType === 'playback-exit-vr') {
    nextFlags.exitHoveredAny = true;
    nextHoverTrackId = null;
  } else if (activeUiType === 'playback-toggle-mode') {
    nextFlags.modeHoveredAny = true;
    nextHoverTrackId = null;
  }

  if (activeUiType && HUD_DRAG_ACTIVE_TYPES.has(activeUiType)) {
    nextHoverTrackId = null;
  }

  return { hoverTrackId: nextHoverTrackId, flags: nextFlags };
}
