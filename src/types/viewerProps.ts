export type ViewerPropType = 'text' | 'timestamp' | 'scalebar';

export type ViewerPropDimension = '2d' | '3d';

export type ViewerPropFacingMode = 'fixed' | 'billboard';

export type ViewerPropOcclusionMode = 'occluded' | 'always-on-top';

export type ViewerPropUnitMode = 'voxel' | 'physical';

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

export type ViewerProp = {
  id: string;
  name: string;
  type: ViewerPropType;
  dimension: ViewerPropDimension;
  visible: boolean;
  color: string;
  text: string;
  screen: ViewerPropScreenState;
  world: ViewerPropWorldState;
};

export type ViewerPropVolumeDimensions = {
  width: number;
  height: number;
  depth: number;
};
