import type { PreprocessedStorage } from '../../storage/preprocessedStorage';
import { type OpenPreprocessedDatasetResult } from './types';
import { buildChannelSummariesFromManifest, buildTrackSummariesFromManifest } from './manifest';
import {
  parseCompiledTrackSetCatalogFromBytes,
  decodeCompiledTrackSetPayloadFromBytes,
} from './tracks';
import { coercePreprocessedManifest } from './schema';
import type { CompiledTrackSetHeader, CompiledTrackSetPayload, CompiledTrackSummary } from '../../../types/tracks';
import type { PreprocessedTracksDescriptor } from './types';

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
  const channelSummaries = buildChannelSummariesFromManifest(manifest);
  const trackSummaries = buildTrackSummariesFromManifest(manifest);
  return { manifest, channelSummaries, trackSummaries, totalVolumeCount: manifest.dataset.totalVolumeCount };
}

export async function loadCompiledTrackSetCatalogFromStorage(
  storage: PreprocessedStorage,
  tracks: PreprocessedTracksDescriptor,
  header: CompiledTrackSetHeader,
  options?: {
    trackSetName?: string;
    channelId?: string | null;
    channelName?: string | null;
  }
): Promise<CompiledTrackSummary[]> {
  const catalogBytes = await storage.readFile(tracks.catalog.path);
  return parseCompiledTrackSetCatalogFromBytes(catalogBytes, header, options);
}

export async function loadCompiledTrackSetPayloadFromStorage(
  storage: PreprocessedStorage,
  tracks: PreprocessedTracksDescriptor,
  header: CompiledTrackSetHeader
): Promise<CompiledTrackSetPayload> {
  const [pointBytes, segmentPositionBytes, segmentTimeBytes, segmentTrackIndexBytes, centroidBytes] =
    await Promise.all([
      storage.readFile(tracks.pointData.path),
      storage.readFile(tracks.segmentPositions.path),
      storage.readFile(tracks.segmentTimes.path),
      storage.readFile(tracks.segmentTrackIndices.path),
      storage.readFile(tracks.centroidData.path)
    ]);

  return decodeCompiledTrackSetPayloadFromBytes(header, {
    pointBytes,
    segmentPositionBytes,
    segmentTimeBytes,
    segmentTrackIndexBytes,
    centroidBytes
  });
}
