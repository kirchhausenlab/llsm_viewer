import type { FaceLandmarkerModule } from './mediapipeTypes';

const MEDIAPIPE_MODULE_URL =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/vision_bundle.mjs';

let modulePromise: Promise<FaceLandmarkerModule> | null = null;

export async function loadFaceLandmarkerModule(): Promise<FaceLandmarkerModule> {
  if (!modulePromise) {
    modulePromise = import(
      /* @vite-ignore */ MEDIAPIPE_MODULE_URL
    ) as Promise<FaceLandmarkerModule>;
  }
  return modulePromise;
}
