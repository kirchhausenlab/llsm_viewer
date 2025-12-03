import type { MutableRefObject } from 'react';
import * as THREE from 'three';

import {
  VR_CHANNELS_CAMERA_ANCHOR_OFFSET,
  VR_CHANNELS_PANEL_WIDTH,
  VR_CHANNELS_VERTICAL_OFFSET,
  VR_HUD_FRONT_MARGIN,
  VR_HUD_LATERAL_MARGIN,
  VR_HUD_PLACEMENT_EPSILON,
  VR_HUD_TRANSLATE_HANDLE_OFFSET,
  VR_HUD_YAW_HANDLE_OFFSET,
  VR_PLAYBACK_CAMERA_ANCHOR_OFFSET,
  VR_PLAYBACK_PANEL_WIDTH,
  VR_PLAYBACK_VERTICAL_OFFSET,
  VR_TRACKS_CAMERA_ANCHOR_OFFSET,
  VR_TRACKS_PANEL_WIDTH,
  VR_TRACKS_VERTICAL_OFFSET,
} from './constants';
import type {
  PlaybackState,
  VolumeHudFrame,
  VrChannelsHud,
  VrChannelsState,
  VrHoverState,
  VrHudPlacement,
  VrPlaybackHud,
  VrTracksHud,
  VrTracksState,
} from './types';
import {
  renderVrChannelsHud as renderVrChannelsHudContent,
  renderVrTracksHud as renderVrTracksHudContent,
} from './hudRenderers';
import {
  createVrChannelsHud as buildChannelsHud,
  createVrPlaybackHud as buildPlaybackHud,
  createVrTracksHud as buildTracksHud,
} from './hudFactory';
import { applyPlaybackHoverState as updatePlaybackHoverVisuals } from './hudInteractions';
import {
  updateVrChannelsHud as applyChannelsHudState,
  updateVrPlaybackHud as applyPlaybackHudState,
  updateVrTracksHud as applyTracksHudState,
} from './hudUpdaters';
import {
  constrainHudPlacementPosition as clampHudPlacementPosition,
  getHudQuaternionFromAngles as deriveHudQuaternion,
  resetHudPlacement as resetHudPlacementTransform,
  setHudPlacement as applyHudPlacement,
  updateHudGroupFromPlacement as syncHudGroupPlacement,
} from './hudPlacement';

export type HudVisibilityTarget = VrPlaybackHud | VrChannelsHud | VrTracksHud | null;

export function updateHudVisibility(
  hud: HudVisibilityTarget,
  visible: boolean,
  onHidden?: () => void,
): void {
  if (!hud) {
    return;
  }
  hud.group.visible = visible;
  if (!visible) {
    onHidden?.();
  }
}

export type HudPlacementDefaults = {
  playback: { fallbackOffset: THREE.Vector3; verticalOffset: number; lateralOffset: number };
  channels: { fallbackOffset: THREE.Vector3; verticalOffset: number; lateralOffset: number };
  tracks: { fallbackOffset: THREE.Vector3; verticalOffset: number; lateralOffset: number };
};

export function buildHudPlacements(): HudPlacementDefaults {
  const channelsLateral =
    VR_PLAYBACK_PANEL_WIDTH / 2 + VR_HUD_LATERAL_MARGIN + VR_CHANNELS_PANEL_WIDTH / 2;
  const tracksLateral =
    -(VR_PLAYBACK_PANEL_WIDTH / 2 + VR_HUD_LATERAL_MARGIN + VR_TRACKS_PANEL_WIDTH / 2);

  return {
    playback: {
      fallbackOffset: VR_PLAYBACK_CAMERA_ANCHOR_OFFSET,
      verticalOffset: VR_PLAYBACK_VERTICAL_OFFSET,
      lateralOffset: 0,
    },
    channels: {
      fallbackOffset: VR_CHANNELS_CAMERA_ANCHOR_OFFSET,
      verticalOffset: VR_CHANNELS_VERTICAL_OFFSET,
      lateralOffset: channelsLateral,
    },
    tracks: {
      fallbackOffset: VR_TRACKS_CAMERA_ANCHOR_OFFSET,
      verticalOffset: VR_TRACKS_VERTICAL_OFFSET,
      lateralOffset: tracksLateral,
    },
  };
}

