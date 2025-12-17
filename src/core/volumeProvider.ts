import type { NormalizedVolume } from './volumeProcessing';
import type { PreprocessedLayerManifestEntry, PreprocessedManifest } from '../shared/utils/preprocessedDataset/types';
import type { PreprocessedStorage } from '../shared/storage/preprocessedStorage';
import { ensureArrayBuffer } from '../shared/utils/buffer';

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
  layer: PreprocessedLayerManifestEntry;
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

function createZarrChunkKey(timepoint: number, rank: number): string {
  const coords = [timepoint, ...Array.from({ length: Math.max(0, rank - 1) }, () => 0)];
  return `c/${coords.join('/')}`;
}

export function createVolumeProvider({
  manifest,
  storage,
  maxCachedVolumes = 12,
  verifyDigestsOnRead = false
}: VolumeProviderOptions): VolumeProvider {
  const layerIndex = new Map<string, LayerIndexEntry>();
  let warnedDigestVerification = false;

  for (const channel of manifest.dataset.channels) {
    for (const layer of channel.layers) {
      if (layerIndex.has(layer.key)) {
        throw new Error(`Duplicate layer key detected in manifest: ${layer.key}`);
      }
      layerIndex.set(layer.key, {
        layerKey: layer.key,
        channelId: layer.channelId,
        isSegmentation: layer.isSegmentation,
        layer
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

  const loadVolume = async (
    layer: LayerIndexEntry,
    timepoint: number
  ): Promise<NormalizedVolume> => {
    if (timepoint >= layer.layer.volumeCount) {
      throw new Error(`Timepoint ${timepoint} is out of bounds for layer ${layer.layerKey}.`);
    }

    const dataDescriptor = layer.layer.zarr.data;
    const dataChunkPath = `${dataDescriptor.path}/${createZarrChunkKey(timepoint, dataDescriptor.shape.length)}`;
    const volumeBytes = await storage.readFile(dataChunkPath);

    const expectedByteLength =
      layer.layer.width * layer.layer.height * layer.layer.depth * layer.layer.channels;
    if (volumeBytes.byteLength !== expectedByteLength) {
      throw new Error(
        `Volume byte length mismatch for ${dataChunkPath} (expected ${expectedByteLength}, got ${volumeBytes.byteLength}).`
      );
    }

    let segmentationLabels: Uint32Array | undefined;
    if (layer.layer.zarr.labels) {
      const labelsDescriptor = layer.layer.zarr.labels;
      const labelChunkPath = `${labelsDescriptor.path}/${createZarrChunkKey(timepoint, labelsDescriptor.shape.length)}`;
      const labelBytes = await storage.readFile(labelChunkPath);
      const expectedLabelBytes = layer.layer.width * layer.layer.height * layer.layer.depth * 4;
      if (labelBytes.byteLength !== expectedLabelBytes) {
        throw new Error(
          `Segmentation label byte length mismatch for ${labelChunkPath} (expected ${expectedLabelBytes}, got ${labelBytes.byteLength}).`
        );
      }
      const labelBuffer = ensureArrayBuffer(labelBytes);
      segmentationLabels = new Uint32Array(labelBuffer);
    }

    const normalized = volumeBytes.byteOffset === 0 && volumeBytes.byteLength === volumeBytes.buffer.byteLength
      ? volumeBytes
      : volumeBytes.slice();

    return {
      width: layer.layer.width,
      height: layer.layer.height,
      depth: layer.layer.depth,
      channels: layer.layer.channels,
      dataType: layer.layer.dataType,
      normalized,
      min: layer.layer.normalization?.min ?? 0,
      max: layer.layer.normalization?.max ?? 255,
      ...(segmentationLabels ? { segmentationLabels, segmentationLabelDataType: 'uint32' } : {})
    };
  };

  const getVolume = async (layerKey: string, timepoint: number): Promise<NormalizedVolume> => {
    if (!isValidTimepoint(timepoint)) {
      throw new Error(`Invalid timepoint: ${timepoint}`);
    }
    if (verifyDigestsOnRead) {
      if (!warnedDigestVerification) {
        warnedDigestVerification = true;
        console.warn('Digest verification is not supported for Zarr-backed datasets; ignoring verifyDigestsOnRead=true.');
      }
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
