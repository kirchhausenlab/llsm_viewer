import type { TrackDefinition, TrackPoint } from '../../types/tracks';

type SegmentAccumulator = {
  segmentIndex: number;
  internalTrackId: number;
  parentInternalTrackId: number | null;
  points: TrackPoint[];
};

type TrackAccumulator = {
  current: SegmentAccumulator | null;
  breakPending: boolean;
  segments: SegmentAccumulator[];
};

function isBreakSentinel(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed === '') {
    return true;
  }
  return Number.isNaN(Number(trimmed));
}

function makeTrackId(trackSetId: string, sourceTrackId: number, segmentIndex: number): string {
  if (segmentIndex <= 0) {
    return `${trackSetId}:${sourceTrackId}`;
  }
  return `${trackSetId}:${sourceTrackId}-${segmentIndex}`;
}

function makeDisplayTrackNumber(sourceTrackId: number, segmentIndex: number): string {
  if (segmentIndex <= 0) {
    return String(sourceTrackId);
  }
  return `${sourceTrackId}-${segmentIndex}`;
}

export type BuildTracksFromCsvEntriesOptions = {
  trackSetId: string;
  trackSetName: string;
  channelId: string | null;
  channelName: string | null;
  entries: string[][];
};

export function buildTracksFromCsvEntries({
  trackSetId,
  trackSetName,
  channelId,
  channelName,
  entries
}: BuildTracksFromCsvEntriesOptions): TrackDefinition[] {
  const minimumColumns = 7;

  const trackStates = new Map<number, TrackAccumulator>();
  let nextInternalTrackId = 1;

  for (const row of entries) {
    if (row.length < minimumColumns) {
      continue;
    }

    const rawId = Number(row[0]);
    if (!Number.isFinite(rawId)) {
      continue;
    }
    const sourceTrackId = Math.trunc(rawId);

    let state = trackStates.get(sourceTrackId);
    if (!state) {
      state = { current: null, breakPending: false, segments: [] };
      trackStates.set(sourceTrackId, state);
    }

    const rawFrame = row[2] ?? '';
    const rawX = row[3] ?? '';
    const rawY = row[4] ?? '';
    const rawZ = row[5] ?? '';
    const isBreakRow =
      isBreakSentinel(rawFrame) && isBreakSentinel(rawX) && isBreakSentinel(rawY) && isBreakSentinel(rawZ);
    if (isBreakRow) {
      state.breakPending = true;
      continue;
    }

    const frame = Number(rawFrame);
    const x = Number(rawX);
    const y = Number(rawY);
    const amplitudeIndex = 6;
    const zRaw = Number(row[5]);
    const amplitudeRaw = Number(row[amplitudeIndex]);

    const hasValidZ = Number.isFinite(zRaw);
    const z = zRaw;

    if (
      !Number.isFinite(frame) ||
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !Number.isFinite(amplitudeRaw) ||
      !hasValidZ
    ) {
      continue;
    }

    const normalizedTime = Math.max(0, frame);
    const amplitude = Math.max(0, amplitudeRaw);
    const point: TrackPoint = { time: normalizedTime, x, y, z, amplitude };

    if (!state.current || state.breakPending) {
      const segmentIndex = state.current ? state.current.segmentIndex + 1 : 0;
      const parentInternalTrackId = state.current ? state.current.internalTrackId : null;
      state.current = {
        segmentIndex,
        internalTrackId: nextInternalTrackId++,
        parentInternalTrackId,
        points: [],
      };
      state.segments.push(state.current);
      state.breakPending = false;
    }

    state.current.points.push(point);
  }

  const parsed: TrackDefinition[] = [];
  const sortedEntries = Array.from(trackStates.entries()).sort((a, b) => a[0] - b[0]);
  for (const [sourceTrackId, state] of sortedEntries) {
    for (const segment of state.segments) {
      if (segment.points.length === 0) {
        continue;
      }

      const id = makeTrackId(trackSetId, sourceTrackId, segment.segmentIndex);
      const displayTrackNumber = makeDisplayTrackNumber(sourceTrackId, segment.segmentIndex);
      const parentTrackId =
        segment.segmentIndex <= 0
          ? null
          : makeTrackId(trackSetId, sourceTrackId, segment.segmentIndex - 1);

      const sortedPoints = [...segment.points].sort((a, b) => a.time - b.time);
      const adjustedPoints = sortedPoints.map<TrackPoint>((point) => ({
        time: point.time,
        x: point.x,
        y: point.y,
        z: point.z,
        amplitude: point.amplitude,
      }));

      parsed.push({
        id,
        trackSetId,
        trackSetName,
        channelId,
        channelName: channelName?.trim() || null,
        trackNumber: sourceTrackId,
        sourceTrackId,
        displayTrackNumber,
        segmentIndex: segment.segmentIndex,
        internalTrackId: segment.internalTrackId,
        parentTrackId,
        parentInternalTrackId: segment.parentInternalTrackId,
        points: adjustedPoints,
      });
    }
  }

  return parsed;
}
