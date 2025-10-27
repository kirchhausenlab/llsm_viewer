import type { VolumeDataType } from './types/volume';

export type VolumeDimensions = {
  width: number;
  height: number;
  depth: number;
  channels: number;
  dataType: VolumeDataType;
};

const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return `${bytes}`;
  }

  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  let unitIndex = 0;
  let value = bytes;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const formatter = new Intl.NumberFormat(undefined, {
    minimumFractionDigits: value < 10 ? 2 : value < 100 ? 1 : 0,
    maximumFractionDigits: 2
  });
  return `${formatter.format(value)} ${units[unitIndex]}`;
};

export class VolumeTooLargeError extends Error {
  readonly requiredBytes: number;

  readonly maxBytes: number;

  readonly dimensions: VolumeDimensions;

  readonly fileName?: string;

  constructor(
    details: {
      requiredBytes: number;
      maxBytes: number;
      dimensions: VolumeDimensions;
      fileName?: string;
    },
    customMessage?: string
  ) {
    const message =
      customMessage ??
      `The dataset${details.fileName ? ` "${details.fileName}"` : ''} requires ${formatBytes(details.requiredBytes)}, exceeding the maximum supported size of ${formatBytes(details.maxBytes)}.`;
    super(message);
    this.name = 'VolumeTooLargeError';
    this.requiredBytes = details.requiredBytes;
    this.maxBytes = details.maxBytes;
    this.dimensions = details.dimensions;
    this.fileName = details.fileName;
  }
}

export { formatBytes };
