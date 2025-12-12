import * as THREE from 'three';

import type { NormalizedVolume } from '../../../../core/volumeProcessing';
import type { ZarrVolumeSource } from '../../../../data/ZarrVolumeSource';
import type { VolumeTypedArray } from '../../../../types/volume';

const DEFAULT_CLIP_SIZE = 128;
const MAX_CLIP_LEVELS = 6;
const FALLBACK_CHUNK = 32;

type ClipLevel = {
  scale: number;
  origin: THREE.Vector3;
  texture: THREE.Data3DTexture;
  buffer: Uint8Array;
  needsUpload: boolean;
  requestId: number;
  abortController?: AbortController;
};

type StreamingMetadata = {
  source: ZarrVolumeSource;
  baseShape: [number, number, number, number];
};

type ClipmapVolume = NormalizedVolume & {
  streamingSource?: ZarrVolumeSource;
  streamingBaseShape?: [number, number, number, number];
};

function createTexture(size: number, channels: number): THREE.Data3DTexture {
  const data = new Uint8Array(size * size * size * channels);
  const texture = new THREE.Data3DTexture(data, size, size, size);
  texture.format = channels === 1 ? THREE.RedFormat : channels === 2 ? THREE.RGFormat : THREE.RGBAFormat;
  texture.type = THREE.UnsignedByteType;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.unpackAlignment = 1;
  texture.colorSpace = THREE.LinearSRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function readVoxel(
  volume: NormalizedVolume,
  x: number,
  y: number,
  z: number,
  channel: number
): number {
  const { width, height, depth, channels, normalized } = volume;
  const clampedX = Math.min(Math.max(0, x), width - 1);
  const clampedY = Math.min(Math.max(0, y), height - 1);
  const clampedZ = Math.min(Math.max(0, z), depth - 1);
  const index = (((clampedZ * height + clampedY) * width + clampedX) * channels + channel) | 0;
  return normalized[index];
}

function determineLevelScales(volume: NormalizedVolume, clipSize: number): number[] {
  const maxDimension = Math.max(volume.width, volume.height, volume.depth);
  const scales: number[] = [1];
  while (scales.length < MAX_CLIP_LEVELS && scales[scales.length - 1] * clipSize < maxDimension) {
    scales.push(scales[scales.length - 1] * 2);
  }
  return scales;
}

function alignToChunk(value: number, step: number, limit: number): number {
  const aligned = Math.floor(value / step) * step;
  if (!Number.isFinite(limit) || limit <= 0) {
    return aligned;
  }
  return Math.min(Math.max(0, aligned), Math.max(0, limit));
}

export class VolumeClipmapManager {
  readonly levels: ClipLevel[];
  readonly clipSize: number;
  private readonly volume: ClipmapVolume;
  private readonly chunkShape: [number, number, number];
  private readonly streaming?: StreamingMetadata;
  private minLevelOverride = 0;

  constructor(volume: ClipmapVolume, clipSize = DEFAULT_CLIP_SIZE) {
    this.volume = volume;
    this.clipSize = clipSize;
    const streamingSource = volume.streamingSource ?? null;
    const streamingBaseShape = volume.streamingBaseShape ?? null;

    if (streamingSource && !streamingBaseShape) {
      console.warn('Streaming clipmap requested without a base shape; falling back to CPU clipmap.');
    }

    if (streamingSource && streamingBaseShape) {
      this.streaming = {
        source: streamingSource,
        baseShape: streamingBaseShape,
      };
      const rootChunk = streamingSource.getMip(streamingSource.getMipLevels()[0]).chunkShape;
      this.chunkShape = [rootChunk[3], rootChunk[2], rootChunk[1]];
    } else {
      this.chunkShape = volume.chunkShape ?? [FALLBACK_CHUNK, FALLBACK_CHUNK, FALLBACK_CHUNK];
    }
    const scales = determineLevelScales(volume, clipSize);

    this.levels = scales.map((scale) => {
      const buffer = new Uint8Array(clipSize * clipSize * clipSize * volume.channels);
      return {
        scale,
        // Force an initial populate on the first update so clipmap textures are not empty.
        origin: new THREE.Vector3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY),
        texture: createTexture(clipSize, volume.channels),
        buffer,
        needsUpload: true,
        requestId: 0,
      } satisfies ClipLevel;
    });
  }

  setInteractionLod(dropFine: boolean) {
    this.minLevelOverride = dropFine ? 1 : 0;
  }

  getActiveLevelCount(): number {
    return this.levels.length;
  }

  getScale(level: number): number {
    return this.levels[Math.min(Math.max(0, level), this.levels.length - 1)].scale;
  }

  async update(target: THREE.Vector3, options?: { signal?: AbortSignal; priorityCenter?: THREE.Vector3 }): Promise<void> {
    const { width, height, depth } = this.volume;
    const pending: Array<Promise<void>> = [];
    this.levels.forEach((level, index) => {
      const extent = this.clipSize * level.scale;
      const halfExtent = extent * 0.5;
      const desired = new THREE.Vector3(
        target.x - halfExtent,
        target.y - halfExtent,
        target.z - halfExtent,
      );
      const limit = new THREE.Vector3(
        width - extent,
        height - extent,
        depth - extent,
      );
      const alignStep = this.chunkShape.map((value) => value * level.scale) as [number, number, number];
      const aligned = new THREE.Vector3(
        alignToChunk(desired.x, alignStep[0], limit.x),
        alignToChunk(desired.y, alignStep[1], limit.y),
        alignToChunk(desired.z, alignStep[2], limit.z),
      );

      if (!aligned.equals(level.origin)) {
        level.origin.copy(aligned);
        pending.push(this.populateLevel(level, options));
      }

      if (
        index === this.levels.length - 1 &&
        !level.needsUpload &&
        level.texture.image.data !== level.buffer
      ) {
        level.needsUpload = true;
      }
    });

    if (pending.length > 0) {
      try {
        await Promise.all(pending);
      } catch (error) {
        if ((error as Error)?.name !== 'AbortError') {
          console.error('Failed to populate clipmap level', error);
        }
      }
    }
    this.uploadPending();
  }

  private async populateLevel(level: ClipLevel, options?: { signal?: AbortSignal; priorityCenter?: THREE.Vector3 }): Promise<void> {
    if (this.streaming) {
      return this.populateFromStreaming(level, options);
    }
    const { width, height, depth, channels } = this.volume;
    const { origin, scale } = level;
    const baseX = Math.floor(origin.x);
    const baseY = Math.floor(origin.y);
    const baseZ = Math.floor(origin.z);
    const stride = this.clipSize;
    const buffer = level.buffer;

    for (let z = 0; z < stride; z += 1) {
      const sourceZ = baseZ + z * scale;
      for (let y = 0; y < stride; y += 1) {
        const sourceY = baseY + y * scale;
        for (let x = 0; x < stride; x += 1) {
          const sourceX = baseX + x * scale;
          const destIndex = ((z * stride + y) * stride + x) * channels;
          if (
            sourceX < 0 ||
            sourceY < 0 ||
            sourceZ < 0 ||
            sourceX >= width ||
            sourceY >= height ||
            sourceZ >= depth
          ) {
            for (let c = 0; c < channels; c += 1) {
              buffer[destIndex + c] = 0;
            }
            continue;
          }
          for (let c = 0; c < channels; c += 1) {
            buffer[destIndex + c] = readVoxel(this.volume, sourceX, sourceY, sourceZ, c);
          }
        }
      }
    }

    level.needsUpload = true;
  }

  private computeMipScale(levelScale: number) {
    if (!this.streaming) {
      return { level: 0, scale: { scaleX: levelScale, scaleY: levelScale, scaleZ: levelScale } };
    }
    const mipLevels = this.streaming.source.getMipLevels();
    const baseShape = this.streaming.baseShape;

    const computeLevelScale = (shape: [number, number, number, number]) => {
      return {
        scaleX: Math.max(1, Math.round(baseShape[3] / shape[3])),
        scaleY: Math.max(1, Math.round(baseShape[2] / shape[2])),
        scaleZ: Math.max(1, Math.round(baseShape[1] / shape[1])),
      };
    };

    let best = { level: mipLevels[0], scale: computeLevelScale(this.streaming.source.getMip(mipLevels[0]).shape) };
    let bestError = Number.POSITIVE_INFINITY;

    for (const mip of mipLevels) {
      const scale = computeLevelScale(this.streaming.source.getMip(mip).shape);
      const mipScale = Math.max(scale.scaleX, Math.max(scale.scaleY, scale.scaleZ));
      const error = Math.abs(mipScale - levelScale);
      if (error < bestError) {
        best = { level: mip, scale };
        bestError = error;
      }
    }

    return best;
  }

  private async populateFromStreaming(
    level: ClipLevel,
    options?: { signal?: AbortSignal; priorityCenter?: THREE.Vector3 }
  ): Promise<void> {
    const streaming = this.streaming;
    if (!streaming) {
      return;
    }

    const requestId = level.requestId + 1;
    level.requestId = requestId;
    level.abortController?.abort();
    const controller = new AbortController();
    level.abortController = controller;
    if (options?.signal) {
      options.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    const { source } = streaming;
    const mip = this.computeMipScale(level.scale);
    const mipInfo = source.getMip(mip.level);
    const [channelShape, zShape, yShape, xShape] = mipInfo.shape;
    const scaleX = mip.scale.scaleX;
    const scaleY = mip.scale.scaleY;
    const scaleZ = mip.scale.scaleZ;

    const startX = Math.max(0, Math.floor(level.origin.x / scaleX));
    const startY = Math.max(0, Math.floor(level.origin.y / scaleY));
    const startZ = Math.max(0, Math.floor(level.origin.z / scaleZ));
    const endX = Math.min(xShape, Math.ceil((level.origin.x + this.clipSize * level.scale) / scaleX));
    const endY = Math.min(yShape, Math.ceil((level.origin.y + this.clipSize * level.scale) / scaleY));
    const endZ = Math.min(zShape, Math.ceil((level.origin.z + this.clipSize * level.scale) / scaleZ));

    const shapeX = Math.max(0, endX - startX);
    const shapeY = Math.max(0, endY - startY);
    const shapeZ = Math.max(0, endZ - startZ);
    const channels = Math.min(Math.max(1, this.volume.channels), channelShape);

    const priorityChunks: [number, number, number, number] | undefined = options?.priorityCenter
      ? [
          0,
          Math.floor(options.priorityCenter.z / mipInfo.chunkShape[1]),
          Math.floor(options.priorityCenter.y / mipInfo.chunkShape[2]),
          Math.floor(options.priorityCenter.x / mipInfo.chunkShape[3]),
        ]
      : undefined;

    try {
      const region = await source.readRegion({
        mipLevel: mip.level,
        offset: [0, startZ, startY, startX],
        shape: [channels, shapeZ, shapeY, shapeX],
        signal: controller.signal,
        priorityCenter: priorityChunks,
      });
      if (controller.signal.aborted || requestId !== level.requestId) {
        return;
      }
      this.copyRegionIntoLevel({
        level,
        region,
        offset: { x: startX, y: startY, z: startZ },
        scale: { x: scaleX, y: scaleY, z: scaleZ },
        shape: { x: shapeX, y: shapeY, z: shapeZ, c: channels },
      });
    } catch (error) {
      if ((error as Error)?.name !== 'AbortError') {
        console.error('Failed to stream clipmap region', error);
      }
    }
  }

  private copyRegionIntoLevel(params: {
    level: ClipLevel;
    region: VolumeTypedArray;
    offset: { x: number; y: number; z: number };
    scale: { x: number; y: number; z: number };
    shape: { x: number; y: number; z: number; c: number };
  }) {
    const { level, region, offset, scale, shape } = params;
    const channels = Math.max(1, this.volume.channels);
    const stride = this.clipSize;

    const strides = this.computeStrides([shape.c, shape.z, shape.y, shape.x]);
    level.buffer.fill(0);

    for (let z = 0; z < stride; z += 1) {
      const sampleZ = Math.floor((level.origin.z + z * level.scale) / scale.z) - offset.z;
      if (sampleZ < 0 || sampleZ >= shape.z) {
        continue;
      }
      for (let y = 0; y < stride; y += 1) {
        const sampleY = Math.floor((level.origin.y + y * level.scale) / scale.y) - offset.y;
        if (sampleY < 0 || sampleY >= shape.y) {
          continue;
        }
        for (let x = 0; x < stride; x += 1) {
          const sampleX = Math.floor((level.origin.x + x * level.scale) / scale.x) - offset.x;
          const destIndex = ((z * stride + y) * stride + x) * channels;
          if (sampleX < 0 || sampleX >= shape.x) {
            for (let c = 0; c < channels; c += 1) {
              level.buffer[destIndex + c] = 0;
            }
            continue;
          }
          for (let c = 0; c < channels; c += 1) {
            const clampedC = Math.min(c, shape.c - 1);
            const sourceIndex =
              clampedC * strides[0] + sampleZ * strides[1] + sampleY * strides[2] + sampleX * strides[3];
            level.buffer[destIndex + c] = region[sourceIndex] ?? 0;
          }
        }
      }
    }

    level.needsUpload = true;
  }

  private computeStrides(shape: readonly number[]): number[] {
    const strides = new Array(shape.length).fill(1);
    for (let i = shape.length - 2; i >= 0; i -= 1) {
      strides[i] = strides[i + 1] * shape[i + 1];
    }
    return strides;
  }

  uploadPending(): void {
    this.levels.forEach((level) => {
      if (!level.needsUpload) {
        return;
      }
      level.texture.image.data = level.buffer;
      level.texture.needsUpdate = true;
      level.needsUpload = false;
    });
  }

  applyToMaterial(material: THREE.ShaderMaterial): void {
    const uniforms = material.uniforms;
    const maxLevels = Math.min(this.levels.length, MAX_CLIP_LEVELS);
    const textureArray = uniforms.u_clipmapTextures?.value as (THREE.Data3DTexture | null)[];
    const originArray = uniforms.u_clipmapOrigins?.value as THREE.Vector3[];
    const scaleArray = uniforms.u_clipmapScales?.value as number[];
    if (textureArray && originArray && scaleArray) {
      for (let i = 0; i < MAX_CLIP_LEVELS; i += 1) {
        if (i < maxLevels) {
          const level = this.levels[i];
          textureArray[i] = level.texture;
          originArray[i] = level.origin;
          scaleArray[i] = level.scale;
        } else {
          textureArray[i] = this.levels[this.levels.length - 1]?.texture ?? null;
          originArray[i] = this.levels[this.levels.length - 1]?.origin ?? new THREE.Vector3();
          scaleArray[i] = this.levels[this.levels.length - 1]?.scale ?? 1;
        }
      }
      uniforms.u_clipmapTextures.value = textureArray;
      uniforms.u_clipmapOrigins.value = originArray;
      uniforms.u_clipmapScales.value = scaleArray;
    }
    if (uniforms.u_clipmapLevelCount) {
      uniforms.u_clipmapLevelCount.value = maxLevels;
    }
    if (uniforms.u_clipmapSize) {
      uniforms.u_clipmapSize.value = this.clipSize;
    }
    if (uniforms.u_minClipLevel) {
      uniforms.u_minClipLevel.value = this.minLevelOverride;
    }
    if (uniforms.u_useClipmap) {
      uniforms.u_useClipmap.value = 1;
    }
  }

  dispose(): void {
    this.levels.forEach((level) => {
      level.abortController?.abort();
      level.texture.dispose();
    });
  }
}
