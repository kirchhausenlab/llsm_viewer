const EXPORT_ROUTE_PREFIX = '/__export__/';
const DEFAULT_CONTENT_TYPE = 'application/zip';

const activeExports = new Map();

function cleanupExport(id) {
  const session = activeExports.get(id);
  if (!session) {
    return;
  }
  session.controller = null;
  session.chunks.length = 0;
  activeExports.delete(id);
}

function createContentDisposition(filename) {
  const sanitized = filename.replace(/["\r\n]/g, '_');
  const encoded = encodeURIComponent(filename);
  return `attachment; filename="${sanitized}"; filename*=UTF-8''${encoded}`;
}

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || typeof data !== 'object') {
    return;
  }

  const { type, id } = data;
  if (typeof type !== 'string' || typeof id !== 'string') {
    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage({ type: 'EXPORT_ERROR', message: 'Invalid export message.' });
    }
    return;
  }

  if (type === 'EXPORT_INIT') {
    const fileName = typeof data.fileName === 'string' && data.fileName.length > 0 ? data.fileName : 'download.zip';
    const contentType =
      typeof data.contentType === 'string' && data.contentType.length > 0 ? data.contentType : DEFAULT_CONTENT_TYPE;

    activeExports.set(id, {
      id,
      fileName,
      contentType,
      chunks: [],
      controller: null,
      done: false,
      error: null,
      used: false
    });

    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage({ type: 'EXPORT_READY' });
    }
    return;
  }

  const session = activeExports.get(id);
  if (!session) {
    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage({ type: 'EXPORT_ERROR', message: 'Export session not found.' });
    }
    return;
  }

  if (type === 'EXPORT_CHUNK') {
    const buffer = data.chunk;
    if (!(buffer instanceof ArrayBuffer)) {
      return;
    }
    const offset = typeof data.offset === 'number' ? data.offset : 0;
    const length = typeof data.length === 'number' ? data.length : buffer.byteLength - offset;
    if (length <= 0) {
      return;
    }
    const view = new Uint8Array(buffer, offset, length);
    if (session.controller) {
      try {
        session.controller.enqueue(view);
      } catch (error) {
        cleanupExport(id);
      }
    } else {
      session.chunks.push(view);
    }
    return;
  }

  if (type === 'EXPORT_COMPLETE') {
    session.done = true;
    if (session.controller) {
      session.controller.close();
      cleanupExport(id);
    }
    return;
  }

  if (type === 'EXPORT_ERROR') {
    const message = typeof data.message === 'string' && data.message.length > 0 ? data.message : 'Export failed.';
    session.error = new Error(message);
    if (session.controller) {
      session.controller.error(session.error);
      cleanupExport(id);
    }
    return;
  }
});

self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin || !requestUrl.pathname.startsWith(EXPORT_ROUTE_PREFIX)) {
    return;
  }

  const id = requestUrl.pathname.slice(EXPORT_ROUTE_PREFIX.length);
  const session = activeExports.get(id);
  if (!session) {
    event.respondWith(new Response('Export session not found.', { status: 404 }));
    return;
  }

  if (session.used) {
    event.respondWith(new Response('Export already consumed.', { status: 410 }));
    return;
  }

  session.used = true;

  const body = new ReadableStream({
    start(controller) {
      session.controller = controller;

      if (session.error) {
        controller.error(session.error);
        cleanupExport(id);
        return;
      }

      if (session.chunks.length > 0) {
        for (const chunk of session.chunks) {
          controller.enqueue(chunk);
        }
        session.chunks.length = 0;
      }

      if (session.done) {
        controller.close();
        cleanupExport(id);
      }
    },
    cancel() {
      cleanupExport(id);
    }
  });

  const headers = new Headers({
    'Content-Type': session.contentType,
    'Content-Disposition': createContentDisposition(session.fileName)
  });

  event.respondWith(new Response(body, { headers }));
});
