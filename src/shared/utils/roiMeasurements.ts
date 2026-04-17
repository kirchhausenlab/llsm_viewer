import type { NormalizedVolume } from '../../core/volumeProcessing';
import { isIntensityVolume } from '../../core/volumeProcessing';
import type { SavedRoi } from '../../types/roi';
import type {
  RoiMeasurementChannelSnapshot,
  RoiMeasurementMetricKey,
  RoiMeasurementRow,
  RoiMeasurementSettings,
  RoiMeasurementsSnapshot,
} from '../../types/roiMeasurements';
import { ROI_MEASUREMENT_METRIC_ORDER } from '../../types/roiMeasurements';
import { denormalizeValue } from './intensityFormatting';

type MeasurementDimensions = {
  width: number;
  height: number;
  depth: number;
};

export type RoiMeasurementChannelSource = {
  id: string;
  name: string;
  volume: NormalizedVolume | null;
};

const EPSILON = 1e-9;

const createEmptyMetricRecord = (): Record<RoiMeasurementMetricKey, number | null> => ({
  count: null,
  std: null,
  min: null,
  max: null,
  mean: null,
  median: null,
});

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const resolveScalarIntensityFromRawValues = (rawValues: number[]): number | null => {
  if (rawValues.length === 0) {
    return null;
  }
  if (rawValues.length === 1) {
    return rawValues[0] ?? null;
  }
  if (rawValues.length === 2) {
    const left = rawValues[0] ?? 0;
    const right = rawValues[1] ?? 0;
    return (left + right) * 0.5;
  }

  const r = rawValues[0] ?? 0;
  const g = rawValues[1] ?? 0;
  const b = rawValues[2] ?? 0;
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
};

function getIntensityScalarAtVoxel(volume: NormalizedVolume, x: number, y: number, z: number): number | null {
  if (!isIntensityVolume(volume)) {
    return null;
  }

  const channels = Math.max(1, volume.channels);
  const voxelIndex = ((z * volume.height + y) * volume.width + x) * channels;
  const rawValues: number[] = [];
  for (let channelIndex = 0; channelIndex < channels; channelIndex += 1) {
    const normalized = volume.normalized[voxelIndex + channelIndex] ?? 0;
    rawValues.push(denormalizeValue(normalized, volume));
  }
  return resolveScalarIntensityFromRawValues(rawValues);
}

function getInterpolatedIntensityScalarAtPosition(
  volume: NormalizedVolume,
  position: { x: number; y: number; z: number },
): number | null {
  if (!isIntensityVolume(volume)) {
    return null;
  }

  const channels = Math.max(1, volume.channels);
  const sliceStride = volume.width * volume.height * channels;
  const rowStride = volume.width * channels;
  const x = clamp(position.x, 0, volume.width - 1);
  const y = clamp(position.y, 0, volume.height - 1);
  const z = clamp(position.z, 0, volume.depth - 1);

  const leftX = Math.floor(x);
  const rightX = Math.min(volume.width - 1, leftX + 1);
  const topY = Math.floor(y);
  const bottomY = Math.min(volume.height - 1, topY + 1);
  const frontZ = Math.floor(z);
  const backZ = Math.min(volume.depth - 1, frontZ + 1);

  const tX = x - leftX;
  const tY = y - topY;
  const tZ = z - frontZ;
  const invTX = 1 - tX;
  const invTY = 1 - tY;
  const invTZ = 1 - tZ;

  const weights = [
    invTX * invTY * invTZ,
    tX * invTY * invTZ,
    invTX * tY * invTZ,
    tX * tY * invTZ,
    invTX * invTY * tZ,
    tX * invTY * tZ,
    invTX * tY * tZ,
    tX * tY * tZ,
  ] as const;

  const frontOffset = frontZ * sliceStride;
  const backOffset = backZ * sliceStride;
  const topFrontOffset = frontOffset + topY * rowStride;
  const bottomFrontOffset = frontOffset + bottomY * rowStride;
  const topBackOffset = backOffset + topY * rowStride;
  const bottomBackOffset = backOffset + bottomY * rowStride;

  const rawValues: number[] = [];
  for (let channelIndex = 0; channelIndex < channels; channelIndex += 1) {
    const topLeftFront = volume.normalized[topFrontOffset + leftX * channels + channelIndex] ?? 0;
    const topRightFront = volume.normalized[topFrontOffset + rightX * channels + channelIndex] ?? 0;
    const bottomLeftFront = volume.normalized[bottomFrontOffset + leftX * channels + channelIndex] ?? 0;
    const bottomRightFront = volume.normalized[bottomFrontOffset + rightX * channels + channelIndex] ?? 0;
    const topLeftBack = volume.normalized[topBackOffset + leftX * channels + channelIndex] ?? 0;
    const topRightBack = volume.normalized[topBackOffset + rightX * channels + channelIndex] ?? 0;
    const bottomLeftBack = volume.normalized[bottomBackOffset + leftX * channels + channelIndex] ?? 0;
    const bottomRightBack = volume.normalized[bottomBackOffset + rightX * channels + channelIndex] ?? 0;

    const interpolated =
      topLeftFront * weights[0] +
      topRightFront * weights[1] +
      bottomLeftFront * weights[2] +
      bottomRightFront * weights[3] +
      topLeftBack * weights[4] +
      topRightBack * weights[5] +
      bottomLeftBack * weights[6] +
      bottomRightBack * weights[7];
    rawValues.push(denormalizeValue(interpolated, volume));
  }

  return resolveScalarIntensityFromRawValues(rawValues);
}

