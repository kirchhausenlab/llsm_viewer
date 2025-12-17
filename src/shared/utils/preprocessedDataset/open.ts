import type { PreprocessedStorage } from '../../storage/preprocessedStorage';
import type { OpenPreprocessedDatasetResult, PreprocessedManifest } from './types';
import { buildChannelSummariesFromManifest } from './manifest';

const textDecoder = new TextDecoder();

type ZarrGroupMetadata = {
  zarr_format: number;
  node_type: string;
  attributes?: Record<string, unknown>;
};

function parseJson(bytes: Uint8Array): unknown {
  const text = textDecoder.decode(bytes);
  return JSON.parse(text);
}

function coerceManifest(value: unknown): PreprocessedManifest {
  if (!value || typeof value !== 'object') {
    throw new Error('Missing preprocessed manifest in Zarr attributes.');
  }
  const candidate = value as Partial<PreprocessedManifest>;
  if (candidate.format !== 'llsm-viewer-preprocessed') {
    throw new Error('Unsupported preprocessed dataset format.');
  }
  if (candidate.version !== 2) {
    throw new Error(`Unsupported preprocessed dataset version: ${String(candidate.version)}`);
  }
  return candidate as PreprocessedManifest;
}

export async function openPreprocessedDatasetFromZarrStorage(storage: PreprocessedStorage): Promise<OpenPreprocessedDatasetResult> {
  const bytes = await storage.readFile('zarr.json');
  const metadataRaw = parseJson(bytes);
  if (!metadataRaw || typeof metadataRaw !== 'object') {
    throw new Error('Invalid Zarr root metadata.');
  }
  const metadata = metadataRaw as ZarrGroupMetadata;
  if (metadata.zarr_format !== 3 || metadata.node_type !== 'group') {
    throw new Error('Unsupported Zarr root node.');
  }
  const attrs = metadata.attributes ?? {};
  const manifest = coerceManifest(attrs.llsmViewerPreprocessed);
  const channelSummaries = buildChannelSummariesFromManifest(manifest);
  return { manifest, channelSummaries, totalVolumeCount: manifest.dataset.totalVolumeCount };
}

