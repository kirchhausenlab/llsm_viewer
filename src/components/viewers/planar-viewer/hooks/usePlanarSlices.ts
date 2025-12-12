import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  denormalizeValue,
  formatChannelValuesDetailed,
  type FormattedChannelValue,
} from '../../../../shared/utils/intensityFormatting';
import type { VolumeDataType, VolumeTypedArray } from '../../../../types/volume';
import type { ZarrVolumeSource } from '../../../../data/ZarrVolumeSource';
import type { HoveredIntensityInfo, OrthogonalAnchor, SliceData, ViewerLayer } from '../types';
import { clamp, getColorComponents } from '../utils';

const MIN_ALPHA = 0.05;
const WINDOW_EPSILON = 1e-5;

type SliceSampler = (x: number, y: number) => number[] | null;
type StreamedSlice = {
  layerKey: string;
  mipLevel: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  channels: number;
  data: VolumeTypedArray;
};

type StreamableVolume = ViewerLayer['volume'] & {
  streamingSource?: ZarrVolumeSource;
  streamingBaseShape?: [number, number, number, number];
};

type VisibleSliceRegion = { minX: number; minY: number; maxX: number; maxY: number } | null;

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

function getStreamableVolume(volume: ViewerLayer['volume']): StreamableVolume | null {
  if (!volume) {
    return null;
  }
  const candidate = volume as StreamableVolume;
  return candidate.streamingSource ? candidate : null;
}

function getStreamingBaseShape(volume: StreamableVolume): [number, number, number, number] {
  if (volume.streamingBaseShape) {
    return volume.streamingBaseShape;
  }
  return [Math.max(1, volume.channels), Math.max(1, volume.depth), volume.height, volume.width];
}

function computeLevelScale(
  baseShape: [number, number, number, number],
  levelShape: [number, number, number, number]
): { scaleX: number; scaleY: number; scaleZ: number } {
  return {
    scaleX: Math.max(1, Math.round(baseShape[3] / levelShape[3])),
    scaleY: Math.max(1, Math.round(baseShape[2] / levelShape[2])),
    scaleZ: Math.max(1, Math.round(baseShape[1] / levelShape[1]))
  };
}

function pickMipLevel(
  source: ZarrVolumeSource,
  baseShape: [number, number, number, number],
  desiredScale: number
): { level: number; scale: { scaleX: number; scaleY: number; scaleZ: number } } {
  const mipLevels = source.getMipLevels();
  let best = { level: mipLevels[0], scale: computeLevelScale(baseShape, source.getMip(mipLevels[0]).shape) };
  let bestError = Number.POSITIVE_INFINITY;

  for (const level of mipLevels) {
    const levelShape = source.getMip(level).shape;
    const scale = computeLevelScale(baseShape, levelShape);
    const levelScale = Math.max(scale.scaleX, scale.scaleY);
    const error = Math.abs(levelScale - desiredScale);
    if (error < bestError) {
      best = { level, scale };
      bestError = error;
    }
  }

  return best;
}

