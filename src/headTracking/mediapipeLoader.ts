import type { FaceLandmarkerModule } from './mediapipeTypes';

const MEDIAPIPE_VERSION = '0.10.21';
const MEDIAPIPE_CDN_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}`;
const MEDIAPIPE_MODEL_BASE =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest';

export const MEDIAPIPE_MODULE_URL = `${MEDIAPIPE_CDN_BASE}/vision_bundle.mjs`;
export const MEDIAPIPE_WASM_ROOT = `${MEDIAPIPE_CDN_BASE}/wasm`;
export const MEDIAPIPE_MODEL_ASSET_URL = `${MEDIAPIPE_MODEL_BASE}/face_landmarker.task`;

let modulePromise: Promise<FaceLandmarkerModule> | null = null;

export async function loadFaceLandmarkerModule(): Promise<FaceLandmarkerModule> {
  if (!modulePromise) {
    modulePromise = import(
      /* @vite-ignore */ MEDIAPIPE_MODULE_URL
    ) as Promise<FaceLandmarkerModule>;
  }
  return modulePromise;
}
