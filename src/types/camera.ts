export type CameraCoordinate = {
  x: number;
  y: number;
  z: number;
};

export type CameraRotation = {
  yaw: number;
  pitch: number;
  roll: number;
};

export type CameraWindowState = {
  cameraPosition: CameraCoordinate;
  cameraRotation: CameraRotation;
};

export type FreeRoamCameraView = {
  id: string;
  label: string;
  mode: 'free-roam';
  cameraPosition: CameraCoordinate;
  cameraRotation: CameraRotation;
};

export type VoxelFollowCameraView = {
  id: string;
  label: string;
  mode: 'voxel-follow';
  cameraPosition: CameraCoordinate;
  cameraRotation: CameraRotation;
  followedVoxel: CameraCoordinate;
};

export type SavedCameraView = FreeRoamCameraView | VoxelFollowCameraView;

export type SerializedFreeRoamCameraView = Omit<FreeRoamCameraView, 'id'>;
export type SerializedVoxelFollowCameraView = Omit<VoxelFollowCameraView, 'id'>;
export type SerializedSavedCameraView =
  | SerializedFreeRoamCameraView
  | SerializedVoxelFollowCameraView;

export type SavedCameraViewsFile = {
  version: 1;
  shapeZYX: [number, number, number];
  views: SerializedSavedCameraView[];
};

export type CameraWindowController = {
  applyCameraPose: (params: {
    cameraPosition?: CameraCoordinate | null;
    cameraRotation: CameraRotation;
  }) => boolean;
  captureCameraState: () => CameraWindowState | null;
};
