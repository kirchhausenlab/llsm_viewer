import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { NormalizedVolume } from '../volumeProcessing';
import './PlanarViewer.css';

type ViewerLayer = {
  key: string;
  label: string;
  volume: NormalizedVolume | null;
  visible: boolean;
  contrast: number;
  brightness: number;
  color: string;
};

type PlanarViewerProps = {
  layers: ViewerLayer[];
  filename: string | null;
  isLoading: boolean;
  loadingProgress: number;
  loadedVolumes: number;
  expectedVolumes: number;
  timeIndex: number;
  totalTimepoints: number;
  isPlaying: boolean;
  onTogglePlayback: () => void;
  onTimeIndexChange: (index: number) => void;
  onRegisterReset: (handler: (() => void) | null) => void;
  sliceIndex: number;
  maxSlices: number;
  onSliceIndexChange: (index: number) => void;
};

type SliceData = {
  width: number;
  height: number;
  buffer: Uint8ClampedArray;
  hasLayer: boolean;
};

type ViewState = {
  scale: number;
  offsetX: number;
  offsetY: number;
  rotation: number;
};

type PointerState = {
  pointerId: number;
  startX: number;
  startY: number;
  startOffsetX: number;
  startOffsetY: number;
};

const MIN_ALPHA = 0.05;
const ROTATION_STEP = (5 * Math.PI) / 180;
const PAN_STEP = 40;
const MIN_SCALE = 0.05;
const MAX_SCALE = 40;

