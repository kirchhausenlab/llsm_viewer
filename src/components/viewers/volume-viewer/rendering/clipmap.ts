import * as THREE from 'three';

import type { NormalizedVolume } from '../../../../core/volumeProcessing';

const DEFAULT_CLIP_SIZE = 128;
const MAX_CLIP_LEVELS = 6;
const FALLBACK_CHUNK = 32;

type ClipLevel = {
  scale: number;
  origin: THREE.Vector3;
  texture: THREE.Data3DTexture;
  buffer: Uint8Array;
  needsUpload: boolean;
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
  private readonly volume: NormalizedVolume;
  private readonly chunkShape: [number, number, number];
  private minLevelOverride = 0;

  constructor(volume: NormalizedVolume, clipSize = DEFAULT_CLIP_SIZE) {
    this.volume = volume;
    this.clipSize = clipSize;
    this.chunkShape = volume.chunkShape ?? [FALLBACK_CHUNK, FALLBACK_CHUNK, FALLBACK_CHUNK];
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

  update(target: THREE.Vector3): void {
    const { width, height, depth } = this.volume;
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
        this.populateLevel(level);
      }

      if (
        index === this.levels.length - 1 &&
        !level.needsUpload &&
        level.texture.image.data !== level.buffer
      ) {
        level.needsUpload = true;
      }
    });
  }

  private populateLevel(level: ClipLevel): void {
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
      level.texture.dispose();
    });
  }
}
