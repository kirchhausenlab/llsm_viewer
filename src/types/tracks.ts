export type TrackPoint = {
  time: number;
  x: number;
  y: number;
  z: number;
  amplitude: number;
};

export type TrackTimepointConvention = 'zero-based' | 'one-based';

export type TrackColorMode =
  | { type: 'random' }
  | {
      type: 'uniform';
      color: string;
    };

export type TrackSummary = {
  id: string;
  trackSetId: string;
  trackSetName: string;
  channelId: string | null;
  channelName: string | null;
  trackNumber: number;
  sourceTrackId: number;
  internalTrackId?: number;
  displayTrackNumber?: string;
  segmentIndex?: number;
  parentTrackId?: string | null;
  parentInternalTrackId?: number | null;
  pointCount: number;
  timeStart: number;
  timeEnd: number;
  amplitudeMin: number;
  amplitudeMax: number;
};

export type TrackDefinition = TrackSummary & {
  points: TrackPoint[];
};

export type NumericRange = {
  min: number;
  max: number;
};

export type CompiledTrackSummary = TrackSummary & {
  pointOffset: number;
  segmentOffset: number;
  segmentCount: number;
  centroidOffset: number;
  centroidCount: number;
};

export type CompiledTrackSetHeader = {
  trackSetId: string;
  trackSetName: string;
  boundChannelId: string | null;
  totalTracks: number;
  totalPoints: number;
  totalSegments: number;
  totalCentroids: number;
  time: NumericRange;
  amplitude: NumericRange;
};

export type CompiledTrackSetSummary = CompiledTrackSetHeader & {
  tracks: CompiledTrackSummary[];
};

export type CompiledTrackSetPayload = {
  pointData: Float32Array;
  segmentPositions: Float32Array;
  segmentTimes: Float32Array;
  segmentTrackIndices: Uint32Array;
  centroidData: Float32Array;
};

export type CompiledTrackSet = {
  summary: CompiledTrackSetSummary;
  payload: CompiledTrackSetPayload;
};
