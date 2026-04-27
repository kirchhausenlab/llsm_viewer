import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type {
  AnnotateBrushMode,
  AnnotateDimensionMode,
  AnnotateSourceOption,
  EditableSegmentationChannel,
  EditableSegmentationLabel,
  LoadedEditableSegmentationCopy,
} from '../../types/annotation';
import type { LoadedDatasetLayer } from '../dataset';
import type { ViewerLayer } from '../../ui/contracts/viewerLayer';
import type { VolumeBrickAtlas } from '../../core/volumeProvider';
import type { LayerSettings } from '../../state/layerSettings';
import {
  buildEditableSegmentationBrickAtlas,
  clearEditableSegmentationChannelInPlace,
  cloneEditableSegmentationChannel,
  cloneTimepointLabelMap,
  createEditableLoadedDatasetLayer,
  createEditableSegmentationChannel,
  createEditableViewerLayer,
  deleteEditableLabelInPlace,
  getEditableTimepointLabels,
  getOrCreateEditableTimepointLabels,
  hasEditableLabelVoxels,
  MAX_ANNOTATION_RADIUS,
  MIN_ANNOTATION_RADIUS,
} from '../../shared/utils/annotation/editableSegmentationState';
import {
  clampVoxelCoordinate,
  computeAnnotationBrushOffsets,
} from '../../shared/utils/annotation/brushFootprints';

type HistorySnapshot = {
  labels: EditableSegmentationLabel[];
  activeLabelIndex: number;
  timepointLabels: Map<number, Uint32Array>;
};

type StrokeHistoryEntry = {
  kind: 'stroke';
  channelId: string;
  timepoint: number;
  indices: Uint32Array;
  before: Uint32Array;
  after: Uint32Array;
};

type SnapshotHistoryEntry = {
  kind: 'snapshot';
  channelId: string;
  before: HistorySnapshot;
  after: HistorySnapshot;
};

type HistoryEntry = StrokeHistoryEntry | SnapshotHistoryEntry;

type StrokeState = {
  channelId: string;
  timepoint: number;
  mode: AnnotateDimensionMode;
  brushMode: AnnotateBrushMode;
  radius: number;
  labelId: number;
  touched: Map<number, number>;
  visitedCenters: Set<number>;
};

type UseAnnotateOptions = {
  available: boolean;
  unavailableReason?: string;
  dimensions: { width: number; height: number; depth: number };
  volumeCount: number;
  currentTimepoint: number;
  resetSignal: number;
  baseChannelNames: Iterable<string>;
  regularSegmentationSources: Extract<AnnotateSourceOption, { kind: 'regular-segmentation' }>[];
  loadRegularSegmentationSource: (
    source: Extract<AnnotateSourceOption, { kind: 'regular-segmentation' }>
  ) => Promise<LoadedEditableSegmentationCopy>;
  saveEditableChannel: (channel: EditableSegmentationChannel) => Promise<void>;
};

export type AnnotateCreateChannelOptions = {
  name?: string;
  sourceId?: string;
};

export type AnnotateCreateChannelResult =
  | { ok: true; channelId: string }
  | { ok: false; message: string };

