import type { VrPlaybackHud } from './types';

export function setVrPlaybackProgressFraction(hud: VrPlaybackHud, fraction: number) {
  const clamped = Math.min(Math.max(fraction, 0), 1);
  const knobX = -hud.playbackSliderWidth / 2 + clamped * hud.playbackSliderWidth;
  hud.playbackSliderKnob.position.x = knobX;
  hud.playbackSliderFill.scale.x = Math.max(clamped, 0.0001);
  hud.playbackSliderFill.position.x =
    -hud.playbackSliderWidth / 2 + (hud.playbackSliderWidth * Math.max(clamped, 0.0001)) / 2;
}

export function setVrPlaybackLabel(hud: VrPlaybackHud, text: string) {
  if (!hud.labelCanvas || !hud.labelContext) {
    hud.labelText = text;
    return;
  }
  if (hud.labelText === text) {
    return;
  }
  hud.labelText = text;
  const ctx = hud.labelContext;
  const width = hud.labelCanvas.width;
  const height = hud.labelCanvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = 'rgba(0, 0, 0, 0)';
  ctx.fillRect(0, 0, width, height);
  ctx.font = '600 36px "Inter", "Helvetica Neue", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, width / 2, height / 2 + 4);
  hud.labelTexture.needsUpdate = true;
}

export function setVrPlaybackFpsFraction(hud: VrPlaybackHud, fraction: number) {
  const clamped = Math.min(Math.max(fraction, 0), 1);
  const knobX = -hud.fpsSliderWidth / 2 + clamped * hud.fpsSliderWidth;
  hud.fpsSliderKnob.position.x = knobX;
  hud.fpsSliderFill.scale.x = Math.max(clamped, 0.0001);
  hud.fpsSliderFill.position.x =
    -hud.fpsSliderWidth / 2 + (hud.fpsSliderWidth * Math.max(clamped, 0.0001)) / 2;
}

export function setVrPlaybackFpsLabel(hud: VrPlaybackHud, text: string) {
  if (!hud.fpsLabelCanvas || !hud.fpsLabelContext) {
    hud.fpsLabelText = text;
    return;
  }
  if (hud.fpsLabelText === text) {
    return;
  }
  hud.fpsLabelText = text;
  const ctx = hud.fpsLabelContext;
  const width = hud.fpsLabelCanvas.width;
  const height = hud.fpsLabelCanvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = 'rgba(0, 0, 0, 0)';
  ctx.fillRect(0, 0, width, height);
  ctx.font = '500 32px "Inter", "Helvetica Neue", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, width / 2, height / 2 + 4);
  hud.fpsLabelTexture.needsUpdate = true;
}
