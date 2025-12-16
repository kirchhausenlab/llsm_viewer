import type { NormalizedVolume } from './volumeProcessing';
import type { PreprocessedManifest, PreprocessedVolumeManifestEntry } from '../shared/utils/preprocessedDataset/types';
import type { PreprocessedStorage } from '../shared/storage/preprocessedStorage';
import { ensureArrayBuffer } from '../shared/utils/buffer';
import { computeSha256Hex } from '../shared/utils/preprocessedDataset/hash';

export type VolumeProviderOptions = {
  manifest: PreprocessedManifest;
  storage: PreprocessedStorage;
  maxCachedVolumes?: number;
  verifyDigestsOnRead?: boolean;
};

export type VolumeProvider = {
  getVolume(layerKey: string, timepoint: number): Promise<NormalizedVolume>;
  prefetch(layerKeys: string[], timepoint: number): Promise<void>;
  hasVolume(layerKey: string, timepoint: number): boolean;
  clear(): void;
};

type LayerIndexEntry = {
  layerKey: string;
  channelId: string;
  isSegmentation: boolean;
  volumes: PreprocessedVolumeManifestEntry[];
};

type CachedVolumeEntry = {
  key: string;
  layerKey: string;
  timepoint: number;
  volume: NormalizedVolume | null;
  inFlight: Promise<NormalizedVolume> | null;
  verified: boolean;
};

function createCacheKey(layerKey: string, timepoint: number): string {
  return `${layerKey}:${timepoint}`;
}

function isValidTimepoint(timepoint: number): boolean {
  return Number.isFinite(timepoint) && Math.floor(timepoint) === timepoint && timepoint >= 0;
}

