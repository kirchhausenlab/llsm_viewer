import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { NormalizedVolume } from '../../core/volumeProcessing';

export type PaintbrushMode = 'brush' | 'eraser';

type Dimensions = { width: number; height: number; depth: number };

type StrokeSettings = {
  mode: PaintbrushMode;
  radius: number;
  colorPacked: number;
};

type StrokeState = {
  settings: StrokeSettings;
  touched: Map<number, number>;
  visitedCenters: Set<number>;
};

type HistoryEntry = {
  indices: Uint32Array;
  before: Uint32Array;
  after: Uint32Array;
};

type PaintVolumeState = {
  dimensions: Dimensions;
  rgba: Uint8Array;
  volume: NormalizedVolume;
  paintedIndices: Set<number>;
  labelCounts: Map<number, number>;
};

const MAX_HISTORY = 100;
const DEFAULT_COLOR = '#ff5b5b';
const MIN_RADIUS = 1;

const clampInt = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, Math.round(value)));

const packRgba = (r: number, g: number, b: number, a: number) =>
  (r | (g << 8) | (b << 16) | (a << 24)) >>> 0;

const rgbaPackedToRgb24 = (packed: number) => {
  const r = packed & 0xff;
  const g = (packed >>> 8) & 0xff;
  const b = (packed >>> 16) & 0xff;
  return ((r << 16) | (g << 8) | b) >>> 0;
};

const readPackedRgba = (rgba: Uint8Array, voxelIndex: number) => {
  const base = voxelIndex * 4;
  return packRgba(rgba[base] ?? 0, rgba[base + 1] ?? 0, rgba[base + 2] ?? 0, rgba[base + 3] ?? 0);
};

const writePackedRgba = (rgba: Uint8Array, voxelIndex: number, packed: number) => {
  const base = voxelIndex * 4;
  rgba[base] = packed & 0xff;
  rgba[base + 1] = (packed >>> 8) & 0xff;
  rgba[base + 2] = (packed >>> 16) & 0xff;
  rgba[base + 3] = (packed >>> 24) & 0xff;
};

const parseHexRgb = (value: string): { r: number; g: number; b: number; hex: string } | null => {
  const match = /^#?([0-9a-fA-F]{6})$/.exec(value.trim());
  if (!match) {
    return null;
  }
  const hex = `#${match[1].toLowerCase()}`;
  const intValue = Number.parseInt(match[1], 16);
  if (!Number.isFinite(intValue)) {
    return null;
  }
  const r = (intValue >>> 16) & 0xff;
  const g = (intValue >>> 8) & 0xff;
  const b = intValue & 0xff;
  return { r, g, b, hex };
};

const sanitizeNonBlackHex = (value: string, fallback: string) => {
  const parsed = parseHexRgb(value);
  const fallbackParsed = parseHexRgb(fallback);
  if (!fallbackParsed) {
    return DEFAULT_COLOR;
  }
  if (!parsed) {
    return fallbackParsed.hex;
  }
  if (parsed.r === 0 && parsed.g === 0 && parsed.b === 0) {
    return '#000001';
  }
  return parsed.hex;
};

const computeSphereOffsets = (radius: number) => {
  const safeRadius = Math.max(1, Math.round(radius));
  if (safeRadius === 1) {
    return [{ dx: 0, dy: 0, dz: 0 }];
  }
  const threshold = safeRadius * safeRadius;
  const offsets: Array<{ dx: number; dy: number; dz: number }> = [];
  for (let dz = -safeRadius + 1; dz <= safeRadius - 1; dz++) {
    for (let dy = -safeRadius + 1; dy <= safeRadius - 1; dy++) {
      for (let dx = -safeRadius + 1; dx <= safeRadius - 1; dx++) {
        if (dx * dx + dy * dy + dz * dz < threshold) {
          offsets.push({ dx, dy, dz });
        }
      }
    }
  }
  return offsets.length > 0 ? offsets : [{ dx: 0, dy: 0, dz: 0 }];
};

const toIsoTimestamp = () => {
  const timestamp = new Date();
  const pad = (value: number) => value.toString().padStart(2, '0');
  return `${timestamp.getFullYear()}-${pad(timestamp.getMonth() + 1)}-${pad(timestamp.getDate())}-${pad(
    timestamp.getHours(),
  )}${pad(timestamp.getMinutes())}${pad(timestamp.getSeconds())}`;
};

