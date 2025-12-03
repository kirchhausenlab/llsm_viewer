import * as THREE from 'three';

import type { PlaybackState, VrHoverState, VrPlaybackHud } from './types';

export function applyPlaybackHoverState(
  hud: VrPlaybackHud | null,
  playbackState: PlaybackState,
  hoverState: VrHoverState,
): void {
  if (!hud) {
    return;
  }

  const playMaterial = hud.playButton.material as THREE.MeshBasicMaterial;
  playMaterial.color.copy(hud.playButtonBaseColor);
  if (hoverState.play && !playbackState.playbackDisabled) {
    playMaterial.color.lerp(hud.hoverHighlightColor, 0.35);
  }

  const playbackSliderTrackMaterial = hud.playbackSliderTrack.material as THREE.MeshBasicMaterial;
  playbackSliderTrackMaterial.color.copy(hud.playbackSliderTrackBaseColor);
  if ((hoverState.playbackSlider || hoverState.playbackSliderActive) && !playbackState.playbackDisabled) {
    playbackSliderTrackMaterial.color.lerp(hud.hoverHighlightColor, 0.22);
  }

  const playbackKnobMaterial = hud.playbackSliderKnob.material as THREE.MeshBasicMaterial;
  playbackKnobMaterial.color.copy(hud.playbackSliderKnobBaseColor);
  if ((hoverState.playbackSlider || hoverState.playbackSliderActive) && !playbackState.playbackDisabled) {
    playbackKnobMaterial.color.lerp(hud.hoverHighlightColor, 0.35);
  }

  const fpsDisabled = playbackState.totalTimepoints <= 1;
  const fpsSliderTrackMaterial = hud.fpsSliderTrack.material as THREE.MeshBasicMaterial;
  fpsSliderTrackMaterial.color.copy(hud.fpsSliderTrackBaseColor);
  if ((hoverState.fpsSlider || hoverState.fpsSliderActive) && !fpsDisabled) {
    fpsSliderTrackMaterial.color.lerp(hud.hoverHighlightColor, 0.22);
  }

  const fpsKnobMaterial = hud.fpsSliderKnob.material as THREE.MeshBasicMaterial;
  fpsKnobMaterial.color.copy(hud.fpsSliderKnobBaseColor);
  if ((hoverState.fpsSlider || hoverState.fpsSliderActive) && !fpsDisabled) {
    fpsKnobMaterial.color.lerp(hud.hoverHighlightColor, 0.35);
  }

  const resetVolumeMaterial = hud.resetVolumeButton.material as THREE.MeshBasicMaterial;
  resetVolumeMaterial.color.copy(hud.resetVolumeButtonBaseColor);
  if (hoverState.resetVolume) {
    resetVolumeMaterial.color.lerp(hud.hoverHighlightColor, 0.35);
  }

  const resetHudMaterial = hud.resetHudButton.material as THREE.MeshBasicMaterial;
  resetHudMaterial.color.copy(hud.resetHudButtonBaseColor);
  if (hoverState.resetHud) {
    resetHudMaterial.color.lerp(hud.hoverHighlightColor, 0.35);
  }

  const exitMaterial = hud.exitButton.material as THREE.MeshBasicMaterial;
  exitMaterial.color.copy(hud.exitButtonBaseColor);
  if (hoverState.exit) {
    exitMaterial.color.lerp(hud.hoverHighlightColor, 0.35);
  }

  if (hud.modeButton.visible) {
    const modeMaterial = hud.modeButton.material as THREE.MeshBasicMaterial;
    modeMaterial.color.copy(hud.modeButtonBaseColor);
    if (hoverState.mode) {
      modeMaterial.color.lerp(hud.hoverHighlightColor, 0.35);
    }
  }
}