export type AnnotateController = {
  available: boolean;
  unavailableReason: string | null;
  channels: EditableSegmentationChannel[];
  activeChannel: EditableSegmentationChannel | null;
  activeChannelId: string | null;
  sourceOptions: AnnotateSourceOption[];
  selectedSourceId: string;
  creationName: string;
  message: string | null;
  busy: boolean;
  canUndo: boolean;
  canRedo: boolean;
  hasDirtyChannels: boolean;
  revision: number;
  editableVisibility: Record<string, boolean>;
  editableLayerVolumes: Record<string, null>;
  editableLayerBrickAtlases: Record<string, VolumeBrickAtlas | null>;
  setSelectedSourceId: (value: string) => void;
  setCreationName: (value: string) => void;
  createChannel: (options?: AnnotateCreateChannelOptions) => Promise<AnnotateCreateChannelResult>;
  deleteActiveChannel: () => void;
  setActiveChannelId: (channelId: string | null) => void;
  setChannelVisible: (channelId: string, visible: boolean) => void;
  setEnabled: (value: boolean) => void;
  setOverlayVisible: (value: boolean) => void;
  setMode: (value: AnnotateDimensionMode) => void;
  setBrushMode: (value: AnnotateBrushMode) => void;
  setRadius: (value: number) => void;
  setActiveLabelIndex: (value: number) => void;
  addLabel: () => void;
  deleteActiveLabel: () => void;
  renameActiveLabel: () => void;
  clearActiveChannel: () => void;
  saveActiveChannel: () => Promise<void>;
  undo: () => void;
  redo: () => void;
  beginStroke: () => void;
  applyStrokeAt: (coords: { x: number; y: number; z: number }) => void;
  endStroke: () => void;
  resetTool: () => void;
  getEditableLoadedLayers: () => LoadedDatasetLayer[];
  getEditableViewerLayers: (layerSettingsByKey?: Record<string, LayerSettings | undefined>) => ViewerLayer[];
  getEditableChannelById: (channelId: string) => EditableSegmentationChannel | null;
};

const MAX_HISTORY = 100;

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, Math.round(value)));
}

function cloneLabels(labels: readonly EditableSegmentationLabel[]): EditableSegmentationLabel[] {
  return labels.map((label) => ({ name: label.name }));
}

function snapshotChannel(channel: EditableSegmentationChannel): HistorySnapshot {
  return {
    labels: cloneLabels(channel.labels),
    activeLabelIndex: channel.activeLabelIndex,
    timepointLabels: cloneTimepointLabelMap(channel.timepointLabels),
  };
}

function restoreSnapshot(channel: EditableSegmentationChannel, snapshot: HistorySnapshot): void {
  channel.labels = cloneLabels(snapshot.labels);
  channel.activeLabelIndex = snapshot.activeLabelIndex;
  channel.timepointLabels = cloneTimepointLabelMap(snapshot.timepointLabels);
}

function isNameConflict(name: string, baseChannelNames: Iterable<string>, channels: Iterable<EditableSegmentationChannel>): boolean {
  const normalized = name.trim().toLowerCase();
  for (const existing of baseChannelNames) {
    if (existing.trim().toLowerCase() === normalized) {
      return true;
    }
  }
  for (const channel of channels) {
    if (channel.name.trim().toLowerCase() === normalized) {
      return true;
    }
  }
  return false;
}

