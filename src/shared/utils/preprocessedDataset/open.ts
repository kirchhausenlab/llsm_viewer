import type { PreprocessedStorage } from '../../storage/preprocessedStorage';
import { type OpenPreprocessedDatasetResult } from './types';
import { buildChannelSummariesFromManifest, buildTrackSummariesFromManifest } from './manifest';
import { parseTrackEntriesFromCsvBytes } from './tracks';
import { coercePreprocessedManifest } from './schema';

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
  const manifest = coercePreprocessedManifest(attrs.llsmViewerPreprocessed);
  const trackEntriesByTrackSetId = new Map<string, string[][]>();

  for (const trackSet of manifest.dataset.trackSets) {
    const trackBytes = await storage.readFile(trackSet.tracks.path);
    const entries = parseTrackEntriesFromCsvBytes(trackBytes);
    trackEntriesByTrackSetId.set(trackSet.id, entries);
  }

  const channelSummaries = buildChannelSummariesFromManifest(manifest);
  const trackSummaries = buildTrackSummariesFromManifest(manifest, trackEntriesByTrackSetId);
  return { manifest, channelSummaries, trackSummaries, totalVolumeCount: manifest.dataset.totalVolumeCount };
}
