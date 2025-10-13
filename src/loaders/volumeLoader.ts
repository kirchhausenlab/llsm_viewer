import type { VolumePayload } from '../types/volume';
import VolumeWorker from '../workers/volumeLoader.worker?worker';

export type VolumeLoadCallbacks = {
  onVolumeLoaded?: (index: number, payload: VolumePayload) => void;
};

export async function loadVolumesFromFiles(
  files: File[],
  callbacks: VolumeLoadCallbacks = {}
): Promise<VolumePayload[]> {
  if (files.length === 0) {
    return [];
  }

  return new Promise<VolumePayload[]>((resolve, reject) => {
    const worker = new VolumeWorker();
    const requestId = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
    const volumes: VolumePayload[] = new Array(files.length);

    const cleanup = () => {
      worker.terminate();
    };

    worker.onmessage = (event) => {
      const message = event.data as
        | { type: 'volume-loaded'; requestId: number; index: number; payload: VolumePayload }
        | { type: 'complete'; requestId: number }
        | { type: 'error'; requestId: number; message: string };

      if (!message || message.requestId !== requestId) {
        return;
      }

      switch (message.type) {
        case 'volume-loaded': {
          volumes[message.index] = message.payload;
          if (callbacks.onVolumeLoaded) {
            try {
              callbacks.onVolumeLoaded(message.index, message.payload);
            } catch (error) {
              cleanup();
              reject(error instanceof Error ? error : new Error(String(error)));
              return;
            }
          }
          break;
        }
        case 'complete':
          cleanup();
          resolve(volumes);
          break;
        case 'error':
          cleanup();
          reject(new Error(message.message));
          break;
        default:
          break;
      }
    };

    worker.onerror = (event) => {
      cleanup();
      reject(event.error instanceof Error ? event.error : new Error(event.message ?? 'Worker error'));
    };

    worker.postMessage({ type: 'load-volumes', requestId, files });
  });
}