export type ComputeHudFrameParams = {
  baseOffset: THREE.Vector3;
  volumeRootGroup: THREE.Object3D | null;
  halfExtents: THREE.Vector3 | null;
};

export function computeHudFrameFromVolume({
  baseOffset,
  volumeRootGroup,
  halfExtents,
}: ComputeHudFrameParams): VolumeHudFrame | null {
  if (!volumeRootGroup || baseOffset.lengthSq() <= 1e-6) {
    return null;
  }

  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(volumeRootGroup.quaternion);
  if (forward.lengthSq() <= 1e-8) {
    forward.set(0, 0, -1);
  } else {
    forward.normalize();
  }

  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(volumeRootGroup.quaternion);
  if (right.lengthSq() <= 1e-8) {
    right.set(1, 0, 0);
  } else {
    right.normalize();
  }

  const up = new THREE.Vector3(0, 1, 0);
  const frontDistance = (halfExtents ? halfExtents.z : 0) + VR_HUD_FRONT_MARGIN;
  const center = new THREE.Vector3().copy(baseOffset).addScaledVector(forward, -frontDistance);

  const horizontalForward = new THREE.Vector3(forward.x, 0, forward.z);
  if (horizontalForward.lengthSq() <= 1e-8) {
    horizontalForward.set(0, 0, -1);
  } else {
    horizontalForward.normalize();
  }

  const yaw = Math.atan2(horizontalForward.x, horizontalForward.z);
  const pitch = 0;

  return { center, forward, right, up, yaw, pitch };
}

export type HudControllerDeps = {
  playbackHudRef: MutableRefObject<VrPlaybackHud | null>;
  channelsHudRef: MutableRefObject<VrChannelsHud | null>;
  tracksHudRef: MutableRefObject<VrTracksHud | null>;
  playbackStateRef: MutableRefObject<PlaybackState>;
  hoverStateRef: MutableRefObject<VrHoverState>;
  channelsStateRef: MutableRefObject<VrChannelsState>;
  tracksStateRef: MutableRefObject<VrTracksState>;
  playbackHudPlacementRef: MutableRefObject<VrHudPlacement | null>;
  channelsHudPlacementRef: MutableRefObject<VrHudPlacement | null>;
  tracksHudPlacementRef: MutableRefObject<VrHudPlacement | null>;
  playbackHudDragTargetRef: MutableRefObject<THREE.Vector3>;
  channelsHudDragTargetRef: MutableRefObject<THREE.Vector3>;
  tracksHudDragTargetRef: MutableRefObject<THREE.Vector3>;
  hudOffsetTempRef: MutableRefObject<THREE.Vector3>;
  hudYawEulerRef: MutableRefObject<THREE.Euler>;
  hudYawQuaternionRef: MutableRefObject<THREE.Quaternion>;
  computeHudFrame: () => VolumeHudFrame | null;
  cameraRef: MutableRefObject<THREE.PerspectiveCamera | null>;
  placementDefaults?: HudPlacementDefaults;
};

