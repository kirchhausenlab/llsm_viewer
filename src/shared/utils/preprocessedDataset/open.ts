import type { PreprocessedStorage } from '../../storage/preprocessedStorage';
import type { OpenPreprocessedDatasetResult, PreprocessedManifest } from './types';
import { buildChannelSummariesFromManifest } from './manifest';
import { parseTrackEntriesFromCsvBytes } from './tracks';

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
  if (candidate.version !== 2 && candidate.version !== 3) {
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
  const trackEntriesByChannelId = new Map<string, string[][]>();

  if (manifest.version === 3) {
    for (const channel of manifest.dataset.channels) {
      const descriptor = channel.tracks;
      if (!descriptor) {
        trackEntriesByChannelId.set(channel.id, []);
        continue;
      }
      const trackBytes = await storage.readFile(descriptor.path);
      const entries = parseTrackEntriesFromCsvBytes(trackBytes);
      trackEntriesByChannelId.set(channel.id, entries);
    }
  }

  const channelSummaries = buildChannelSummariesFromManifest(manifest, trackEntriesByChannelId);
  return { manifest, channelSummaries, totalVolumeCount: manifest.dataset.totalVolumeCount };
}
