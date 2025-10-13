import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import { loadVolumesFromFiles } from './loaders/volumeLoader';
import VolumeViewer from './components/VolumeViewer';
import PlanarViewer from './components/PlanarViewer';
import { computeNormalizationParameters, normalizeVolume, NormalizedVolume } from './volumeProcessing';
import { clearTextureCache } from './textureCache';
import FloatingWindow from './components/FloatingWindow';
import type { TrackDefinition, TrackPoint } from './types/tracks';
import { DEFAULT_LAYER_COLOR, GRAYSCALE_COLOR_SWATCHES, normalizeHexColor } from './layerColors';
import { getTrackColorHex } from './trackColors';
import './App.css';

const DEFAULT_CONTRAST = 1;
const DEFAULT_BRIGHTNESS = 0;
const DEFAULT_FPS = 12;
const DEFAULT_TRACK_OPACITY = 0.9;
const DEFAULT_TRACK_LINE_WIDTH = 1;
const WINDOW_MARGIN = 24;
const CONTROL_WINDOW_WIDTH = 360;
const TRACK_WINDOW_WIDTH = 340;
const LAYERS_WINDOW_VERTICAL_OFFSET = 420;
const MAX_CHANNELS = 3;
const MAX_CHANNELS_MESSAGE = 'Maximum of 3 channels reached. Remove a channel before adding a new one.';

type LoadState = 'idle' | 'loading' | 'loaded' | 'error';

type LayerTarget = {
  key: string;
  label: string;
};

type LoadedLayer = LayerTarget & {
  channelId: string;
  volumes: NormalizedVolume[];
};

type LayerSettings = {
  contrast: number;
  brightness: number;
  color: string;
  xOffset: number;
  yOffset: number;
};

const createDefaultLayerSettings = (): LayerSettings => ({
  contrast: DEFAULT_CONTRAST,
  brightness: DEFAULT_BRIGHTNESS,
  color: DEFAULT_LAYER_COLOR,
  xOffset: 0,
  yOffset: 0
});

type ChannelLayerSource = {
  id: string;
  name: string;
  files: File[];
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
    return '0 layers';
  }
  const totalFiles = channel.layers.reduce((acc, layer) => acc + layer.files.length, 0);
  const layerLabel = channel.layers.length === 1 ? 'layer' : 'layers';
  const fileLabel = totalFiles === 1 ? 'file' : 'files';
  return `${channel.layers.length} ${layerLabel} · ${totalFiles} ${fileLabel}`;
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

function inferLayerLabel(
  files: File[],
  fallbackIndex: number,
  existingLabels: Set<string>
) {
  let baseLabel: string | null = null;
  const first = files[0];
  if (first) {
    const relative = first.webkitRelativePath;
    if (relative) {
      const segments = relative.split('/').filter(Boolean);
      if (segments.length > 1) {
        baseLabel = segments[segments.length - 2] ?? null;
      }
    }
    if (!baseLabel) {
      const nameWithoutExtension = first.name.replace(/\.[^.]+$/, '');
      baseLabel = nameWithoutExtension || null;
    }
  }

  if (!baseLabel) {
    baseLabel = `Layer ${fallbackIndex + 1}`;
  }

  let candidate = baseLabel;
  let counter = 2;
  while (existingLabels.has(candidate)) {
    candidate = `${baseLabel} (${counter})`;
    counter += 1;
  }
  return candidate;
}

function makeUniqueName(baseName: string, existingNames: Set<string>) {
  const trimmed = baseName.trim() || 'Untitled';
  if (!existingNames.has(trimmed)) {
    return trimmed;
  }

  let counter = 2;
  let candidate = `${trimmed} (${counter})`;
  while (existingNames.has(candidate)) {
    counter += 1;
    candidate = `${trimmed} (${counter})`;
  }
  return candidate;
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
  if (validation.errors.length > 0) {
    parts.push('Needs attention');
  } else if (validation.warnings.length > 0) {
    parts.push('Warnings');
  }
  return parts.join(' · ');
};

