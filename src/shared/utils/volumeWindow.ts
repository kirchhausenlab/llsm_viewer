import type { NormalizedVolume } from '../core/volumeProcessing';
import { computeHistogramQuantileWindow } from '../autoContrast';

const FLOAT_DATA_TYPES: ReadonlySet<NormalizedVolume['dataType']> = new Set([
  'float32',
  'float64'
]);

type WindowBounds = { windowMin: number; windowMax: number };

export function getDefaultWindowForVolume(
  volume: NormalizedVolume | null | undefined
): WindowBounds | null {
  if (!volume) {
    return null;
  }

  if (!FLOAT_DATA_TYPES.has(volume.dataType)) {
    return null;
  }

  const window = computeHistogramQuantileWindow(volume);
  if (!window) {
    return null;
  }

  return window;
}
