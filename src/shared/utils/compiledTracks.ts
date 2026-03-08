import type {
  CompiledTrackSet,
  CompiledTrackSetHeader,
  CompiledTrackSetPayload,
  CompiledTrackSetSummary,
  CompiledTrackSummary,
  TrackDefinition,
  TrackPoint,
  TrackSummary
} from '../../types/tracks';
import { ensureArrayBuffer } from './buffer';
import { decodeUint32ArrayLE, encodeUint32ArrayLE } from './histogram';
import { buildTracksFromCsvEntries } from './trackCsvParsing';

const TRACK_TIME_EPSILON = 1e-3;
const COMPILED_TRACK_CATALOG_ENTRY_FIELD_COUNT = 13;
const COMPILED_TRACK_CATALOG_ENTRY_STRIDE_BYTES = COMPILED_TRACK_CATALOG_ENTRY_FIELD_COUNT * 4;
const MISSING_SEGMENT_INDEX = -1;

export type EncodedCompiledTrackSet = {
  catalogBytes: Uint8Array;
  pointBytes: Uint8Array;
  segmentPositionBytes: Uint8Array;
  segmentTimeBytes: Uint8Array;
  segmentTrackIndexBytes: Uint8Array;
  centroidBytes: Uint8Array;
};

function encodeFloat32ArrayLE(values: Float32Array): Uint8Array {
  const bytes = new Uint8Array(values.length * 4);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < values.length; index += 1) {
    view.setFloat32(index * 4, values[index] ?? 0, true);
  }
  return bytes;
}

function decodeFloat32ArrayLE(bytes: Uint8Array, length: number): Float32Array {
  const expectedBytes = length * 4;
  if (bytes.byteLength !== expectedBytes) {
    throw new Error(`Invalid float32 array byte length (expected ${expectedBytes}, got ${bytes.byteLength}).`);
  }

  const buffer = ensureArrayBuffer(bytes);
  const view = new DataView(buffer, bytes.byteOffset, bytes.byteLength);
  const values = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    values[index] = view.getFloat32(index * 4, true);
  }
  return values;
}

