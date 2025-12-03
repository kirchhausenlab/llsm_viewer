import { ensureArrayBuffer } from '../../shared/utils/buffer';

const ZIP_MIME_TYPE = 'application/zip';

export type FilePickerAcceptType = {
  description?: string;
  accept: Record<string, string[]>;
};

export type SaveFilePickerOptions = {
  suggestedName?: string;
  types?: FilePickerAcceptType[];
};

export type FileSystemWritableFileStreamLike = WritableStream<Uint8Array> & {
  abort?: (reason?: unknown) => Promise<void>;
};

export type FileSystemFileHandleLike = {
  createWritable(): Promise<FileSystemWritableFileStreamLike>;
};

const ZIP_ACCEPT: FilePickerAcceptType = {
  description: 'ZIP archive',
  accept: { [ZIP_MIME_TYPE]: ['.zip'] }
};

function getShowSaveFilePicker():
  | ((options?: SaveFilePickerOptions) => Promise<FileSystemFileHandleLike>)
  | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }

  const candidate = (window as Window & {
    showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<FileSystemFileHandleLike>;
  }).showSaveFilePicker;

  return typeof candidate === 'function' ? candidate : undefined;
}

export function canUseFileSystemSavePicker(): boolean {
  return typeof getShowSaveFilePicker() === 'function';
}

export function requestFileSystemSaveHandle(
  suggestedName: string
): Promise<FileSystemFileHandleLike> {
  const showSaveFilePicker = getShowSaveFilePicker();
  if (!showSaveFilePicker) {
    throw new Error('File System Access API is not available in this browser.');
  }

  return showSaveFilePicker({
    suggestedName,
    types: [ZIP_ACCEPT]
  });
}

export async function writeStreamToFileHandle(
  stream: ReadableStream<Uint8Array>,
  handle: FileSystemFileHandleLike
): Promise<void> {
  const writable = await handle.createWritable();
  try {
    await stream.pipeTo(writable);
  } catch (error) {
    if (typeof writable.abort === 'function') {
      await writable.abort(error);
    }
    throw error;
  }
}

export async function saveStreamWithFilePicker(
  stream: ReadableStream<Uint8Array>,
  suggestedName: string
): Promise<void> {
  const handle = await requestFileSystemSaveHandle(suggestedName);
  await writeStreamToFileHandle(stream, handle);
}

export async function collectStreamToBlob(
  stream: ReadableStream<Uint8Array>,
  type: string = ZIP_MIME_TYPE
): Promise<Blob> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      if (value) {
        chunks.push(value);
      }
    }
  } finally {
    reader.releaseLock();
  }

  const blobParts = chunks.map((chunk) => ensureArrayBuffer(chunk));
  const blob = new Blob(blobParts, { type });
  chunks.length = 0;

  return blob;
}

export { ZIP_MIME_TYPE };