function computeStatistics(values: number[]): Record<RoiMeasurementMetricKey, number | null> {
  if (values.length === 0) {
    return createEmptyMetricRecord();
  }

  const sorted = [...values].sort((left, right) => left - right);
  const count = values.length;
  const min = sorted[0] ?? null;
  const max = sorted[sorted.length - 1] ?? null;
  const sum = values.reduce((total, value) => total + value, 0);
  const mean = sum / count;
  const median =
    count % 2 === 1
      ? (sorted[(count - 1) / 2] ?? null)
      : ((sorted[count / 2 - 1] ?? 0) + (sorted[count / 2] ?? 0)) * 0.5;
  const variance = values.reduce((total, value) => total + (value - mean) * (value - mean), 0) / count;

  return {
    count,
    std: Math.sqrt(variance),
    min,
    max,
    mean,
    median,
  };
}

function build2dRectangleValues(roi: SavedRoi, volume: NormalizedVolume): number[] {
  const z = clamp(roi.start.z, 0, volume.depth - 1);
  const minX = Math.min(roi.start.x, roi.end.x);
  const maxX = Math.max(roi.start.x, roi.end.x);
  const minY = Math.min(roi.start.y, roi.end.y);
  const maxY = Math.max(roi.start.y, roi.end.y);
  const values: number[] = [];

  for (let y = Math.max(0, Math.floor(minY)); y <= Math.min(volume.height - 1, Math.ceil(maxY)); y += 1) {
    for (let x = Math.max(0, Math.floor(minX)); x <= Math.min(volume.width - 1, Math.ceil(maxX)); x += 1) {
      if (x + EPSILON < minX || x - EPSILON > maxX || y + EPSILON < minY || y - EPSILON > maxY) {
        continue;
      }
      const value = getIntensityScalarAtVoxel(volume, x, y, z);
      if (value !== null) {
        values.push(value);
      }
    }
  }

  return values;
}

function isWithinClosedEllipse(
  point: { x: number; y: number; z?: number },
  center: { x: number; y: number; z?: number },
  radius: { x: number; y: number; z?: number },
) {
  const axes: Array<'x' | 'y' | 'z'> = radius.z === undefined ? ['x', 'y'] : ['x', 'y', 'z'];
  let total = 0;

  for (const axis of axes) {
    const delta = (point[axis] ?? 0) - (center[axis] ?? 0);
    const axisRadius = radius[axis] ?? 0;
    if (axisRadius <= EPSILON) {
      if (Math.abs(delta) > EPSILON) {
        return false;
      }
      continue;
    }
    total += (delta * delta) / (axisRadius * axisRadius);
  }

  return total <= 1 + EPSILON;
}

