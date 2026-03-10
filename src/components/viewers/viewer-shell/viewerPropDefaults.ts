import type {
  ViewerProp,
  ViewerPropScalebarState,
  ViewerPropScreenState,
  ViewerPropTimestampUnits,
  ViewerPropVolumeDimensions,
  ViewerPropWorldState,
  ViewerPropTypeface,
} from '../../../types/viewerProps';
import type {
  TemporalResolutionMetadata,
  VoxelResolutionUnit,
  VoxelResolutionValues,
} from '../../../types/voxelResolution';

const VIEWER_PROP_ID_PREFIX = 'viewer-prop-';
export const DEFAULT_VIEWER_PROP_FONT_SIZE = 30;
const VIEWER_PROP_PHYSICAL_TIME_PRECISION = 6;
const VOXEL_RESOLUTION_TO_METERS: Record<VoxelResolutionUnit, number> = {
  Å: 1e-10,
  nm: 1e-9,
  μm: 1e-6,
  mm: 1e-3,
};

const clampPositive = (value: number, fallback: number) =>
  Number.isFinite(value) && value > 0 ? value : fallback;
const clampNonNegativeInteger = (value: number, fallback: number) =>
  Number.isFinite(value) ? Math.max(0, Math.round(value)) : fallback;
const areApproximatelyEqual = (left: number, right: number) => {
  const scale = Math.max(1, Math.abs(left), Math.abs(right));
  return Math.abs(left - right) <= scale * 1e-6;
};

export function resolveViewerPropTypefaceStack(typeface: ViewerPropTypeface): string {
  switch (typeface) {
    case 'Arial':
      return 'Arial, Helvetica, sans-serif';
    case 'Georgia':
      return 'Georgia, serif';
    case 'Times New Roman':
      return '"Times New Roman", Times, serif';
    case 'Verdana':
      return 'Verdana, Geneva, sans-serif';
    case 'Courier New':
      return '"Courier New", Courier, monospace';
    case 'Inter':
    default:
      return 'Inter, "Segoe UI", sans-serif';
  }
}

export function resolveViewerPropTimepointLimit(totalTimepoints: number): number {
  return Number.isFinite(totalTimepoints) && totalTimepoints > 0
    ? Math.max(1, Math.round(totalTimepoints))
    : 1;
}

export function clampViewerPropTimepoint(value: number, totalTimepoints: number): number {
  const limit = resolveViewerPropTimepointLimit(totalTimepoints);
  const resolvedValue = Number.isFinite(value) ? value : 1;
  return Math.min(limit, Math.max(1, Math.round(resolvedValue)));
}

export function normalizeViewerPropTimeRange(
  initialTimepoint: number,
  finalTimepoint: number,
  totalTimepoints: number
) {
  const nextInitialTimepoint = clampViewerPropTimepoint(initialTimepoint, totalTimepoints);
  const nextFinalTimepoint = clampViewerPropTimepoint(finalTimepoint, totalTimepoints);

  if (nextInitialTimepoint <= nextFinalTimepoint) {
    return {
      initialTimepoint: nextInitialTimepoint,
      finalTimepoint: nextFinalTimepoint,
    };
  }

  return {
    initialTimepoint: nextFinalTimepoint,
    finalTimepoint: nextInitialTimepoint,
  };
}

export function isViewerPropVisibleAtTimepoint(
  prop: Pick<ViewerProp, 'type' | 'initialTimepoint' | 'finalTimepoint'>,
  currentTimepoint: number,
  totalTimepoints: number
): boolean {
  if (prop.type === 'timestamp') {
    return true;
  }

  const normalizedRange = normalizeViewerPropTimeRange(
    prop.initialTimepoint,
    prop.finalTimepoint,
    totalTimepoints
  );
  const resolvedCurrentTimepoint = clampViewerPropTimepoint(currentTimepoint, totalTimepoints);
  return (
    resolvedCurrentTimepoint >= normalizedRange.initialTimepoint &&
    resolvedCurrentTimepoint <= normalizedRange.finalTimepoint
  );
}

