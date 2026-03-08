import type { PreprocessedStorage } from '../../storage/preprocessedStorage';
import { type OpenPreprocessedDatasetResult } from './types';
import { buildChannelSummariesFromManifest, buildTrackSummariesFromManifest } from './manifest';
import {
  decodeCompiledTrackSetPayloadFromBytes,
  parseCompiledTrackSetSummaryFromBytes
} from './tracks';
import { coercePreprocessedManifest } from './schema';
import type { CompiledTrackSetPayload, CompiledTrackSetSummary } from '../../../types/tracks';
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
  const trackSummariesByTrackSetId = new Map<string, CompiledTrackSetSummary>();

  for (const trackSet of manifest.dataset.trackSets) {
    const summaryBytes = await storage.readFile(trackSet.tracks.summary.path);
    const summary = parseCompiledTrackSetSummaryFromBytes(summaryBytes);
    trackSummariesByTrackSetId.set(trackSet.id, summary);
  }

  const channelSummaries = buildChannelSummariesFromManifest(manifest);
  const trackSummaries = buildTrackSummariesFromManifest(manifest, trackSummariesByTrackSetId);
  return { manifest, channelSummaries, trackSummaries, totalVolumeCount: manifest.dataset.totalVolumeCount };
}

export async function loadCompiledTrackSetPayloadFromStorage(
  storage: PreprocessedStorage,
  tracks: PreprocessedTracksDescriptor,
  summary: CompiledTrackSetSummary
): Promise<CompiledTrackSetPayload> {
  const [pointBytes, segmentPositionBytes, segmentTimeBytes, segmentTrackIndexBytes, centroidBytes] =
    await Promise.all([
      storage.readFile(tracks.pointData.path),
      storage.readFile(tracks.segmentPositions.path),
      storage.readFile(tracks.segmentTimes.path),
      storage.readFile(tracks.segmentTrackIndices.path),
      storage.readFile(tracks.centroidData.path)
    ]);

  return decodeCompiledTrackSetPayloadFromBytes(summary, {
    pointBytes,
    segmentPositionBytes,
    segmentTimeBytes,
    segmentTrackIndexBytes,
    centroidBytes
  });
}
