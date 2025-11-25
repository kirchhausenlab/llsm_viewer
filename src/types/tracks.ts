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
  channelId: string;
  channelName: string;
  trackNumber: number;
  sourceTrackId: number;
  points: TrackPoint[];
};

export type NumericRange = {
  min: number;
  max: number;
};
