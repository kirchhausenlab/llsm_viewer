import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TrackColorMode, TrackDefinition } from '../types/tracks';
import { getTrackColorHex } from '../trackColors';
import type { NormalizedVolume } from '../volumeProcessing';
import type { VolumeDataType } from '../types/volume';
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

type HoveredPixelInfo = {
  text: string;
  position: { x: number; y: number };
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

function isIntegerDataType(type: VolumeDataType) {
  return type.startsWith('uint') || type.startsWith('int');
}

function denormalizeValue(value: number, volume: NormalizedVolume) {
  const ratio = value / 255;
  return volume.min + ratio * (volume.max - volume.min);
}

function formatIntensityValue(value: number, type: VolumeDataType) {
  if (!Number.isFinite(value)) {
    return 'N/A';
  }

  if (isIntegerDataType(type)) {
    return Math.round(value).toString();
  }

  const magnitude = Math.abs(value);
  if (magnitude >= 1000) {
    return value.toFixed(1);
  }
  if (magnitude >= 1) {
    return value.toFixed(3);
  }
  return value.toPrecision(4);
}

function formatChannelValues(
  values: number[],
  type: VolumeDataType,
  channelLabel: string | null,
  includeLabel: boolean
) {
  if (values.length === 0) {
    return [];
  }

  if (values.length === 1) {
    const prefix = includeLabel && channelLabel ? `${channelLabel} ` : '';
    return [`${prefix}${formatIntensityValue(values[0], type)}`.trim()];
  }

  return values.map((value, index) => {
    const prefix = includeLabel && channelLabel ? `${channelLabel} C${index + 1}` : `C${index + 1}`;
    return `${prefix} ${formatIntensityValue(value, type)}`;
  });
}

function createInitialViewState(): ViewState {
  return { scale: 1, offsetX: 0, offsetY: 0, rotation: 0 };
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
  tracks,
  trackVisibility,
  trackOpacityByChannel,
  trackLineWidthByChannel,
  channelTrackColorModes,
  channelTrackOffsets,
  selectedTrackIds,
  followedTrackId,
  onTrackSelectionToggle,
  onTrackFollowRequest
}: PlanarViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sliceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const offscreenContextRef = useRef<CanvasRenderingContext2D | null>(null);
  const previousSliceSizeRef = useRef<{ width: number; height: number } | null>(null);
  const needsAutoFitRef = useRef(false);
  const pointerStateRef = useRef<PointerState | null>(null);
  const followedTrackIdRef = useRef<string | null>(followedTrackId);
  const hoveredTrackIdRef = useRef<string | null>(null);
  const selectedTrackIdsRef = useRef<ReadonlySet<string>>(selectedTrackIds);

  const [hasMeasured, setHasMeasured] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [viewState, setViewState] = useState<ViewState>(() => createInitialViewState());
  const viewStateRef = useRef(viewState);
  const [sliceRevision, setSliceRevision] = useState(0);
  const [hoveredTrackId, setHoveredTrackId] = useState<string | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ x: number; y: number } | null>(null);
  const [hoveredPixelInfo, setHoveredPixelInfo] = useState<HoveredPixelInfo | null>(null);

  const effectiveMaxSlices = Math.max(0, maxSlices);
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
      const rowStride = width * channels;
      const data = volume.normalized;
      const invert = layer.invert ?? false;
      const windowMin = layer.windowMin ?? 0;
      const windowMax = layer.windowMax ?? 1;
      const windowRange = Math.max(windowMax - windowMin, WINDOW_EPSILON);
      const normalizeScalar = (value: number) =>
        clamp((value - windowMin) / windowRange, 0, 1);
      const applyWindow = (value: number) => {
        const normalized = normalizeScalar(value);
        return invert ? 1 - normalized : normalized;
      };
      const tint = channels === 1 ? getColor(layer.color) : null;

      const offsetX = layer.offsetX ?? 0;
      const offsetY = layer.offsetY ?? 0;
      const hasOffset = Math.abs(offsetX) > 1e-3 || Math.abs(offsetY) > 1e-3;

      for (let y = 0; y < height; y++) {
        const rowIndex = y * width;
        const rowSliceOffset = sliceOffset + rowIndex * channels;

        for (let x = 0; x < width; x++) {
          const pixelIndex = rowIndex + x;
          let sourceR = 0;
          let sourceG = 0;
          let sourceB = 0;
          let sourceA = 0;

          if (hasOffset) {
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

            const sampleChannel = (channelIndex: number) =>
              (data[topLeftOffset + channelIndex] ?? 0) * weightTopLeft +
              (data[topRightOffset + channelIndex] ?? 0) * weightTopRight +
              (data[bottomLeftOffset + channelIndex] ?? 0) * weightBottomLeft +
              (data[bottomRightOffset + channelIndex] ?? 0) * weightBottomRight;

            sourceR = sampleChannel(0);
            if (channels > 1) {
              sourceG = sampleChannel(1);
            } else {
              sourceG = sourceR;
            }
            if (channels > 2) {
              sourceB = sampleChannel(2);
            } else if (channels === 2) {
              sourceB = 0;
            } else {
              sourceB = sourceG;
            }
            if (channels > 3) {
              sourceA = sampleChannel(3);
            }
          } else {
            const pixelOffset = rowSliceOffset + x * channels;
            sourceR = data[pixelOffset] ?? 0;
            sourceG = channels > 1 ? data[pixelOffset + 1] ?? 0 : sourceR;
            sourceB = channels > 2 ? data[pixelOffset + 2] ?? 0 : sourceG;
            sourceA = channels > 3 ? data[pixelOffset + 3] ?? 0 : 0;
          }

          const r = sourceR / 255;
          const g = sourceG / 255;
          const b = sourceB / 255;
          const a = sourceA / 255;

          let channelR = r;
          let channelG = channels > 1 ? g : channelR;
          let channelB = channels > 2 ? b : channels === 2 ? 0 : channelG;
          const channelA = channels > 3 ? a : 0;

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
              channels > 2
                ? applyWindow(channelB)
                : channels === 2
                ? 0
                : normalizedG;
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
  }, [layers, primaryVolume, clampedSliceIndex]);

  const samplePixelValue = useCallback(
    (sliceX: number, sliceY: number) => {
      if (!sliceData || !sliceData.hasLayer) {
        return null;
      }

      const samples: Array<{ values: number[]; type: VolumeDataType; label: string | null }> = [];

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
        const slice = clamp(clampedSliceIndex, 0, Math.max(0, volume.depth - 1));
        const sliceStride = volume.width * volume.height * channels;
        const rowStride = volume.width * channels;
        const sliceOffset = slice * sliceStride;

        const offsetX = layer.offsetX ?? 0;
        const offsetY = layer.offsetY ?? 0;
        const sampleX = sliceX - offsetX;
        const sampleY = sliceY - offsetY;

        const clampedX = clamp(sampleX, 0, volume.width - 1);
        const clampedY = clamp(sampleY, 0, volume.height - 1);
        const leftX = Math.floor(clampedX);
        const rightX = Math.min(volume.width - 1, leftX + 1);
        const topY = Math.floor(clampedY);
        const bottomY = Math.min(volume.height - 1, topY + 1);
        const tX = clampedX - leftX;
        const tY = clampedY - topY;

        const weightTopLeft = (1 - tX) * (1 - tY);
        const weightTopRight = tX * (1 - tY);
        const weightBottomLeft = (1 - tX) * tY;
        const weightBottomRight = tX * tY;

        const topRowOffset = sliceOffset + topY * rowStride;
        const bottomRowOffset = sliceOffset + bottomY * rowStride;

        const sampleChannel = (channelIndex: number) => {
          const topLeftOffset = topRowOffset + leftX * channels + channelIndex;
          const topRightOffset = topRowOffset + rightX * channels + channelIndex;
          const bottomLeftOffset = bottomRowOffset + leftX * channels + channelIndex;
          const bottomRightOffset = bottomRowOffset + rightX * channels + channelIndex;
          return (
            (volume.normalized[topLeftOffset] ?? 0) * weightTopLeft +
            (volume.normalized[topRightOffset] ?? 0) * weightTopRight +
            (volume.normalized[bottomLeftOffset] ?? 0) * weightBottomLeft +
            (volume.normalized[bottomRightOffset] ?? 0) * weightBottomRight
          );
        };

        const channelValues: number[] = [];
        for (let channelIndex = 0; channelIndex < channels; channelIndex++) {
          channelValues.push(denormalizeValue(sampleChannel(channelIndex), volume));
        }

        const channelLabel = layer.channelName?.trim() || layer.label?.trim() || null;
        samples.push({ values: channelValues, type: volume.dataType, label: channelLabel });
      }

      const totalValues = samples.reduce((sum, sample) => sum + sample.values.length, 0);
      if (totalValues === 0) {
        return null;
      }

      const includeLabel = totalValues > 1;
      const parts = samples.flatMap((sample) =>
        formatChannelValues(sample.values, sample.type, sample.label, includeLabel)
      );

      if (parts.length === 0) {
        return null;
      }

      return parts.join(' · ');
    },
    [clampedSliceIndex, layers, sliceData]
  );

  const trackRenderData = useMemo(() => {
    if (!primaryVolume) {
      return [] as TrackRenderEntry[];
    }

    const width = primaryVolume.width;
    const height = primaryVolume.height;
    const centerX = width / 2 - 0.5;
    const centerY = height / 2 - 0.5;
    const maxVisibleTime = clampedTimeIndex;

    return tracks
      .map<TrackRenderEntry | null>((track) => {
        if (track.points.length === 0) {
          return null;
        }

        const offset = channelTrackOffsets[track.channelId] ?? { x: 0, y: 0 };
        const baseColor = getColorComponents(resolveTrackHexColor(track));
        const highlightColor = mixWithWhite(baseColor, TRACK_HIGHLIGHT_BOOST);

        const visiblePoints: { x: number; y: number; z: number }[] = [];
        for (const point of track.points) {
          if (point.time - maxVisibleTime > TRACK_EPSILON) {
            break;
          }
          visiblePoints.push({
            x: point.x + offset.x - centerX,
            y: point.y + offset.y - centerY,
            z: point.z
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
    tracks
  ]);

  const clearPixelInfo = useCallback(() => {
    setHoveredPixelInfo(null);
  }, []);

  const updatePixelHover = useCallback(
    (event: PointerEvent) => {
      if (!sliceData || !sliceData.hasLayer) {
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
      const sliceX = rotatedX / scale + sliceData.width / 2;
      const sliceY = rotatedY / scale + sliceData.height / 2;

      if (sliceX < 0 || sliceY < 0 || sliceX >= sliceData.width || sliceY >= sliceData.height) {
        clearPixelInfo();
        return;
      }

      const text = samplePixelValue(sliceX, sliceY);
      if (!text) {
        clearPixelInfo();
        return;
      }

      setHoveredPixelInfo({
        text,
        position: { x: pointerX, y: pointerY }
      });
    },
    [clearPixelInfo, samplePixelValue, sliceData]
  );

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

      for (const point of track.points) {
        if (point.time - maxVisibleTime > TRACK_EPSILON) {
          break;
        }

        if (point.time > latestTime + TRACK_EPSILON) {
          latestTime = point.time;
          count = 1;
          sumX = point.x + offset.x;
          sumY = point.y + offset.y;
          sumZ = point.z;
        } else if (Math.abs(point.time - latestTime) <= TRACK_EPSILON) {
          count += 1;
          sumX += point.x + offset.x;
          sumY += point.y + offset.y;
          sumZ += point.z;
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
    [channelTrackOffsets, trackLookup]
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

    if (trackRenderData.length > 0) {
      const scale = Math.max(viewState.scale, 1e-6);
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const blinkPhase = (now % SELECTED_TRACK_BLINK_PERIOD_MS) / SELECTED_TRACK_BLINK_PERIOD_MS;
      const blinkScale =
        SELECTED_TRACK_BLINK_BASE + SELECTED_TRACK_BLINK_RANGE * Math.sin(blinkPhase * Math.PI * 2);

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
        const baseLineWidth = sanitizedLineWidth / scale;
        const outlineWidthBoost = Math.max(sanitizedLineWidth * 0.75, OUTLINE_MIN_WIDTH) / scale;
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

        if (points.length >= 2 && (isFollowed || isSelected)) {
          context.save();
          context.lineCap = 'round';
          context.lineJoin = 'round';
          context.globalAlpha = Math.min(1, targetOpacity * OUTLINE_OPACITY * blinkMultiplier);
          context.strokeStyle = 'rgb(255, 255, 255)';
          context.lineWidth = strokeWidth + outlineWidthBoost;
          context.beginPath();
          context.moveTo(points[0].x, points[0].y);
          for (let i = 1; i < points.length; i++) {
            context.lineTo(points[i].x, points[i].y);
          }
          context.stroke();
          context.restore();
        }

        if (points.length >= 2) {
          context.save();
          context.lineCap = 'round';
          context.lineJoin = 'round';
          context.globalAlpha = targetOpacity * blinkMultiplier;
          context.strokeStyle = componentsToCss(strokeColor);
          context.lineWidth = strokeWidth;
          context.beginPath();
          context.moveTo(points[0].x, points[0].y);
          for (let i = 1; i < points.length; i++) {
            context.lineTo(points[i].x, points[i].y);
          }
          context.stroke();
          context.restore();
        }

        const endPoint = points[points.length - 1];
        const pointRadius = Math.max(strokeWidth * 0.6, 1.2 / scale);
        context.save();
        context.globalAlpha = targetOpacity * blinkMultiplier;
        context.fillStyle = componentsToCss(strokeColor);
        context.beginPath();
        context.arc(endPoint.x, endPoint.y, pointRadius, 0, Math.PI * 2);
        context.fill();
        context.restore();
      }
    }

    context.restore();
  }, [
    canvasSize.height,
    canvasSize.width,
    followedTrackId,
    trackLineWidthByChannel,
    trackOpacityByChannel,
    trackRenderData,
    trackVisibility,
    selectedTrackIds,
    viewState
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

    if (selectedTrackIds.size > 0) {
      frameId = window.requestAnimationFrame(animate);
    }

    return () => {
      isRunning = false;
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [drawSlice, selectedTrackIds]);

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

      let closestTrackId: string | null = null;
      let closestDistance = Infinity;

      const computeScreenPosition = (pointX: number, pointY: number) => {
        const rotatedX = pointX * cos - pointY * sin;
        const rotatedY = pointX * sin + pointY * cos;
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
    [trackLineWidthByChannel, trackRenderData, trackVisibility]
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
    if (!sliceData) {
      sliceCanvasRef.current = null;
      previousSliceSizeRef.current = null;
      drawSlice();
      return;
    }

    const { width, height, buffer } = sliceData;
    let offscreen = offscreenCanvasRef.current;
    if (!offscreen) {
      offscreen = document.createElement('canvas');
      offscreenCanvasRef.current = offscreen;
      offscreenContextRef.current = null;
    }

    if (offscreen.width !== width || offscreen.height !== height) {
      offscreen.width = width;
      offscreen.height = height;
      offscreenContextRef.current = null;
    }

    let context = offscreenContextRef.current;
    if (!context) {
      context = offscreen.getContext('2d');
      if (!context) {
        sliceCanvasRef.current = null;
        previousSliceSizeRef.current = null;
        drawSlice();
        return;
      }
      offscreenContextRef.current = context;
    }

    const image = new ImageData(buffer as unknown as ImageDataArray, width, height);
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
    if (!sliceData || !sliceData.hasLayer) {
      setHoveredPixelInfo(null);
    }
  }, [sliceData]);

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
    if (followedTrackId === null) {
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
  }, [clampedSliceIndex, effectiveMaxSlices, onSliceIndexChange, updateViewState]);

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
          {hoveredPixelInfo ? (
            <div
              className="intensity-tooltip"
              style={{ left: `${hoveredPixelInfo.position.x}px`, top: `${hoveredPixelInfo.position.y}px` }}
              role="status"
              aria-live="polite"
            >
              {hoveredPixelInfo.text}
            </div>
          ) : null}
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
