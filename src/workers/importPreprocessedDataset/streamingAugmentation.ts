import {
  attachStreamingContexts,
  buildStreamingContexts,
  openExternalZarrStore,
  type ImportPreprocessedDatasetResult,
} from '../../shared/utils/preprocessedDataset';

export function hasValidStreamingSources(result: ImportPreprocessedDatasetResult): boolean {
  return result.layers.some((layer) =>
    layer.volumes.some((volume) => typeof volume.streamingSource?.getMipLevels === 'function')
  );
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

  if (hasValidStreamingSources(result)) {
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
    const layers = await attachContexts(result.manifest, result.layers, contexts);
    return { ...result, layers };
  } catch (error) {
    console.warn('Failed to rebuild streaming sources for preprocessed import', error);
    return result;
  }
}

export const __TEST_ONLY__ = { augmentStreamingSources, hasValidStreamingSources };
