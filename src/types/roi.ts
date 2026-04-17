import { GRAYSCALE_COLOR_SWATCHES, normalizeHexColor } from '../shared/colorMaps/layerColors';

export type RoiTool = 'line' | 'rectangle' | 'ellipse';
export type RoiDimensionMode = '2d' | '3d';
export type RoiShape = RoiTool;

export type RoiPoint = {
  x: number;
  y: number;
  z: number;
};

export type RoiDefinition = {
  shape: RoiShape;
  mode: RoiDimensionMode;
  start: RoiPoint;
  end: RoiPoint;
  color: string;
};

export type SavedRoi = RoiDefinition & {
  id: string;
  name: string;
};

export type RoiColorOption = {
  label: string;
  value: string;
};

export const ROI_COLOR_SWATCHES: readonly RoiColorOption[] = GRAYSCALE_COLOR_SWATCHES;
export const DEFAULT_ROI_COLOR = '#facc15';

const clampInteger = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.round(value)));

const padCoordinate = (value: number, width: number) => String(value).padStart(width, '0');

export function normalizeRoiColor(color: string | null | undefined, fallback: string = DEFAULT_ROI_COLOR) {
  return normalizeHexColor(color, fallback).toUpperCase();
}

export function cloneRoiPoint(point: RoiPoint): RoiPoint {
  return {
    x: point.x,
    y: point.y,
    z: point.z,
  };
}

export function cloneRoiDefinition(roi: RoiDefinition): RoiDefinition {
  return {
    shape: roi.shape,
    mode: roi.mode,
    start: cloneRoiPoint(roi.start),
    end: cloneRoiPoint(roi.end),
    color: normalizeRoiColor(roi.color),
  };
}

export function cloneSavedRoi(roi: SavedRoi): SavedRoi {
  return {
    ...cloneRoiDefinition(roi),
    id: roi.id,
    name: roi.name,
  };
}

export function formatRoiCentroidName(
  roi: Pick<RoiDefinition, 'start' | 'end'>,
  volumeDimensions: { width: number; height: number; depth: number }
): string {
  const width = Math.max(1, Math.floor(volumeDimensions.width));
  const height = Math.max(1, Math.floor(volumeDimensions.height));
  const depth = Math.max(1, Math.floor(volumeDimensions.depth));
  const paddingWidth = String(Math.max(width, height, depth)).length;
  const centerX = clampInteger((roi.start.x + roi.end.x) / 2, 0, width - 1);
  const centerY = clampInteger((roi.start.y + roi.end.y) / 2, 0, height - 1);
  const centerZ = clampInteger((roi.start.z + roi.end.z) / 2, 0, depth - 1);

  return [
    padCoordinate(centerZ, paddingWidth),
    padCoordinate(centerY, paddingWidth),
    padCoordinate(centerX, paddingWidth),
  ].join('-');
}
