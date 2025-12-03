import { streamDownloadWithServiceWorker } from './exportServiceWorker';
import {
  canUseFileSystemSavePicker,
  collectStreamToBlob,
  writeStreamToFileHandle,
  type FileSystemFileHandleLike
} from '../../workers/exportPreprocessedDatasetClient';

const triggerDownloadLink = (href: string, fileName: string) => {
  const link = document.createElement('a');
  link.href = href;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

const downloadBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  try {
    triggerDownloadLink(url, fileName);
  } finally {
    URL.revokeObjectURL(url);
  }
};

const downloadStream = async (
  stream: ReadableStream<Uint8Array>,
  fileName: string,
  fileHandle: FileSystemFileHandleLike | null
) => {
  if (fileHandle) {
    await writeStreamToFileHandle(stream, fileHandle);
    return;
  }

  if (!canUseFileSystemSavePicker()) {
    const serviceWorkerDownload = await streamDownloadWithServiceWorker({
      stream,
      fileName,
      contentType: 'application/zip'
    });

    if (serviceWorkerDownload) {
      triggerDownloadLink(serviceWorkerDownload.downloadUrl, fileName);
      await serviceWorkerDownload.completion;
      return;
    }
  }

  const blob = await collectStreamToBlob(stream);
  downloadBlob(blob, fileName);
};

const sanitizeExportFileName = (value: string): string => {
  const withoutExtension = value.replace(/\.[^/.]+$/, '').trim();
  const fallback = withoutExtension || 'preprocessed-experiment';
  const sanitized = fallback
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return sanitized || 'preprocessed-experiment';
};

export { triggerDownloadLink, downloadBlob, downloadStream, sanitizeExportFileName };
