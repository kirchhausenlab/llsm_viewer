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

function makeTrackId(channelId: string, sourceTrackId: number, segmentIndex: number): string {
  if (segmentIndex <= 0) {
    return `${channelId}:${sourceTrackId}`;
  }
  return `${channelId}:${sourceTrackId}-${segmentIndex}`;
}

function makeDisplayTrackNumber(sourceTrackId: number, segmentIndex: number): string {
  if (segmentIndex <= 0) {
    return String(sourceTrackId);
  }
  return `${sourceTrackId}-${segmentIndex}`;
}

export type BuildTracksFromCsvEntriesOptions = {
  channelId: string;
  channelName: string;
  entries: string[][];
  experimentDimension: '2d' | '3d';
};

export function buildTracksFromCsvEntries({
  channelId,
  channelName,
  entries,
  experimentDimension,
}: BuildTracksFromCsvEntriesOptions): TrackDefinition[] {
  const is2dExperiment = experimentDimension === '2d';
  const minimumColumns = is2dExperiment ? 6 : 7;

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

    const rawDeltaTime = row[2] ?? '';
    const rawX = row[3] ?? '';
    const rawY = row[4] ?? '';
    const rawZ = is2dExperiment ? (row.length >= 7 ? (row[5] ?? '') : '') : (row[5] ?? '');
    const isBreakRow = rawDeltaTime === '' && rawX === '' && rawY === '' && rawZ === '';
    if (isBreakRow) {
      state.breakPending = true;
      continue;
    }

    const initialTime = Number(row[1]);
    const deltaTime = Number(rawDeltaTime);
    const x = Number(rawX);
    const y = Number(rawY);
    const amplitudeIndex = is2dExperiment && row.length < 7 ? 5 : 6;
    const zRaw = is2dExperiment ? (row.length >= 7 ? Number(row[5]) : 0) : Number(row[5]);
    const amplitudeRaw = Number(row[amplitudeIndex]);

    const hasValidZ = Number.isFinite(zRaw);
    const z = is2dExperiment ? (hasValidZ ? zRaw : 0) : zRaw;

    if (
      !Number.isFinite(initialTime) ||
      !Number.isFinite(deltaTime) ||
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !Number.isFinite(amplitudeRaw) ||
      (!is2dExperiment && !hasValidZ)
    ) {
      continue;
    }

    const time = initialTime + deltaTime;
    const normalizedTime = Math.max(0, time - 1);
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

      const id = makeTrackId(channelId, sourceTrackId, segment.segmentIndex);
      const displayTrackNumber = makeDisplayTrackNumber(sourceTrackId, segment.segmentIndex);
      const parentTrackId =
        segment.segmentIndex <= 0 ? null : makeTrackId(channelId, sourceTrackId, segment.segmentIndex - 1);

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
        channelId,
        channelName: channelName.trim() || 'Untitled channel',
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
