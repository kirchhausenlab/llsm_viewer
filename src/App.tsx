import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, CSSProperties, DragEvent, FormEvent } from 'react';
import { loadVolumesFromFiles } from './loaders/volumeLoader';
import { VolumeTooLargeError, formatBytes } from './errors';
import VolumeViewer from './components/VolumeViewer';
import PlanarViewer from './components/PlanarViewer';
import {
  colorizeSegmentationVolume,
  computeNormalizationParameters,
  normalizeVolume
} from './volumeProcessing';
import { clearTextureCache } from './textureCache';
import FloatingWindow from './components/FloatingWindow';
import FrontPage from './components/FrontPage/FrontPage';
import SelectedTracksWindow from './components/SelectedTracksWindow';
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
import {
  importPreprocessedDataset,
  type ChannelExportMetadata,
  type ImportPreprocessedDatasetResult
} from './utils/preprocessedDataset';
import {
  exportPreprocessedDatasetInWorker,
  canUseFileSystemSavePicker,
  collectStreamToBlob,
  requestFileSystemSaveHandle,
  writeStreamToFileHandle,
  type FileSystemFileHandleLike
} from './workers/exportPreprocessedDatasetClient';
import {
  brightnessContrastModel,
  clampWindowBounds,
  computeContrastMultiplier,
  createDefaultLayerSettings,
  DEFAULT_RENDER_STYLE,
  DEFAULT_SAMPLING_MODE,
  DEFAULT_WINDOW_MAX,
  DEFAULT_WINDOW_MIN,
  formatContrastMultiplier,
  type LayerSettings,
  type SamplingMode
} from './state/layerSettings';
import { deriveChannelTrackOffsets } from './state/channelTrackOffsets';
import type { LoadedLayer } from './types/layers';
import type { ChannelLayerSource, ChannelSource, ChannelValidation } from './types/channelSources';
import type { StagedPreprocessedExperiment } from './types/preprocessed';
import { classNames } from './utils/classNames';
import styles from './App.module.css';

const cx = (...classList: Array<string | false | null | undefined>): string =>
  classList
    .filter(Boolean)
    .map((className) => styles[className as string] ?? String(className))
    .join(' ');
import { computeAutoWindow, getVolumeHistogram } from './autoContrast';
import { getDefaultWindowForVolume } from './utils/volumeWindow';
import BrightnessContrastHistogram from './components/BrightnessContrastHistogram';
import { streamDownloadWithServiceWorker } from './utils/exportServiceWorker';
import useVrLifecycle from './hooks/useVrLifecycle';

const DEFAULT_FPS = 12;
const DEFAULT_TRACK_OPACITY = 0.9;
const DEFAULT_TRACK_LINE_WIDTH = 1;
const WINDOW_MARGIN = 24;
const CONTROL_WINDOW_WIDTH = 360;
const PLAYBACK_WINDOW_WIDTH = 420;
const TRACK_WINDOW_WIDTH = 340;
const SELECTED_TRACKS_WINDOW_WIDTH = 960;
const SELECTED_TRACKS_WINDOW_HEIGHT = 220;
const LAYERS_WINDOW_VERTICAL_OFFSET = 420;
const WARNING_WINDOW_WIDTH = 360;

const formatNormalizedIntensity = (value: number): string => {
  const fixed = value.toFixed(3);
  return fixed.replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '');
};