function createStreamingSampler(slice: StreamedSlice, offset: { x: number; y: number }): SliceSampler {
  const values = new Array<number>(slice.channels);
  const widthStride = slice.width;
  const channelStride = slice.width * slice.height;

  return (x, y) => {
    const localX = (x - offset.x - slice.offsetX) / slice.scaleX;
    const localY = (y - offset.y - slice.offsetY) / slice.scaleY;

    if (localX < -1 || localY < -1 || localX > slice.width || localY > slice.height) {
      return null;
    }

    const clampedX = clamp(localX, 0, slice.width - 1);
    const clampedY = clamp(localY, 0, slice.height - 1);
    const leftX = Math.floor(clampedX);
    const rightX = Math.min(slice.width - 1, leftX + 1);
    const topY = Math.floor(clampedY);
    const bottomY = Math.min(slice.height - 1, topY + 1);
    const tX = clampedX - leftX;
    const tY = clampedY - topY;

    const weightTopLeft = (1 - tX) * (1 - tY);
    const weightTopRight = tX * (1 - tY);
    const weightBottomLeft = (1 - tX) * tY;
    const weightBottomRight = tX * tY;

    const topLeftIndex = topY * widthStride + leftX;
    const topRightIndex = topY * widthStride + rightX;
    const bottomLeftIndex = bottomY * widthStride + leftX;
    const bottomRightIndex = bottomY * widthStride + rightX;

    for (let channel = 0; channel < slice.channels; channel += 1) {
      const base = channel * channelStride;
      values[channel] =
        (slice.data[base + topLeftIndex] ?? 0) * weightTopLeft +
        (slice.data[base + topRightIndex] ?? 0) * weightTopRight +
        (slice.data[base + bottomLeftIndex] ?? 0) * weightBottomLeft +
        (slice.data[base + bottomRightIndex] ?? 0) * weightBottomRight;
    }

    return values;
  };
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
    const layerColor = layer.color ?? '#ffffff';
    const tint = channels === 1 ? getColor(layerColor) : null;
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
          const color = tint ?? getColor(layerColor);
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

function createLayerSampler(params: {
  layer: ViewerLayer;
  sliceIndex: number;
  targetWidth: number;
  targetHeight: number;
  streamedSlice?: StreamedSlice;
}): SliceSampler | null {
  const { layer, sliceIndex, targetWidth, targetHeight, streamedSlice } = params;
  const volume = layer.volume;
  if (!volume || !layer.visible) {
    return null;
  }
  if (volume.width !== targetWidth || volume.height !== targetHeight || volume.depth <= 0) {
    return null;
  }

  const offsetX = layer.offsetX ?? 0;
  const offsetY = layer.offsetY ?? 0;

  if (streamedSlice) {
    return createStreamingSampler(streamedSlice, { x: offsetX, y: offsetY });
  }

  const channels = Math.max(1, volume.channels);
  const slice = clamp(sliceIndex, 0, Math.max(0, volume.depth - 1));
  const sliceStride = targetWidth * targetHeight * channels;
  const rowStride = targetWidth * channels;
  const sliceOffset = slice * sliceStride;
  const hasOffset = Math.abs(offsetX) > 1e-3 || Math.abs(offsetY) > 1e-3;
  const values = new Array<number>(channels);

  if (!hasOffset) {
    return (x, y) => {
      const pixelOffset = sliceOffset + (y * targetWidth + x) * channels;
      for (let channelIndex = 0; channelIndex < channels; channelIndex += 1) {
        values[channelIndex] = volume.normalized[pixelOffset + channelIndex] ?? 0;
      }
      return values;
    };
  }

  return (x, y) => {
    const sampleX = x - offsetX;
    const sampleY = y - offsetY;
    const clampedX = clamp(sampleX, 0, targetWidth - 1);
    const clampedY = clamp(sampleY, 0, targetHeight - 1);
    const leftX = Math.floor(clampedX);
    const rightX = Math.min(targetWidth - 1, leftX + 1);
    const topY = Math.floor(clampedY);
    const bottomY = Math.min(targetHeight - 1, topY + 1);
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
}

type UseStreamingSlicesParams = {
  layers: ViewerLayer[];
  clampedSliceIndex: number;
  visibleSliceRegion: VisibleSliceRegion;
  pixelRatio: number;
  fallbackSize: { width: number; height: number };
  viewScale: number;
};

function useStreamingSlices({
  layers,
  clampedSliceIndex,
  visibleSliceRegion,
  pixelRatio,
  fallbackSize,
  viewScale
}: UseStreamingSlicesParams) {
  const [streamedSlices, setStreamedSlices] = useState<Map<string, StreamedSlice>>(new Map());
  const [isStreaming, setIsStreaming] = useState(false);
  const cacheRef = useRef<Map<string, StreamedSlice>>(new Map());

  useEffect(() => {
    const streamableLayers = layers.filter((layer) => Boolean(getStreamableVolume(layer.volume)));
    if (streamableLayers.length === 0) {
      setStreamedSlices(new Map());
      setIsStreaming(false);
      return;
    }

    const controller = new AbortController();
    setIsStreaming(true);

    const region = visibleSliceRegion ?? {
      minX: 0,
      minY: 0,
      maxX: fallbackSize.width,
      maxY: fallbackSize.height
    };

    const desiredScale = Math.max(1, 1 / Math.max(viewScale * pixelRatio, 1e-6));
    const padding = 8;
    const nextSlices = new Map<string, StreamedSlice>();

    const tasks = streamableLayers.map(async (layer) => {
      const streamableVolume = getStreamableVolume(layer.volume);
      if (!streamableVolume?.streamingSource) {
        return;
      }

      const baseShape = getStreamingBaseShape(streamableVolume);
      const target = pickMipLevel(streamableVolume.streamingSource, baseShape, desiredScale);
      const mip = streamableVolume.streamingSource.getMip(target.level);
      const scale = target.scale;

      const regionMinX = Math.max(0, Math.floor((region.minX - padding) / scale.scaleX));
      const regionMinY = Math.max(0, Math.floor((region.minY - padding) / scale.scaleY));
      const regionMaxX = Math.min(
        mip.shape[3],
        Math.ceil((region.maxX + padding) / scale.scaleX)
      );
      const regionMaxY = Math.min(
        mip.shape[2],
        Math.ceil((region.maxY + padding) / scale.scaleY)
      );

      const sliceZ = Math.min(
        Math.max(0, Math.floor(clampedSliceIndex / scale.scaleZ)),
        Math.max(0, mip.shape[1] - 1)
      );
      const width = Math.max(1, regionMaxX - regionMinX);
      const height = Math.max(1, regionMaxY - regionMinY);

      const requestKey = `${layer.key}:${target.level}:${sliceZ}:${regionMinX},${regionMinY},${width},${height}`;
      const cached = cacheRef.current.get(requestKey);
      if (cached) {
        nextSlices.set(layer.key, cached);
        return;
      }

      const request = {
        mipLevel: target.level,
        offset: [0, sliceZ, regionMinY, regionMinX] as [number, number, number, number],
        shape: [mip.shape[0], 1, height, width] as [number, number, number, number],
        signal: controller.signal,
        priorityCenter: [mip.shape[0] / 2, sliceZ, regionMinY + height / 2, regionMinX + width / 2] as [
          number,
          number,
          number,
          number
        ]
      } satisfies Parameters<ZarrVolumeSource['readRegion']>[0];

      const data = await streamableVolume.streamingSource.readRegion(request);
      if (controller.signal.aborted) {
        return;
      }

      const slice: StreamedSlice = {
        layerKey: layer.key,
        mipLevel: target.level,
        scaleX: scale.scaleX,
        scaleY: scale.scaleY,
        scaleZ: scale.scaleZ,
        offsetX: regionMinX * scale.scaleX,
        offsetY: regionMinY * scale.scaleY,
        width,
        height,
        channels: mip.shape[0],
        data
      };

      cacheRef.current.set(requestKey, slice);
      if (cacheRef.current.size > 32) {
        const oldestKey = cacheRef.current.keys().next().value;
        cacheRef.current.delete(oldestKey);
      }

      nextSlices.set(layer.key, slice);
    });

    Promise.all(tasks)
      .then(() => {
        if (controller.signal.aborted) {
          return;
        }
        setStreamedSlices(nextSlices);
      })
      .catch((error) => {
        if (controller.signal.aborted) {
          return;
        }
        console.error('Failed to stream planar slice', error);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsStreaming(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [clampedSliceIndex, fallbackSize.height, fallbackSize.width, layers, pixelRatio, visibleSliceRegion, viewScale]);

  return { streamedSlices, isStreaming } as const;
}

type UsePlanarSlicesParams = {
  layers: ViewerLayer[];
  primaryVolume: ViewerLayer['volume'];
  clampedSliceIndex: number;
  orthogonalAnchor: OrthogonalAnchor;
  orthogonalViewsEnabled: boolean;
  visibleSliceRegion: VisibleSliceRegion;
  pixelRatio: number;
  viewScale: number;
};

export function usePlanarSlices({
  layers,
  primaryVolume,
  clampedSliceIndex,
  orthogonalAnchor,
  orthogonalViewsEnabled,
  visibleSliceRegion,
  pixelRatio,
  viewScale
}: UsePlanarSlicesParams) {
  const fallbackSize = useMemo(
    () => ({ width: primaryVolume?.width ?? 0, height: primaryVolume?.height ?? 0 }),
    [primaryVolume]
  );

  const { streamedSlices, isStreaming } = useStreamingSlices({
    layers,
    clampedSliceIndex,
    visibleSliceRegion,
    pixelRatio,
    fallbackSize,
    viewScale
  });

  const sliceSamplers = useMemo(() => {
    const samplers = new Map<string, SliceSampler>();
    if (!primaryVolume) {
      return samplers;
    }
    for (const layer of layers) {
      const sampler = createLayerSampler({
        layer,
        sliceIndex: clampedSliceIndex,
        targetWidth: primaryVolume.width,
        targetHeight: primaryVolume.height,
        streamedSlice: streamedSlices.get(layer.key),
      });
      if (sampler) {
        samplers.set(layer.key, sampler);
      }
    }
    return samplers;
  }, [clampedSliceIndex, layers, primaryVolume, streamedSlices]);

  const sliceData = useMemo<SliceData | null>(() => {
    if (!primaryVolume) {
      return null;
    }

    const width = primaryVolume.width;
    const height = primaryVolume.height;

    return createSliceWithSampler(width, height, layers, (layer) => sliceSamplers.get(layer.key) ?? null);
  }, [layers, primaryVolume, sliceSamplers]);

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
        const offsetX = layer.offsetX ?? 0;
        const offsetY = layer.offsetY ?? 0;
        const sampleX = sliceX - offsetX;
        const sampleY = sliceY - offsetY;

        const channelLabel = layer.channelName?.trim() || layer.label?.trim() || null;
        const channelColor = layer.color ?? '#ffffff';

        if (layer.isSegmentation && volume.segmentationLabels) {
          const slice = clamp(clampedSliceIndex, 0, Math.max(0, volume.depth - 1));
          const labelValue = sampleSegmentationLabel2d(volume, sampleX, sampleY, slice);
          if (labelValue !== null) {
            samples.push({ values: [labelValue], type: volume.dataType, label: channelLabel, color: channelColor });
          }
          continue;
        }

        const sampler = sliceSamplers.get(layer.key);
        const sampledValues = sampler?.(sliceX, sliceY);
        if (!sampledValues) {
          continue;
        }

        const channelValues: number[] = [];
        for (let channelIndex = 0; channelIndex < sampledValues.length; channelIndex++) {
          channelValues.push(denormalizeValue(sampledValues[channelIndex] ?? 0, volume));
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
        formatChannelValuesDetailed(sample.values, sample.type, sample.label, includeLabel).map(
          (entry: FormattedChannelValue) => ({
            text: entry.text,
            color: sample.color,
          }),
        ),
      );

      if (parts.length === 0) {
        return null;
      }

      return {
        intensity: parts.map((entry) => entry.text).join(' · '),
        components: parts.map((entry) => ({ text: entry.text, color: entry.color })),
      };
    },
    [clampedSliceIndex, layers, sliceData, sliceSamplers]
  );

  return {
    sliceData,
    xzSliceData,
    zySliceData,
    samplePixelValue,
    isStreaming,
  };
}
