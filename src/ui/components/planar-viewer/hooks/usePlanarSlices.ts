import { useCallback, useMemo } from 'react';
import { denormalizeValue, formatChannelValuesDetailed } from '../../../shared/utils/intensityFormatting';
import type { VolumeDataType } from '../../../types/volume';
import type { HoveredIntensityInfo, OrthogonalAnchor, SliceData, ViewerLayer } from '../types';
import { clamp, getColorComponents } from '../utils';

const MIN_ALPHA = 0.05;
const WINDOW_EPSILON = 1e-5;

type SliceSampler = (x: number, y: number) => number[] | null;

function sampleSegmentationLabel2d(volume: ViewerLayer['volume'], x: number, y: number, z: number) {
  if (!volume || !volume.segmentationLabels) {
    return null;
  }

  const safeX = Math.round(clamp(x, 0, volume.width - 1));
  const safeY = Math.round(clamp(y, 0, volume.height - 1));
  const safeZ = Math.round(clamp(z, 0, volume.depth - 1));

  const sliceStride = volume.width * volume.height;
  const index = safeZ * sliceStride + safeY * volume.width + safeX;
  return volume.segmentationLabels[index] ?? null;
}

function createSliceWithSampler(
  width: number,
  height: number,
  layers: ViewerLayer[],
  samplerFactory: (layer: ViewerLayer) => SliceSampler | null
): SliceData | null {
  if (width === 0 || height === 0) {
    return { width, height, buffer: new Uint8ClampedArray(0), hasLayer: false };
  }

  const pixelCount = width * height;
  const accumR = new Float32Array(pixelCount);
  const accumG = new Float32Array(pixelCount);
  const accumB = new Float32Array(pixelCount);
  const accumA = new Float32Array(pixelCount);
  let hasLayer = false;

  const colorCache = new Map<string, { r: number; g: number; b: number }>();
  const getColor = (hex: string) => {
    if (!colorCache.has(hex)) {
      colorCache.set(hex, getColorComponents(hex));
    }
    return colorCache.get(hex)!;
  };

  layers.forEach((layer) => {
    const sampler = samplerFactory(layer);
    if (!sampler) {
      return;
    }

    const volume = layer.volume!;
    const channels = Math.max(1, volume.channels);
    const invert = layer.invert ?? false;
    const windowMin = layer.windowMin ?? 0;
    const windowMax = layer.windowMax ?? 1;
    const windowRange = Math.max(windowMax - windowMin, WINDOW_EPSILON);
    const normalizeScalar = (value: number) => clamp((value - windowMin) / windowRange, 0, 1);
    const applyWindow = (value: number) => {
      const normalized = normalizeScalar(value);
      return invert ? 1 - normalized : normalized;
    };
    const tint = channels === 1 ? getColor(layer.color) : null;
    const channelValues = new Array<number>(channels);

    for (let y = 0; y < height; y++) {
      const rowIndex = y * width;
      for (let x = 0; x < width; x++) {
        const pixelIndex = rowIndex + x;
        const sampled = sampler(x, y);
        if (!sampled) {
          continue;
        }

        for (let channelIndex = 0; channelIndex < channels; channelIndex++) {
          channelValues[channelIndex] = sampled[channelIndex] ?? 0;
        }

        const channelR = channelValues[0] / 255;
        const channelG = channels > 1 ? channelValues[1] / 255 : channelR;
        const channelB = channels > 2 ? channelValues[2] / 255 : channels === 2 ? 0 : channelG;
        const channelA = channels > 3 ? channelValues[3] / 255 : 0;

        let srcR = 0;
        let srcG = 0;
        let srcB = 0;
        let alpha = 0;

        if (channels === 1) {
          const normalizedIntensity = applyWindow(channelR);
          const layerAlpha = Math.max(normalizedIntensity, MIN_ALPHA);
          const color = tint ?? getColor('#ffffff');
          srcR = color.r * normalizedIntensity;
          srcG = color.g * normalizedIntensity;
          srcB = color.b * normalizedIntensity;
          alpha = layerAlpha;
        } else {
          const intensity =
            channels === 2
              ? 0.5 * (channelR + channelG)
              : channels === 3
              ? channelR * 0.2126 + channelG * 0.7152 + channelB * 0.0722
              : Math.max(channelR, channelG, Math.max(channelB, channelA));
          const normalizedIntensity = applyWindow(intensity);
          alpha = Math.max(normalizedIntensity, MIN_ALPHA);
          const normalizedR = applyWindow(channelR);
          const normalizedG = channels > 1 ? applyWindow(channelG) : normalizedR;
          const normalizedB = channels > 2 ? applyWindow(channelB) : channels === 2 ? 0 : normalizedG;
          srcR = normalizedR;
          srcG = normalizedG;
          srcB = normalizedB;
        }

        const srcA = clamp(alpha, 0, 1);
        const srcRPremult = srcR * srcA;
        const srcGPremult = srcG * srcA;
        const srcBPremult = srcB * srcA;

        const prevR = accumR[pixelIndex];
        const prevG = accumG[pixelIndex];
        const prevB = accumB[pixelIndex];
        const prevA = accumA[pixelIndex];
        const oneMinusSrcA = 1 - srcA;

        accumR[pixelIndex] = srcRPremult + prevR * oneMinusSrcA;
        accumG[pixelIndex] = srcGPremult + prevG * oneMinusSrcA;
        accumB[pixelIndex] = srcBPremult + prevB * oneMinusSrcA;
        accumA[pixelIndex] = srcA + prevA * oneMinusSrcA;

        if (!hasLayer && srcA > 0) {
          hasLayer = true;
        }
      }
    }
  });

  const output = new Uint8ClampedArray(pixelCount * 4);
  for (let i = 0; i < pixelCount; i++) {
    const alpha = clamp(accumA[i], 0, 1);
    const index = i * 4;
    if (alpha > 1e-6) {
      const invAlpha = 1 / alpha;
      output[index] = Math.round(clamp(accumR[i] * invAlpha, 0, 1) * 255);
      output[index + 1] = Math.round(clamp(accumG[i] * invAlpha, 0, 1) * 255);
      output[index + 2] = Math.round(clamp(accumB[i] * invAlpha, 0, 1) * 255);
      output[index + 3] = Math.round(alpha * 255);
    } else {
      output[index] = 0;
      output[index + 1] = 0;
      output[index + 2] = 0;
      output[index + 3] = 0;
    }
  }

  return { width, height, buffer: output, hasLayer };
}

