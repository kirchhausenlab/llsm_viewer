import {
  attachStreamingContexts,
  buildStreamingContexts,
  openExternalZarrStore,
  type ImportPreprocessedDatasetResult,
} from '../../shared/utils/preprocessedDataset';

type InvalidVolumeReference = { layerKey: string; volumeIndex: number };

function findInvalidStreamingVolumes(result: ImportPreprocessedDatasetResult): InvalidVolumeReference[] {
  const invalidVolumes: InvalidVolumeReference[] = [];

  for (const layer of result.layers) {
    layer.volumes.forEach((volume, volumeIndex) => {
      if (typeof volume.streamingSource?.getMipLevels !== 'function') {
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
