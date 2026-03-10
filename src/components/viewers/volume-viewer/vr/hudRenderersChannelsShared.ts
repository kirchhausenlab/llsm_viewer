import type { VrChannelsState } from './types';

export type ChannelsCanvasSurface = {
  ctx: CanvasRenderingContext2D;
  canvasWidth: number;
  canvasHeight: number;
};

export type ChannelsLayout = {
  toPanelX: (x: number) => number;
  toPanelY: (y: number) => number;
  paddingX: number;
  currentY: number;
};

export type ActiveChannel = VrChannelsState['channels'][number];
export type ActiveLayer = ActiveChannel['layers'][number];
