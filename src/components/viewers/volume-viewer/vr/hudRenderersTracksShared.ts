import type { VrTracksState } from './types';

export type TracksCanvasSurface = {
  ctx: CanvasRenderingContext2D;
  canvasWidth: number;
  canvasHeight: number;
};

export type TracksLayout = {
  toPanelX: (x: number) => number;
  toPanelY: (y: number) => number;
  paddingX: number;
  currentY: number;
};

export type ActiveTrackChannel = VrTracksState['channels'][number];
