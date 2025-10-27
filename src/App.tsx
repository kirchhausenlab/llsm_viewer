import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent, FormEvent } from 'react';
import { loadVolumesFromFiles } from './loaders/volumeLoader';
import { VolumeTooLargeError, formatBytes } from './errors';
import VolumeViewer from './components/VolumeViewer';
import PlanarViewer from './components/PlanarViewer';
import {
  colorizeSegmentationVolume,
  computeNormalizationParameters,
  normalizeVolume,
  NormalizedVolume
} from './volumeProcessing';
import { clearTextureCache } from './textureCache';
import FloatingWindow from './components/FloatingWindow';
import type { TrackColorMode, TrackDefinition, TrackPoint } from './types/tracks';
import { DEFAULT_LAYER_COLOR, GRAYSCALE_COLOR_SWATCHES, normalizeHexColor } from './layerColors';
import {
  DEFAULT_TRACK_COLOR,
  getTrackColorHex,
  normalizeTrackColor,
  TRACK_COLOR_SWATCHES,
  type TrackColorOption
} from './trackColors';
import {
  chooseDropboxFiles,
  DropboxConfigurationError,
  getDropboxAppKeyInfo,
  setDropboxAppKey,
  type DropboxAppKeySource
} from './integrations/dropbox';
import './App.css';

const DEFAULT_CONTRAST = 1;
const DEFAULT_GAMMA = 1;
const DEFAULT_BRIGHTNESS = 0;
type SamplingMode = 'linear' | 'nearest';

const DEFAULT_RENDER_STYLE = 0;
const DEFAULT_SAMPLING_MODE: SamplingMode = 'linear';
const DEFAULT_FPS = 12;
const DEFAULT_TRACK_OPACITY = 0.9;
const DEFAULT_TRACK_LINE_WIDTH = 1;
const WINDOW_MARGIN = 24;
const CONTROL_WINDOW_WIDTH = 360;
const PLAYBACK_WINDOW_WIDTH = 420;
const TRACK_WINDOW_WIDTH = 340;
const LAYERS_WINDOW_VERTICAL_OFFSET = 420;
const WARNING_WINDOW_WIDTH = 360;

const createSegmentationSeed = (layerKey: string, volumeIndex: number): number => {
  let hash = 2166136261;
  for (let i = 0; i < layerKey.length; i++) {
    hash ^= layerKey.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const mixed = (hash ^ Math.imul(volumeIndex + 1, 0x9e3779b1)) >>> 0;
  return mixed === 0 ? 0xdeadbeef : mixed;
};

type LoadState = 'idle' | 'loading' | 'loaded' | 'error';

type LayerTarget = {
  key: string;
  label: string;
};

type LoadedLayer = LayerTarget & {
  channelId: string;
  volumes: NormalizedVolume[];
  isSegmentation: boolean;
};

type LayerSettings = {
  contrast: number;
  gamma: number;
  brightness: number;
  color: string;
  xOffset: number;
  yOffset: number;
  renderStyle: 0 | 1;
  invert: boolean;
  samplingMode: SamplingMode;
};

const createDefaultLayerSettings = (): LayerSettings => ({
  contrast: DEFAULT_CONTRAST,
  gamma: DEFAULT_GAMMA,
  brightness: DEFAULT_BRIGHTNESS,
  color: DEFAULT_LAYER_COLOR,
  xOffset: 0,
  yOffset: 0,
  renderStyle: DEFAULT_RENDER_STYLE,
  invert: false,
  samplingMode: DEFAULT_SAMPLING_MODE
});

type ChannelTrackState = {
  opacity: number;
  lineWidth: number;
  visibility: Record<string, boolean>;
  colorMode: TrackColorMode;
};

const createDefaultChannelTrackState = (): ChannelTrackState => ({
  opacity: DEFAULT_TRACK_OPACITY,
  lineWidth: DEFAULT_TRACK_LINE_WIDTH,
  visibility: {},
  colorMode: { type: 'random' }
});

type FollowedTrackState = {
  id: string;
  channelId: string;
} | null;

type DatasetErrorContext = 'launch' | 'interaction';

type ChannelLayerSource = {
  id: string;
  files: File[];
  isSegmentation: boolean;
};

type ChannelSource = {
  id: string;
  name: string;
  layers: ChannelLayerSource[];
  trackFile: File | null;
  trackStatus: LoadState;
  trackError: string | null;
  trackEntries: string[][];
};

const getChannelLayerSummary = (channel: ChannelSource): string => {
  if (channel.layers.length === 0) {
    return 'No volume selected';
  }
  const primaryLayer = channel.layers[0];
  const totalFiles = primaryLayer.files.length;
  const fileLabel = totalFiles === 1 ? 'file' : 'files';
  return `${totalFiles} ${fileLabel}`;
};

function hasTiffExtension(name: string) {
  const lower = name.toLowerCase();
  return lower.endsWith('.tif') || lower.endsWith('.tiff');
}

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

type FileSystemDirectoryEntryLike = FileSystemEntryLike & {
  isFile: false;
  isDirectory: true;
  createReader(): FileSystemDirectoryReaderLike;
};

type FileSystemDirectoryReaderLike = {
  readEntries(
    successCallback: (entries: FileSystemEntryLike[]) => void,
    errorCallback?: (error: DOMException) => void
  ): void;
};

const isFileEntry = (entry: FileSystemEntryLike): entry is FileSystemFileEntryLike => entry.isFile;

const isDirectoryEntry = (entry: FileSystemEntryLike): entry is FileSystemDirectoryEntryLike =>
  entry.isDirectory;

async function getFilesFromFileEntry(entry: FileSystemFileEntryLike): Promise<File[]> {
  return new Promise((resolve) => {
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
        console.warn('Failed to read file entry', error);
        resolve([]);
      }
    );
  });
}