function build2dEllipseValues(roi: SavedRoi, volume: NormalizedVolume): number[] {
  const z = clamp(roi.start.z, 0, volume.depth - 1);
  const minX = Math.min(roi.start.x, roi.end.x);
  const maxX = Math.max(roi.start.x, roi.end.x);
  const minY = Math.min(roi.start.y, roi.end.y);
  const maxY = Math.max(roi.start.y, roi.end.y);
  const center = { x: (roi.start.x + roi.end.x) * 0.5, y: (roi.start.y + roi.end.y) * 0.5 };
  const radius = { x: Math.abs(roi.end.x - roi.start.x) * 0.5, y: Math.abs(roi.end.y - roi.start.y) * 0.5 };
  const values: number[] = [];

  for (let y = Math.max(0, Math.floor(minY)); y <= Math.min(volume.height - 1, Math.ceil(maxY)); y += 1) {
    for (let x = Math.max(0, Math.floor(minX)); x <= Math.min(volume.width - 1, Math.ceil(maxX)); x += 1) {
      if (!isWithinClosedEllipse({ x, y }, center, radius)) {
        continue;
      }
      const value = getIntensityScalarAtVoxel(volume, x, y, z);
      if (value !== null) {
        values.push(value);
      }
    }
  }

  return values;
}

function build3dBoxValues(roi: SavedRoi, volume: NormalizedVolume): number[] {
  const minX = Math.min(roi.start.x, roi.end.x);
  const maxX = Math.max(roi.start.x, roi.end.x);
  const minY = Math.min(roi.start.y, roi.end.y);
  const maxY = Math.max(roi.start.y, roi.end.y);
  const minZ = Math.min(roi.start.z, roi.end.z);
  const maxZ = Math.max(roi.start.z, roi.end.z);
  const values: number[] = [];

  for (let z = Math.max(0, Math.floor(minZ)); z <= Math.min(volume.depth - 1, Math.ceil(maxZ)); z += 1) {
    for (let y = Math.max(0, Math.floor(minY)); y <= Math.min(volume.height - 1, Math.ceil(maxY)); y += 1) {
      for (let x = Math.max(0, Math.floor(minX)); x <= Math.min(volume.width - 1, Math.ceil(maxX)); x += 1) {
        if (
          x + EPSILON < minX ||
          x - EPSILON > maxX ||
          y + EPSILON < minY ||
          y - EPSILON > maxY ||
          z + EPSILON < minZ ||
          z - EPSILON > maxZ
        ) {
          continue;
        }
        const value = getIntensityScalarAtVoxel(volume, x, y, z);
        if (value !== null) {
          values.push(value);
        }
      }
    }
  }

  return values;
}

function build3dEllipsoidValues(roi: SavedRoi, volume: NormalizedVolume): number[] {
  const minX = Math.min(roi.start.x, roi.end.x);
  const maxX = Math.max(roi.start.x, roi.end.x);
  const minY = Math.min(roi.start.y, roi.end.y);
  const maxY = Math.max(roi.start.y, roi.end.y);
  const minZ = Math.min(roi.start.z, roi.end.z);
  const maxZ = Math.max(roi.start.z, roi.end.z);
  const center = {
    x: (roi.start.x + roi.end.x) * 0.5,
    y: (roi.start.y + roi.end.y) * 0.5,
    z: (roi.start.z + roi.end.z) * 0.5,
  };
  const radius = {
    x: Math.abs(roi.end.x - roi.start.x) * 0.5,
    y: Math.abs(roi.end.y - roi.start.y) * 0.5,
    z: Math.abs(roi.end.z - roi.start.z) * 0.5,
  };
  const values: number[] = [];

  for (let z = Math.max(0, Math.floor(minZ)); z <= Math.min(volume.depth - 1, Math.ceil(maxZ)); z += 1) {
    for (let y = Math.max(0, Math.floor(minY)); y <= Math.min(volume.height - 1, Math.ceil(maxY)); y += 1) {
      for (let x = Math.max(0, Math.floor(minX)); x <= Math.min(volume.width - 1, Math.ceil(maxX)); x += 1) {
        if (!isWithinClosedEllipse({ x, y, z }, center, radius)) {
          continue;
        }
        const value = getIntensityScalarAtVoxel(volume, x, y, z);
        if (value !== null) {
          values.push(value);
        }
      }
    }
  }

  return values;
}

function buildLineProfileValues(roi: SavedRoi, volume: NormalizedVolume): number[] {
  const dx = roi.end.x - roi.start.x;
  const dy = roi.end.y - roi.start.y;
  const dz = roi.mode === '3d' ? roi.end.z - roi.start.z : 0;
  const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const steps = Math.max(1, Math.ceil(distance));
  const values: number[] = [];

  for (let stepIndex = 0; stepIndex <= steps; stepIndex += 1) {
    const t = stepIndex / steps;
    const value = getInterpolatedIntensityScalarAtPosition(volume, {
      x: roi.start.x + dx * t,
      y: roi.start.y + dy * t,
      z: roi.mode === '3d' ? roi.start.z + dz * t : roi.start.z,
    });
    if (value !== null) {
      values.push(value);
    }
  }

  return values;
}