function clamp(value: number, min: number, max: number) {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

function getColorComponents(color: string) {
  const hex = color.startsWith('#') ? color.slice(1) : color;
  const normalized =
    hex.length === 3
      ? hex
          .split('')
          .map((char) => char + char)
          .join('')
      : hex;
  const safeHex = normalized.padEnd(6, 'f').slice(0, 6);
  const red = parseInt(safeHex.slice(0, 2), 16) / 255;
  const green = parseInt(safeHex.slice(2, 4), 16) / 255;
  const blue = parseInt(safeHex.slice(4, 6), 16) / 255;
  return { r: red, g: green, b: blue };
}

function createInitialViewState(): ViewState {
  return { scale: 1, offsetX: 0, offsetY: 0, rotation: 0 };
}

function PlanarViewer({
  layers,
  filename,
  isLoading,
  loadingProgress,
  loadedVolumes,
  expectedVolumes,
  timeIndex,
  totalTimepoints,
  isPlaying,
  onTogglePlayback,
  onTimeIndexChange,
  onRegisterReset,
  sliceIndex,
  maxSlices,
  onSliceIndexChange
}: PlanarViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sliceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const previousSliceSizeRef = useRef<{ width: number; height: number } | null>(null);
  const needsAutoFitRef = useRef(false);
  const pointerStateRef = useRef<PointerState | null>(null);

  const [hasMeasured, setHasMeasured] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [viewState, setViewState] = useState<ViewState>(() => createInitialViewState());
  const viewStateRef = useRef(viewState);
  const [sliceRevision, setSliceRevision] = useState(0);

  const effectiveMaxSlices = Math.max(0, maxSlices);
  const clampedSliceIndex =
    effectiveMaxSlices > 0 ? clamp(sliceIndex, 0, effectiveMaxSlices - 1) : 0;

  useEffect(() => {
    viewStateRef.current = viewState;
  }, [viewState]);

  const updateViewState = useCallback(
    (updater: Partial<ViewState> | ((prev: ViewState) => ViewState)) => {
      setViewState((previous) => {
        const next =
          typeof updater === 'function'
            ? (updater as (prev: ViewState) => ViewState)(previous)
            : { ...previous, ...updater };
        viewStateRef.current = next;
        return next;
      });
    },
    []
  );

  const resetView = useCallback(() => {
    const container = containerRef.current;
    const sliceCanvas = sliceCanvasRef.current;
    if (!container || !sliceCanvas) {
      updateViewState(createInitialViewState());
      return;
    }
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width <= 0 || height <= 0) {
      updateViewState(createInitialViewState());
      return;
    }
    const scaleX = width / sliceCanvas.width;
    const scaleY = height / sliceCanvas.height;
    const fitScale = clamp(Math.min(scaleX, scaleY) || 1, MIN_SCALE, MAX_SCALE);
    updateViewState({ scale: fitScale, offsetX: 0, offsetY: 0, rotation: 0 });
  }, [updateViewState]);

  useEffect(() => {
    onRegisterReset(resetView);
    return () => {
      onRegisterReset(null);
    };
  }, [onRegisterReset, resetView]);

  const title = useMemo(() => {
    if (!filename) {
      return 'No dataset selected';
    }
    return filename;
  }, [filename]);

  const safeProgress = clamp(loadingProgress, 0, 1);
  const clampedLoadedVolumes = Math.max(0, loadedVolumes);
  const clampedExpectedVolumes = Math.max(0, expectedVolumes);
  const normalizedProgress =
    clampedExpectedVolumes > 0
      ? Math.min(1, clampedLoadedVolumes / clampedExpectedVolumes)
      : safeProgress;
  const hasStartedLoading =
    normalizedProgress > 0 || clampedLoadedVolumes > 0 || safeProgress > 0;
  const hasFinishedLoading =
    clampedExpectedVolumes > 0
      ? clampedLoadedVolumes >= clampedExpectedVolumes
      : safeProgress >= 1;
  const showLoadingOverlay = isLoading || (hasStartedLoading && !hasFinishedLoading);
  const clampedTimeIndex =
    totalTimepoints === 0 ? 0 : Math.min(timeIndex, Math.max(0, totalTimepoints - 1));

  const primaryVolume = useMemo(() => {
    for (const layer of layers) {
      if (layer.volume) {
        return layer.volume;
      }
    }
    return null;
  }, [layers]);

  const sliceData = useMemo<SliceData | null>(() => {
    if (!primaryVolume) {
      return null;
    }

    const width = primaryVolume.width;
    const height = primaryVolume.height;
    const pixelCount = width * height;

    if (pixelCount === 0) {
      return {
        width,
        height,
        buffer: new Uint8ClampedArray(0),
        hasLayer: false
      };
    }

    const accumR = new Float32Array(pixelCount);
    const accumG = new Float32Array(pixelCount);
    const accumB = new Float32Array(pixelCount);
    const accumA = new Float32Array(pixelCount);
    let hasLayer = false;

    const colorCache = new Map<string, { r: number; g: number; b: number }>();

    const getColor = (hex: string) => {
      if (!colorCache.has(hex)) {
        colorCache.set(hex, getColorComponents(hex));
      }
      return colorCache.get(hex)!;
    };

    layers.forEach((layer) => {
      const volume = layer.volume;
      if (!volume || !layer.visible) {
        return;
      }
      if (volume.width !== width || volume.height !== height) {
        return;
      }
      if (volume.depth <= 0) {
        return;
      }
      const channels = Math.max(1, volume.channels);
      const maxIndex = Math.max(0, volume.depth - 1);
      const slice = clamp(clampedSliceIndex, 0, maxIndex);
      const sliceStride = width * height * channels;
      const sliceOffset = slice * sliceStride;
      const data = volume.normalized;
      const brightness = layer.brightness ?? 0;
      const contrast = layer.contrast ?? 1;
      const tint = channels === 1 ? getColor(layer.color) : null;

      for (let i = 0; i < pixelCount; i++) {
        const pixelOffset = sliceOffset + i * channels;
        const sourceR = data[pixelOffset] ?? 0;
        const sourceG = channels > 1 ? data[pixelOffset + 1] ?? 0 : sourceR;
        const sourceB = channels > 2 ? data[pixelOffset + 2] ?? 0 : sourceG;
        const sourceA = channels > 3 ? data[pixelOffset + 3] ?? 0 : 0;

        const r = sourceR / 255;
        const g = sourceG / 255;
        const b = sourceB / 255;
        const a = sourceA / 255;

        let srcR = 0;
        let srcG = 0;
        let srcB = 0;
        let alpha = 0;

        if (channels === 1) {
          const brightened = clamp(r + brightness, 0, 1);
          const contrasted = clamp((brightened - 0.5) * contrast + 0.5, 0, 1);
          const layerAlpha = Math.max(contrasted, MIN_ALPHA);
          const color = tint ?? getColor('#ffffff');
          srcR = color.r * contrasted;
          srcG = color.g * contrasted;
          srcB = color.b * contrasted;
          alpha = layerAlpha;
        } else {
          const intensity =
            channels === 2
              ? 0.5 * (r + g)
              : channels === 3
              ? r * 0.2126 + g * 0.7152 + b * 0.0722
              : Math.max(r, g, Math.max(b, a));
          const brightIntensity = clamp(intensity + brightness, 0, 1);
          const contrasted = clamp((brightIntensity - 0.5) * contrast + 0.5, 0, 1);
          alpha = Math.max(contrasted, MIN_ALPHA);
          const brightR = clamp(r + brightness, 0, 1);
          const brightG = clamp(g + brightness, 0, 1);
          const brightB = clamp(b + brightness, 0, 1);
          srcR = brightR;
          srcG = channels > 1 ? brightG : brightR;
          srcB = channels > 2 ? brightB : 0;
        }

        const srcA = clamp(alpha, 0, 1);
        const srcRPremult = srcR * srcA;
        const srcGPremult = srcG * srcA;
        const srcBPremult = srcB * srcA;

        const prevR = accumR[i];
        const prevG = accumG[i];
        const prevB = accumB[i];
        const prevA = accumA[i];
        const oneMinusSrcA = 1 - srcA;

        accumR[i] = srcRPremult + prevR * oneMinusSrcA;
        accumG[i] = srcGPremult + prevG * oneMinusSrcA;
        accumB[i] = srcBPremult + prevB * oneMinusSrcA;
        accumA[i] = srcA + prevA * oneMinusSrcA;

        if (!hasLayer && srcA > 0) {
          hasLayer = true;
        }
      }
    });

    const output = new Uint8ClampedArray(pixelCount * 4);
    for (let i = 0; i < pixelCount; i++) {
      const alpha = clamp(accumA[i], 0, 1);
      const index = i * 4;
      if (alpha > 1e-6) {
        const invAlpha = 1 / alpha;
        output[index] = Math.round(clamp(accumR[i] * invAlpha, 0, 1) * 255);
        output[index + 1] = Math.round(clamp(accumG[i] * invAlpha, 0, 1) * 255);
        output[index + 2] = Math.round(clamp(accumB[i] * invAlpha, 0, 1) * 255);
        output[index + 3] = Math.round(alpha * 255);
      } else {
        output[index] = 0;
        output[index + 1] = 0;
        output[index + 2] = 0;
        output[index + 3] = 0;
      }
    }

    return { width, height, buffer: output, hasLayer };
  }, [layers, primaryVolume, clampedSliceIndex]);

  const drawSlice = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }

    const sliceCanvas = sliceCanvasRef.current;
    const dpr = window.devicePixelRatio || 1;
    const width = canvasSize.width;
    const height = canvasSize.height;

    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);

    if (!sliceCanvas) {
      return;
    }

    context.save();
    context.imageSmoothingEnabled = false;
    context.translate(width / 2 + viewState.offsetX, height / 2 + viewState.offsetY);
    context.rotate(viewState.rotation);
    context.scale(viewState.scale, viewState.scale);
    context.drawImage(sliceCanvas, -sliceCanvas.width / 2, -sliceCanvas.height / 2);
    context.restore();
  }, [canvasSize.height, canvasSize.width, viewState]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) {
      return;
    }

    const observer = new ResizeObserver(() => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (width > 0 && height > 0) {
        setHasMeasured(true);
      }
      setCanvasSize((current) => {
        if (current.width === width && current.height === height) {
          return current;
        }
        return { width, height };
      });
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      needsAutoFitRef.current = true;
    });

    observer.observe(container);
    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!sliceData) {
      sliceCanvasRef.current = null;
      previousSliceSizeRef.current = null;
      drawSlice();
      return;
    }

    const { width, height, buffer } = sliceData;
    const offscreen = document.createElement('canvas');
    offscreen.width = width;
    offscreen.height = height;
    const context = offscreen.getContext('2d');
    if (!context) {
      sliceCanvasRef.current = null;
      previousSliceSizeRef.current = null;
      drawSlice();
      return;
    }

    const image = new ImageData(buffer, width, height);
    context.putImageData(image, 0, 0);
    sliceCanvasRef.current = offscreen;
    const previousSize = previousSliceSizeRef.current;
    if (!previousSize || previousSize.width !== width || previousSize.height !== height) {
      needsAutoFitRef.current = true;
    }
    previousSliceSizeRef.current = { width, height };
    setSliceRevision((value) => value + 1);
  }, [drawSlice, sliceData]);

  useEffect(() => {
    if (needsAutoFitRef.current) {
      needsAutoFitRef.current = false;
      resetView();
    }
  }, [canvasSize, resetView, sliceRevision]);

  useEffect(() => {
    drawSlice();
  }, [drawSlice, sliceRevision]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0) {
        return;
      }
      const target = canvasRef.current;
      if (!target) {
        return;
      }
      pointerStateRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startOffsetX: viewStateRef.current.offsetX,
        startOffsetY: viewStateRef.current.offsetY
      };
      target.setPointerCapture(event.pointerId);
    };

    const handlePointerMove = (event: PointerEvent) => {
      const state = pointerStateRef.current;
      if (!state || state.pointerId !== event.pointerId) {
        return;
      }
      const deltaX = event.clientX - state.startX;
      const deltaY = event.clientY - state.startY;
      updateViewState({
        offsetX: state.startOffsetX + deltaX,
        offsetY: state.startOffsetY + deltaY
      });
    };

    const handlePointerEnd = (event: PointerEvent) => {
      const state = pointerStateRef.current;
      if (!state || state.pointerId !== event.pointerId) {
        return;
      }
      const target = canvasRef.current;
      if (target) {
        target.releasePointerCapture(event.pointerId);
      }
      pointerStateRef.current = null;
    };

    const handleWheel = (event: WheelEvent) => {
      if (event.deltaY === 0) {
        return;
      }
      event.preventDefault();
      const zoomFactor = Math.exp(-event.deltaY * 0.0015);
      updateViewState((previous) => {
        const nextScale = clamp(previous.scale * zoomFactor, MIN_SCALE, MAX_SCALE);
        return { ...previous, scale: nextScale };
      });
    };

    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerup', handlePointerEnd);
    canvas.addEventListener('pointercancel', handlePointerEnd);
    canvas.addEventListener('pointerleave', handlePointerEnd);
    canvas.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerup', handlePointerEnd);
      canvas.removeEventListener('pointercancel', handlePointerEnd);
      canvas.removeEventListener('pointerleave', handlePointerEnd);
      canvas.removeEventListener('wheel', handleWheel);
    };
  }, [updateViewState]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const activeElement = document.activeElement;
      if (activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement) {
        return;
      }
      if (activeElement instanceof HTMLElement && activeElement.getAttribute('contenteditable') === 'true') {
        return;
      }

      switch (event.code) {
        case 'KeyW': {
          if (effectiveMaxSlices > 0) {
            const step = event.shiftKey ? 10 : 1;
            const nextIndex = clamp(
              clampedSliceIndex + step,
              0,
              Math.max(0, effectiveMaxSlices - 1)
            );
            if (nextIndex !== clampedSliceIndex) {
              onSliceIndexChange(nextIndex);
            }
            event.preventDefault();
          }
          break;
        }
        case 'KeyS': {
          if (effectiveMaxSlices > 0) {
            const step = event.shiftKey ? 10 : 1;
            const nextIndex = clamp(
              clampedSliceIndex - step,
              0,
              Math.max(0, effectiveMaxSlices - 1)
            );
            if (nextIndex !== clampedSliceIndex) {
              onSliceIndexChange(nextIndex);
            }
            event.preventDefault();
          }
          break;
        }
        case 'KeyA': {
          updateViewState((previous) => ({
            ...previous,
            offsetX: previous.offsetX - PAN_STEP
          }));
          event.preventDefault();
          break;
        }
        case 'KeyD': {
          updateViewState((previous) => ({
            ...previous,
            offsetX: previous.offsetX + PAN_STEP
          }));
          event.preventDefault();
          break;
        }
        case 'KeyQ': {
          updateViewState((previous) => ({
            ...previous,
            rotation: previous.rotation - ROTATION_STEP
          }));
          event.preventDefault();
          break;
        }
        case 'KeyE': {
          updateViewState((previous) => ({
            ...previous,
            rotation: previous.rotation + ROTATION_STEP
          }));
          event.preventDefault();
          break;
        }
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [clampedSliceIndex, effectiveMaxSlices, onSliceIndexChange, updateViewState]);

  const disableTimeControls = isLoading || totalTimepoints <= 1;
  const disableSliceControls = effectiveMaxSlices <= 1;

  return (
    <div className="planar-viewer">
      <header>
        <div>
          <h2>{title}</h2>
          {primaryVolume ? (
            <p>
              {primaryVolume.width} × {primaryVolume.height} × {primaryVolume.depth} ·{' '}
              {primaryVolume.channels} channel{primaryVolume.channels > 1 ? 's' : ''}
            </p>
          ) : (
            <p>Select a dataset to explore its XY slices.</p>
          )}
          {layers.length > 0 ? (
            <div className="viewer-layer-summary">
              {layers.map((layer) => (
                <span
                  key={layer.key}
                  className={layer.visible ? 'layer-pill' : 'layer-pill is-hidden'}
                  aria-label={layer.visible ? `${layer.label} visible` : `${layer.label} hidden`}
                >
                  {layer.label}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <div className="viewer-meta">
          <div className="time-info">
            <span>Frame {totalTimepoints === 0 ? 0 : clampedTimeIndex + 1}</span>
            <span>/</span>
            <span>{totalTimepoints}</span>
          </div>
          <button type="button" onClick={resetView} disabled={!primaryVolume}>
            Reset view
          </button>
        </div>
      </header>

      <section className="planar-surface">
        {showLoadingOverlay && (
          <div className="overlay">
            <div className="loading-panel">
              <span className="loading-title">Loading dataset…</span>
              {clampedExpectedVolumes > 0 ? (
                <span>
                  Loaded {clampedLoadedVolumes} / {clampedExpectedVolumes} volumes
                </span>
              ) : null}
            </div>
          </div>
        )}
        <div
          className={`planar-canvas-wrapper${hasMeasured ? ' is-ready' : ''}`}
          ref={containerRef}
        >
          <canvas ref={canvasRef} className="planar-canvas" />
          {(!sliceData || !sliceData.hasLayer) && !showLoadingOverlay ? (
            <div className="planar-empty-hint">
              {layers.length === 0
                ? 'Load a dataset to begin viewing slices.'
                : 'Enable a layer to view its XY slice.'}
            </div>
          ) : null}
        </div>
      </section>

      {effectiveMaxSlices > 0 ? (
        <section className="axis-controls">
          <label htmlFor="planar-z-slider">
            Z plane{' '}
            <span>
              {clampedSliceIndex + 1} / {effectiveMaxSlices}
            </span>
          </label>
          <input
            id="planar-z-slider"
            type="range"
            min={0}
            max={Math.max(0, effectiveMaxSlices - 1)}
            value={clampedSliceIndex}
            onChange={(event) => onSliceIndexChange(Number(event.target.value))}
            disabled={disableSliceControls}
          />
        </section>
      ) : null}

      {totalTimepoints > 0 ? (
        <section className="time-controls">
          <button
            type="button"
            onClick={onTogglePlayback}
            disabled={disableTimeControls}
            className={isPlaying ? 'playing' : ''}
          >
            {isPlaying ? 'Pause' : 'Play'}
          </button>
          <input
            type="range"
            min={0}
            max={Math.max(0, totalTimepoints - 1)}
            value={clampedTimeIndex}
            onChange={(event) => onTimeIndexChange(Number(event.target.value))}
            disabled={disableTimeControls}
          />
          <span className="time-label">
            {totalTimepoints === 0 ? '0' : `${clampedTimeIndex + 1} / ${totalTimepoints}`}
          </span>
        </section>
      ) : null}
    </div>
  );
}

export default PlanarViewer;
