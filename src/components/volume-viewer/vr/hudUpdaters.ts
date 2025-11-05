import * as THREE from 'three';

import { VR_PLAYBACK_MAX_FPS, VR_PLAYBACK_MIN_FPS } from './constants';
import { applyPlaybackHoverState } from './hudInteractions';
import {
  setVrPlaybackFpsFraction,
  setVrPlaybackFpsLabel,
  setVrPlaybackLabel,
  setVrPlaybackModeLabel,
  setVrPlaybackProgressFraction,
} from './hudMutators';
import { renderVrChannelsHud, renderVrTracksHud } from './hudRenderers';
import type {
  PlaybackState,
  VrChannelsHud,
  VrChannelsState,
  VrHoverState,
  VrPlaybackHud,
  VrTracksHud,
  VrTracksState,
} from './types';

export function updateVrPlaybackHud(
  hud: VrPlaybackHud | null,
  playbackState: PlaybackState,
  hoverState: VrHoverState,
): void {
  if (!hud) {
    return;
  }

  const playMaterial = hud.playButton.material as THREE.MeshBasicMaterial;
  const playbackSliderTrackMaterial = hud.playbackSliderTrack.material as THREE.MeshBasicMaterial;
  const playbackSliderFillMaterial = hud.playbackSliderFill.material as THREE.MeshBasicMaterial;
  const playbackKnobMaterial = hud.playbackSliderKnob.material as THREE.MeshBasicMaterial;
  const fpsSliderTrackMaterial = hud.fpsSliderTrack.material as THREE.MeshBasicMaterial;
  const fpsSliderFillMaterial = hud.fpsSliderFill.material as THREE.MeshBasicMaterial;
  const fpsKnobMaterial = hud.fpsSliderKnob.material as THREE.MeshBasicMaterial;
  const modeMaterial = hud.modeButton.material as THREE.MeshBasicMaterial;

  if (playbackState.playbackDisabled) {
    hud.playButtonBaseColor.set(0x3a414d);
    hud.playbackSliderTrackBaseColor.set(0x2f333b);
    hud.playbackSliderKnobBaseColor.set(0xcad0da);
    playbackSliderFillMaterial.color.set(0x5a6473);
    playbackSliderFillMaterial.opacity = 0.35;
  } else if (playbackState.isPlaying) {
    hud.playButtonBaseColor.set(0x1f6f3f);
    hud.playbackSliderTrackBaseColor.set(0x3b414d);
    hud.playbackSliderKnobBaseColor.set(0xffffff);
    playbackSliderFillMaterial.color.set(0x45c16b);
    playbackSliderFillMaterial.opacity = 0.85;
  } else {
    hud.playButtonBaseColor.set(0x2b5fa6);
    hud.playbackSliderTrackBaseColor.set(0x3b414d);
    hud.playbackSliderKnobBaseColor.set(0xffffff);
    playbackSliderFillMaterial.color.set(0x68a7ff);
    playbackSliderFillMaterial.opacity = 0.85;
  }

  playMaterial.color.copy(hud.playButtonBaseColor);
  playbackSliderTrackMaterial.color.copy(hud.playbackSliderTrackBaseColor);
  playbackKnobMaterial.color.copy(hud.playbackSliderKnobBaseColor);

  const fpsDisabled = playbackState.totalTimepoints <= 1;
  if (fpsDisabled) {
    hud.fpsSliderTrackBaseColor.set(0x2f333b);
    hud.fpsSliderKnobBaseColor.set(0xcad0da);
    fpsSliderFillMaterial.color.set(0x5a6473);
    fpsSliderFillMaterial.opacity = 0.35;
  } else {
    hud.fpsSliderTrackBaseColor.set(0x3b414d);
    hud.fpsSliderKnobBaseColor.set(0xffffff);
    fpsSliderFillMaterial.color.set(0x68a7ff);
    fpsSliderFillMaterial.opacity = 0.85;
  }

  fpsSliderTrackMaterial.color.copy(hud.fpsSliderTrackBaseColor);
  fpsKnobMaterial.color.copy(hud.fpsSliderKnobBaseColor);

  const passthroughSupported = Boolean(playbackState.passthroughSupported);
  if (!passthroughSupported) {
    hud.modeButton.visible = false;
    hud.modeButtonBaseColor.copy(hud.modeButtonDisabledColor);
    modeMaterial.color.copy(hud.modeButtonBaseColor);
    setVrPlaybackModeLabel(hud, 'Mode: VR');
  } else {
    hud.modeButton.visible = true;
    const preferredMode =
      playbackState.preferredSessionMode === 'immersive-ar' ? 'immersive-ar' : 'immersive-vr';
    const modeLabel = preferredMode === 'immersive-ar' ? 'Mode: AR' : 'Mode: VR';
    if (preferredMode === 'immersive-ar') {
      hud.modeButtonBaseColor.copy(hud.modeButtonActiveColor);
    } else {
      hud.modeButtonBaseColor.set(0x2b3340);
    }
    modeMaterial.color.copy(hud.modeButtonBaseColor);
    setVrPlaybackModeLabel(hud, modeLabel);
  }

  hud.playIcon.visible = !playbackState.isPlaying;
  hud.pauseGroup.visible = playbackState.isPlaying;

  const maxIndex = Math.max(0, playbackState.totalTimepoints - 1);
  const fraction = maxIndex > 0 ? Math.min(Math.max(playbackState.timeIndex / maxIndex, 0), 1) : 0;
  setVrPlaybackProgressFraction(hud, fraction);
  setVrPlaybackLabel(hud, playbackState.playbackLabel ?? '');

  const fpsRange = VR_PLAYBACK_MAX_FPS - VR_PLAYBACK_MIN_FPS;
  const fpsValue = Math.min(
    VR_PLAYBACK_MAX_FPS,
    Math.max(VR_PLAYBACK_MIN_FPS, playbackState.fps ?? VR_PLAYBACK_MIN_FPS),
  );
  const fpsFraction =
    fpsRange > 0
      ? (Math.min(Math.max(fpsValue, VR_PLAYBACK_MIN_FPS), VR_PLAYBACK_MAX_FPS) - VR_PLAYBACK_MIN_FPS) /
        fpsRange
      : 0;
  setVrPlaybackFpsFraction(hud, fpsFraction);
  const fpsLabelText = fpsDisabled ? 'frames per second —' : `frames per second ${fpsValue}`;
  setVrPlaybackFpsLabel(hud, fpsLabelText);

  applyPlaybackHoverState(hud, playbackState, hoverState);
}

export function updateVrChannelsHud(
  hud: VrChannelsHud | null,
  state: VrChannelsState,
  resize?: (hud: VrChannelsHud, displayHeight: number) => void,
): void {
  if (!hud) {
    return;
  }
  const desiredDisplayHeight = renderVrChannelsHud(hud, state);
  if (desiredDisplayHeight != null && resize) {
    resize(hud, desiredDisplayHeight);
    renderVrChannelsHud(hud, state);
  }
}

export function updateVrTracksHud(hud: VrTracksHud | null, state: VrTracksState): void {
  if (!hud) {
    return;
  }
  renderVrTracksHud(hud, state);
}
