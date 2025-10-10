export type NormalizedLandmark = {
  x: number;
  y: number;
  z: number;
};

export type FaceLandmarkerResult = {
  faceLandmarks: NormalizedLandmark[][];
};

export type FaceLandmarkerOptions = {
  baseOptions: {
    modelAssetPath: string;
  };
  runningMode: 'VIDEO';
  outputFaceBlendshapes: boolean;
  numFaces: number;
};

export type VisionFileset = unknown;

export interface FaceLandmarker {
  detectForVideo(video: HTMLVideoElement, timestamp: number): FaceLandmarkerResult | null;
  close(): void;
}

export interface FilesetResolver {
  forVisionTasks(basePath: string): Promise<VisionFileset>;
}

export type FaceLandmarkerModule = {
  FilesetResolver: FilesetResolver;
  FaceLandmarker: {
    createFromOptions(
      resolver: VisionFileset,
      options: FaceLandmarkerOptions
    ): Promise<FaceLandmarker>;
  };
};
