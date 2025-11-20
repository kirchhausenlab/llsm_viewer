import type { NormalizedVolume } from '../volumeProcessing';
import type { VolumeDataType } from '../types/volume';

const INTEGER_PREFIXES = ['uint', 'int'];

const isIntegerDataType = (type: VolumeDataType) =>
  INTEGER_PREFIXES.some((prefix) => type.startsWith(prefix));

export function denormalizeValue(value: number, volume: NormalizedVolume) {
  const ratio = value / 255;
  return volume.min + ratio * (volume.max - volume.min);
}

export function formatIntensityValue(value: number, type: VolumeDataType) {
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

export function formatChannelValues(
  values: number[],
  type: VolumeDataType,
  channelLabel: string | null,
  includeLabel: boolean
) {
  if (values.length === 0) {
    return [] as string[];
  }

  if (values.length === 1) {
    const prefix = includeLabel && channelLabel ? `${channelLabel} ` : '';
    return [`${prefix}${formatIntensityValue(values[0], type)}`.trim()];
  }

  return values.map((value, index) => {
    const prefix = includeLabel
      ? channelLabel
        ? `${channelLabel} C${index + 1}`
        : `C${index + 1}`
      : null;
    const formatted = formatIntensityValue(value, type);
    return prefix ? `${prefix} ${formatted}` : formatted;
  });
}