type ChannelCardProps = {
  channel: ChannelSource;
  validation: ChannelValidation;
  isDisabled: boolean;
  onLayerFilesAdded: (id: string, files: File[]) => void;
  onLayerDrop: (id: string, dataTransfer: DataTransfer) => void;
  onLayerNameChange: (channelId: string, layerId: string, value: string) => void;
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
  onLayerNameChange,
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

  useEffect(() => {
    const input = layerInputRef.current;
    if (!input) {
      return;
    }
    input.setAttribute('directory', '');
    input.setAttribute('webkitdirectory', '');
    input.setAttribute('mozdirectory', '');
  }, []);

  useEffect(() => {
    if (isDisabled) {
      setIsLayerDragging(false);
      setIsTrackDragging(false);
    }
  }, [isDisabled]);

  const handleLayerBrowse = useCallback(() => {
    if (isDisabled) {
      return;
    }
    layerInputRef.current?.click();
  }, [isDisabled]);

  const handleLayerInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      if (isDisabled) {
        event.target.value = '';
        return;
      }
      const fileList = event.target.files;
      if (fileList && fileList.length > 0) {
        onLayerFilesAdded(channel.id, Array.from(fileList));
      }
      event.target.value = '';
    },
    [channel.id, isDisabled, onLayerFilesAdded]
  );

  const handleLayerDragEnter = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (isDisabled) {
        return;
      }
      dragCounterRef.current += 1;
      setIsLayerDragging(true);
    },
    [isDisabled]
  );

  const handleLayerDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (isDisabled) {
      event.dataTransfer.dropEffect = 'none';
      return;
    }
    event.dataTransfer.dropEffect = 'copy';
  }, [isDisabled]);

  const handleLayerDragLeave = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (isDisabled) {
        return;
      }
      dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
      if (dragCounterRef.current === 0) {
        setIsLayerDragging(false);
      }
    },
    [isDisabled]
  );

  const handleLayerDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      dragCounterRef.current = 0;
      setIsLayerDragging(false);
      if (isDisabled) {
        return;
      }
      const { dataTransfer } = event;
      if (!dataTransfer) {
        return;
      }
      onLayerDrop(channel.id, dataTransfer);
    },
    [channel.id, isDisabled, onLayerDrop]
  );

  const handleTrackBrowse = useCallback(() => {
    if (isDisabled) {
      return;
    }
    trackInputRef.current?.click();
  }, [isDisabled]);

  const handleTrackInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      if (isDisabled) {
        event.target.value = '';
        return;
      }
      const fileList = event.target.files;
      if (fileList && fileList.length > 0) {
        onTrackFileSelected(channel.id, fileList[0] ?? null);
      }
      event.target.value = '';
    },
    [channel.id, isDisabled, onTrackFileSelected]
  );

  const handleTrackDragEnter = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (isDisabled) {
        return;
      }
      trackDragCounterRef.current += 1;
      setIsTrackDragging(true);
    },
    [isDisabled]
  );

  const handleTrackDragLeave = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (isDisabled) {
        return;
      }
      trackDragCounterRef.current = Math.max(0, trackDragCounterRef.current - 1);
      if (trackDragCounterRef.current === 0) {
        setIsTrackDragging(false);
      }
    },
    [isDisabled]
  );

  const handleTrackDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      trackDragCounterRef.current = 0;
      setIsTrackDragging(false);
      if (isDisabled) {
        return;
      }
      const { dataTransfer } = event;
      if (!dataTransfer) {
        return;
      }
      onTrackDrop(channel.id, dataTransfer);
    },
    [channel.id, isDisabled, onTrackDrop]
  );

  return (
    <section className={`channel-card${isDisabled ? ' is-disabled' : ''}`} aria-disabled={isDisabled}>
      {validation.errors.length > 0 || validation.warnings.length > 0 ? (
        <ul className="channel-validation">
          {validation.errors.map((error, errorIndex) => (
            <li key={`error-${errorIndex}`} className="channel-validation-error">
              {error}
            </li>
          ))}
          {validation.warnings.map((warning, warningIndex) => (
            <li key={`warning-${warningIndex}`} className="channel-validation-warning">
              {warning}
            </li>
          ))}
        </ul>
      ) : null}
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
          disabled={isDisabled}
        />
        <div className="channel-layer-drop-content">
          <button
            type="button"
            className="channel-layer-drop-button"
            onClick={handleLayerBrowse}
            disabled={isDisabled}
          >
            Add layers
          </button>
          <p className="channel-layer-drop-subtitle">Drop folders or TIFF sequences to add layers.</p>
        </div>
      </div>
      {channel.layers.length > 0 ? (
        <ul className="channel-layer-list">
          {channel.layers.map((layer) => {
            return (
              <li key={layer.id} className="channel-layer-item">
                <div className="channel-layer-header">
                  <input
                    type="text"
                    value={layer.name}
                    placeholder="Layer name"
                    onChange={(event) => onLayerNameChange(channel.id, layer.id, event.target.value)}
                    className="channel-layer-name"
                    autoComplete="off"
                    disabled={isDisabled}
                  />
                  <button
                    type="button"
                    className="channel-layer-remove"
                    onClick={() => onLayerRemove(channel.id, layer.id)}
                    aria-label={`Remove ${layer.name}`}
                    disabled={isDisabled}
                  >
                    Remove
                  </button>
                </div>
                <p className="channel-layer-meta">
                  {layer.files.length === 1 ? '1 file' : `${layer.files.length} files`}
                </p>
              </li>
            );
          })}
        </ul>
      ) : null}
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
          disabled={isDisabled}
        />
        <div className="channel-tracks-content">
          <div className="channel-tracks-row">
            <div className="channel-tracks-description">
              <button
                type="button"
                className="channel-tracks-button"
                onClick={handleTrackBrowse}
                disabled={isDisabled}
              >
                Add tracks (optional)
              </button>
              <p className="channel-tracks-subtitle">Drop or browse for a CSV to attach tracks.</p>
            </div>
            {channel.trackFile ? (
              <button
                type="button"
                onClick={() => onTrackClear(channel.id)}
                className="channel-track-clear"
                disabled={isDisabled}
              >
                Clear
              </button>
            ) : null}
          </div>
          {channel.trackError ? <p className="channel-tracks-error">{channel.trackError}</p> : null}
          {channel.trackStatus === 'loading' ? <p className="channel-tracks-status">Loading tracks…</p> : null}
          {channel.trackStatus === 'loaded' ? (
            <p className="channel-tracks-status">
              {channel.trackEntries.length === 1
                ? 'Loaded 1 track entry.'
                : `Loaded ${channel.trackEntries.length} track entries.`}
            </p>
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
  const [tracks, setTracks] = useState<string[][]>([]);
  const [trackVisibility, setTrackVisibility] = useState<Record<number, boolean>>({});
  const [trackOpacity, setTrackOpacity] = useState(DEFAULT_TRACK_OPACITY);
  const [trackLineWidth, setTrackLineWidth] = useState(DEFAULT_TRACK_LINE_WIDTH);
  const [followedTrackId, setFollowedTrackId] = useState<number | null>(null);
  const [viewerMode, setViewerMode] = useState<'3d' | '2d'>('3d');
  const [sliceIndex, setSliceIndex] = useState(0);
  const [isViewerLaunched, setIsViewerLaunched] = useState(false);
  const [isLaunchingViewer, setIsLaunchingViewer] = useState(false);
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

  const loadRequestRef = useRef(0);
  const hasTrackDataRef = useRef(false);
  const trackMasterCheckboxRef = useRef<HTMLInputElement | null>(null);
  const channelIdRef = useRef(0);
  const layerIdRef = useRef(0);
  const editingChannelOriginalNameRef = useRef('');
  const editingChannelInputRef = useRef<HTMLInputElement | null>(null);
  const pendingChannelFocusIdRef = useRef<string | null>(null);

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

  const createLayerSource = useCallback((name: string, files: File[]): ChannelLayerSource => {
    const nextId = layerIdRef.current + 1;
    layerIdRef.current = nextId;
    return {
      id: `layer-${nextId}`,
      name,
      files
    };
  }, []);

  useEffect(() => {
    if (editingChannelId && editingChannelId !== activeChannelId) {
      setEditingChannelId(null);
    }
  }, [activeChannelId, editingChannelId]);

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
  const parsedTracks = useMemo<TrackDefinition[]>(() => {
    if (tracks.length === 0) {
      return [];
    }

    const trackMap = new Map<number, TrackPoint[]>();
    let maxTimeValue = -Infinity;

    for (const row of tracks) {
      if (row.length < 6) {
        continue;
      }

      const rawId = Number(row[0]);
      const time = Number(row[2]);
      const x = Number(row[3]);
      const y = Number(row[4]);
      const z = Number(row[5]);

      if (
        !Number.isFinite(rawId) ||
        !Number.isFinite(time) ||
        !Number.isFinite(x) ||
        !Number.isFinite(y) ||
        !Number.isFinite(z)
      ) {
        continue;
      }

      const id = Math.trunc(rawId);
      if (time > maxTimeValue) {
        maxTimeValue = time;
      }

      const normalizedTime = Math.max(0, time - 1);
      const point: TrackPoint = { time: normalizedTime, x, y, z };
      const existing = trackMap.get(id);
      if (existing) {
        existing.push(point);
      } else {
        trackMap.set(id, [point]);
      }
    }

    const parsed: TrackDefinition[] = [];
    const datasetTimepointCount = Number.isFinite(maxTimeValue) ? Math.max(0, Math.trunc(maxTimeValue)) : 0;

    for (const [id, points] of trackMap.entries()) {
      if (points.length === 0) {
        continue;
      }

      const sortedPoints = [...points].sort((a, b) => a.time - b.time);
      const uniqueTimeCount = new Set(sortedPoints.map((point) => point.time)).size;
      const offset = Math.max(0, datasetTimepointCount - uniqueTimeCount);
      const adjustedPoints = sortedPoints.map<TrackPoint>((point) => ({
        time: point.time + offset,
        x: point.x,
        y: point.y,
        z: point.z
      }));
      parsed.push({ id, points: adjustedPoints });
    }

    parsed.sort((a, b) => a.id - b.id);

    return parsed;
  }, [tracks]);
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

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const trackWidth = Math.min(TRACK_WINDOW_WIDTH, window.innerWidth - WINDOW_MARGIN * 2);
    const nextX = Math.max(WINDOW_MARGIN, window.innerWidth - trackWidth - WINDOW_MARGIN);

    setTrackWindowInitialPosition((current) => {
      if (current.x === nextX && current.y === WINDOW_MARGIN) {
        return current;
      }
      return { x: nextX, y: WINDOW_MARGIN };
    });
  }, []);

  useEffect(() => {
    const previouslyHadData = hasTrackDataRef.current;
    if (!hasParsedTrackData) {
      hasTrackDataRef.current = false;
      setTrackVisibility({});
      setTrackOpacity(DEFAULT_TRACK_OPACITY);
      setTrackLineWidth(DEFAULT_TRACK_LINE_WIDTH);
      return;
    }

    if (!previouslyHadData) {
      setTrackOpacity(DEFAULT_TRACK_OPACITY);
      setTrackLineWidth(DEFAULT_TRACK_LINE_WIDTH);
    }

    hasTrackDataRef.current = true;
  }, [hasParsedTrackData]);

  useEffect(() => {
    if (parsedTracks.length === 0) {
      return;
    }

    setTrackVisibility((current) => {
      const next: Record<number, boolean> = {};
      let changed = false;

      for (const track of parsedTracks) {
        const previous = current[track.id];
        if (previous === undefined) {
          changed = true;
        }
        next[track.id] = previous ?? true;
      }

      for (const key of Object.keys(current)) {
        const numericKey = Number(key);
        if (!parsedTracks.some((track) => track.id === numericKey)) {
          changed = true;
          break;
        }
      }

      if (!changed && Object.keys(next).length === Object.keys(current).length) {
        return current;
      }

      return next;
    });
  }, [parsedTracks]);

  useEffect(() => {
    if (followedTrackId === null) {
      return;
    }

    const hasTrack = parsedTracks.some((track) => track.id === followedTrackId);
    if (!hasTrack) {
      setFollowedTrackId(null);
    }
  }, [followedTrackId, parsedTracks]);

  const loadSelectedDataset = useCallback(async () => {
    setDatasetError(null);
    const flatLayerSources = channels
      .flatMap((channel) =>
        channel.layers.map((layer) => ({
          channelId: channel.id,
          key: layer.id,
          label: layer.name.trim() || 'Untitled layer',
          files: sortVolumeFiles(layer.files)
        }))
      )
      .filter((entry) => entry.files.length > 0);

    if (flatLayerSources.length === 0) {
      const message = 'Add at least one layer before launching the viewer.';
      setDatasetError(message);
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
      setDatasetError(message);
      setStatus('error');
      setError(message);
      return false;
    }

    setExpectedVolumeCount(totalExpectedVolumes);

    try {
      for (const layer of flatLayerSources) {
        if (layer.files.length !== referenceFiles.length) {
          throw new Error(
            `Layer "${layer.label}" has a different number of timepoints (${layer.files.length}) than the first layer (${referenceFiles.length}).`
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
                  `Layer "${layer.label}" has volume dimensions ${volume.width}×${volume.height}×${volume.depth} that do not match the reference shape ${referenceShape.width}×${referenceShape.height}×${referenceShape.depth}.`
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
        const normalizationParameters = computeNormalizationParameters(volumes);
        const normalizedVolumes = volumes.map((rawVolume) => normalizeVolume(rawVolume, normalizationParameters));
        return {
          key: layer.key,
          label: layer.label,
          channelId: layer.channelId,
          volumes: normalizedVolumes
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
      setDatasetError(null);
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
      const message = err instanceof Error ? err.message : 'Failed to load volumes.';
      setDatasetError(message);
      setError(message);
      return false;
    }
  }, [channels]);

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
  const playbackLabel = useMemo(() => {
    if (volumeTimepointCount === 0) {
      return '0 / 0';
    }
    const currentFrame = Math.min(selectedIndex + 1, volumeTimepointCount);
    return `${currentFrame} / ${volumeTimepointCount}`;
  }, [selectedIndex, volumeTimepointCount]);

  const trackVisibilitySummary = useMemo(() => {
    if (parsedTracks.length === 0) {
      return { total: 0, visible: 0 };
    }
    let visible = 0;
    for (const track of parsedTracks) {
      if (trackVisibility[track.id] ?? true) {
        visible += 1;
      }
    }
    return { total: parsedTracks.length, visible };
  }, [parsedTracks, trackVisibility]);

  const allTracksChecked =
    trackVisibilitySummary.total > 0 && trackVisibilitySummary.visible === trackVisibilitySummary.total;
  const someTracksChecked =
    trackVisibilitySummary.total > 0 &&
    trackVisibilitySummary.visible > 0 &&
    trackVisibilitySummary.visible < trackVisibilitySummary.total;

  useEffect(() => {
    const checkbox = trackMasterCheckboxRef.current;
    if (!checkbox) {
      return;
    }
    checkbox.indeterminate = someTracksChecked && !allTracksChecked;
  }, [allTracksChecked, someTracksChecked]);

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
    let createdChannelMeta: { id: string; name: string } | null = null;
    let blocked = false;
    setChannels((current) => {
      if (current.length >= MAX_CHANNELS) {
        blocked = true;
        return current;
      }
      const existingNames = new Set(current.map((channel) => channel.name));
      const defaultName = makeUniqueName(`Channel ${current.length + 1}`, existingNames);
      const newChannel = createChannelSource(defaultName);
      createdChannelMeta = { id: newChannel.id, name: newChannel.name };
      return [...current, newChannel];
    });
    if (blocked) {
      setDatasetError(MAX_CHANNELS_MESSAGE);
      return;
    }
    if (createdChannelMeta) {
      const { id, name } = createdChannelMeta;
      pendingChannelFocusIdRef.current = id;
      setActiveChannelId(id);
      editingChannelOriginalNameRef.current = name;
      setEditingChannelId(id);
      setDatasetError(null);
    }
  }, [createChannelSource]);

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
    setDatasetError(null);
  }, []);

  const handleChannelLayerFilesAdded = useCallback(
    (channelId: string, incomingFiles: File[]) => {
      const tiffFiles = dedupeFiles(incomingFiles.filter((file) => hasTiffExtension(file.name)));
      if (tiffFiles.length === 0) {
        setDatasetError('No TIFF files detected in the dropped selection.');
        return;
      }

      let addedAny = false;
      setChannels((current) =>
        current.map((channel) => {
          if (channel.id !== channelId) {
            return channel;
          }
          const grouped = groupFilesIntoLayers(tiffFiles);
          if (grouped.length === 0) {
            return channel;
          }
          const existingLabels = new Set(channel.layers.map((layer) => layer.name));
          const newLayers: ChannelLayerSource[] = [];
          for (const group of grouped) {
            const sorted = sortVolumeFiles(group);
            if (sorted.length === 0) {
              continue;
            }
            const label = inferLayerLabel(sorted, channel.layers.length + newLayers.length, existingLabels);
            existingLabels.add(label);
            newLayers.push(createLayerSource(label, sorted));
          }
          if (newLayers.length === 0) {
            return channel;
          }
          addedAny = true;
          return { ...channel, layers: [...channel.layers, ...newLayers] };
        })
      );

      if (addedAny) {
        setDatasetError(null);
      } else {
        setDatasetError('No new layers were added from that drop.');
      }
    },
    [createLayerSource]
  );

  const handleChannelLayerDrop = useCallback(
    async (channelId: string, dataTransfer: DataTransfer) => {
      const files = await collectFilesFromDataTransfer(dataTransfer);
      if (files.length === 0) {
        setDatasetError('No TIFF files detected in the dropped selection.');
        return;
      }
      handleChannelLayerFilesAdded(channelId, files);
    },
    [handleChannelLayerFilesAdded]
  );

  const handleChannelLayerNameChange = useCallback(
    (channelId: string, layerId: string, value: string) => {
      setChannels((current) =>
        current.map((channel) => {
          if (channel.id !== channelId) {
            return channel;
          }
          return {
            ...channel,
            layers: channel.layers.map((layer) => (layer.id === layerId ? { ...layer, name: value } : layer))
          };
        })
      );
    },
    []
  );

  const handleChannelLayerRemove = useCallback((channelId: string, layerId: string) => {
    setChannels((current) =>
      current.map((channel) => {
        if (channel.id !== channelId) {
          return channel;
        }
        return {
          ...channel,
          layers: channel.layers.filter((layer) => layer.id !== layerId)
        };
      })
    );
  }, []);

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

      if (channel.layers.length === 0) {
        errors.push('Add at least one layer to this channel.');
      } else {
        const timepointCounts = new Set<number>();
        for (const layer of channel.layers) {
          if (layer.files.length === 0) {
            errors.push(`Layer "${layer.name || 'Untitled layer'}" has no files.`);
          }
          timepointCounts.add(layer.files.length);
        }
        if (timepointCounts.size > 1) {
          errors.push('Layers have mismatched timepoint counts.');
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

  const activeChannel = useMemo(
    () => channels.find((channel) => channel.id === activeChannelId) ?? null,
    [activeChannelId, channels]
  );


  const handleLaunchViewer = useCallback(async () => {
    if (isLaunchingViewer) {
      return;
    }

    const hasAnyLayers = channels.some((channel) =>
      channel.layers.some((layer) => layer.files.length > 0)
    );
    if (!hasAnyLayers) {
      setDatasetError('Add at least one layer before launching the viewer.');
      return;
    }

    const blockingChannel = channelValidationList.find((entry) => entry.errors.length > 0);
    if (blockingChannel) {
      const channelName = channels.find((channel) => channel.id === blockingChannel.channelId)?.name ?? 'a channel';
      setDatasetError(`Resolve the errors in ${channelName} before launching.`);
      return;
    }

    const hasLoadingTracks = channels.some((channel) => channel.trackStatus === 'loading');
    if (hasLoadingTracks) {
      setDatasetError('Wait for tracks to finish loading before launching.');
      return;
    }

    setDatasetError(null);
    setIsLaunchingViewer(true);
    try {
      const datasetLoaded = await loadSelectedDataset();
      if (!datasetLoaded) {
        return;
      }

      const firstTrackChannel = channels.find((channel) => channel.trackEntries.length > 0);
      setTracks(firstTrackChannel ? firstTrackChannel.trackEntries : []);

      setIsViewerLaunched(true);
    } finally {
      setIsLaunchingViewer(false);
    }
  }, [channels, channelValidationList, isLaunchingViewer, loadSelectedDataset]);

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

  const handleTrackVisibilityToggle = useCallback((trackId: number) => {
    let toggledOff = false;
    setTrackVisibility((current) => {
      const previous = current[trackId];
      const nextValue = !(previous ?? true);
      if (!nextValue) {
        toggledOff = true;
      }
      return {
        ...current,
        [trackId]: nextValue
      };
    });
    if (toggledOff) {
      setFollowedTrackId((current) => (current === trackId ? null : current));
    }
  }, []);

  const handleTrackVisibilityAllChange = useCallback(
    (isChecked: boolean) => {
      if (!isChecked) {
        setFollowedTrackId(null);
      }
      setTrackVisibility(
        parsedTracks.reduce<Record<number, boolean>>((acc, track) => {
          acc[track.id] = isChecked;
          return acc;
        }, {})
      );
    },
    [parsedTracks]
  );

  const handleTrackOpacityChange = useCallback((value: number) => {
    setTrackOpacity((current) => {
      if (current === value) {
        return current;
      }
      return value;
    });
  }, []);

  const handleTrackLineWidthChange = useCallback((value: number) => {
    setTrackLineWidth((current) => {
      if (current === value) {
        return current;
      }
      return value;
    });
  }, []);

  const ensureTrackIsVisible = useCallback((trackId: number) => {
    setTrackVisibility((current) => {
      if (current[trackId]) {
        return current;
      }
      return { ...current, [trackId]: true };
    });
  }, []);

  const handleTrackFollow = useCallback(
    (trackId: number) => {
      setFollowedTrackId((current) => (current === trackId ? null : trackId));
      ensureTrackIsVisible(trackId);
    },
    [ensureTrackIsVisible]
  );

  const handleTrackFollowFromViewer = useCallback(
    (trackId: number) => {
      setFollowedTrackId((current) => (current === trackId ? current : trackId));
      ensureTrackIsVisible(trackId);
    },
    [ensureTrackIsVisible]
  );

  const handleStopTrackFollow = useCallback(() => {
    setFollowedTrackId(null);
  }, []);

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
            brightness: DEFAULT_BRIGHTNESS,
            xOffset: 0,
            yOffset: 0
          };
          if (
            previous.contrast !== updated.contrast ||
            previous.brightness !== updated.brightness ||
            previous.xOffset !== updated.xOffset ||
            previous.yOffset !== updated.yOffset
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
        brightness: settings.brightness,
        color: normalizeHexColor(settings.color, DEFAULT_LAYER_COLOR),
        offsetX: isActiveChannel ? settings.xOffset : 0,
        offsetY: isActiveChannel ? settings.yOffset : 0
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
    const canAddMoreChannels = channels.length < MAX_CHANNELS;
    const isFrontPageLocked = isLaunchingViewer;
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
                disabled={!canAddMoreChannels || isFrontPageLocked}
              >
                Add channel
              </button>
            </div>
            <div className="channel-board">
              {channels.length > 0 ? (
                <>
                  <div className="channel-tabs" role="tablist" aria-label="Configured channels">
                    {channels.map((channel, index) => {
                      const validation = channelValidationMap.get(channel.id) ?? { errors: [], warnings: [] };
                      const isActive = channel.id === activeChannelId;
                      const isEditing = editingChannelId === channel.id;
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
                                disabled={isFrontPageLocked}
                              />
                              <span className="channel-tab-meta">{tabMeta}</span>
                            </span>
                            <button
                              type="button"
                              className="channel-tab-remove"
                              aria-label={`Remove ${channel.name || `Channel ${index + 1}`}`}
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
                            setActiveChannelId(channel.id);
                          }}
                          onDoubleClick={(event) => {
                            if (isFrontPageLocked) {
                              event.preventDefault();
                              event.stopPropagation();
                              return;
                            }
                            if (!isActive) {
                              return;
                            }
                            event.preventDefault();
                            event.stopPropagation();
                            editingChannelOriginalNameRef.current = channel.name;
                            setEditingChannelId(channel.id);
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
                            <span className="channel-tab-name">{channel.name || `Channel ${index + 1}`}</span>
                            <span className="channel-tab-meta">{tabMeta}</span>
                          </span>
                          <button
                            type="button"
                            className="channel-tab-remove"
                            aria-label={`Remove ${channel.name || `Channel ${index + 1}`}`}
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
                        onLayerNameChange={handleChannelLayerNameChange}
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
            {datasetError ? <p className="launch-feedback launch-feedback-error">{datasetError}</p> : null}
            <div className="front-page-actions">
              <button
                type="button"
                className="launch-viewer-button"
                onClick={handleLaunchViewer}
                disabled={!canLaunch || isLaunchingViewer}
              >
                {isLaunchingViewer ? 'Loading…' : 'Launch viewer'}
              </button>
            </div>
          </div>
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
              onRegisterReset={handleRegisterReset}
              tracks={parsedTracks}
              trackVisibility={trackVisibility}
              trackOpacity={trackOpacity}
              trackLineWidth={trackLineWidth}
              followedTrackId={followedTrackId}
              onTrackFollowRequest={handleTrackFollowFromViewer}
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
              trackOpacity={trackOpacity}
              trackLineWidth={trackLineWidth}
              followedTrackId={followedTrackId}
              onTrackFollowRequest={handleTrackFollowFromViewer}
            />
          )}
        </main>
        <FloatingWindow
          title="Playback controls"
          initialPosition={controlWindowInitialPosition}
          width={`min(${CONTROL_WINDOW_WIDTH}px, calc(100vw - ${WINDOW_MARGIN * 2}px))`}
        >
          <div className="sidebar sidebar-left">
            <header className="sidebar-header">
              <button type="button" className="sidebar-launcher-button" onClick={handleReturnToLauncher}>
                Return to Launcher
              </button>
            </header>

            <div className="global-controls">
              <div className="control-group">
                <div className="viewer-mode-row">
                  <button
                    type="button"
                    onClick={handleToggleViewerMode}
                    className={viewerMode === '3d' ? 'viewer-mode-button' : 'viewer-mode-button is-active'}
                  >
                    {viewerMode === '3d' ? 'Go to 2D view' : 'Go to 3D view'}
                  </button>
                  <button type="button" onClick={() => resetViewHandler?.()} disabled={!resetViewHandler}>
                    Reset view
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
            {error && <p className="error">{error}</p>}
          </div>
        </FloatingWindow>

        <FloatingWindow
          title="Channels"
          initialPosition={layersWindowInitialPosition}
          width={`min(${CONTROL_WINDOW_WIDTH}px, calc(100vw - ${WINDOW_MARGIN * 2}px))`}
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
                        <span className={labelClassName}>{label}</span>
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
                  const isVisible = channelVisibility[channelId] ?? true;

                  return (
                    <div
                      key={channelId}
                      id={`channel-panel-${channelId}`}
                      role="tabpanel"
                      aria-labelledby={`channel-tab-${channelId}`}
                      className={isActive ? 'channel-panel is-active' : 'channel-panel'}
                      hidden={!isActive}
                    >
                      <div className="channel-visibility-row">
                        <label className="channel-visibility">
                          <input
                            type="checkbox"
                            checked={isVisible}
                            onChange={() => handleChannelVisibilityToggle(channelId)}
                          />
                          <span>Show channel</span>
                        </label>
                        <button
                          type="button"
                          className="channel-reset"
                          onClick={() => handleChannelSliderReset(channelId)}
                          disabled={channelLayers.length === 0}
                        >
                          reset sliders
                        </button>
                      </div>
                      {channelLayers.length > 0 ? (
                        <div
                          className="channel-layer-selector"
                          role="radiogroup"
                          aria-label={`${channelNameMap.get(channelId) ?? 'Channel'} layers`}
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
                      ) : (
                        <p className="channel-empty-hint">No layers available for this channel.</p>
                      )}
                      {selectedLayer ? (
                        <>
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
                                min={-0.5}
                                max={0.5}
                                step={0.01}
                                value={settings.brightness}
                                onChange={(event) =>
                                  handleLayerBrightnessChange(selectedLayer.key, Number(event.target.value))
                                }
                                disabled={sliderDisabled}
                              />
                            </div>
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
                              <label className="color-picker" htmlFor={`layer-color-custom-${selectedLayer.key}`}>
                                <span>Custom</span>
                                <input
                                  id={`layer-color-custom-${selectedLayer.key}`}
                                  type="color"
                                  value={normalizedColor}
                                  onChange={(event) =>
                                    handleLayerColorChange(selectedLayer.key, event.target.value)
                                  }
                                  disabled={sliderDisabled}
                                  aria-label="Choose custom tint color"
                                />
                              </label>
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
        >
          <div className="sidebar sidebar-right">
            <div className="track-controls">
              <div className="control-group">
                <button
                  type="button"
                  onClick={handleStopTrackFollow}
                  disabled={followedTrackId === null}
                  className="viewer-stop-tracking"
                >
                  Stop tracking
                </button>
              </div>
              <div className="slider-control">
                <label htmlFor="track-opacity-slider">
                  Opacity <span>{Math.round(trackOpacity * 100)}%</span>
                </label>
                <input
                  id="track-opacity-slider"
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={trackOpacity}
                  onChange={(event) => handleTrackOpacityChange(Number(event.target.value))}
                  disabled={parsedTracks.length === 0}
                />
              </div>
              <div className="slider-control">
                <label htmlFor="track-linewidth-slider">
                  Thickness <span>{trackLineWidth.toFixed(1)}</span>
                </label>
                <input
                  id="track-linewidth-slider"
                  type="range"
                  min={0.5}
                  max={5}
                  step={0.1}
                  value={trackLineWidth}
                  onChange={(event) => handleTrackLineWidthChange(Number(event.target.value))}
                  disabled={parsedTracks.length === 0}
                />
              </div>
              <div className="track-list-header">
                <label className="track-master-toggle">
                  <input
                    ref={trackMasterCheckboxRef}
                    type="checkbox"
                    checked={parsedTracks.length > 0 && allTracksChecked}
                    onChange={(event) => handleTrackVisibilityAllChange(event.target.checked)}
                    disabled={parsedTracks.length === 0}
                  />
                  <span>Show all tracks</span>
                </label>
              </div>
              {parsedTracks.length > 0 ? (
                <div className="track-list" role="group" aria-label="Track visibility">
                  {parsedTracks.map((track, index) => {
                    const isFollowed = followedTrackId === track.id;
                    const isChecked = isFollowed || (trackVisibility[track.id] ?? true);
                    const trackColor = getTrackColorHex(track.id);
                    return (
                      <div
                        key={track.id}
                        className={isFollowed ? 'track-item is-following' : 'track-item'}
                        title={`Track ID ${track.id}`}
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
                            <span className="track-name">Track #{index + 1}</span>
                          </span>
                        </label>
                        <button
                          type="button"
                          className={isFollowed ? 'track-follow-button is-active' : 'track-follow-button'}
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
                <p className="track-empty-hint">Load a tracks file to toggle individual trajectories.</p>
              )}
            </div>
          </div>
      </FloatingWindow>
      </div>
    </>
  );
}

export default App;