type UsePlanarSlicesParams = {
  layers: ViewerLayer[];
  primaryVolume: ViewerLayer['volume'];
  clampedSliceIndex: number;
  orthogonalAnchor: OrthogonalAnchor;
  orthogonalViewsEnabled: boolean;
};

export function usePlanarSlices({
  layers,
  primaryVolume,
  clampedSliceIndex,
  orthogonalAnchor,
  orthogonalViewsEnabled
}: UsePlanarSlicesParams) {
  const sliceData = useMemo<SliceData | null>(() => {
    if (!primaryVolume) {
      return null;
    }

    const width = primaryVolume.width;
    const height = primaryVolume.height;

    return createSliceWithSampler(width, height, layers, (layer) => {
      const volume = layer.volume;
      if (!volume || !layer.visible) {
        return null;
      }
      if (
        volume.width !== width ||
        volume.height !== height ||
        volume.depth <= 0
      ) {
        return null;
      }

      const channels = Math.max(1, volume.channels);
      const slice = clamp(clampedSliceIndex, 0, Math.max(0, volume.depth - 1));
      const sliceStride = width * height * channels;
      const rowStride = width * channels;
      const sliceOffset = slice * sliceStride;
      const offsetX = layer.offsetX ?? 0;
      const offsetY = layer.offsetY ?? 0;
      const hasOffset = Math.abs(offsetX) > 1e-3 || Math.abs(offsetY) > 1e-3;
      const values = new Array<number>(channels);

      if (!hasOffset) {
        return (x, y) => {
          const pixelOffset = sliceOffset + (y * width + x) * channels;
          for (let channelIndex = 0; channelIndex < channels; channelIndex += 1) {
            values[channelIndex] = volume.normalized[pixelOffset + channelIndex] ?? 0;
          }
          return values;
        };
      }

      return (x, y) => {
        const sampleX = x - offsetX;
        const sampleY = y - offsetY;
        const clampedX = clamp(sampleX, 0, width - 1);
        const clampedY = clamp(sampleY, 0, height - 1);
        const leftX = Math.floor(clampedX);
        const rightX = Math.min(width - 1, leftX + 1);
        const topY = Math.floor(clampedY);
        const bottomY = Math.min(height - 1, topY + 1);
        const tX = clampedX - leftX;
        const tY = clampedY - topY;

        const topRowOffset = sliceOffset + topY * rowStride;
        const bottomRowOffset = sliceOffset + bottomY * rowStride;

        const topLeftOffset = topRowOffset + leftX * channels;
        const topRightOffset = topRowOffset + rightX * channels;
        const bottomLeftOffset = bottomRowOffset + leftX * channels;
        const bottomRightOffset = bottomRowOffset + rightX * channels;

        const weightTopLeft = (1 - tX) * (1 - tY);
        const weightTopRight = tX * (1 - tY);
        const weightBottomLeft = (1 - tX) * tY;
        const weightBottomRight = tX * tY;

        for (let channelIndex = 0; channelIndex < channels; channelIndex += 1) {
          values[channelIndex] =
            (volume.normalized[topLeftOffset + channelIndex] ?? 0) * weightTopLeft +
            (volume.normalized[topRightOffset + channelIndex] ?? 0) * weightTopRight +
            (volume.normalized[bottomLeftOffset + channelIndex] ?? 0) * weightBottomLeft +
            (volume.normalized[bottomRightOffset + channelIndex] ?? 0) * weightBottomRight;
        }

        return values;
      };
    });
  }, [clampedSliceIndex, layers, primaryVolume]);

  const xzSliceData = useMemo<SliceData | null>(() => {
    if (!primaryVolume || !orthogonalViewsEnabled || primaryVolume.depth <= 1) {
      return null;
    }

    const anchorY = orthogonalAnchor?.y ?? Math.max(0, primaryVolume.height / 2 - 0.5);
    const width = primaryVolume.width;
    const depth = primaryVolume.depth;

    return createSliceWithSampler(width, depth, layers, (layer) => {
      const volume = layer.volume;
      if (!volume || !layer.visible) {
        return null;
      }
      if (
        volume.width !== primaryVolume.width ||
        volume.height !== primaryVolume.height ||
        volume.depth !== primaryVolume.depth
      ) {
        return null;
      }

      const channels = Math.max(1, volume.channels);
      const sliceStride = volume.width * volume.height * channels;
      const rowStride = volume.width * channels;
      const offsetX = layer.offsetX ?? 0;
      const offsetY = layer.offsetY ?? 0;
      const values = new Array<number>(channels);

      return (x, z) => {
        const clampedZ = Math.round(clamp(z, 0, volume.depth - 1));
        const sliceOffset = clampedZ * sliceStride;
        const sampleX = x - offsetX;
        const sampleY = anchorY - offsetY;

        const clampedX = clamp(sampleX, 0, volume.width - 1);
        const clampedY = clamp(sampleY, 0, volume.height - 1);
        const leftX = Math.floor(clampedX);
        const rightX = Math.min(volume.width - 1, leftX + 1);
        const topY = Math.floor(clampedY);
        const bottomY = Math.min(volume.height - 1, topY + 1);
        const tX = clampedX - leftX;
        const tY = clampedY - topY;

        const topRowOffset = sliceOffset + topY * rowStride;
        const bottomRowOffset = sliceOffset + bottomY * rowStride;

        const topLeftOffset = topRowOffset + leftX * channels;
        const topRightOffset = topRowOffset + rightX * channels;
        const bottomLeftOffset = bottomRowOffset + leftX * channels;
        const bottomRightOffset = bottomRowOffset + rightX * channels;

        const weightTopLeft = (1 - tX) * (1 - tY);
        const weightTopRight = tX * (1 - tY);
        const weightBottomLeft = (1 - tX) * tY;
        const weightBottomRight = tX * tY;

        for (let channelIndex = 0; channelIndex < channels; channelIndex += 1) {
          values[channelIndex] =
            (volume.normalized[topLeftOffset + channelIndex] ?? 0) * weightTopLeft +
            (volume.normalized[topRightOffset + channelIndex] ?? 0) * weightTopRight +
            (volume.normalized[bottomLeftOffset + channelIndex] ?? 0) * weightBottomLeft +
            (volume.normalized[bottomRightOffset + channelIndex] ?? 0) * weightBottomRight;
        }

        return values;
      };
    });
  }, [layers, orthogonalAnchor, orthogonalViewsEnabled, primaryVolume]);

  const zySliceData = useMemo<SliceData | null>(() => {
    if (!primaryVolume || !orthogonalViewsEnabled || primaryVolume.depth <= 1) {
      return null;
    }

    const anchorX = orthogonalAnchor?.x ?? Math.max(0, primaryVolume.width / 2 - 0.5);
    const height = primaryVolume.height;
    const depth = primaryVolume.depth;

    return createSliceWithSampler(depth, height, layers, (layer) => {
      const volume = layer.volume;
      if (!volume || !layer.visible) {
        return null;
      }
      if (
        volume.width !== primaryVolume.width ||
        volume.height !== primaryVolume.height ||
        volume.depth !== primaryVolume.depth
      ) {
        return null;
      }

      const channels = Math.max(1, volume.channels);
      const sliceStride = volume.width * volume.height * channels;
      const rowStride = volume.width * channels;
      const offsetX = layer.offsetX ?? 0;
      const offsetY = layer.offsetY ?? 0;
      const values = new Array<number>(channels);

      return (z, y) => {
        const clampedZ = Math.round(clamp(z, 0, volume.depth - 1));
        const sliceOffset = clampedZ * sliceStride;
        const sampleX = anchorX - offsetX;
        const sampleY = y - offsetY;

        const clampedX = clamp(sampleX, 0, volume.width - 1);
        const clampedY = clamp(sampleY, 0, volume.height - 1);
        const leftX = Math.floor(clampedX);
        const rightX = Math.min(volume.width - 1, leftX + 1);
        const topY = Math.floor(clampedY);
        const bottomY = Math.min(volume.height - 1, topY + 1);
        const tX = clampedX - leftX;
        const tY = clampedY - topY;

        const topRowOffset = sliceOffset + topY * rowStride;
        const bottomRowOffset = sliceOffset + bottomY * rowStride;

        const topLeftOffset = topRowOffset + leftX * channels;
        const topRightOffset = topRowOffset + rightX * channels;
        const bottomLeftOffset = bottomRowOffset + leftX * channels;
        const bottomRightOffset = bottomRowOffset + rightX * channels;

        const weightTopLeft = (1 - tX) * (1 - tY);
        const weightTopRight = tX * (1 - tY);
        const weightBottomLeft = (1 - tX) * tY;
        const weightBottomRight = tX * tY;

        for (let channelIndex = 0; channelIndex < channels; channelIndex += 1) {
          values[channelIndex] =
            (volume.normalized[topLeftOffset + channelIndex] ?? 0) * weightTopLeft +
            (volume.normalized[topRightOffset + channelIndex] ?? 0) * weightTopRight +
            (volume.normalized[bottomLeftOffset + channelIndex] ?? 0) * weightBottomLeft +
            (volume.normalized[bottomRightOffset + channelIndex] ?? 0) * weightBottomRight;
        }

        return values;
      };
    });
  }, [layers, orthogonalAnchor, orthogonalViewsEnabled, primaryVolume]);

  const samplePixelValue = useCallback(
    (sliceX: number, sliceY: number): HoveredIntensityInfo | null => {
      if (!sliceData || !sliceData.hasLayer) {
        return null;
      }

      const samples: Array<{
        values: number[];
        type: VolumeDataType;
        label: string | null;
        color: string;
      }> = [];

      for (const layer of layers) {
        const volume = layer.volume;
        if (!volume || !layer.visible) {
          continue;
        }
        if (volume.width !== sliceData.width || volume.height !== sliceData.height) {
          continue;
        }
        if (volume.depth <= 0) {
          continue;
        }

        const channels = Math.max(1, volume.channels);
        const slice = clamp(clampedSliceIndex, 0, Math.max(0, volume.depth - 1));
        const sliceStride = volume.width * volume.height * channels;
        const rowStride = volume.width * channels;
        const sliceOffset = slice * sliceStride;

        const offsetX = layer.offsetX ?? 0;
        const offsetY = layer.offsetY ?? 0;
        const sampleX = sliceX - offsetX;
        const sampleY = sliceY - offsetY;

        const channelLabel = layer.channelName?.trim() || layer.label?.trim() || null;
        const channelColor = layer.color;

        if (layer.isSegmentation && volume.segmentationLabels) {
          const labelValue = sampleSegmentationLabel2d(volume, sampleX, sampleY, slice);
          if (labelValue !== null) {
            samples.push({ values: [labelValue], type: volume.dataType, label: channelLabel, color: channelColor });
          }
          continue;
        }

        const clampedX = clamp(sampleX, 0, volume.width - 1);
        const clampedY = clamp(sampleY, 0, volume.height - 1);
        const leftX = Math.floor(clampedX);
        const rightX = Math.min(volume.width - 1, leftX + 1);
        const topY = Math.floor(clampedY);
        const bottomY = Math.min(volume.height - 1, topY + 1);
        const tX = clampedX - leftX;
        const tY = clampedY - topY;

        const weightTopLeft = (1 - tX) * (1 - tY);
        const weightTopRight = tX * (1 - tY);
        const weightBottomLeft = (1 - tX) * tY;
        const weightBottomRight = tX * tY;

        const topRowOffset = sliceOffset + topY * rowStride;
        const bottomRowOffset = sliceOffset + bottomY * rowStride;

        const sampleChannel = (channelIndex: number) => {
          const topLeftOffset = topRowOffset + leftX * channels + channelIndex;
          const topRightOffset = topRowOffset + rightX * channels + channelIndex;
          const bottomLeftOffset = bottomRowOffset + leftX * channels + channelIndex;
          const bottomRightOffset = bottomRowOffset + rightX * channels + channelIndex;
          return (
            (volume.normalized[topLeftOffset] ?? 0) * weightTopLeft +
            (volume.normalized[topRightOffset] ?? 0) * weightTopRight +
            (volume.normalized[bottomLeftOffset] ?? 0) * weightBottomLeft +
            (volume.normalized[bottomRightOffset] ?? 0) * weightBottomRight
          );
        };

        const channelValues: number[] = [];
        for (let channelIndex = 0; channelIndex < channels; channelIndex++) {
          channelValues.push(denormalizeValue(sampleChannel(channelIndex), volume));
        }

        samples.push({
          values: channelValues,
          type: volume.dataType,
          label: channelLabel,
          color: channelColor,
        });
      }

      const totalValues = samples.reduce((sum, sample) => sum + sample.values.length, 0);
      if (totalValues === 0) {
        return null;
      }

      const includeLabel = totalValues > 1;
      const parts = samples.flatMap((sample) =>
        formatChannelValuesDetailed(sample.values, sample.type, sample.label, includeLabel).map((entry) => ({
          text: entry.text,
          color: sample.color,
        })),
      );

      if (parts.length === 0) {
        return null;
      }

      return {
        intensity: parts.map((entry) => entry.text).join(' · '),
        components: parts.map((entry) => ({ text: entry.text, color: entry.color })),
      };
    },
    [clampedSliceIndex, layers, sliceData]
  );

  return {
    sliceData,
    xzSliceData,
    zySliceData,
    samplePixelValue,
  };
}
