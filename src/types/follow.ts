export type FollowedVoxelTarget = {
  // Coordinates are expressed in canonical experiment voxel space and ignore per-layer offsets.
  coordinates: { x: number; y: number; z: number };
};
