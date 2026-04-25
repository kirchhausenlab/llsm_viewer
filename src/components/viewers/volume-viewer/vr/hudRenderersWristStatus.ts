import type { HoveredVoxelInfo } from '../../../../types/hover';
import { toUserFacingVoxelIndex } from '../../../../shared/utils/voxelIndex';
import {
  VR_WRIST_STATUS_FONT_SIZES,
  vrWristStatusFont,
} from './constants';
import { drawRoundedRect } from './hudCanvas';
import type { VrWristStatusHud } from './types';

function createHoverSignature(hovered: HoveredVoxelInfo | null): string {
  if (!hovered) {
    return 'none';
  }
  const components = hovered.components
    .map((component) => `${component.channelLabel ?? ''}:${component.text}:${component.color ?? ''}`)
    .join('|');
  return [
    hovered.coordinates.x,
    hovered.coordinates.y,
    hovered.coordinates.z,
    hovered.intensity,
    components,
  ].join(',');
}

function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  if (ctx.measureText(text).width <= maxWidth) {
    return text;
  }
  let candidate = text;
  while (candidate.length > 1 && ctx.measureText(`${candidate}...`).width > maxWidth) {
    candidate = candidate.slice(0, -1);
  }
  return `${candidate}...`;
}

export function renderVrWristStatusHud(
  hud: VrWristStatusHud,
  hovered: HoveredVoxelInfo | null,
): void {
  const signature = createHoverSignature(hovered);
  if (signature === hud.lastSignature) {
    return;
  }
  hud.lastSignature = signature;

  const canvas = hud.panelCanvas;
  const ctx = hud.panelContext;
  if (!canvas || !ctx) {
    return;
  }

  const pixelRatio = hud.pixelRatio || 1;
  const width = hud.panelDisplayWidth;
  const height = hud.panelDisplayHeight;
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const padding = 22;
  drawRoundedRect(ctx, 0, 0, width, height, 28);
  ctx.fillStyle = 'rgba(12, 17, 22, 0.94)';
  ctx.fill();

  ctx.font = vrWristStatusFont('700', VR_WRIST_STATUS_FONT_SIZES.heading);
  ctx.fillStyle = '#eef5ff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('Hover', padding, 18);

  if (!hovered) {
    ctx.font = vrWristStatusFont('600', VR_WRIST_STATUS_FONT_SIZES.body);
    ctx.fillStyle = '#8f9aaa';
    ctx.fillText('No voxel', padding, 84);
    hud.panelTexture.needsUpdate = true;
    return;
  }

  const coordinateText = [
    `X ${toUserFacingVoxelIndex(hovered.coordinates.x)}`,
    `Y ${toUserFacingVoxelIndex(hovered.coordinates.y)}`,
    `Z ${toUserFacingVoxelIndex(hovered.coordinates.z)}`,
  ].join('   ');

  ctx.font = vrWristStatusFont('600', VR_WRIST_STATUS_FONT_SIZES.body);
  ctx.fillStyle = '#b8c3d2';
  ctx.fillText(coordinateText, padding, 70);

  const components = hovered.components.length > 0
    ? hovered.components
    : [{ text: hovered.intensity, channelLabel: null, color: null }];
  const maxLines = 3;
  const lineHeight = 42;
  const textMaxWidth = width - padding * 2;

  ctx.font = vrWristStatusFont('700', VR_WRIST_STATUS_FONT_SIZES.value);
  for (let index = 0; index < Math.min(maxLines, components.length); index += 1) {
    const component = components[index];
    const label = component?.channelLabel ? `${component.channelLabel}: ` : '';
    const text = fitText(ctx, `${label}${component?.text ?? ''}`, textMaxWidth);
    ctx.fillStyle = component?.color || '#ffffff';
    ctx.fillText(text, padding, 124 + index * lineHeight);
  }

  if (components.length > maxLines) {
    ctx.font = vrWristStatusFont('600', VR_WRIST_STATUS_FONT_SIZES.small);
    ctx.fillStyle = '#8f9aaa';
    ctx.fillText(`+${components.length - maxLines} more`, padding, 124 + maxLines * lineHeight);
  }

  hud.panelTexture.needsUpdate = true;
}
