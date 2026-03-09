/// <reference lib="webworker" />
import {
  canonicalizeSegmentationVolume,
  computeNormalizationParameters,
  normalizeVolume
} from '../core/volumeProcessing';
import type { VolumePayload } from '../types/volume';
import type {
  BuildPreprocessScalePyramidMessage,
  PreprocessScalePyramidReadyMessage,
  PreprocessScalePyramidWorkerInboundMessage
} from './preprocessScalePyramidMessages';

const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = async (event: MessageEvent<PreprocessScalePyramidWorkerInboundMessage>) => {
  const message = event.data;
  if (!message) {
    return;
  }
  if (message.type !== 'build-preprocess-scale-pyramid') {
    return;
  }

  try {
    const ready = buildScalePyramid(message);
    const transferList: ArrayBuffer[] = [];
    for (const scale of ready.scales) {
      transferList.push(scale.data);
    }
    ctx.postMessage(ready, transferList);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to build preprocess scale pyramid.';
    ctx.postMessage({
      type: 'error',
      requestId: message.requestId,
      message: errorMessage
    });
  }
};

function buildScalePyramid(
  message: BuildPreprocessScalePyramidMessage
): PreprocessScalePyramidReadyMessage {
  const sortedScales = [...message.scales].sort((left, right) => left.level - right.level);
  if (sortedScales.length === 0) {
    throw new Error(`Layer "${message.layerKey}" does not define any scales.`);
  }

  const rawVolume: VolumePayload = {
    ...message.rawVolume,
    data: message.rawVolume.data
  };
  const encodedScales: PreprocessScalePyramidReadyMessage['scales'] = [];
  if (message.isSegmentation) {
    const normalized = canonicalizeSegmentationVolume(rawVolume);
    let volumeForScale = {
      width: normalized.width,
      height: normalized.height,
      depth: normalized.depth,
      channels: normalized.channels,
      data: normalized.labels
    };

    for (let scaleIndex = 0; scaleIndex < sortedScales.length; scaleIndex += 1) {
      const scale = sortedScales[scaleIndex]!;
      if (
        volumeForScale.width !== scale.width ||
        volumeForScale.height !== scale.height ||
        volumeForScale.depth !== scale.depth ||
        volumeForScale.channels !== scale.channels
      ) {
        throw new Error(
          `Generated mip dimensions for layer "${message.layerKey}" scale ${scale.level} do not match manifest metadata.`
        );
      }

      encodedScales.push({
        level: scale.level,
        width: volumeForScale.width,
        height: volumeForScale.height,
        depth: volumeForScale.depth,
        channels: volumeForScale.channels,
        data: toTransferableArrayBuffer(volumeForScale.data)
      });

      if (scaleIndex < sortedScales.length - 1) {
        volumeForScale = downsampleLabelsByMode(volumeForScale);
      }
    }
  } else {
    const normalized = normalizeVolume(
      rawVolume,
      message.normalization ?? computeNormalizationParameters([rawVolume])
    );
    if (normalized.kind !== 'intensity') {
      throw new Error(`Layer "${message.layerKey}" produced a non-intensity payload in the intensity worker path.`);
    }
    let volumeForScale: {
      width: number;
      height: number;
      depth: number;
      channels: number;
      data: Uint8Array;
    } = {
      width: normalized.width,
      height: normalized.height,
      depth: normalized.depth,
      channels: normalized.channels,
      data: normalized.normalized
    };

    for (let scaleIndex = 0; scaleIndex < sortedScales.length; scaleIndex += 1) {
      const scale = sortedScales[scaleIndex]!;
      if (
        volumeForScale.width !== scale.width ||
        volumeForScale.height !== scale.height ||
        volumeForScale.depth !== scale.depth ||
        volumeForScale.channels !== scale.channels
      ) {
        throw new Error(
          `Generated mip dimensions for layer "${message.layerKey}" scale ${scale.level} do not match manifest metadata.`
        );
      }

      encodedScales.push({
        level: scale.level,
        width: volumeForScale.width,
        height: volumeForScale.height,
        depth: volumeForScale.depth,
        channels: volumeForScale.channels,
        data: toTransferableArrayBuffer(volumeForScale.data)
      });

      if (scaleIndex < sortedScales.length - 1) {
        volumeForScale = downsampleDataByMaxPooling(volumeForScale);
      }
    }
  }

  return {
    type: 'preprocess-scale-pyramid-ready',
    requestId: message.requestId,
    scales: encodedScales
  };
}