async function readAllDirectoryEntries(
  reader: FileSystemDirectoryReaderLike
): Promise<FileSystemEntryLike[]> {
  return new Promise((resolve) => {
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
        console.warn('Failed to read directory entries', error);
        resolve([]);
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

function dedupeFiles(files: File[]): File[] {
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
}

async function collectFilesFromDataTransfer(dataTransfer: DataTransfer): Promise<File[]> {
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

function getFileSortKey(file: File) {
  return file.webkitRelativePath || file.name;
}

function sortVolumeFiles(files: File[]): File[] {
  return [...files].sort((a, b) =>
    getFileSortKey(a).localeCompare(getFileSortKey(b), undefined, {
      numeric: true,
      sensitivity: 'base'
    })
  );
}

function getTopLevelFolderName(file: File): string | null {
  const relative = file.webkitRelativePath;
  if (!relative) {
    return null;
  }
  const segments = relative.split('/').filter(Boolean);
  if (segments.length <= 1) {
    return null;
  }
  return segments[0] ?? null;
}

function groupFilesIntoLayers(files: File[]): File[][] {
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
}

async function parseTrackCsvFile(file: File): Promise<string[][]> {
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

type ChannelValidation = {
  errors: string[];
  warnings: string[];
};

const buildChannelTabMeta = (channel: ChannelSource, validation: ChannelValidation): string => {
  const parts: string[] = [getChannelLayerSummary(channel)];
  if (channel.trackEntries.length > 0) {
    parts.push('Tracks attached');
  } else if (channel.trackStatus === 'loading') {
    parts.push('Tracks loading');
  }
  if (channel.layers.length === 0) {
    parts.push('add a volume');
  } else if (validation.errors.length > 0) {
    const hasNameError = validation.errors.includes('Name this channel.');
    parts.push(hasNameError ? 'Insert channel name' : 'Needs attention');
  } else if (validation.warnings.length > 0) {
    const hasNoTracksWarning = validation.warnings.some(
      (warning) => warning === 'No tracks attached to this channel.'
    );
    parts.push(hasNoTracksWarning ? 'no tracks attached' : 'Warnings');
  }
  return parts.join(' · ');
};

type ChannelCardProps = {
  channel: ChannelSource;
  validation: ChannelValidation;
  isDisabled: boolean;
  onLayerFilesAdded: (id: string, files: File[]) => void;
  onLayerDrop: (id: string, dataTransfer: DataTransfer) => void;
  onLayerSegmentationToggle: (channelId: string, layerId: string, value: boolean) => void;
  onLayerRemove: (channelId: string, layerId: string) => void;
  onTrackFileSelected: (channelId: string, file: File | null) => void;
  onTrackDrop: (channelId: string, dataTransfer: DataTransfer) => void;
  onTrackClear: (channelId: string) => void;
};

function ChannelCard({
  channel,
  validation,
  isDisabled,
  onLayerFilesAdded,
  onLayerDrop,
  onLayerSegmentationToggle,
  onLayerRemove,
  onTrackFileSelected,
  onTrackDrop,
  onTrackClear
}: ChannelCardProps) {
  const layerInputRef = useRef<HTMLInputElement | null>(null);
  const trackInputRef = useRef<HTMLInputElement | null>(null);
  const dragCounterRef = useRef(0);
  const trackDragCounterRef = useRef(0);
  const [isLayerDragging, setIsLayerDragging] = useState(false);
  const [isTrackDragging, setIsTrackDragging] = useState(false);
  const [dropboxImportTarget, setDropboxImportTarget] = useState<'layers' | 'tracks' | null>(null);
  const [dropboxError, setDropboxError] = useState<string | null>(null);
  const [dropboxErrorContext, setDropboxErrorContext] = useState<'layers' | 'tracks' | null>(null);
  const [dropboxInfo, setDropboxInfo] = useState<string | null>(null);
  const [isDropboxConfigOpen, setIsDropboxConfigOpen] = useState(false);
  const [dropboxAppKeyInput, setDropboxAppKeyInput] = useState('');
  const [dropboxAppKeySource, setDropboxAppKeySource] = useState<DropboxAppKeySource | null>(null);

  const isDropboxImporting = dropboxImportTarget !== null;
  const primaryLayer = channel.layers[0] ?? null;

  const syncDropboxConfigState = useCallback(() => {
    const info = getDropboxAppKeyInfo();
    setDropboxAppKeyInput(info.appKey ?? '');
    setDropboxAppKeySource(info.source);
  }, []);

  useEffect(() => {
    syncDropboxConfigState();
  }, [syncDropboxConfigState]);

  useEffect(() => {
    if (isDisabled) {
      setIsLayerDragging(false);
      setIsTrackDragging(false);
      setDropboxImportTarget(null);
      setDropboxError(null);
      setDropboxErrorContext(null);
      setDropboxInfo(null);
      setIsDropboxConfigOpen(false);
    }
  }, [isDisabled]);

  const handleDropboxConfigCancel = useCallback(() => {
    setIsDropboxConfigOpen(false);
  }, []);

  const handleDropboxConfigInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setDropboxAppKeyInput(event.target.value);
      if (dropboxInfo) {
        setDropboxInfo(null);
      }
    },
    [dropboxInfo]
  );

  const handleDropboxConfigSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (dropboxAppKeySource === 'env') {
        setIsDropboxConfigOpen(false);
        return;
      }
      const trimmed = dropboxAppKeyInput.trim();
      setDropboxAppKey(trimmed ? trimmed : null);
      syncDropboxConfigState();
      setIsDropboxConfigOpen(false);
      setDropboxError(null);
      setDropboxErrorContext(null);
      setDropboxInfo(
        trimmed
          ? 'Dropbox app key saved. Try importing from Dropbox again.'
          : 'Saved Dropbox app key cleared.'
      );
    },
    [dropboxAppKeyInput, dropboxAppKeySource, syncDropboxConfigState]
  );

  const handleDropboxConfigClear = useCallback(() => {
    setDropboxAppKey(null);
    syncDropboxConfigState();
    setDropboxInfo('Saved Dropbox app key cleared.');
    setDropboxError(null);
    setDropboxErrorContext(null);
  }, [syncDropboxConfigState]);

  const handleLayerBrowse = useCallback(() => {
    if (isDisabled || isDropboxImporting) {
      return;
    }
    layerInputRef.current?.click();
  }, [isDisabled, isDropboxImporting]);

  const handleLayerInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      if (isDisabled || isDropboxImporting) {
        event.target.value = '';
        return;
      }
      const fileList = event.target.files;
      if (fileList && fileList.length > 0) {
        onLayerFilesAdded(channel.id, Array.from(fileList));
      }
      event.target.value = '';
    },
    [channel.id, isDisabled, isDropboxImporting, onLayerFilesAdded]
  );

  const handleLayerDragEnter = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (isDisabled || isDropboxImporting) {
        return;
      }
      dragCounterRef.current += 1;
      setIsLayerDragging(true);
    },
    [isDisabled, isDropboxImporting]
  );

  const handleLayerDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (isDisabled || isDropboxImporting) {
      event.dataTransfer.dropEffect = 'none';
      return;
    }
    event.dataTransfer.dropEffect = 'copy';
  }, [isDisabled, isDropboxImporting]);

  const handleLayerDragLeave = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (isDisabled || isDropboxImporting) {
        return;
      }
      dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
      if (dragCounterRef.current === 0) {
        setIsLayerDragging(false);
      }
    },
    [isDisabled, isDropboxImporting]
  );

  const handleLayerDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      dragCounterRef.current = 0;
      setIsLayerDragging(false);
      if (isDisabled || isDropboxImporting) {
        return;
      }
      const { dataTransfer } = event;
      if (!dataTransfer) {
        return;
      }
      onLayerDrop(channel.id, dataTransfer);
    },
    [channel.id, isDisabled, isDropboxImporting, onLayerDrop]
  );

  const handleDropboxImport = useCallback(async () => {
    if (isDisabled || isDropboxImporting) {
      return;
    }
    setDropboxError(null);
    setDropboxErrorContext(null);
    setDropboxInfo(null);
    setDropboxImportTarget('layers');
    try {
      const files = await chooseDropboxFiles({
        extensions: ['.tif', '.tiff'],
        multiselect: true
      });
      if (files.length > 0) {
        onLayerFilesAdded(channel.id, files);
      }
    } catch (error) {
      console.error('Failed to import from Dropbox', error);
      setDropboxErrorContext('layers');
      if (error instanceof DropboxConfigurationError) {
        syncDropboxConfigState();
        setIsDropboxConfigOpen(true);
        setDropboxError(
          'Dropbox is not configured yet. Add your Dropbox app key below to connect your account.'
        );
      } else {
        const message = error instanceof Error ? error.message : 'Failed to import files from Dropbox.';
        setDropboxError(message);
      }
    } finally {
      setDropboxImportTarget(null);
    }
  }, [
    channel.id,
    isDisabled,
    isDropboxImporting,
    onLayerFilesAdded,
    syncDropboxConfigState
  ]);

  const handleTrackDropboxImport = useCallback(async () => {
    if (isDisabled || isDropboxImporting) {
      return;
    }
    setDropboxError(null);
    setDropboxErrorContext(null);
    setDropboxInfo(null);
    setDropboxImportTarget('tracks');
    try {
      const files = await chooseDropboxFiles({
        extensions: ['.csv'],
        multiselect: false
      });
      const [file] = files;
      if (file) {
        onTrackFileSelected(channel.id, file);
      }
    } catch (error) {
      console.error('Failed to import tracks from Dropbox', error);
      setDropboxErrorContext('tracks');
      if (error instanceof DropboxConfigurationError) {
        syncDropboxConfigState();
        setIsDropboxConfigOpen(true);
        setDropboxError(
          'Dropbox is not configured yet. Add your Dropbox app key below to connect your account.'
        );
      } else {
        const message = error instanceof Error ? error.message : 'Failed to import tracks from Dropbox.';
        setDropboxError(message);
      }
    } finally {
      setDropboxImportTarget(null);
    }
  }, [
    channel.id,
    isDisabled,
    isDropboxImporting,
    onTrackFileSelected,
    syncDropboxConfigState
  ]);

  const handleTrackBrowse = useCallback(() => {
    if (isDisabled || isDropboxImporting) {
      return;
    }
    trackInputRef.current?.click();
  }, [isDisabled, isDropboxImporting]);

  const handleTrackInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      if (isDisabled || isDropboxImporting) {
        event.target.value = '';
        return;
      }
      const fileList = event.target.files;
      if (fileList && fileList.length > 0) {
        onTrackFileSelected(channel.id, fileList[0] ?? null);
      }
      event.target.value = '';
    },
    [channel.id, isDisabled, isDropboxImporting, onTrackFileSelected]
  );

  const handleTrackDragEnter = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (isDisabled || isDropboxImporting) {
        return;
      }
      trackDragCounterRef.current += 1;
      setIsTrackDragging(true);
    },
    [isDisabled, isDropboxImporting]
  );

  const handleTrackDragLeave = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (isDisabled || isDropboxImporting) {
        return;
      }
      trackDragCounterRef.current = Math.max(0, trackDragCounterRef.current - 1);
      if (trackDragCounterRef.current === 0) {
        setIsTrackDragging(false);
      }
    },
    [isDisabled, isDropboxImporting]
  );

  const handleTrackDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      trackDragCounterRef.current = 0;
      setIsTrackDragging(false);
      if (isDisabled || isDropboxImporting) {
        return;
      }
      const { dataTransfer } = event;
      if (!dataTransfer) {
        return;
      }
      onTrackDrop(channel.id, dataTransfer);
    },
    [channel.id, isDisabled, isDropboxImporting, onTrackDrop]
  );

  const trackEntryCount = channel.trackEntries.length;
  const uniqueTrackCount = useMemo(() => {
    const identifiers = new Set<string>();
    for (const row of channel.trackEntries) {
      const trackId = row[0];
      if (trackId) {
        identifiers.add(trackId);
      }
    }
    return identifiers.size;
  }, [channel.trackEntries]);

  const loadedTrackSummary = useMemo(() => {
    if (trackEntryCount === 0) {
      return 'Loaded 0 track entries.';
    }
    if (uniqueTrackCount > 0) {
      const trackLabel = uniqueTrackCount === 1 ? '1 track' : `${uniqueTrackCount} tracks`;
      if (uniqueTrackCount === trackEntryCount) {
        return `Loaded ${trackLabel}.`;
      }
      const entryLabel =
        trackEntryCount === 1 ? '1 track entry' : `${trackEntryCount} track entries`;
      return `Loaded ${trackLabel} across ${entryLabel}.`;
    }
    return trackEntryCount === 1
      ? 'Loaded 1 track entry.'
      : `Loaded ${trackEntryCount} track entries.`;
  }, [trackEntryCount, uniqueTrackCount]);

  return (
    <section className={`channel-card${isDisabled ? ' is-disabled' : ''}`} aria-disabled={isDisabled}>
      <p className="channel-layer-drop-title">Upload volume (.tif/.tiff sequence)</p>
      <div
        className={`channel-layer-drop${isLayerDragging ? ' is-active' : ''}`}
        onDragEnter={handleLayerDragEnter}
        onDragOver={handleLayerDragOver}
        onDragLeave={handleLayerDragLeave}
        onDrop={handleLayerDrop}
      >
        <input
          ref={layerInputRef}
          className="file-drop-input"
          type="file"
          accept=".tif,.tiff,.TIF,.TIFF"
          multiple
          onChange={handleLayerInputChange}
          disabled={isDisabled || isDropboxImporting}
        />
        <div className="channel-layer-drop-content">
          <button
            type="button"
            className="channel-layer-drop-button"
            onClick={handleLayerBrowse}
            disabled={isDisabled || isDropboxImporting}
          >
            From Files
          </button>
          <button
            type="button"
            className="channel-layer-drop-button"
            onClick={handleDropboxImport}
            disabled={isDisabled || isDropboxImporting}
          >
            {dropboxImportTarget === 'layers' ? 'Importing…' : 'From Dropbox'}
          </button>
          <p className="channel-layer-drop-subtitle">Or drop sequence folder here</p>
        </div>
        {dropboxImportTarget === 'layers' ? (
          <p className="channel-layer-drop-status">Importing from Dropbox…</p>
        ) : null}
        {dropboxInfo ? <p className="channel-layer-drop-info">{dropboxInfo}</p> : null}
        {dropboxError && dropboxErrorContext === 'layers' ? (
          <p className="channel-layer-drop-error">{dropboxError}</p>
        ) : null}
        {isDropboxConfigOpen ? (
          <form className="channel-dropbox-config" onSubmit={handleDropboxConfigSubmit} noValidate>
            <label className="channel-dropbox-config-label" htmlFor={`dropbox-app-key-${channel.id}`}>
              Dropbox app key
            </label>
            <input
              id={`dropbox-app-key-${channel.id}`}
              type="text"
              className="channel-dropbox-config-input"
              placeholder="slate-your-app-key"
              value={dropboxAppKeyInput}
              onChange={handleDropboxConfigInputChange}
              disabled={isDisabled || dropboxAppKeySource === 'env'}
              autoComplete="off"
            />
            <p className="channel-dropbox-config-hint">
              Generate an app key in the{' '}
              <a href="https://www.dropbox.com/developers/apps" target="_blank" rel="noreferrer">
                Dropbox App Console
              </a>{' '}
              (Scoped app with Dropbox Chooser enabled) and paste it here.
            </p>
            {dropboxAppKeySource === 'env' ? (
              <p className="channel-dropbox-config-note">
                This deployment provides a Dropbox app key. Contact your administrator to change it.
              </p>
            ) : null}
            <div className="channel-dropbox-config-actions">
              <button
                type="submit"
                className="channel-dropbox-config-save"
                disabled={isDisabled}
              >
                {dropboxAppKeySource === 'env' ? 'Close' : 'Save app key'}
              </button>
              <button
                type="button"
                className="channel-dropbox-config-cancel"
                onClick={handleDropboxConfigCancel}
              >
                Cancel
              </button>
              {dropboxAppKeySource === 'local' ? (
                <button
                  type="button"
                  className="channel-dropbox-config-clear"
                  onClick={handleDropboxConfigClear}
                >
                  Remove saved key
                </button>
              ) : null}
            </div>
          </form>
        ) : null}
      </div>
      {primaryLayer ? (
        <ul className="channel-layer-list">
          <li key={primaryLayer.id} className="channel-layer-item">
            <div className="channel-layer-header">
              <span className="channel-layer-title">Volume</span>
              <button
                type="button"
                className="channel-layer-remove"
                onClick={() => onLayerRemove(channel.id, primaryLayer.id)}
                aria-label="Remove volume"
                disabled={isDisabled}
              >
                Remove
              </button>
            </div>
            <p className="channel-layer-meta">
              {primaryLayer.files.length === 1 ? '1 file' : `${primaryLayer.files.length} files`}
            </p>
            <label className="channel-layer-flag">
              <input
                type="checkbox"
                checked={primaryLayer.isSegmentation}
                onChange={(event) =>
                  onLayerSegmentationToggle(channel.id, primaryLayer.id, event.target.checked)
                }
                disabled={isDisabled}
              />
              <span>Segmentation volume</span>
            </label>
          </li>
        </ul>
      ) : null}
      <p className="channel-tracks-title">Upload tracks (optional, .csv file)</p>
      <div
        className={`channel-tracks-drop${isTrackDragging ? ' is-active' : ''}`}
        onDragEnter={handleTrackDragEnter}
        onDragLeave={handleTrackDragLeave}
        onDragOver={handleLayerDragOver}
        onDrop={handleTrackDrop}
      >
        <input
          ref={trackInputRef}
          className="file-drop-input"
          type="file"
          accept=".csv"
          onChange={handleTrackInputChange}
          disabled={isDisabled || isDropboxImporting}
        />
        <div className="channel-tracks-content">
          <div className="channel-tracks-row">
            <div className="channel-tracks-description">
                <button
                  type="button"
                  className="channel-tracks-button"
                  onClick={handleTrackBrowse}
                  disabled={isDisabled || isDropboxImporting}
                >
                  From Files
                </button>
                <button
                  type="button"
                  className="channel-tracks-button"
                  onClick={handleTrackDropboxImport}
                  disabled={isDisabled || isDropboxImporting}
                >
                  {dropboxImportTarget === 'tracks' ? 'Importing…' : 'From Dropbox'}
                </button>
                <p className="channel-tracks-subtitle">Or drop the tracks file here</p>
            </div>
            {channel.trackFile ? (
              <button
                type="button"
                onClick={() => onTrackClear(channel.id)}
                className="channel-track-clear"
                disabled={isDisabled || isDropboxImporting}
              >
                Clear
              </button>
            ) : null}
          </div>
          {dropboxImportTarget === 'tracks' ? (
            <p className="channel-tracks-status">Importing from Dropbox…</p>
          ) : null}
          {dropboxError && dropboxErrorContext === 'tracks' ? (
            <p className="channel-tracks-error">{dropboxError}</p>
          ) : null}
          {channel.trackError ? <p className="channel-tracks-error">{channel.trackError}</p> : null}
          {channel.trackStatus === 'loading' ? <p className="channel-tracks-status">Loading tracks…</p> : null}
          {channel.trackStatus === 'loaded' ? (
            <p className="channel-tracks-status">{loadedTrackSummary}</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function App() {
  const [channels, setChannels] = useState<ChannelSource[]>([]);
  const [editingChannelId, setEditingChannelId] = useState<string | null>(null);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [datasetError, setDatasetError] = useState<string | null>(null);
  const [datasetErrorContext, setDatasetErrorContext] = useState<DatasetErrorContext | null>(null);
  const [datasetErrorResetSignal, setDatasetErrorResetSignal] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [layers, setLayers] = useState<LoadedLayer[]>([]);
  const [channelVisibility, setChannelVisibility] = useState<Record<string, boolean>>({});
  const [channelActiveLayer, setChannelActiveLayer] = useState<Record<string, string>>({});
  const [layerSettings, setLayerSettings] = useState<Record<string, LayerSettings>>({});
  const [status, setStatus] = useState<LoadState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [loadProgress, setLoadProgress] = useState(0);
  const [loadedCount, setLoadedCount] = useState(0);
  const [expectedVolumeCount, setExpectedVolumeCount] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [fps, setFps] = useState(DEFAULT_FPS);
  const [resetViewHandler, setResetViewHandler] = useState<(() => void) | null>(null);
  const [activeChannelTabId, setActiveChannelTabId] = useState<string | null>(null);
  const [activeTrackChannelId, setActiveTrackChannelId] = useState<string | null>(null);
  const [channelTrackStates, setChannelTrackStates] = useState<Record<string, ChannelTrackState>>({});
  const [followedTrack, setFollowedTrack] = useState<FollowedTrackState>(null);
  const [viewerMode, setViewerMode] = useState<'3d' | '2d'>('3d');
  const [sliceIndex, setSliceIndex] = useState(0);
  const [isViewerLaunched, setIsViewerLaunched] = useState(false);
  const [isLaunchingViewer, setIsLaunchingViewer] = useState(false);
  const [layoutResetToken, setLayoutResetToken] = useState(0);
  const [isVrSupported, setIsVrSupported] = useState(false);
  const [isVrPassthroughSupported, setIsVrPassthroughSupported] = useState(false);
  const [isVrSupportChecked, setIsVrSupportChecked] = useState(false);
  const [isVrActive, setIsVrActive] = useState(false);
  const [isVrRequesting, setIsVrRequesting] = useState(false);
  const [hasVrSessionHandlers, setHasVrSessionHandlers] = useState(false);
  const [isHelpMenuOpen, setIsHelpMenuOpen] = useState(false);
  const controlWindowInitialPosition = useMemo(
    () => ({ x: WINDOW_MARGIN, y: WINDOW_MARGIN }),
    []
  );
  const layersWindowInitialPosition = useMemo(
    () => ({ x: WINDOW_MARGIN, y: WINDOW_MARGIN + LAYERS_WINDOW_VERTICAL_OFFSET }),
    []
  );
  const [trackWindowInitialPosition, setTrackWindowInitialPosition] = useState<{ x: number; y: number }>(
    () => ({ x: WINDOW_MARGIN, y: WINDOW_MARGIN })
  );
  const computeTrackWindowDefaultPosition = useCallback(() => {
    if (typeof window === 'undefined') {
      return { x: WINDOW_MARGIN, y: WINDOW_MARGIN };
    }
    const trackWidth = Math.min(TRACK_WINDOW_WIDTH, window.innerWidth - WINDOW_MARGIN * 2);
    const nextX = Math.max(WINDOW_MARGIN, window.innerWidth - trackWidth - WINDOW_MARGIN);
    return { x: nextX, y: WINDOW_MARGIN };
  }, []);

  const loadRequestRef = useRef(0);
  const trackMasterCheckboxRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const channelIdRef = useRef(0);
  const layerIdRef = useRef(0);
  const editingChannelOriginalNameRef = useRef('');
  const editingChannelInputRef = useRef<HTMLInputElement | null>(null);
  const pendingChannelFocusIdRef = useRef<string | null>(null);
  const helpMenuRef = useRef<HTMLDivElement | null>(null);
  const vrSessionControlsRef = useRef<
    | {
        requestSession: () => Promise<XRSession | null>;
        endSession: () => Promise<void> | void;
      }
    | null
  >(null);

  const createChannelSource = useCallback(
    (name: string): ChannelSource => {
      const nextId = channelIdRef.current + 1;
      channelIdRef.current = nextId;
      return {
        id: `channel-${nextId}`,
        name,
        layers: [],
        trackFile: null,
        trackStatus: 'idle',
        trackError: null,
        trackEntries: []
      };
    },
    []
  );

  const createLayerSource = useCallback((files: File[]): ChannelLayerSource => {
    const nextId = layerIdRef.current + 1;
    layerIdRef.current = nextId;
    return {
      id: `layer-${nextId}`,
      files,
      isSegmentation: false
    };
  }, []);

  const handleRegisterVrSession = useCallback(
    (
      handlers:
        | {
            requestSession: () => Promise<XRSession | null>;
            endSession: () => Promise<void> | void;
          }
        | null
    ) => {
      vrSessionControlsRef.current = handlers;
      setHasVrSessionHandlers(Boolean(handlers));
    },
    []
  );

  const handleVrSessionStarted = useCallback(() => {
    setIsVrActive(true);
  }, []);

  const handleVrSessionEnded = useCallback(() => {
    setIsVrActive(false);
  }, []);

  const enterVr = useCallback(async () => {
    if (viewerMode !== '3d') {
      return;
    }
    if (!isVrSupportChecked || !isVrSupported) {
      return;
    }
    const controls = vrSessionControlsRef.current;
    if (!controls) {
      return;
    }
    setIsVrRequesting(true);
    setFollowedTrack(null);
    try {
      await controls.requestSession();
    } catch (error) {
      console.error('Failed to start VR session', error);
    } finally {
      setIsVrRequesting(false);
    }
  }, [isVrSupportChecked, isVrSupported, setFollowedTrack, viewerMode]);

  const exitVr = useCallback(async () => {
    const controls = vrSessionControlsRef.current;
    if (!controls) {
      return;
    }
    try {
      await Promise.resolve(controls.endSession());
    } catch (error) {
      console.error('Failed to end VR session', error);
    }
  }, []);

  const handleVrButtonClick = useCallback(() => {
    if (isVrActive) {
      void exitVr();
    } else {
      void enterVr();
    }
  }, [enterVr, exitVr, isVrActive]);

  useEffect(() => {
    if (editingChannelId && editingChannelId !== activeChannelId) {
      setEditingChannelId(null);
    }
  }, [activeChannelId, editingChannelId]);

  useEffect(() => {
    if (!isViewerLaunched) {
      setIsHelpMenuOpen(false);
    }
  }, [isViewerLaunched]);

  useEffect(() => {
    if (!isHelpMenuOpen) {
      return;
    }

    const handleDocumentClick = (event: MouseEvent) => {
      const container = helpMenuRef.current;
      if (!container) {
        return;
      }

      if (!container.contains(event.target as Node)) {
        setIsHelpMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsHelpMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleDocumentClick);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleDocumentClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isHelpMenuOpen]);

  useEffect(() => {
    if (datasetError && datasetErrorContext === 'launch') {
      setDatasetErrorResetSignal((value) => value + 1);
    }
  }, [datasetError, datasetErrorContext]);

  useEffect(() => {
    const pendingChannelId = pendingChannelFocusIdRef.current;
    if (!pendingChannelId) {
      return;
    }
    const pendingChannel = channels.find((channel) => channel.id === pendingChannelId);
    if (!pendingChannel) {
      pendingChannelFocusIdRef.current = null;
      return;
    }
    pendingChannelFocusIdRef.current = null;
    setActiveChannelId(pendingChannelId);
    editingChannelOriginalNameRef.current = pendingChannel.name;
    setEditingChannelId(pendingChannelId);
  }, [channels]);

  useEffect(() => {
    if (editingChannelId && !channels.some((channel) => channel.id === editingChannelId)) {
      setEditingChannelId(null);
    }
  }, [channels, editingChannelId]);

  useEffect(() => {
    if (isLaunchingViewer) {
      setEditingChannelId(null);
    }
  }, [isLaunchingViewer]);

  useEffect(() => {
    if (editingChannelId) {
      editingChannelInputRef.current?.focus();
      editingChannelInputRef.current?.select();
    }
  }, [editingChannelId]);

  useEffect(() => {
    if (channels.length === 0) {
      if (activeChannelId !== null) {
        setActiveChannelId(null);
      }
      return;
    }
    if (!activeChannelId || !channels.some((channel) => channel.id === activeChannelId)) {
      setActiveChannelId(channels[0].id);
    }
  }, [activeChannelId, channels]);

  useEffect(() => {
    let isCancelled = false;

    const detectVrSupport = async () => {
      if (typeof navigator === 'undefined' || !navigator.xr) {
        if (!isCancelled) {
          setIsVrSupported(false);
          setIsVrSupportChecked(true);
        }
        return;
      }

      const xr = navigator.xr as { requestSession?: unknown; isSessionSupported?: unknown } | undefined;
      const requestSession =
        xr && typeof xr.requestSession === 'function'
          ? (xr.requestSession as (mode: string, options?: unknown) => Promise<XRSession>)
          : null;
      const isSessionSupportedFn =
        xr && typeof xr.isSessionSupported === 'function'
          ? (xr.isSessionSupported as (mode: string) => Promise<boolean>)
          : null;
      const hasRequestSession = Boolean(requestSession);

      const markSupport = (supported: boolean, passthrough: boolean) => {
        if (!isCancelled) {
          setIsVrSupported(supported);
          setIsVrPassthroughSupported(passthrough);
          setIsVrSupportChecked(true);
        }
      };

      if (!xr || !isSessionSupportedFn) {
        if (hasRequestSession) {
          console.warn('WebXR isSessionSupported unavailable; falling back to optimistic VR enablement.');
          markSupport(true, false);
        } else {
          markSupport(false, false);
        }
        return;
      }

      try {
        let immersiveVrSupported = false;
        let immersiveArSupported = false;
        try {
          immersiveVrSupported = await isSessionSupportedFn.call(navigator.xr!, 'immersive-vr');
        } catch (error) {
          console.warn('Failed to detect immersive-vr support', error);
        }

        try {
          immersiveArSupported = await isSessionSupportedFn.call(navigator.xr!, 'immersive-ar');
        } catch (error) {
          console.warn('Failed to detect immersive-ar support', error);
        }

        if (immersiveVrSupported || immersiveArSupported) {
          markSupport(true, immersiveArSupported);
          return;
        }

        if (hasRequestSession) {
          console.warn(
            'WebXR immersive session probe reported unsupported; falling back to optimistic VR enablement.'
          );
          markSupport(true, immersiveArSupported);
        } else {
          markSupport(false, immersiveArSupported);
        }
      } catch (error) {
        console.warn('Failed to detect WebXR support', error);
        if (hasRequestSession) {
          markSupport(true, false);
        } else {
          markSupport(false, false);
        }
      }
    };

    detectVrSupport();

    return () => {
      isCancelled = true;
    };
  }, []);

  const volumeTimepointCount = layers.length > 0 ? layers[0].volumes.length : 0;
  const channelNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const channel of channels) {
      map.set(channel.id, channel.name.trim() || 'Untitled channel');
    }
    return map;
  }, [channels]);
  const channelLayersMap = useMemo(() => {
    const map = new Map<string, LoadedLayer[]>();
    for (const layer of layers) {
      const collection = map.get(layer.channelId);
      if (collection) {
        collection.push(layer);
      } else {
        map.set(layer.channelId, [layer]);
      }
    }
    return map;
  }, [layers]);
  const loadedChannelIds = useMemo(() => {
    const seen = new Set<string>();
    const order: string[] = [];
    for (const layer of layers) {
      if (!seen.has(layer.channelId)) {
        seen.add(layer.channelId);
        order.push(layer.channelId);
      }
    }
    return order;
  }, [layers]);
  const parsedTracksByChannel = useMemo(() => {
    const map = new Map<string, TrackDefinition[]>();

    for (const channel of channels) {
      const entries = channel.trackEntries;
      if (entries.length === 0) {
        map.set(channel.id, []);
        continue;
      }

      const trackMap = new Map<number, TrackPoint[]>();

      for (const row of entries) {
        if (row.length < 6) {
          continue;
        }

        const rawId = Number(row[0]);
        const initialTime = Number(row[1]);
        const deltaTime = Number(row[2]);
        const x = Number(row[3]);
        const y = Number(row[4]);
        const z = Number(row[5]);

        if (
          !Number.isFinite(rawId) ||
          !Number.isFinite(initialTime) ||
          !Number.isFinite(deltaTime) ||
          !Number.isFinite(x) ||
          !Number.isFinite(y) ||
          !Number.isFinite(z)
        ) {
          continue;
        }

        const id = Math.trunc(rawId);
        const time = initialTime + deltaTime;
        const normalizedTime = Math.max(0, time - 1);
        const point: TrackPoint = { time: normalizedTime, x, y, z };
        const existing = trackMap.get(id);
        if (existing) {
          existing.push(point);
        } else {
          trackMap.set(id, [point]);
        }
      }

      const channelName = channel.name.trim() || 'Untitled channel';
      const parsed: TrackDefinition[] = [];

      const sortedEntries = Array.from(trackMap.entries()).sort((a, b) => a[0] - b[0]);
      sortedEntries.forEach(([sourceTrackId, points], index) => {
        if (points.length === 0) {
          return;
        }

        const sortedPoints = [...points].sort((a, b) => a.time - b.time);
        const adjustedPoints = sortedPoints.map<TrackPoint>((point) => ({
          time: point.time,
          x: point.x,
          y: point.y,
          z: point.z
        }));

        parsed.push({
          id: `${channel.id}:${sourceTrackId}`,
          channelId: channel.id,
          channelName,
          trackNumber: index + 1,
          sourceTrackId,
          points: adjustedPoints
        });
      });

      map.set(channel.id, parsed);
    }

    return map;
  }, [channels]);

  const parsedTracks = useMemo(() => {
    const ordered: TrackDefinition[] = [];
    for (const channel of channels) {
      const channelTracks = parsedTracksByChannel.get(channel.id) ?? [];
      ordered.push(...channelTracks);
    }
    return ordered;
  }, [channels, parsedTracksByChannel]);

  const trackLookup = useMemo(() => {
    const map = new Map<string, TrackDefinition>();
    for (const track of parsedTracks) {
      map.set(track.id, track);
    }
    return map;
  }, [parsedTracks]);

  const hasParsedTrackData = parsedTracks.length > 0;
  const handleRegisterReset = useCallback((handler: (() => void) | null) => {
    setResetViewHandler(() => handler);
  }, []);

  const handleReturnToLauncher = useCallback(() => {
    if (typeof window !== 'undefined') {
      const confirmed = window.confirm(
        'Do you really want to return? The current session will be discarded'
      );
      if (!confirmed) {
        return;
      }
    }
    setIsViewerLaunched(false);
  }, [setIsViewerLaunched]);

  const handleResetWindowLayout = useCallback(() => {
    setLayoutResetToken((value) => value + 1);
    setTrackWindowInitialPosition(computeTrackWindowDefaultPosition());
  }, [computeTrackWindowDefaultPosition]);

  useEffect(() => {
    const defaultPosition = computeTrackWindowDefaultPosition();
    setTrackWindowInitialPosition((current) => {
      if (current.x === defaultPosition.x && current.y === defaultPosition.y) {
        return current;
      }
      return defaultPosition;
    });
  }, [computeTrackWindowDefaultPosition]);

  useEffect(() => {
    setChannelTrackStates((current) => {
      const next: Record<string, ChannelTrackState> = {};
      let changed = false;

      for (const channel of channels) {
        const channelId = channel.id;
        const existing = current[channelId] ?? createDefaultChannelTrackState();
        const tracks = parsedTracksByChannel.get(channelId) ?? [];

        const visibility: Record<string, boolean> = {};
        let visibilityChanged = false;
        for (const track of tracks) {
          const previous = existing.visibility[track.id];
          if (previous === undefined) {
            visibilityChanged = true;
          }
          visibility[track.id] = previous ?? true;
        }

        for (const key of Object.keys(existing.visibility)) {
          if (!(key in visibility)) {
            visibilityChanged = true;
            break;
          }
        }

        let nextState = existing;
        if (visibilityChanged) {
          nextState = { ...nextState, visibility };
        }

        next[channelId] = nextState;
        if (!current[channelId] || nextState !== existing) {
          changed = true;
        }
      }

      if (Object.keys(current).length !== channels.length) {
        changed = true;
      }

      return changed ? next : current;
    });
  }, [channels, parsedTracksByChannel]);

  useEffect(() => {
    setFollowedTrack((current) => {
      if (!current) {
        return current;
      }
      if (trackLookup.has(current.id)) {
        return current;
      }
      return null;
    });
  }, [trackLookup]);

  const showLaunchError = useCallback((message: string) => {
    setDatasetError(message);
    setDatasetErrorContext('launch');
  }, []);

  const showInteractionWarning = useCallback((message: string) => {
    setDatasetError(message);
    setDatasetErrorContext('interaction');
  }, []);

  const clearDatasetError = useCallback(() => {
    setDatasetError(null);
    setDatasetErrorContext(null);
  }, []);

  const loadSelectedDataset = useCallback(async () => {
    clearDatasetError();
    const flatLayerSources = channels
      .flatMap((channel) =>
        channel.layers.map((layer) => ({
          channelId: channel.id,
          channelLabel: channel.name.trim() || 'Untitled channel',
          key: layer.id,
          label: 'Volume',
          files: sortVolumeFiles(layer.files),
          isSegmentation: layer.isSegmentation
        }))
      )
      .filter((entry) => entry.files.length > 0);

    if (flatLayerSources.length === 0) {
      const message = 'Add a volume before launching the viewer.';
      showLaunchError(message);
      return false;
    }

    const requestId = loadRequestRef.current + 1;
    loadRequestRef.current = requestId;

    setStatus('loading');
    setError(null);
    clearTextureCache();
    setLayers([]);
    setChannelVisibility({});
    setChannelActiveLayer({});
    setLayerSettings({});
    setSelectedIndex(0);
    setIsPlaying(false);
    setLoadProgress(0);
    setLoadedCount(0);
    setExpectedVolumeCount(0);
    setActiveChannelTabId(null);

    const referenceFiles = flatLayerSources[0]?.files ?? [];
    const totalExpectedVolumes = referenceFiles.length * flatLayerSources.length;
    if (totalExpectedVolumes === 0) {
      const message = 'The selected dataset does not contain any TIFF files.';
      showLaunchError(message);
      setStatus('error');
      setError(message);
      return false;
    }

    setExpectedVolumeCount(totalExpectedVolumes);

    try {
      for (const layer of flatLayerSources) {
        if (layer.files.length !== referenceFiles.length) {
          throw new Error(
            `Channel "${layer.channelLabel}" has ${layer.files.length} timepoints, but the first channel has ${referenceFiles.length}.`
          );
        }
      }

      let referenceShape: { width: number; height: number; depth: number } | null = null;

      const rawLayers = await Promise.all(
        flatLayerSources.map(async (layer) => {
          const volumes = await loadVolumesFromFiles(layer.files, {
            onVolumeLoaded: (_index, volume) => {
              if (loadRequestRef.current !== requestId) {
                return;
              }

              if (!referenceShape) {
                referenceShape = {
                  width: volume.width,
                  height: volume.height,
                  depth: volume.depth
                };
              } else if (
                volume.width !== referenceShape.width ||
                volume.height !== referenceShape.height ||
                volume.depth !== referenceShape.depth
              ) {
                throw new Error(
                  `Channel "${layer.channelLabel}" has volume dimensions ${volume.width}×${volume.height}×${volume.depth} that do not match the reference shape ${referenceShape.width}×${referenceShape.height}×${referenceShape.depth}.`
                );
              }

              setLoadedCount((current) => {
                if (loadRequestRef.current !== requestId) {
                  return current;
                }
                const next = current + 1;
                setLoadProgress(next / totalExpectedVolumes);
                return next;
              });
            }
          });
          return { layer, volumes };
        })
      );

      if (loadRequestRef.current !== requestId) {
        return false;
      }

      const normalizedLayers: LoadedLayer[] = rawLayers.map(({ layer, volumes }) => {
        const normalizedVolumes = layer.isSegmentation
          ? volumes.map((rawVolume, volumeIndex) =>
              colorizeSegmentationVolume(rawVolume, createSegmentationSeed(layer.key, volumeIndex))
            )
          : (() => {
              const normalizationParameters = computeNormalizationParameters(volumes);
              return volumes.map((rawVolume) => normalizeVolume(rawVolume, normalizationParameters));
            })();
        return {
          key: layer.key,
          label: layer.label,
          channelId: layer.channelId,
          volumes: normalizedVolumes,
          isSegmentation: layer.isSegmentation
        };
      });

      clearTextureCache();
      setLayers(normalizedLayers);
      const visibilityDefaults = normalizedLayers.reduce<Record<string, boolean>>((acc, layer) => {
        if (!(layer.channelId in acc)) {
          acc[layer.channelId] = true;
        }
        return acc;
      }, {});
      const activeLayerDefaults = normalizedLayers.reduce<Record<string, string>>((acc, layer) => {
        if (!(layer.channelId in acc)) {
          acc[layer.channelId] = layer.key;
        }
        return acc;
      }, {});
      setChannelVisibility(visibilityDefaults);
      setChannelActiveLayer(activeLayerDefaults);
      setLayerSettings(
        normalizedLayers.reduce<Record<string, LayerSettings>>((acc, layer) => {
          acc[layer.key] = createDefaultLayerSettings();
          return acc;
        }, {})
      );
      setSelectedIndex(0);
      setActiveChannelTabId(Object.keys(activeLayerDefaults)[0] ?? null);
      setStatus('loaded');
      setLoadedCount(totalExpectedVolumes);
      setLoadProgress(1);
      clearDatasetError();
      return true;
    } catch (err) {
      if (loadRequestRef.current !== requestId) {
        return false;
      }
      console.error(err);
      setStatus('error');
      clearTextureCache();
      setLayers([]);
      setChannelVisibility({});
      setChannelActiveLayer({});
      setLayerSettings({});
      setSelectedIndex(0);
      setActiveChannelTabId(null);
      setLoadProgress(0);
      setLoadedCount(0);
      setExpectedVolumeCount(0);
      setIsPlaying(false);
      const message =
        err instanceof VolumeTooLargeError
          ? (() => {
              const size = formatBytes(err.requiredBytes);
              const limit = formatBytes(err.maxBytes);
              const name = err.fileName ? ` "${err.fileName}"` : '';
              return `The dataset${name} requires ${size}, which exceeds the current browser limit of ${limit}. Reduce the dataset size or enable chunked uploads before trying again.`;
            })()
          : err instanceof Error
            ? err.message
            : 'Failed to load volumes.';
      showLaunchError(message);
      setError(message);
      return false;
    }
  }, [channels, clearDatasetError, showLaunchError]);

  useEffect(() => {
    if (!isPlaying || volumeTimepointCount <= 1) {
      return;
    }

    const safeFps = Math.max(1, fps);
    const interval = window.setInterval(() => {
      setSelectedIndex((prev) => {
        if (volumeTimepointCount === 0) {
          return prev;
        }
        const next = (prev + 1) % volumeTimepointCount;
        return next;
      });
    }, 1000 / safeFps);

    return () => {
      window.clearInterval(interval);
    };
  }, [fps, isPlaying, volumeTimepointCount]);

  useEffect(() => {
    if (volumeTimepointCount <= 1 && isPlaying) {
      setIsPlaying(false);
    }
    if (selectedIndex >= volumeTimepointCount && volumeTimepointCount > 0) {
      setSelectedIndex(0);
    }
  }, [isPlaying, selectedIndex, volumeTimepointCount]);

  const isLoading = status === 'loading';
  const playbackDisabled = isLoading || volumeTimepointCount <= 1;
  const vrButtonLabel = isVrActive ? 'Exit VR' : isVrRequesting ? 'Entering VR…' : 'Enter VR';
  const isVrAvailable = viewerMode === '3d' && isVrSupportChecked && isVrSupported;
  const vrButtonDisabled = isVrActive
    ? false
    : !isVrAvailable || !hasVrSessionHandlers || isVrRequesting;
  const vrButtonTitle = isVrActive
    ? 'Exit immersive VR session.'
    : !isVrSupportChecked
    ? 'Checking WebXR capabilities…'
    : !isVrSupported
    ? 'WebXR immersive VR is not supported in this browser.'
    : viewerMode !== '3d'
    ? 'Switch to the 3D view to enable VR.'
    : !hasVrSessionHandlers
    ? 'Viewer is still initializing.'
    : isVrRequesting
    ? 'Starting VR session…'
    : undefined;
  const playbackLabel = useMemo(() => {
    if (volumeTimepointCount === 0) {
      return '0 / 0';
    }
    const currentFrame = Math.min(selectedIndex + 1, volumeTimepointCount);
    return `${currentFrame} / ${volumeTimepointCount}`;
  }, [selectedIndex, volumeTimepointCount]);

  const trackSummaryByChannel = useMemo(() => {
    const summary = new Map<string, { total: number; visible: number }>();
    for (const channel of channels) {
      const tracksForChannel = parsedTracksByChannel.get(channel.id) ?? [];
      const state = channelTrackStates[channel.id] ?? createDefaultChannelTrackState();
      let visible = 0;
      for (const track of tracksForChannel) {
        if (state.visibility[track.id] ?? true) {
          visible += 1;
        }
      }
      summary.set(channel.id, { total: tracksForChannel.length, visible });
    }
    return summary;
  }, [channels, channelTrackStates, parsedTracksByChannel]);

  const trackVisibility = useMemo(() => {
    const visibility: Record<string, boolean> = {};
    for (const channel of channels) {
      const tracksForChannel = parsedTracksByChannel.get(channel.id) ?? [];
      const state = channelTrackStates[channel.id] ?? createDefaultChannelTrackState();
      for (const track of tracksForChannel) {
        visibility[track.id] = state.visibility[track.id] ?? true;
      }
    }
    return visibility;
  }, [channelTrackStates, channels, parsedTracksByChannel]);

  const trackOpacityByChannel = useMemo(() => {
    const map: Record<string, number> = {};
    for (const channel of channels) {
      const state = channelTrackStates[channel.id] ?? createDefaultChannelTrackState();
      map[channel.id] = state.opacity;
    }
    return map;
  }, [channelTrackStates, channels]);

  const trackLineWidthByChannel = useMemo(() => {
    const map: Record<string, number> = {};
    for (const channel of channels) {
      const state = channelTrackStates[channel.id] ?? createDefaultChannelTrackState();
      map[channel.id] = state.lineWidth;
    }
    return map;
  }, [channelTrackStates, channels]);

  const trackChannels = useMemo(() => {
    return loadedChannelIds.map((channelId) => ({
      id: channelId,
      name: channelNameMap.get(channelId) ?? 'Untitled channel'
    }));
  }, [channelNameMap, loadedChannelIds]);

  const vrChannelPanels = useMemo(() => {
    return loadedChannelIds.map((channelId) => {
      const channelLayers = channelLayersMap.get(channelId) ?? [];
      const name = channelNameMap.get(channelId) ?? 'Untitled channel';
      const visible = channelVisibility[channelId] ?? true;
      const activeLayerKey = channelActiveLayer[channelId] ?? channelLayers[0]?.key ?? null;
      const layersInfo = channelLayers.map((layer) => {
        const settings = layerSettings[layer.key] ?? createDefaultLayerSettings();
        const firstVolume = layer.volumes[0] ?? null;
        const isGrayscale = Boolean(firstVolume && firstVolume.channels === 1);
        return {
          key: layer.key,
          label: layer.label,
          hasData: layer.volumes.length > 0,
          isGrayscale,
          isSegmentation: layer.isSegmentation,
          settings
        };
      });
      return {
        id: channelId,
        name,
        visible,
        activeLayerKey,
        layers: layersInfo
      };
    });
  }, [
    channelActiveLayer,
    channelLayersMap,
    channelNameMap,
    channelVisibility,
    layerSettings,
    loadedChannelIds
  ]);

  const channelTrackColorModes = useMemo(() => {
    const map: Record<string, TrackColorMode> = {};
    for (const channel of channels) {
      const state = channelTrackStates[channel.id] ?? createDefaultChannelTrackState();
      map[channel.id] = state.colorMode;
    }
    return map;
  }, [channelTrackStates, channels]);

  const followedTrackId = followedTrack?.id ?? null;
  const followedTrackChannelId = followedTrack?.channelId ?? null;

  const channelTrackOffsets = useMemo(() => {
    const offsets: Record<string, { x: number; y: number }> = {};
    for (const channel of channels) {
      const channelLayers = channelLayersMap.get(channel.id) ?? [];
      const activeLayerKey = channelActiveLayer[channel.id] ?? channelLayers[0]?.key ?? null;
      if (!activeLayerKey) {
        offsets[channel.id] = { x: 0, y: 0 };
        continue;
      }
      const settings = layerSettings[activeLayerKey] ?? createDefaultLayerSettings();
      const isActive = channel.id === activeChannelTabId;
      offsets[channel.id] = {
        x: isActive ? settings.xOffset : 0,
        y: isActive ? settings.yOffset : 0
      };
    }
    return offsets;
  }, [activeChannelTabId, channelActiveLayer, channelLayersMap, channels, layerSettings]);

  useEffect(() => {
    for (const channel of channels) {
      const checkbox = trackMasterCheckboxRefs.current[channel.id];
      if (!checkbox) {
        continue;
      }
      const summary = trackSummaryByChannel.get(channel.id) ?? { total: 0, visible: 0 };
      const allChecked = summary.total > 0 && summary.visible === summary.total;
      const someChecked =
        summary.total > 0 && summary.visible > 0 && summary.visible < summary.total;
      checkbox.indeterminate = someChecked && !allChecked;
    }
  }, [channels, trackSummaryByChannel]);

  useEffect(() => {
    const validIds = new Set(channels.map((channel) => channel.id));
    for (const key of Object.keys(trackMasterCheckboxRefs.current)) {
      if (!validIds.has(key)) {
        delete trackMasterCheckboxRefs.current[key];
      }
    }
  }, [channels]);

  const handleTogglePlayback = useCallback(() => {
    setIsPlaying((current) => {
      if (!current && volumeTimepointCount <= 1) {
        return current;
      }
      return !current;
    });
  }, [volumeTimepointCount]);

  const handleTimeIndexChange = useCallback(
    (nextIndex: number) => {
      setSelectedIndex((prev) => {
        if (volumeTimepointCount === 0) {
          return prev;
        }
        const clamped = Math.max(0, Math.min(volumeTimepointCount - 1, nextIndex));
        return clamped;
      });
    },
    [volumeTimepointCount]
  );

  const handleAddChannel = useCallback(() => {
    let createdChannel: ChannelSource | null = null;
    setChannels((current) => {
      const newChannel: ChannelSource = createChannelSource('');
      createdChannel = newChannel;
      return [...current, newChannel];
    });
    if (createdChannel === null) {
      return;
    }
    const channel = createdChannel as ChannelSource;
    pendingChannelFocusIdRef.current = channel.id;
    setActiveChannelId(channel.id);
    editingChannelOriginalNameRef.current = channel.name;
    setEditingChannelId(channel.id);
    clearDatasetError();
  }, [clearDatasetError, createChannelSource]);

  const handleChannelNameChange = useCallback((channelId: string, value: string) => {
    setChannels((current) =>
      current.map((channel) => (channel.id === channelId ? { ...channel, name: value } : channel))
    );
  }, []);

  const handleRemoveChannel = useCallback((channelId: string) => {
    setChannels((current) => {
      const filtered = current.filter((channel) => channel.id !== channelId);
      setActiveChannelId((previous) => {
        if (filtered.length === 0) {
          return null;
        }
        if (previous && filtered.some((channel) => channel.id === previous)) {
          return previous;
        }
        const removedIndex = current.findIndex((channel) => channel.id === channelId);
        if (removedIndex <= 0) {
          return filtered[0].id;
        }
        const fallbackIndex = Math.min(removedIndex - 1, filtered.length - 1);
        return filtered[fallbackIndex]?.id ?? filtered[0].id;
      });
      return filtered;
    });
    clearDatasetError();
  }, [clearDatasetError]);

  const handleChannelLayerFilesAdded = useCallback(
    (channelId: string, incomingFiles: File[]) => {
      const tiffFiles = dedupeFiles(incomingFiles.filter((file) => hasTiffExtension(file.name)));
      if (tiffFiles.length === 0) {
        showInteractionWarning('No TIFF files detected in the dropped selection.');
        return;
      }

      let addedAny = false;
      let ignoredExtraGroups = false;
      const replacedLayerIds: string[] = [];
      setChannels((current) =>
        current.map((channel) => {
          if (channel.id !== channelId) {
            return channel;
          }
          const grouped = groupFilesIntoLayers(tiffFiles);
          if (grouped.length === 0) {
            return channel;
          }
          if (grouped.length > 1) {
            ignoredExtraGroups = true;
          }
          const sorted = sortVolumeFiles(grouped[0]);
          if (sorted.length === 0) {
            return channel;
          }
          addedAny = true;
          if (channel.layers.length > 0) {
            replacedLayerIds.push(channel.layers[0].id);
          }
          const nextLayer = createLayerSource(sorted);
          return { ...channel, layers: [nextLayer] };
        })
      );

      if (addedAny) {
        if (replacedLayerIds.length > 0) {
          setLayerSettings((current) => {
            let changed = false;
            const next = { ...current };
            for (const layerId of replacedLayerIds) {
              if (layerId in next) {
                delete next[layerId];
                changed = true;
              }
            }
            return changed ? next : current;
          });
        }
        if (ignoredExtraGroups) {
          showInteractionWarning('Only the first TIFF sequence was added. Additional sequences were ignored.');
        } else {
          clearDatasetError();
        }
      } else {
        showInteractionWarning('No volume was added from that drop.');
      }
    },
    [clearDatasetError, createLayerSource, showInteractionWarning]
  );

  const handleChannelLayerDrop = useCallback(
    async (channelId: string, dataTransfer: DataTransfer) => {
      const files = await collectFilesFromDataTransfer(dataTransfer);
      if (files.length === 0) {
        showInteractionWarning('No TIFF files detected in the dropped selection.');
        return;
      }
      handleChannelLayerFilesAdded(channelId, files);
    },
    [handleChannelLayerFilesAdded, showInteractionWarning]
  );

  const handleChannelLayerSegmentationToggle = useCallback(
    (channelId: string, layerId: string, value: boolean) => {
      setChannels((current) =>
        current.map((channel) => {
          if (channel.id !== channelId) {
            return channel;
          }
          return {
            ...channel,
            layers: channel.layers.map((layer) =>
              layer.id === layerId ? { ...layer, isSegmentation: value } : layer
            )
          };
        })
      );
    },
    []
  );

  const handleChannelLayerRemove = useCallback((channelId: string, layerId: string) => {
    let removed = false;
    setChannels((current) =>
      current.map((channel) => {
        if (channel.id !== channelId) {
          return channel;
        }
        const filtered = channel.layers.filter((layer) => layer.id !== layerId);
        if (filtered.length === channel.layers.length) {
          return channel;
        }
        removed = true;
        return {
          ...channel,
          layers: filtered
        };
      })
    );
    if (removed) {
      setLayerSettings((current) => {
        if (!(layerId in current)) {
          return current;
        }
        const next = { ...current };
        delete next[layerId];
        return next;
      });
      clearDatasetError();
    }
  }, [clearDatasetError]);

  const handleChannelTrackFileSelected = useCallback((channelId: string, file: File | null) => {
    if (!file) {
      setChannels((current) =>
        current.map((channel) =>
          channel.id === channelId
            ? { ...channel, trackFile: null, trackStatus: 'idle', trackError: null, trackEntries: [] }
            : channel
        )
      );
      return;
    }

    if (!file.name.toLowerCase().endsWith('.csv')) {
      setChannels((current) =>
        current.map((channel) =>
          channel.id === channelId
            ? {
                ...channel,
                trackFile: null,
                trackStatus: 'error',
                trackError: 'Please drop a CSV file.',
                trackEntries: []
              }
            : channel
        )
      );
      return;
    }

    setChannels((current) =>
      current.map((channel) =>
        channel.id === channelId
          ? { ...channel, trackFile: file, trackStatus: 'loading', trackError: null, trackEntries: [] }
          : channel
      )
    );

    parseTrackCsvFile(file)
      .then((rows) => {
        setChannels((current) =>
          current.map((channel) =>
            channel.id === channelId
              ? { ...channel, trackFile: file, trackStatus: 'loaded', trackError: null, trackEntries: rows }
              : channel
          )
        );
      })
      .catch((err) => {
        console.error('Failed to load tracks CSV', err);
        const message = err instanceof Error ? err.message : 'Failed to load tracks.';
        setChannels((current) =>
          current.map((channel) =>
            channel.id === channelId
              ? {
                  ...channel,
                  trackFile: null,
                  trackStatus: 'error',
                  trackError: message,
                  trackEntries: []
                }
              : channel
          )
        );
      });
  }, []);

  const handleChannelTrackDrop = useCallback(
    async (channelId: string, dataTransfer: DataTransfer) => {
      const files = await collectFilesFromDataTransfer(dataTransfer);
      const csvFile = files.find((file) => file.name.toLowerCase().endsWith('.csv')) ?? null;
      if (!csvFile) {
        setChannels((current) =>
          current.map((channel) =>
            channel.id === channelId
              ? {
                  ...channel,
                  trackFile: null,
                  trackStatus: 'error',
                  trackError: 'Please drop a CSV file.',
                  trackEntries: []
                }
              : channel
          )
        );
        return;
      }
      handleChannelTrackFileSelected(channelId, csvFile);
    },
    [handleChannelTrackFileSelected]
  );

  const handleChannelTrackClear = useCallback(
    (channelId: string) => handleChannelTrackFileSelected(channelId, null),
    [handleChannelTrackFileSelected]
  );

  const channelValidationList = useMemo(() => {
    return channels.map((channel) => {
      const errors: string[] = [];
      const warnings: string[] = [];

      if (!channel.name.trim()) {
        errors.push('Name this channel.');
      }

      if (channel.layers.length === 0) {
        errors.push('Add a volume to this channel.');
      } else {
        const layer = channel.layers[0];
        if (!layer || layer.files.length === 0) {
          errors.push('Add files to the volume in this channel.');
        }
      }

      if (channel.trackStatus === 'error' && channel.trackError) {
        errors.push(channel.trackError);
      } else if (channel.trackStatus === 'loading') {
        warnings.push('Tracks are still loading.');
      } else if (channel.layers.length > 0 && !channel.trackFile) {
        warnings.push('No tracks attached to this channel.');
      }

      return {
        channelId: channel.id,
        errors,
        warnings,
        layerCount: channel.layers.length,
        timepointCount: channel.layers[0]?.files.length ?? 0
      };
    });
  }, [channels]);

  const channelValidationMap = useMemo(() => {
    const map = new Map<string, ChannelValidation>();
    for (const entry of channelValidationList) {
      map.set(entry.channelId, { errors: entry.errors, warnings: entry.warnings });
    }
    return map;
  }, [channelValidationList]);

  const hasGlobalTimepointMismatch = useMemo(() => {
    const timepointCounts = new Set<number>();
    for (const channel of channels) {
      for (const layer of channel.layers) {
        if (layer.files.length > 0) {
          timepointCounts.add(layer.files.length);
        }
      }
    }
    return timepointCounts.size > 1;
  }, [channels]);
  const hasAnyLayers = useMemo(
    () => channels.some((channel) => channel.layers.some((layer) => layer.files.length > 0)),
    [channels]
  );
  const hasLoadingTracks = useMemo(
    () => channels.some((channel) => channel.trackStatus === 'loading'),
    [channels]
  );
  const allChannelsValid = useMemo(
    () => channelValidationList.every((entry) => entry.errors.length === 0),
    [channelValidationList]
  );
  const canLaunch = hasAnyLayers && allChannelsValid && !hasLoadingTracks;
  const launchButtonLaunchable = canLaunch ? 'true' : 'false';

  const activeChannel = useMemo(
    () => channels.find((channel) => channel.id === activeChannelId) ?? null,
    [activeChannelId, channels]
  );

  const launchErrorMessage = datasetErrorContext === 'launch' ? datasetError : null;


  const handleLaunchViewer = useCallback(async () => {
    if (isLaunchingViewer) {
      return;
    }

    const hasAnyLayers = channels.some((channel) =>
      channel.layers.some((layer) => layer.files.length > 0)
    );
    if (!hasAnyLayers) {
      showLaunchError('Add a volume before launching the viewer.');
      return;
    }

    const blockingChannel = channelValidationList.find((entry) => entry.errors.length > 0);
    if (blockingChannel) {
      const rawName = channels.find((channel) => channel.id === blockingChannel.channelId)?.name ?? '';
      const channelName = rawName.trim() || 'this channel';
      showLaunchError(`Resolve the errors in ${channelName} before launching.`);
      return;
    }

    const hasLoadingTracks = channels.some((channel) => channel.trackStatus === 'loading');
    if (hasLoadingTracks) {
      showLaunchError('Wait for tracks to finish loading before launching.');
      return;
    }

    clearDatasetError();
    setIsLaunchingViewer(true);
    try {
      const datasetLoaded = await loadSelectedDataset();
      if (!datasetLoaded) {
        return;
      }

      setIsViewerLaunched(true);
    } finally {
      setIsLaunchingViewer(false);
    }
  }, [
    channels,
    channelValidationList,
    clearDatasetError,
    isLaunchingViewer,
    loadSelectedDataset,
    showLaunchError
  ]);

  const handleChannelVisibilityToggle = useCallback((channelId: string) => {
    setChannelVisibility((current) => {
      const previous = current[channelId] ?? true;
      const nextValue = !previous;
      return {
        ...current,
        [channelId]: nextValue
      };
    });
  }, []);

  const handleTrackVisibilityToggle = useCallback(
    (trackId: string) => {
      const track = trackLookup.get(trackId);
      if (!track) {
        return;
      }

      let nextVisible = true;
      setChannelTrackStates((current) => {
        const existing = current[track.channelId] ?? createDefaultChannelTrackState();
        const previous = existing.visibility[trackId] ?? true;
        nextVisible = !previous;
        return {
          ...current,
          [track.channelId]: {
            ...existing,
            visibility: {
              ...existing.visibility,
              [trackId]: nextVisible
            }
          }
        };
      });

      if (!nextVisible) {
        setFollowedTrack((current) => (current && current.id === trackId ? null : current));
      }
    },
    [trackLookup]
  );

  const handleTrackVisibilityAllChange = useCallback(
    (channelId: string, isChecked: boolean) => {
      const tracksForChannel = parsedTracksByChannel.get(channelId) ?? [];
      setChannelTrackStates((current) => {
        const existing = current[channelId] ?? createDefaultChannelTrackState();
        const visibility: Record<string, boolean> = {};
        for (const track of tracksForChannel) {
          visibility[track.id] = isChecked;
        }
        return {
          ...current,
          [channelId]: {
            ...existing,
            visibility
          }
        };
      });

      if (!isChecked) {
        setFollowedTrack((current) => (current && current.channelId === channelId ? null : current));
      }
    },
    [parsedTracksByChannel]
  );

  const handleTrackOpacityChange = useCallback((channelId: string, value: number) => {
    setChannelTrackStates((current) => {
      const existing = current[channelId] ?? createDefaultChannelTrackState();
      if (existing.opacity === value) {
        return current;
      }
      return {
        ...current,
        [channelId]: {
          ...existing,
          opacity: value
        }
      };
    });
  }, []);

  const handleTrackLineWidthChange = useCallback((channelId: string, value: number) => {
    setChannelTrackStates((current) => {
      const existing = current[channelId] ?? createDefaultChannelTrackState();
      if (existing.lineWidth === value) {
        return current;
      }
      return {
        ...current,
        [channelId]: {
          ...existing,
          lineWidth: value
        }
      };
    });
  }, []);

  const handleTrackColorSelect = useCallback((channelId: string, color: string) => {
    const normalized = normalizeTrackColor(color);
    setChannelTrackStates((current) => {
      const existing = current[channelId] ?? createDefaultChannelTrackState();
      if (existing.colorMode.type === 'uniform' && existing.colorMode.color === normalized) {
        return current;
      }
      return {
        ...current,
        [channelId]: {
          ...existing,
          colorMode: { type: 'uniform', color: normalized }
        }
      };
    });
  }, []);

  const handleTrackColorReset = useCallback((channelId: string) => {
    setChannelTrackStates((current) => {
      const existing = current[channelId] ?? createDefaultChannelTrackState();
      if (existing.colorMode.type === 'random') {
        return current;
      }
      return {
        ...current,
        [channelId]: {
          ...existing,
          colorMode: { type: 'random' }
        }
      };
    });
  }, []);

  const ensureTrackIsVisible = useCallback(
    (trackId: string) => {
      const track = trackLookup.get(trackId);
      if (!track) {
        return;
      }

      setChannelTrackStates((current) => {
        const existing = current[track.channelId] ?? createDefaultChannelTrackState();
        if (existing.visibility[trackId] ?? true) {
          return current;
        }
        return {
          ...current,
          [track.channelId]: {
            ...existing,
            visibility: {
              ...existing.visibility,
              [trackId]: true
            }
          }
        };
      });
    },
    [trackLookup]
  );

  const handleTrackFollow = useCallback(
    (trackId: string) => {
      const track = trackLookup.get(trackId);
      if (!track) {
        return;
      }

      setFollowedTrack((current) => (current && current.id === trackId ? null : { id: trackId, channelId: track.channelId }));
      ensureTrackIsVisible(trackId);
    },
    [ensureTrackIsVisible, trackLookup]
  );

  const handleTrackFollowFromViewer = useCallback(
    (trackId: string) => {
      const track = trackLookup.get(trackId);
      if (!track) {
        return;
      }

      setFollowedTrack((current) => (current && current.id === trackId ? current : { id: trackId, channelId: track.channelId }));
      ensureTrackIsVisible(trackId);
      setActiveTrackChannelId(track.channelId);
    },
    [ensureTrackIsVisible, trackLookup]
  );

  const handleTrackChannelSelect = useCallback((channelId: string) => {
    setActiveTrackChannelId(channelId);
  }, []);

  const handleStopTrackFollow = useCallback((channelId?: string) => {
    if (!channelId) {
      setFollowedTrack(null);
      return;
    }
    setFollowedTrack((current) => (current && current.channelId === channelId ? null : current));
  }, []);

  const registerTrackMasterCheckbox = useCallback(
    (channelId: string) => (element: HTMLInputElement | null) => {
      trackMasterCheckboxRefs.current[channelId] = element;
    },
    []
  );

  const handleToggleViewerMode = useCallback(() => {
    setViewerMode((current) => (current === '3d' ? '2d' : '3d'));
    setResetViewHandler(null);
    handleStopTrackFollow();
  }, [handleStopTrackFollow]);

  const handleSliceIndexChange = useCallback((index: number) => {
    setSliceIndex(index);
  }, []);

  useEffect(() => {
    if (layers.length === 0) {
      setActiveChannelTabId(null);
      return;
    }

    setActiveChannelTabId((current) => {
      if (current && layers.some((layer) => layer.channelId === current)) {
        return current;
      }
      return layers[0].channelId;
    });
  }, [layers]);

  useEffect(() => {
    if (channels.length === 0) {
      setActiveTrackChannelId(null);
      return;
    }

    setActiveTrackChannelId((current) => {
      if (current && channels.some((channel) => channel.id === current)) {
        return current;
      }
      return channels[0].id;
    });
  }, [channels]);

  useEffect(() => {
    setChannelActiveLayer((current) => {
      if (layers.length === 0) {
        if (Object.keys(current).length === 0) {
          return current;
        }
        return {};
      }

      const next: Record<string, string> = { ...current };
      let changed = false;
      const validChannels = new Set<string>();
      for (const layer of layers) {
        validChannels.add(layer.channelId);
      }

      for (const channelId of Object.keys(next)) {
        if (!validChannels.has(channelId)) {
          delete next[channelId];
          changed = true;
        }
      }

      for (const channelId of validChannels) {
        const channelLayers = channelLayersMap.get(channelId) ?? [];
        const activeKey = next[channelId];
        const hasActive = activeKey ? channelLayers.some((layer) => layer.key === activeKey) : false;
        if (!hasActive) {
          const fallback = channelLayers[0];
          if (fallback) {
            next[channelId] = fallback.key;
            changed = true;
          }
        }
      }

      return changed ? next : current;
    });
  }, [channelLayersMap, layers]);

  const handleLayerContrastChange = useCallback((key: string, value: number) => {
    setLayerSettings((current) => {
      const previous = current[key] ?? createDefaultLayerSettings();
      if (previous.contrast === value) {
        return current;
      }
      return {
        ...current,
        [key]: {
          ...previous,
          contrast: value
        }
      };
    });
  }, []);

  const handleLayerGammaChange = useCallback((key: string, value: number) => {
    setLayerSettings((current) => {
      const previous = current[key] ?? createDefaultLayerSettings();
      if (previous.gamma === value) {
        return current;
      }
      return {
        ...current,
        [key]: {
          ...previous,
          gamma: value
        }
      };
    });
  }, []);

  const handleLayerBrightnessChange = useCallback((key: string, value: number) => {
    setLayerSettings((current) => {
      const previous = current[key] ?? createDefaultLayerSettings();
      if (previous.brightness === value) {
        return current;
      }
      return {
        ...current,
        [key]: {
          ...previous,
          brightness: value
        }
      };
    });
  }, []);

  const handleLayerOffsetChange = useCallback((key: string, axis: 'x' | 'y', value: number) => {
    setLayerSettings((current) => {
      const previous = current[key] ?? createDefaultLayerSettings();
      const property = axis === 'x' ? 'xOffset' : 'yOffset';
      if (previous[property] === value) {
        return current;
      }
      return {
        ...current,
        [key]: {
          ...previous,
          [property]: value
        }
      };
    });
  }, []);

  const handleLayerColorChange = useCallback((key: string, value: string) => {
    setLayerSettings((current) => {
      const previous = current[key] ?? createDefaultLayerSettings();
      const normalized = normalizeHexColor(value, DEFAULT_LAYER_COLOR);
      if (previous.color === normalized) {
        return current;
      }
      return {
        ...current,
        [key]: {
          ...previous,
          color: normalized
        }
      };
    });
  }, []);

  const handleLayerRenderStyleToggle = useCallback((key: string) => {
    setLayerSettings((current) => {
      const previous = current[key] ?? createDefaultLayerSettings();
      const nextStyle: 0 | 1 = previous.renderStyle === 1 ? 0 : 1;
      if (previous.renderStyle === nextStyle) {
        return current;
      }
      return {
        ...current,
        [key]: {
          ...previous,
          renderStyle: nextStyle
        }
      };
    });
  }, []);

  const handleLayerSamplingModeToggle = useCallback((key: string) => {
    setLayerSettings((current) => {
      const previous = current[key] ?? createDefaultLayerSettings();
      const nextMode: SamplingMode = previous.samplingMode === 'nearest' ? 'linear' : 'nearest';
      if (previous.samplingMode === nextMode) {
        return current;
      }
      return {
        ...current,
        [key]: {
          ...previous,
          samplingMode: nextMode
        }
      };
    });
  }, []);

  const handleLayerInvertToggle = useCallback((key: string) => {
    setLayerSettings((current) => {
      const previous = current[key] ?? createDefaultLayerSettings();
      const nextInvert = !previous.invert;
      if (previous.invert === nextInvert) {
        return current;
      }
      return {
        ...current,
        [key]: {
          ...previous,
          invert: nextInvert
        }
      };
    });
  }, []);

  const handleChannelLayerSelectionChange = useCallback((channelId: string, layerKey: string) => {
    setChannelActiveLayer((current) => {
      if (current[channelId] === layerKey) {
        return current;
      }
      return {
        ...current,
        [channelId]: layerKey
      };
    });
  }, []);

  const handleChannelSliderReset = useCallback(
    (channelId: string) => {
      setLayerSettings((current) => {
        const relevantLayers = layers.filter((layer) => layer.channelId === channelId);
        if (relevantLayers.length === 0) {
          return current;
        }

        let changed = false;
        const next: Record<string, LayerSettings> = { ...current };
        for (const layer of relevantLayers) {
          const previous = current[layer.key] ?? createDefaultLayerSettings();
          const updated: LayerSettings = {
            ...previous,
            contrast: DEFAULT_CONTRAST,
            gamma: DEFAULT_GAMMA,
            brightness: DEFAULT_BRIGHTNESS,
            xOffset: 0,
            yOffset: 0,
            renderStyle: DEFAULT_RENDER_STYLE,
            invert: false,
            samplingMode: DEFAULT_SAMPLING_MODE
          };
          if (
            previous.contrast !== updated.contrast ||
            previous.gamma !== updated.gamma ||
            previous.brightness !== updated.brightness ||
            previous.xOffset !== updated.xOffset ||
            previous.yOffset !== updated.yOffset ||
            previous.renderStyle !== updated.renderStyle ||
            previous.invert !== updated.invert ||
            previous.samplingMode !== updated.samplingMode
          ) {
            next[layer.key] = updated;
            changed = true;
          }
        }

        return changed ? next : current;
      });
    },
    [layers]
  );

  const handleDatasetErrorDismiss = useCallback(() => {
    clearDatasetError();
  }, [clearDatasetError]);

  const viewerLayers = useMemo(() => {
    const activeLayers: LoadedLayer[] = [];
    for (const layer of layers) {
      if (channelActiveLayer[layer.channelId] === layer.key) {
        activeLayers.push(layer);
      }
    }

    return activeLayers.map((layer) => {
      const settings = layerSettings[layer.key] ?? createDefaultLayerSettings();
      const isActiveChannel = layer.channelId === activeChannelTabId;
      const channelVisible = channelVisibility[layer.channelId];
      return {
        key: layer.key,
        label: layer.label,
        volume: layer.volumes[selectedIndex] ?? null,
        visible: channelVisible ?? true,
        contrast: settings.contrast,
        gamma: settings.gamma,
        brightness: settings.brightness,
        color: normalizeHexColor(settings.color, DEFAULT_LAYER_COLOR),
        offsetX: isActiveChannel ? settings.xOffset : 0,
        offsetY: isActiveChannel ? settings.yOffset : 0,
        renderStyle: settings.renderStyle,
        invert: settings.invert,
        samplingMode: settings.samplingMode,
        isSegmentation: layer.isSegmentation
      };
    });
  }, [activeChannelTabId, channelActiveLayer, channelVisibility, layerSettings, layers, selectedIndex]);

  const maxSliceDepth = useMemo(() => {
    let depth = 0;
    for (const layer of viewerLayers) {
      if (layer.volume) {
        depth = Math.max(depth, layer.volume.depth);
      }
    }
    return depth;
  }, [viewerLayers]);

  useEffect(() => {
    if (maxSliceDepth <= 0) {
      if (sliceIndex !== 0) {
        setSliceIndex(0);
      }
      return;
    }
    if (sliceIndex >= maxSliceDepth) {
      setSliceIndex(maxSliceDepth - 1);
    }
    if (sliceIndex < 0) {
      setSliceIndex(0);
    }
  }, [maxSliceDepth, sliceIndex]);

  const backgroundVideoSrc = `${import.meta.env.BASE_URL}media/background.mp4`;

  if (!isViewerLaunched) {
    const isFrontPageLocked = isLaunchingViewer;
    const warningWindowInitialPosition =
      typeof window === 'undefined'
        ? { x: WINDOW_MARGIN, y: WINDOW_MARGIN }
        : {
            x: Math.max(WINDOW_MARGIN, Math.round(window.innerWidth / 2 - WARNING_WINDOW_WIDTH / 2)),
            y: WINDOW_MARGIN + 16
          };
    return (
      <div className="app front-page-mode">
        <video
          className="app-background-video"
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          aria-hidden="true"
        >
          <source src={backgroundVideoSrc} type="video/mp4" />
        </video>
        <div className="front-page">
          <div className={`front-page-card${isFrontPageLocked ? ' is-loading' : ''}`}>
            <header className="front-page-header">
              <h1>4D microscopy viewer</h1>
            </header>
            <div className="channel-add-actions">
              <button
                type="button"
                className="channel-add-button"
                onClick={handleAddChannel}
                disabled={isFrontPageLocked}
              >
                Add new channel
              </button>
            </div>
            <div className="channel-board">
              {channels.length > 0 ? (
                <>
                  <div className="channel-tabs" role="tablist" aria-label="Configured channels">
                    {channels.map((channel) => {
                      const validation = channelValidationMap.get(channel.id) ?? { errors: [], warnings: [] };
                      const isActive = channel.id === activeChannelId;
                      const isEditing = editingChannelId === channel.id;
                      const trimmedChannelName = channel.name.trim();
                      const removeLabel = trimmedChannelName ? `Remove ${trimmedChannelName}` : 'Remove channel';
                      const tabClassName = [
                        'channel-tab',
                        isActive ? 'is-active' : '',
                        validation.errors.length > 0 ? 'has-error' : '',
                        validation.errors.length === 0 && validation.warnings.length > 0 ? 'has-warning' : '',
                        isFrontPageLocked ? 'is-disabled' : ''
                      ]
                        .filter(Boolean)
                        .join(' ');
                      const tabMeta = buildChannelTabMeta(channel, validation);
                      const startEditingChannelName = () => {
                        if (isFrontPageLocked || editingChannelId === channel.id) {
                          return;
                        }
                        editingChannelOriginalNameRef.current = channel.name;
                        setEditingChannelId(channel.id);
                      };
                      if (isEditing) {
                        return (
                          <div
                            key={channel.id}
                            id={`${channel.id}-tab`}
                            className={`${tabClassName} is-editing`}
                            role="tab"
                            aria-selected={isActive}
                            aria-controls="channel-detail-panel"
                            tabIndex={isFrontPageLocked ? -1 : 0}
                            aria-disabled={isFrontPageLocked}
                            onClick={() => {
                              if (isFrontPageLocked) {
                                return;
                              }
                              setActiveChannelId(channel.id);
                            }}
                            onKeyDown={(event) => {
                              if (isFrontPageLocked) {
                                event.preventDefault();
                                return;
                              }
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                setActiveChannelId(channel.id);
                              }
                            }}
                          >
                            <span className="channel-tab-text">
                              <input
                                ref={(node) => {
                                  editingChannelInputRef.current = node;
                                }}
                                className="channel-tab-name-input"
                                value={channel.name}
                                onChange={(event) => handleChannelNameChange(channel.id, event.target.value)}
                                placeholder="Insert channel name here"
                                onBlur={() => {
                                  editingChannelInputRef.current = null;
                                  setEditingChannelId(null);
                                }}
                                onKeyDown={(event) => {
                                  if (isFrontPageLocked) {
                                    event.preventDefault();
                                    return;
                                  }
                                  if (event.key === 'Enter') {
                                    event.preventDefault();
                                    editingChannelInputRef.current = null;
                                    setEditingChannelId(null);
                                  } else if (event.key === 'Escape') {
                                    event.preventDefault();
                                    handleChannelNameChange(channel.id, editingChannelOriginalNameRef.current);
                                    editingChannelInputRef.current = null;
                                    setEditingChannelId(null);
                                  }
                                }}
                                aria-label="Channel name"
                                autoComplete="off"
                                autoFocus
                                disabled={isFrontPageLocked}
                              />
                              <span className="channel-tab-meta">{tabMeta}</span>
                            </span>
                            <button
                              type="button"
                              className="channel-tab-remove"
                              aria-label={removeLabel}
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                if (isFrontPageLocked) {
                                  return;
                                }
                                handleRemoveChannel(channel.id);
                              }}
                              disabled={isFrontPageLocked}
                            >
                              🗑️
                            </button>
                          </div>
                        );
                      }
                      return (
                        <div
                          key={channel.id}
                          id={`${channel.id}-tab`}
                          className={tabClassName}
                          role="tab"
                          aria-selected={isActive}
                          aria-controls="channel-detail-panel"
                          tabIndex={isFrontPageLocked ? -1 : 0}
                          aria-disabled={isFrontPageLocked}
                          onClick={() => {
                            if (isFrontPageLocked) {
                              return;
                            }
                            if (!isActive) {
                              setActiveChannelId(channel.id);
                              return;
                            }
                            startEditingChannelName();
                          }}
                          onKeyDown={(event) => {
                            if (isFrontPageLocked) {
                              event.preventDefault();
                              return;
                            }
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              if (!isActive) {
                                setActiveChannelId(channel.id);
                              } else {
                                startEditingChannelName();
                              }
                            }
                          }}
                        >
                          <span className="channel-tab-text">
                            <span className="channel-tab-name">
                              {trimmedChannelName ? (
                                trimmedChannelName
                              ) : (
                                <span className="channel-tab-placeholder">Insert channel name here</span>
                              )}
                            </span>
                            <span className="channel-tab-meta">{tabMeta}</span>
                          </span>
                          <button
                            type="button"
                            className="channel-tab-remove"
                            aria-label={removeLabel}
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              if (isFrontPageLocked) {
                                return;
                              }
                              handleRemoveChannel(channel.id);
                            }}
                            disabled={isFrontPageLocked}
                          >
                            🗑️
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  <div
                    className="channel-panel"
                    role="tabpanel"
                    id="channel-detail-panel"
                    aria-labelledby={activeChannel ? `${activeChannel.id}-tab` : undefined}
                  >
                    {activeChannel ? (
                      <ChannelCard
                        key={activeChannel.id}
                        channel={activeChannel}
                        validation={channelValidationMap.get(activeChannel.id) ?? { errors: [], warnings: [] }}
                        isDisabled={isFrontPageLocked}
                        onLayerFilesAdded={handleChannelLayerFilesAdded}
                        onLayerDrop={handleChannelLayerDrop}
                        onLayerSegmentationToggle={handleChannelLayerSegmentationToggle}
                        onLayerRemove={handleChannelLayerRemove}
                        onTrackFileSelected={handleChannelTrackFileSelected}
                        onTrackDrop={handleChannelTrackDrop}
                        onTrackClear={handleChannelTrackClear}
                      />
                    ) : (
                      <p className="channel-panel-placeholder">Select a channel to edit it.</p>
                    )}
                  </div>
                </>
              ) : null}
            </div>
            {hasGlobalTimepointMismatch ? (
              <p className="launch-feedback launch-feedback-warning">
                Timepoint counts differ across channels. Align them before launching.
              </p>
            ) : null}
            {launchErrorMessage ? (
              <p className="launch-feedback launch-feedback-error">{launchErrorMessage}</p>
            ) : null}
            <div className="front-page-actions">
              <button
                type="button"
                className="launch-viewer-button"
                onClick={handleLaunchViewer}
                disabled={isLaunchingViewer}
                data-launchable={launchButtonLaunchable}
              >
                {isLaunchingViewer ? 'Loading…' : 'Launch viewer'}
              </button>
            </div>
          </div>
          {launchErrorMessage ? (
            <FloatingWindow
              title="Cannot launch viewer"
              className="floating-window--warning"
              bodyClassName="warning-window-body"
              width={WARNING_WINDOW_WIDTH}
              initialPosition={warningWindowInitialPosition}
              resetSignal={datasetErrorResetSignal}
            >
              <div className="warning-window-content">
                <p className="warning-window-intro">The viewer could not be launched.</p>
                <p className="warning-window-message">{launchErrorMessage}</p>
                <p className="warning-window-hint">Review the dataset configuration and try again.</p>
                <div className="warning-window-actions">
                  <button
                    type="button"
                    className="warning-window-action-button"
                    onClick={handleDatasetErrorDismiss}
                  >
                    Got it
                  </button>
                </div>
              </div>
            </FloatingWindow>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="app">
        <main className="viewer">
          {viewerMode === '3d' ? (
            <VolumeViewer
              layers={viewerLayers}
              isLoading={isLoading}
              loadingProgress={loadProgress}
              loadedVolumes={loadedCount}
              expectedVolumes={expectedVolumeCount}
              timeIndex={selectedIndex}
              totalTimepoints={volumeTimepointCount}
              isPlaying={isPlaying}
              playbackDisabled={playbackDisabled}
              playbackLabel={playbackLabel}
              onTogglePlayback={handleTogglePlayback}
              onTimeIndexChange={handleTimeIndexChange}
              onRegisterReset={handleRegisterReset}
              isVrPassthroughSupported={isVrPassthroughSupported}
              tracks={parsedTracks}
              trackChannels={trackChannels}
              trackVisibility={trackVisibility}
              trackOpacityByChannel={trackOpacityByChannel}
              trackLineWidthByChannel={trackLineWidthByChannel}
              channelTrackColorModes={channelTrackColorModes}
              channelTrackOffsets={channelTrackOffsets}
              activeTrackChannelId={activeTrackChannelId}
              onTrackChannelSelect={handleTrackChannelSelect}
              onTrackVisibilityToggle={handleTrackVisibilityToggle}
              onTrackVisibilityAllChange={handleTrackVisibilityAllChange}
              onTrackOpacityChange={handleTrackOpacityChange}
              onTrackLineWidthChange={handleTrackLineWidthChange}
              onTrackColorSelect={handleTrackColorSelect}
              onTrackColorReset={handleTrackColorReset}
              channelPanels={vrChannelPanels}
              activeChannelPanelId={activeChannelTabId}
              onChannelPanelSelect={setActiveChannelTabId}
              onChannelVisibilityToggle={handleChannelVisibilityToggle}
              onChannelReset={handleChannelSliderReset}
              onChannelLayerSelect={handleChannelLayerSelectionChange}
              onLayerContrastChange={handleLayerContrastChange}
              onLayerGammaChange={handleLayerGammaChange}
              onLayerBrightnessChange={handleLayerBrightnessChange}
              onLayerOffsetChange={handleLayerOffsetChange}
              onLayerColorChange={handleLayerColorChange}
              onLayerRenderStyleToggle={handleLayerRenderStyleToggle}
              onLayerSamplingModeToggle={handleLayerSamplingModeToggle}
              onLayerInvertToggle={handleLayerInvertToggle}
              followedTrackId={followedTrackId}
              onTrackFollowRequest={handleTrackFollowFromViewer}
              onStopTrackFollow={handleStopTrackFollow}
              onRegisterVrSession={handleRegisterVrSession}
              onVrSessionStarted={handleVrSessionStarted}
              onVrSessionEnded={handleVrSessionEnded}
            />
          ) : (
            <PlanarViewer
              layers={viewerLayers}
              isLoading={isLoading}
              loadingProgress={loadProgress}
              loadedVolumes={loadedCount}
              expectedVolumes={expectedVolumeCount}
              timeIndex={selectedIndex}
              totalTimepoints={volumeTimepointCount}
              onRegisterReset={handleRegisterReset}
              sliceIndex={sliceIndex}
              maxSlices={maxSliceDepth}
              onSliceIndexChange={handleSliceIndexChange}
              tracks={parsedTracks}
              trackVisibility={trackVisibility}
              trackOpacityByChannel={trackOpacityByChannel}
              trackLineWidthByChannel={trackLineWidthByChannel}
              channelTrackColorModes={channelTrackColorModes}
              channelTrackOffsets={channelTrackOffsets}
              followedTrackId={followedTrackId}
              onTrackFollowRequest={handleTrackFollowFromViewer}
            />
          )}
        </main>
        <div className="viewer-top-menu">
          <div className="viewer-top-menu-row">
            <button
              type="button"
              className="viewer-top-menu-button"
              onClick={handleReturnToLauncher}
            >
              Return to Launcher
            </button>
            <button
              type="button"
              className="viewer-top-menu-button"
              onClick={handleResetWindowLayout}
            >
              Reset layout
            </button>
            <div className="viewer-top-menu-help" ref={helpMenuRef}>
              <button
                type="button"
                className="viewer-top-menu-button"
                onClick={() => setIsHelpMenuOpen((previous) => !previous)}
                aria-expanded={isHelpMenuOpen}
                aria-controls="viewer-help-popover"
              >
                Help
              </button>
              {isHelpMenuOpen ? (
                <div
                  id="viewer-help-popover"
                  className="viewer-top-menu-popover"
                  role="dialog"
                  aria-modal="false"
                  aria-labelledby="viewer-help-popover-title"
                >
                  <h3 id="viewer-help-popover-title" className="viewer-top-menu-popover-title">
                    Viewer tips
                  </h3>
                  <div className="viewer-top-menu-popover-section">
                    <h4>3D volume view</h4>
                    <ul>
                      <li>Use WASDQE to move forward, back, strafe, and rise or descend.</li>
                      <li>Drag to orbit the dataset. Hold Shift while dragging to pan; hold Ctrl to dolly along your view.</li>
                      <li>Click a track line to follow that object in time.</li>
                    </ul>
                  </div>
                  <div className="viewer-top-menu-popover-section">
                    <h4>2D slice view</h4>
                    <ul>
                      <li>Press W/S to step through slices (hold Shift to skip 10 at a time).</li>
                      <li>Drag to pan the slice, and scroll to zoom.</li>
                      <li>Press Q/E to rotate the slice around its center.</li>
                    </ul>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
        <FloatingWindow
          title="Playback controls"
          initialPosition={controlWindowInitialPosition}
          width={`min(${PLAYBACK_WINDOW_WIDTH}px, calc(100vw - ${WINDOW_MARGIN * 2}px))`}
          className="floating-window--playback"
          resetSignal={layoutResetToken}
        >
          <div className="sidebar sidebar-left">
            <div className="global-controls">
              <div className="control-group">
                <div className="viewer-mode-row">
                  <button
                    type="button"
                    onClick={handleToggleViewerMode}
                    className={viewerMode === '3d' ? 'viewer-mode-button' : 'viewer-mode-button is-active'}
                    disabled={isVrActive || isVrRequesting}
                  >
                    {viewerMode === '3d' ? 'Go to 2D view' : 'Go to 3D view'}
                  </button>
                  <button type="button" onClick={() => resetViewHandler?.()} disabled={!resetViewHandler}>
                    Reset view
                  </button>
                  <button
                    type="button"
                    className="viewer-mode-button"
                    onClick={handleVrButtonClick}
                    disabled={vrButtonDisabled}
                    title={vrButtonTitle}
                  >
                    {vrButtonLabel}
                  </button>
                </div>
              </div>
              <div className="control-group">
                <label htmlFor="fps-slider">
                  frames per second <span>{fps}</span>
                </label>
                <input
                  id="fps-slider"
                  type="range"
                  min={1}
                  max={60}
                  step={1}
                  value={fps}
                  onChange={(event) => setFps(Number(event.target.value))}
                  disabled={volumeTimepointCount <= 1}
                />
              </div>
              {viewerMode === '2d' && maxSliceDepth > 0 ? (
                <div className="control-group">
                  <label htmlFor="z-plane-slider">
                    Z plane{' '}
                    <span>
                      {Math.min(sliceIndex + 1, maxSliceDepth)} / {maxSliceDepth}
                    </span>
                  </label>
                  <input
                    id="z-plane-slider"
                    type="range"
                    min={0}
                    max={Math.max(0, maxSliceDepth - 1)}
                    value={Math.min(sliceIndex, Math.max(0, maxSliceDepth - 1))}
                    onChange={(event) => handleSliceIndexChange(Number(event.target.value))}
                    disabled={maxSliceDepth <= 1}
                  />
                </div>
              ) : null}
              <div className="playback-controls">
                <div className="playback-highlight">
                  <div className="playback-controls-row">
                    <button
                      type="button"
                      onClick={handleTogglePlayback}
                      disabled={playbackDisabled}
                      className={isPlaying ? 'playback-toggle playing' : 'playback-toggle'}
                      aria-label={isPlaying ? 'Pause playback' : 'Start playback'}
                    >
                      {isPlaying ? '⏸' : '▶'}
                    </button>
                    <div className="playback-slider-group">
                      <input
                        type="range"
                        min={0}
                        max={Math.max(0, volumeTimepointCount - 1)}
                        value={Math.min(selectedIndex, Math.max(0, volumeTimepointCount - 1))}
                        onChange={(event) => handleTimeIndexChange(Number(event.target.value))}
                        disabled={playbackDisabled}
                      />
                      <span className="playback-time-label">{playbackLabel}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            {error && <p className="error">{error}</p>}
          </div>
        </FloatingWindow>

        <FloatingWindow
          title="Channels"
          initialPosition={layersWindowInitialPosition}
          width={`min(${CONTROL_WINDOW_WIDTH}px, calc(100vw - ${WINDOW_MARGIN * 2}px))`}
          className="floating-window--channels"
          resetSignal={layoutResetToken}
        >
          <div className="sidebar sidebar-left">
            {loadedChannelIds.length > 0 ? (
              <div className="channel-controls">
                <div className="channel-tabs" role="tablist" aria-label="Volume channels">
                  {loadedChannelIds.map((channelId) => {
                    const label = channelNameMap.get(channelId) ?? 'Untitled channel';
                    const isActive = channelId === activeChannelTabId;
                    const isVisible = channelVisibility[channelId] ?? true;
                    const tabClassName = ['channel-tab', isActive ? 'is-active' : '', !isVisible ? 'is-hidden' : '']
                      .filter(Boolean)
                      .join(' ');
                    const labelClassName = isVisible
                      ? 'channel-tab-label'
                      : 'channel-tab-label channel-tab-label--hidden';
                    return (
                      <button
                        key={channelId}
                        type="button"
                        className={tabClassName}
                        onClick={() => setActiveChannelTabId(channelId)}
                        role="tab"
                        id={`channel-tab-${channelId}`}
                        aria-selected={isActive}
                        aria-controls={`channel-panel-${channelId}`}
                      >
                        <span
                          className={labelClassName}
                          role="switch"
                          aria-checked={isVisible}
                          tabIndex={0}
                          onClick={(event) => {
                            event.stopPropagation();
                            handleChannelVisibilityToggle(channelId);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              event.stopPropagation();
                              handleChannelVisibilityToggle(channelId);
                            }
                          }}
                        >
                          {label}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {loadedChannelIds.map((channelId) => {
                  const channelLayers = channelLayersMap.get(channelId) ?? [];
                  const selectedLayerKey = channelActiveLayer[channelId] ?? channelLayers[0]?.key ?? null;
                  const selectedLayer =
                    channelLayers.find((layer) => layer.key === selectedLayerKey) ?? channelLayers[0] ?? null;
                  const settings =
                    selectedLayer
                      ? layerSettings[selectedLayer.key] ?? createDefaultLayerSettings()
                      : createDefaultLayerSettings();
                  const sliderDisabled = !selectedLayer || selectedLayer.volumes.length === 0;
                  const offsetDisabled = sliderDisabled || channelId !== activeChannelTabId;
                  const firstVolume = selectedLayer?.volumes[0] ?? null;
                  const isGrayscale = Boolean(firstVolume && firstVolume.channels === 1);
                  const normalizedColor = normalizeHexColor(settings.color, DEFAULT_LAYER_COLOR);
                  const displayColor = normalizedColor.toUpperCase();
                  const isActive = channelId === activeChannelTabId;
                  const invertDisabled = sliderDisabled || selectedLayer.isSegmentation;
                  const invertTitle = selectedLayer.isSegmentation
                    ? 'Invert LUT is unavailable for segmentation volumes.'
                    : undefined;

                  return (
                    <div
                      key={channelId}
                      id={`channel-panel-${channelId}`}
                      role="tabpanel"
                      aria-labelledby={`channel-tab-${channelId}`}
                      className={isActive ? 'channel-panel is-active' : 'channel-panel'}
                      hidden={!isActive}
                    >
                      {channelLayers.length > 1 ? (
                        <div
                          className="channel-layer-selector"
                          role="radiogroup"
                          aria-label={`${channelNameMap.get(channelId) ?? 'Channel'} volume`}
                        >
                          {channelLayers.map((layer) => {
                            const isSelected = Boolean(selectedLayer && selectedLayer.key === layer.key);
                            const inputId = `channel-${channelId}-layer-${layer.key}`;
                            return (
                              <label key={layer.key} className="channel-layer-option" htmlFor={inputId}>
                                <input
                                  type="radio"
                                  id={inputId}
                                  name={`channel-layer-${channelId}`}
                                  checked={isSelected}
                                  onChange={() => handleChannelLayerSelectionChange(channelId, layer.key)}
                                />
                                <span>{layer.label}</span>
                              </label>
                            );
                          })}
                        </div>
                      ) : channelLayers.length === 0 ? (
                        <p className="channel-empty-hint">No volume available for this channel.</p>
                      ) : null}
                      {selectedLayer ? (
                        <>
                          <div className="channel-primary-actions">
                            <div className="channel-primary-actions-row">
                              <button
                                type="button"
                                className="channel-action-button"
                                onClick={() => handleChannelSliderReset(channelId)}
                                disabled={channelLayers.length === 0}
                              >
                                Reset sliders
                              </button>
                              <button
                                type="button"
                                className="channel-action-button"
                                onClick={() => handleLayerInvertToggle(selectedLayer.key)}
                                disabled={invertDisabled}
                                aria-pressed={settings.invert}
                                title={invertTitle}
                              >
                                Invert LUT
                              </button>
                            </div>
                            <div className="channel-primary-actions-row">
                              <button
                                type="button"
                                className="channel-action-button"
                                onClick={() => handleLayerRenderStyleToggle(selectedLayer.key)}
                                disabled={sliderDisabled}
                                aria-pressed={settings.renderStyle === 1}
                              >
                                Render style
                              </button>
                              {viewerMode === '3d' ? (
                                <button
                                  type="button"
                                  className="channel-action-button"
                                  onClick={() => handleLayerSamplingModeToggle(selectedLayer.key)}
                                  disabled={sliderDisabled}
                                  aria-pressed={settings.samplingMode === 'nearest'}
                                >
                                  Sampling mode
                                </button>
                              ) : null}
                            </div>
                          </div>
                          <div className="slider-control slider-control--pair">
                            <div className="slider-control slider-control--inline">
                              <label htmlFor={`layer-contrast-${selectedLayer.key}`}>
                                Contrast <span>{settings.contrast.toFixed(2)}×</span>
                              </label>
                              <input
                                id={`layer-contrast-${selectedLayer.key}`}
                                type="range"
                                min={0.2}
                                max={3}
                                step={0.05}
                                value={settings.contrast}
                                onChange={(event) =>
                                  handleLayerContrastChange(selectedLayer.key, Number(event.target.value))
                                }
                                disabled={sliderDisabled}
                              />
                            </div>
                            <div className="slider-control slider-control--inline">
                              <label htmlFor={`layer-brightness-${selectedLayer.key}`}>
                                Brightness{' '}
                                <span>
                                  {settings.brightness >= 0 ? '+' : ''}
                                  {settings.brightness.toFixed(2)}
                                </span>
                              </label>
                              <input
                                id={`layer-brightness-${selectedLayer.key}`}
                                type="range"
                                min={-1}
                                max={1}
                                step={0.01}
                                value={settings.brightness}
                                onChange={(event) =>
                                  handleLayerBrightnessChange(selectedLayer.key, Number(event.target.value))
                                }
                                disabled={sliderDisabled}
                              />
                            </div>
                          </div>
                          <div className="slider-control">
                            <label htmlFor={`layer-gamma-${selectedLayer.key}`}>
                              Gamma <span>{settings.gamma.toFixed(2)}</span>
                            </label>
                            <input
                              id={`layer-gamma-${selectedLayer.key}`}
                              type="range"
                              min={0.2}
                              max={3}
                              step={0.05}
                              value={settings.gamma}
                              onChange={(event) =>
                                handleLayerGammaChange(selectedLayer.key, Number(event.target.value))
                              }
                              disabled={sliderDisabled}
                            />
                          </div>
                          <div className="slider-control slider-control--pair">
                            <div className="slider-control slider-control--inline">
                              <label htmlFor={`layer-offset-x-${selectedLayer.key}`}>
                                X shift{' '}
                                <span>
                                  {settings.xOffset >= 0 ? '+' : ''}
                                  {settings.xOffset.toFixed(2)} px
                                </span>
                              </label>
                              <input
                                id={`layer-offset-x-${selectedLayer.key}`}
                                type="range"
                                min={-10}
                                max={10}
                                step={0.1}
                                value={settings.xOffset}
                                onChange={(event) =>
                                  handleLayerOffsetChange(selectedLayer.key, 'x', Number(event.target.value))
                                }
                                disabled={offsetDisabled}
                              />
                            </div>
                            <div className="slider-control slider-control--inline">
                              <label htmlFor={`layer-offset-y-${selectedLayer.key}`}>
                                Y shift{' '}
                                <span>
                                  {settings.yOffset >= 0 ? '+' : ''}
                                  {settings.yOffset.toFixed(2)} px
                                </span>
                              </label>
                              <input
                                id={`layer-offset-y-${selectedLayer.key}`}
                                type="range"
                                min={-10}
                                max={10}
                                step={0.1}
                                value={settings.yOffset}
                                onChange={(event) =>
                                  handleLayerOffsetChange(selectedLayer.key, 'y', Number(event.target.value))
                                }
                                disabled={offsetDisabled}
                              />
                            </div>
                          </div>
                          {isGrayscale ? (
                            <div className="color-control">
                              <div className="color-control-header">
                                <span id={`layer-color-label-${selectedLayer.key}`}>Tint color</span>
                                <span>{displayColor}</span>
                              </div>
                              <div className="color-swatch-row">
                                <div
                                  className="color-swatch-grid"
                                  role="group"
                                  aria-labelledby={`layer-color-label-${selectedLayer.key}`}
                                >
                                  {GRAYSCALE_COLOR_SWATCHES.map((swatch) => {
                                    const swatchColor = normalizeHexColor(swatch.value, DEFAULT_LAYER_COLOR);
                                    const isSelected = swatchColor === normalizedColor;
                                    return (
                                      <button
                                        key={swatch.value}
                                        type="button"
                                        className={
                                          isSelected ? 'color-swatch-button is-selected' : 'color-swatch-button'
                                        }
                                        style={{ backgroundColor: swatch.value }}
                                        onClick={() => handleLayerColorChange(selectedLayer.key, swatch.value)}
                                        disabled={sliderDisabled}
                                        aria-pressed={isSelected}
                                        aria-label={`${swatch.label} tint`}
                                        title={swatch.label}
                                      />
                                    );
                                  })}
                                </div>
                                <label
                                  className={
                                    sliderDisabled ? 'color-picker-trigger is-disabled' : 'color-picker-trigger'
                                  }
                                  htmlFor={`layer-color-custom-${selectedLayer.key}`}
                                >
                                  <input
                                    id={`layer-color-custom-${selectedLayer.key}`}
                                    type="color"
                                    value={normalizedColor}
                                    onChange={(event) =>
                                      handleLayerColorChange(selectedLayer.key, event.target.value)
                                    }
                                    disabled={sliderDisabled}
                                    aria-label="Choose custom tint color"
                                    className="color-picker-input"
                                  />
                                  <span
                                    className="color-picker-indicator"
                                    style={{ backgroundColor: normalizedColor }}
                                    aria-hidden="true"
                                  />
                                </label>
                              </div>
                            </div>
                          ) : null}
                        </>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="channel-empty-hint">Load a volume to configure channel properties.</p>
            )}
          </div>
        </FloatingWindow>

        <FloatingWindow
          title="Tracks"
          initialPosition={trackWindowInitialPosition}
          width={`min(${TRACK_WINDOW_WIDTH}px, calc(100vw - ${WINDOW_MARGIN * 2}px))`}
          className="floating-window--tracks"
          resetSignal={layoutResetToken}
        >
          <div className="sidebar sidebar-right">
            {channels.length > 0 ? (
              <div className="track-controls">
                <div className="track-tabs" role="tablist" aria-label="Track channels">
                  {channels.map((channel) => {
                    const isActive = channel.id === activeTrackChannelId;
                    const channelName = channelNameMap.get(channel.id) ?? 'Untitled channel';
                    const hasTracks = (parsedTracksByChannel.get(channel.id)?.length ?? 0) > 0;
                    const tabClassName = ['track-tab', isActive ? 'is-active' : '', !hasTracks ? 'is-empty' : '']
                      .filter(Boolean)
                      .join(' ');
                    return (
                      <button
                        key={channel.id}
                        type="button"
                        className={tabClassName}
                        onClick={() => setActiveTrackChannelId(channel.id)}
                        role="tab"
                        id={`track-tab-${channel.id}`}
                        aria-selected={isActive}
                        aria-controls={`track-panel-${channel.id}`}
                      >
                        <span className="track-tab-label">{channelName}</span>
                      </button>
                    );
                  })}
                </div>
                {channels.map((channel) => {
                  const channelName = channelNameMap.get(channel.id) ?? 'Untitled channel';
                  const tracksForChannel = parsedTracksByChannel.get(channel.id) ?? [];
                  const isActive = channel.id === activeTrackChannelId;
                  const colorMode = channelTrackColorModes[channel.id] ?? { type: 'random' };
                  const opacity = trackOpacityByChannel[channel.id] ?? DEFAULT_TRACK_OPACITY;
                  const lineWidth = trackLineWidthByChannel[channel.id] ?? DEFAULT_TRACK_LINE_WIDTH;
                  const summary = trackSummaryByChannel.get(channel.id) ?? { total: 0, visible: 0 };
                  const allChecked = summary.total > 0 && summary.visible === summary.total;
                  const channelFollowedId = followedTrackChannelId === channel.id ? followedTrackId : null;
                  const colorLabel =
                    colorMode.type === 'uniform' ? normalizeTrackColor(colorMode.color) : 'Sorted';

                  return (
                    <div
                      key={channel.id}
                      id={`track-panel-${channel.id}`}
                      role="tabpanel"
                      aria-labelledby={`track-tab-${channel.id}`}
                      className={isActive ? 'track-panel is-active' : 'track-panel'}
                      hidden={!isActive}
                    >
                      <div className="control-group">
                        <button
                          type="button"
                          onClick={() => handleStopTrackFollow(channel.id)}
                          disabled={channelFollowedId === null}
                          className={
                            channelFollowedId !== null
                              ? 'viewer-stop-tracking is-active'
                              : 'viewer-stop-tracking'
                          }
                        >
                          Stop tracking
                        </button>
                      </div>
                      <div className="slider-control">
                        <label htmlFor={`track-opacity-${channel.id}`}>
                          Opacity <span>{Math.round(opacity * 100)}%</span>
                        </label>
                        <input
                          id={`track-opacity-${channel.id}`}
                          type="range"
                          min={0}
                          max={1}
                          step={0.05}
                          value={opacity}
                          onChange={(event) =>
                            handleTrackOpacityChange(channel.id, Number(event.target.value))
                          }
                          disabled={tracksForChannel.length === 0}
                        />
                      </div>
                      <div className="slider-control">
                        <label htmlFor={`track-linewidth-${channel.id}`}>
                          Thickness <span>{lineWidth.toFixed(1)}</span>
                        </label>
                        <input
                          id={`track-linewidth-${channel.id}`}
                          type="range"
                          min={0.5}
                          max={5}
                          step={0.1}
                          value={lineWidth}
                          onChange={(event) =>
                            handleTrackLineWidthChange(channel.id, Number(event.target.value))
                          }
                          disabled={tracksForChannel.length === 0}
                        />
                      </div>
                      <div className="track-color-control">
                        <div className="track-color-control-header">
                          <span id={`track-color-label-${channel.id}`}>Preset colors</span>
                          <span>{colorLabel}</span>
                        </div>
                        <div className="track-color-swatch-row">
                          <div
                            className="color-swatch-grid"
                            role="group"
                            aria-labelledby={`track-color-label-${channel.id}`}
                          >
                            {TRACK_COLOR_SWATCHES.map((swatch) => {
                              const normalized = normalizeTrackColor(swatch.value);
                              const isSelected =
                                colorMode.type === 'uniform' &&
                                normalizeTrackColor(colorMode.color) === normalized;
                              return (
                                <button
                                  key={swatch.value}
                                  type="button"
                                  className={
                                    isSelected ? 'color-swatch-button is-selected' : 'color-swatch-button'
                                  }
                                  style={{ backgroundColor: swatch.value }}
                                  onClick={() => handleTrackColorSelect(channel.id, swatch.value)}
                                  disabled={tracksForChannel.length === 0}
                                  aria-pressed={isSelected}
                                  aria-label={`${swatch.label} tracks color`}
                                  title={swatch.label}
                                />
                              );
                            })}
                          </div>
                          <button
                            type="button"
                            className={
                              colorMode.type === 'random'
                                ? 'track-color-mode-button is-active'
                                : 'track-color-mode-button'
                            }
                            onClick={() => handleTrackColorReset(channel.id)}
                            disabled={tracksForChannel.length === 0}
                          >
                            Sorted
                          </button>
                        </div>
                      </div>
                      <div className="track-list-header">
                        <label className="track-master-toggle">
                          <input
                            ref={registerTrackMasterCheckbox(channel.id)}
                            type="checkbox"
                            checked={tracksForChannel.length > 0 && allChecked}
                            onChange={(event) =>
                              handleTrackVisibilityAllChange(channel.id, event.target.checked)
                            }
                            disabled={tracksForChannel.length === 0}
                            aria-label={`Show all tracks for ${channelName}`}
                          />
                          <span>Show all tracks</span>
                        </label>
                      </div>
                      {tracksForChannel.length > 0 ? (
                        <div
                          className="track-list"
                          role="group"
                          aria-label={`${channelName} track visibility`}
                        >
                          {tracksForChannel.map((track) => {
                            const isFollowed = followedTrackId === track.id;
                            const isChecked = isFollowed || (trackVisibility[track.id] ?? true);
                            const trackColor =
                              colorMode.type === 'uniform'
                                ? normalizeTrackColor(colorMode.color)
                                : getTrackColorHex(track.id);
                            return (
                              <div
                                key={track.id}
                                className={isFollowed ? 'track-item is-following' : 'track-item'}
                                title={`${track.channelName} · Track #${track.trackNumber}`}
                              >
                                <label className="track-toggle">
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => handleTrackVisibilityToggle(track.id)}
                                  />
                                  <span className="track-label">
                                    <span
                                      className="track-color-swatch"
                                      style={{ backgroundColor: trackColor }}
                                      aria-hidden="true"
                                    />
                                    <span className="track-name">Track #{track.trackNumber}</span>
                                  </span>
                                </label>
                                <button
                                  type="button"
                                  className={
                                    isFollowed ? 'track-follow-button is-active' : 'track-follow-button'
                                  }
                                  onClick={() => handleTrackFollow(track.id)}
                                  aria-pressed={isFollowed}
                                >
                                  {isFollowed ? 'Following' : 'Follow'}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="track-empty-hint">
                          Load a tracks file to toggle individual trajectories.
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="track-empty-hint">Add a channel to manage tracks.</p>
            )}
          </div>
      </FloatingWindow>
      </div>
    </>
  );
}

export default App;