const applyAlphaToHex = (hexColor: string, alpha: number): string => {
  const normalized = normalizeHexColor(hexColor, DEFAULT_LAYER_COLOR);
  const clampedAlpha = Number.isFinite(alpha) ? Math.min(Math.max(alpha, 0), 1) : 1;
  const r = Number.parseInt(normalized.slice(1, 3), 16);
  const g = Number.parseInt(normalized.slice(3, 5), 16);
  const b = Number.parseInt(normalized.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${clampedAlpha})`;
};

const getTrackTabTextColor = (hexColor: string): string => {
  const normalized = normalizeTrackColor(hexColor, '#ffffff');
  const r = Number.parseInt(normalized.slice(1, 3), 16) / 255;
  const g = Number.parseInt(normalized.slice(3, 5), 16) / 255;
  const b = Number.parseInt(normalized.slice(5, 7), 16) / 255;
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.58 ? '#0b1220' : '#ffffff';
};

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

function App() {
  const [channels, setChannels] = useState<ChannelSource[]>([]);
  const [isExperimentSetupStarted, setIsExperimentSetupStarted] = useState(false);
  const [preprocessedExperiment, setPreprocessedExperiment] = useState<StagedPreprocessedExperiment | null>(null);
  const [isPreprocessedLoaderOpen, setIsPreprocessedLoaderOpen] = useState(false);
  const [isPreprocessedImporting, setIsPreprocessedImporting] = useState(false);
  const [preprocessedImportError, setPreprocessedImportError] = useState<string | null>(null);
  const [isPreprocessedDragActive, setIsPreprocessedDragActive] = useState(false);
  const [isExportingPreprocessed, setIsExportingPreprocessed] = useState(false);
  const [preprocessedDropboxImporting, setPreprocessedDropboxImporting] = useState(false);
  const [preprocessedDropboxError, setPreprocessedDropboxError] = useState<string | null>(null);
  const [preprocessedDropboxInfo, setPreprocessedDropboxInfo] = useState<string | null>(null);
  const [isPreprocessedDropboxConfigOpen, setIsPreprocessedDropboxConfigOpen] = useState(false);
  const [preprocessedDropboxAppKeyInput, setPreprocessedDropboxAppKeyInput] = useState('');
  const [preprocessedDropboxAppKeySource, setPreprocessedDropboxAppKeySource] = useState<DropboxAppKeySource | null>(
    null
  );
  const [editingChannelId, setEditingChannelId] = useState<string | null>(null);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [datasetError, setDatasetError] = useState<string | null>(null);
  const [datasetErrorContext, setDatasetErrorContext] = useState<DatasetErrorContext | null>(null);
  const [datasetErrorResetSignal, setDatasetErrorResetSignal] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [layers, setLayers] = useState<LoadedLayer[]>([]);
  const layersRef = useRef<LoadedLayer[]>([]);
  useEffect(() => {
    layersRef.current = layers;
  }, [layers]);
  const [channelVisibility, setChannelVisibility] = useState<Record<string, boolean>>({});
  const [channelActiveLayer, setChannelActiveLayer] = useState<Record<string, string>>({});
  const [layerSettings, setLayerSettings] = useState<Record<string, LayerSettings>>({});
  const createLayerDefaultSettings = useCallback(
    (layerKey: string): LayerSettings => {
      const layer = layersRef.current.find((entry) => entry.key === layerKey) ?? null;
      const defaultWindow = getDefaultWindowForVolume(layer?.volumes[0]);
      return createDefaultLayerSettings(defaultWindow);
    },
    []
  );
  const createLayerDefaultBrightnessState = useCallback(
    (layerKey: string) => {
      const layer = layersRef.current.find((entry) => entry.key === layerKey) ?? null;
      const defaultWindow = getDefaultWindowForVolume(layer?.volumes[0]);
      return brightnessContrastModel.createState(
        defaultWindow?.windowMin,
        defaultWindow?.windowMax
      );
    },
    []
  );
  const [layerAutoThresholds, setLayerAutoThresholds] = useState<Record<string, number>>({});
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
  const [trackOrderModeByChannel, setTrackOrderModeByChannel] = useState<Record<string, 'id' | 'length'>>({});
  const [selectedTrackIds, setSelectedTrackIds] = useState<ReadonlySet<string>>(new Set());
  const [followedTrack, setFollowedTrack] = useState<FollowedTrackState>(null);
  const [viewerMode, setViewerMode] = useState<'3d' | '2d'>('3d');
  const [sliceIndex, setSliceIndex] = useState(0);
  const [isViewerLaunched, setIsViewerLaunched] = useState(false);
  const [isLaunchingViewer, setIsLaunchingViewer] = useState(false);
  const [layoutResetToken, setLayoutResetToken] = useState(0);
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
  const computeSelectedTracksWindowDefaultPosition = useCallback(() => {
    if (typeof window === 'undefined') {
      return { x: WINDOW_MARGIN, y: WINDOW_MARGIN };
    }
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const windowWidth = Math.min(SELECTED_TRACKS_WINDOW_WIDTH, viewportWidth - WINDOW_MARGIN * 2);
    const x = Math.max(WINDOW_MARGIN, Math.round((viewportWidth - windowWidth) / 2));
    const y = Math.max(
      WINDOW_MARGIN,
      viewportHeight - SELECTED_TRACKS_WINDOW_HEIGHT - WINDOW_MARGIN
    );
    return { x, y };
  }, []);
  const [selectedTracksWindowInitialPosition, setSelectedTracksWindowInitialPosition] = useState<{
    x: number;
    y: number;
  }>(() => computeSelectedTracksWindowDefaultPosition());

  const loadRequestRef = useRef(0);
  const trackMasterCheckboxRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const channelIdRef = useRef(0);
  const layerIdRef = useRef(0);
  const editingChannelOriginalNameRef = useRef('');
  const editingChannelInputRef = useRef<HTMLInputElement | null>(null);
  const pendingChannelFocusIdRef = useRef<string | null>(null);
  const preprocessedFileInputRef = useRef<HTMLInputElement | null>(null);
  const preprocessedDropCounterRef = useRef(0);
  const helpMenuRef = useRef<HTMLDivElement | null>(null);

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

  const updateChannelIdCounter = useCallback((sources: ChannelSource[]) => {
    let maxId = channelIdRef.current;
    for (const source of sources) {
      const match = /([0-9]+)$/.exec(source.id);
      if (!match) {
        continue;
      }
      const value = Number.parseInt(match[1], 10);
      if (Number.isFinite(value) && value > maxId) {
        maxId = value;
      }
    }
    channelIdRef.current = maxId;
  }, []);

  const syncPreprocessedDropboxConfig = useCallback(() => {
    const info = getDropboxAppKeyInfo();
    setPreprocessedDropboxAppKeyInput(info.appKey ?? '');
    setPreprocessedDropboxAppKeySource(info.source);
  }, []);

  const resetPreprocessedLoader = useCallback(() => {
    setPreprocessedImportError(null);
    setPreprocessedDropboxError(null);
    setPreprocessedDropboxInfo(null);
    setIsPreprocessedDropboxConfigOpen(false);
    setIsPreprocessedDragActive(false);
    preprocessedDropCounterRef.current = 0;
  }, []);

  useEffect(() => {
    if (isPreprocessedLoaderOpen) {
      syncPreprocessedDropboxConfig();
      resetPreprocessedLoader();
    }
  }, [isPreprocessedLoaderOpen, resetPreprocessedLoader, syncPreprocessedDropboxConfig]);

  useEffect(() => {
    if (preprocessedExperiment) {
      return;
    }
    if (channels.length === 0) {
      setIsExperimentSetupStarted(false);
    }
  }, [channels, preprocessedExperiment]);

  const handleBeforeEnterVr = useCallback(() => {
    setFollowedTrack(null);
  }, [setFollowedTrack]);

  const {
    isVrSupportChecked,
    isVrSupported,
    isVrPassthroughSupported,
    isVrActive,
    isVrRequesting,
    hasVrSessionHandlers,
    isVrAvailable,
    vrButtonLabel,
    enterVr,
    exitVr,
    registerSessionHandlers,
    handleSessionStarted,
    handleSessionEnded
  } = useVrLifecycle({
    viewerMode,
    onBeforeEnter: handleBeforeEnterVr
  });

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
  const channelTintMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const channel of channels) {
      const channelLayers = channelLayersMap.get(channel.id) ?? [];
      const activeLayerKey = channelActiveLayer[channel.id] ?? channelLayers[0]?.key ?? null;
      if (activeLayerKey) {
        const settings = layerSettings[activeLayerKey];
        const normalized = normalizeHexColor(settings?.color ?? DEFAULT_LAYER_COLOR, DEFAULT_LAYER_COLOR);
        map.set(channel.id, normalized);
      } else {
        map.set(channel.id, DEFAULT_LAYER_COLOR);
      }
    }
    return map;
  }, [channelActiveLayer, channelLayersMap, channels, layerSettings]);
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
        if (row.length < 7) {
          continue;
        }

        const rawId = Number(row[0]);
        const initialTime = Number(row[1]);
        const deltaTime = Number(row[2]);
        const x = Number(row[3]);
        const y = Number(row[4]);
        const z = Number(row[5]);
        const amplitudeRaw = Number(row[6]);

        if (
          !Number.isFinite(rawId) ||
          !Number.isFinite(initialTime) ||
          !Number.isFinite(deltaTime) ||
          !Number.isFinite(x) ||
          !Number.isFinite(y) ||
          !Number.isFinite(z) ||
          !Number.isFinite(amplitudeRaw)
        ) {
          continue;
        }

        const id = Math.trunc(rawId);
        const time = initialTime + deltaTime;
        const normalizedTime = Math.max(0, time - 1);
        const amplitude = Math.max(0, amplitudeRaw);
        const point: TrackPoint = { time: normalizedTime, x, y, z, amplitude };
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
      sortedEntries.forEach(([sourceTrackId, points]) => {
        if (points.length === 0) {
          return;
        }

        const sortedPoints = [...points].sort((a, b) => a.time - b.time);
        const adjustedPoints = sortedPoints.map<TrackPoint>((point) => ({
          time: point.time,
          x: point.x,
          y: point.y,
          z: point.z,
          amplitude: point.amplitude
        }));

        parsed.push({
          id: `${channel.id}:${sourceTrackId}`,
          channelId: channel.id,
          channelName,
          trackNumber: sourceTrackId,
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

  const selectedTrackSeries = useMemo(
    () =>
      parsedTracks
        .filter((track) => selectedTrackIds.has(track.id))
        .map((track) => ({
          id: track.id,
          label: `${track.channelName} · Track #${track.trackNumber}`,
          color: getTrackColorHex(track.id),
          points: track.points
        })),
    [parsedTracks, selectedTrackIds]
  );

  useEffect(() => {
    setSelectedTrackIds((current) => {
      if (current.size === 0) {
        return current;
      }

      const next = new Set<string>();
      for (const track of parsedTracks) {
        if (current.has(track.id)) {
          next.add(track.id);
        }
      }

      return next.size === current.size ? current : next;
    });
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
    setSelectedTracksWindowInitialPosition(computeSelectedTracksWindowDefaultPosition());
  }, [
    computeSelectedTracksWindowDefaultPosition,
    computeTrackWindowDefaultPosition
  ]);

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
    const defaultPosition = computeSelectedTracksWindowDefaultPosition();
    setSelectedTracksWindowInitialPosition((current) => {
      if (current.x === defaultPosition.x && current.y === defaultPosition.y) {
        return current;
      }
      return defaultPosition;
    });
  }, [computeSelectedTracksWindowDefaultPosition]);

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

  const applyLoadedLayers = useCallback(
    (normalizedLayers: LoadedLayer[], expectedVolumeCount: number) => {
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
          const defaultWindow = getDefaultWindowForVolume(layer.volumes[0]);
          acc[layer.key] = createDefaultLayerSettings(defaultWindow);
          return acc;
        }, {})
      );
      setLayerAutoThresholds(
        normalizedLayers.reduce<Record<string, number>>((acc, layer) => {
          acc[layer.key] = 0;
          return acc;
        }, {})
      );
      setSelectedIndex(0);
      setActiveChannelTabId(Object.keys(activeLayerDefaults)[0] ?? null);
      setStatus('loaded');
      setLoadedCount(expectedVolumeCount);
      setExpectedVolumeCount(expectedVolumeCount);
      setLoadProgress(expectedVolumeCount > 0 ? 1 : 0);
      setIsPlaying(false);
      clearDatasetError();
      setError(null);
    },
    [clearDatasetError]
  );

  const loadSelectedDataset = useCallback(async (): Promise<LoadedLayer[] | null> => {
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
      return null;
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
    setLayerAutoThresholds({});
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
      return null;
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
                setLoadProgress(totalExpectedVolumes === 0 ? 0 : next / totalExpectedVolumes);
                return next;
              });
            }
          });
          return { layer, volumes };
        })
      );

      if (loadRequestRef.current !== requestId) {
        return null;
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

      applyLoadedLayers(normalizedLayers, totalExpectedVolumes);
      return normalizedLayers;
    } catch (err) {
      if (loadRequestRef.current !== requestId) {
        return null;
      }
      console.error(err);
      setStatus('error');
      clearTextureCache();
      setLayers([]);
      setChannelVisibility({});
      setChannelActiveLayer({});
      setLayerSettings({});
      setLayerAutoThresholds({});
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
      return null;
    }
  }, [
    applyLoadedLayers,
    channels,
    clearDatasetError,
    colorizeSegmentationVolume,
    computeNormalizationParameters,
    createSegmentationSeed,
    normalizeVolume,
    showLaunchError
  ]);

  const isLoading = status === 'loading';
  const playbackDisabled = isLoading || volumeTimepointCount <= 1;
  const vrButtonDisabled = isVrActive ? false : !isVrAvailable || !hasVrSessionHandlers || isVrRequesting;
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
        const explicitVisible = state.visibility[track.id] ?? true;
        const isFollowedTrack = followedTrack?.id === track.id;
        const isSelectedTrack = selectedTrackIds.has(track.id);
        if (explicitVisible || isFollowedTrack || isSelectedTrack) {
          visible += 1;
        }
      }
      summary.set(channel.id, { total: tracksForChannel.length, visible });
    }
    return summary;
  }, [channels, channelTrackStates, followedTrack, parsedTracksByChannel, selectedTrackIds]);

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
        const defaultWindow = getDefaultWindowForVolume(layer.volumes[0]);
        const settings = layerSettings[layer.key] ?? createLayerDefaultSettings(layer.key);
        const firstVolume = layer.volumes[0] ?? null;
        const isGrayscale = Boolean(firstVolume && firstVolume.channels === 1);
        const histogram = firstVolume ? getVolumeHistogram(firstVolume) : null;
        return {
          key: layer.key,
          label: layer.label,
          hasData: layer.volumes.length > 0,
          isGrayscale,
          isSegmentation: layer.isSegmentation,
          defaultWindow,
          histogram,
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

  const channelTrackOffsets = useMemo(
    () =>
      deriveChannelTrackOffsets({
        channels,
        channelLayersMap,
        channelActiveLayer,
        layerSettings
      }),
    [channelActiveLayer, channelLayersMap, channels, layerSettings]
  );

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

  const handleJumpToStart = useCallback(() => {
    if (volumeTimepointCount === 0) {
      return;
    }
    handleTimeIndexChange(0);
  }, [handleTimeIndexChange, volumeTimepointCount]);

  const handleJumpToEnd = useCallback(() => {
    if (volumeTimepointCount === 0) {
      return;
    }
    handleTimeIndexChange(volumeTimepointCount - 1);
  }, [handleTimeIndexChange, volumeTimepointCount]);

  const handleAddChannel = useCallback(() => {
    setPreprocessedExperiment(null);
    setIsPreprocessedLoaderOpen(false);
    setIsExperimentSetupStarted(true);
    setPreprocessedImportError(null);
    setPreprocessedDropboxError(null);
    setPreprocessedDropboxInfo(null);
    setIsPreprocessedDropboxConfigOpen(false);

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

  const handleChannelNameEditStart = useCallback((channelId: string, currentName: string) => {
    editingChannelOriginalNameRef.current = currentName;
    setEditingChannelId(channelId);
  }, []);

  const handleChannelNameEditCommit = useCallback(() => {
    editingChannelInputRef.current = null;
    setEditingChannelId(null);
  }, []);

  const handleChannelNameEditCancel = useCallback(
    (channelId: string) => {
      handleChannelNameChange(channelId, editingChannelOriginalNameRef.current);
      editingChannelInputRef.current = null;
      setEditingChannelId(null);
    },
    [handleChannelNameChange]
  );

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
          setLayerAutoThresholds((current) => {
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
      setLayerAutoThresholds((current) => {
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

  const handlePreprocessedLoaderOpen = useCallback(() => {
    if (isPreprocessedImporting || preprocessedDropboxImporting) {
      return;
    }
    setIsPreprocessedLoaderOpen(true);
    resetPreprocessedLoader();
  }, [isPreprocessedImporting, preprocessedDropboxImporting, resetPreprocessedLoader]);

  const handlePreprocessedLoaderClose = useCallback(() => {
    if (isPreprocessedImporting) {
      return;
    }
    setIsPreprocessedLoaderOpen(false);
    resetPreprocessedLoader();
  }, [isPreprocessedImporting, resetPreprocessedLoader]);

  const importPreprocessedFile = useCallback(
    async (file: File) => {
      if (isPreprocessedImporting) {
        return;
      }
      setIsPreprocessedImporting(true);
      setPreprocessedImportError(null);
      setPreprocessedDropboxError(null);
      setPreprocessedDropboxInfo(null);
      try {
        const buffer = await file.arrayBuffer();
        const result = await importPreprocessedDataset(buffer);
        const staged: StagedPreprocessedExperiment = {
          ...result,
          sourceName: file.name ?? null,
          sourceSize: Number.isFinite(file.size) ? file.size : null
        };
        const nextChannels = result.channelSummaries.map<ChannelSource>((summary) => ({
          id: summary.id,
          name: summary.name,
          layers: [],
          trackFile: null,
          trackStatus: 'loaded',
          trackError: null,
          trackEntries: summary.trackEntries
        }));
        setChannels(nextChannels);
        updateChannelIdCounter(nextChannels);
        setActiveChannelId(null);
        setEditingChannelId(null);
        setChannelTrackStates({});
        setTrackOrderModeByChannel({});
        setSelectedTrackIds(new Set());
        setFollowedTrack(null);
        setPreprocessedExperiment(staged);
        setIsExperimentSetupStarted(false);
        setIsPreprocessedLoaderOpen(false);
        resetPreprocessedLoader();
        clearDatasetError();
      } catch (error) {
        console.error('Failed to import preprocessed dataset', error);
        const message = error instanceof Error ? error.message : 'Failed to import preprocessed dataset.';
        setPreprocessedImportError(message);
        setPreprocessedExperiment(null);
        setChannels([]);
        setIsExperimentSetupStarted(false);
      } finally {
        setIsPreprocessedImporting(false);
      }
    },
    [
      clearDatasetError,
      isPreprocessedImporting,
      resetPreprocessedLoader,
      updateChannelIdCounter
    ]
  );

  const handlePreprocessedFileInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      if (isPreprocessedImporting || preprocessedDropboxImporting) {
        event.target.value = '';
        return;
      }
      const fileList = event.target.files;
      if (fileList && fileList.length > 0) {
        importPreprocessedFile(fileList[0]);
      }
      event.target.value = '';
    },
    [importPreprocessedFile, isPreprocessedImporting, preprocessedDropboxImporting]
  );

  const handlePreprocessedBrowse = useCallback(() => {
    if (isPreprocessedImporting || preprocessedDropboxImporting) {
      return;
    }
    preprocessedFileInputRef.current?.click();
  }, [isPreprocessedImporting, preprocessedDropboxImporting]);

  const handlePreprocessedDragEnter = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (isPreprocessedImporting || preprocessedDropboxImporting) {
        return;
      }
      preprocessedDropCounterRef.current += 1;
      setIsPreprocessedDragActive(true);
    },
    [isPreprocessedImporting, preprocessedDropboxImporting]
  );

  const handlePreprocessedDragLeave = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (isPreprocessedImporting || preprocessedDropboxImporting) {
        return;
      }
      preprocessedDropCounterRef.current = Math.max(0, preprocessedDropCounterRef.current - 1);
      if (preprocessedDropCounterRef.current === 0) {
        setIsPreprocessedDragActive(false);
      }
    },
    [isPreprocessedImporting, preprocessedDropboxImporting]
  );

  const handlePreprocessedDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  }, []);

  const handlePreprocessedDrop = useCallback(
    async (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      preprocessedDropCounterRef.current = 0;
      setIsPreprocessedDragActive(false);
      if (isPreprocessedImporting || preprocessedDropboxImporting) {
        return;
      }
      const { dataTransfer } = event;
      if (!dataTransfer) {
        return;
      }
      const files = await collectFilesFromDataTransfer(dataTransfer);
      const [first] = files;
      if (first) {
        await importPreprocessedFile(first);
      } else {
        setPreprocessedImportError('Drop a file to import the preprocessed experiment.');
      }
    },
    [importPreprocessedFile, isPreprocessedImporting, preprocessedDropboxImporting]
  );

  const handlePreprocessedDropboxConfigInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setPreprocessedDropboxAppKeyInput(event.target.value);
      if (preprocessedDropboxInfo) {
        setPreprocessedDropboxInfo(null);
      }
    },
    [preprocessedDropboxInfo]
  );

  const handlePreprocessedDropboxConfigSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (preprocessedDropboxAppKeySource === 'env') {
        setIsPreprocessedDropboxConfigOpen(false);
        return;
      }
      const trimmed = preprocessedDropboxAppKeyInput.trim();
      setDropboxAppKey(trimmed ? trimmed : null);
      syncPreprocessedDropboxConfig();
      setIsPreprocessedDropboxConfigOpen(false);
      setPreprocessedDropboxError(null);
      setPreprocessedDropboxInfo(
        trimmed
          ? 'Dropbox app key saved. Try importing from Dropbox again.'
          : 'Saved Dropbox app key cleared.'
      );
    },
    [preprocessedDropboxAppKeyInput, preprocessedDropboxAppKeySource, syncPreprocessedDropboxConfig]
  );

  const handlePreprocessedDropboxConfigClear = useCallback(() => {
    setDropboxAppKey(null);
    syncPreprocessedDropboxConfig();
    setPreprocessedDropboxInfo('Saved Dropbox app key cleared.');
    setPreprocessedDropboxError(null);
  }, [syncPreprocessedDropboxConfig]);

  const handlePreprocessedDropboxConfigCancel = useCallback(() => {
    setIsPreprocessedDropboxConfigOpen(false);
  }, []);

  const handlePreprocessedDropboxImport = useCallback(
    async () => {
      if (isPreprocessedImporting || preprocessedDropboxImporting) {
        return;
      }
      setPreprocessedDropboxError(null);
      setPreprocessedDropboxInfo(null);
      setPreprocessedDropboxImporting(true);
      try {
        const files = await chooseDropboxFiles({
          extensions: ['.zip', '.llsm', '.llsmz', '.json'],
          multiselect: false
        });
        const [file] = files;
        if (file) {
          await importPreprocessedFile(file);
        }
      } catch (error) {
        console.error('Failed to import preprocessed experiment from Dropbox', error);
        if (error instanceof DropboxConfigurationError) {
          syncPreprocessedDropboxConfig();
          setIsPreprocessedDropboxConfigOpen(true);
          setPreprocessedDropboxError(
            'Dropbox is not configured yet. Add your Dropbox app key below to connect your account.'
          );
        } else {
          const message = error instanceof Error ? error.message : 'Failed to import from Dropbox.';
          setPreprocessedDropboxError(message);
        }
      } finally {
        setPreprocessedDropboxImporting(false);
      }
    },
    [
      importPreprocessedFile,
      isPreprocessedImporting,
      preprocessedDropboxImporting,
      syncPreprocessedDropboxConfig
    ]
  );

  const handleDiscardPreprocessedExperiment = useCallback(() => {
    setPreprocessedExperiment(null);
    setChannels([]);
    setChannelVisibility({});
    setChannelActiveLayer({});
    setLayerSettings({});
    setLayerAutoThresholds({});
    setLayers([]);
    setSelectedIndex(0);
    setActiveChannelId(null);
    setEditingChannelId(null);
    setActiveChannelTabId(null);
    setChannelTrackStates({});
    setTrackOrderModeByChannel({});
    setSelectedTrackIds(new Set());
    setFollowedTrack(null);
    setStatus('idle');
    setError(null);
    setLoadProgress(0);
    setLoadedCount(0);
    setExpectedVolumeCount(0);
    setIsPlaying(false);
    setIsViewerLaunched(false);
    setIsExperimentSetupStarted(false);
    setPreprocessedImportError(null);
    setPreprocessedDropboxError(null);
    setPreprocessedDropboxInfo(null);
    setIsPreprocessedLoaderOpen(false);
    resetPreprocessedLoader();
    channelIdRef.current = 0;
    layerIdRef.current = 0;
    clearTextureCache();
    clearDatasetError();
  }, [clearDatasetError, resetPreprocessedLoader]);



  const frontPageMode = useMemo<'initial' | 'configuring' | 'preprocessed'>(() => {
    if (preprocessedExperiment) {
      return 'preprocessed';
    }
    if (channels.length > 0 || isExperimentSetupStarted) {
      return 'configuring';
    }
    return 'initial';
  }, [channels, isExperimentSetupStarted, preprocessedExperiment]);

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
  const launchButtonEnabled = frontPageMode === 'preprocessed' ? preprocessedExperiment !== null : canLaunch;
  const launchButtonLaunchable = launchButtonEnabled ? 'true' : 'false';

  const activeChannel = useMemo(
    () => channels.find((channel) => channel.id === activeChannelId) ?? null,
    [activeChannelId, channels]
  );

  const launchErrorMessage = datasetErrorContext === 'launch' ? datasetError : null;
  const interactionErrorMessage = datasetErrorContext === 'interaction' ? datasetError : null;


  const handleLaunchViewer = useCallback(async () => {
    if (isLaunchingViewer) {
      return;
    }

    if (preprocessedExperiment) {
      clearDatasetError();
      setIsLaunchingViewer(true);
      try {
        applyLoadedLayers(preprocessedExperiment.layers, preprocessedExperiment.totalVolumeCount);
        setIsViewerLaunched(true);
      } finally {
        setIsLaunchingViewer(false);
      }
      return;
    }

    const hasAnyLayersConfigured = channels.some((channel) =>
      channel.layers.some((layer) => layer.files.length > 0)
    );
    if (!hasAnyLayersConfigured) {
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

    const hasPendingTracks = channels.some((channel) => channel.trackStatus === 'loading');
    if (hasPendingTracks) {
      showLaunchError('Wait for tracks to finish loading before launching.');
      return;
    }

    clearDatasetError();
    setIsLaunchingViewer(true);
    try {
      const normalizedLayers = await loadSelectedDataset();
      if (!normalizedLayers) {
        return;
      }

      setIsViewerLaunched(true);
    } finally {
      setIsLaunchingViewer(false);
    }
  }, [
    applyLoadedLayers,
    channelValidationList,
    channels,
    clearDatasetError,
    isLaunchingViewer,
    loadSelectedDataset,
    preprocessedExperiment,
    showLaunchError
  ]);

  const handleExportPreprocessedExperiment = useCallback(async () => {
    if (isExportingPreprocessed || isLaunchingViewer) {
      return;
    }

    const hasAnyLayers = preprocessedExperiment
      ? preprocessedExperiment.layers.length > 0
      : channels.some((channel) => channel.layers.length > 0);

    if (!hasAnyLayers) {
      showInteractionWarning('There are no volumes available to export.');
      return;
    }

    setIsExportingPreprocessed(true);
    try {
      const suggestionSource =
        preprocessedExperiment?.sourceName ?? channels[0]?.name ?? 'preprocessed-experiment';
      const suggestionTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const suggestionBase = sanitizeExportFileName(suggestionSource);
      const suggestedFileName = `${suggestionBase}-${suggestionTimestamp}.zip`;

      let fileHandle: FileSystemFileHandleLike | null = null;
      if (canUseFileSystemSavePicker()) {
        try {
          fileHandle = await requestFileSystemSaveHandle(suggestedFileName);
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') {
            console.info('Preprocessed dataset export cancelled by user');
            return;
          }
          throw error;
        }
      }

      let layersToExport: LoadedLayer[];
      let channelsMetadata: ChannelExportMetadata[];

      if (preprocessedExperiment) {
        layersToExport = preprocessedExperiment.layers;
        channelsMetadata = preprocessedExperiment.channelSummaries.map((summary) => ({
          id: summary.id,
          name: summary.name.trim() || 'Untitled channel',
          trackEntries: summary.trackEntries
        }));
      } else {
        const normalizedLayers = await loadSelectedDataset();
        if (!normalizedLayers) {
          return;
        }
        layersToExport = normalizedLayers;
        channelsMetadata = channels.map<ChannelExportMetadata>((channel) => ({
          id: channel.id,
          name: channel.name.trim() || 'Untitled channel',
          trackEntries: channel.trackEntries
        }));
      }

      if (layersToExport.length === 0) {
        showInteractionWarning('There are no volumes available to export.');
        return;
      }

      const { manifest, stream } = await exportPreprocessedDatasetInWorker({
        layers: layersToExport,
        channels: channelsMetadata
      });

      const baseNameSource =
        preprocessedExperiment?.sourceName ?? channelsMetadata[0]?.name ?? 'preprocessed-experiment';
      const fileBase = sanitizeExportFileName(baseNameSource);
      const timestamp = manifest.generatedAt.replace(/[:.]/g, '-');
      const fileName = `${fileBase}-${timestamp}.zip`;

      await downloadStream(stream, fileName, fileHandle);
      clearDatasetError();
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        console.info('Preprocessed dataset export cancelled by user');
      } else {
        console.error('Failed to export preprocessed dataset', error);
        const message =
          error instanceof Error ? error.message : 'Failed to export preprocessed dataset.';
        showInteractionWarning(message);
      }
    } finally {
      setIsExportingPreprocessed(false);
    }
  }, [
    channels,
    clearDatasetError,
    isExportingPreprocessed,
    isLaunchingViewer,
    loadSelectedDataset,
    preprocessedExperiment,
    showInteractionWarning
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
        setSelectedTrackIds((current) => {
          if (!current.has(trackId)) {
            return current;
          }
          const next = new Set(current);
          next.delete(trackId);
          return next;
        });
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
        setSelectedTrackIds((current) => {
          if (current.size === 0) {
            return current;
          }
          const next = new Set(current);
          for (const track of tracksForChannel) {
            next.delete(track.id);
          }
          return next.size === current.size ? current : next;
        });
      }
    },
    [parsedTracksByChannel]
  );

  const handleTrackOrderToggle = useCallback((channelId: string) => {
    setTrackOrderModeByChannel((current) => {
      const previous = current[channelId] ?? 'id';
      const nextMode = previous === 'id' ? 'length' : 'id';
      if (current[channelId] === nextMode) {
        return current;
      }
      return {
        ...current,
        [channelId]: nextMode
      };
    });
  }, []);

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

  const handleTrackSelectionToggle = useCallback(
    (trackId: string) => {
      const track = trackLookup.get(trackId);
      if (!track) {
        return;
      }

      let didSelect = false;
      setSelectedTrackIds((current) => {
        if (current.has(trackId)) {
          const next = new Set(current);
          next.delete(trackId);
          return next;
        }
        const next = new Set(current);
        next.add(trackId);
        didSelect = true;
        return next;
      });

      if (didSelect) {
        ensureTrackIsVisible(trackId);
      }
    },
    [ensureTrackIsVisible, trackLookup]
  );

  const handleTrackFollow = useCallback(
    (trackId: string) => {
      const track = trackLookup.get(trackId);
      if (!track) {
        return;
      }

      if (followedTrack?.id !== trackId) {
        setSelectedTrackIds((current) => {
          if (current.has(trackId)) {
            return current;
          }
          const next = new Set(current);
          next.add(trackId);
          return next;
        });
      }

      setFollowedTrack((current) => (current && current.id === trackId ? null : { id: trackId, channelId: track.channelId }));
      ensureTrackIsVisible(trackId);
    },
    [ensureTrackIsVisible, followedTrack, trackLookup]
  );

  const handleTrackFollowFromViewer = useCallback(
    (trackId: string) => {
      const track = trackLookup.get(trackId);
      if (!track) {
        return;
      }

      setSelectedTrackIds((current) => {
        if (current.has(trackId)) {
          return current;
        }
        const next = new Set(current);
        next.add(trackId);
        return next;
      });

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

  const handleLayerContrastChange = useCallback((key: string, sliderIndex: number) => {
    setLayerSettings((current) => {
      const previous = current[key] ?? createLayerDefaultSettings(key);
      if (previous.contrastSliderIndex === sliderIndex) {
        return current;
      }
      const updated = brightnessContrastModel.applyContrast(previous, sliderIndex);
      if (
        previous.windowMin === updated.windowMin &&
        previous.windowMax === updated.windowMax &&
        previous.contrastSliderIndex === updated.contrastSliderIndex &&
        previous.brightnessSliderIndex === updated.brightnessSliderIndex &&
        previous.minSliderIndex === updated.minSliderIndex &&
        previous.maxSliderIndex === updated.maxSliderIndex
      ) {
        return current;
      }
      return {
        ...current,
        [key]: {
          ...previous,
          ...updated
        }
      };
    });
  }, [createLayerDefaultSettings]);

  const handleLayerBrightnessChange = useCallback((key: string, sliderIndex: number) => {
    setLayerSettings((current) => {
      const previous = current[key] ?? createLayerDefaultSettings(key);
      if (previous.brightnessSliderIndex === sliderIndex) {
        return current;
      }
      const updated = brightnessContrastModel.applyBrightness(previous, sliderIndex);
      if (
        previous.windowMin === updated.windowMin &&
        previous.windowMax === updated.windowMax &&
        previous.contrastSliderIndex === updated.contrastSliderIndex &&
        previous.brightnessSliderIndex === updated.brightnessSliderIndex &&
        previous.minSliderIndex === updated.minSliderIndex &&
        previous.maxSliderIndex === updated.maxSliderIndex
      ) {
        return current;
      }
      return {
        ...current,
        [key]: {
          ...previous,
          ...updated
        }
      };
    });
  }, [createLayerDefaultSettings]);

  const handleLayerWindowMinChange = useCallback((key: string, value: number) => {
    setLayerSettings((current) => {
      const previous = current[key] ?? createLayerDefaultSettings(key);
      const clampedValue = Math.max(DEFAULT_WINDOW_MIN, Math.min(DEFAULT_WINDOW_MAX, value));
      if (previous.windowMin === clampedValue) {
        return current;
      }
      const updated = brightnessContrastModel.applyWindow(clampedValue, previous.windowMax);
      if (
        previous.windowMin === updated.windowMin &&
        previous.windowMax === updated.windowMax &&
        previous.contrastSliderIndex === updated.contrastSliderIndex &&
        previous.brightnessSliderIndex === updated.brightnessSliderIndex &&
        previous.minSliderIndex === updated.minSliderIndex &&
        previous.maxSliderIndex === updated.maxSliderIndex
      ) {
        return current;
      }
      return {
        ...current,
        [key]: {
          ...previous,
          ...updated
        }
      };
    });
  }, [createLayerDefaultSettings]);

  const handleLayerWindowMaxChange = useCallback((key: string, value: number) => {
    setLayerSettings((current) => {
      const previous = current[key] ?? createLayerDefaultSettings(key);
      const clampedValue = Math.max(DEFAULT_WINDOW_MIN, Math.min(DEFAULT_WINDOW_MAX, value));
      if (previous.windowMax === clampedValue) {
        return current;
      }
      const updated = brightnessContrastModel.applyWindow(previous.windowMin, clampedValue);
      if (
        previous.windowMin === updated.windowMin &&
        previous.windowMax === updated.windowMax &&
        previous.contrastSliderIndex === updated.contrastSliderIndex &&
        previous.brightnessSliderIndex === updated.brightnessSliderIndex &&
        previous.minSliderIndex === updated.minSliderIndex &&
        previous.maxSliderIndex === updated.maxSliderIndex
      ) {
        return current;
      }
      return {
        ...current,
        [key]: {
          ...previous,
          ...updated
        }
      };
    });
  }, [createLayerDefaultSettings]);

  const handleLayerAutoContrast = useCallback(
    (key: string) => {
      const layer = layers.find((entry) => entry.key === key);
      if (!layer) {
        return;
      }
      const volume = layer.volumes[selectedIndex] ?? null;
      if (!volume) {
        return;
      }

      const previousThreshold = layerAutoThresholds[key] ?? 0;
      const { windowMin, windowMax, nextThreshold } = computeAutoWindow(volume, previousThreshold);
      const { windowMin: clampedMin, windowMax: clampedMax } = clampWindowBounds(windowMin, windowMax);
      const updatedState = brightnessContrastModel.applyWindow(clampedMin, clampedMax);

      setLayerAutoThresholds((current) => {
        if (current[key] === nextThreshold) {
          return current;
        }
        return {
          ...current,
          [key]: nextThreshold
        };
      });

      setLayerSettings((current) => {
        const previous = current[key] ?? createLayerDefaultSettings(key);
        if (
          previous.windowMin === updatedState.windowMin &&
          previous.windowMax === updatedState.windowMax &&
          previous.brightnessSliderIndex === updatedState.brightnessSliderIndex &&
          previous.contrastSliderIndex === updatedState.contrastSliderIndex &&
          previous.minSliderIndex === updatedState.minSliderIndex &&
          previous.maxSliderIndex === updatedState.maxSliderIndex
        ) {
          return current;
        }
        return {
          ...current,
          [key]: {
            ...previous,
            ...updatedState
          }
        };
      });
    },
    [createLayerDefaultSettings, layerAutoThresholds, layers, selectedIndex]
  );

  const handleLayerOffsetChange = useCallback((key: string, axis: 'x' | 'y', value: number) => {
    setLayerSettings((current) => {
      const previous = current[key] ?? createLayerDefaultSettings(key);
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
  }, [createLayerDefaultSettings]);

  const handleLayerColorChange = useCallback((key: string, value: string) => {
    setLayerSettings((current) => {
      const previous = current[key] ?? createLayerDefaultSettings(key);
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
  }, [createLayerDefaultSettings]);

  const handleLayerRenderStyleToggle = useCallback((key: string) => {
    setLayerSettings((current) => {
      const previous = current[key] ?? createLayerDefaultSettings(key);
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
  }, [createLayerDefaultSettings]);

  const handleLayerSamplingModeToggle = useCallback((key: string) => {
    setLayerSettings((current) => {
      const previous = current[key] ?? createLayerDefaultSettings(key);
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
  }, [createLayerDefaultSettings]);

  const handleLayerInvertToggle = useCallback((key: string) => {
    setLayerSettings((current) => {
      const previous = current[key] ?? createLayerDefaultSettings(key);
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
  }, [createLayerDefaultSettings]);

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
      const relevantLayers = layers.filter((layer) => layer.channelId === channelId);
      if (relevantLayers.length === 0) {
        return;
      }

      setLayerSettings((current) => {
        let changed = false;
        const next: Record<string, LayerSettings> = { ...current };
        for (const layer of relevantLayers) {
          const previous = current[layer.key] ?? createLayerDefaultSettings(layer.key);
          const defaultState = createLayerDefaultBrightnessState(layer.key);
          const updated: LayerSettings = {
            ...previous,
            ...defaultState,
            xOffset: 0,
            yOffset: 0,
            renderStyle: DEFAULT_RENDER_STYLE,
            invert: false,
            samplingMode: DEFAULT_SAMPLING_MODE
          };
          if (
            previous.windowMin !== updated.windowMin ||
            previous.windowMax !== updated.windowMax ||
            previous.minSliderIndex !== updated.minSliderIndex ||
            previous.maxSliderIndex !== updated.maxSliderIndex ||
            previous.brightnessSliderIndex !== updated.brightnessSliderIndex ||
            previous.contrastSliderIndex !== updated.contrastSliderIndex ||
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

      setLayerAutoThresholds((current) => {
        let changed = false;
        const next = { ...current };
        for (const layer of relevantLayers) {
          if (next[layer.key] !== 0) {
            next[layer.key] = 0;
            changed = true;
          }
        }
        return changed ? next : current;
      });
    },
    [createLayerDefaultBrightnessState, createLayerDefaultSettings, layers]
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
      const settings = layerSettings[layer.key] ?? createLayerDefaultSettings(layer.key);
      const isActiveChannel = layer.channelId === activeChannelTabId;
      const channelVisible = channelVisibility[layer.channelId];
      return {
        key: layer.key,
        label: layer.label,
        volume: layer.volumes[selectedIndex] ?? null,
        visible: channelVisible ?? true,
        sliderRange: settings.sliderRange,
        minSliderIndex: settings.minSliderIndex,
        maxSliderIndex: settings.maxSliderIndex,
        brightnessSliderIndex: settings.brightnessSliderIndex,
        contrastSliderIndex: settings.contrastSliderIndex,
        windowMin: settings.windowMin,
        windowMax: settings.windowMax,
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
    const isFrontPageLocked =
      isLaunchingViewer || isExportingPreprocessed || isPreprocessedImporting || preprocessedDropboxImporting;
    const warningWindowInitialPosition =
      typeof window === 'undefined'
        ? { x: WINDOW_MARGIN, y: WINDOW_MARGIN }
        : {
            x: Math.max(WINDOW_MARGIN, Math.round(window.innerWidth / 2 - WARNING_WINDOW_WIDTH / 2)),
            y: WINDOW_MARGIN + 16
          };

    return (
      <FrontPage
        backgroundVideoSrc={backgroundVideoSrc}
        frontPageMode={frontPageMode}
        isFrontPageLocked={isFrontPageLocked}
        channelState={{
          channels,
          activeChannelId,
          editingChannelId,
          validationMap: channelValidationMap
        }}
        channelHandlers={{
          onAddChannel: handleAddChannel,
          onRemoveChannel: handleRemoveChannel,
          onSelectChannel: setActiveChannelId,
          onChannelNameChange: handleChannelNameChange,
          onChannelEditStart: handleChannelNameEditStart,
          onChannelEditCommit: handleChannelNameEditCommit,
          onChannelEditCancel: handleChannelNameEditCancel,
          editingInputRef: editingChannelInputRef
        }}
        channelCardHandlers={{
          onLayerFilesAdded: handleChannelLayerFilesAdded,
          onLayerDrop: handleChannelLayerDrop,
          onLayerSegmentationToggle: handleChannelLayerSegmentationToggle,
          onLayerRemove: handleChannelLayerRemove,
          onTrackFileSelected: handleChannelTrackFileSelected,
          onTrackDrop: handleChannelTrackDrop,
          onTrackClear: handleChannelTrackClear
        }}
        preprocessedState={{
          isOpen: isPreprocessedLoaderOpen,
          isImporting: isPreprocessedImporting,
          isDropboxImporting: preprocessedDropboxImporting,
          isDragActive: isPreprocessedDragActive,
          importError: preprocessedImportError,
          dropboxError: preprocessedDropboxError,
          dropboxInfo: preprocessedDropboxInfo,
          isDropboxConfigOpen: isPreprocessedDropboxConfigOpen,
          dropboxAppKeyInput: preprocessedDropboxAppKeyInput,
          dropboxAppKeySource: preprocessedDropboxAppKeySource
        }}
        preprocessedHandlers={{
          onOpen: handlePreprocessedLoaderOpen,
          onClose: handlePreprocessedLoaderClose,
          onBrowse: handlePreprocessedBrowse,
          onDropboxImport: handlePreprocessedDropboxImport,
          onDragEnter: handlePreprocessedDragEnter,
          onDragLeave: handlePreprocessedDragLeave,
          onDragOver: handlePreprocessedDragOver,
          onDrop: handlePreprocessedDrop,
          onFileInputChange: handlePreprocessedFileInputChange,
          fileInputRef: preprocessedFileInputRef,
          onDropboxConfigSubmit: handlePreprocessedDropboxConfigSubmit,
          onDropboxConfigInputChange: handlePreprocessedDropboxConfigInputChange,
          onDropboxConfigCancel: handlePreprocessedDropboxConfigCancel,
          onDropboxConfigClear: handlePreprocessedDropboxConfigClear
        }}
        preprocessedSummary={{
          experiment: preprocessedExperiment,
          onDiscard: handleDiscardPreprocessedExperiment,
          isExporting: isExportingPreprocessed
        }}
        controls={{
          hasGlobalTimepointMismatch,
          interactionErrorMessage,
          launchErrorMessage,
          isLaunchingViewer,
          launchButtonEnabled,
          launchButtonLaunchable,
          canLaunch,
          onLaunchViewer: handleLaunchViewer,
          onExportPreprocessedExperiment: handleExportPreprocessedExperiment
        }}
        warnings={{
          warningWindowWidth: WARNING_WINDOW_WIDTH,
          warningWindowInitialPosition,
          datasetErrorResetSignal,
          onDatasetErrorDismiss: handleDatasetErrorDismiss,
          warningWindowClassName: cx('floating-window', 'floating-window--warning'),
          warningWindowBodyClassName: cx('floating-window-body', 'warning-window-body')
        }}
      />
    );
  }

  return (
    <>
      <div className={styles.app}>
        <main className={styles.viewer}>
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
              fps={fps}
              onTogglePlayback={handleTogglePlayback}
              onTimeIndexChange={handleTimeIndexChange}
              onFpsChange={setFps}
              onRegisterReset={handleRegisterReset}
              tracks={parsedTracks}
              trackVisibility={trackVisibility}
              trackOpacityByChannel={trackOpacityByChannel}
              trackLineWidthByChannel={trackLineWidthByChannel}
              channelTrackColorModes={channelTrackColorModes}
              channelTrackOffsets={channelTrackOffsets}
              selectedTrackIds={selectedTrackIds}
              followedTrackId={followedTrackId}
              onTrackSelectionToggle={handleTrackSelectionToggle}
              onTrackFollowRequest={handleTrackFollowFromViewer}
              vr={{
                isVrPassthroughSupported,
                trackChannels,
                activeTrackChannelId,
                onTrackChannelSelect: handleTrackChannelSelect,
                onTrackVisibilityToggle: handleTrackVisibilityToggle,
                onTrackVisibilityAllChange: handleTrackVisibilityAllChange,
                onTrackOpacityChange: handleTrackOpacityChange,
                onTrackLineWidthChange: handleTrackLineWidthChange,
                onTrackColorSelect: handleTrackColorSelect,
                onTrackColorReset: handleTrackColorReset,
                onStopTrackFollow: handleStopTrackFollow,
                channelPanels: vrChannelPanels,
                activeChannelPanelId: activeChannelTabId,
                onChannelPanelSelect: setActiveChannelTabId,
                onChannelVisibilityToggle: handleChannelVisibilityToggle,
                onChannelReset: handleChannelSliderReset,
                onChannelLayerSelect: handleChannelLayerSelectionChange,
                onLayerContrastChange: handleLayerContrastChange,
                onLayerBrightnessChange: handleLayerBrightnessChange,
                onLayerWindowMinChange: handleLayerWindowMinChange,
                onLayerWindowMaxChange: handleLayerWindowMaxChange,
                onLayerAutoContrast: handleLayerAutoContrast,
                onLayerOffsetChange: handleLayerOffsetChange,
                onLayerColorChange: handleLayerColorChange,
                onLayerRenderStyleToggle: handleLayerRenderStyleToggle,
                onLayerSamplingModeToggle: handleLayerSamplingModeToggle,
                onLayerInvertToggle: handleLayerInvertToggle,
                onRegisterVrSession: registerSessionHandlers,
                onVrSessionStarted: handleSessionStarted,
                onVrSessionEnded: handleSessionEnded
              }}
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
              selectedTrackIds={selectedTrackIds}
              onTrackSelectionToggle={handleTrackSelectionToggle}
              onTrackFollowRequest={handleTrackFollowFromViewer}
            />
          )}
        </main>
        <div className={styles['viewer-top-menu']}>
          <div className={styles['viewer-top-menu-row']}>
            <button
              type="button"
              className={styles['viewer-top-menu-button']}
              onClick={handleReturnToLauncher}
            >
              Return to Launcher
            </button>
            <button
              type="button"
              className={styles['viewer-top-menu-button']}
              onClick={handleResetWindowLayout}
            >
              Reset layout
            </button>
            <div className={styles['viewer-top-menu-help']} ref={helpMenuRef}>
              <button
                type="button"
                className={styles['viewer-top-menu-button']}
                onClick={() => setIsHelpMenuOpen((previous) => !previous)}
                aria-expanded={isHelpMenuOpen}
                aria-controls="viewer-help-popover"
              >
                Help
              </button>
              {isHelpMenuOpen ? (
                <div
                  id="viewer-help-popover"
                  className={styles['viewer-top-menu-popover']}
                  role="dialog"
                  aria-modal="false"
                  aria-labelledby="viewer-help-popover-title"
                >
                  <h3
                    id="viewer-help-popover-title"
                    className={styles['viewer-top-menu-popover-title']}
                  >
                    Viewer tips
                  </h3>
                  <div className={styles['viewer-top-menu-popover-section']}>
                    <h4>3D volume view</h4>
                    <ul>
                      <li>Use WASDQE to move forward, back, strafe, and rise or descend.</li>
                      <li>Drag to orbit the dataset. Hold Shift while dragging to pan; hold Ctrl to dolly along your view.</li>
                      <li>
                        Click a track line to select and highlight it. Use the Follow button in the Tracks window to
                        follow that object in time.
                      </li>
                    </ul>
                  </div>
                  <div className={styles['viewer-top-menu-popover-section']}>
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
          title="Viewer controls"
          initialPosition={controlWindowInitialPosition}
          width={`min(${PLAYBACK_WINDOW_WIDTH}px, calc(100vw - ${WINDOW_MARGIN * 2}px))`}
          className={cx('floating-window', 'floating-window--playback')}
          resetSignal={layoutResetToken}
        >
          <div className={classNames(styles.sidebar, styles['sidebar-left'])}>
            <div className={styles['global-controls']}>
              <div className={styles['control-group']}>
                <div className={styles['viewer-mode-row']}>
                  <button
                    type="button"
                    onClick={handleToggleViewerMode}
                    className={classNames(
                      styles['viewer-mode-button'],
                      viewerMode === '3d' && styles['is-active']
                    )}
                    disabled={isVrActive || isVrRequesting}
                  >
                    {viewerMode === '3d' ? '3D view' : '2D view'}
                  </button>
                  <button
                    type="button"
                    className={styles['viewer-mode-button']}
                    onClick={() => resetViewHandler?.()}
                    disabled={!resetViewHandler}
                  >
                    Reset view
                  </button>
                  <button
                    type="button"
                    className={styles['viewer-mode-button']}
                    onClick={handleVrButtonClick}
                    disabled={vrButtonDisabled}
                    title={vrButtonTitle}
                  >
                    {vrButtonLabel}
                  </button>
                </div>
              </div>
              <div className={styles['control-group']}>
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
                <div className={styles['control-group']}>
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
              <div className={styles['playback-controls']}>
                <div className={classNames(styles['control-group'], styles['playback-progress'])}>
                  <label htmlFor="playback-slider">
                    <span
                      className={classNames(
                        styles['playback-status'],
                        isPlaying
                          ? styles['playback-status--playing']
                          : styles['playback-status--stopped']
                      )}
                    >
                      {isPlaying ? 'Playing' : 'Stopped'}
                    </span>{' '}
                    <span>{playbackLabel}</span>
                  </label>
                  <input
                    id="playback-slider"
                    className={styles['playback-slider']}
                    type="range"
                    min={0}
                    max={Math.max(0, volumeTimepointCount - 1)}
                    value={Math.min(selectedIndex, Math.max(0, volumeTimepointCount - 1))}
                    onChange={(event) => handleTimeIndexChange(Number(event.target.value))}
                    disabled={playbackDisabled}
                  />
                </div>
                <div className={styles['playback-button-row']}>
                  <button
                    type="button"
                    className={classNames(
                      styles['playback-button'],
                      styles['playback-button--skip']
                    )}
                    onClick={handleJumpToStart}
                    disabled={playbackDisabled}
                    aria-label="Go to first frame"
                  >
                    <svg
                      className={styles['playback-button-icon']}
                      viewBox="0 0 24 24"
                      role="img"
                      aria-hidden="true"
                      focusable="false"
                    >
                      <path d="M6.25 4c.414 0 .75.336.75.75v5.69l9.088-6.143A1.5 1.5 0 0 1 18.5 5.61v12.78a1.5 1.5 0 0 1-2.412 1.313L7 13.56v5.69a.75.75 0 0 1-1.5 0V4.75c0-.414.336-.75.75-.75Z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={handleTogglePlayback}
                    disabled={playbackDisabled}
                    className={classNames(
                      styles['playback-button'],
                      styles['playback-toggle'],
                      isPlaying && styles.playing
                    )}
                    aria-label={isPlaying ? 'Pause playback' : 'Start playback'}
                  >
                    {isPlaying ? (
                      <svg
                        className={styles['playback-button-icon']}
                        viewBox="0 0 24 24"
                        role="img"
                        aria-hidden="true"
                        focusable="false"
                      >
                        <path d="M9 5a1 1 0 0 1 1 1v12a1 1 0 1 1-2 0V6a1 1 0 0 1 1-1Zm6 0a1 1 0 0 1 1 1v12a1 1 0 1 1-2 0V6a1 1 0 0 1 1-1Z" />
                      </svg>
                    ) : (
                      <svg
                        className={styles['playback-button-icon']}
                        viewBox="0 0 24 24"
                        role="img"
                        aria-hidden="true"
                        focusable="false"
                      >
                        <path d="M8.5 5.636a1 1 0 0 1 1.53-.848l8.01 5.363a1 1 0 0 1 0 1.698l-8.01 5.363A1 1 0 0 1 8 16.364V7.636a1 1 0 0 1 .5-.868Z" />
                      </svg>
                    )}
                  </button>
                  <button
                    type="button"
                    className={classNames(
                      styles['playback-button'],
                      styles['playback-button--skip']
                    )}
                    onClick={handleJumpToEnd}
                    disabled={playbackDisabled}
                    aria-label="Go to last frame"
                  >
                    <svg
                      className={styles['playback-button-icon']}
                      viewBox="0 0 24 24"
                      role="img"
                      aria-hidden="true"
                      focusable="false"
                    >
                      <path d="M17.75 4a.75.75 0 0 1 .75.75v13.5a.75.75 0 0 1-1.5 0v-5.69l-9.088 6.143A1.5 1.5 0 0 1 5.5 18.39V5.61a1.5 1.5 0 0 1 2.412-1.313L17 10.44V4.75c0-.414.336-.75.75-.75Z" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
            {error && <p className={styles.error}>{error}</p>}
          </div>
        </FloatingWindow>

        <FloatingWindow
          title="Channels"
          initialPosition={layersWindowInitialPosition}
          width={`min(${CONTROL_WINDOW_WIDTH}px, calc(100vw - ${WINDOW_MARGIN * 2}px))`}
          className={cx('floating-window', 'floating-window--channels')}
          resetSignal={layoutResetToken}
        >
          <div className={cx('sidebar', 'sidebar-left')}>
            {loadedChannelIds.length > 0 ? (
              <div className={cx('channel-controls')}>
                <div className={cx('channel-tabs')} role="tablist" aria-label="Volume channels">
                  {loadedChannelIds.map((channelId) => {
                    const label = channelNameMap.get(channelId) ?? 'Untitled channel';
                    const isActive = channelId === activeChannelTabId;
                    const isVisible = channelVisibility[channelId] ?? true;
                    const tabClassName = cx(
                      'channel-tab',
                      isActive && 'is-active',
                      !isVisible && 'is-hidden'
                    );
                    const labelClassName = cx(
                      'channel-tab-label',
                      !isVisible && 'channel-tab-label--hidden'
                    );
                    const tintColor = channelTintMap.get(channelId) ?? DEFAULT_LAYER_COLOR;
                    const tabStyle: CSSProperties & Record<string, string> = {
                      '--channel-tab-background': applyAlphaToHex(tintColor, 0.18),
                      '--channel-tab-background-active': applyAlphaToHex(tintColor, 0.35),
                      '--channel-tab-border': 'rgba(255, 255, 255, 0.15)',
                      '--channel-tab-border-active': applyAlphaToHex(tintColor, 0.55)
                    };
                    return (
                      <button
                        key={channelId}
                        type="button"
                        className={tabClassName}
                        style={tabStyle}
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
                      ? layerSettings[selectedLayer.key] ?? createLayerDefaultSettings(selectedLayer.key)
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
                      className={cx('channel-panel', isActive && 'is-active')}
                      hidden={!isActive}
                    >
                      {channelLayers.length > 1 ? (
                        <div
                          className={cx('channel-layer-selector')}
                          role="radiogroup"
                          aria-label={`${channelNameMap.get(channelId) ?? 'Channel'} volume`}
                        >
                          {channelLayers.map((layer) => {
                            const isSelected = Boolean(selectedLayer && selectedLayer.key === layer.key);
                            const inputId = `channel-${channelId}-layer-${layer.key}`;
                            return (
                              <label key={layer.key} className={cx('channel-layer-option')} htmlFor={inputId}>
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
                        <p className={cx('channel-empty-hint')}>
                          No volume available for this channel.
                        </p>
                      ) : null}
                      {selectedLayer ? (
                        <>
                          <div className={cx('channel-primary-actions')}>
                            <div className={cx('channel-primary-actions-row')}>
                              <button
                                type="button"
                                className={cx('channel-action-button')}
                                onClick={() => handleLayerRenderStyleToggle(selectedLayer.key)}
                                disabled={sliderDisabled}
                                aria-pressed={settings.renderStyle === 1}
                              >
                                Render style
                              </button>
                              {viewerMode === '3d' ? (
                              <button
                                type="button"
                                className={cx('channel-action-button')}
                                onClick={() => handleLayerSamplingModeToggle(selectedLayer.key)}
                                disabled={sliderDisabled}
                                aria-pressed={settings.samplingMode === 'nearest'}
                                >
                                  Sampling mode
                                </button>
                              ) : null}
                            </div>
                          </div>
                          <BrightnessContrastHistogram
                            className={cx('channel-histogram')}
                            volume={firstVolume}
                            windowMin={settings.windowMin}
                            windowMax={settings.windowMax}
                            defaultMin={DEFAULT_WINDOW_MIN}
                            defaultMax={DEFAULT_WINDOW_MAX}
                            sliderRange={settings.sliderRange}
                          />
                          <div className={cx('slider-control', 'slider-control--pair')}>
                            <div className={cx('slider-control', 'slider-control--inline')}>
                              <label htmlFor={`layer-window-min-${selectedLayer.key}`}>
                                Minimum <span>{formatNormalizedIntensity(settings.windowMin)}</span>
                              </label>
                              <input
                                id={`layer-window-min-${selectedLayer.key}`}
                                type="range"
                                min={DEFAULT_WINDOW_MIN}
                                max={DEFAULT_WINDOW_MAX}
                                step={0.001}
                                value={settings.windowMin}
                                onChange={(event) =>
                                  handleLayerWindowMinChange(selectedLayer.key, Number(event.target.value))
                                }
                                disabled={sliderDisabled}
                              />
                            </div>
                            <div className={cx('slider-control', 'slider-control--inline')}>
                              <label htmlFor={`layer-window-max-${selectedLayer.key}`}>
                                Maximum <span>{formatNormalizedIntensity(settings.windowMax)}</span>
                              </label>
                              <input
                                id={`layer-window-max-${selectedLayer.key}`}
                                type="range"
                                min={DEFAULT_WINDOW_MIN}
                                max={DEFAULT_WINDOW_MAX}
                                step={0.001}
                                value={settings.windowMax}
                                onChange={(event) =>
                                  handleLayerWindowMaxChange(selectedLayer.key, Number(event.target.value))
                                }
                                disabled={sliderDisabled}
                              />
                            </div>
                          </div>
                          <div className={cx('slider-control', 'slider-control--pair')}>
                            <div className={cx('slider-control', 'slider-control--inline')}>
                              <label htmlFor={`layer-brightness-${selectedLayer.key}`}>
                                Brightness
                              </label>
                              <input
                                id={`layer-brightness-${selectedLayer.key}`}
                                type="range"
                                min={0}
                                max={settings.sliderRange}
                                step={1}
                                value={settings.brightnessSliderIndex}
                                onChange={(event) =>
                                  handleLayerBrightnessChange(
                                    selectedLayer.key,
                                    Number.parseInt(event.target.value, 10)
                                  )
                                }
                                disabled={sliderDisabled}
                              />
                            </div>
                            <div className={cx('slider-control', 'slider-control--inline')}>
                              <label htmlFor={`layer-contrast-${selectedLayer.key}`}>
                                Contrast
                              </label>
                              <input
                                id={`layer-contrast-${selectedLayer.key}`}
                                type="range"
                                min={0}
                                max={settings.sliderRange}
                                step={1}
                                value={settings.contrastSliderIndex}
                                onChange={(event) =>
                                  handleLayerContrastChange(
                                    selectedLayer.key,
                                    Number.parseInt(event.target.value, 10)
                                  )
                                }
                                disabled={sliderDisabled}
                              />
                            </div>
                          </div>
                          <div className={cx('channel-primary-actions')}>
                            <div className={cx('channel-primary-actions-row')}>
                              <button
                                type="button"
                                className={cx('channel-action-button')}
                                onClick={() => handleChannelSliderReset(channelId)}
                                disabled={channelLayers.length === 0}
                              >
                                Reset
                              </button>
                              <button
                                type="button"
                                className={cx('channel-action-button')}
                                onClick={() => handleLayerInvertToggle(selectedLayer.key)}
                                disabled={invertDisabled}
                                aria-pressed={settings.invert}
                                title={invertTitle}
                              >
                                Invert
                              </button>
                              <button
                                type="button"
                                className={cx('channel-action-button')}
                                onClick={() => handleLayerAutoContrast(selectedLayer.key)}
                                disabled={sliderDisabled}
                              >
                                Auto
                              </button>
                            </div>
                          </div>
                          <div className={cx('slider-control', 'slider-control--pair')}>
                            <div className={cx('slider-control', 'slider-control--inline')}>
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
                            <div className={cx('slider-control', 'slider-control--inline')}>
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
                            <div className={cx('color-control')}>
                              <div className={cx('color-control-header')}>
                                <span id={`layer-color-label-${selectedLayer.key}`}>Tint color</span>
                                <span>{displayColor}</span>
                              </div>
                              <div className={cx('color-swatch-row')}>
                                <div
                                  className={cx('color-swatch-grid')}
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
                                        className={cx(
                                          'color-swatch-button',
                                          isSelected && 'is-selected'
                                        )}
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
                                  className={cx(
                                    'color-picker-trigger',
                                    sliderDisabled && 'is-disabled'
                                  )}
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
                                    className={cx('color-picker-input')}
                                  />
                                  <span
                                    className={cx('color-picker-indicator')}
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
              <p className={cx('channel-empty-hint')}>Load a volume to configure channel properties.</p>
            )}
          </div>
        </FloatingWindow>

        <FloatingWindow
          title="Tracks"
          initialPosition={trackWindowInitialPosition}
          width={`min(${TRACK_WINDOW_WIDTH}px, calc(100vw - ${WINDOW_MARGIN * 2}px))`}
          className={cx('floating-window', 'floating-window--tracks')}
          resetSignal={layoutResetToken}
        >
          <div className={cx('sidebar', 'sidebar-right')}>
            {channels.length > 0 ? (
              <div className={cx('track-controls')}>
                <div className={cx('track-tabs')} role="tablist" aria-label="Track channels">
                  {channels.map((channel) => {
                    const isActive = channel.id === activeTrackChannelId;
                    const channelName = channelNameMap.get(channel.id) ?? 'Untitled channel';
                    const hasTracks = (parsedTracksByChannel.get(channel.id)?.length ?? 0) > 0;
                    const tabClassName = cx('track-tab', isActive && 'is-active', !hasTracks && 'is-empty');
                    const colorMode = channelTrackColorModes[channel.id] ?? { type: 'random' };
                    const baseColor =
                      colorMode.type === 'uniform' ? normalizeTrackColor(colorMode.color) : '#FFFFFF';
                    const textColor =
                      colorMode.type === 'uniform' ? getTrackTabTextColor(baseColor) : '#0b1220';
                    const borderColor =
                      colorMode.type === 'uniform' ? 'rgba(11, 18, 32, 0.22)' : 'rgba(15, 23, 42, 0.18)';
                    const activeBorderColor =
                      colorMode.type === 'uniform' ? 'rgba(11, 18, 32, 0.35)' : 'rgba(15, 23, 42, 0.28)';
                    const tabStyle: CSSProperties & Record<string, string> = {
                      '--track-tab-background': baseColor,
                      '--track-tab-background-active': baseColor,
                      '--track-tab-border': borderColor,
                      '--track-tab-border-active': activeBorderColor,
                      '--track-tab-text': textColor,
                      '--track-tab-text-active': textColor
                    };
                    return (
                      <button
                        key={channel.id}
                        type="button"
                        className={tabClassName}
                        style={tabStyle}
                        onClick={() => setActiveTrackChannelId(channel.id)}
                        role="tab"
                        id={`track-tab-${channel.id}`}
                        aria-selected={isActive}
                        aria-controls={`track-panel-${channel.id}`}
                      >
                        <span className={cx('track-tab-label')}>{channelName}</span>
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
                  const orderMode = trackOrderModeByChannel[channel.id] ?? 'id';
                  const orderedTracks =
                    orderMode === 'length'
                      ? [...tracksForChannel].sort((a, b) => {
                          const lengthDelta = b.points.length - a.points.length;
                          if (lengthDelta !== 0) {
                            return lengthDelta;
                          }
                          return a.trackNumber - b.trackNumber;
                        })
                      : tracksForChannel;
                  const colorLabel =
                    colorMode.type === 'uniform' ? normalizeTrackColor(colorMode.color) : 'Sorted';

                  return (
                    <div
                      key={channel.id}
                      id={`track-panel-${channel.id}`}
                      role="tabpanel"
                      aria-labelledby={`track-tab-${channel.id}`}
                      className={cx('track-panel', isActive && 'is-active')}
                      hidden={!isActive}
                    >
                      <div className={cx('track-follow-controls')}>
                        <button
                          type="button"
                          onClick={() => handleStopTrackFollow(channel.id)}
                          disabled={channelFollowedId === null}
                          className={cx('viewer-stop-tracking', channelFollowedId !== null && 'is-active')}
                        >
                          Stop following
                        </button>
                        <div className={cx('track-slider-row')}>
                          <div className={cx('slider-control')}>
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
                          <div className={cx('slider-control')}>
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
                        </div>
                      </div>
                      <div className={cx('track-color-control')}>
                        <div className={cx('track-color-control-header')}>
                          <span id={`track-color-label-${channel.id}`}>Track color</span>
                          <span>{colorLabel}</span>
                        </div>
                        <div className={cx('track-color-swatch-row')}>
                          <div
                            className={cx('color-swatch-grid')}
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
                                  className={cx('color-swatch-button', isSelected && 'is-selected')}
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
                            className={cx('track-color-mode-button', colorMode.type === 'random' && 'is-active')}
                            onClick={() => handleTrackColorReset(channel.id)}
                            disabled={tracksForChannel.length === 0}
                          >
                            Sorted
                          </button>
                        </div>
                      </div>
                      <div className={cx('track-list-section')}>
                        <div className={cx('track-list-header')}>
                          <label className={cx('track-master-toggle')}>
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
                          <button
                            type="button"
                            className={cx('track-order-toggle', orderMode === 'length' && 'is-active')}
                            onClick={() => handleTrackOrderToggle(channel.id)}
                            disabled={tracksForChannel.length === 0}
                            aria-pressed={orderMode === 'length'}
                          >
                            {orderMode === 'length' ? 'Order by ID' : 'Order by length'}
                          </button>
                        </div>
                        {tracksForChannel.length > 0 ? (
                          <div
                            className={cx('track-list')}
                            role="group"
                            aria-label={`${channelName} track visibility`}
                          >
                            {orderedTracks.map((track) => {
                              const isFollowed = followedTrackId === track.id;
                              const isSelected = selectedTrackIds.has(track.id);
                              const isChecked = isFollowed || isSelected || (trackVisibility[track.id] ?? true);
                              const trackColor =
                                colorMode.type === 'uniform'
                                  ? normalizeTrackColor(colorMode.color)
                                  : getTrackColorHex(track.id);
                              return (
                                <div
                                  key={track.id}
                                  className={cx('track-item', isSelected && 'is-selected', isFollowed && 'is-following')}
                                  title={`${track.channelName} · Track #${track.trackNumber}`}
                                >
                                  <div className={cx('track-toggle')}>
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={() => handleTrackVisibilityToggle(track.id)}
                                      aria-label={`Toggle visibility for Track #${track.trackNumber}`}
                                    />
                                  </div>
                                  <button
                                    type="button"
                                    className={cx('track-label-button')}
                                    onClick={() => handleTrackSelectionToggle(track.id)}
                                    aria-pressed={isSelected}
                                  >
                                    <span className={cx('track-label')}>
                                      <span
                                        className={cx('track-color-swatch')}
                                        style={{ backgroundColor: trackColor }}
                                        aria-hidden="true"
                                      />
                                      <span className={cx('track-name')}>Track #{track.trackNumber}</span>
                                    </span>
                                  </button>
                                  <button
                                    type="button"
                                    className={cx('track-follow-button', isFollowed && 'is-active')}
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
                          <p className={cx('track-empty-hint')}>
                            Load a tracks file to toggle individual trajectories.
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className={cx('track-empty-hint')}>Add a channel to manage tracks.</p>
            )}
          </div>
      </FloatingWindow>
      {!isVrActive && hasParsedTrackData ? (
        <FloatingWindow
          title="Selected Tracks"
          initialPosition={selectedTracksWindowInitialPosition}
          width={`min(${SELECTED_TRACKS_WINDOW_WIDTH}px, calc(100vw - ${WINDOW_MARGIN * 2}px))`}
          className={cx('floating-window', 'floating-window--selected-tracks')}
          bodyClassName={cx('floating-window-body', 'floating-window-body--selected-tracks')}
          resetSignal={layoutResetToken}
        >
          <SelectedTracksWindow series={selectedTrackSeries} totalTimepoints={volumeTimepointCount} />
        </FloatingWindow>
      ) : null}
      </div>
    </>
  );
}

export default App;
