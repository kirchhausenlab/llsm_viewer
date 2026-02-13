import * as THREE from 'three';

import type { TrackLineResource } from '../VolumeViewer.types';
import {
  SELECTED_TRACK_BLINK_BASE,
  SELECTED_TRACK_BLINK_PERIOD_MS,
  SELECTED_TRACK_BLINK_RANGE,
  trackBlinkColorTemp
} from './rendering';
import { DEFAULT_TRACK_COLOR } from '../../../shared/colorMaps/trackColors';

type UpdateTrackAppearanceOptions = {
  trackLines: Map<string, TrackLineResource>;
  timestamp: number;
};

export function updateTrackAppearance({
  trackLines,
  timestamp
}: UpdateTrackAppearanceOptions): void {
  const blinkPhase = (timestamp % SELECTED_TRACK_BLINK_PERIOD_MS) / SELECTED_TRACK_BLINK_PERIOD_MS;
  const blinkAngle = blinkPhase * Math.PI * 2;
  const blinkWave = Math.sin(blinkAngle);
  const blinkScale = SELECTED_TRACK_BLINK_BASE + SELECTED_TRACK_BLINK_RANGE * blinkWave;

  for (const resource of trackLines.values()) {
    const { material, outlineMaterial, endCap, endCapMaterial } = resource;
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
}