export type PaintbrushController = {
  enabled: boolean;
  overlayVisible: boolean;
  mode: PaintbrushMode;
  radius: number;
  color: string;
  labelCount: number;
  canUndo: boolean;
  canRedo: boolean;
  revision: number;
  paintVolume: NormalizedVolume | null;
  setEnabled: (value: boolean) => void;
  setOverlayVisible: (value: boolean) => void;
  setMode: (value: PaintbrushMode) => void;
  setRadius: (value: number) => void;
  setColor: (hex: string) => void;
  pickRandomUnusedColor: () => void;
  undo: () => void;
  redo: () => void;
  clear: () => void;
  beginStroke: () => void;
  applyStrokeAt: (coords: { x: number; y: number; z: number }) => void;
  endStroke: () => void;
  resetTool: () => void;
  getSuggestedSaveName: () => string;
  getPaintRgbBytes: () => { dimensions: Dimensions; rgb: Uint8Array } | null;
  getUsedRgbSet: () => ReadonlySet<number>;
};

export function usePaintbrush({
  primaryVolume,
  resetSignal,
}: {
  primaryVolume: NormalizedVolume | null;
  resetSignal: number;
}): PaintbrushController {
  const [enabled, setEnabled] = useState(false);
  const [overlayVisible, setOverlayVisible] = useState(true);
  const [mode, setMode] = useState<PaintbrushMode>('brush');
  const [radius, setRadius] = useState(MIN_RADIUS);
  const [color, setColorState] = useState(DEFAULT_COLOR);
  const [labelCount, setLabelCount] = useState(0);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [revision, setRevision] = useState(0);

  const paintStateRef = useRef<PaintVolumeState | null>(null);
  const undoStackRef = useRef<HistoryEntry[]>([]);
  const redoStackRef = useRef<HistoryEntry[]>([]);
  const strokeRef = useRef<StrokeState | null>(null);
  const sphereOffsetsCacheRef = useRef<Map<number, Array<{ dx: number; dy: number; dz: number }>>>(
    new Map(),
  );
  const pendingRafRef = useRef<number | null>(null);

  const scheduleUiUpdate = useCallback(() => {
    if (pendingRafRef.current !== null) {
      return;
    }
    const flush = () => {
      pendingRafRef.current = null;
      setRevision((current) => current + 1);
      const state = paintStateRef.current;
      setLabelCount(state ? state.labelCounts.size : 0);
      setCanUndo(undoStackRef.current.length > 0);
      setCanRedo(redoStackRef.current.length > 0);
    };

    if (typeof requestAnimationFrame === 'function') {
      pendingRafRef.current = requestAnimationFrame(() => flush());
      return;
    }

    pendingRafRef.current = 0;
    flush();
  }, []);

  useEffect(() => {
    return () => {
      if (pendingRafRef.current !== null) {
        if (typeof cancelAnimationFrame === 'function') {
          cancelAnimationFrame(pendingRafRef.current);
        }
        pendingRafRef.current = null;
      }
    };
  }, []);

  const ensurePaintVolume = useCallback(() => {
    if (!primaryVolume) {
      // Channel/layer toggles can temporarily remove all volume layers even though the user is still
      // working within the same dataset. Clearing here would erase the painting unexpectedly.
      // Keep the existing paint state until we can compare dimensions again.
      return paintStateRef.current;
    }

    const dimensions: Dimensions = {
      width: primaryVolume.width,
      height: primaryVolume.height,
      depth: primaryVolume.depth,
    };

    const existing = paintStateRef.current;
    if (
      existing &&
      existing.dimensions.width === dimensions.width &&
      existing.dimensions.height === dimensions.height &&
      existing.dimensions.depth === dimensions.depth
    ) {
      return existing;
    }

    const voxelCount = dimensions.width * dimensions.height * dimensions.depth;
    const rgba = new Uint8Array(voxelCount * 4);
    const volume: NormalizedVolume = {
      width: dimensions.width,
      height: dimensions.height,
      depth: dimensions.depth,
      channels: 4,
      dataType: 'uint8',
      normalized: rgba,
      min: 0,
      max: 255,
    };

    const next: PaintVolumeState = {
      dimensions,
      rgba,
      volume,
      paintedIndices: new Set(),
      labelCounts: new Map(),
    };

    paintStateRef.current = next;
    undoStackRef.current = [];
    redoStackRef.current = [];
    strokeRef.current = null;
    scheduleUiUpdate();
    return next;
  }, [primaryVolume, scheduleUiUpdate]);

  useEffect(() => {
    ensurePaintVolume();
  }, [ensurePaintVolume]);

  const resetTool = useCallback(() => {
    setEnabled(false);
    setOverlayVisible(true);
    setMode('brush');
    setRadius(MIN_RADIUS);
    setColorState(DEFAULT_COLOR);
  }, []);

  useEffect(() => {
    resetTool();
  }, [resetSignal, resetTool]);

  const setColor = useCallback((hex: string) => {
    setColorState((previous) => sanitizeNonBlackHex(hex, previous));
  }, []);

  const setRadiusSafe = useCallback((value: number) => {
    setRadius(clampInt(value, MIN_RADIUS, 100));
  }, []);

  const getSphereOffsets = useCallback((targetRadius: number) => {
    const safeRadius = Math.max(1, Math.round(targetRadius));
    const cache = sphereOffsetsCacheRef.current;
    const cached = cache.get(safeRadius);
    if (cached) {
      return cached;
    }
    const computed = computeSphereOffsets(safeRadius);
    cache.set(safeRadius, computed);
    return computed;
  }, []);

  const updateLabelCountsForChange = useCallback(
    (state: PaintVolumeState, previousPacked: number, nextPacked: number, voxelIndex: number) => {
      const previousAlpha = (previousPacked >>> 24) & 0xff;
      const nextAlpha = (nextPacked >>> 24) & 0xff;
      const previousRgb = rgbaPackedToRgb24(previousPacked);
      const nextRgb = rgbaPackedToRgb24(nextPacked);

      if (previousAlpha !== 0) {
        const current = state.labelCounts.get(previousRgb) ?? 0;
        if (current <= 1) {
          state.labelCounts.delete(previousRgb);
        } else {
          state.labelCounts.set(previousRgb, current - 1);
        }
        state.paintedIndices.delete(voxelIndex);
      }

      if (nextAlpha !== 0) {
        state.labelCounts.set(nextRgb, (state.labelCounts.get(nextRgb) ?? 0) + 1);
        state.paintedIndices.add(voxelIndex);
      }
    },
    [],
  );

  const applyPackedAtIndex = useCallback(
    (state: PaintVolumeState, voxelIndex: number, nextPacked: number, stroke: StrokeState | null) => {
      const previousPacked = readPackedRgba(state.rgba, voxelIndex);
      if (previousPacked === nextPacked) {
        return;
      }

      if (stroke && !stroke.touched.has(voxelIndex)) {
        stroke.touched.set(voxelIndex, previousPacked);
      }

      writePackedRgba(state.rgba, voxelIndex, nextPacked);
      updateLabelCountsForChange(state, previousPacked, nextPacked, voxelIndex);
    },
    [updateLabelCountsForChange],
  );

  const beginStroke = useCallback(() => {
    const state = ensurePaintVolume();
    if (!state) {
      strokeRef.current = null;
      return;
    }

    const parsed = parseHexRgb(color);
    const packedColor = parsed ? packRgba(parsed.r, parsed.g, parsed.b, 255) : packRgba(255, 91, 91, 255);

    const settings: StrokeSettings = {
      mode,
      radius: Math.max(MIN_RADIUS, Math.round(radius)),
      colorPacked: packedColor,
    };

    strokeRef.current = {
      settings,
      touched: new Map(),
      visitedCenters: new Set(),
    };
  }, [color, ensurePaintVolume, mode, radius]);

  const applyStrokeAt = useCallback(
    ({ x, y, z }: { x: number; y: number; z: number }) => {
      const state = paintStateRef.current;
      const stroke = strokeRef.current;
      if (!state || !stroke) {
        return;
      }

      const { width, height, depth } = state.dimensions;
      const safeX = clampInt(x, 0, width - 1);
      const safeY = clampInt(y, 0, height - 1);
      const safeZ = clampInt(z, 0, depth - 1);
      const centerIndex = safeZ * width * height + safeY * width + safeX;
      if (stroke.visitedCenters.has(centerIndex)) {
        return;
      }
      stroke.visitedCenters.add(centerIndex);

      const offsets = getSphereOffsets(stroke.settings.radius);
      const nextPacked =
        stroke.settings.mode === 'eraser' ? 0 : (stroke.settings.colorPacked >>> 0);

      for (const { dx, dy, dz } of offsets) {
        const vx = safeX + dx;
        const vy = safeY + dy;
        const vz = safeZ + dz;
        if (vx < 0 || vy < 0 || vz < 0 || vx >= width || vy >= height || vz >= depth) {
          continue;
        }
        const voxelIndex = vz * width * height + vy * width + vx;
        applyPackedAtIndex(state, voxelIndex, nextPacked, stroke);
      }

      scheduleUiUpdate();
    },
    [applyPackedAtIndex, getSphereOffsets, scheduleUiUpdate],
  );

  const endStroke = useCallback(() => {
    const state = paintStateRef.current;
    const stroke = strokeRef.current;
    strokeRef.current = null;

    if (!state || !stroke || stroke.touched.size === 0) {
      return;
    }

    const indices: number[] = [];
    const before: number[] = [];
    const after: number[] = [];

    for (const [voxelIndex, previousPacked] of stroke.touched.entries()) {
      const currentPacked = readPackedRgba(state.rgba, voxelIndex);
      if (currentPacked === previousPacked) {
        continue;
      }
      indices.push(voxelIndex);
      before.push(previousPacked >>> 0);
      after.push(currentPacked >>> 0);
    }

    if (indices.length === 0) {
      return;
    }

    const entry: HistoryEntry = {
      indices: Uint32Array.from(indices),
      before: Uint32Array.from(before),
      after: Uint32Array.from(after),
    };

    const undoStack = undoStackRef.current;
    undoStack.push(entry);
    if (undoStack.length > MAX_HISTORY) {
      undoStack.shift();
    }
    redoStackRef.current = [];
    scheduleUiUpdate();
  }, [scheduleUiUpdate]);

  const applyHistoryEntry = useCallback(
    (entry: HistoryEntry, direction: 'undo' | 'redo') => {
      const state = paintStateRef.current;
      if (!state) {
        return;
      }

      const { indices } = entry;
      const source = direction === 'undo' ? entry.before : entry.after;

      for (let i = 0; i < indices.length; i++) {
        const voxelIndex = indices[i] ?? 0;
        const nextPacked = source[i] ?? 0;
        applyPackedAtIndex(state, voxelIndex, nextPacked >>> 0, null);
      }

      scheduleUiUpdate();
    },
    [applyPackedAtIndex, scheduleUiUpdate],
  );

  const undo = useCallback(() => {
    const undoStack = undoStackRef.current;
    const entry = undoStack.pop() ?? null;
    if (!entry) {
      return;
    }
    applyHistoryEntry(entry, 'undo');
    redoStackRef.current.push(entry);
    scheduleUiUpdate();
  }, [applyHistoryEntry, scheduleUiUpdate]);

  const redo = useCallback(() => {
    const redoStack = redoStackRef.current;
    const entry = redoStack.pop() ?? null;
    if (!entry) {
      return;
    }
    applyHistoryEntry(entry, 'redo');
    undoStackRef.current.push(entry);
    scheduleUiUpdate();
  }, [applyHistoryEntry, scheduleUiUpdate]);

  const clear = useCallback(() => {
    const state = ensurePaintVolume();
    if (!state) {
      return;
    }

    for (const voxelIndex of state.paintedIndices) {
      writePackedRgba(state.rgba, voxelIndex, 0);
    }

    state.paintedIndices.clear();
    state.labelCounts.clear();
    undoStackRef.current = [];
    redoStackRef.current = [];
    scheduleUiUpdate();
  }, [ensurePaintVolume, scheduleUiUpdate]);

  const getUsedRgbSet = useCallback(() => {
    const state = paintStateRef.current;
    if (!state) {
      return new Set<number>();
    }
    return new Set(state.labelCounts.keys());
  }, []);

  const pickRandomUnusedColor = useCallback(() => {
    const used = getUsedRgbSet();
    const MAX_ATTEMPTS = 512;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const candidate = Math.floor(Math.random() * 0xffffff) >>> 0;
      if (candidate === 0) {
        continue;
      }
      if (!used.has(candidate)) {
        const hex = `#${candidate.toString(16).padStart(6, '0')}`;
        setColorState(hex);
        return;
      }
    }

    let candidate = 1;
    while (used.has(candidate)) {
      candidate = (candidate + 1) & 0xffffff;
      if (candidate === 0) {
        candidate = 1;
      }
    }
    setColorState(`#${candidate.toString(16).padStart(6, '0')}`);
  }, [getUsedRgbSet]);

  const getPaintRgbBytes = useCallback(() => {
    const state = paintStateRef.current;
    if (!state) {
      return null;
    }

    const { width, height, depth } = state.dimensions;
    const voxelCount = width * height * depth;
    const rgb = new Uint8Array(voxelCount * 3);
    const rgba = state.rgba;

    for (let voxelIndex = 0; voxelIndex < voxelCount; voxelIndex++) {
      const src = voxelIndex * 4;
      const dst = voxelIndex * 3;
      rgb[dst] = rgba[src] ?? 0;
      rgb[dst + 1] = rgba[src + 1] ?? 0;
      rgb[dst + 2] = rgba[src + 2] ?? 0;
    }

    return { dimensions: state.dimensions, rgb };
  }, []);

  const paintVolume = useMemo(() => paintStateRef.current?.volume ?? null, [revision]);

  const getSuggestedSaveName = useCallback(() => `painting-${toIsoTimestamp()}.tif`, []);

  return {
    enabled,
    overlayVisible,
    mode,
    radius,
    color,
    labelCount,
    canUndo,
    canRedo,
    revision,
    paintVolume,
    setEnabled,
    setOverlayVisible,
    setMode,
    setRadius: setRadiusSafe,
    setColor,
    pickRandomUnusedColor,
    undo,
    redo,
    clear,
    beginStroke,
    applyStrokeAt,
    endStroke,
    resetTool,
    getSuggestedSaveName,
    getPaintRgbBytes,
    getUsedRgbSet,
  };
}