export type HudController = {
  applyPlaybackHoverState: (
    playHovered: boolean,
    playbackSliderHovered: boolean,
    playbackSliderActive: boolean,
    fpsSliderHovered: boolean,
    fpsSliderActive: boolean,
    resetVolumeHovered: boolean,
    resetHudHovered: boolean,
    exitHovered: boolean,
    modeHovered: boolean,
  ) => void;
  setPlaybackHudVisible: (visible: boolean) => void;
  setChannelsHudVisible: (visible: boolean) => void;
  setTracksHudVisible: (visible: boolean) => void;
  createPlaybackHud: () => VrPlaybackHud | null;
  createChannelsHud: () => VrChannelsHud | null;
  createTracksHud: () => VrTracksHud | null;
  renderChannelsHud: (hud: VrChannelsHud, state: VrChannelsState) => void;
  renderTracksHud: (hud: VrTracksHud, state: VrTracksState) => void;
  updatePlaybackHud: () => void;
  updateChannelsHud: () => void;
  updateTracksHud: () => void;
  constrainPlacementPosition: (target: THREE.Vector3) => void;
  getHudQuaternionFromAngles: (yaw: number, pitch: number) => THREE.Quaternion;
  setPlaybackPlacementPosition: (position: THREE.Vector3) => void;
  setChannelsPlacementPosition: (position: THREE.Vector3) => void;
  setTracksPlacementPosition: (position: THREE.Vector3) => void;
  setPlaybackPlacementYaw: (yaw: number) => void;
  setChannelsPlacementYaw: (yaw: number) => void;
  setTracksPlacementYaw: (yaw: number) => void;
  setPlaybackPlacementPitch: (pitch: number) => void;
  setChannelsPlacementPitch: (pitch: number) => void;
  setTracksPlacementPitch: (pitch: number) => void;
  resetPlaybackPlacement: () => void;
  resetChannelsPlacement: () => void;
  resetTracksPlacement: () => void;
  updateHudGroupFromPlacement: (
    hud: VrPlaybackHud | VrChannelsHud | VrTracksHud | null,
    placement: VrHudPlacement | null,
  ) => void;
  setHudPlacement: (
    placementRef: MutableRefObject<VrHudPlacement | null>,
    dragTargetRef: MutableRefObject<THREE.Vector3>,
    hudRef: MutableRefObject<VrPlaybackHud | VrChannelsHud | VrTracksHud | null>,
    position: THREE.Vector3,
    yaw: number,
    pitch: number,
  ) => void;
};

