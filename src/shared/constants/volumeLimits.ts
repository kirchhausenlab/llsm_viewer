// Default to no browser-side volume size limit; use VITE_MAX_VOLUME_BYTES to enforce a cap if desired.
const DEFAULT_MAX_VOLUME_BYTES = Number.POSITIVE_INFINITY;

const parseEnvLimit = (): number | null => {
  const raw = import.meta.env?.VITE_MAX_VOLUME_BYTES ?? process.env?.VITE_MAX_VOLUME_BYTES;
  if (typeof raw !== 'string' || raw.trim() === '') {
    return null;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    console.warn(`Invalid VITE_MAX_VOLUME_BYTES value "${raw}"; falling back to no volume size limit.`);
    return null;
  }

  return parsed;
};

export const MAX_VOLUME_BYTES = parseEnvLimit() ?? DEFAULT_MAX_VOLUME_BYTES;

const DEFAULT_STREAMING_BYTE_THRESHOLD = 2 * 1024 * 1024 * 1024; // 2 GiB

const parseStreamingThreshold = (): number | null => {
  const raw =
    import.meta.env?.VITE_STREAMING_BYTE_THRESHOLD ?? process.env?.VITE_STREAMING_BYTE_THRESHOLD;
  if (typeof raw !== 'string' || raw.trim() === '') {
    return null;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    console.warn(
      `Invalid VITE_STREAMING_BYTE_THRESHOLD value "${raw}"; falling back to the default streaming threshold.`
    );
    return null;
  }

  return parsed;
};

const clampToMaxVolume = (threshold: number): number =>
  Number.isFinite(MAX_VOLUME_BYTES) ? Math.min(threshold, MAX_VOLUME_BYTES) : threshold;

export const STREAMING_VOLUME_BYTE_THRESHOLD = clampToMaxVolume(
  parseStreamingThreshold() ?? (Number.isFinite(MAX_VOLUME_BYTES) ? MAX_VOLUME_BYTES : DEFAULT_STREAMING_BYTE_THRESHOLD)
);

export {};
