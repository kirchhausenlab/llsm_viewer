import type {
  CompiledTrackSet,
  CompiledTrackSetHeader,
  CompiledTrackSetPayload,
  CompiledTrackSetSummary,
  CompiledTrackSummary
} from '../../../types/tracks';
import {
  decodeCompiledTrackSetPayload,
  buildCompiledTrackSetHeader,
  encodeCompiledTrackCatalog,
  encodeCompiledTrackSetPayload,
  parseCompiledTrackCatalogBytes
} from '../compiledTracks';
import type { PreprocessedTracksDescriptor } from './types';

function createTrackArtifactBasePath(trackSetId: string): string {
  return `tracks/${encodeURIComponent(trackSetId)}`;
}

export function createTracksDescriptor(
  trackSetId: string,
  summary: CompiledTrackSetSummary
): PreprocessedTracksDescriptor {
  const basePath = createTrackArtifactBasePath(trackSetId);
  return {
    format: 'compiled-v3',
    header: buildCompiledTrackSetHeader(summary),
    catalog: {
      path: `${basePath}/catalog.bin`,
      format: 'binary',
      version: 1,
      strideBytes: 52,
      count: summary.totalTracks
    },
    pointData: {
      path: `${basePath}/points.bin`,
      format: 'float32',
      stride: 5,
      count: summary.totalPoints
    },
    segmentPositions: {
      path: `${basePath}/segment-positions.bin`,
      format: 'float32',
      stride: 6,
      count: summary.totalSegments
    },
    segmentTimes: {
      path: `${basePath}/segment-times.bin`,
      format: 'float32',
      stride: 2,
      count: summary.totalSegments
    },
    segmentTrackIndices: {
      path: `${basePath}/segment-track-indices.bin`,
      format: 'uint32',
      stride: 1,
      count: summary.totalSegments
    },
    centroidData: {
      path: `${basePath}/centroids.bin`,
      format: 'float32',
      stride: 4,
      count: summary.totalCentroids
    }
  };
}

export function encodeCompiledTrackSetFiles(compiled: CompiledTrackSet): {
  catalogBytes: Uint8Array;
  pointBytes: Uint8Array;
  segmentPositionBytes: Uint8Array;
  segmentTimeBytes: Uint8Array;
  segmentTrackIndexBytes: Uint8Array;
  centroidBytes: Uint8Array;
} {
  const encodedPayload = encodeCompiledTrackSetPayload(compiled.payload);
  return {
    catalogBytes: encodeCompiledTrackCatalog(compiled.summary.tracks),
    pointBytes: encodedPayload.pointBytes,
    segmentPositionBytes: encodedPayload.segmentPositionBytes,
    segmentTimeBytes: encodedPayload.segmentTimeBytes,
    segmentTrackIndexBytes: encodedPayload.segmentTrackIndexBytes,
    centroidBytes: encodedPayload.centroidBytes
  };
}

export function parseCompiledTrackSetCatalogFromBytes(
  bytes: Uint8Array,
  header: CompiledTrackSetHeader,
  options?: {
    trackSetName?: string;
    channelId?: string | null;
    channelName?: string | null;
  }
): CompiledTrackSummary[] {
  return parseCompiledTrackCatalogBytes(bytes, header, options);
}

export function decodeCompiledTrackSetPayloadFromBytes(
  header: CompiledTrackSetHeader,
  encoded: {
    pointBytes: Uint8Array;
    segmentPositionBytes: Uint8Array;
    segmentTimeBytes: Uint8Array;
    segmentTrackIndexBytes: Uint8Array;
    centroidBytes: Uint8Array;
  }
): CompiledTrackSetPayload {
  return decodeCompiledTrackSetPayload(header, encoded);
}
