import type { VoxelResolutionUnit } from './voxelResolution';

export type ViewerPropType = 'text' | 'timestamp' | 'scalebar';

export type ViewerPropDimension = '2d' | '3d';

export const VIEWER_PROP_TYPEFACES = [
  'Inter',
  'Arial',
  'Georgia',
  'Times New Roman',
  'Verdana',
  'Courier New',
] as const;

export type ViewerPropTypeface = (typeof VIEWER_PROP_TYPEFACES)[number];

export type ViewerPropFacingMode = 'fixed' | 'billboard';

export type ViewerPropOcclusionMode = 'occluded' | 'always-on-top';

export type ViewerPropUnitMode = 'voxel' | 'physical';

export type ViewerPropTimestampUnits = 'index' | 'physical';

export type ViewerPropScalebarAxis = 'x' | 'y' | 'z';

export type ViewerPropScalebarTextPlacement = 'above' | 'below' | 'right';

export type ViewerPropScreenState = {
  x: number;
  y: number;
  rotation: number;
  fontSize: number;
  flipX: boolean;
  flipY: boolean;
};

export type ViewerPropWorldState = {
  x: number;
  y: number;
  z: number;
  roll: number;
  pitch: number;
  yaw: number;
  fontSize: number;
  flipX: boolean;
  flipY: boolean;
  flipZ: boolean;
  facingMode: ViewerPropFacingMode;
  occlusionMode: ViewerPropOcclusionMode;
  unitMode: ViewerPropUnitMode;
};

export type ViewerPropScalebarState = {
  axis: ViewerPropScalebarAxis;
  length: number;
  unit: VoxelResolutionUnit;
  showText: boolean;
  textPlacement: ViewerPropScalebarTextPlacement;
};

export type ViewerProp = {
  id: string;
  name: string;
  type: ViewerPropType;
  typeface: ViewerPropTypeface;
  dimension: ViewerPropDimension;
  visible: boolean;
  color: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  text: string;
  timestampUnits: ViewerPropTimestampUnits;
  initialTimepoint: number;
  finalTimepoint: number;
  scalebar: ViewerPropScalebarState;
  screen: ViewerPropScreenState;
  world: ViewerPropWorldState;
};

export type ViewerPropVolumeDimensions = {
  width: number;
  height: number;
  depth: number;
};
