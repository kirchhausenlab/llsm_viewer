import {
  attachStreamingContexts,
  buildStreamingContexts,
  openExternalZarrStore,
  type ImportPreprocessedDatasetResult,
} from '../../shared/utils/preprocessedDataset';

type InvalidVolumeReference = { layerKey: string; volumeIndex: number };

function normalizeToFiveDimensions(
  shape: readonly number[] | undefined,
  fallback: [number, number, number, number, number]
): [number, number, number, number, number] {
  const normalized: [number, number, number, number, number] = [...fallback];
  if (!Array.isArray(shape)) {
    return normalized;
  }

  for (let index = 0; index < 5; index += 1) {
    const value = shape[index];
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      normalized[index] = value;
    }
  }

  return normalized;
}

function findManifestVolume(
  manifest: ImportPreprocessedDatasetResult['manifest'],
  layerKey: string,
  volumeIndex: number
): ImportPreprocessedDatasetResult['manifest']['dataset']['channels'][number]['layers'][number]['volumes'][number] | null {
  for (const channel of manifest.dataset.channels) {
    for (const layer of channel.layers) {
      if (layer.key !== layerKey) {
        continue;
      }
      return layer.volumes[volumeIndex] ?? null;
    }
  }

  return null;
}

function getExpectedMipLevels(
  manifestVolume: ImportPreprocessedDatasetResult['manifest']['dataset']['channels'][number]['layers'][number]['volumes'][number]
): number[] {
  const mipEntries =
    (manifestVolume as { mips?: Array<{ level: number }> }).mips ??
    (manifestVolume as { mipLevels?: Array<{ level: number }> }).mipLevels;

  const levels = new Set<number>([0]);
  if (Array.isArray(mipEntries)) {
    for (const entry of mipEntries) {
      const level = (entry as { level?: number }).level;
      if (typeof level === 'number' && Number.isFinite(level)) {
        levels.add(level);
      }
    }
  }

  return Array.from(levels).sort((a, b) => a - b);
}

function shapesMatch(a: readonly number[] | undefined, b: readonly number[] | undefined): boolean {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
    return false;
  }

  return a.every((value, index) => value === b[index]);
}

function findInvalidStreamingVolumes(result: ImportPreprocessedDatasetResult): InvalidVolumeReference[] {
  const invalidVolumes: InvalidVolumeReference[] = [];

  for (const layer of result.layers) {
    layer.volumes.forEach((volume, volumeIndex) => {
      const manifestVolume = findManifestVolume(result.manifest, layer.key, volumeIndex);
      const { streamingSource } = volume;

      if (!manifestVolume || !streamingSource) {
        invalidVolumes.push({ layerKey: layer.key, volumeIndex });
        return;
      }

      if (
        typeof streamingSource.getMipLevels !== 'function' ||
        typeof (streamingSource as { getMip?: (level: number) => unknown }).getMip !== 'function'
      ) {
        invalidVolumes.push({ layerKey: layer.key, volumeIndex });
        return;
      }

      const mipLevels = streamingSource.getMipLevels();
      const expectedLevels = getExpectedMipLevels(manifestVolume);
      if (!Array.isArray(mipLevels) || mipLevels.length === 0) {
        invalidVolumes.push({ layerKey: layer.key, volumeIndex });
        return;
      }

      if (expectedLevels.some((level) => !mipLevels.includes(level))) {
        invalidVolumes.push({ layerKey: layer.key, volumeIndex });
        return;
      }

      const expectedBaseShape = normalizeToFiveDimensions(volume.streamingBaseShape, [
        1,
        volume.channels,
        volume.depth,
        volume.height,
        volume.width,
      ]);
      const expectedBaseChunkShape = normalizeToFiveDimensions(volume.streamingBaseChunkShape, expectedBaseShape);
      const manifestBaseShape = normalizeToFiveDimensions(
        [1, manifestVolume.channels, manifestVolume.depth, manifestVolume.height, manifestVolume.width],
        expectedBaseShape
      );

      if (!volume.streamingBaseShape || !volume.streamingBaseChunkShape) {
        invalidVolumes.push({ layerKey: layer.key, volumeIndex });
        return;
      }

      try {
        const baseMip = (streamingSource as { getMip: (level: number) => { shape?: number[]; chunkShape?: number[] } }).getMip(
          expectedLevels[0]
        );
        const baseShape = normalizeToFiveDimensions(baseMip.shape, expectedBaseShape);
        const baseChunkShape = normalizeToFiveDimensions(baseMip.chunkShape, expectedBaseShape);

        if (
          !shapesMatch(baseShape, expectedBaseShape) ||
          !shapesMatch(baseShape, manifestBaseShape) ||
          !shapesMatch(baseChunkShape, expectedBaseChunkShape)
        ) {
          invalidVolumes.push({ layerKey: layer.key, volumeIndex });
        }
      } catch (error) {
        console.warn('Streaming source validation failed', error);
        invalidVolumes.push({ layerKey: layer.key, volumeIndex });
      }
    });
  }

  return invalidVolumes;
}

function findManifestVolumePath(
  manifest: ImportPreprocessedDatasetResult['manifest'],
  layerKey: string,
  volumeIndex: number
): string | undefined {
  for (const channel of manifest.dataset.channels) {
    for (const layer of channel.layers) {
      if (layer.key !== layerKey) {
        continue;
      }
      return layer.volumes[volumeIndex]?.path;
    }
  }

  return undefined;
}

export function hasValidStreamingSources(result: ImportPreprocessedDatasetResult): boolean {
  return findInvalidStreamingVolumes(result).length === 0;
}

export async function augmentStreamingSources(
  result: ImportPreprocessedDatasetResult,
  overrides?: {
    openExternalZarrStore?: typeof openExternalZarrStore;
    buildStreamingContexts?: typeof buildStreamingContexts;
    attachStreamingContexts?: typeof attachStreamingContexts;
  }
): Promise<ImportPreprocessedDatasetResult> {
  const { zarrStore } = result.manifest.dataset;
  if (!zarrStore || zarrStore.source === 'archive') {
    return result;
  }

  const invalidVolumes = findInvalidStreamingVolumes(result);

  if (invalidVolumes.length === 0) {
    return result;
  }

  try {
    const openStore = overrides?.openExternalZarrStore ?? openExternalZarrStore;
    const buildContexts = overrides?.buildStreamingContexts ?? buildStreamingContexts;
    const attachContexts = overrides?.attachStreamingContexts ?? attachStreamingContexts;

    const store = await openStore(zarrStore);
    if (!store) {
      return result;
    }
    const contexts = await buildContexts(result.manifest, store);
    const invalidPaths = new Set(
      invalidVolumes
        .map(({ layerKey, volumeIndex }) => findManifestVolumePath(result.manifest, layerKey, volumeIndex))
        .filter((path): path is string => Boolean(path))
    );
    const contextsToAttach =
      invalidPaths.size > 0 && invalidPaths.size < contexts.size
        ? new Map([...contexts].filter(([path]) => invalidPaths.has(path)))
        : contexts;
    const layers = await attachContexts(result.manifest, result.layers, contextsToAttach);
    return { ...result, layers };
  } catch (error) {
    console.warn('Failed to rebuild streaming sources for preprocessed import', error);
    return result;
  }
}

export const __TEST_ONLY__ = { augmentStreamingSources, hasValidStreamingSources };
