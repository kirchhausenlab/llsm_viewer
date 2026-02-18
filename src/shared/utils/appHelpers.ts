import { DEFAULT_LAYER_COLOR, normalizeHexColor } from '../colorMaps/layerColors';
import { normalizeTrackColor } from '../colorMaps/trackColors';

export const applyAlphaToHex = (hexColor: string, alpha: number): string => {
  const normalized = normalizeHexColor(hexColor, DEFAULT_LAYER_COLOR);
  const clampedAlpha = Number.isFinite(alpha) ? Math.min(Math.max(alpha, 0), 1) : 1;
  const r = Number.parseInt(normalized.slice(1, 3), 16);
  const g = Number.parseInt(normalized.slice(3, 5), 16);
  const b = Number.parseInt(normalized.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${clampedAlpha})`;
};

export const getTrackTabTextColor = (hexColor: string): string => {
  const normalized = normalizeTrackColor(hexColor, '#ffffff');
  const r = Number.parseInt(normalized.slice(1, 3), 16) / 255;
  const g = Number.parseInt(normalized.slice(3, 5), 16) / 255;
  const b = Number.parseInt(normalized.slice(5, 7), 16) / 255;
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.58 ? '#0b1220' : '#ffffff';
};

export const createSegmentationSeed = (layerKey: string, volumeIndex: number): number => {
  let hash = 2166136261;
  for (let i = 0; i < layerKey.length; i++) {
    hash ^= layerKey.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const mixed = (hash ^ Math.imul(volumeIndex + 1, 0x9e3779b1)) >>> 0;
  return mixed === 0 ? 0xdeadbeef : mixed;
};

type FileSystemEntryLike = {
  isFile: boolean;
  isDirectory: boolean;
  fullPath: string;
};

type FileSystemFileEntryLike = FileSystemEntryLike & {
  isFile: true;
  isDirectory: false;
  file(
    successCallback: (file: File) => void,
    errorCallback?: (error: DOMException) => void
  ): void;
};

type FileSystemDirectoryReaderLike = {
  readEntries(
    successCallback: (entries: FileSystemEntryLike[]) => void,
    errorCallback?: (error: DOMException) => void
  ): void;
};

type FileSystemDirectoryEntryLike = FileSystemEntryLike & {
  isFile: false;
  isDirectory: true;
  createReader(): FileSystemDirectoryReaderLike;
};

const isFileEntry = (entry: FileSystemEntryLike): entry is FileSystemFileEntryLike => entry.isFile;

const isDirectoryEntry = (entry: FileSystemEntryLike): entry is FileSystemDirectoryEntryLike =>
  entry.isDirectory;

async function getFilesFromFileEntry(entry: FileSystemFileEntryLike): Promise<File[]> {
  return new Promise((resolve, reject) => {
    entry.file(
      (file) => {
        const relativePath = entry.fullPath.replace(/^\//, '');
        if (relativePath && relativePath !== file.name) {
          try {
            Object.defineProperty(file, 'webkitRelativePath', {
              value: relativePath,
              configurable: true
            });
          } catch (err) {
            (file as File & { webkitRelativePath?: string }).webkitRelativePath = relativePath;
          }
        }
        resolve([file]);
      },
      (error) => {
        reject(new Error(`Failed to read file entry "${entry.fullPath}": ${error.message}`));
      }
    );
  });
}

async function readAllDirectoryEntries(
  reader: FileSystemDirectoryReaderLike
): Promise<FileSystemEntryLike[]> {
  return new Promise((resolve, reject) => {
    reader.readEntries(
      async (entries) => {
        if (entries.length === 0) {
          resolve([]);
          return;
        }
        const remainder = await readAllDirectoryEntries(reader);
        resolve([...entries, ...remainder]);
      },
      (error) => {
        reject(new Error(`Failed to read directory entries: ${error.message}`));
      }
    );
  });
}

async function getFilesFromDirectoryEntry(entry: FileSystemDirectoryEntryLike): Promise<File[]> {
  const reader = entry.createReader();
  const entries = await readAllDirectoryEntries(reader);
  const nestedFiles: File[] = [];
  for (const nested of entries) {
    nestedFiles.push(...(await getFilesFromEntry(nested)));
  }
  return nestedFiles;
}

async function getFilesFromEntry(entry: FileSystemEntryLike): Promise<File[]> {
  if (isFileEntry(entry)) {
    return getFilesFromFileEntry(entry);
  }
  if (isDirectoryEntry(entry)) {
    return getFilesFromDirectoryEntry(entry);
  }
  return [];
}

export const dedupeFiles = (files: File[]): File[] => {
  const seen = new Set<string>();
  const result: File[] = [];
  for (const file of files) {
    const key = file.webkitRelativePath || file.name;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(file);
  }
  return result;
};

export async function collectFilesFromDataTransfer(dataTransfer: DataTransfer): Promise<File[]> {
  const items = dataTransfer.items ? Array.from(dataTransfer.items) : [];
  const collected: File[] = [];

  for (const item of items) {
    if (item.kind !== 'file') {
      continue;
    }
    const entry = (item as DataTransferItem & {
      webkitGetAsEntry?: () => FileSystemEntryLike | null;
    }).webkitGetAsEntry?.();
    if (entry) {
      collected.push(...(await getFilesFromEntry(entry)));
      continue;
    }
    const file = item.getAsFile();
    if (file) {
      collected.push(file);
    }
  }

  if (collected.length > 0) {
    return dedupeFiles(collected);
  }

  return dedupeFiles(dataTransfer.files ? Array.from(dataTransfer.files) : []);
}

const getFileSortKey = (file: File) => file.webkitRelativePath || file.name;

export const sortVolumeFiles = (files: File[]): File[] =>
  [...files].sort((a, b) =>
    getFileSortKey(a).localeCompare(getFileSortKey(b), undefined, {
      numeric: true,
      sensitivity: 'base'
    })
  );

const getTopLevelFolderName = (file: File): string | null => {
  const relative = file.webkitRelativePath;
  if (!relative) {
    return null;
  }
  const segments = relative.split('/').filter(Boolean);
  if (segments.length <= 1) {
    return null;
  }
  return segments[0] ?? null;
};

export const groupFilesIntoLayers = (files: File[]): File[][] => {
  const groups = new Map<string | null, File[]>();
  let hasFolder = false;

  for (const file of files) {
    const folder = getTopLevelFolderName(file);
    if (folder) {
      hasFolder = true;
    }
    const key = folder ?? null;
    const existing = groups.get(key);
    if (existing) {
      existing.push(file);
    } else {
      groups.set(key, [file]);
    }
  }

  if (!hasFolder) {
    return files.length > 0 ? [files] : [];
  }

  return [...groups.entries()]
    .sort((a, b) => (a[0] ?? '').localeCompare(b[0] ?? '', undefined, { numeric: true }))
    .map(([, value]) => value);
};

export const hasTiffExtension = (name: string): boolean => {
  const lower = name.toLowerCase();
  return lower.endsWith('.tif') || lower.endsWith('.tiff');
};

export async function parseTrackCsvFile(file: File): Promise<string[][]> {
  const contents = await file.text();
  const lines = contents.split(/\r?\n/);
  const rows: string[][] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
    const columns = line.split(',');
    if (columns.length !== 8) {
      throw new Error('CSV file must contain exactly 8 comma-separated columns per row.');
    }
    rows.push(columns.map((value) => value.trim()));
  }

  return rows;
}