export function createVolumeProvider({
  manifest,
  storage,
  maxCachedVolumes = 12,
  verifyDigestsOnRead = false
}: VolumeProviderOptions): VolumeProvider {
  const layerIndex = new Map<string, LayerIndexEntry>();

  for (const channel of manifest.dataset.channels) {
    for (const layer of channel.layers) {
      if (layerIndex.has(layer.key)) {
        throw new Error(`Duplicate layer key detected in manifest: ${layer.key}`);
      }
      layerIndex.set(layer.key, {
        layerKey: layer.key,
        channelId: layer.channelId,
        isSegmentation: layer.isSegmentation,
        volumes: layer.volumes
      });
    }
  }

  const cache = new Map<string, CachedVolumeEntry>();

  const touch = (key: string, entry: CachedVolumeEntry) => {
    cache.delete(key);
    cache.set(key, entry);
  };

  const evictIfNeeded = () => {
    if (maxCachedVolumes <= 0) {
      cache.clear();
      return;
    }

    while (cache.size > maxCachedVolumes) {
      const oldestKey = cache.keys().next().value as string | undefined;
      if (!oldestKey) {
        return;
      }
      const oldest = cache.get(oldestKey);
      if (!oldest) {
        cache.delete(oldestKey);
        continue;
      }
      if (oldest.inFlight) {
        let removed = false;
        for (const [candidateKey, candidate] of cache) {
          if (!candidate.inFlight) {
            cache.delete(candidateKey);
            removed = true;
            break;
          }
        }
        if (!removed) {
          return;
        }
      } else {
        cache.delete(oldestKey);
      }
    }
  };

  const verifyEntry = async (
    entry: PreprocessedVolumeManifestEntry,
    bytes: Uint8Array
  ): Promise<void> => {
    if (!verifyDigestsOnRead) {
      return;
    }
    const digest = await computeSha256Hex(bytes);
    if (digest !== entry.digest) {
      throw new Error(`Digest mismatch for ${entry.path}.`);
    }
  };

  const loadVolume = async (
    layer: LayerIndexEntry,
    timepoint: number
  ): Promise<NormalizedVolume> => {
    const volumeEntry = layer.volumes[timepoint];
    if (!volumeEntry) {
      throw new Error(`Timepoint ${timepoint} is out of bounds for layer ${layer.layerKey}.`);
    }

    const volumeBytes = await storage.readFile(volumeEntry.path);
    if (volumeBytes.byteLength !== volumeEntry.byteLength) {
      throw new Error(
        `Volume byte length mismatch for ${volumeEntry.path} (expected ${volumeEntry.byteLength}, got ${volumeBytes.byteLength}).`
      );
    }

    await verifyEntry(volumeEntry, volumeBytes);

    let segmentationLabels: Uint32Array | undefined;
    if (volumeEntry.segmentationLabels) {
      const labelBytes = await storage.readFile(volumeEntry.segmentationLabels.path);
      if (labelBytes.byteLength !== volumeEntry.segmentationLabels.byteLength) {
        throw new Error(
          `Segmentation label byte length mismatch for ${volumeEntry.segmentationLabels.path} (expected ${volumeEntry.segmentationLabels.byteLength}, got ${labelBytes.byteLength}).`
        );
      }
      if (verifyDigestsOnRead) {
        const labelDigest = await computeSha256Hex(labelBytes);
        if (labelDigest !== volumeEntry.segmentationLabels.digest) {
          throw new Error(`Digest mismatch for ${volumeEntry.segmentationLabels.path}.`);
        }
      }
      const labelBuffer = ensureArrayBuffer(labelBytes);
      segmentationLabels = new Uint32Array(labelBuffer);
    }

    const normalized = volumeBytes.byteOffset === 0 && volumeBytes.byteLength === volumeBytes.buffer.byteLength
      ? volumeBytes
      : volumeBytes.slice();

    return {
      width: volumeEntry.width,
      height: volumeEntry.height,
      depth: volumeEntry.depth,
      channels: volumeEntry.channels,
      dataType: volumeEntry.dataType,
      normalized,
      min: volumeEntry.min,
      max: volumeEntry.max,
      ...(segmentationLabels ? { segmentationLabels, segmentationLabelDataType: 'uint32' } : {})
    };
  };

  const getVolume = async (layerKey: string, timepoint: number): Promise<NormalizedVolume> => {
    if (!isValidTimepoint(timepoint)) {
      throw new Error(`Invalid timepoint: ${timepoint}`);
    }
    const layer = layerIndex.get(layerKey);
    if (!layer) {
      throw new Error(`Unknown layer key: ${layerKey}`);
    }

    const key = createCacheKey(layerKey, timepoint);
    const existing = cache.get(key);
    if (existing) {
      touch(key, existing);
      if (existing.volume) {
        return existing.volume;
      }
      if (existing.inFlight) {
        return existing.inFlight;
      }
    }

    const entry: CachedVolumeEntry = {
      key,
      layerKey,
      timepoint,
      volume: null,
      inFlight: null,
      verified: false
    };

    const promise = loadVolume(layer, timepoint)
      .then((volume) => {
        entry.volume = volume;
        entry.inFlight = null;
        entry.verified = verifyDigestsOnRead;
        touch(key, entry);
        evictIfNeeded();
        return volume;
      })
      .catch((error) => {
        cache.delete(key);
        throw error;
      });

    entry.inFlight = promise;
    cache.set(key, entry);
    evictIfNeeded();
    return promise;
  };

  const prefetch = async (layerKeys: string[], timepoint: number): Promise<void> => {
    const uniqueKeys = Array.from(new Set(layerKeys.filter(Boolean)));
    await Promise.all(uniqueKeys.map((layerKey) => getVolume(layerKey, timepoint)));
  };

  const hasVolume = (layerKey: string, timepoint: number): boolean => {
    const key = createCacheKey(layerKey, timepoint);
    const entry = cache.get(key);
    return Boolean(entry?.volume);
  };

  const clear = () => {
    cache.clear();
  };

  return { getVolume, prefetch, hasVolume, clear };
}