function coerceFiniteNumber(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function makeTrackId(trackSetId: string, sourceTrackId: number, segmentIndex: number | undefined): string {
  const resolvedSegmentIndex = Number.isFinite(segmentIndex) ? Math.max(0, Math.trunc(segmentIndex ?? 0)) : 0;
  if (resolvedSegmentIndex <= 0) {
    return `${trackSetId}:${sourceTrackId}`;
  }
  return `${trackSetId}:${sourceTrackId}-${resolvedSegmentIndex}`;
}

function makeDisplayTrackNumber(sourceTrackId: number, segmentIndex: number | undefined): string {
  const resolvedSegmentIndex = Number.isFinite(segmentIndex) ? Math.max(0, Math.trunc(segmentIndex ?? 0)) : 0;
  if (resolvedSegmentIndex <= 0) {
    return String(sourceTrackId);
  }
  return `${sourceTrackId}-${resolvedSegmentIndex}`;
}

function resolveParentTrackId(trackSetId: string, sourceTrackId: number, segmentIndex: number | undefined): string | null {
  const resolvedSegmentIndex = Number.isFinite(segmentIndex) ? Math.max(0, Math.trunc(segmentIndex ?? 0)) : 0;
  if (resolvedSegmentIndex <= 0) {
    return null;
  }
  return makeTrackId(trackSetId, sourceTrackId, resolvedSegmentIndex - 1);
}

function normalizeTrackSummary(track: TrackDefinition, pointOffset: number, segmentOffset: number, centroidOffset: number): CompiledTrackSummary {
  const pointCount = track.points.length;
  let amplitudeMin = Number.POSITIVE_INFINITY;
  let amplitudeMax = Number.NEGATIVE_INFINITY;
  let timeStart = Number.POSITIVE_INFINITY;
  let timeEnd = Number.NEGATIVE_INFINITY;

  for (const point of track.points) {
    if (Number.isFinite(point.time)) {
      timeStart = Math.min(timeStart, point.time);
      timeEnd = Math.max(timeEnd, point.time);
    }
    if (Number.isFinite(point.amplitude)) {
      amplitudeMin = Math.min(amplitudeMin, point.amplitude);
      amplitudeMax = Math.max(amplitudeMax, point.amplitude);
    }
  }

  const safeTimeStart = Number.isFinite(timeStart) ? timeStart : 0;
  const safeTimeEnd = Number.isFinite(timeEnd) ? timeEnd : safeTimeStart;
  const safeAmplitudeMin = Number.isFinite(amplitudeMin) ? amplitudeMin : 0;
  const safeAmplitudeMax = Number.isFinite(amplitudeMax) ? amplitudeMax : safeAmplitudeMin;

  return {
    id: track.id,
    trackSetId: track.trackSetId,
    trackSetName: track.trackSetName,
    channelId: track.channelId,
    channelName: track.channelName,
    trackNumber: track.trackNumber,
    sourceTrackId: track.sourceTrackId,
    displayTrackNumber: track.displayTrackNumber,
    segmentIndex: track.segmentIndex,
    parentTrackId: track.parentTrackId,
    pointCount,
    timeStart: safeTimeStart,
    timeEnd: safeTimeEnd,
    amplitudeMin: safeAmplitudeMin,
    amplitudeMax: safeAmplitudeMax,
    pointOffset,
    segmentOffset,
    segmentCount: Math.max(pointCount - 1, 0),
    centroidOffset,
    centroidCount: 0
  };
}

export function compileTrackDefinitions(
  tracks: TrackDefinition[],
  options: {
    trackSetId: string;
    trackSetName: string;
    boundChannelId: string | null;
  }
): CompiledTrackSet {
  const sortedTracks = [...tracks].sort((left, right) => {
    const trackNumberOrder = left.trackNumber - right.trackNumber;
    if (trackNumberOrder !== 0) {
      return trackNumberOrder;
    }
    return (left.segmentIndex ?? 0) - (right.segmentIndex ?? 0);
  });

  const pointValues: number[] = [];
  const segmentPositions: number[] = [];
  const segmentTimes: number[] = [];
  const segmentTrackIndices: number[] = [];
  const centroidValues: number[] = [];
  const compiledTracks: CompiledTrackSummary[] = [];
  let totalPoints = 0;
  let totalSegments = 0;
  let totalCentroids = 0;
  let timeMin = Number.POSITIVE_INFINITY;
  let timeMax = Number.NEGATIVE_INFINITY;
  let amplitudeMin = Number.POSITIVE_INFINITY;
  let amplitudeMax = Number.NEGATIVE_INFINITY;

  for (let trackIndex = 0; trackIndex < sortedTracks.length; trackIndex += 1) {
    const track = sortedTracks[trackIndex]!;
    const pointOffset = totalPoints;
    const segmentOffset = totalSegments;
    const centroidOffset = totalCentroids;
    const compiled = normalizeTrackSummary(track, pointOffset, segmentOffset, centroidOffset);

    let activeCentroidTime = Number.NaN;
    let centroidCount = 0;
    let centroidSumX = 0;
    let centroidSumY = 0;
    let centroidSumZ = 0;

    for (let pointIndex = 0; pointIndex < track.points.length; pointIndex += 1) {
      const point = track.points[pointIndex]!;
      const time = coerceFiniteNumber(point.time, 0);
      const x = coerceFiniteNumber(point.x, 0);
      const y = coerceFiniteNumber(point.y, 0);
      const z = coerceFiniteNumber(point.z, 0);
      const amplitude = coerceFiniteNumber(point.amplitude, 0);

      pointValues.push(time, x, y, z, amplitude);
      totalPoints += 1;
      timeMin = Math.min(timeMin, time);
      timeMax = Math.max(timeMax, time);
      amplitudeMin = Math.min(amplitudeMin, amplitude);
      amplitudeMax = Math.max(amplitudeMax, amplitude);

      if (!Number.isFinite(activeCentroidTime) || Math.abs(time - activeCentroidTime) > TRACK_TIME_EPSILON) {
        if (centroidCount > 0) {
          centroidValues.push(
            activeCentroidTime,
            centroidSumX / centroidCount,
            centroidSumY / centroidCount,
            centroidSumZ / centroidCount
          );
          totalCentroids += 1;
        }
        activeCentroidTime = time;
        centroidCount = 1;
        centroidSumX = x;
        centroidSumY = y;
        centroidSumZ = z;
      } else {
        centroidCount += 1;
        centroidSumX += x;
        centroidSumY += y;
        centroidSumZ += z;
      }

      if (pointIndex <= 0) {
        continue;
      }

      const previous = track.points[pointIndex - 1]!;
      segmentPositions.push(
        coerceFiniteNumber(previous.x, 0),
        coerceFiniteNumber(previous.y, 0),
        coerceFiniteNumber(previous.z, 0),
        x,
        y,
        z
      );
      segmentTimes.push(coerceFiniteNumber(previous.time, 0), time);
      segmentTrackIndices.push(trackIndex);
      totalSegments += 1;
    }

    if (centroidCount > 0 && Number.isFinite(activeCentroidTime)) {
      centroidValues.push(
        activeCentroidTime,
        centroidSumX / centroidCount,
        centroidSumY / centroidCount,
        centroidSumZ / centroidCount
      );
      totalCentroids += 1;
    }

    compiled.centroidCount = totalCentroids - centroidOffset;
    compiledTracks.push(compiled);
  }

  const summary: CompiledTrackSetSummary = {
    trackSetId: options.trackSetId,
    trackSetName: options.trackSetName,
    boundChannelId: options.boundChannelId,
    totalTracks: compiledTracks.length,
    totalPoints,
    totalSegments,
    totalCentroids,
    time: {
      min: Number.isFinite(timeMin) ? timeMin : 0,
      max: Number.isFinite(timeMax) ? timeMax : 0
    },
    amplitude: {
      min: Number.isFinite(amplitudeMin) ? amplitudeMin : 0,
      max: Number.isFinite(amplitudeMax) ? amplitudeMax : 0
    },
    tracks: compiledTracks
  };

  return {
    summary,
    payload: {
      pointData: Float32Array.from(pointValues),
      segmentPositions: Float32Array.from(segmentPositions),
      segmentTimes: Float32Array.from(segmentTimes),
      segmentTrackIndices: Uint32Array.from(segmentTrackIndices),
      centroidData: Float32Array.from(centroidValues)
    }
  };
}

export function compileTrackEntries(options: {
  trackSetId: string;
  trackSetName: string;
  channelId: string | null;
  channelName: string | null;
  entries: string[][];
}): CompiledTrackSet {
  const tracks = buildTracksFromCsvEntries(options);
  return compileTrackDefinitions(tracks, {
    trackSetId: options.trackSetId,
    trackSetName: options.trackSetName,
    boundChannelId: options.channelId
  });
}

export function buildCompiledTrackSetHeader(summary: CompiledTrackSetSummary): CompiledTrackSetHeader {
  return {
    trackSetId: summary.trackSetId,
    trackSetName: summary.trackSetName,
    boundChannelId: summary.boundChannelId,
    totalTracks: summary.totalTracks,
    totalPoints: summary.totalPoints,
    totalSegments: summary.totalSegments,
    totalCentroids: summary.totalCentroids,
    time: summary.time,
    amplitude: summary.amplitude
  };
}

export function encodeCompiledTrackCatalog(tracks: readonly CompiledTrackSummary[]): Uint8Array {
  const bytes = new Uint8Array(tracks.length * COMPILED_TRACK_CATALOG_ENTRY_STRIDE_BYTES);
  const view = new DataView(bytes.buffer);

  for (let index = 0; index < tracks.length; index += 1) {
    const track = tracks[index]!;
    const base = index * COMPILED_TRACK_CATALOG_ENTRY_STRIDE_BYTES;
    view.setInt32(base + 0, Math.trunc(track.trackNumber), true);
    view.setInt32(base + 4, Math.trunc(track.sourceTrackId), true);
    view.setInt32(base + 8, Math.trunc(track.segmentIndex ?? MISSING_SEGMENT_INDEX), true);
    view.setUint32(base + 12, Math.max(0, Math.trunc(track.pointCount)), true);
    view.setUint32(base + 16, Math.max(0, Math.trunc(track.pointOffset)), true);
    view.setUint32(base + 20, Math.max(0, Math.trunc(track.segmentOffset)), true);
    view.setUint32(base + 24, Math.max(0, Math.trunc(track.segmentCount)), true);
    view.setUint32(base + 28, Math.max(0, Math.trunc(track.centroidOffset)), true);
    view.setUint32(base + 32, Math.max(0, Math.trunc(track.centroidCount)), true);
    view.setFloat32(base + 36, coerceFiniteNumber(track.timeStart, 0), true);
    view.setFloat32(base + 40, coerceFiniteNumber(track.timeEnd, 0), true);
    view.setFloat32(base + 44, coerceFiniteNumber(track.amplitudeMin, 0), true);
    view.setFloat32(base + 48, coerceFiniteNumber(track.amplitudeMax, 0), true);
  }

  return bytes;
}

export function parseCompiledTrackCatalogBytes(
  bytes: Uint8Array,
  header: CompiledTrackSetHeader,
  options?: {
    trackSetName?: string;
    channelId?: string | null;
    channelName?: string | null;
  }
): CompiledTrackSummary[] {
  if (bytes.byteLength % COMPILED_TRACK_CATALOG_ENTRY_STRIDE_BYTES !== 0) {
    throw new Error('Invalid compiled track catalog payload.');
  }

  const entryCount = bytes.byteLength / COMPILED_TRACK_CATALOG_ENTRY_STRIDE_BYTES;
  if (entryCount !== header.totalTracks) {
    throw new Error(`Invalid compiled track catalog entry count (expected ${header.totalTracks}, got ${entryCount}).`);
  }

  const buffer = ensureArrayBuffer(bytes);
  const view = new DataView(buffer, bytes.byteOffset, bytes.byteLength);
  const trackSetName = options?.trackSetName ?? header.trackSetName;
  const channelId = options?.channelId ?? header.boundChannelId;
  const channelName = options?.channelName ?? null;
  const tracks: CompiledTrackSummary[] = [];

  for (let index = 0; index < entryCount; index += 1) {
    const base = index * COMPILED_TRACK_CATALOG_ENTRY_STRIDE_BYTES;
    const sourceTrackId = view.getInt32(base + 4, true);
    const encodedSegmentIndex = view.getInt32(base + 8, true);
    const segmentIndex = encodedSegmentIndex >= 0 ? encodedSegmentIndex : undefined;
    tracks.push({
      id: makeTrackId(header.trackSetId, sourceTrackId, segmentIndex),
      trackSetId: header.trackSetId,
      trackSetName,
      channelId,
      channelName,
      trackNumber: view.getInt32(base + 0, true),
      sourceTrackId,
      displayTrackNumber: makeDisplayTrackNumber(sourceTrackId, segmentIndex),
      segmentIndex,
      parentTrackId: resolveParentTrackId(header.trackSetId, sourceTrackId, segmentIndex),
      pointCount: view.getUint32(base + 12, true),
      pointOffset: view.getUint32(base + 16, true),
      segmentOffset: view.getUint32(base + 20, true),
      segmentCount: view.getUint32(base + 24, true),
      centroidOffset: view.getUint32(base + 28, true),
      centroidCount: view.getUint32(base + 32, true),
      timeStart: view.getFloat32(base + 36, true),
      timeEnd: view.getFloat32(base + 40, true),
      amplitudeMin: view.getFloat32(base + 44, true),
      amplitudeMax: view.getFloat32(base + 48, true)
    });
  }

  return tracks;
}

export function encodeCompiledTrackSetPayload(payload: CompiledTrackSetPayload): EncodedCompiledTrackSet {
  return {
    catalogBytes: new Uint8Array(0),
    pointBytes: encodeFloat32ArrayLE(payload.pointData),
    segmentPositionBytes: encodeFloat32ArrayLE(payload.segmentPositions),
    segmentTimeBytes: encodeFloat32ArrayLE(payload.segmentTimes),
    segmentTrackIndexBytes: encodeUint32ArrayLE(payload.segmentTrackIndices),
    centroidBytes: encodeFloat32ArrayLE(payload.centroidData)
  };
}

export function decodeCompiledTrackSetPayload(
  header: CompiledTrackSetHeader,
  encoded: {
    pointBytes: Uint8Array;
    segmentPositionBytes: Uint8Array;
    segmentTimeBytes: Uint8Array;
    segmentTrackIndexBytes: Uint8Array;
    centroidBytes: Uint8Array;
  }
): CompiledTrackSetPayload {
  return {
    pointData: decodeFloat32ArrayLE(encoded.pointBytes, header.totalPoints * 5),
    segmentPositions: decodeFloat32ArrayLE(encoded.segmentPositionBytes, header.totalSegments * 6),
    segmentTimes: decodeFloat32ArrayLE(encoded.segmentTimeBytes, header.totalSegments * 2),
    segmentTrackIndices: decodeUint32ArrayLE(encoded.segmentTrackIndexBytes, header.totalSegments),
    centroidData: decodeFloat32ArrayLE(encoded.centroidBytes, header.totalCentroids * 4)
  };
}

export function materializeTrackPoints(track: CompiledTrackSummary, payload: CompiledTrackSetPayload): TrackPoint[] {
  if (track.pointCount <= 0) {
    return [];
  }

  const points: TrackPoint[] = [];
  const start = track.pointOffset * 5;
  const end = start + track.pointCount * 5;
  for (let index = start; index < end; index += 5) {
    points.push({
      time: payload.pointData[index] ?? 0,
      x: payload.pointData[index + 1] ?? 0,
      y: payload.pointData[index + 2] ?? 0,
      z: payload.pointData[index + 3] ?? 0,
      amplitude: payload.pointData[index + 4] ?? 0
    });
  }
  return points;
}

export function materializeTrackDefinition(
  track: CompiledTrackSummary,
  payload: CompiledTrackSetPayload
): TrackDefinition {
  return {
    ...track,
    points: materializeTrackPoints(track, payload)
  };
}

function findLastCentroidIndexAtOrBefore(
  payload: CompiledTrackSetPayload,
  offset: number,
  count: number,
  targetTime: number
): number {
  let low = 0;
  let high = count;

  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    const time = payload.centroidData[(offset + mid) * 4] ?? Number.NEGATIVE_INFINITY;
    if (time <= targetTime + TRACK_TIME_EPSILON) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  return low - 1;
}

export function resolveTrackCentroidAtTime(
  track: CompiledTrackSummary,
  payload: CompiledTrackSetPayload,
  targetTimeIndex: number,
  options?: { isFullTrackTrailEnabled?: boolean; trackTrailLength?: number }
): { x: number; y: number; z: number } | null {
  if (track.centroidCount <= 0) {
    return null;
  }

  const minVisibleTime =
    options?.isFullTrackTrailEnabled === false
      ? targetTimeIndex - Math.max(0, options?.trackTrailLength ?? 0) - TRACK_TIME_EPSILON
      : Number.NEGATIVE_INFINITY;
  const centroidIndex = findLastCentroidIndexAtOrBefore(payload, track.centroidOffset, track.centroidCount, targetTimeIndex);
  if (centroidIndex < 0) {
    return null;
  }

  const baseIndex = (track.centroidOffset + centroidIndex) * 4;
  const time = payload.centroidData[baseIndex] ?? Number.NEGATIVE_INFINITY;
  if (time < minVisibleTime) {
    return null;
  }

  return {
    x: payload.centroidData[baseIndex + 1] ?? 0,
    y: payload.centroidData[baseIndex + 2] ?? 0,
    z: payload.centroidData[baseIndex + 3] ?? 0
  };
}

export function findCompiledTrackById(
  summary: CompiledTrackSetSummary,
  trackId: string
): CompiledTrackSummary | null {
  for (const track of summary.tracks) {
    if (track.id === trackId) {
      return track;
    }
  }
  return null;
}

export function getTrackPlaybackWindow(track: TrackSummary | null | undefined): { minIndex: number; maxIndex: number } | null {
  if (!track) {
    return null;
  }

  if (!Number.isFinite(track.timeStart) || !Number.isFinite(track.timeEnd)) {
    return null;
  }

  return {
    minIndex: Math.trunc(track.timeStart),
    maxIndex: Math.trunc(track.timeEnd)
  };
}
