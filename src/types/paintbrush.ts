export type PaintbrushStrokeHandlers = {
  enabled: boolean;
  onStrokeStart: () => void;
  onStrokeApply: (coords: { x: number; y: number; z: number }) => void;
  onStrokeEnd: () => void;
};

