import type { FaceLandmarker, FaceLandmarkerResult } from './mediapipeTypes';
import { loadFaceLandmarkerModule } from './mediapipeLoader';

export type HeadTrackingPose = {
  hasFace: boolean;
  timestamp: number;
  normalizedPosition: {
    x: number;
    y: number;
    z: number;
  } | null;
};

export type HeadTrackingListener = (pose: HeadTrackingPose) => void;

const IRIS_LEFT_INDICES = [468, 469, 470, 471];
const IRIS_RIGHT_INDICES = [473, 474, 475, 476];

const DEFAULT_MODEL_ASSET_URL =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/wasm/face_landmarker.task';
const DEFAULT_WASM_ROOT = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/wasm';

export class HeadTrackingController {
  private landmarker: FaceLandmarker | null = null;
  private video: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  private animationFrame: number | null = null;
  private listeners: Set<HeadTrackingListener> = new Set();
  private isRunning = false;
  private isStarting = false;

  addListener(listener: HeadTrackingListener) {
    this.listeners.add(listener);
  }

  removeListener(listener: HeadTrackingListener) {
    this.listeners.delete(listener);
  }

  async start() {
    if (this.isRunning || this.isStarting) {
      return;
    }
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      throw new Error('Webcam access is not supported in this environment.');
    }

    this.isStarting = true;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 30 }
        },
        audio: false
      });

      const video = document.createElement('video');
      video.autoplay = true;
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;

      await new Promise<void>((resolve, reject) => {
        const handleLoaded = () => {
          cleanup();
          resolve();
        };
        const handleError = (event: Event) => {
          cleanup();
          reject(new Error(`Unable to start camera: ${event}`));
        };
        const cleanup = () => {
          video.removeEventListener('loadeddata', handleLoaded);
          video.removeEventListener('error', handleError);
        };
        video.addEventListener('loadeddata', handleLoaded, { once: true });
        video.addEventListener('error', handleError, { once: true });
      });

      await video.play();

      const landmarker = await this.loadLandmarker();

      this.stream = stream;
      this.video = video;
      this.landmarker = landmarker;
      this.isRunning = true;
      this.animationFrame = requestAnimationFrame(() => this.processFrame());
    } catch (error) {
      this.stop();
      throw error;
    } finally {
      this.isStarting = false;
    }
  }

  stop() {
    if (this.animationFrame !== null) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
    this.isRunning = false;

    if (this.video) {
      this.video.pause();
      this.video.srcObject = null;
      this.video.removeAttribute('src');
      this.video.load();
      this.video = null;
    }

    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        track.stop();
      }
      this.stream = null;
    }
  }

  dispose() {
    this.stop();
    if (this.landmarker) {
      this.landmarker.close();
      this.landmarker = null;
    }
    this.listeners.clear();
  }

  private async loadLandmarker(): Promise<FaceLandmarker> {
    if (this.landmarker) {
      return this.landmarker;
    }
    const { FilesetResolver, FaceLandmarker } = await loadFaceLandmarkerModule();
    const resolver = await FilesetResolver.forVisionTasks(DEFAULT_WASM_ROOT);
    return FaceLandmarker.createFromOptions(resolver, {
      baseOptions: {
        modelAssetPath: DEFAULT_MODEL_ASSET_URL
      },
      runningMode: 'VIDEO',
      outputFaceBlendshapes: false,
      numFaces: 1
    });
  }

  private processFrame() {
    if (!this.isRunning || !this.video || !this.landmarker) {
      return;
    }

    const now = performance.now();
    let pose: HeadTrackingPose = {
      hasFace: false,
      timestamp: now,
      normalizedPosition: null
    };

    if (this.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      const result = this.landmarker.detectForVideo(this.video, now);
      if (result && result.faceLandmarks.length > 0) {
        const normalized = this.computeNormalizedPose(result);
        if (normalized) {
          pose = {
            hasFace: true,
            timestamp: now,
            normalizedPosition: normalized
          };
        }
      }
    }

    this.dispatchPose(pose);

    if (this.isRunning) {
      this.animationFrame = requestAnimationFrame(() => this.processFrame());
    }
  }

  private dispatchPose(pose: HeadTrackingPose) {
    for (const listener of this.listeners) {
      listener(pose);
    }
  }

  private computeNormalizedPose(result: FaceLandmarkerResult) {
    const landmarks = result.faceLandmarks[0];
    if (!landmarks) {
      return null;
    }

    const leftEye = this.averageLandmarks(landmarks, IRIS_LEFT_INDICES);
    const rightEye = this.averageLandmarks(landmarks, IRIS_RIGHT_INDICES);

    if (!leftEye || !rightEye) {
      return null;
    }

    const x = (leftEye.x + rightEye.x) / 2;
    const y = (leftEye.y + rightEye.y) / 2;
    const z = (leftEye.z + rightEye.z) / 2;

    return { x, y, z };
  }

  private averageLandmarks(
    landmarks: FaceLandmarkerResult['faceLandmarks'][number],
    indices: number[]
  ) {
    if (!indices.length) {
      return null;
    }
    const accumulator = { x: 0, y: 0, z: 0 };
    let count = 0;
    for (const index of indices) {
      const landmark = landmarks[index];
      if (!landmark) {
        continue;
      }
      accumulator.x += landmark.x;
      accumulator.y += landmark.y;
      accumulator.z += landmark.z;
      count += 1;
    }
    if (count === 0) {
      return null;
    }
    return {
      x: accumulator.x / count,
      y: accumulator.y / count,
      z: accumulator.z / count
    };
  }
}