function hasViewerPropPhysicalTimeMetadata(
  temporalResolution?: TemporalResolutionMetadata | null
): temporalResolution is TemporalResolutionMetadata {
  return Boolean(
    temporalResolution &&
      Number.isFinite(temporalResolution.interval) &&
      temporalResolution.interval > 0
  );
}

function formatViewerPropPhysicalTime(value: number): string {
  const roundedValue = Number(value.toFixed(VIEWER_PROP_PHYSICAL_TIME_PRECISION));
  return String(Object.is(roundedValue, -0) ? 0 : roundedValue);
}

export function resolveViewerPropTimestampUnits(
  timestampUnits: ViewerPropTimestampUnits,
  temporalResolution?: TemporalResolutionMetadata | null
): ViewerPropTimestampUnits {
  if (timestampUnits === 'physical' && hasViewerPropPhysicalTimeMetadata(temporalResolution)) {
    return 'physical';
  }
  return 'index';
}

export function resolveViewerPropDisplayText(
  prop: Pick<ViewerProp, 'type' | 'text' | 'timestampUnits' | 'scalebar'>,
  currentTimepoint: number,
  totalTimepoints: number,
  temporalResolution?: TemporalResolutionMetadata | null
): string {
  if (prop.type === 'scalebar') {
    return resolveViewerPropScalebarLabel(prop.scalebar);
  }

  if (prop.type !== 'timestamp') {
    return prop.text;
  }

  const resolvedCurrentTimepoint = clampViewerPropTimepoint(currentTimepoint, totalTimepoints);
  if (resolveViewerPropTimestampUnits(prop.timestampUnits, temporalResolution) !== 'physical') {
    return String(resolvedCurrentTimepoint);
  }

  const elapsedTime = (resolvedCurrentTimepoint - 1) * temporalResolution!.interval;
  return `${formatViewerPropPhysicalTime(elapsedTime)} ${temporalResolution!.unit}`;
}

export function buildDefaultViewerPropScalebarState(
  voxelResolution?: VoxelResolutionValues | null
): ViewerPropScalebarState {
  const defaultUnit = voxelResolution?.unit ?? 'μm';
  const defaultLength =
    voxelResolution && Number.isFinite(voxelResolution.x) && voxelResolution.x > 0
      ? Math.max(1, Math.round(voxelResolution.x * 15))
      : 10;
  return {
    axis: 'x',
    length: defaultLength,
    unit: defaultUnit,
    showText: true,
    textPlacement: 'below',
  };
}

export function resolveViewerPropScalebarLabel(
  scalebar: Pick<ViewerPropScalebarState, 'length' | 'unit'>
): string {
  return `${clampNonNegativeInteger(scalebar.length, 0)} ${scalebar.unit}`;
}

export function isViewerPropAnisotropic(
  voxelResolution?: VoxelResolutionValues | null
): boolean {
  if (
    !voxelResolution ||
    !Number.isFinite(voxelResolution.x) ||
    !Number.isFinite(voxelResolution.y) ||
    !Number.isFinite(voxelResolution.z) ||
    voxelResolution.x <= 0 ||
    voxelResolution.y <= 0 ||
    voxelResolution.z <= 0
  ) {
    return false;
  }

  return !(
    areApproximatelyEqual(voxelResolution.x, voxelResolution.y) &&
    areApproximatelyEqual(voxelResolution.y, voxelResolution.z)
  );
}

export function resolveViewerPropScalebarVoxelLength(
  scalebar: Pick<ViewerPropScalebarState, 'axis' | 'length' | 'unit'>,
  voxelResolution?: VoxelResolutionValues | null
): number {
  if (!voxelResolution) {
    return 0;
  }

  const requestedLength = clampNonNegativeInteger(scalebar.length, 0);
  const requestedScale = VOXEL_RESOLUTION_TO_METERS[scalebar.unit];
  const voxelScale = VOXEL_RESOLUTION_TO_METERS[voxelResolution.unit];
  const axisResolution = voxelResolution[scalebar.axis];
  if (
    requestedLength <= 0 ||
    !Number.isFinite(requestedScale) ||
    !Number.isFinite(voxelScale) ||
    !Number.isFinite(axisResolution) ||
    axisResolution <= 0
  ) {
    return 0;
  }

  const requestedLengthMeters = requestedLength * requestedScale;
  const axisVoxelSizeMeters = axisResolution * voxelScale;
  if (!(axisVoxelSizeMeters > 0)) {
    return 0;
  }

  const voxelLength = requestedLengthMeters / axisVoxelSizeMeters;
  return Number.isFinite(voxelLength) && voxelLength > 0
    ? Number(voxelLength.toFixed(VIEWER_PROP_PHYSICAL_TIME_PRECISION))
    : 0;
}