export function createHudController({
  playbackHudRef,
  channelsHudRef,
  tracksHudRef,
  playbackStateRef,
  hoverStateRef,
  channelsStateRef,
  tracksStateRef,
  playbackHudPlacementRef,
  channelsHudPlacementRef,
  tracksHudPlacementRef,
  playbackHudDragTargetRef,
  channelsHudDragTargetRef,
  tracksHudDragTargetRef,
  hudOffsetTempRef,
  hudYawEulerRef,
  hudYawQuaternionRef,
  computeHudFrame,
  cameraRef,
  placementDefaults,
}: HudControllerDeps): HudController {
  const defaults = placementDefaults ?? buildHudPlacements();

  const applyPlaybackHoverState: HudController['applyPlaybackHoverState'] = (
    playHovered,
    playbackSliderHovered,
    playbackSliderActive,
    fpsSliderHovered,
    fpsSliderActive,
    resetVolumeHovered,
    resetHudHovered,
    exitHovered,
    modeHovered,
  ) => {
    const nextHoverState: VrHoverState = {
      play: playHovered,
      playbackSlider: playbackSliderHovered,
      playbackSliderActive,
      fpsSlider: fpsSliderHovered,
      fpsSliderActive,
      resetVolume: resetVolumeHovered,
      resetHud: resetHudHovered,
      exit: exitHovered,
      mode: modeHovered,
    };
    hoverStateRef.current = nextHoverState;
    const hud = playbackHudRef.current;
    if (!hud) {
      return;
    }
    const state = playbackStateRef.current;
    updatePlaybackHoverVisuals(hud, state, nextHoverState);
  };

  const setPlaybackHudVisible: HudController['setPlaybackHudVisible'] = (visible) => {
    updateHudVisibility(playbackHudRef.current, visible, () => {
      applyPlaybackHoverState(false, false, false, false, false, false, false, false, false);
    });
  };

  const setChannelsHudVisible: HudController['setChannelsHudVisible'] = (visible) => {
    updateHudVisibility(channelsHudRef.current, visible, () => {
      const hud = channelsHudRef.current;
      if (hud) {
        hud.hoverRegion = null;
      }
    });
  };

  const setTracksHudVisible: HudController['setTracksHudVisible'] = (visible) => {
    updateHudVisibility(tracksHudRef.current, visible, () => {
      const hud = tracksHudRef.current;
      if (hud) {
        hud.hoverRegion = null;
      }
    });
  };

  const createPlaybackHud: HudController['createPlaybackHud'] = () => {
    return buildPlaybackHud(playbackStateRef.current);
  };

  const createChannelsHud: HudController['createChannelsHud'] = () => {
    return buildChannelsHud();
  };

  const createTracksHud: HudController['createTracksHud'] = () => {
    return buildTracksHud();
  };

  const resizeChannelsHud = (hud: VrChannelsHud, displayHeight: number) => {
    if (!hud || !hud.panelCanvas) {
      return;
    }
    const pixelRatio = hud.pixelRatio || 1;
    hud.panelDisplayHeight = displayHeight;
    hud.panelCanvas.width = Math.round(hud.panelDisplayWidth * pixelRatio);
    hud.panelCanvas.height = Math.round(displayHeight * pixelRatio);

    const newPanelHeight = (hud.width / hud.panelDisplayWidth) * displayHeight;
    hud.height = newPanelHeight;

    const panelGeometry = new THREE.PlaneGeometry(hud.width, newPanelHeight);
    hud.panel.geometry.dispose();
    hud.panel.geometry = panelGeometry;

    const backgroundGeometry = new THREE.PlaneGeometry(hud.width, newPanelHeight);
    hud.background.geometry.dispose();
    hud.background.geometry = backgroundGeometry;

    const halfHeight = newPanelHeight / 2;
    hud.panelTranslateHandle.position.setY(halfHeight + VR_HUD_TRANSLATE_HANDLE_OFFSET);
    hud.panelPitchHandle.position.setY(-(halfHeight + VR_HUD_YAW_HANDLE_OFFSET));
    hud.panelTranslateHandle.updateMatrixWorld();
    hud.panelPitchHandle.updateMatrixWorld();

    hud.cacheDirty = true;
  };

  const renderChannelsHud: HudController['renderChannelsHud'] = (hud, state) => {
    const desiredDisplayHeight = renderVrChannelsHudContent(hud, state);
    if (desiredDisplayHeight != null) {
      resizeChannelsHud(hud, desiredDisplayHeight);
      renderVrChannelsHudContent(hud, state);
    }
  };

  const renderTracksHud: HudController['renderTracksHud'] = (hud, state) => {
    renderVrTracksHudContent(hud, state);
  };

  const updatePlaybackHud: HudController['updatePlaybackHud'] = () => {
    const hud = playbackHudRef.current;
    if (!hud) {
      return;
    }
    applyPlaybackHudState(hud, playbackStateRef.current, hoverStateRef.current);
  };

  const updateChannelsHud: HudController['updateChannelsHud'] = () => {
    const hud = channelsHudRef.current;
    if (!hud) {
      return;
    }
    applyChannelsHudState(hud, channelsStateRef.current, resizeChannelsHud);
  };

  const updateTracksHud: HudController['updateTracksHud'] = () => {
    const hud = tracksHudRef.current;
    if (!hud) {
      return;
    }
    applyTracksHudState(hud, tracksStateRef.current);
  };

  const constrainPlacementPosition: HudController['constrainPlacementPosition'] = (target) => {
    clampHudPlacementPosition(target);
  };

  const getHudQuaternionFromAngles: HudController['getHudQuaternionFromAngles'] = (yaw, pitch) => {
    return deriveHudQuaternion(yaw, pitch, hudYawEulerRef.current, hudYawQuaternionRef.current);
  };

  const setPlacement = (
    placementRef: MutableRefObject<VrHudPlacement | null>,
    dragTargetRef: MutableRefObject<THREE.Vector3>,
    hudRef: MutableRefObject<VrPlaybackHud | VrChannelsHud | VrTracksHud | null>,
    position: THREE.Vector3,
    yaw: number,
    pitch: number,
  ) => {
    applyHudPlacement(
      placementRef,
      dragTargetRef,
      hudRef,
      position,
      yaw,
      pitch,
      hudYawEulerRef.current,
      hudYawQuaternionRef.current,
    );
  };

  const setPlaybackPlacementPosition: HudController['setPlaybackPlacementPosition'] = (position) => {
    const placement = playbackHudPlacementRef.current;
    const target = hudOffsetTempRef.current;
    target.copy(position);
    const yaw = placement?.yaw ?? 0;
    const pitch = placement?.pitch ?? 0;
    setPlacement(playbackHudPlacementRef, playbackHudDragTargetRef, playbackHudRef, target, yaw, pitch);
  };

  const setChannelsPlacementPosition: HudController['setChannelsPlacementPosition'] = (position) => {
    const placement = channelsHudPlacementRef.current;
    const target = hudOffsetTempRef.current;
    target.copy(position);
    const yaw = placement?.yaw ?? 0;
    const pitch = placement?.pitch ?? 0;
    setPlacement(channelsHudPlacementRef, channelsHudDragTargetRef, channelsHudRef, target, yaw, pitch);
  };

  const setTracksPlacementPosition: HudController['setTracksPlacementPosition'] = (position) => {
    const placement = tracksHudPlacementRef.current;
    const target = hudOffsetTempRef.current;
    target.copy(position);
    const yaw = placement?.yaw ?? 0;
    const pitch = placement?.pitch ?? 0;
    setPlacement(tracksHudPlacementRef, tracksHudDragTargetRef, tracksHudRef, target, yaw, pitch);
  };

  const setPlacementYaw = (
    placementRef: MutableRefObject<VrHudPlacement | null>,
    dragTargetRef: MutableRefObject<THREE.Vector3>,
    hudRef: MutableRefObject<VrPlaybackHud | VrChannelsHud | VrTracksHud | null>,
    nextYaw: number,
  ) => {
    const placement = placementRef.current;
    const target = hudOffsetTempRef.current;
    if (placement) {
      target.copy(placement.position);
    } else {
      target.set(0, 0, 0);
    }
    const pitch = placement?.pitch ?? 0;
    setPlacement(placementRef, dragTargetRef, hudRef, target, nextYaw, pitch);
  };

  const setPlaybackPlacementYaw: HudController['setPlaybackPlacementYaw'] = (nextYaw) => {
    setPlacementYaw(playbackHudPlacementRef, playbackHudDragTargetRef, playbackHudRef, nextYaw);
  };

  const setChannelsPlacementYaw: HudController['setChannelsPlacementYaw'] = (nextYaw) => {
    setPlacementYaw(channelsHudPlacementRef, channelsHudDragTargetRef, channelsHudRef, nextYaw);
  };

  const setTracksPlacementYaw: HudController['setTracksPlacementYaw'] = (nextYaw) => {
    setPlacementYaw(tracksHudPlacementRef, tracksHudDragTargetRef, tracksHudRef, nextYaw);
  };

  const setPlacementPitch = (
    placementRef: MutableRefObject<VrHudPlacement | null>,
    dragTargetRef: MutableRefObject<THREE.Vector3>,
    hudRef: MutableRefObject<VrPlaybackHud | VrChannelsHud | VrTracksHud | null>,
    nextPitch: number,
  ) => {
    const placement = placementRef.current;
    const target = hudOffsetTempRef.current;
    if (placement) {
      target.copy(placement.position);
    } else {
      target.set(0, 0, 0);
    }
    const yaw = placement?.yaw ?? 0;
    setPlacement(placementRef, dragTargetRef, hudRef, target, yaw, nextPitch);
  };

  const setPlaybackPlacementPitch: HudController['setPlaybackPlacementPitch'] = (nextPitch) => {
    setPlacementPitch(playbackHudPlacementRef, playbackHudDragTargetRef, playbackHudRef, nextPitch);
  };

  const setChannelsPlacementPitch: HudController['setChannelsPlacementPitch'] = (nextPitch) => {
    setPlacementPitch(channelsHudPlacementRef, channelsHudDragTargetRef, channelsHudRef, nextPitch);
  };

  const setTracksPlacementPitch: HudController['setTracksPlacementPitch'] = (nextPitch) => {
    const placement =
      tracksHudPlacementRef.current ??
      ({ position: new THREE.Vector3(), yaw: 0, pitch: 0 } satisfies VrHudPlacement);
    const prevPitch = placement.pitch;
    placement.pitch = nextPitch;
    const pitchChanged = Math.abs(prevPitch - placement.pitch) > VR_HUD_PLACEMENT_EPSILON;
    tracksHudPlacementRef.current = placement;
    const hud = tracksHudRef.current;
    if (pitchChanged && hud) {
      hud.cacheDirty = true;
    }
    syncHudGroupPlacement(hud, placement, hudYawEulerRef.current, hudYawQuaternionRef.current);
  };

  const updateHudGroupFromPlacement: HudController['updateHudGroupFromPlacement'] = (
    hud,
    placement,
  ) => {
    syncHudGroupPlacement(hud, placement, hudYawEulerRef.current, hudYawQuaternionRef.current);
  };

  const resetPlacement = (
    key: keyof HudPlacementDefaults,
    placementRef: MutableRefObject<VrHudPlacement | null>,
    dragTargetRef: MutableRefObject<THREE.Vector3>,
    hudRef: MutableRefObject<VrPlaybackHud | VrChannelsHud | VrTracksHud | null>,
  ) => {
    const config = defaults[key];
    resetHudPlacementTransform({
      placementRef,
      dragTargetRef,
      hudRef,
      fallbackOffset: config.fallbackOffset,
      verticalOffset: config.verticalOffset,
      lateralOffset: config.lateralOffset,
      computeHudFrame,
      camera: cameraRef.current,
      target: hudOffsetTempRef.current,
      yawEuler: hudYawEulerRef.current,
      yawQuaternion: hudYawQuaternionRef.current,
    });
  };

  const resetPlaybackPlacement: HudController['resetPlaybackPlacement'] = () => {
    resetPlacement('playback', playbackHudPlacementRef, playbackHudDragTargetRef, playbackHudRef);
  };

  const resetChannelsPlacement: HudController['resetChannelsPlacement'] = () => {
    resetPlacement('channels', channelsHudPlacementRef, channelsHudDragTargetRef, channelsHudRef);
  };

  const resetTracksPlacement: HudController['resetTracksPlacement'] = () => {
    resetPlacement('tracks', tracksHudPlacementRef, tracksHudDragTargetRef, tracksHudRef);
  };

  return {
    applyPlaybackHoverState,
    setPlaybackHudVisible,
    setChannelsHudVisible,
    setTracksHudVisible,
    createPlaybackHud,
    createChannelsHud,
    createTracksHud,
    renderChannelsHud,
    renderTracksHud,
    updatePlaybackHud,
    updateChannelsHud,
    updateTracksHud,
    constrainPlacementPosition,
    getHudQuaternionFromAngles,
    setPlaybackPlacementPosition,
    setChannelsPlacementPosition,
    setTracksPlacementPosition,
    setPlaybackPlacementYaw,
    setChannelsPlacementYaw,
    setTracksPlacementYaw,
    setPlaybackPlacementPitch,
    setChannelsPlacementPitch,
    setTracksPlacementPitch,
    resetPlaybackPlacement,
    resetChannelsPlacement,
    resetTracksPlacement,
    updateHudGroupFromPlacement,
    setHudPlacement: setPlacement,
  };
}
