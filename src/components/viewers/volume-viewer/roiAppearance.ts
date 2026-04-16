import type { RoiRenderResource } from '../VolumeViewer.types';

const ACTIVE_ROI_BLINK_PERIOD_MS = 1600;
const ACTIVE_ROI_BLINK_MIN_OPACITY = 0.55;
const ACTIVE_ROI_BLINK_MAX_OPACITY = 0.95;
const INVALID_ROI_OPACITY = 0.5;

const computeBlinkOpacity = (timestamp: number) => {
  const phase = (timestamp % ACTIVE_ROI_BLINK_PERIOD_MS) / ACTIVE_ROI_BLINK_PERIOD_MS;
  const wave = (Math.sin(phase * Math.PI * 2) + 1) / 2;
  return ACTIVE_ROI_BLINK_MIN_OPACITY + wave * (ACTIVE_ROI_BLINK_MAX_OPACITY - ACTIVE_ROI_BLINK_MIN_OPACITY);
};

export function updateRoiAppearance(resources: Iterable<RoiRenderResource>, timestamp: number): void {
  const blinkOpacity = computeBlinkOpacity(timestamp);

  for (const resource of resources) {
    const targetOpacity = resource.isInvalid
      ? INVALID_ROI_OPACITY
      : resource.shouldBlink
        ? blinkOpacity
        : resource.baseOpacity;
    if (!resource.material.color.equals(resource.color)) {
      resource.material.color.copy(resource.color);
      resource.material.needsUpdate = true;
    }
    if (resource.material.opacity !== targetOpacity) {
      resource.material.opacity = targetOpacity;
      resource.material.needsUpdate = true;
    }
  }
}