function downsampleDataByMaxPooling(volume: {
  width: number;
  height: number;
  depth: number;
  channels: number;
  data: Uint8Array;
}): {
  width: number;
  height: number;
  depth: number;
  channels: number;
  data: Uint8Array;
} {
  const nextDepth = Math.max(1, Math.ceil(volume.depth / 2));
  const nextHeight = Math.max(1, Math.ceil(volume.height / 2));
  const nextWidth = Math.max(1, Math.ceil(volume.width / 2));
  const downsampled = new Uint8Array(nextDepth * nextHeight * nextWidth * volume.channels);

  for (let z = 0; z < nextDepth; z += 1) {
    const sourceZStart = z * 2;
    const sourceZEnd = Math.min(volume.depth, sourceZStart + 2);
    for (let y = 0; y < nextHeight; y += 1) {
      const sourceYStart = y * 2;
      const sourceYEnd = Math.min(volume.height, sourceYStart + 2);
      for (let x = 0; x < nextWidth; x += 1) {
        const sourceXStart = x * 2;
        const sourceXEnd = Math.min(volume.width, sourceXStart + 2);
        const destinationBase = ((z * nextHeight + y) * nextWidth + x) * volume.channels;
        for (let channel = 0; channel < volume.channels; channel += 1) {
          let maxValue = 0;
          for (let sourceZ = sourceZStart; sourceZ < sourceZEnd; sourceZ += 1) {
            for (let sourceY = sourceYStart; sourceY < sourceYEnd; sourceY += 1) {
              for (let sourceX = sourceXStart; sourceX < sourceXEnd; sourceX += 1) {
                const sourceIndex =
                  ((sourceZ * volume.height + sourceY) * volume.width + sourceX) * volume.channels + channel;
                const value = volume.data[sourceIndex];
                if (value > maxValue) {
                  maxValue = value;
                }
              }
            }
          }
          downsampled[destinationBase + channel] = maxValue;
        }
      }
    }
  }

  return {
    width: nextWidth,
    height: nextHeight,
    depth: nextDepth,
    channels: volume.channels,
    data: downsampled
  };
}

function downsampleLabelsByMode(volume: {
  width: number;
  height: number;
  depth: number;
  channels: 1;
  data: Uint16Array;
}): {
  width: number;
  height: number;
  depth: number;
  channels: 1;
  data: Uint16Array;
} {
  const nextDepth = Math.max(1, Math.ceil(volume.depth / 2));
  const nextHeight = Math.max(1, Math.ceil(volume.height / 2));
  const nextWidth = Math.max(1, Math.ceil(volume.width / 2));
  const downsampled = new Uint16Array(nextDepth * nextHeight * nextWidth);

  for (let z = 0; z < nextDepth; z += 1) {
    const sourceZStart = z * 2;
    const sourceZEnd = Math.min(volume.depth, sourceZStart + 2);
    for (let y = 0; y < nextHeight; y += 1) {
      const sourceYStart = y * 2;
      const sourceYEnd = Math.min(volume.height, sourceYStart + 2);
      for (let x = 0; x < nextWidth; x += 1) {
        const sourceXStart = x * 2;
        const sourceXEnd = Math.min(volume.width, sourceXStart + 2);
        const destinationIndex = (z * nextHeight + y) * nextWidth + x;

        const candidateLabels = new Uint16Array(8);
        const candidateCounts = new Uint8Array(8);
        let candidateSize = 0;
        let bestLabel = 0;
        let bestCount = -1;
        for (let sourceZ = sourceZStart; sourceZ < sourceZEnd; sourceZ += 1) {
          for (let sourceY = sourceYStart; sourceY < sourceYEnd; sourceY += 1) {
            for (let sourceX = sourceXStart; sourceX < sourceXEnd; sourceX += 1) {
              const sourceIndex = (sourceZ * volume.height + sourceY) * volume.width + sourceX;
              const label = volume.data[sourceIndex] ?? 0;
              let slot = -1;
              for (let candidateIndex = 0; candidateIndex < candidateSize; candidateIndex += 1) {
                if ((candidateLabels[candidateIndex] ?? 0) === label) {
                  slot = candidateIndex;
                  break;
                }
              }
              if (slot < 0) {
                slot = candidateSize;
                candidateLabels[slot] = label;
                candidateCounts[slot] = 0;
                candidateSize += 1;
              }
              const nextCount = (candidateCounts[slot] ?? 0) + 1;
              candidateCounts[slot] = nextCount;
              if (
                nextCount > bestCount ||
                (nextCount === bestCount && bestLabel === 0 && label !== 0) ||
                (nextCount === bestCount && label > bestLabel)
              ) {
                bestCount = nextCount;
                bestLabel = label;
              }
            }
          }
        }
        downsampled[destinationIndex] = bestLabel;
      }
    }
  }

  return {
    width: nextWidth,
    height: nextHeight,
    depth: nextDepth,
    channels: 1,
    data: downsampled
  };
}

function toTransferableArrayBuffer(view: Uint8Array | Uint16Array): ArrayBuffer {
  const { buffer, byteOffset, byteLength } = view;
  if (buffer instanceof ArrayBuffer && byteOffset === 0 && byteLength === buffer.byteLength) {
    return buffer;
  }
  return new Uint8Array(buffer, byteOffset, byteLength).slice().buffer;
}

export {};
