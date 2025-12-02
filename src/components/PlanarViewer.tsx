import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import type { TrackColorMode, TrackDefinition } from '../types/tracks';
import { getTrackColorHex } from '../trackColors';
import type { NormalizedVolume } from '../volumeProcessing';
import type { VolumeDataType } from '../types/volume';
import type { HoveredVoxelInfo } from '../types/hover';
import { denormalizeValue, formatChannelValuesDetailed } from '../utils/intensityFormatting';
import type { ProjectionMode } from '../types/viewer';
import './PlanarViewer.css';

type ViewerLayer = {
  key: string;
  label: string;
  channelId: string;
  channelName: string;
  volume: NormalizedVolume | null;
  visible: boolean;
  sliderRange: number;
  minSliderIndex: number;
  maxSliderIndex: number;
  brightnessSliderIndex: number;
  contrastSliderIndex: number;
  windowMin: number;
  windowMax: number;
  color: string;
  offsetX: number;
  offsetY: number;
  renderStyle: 0 | 1;
  invert: boolean;
  isSegmentation: boolean;
};

type PlanarViewerProps = {
  layers: ViewerLayer[];
  isLoading: boolean;
  loadingProgress: number;
  loadedVolumes: number;
  expectedVolumes: number;
  timeIndex: number;
  totalTimepoints: number;
  onRegisterReset: (handler: (() => void) | null) => void;
  sliceIndex: number;
  maxSlices: number;
  onSliceIndexChange: (index: number) => void;
  trackScale: { x: number; y: number; z: number };
  tracks: TrackDefinition[];
  trackVisibility: Record<string, boolean>;
  trackOpacityByChannel: Record<string, number>;
  trackLineWidthByChannel: Record<string, number>;
  channelTrackColorModes: Record<string, TrackColorMode>;
  channelTrackOffsets: Record<string, { x: number; y: number }>;
  selectedTrackIds: ReadonlySet<string>;
  followedTrackId: string | null;
  onTrackSelectionToggle: (trackId: string) => void;
  onTrackFollowRequest: (trackId: string) => void;
  onHoverVoxelChange?: (value: HoveredVoxelInfo | null) => void;
  orthogonalViewsEnabled: boolean;
  projectionMode: ProjectionMode;
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

type TrackHitTestResult = {
  trackId: string | null;
  pointer: { x: number; y: number } | null;
};

type TrackRenderEntry = {
  id: string;
  channelId: string;
  channelName: string;
  trackNumber: number;
  points: { x: number; y: number; z: number }[];
  baseColor: { r: number; g: number; b: number };
  highlightColor: { r: number; g: number; b: number };
};

type HoveredIntensityInfo = Pick<HoveredVoxelInfo, 'intensity' | 'components'>;

type SliceSampler = (x: number, y: number) => number[] | null;

type PlanarLayoutView = {
  width: number;
  height: number;
  originX: number;
  originY: number;
  centerX: number;
  centerY: number;
};

type PlanarLayout = {
  blockWidth: number;
  blockHeight: number;
  gap: number;
  xy: PlanarLayoutView | null;
  xz: PlanarLayoutView | null;
  zy: PlanarLayoutView | null;
};

const MIN_ALPHA = 0.05;
const ROTATION_KEY_STEP = 0.1;
const PAN_STEP = 40;
const MIN_SCALE = 0.05;
const MAX_SCALE = 40;
const TRACK_HIGHLIGHT_BOOST = 0.4;
const OUTLINE_OPACITY = 0.75;
const OUTLINE_MIN_WIDTH = 0.4;
const TRACK_EPSILON = 1e-3;
const TRACK_HIT_TEST_MIN_DISTANCE = 6;
const DEFAULT_TRACK_OPACITY = 0.9;
const DEFAULT_TRACK_LINE_WIDTH = 1;
const WINDOW_EPSILON = 1e-5;
const SELECTED_TRACK_BLINK_PERIOD_MS = 1600;
const SELECTED_TRACK_BLINK_BASE = 0.85;
const SELECTED_TRACK_BLINK_RANGE = 0.15;
const FOLLOWED_TRACK_LINE_WIDTH_MULTIPLIER = 1.35;
const SELECTED_TRACK_LINE_WIDTH_MULTIPLIER = 1.5;
const ORTHOGONAL_GAP = 16;

function initializeProjectionAccumulator(mode: ProjectionMode, target: number[]) {
  switch (mode) {
    case 'max':
      target.fill(-Infinity);
      break;
    case 'min':
      target.fill(Infinity);
      break;
    default:
      target.fill(0);
      break;
  }
}

function accumulateProjectionSample(mode: ProjectionMode, target: number[], sample: number[]) {
  for (let index = 0; index < target.length; index += 1) {
    const value = sample[index] ?? 0;
    if (mode === 'max') {
      if (value > target[index]) {
        target[index] = value;
      }
    } else if (mode === 'min') {
      if (value < target[index]) {
        target[index] = value;
      }
    } else {
      target[index] += value;
    }
  }
}

function finalizeProjectionAccumulator(mode: ProjectionMode, divisor: number, target: number[]) {
  if (mode === 'mean' && divisor > 0) {
    for (let index = 0; index < target.length; index += 1) {
      target[index] /= divisor;
    }
  }
}

function sampleVolumeChannels(
  volume: NormalizedVolume,
  sampleX: number,
  sampleY: number,
  slice: number,
  channels: number,
  out: number[]
) {
  const clampedZ = Math.round(clamp(slice, 0, volume.depth - 1));
  const sliceStride = volume.width * volume.height * channels;
  const rowStride = volume.width * channels;
  const sliceOffset = clampedZ * sliceStride;

  const clampedX = clamp(sampleX, 0, volume.width - 1);
  const clampedY = clamp(sampleY, 0, volume.height - 1);
  const leftX = Math.floor(clampedX);
  const rightX = Math.min(volume.width - 1, leftX + 1);
  const topY = Math.floor(clampedY);
  const bottomY = Math.min(volume.height - 1, topY + 1);
  const tX = clampedX - leftX;
  const tY = clampedY - topY;

  const topRowOffset = sliceOffset + topY * rowStride;
  const bottomRowOffset = sliceOffset + bottomY * rowStride;

  const weightTopLeft = (1 - tX) * (1 - tY);
  const weightTopRight = tX * (1 - tY);
  const weightBottomLeft = (1 - tX) * tY;
  const weightBottomRight = tX * tY;

  for (let channelIndex = 0; channelIndex < channels; channelIndex += 1) {
    const topLeftOffset = topRowOffset + leftX * channels + channelIndex;
    const topRightOffset = topRowOffset + rightX * channels + channelIndex;
    const bottomLeftOffset = bottomRowOffset + leftX * channels + channelIndex;
    const bottomRightOffset = bottomRowOffset + rightX * channels + channelIndex;

    out[channelIndex] =
      (volume.normalized[topLeftOffset] ?? 0) * weightTopLeft +
      (volume.normalized[topRightOffset] ?? 0) * weightTopRight +
      (volume.normalized[bottomLeftOffset] ?? 0) * weightBottomLeft +
      (volume.normalized[bottomRightOffset] ?? 0) * weightBottomRight;
  }

  return out;
}

function clamp(value: number, min: number, max: number) {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

function sampleSegmentationLabel2d(volume: NormalizedVolume, x: number, y: number, z: number) {
  if (!volume.segmentationLabels) {
    return null;
  }

  const safeX = Math.round(clamp(x, 0, volume.width - 1));
  const safeY = Math.round(clamp(y, 0, volume.height - 1));
  const safeZ = Math.round(clamp(z, 0, volume.depth - 1));

  const sliceStride = volume.width * volume.height;
  const index = safeZ * sliceStride + safeY * volume.width + safeX;
  return volume.segmentationLabels[index] ?? null;
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

function mixWithWhite(color: { r: number; g: number; b: number }, intensity: number) {
  const amount = clamp(intensity, 0, 1);
  return {
    r: clamp(color.r + (1 - color.r) * amount, 0, 1),
    g: clamp(color.g + (1 - color.g) * amount, 0, 1),
    b: clamp(color.b + (1 - color.b) * amount, 0, 1)
  };
}

function componentsToCss({ r, g, b }: { r: number; g: number; b: number }) {
  const red = Math.round(clamp(r, 0, 1) * 255);
  const green = Math.round(clamp(g, 0, 1) * 255);
  const blue = Math.round(clamp(b, 0, 1) * 255);
  return `rgb(${red}, ${green}, ${blue})`;
}

function createInitialViewState(): ViewState {
  return { scale: 1, offsetX: 0, offsetY: 0, rotation: 0 };
}

function createSliceWithSampler(
  width: number,
  height: number,
  layers: ViewerLayer[],
  samplerFactory: (layer: ViewerLayer) => SliceSampler | null
): SliceData | null {
  if (width === 0 || height === 0) {
    return { width, height, buffer: new Uint8ClampedArray(0), hasLayer: false };
  }

  const pixelCount = width * height;
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
    const sampler = samplerFactory(layer);
    if (!sampler) {
      return;
    }

    const volume = layer.volume!;
    const channels = Math.max(1, volume.channels);
    const invert = layer.invert ?? false;
    const windowMin = layer.windowMin ?? 0;
    const windowMax = layer.windowMax ?? 1;
    const windowRange = Math.max(windowMax - windowMin, WINDOW_EPSILON);
    const normalizeScalar = (value: number) => clamp((value - windowMin) / windowRange, 0, 1);
    const applyWindow = (value: number) => {
      const normalized = normalizeScalar(value);
      return invert ? 1 - normalized : normalized;
    };
    const tint = channels === 1 ? getColor(layer.color) : null;
    const channelValues = new Array<number>(channels);

    for (let y = 0; y < height; y++) {
      const rowIndex = y * width;
      for (let x = 0; x < width; x++) {
        const pixelIndex = rowIndex + x;
        const sampled = sampler(x, y);
        if (!sampled) {
          continue;
        }

        for (let channelIndex = 0; channelIndex < channels; channelIndex++) {
          channelValues[channelIndex] = sampled[channelIndex] ?? 0;
        }

        const channelR = channelValues[0] / 255;
        const channelG = channels > 1 ? channelValues[1] / 255 : channelR;
        const channelB =
          channels > 2 ? channelValues[2] / 255 : channels === 2 ? 0 : channelG;
        const channelA = channels > 3 ? channelValues[3] / 255 : 0;

        let srcR = 0;
        let srcG = 0;
        let srcB = 0;
        let alpha = 0;

        if (channels === 1) {
          const normalizedIntensity = applyWindow(channelR);
          const layerAlpha = Math.max(normalizedIntensity, MIN_ALPHA);
          const color = tint ?? getColor('#ffffff');
          srcR = color.r * normalizedIntensity;
          srcG = color.g * normalizedIntensity;
          srcB = color.b * normalizedIntensity;
          alpha = layerAlpha;
        } else {
          const intensity =
            channels === 2
              ? 0.5 * (channelR + channelG)
              : channels === 3
              ? channelR * 0.2126 + channelG * 0.7152 + channelB * 0.0722
              : Math.max(channelR, channelG, Math.max(channelB, channelA));
          const normalizedIntensity = applyWindow(intensity);
          alpha = Math.max(normalizedIntensity, MIN_ALPHA);
          const normalizedR = applyWindow(channelR);
          const normalizedG = channels > 1 ? applyWindow(channelG) : normalizedR;
          const normalizedB =
            channels > 2 ? applyWindow(channelB) : channels === 2 ? 0 : normalizedG;
          srcR = normalizedR;
          srcG = normalizedG;
          srcB = normalizedB;
        }

        const srcA = clamp(alpha, 0, 1);
        const srcRPremult = srcR * srcA;
        const srcGPremult = srcG * srcA;
        const srcBPremult = srcB * srcA;

        const prevR = accumR[pixelIndex];
        const prevG = accumG[pixelIndex];
        const prevB = accumB[pixelIndex];
        const prevA = accumA[pixelIndex];
        const oneMinusSrcA = 1 - srcA;

        accumR[pixelIndex] = srcRPremult + prevR * oneMinusSrcA;
        accumG[pixelIndex] = srcGPremult + prevG * oneMinusSrcA;
        accumB[pixelIndex] = srcBPremult + prevB * oneMinusSrcA;
        accumA[pixelIndex] = srcA + prevA * oneMinusSrcA;

        if (!hasLayer && srcA > 0) {
          hasLayer = true;
        }
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
}

function updateOffscreenCanvas(
  slice: SliceData | null,
  canvasRef: MutableRefObject<HTMLCanvasElement | null>,
  contextRef: MutableRefObject<CanvasRenderingContext2D | null>
): boolean {
  const previousCanvas = canvasRef.current;
  const previousContext = contextRef.current;

  if (!slice || slice.width === 0 || slice.height === 0) {
    const hadContent = Boolean(previousCanvas && previousContext);
    canvasRef.current = null;
    contextRef.current = null;
    return hadContent;
  }

  let canvas = previousCanvas;
  if (!canvas) {
    canvas = document.createElement('canvas');
  }

  if (canvas.width !== slice.width || canvas.height !== slice.height) {
    canvas.width = slice.width;
    canvas.height = slice.height;
    contextRef.current = null;
  }

  let context = contextRef.current;
  if (!context) {
    context = canvas.getContext('2d');
    if (!context) {
      canvasRef.current = null;
      contextRef.current = null;
      return Boolean(previousCanvas && previousContext);
    }
    contextRef.current = context;
  }

  const image = new ImageData(slice.buffer as unknown as ImageDataArray, slice.width, slice.height);
  context.putImageData(image, 0, 0);
  canvasRef.current = canvas;

  return true;
}

function PlanarViewer({
  layers,
  isLoading,
  loadingProgress,
  loadedVolumes,
  expectedVolumes,
  timeIndex,
  totalTimepoints,
  onRegisterReset,
  sliceIndex,
  maxSlices,
  onSliceIndexChange,
  trackScale,
  tracks,
  trackVisibility,
  trackOpacityByChannel,
  trackLineWidthByChannel,
  channelTrackColorModes,
  channelTrackOffsets,
  selectedTrackIds,
  followedTrackId,
  onTrackSelectionToggle,
  onTrackFollowRequest,
  onHoverVoxelChange,
  orthogonalViewsEnabled,
  projectionMode
}: PlanarViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const xyCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const xzCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const zyCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const xyContextRef = useRef<CanvasRenderingContext2D | null>(null);
  const xzContextRef = useRef<CanvasRenderingContext2D | null>(null);
  const zyContextRef = useRef<CanvasRenderingContext2D | null>(null);
  const previousLayoutRef = useRef<PlanarLayout | null>(null);
  const needsAutoFitRef = useRef(false);
  const previousPrimaryVolumeRef = useRef<{
    width: number;
    height: number;
    depth: number;
  } | null>(null);
  const pointerStateRef = useRef<PointerState | null>(null);
  const followedTrackIdRef = useRef<string | null>(followedTrackId);
  const hoveredTrackIdRef = useRef<string | null>(null);
  const selectedTrackIdsRef = useRef<ReadonlySet<string>>(selectedTrackIds);

  const trackScaleX = trackScale.x ?? 1;
  const trackScaleY = trackScale.y ?? 1;
  const trackScaleZ = trackScale.z ?? 1;

  const [hasMeasured, setHasMeasured] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [viewState, setViewState] = useState<ViewState>(() => createInitialViewState());
  const viewStateRef = useRef(viewState);
  const [sliceRevision, setSliceRevision] = useState(0);
  const [hoveredTrackId, setHoveredTrackId] = useState<string | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ x: number; y: number } | null>(null);
  const hoveredPixelRef = useRef<{ x: number; y: number } | null>(null);
  const [hoveredPixel, setHoveredPixel] = useState<{ x: number; y: number } | null>(null);

  const effectiveMaxSlices = projectionMode === 'none' ? Math.max(0, maxSlices) : 1;
  const clampedSliceIndex =
    effectiveMaxSlices > 0 ? clamp(sliceIndex, 0, effectiveMaxSlices - 1) : 0;

  useEffect(() => {
    viewStateRef.current = viewState;
  }, [viewState]);

  useEffect(() => {
    followedTrackIdRef.current = followedTrackId;
  }, [followedTrackId]);

  useEffect(() => {
    selectedTrackIdsRef.current = selectedTrackIds;
  }, [selectedTrackIds]);

  const trackLookup = useMemo(() => {
    const map = new Map<string, TrackDefinition>();
    for (const track of tracks) {
      map.set(track.id, track);
    }
    return map;
  }, [tracks]);

  const resolveTrackHexColor = useCallback(
    (track: TrackDefinition) => {
      const mode = channelTrackColorModes[track.channelId];
      if (mode && mode.type === 'uniform') {
        return mode.color;
      }
      return getTrackColorHex(track.id);
    },
    [channelTrackColorModes]
  );

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

  useEffect(() => {
    const previous = previousPrimaryVolumeRef.current;

    if (!primaryVolume) {
      previousPrimaryVolumeRef.current = null;
      needsAutoFitRef.current = true;
      return;
    }

    const current = {
      width: primaryVolume.width,
      height: primaryVolume.height,
      depth: primaryVolume.depth
    };

    previousPrimaryVolumeRef.current = current;

    if (
      !previous ||
      previous.width !== current.width ||
      previous.height !== current.height ||
      previous.depth !== current.depth
    ) {
      needsAutoFitRef.current = true;
    }
  }, [primaryVolume]);

  const layout = useMemo<PlanarLayout>(() => {
    if (!primaryVolume) {
      return {
        blockWidth: 0,
        blockHeight: 0,
        gap: ORTHOGONAL_GAP,
        xy: null,
        xz: null,
        zy: null
      };
    }

    const xyWidth = primaryVolume.width;
    const xyHeight = primaryVolume.height;

    const xy: PlanarLayoutView = {
      width: xyWidth,
      height: xyHeight,
      originX: 0,
      originY: 0,
      centerX: xyWidth / 2,
      centerY: xyHeight / 2
    };

    if (!orthogonalViewsEnabled || primaryVolume.depth <= 1) {
      return {
        blockWidth: xyWidth,
        blockHeight: xyHeight,
        gap: ORTHOGONAL_GAP,
        xy,
        xz: null,
        zy: null
      };
    }

    const xzWidth = primaryVolume.width;
    const xzHeight = primaryVolume.depth;
    const zyWidth = primaryVolume.depth;
    const zyHeight = primaryVolume.height;

    return {
      blockWidth: xyWidth + ORTHOGONAL_GAP + zyWidth,
      blockHeight: xyHeight + ORTHOGONAL_GAP + xzHeight,
      gap: ORTHOGONAL_GAP,
      xy,
      xz: {
        width: xzWidth,
        height: xzHeight,
        originX: 0,
        originY: xyHeight + ORTHOGONAL_GAP,
        centerX: xzWidth / 2,
        centerY: xyHeight + ORTHOGONAL_GAP + xzHeight / 2
      },
      zy: {
        width: zyWidth,
        height: zyHeight,
        originX: xyWidth + ORTHOGONAL_GAP,
        originY: 0,
        centerX: xyWidth + ORTHOGONAL_GAP + zyWidth / 2,
        centerY: zyHeight / 2
      }
    };
  }, [orthogonalViewsEnabled, primaryVolume]);

  useEffect(() => {
    const previous = previousLayoutRef.current;
    previousLayoutRef.current = layout;

    if (!previous || !previous.xy || !layout.xy) {
      return;
    }

    const previousOffsetFromCenter = {
      x: previous.xy.centerX - previous.blockWidth / 2,
      y: previous.xy.centerY - previous.blockHeight / 2
    };

    const nextOffsetFromCenter = {
      x: layout.xy.centerX - layout.blockWidth / 2,
      y: layout.xy.centerY - layout.blockHeight / 2
    };

    const deltaX = previousOffsetFromCenter.x - nextOffsetFromCenter.x;
    const deltaY = previousOffsetFromCenter.y - nextOffsetFromCenter.y;

    if (Math.abs(deltaX) < 1e-6 && Math.abs(deltaY) < 1e-6) {
      return;
    }

    updateViewState((previousView) => {
      const scale = Math.max(previousView.scale, 1e-6);
      const rotation = previousView.rotation;
      const cos = Math.cos(rotation);
      const sin = Math.sin(rotation);

      const scaledX = deltaX * scale;
      const scaledY = deltaY * scale;

      const rotatedX = scaledX * cos - scaledY * sin;
      const rotatedY = scaledX * sin + scaledY * cos;

      const nextOffsetX = previousView.offsetX + rotatedX;
      const nextOffsetY = previousView.offsetY + rotatedY;

      if (
        Math.abs(nextOffsetX - previousView.offsetX) < 1e-3 &&
        Math.abs(nextOffsetY - previousView.offsetY) < 1e-3
      ) {
        return previousView;
      }

      return { ...previousView, offsetX: nextOffsetX, offsetY: nextOffsetY };
    });
  }, [layout, updateViewState]);

  const sliceData = useMemo<SliceData | null>(() => {
    if (!primaryVolume) {
      return null;
    }

    const width = primaryVolume.width;
    const height = primaryVolume.height;

    return createSliceWithSampler(width, height, layers, (layer) => {
      const volume = layer.volume;
      if (!volume || !layer.visible) {
        return null;
      }
      if (
        volume.width !== width ||
        volume.height !== height ||
        volume.depth <= 0
      ) {
        return null;
      }

      const channels = Math.max(1, volume.channels);
      const offsetX = layer.offsetX ?? 0;
      const offsetY = layer.offsetY ?? 0;
      const hasOffset = Math.abs(offsetX) > 1e-3 || Math.abs(offsetY) > 1e-3;

      if (projectionMode !== 'none') {
        const accumulator = new Array<number>(channels);
        const scratch = new Array<number>(channels);

        return (x, y) => {
          const sampleX = x - offsetX;
          const sampleY = y - offsetY;

          initializeProjectionAccumulator(projectionMode, accumulator);
          for (let z = 0; z < volume.depth; z += 1) {
            sampleVolumeChannels(volume, sampleX, sampleY, z, channels, scratch);
            accumulateProjectionSample(projectionMode, accumulator, scratch);
          }
          finalizeProjectionAccumulator(projectionMode, volume.depth, accumulator);

          return accumulator;
        };
      }

      const slice = clamp(clampedSliceIndex, 0, Math.max(0, volume.depth - 1));
      const sliceStride = width * height * channels;
      const rowStride = width * channels;
      const sliceOffset = slice * sliceStride;
      const values = new Array<number>(channels);

      if (!hasOffset) {
        return (x, y) => {
          const pixelOffset = sliceOffset + (y * width + x) * channels;
          for (let channelIndex = 0; channelIndex < channels; channelIndex += 1) {
            values[channelIndex] = volume.normalized[pixelOffset + channelIndex] ?? 0;
          }
          return values;
        };
      }

      return (x, y) => {
        const sampleX = x - offsetX;
        const sampleY = y - offsetY;
        const clampedX = clamp(sampleX, 0, width - 1);
        const clampedY = clamp(sampleY, 0, height - 1);
        const leftX = Math.floor(clampedX);
        const rightX = Math.min(width - 1, leftX + 1);
        const topY = Math.floor(clampedY);
        const bottomY = Math.min(height - 1, topY + 1);
        const tX = clampedX - leftX;
        const tY = clampedY - topY;

        const topRowOffset = sliceOffset + topY * rowStride;
        const bottomRowOffset = sliceOffset + bottomY * rowStride;

        const topLeftOffset = topRowOffset + leftX * channels;
        const topRightOffset = topRowOffset + rightX * channels;
        const bottomLeftOffset = bottomRowOffset + leftX * channels;
        const bottomRightOffset = bottomRowOffset + rightX * channels;

        const weightTopLeft = (1 - tX) * (1 - tY);
        const weightTopRight = tX * (1 - tY);
        const weightBottomLeft = (1 - tX) * tY;
        const weightBottomRight = tX * tY;

        for (let channelIndex = 0; channelIndex < channels; channelIndex += 1) {
          values[channelIndex] =
            (volume.normalized[topLeftOffset + channelIndex] ?? 0) * weightTopLeft +
            (volume.normalized[topRightOffset + channelIndex] ?? 0) * weightTopRight +
            (volume.normalized[bottomLeftOffset + channelIndex] ?? 0) * weightBottomLeft +
            (volume.normalized[bottomRightOffset + channelIndex] ?? 0) * weightBottomRight;
        }

        return values;
      };
    });
  }, [clampedSliceIndex, layers, primaryVolume, projectionMode]);

  const resetView = useCallback(() => {
    const container = containerRef.current;
    if (!container || layout.blockWidth <= 0 || layout.blockHeight <= 0) {
      updateViewState(createInitialViewState());
      return;
    }
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width <= 0 || height <= 0) {
      updateViewState(createInitialViewState());
      return;
    }
    const scaleX = width / layout.blockWidth;
    const scaleY = height / layout.blockHeight;
    const fitScale = clamp(Math.min(scaleX, scaleY) || 1, MIN_SCALE, MAX_SCALE);
    updateViewState({ scale: fitScale, offsetX: 0, offsetY: 0, rotation: 0 });
  }, [layout.blockHeight, layout.blockWidth, updateViewState]);

  useEffect(() => {
    onRegisterReset(resetView);
    return () => {
      onRegisterReset(null);
    };
  }, [onRegisterReset, resetView]);

  const samplePixelValue = useCallback(
    (sliceX: number, sliceY: number): HoveredIntensityInfo | null => {
      if (!sliceData || !sliceData.hasLayer) {
        return null;
      }

      const samples: Array<{
        values: number[];
        type: VolumeDataType;
        label: string | null;
        color: string;
      }> = [];

      for (const layer of layers) {
        const volume = layer.volume;
        if (!volume || !layer.visible) {
          continue;
        }
        if (volume.width !== sliceData.width || volume.height !== sliceData.height) {
          continue;
        }
        if (volume.depth <= 0) {
          continue;
        }

        const channels = Math.max(1, volume.channels);
        const offsetX = layer.offsetX ?? 0;
        const offsetY = layer.offsetY ?? 0;
        const sampleX = sliceX - offsetX;
        const sampleY = sliceY - offsetY;

        const slice = clamp(clampedSliceIndex, 0, Math.max(0, volume.depth - 1));

        const channelLabel = layer.channelName?.trim() || layer.label?.trim() || null;
        const channelColor = layer.color;

        if (layer.isSegmentation && volume.segmentationLabels) {
          if (projectionMode !== 'none') {
            const labelCounts = new Map<number, number>();
            for (let z = 0; z < volume.depth; z += 1) {
              const labelValue = sampleSegmentationLabel2d(volume, sampleX, sampleY, z);
              if (labelValue !== null) {
                labelCounts.set(labelValue, (labelCounts.get(labelValue) ?? 0) + 1);
              }
            }

            let dominantLabel: number | null = null;
            let dominantCount = 0;

            for (const [label, count] of labelCounts) {
              if (count > dominantCount) {
                dominantLabel = label;
                dominantCount = count;
              }
            }

            if (dominantLabel !== null) {
              samples.push({
                values: [dominantLabel],
                type: volume.dataType,
                label: channelLabel,
                color: channelColor
              });
            }
          } else {
            const labelValue = sampleSegmentationLabel2d(volume, sampleX, sampleY, slice);
            if (labelValue !== null) {
              samples.push({
                values: [labelValue],
                type: volume.dataType,
                label: channelLabel,
                color: channelColor
              });
            }
          }
          continue;
        }

        const normalizedValues = new Array<number>(channels);
        const channelValues: number[] = [];

        if (projectionMode !== 'none') {
          const accumulator = new Array<number>(channels);
          initializeProjectionAccumulator(projectionMode, accumulator);

          for (let z = 0; z < volume.depth; z += 1) {
            sampleVolumeChannels(volume, sampleX, sampleY, z, channels, normalizedValues);
            accumulateProjectionSample(projectionMode, accumulator, normalizedValues);
          }
          finalizeProjectionAccumulator(projectionMode, volume.depth, accumulator);

          for (let channelIndex = 0; channelIndex < channels; channelIndex += 1) {
            channelValues.push(denormalizeValue(accumulator[channelIndex], volume));
          }
        } else {
          sampleVolumeChannels(volume, sampleX, sampleY, slice, channels, normalizedValues);
          for (let channelIndex = 0; channelIndex < channels; channelIndex += 1) {
            channelValues.push(denormalizeValue(normalizedValues[channelIndex], volume));
          }
        }

        samples.push({
          values: channelValues,
          type: volume.dataType,
          label: channelLabel,
          color: channelColor
        });
      }

      const totalValues = samples.reduce((sum, sample) => sum + sample.values.length, 0);
      if (totalValues === 0) {
        return null;
      }

      const includeLabel = totalValues > 1;
      const parts = samples.flatMap((sample) =>
        formatChannelValuesDetailed(sample.values, sample.type, sample.label, includeLabel).map((entry) => ({
          text: entry.text,
          color: sample.color,
        })),
      );

      if (parts.length === 0) {
        return null;
      }

      return {
        intensity: parts.map((entry) => entry.text).join(' · '),
        components: parts.map((entry) => ({ text: entry.text, color: entry.color })),
      };
    },
    [clampedSliceIndex, layers, projectionMode, sliceData]
  );

  const trackRenderData = useMemo(() => {
    if (!primaryVolume) {
      return [] as TrackRenderEntry[];
    }

    const width = primaryVolume.width;
    const height = primaryVolume.height;
    const centerX = width / 2 - 0.5;
    const centerY = height / 2 - 0.5;
    const centerZ = primaryVolume.depth > 0 ? primaryVolume.depth / 2 - 0.5 : 0;
    const maxVisibleTime = clampedTimeIndex;

    return tracks
      .map<TrackRenderEntry | null>((track) => {
        if (track.points.length === 0) {
          return null;
        }

        const offset = channelTrackOffsets[track.channelId] ?? { x: 0, y: 0 };
        const scaledOffsetX = offset.x * trackScaleX;
        const scaledOffsetY = offset.y * trackScaleY;
        const baseColor = getColorComponents(resolveTrackHexColor(track));
        const highlightColor = mixWithWhite(baseColor, TRACK_HIGHLIGHT_BOOST);

        const visiblePoints: { x: number; y: number; z: number }[] = [];
        for (const point of track.points) {
          if (point.time - maxVisibleTime > TRACK_EPSILON) {
            break;
          }
          const resolvedZ = Number.isFinite(point.z) ? point.z : 0;
          visiblePoints.push({
            x: point.x * trackScaleX + scaledOffsetX - centerX,
            y: point.y * trackScaleY + scaledOffsetY - centerY,
            z: resolvedZ * trackScaleZ - centerZ
          });
        }

        if (visiblePoints.length === 0) {
          return null;
        }

        return {
          id: track.id,
          channelId: track.channelId,
          channelName: track.channelName,
          trackNumber: track.trackNumber,
          points: visiblePoints,
          baseColor,
          highlightColor
        };
      })
      .filter((entry): entry is TrackRenderEntry => entry !== null);
  }, [
    channelTrackColorModes,
    channelTrackOffsets,
    clampedTimeIndex,
    primaryVolume,
    resolveTrackHexColor,
    trackScaleX,
    trackScaleY,
    trackScaleZ,
    tracks
  ]);

  const emitHoverVoxel = useCallback(
    (value: HoveredVoxelInfo | null) => {
      onHoverVoxelChange?.(value);
    },
    [onHoverVoxelChange]
  );

  const updateHoveredPixel = useCallback((value: { x: number; y: number } | null) => {
    const previous = hoveredPixelRef.current;
    if (
      (previous === null && value === null) ||
      (previous && value && previous.x === value.x && previous.y === value.y)
    ) {
      return;
    }

    hoveredPixelRef.current = value;
    setHoveredPixel(value);
  }, []);

  const clearPixelInfo = useCallback(() => {
    updateHoveredPixel(null);
    emitHoverVoxel(null);
  }, [emitHoverVoxel, updateHoveredPixel]);

  const updatePixelHover = useCallback(
    (event: PointerEvent) => {
      if (!sliceData || !sliceData.hasLayer || !layout.xy) {
        clearPixelInfo();
        return;
      }

      const canvas = canvasRef.current;
      if (!canvas) {
        clearPixelInfo();
        return;
      }

      const rect = canvas.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;
      if (width <= 0 || height <= 0) {
        clearPixelInfo();
        return;
      }

      const pointerX = event.clientX - rect.left;
      const pointerY = event.clientY - rect.top;
      if (pointerX < 0 || pointerY < 0 || pointerX > width || pointerY > height) {
        clearPixelInfo();
        return;
      }

      const currentView = viewStateRef.current;
      const scale = Math.max(currentView.scale, 1e-6);
      const rotation = currentView.rotation;
      const cos = Math.cos(rotation);
      const sin = Math.sin(rotation);
      const centerX = width / 2 + currentView.offsetX;
      const centerY = height / 2 + currentView.offsetY;
      const dx = pointerX - centerX;
      const dy = pointerY - centerY;
      const rotatedX = dx * cos + dy * sin;
      const rotatedY = -dx * sin + dy * cos;
      const blockX = rotatedX / scale + layout.blockWidth / 2;
      const blockY = rotatedY / scale + layout.blockHeight / 2;

      const xyView = layout.xy;
      if (
        !xyView ||
        blockX < xyView.originX ||
        blockY < xyView.originY ||
        blockX >= xyView.originX + xyView.width ||
        blockY >= xyView.originY + xyView.height
      ) {
        clearPixelInfo();
        return;
      }

      const sliceX = blockX - xyView.originX;
      const sliceY = blockY - xyView.originY;

      const intensity = samplePixelValue(sliceX, sliceY);
      if (!intensity) {
        clearPixelInfo();
        return;
      }

      const voxelX = Math.round(clamp(sliceX, 0, Math.max(0, sliceData.width - 1)));
      const voxelY = Math.round(clamp(sliceY, 0, Math.max(0, sliceData.height - 1)));
      updateHoveredPixel({ x: voxelX, y: voxelY });
      const hoveredZ = projectionMode === 'none' ? clampedSliceIndex : 0;
      emitHoverVoxel({
        intensity: intensity.intensity,
        components: intensity.components,
        coordinates: {
          x: voxelX,
          y: voxelY,
          z: hoveredZ
        }
      });
    },
    [
      clampedSliceIndex,
      clearPixelInfo,
      emitHoverVoxel,
      projectionMode,
      samplePixelValue,
      sliceData,
      layout,
      updateHoveredPixel
    ]
  );

  useEffect(() => {
    return () => {
      emitHoverVoxel(null);
    };
  }, [emitHoverVoxel]);

  const computeTrackCentroid = useCallback(
    (trackId: string, targetTimeIndex: number) => {
      const track = trackLookup.get(trackId);
      if (!track || track.points.length === 0) {
        return null;
      }

      const maxVisibleTime = targetTimeIndex + 1;
      let latestTime = -Infinity;
      let count = 0;
      let sumX = 0;
      let sumY = 0;
      let sumZ = 0;
      const offset = channelTrackOffsets[track.channelId] ?? { x: 0, y: 0 };
      const scaledOffsetX = offset.x * trackScaleX;
      const scaledOffsetY = offset.y * trackScaleY;

      for (const point of track.points) {
        if (point.time - maxVisibleTime > TRACK_EPSILON) {
          break;
        }

        if (point.time > latestTime + TRACK_EPSILON) {
          latestTime = point.time;
          count = 1;
          sumX = point.x * trackScaleX + scaledOffsetX;
          sumY = point.y * trackScaleY + scaledOffsetY;
          sumZ = (Number.isFinite(point.z) ? point.z : 0) * trackScaleZ;
        } else if (Math.abs(point.time - latestTime) <= TRACK_EPSILON) {
          count += 1;
          sumX += point.x * trackScaleX + scaledOffsetX;
          sumY += point.y * trackScaleY + scaledOffsetY;
          sumZ += (Number.isFinite(point.z) ? point.z : 0) * trackScaleZ;
        }
      }

      if (count === 0) {
        return null;
      }

      return {
        x: sumX / count,
        y: sumY / count,
        z: sumZ / count
      };
    },
    [channelTrackOffsets, trackLookup, trackScaleX, trackScaleY, trackScaleZ]
  );

  const updateHoverState = useCallback(
    (trackId: string | null, position: { x: number; y: number } | null) => {
      if (hoveredTrackIdRef.current !== trackId) {
        hoveredTrackIdRef.current = trackId;
        setHoveredTrackId(trackId);
      }
      setTooltipPosition(position);
    },
    []
  );

  const clearHoverState = useCallback(() => {
    if (hoveredTrackIdRef.current !== null) {
      hoveredTrackIdRef.current = null;
      setHoveredTrackId(null);
    }
    setTooltipPosition(null);
  }, []);

  const orthogonalAnchor = useMemo(() => {
    if (!primaryVolume) {
      return null;
    }

    const fallbackAnchor = {
      x: Math.max(0, primaryVolume.width / 2 - 0.5),
      y: Math.max(0, primaryVolume.height / 2 - 0.5)
    };

    if (followedTrackId) {
      const centroid = computeTrackCentroid(followedTrackId, clampedTimeIndex);
      if (centroid) {
        return {
          x: clamp(centroid.x, 0, Math.max(0, primaryVolume.width - 1)),
          y: clamp(centroid.y, 0, Math.max(0, primaryVolume.height - 1))
        };
      }
    }

    if (hoveredPixel) {
      return {
        x: clamp(hoveredPixel.x, 0, Math.max(0, primaryVolume.width - 1)),
        y: clamp(hoveredPixel.y, 0, Math.max(0, primaryVolume.height - 1))
      };
    }

    return fallbackAnchor;
  }, [clampedTimeIndex, computeTrackCentroid, followedTrackId, hoveredPixel, primaryVolume]);

  const xzSliceData = useMemo<SliceData | null>(() => {
    if (!primaryVolume || !orthogonalViewsEnabled || primaryVolume.depth <= 1) {
      return null;
    }

    const anchorY = orthogonalAnchor?.y ?? Math.max(0, primaryVolume.height / 2 - 0.5);
    const width = primaryVolume.width;
    const depth = primaryVolume.depth;

    return createSliceWithSampler(width, depth, layers, (layer) => {
      const volume = layer.volume;
      if (!volume || !layer.visible) {
        return null;
      }
      if (
        volume.width !== primaryVolume.width ||
        volume.height !== primaryVolume.height ||
        volume.depth !== primaryVolume.depth
      ) {
        return null;
      }

      const channels = Math.max(1, volume.channels);
      const sliceStride = volume.width * volume.height * channels;
      const rowStride = volume.width * channels;
      const offsetX = layer.offsetX ?? 0;
      const offsetY = layer.offsetY ?? 0;
      const values = new Array<number>(channels);

      if (projectionMode !== 'none') {
        const accumulator = new Array<number>(channels);

        return (x, z) => {
          const clampedZ = Math.round(clamp(z, 0, volume.depth - 1));
          const sampleX = x - offsetX;

          initializeProjectionAccumulator(projectionMode, accumulator);
          for (let y = 0; y < volume.height; y += 1) {
            const sampleY = y - offsetY;
            sampleVolumeChannels(volume, sampleX, sampleY, clampedZ, channels, values);
            accumulateProjectionSample(projectionMode, accumulator, values);
          }
          finalizeProjectionAccumulator(projectionMode, volume.height, accumulator);

          return accumulator;
        };
      }

      return (x, z) => {
        const clampedZ = Math.round(clamp(z, 0, volume.depth - 1));
        const sliceOffset = clampedZ * sliceStride;
        const sampleX = x - offsetX;
        const sampleY = anchorY - offsetY;

        const clampedX = clamp(sampleX, 0, volume.width - 1);
        const clampedY = clamp(sampleY, 0, volume.height - 1);
        const leftX = Math.floor(clampedX);
        const rightX = Math.min(volume.width - 1, leftX + 1);
        const topY = Math.floor(clampedY);
        const bottomY = Math.min(volume.height - 1, topY + 1);
        const tX = clampedX - leftX;
        const tY = clampedY - topY;

        const topRowOffset = sliceOffset + topY * rowStride;
        const bottomRowOffset = sliceOffset + bottomY * rowStride;

        const topLeftOffset = topRowOffset + leftX * channels;
        const topRightOffset = topRowOffset + rightX * channels;
        const bottomLeftOffset = bottomRowOffset + leftX * channels;
        const bottomRightOffset = bottomRowOffset + rightX * channels;

        const weightTopLeft = (1 - tX) * (1 - tY);
        const weightTopRight = tX * (1 - tY);
        const weightBottomLeft = (1 - tX) * tY;
        const weightBottomRight = tX * tY;

        for (let channelIndex = 0; channelIndex < channels; channelIndex += 1) {
          values[channelIndex] =
            (volume.normalized[topLeftOffset + channelIndex] ?? 0) * weightTopLeft +
            (volume.normalized[topRightOffset + channelIndex] ?? 0) * weightTopRight +
            (volume.normalized[bottomLeftOffset + channelIndex] ?? 0) * weightBottomLeft +
            (volume.normalized[bottomRightOffset + channelIndex] ?? 0) * weightBottomRight;
        }

        return values;
      };
    });
  }, [layers, orthogonalAnchor, orthogonalViewsEnabled, primaryVolume, projectionMode]);

  const zySliceData = useMemo<SliceData | null>(() => {
    if (!primaryVolume || !orthogonalViewsEnabled || primaryVolume.depth <= 1) {
      return null;
    }

    const anchorX = orthogonalAnchor?.x ?? Math.max(0, primaryVolume.width / 2 - 0.5);
    const height = primaryVolume.height;
    const depth = primaryVolume.depth;

    return createSliceWithSampler(depth, height, layers, (layer) => {
      const volume = layer.volume;
      if (!volume || !layer.visible) {
        return null;
      }
      if (
        volume.width !== primaryVolume.width ||
        volume.height !== primaryVolume.height ||
        volume.depth !== primaryVolume.depth
      ) {
        return null;
      }

      const channels = Math.max(1, volume.channels);
      const sliceStride = volume.width * volume.height * channels;
      const rowStride = volume.width * channels;
      const offsetX = layer.offsetX ?? 0;
      const offsetY = layer.offsetY ?? 0;
      const values = new Array<number>(channels);

      if (projectionMode !== 'none') {
        const accumulator = new Array<number>(channels);

        return (z, y) => {
          const clampedZ = Math.round(clamp(z, 0, volume.depth - 1));
          const sampleY = y - offsetY;

          initializeProjectionAccumulator(projectionMode, accumulator);
          for (let x = 0; x < volume.width; x += 1) {
            const sampleX = x - offsetX;
            sampleVolumeChannels(volume, sampleX, sampleY, clampedZ, channels, values);
            accumulateProjectionSample(projectionMode, accumulator, values);
          }
          finalizeProjectionAccumulator(projectionMode, volume.width, accumulator);

          return accumulator;
        };
      }

      return (z, y) => {
        const clampedZ = Math.round(clamp(z, 0, volume.depth - 1));
        const sliceOffset = clampedZ * sliceStride;
        const sampleX = anchorX - offsetX;
        const sampleY = y - offsetY;

        const clampedX = clamp(sampleX, 0, volume.width - 1);
        const clampedY = clamp(sampleY, 0, volume.height - 1);
        const leftX = Math.floor(clampedX);
        const rightX = Math.min(volume.width - 1, leftX + 1);
        const topY = Math.floor(clampedY);
        const bottomY = Math.min(volume.height - 1, topY + 1);
        const tX = clampedX - leftX;
        const tY = clampedY - topY;

        const topRowOffset = sliceOffset + topY * rowStride;
        const bottomRowOffset = sliceOffset + bottomY * rowStride;

        const topLeftOffset = topRowOffset + leftX * channels;
        const topRightOffset = topRowOffset + rightX * channels;
        const bottomLeftOffset = bottomRowOffset + leftX * channels;
        const bottomRightOffset = bottomRowOffset + rightX * channels;

        const weightTopLeft = (1 - tX) * (1 - tY);
        const weightTopRight = tX * (1 - tY);
        const weightBottomLeft = (1 - tX) * tY;
        const weightBottomRight = tX * tY;

        for (let channelIndex = 0; channelIndex < channels; channelIndex += 1) {
          values[channelIndex] =
            (volume.normalized[topLeftOffset + channelIndex] ?? 0) * weightTopLeft +
            (volume.normalized[topRightOffset + channelIndex] ?? 0) * weightTopRight +
            (volume.normalized[bottomLeftOffset + channelIndex] ?? 0) * weightBottomLeft +
            (volume.normalized[bottomRightOffset + channelIndex] ?? 0) * weightBottomRight;
        }

        return values;
      };
    });
  }, [layers, orthogonalAnchor, orthogonalViewsEnabled, primaryVolume, projectionMode]);

  const drawSlice = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }

    const xyCanvas = xyCanvasRef.current;
    const dpr = window.devicePixelRatio || 1;
    const width = canvasSize.width;
    const height = canvasSize.height;

    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);

    if (!layout.xy || !xyCanvas || layout.blockWidth <= 0 || layout.blockHeight <= 0) {
      return;
    }

    const xzCanvas = layout.xz && xzSliceData ? xzCanvasRef.current : null;
    const zyCanvas = layout.zy && zySliceData ? zyCanvasRef.current : null;
    context.save();
    context.imageSmoothingEnabled = false;
    const centerX = width / 2 + viewState.offsetX;
    const centerY = height / 2 + viewState.offsetY;
    context.translate(centerX, centerY);
    context.rotate(viewState.rotation);
    context.scale(viewState.scale, viewState.scale);

    const originX = -layout.blockWidth / 2;
    const originY = -layout.blockHeight / 2;
    const xyCenterX = originX + layout.xy.centerX;
    const xyCenterY = originY + layout.xy.centerY;
    const normalizedScale = Math.max(viewState.scale, 1e-6);
    const inverseScale = 1 / normalizedScale;

    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const blinkPhase = (now % SELECTED_TRACK_BLINK_PERIOD_MS) / SELECTED_TRACK_BLINK_PERIOD_MS;
    const blinkScale =
      SELECTED_TRACK_BLINK_BASE + SELECTED_TRACK_BLINK_RANGE * Math.sin(blinkPhase * Math.PI * 2);

    const drawTracksForView = (
      viewCenter: { x: number; y: number },
      projectPoint: (point: { x: number; y: number; z: number }) => { x: number; y: number }
    ) => {
      if (trackRenderData.length === 0) {
        return;
      }

      for (const track of trackRenderData) {
        const isFollowed = followedTrackId === track.id;
        const isSelected = selectedTrackIds.has(track.id);
        const isExplicitlyVisible = trackVisibility[track.id] ?? true;
        const shouldShow = isFollowed || isSelected || isExplicitlyVisible;
        if (!shouldShow) {
          continue;
        }

        const points = track.points;
        if (points.length === 0) {
          continue;
        }

        const channelOpacity = trackOpacityByChannel[track.channelId] ?? DEFAULT_TRACK_OPACITY;
        const sanitizedOpacity = Math.min(1, Math.max(0, channelOpacity));
        const opacityBoost = isFollowed || isSelected ? 0.15 : 0;
        const targetOpacity = Math.min(1, sanitizedOpacity + opacityBoost);

        const channelLineWidth = trackLineWidthByChannel[track.channelId] ?? DEFAULT_TRACK_LINE_WIDTH;
        const sanitizedLineWidth = Math.max(0.1, Math.min(10, channelLineWidth));
        const baseLineWidth = sanitizedLineWidth / normalizedScale;
        const outlineWidthBoost = Math.max(sanitizedLineWidth * 0.75, OUTLINE_MIN_WIDTH) / normalizedScale;
        let widthMultiplier = 1;
        if (isFollowed) {
          widthMultiplier = Math.max(widthMultiplier, FOLLOWED_TRACK_LINE_WIDTH_MULTIPLIER);
        }
        if (isSelected) {
          widthMultiplier = Math.max(widthMultiplier, SELECTED_TRACK_LINE_WIDTH_MULTIPLIER);
        }
        const strokeWidth = Math.max(0.1, baseLineWidth * widthMultiplier);
        const strokeColor = isFollowed || isSelected ? track.highlightColor : track.baseColor;
        const blinkMultiplier = isSelected ? blinkScale : 1;

        const projectedPoints = points.map(projectPoint);

        if (projectedPoints.length >= 2 && (isFollowed || isSelected)) {
          context.save();
          context.lineCap = 'round';
          context.lineJoin = 'round';
          context.globalAlpha = Math.min(1, targetOpacity * OUTLINE_OPACITY * blinkMultiplier);
          context.strokeStyle = 'rgb(255, 255, 255)';
          context.lineWidth = strokeWidth + outlineWidthBoost;
          context.beginPath();
          context.moveTo(viewCenter.x + projectedPoints[0].x, viewCenter.y + projectedPoints[0].y);
          for (let i = 1; i < projectedPoints.length; i++) {
            context.lineTo(viewCenter.x + projectedPoints[i].x, viewCenter.y + projectedPoints[i].y);
          }
          context.stroke();
          context.restore();
        }

        if (projectedPoints.length >= 2) {
          context.save();
          context.lineCap = 'round';
          context.lineJoin = 'round';
          context.globalAlpha = targetOpacity * blinkMultiplier;
          context.strokeStyle = componentsToCss(strokeColor);
          context.lineWidth = strokeWidth;
          context.beginPath();
          context.moveTo(viewCenter.x + projectedPoints[0].x, viewCenter.y + projectedPoints[0].y);
          for (let i = 1; i < projectedPoints.length; i++) {
            context.lineTo(viewCenter.x + projectedPoints[i].x, viewCenter.y + projectedPoints[i].y);
          }
          context.stroke();
          context.restore();
        }

        const endPoint = projectedPoints[projectedPoints.length - 1];
        const pointRadius = Math.max(strokeWidth * 0.6, 1.2 / normalizedScale);
        context.save();
        context.globalAlpha = targetOpacity * blinkMultiplier;
        context.fillStyle = componentsToCss(strokeColor);
        context.beginPath();
        context.arc(viewCenter.x + endPoint.x, viewCenter.y + endPoint.y, pointRadius, 0, Math.PI * 2);
        context.fill();
        context.restore();
      }
    };

    context.drawImage(xyCanvas, originX + layout.xy.originX, originY + layout.xy.originY);
    drawTracksForView(
      { x: xyCenterX, y: xyCenterY },
      (point) => ({ x: point.x, y: point.y })
    );

    if (layout.zy && zyCanvas) {
      const zyCenterX = originX + layout.zy.centerX;
      const zyCenterY = originY + layout.zy.centerY;
      context.drawImage(zyCanvas, originX + layout.zy.originX, originY + layout.zy.originY);
      drawTracksForView(
        { x: zyCenterX, y: zyCenterY },
        (point) => ({ x: point.z, y: point.y })
      );
    }

    if (layout.xz && xzCanvas) {
      const xzCenterX = originX + layout.xz.centerX;
      const xzCenterY = originY + layout.xz.centerY;
      context.drawImage(xzCanvas, originX + layout.xz.originX, originY + layout.xz.originY);
      drawTracksForView(
        { x: xzCenterX, y: xzCenterY },
        (point) => ({ x: point.x, y: point.z })
      );
    }

    if (hoveredPixel && xyCanvas) {
      const pixelX = hoveredPixel.x - xyCanvas.width / 2;
      const pixelY = hoveredPixel.y - xyCanvas.height / 2;
      const baseStrokeWidth = inverseScale;

      context.save();
      context.globalAlpha = Math.min(1, 0.8 * blinkScale);
      context.fillStyle = 'rgba(255, 255, 255, 0.2)';
      context.fillRect(xyCenterX + pixelX, xyCenterY + pixelY, 1, 1);
      context.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      context.lineWidth = baseStrokeWidth;
      context.strokeRect(xyCenterX + pixelX, xyCenterY + pixelY, 1, 1);
      context.restore();
    }

    context.restore();
  }, [
    canvasSize,
    followedTrackId,
    hoveredPixel,
    layout,
    trackLineWidthByChannel,
    trackOpacityByChannel,
    trackRenderData,
    trackVisibility,
    selectedTrackIds,
    viewState,
    xzSliceData,
    zySliceData
  ]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    let frameId: number | null = null;
    let isRunning = true;

    const animate = () => {
      if (!isRunning) {
        return;
      }
      drawSlice();
      frameId = window.requestAnimationFrame(animate);
    };

    const shouldAnimate = selectedTrackIds.size > 0 || hoveredPixel !== null;
    if (shouldAnimate) {
      frameId = window.requestAnimationFrame(animate);
    }

    return () => {
      isRunning = false;
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [drawSlice, hoveredPixel, selectedTrackIds]);

  const performTrackHitTest = useCallback(
    (event: PointerEvent): TrackHitTestResult => {
      if (trackRenderData.length === 0) {
        return { trackId: null, pointer: null };
      }

      const canvas = canvasRef.current;
      if (!canvas) {
        return { trackId: null, pointer: null };
      }

      const rect = canvas.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;
      if (width <= 0 || height <= 0) {
        return { trackId: null, pointer: null };
      }

      if (!layout.xy || layout.blockWidth <= 0 || layout.blockHeight <= 0) {
        return { trackId: null, pointer: null };
      }

      const pointerX = event.clientX - rect.left;
      const pointerY = event.clientY - rect.top;
      if (pointerX < 0 || pointerY < 0 || pointerX > width || pointerY > height) {
        return { trackId: null, pointer: null };
      }

      const currentView = viewStateRef.current;
      const scale = currentView.scale;
      const rotation = currentView.rotation;
      const cos = Math.cos(rotation);
      const sin = Math.sin(rotation);
      const centerX = width / 2 + currentView.offsetX;
      const centerY = height / 2 + currentView.offsetY;
      const halfBlockWidth = layout.blockWidth / 2;
      const halfBlockHeight = layout.blockHeight / 2;
      const xyCenterX = layout.xy.centerX;
      const xyCenterY = layout.xy.centerY;

      let closestTrackId: string | null = null;
      let closestDistance = Infinity;

      const computeScreenPosition = (pointX: number, pointY: number) => {
        const blockX = xyCenterX + pointX;
        const blockY = xyCenterY + pointY;
        const relX = blockX - halfBlockWidth;
        const relY = blockY - halfBlockHeight;
        const rotatedX = relX * cos - relY * sin;
        const rotatedY = relX * sin + relY * cos;
        return {
          x: centerX + rotatedX * scale,
          y: centerY + rotatedY * scale
        };
      };

      const distanceToSegment = (
        px: number,
        py: number,
        x1: number,
        y1: number,
        x2: number,
        y2: number
      ) => {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const lengthSq = dx * dx + dy * dy;
        if (lengthSq < 1e-8) {
          return Math.hypot(px - x1, py - y1);
        }
        const t = clamp(((px - x1) * dx + (py - y1) * dy) / lengthSq, 0, 1);
        const projX = x1 + t * dx;
        const projY = y1 + t * dy;
        return Math.hypot(px - projX, py - projY);
      };

      for (const track of trackRenderData) {
        const isFollowed = followedTrackIdRef.current === track.id;
        const isExplicitlyVisible = trackVisibility[track.id] ?? true;
        const isSelected = selectedTrackIdsRef.current.has(track.id);
        if (!isFollowed && !isExplicitlyVisible && !isSelected) {
          continue;
        }

        let minDistanceForTrack = Infinity;
        let previousPoint: { x: number; y: number } | null = null;

        for (const point of track.points) {
          const screenPoint = computeScreenPosition(point.x, point.y);
          const pointDistance = Math.hypot(screenPoint.x - pointerX, screenPoint.y - pointerY);
          if (pointDistance < minDistanceForTrack) {
            minDistanceForTrack = pointDistance;
          }

          if (previousPoint) {
            const segmentDistance = distanceToSegment(
              pointerX,
              pointerY,
              previousPoint.x,
              previousPoint.y,
              screenPoint.x,
              screenPoint.y
            );
            if (segmentDistance < minDistanceForTrack) {
              minDistanceForTrack = segmentDistance;
            }
          }

          previousPoint = screenPoint;
        }

        if (!isFinite(minDistanceForTrack)) {
          continue;
        }

        const channelLineWidth = trackLineWidthByChannel[track.channelId] ?? DEFAULT_TRACK_LINE_WIDTH;
        const sanitizedLineWidth = Math.max(0.1, Math.min(10, channelLineWidth));
        let widthMultiplier = 1;
        if (isFollowed) {
          widthMultiplier = Math.max(widthMultiplier, FOLLOWED_TRACK_LINE_WIDTH_MULTIPLIER);
        }
        if (isSelected) {
          widthMultiplier = Math.max(widthMultiplier, SELECTED_TRACK_LINE_WIDTH_MULTIPLIER);
        }
        const strokeScreenWidth = Math.max(0.1, (sanitizedLineWidth / scale) * widthMultiplier);
        const endpointRadius = Math.max(strokeScreenWidth * 0.6, 1.2 / scale);
        const hitThreshold = Math.max(
          TRACK_HIT_TEST_MIN_DISTANCE,
          strokeScreenWidth * 0.75,
          endpointRadius
        );

        if (minDistanceForTrack <= hitThreshold && minDistanceForTrack < closestDistance) {
          closestDistance = minDistanceForTrack;
          closestTrackId = track.id;
        }
      }

      if (closestTrackId === null) {
        return { trackId: null, pointer: null };
      }

      return { trackId: closestTrackId, pointer: { x: pointerX, y: pointerY } };
    },
    [layout, trackLineWidthByChannel, trackRenderData, trackVisibility]
  );

  useEffect(() => {
    if (hoveredTrackId === null) {
      return;
    }

    const stillPresent = trackRenderData.some((track) => track.id === hoveredTrackId);
    if (!stillPresent) {
      clearHoverState();
    }
  }, [clearHoverState, hoveredTrackId, trackRenderData]);

  useEffect(() => {
    if (hoveredTrackId === null) {
      return;
    }

    const isExplicitlyVisible = trackVisibility[hoveredTrackId] ?? true;
    const isFollowed = followedTrackId === hoveredTrackId;
    if (!isExplicitlyVisible && !isFollowed) {
      clearHoverState();
    }
  }, [clearHoverState, followedTrackId, hoveredTrackId, trackVisibility]);

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
    const updatedXY = updateOffscreenCanvas(sliceData, xyCanvasRef, xyContextRef);
    const updatedXZ = updateOffscreenCanvas(xzSliceData, xzCanvasRef, xzContextRef);
    const updatedZY = updateOffscreenCanvas(zySliceData, zyCanvasRef, zyContextRef);

    if (updatedXY || updatedXZ || updatedZY) {
      setSliceRevision((value) => value + 1);
    }
  }, [drawSlice, sliceData, xzSliceData, zySliceData]);

  useEffect(() => {
    if (!sliceData || !sliceData.hasLayer) {
      updateHoveredPixel(null);
      emitHoverVoxel(null);
    }
  }, [emitHoverVoxel, sliceData, updateHoveredPixel]);

  useEffect(() => {
    if (needsAutoFitRef.current) {
      needsAutoFitRef.current = false;
      resetView();
    }
  }, [canvasSize, layout.blockHeight, layout.blockWidth, resetView, sliceRevision]);

  useEffect(() => {
    drawSlice();
  }, [drawSlice, sliceRevision]);

  useEffect(() => {
    if (followedTrackId === null) {
      return;
    }
    if (projectionMode !== 'none') {
      return;
    }
    if (!primaryVolume) {
      return;
    }

    const centroid = computeTrackCentroid(followedTrackId, clampedTimeIndex);
    if (!centroid) {
      return;
    }

    const width = primaryVolume.width;
    const height = primaryVolume.height;
    const centerX = centroid.x - (width / 2 - 0.5);
    const centerY = centroid.y - (height / 2 - 0.5);
    const scale = viewStateRef.current.scale;
    const rotation = viewStateRef.current.rotation;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const scaledX = centerX * scale;
    const scaledY = centerY * scale;
    const rotatedX = scaledX * cos - scaledY * sin;
    const rotatedY = scaledX * sin + scaledY * cos;

    updateViewState((previous) => {
      const nextOffsetX = -rotatedX;
      const nextOffsetY = -rotatedY;
      if (
        Math.abs(previous.offsetX - nextOffsetX) < 1e-3 &&
        Math.abs(previous.offsetY - nextOffsetY) < 1e-3
      ) {
        return previous;
      }
      return { ...previous, offsetX: nextOffsetX, offsetY: nextOffsetY };
    });

    if (effectiveMaxSlices > 0) {
      const targetSlice = clamp(
        Math.round(centroid.z),
        0,
        Math.max(0, effectiveMaxSlices - 1)
      );
      if (targetSlice !== clampedSliceIndex) {
        onSliceIndexChange(targetSlice);
      }
    }
  }, [
    clampedSliceIndex,
    clampedTimeIndex,
    computeTrackCentroid,
    effectiveMaxSlices,
    followedTrackId,
    onSliceIndexChange,
    primaryVolume,
    projectionMode,
    updateViewState,
    viewState.rotation,
    viewState.scale
  ]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0) {
        return;
      }

      const { trackId, pointer } = performTrackHitTest(event);
      if (trackId !== null) {
        pointerStateRef.current = null;
        onTrackSelectionToggle(trackId);
        if (pointer) {
          updateHoverState(trackId, pointer);
        }
        return;
      }

      const target = canvasRef.current;
      if (!target) {
        return;
      }
      const currentView = viewStateRef.current;
      pointerStateRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startOffsetX: currentView.offsetX,
        startOffsetY: currentView.offsetY
      };
      target.setPointerCapture(event.pointerId);
    };

    const handlePointerMove = (event: PointerEvent) => {
      const state = pointerStateRef.current;
      if (state && state.pointerId === event.pointerId) {
        const deltaX = event.clientX - state.startX;
        const deltaY = event.clientY - state.startY;
        const nextOffsetX = state.startOffsetX + deltaX;
        const nextOffsetY = state.startOffsetY + deltaY;
        updateViewState((previous) => {
          if (
            Math.abs(previous.offsetX - nextOffsetX) < 1e-3 &&
            Math.abs(previous.offsetY - nextOffsetY) < 1e-3
          ) {
            return previous;
          }
          return {
            ...previous,
            offsetX: nextOffsetX,
            offsetY: nextOffsetY
          };
        });
        clearHoverState();
        updatePixelHover(event);
        return;
      }

      const { trackId, pointer } = performTrackHitTest(event);
      if (trackId !== null && pointer) {
        updateHoverState(trackId, pointer);
      } else {
        clearHoverState();
      }
      updatePixelHover(event);
    };

    const handlePointerEnd = (event: PointerEvent) => {
      const state = pointerStateRef.current;
      if (state && state.pointerId === event.pointerId) {
        const target = canvasRef.current;
        if (target) {
          target.releasePointerCapture(event.pointerId);
        }
        pointerStateRef.current = null;
      }

      const { trackId, pointer } = performTrackHitTest(event);
      if (trackId !== null && pointer) {
        updateHoverState(trackId, pointer);
      } else {
        clearHoverState();
      }
      updatePixelHover(event);
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
  }, [
    clearHoverState,
    onTrackFollowRequest,
    performTrackHitTest,
    updateHoverState,
    updatePixelHover,
    updateViewState
  ]);

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
          if (projectionMode === 'none' && effectiveMaxSlices > 0) {
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
          if (projectionMode === 'none' && effectiveMaxSlices > 0) {
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
            rotation: previous.rotation - ROTATION_KEY_STEP
          }));
          event.preventDefault();
          break;
        }
        case 'KeyE': {
          updateViewState((previous) => ({
            ...previous,
            rotation: previous.rotation + ROTATION_KEY_STEP
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
  }, [clampedSliceIndex, effectiveMaxSlices, onSliceIndexChange, projectionMode, updateViewState]);

  const hoveredTrackDefinition = hoveredTrackId ? trackLookup.get(hoveredTrackId) ?? null : null;
  const hoveredTrackLabel = hoveredTrackDefinition
    ? `${hoveredTrackDefinition.channelName} · Track #${hoveredTrackDefinition.trackNumber}`
    : null;

  return (
    <div className="planar-viewer">
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
          {hoveredTrackLabel && tooltipPosition ? (
            <div
              className="track-tooltip"
              style={{ left: `${tooltipPosition.x}px`, top: `${tooltipPosition.y}px` }}
              role="status"
              aria-live="polite"
            >
              {hoveredTrackLabel}
            </div>
          ) : null}
          {(!sliceData || !sliceData.hasLayer) && !showLoadingOverlay ? (
            <div className="planar-empty-hint">
              {layers.length === 0
                ? 'Load a dataset to begin viewing slices.'
                : 'Enable a layer to view its XY slice.'}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

export default PlanarViewer;
