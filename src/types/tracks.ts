export type TrackPoint = {
  time: number;
  x: number;
  y: number;
  z: number;
};

export type TrackDefinition = {
  id: number;
  points: TrackPoint[];
};
