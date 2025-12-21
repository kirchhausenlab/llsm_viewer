export type TrackPoint = {
  time: number;
  x: number;
  y: number;
  z: number;
  amplitude: number;
};

export type TrackColorMode =
  | { type: 'random' }
  | {
      type: 'uniform';
      color: string;
    };

export type TrackDefinition = {
  id: string;
  trackSetId: string;
  trackSetName: string;
  channelId: string;
  channelName: string;
  trackNumber: number;
  sourceTrackId: number;
  displayTrackNumber?: string;
  segmentIndex?: number;
  internalTrackId?: number;
  parentTrackId?: string | null;
  parentInternalTrackId?: number | null;
  points: TrackPoint[];
};

export type NumericRange = {
  min: number;
  max: number;
};