export function useAnnotate({
  available,
  unavailableReason = 'Annotate is unavailable for public datasets.',
  dimensions,
  volumeCount,
  currentTimepoint,
  resetSignal,
  baseChannelNames,
  regularSegmentationSources,
  loadRegularSegmentationSource,
  saveEditableChannel,
}: UseAnnotateOptions): AnnotateController {
  const channelsRef = useRef<Map<string, EditableSegmentationChannel>>(new Map());
  const undoStackRef = useRef<HistoryEntry[]>([]);
  const redoStackRef = useRef<HistoryEntry[]>([]);
  const strokeRef = useRef<StrokeState | null>(null);
  const nextChannelIndexRef = useRef(1);
  const pendingRafRef = useRef<number | null>(null);
  const currentTimepointRef = useRef(currentTimepoint);
  const baseChannelNamesRef = useRef<string[]>([]);

  const [channelOrder, setChannelOrder] = useState<string[]>([]);
  const [activeChannelId, setActiveChannelIdState] = useState<string | null>(null);
  const [selectedSourceId, setSelectedSourceId] = useState('empty');
  const [creationName, setCreationName] = useState('Annotation');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [editableVisibility, setEditableVisibility] = useState<Record<string, boolean>>({});

  currentTimepointRef.current = currentTimepoint;
  baseChannelNamesRef.current = Array.from(baseChannelNames);

  const flushUi = useCallback(() => {
    pendingRafRef.current = null;
    setRevision((current) => current + 1);
    setCanUndo(undoStackRef.current.length > 0);
    setCanRedo(redoStackRef.current.length > 0);
  }, []);

  const scheduleUiUpdate = useCallback(() => {
    if (pendingRafRef.current !== null) {
      return;
    }
    if (typeof requestAnimationFrame === 'function') {
      pendingRafRef.current = requestAnimationFrame(flushUi);
      return;
    }
    pendingRafRef.current = 0;
    flushUi();
  }, [flushUi]);

  useEffect(() => () => {
    if (pendingRafRef.current !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(pendingRafRef.current);
    }
  }, []);

  const channels = useMemo(
    () => channelOrder.map((channelId) => channelsRef.current.get(channelId)).filter((entry): entry is EditableSegmentationChannel => Boolean(entry)),
    [channelOrder, revision]
  );
  const activeChannel = useMemo(
    () => (activeChannelId ? channelsRef.current.get(activeChannelId) ?? null : null),
    [activeChannelId, revision]
  );
  const hasDirtyChannels = useMemo(() => channels.some((channel) => channel.dirty), [channels]);

  const sourceOptions = useMemo<AnnotateSourceOption[]>(() => {
    const editableOptions: AnnotateSourceOption[] = channels.map((channel) => ({
      id: `editable:${channel.channelId}`,
      kind: 'editable-segmentation',
      label: channel.name,
      channelId: channel.channelId,
      layerKey: channel.layerKey,
    }));
    return [{ id: 'empty', kind: 'empty', label: 'Empty' }, ...regularSegmentationSources, ...editableOptions];
  }, [channels, regularSegmentationSources]);

  useEffect(() => {
    if (!sourceOptions.some((option) => option.id === selectedSourceId)) {
      setSelectedSourceId('empty');
    }
  }, [selectedSourceId, sourceOptions]);

  const resetTool = useCallback(() => {
    channelsRef.current.clear();
    undoStackRef.current = [];
    redoStackRef.current = [];
    strokeRef.current = null;
    setChannelOrder([]);
    setActiveChannelIdState(null);
    setEditableVisibility({});
    setSelectedSourceId('empty');
    setCreationName('Annotation');
    setMessage(null);
    scheduleUiUpdate();
  }, [scheduleUiUpdate]);

  useEffect(() => {
    resetTool();
  }, [resetSignal, resetTool]);

  const markChanged = useCallback((channel: EditableSegmentationChannel, dirty = true) => {
    channel.revision += 1;
    if (dirty) {
      channel.dirty = true;
    }
    scheduleUiUpdate();
  }, [scheduleUiUpdate]);

  const pushHistory = useCallback((entry: HistoryEntry) => {
    const undoStack = undoStackRef.current;
    undoStack.push(entry);
    if (undoStack.length > MAX_HISTORY) {
      undoStack.shift();
    }
    redoStackRef.current = [];
    setCanUndo(undoStack.length > 0);
    setCanRedo(false);
  }, []);

  const createChannel = useCallback(async (
    options: AnnotateCreateChannelOptions = {}
  ): Promise<AnnotateCreateChannelResult> => {
    if (!available) {
      return { ok: false, message: unavailableReason };
    }
    const name = (options.name ?? creationName).trim();
    if (!name) {
      return { ok: false, message: 'Channel name is required.' };
    }
    if (isNameConflict(name, baseChannelNamesRef.current, channelsRef.current.values())) {
      return { ok: false, message: 'Channel name must be unique.' };
    }
    const requestedSourceId = options.sourceId ?? selectedSourceId;
    const source = sourceOptions.find((option) => option.id === requestedSourceId) ?? sourceOptions[0]!;
    setBusy(true);
    setMessage(null);
    try {
      const index = nextChannelIndexRef.current++;
      const channelId = `annotate-${index}`;
      const layerKey = `annotate-layer-${index}`;
      let channel: EditableSegmentationChannel;

      if (source.kind === 'editable-segmentation') {
        const sourceChannel = channelsRef.current.get(source.channelId);
        if (!sourceChannel) {
          throw new Error('Editable source channel no longer exists.');
        }
        channel = cloneEditableSegmentationChannel(sourceChannel, {
          channelId,
          layerKey,
          name,
          createdFrom: {
            kind: 'copy',
            sourceChannelId: source.channelId,
            sourceLayerKey: source.layerKey,
            sourceWasEditable: true,
          },
        });
      } else if (source.kind === 'regular-segmentation') {
        const loaded = await loadRegularSegmentationSource(source);
        channel = createEditableSegmentationChannel({
          channelId,
          layerKey,
          name,
          dimensions: source.dimensions,
          volumeCount: source.volumeCount,
          createdFrom: {
            kind: 'copy',
            sourceChannelId: source.channelId,
            sourceLayerKey: source.layerKey,
            sourceWasEditable: Boolean(source.editableLabelNames),
          },
          labels: loaded.labels,
          timepointLabels: loaded.timepointLabels,
        });
      } else {
        channel = createEditableSegmentationChannel({
          channelId,
          layerKey,
          name,
          dimensions,
          volumeCount,
          createdFrom: { kind: 'empty' },
        });
      }

      channelsRef.current.set(channel.channelId, channel);
      setChannelOrder((current) => [...current, channel.channelId]);
      setEditableVisibility((current) => ({ ...current, [channel.channelId]: true }));
      setActiveChannelIdState(channel.channelId);
      setCreationName(name);
      setSelectedSourceId(source.id);
      markChanged(channel, true);
      return { ok: true, channelId: channel.channelId };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { ok: false, message: errorMessage };
    } finally {
      setBusy(false);
    }
  }, [
    available,
    creationName,
    dimensions,
    loadRegularSegmentationSource,
    markChanged,
    selectedSourceId,
    sourceOptions,
    unavailableReason,
    volumeCount,
  ]);

  const deleteActiveChannel = useCallback(() => {
    const channelId = activeChannelId;
    if (!channelId) {
      return;
    }
    const channel = channelsRef.current.get(channelId);
    if (!channel) {
      return;
    }
    if (typeof globalThis.confirm === 'function') {
      const confirmed = globalThis.confirm(`Delete annotation channel "${channel.name}"?`);
      if (!confirmed) {
        return;
      }
    }
    channelsRef.current.delete(channelId);
    undoStackRef.current = undoStackRef.current.filter((entry) => entry.channelId !== channelId);
    redoStackRef.current = redoStackRef.current.filter((entry) => entry.channelId !== channelId);
    if (strokeRef.current?.channelId === channelId) {
      strokeRef.current = null;
    }
    setChannelOrder((current) => current.filter((entry) => entry !== channelId));
    setEditableVisibility((current) => {
      const next = { ...current };
      delete next[channelId];
      return next;
    });
    setActiveChannelIdState(null);
    setMessage(null);
    scheduleUiUpdate();
  }, [activeChannelId, scheduleUiUpdate]);

  const setActiveChannelId = useCallback((channelId: string | null) => {
    const nextChannelId = channelId && channelsRef.current.has(channelId) ? channelId : null;
    setActiveChannelIdState((current) => {
      if (current && current !== nextChannelId) {
        const previousChannel = channelsRef.current.get(current);
        if (previousChannel) {
          previousChannel.enabled = false;
        }
      }
      return nextChannelId;
    });
    scheduleUiUpdate();
  }, [scheduleUiUpdate]);

  const setChannelVisible = useCallback((channelId: string, visible: boolean) => {
    setEditableVisibility((current) => ({ ...current, [channelId]: visible }));
  }, []);

  const updateActiveChannel = useCallback((updater: (channel: EditableSegmentationChannel) => void, dirty = true) => {
    const channel = activeChannelId ? channelsRef.current.get(activeChannelId) ?? null : null;
    if (!channel) {
      return;
    }
    updater(channel);
    markChanged(channel, dirty);
  }, [activeChannelId, markChanged]);

  const setEnabled = useCallback((value: boolean) => {
    updateActiveChannel((channel) => {
      channel.enabled = value;
    }, false);
  }, [updateActiveChannel]);

  const setOverlayVisible = useCallback((value: boolean) => {
    updateActiveChannel((channel) => {
      channel.overlayVisible = value;
    }, false);
  }, [updateActiveChannel]);

  const setMode = useCallback((value: AnnotateDimensionMode) => {
    updateActiveChannel((channel) => {
      channel.mode = value;
    }, false);
  }, [updateActiveChannel]);

  const setBrushMode = useCallback((value: AnnotateBrushMode) => {
    updateActiveChannel((channel) => {
      channel.brushMode = value;
    }, false);
  }, [updateActiveChannel]);

  const setRadius = useCallback((value: number) => {
    updateActiveChannel((channel) => {
      channel.radius = clampInt(value, MIN_ANNOTATION_RADIUS, MAX_ANNOTATION_RADIUS);
    }, false);
  }, [updateActiveChannel]);

  const setActiveLabelIndex = useCallback((value: number) => {
    updateActiveChannel((channel) => {
      channel.activeLabelIndex = clampInt(value, 0, Math.max(0, channel.labels.length - 1));
    }, false);
  }, [updateActiveChannel]);

  const applySnapshotOperation = useCallback((operation: (channel: EditableSegmentationChannel) => void) => {
    const channel = activeChannelId ? channelsRef.current.get(activeChannelId) ?? null : null;
    if (!channel) {
      return;
    }
    const before = snapshotChannel(channel);
    operation(channel);
    const after = snapshotChannel(channel);
    pushHistory({ kind: 'snapshot', channelId: channel.channelId, before, after });
    markChanged(channel, true);
  }, [activeChannelId, markChanged, pushHistory]);

  const addLabel = useCallback(() => {
    applySnapshotOperation((channel) => {
      channel.labels.push({ name: '' });
      channel.activeLabelIndex = channel.labels.length - 1;
    });
  }, [applySnapshotOperation]);

  const deleteActiveLabel = useCallback(() => {
    const channel = activeChannelId ? channelsRef.current.get(activeChannelId) ?? null : null;
    if (!channel) {
      return;
    }
    const labelId = channel.activeLabelIndex + 1;
    if (hasEditableLabelVoxels(channel, labelId) && typeof globalThis.confirm === 'function') {
      const confirmed = globalThis.confirm(`Delete label ${labelId}? Voxels with this label will be cleared and higher IDs compacted.`);
      if (!confirmed) {
        return;
      }
    }
    applySnapshotOperation((target) => {
      deleteEditableLabelInPlace(target, target.activeLabelIndex);
    });
  }, [activeChannelId, applySnapshotOperation]);

  const renameActiveLabel = useCallback(() => {
    const channel = activeChannelId ? channelsRef.current.get(activeChannelId) ?? null : null;
    if (!channel) {
      return;
    }
    const current = channel.labels[channel.activeLabelIndex]?.name ?? '';
    const nextName =
      typeof globalThis.prompt === 'function'
        ? globalThis.prompt(`Rename label ${channel.activeLabelIndex + 1}`, current)
        : current;
    if (nextName === null) {
      return;
    }
    applySnapshotOperation((target) => {
      target.labels[target.activeLabelIndex] = { name: nextName };
    });
  }, [activeChannelId, applySnapshotOperation]);

  const clearActiveChannel = useCallback(() => {
    if (typeof globalThis.confirm === 'function') {
      const confirmed = globalThis.confirm('Clear this editable channel? This removes all labels across all timepoints.');
      if (!confirmed) {
        return;
      }
    }
    applySnapshotOperation((channel) => {
      clearEditableSegmentationChannelInPlace(channel);
    });
  }, [applySnapshotOperation]);

  const saveActiveChannel = useCallback(async () => {
    const channel = activeChannelId ? channelsRef.current.get(activeChannelId) ?? null : null;
    if (!channel) {
      setMessage('Create or select an editable channel first.');
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await saveEditableChannel(channel);
      channel.dirty = false;
      channel.savedRevision += 1;
      markChanged(channel, false);
      setMessage('Saved.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [activeChannelId, markChanged, saveEditableChannel]);

  const beginStroke = useCallback(() => {
    const channel = activeChannelId ? channelsRef.current.get(activeChannelId) ?? null : null;
    if (!channel || !channel.enabled || channel.labels.length === 0) {
      strokeRef.current = null;
      return;
    }
    strokeRef.current = {
      channelId: channel.channelId,
      timepoint: Math.max(0, Math.min(channel.volumeCount - 1, currentTimepointRef.current)),
      mode: channel.mode,
      brushMode: channel.brushMode,
      radius: channel.radius,
      labelId: channel.activeLabelIndex + 1,
      touched: new Map(),
      visitedCenters: new Set(),
    };
  }, [activeChannelId]);

  const applyStrokeAt = useCallback((coords: { x: number; y: number; z: number }) => {
    const stroke = strokeRef.current;
    if (!stroke) {
      return;
    }
    const channel = channelsRef.current.get(stroke.channelId);
    if (!channel) {
      return;
    }
    const { width, height, depth } = channel.dimensions;
    const safeX = clampVoxelCoordinate(coords.x, width);
    const safeY = clampVoxelCoordinate(coords.y, height);
    const safeZ = clampVoxelCoordinate(coords.z, depth);
    const centerIndex = (safeZ * height + safeY) * width + safeX;
    if (stroke.visitedCenters.has(centerIndex)) {
      return;
    }
    stroke.visitedCenters.add(centerIndex);

    const labels = getOrCreateEditableTimepointLabels(channel, stroke.timepoint);
    const isEraserStroke = stroke.brushMode === 'eraser';
    const nextLabel = isEraserStroke ? 0 : stroke.labelId;
    for (const { dx, dy, dz } of computeAnnotationBrushOffsets(stroke.radius, stroke.mode)) {
      const x = safeX + dx;
      const y = safeY + dy;
      const z = safeZ + dz;
      if (x < 0 || y < 0 || z < 0 || x >= width || y >= height || z >= depth) {
        continue;
      }
      const index = (z * height + y) * width + x;
      const previous = labels[index] ?? 0;
      if (isEraserStroke && previous !== stroke.labelId) {
        continue;
      }
      if (previous === nextLabel) {
        continue;
      }
      if (!stroke.touched.has(index)) {
        stroke.touched.set(index, previous);
      }
      labels[index] = nextLabel;
    }
    markChanged(channel, true);
  }, [markChanged]);

  const endStroke = useCallback(() => {
    const stroke = strokeRef.current;
    strokeRef.current = null;
    if (!stroke || stroke.touched.size === 0) {
      return;
    }
    const channel = channelsRef.current.get(stroke.channelId);
    const labels = channel ? getEditableTimepointLabels(channel, stroke.timepoint) : null;
    if (!channel || !labels) {
      return;
    }
    const indices: number[] = [];
    const before: number[] = [];
    const after: number[] = [];
    for (const [index, previous] of stroke.touched.entries()) {
      const current = labels[index] ?? 0;
      if (current === previous) {
        continue;
      }
      indices.push(index);
      before.push(previous);
      after.push(current);
    }
    if (indices.length === 0) {
      return;
    }
    pushHistory({
      kind: 'stroke',
      channelId: channel.channelId,
      timepoint: stroke.timepoint,
      indices: Uint32Array.from(indices),
      before: Uint32Array.from(before),
      after: Uint32Array.from(after),
    });
    markChanged(channel, true);
  }, [markChanged, pushHistory]);

  const applyHistory = useCallback((entry: HistoryEntry, direction: 'undo' | 'redo') => {
    const channel = channelsRef.current.get(entry.channelId);
    if (!channel) {
      return;
    }
    if (entry.kind === 'snapshot') {
      restoreSnapshot(channel, direction === 'undo' ? entry.before : entry.after);
    } else {
      const labels = getOrCreateEditableTimepointLabels(channel, entry.timepoint);
      const source = direction === 'undo' ? entry.before : entry.after;
      for (let index = 0; index < entry.indices.length; index += 1) {
        labels[entry.indices[index] ?? 0] = source[index] ?? 0;
      }
    }
    markChanged(channel, true);
  }, [markChanged]);

  const undo = useCallback(() => {
    const entry = undoStackRef.current.pop() ?? null;
    if (!entry) {
      return;
    }
    applyHistory(entry, 'undo');
    redoStackRef.current.push(entry);
    scheduleUiUpdate();
  }, [applyHistory, scheduleUiUpdate]);

  const redo = useCallback(() => {
    const entry = redoStackRef.current.pop() ?? null;
    if (!entry) {
      return;
    }
    applyHistory(entry, 'redo');
    undoStackRef.current.push(entry);
    scheduleUiUpdate();
  }, [applyHistory, scheduleUiUpdate]);

  const editableLayerBrickAtlases = useMemo(() => {
    const atlases: Record<string, VolumeBrickAtlas | null> = {};
    for (const channel of channels) {
      atlases[channel.layerKey] = buildEditableSegmentationBrickAtlas({
        channel,
        timepoint: Math.max(0, Math.min(channel.volumeCount - 1, currentTimepoint)),
      });
    }
    return atlases;
  }, [channels, currentTimepoint, revision]);

  const editableLayerVolumes = useMemo(() => {
    const volumes: Record<string, null> = {};
    for (const channel of channels) {
      volumes[channel.layerKey] = null;
    }
    return volumes;
  }, [channels]);

  const getEditableLoadedLayers = useCallback(
    () => channels.map((channel) => createEditableLoadedDatasetLayer(channel)),
    [channels]
  );

  const getEditableViewerLayers = useCallback(
    (layerSettingsByKey?: Record<string, LayerSettings | undefined>) =>
      channels.map((channel) =>
        createEditableViewerLayer({
          channel,
          visible: editableVisibility[channel.channelId] ?? true,
          brickAtlas: editableLayerBrickAtlases[channel.layerKey] ?? null,
          settings: layerSettingsByKey?.[channel.layerKey],
        })
      ),
    [channels, editableLayerBrickAtlases, editableVisibility]
  );

  const getEditableChannelById = useCallback((channelId: string) => {
    return channelsRef.current.get(channelId) ?? null;
  }, []);

  return {
    available,
    unavailableReason: available ? null : unavailableReason,
    channels,
    activeChannel,
    activeChannelId,
    sourceOptions,
    selectedSourceId,
    creationName,
    message,
    busy,
    canUndo,
    canRedo,
    hasDirtyChannels,
    revision,
    editableVisibility,
    editableLayerVolumes,
    editableLayerBrickAtlases,
    setSelectedSourceId,
    setCreationName,
    createChannel,
    deleteActiveChannel,
    setActiveChannelId,
    setChannelVisible,
    setEnabled,
    setOverlayVisible,
    setMode,
    setBrushMode,
    setRadius,
    setActiveLabelIndex,
    addLabel,
    deleteActiveLabel,
    renameActiveLabel,
    clearActiveChannel,
    saveActiveChannel,
    undo,
    redo,
    beginStroke,
    applyStrokeAt,
    endStroke,
    resetTool,
    getEditableLoadedLayers,
    getEditableViewerLayers,
    getEditableChannelById,
  };
}
