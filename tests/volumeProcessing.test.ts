import { describe, expect, it } from 'vitest';

import { colorizeSegmentationVolume, normalizeVolume } from '../src/volumeProcessing.ts';
import type { VolumePayload } from '../src/types/volume.ts';

describe('volumeProcessing', () => {
  const normalize = (
    data: ArrayBuffer,
    dataType: VolumePayload['dataType'],
    parameters: { min: number; max: number }
  ) => {
    const volume: VolumePayload = {
      width: 5,
      height: 1,
      depth: 1,
      channels: 1,
      dataType,
      data,
      min: 0,
      max: 255
    };

    return normalizeVolume(volume, parameters);
  };

  it('normalizes uint8 and float32 volumes with windowing', () => {
    const raw = new Uint8Array([0, 64, 128, 192, 255]);
    const identity = normalize(raw.buffer, 'uint8', { min: 0, max: 255 });
    expect(identity.min).toBe(0);
    expect(identity.max).toBe(255);
    expect(identity.normalized.length).toBe(raw.length);
    expect(identity.normalized.buffer).toBe(raw.buffer);
    expect(Array.from(identity.normalized)).toEqual(Array.from(raw));

    const windowed = normalize(raw.buffer, 'uint8', { min: 64, max: 192 });
    expect(windowed.normalized.buffer).not.toBe(raw.buffer);
    expect(Array.from(windowed.normalized)).toEqual([0, 0, 128, 255, 255]);

    const floats = new Float32Array([-1, 0, 0.5, 1.5]);
    const floatVolume: VolumePayload = {
      width: 4,
      height: 1,
      depth: 1,
      channels: 1,
      dataType: 'float32',
      data: floats.buffer,
      min: -1,
      max: 1.5
    };

    const normalizedFloat = normalizeVolume(floatVolume, { min: 0, max: 1 });
    expect(normalizedFloat.normalized.buffer).not.toBe(floats.buffer);
    expect(Array.from(normalizedFloat.normalized)).toEqual([0, 0, 128, 255]);
  });

  it('colorizes segmentation volumes deterministically', () => {
    const segmentation = new Uint8Array([0, 1, 1, 2]);
    const segmentationVolume: VolumePayload = {
      width: 4,
      height: 1,
      depth: 1,
      channels: 1,
      dataType: 'uint8',
      data: segmentation.buffer,
      min: 0,
      max: 2
    };

    const seed = 12345;
    const colorized = colorizeSegmentationVolume(segmentationVolume, seed);
    expect(colorized.channels).toBe(4);
    expect(colorized.normalized.length).toBe(segmentation.length * 4);
    expect(Array.from(colorized.normalized.slice(0, 4))).toEqual([0, 0, 0, 0]);

    const firstLabelColor = Array.from(colorized.normalized.slice(4, 8));
    const repeatedLabelColor = Array.from(colorized.normalized.slice(8, 12));
    expect(repeatedLabelColor).toEqual(firstLabelColor);

    const secondLabelColor = Array.from(colorized.normalized.slice(12, 16));
    expect(secondLabelColor).not.toEqual(firstLabelColor);
    expect(secondLabelColor[3]).toBe(255);

    const rerun = colorizeSegmentationVolume(segmentationVolume, seed);
    expect(Array.from(rerun.normalized)).toEqual(Array.from(colorized.normalized));
  });

  it('colorizes fractional segmentation volumes by rounding labels', () => {
    const fractionalSegmentation = new Float32Array([0, 0.2, 0.8, 1.2, 1.6]);
    const fractionalVolume: VolumePayload = {
      width: fractionalSegmentation.length,
      height: 1,
      depth: 1,
      channels: 1,
      dataType: 'float32',
      data: fractionalSegmentation.buffer,
      min: 0,
      max: 2
    };

    const seed = 12345;
    const fractionalColorized = colorizeSegmentationVolume(fractionalVolume, seed);
    expect(fractionalColorized.normalized.length).toBe(fractionalSegmentation.length * 4);
    expect(Array.from(fractionalColorized.normalized.slice(0, 4))).toEqual([0, 0, 0, 0]);

    const roundedLabelColor = Array.from(fractionalColorized.normalized.slice(8, 12));
    expect(roundedLabelColor.some((value) => value !== 0)).toBe(true);

    const repeatedRoundedLabelColor = Array.from(
      fractionalColorized.normalized.slice(12, 16)
    );
    expect(repeatedRoundedLabelColor).toEqual(roundedLabelColor);

    const higherLabelColor = Array.from(fractionalColorized.normalized.slice(16, 20));
    expect(higherLabelColor.some((value) => value !== 0)).toBe(true);
    expect(higherLabelColor).not.toEqual(roundedLabelColor);
  });
});
