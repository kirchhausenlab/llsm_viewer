import type { NormalizedVolume } from '../core/volumeProcessing';
import type { VolumeDataType } from '../../types/volume';

export type FormattedChannelValue = { text: string; channelLabel: string | null };

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

export function formatChannelValuesDetailed(
  values: number[],
  type: VolumeDataType,
  channelLabel: string | null,
  includeLabel: boolean,
): FormattedChannelValue[] {
  if (values.length === 0) {
    return [] as FormattedChannelValue[];
  }

  if (values.length === 1) {
    const prefix = includeLabel && channelLabel ? `${channelLabel} ` : '';
    const text = `${prefix}${formatIntensityValue(values[0], type)}`.trim();
    return [{ text, channelLabel }];
  }

  return values.map((value, index) => {
    const prefix = includeLabel
      ? channelLabel
        ? `${channelLabel} C${index + 1}`
        : `C${index + 1}`
      : null;
    const formatted = formatIntensityValue(value, type);
    return { text: prefix ? `${prefix} ${formatted}` : formatted, channelLabel };
  });
}

export function formatChannelValues(
  values: number[],
  type: VolumeDataType,
  channelLabel: string | null,
  includeLabel: boolean,
) {
  return formatChannelValuesDetailed(values, type, channelLabel, includeLabel).map((entry) => entry.text);
}