export function validateSavedRoiWithinDimensions(roi: SavedRoi, dimensions: MeasurementDimensions) {
  const maxX = Math.max(0, dimensions.width - 1);
  const maxY = Math.max(0, dimensions.height - 1);
  const maxZ = Math.max(0, dimensions.depth - 1);
  const points = [roi.start, roi.end];

  if (roi.mode === '2d' && roi.start.z !== roi.end.z) {
    return false;
  }

  return points.every(
    (point) =>
      Number.isFinite(point.x) &&
      Number.isFinite(point.y) &&
      Number.isFinite(point.z) &&
      point.x >= 0 &&
      point.x <= maxX &&
      point.y >= 0 &&
      point.y <= maxY &&
      point.z >= 0 &&
      point.z <= maxZ,
  );
}

export function computeRoiMeasurementValues(roi: SavedRoi, volume: NormalizedVolume | null) {
  if (!volume || !isIntensityVolume(volume)) {
    return createEmptyMetricRecord();
  }

  let values: number[] = [];
  if (roi.shape === 'line') {
    values = buildLineProfileValues(roi, volume);
  } else if (roi.shape === 'rectangle') {
    values = roi.mode === '2d' ? build2dRectangleValues(roi, volume) : build3dBoxValues(roi, volume);
  } else {
    values = roi.mode === '2d' ? build2dEllipseValues(roi, volume) : build3dEllipsoidValues(roi, volume);
  }

  return computeStatistics(values);
}

export function buildRoiMeasurementsSnapshot({
  selectedRois,
  channels,
  timepoint,
}: {
  selectedRois: SavedRoi[];
  channels: RoiMeasurementChannelSource[];
  timepoint: number;
}): RoiMeasurementsSnapshot {
  const snapshotChannels: RoiMeasurementChannelSnapshot[] = channels.map((channel) => ({
    id: channel.id,
    name: channel.name,
  }));
  const rows: RoiMeasurementRow[] = [];

  selectedRois.forEach((roi, roiIndex) => {
    channels.forEach((channel) => {
      rows.push({
        roiOrder: roiIndex + 1,
        roiId: roi.id,
        roiName: roi.name,
        channelId: channel.id,
        channelName: channel.name,
        values: computeRoiMeasurementValues(roi, channel.volume),
      });
    });
  });

  return {
    createdAt: new Date().toISOString(),
    timepoint,
    channels: snapshotChannels,
    rows,
  };
}

export function formatRoiMeasurementValue(
  value: number | null,
  metric: RoiMeasurementMetricKey,
  decimalPlaces: number,
) {
  if (value === null || !Number.isFinite(value)) {
    return 'N/A';
  }
  if (metric === 'count') {
    return Math.round(value).toString();
  }
  return value.toFixed(decimalPlaces);
}

export function buildRoiMeasurementsCsv({
  snapshot,
  settings,
  visibleChannelIds,
}: {
  snapshot: RoiMeasurementsSnapshot;
  settings: RoiMeasurementSettings;
  visibleChannelIds: string[];
}) {
  const metricLabels: Record<RoiMeasurementMetricKey, string> = {
    count: 'Count',
    std: 'Std',
    min: 'Min',
    max: 'Max',
    mean: 'Mean',
    median: 'Median',
  };
  const enabledMetrics = ROI_MEASUREMENT_METRIC_ORDER.filter((metric) => settings.enabledMetrics[metric]);
  const headers = ['#', 'Ch', ...enabledMetrics.map((metric) => metricLabels[metric])];
  const visibleChannelIdSet = new Set(visibleChannelIds);
  const rows = snapshot.rows.filter((row) => visibleChannelIdSet.has(row.channelId));
  const encodeCell = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const csvRows = [
    headers.map(encodeCell).join(','),
    ...rows.map((row) =>
      [
        row.roiOrder.toString(),
        row.channelName,
        ...enabledMetrics.map((metric) => formatRoiMeasurementValue(row.values[metric], metric, settings.decimalPlaces)),
      ]
        .map(encodeCell)
        .join(',')
    ),
  ];

  return csvRows.join('\n');
}
