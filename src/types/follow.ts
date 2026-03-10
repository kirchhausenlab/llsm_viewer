export type FollowedVoxelTarget = {
  // Coordinates are expressed in full-resolution display/world voxel space.
  coordinates: { x: number; y: number; z: number };
  layerKey: string;
};