export function resolveViewerPropScalebarInfo(
  prop: Pick<ViewerProp, 'type' | 'scalebar'>,
  voxelResolution?: VoxelResolutionValues | null
) {
  if (prop.type !== 'scalebar') {
    return null;
  }

  const voxelLength = resolveViewerPropScalebarVoxelLength(prop.scalebar, voxelResolution);
  return {
    label: resolveViewerPropScalebarLabel(prop.scalebar),
    voxelLength,
    isRenderable: voxelLength >= 1,
    isAnisotropic: isViewerPropAnisotropic(voxelResolution),
  };
}

export function resolveViewerPropWorldAxisRange(
  volumeDimensions: ViewerPropVolumeDimensions,
  axis: 'x' | 'y' | 'z'
) {
  const baseDimension = Math.max(
    1,
    volumeDimensions[axis === 'x' ? 'width' : axis === 'y' ? 'height' : 'depth']
  );
  return {
    min: -baseDimension * 0.5,
    max: baseDimension * 1.5,
  };
}

export function inferViewerPropOrderIndex(propId: string): number {
  if (!propId.startsWith(VIEWER_PROP_ID_PREFIX)) {
    return 0;
  }

  const parsed = Number(propId.slice(VIEWER_PROP_ID_PREFIX.length));
  return Number.isInteger(parsed) && parsed > 0 ? parsed - 1 : 0;
}

export function buildDefaultViewerPropScreenState(): ViewerPropScreenState {
  return {
    x: 0.5,
    y: 0.5,
    rotation: 0,
    fontSize: DEFAULT_VIEWER_PROP_FONT_SIZE,
    flipX: false,
    flipY: false,
  };
}

export function buildDefaultViewerPropWorldState(
  orderIndex: number,
  volumeDimensions: ViewerPropVolumeDimensions
): ViewerPropWorldState {
  const width = clampPositive(volumeDimensions.width, 1);
  const height = clampPositive(volumeDimensions.height, 1);
  const depth = clampPositive(volumeDimensions.depth, 1);
  const centerX = width / 2 - 0.5;
  const centerY = height / 2 - 0.5;
  const centerZ = depth / 2 - 0.5;
  const offsetIndex = Math.max(0, orderIndex);

  return {
    x: centerX + offsetIndex * Math.max(2, width * 0.03),
    y: centerY + offsetIndex * Math.max(2, height * 0.03),
    z: centerZ,
    roll: 0,
    pitch: 0,
    yaw: 0,
    fontSize: DEFAULT_VIEWER_PROP_FONT_SIZE,
    flipX: false,
    flipY: true,
    flipZ: false,
    facingMode: 'fixed',
    occlusionMode: 'always-on-top',
    unitMode: 'voxel',
  };
}

export function buildViewerProp(
  id: string,
  labelNumber: number,
  orderIndex: number,
  volumeDimensions: ViewerPropVolumeDimensions,
  totalTimepoints: number,
  voxelResolution?: VoxelResolutionValues | null
): ViewerProp {
  return {
    id,
    name: `Prop #${labelNumber}`,
    type: 'text',
    typeface: 'Inter',
    dimension: '2d',
    visible: true,
    color: '#ffffff',
    bold: false,
    italic: false,
    underline: false,
    text: 'Add text here',
    timestampUnits: 'index',
    initialTimepoint: 1,
    finalTimepoint: resolveViewerPropTimepointLimit(totalTimepoints),
    scalebar: buildDefaultViewerPropScalebarState(voxelResolution),
    screen: buildDefaultViewerPropScreenState(),
    world: buildDefaultViewerPropWorldState(orderIndex, volumeDimensions),
  };
}
