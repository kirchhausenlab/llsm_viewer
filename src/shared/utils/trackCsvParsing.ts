import type { TrackDefinition, TrackPoint, TrackTimepointConvention } from '../../types/tracks';

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
  timepointConvention?: TrackTimepointConvention;
};

type TrackCsvColumnMapping = {
  dataRowStartIndex: number;
  trackIdIndex: number;
  startIndex: number | null;
  timeIndex: number;
  xIndex: number;
  yIndex: number;
  zIndex: number;
  amplitudeIndex: number;
};

function normalizeTrackCsvHeader(value: string): string {
  return value.trim().toLowerCase();
}

function resolveTrackCsvColumnMapping(entries: string[][]): TrackCsvColumnMapping {
  const firstRow = entries[0] ?? null;
  if (firstRow && firstRow.length >= 8) {
    const normalizedHeaders = firstRow.map((value) => normalizeTrackCsvHeader(value));
    const trackIdIndex = normalizedHeaders.indexOf('track_id');
    const startIndex = normalizedHeaders.indexOf('start');
    const timeIndex = normalizedHeaders.indexOf('t');
    const xIndex = normalizedHeaders.indexOf('x');
    const yIndex = normalizedHeaders.indexOf('y');
    const zIndex = normalizedHeaders.indexOf('z');
    const amplitudeIndex = normalizedHeaders.indexOf('a');

    if (
      trackIdIndex >= 0 &&
      startIndex >= 0 &&
      timeIndex >= 0 &&
      xIndex >= 0 &&
      yIndex >= 0 &&
      zIndex >= 0 &&
      amplitudeIndex >= 0
    ) {
      return {
        dataRowStartIndex: 1,
        trackIdIndex,
        startIndex,
        timeIndex,
        xIndex,
        yIndex,
        zIndex,
        amplitudeIndex
      };
    }
  }

  return {
    dataRowStartIndex: 0,
    trackIdIndex: 0,
    startIndex: null,
    timeIndex: 2,
    xIndex: 3,
    yIndex: 4,
    zIndex: 5,
    amplitudeIndex: 6
  };
}

function normalizeTrackTimepoint(
  value: number,
  timepointConvention: TrackTimepointConvention,
  rowIndex: number,
  label: string
): number {
  if (timepointConvention === 'one-based') {
    if (value < 1) {
      throw new Error(
        `Track CSV row ${rowIndex + 1} uses ${label} ${value}, but this file is configured as starting at 1.`
      );
    }
    return value - 1;
  }

  return value;
}

export function buildTracksFromCsvEntries({
  trackSetId,
  trackSetName,
  channelId,
  channelName,
  entries,
  timepointConvention = 'zero-based'
}: BuildTracksFromCsvEntriesOptions): TrackDefinition[] {
  const minimumColumns = 7;
  const columnMapping = resolveTrackCsvColumnMapping(entries);

  const trackStates = new Map<number, TrackAccumulator>();
  let nextInternalTrackId = 1;

  for (let rowIndex = columnMapping.dataRowStartIndex; rowIndex < entries.length; rowIndex += 1) {
    const row = entries[rowIndex]!;
    if (row.length < minimumColumns) {
      continue;
    }

    const rawId = Number(row[columnMapping.trackIdIndex]);
    if (!Number.isFinite(rawId)) {
      continue;
    }
    const sourceTrackId = Math.trunc(rawId);

    let state = trackStates.get(sourceTrackId);
    if (!state) {
      state = { current: null, breakPending: false, segments: [] };
      trackStates.set(sourceTrackId, state);
    }

    const rawFrame = row[columnMapping.timeIndex] ?? '';
    const rawX = row[columnMapping.xIndex] ?? '';
    const rawY = row[columnMapping.yIndex] ?? '';
    const rawZ = row[columnMapping.zIndex] ?? '';
    const isBreakRow =
      isBreakSentinel(rawFrame) && isBreakSentinel(rawX) && isBreakSentinel(rawY) && isBreakSentinel(rawZ);
    if (isBreakRow) {
      state.breakPending = true;
      continue;
    }

    const frame = Number(rawFrame);
    const x = Number(rawX);
    const y = Number(rawY);
    const zRaw = Number(row[columnMapping.zIndex]);
    const amplitudeRaw = Number(row[columnMapping.amplitudeIndex]);
    const startRaw = columnMapping.startIndex === null ? Number.NaN : Number(row[columnMapping.startIndex]);

    const hasValidZ = Number.isFinite(zRaw);
    const z = zRaw;

    if (
      !Number.isFinite(frame) ||
      (columnMapping.startIndex !== null && !Number.isFinite(startRaw)) ||
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !Number.isFinite(amplitudeRaw) ||
      !hasValidZ
    ) {
      continue;
    }

    const normalizedTime =
      columnMapping.startIndex === null
        ? Math.max(0, normalizeTrackTimepoint(frame, timepointConvention, rowIndex, 'frame'))
        : Math.max(0, startRaw + normalizeTrackTimepoint(frame, timepointConvention, rowIndex, 'frame'));
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
      let timeStart = Number.POSITIVE_INFINITY;
      let timeEnd = Number.NEGATIVE_INFINITY;
      let amplitudeMin = Number.POSITIVE_INFINITY;
      let amplitudeMax = Number.NEGATIVE_INFINITY;

      for (const point of adjustedPoints) {
        timeStart = Math.min(timeStart, point.time);
        timeEnd = Math.max(timeEnd, point.time);
        amplitudeMin = Math.min(amplitudeMin, point.amplitude);
        amplitudeMax = Math.max(amplitudeMax, point.amplitude);
      }

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
        pointCount: adjustedPoints.length,
        timeStart: Number.isFinite(timeStart) ? timeStart : 0,
        timeEnd: Number.isFinite(timeEnd) ? timeEnd : 0,
        amplitudeMin: Number.isFinite(amplitudeMin) ? amplitudeMin : 0,
        amplitudeMax: Number.isFinite(amplitudeMax) ? amplitudeMax : 0,
        points: adjustedPoints,
      });
    }
  }

  return parsed;
}
