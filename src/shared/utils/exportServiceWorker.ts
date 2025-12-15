const baseUrl = new URL(import.meta.env.BASE_URL ?? '/', window.location.origin);
const BASE_PATH = baseUrl.pathname;
const EXPORT_SW_URL = new URL('export-sw.js', baseUrl).pathname;
const EXPORT_ROUTE_PREFIX = new URL('__export__/', baseUrl).pathname;
const DEFAULT_CONTENT_TYPE = 'application/zip';
const ACK_TIMEOUT_MS = 5000;

let registrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;
let readyPromise: Promise<ServiceWorkerRegistration | null> | null = null;

function isServiceWorkerSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator;
}

async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isServiceWorkerSupported()) {
    return null;
  }

  if (!registrationPromise) {
    registrationPromise = navigator.serviceWorker
      .register(EXPORT_SW_URL)
      .catch((error) => {
        console.warn('Failed to register export service worker.', error);
        return null;
      });
  }

  return registrationPromise;
}

async function waitForReadyRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!isServiceWorkerSupported()) {
    return null;
  }

  if (!readyPromise) {
    readyPromise = (async () => {
      const registration = await registerServiceWorker();
      if (!registration) {
        return null;
      }
      try {
        return await navigator.serviceWorker.ready;
      } catch (error) {
        console.warn('Failed to await service worker readiness.', error);
        return registration.active ? registration : null;
      }
    })();
  }

  return readyPromise;
}

async function waitForController(): Promise<ServiceWorker | null> {
  if (!isServiceWorkerSupported()) {
    return null;
  }

  const registration = await waitForReadyRegistration();
  if (!registration) {
    return null;
  }

  if (navigator.serviceWorker.controller) {
    return navigator.serviceWorker.controller;
  }

  return new Promise((resolve) => {
    const timeout = window.setTimeout(() => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      resolve(navigator.serviceWorker.controller ?? registration.active ?? null);
    }, ACK_TIMEOUT_MS);

    const onControllerChange = () => {
      window.clearTimeout(timeout);
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      resolve(navigator.serviceWorker.controller ?? registration.active ?? null);
    };

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
  });
}

export function ensureExportServiceWorkerRegistered(): void {
  if (!isServiceWorkerSupported()) {
    return;
  }
  void registerServiceWorker();
}

function createSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

type StreamDownloadOptions = {
  stream: ReadableStream<Uint8Array>;
  fileName: string;
  contentType?: string;
};

type ServiceWorkerDownloadResult = {
  downloadUrl: string;
  completion: Promise<void>;
};

async function sendInitMessage(worker: ServiceWorker, id: string, fileName: string, contentType: string): Promise<void> {
  const channel = new MessageChannel();

  const ackPromise = new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      channel.port1.onmessage = null;
      channel.port1.close();
      reject(new Error('Timed out waiting for service worker acknowledgement.'));
    }, ACK_TIMEOUT_MS);

    channel.port1.onmessage = (event) => {
      const data = event.data;
      if (!data || typeof data !== 'object') {
        return;
      }
      if (data.type === 'EXPORT_READY') {
        window.clearTimeout(timeout);
        channel.port1.onmessage = null;
        channel.port1.close();
        resolve();
        return;
      }
      if (data.type === 'EXPORT_ERROR') {
        window.clearTimeout(timeout);
        channel.port1.onmessage = null;
        channel.port1.close();
        reject(new Error(typeof data.message === 'string' ? data.message : 'Failed to initialize export.'));
      }
    };
  });

  worker.postMessage(
    {
      type: 'EXPORT_INIT',
      id,
      fileName,
      contentType
    },
    [channel.port2]
  );

  await ackPromise;
}

async function pumpStreamToWorker(
  worker: ServiceWorker,
  id: string,
  stream: ReadableStream<Uint8Array>
): Promise<void> {
  const reader = stream.getReader();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      if (value) {
        const buffer = value.buffer;
        const offset = value.byteOffset;
        const length = value.byteLength;
        if (length > 0) {
          worker.postMessage(
            {
              type: 'EXPORT_CHUNK',
              id,
              chunk: buffer,
              offset,
              length
            },
            [buffer]
          );
        }
      }
    }
    worker.postMessage({ type: 'EXPORT_COMPLETE', id });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? 'Unknown error');
    worker.postMessage({ type: 'EXPORT_ERROR', id, message });
    throw error;
  } finally {
    reader.releaseLock();
  }
}

export async function streamDownloadWithServiceWorker(
  options: StreamDownloadOptions
): Promise<ServiceWorkerDownloadResult | null> {
  if (!isServiceWorkerSupported()) {
    return null;
  }

  const controller = await waitForController();
  if (!controller) {
    return null;
  }

  const fileName = options.fileName || 'download.zip';
  const contentType = options.contentType || DEFAULT_CONTENT_TYPE;
  const sessionId = createSessionId();
  const downloadUrl = `${window.location.origin}${EXPORT_ROUTE_PREFIX}${sessionId}`;

  try {
    await sendInitMessage(controller, sessionId, fileName, contentType);
  } catch (error) {
    console.warn('Export service worker declined stream fallback.', error);
    return null;
  }

  const completion = pumpStreamToWorker(controller, sessionId, options.stream);

  return { downloadUrl, completion };
}
